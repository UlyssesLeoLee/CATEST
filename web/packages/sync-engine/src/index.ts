import { PGlite } from '@electric-sql/pglite';

export interface SyncMetadata {
  id: string;
  updated_at: number; // Milliseconds timestamp
  hash: string;       // For change detection
}

export interface SyncPayload {
  table: string;
  data: any;
  metadata: SyncMetadata;
}

export class PGliteSyncEngine {
  private db: PGlite;
  private backendUrl: string;

  constructor(dataDir: string, backendUrl: string) {
    this.db = new PGlite(dataDir);
    this.backendUrl = backendUrl;
  }

  /**
   * Initialize local schema for unconfirmed work
   */
  async init() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS unconfirmed_work (
        id UUID PRIMARY KEY,
        content TEXT,
        metadata JSONB,
        sync_status TEXT DEFAULT 'pending'
      );
      
      CREATE TABLE IF NOT EXISTS sync_log (
        id SERIAL PRIMARY KEY,
        snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        bytes_transferred INTEGER,
        sync_type TEXT
      );
    `);
  }

  /**
   * Composite key generation: ID + Last Modified (ms)
   */
  private generateSyncKey(id: string, timestamp: number): string {
    return `${id}:${timestamp}`;
  }

  /**
   * Perform differential sync to backend
   * Uses a "Compare-before-Upload" strategy to minimize traffic
   */
  async syncToBackend() {
    const pendingItems = await this.db.query(
      "SELECT id, content, metadata FROM unconfirmed_work WHERE sync_status = 'pending'"
    );

    let totalBytes = 0;

    for (const row of pendingItems.rows) {
      const { id, content, metadata } = row;
      const updatedAt = (metadata as any)?.updated_at || Date.now();
      const syncKey = this.generateSyncKey(id as string, updatedAt);

      // 1. Head check to see if we need to upload (saves bandwidth)
      const shouldUpdate = await this.checkRemoteConsistency(id as string, syncKey);

      if (shouldUpdate) {
        const payload: SyncPayload = {
          table: 'work_content',
          data: { id, content },
          metadata: { id: id as string, updated_at: updatedAt, hash: syncKey }
        };

        const bytes = await this.uploadToBackend(payload);
        totalBytes += bytes;

        // Mark as synced locally
        await this.db.query(
          "UPDATE unconfirmed_work SET sync_status = 'synced' WHERE id = $1",
          [id]
        );
      }
    }

    // Metering/Billing Instrumentation
    if (totalBytes > 0) {
      await this.recordMetering(totalBytes);
    }

    return totalBytes;
  }

  private async checkRemoteConsistency(id: string, localSyncKey: string): Promise<boolean> {
    try {
      const resp = await fetch(`${this.backendUrl}/sync/check/${id}?key=${localSyncKey}`);
      const result = await resp.json();
      return result.need_update; // Update if key doesn't exist or is different
    } catch (e) {
      console.error("Consistency check failed", e);
      return true; // Fallback to safe upload
    }
  }

  private async uploadToBackend(payload: SyncPayload): Promise<number> {
    const body = JSON.stringify(payload);
    const resp = await fetch(`${this.backendUrl}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    
    if (!resp.ok) throw new Error("Sync upload failed");
    
    return body.length; // Approximate bytes for metering
  }

  private async recordMetering(bytes: number) {
    await this.db.query(
      "INSERT INTO sync_log (bytes_transferred, sync_type) VALUES ($1, 'upload')",
      [bytes]
    );
    // Also notify billing service if online
    fetch(`${this.backendUrl}/metering/log`, {
      method: 'POST',
      body: JSON.stringify({ bytes, timestamp: Date.now(), feature: 'sync_engine' })
    }).catch(() => {}); // Fire and forget for metering
  }
}

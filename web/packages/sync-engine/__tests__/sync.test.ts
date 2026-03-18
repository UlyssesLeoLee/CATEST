import { PGliteSyncEngine } from '../src/index';

// Mock PGlite
jest.mock('@electric-sql/pglite', () => {
  return {
    PGlite: jest.fn().mockImplementation(() => {
      return {
        exec: jest.fn().mockResolvedValue({}),
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
    }),
  };
});

describe('PGliteSyncEngine', () => {
  let engine: PGliteSyncEngine;
  const mockBackendUrl = 'http://api.test';

  beforeEach(() => {
    engine = new PGliteSyncEngine('test-dir', mockBackendUrl);
  });

  it('should initialize schema correctly', async () => {
    await engine.init();
    expect((engine as any).db.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS unconfirmed_work'));
  });

  it('should skip sync if backend says consistency is ok', async () => {
    // Mock consistency check
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ need_update: false }),
    }) as jest.Mock;

    (engine as any).db.query.mockResolvedValueOnce({
      rows: [{ id: '123', content: 'test', metadata: { updated_at: 1000 } }]
    });

    const bytes = await engine.syncToBackend();
    expect(bytes).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/sync/check/123'));
  });

  it('should upload and meter if backend says update needed', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ // Check
        json: jest.fn().mockResolvedValue({ need_update: true }),
      })
      .mockResolvedValueOnce({ // Push
        ok: true,
      })
      .mockResolvedValueOnce({ // Metering
        ok: true,
      }) as jest.Mock;

    (engine as any).db.query.mockResolvedValueOnce({
      rows: [{ id: '123', content: 'test', metadata: { updated_at: 1000 } }]
    });

    const bytes = await engine.syncToBackend();
    expect(bytes).toBeGreaterThan(0);
    expect((engine as any).db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE unconfirmed_work'), ['123']);
  });
});

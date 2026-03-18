\c catest_workspace;
-- Metadata for tracking local-to-backend sync state
CREATE TABLE IF NOT EXISTS sync_metadata (
    resource_id UUID PRIMARY KEY,
    sync_hash TEXT NOT NULL,         -- Composite key (ID:timestamp)
    last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Example table for unconfirmed user work
CREATE TABLE IF NOT EXISTS user_work (
    id UUID PRIMARY KEY,
    content TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Traffic usage metering library
CREATE TABLE IF NOT EXISTS traffic_metering (
    id SERIAL PRIMARY KEY,
    user_id UUID,
    feature_name TEXT,
    bytes_count BIGINT,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

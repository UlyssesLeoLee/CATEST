-- ═══════════════════════════════════════════════════════════════════════
-- Arroyo SQL Pipelines for Orchestration Domain Stream Governance
-- Deploy via Arroyo UI (http://localhost:35115) or API
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Source: all orchestration events ────────────────────────────────
CREATE TABLE orchestration_events (
    event_id       TEXT,
    event_type     TEXT,
    trace_id       TEXT,
    timestamp      TIMESTAMP,
    source_service TEXT,
    status         TEXT,
    payload        TEXT
) WITH (
    connector = 'kafka',
    format = 'json',
    bootstrap_servers = 'kafka:9092',
    topic = 'orchestration.*',
    type = 'source'
);

-- ─── Pipeline 1: Stale task detection ────────────────────────────────
-- Alert when a trace has an intent.received but no adapter.result after 5 minutes
CREATE TABLE stale_tasks_sink (
    trace_id       TEXT,
    first_seen     TIMESTAMP,
    last_event     TEXT,
    age_seconds    BIGINT
) WITH (
    connector = 'kafka',
    format = 'json',
    bootstrap_servers = 'kafka:9092',
    topic = 'orchestration.alerts.stale',
    type = 'sink'
);

INSERT INTO stale_tasks_sink
SELECT
    trace_id,
    MIN(timestamp) AS first_seen,
    MAX(event_type) AS last_event,
    EXTRACT(EPOCH FROM (NOW() - MIN(timestamp)))::BIGINT AS age_seconds
FROM orchestration_events
WHERE timestamp > NOW() - INTERVAL '30 minutes'
GROUP BY trace_id
HAVING
    MAX(CASE WHEN event_type = 'orchestration.adapter.result' THEN 1 ELSE 0 END) = 0
    AND EXTRACT(EPOCH FROM (NOW() - MIN(timestamp))) > 300;

-- ─── Pipeline 2: Error rate monitoring ───────────────────────────────
-- Count failed events per service in 5-minute windows
CREATE TABLE error_rate_sink (
    window_start   TIMESTAMP,
    source_service TEXT,
    error_count    BIGINT,
    total_count    BIGINT,
    error_rate     DOUBLE
) WITH (
    connector = 'kafka',
    format = 'json',
    bootstrap_servers = 'kafka:9092',
    topic = 'orchestration.metrics.error_rate',
    type = 'sink'
);

INSERT INTO error_rate_sink
SELECT
    TUMBLE_START(timestamp, INTERVAL '5 minutes') AS window_start,
    source_service,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) AS error_count,
    COUNT(*) AS total_count,
    CAST(COUNT(CASE WHEN status = 'failed' THEN 1 END) AS DOUBLE) / COUNT(*) AS error_rate
FROM orchestration_events
GROUP BY TUMBLE(timestamp, INTERVAL '5 minutes'), source_service;

-- ─── Pipeline 3: Throughput metrics ──────────────────────────────────
-- Events per minute per event_type
CREATE TABLE throughput_sink (
    window_start   TIMESTAMP,
    event_type     TEXT,
    event_count    BIGINT
) WITH (
    connector = 'kafka',
    format = 'json',
    bootstrap_servers = 'kafka:9092',
    topic = 'orchestration.metrics.throughput',
    type = 'sink'
);

INSERT INTO throughput_sink
SELECT
    TUMBLE_START(timestamp, INTERVAL '1 minute') AS window_start,
    event_type,
    COUNT(*) AS event_count
FROM orchestration_events
GROUP BY TUMBLE(timestamp, INTERVAL '1 minute'), event_type;

-- ─── Pipeline 4: Adapter latency tracking ────────────────────────────
-- Track end-to-end latency from intent.received to adapter.result
CREATE TABLE latency_sink (
    trace_id       TEXT,
    started_at     TIMESTAMP,
    completed_at   TIMESTAMP,
    latency_ms     BIGINT,
    adapter        TEXT
) WITH (
    connector = 'kafka',
    format = 'json',
    bootstrap_servers = 'kafka:9092',
    topic = 'orchestration.metrics.latency',
    type = 'sink'
);

INSERT INTO latency_sink
SELECT
    r.trace_id,
    r.timestamp AS started_at,
    a.timestamp AS completed_at,
    EXTRACT(EPOCH FROM (a.timestamp - r.timestamp))::BIGINT * 1000 AS latency_ms,
    a.source_service AS adapter
FROM orchestration_events r
JOIN orchestration_events a
    ON r.trace_id = a.trace_id
WHERE r.event_type = 'orchestration.intent.received'
  AND a.event_type = 'orchestration.adapter.result';

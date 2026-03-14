-- DDL for Arroyo Kafka Source
CREATE TABLE review_findings (
    event_id TEXT,
    task_id TEXT,
    project_id TEXT,
    severity TEXT,
    rule_id TEXT,
    occurred_at TIMESTAMP
) WITH (
    connector = 'kafka',
    bootstrap_servers = 'kafka:9092',
    topic = 'codecat.review.findings',
    format = 'json',
    type = 'source'
);

-- DDL for Arroyo Kafka Sink (Aggregation Result)
CREATE TABLE review_rollup (
    severity TEXT,
    window_start TIMESTAMP,
    finding_count BIGINT
) WITH (
    connector = 'kafka',
    bootstrap_servers = 'kafka:9092',
    topic = 'codecat.stats.review-rollup',
    format = 'json',
    type = 'sink'
);

-- SQL Pipeline: Rollup review findings by severity in 1-hour tumbling windows
INSERT INTO review_rollup
SELECT 
    severity,
    tumble_start(occurred_at, interval '1' hour) as window_start,
    COUNT(*) as finding_count
FROM review_findings
GROUP BY severity, tumble(occurred_at, interval '1' hour);

-- DDL for Arroyo Kafka Source
CREATE TABLE segments_parsed (
    event_id TEXT,
    snapshot_id TEXT,
    file_id TEXT,
    segment_count BIGINT,
    language TEXT,
    occurred_at TIMESTAMP
) WITH (
    connector = 'kafka',
    bootstrap_servers = 'kafka:9092',
    topic = 'codecat.segments.parsed',
    format = 'json',
    type = 'source'
);

-- DDL for Arroyo Kafka Sink (Aggregation Result)
CREATE TABLE segment_stats_agg (
    language TEXT,
    window_start TIMESTAMP,
    total_segments BIGINT
) WITH (
    connector = 'kafka',
    bootstrap_servers = 'kafka:9092',
    topic = 'codecat.stats.segments',
    format = 'json',
    type = 'sink'
);

-- SQL Pipeline: Aggregate segments by language in 5-minute tumbling windows
INSERT INTO segment_stats_agg
SELECT 
    language,
    hop_start(occurred_at, interval '1' minute, interval '5' minute) as window_start,
    SUM(segment_count) as total_segments
FROM segments_parsed
GROUP BY language, hop(occurred_at, interval '1' minute, interval '5' minute);

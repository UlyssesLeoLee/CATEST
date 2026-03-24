#!/bin/bash
set -e

# ── Create all CATEST databases ──────────────────────────────────────
DATABASES="catest_hub catest_gateway catest_ingestion catest_workspace catest_intelligence catest_review catest_batch"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE catest_hub;
    CREATE DATABASE catest_gateway;
    CREATE DATABASE catest_ingestion;
    CREATE DATABASE catest_workspace;
    CREATE DATABASE catest_intelligence;
    CREATE DATABASE catest_review;
    CREATE DATABASE catest_batch;

    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE catest_hub TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_gateway TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_ingestion TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_workspace TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_intelligence TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_review TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_batch TO catest;
EOSQL

# ── Enable pgvector + Apache AGE on every database ──────────────────
# pgvector: embedding storage, vector similarity (supplements Qdrant)
# AGE: openCypher graph queries in SQL (supplements Neo4j)
for DB in $DATABASES; do
    echo "Enabling extensions on $DB ..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" <<-EOSQL
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE EXTENSION IF NOT EXISTS vector;
        CREATE EXTENSION IF NOT EXISTS age;
        -- Load AGE catalog into default search path
        ALTER DATABASE "$DB" SET search_path = ag_catalog, "\$user", public;
EOSQL
done

echo "All databases created with pgcrypto + pgvector + AGE extensions."

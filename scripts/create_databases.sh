#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE catest_hub;
    CREATE DATABASE catest_gateway;
    CREATE DATABASE catest_ingestion;
    CREATE DATABASE catest_workspace;
    CREATE DATABASE catest_intelligence;
    CREATE DATABASE catest_review;

    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE catest_hub TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_gateway TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_ingestion TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_workspace TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_intelligence TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_review TO catest;
EOSQL

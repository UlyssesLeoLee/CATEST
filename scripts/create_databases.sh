#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE catest_gateway;
    CREATE DATABASE catest_ingestion;
    CREATE DATABASE catest_parser;
    CREATE DATABASE catest_review;
    
    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE catest_gateway TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_ingestion TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_parser TO catest;
    GRANT ALL PRIVILEGES ON DATABASE catest_review TO catest;
EOSQL

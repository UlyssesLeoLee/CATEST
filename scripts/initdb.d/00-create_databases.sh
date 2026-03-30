#!/bin/bash
set -e

# Create ALL CATEST databases upfront so that subsequent SQL scripts
# (\c catest_tm, \c catest_tb, etc.) can connect successfully.
# This script runs only on first init (empty PGDATA).
# k8s-restart.ps1 also ensures these exist idempotently on every deploy.

DATABASES="catest_hub catest_gateway catest_ingestion catest_workspace catest_intelligence catest_review catest_tm catest_tb catest_orchestration"

for db in $DATABASES; do
    echo "Creating database: $db"
    psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE $db OWNER $POSTGRES_USER;" 2>/dev/null || true
    psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;" 2>/dev/null || true
done

# Enable extensions on all databases
for db in $DATABASES; do
    echo "Enabling extensions on: $db"
    psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$db" -c "
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE EXTENSION IF NOT EXISTS vector;
        CREATE EXTENSION IF NOT EXISTS age;
    " 2>/dev/null || true
done

echo "All CATEST databases created and extensions enabled."

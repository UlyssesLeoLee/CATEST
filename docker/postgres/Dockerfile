# ── CATEST PostgreSQL with pgvector + Apache AGE ──────────────────────
# Base: postgres:16 (full, not alpine — AGE needs build tools)
FROM postgres:16-bookworm AS builder

# Install build dependencies for pgvector and Apache AGE
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    ca-certificates \
    postgresql-server-dev-16 \
    libreadline-dev \
    zlib1g-dev \
    flex \
    bison \
    pkg-config \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# ── Build pgvector (vector similarity search) ─────────────────────────
# Enables: embedding storage, cosine/L2/inner-product similarity
# Synergy: Qdrant handles primary ANN search; pgvector provides
#          SQL-native vector ops for hybrid queries and joins
ARG PGVECTOR_VERSION=0.8.0
RUN git clone --branch v${PGVECTOR_VERSION} --depth 1 \
      https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && cd /tmp/pgvector \
    && make OPTFLAGS="" \
    && make install

# ── Build Apache AGE (graph database extension) ───────────────────────
# Enables: Cypher queries inside PostgreSQL, graph traversal, path finding
# Synergy: Neo4j handles primary graph workloads; AGE provides
#          SQL-integrated graph queries for cross-relational-graph joins
ARG AGE_VERSION=release/PG16/1.5.0
RUN git clone --branch ${AGE_VERSION} --depth 1 \
      https://github.com/apache/age.git /tmp/age \
    && cd /tmp/age \
    && make \
    && make install

# ── Final image ───────────────────────────────────────────────────────
FROM postgres:16-bookworm

# Copy compiled extensions from builder
COPY --from=builder /usr/lib/postgresql/16/lib/vector.so       /usr/lib/postgresql/16/lib/
COPY --from=builder /usr/share/postgresql/16/extension/vector*  /usr/share/postgresql/16/extension/
COPY --from=builder /usr/lib/postgresql/16/lib/age.so           /usr/lib/postgresql/16/lib/
COPY --from=builder /usr/share/postgresql/16/extension/age*     /usr/share/postgresql/16/extension/

# AGE requires the library to be preloaded
RUN echo "shared_preload_libraries = 'age'" >> /usr/share/postgresql/postgresql.conf.sample

EXPOSE 5432

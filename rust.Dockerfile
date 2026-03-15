# Build stage
FROM rust:1.85-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    cmake \
    git \
    build-essential \
    zlib1g-dev \
    librdkafka-dev \
    protobuf-compiler \
    libsasl2-dev \
    libzstd-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire workspace
COPY . .

# Build the specified service
ARG SERVICE_NAME
RUN cargo build --release -p ${SERVICE_NAME}

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    librdkafka1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from the builder stage
ARG SERVICE_NAME
COPY --from=builder /app/target/release/${SERVICE_NAME} /app/service

# Set the entrypoint
ENTRYPOINT ["/app/service"]

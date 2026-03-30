"""Centralized configuration for all CATEST AI services."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Environment-based settings shared across all AI microservices."""

    model_config = {"env_prefix": "CATEST_AI_", "env_file": ".env", "extra": "ignore"}

    # --- Service identity (overridden per service) ---
    service_name: str = "catest-ai"
    service_port: int = 34080

    # --- Claude API ---
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    anthropic_max_tokens: int = 4096

    # --- LangSmith ---
    langsmith_api_key: str = ""
    langsmith_project: str = "catest-ai"
    langsmith_tracing: bool = True

    # --- Rust Gateway (low-coupling interface) ---
    rust_gateway_url: str = "http://catest-hub:33080"

    # --- Kafka ---
    kafka_broker: str = "kafka:39092"
    kafka_consumer_group: str = "ai_rag_group"

    # --- PostgreSQL (read-only for AI services) ---
    database_url: str = "postgres://catest:password@postgres:34321/catest_review"

    # --- Qdrant ---
    qdrant_url: str = "http://qdrant:36333"
    qdrant_api_key: str = "password"
    qdrant_collection: str = "catest_rag"

    # --- Memgraph ---
    memgraph_uri: str = "bolt://memgraph:37687"
    memgraph_user: str = ""
    memgraph_password: str = ""

    # --- Redis (arq task queue) ---
    redis_url: str = "redis://redis:36379"

    # --- Embedding ---
    embed_model_name: str = "intfloat/multilingual-e5-small"
    embed_vector_dim: int = 384
    inference_url: str = "http://localhost:38080"


settings = Settings()

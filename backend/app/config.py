"""
HS SEARCH Configuration Module
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True, parents=True)

class Settings(BaseSettings):
    # Brand & Identity
    PROJECT_NAME: str = "HS SEARCH"
    TAGLINE: str = "An Independent, Real-Time, AI-Powered Search Engine"
    COMPANY: str = "HS AI Solutions"
    FOUNDER: str = "Harshan Seliyan"
    VERSION: str = "1.0.0"

    # Server settings
    HOST: str = os.getenv("HS_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("HS_PORT", "8000"))
    DEBUG: bool = os.getenv("HS_DEBUG", "True").lower() == "true"
    CORS_ORIGINS: List[str] = ["*"]

    # Storage paths
    DB_PATH: Path = DATA_DIR / "hs_search.db"
    VECTOR_STORE_PATH: Path = DATA_DIR / "vector_store.npz"

    # Crawler Settings
    USER_AGENT: str = "HSSearchBot/1.0 (+https://hsaisolutions.com/bot; bot@hsaisolutions.com)"
    CRAWLER_MAX_CONCURRENCY: int = int(os.getenv("CRAWLER_MAX_CONCURRENCY", "12"))
    CRAWLER_DOMAIN_DELAY_SEC: float = float(os.getenv("CRAWLER_DOMAIN_DELAY_SEC", "1.0"))
    CRAWLER_REQUEST_TIMEOUT_SEC: int = int(os.getenv("CRAWLER_TIMEOUT", "15"))
    CRAWLER_MAX_DEPTH: int = int(os.getenv("CRAWLER_MAX_DEPTH", "3"))
    CRAWLER_MAX_PAGES_PER_DOMAIN: int = int(os.getenv("CRAWLER_MAX_PER_DOMAIN", "100"))
    RESPECT_ROBOTS_TXT: bool = True
    MAX_BODY_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB max per page

    # HS Live Subsystem
    LIVE_CRITICAL_INTERVAL_SEC: int = 1
    LIVE_HIGH_PRIORITY_INTERVAL_SEC: int = 5
    LIVE_REGULAR_INTERVAL_SEC: int = 30
    LIVE_ADAPTIVE_INTERVAL_SEC: int = 120

    # Indexer & Vector Settings
    USE_OPENSEARCH: bool = os.getenv("USE_OPENSEARCH", "False").lower() == "true"
    OPENSEARCH_URL: str = os.getenv("OPENSEARCH_URL", "http://localhost:9200")
    USE_QDRANT: bool = os.getenv("USE_QDRANT", "False").lower() == "true"
    QDRANT_URL: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    VECTOR_DIMENSION: int = 256

    # AI Models
    JULY_MODEL_NAME: str = "HS-July-Fast"
    GRAVITY_MODEL_NAME: str = "HS-Gravity-DeepResearch"
    DEFAULT_AI_MODE: str = "auto"  # "auto", "july", "gravity"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # NVIDIA AI Inference Gateway (Private Internal Architecture)
    NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "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")
    NVIDIA_BASE_URL: str = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    NVIDIA_MODEL_FAST: str = os.getenv("NVIDIA_MODEL_FAST", "nvidia/nemotron-3.5-bolt-e4b")
    NVIDIA_MODEL_QUALITY: str = os.getenv("NVIDIA_MODEL_QUALITY", "meta/llama-3.2-90b-vision-instruct")
    NVIDIA_MODEL_REASONING: str = os.getenv("NVIDIA_MODEL_REASONING", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")
    NVIDIA_TIMEOUT_SEC: float = float(os.getenv("NVIDIA_TIMEOUT_SEC", "15.0"))
    NVIDIA_MAX_RETRIES: int = int(os.getenv("NVIDIA_MAX_RETRIES", "2"))

    # Multi-Source Search Provider Settings
    ENABLE_EXTERNAL_PROVIDERS: bool = os.getenv("ENABLE_EXTERNAL_PROVIDERS", "True").lower() == "true"
    EXTERNAL_PROVIDER_TIMEOUT_SEC: float = float(os.getenv("EXTERNAL_PROVIDER_TIMEOUT_SEC", "1.5"))
    DUCKDUCKGO_API_URL: str = os.getenv("DUCKDUCKGO_API_URL", "https://api.duckduckgo.com/")
    WIKIPEDIA_API_URL: str = os.getenv("WIKIPEDIA_API_URL", "https://en.wikipedia.org/w/api.php")

    # Hybrid Search Engine Settings
    SEARXNG_URL: str = os.getenv("SEARXNG_URL", "")          # Optional self-hosted SearXNG
    SEARXNG_ENGINES: str = os.getenv("SEARXNG_ENGINES", "")  # Optional engine override (e.g. duckduckgo)
    SEARXNG_TIMEOUT_SEC: float = float(os.getenv("SEARXNG_TIMEOUT_SEC", "3.0"))
    BRAVE_SEARCH_API_KEY: str = os.getenv("BRAVE_SEARCH_API_KEY", "")
    SERPER_API_KEY: str = os.getenv("SERPER_API_KEY", "")
    DDG_PROVIDER_WEIGHT: float = float(os.getenv("DDG_PROVIDER_WEIGHT", "1.00"))
    PENDULUM_PROVIDER_WEIGHT: float = float(os.getenv("PENDULUM_PROVIDER_WEIGHT", "1.20"))
    HYBRID_RANKING_WEIGHTS: dict = {
        "lexical": 0.30, "semantic": 0.20, "authority": 0.15,
        "freshness": 0.10, "geographic": 0.10, "rrf": 0.10, "completeness": 0.05
    }
    HYBRID_DDG_TIMEOUT_SEC: float = float(os.getenv("HYBRID_DDG_TIMEOUT_SEC", "2.5"))
    HYBRID_PENDULUM_TIMEOUT_SEC: float = float(os.getenv("HYBRID_PENDULUM_TIMEOUT_SEC", "4.0"))
    HYBRID_RERANK_TOP_N: int = int(os.getenv("HYBRID_RERANK_TOP_N", "10"))
    HYBRID_CACHE_TTL_SEC: int = int(os.getenv("HYBRID_CACHE_TTL_SEC", "300"))  # 5 min

    # July LLM Cloud / Modal Serverless GPU Endpoint
    JULY_CLOUD_ENABLED: bool = os.getenv("JULY_CLOUD_ENABLED", "True").lower() == "true"
    JULY_CLOUD_ENDPOINT: str = os.getenv(
        "JULY_CLOUD_ENDPOINT",
        "https://it038--july-llm-cloud-julylitemodalservice-serve.us-east.modal.run/v1/chat/completions"
    )
    JULY_CLOUD_API_KEY: str = os.getenv("JULY_CLOUD_API_KEY", "hs-july-cloud-key-secure")
    JULY_CLOUD_MODEL: str = os.getenv("JULY_CLOUD_MODEL", "july-lite")
    JULY_CLOUD_TIMEOUT_SEC: float = float(os.getenv("JULY_CLOUD_TIMEOUT_SEC", "20.0"))

    # Security
    ALLOWED_SCHEMES: List[str] = ["http", "https"]
    BLOCKED_HOSTS: List[str] = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"]

    # HS MegaCrawler & Modal Cloud
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    USE_REDIS_FRONTIER: bool = os.getenv("USE_REDIS_FRONTIER", "False").lower() == "true"
    MODAL_ENABLED: bool = os.getenv("MODAL_ENABLED", "True").lower() == "true"
    MODAL_APP_NAME: str = "hs-megacrawler"
    MODAL_VOLUME_NAME: str = "hs-megacrawler-volume"
    MEGACRAWLER_MAX_WORKERS: int = int(os.getenv("MEGACRAWLER_MAX_WORKERS", "36"))
    MEGACRAWLER_BASE_CONCURRENCY: int = int(os.getenv("MEGACRAWLER_BASE_CONCURRENCY", "4"))
    MEGACRAWLER_COST_PER_COMPUTE_HOUR_USD: float = float(os.getenv("MEGACRAWLER_COST_PER_HOUR", "0.14"))

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

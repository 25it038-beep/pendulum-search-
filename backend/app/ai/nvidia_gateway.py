"""
HS AI SOLUTIONS - Private NVIDIA AI Inference Gateway
Company: HS AI Solutions
Founder: Harshan Seliyan

Centralized internal inference engine. Operates exclusively as a backend service.
Credentials and provider endpoints are strictly shielded from browsers and external clients.
"""

import json
import time
import asyncio
import httpx
from typing import Dict, Any, List, Optional, AsyncGenerator
from app.config import settings

class NvidiaInferenceGateway:
    """
    Private AI Inference Gateway powering July AI and Gravity AI.
    Features:
    - 3 Tier Model Routing: Fast (Bolt), Quality (Llama 3.2 90B), Reasoning (Nemotron Reasoning)
    - Streaming generation via Server-Sent Events (SSE)
    - Connection reuse and HTTP/2 pooling
    - Token consumption and latency tracking
    - Resilient error handling and exponential backoff retries
    - Fallback degradation (zero crash policy)
    """

    FAST_MODEL = getattr(settings, "NVIDIA_MODEL_FAST", "nvidia/nemotron-3.5-bolt-e4b")
    QUALITY_MODEL = getattr(settings, "NVIDIA_MODEL_QUALITY", "meta/llama-3.2-90b-vision-instruct")
    REASONING_MODEL = getattr(settings, "NVIDIA_MODEL_REASONING", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")

    def __init__(self):
        self.api_key = getattr(settings, "NVIDIA_API_KEY", "")
        self.base_url = getattr(settings, "NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
        self.timeout_sec = getattr(settings, "NVIDIA_TIMEOUT_SEC", 15.0)
        self.max_retries = getattr(settings, "NVIDIA_MAX_RETRIES", 2)

        # Persistent HTTP client for connection reuse
        self._client: Optional[httpx.AsyncClient] = None

        # Telemetry & Usage Tracking
        self.stats = {
            "fast": {"requests": 0, "total_tokens": 0, "errors": 0, "total_latency_ms": 0, "avg_latency_ms": 0},
            "quality": {"requests": 0, "total_tokens": 0, "errors": 0, "total_latency_ms": 0, "avg_latency_ms": 0},
            "reasoning": {"requests": 0, "total_tokens": 0, "errors": 0, "total_latency_ms": 0, "avg_latency_ms": 0}
        }
        self.circuit_open = False
        self.consecutive_failures = 0
        self.last_failure_time = 0

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            self._client = httpx.AsyncClient(
                headers=headers,
                timeout=httpx.Timeout(self.timeout_sec, connect=5.0),
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=50)
            )
        return self._client

    def _resolve_model(self, tier: str) -> str:
        tier_lower = tier.lower()
        if tier_lower in ("reasoning", "gravity", "complex"):
            return self.REASONING_MODEL
        elif tier_lower in ("quality", "strong"):
            return self.QUALITY_MODEL
        else:
            return self.FAST_MODEL

    async def complete(
        self,
        messages: List[Dict[str, str]],
        tier: str = "fast",
        max_tokens: int = 600,
        temperature: float = 0.3
    ) -> str:
        """
        Execute non-streaming chat completion with retry and fallback.
        Returns synthesized response text.
        """
        if not self.api_key:
            return ""

        # Circuit breaker check: trip for 20s if 4 consecutive failures
        if self.consecutive_failures >= 4:
            if time.time() - self.last_failure_time < 20.0:
                return ""
            else:
                self.consecutive_failures = 0  # Half-open retry

        model = self._resolve_model(tier)
        tier_key = "reasoning" if tier in ("reasoning", "gravity") else ("quality" if tier == "quality" else "fast")
        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }

        client = self._get_client()
        start_t = time.perf_counter()

        for attempt in range(self.max_retries + 1):
            try:
                resp = await client.post(url, json=payload, timeout=self.timeout_sec)
                elapsed_ms = (time.perf_counter() - start_t) * 1000.0

                if resp.status_code == 200:
                    data = resp.json()
                    choice = data.get("choices", [{}])[0]
                    msg = choice.get("message", {})
                    
                    content = msg.get("content") or ""
                    reasoning = msg.get("reasoning_content") or ""

                    # For reasoning models, if content is empty or short, use reasoning or combined
                    final_text = content.strip() if content else reasoning.strip()

                    # Update stats
                    usage = data.get("usage", {})
                    tokens = usage.get("total_tokens", len(final_text.split()))
                    self._update_stats(tier_key, elapsed_ms, tokens, is_error=False)
                    self.consecutive_failures = 0

                    return final_text
                else:
                    if attempt < self.max_retries:
                        await asyncio.sleep(0.2 * (2 ** attempt))
                    else:
                        self._update_stats(tier_key, elapsed_ms, 0, is_error=True)
            except Exception:
                if attempt < self.max_retries:
                    await asyncio.sleep(0.2 * (2 ** attempt))
                else:
                    elapsed_ms = (time.perf_counter() - start_t) * 1000.0
                    self._update_stats(tier_key, elapsed_ms, 0, is_error=True)

        return ""

    async def stream_complete(
        self,
        messages: List[Dict[str, str]],
        tier: str = "fast",
        max_tokens: int = 800,
        temperature: float = 0.3
    ) -> AsyncGenerator[str, None]:
        """
        Streaming chat completion via Server-Sent Events (SSE).
        Yields text chunks incrementally as tokens arrive.
        """
        if not self.api_key:
            return

        model = self._resolve_model(tier)
        tier_key = "reasoning" if tier in ("reasoning", "gravity") else ("quality" if tier == "quality" else "fast")
        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        }

        start_t = time.perf_counter()
        token_count = 0

        try:
            async with httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(self.timeout_sec + 10.0, connect=5.0)) as client:
                async with client.stream("POST", url, json=payload) as resp:
                    if resp.status_code != 200:
                        self._update_stats(tier_key, (time.perf_counter() - start_t) * 1000.0, 0, is_error=True)
                        return

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line or line == "data: [DONE]":
                            continue
                        if line.startswith("data: "):
                            raw_json = line[6:]
                            try:
                                chunk = json.loads(raw_json)
                                choices = chunk.get("choices", [])
                                if not choices:
                                    continue
                                delta = choices[0].get("delta", {})
                                token = delta.get("content") or delta.get("reasoning_content") or ""
                                if token:
                                    token_count += 1
                                    yield token
                            except Exception:
                                continue

            elapsed_ms = (time.perf_counter() - start_t) * 1000.0
            self._update_stats(tier_key, elapsed_ms, token_count, is_error=False)
            self.consecutive_failures = 0
        except Exception:
            elapsed_ms = (time.perf_counter() - start_t) * 1000.0
            self._update_stats(tier_key, elapsed_ms, token_count, is_error=True)

    async def classify_query(self, query: str) -> Dict[str, Any]:
        """
        Ultra-fast query classification using NVIDIA Fast Model.
        Returns intent, complexity, and specialized routing guidance.
        """
        system_prompt = (
            "You are the internal query router for HS Search. Given a search query, classify it into JSON.\n"
            "Allowed intents: 'general', 'news', 'local', 'research', 'technical', 'live', 'navigational', 'complex', 'shopping'.\n"
            "Return ONLY a valid JSON object matching this schema:\n"
            "{\n"
            '  "intent": "general",\n'
            '  "needs_geo": false,\n'
            '  "needs_live_data": false,\n'
            '  "needs_external": false,\n'
            '  "complexity": "low",\n'
            '  "rewritten_query": "cleaned query",\n'
            '  "reasoning": "brief explanation"\n'
            "}"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Query: {query}"}
        ]

        raw = await self.complete(messages, tier="fast", max_tokens=150, temperature=0.0)
        if raw:
            try:
                # Extract JSON if enclosed in markdown
                clean_json = raw.strip()
                if "```json" in clean_json:
                    clean_json = clean_json.split("```json")[1].split("```")[0].strip()
                elif "```" in clean_json:
                    clean_json = clean_json.split("```")[1].split("```")[0].strip()
                return json.loads(clean_json)
            except Exception:
                pass

        # Fallback heuristic classification
        q_lower = query.lower()
        is_geo = any(w in q_lower for w in ["near me", "nearby", "in ", "at ", "around "])
        is_live = any(w in q_lower for w in ["weather", "traffic", "price", "stock", "time", "date"])
        is_news = any(w in q_lower for w in ["news", "latest", "breaking", "today"])
        is_research = any(w in q_lower for w in ["paper", "study", "research", "quantum", "arxiv"])

        intent = "local" if is_geo else ("live" if is_live else ("news" if is_news else ("research" if is_research else "general")))
        return {
            "intent": intent,
            "needs_geo": is_geo,
            "needs_live_data": is_live,
            "needs_external": not is_geo,
            "complexity": "medium" if len(query.split()) > 6 else "low",
            "rewritten_query": query,
            "reasoning": "Heuristic fallback"
        }

    async def health_check(self) -> Dict[str, Any]:
        """Verify provider availability and connection health across tiers."""
        results = {}
        for tier_name in ["fast", "reasoning"]:
            model = self._resolve_model(tier_name)
            start = time.perf_counter()
            res = await self.complete([{"role": "user", "content": "ping"}], tier=tier_name, max_tokens=5)
            latency = (time.perf_counter() - start) * 1000.0
            results[tier_name] = {
                "model": model,
                "status": "healthy" if res else "degraded",
                "latency_ms": round(latency, 1)
            }
        return {
            "provider": "HS AI Solutions Internal Inference Gateway (NVIDIA Infrastructure)",
            "status": "operational" if any(r["status"] == "healthy" for r in results.values()) else "offline",
            "tiers": results,
            "stats": self.stats
        }

    def _update_stats(self, tier: str, latency_ms: float, tokens: int, is_error: bool):
        if tier not in self.stats:
            return
        t = self.stats[tier]
        t["requests"] += 1
        t["total_tokens"] += tokens
        if is_error:
            t["errors"] += 1
            self.consecutive_failures += 1
            self.last_failure_time = time.time()
        else:
            t["total_latency_ms"] += latency_ms
            t["avg_latency_ms"] = round(t["total_latency_ms"] / max(1, t["requests"] - t["errors"]), 1)

    def get_usage_stats(self) -> Dict[str, Any]:
        return {
            "stats": self.stats,
            "models": {
                "fast": self.FAST_MODEL,
                "quality": self.QUALITY_MODEL,
                "reasoning": self.REASONING_MODEL
            },
            "circuit_status": "open" if self.consecutive_failures >= 4 else "closed"
        }

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

# Singleton Instance
nvidia_gateway = NvidiaInferenceGateway()

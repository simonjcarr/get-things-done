"""No provider gets executable tools, network capabilities, secrets or unrelated memory."""

import os, json, time
from urllib.parse import urlparse
import httpx
from policy import POLICY


class NotConfigured(Exception):
    pass


class ProviderFailure(Exception):
    pass


class Providers:
    def ready(self):
        return bool(os.getenv("AI_API_KEY") and os.getenv("AI_MODEL"))

    def model(self, role, schema, context):
        if not self.ready():
            raise NotConfigured("AI provider is not configured")
        if (
            float(os.getenv("AI_INPUT_PRICE", "0")) <= 0
            or float(os.getenv("AI_OUTPUT_PRICE", "0")) <= 0
        ):
            raise NotConfigured("Configure nonzero model pricing before AI work")
        provider = os.getenv("AI_PROVIDER", "openai-compatible")
        model = os.getenv("AI_MODEL_" + role.upper(), os.environ["AI_MODEL"])
        policy = (
            POLICY
            + "\nRole: "
            + role
            + "\nOutput schema: "
            + json.dumps(schema.model_json_schema())
        )
        data = json.dumps(
            {
                "trusted_project_objective": context.get("objective", ""),
                "untrusted_evidence_and_proposals": context,
            },
            ensure_ascii=False,
        )
        key = os.environ["AI_API_KEY"]
        try:
            with httpx.Client(timeout=90, follow_redirects=False) as client:
                if provider == "anthropic":
                    r = client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                        json={
                            "model": model,
                            "max_tokens": 6000,
                            "system": policy,
                            "messages": [{"role": "user", "content": data}],
                        },
                    )
                    r.raise_for_status()
                    raw = r.json()
                    text = raw["content"][0]["text"]
                    u = raw.get("usage", {})
                    inp = u.get("input_tokens", 0)
                    out = u.get("output_tokens", 0)
                    cached = u.get("cache_read_input_tokens", 0)
                elif provider == "google":
                    if not all(c.isalnum() or c in "-_." for c in model):
                        raise ProviderFailure("Invalid model identifier")
                    r = client.post(
                        "https://generativelanguage.googleapis.com/v1beta/models/"
                        + model
                        + ":generateContent",
                        headers={"x-goog-api-key": key},
                        json={
                            "systemInstruction": {"parts": [{"text": policy}]},
                            "contents": [{"role": "user", "parts": [{"text": data}]}],
                            "generationConfig": {
                                "responseMimeType": "application/json"
                            },
                        },
                    )
                    r.raise_for_status()
                    raw = r.json()
                    text = raw["candidates"][0]["content"]["parts"][0]["text"]
                    u = raw.get("usageMetadata", {})
                    inp = u.get("promptTokenCount", 0)
                    out = u.get("candidatesTokenCount", 0)
                    cached = u.get("cachedContentTokenCount", 0)
                else:
                    base = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip(
                        "/"
                    )
                    url = urlparse(base)
                    # Endpoint is administrator configuration only, never supplied by a model or email.
                    if url.scheme != "https" or url.username or url.password:
                        raise ProviderFailure("Provider endpoint requires HTTPS")
                    r = client.post(
                        base + "/chat/completions",
                        headers={"Authorization": "Bearer " + key},
                        json={
                            "model": model,
                            "messages": [
                                {"role": "system", "content": policy},
                                {"role": "user", "content": data},
                            ],
                            "response_format": {"type": "json_object"},
                        },
                    )
                    r.raise_for_status()
                    raw = r.json()
                    text = raw["choices"][0]["message"]["content"]
                    u = raw.get("usage", {})
                    inp = u.get("prompt_tokens", 0)
                    out = u.get("completion_tokens", 0)
                    cached = u.get("prompt_tokens_details", {}).get("cached_tokens", 0)
            # Never return raw provider errors, which can contain prompts or request headers.
            result = schema.model_validate_json(text)
            pricing = {
                k: float(os.getenv(k, "0"))
                for k in ("AI_INPUT_PRICE", "AI_OUTPUT_PRICE", "AI_CACHED_PRICE")
            }
            cost = (
                max(inp - cached, 0) * pricing["AI_INPUT_PRICE"]
                + cached * pricing["AI_CACHED_PRICE"]
                + out * pricing["AI_OUTPUT_PRICE"]
            ) / 1000000
            return result, {
                "provider": provider,
                "model": model,
                "input_tokens": inp,
                "output_tokens": out,
                "cached_tokens": cached,
                "cost": cost,
                "pricing": pricing,
                "role": role,
            }
        except NotConfigured:
            raise
        except Exception as e:
            raise ProviderFailure(
                "Model call or structured response validation failed"
            ) from None

    def search(self, query):
        key = os.getenv("BRAVE_SEARCH_API_KEY")
        if not key:
            raise NotConfigured("Search provider is not configured")
        try:
            with httpx.Client(timeout=30, follow_redirects=False) as client:
                r = client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    headers={"X-Subscription-Token": key},
                    params={"q": query, "count": 8},
                )
                r.raise_for_status()
                data = r.json()
            results = []
            for x in data.get("web", {}).get("results", []):
                u = urlparse(x["url"])
                if u.scheme == "https" and u.hostname and not u.username:
                    results.append(
                        {
                            "title": str(x.get("title", ""))[:500],
                            "url": x["url"],
                            "excerpt": str(x.get("description", ""))[:4000],
                            "confidence": "Search excerpt — unverified",
                            "trust": "public_search",
                            "accessedAt": time.time(),
                        }
                    )
            return results
        except Exception:
            raise ProviderFailure("Public search failed") from None

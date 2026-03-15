"""LLM Provider Clients — concrete implementations of :class:`LLMClient`."""

import os
from typing import Optional

import requests

from .evaluator import LLMClient


# ═══════════════════════════════════════════════════════════════════════════
# OpenAI
# ═══════════════════════════════════════════════════════════════════════════
class OpenAIClient(LLMClient):
    """LLM client using the OpenAI API."""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        from openai import OpenAI

        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""


# ═══════════════════════════════════════════════════════════════════════════
# Anthropic
# ═══════════════════════════════════════════════════════════════════════════
class AnthropicClient(LLMClient):
    """LLM client using the Anthropic API."""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        import anthropic

        self.model = model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
        self.client = anthropic.Anthropic(
            api_key=api_key or os.getenv("ANTHROPIC_API_KEY"),
        )

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return message.content[0].text


# ═══════════════════════════════════════════════════════════════════════════
# Google Gemini
# ═══════════════════════════════════════════════════════════════════════════
class GeminiClient(LLMClient):
    """LLM client using the Google Gemini API via google-genai."""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        from google import genai

        self.model = model or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.client = genai.Client(
            api_key=api_key or os.getenv("GOOGLE_API_KEY"),
        )

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        response = self.client.models.generate_content(
            model=self.model,
            contents=f"{system_prompt}\n\n{user_prompt}",
        )
        return response.text or ""


# ═══════════════════════════════════════════════════════════════════════════
# Ollama / Local models
# ═══════════════════════════════════════════════════════════════════════════
class OllamaClient(LLMClient):
    """LLM client that talks to a local Ollama server over HTTP."""

    def __init__(
        self,
        model: Optional[str] = None,
        host: Optional[str] = None,
        timeout: Optional[float] = None,
    ):
        self.model = model or os.getenv("OLLAMA_MODEL", "llama3.1")
        self.base_url = (
            host or os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
        ).rstrip("/")
        self.timeout = timeout or float(os.getenv("OLLAMA_TIMEOUT", "120"))

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        response = requests.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        message = data.get("message", {})
        if isinstance(message, dict):
            return message.get("content", "") or ""
        return ""


# ═══════════════════════════════════════════════════════════════════════════
# Factory
# ═══════════════════════════════════════════════════════════════════════════
_PROVIDERS = {
    "openai": OpenAIClient,
    "anthropic": AnthropicClient,
    "gemini": GeminiClient,
    "ollama": OllamaClient,
}


def get_llm_client(provider: Optional[str] = None) -> LLMClient:
    """Return an LLM client for the given provider name.

    If *provider* is ``None``, reads ``LLM_PROVIDER`` from the environment
    (default: ``"openai"``).

    Raises ``ValueError`` for unsupported provider names.
    """
    name = (provider or os.getenv("LLM_PROVIDER", "openai")).lower().strip()
    cls = _PROVIDERS.get(name)
    if cls is None:
        supported = ", ".join(sorted(_PROVIDERS))
        raise ValueError(
            f"Unknown LLM provider '{name}'. Supported: {supported}"
        )
    return cls()

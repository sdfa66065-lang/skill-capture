"""Tests for core.providers — LLM client factory."""

import os
import pytest

from core.evaluator import LLMClient
from core.providers import (
    OpenAIClient,
    AnthropicClient,
    GeminiClient,
    OllamaClient,
    get_llm_client,
)


class TestGetLlmClient:
    """Tests for the get_llm_client factory function."""

    def test_returns_openai_by_default(self, monkeypatch):
        monkeypatch.delenv("LLM_PROVIDER", raising=False)
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        client = get_llm_client()
        assert isinstance(client, OpenAIClient)

    def test_returns_openai_explicitly(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        client = get_llm_client("openai")
        assert isinstance(client, OpenAIClient)

    def test_returns_anthropic(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        client = get_llm_client("anthropic")
        assert isinstance(client, AnthropicClient)

    def test_returns_gemini(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
        client = get_llm_client("gemini")
        assert isinstance(client, GeminiClient)

    def test_returns_ollama(self):
        client = get_llm_client("ollama")
        assert isinstance(client, OllamaClient)

    def test_raises_on_unknown_provider(self):
        with pytest.raises(ValueError, match="Unknown LLM provider"):
            get_llm_client("unknown_provider")

    def test_reads_from_env(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER", "anthropic")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        client = get_llm_client()
        assert isinstance(client, AnthropicClient)

    def test_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        client = get_llm_client("OpenAI")
        assert isinstance(client, OpenAIClient)

    def test_all_clients_implement_interface(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
        for provider in ("openai", "anthropic", "gemini", "ollama"):
            client = get_llm_client(provider)
            assert isinstance(client, LLMClient)
            assert hasattr(client, "chat")

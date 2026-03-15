# SkillCapture 🧠

A **privacy-first, local AI agent** that watches your daily chats, automatically learns your repetitive workflows, and turns them into one-click **Skills** — all stored safely on your own hard drive.

Built with [FastMCP](https://github.com/jlowin/fastmcp) · Works with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

---

## How It Works

SkillCapture uses a **two-tier pipeline** inspired by how human memory consolidation works:

### Day 1 — Lightweight Draft (Cheap)
The AI scans your chat log and extracts potential workflows into a flat JSON cache. No heavy processing — just keywords and action summaries.

### Day 2 — Heavy Promotion (Only on Match)
If you repeat a workflow, the system detects the keyword overlap and *only then* triggers the expensive generation: building a full, reusable Skill with named variables, step-by-step actions, and trigger phrases.

```
DISCOVERED → PENDING → PROMOTED → DEPRECATED
   (Day 1)    (Cache)   (Vault)    (30d unused)
```

### The Storage Architecture

| Layer | Location | Purpose |
|-------|----------|---------|
| **The Sandbox** | `data/pending.json` | Lightweight Day 1 cache — fast read/write |
| **The Vault** | `skills/*.md` | Promoted skills as human-readable Markdown with YAML frontmatter |
| **The Index** | `skills/index.json` | Ultra-light manifest so the AI never overloads its context window |

Skills are stored as **Markdown files** — you can read, edit, and version-control them with Git.

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/skill-capture.git
cd skill-capture
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure your LLM provider

```bash
cp .env.example .env
# Edit .env with your provider and API key
```

SkillCapture ships with **three built-in providers**. Set `LLM_PROVIDER` in `.env`:

| Provider | `LLM_PROVIDER` | API Key Env Var | Default Model |
|----------|---------------|-----------------|---------------|
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| Google Gemini | `gemini` | `GOOGLE_API_KEY` | `gemini-2.0-flash` |

> **Extensible**: Need a different provider? Implement the `LLMClient.chat()` interface in `core/providers.py`.

### 3. Run the MCP Server

```bash
python server.py
```

Then connect from **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible client.

### 4. Connect to Claude Desktop

Add this to your Claude Desktop MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "skill-capture": {
      "command": "python",
      "args": ["/absolute/path/to/skill-capture/server.py"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

---

## MCP Tools

Once connected, your AI client has access to these tools:

| Tool | Description |
|------|-------------|
| `list_skills()` | Browse all promoted skills (reads the lightweight index) |
| `run_skill(name)` | Load the full content of a specific skill from the Vault |
| `analyze_today()` | Manually trigger the Day 1/Day 2 pipeline |
| `get_pending()` | View workflow drafts sitting in the sandbox |

---

## Project Structure

```
skill-capture/
├── data/
│   └── pending.json          # The Sandbox
├── skills/
│   ├── index.json            # The Index
│   └── *.md                  # The Vault
├── logs/                     # Daily chat logs (input)
├── core/
│   ├── models.py             # Two-tier Pydantic schemas
│   ├── storage.py            # File-system I/O layer
│   ├── evaluator.py          # LLM client interface + evaluator logic
│   ├── providers.py          # OpenAI, Anthropic, Gemini clients
│   └── scheduler.py          # APScheduler nightly worker
├── server.py                 # FastMCP server
└── requirements.txt
```

---

## Tech Stack

- **Python** — Core language
- **[FastMCP](https://github.com/jlowin/fastmcp)** — Model Context Protocol server framework
- **[Pydantic](https://docs.pydantic.dev/)** — Structured data validation
- **[OpenAI](https://platform.openai.com/) · [Anthropic](https://docs.anthropic.com/) · [Google Gemini](https://ai.google.dev/)** — LLM providers (swappable)
- **[python-frontmatter](https://github.com/eyeseast/python-frontmatter)** — Markdown + YAML parsing
- **[APScheduler](https://apscheduler.readthedocs.io/)** — Background task scheduling

---

## Contributing

Contributions are welcome! Some ideas:

- 🔌 Add more LLM providers (Ollama, local models)
- 🎨 Build the web UI for skill management
- 📊 Add usage analytics and skill effectiveness tracking
- 🧪 Improve the keyword matching with embeddings
- 📝 Add support for more chat log formats

---

## License

MIT License — see [LICENSE](LICENSE) for details.

# LLM Council Chat

> Disclaimer: This project is a **derived work** of Andrej Karpathy’s original LLM Council repository.

LLM Council Chat is a local web app that routes your prompt to multiple LLMs, has them review each other’s answers, and produces a final synthesized response. This repo is for internal use only and will be updated whenever the owner deems it necessary. The current model configuration is the best optimized version so far in terms of output quality and cost.

## What It Does (3‑Stage Pipeline)

1. **Stage 1 — Individual responses:** Each model answers independently.
2. **Stage 2 — Peer review:** Models rank anonymized answers.
3. **Stage 3 — Chairman synthesis:** A designated model produces the final answer.

The UI shows all stages, with collapsible panels and per‑stage tabs.

---

## Highlights (LLM Council Chat Enhancements)

- **Token‑aware context window** using `tiktoken` (default 16k, configurable).
- **Conversation memory** with summarization of older turns.
- **Streaming responses** with stage‑by‑stage updates.
- **Resend last prompt** without duplicating messages.
- **Rename & delete conversations** from the sidebar.
- **Markdown + math rendering** (GFM tables + KaTeX), with normalization of malformed math.
- **Collapsible user prompts** (long prompts folded by default).
- **Failure badges** for stages and prompts when an error occurs.
- **Turn cards** that group each user prompt with its full multi‑stage response.
- **Context debug line** showing token budget usage and what got summarized/pruned.

---

## Requirements

- Python 3.10+
- Node.js + npm
- `uv` (Python package manager)

---

## Setup

### 1) Install Dependencies

Backend:
```bash
uv sync
```

Frontend:
```bash
cd frontend
npm install
cd ..
```

### 2) Configure API Key

Create a `.env` in repo root:
```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

### 3) Configure Models (Optional)

Edit `backend/config.py`:
```python
COUNCIL_MODELS = [
    "qwen/qwen3-14b",
    "nvidia/nemotron-nano-9b-v2",
    "upstage/solar-pro-3:free",
    "google/gemma-3-27b-it",
]

CHAIRMAN_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free"
```

---

## Running

**Option A: Start script**
```bash
./start.sh
```

**Option B: Manual**

Terminal 1 (backend):
```bash
uv run python -m backend.main
```

Terminal 2 (frontend):
```bash
cd frontend
npm run dev
```

Open http://localhost:5173

---

## Key Config Knobs

In `backend/config.py`:

- `CONTEXT_TOKEN_LIMIT` (default 16000)
- `CONTEXT_TOKEN_SAFETY_MARGIN` (default 256)
- `SUMMARY_MODEL` (default = `CHAIRMAN_MODEL`)

These can also be set via environment variables.

---

## Storage

Conversation JSON is stored in:
```
data/conversations/
```

Each conversation contains user and assistant messages plus stage outputs.

---

## Tech Stack

- **Backend:** FastAPI, httpx, OpenRouter API, tiktoken
- **Frontend:** React + Vite, react-markdown, remark-gfm, remark-math, rehype-katex
- **Storage:** JSON files
- **Package Management:** uv (Python), npm (JS)

---

## Notes

- This is a local tool; run it on your machine.
- Free models may rate‑limit or error; swap models in `config.py` if needed.

---

## Architecture Details

See `ARCHITECTURE.md` for a detailed breakdown of backend + frontend flow, context handling, and streaming behavior.

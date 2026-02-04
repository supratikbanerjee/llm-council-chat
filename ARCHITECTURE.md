# ARCHITECTURE.md - Technical Notes for LLM Council Chat
This file captures the current architecture, data flow, and implementation decisions for **LLM Council Chat**. It is kept up to date with backend + frontend behavior, including recent context handling, streaming, and UI features. The current model lineup is tuned for the best balance of output quality and cost so far.

## Project Overview

LLM Council is a 3‑stage deliberation system:
1. **Stage 1:** Each model answers the user’s prompt independently.
2. **Stage 2:** Models evaluate and rank each other’s anonymized responses.
3. **Stage 3:** A designated chairman synthesizes a final answer.

The goal is transparent multi‑model reasoning with a single final synthesis.

---

## Backend Architecture (`backend/`)

### `config.py`
Configuration is code‑first with environment overrides:
- `OPENROUTER_API_KEY` (from `.env`)
- `OPENROUTER_API_URL` (default: `https://openrouter.ai/api/v1/chat/completions`)
- `COUNCIL_MODELS`, `CHAIRMAN_MODEL`
  - **Current defaults** in `backend/config.py`:
    - Council: `qwen/qwen3-14b`, `mistralai/ministral-14b-2512`, `upstage/solar-pro-3:free`, `google/gemma-3-27b-it`
    - Chairman: `nvidia/nemotron-3-nano-30b-a3b:free`
- **Context controls:**
  - `CONTEXT_TOKEN_LIMIT` (default 16000)
  - `CONTEXT_TOKEN_SAFETY_MARGIN` (default 256)
  - `SUMMARY_MODEL` (defaults to `CHAIRMAN_MODEL`)

### `openrouter.py`
Async OpenRouter client:
- `query_model()` sends a single request; returns `{content, reasoning_details}` or `None`.
- `query_models_parallel()` runs multiple calls with `asyncio.gather`.
- Logs HTTP status errors with useful headers + response preview (API key is never logged).

### `context.py`
Token‑aware context management using `tiktoken`:
- Uses `cl100k_base` tokenizer for counts.
- Builds a message list from conversation history + current user prompt.
- Enforces a **hard token budget** (`CONTEXT_TOKEN_LIMIT - CONTEXT_TOKEN_SAFETY_MARGIN`).
- If over budget, summarizes older turns using `SUMMARY_MODEL`.
  - Summary is inserted as a compact user+assistant context pair.
- Assistant history is built from **stage3 final response only** (no stage1/2 by default).

### `context_debug.py`
Debug-only context builder:
- Mirrors `context.py` behavior but returns a debug payload.
- Reports token usage, summarized indices, and pruned indices.
- Used by the streaming endpoint to emit `context_debug` events for the UI.

### `council.py`
Core multi‑stage orchestration:
- `stage1_collect_responses(messages)` queries all council models with **full context**.
- `stage2_collect_rankings(user_query, stage1_results)`:
  - Responses anonymized as “Response A/B/C…”
  - Strict ranking format required (`FINAL RANKING:` + numbered list)
  - Returns both raw ranking text + parsed labels
- `stage3_synthesize_final(...)` uses chairman model to synthesize final response.
- `calculate_aggregate_rankings()` computes average ranks across reviewers.

### `storage.py`
JSON storage under `data/conversations/`:
- Conversation format: `{id, created_at, title, messages[]}`
- User messages: `{role: "user", content}`
- Assistant messages: `{role: "assistant", stage1, stage2, stage3}`
- Title stored in conversation
- **Delete support**: `delete_conversation(conversation_id)`

### `main.py`
FastAPI service (port **8001**) with CORS:
Endpoints:
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/{id}`
- `POST /api/conversations/{id}/message`
- `POST /api/conversations/{id}/message/stream` (SSE streaming)
- `PATCH /api/conversations/{id}/title`
- `DELETE /api/conversations/{id}`

**Streaming events**:
`stage1_start`, `stage1_complete`, `stage2_start`, `stage2_complete`, `stage3_start`, `stage3_complete`, `title_complete`, `complete`, `error`.
`context_debug` is emitted once per request to report token usage, summarized indices, and pruned indices.

**Resend support**:
Requests may include `resend_index`:
- Only allowed for the **most recent user message**
- Backend truncates any assistant output after that user message
- Re‑runs the council without duplicating the user prompt

---

## Frontend Architecture (`frontend/src/`)

### `App.jsx`
Top‑level state:
- Conversations list + current conversation
- Streaming message updates
- Rename / delete actions
- Resend support (uses `resend_index` with streaming API)

### `api.js`
API client for backend:
- `sendMessageStream(conversationId, content, onEvent, options)`
  - `options` supports `{resend_index}`
- `updateConversationTitle()`
- `deleteConversation()`

### `components/ChatInterface.jsx`
Main chat UI:
- User prompt input (Enter = send, Shift+Enter = newline)
- **Message list memoized** to avoid re‑rendering on each keystroke
- Auto‑scroll only when user is near the bottom (prevents scroll jumps)
- User messages are **collapsible** (default shows ~5 lines)
- Latest user message includes a **Resend** button
- **Turn cards** group each user prompt with its multi‑stage response
- **Context debug line** shows token budget usage and summarization/pruning results
- Math + Markdown rendering:
  - `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-raw`
  - Custom sanitizer `normalizeMathDelimiters()` for malformed math

### `components/Stage1.jsx`, `Stage2.jsx`, `Stage3.jsx`
Each stage is:
- Collapsible with header toggle
- Shows `[FAILED]` badge if stage fails
- Uses ReactMarkdown with math + HTML support

### `components/Sidebar.jsx`
Conversation list:
- New conversation button
- Each conversation item includes:
  - Rename
  - Delete

### Styling (`*.css`)
Key UX choices:
- Light theme, blue accents
- Collapsible stages
- Scroll only inside `.messages-container`
- Markdown tables / code blocks scroll horizontally if needed
- KaTeX CSS included globally via `index.css`

---

## Data Flow Summary

```
User prompt
   ↓
Context builder (token budget + optional summary)
   ↓
Stage 1 (parallel model responses)
   ↓
Stage 2 (peer rankings + parsed labels)
   ↓
Aggregate ranking calculation
   ↓
Stage 3 (chairman synthesis)
   ↓
Store conversation + return stages + metadata
```

---

## Key Design Decisions

### Context Strategy
- Token‑budgeted using `tiktoken` (not approximate chars).
- Older history summarized when budget exceeded.
- Only **final assistant responses** are used as context to avoid noise.

### Stage 2 Anonymization
Models never see each other’s identities. Labels are mapped back client‑side for user readability.

### Error Handling
- Per‑model failures don’t stop the rest of the council.
- Streaming errors mark the message as failed in UI.
- Stage failure badges are shown if output is missing or error text appears.

### Resend
Resend **does not duplicate** the user prompt.
It replaces the latest assistant output and replays the stages.

---

## Known Tradeoffs / Limitations

- `tiktoken` uses `cl100k_base` for all models; other providers may tokenize slightly differently.
- Summaries are generated via `SUMMARY_MODEL`, which may be slower/expensive depending on the model.
- Stage1/2 content isn’t persisted in a model‑agnostic structured schema (only raw content).
- Rehydrate: metadata (aggregate rankings) is generated in‑flight, not stored.

---

## Future Enhancements (Optional)

- Per‑model context limits + tokenizer selection.
- Per‑stage retry/backoff and rate‑limit smoothing.
- Inline rename (instead of prompt).
- Conversation branching for resend on non‑latest messages.

---

## Quick Ops Notes

### Ports
- Backend: 8001
- Frontend: 5173

### Running
- `uv run python -m backend.main`
- `cd frontend && npm run dev`

---

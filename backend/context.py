"""Context management for multi-message conversations with smart summarization and token-aware pruning."""

from typing import List, Dict, Any
import tiktoken
from .openrouter import query_model
from .config import CONTEXT_TOKEN_LIMIT, CONTEXT_TOKEN_SAFETY_MARGIN, SUMMARY_MODEL

ENCODING = tiktoken.get_encoding("cl100k_base")
MESSAGE_OVERHEAD_TOKENS = 4  # small buffer for role/formatting


def count_tokens(text: str) -> int:
    """Token count using tiktoken encoding."""
    return len(ENCODING.encode(text or ""))


def message_token_cost(message: Dict[str, str]) -> int:
    """Approximate token cost for a single message."""
    return MESSAGE_OVERHEAD_TOKENS + count_tokens(message.get("content", ""))


async def summarize_older_messages(messages: List[Dict[str, str]]) -> str:
    """Summarize older messages into a concise conversation summary."""
    conversation_text = ""
    for msg in messages:
        role = msg["role"].capitalize()
        if msg["role"] == "user":
            conversation_text += f"{role}: {msg['content']}\n\n"
        else:
            if "stage3" in msg and "response" in msg["stage3"]:
                conversation_text += f"{role}: {msg['stage3']['response']}\n\n"
            elif "content" in msg:
                conversation_text += f"{role}: {msg['content']}\n\n"

    summary_prompt = f"""Summarize the following conversation concisely in 2-3 sentences. Focus on key topics, questions asked, and important context that would be needed to understand follow-up questions.

Conversation:
{conversation_text}

Concise summary:"""

    messages_for_api = [{"role": "user", "content": summary_prompt}]
    response = await query_model(SUMMARY_MODEL, messages_for_api, timeout=30.0)

    if response is None:
        return "Previous conversation: " + conversation_text[:200] + "..."

    return response.get('content', '').strip()


def format_assistant_message(assistant_msg: Dict[str, Any]) -> str:
    """Convert council's 3-stage output into clean text for context."""
    if "stage3" in assistant_msg and "response" in assistant_msg["stage3"]:
        return assistant_msg["stage3"]["response"]

    if "content" in assistant_msg:
        return assistant_msg["content"]

    return "[Assistant response]"


async def prune_to_token_limit(messages: List[Dict[str, str]], limit: int) -> List[Dict[str, str]]:
    """
    Keep as many recent messages as fit in the token limit.
    Older messages are summarized into a single summary turn if needed.
    """
    # Quick accept
    budget = max(1, limit - CONTEXT_TOKEN_SAFETY_MARGIN)
    total = sum(message_token_cost(m) for m in messages)
    if total <= budget:
        return messages

    # Walk backwards keeping recent messages until budget fills
    kept = []
    running = 0
    for msg in reversed(messages):
        cost = message_token_cost(msg)
        if running + cost > budget:
            break
        kept.append(msg)
        running += cost

    kept.reverse()

    # Summarize the older discarded messages
    cutoff = len(messages) - len(kept)
    older = messages[:cutoff]
    summary = await summarize_older_messages(older)

    summary_msgs = [
        {"role": "user", "content": f"[Summary of earlier conversation: {summary}]"},
        {"role": "assistant", "content": "Understood. Using the summary above as prior context."}
    ]

    pruned = summary_msgs + kept

    # If still over budget (very long summary), trim oldest kept messages
    while sum(message_token_cost(m) for m in pruned) > budget and len(pruned) > 1:
        pruned.pop(len(summary_msgs))  # drop oldest kept message first

    return pruned


async def build_context_messages(
    conversation_messages: List[Dict[str, Any]],
    current_query: str
) -> List[Dict[str, str]]:
    """
    Build message history with token-aware pruning and optional summarization.
    - Keeps newest turns verbatim until the token budget is hit.
    - Older turns are summarized into a compact user+assistant pair.
    """
    formatted_messages: List[Dict[str, str]] = []

    for msg in conversation_messages:
        if msg["role"] == "user":
            formatted_messages.append({"role": "user", "content": msg["content"]})
        else:
            content = format_assistant_message(msg)
            formatted_messages.append({"role": "assistant", "content": content})

    # Append current user message
    formatted_messages.append({"role": "user", "content": current_query})

    # Prune to configured token budget
    return await prune_to_token_limit(formatted_messages, CONTEXT_TOKEN_LIMIT)

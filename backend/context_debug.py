"""Debug utilities for context building and pruning."""

from typing import List, Dict, Any, Tuple, Optional

from .config import CONTEXT_TOKEN_LIMIT, CONTEXT_TOKEN_SAFETY_MARGIN
from .context import (
    message_token_cost,
    summarize_older_messages,
    format_assistant_message,
)


def _tokens_for_messages(messages: List[Dict[str, str]]) -> int:
    return sum(message_token_cost(m) for m in messages)


async def prune_to_token_limit_with_debug(
    messages: List[Dict[str, str]],
    src_indices: List[Optional[int]],
    limit: int,
) -> Tuple[List[Dict[str, str]], Dict[str, Any]]:
    """
    Like prune_to_token_limit(), but returns a debug payload describing what was
    included/summarized/dropped for this request.

    src_indices maps 1:1 with `messages` and contains:
      - int: index into the original conversation's `messages` array
      - None: synthetic message (e.g., summary)
    """
    budget = max(1, limit - CONTEXT_TOKEN_SAFETY_MARGIN)
    total_before = _tokens_for_messages(messages)

    debug: Dict[str, Any] = {
        "token_limit": limit,
        "safety_margin": CONTEXT_TOKEN_SAFETY_MARGIN,
        "budget": budget,
        "total_tokens_before": total_before,
        "total_tokens_after": None,
        "message_count_before": len(messages),
        "message_count_after": None,
        "summary_used": False,
        "summarized_indices": [],
        "dropped_indices": [],
        "included_indices": [],
    }

    if total_before <= budget:
        debug["total_tokens_after"] = total_before
        debug["message_count_after"] = len(messages)
        debug["included_indices"] = [i for i in src_indices if i is not None]
        return messages, debug

    # Walk backwards keeping recent messages until budget fills.
    kept: List[Dict[str, str]] = []
    kept_src: List[Optional[int]] = []
    running = 0
    for msg, src in zip(reversed(messages), reversed(src_indices)):
        cost = message_token_cost(msg)
        if running + cost > budget:
            break
        kept.append(msg)
        kept_src.append(src)
        running += cost

    kept.reverse()
    kept_src.reverse()

    cutoff = len(messages) - len(kept)
    older = messages[:cutoff]
    older_src = src_indices[:cutoff]

    debug["summary_used"] = True
    debug["summarized_indices"] = [i for i in older_src if i is not None]

    summary = await summarize_older_messages(older)
    summary_msgs = [
        {"role": "user", "content": f"[Summary of earlier conversation: {summary}]"},
        {"role": "assistant", "content": "Understood. Using the summary above as prior context."},
    ]
    summary_src = [None, None]

    pruned = summary_msgs + kept
    pruned_src = summary_src + kept_src

    # If still over budget (e.g., huge recent messages), drop oldest kept messages.
    while _tokens_for_messages(pruned) > budget and len(pruned) > len(summary_msgs):
        drop_at = len(summary_msgs)  # first kept message
        dropped_src = pruned_src.pop(drop_at)
        pruned.pop(drop_at)
        if dropped_src is not None:
            debug["dropped_indices"].append(dropped_src)

    debug["total_tokens_after"] = _tokens_for_messages(pruned)
    debug["message_count_after"] = len(pruned)
    debug["included_indices"] = [i for i in pruned_src if i is not None]

    # Keep the dropped list in ascending order for readability.
    debug["dropped_indices"].sort()

    return pruned, debug


async def build_context_messages_with_debug(
    conversation_messages: List[Dict[str, Any]],
    current_query: str,
) -> Tuple[List[Dict[str, str]], Dict[str, Any]]:
    """
    Build token-budgeted context messages + debug info.

    `conversation_messages` should be the conversation history excluding the
    current user message (if it is already stored).
    """
    formatted_messages: List[Dict[str, str]] = []
    src_indices: List[Optional[int]] = []

    for idx, msg in enumerate(conversation_messages):
        if msg["role"] == "user":
            formatted_messages.append({"role": "user", "content": msg["content"]})
        else:
            content = format_assistant_message(msg)
            formatted_messages.append({"role": "assistant", "content": content})
        # src index matches the index within the *full* conversation messages
        # array (because callers pass conversation["messages"][:-1]).
        src_indices.append(idx)

    # Append current user message (synthetic; not yet part of prior history).
    formatted_messages.append({"role": "user", "content": current_query})
    src_indices.append(None)

    pruned, debug = await prune_to_token_limit_with_debug(
        formatted_messages, src_indices, CONTEXT_TOKEN_LIMIT
    )

    # For UI display, include a few derived counters.
    debug["used_history_messages"] = len([i for i in debug["included_indices"] if i is not None])
    debug["summarized_message_count"] = len(debug["summarized_indices"])
    debug["dropped_message_count"] = len(debug["dropped_indices"])
    return pruned, debug

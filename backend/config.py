"""Configuration for the LLM Council."""

import os
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Context window (approx tokens) for building prompts
CONTEXT_TOKEN_LIMIT = int(os.getenv("CONTEXT_TOKEN_LIMIT", "16000"))
CONTEXT_TOKEN_SAFETY_MARGIN = int(os.getenv("CONTEXT_TOKEN_SAFETY_MARGIN", "256"))

# Council members - list of OpenRouter model identifiers
COUNCIL_MODELS = [
    "deepseek/deepseek-r1-distill-qwen-32b",
    "mistralai/ministral-14b-2512",
    "upstage/solar-pro-3:free",
]
#mistralai/mistral-small-3.1-24b-instruct

# Chairman model - synthesizes final response
CHAIRMAN_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free"

# Summary model for context compression (defaults to chairman)
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", CHAIRMAN_MODEL)

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"

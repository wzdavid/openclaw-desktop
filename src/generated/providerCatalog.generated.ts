export type GeneratedProviderCatalogModel = {
  id: string;
  suggestedAlias?: string;
  supportsImage?: boolean;
};

export const GENERATED_PROVIDER_CATALOG: Record<string, GeneratedProviderCatalogModel[]> = {
  "anthropic": [
    {
      "id": "anthropic/claude-haiku-3.5",
      "suggestedAlias": "haiku"
    },
    {
      "id": "anthropic/claude-opus-4-6",
      "suggestedAlias": "opus"
    },
    {
      "id": "anthropic/claude-sonnet-4-6",
      "suggestedAlias": "sonnet"
    }
  ],
  "openai": [
    {
      "id": "openai/gpt-4o",
      "suggestedAlias": "gpt4o",
      "supportsImage": true
    },
    {
      "id": "openai/gpt-4o-mini",
      "suggestedAlias": "gpt-mini",
      "supportsImage": true
    },
    {
      "id": "openai/gpt-5.4",
      "suggestedAlias": "gpt-5.4",
      "supportsImage": true
    }
  ],
  "google": [
    {
      "id": "google/gemini-2.5-flash",
      "suggestedAlias": "g2.5-flash",
      "supportsImage": true
    },
    {
      "id": "google/gemini-2.5-flash-lite",
      "suggestedAlias": "g2.5-lite",
      "supportsImage": true
    },
    {
      "id": "google/gemini-2.5-pro",
      "suggestedAlias": "g2.5-pro",
      "supportsImage": true
    },
    {
      "id": "google/gemini-3-flash-preview",
      "suggestedAlias": "g3-flash",
      "supportsImage": true
    },
    {
      "id": "google/gemini-3-pro-image-preview",
      "suggestedAlias": "g3-image",
      "supportsImage": true
    },
    {
      "id": "google/gemini-3-pro-preview",
      "suggestedAlias": "g3-pro",
      "supportsImage": true
    },
    {
      "id": "google/gemini-3.1-flash-image-preview",
      "suggestedAlias": "g3.1-image",
      "supportsImage": true
    },
    {
      "id": "google/gemini-3.1-flash-lite-preview",
      "suggestedAlias": "g3.1-lite",
      "supportsImage": true
    },
    {
      "id": "google/gemini-3.1-pro-preview",
      "suggestedAlias": "g3.1-pro",
      "supportsImage": true
    }
  ],
  "xai": [
    {
      "id": "xai/grok-3",
      "suggestedAlias": "grok-3",
      "supportsImage": false
    },
    {
      "id": "xai/grok-3-fast",
      "suggestedAlias": "grok-3-fast",
      "supportsImage": false
    },
    {
      "id": "xai/grok-3-mini",
      "suggestedAlias": "grok-3-mini",
      "supportsImage": false
    },
    {
      "id": "xai/grok-3-mini-fast",
      "suggestedAlias": "g3-mini-fast",
      "supportsImage": false
    },
    {
      "id": "xai/grok-4",
      "suggestedAlias": "grok-4",
      "supportsImage": false
    },
    {
      "id": "xai/grok-4-0709",
      "suggestedAlias": "grok-4-0709",
      "supportsImage": false
    },
    {
      "id": "xai/grok-4-1-fast",
      "suggestedAlias": "grok-4.1-fast",
      "supportsImage": true
    },
    {
      "id": "xai/grok-4-1-fast-non-reasoning",
      "suggestedAlias": "g4.1-fast-nr",
      "supportsImage": true
    },
    {
      "id": "xai/grok-4-fast",
      "suggestedAlias": "grok-4-fast",
      "supportsImage": true
    },
    {
      "id": "xai/grok-4-fast-non-reasoning",
      "suggestedAlias": "g4-fast-nr",
      "supportsImage": true
    },
    {
      "id": "xai/grok-4.20-beta-latest-non-reasoning",
      "suggestedAlias": "g4.20-nr",
      "supportsImage": true
    },
    {
      "id": "xai/grok-4.20-beta-latest-reasoning",
      "suggestedAlias": "g4.20-reason",
      "supportsImage": true
    },
    {
      "id": "xai/grok-code-fast-1",
      "suggestedAlias": "grok-code",
      "supportsImage": false
    }
  ],
  "mistral": [
    {
      "id": "mistral/codestral-latest",
      "suggestedAlias": "codestral",
      "supportsImage": false
    },
    {
      "id": "mistral/devstral-medium-latest",
      "suggestedAlias": "devstral",
      "supportsImage": false
    },
    {
      "id": "mistral/magistral-small",
      "suggestedAlias": "magistral",
      "supportsImage": false
    },
    {
      "id": "mistral/mistral-large-latest",
      "suggestedAlias": "mistral-large",
      "supportsImage": true
    },
    {
      "id": "mistral/mistral-medium-2508",
      "suggestedAlias": "mistral-medium",
      "supportsImage": true
    },
    {
      "id": "mistral/mistral-small-latest",
      "suggestedAlias": "mistral-small",
      "supportsImage": true
    },
    {
      "id": "mistral/pixtral-large-latest",
      "suggestedAlias": "pixtral-large",
      "supportsImage": true
    }
  ],
  "openrouter": [
    {
      "id": "openrouter/auto",
      "suggestedAlias": "auto",
      "supportsImage": true
    },
    {
      "id": "openrouter/healer-alpha",
      "suggestedAlias": "healer",
      "supportsImage": true
    },
    {
      "id": "openrouter/hunter-alpha",
      "suggestedAlias": "hunter",
      "supportsImage": false
    }
  ],
  "groq": [
    {
      "id": "groq/llama-3.3-70b-versatile",
      "suggestedAlias": "llama"
    },
    {
      "id": "groq/moonshotai/kimi-k2-instruct-0905",
      "suggestedAlias": "kimi-k2"
    }
  ],
  "together": [
    {
      "id": "deepseek-ai/DeepSeek-R1",
      "supportsImage": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V3.1",
      "supportsImage": false
    },
    {
      "id": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "supportsImage": false
    },
    {
      "id": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
      "supportsImage": true
    },
    {
      "id": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
      "supportsImage": true
    },
    {
      "id": "moonshotai/Kimi-K2-Instruct-0905",
      "supportsImage": false
    },
    {
      "id": "moonshotai/Kimi-K2.5",
      "supportsImage": true
    },
    {
      "id": "zai-org/GLM-4.7",
      "supportsImage": false
    }
  ],
  "kilocode": [
    {
      "id": "kilo/auto",
      "supportsImage": true
    }
  ],
  "venice": [
    {
      "id": "venice/claude-opus-4-5",
      "supportsImage": true
    },
    {
      "id": "venice/claude-opus-4-6",
      "suggestedAlias": "opus-4.6",
      "supportsImage": true
    },
    {
      "id": "venice/claude-sonnet-4-5",
      "supportsImage": true
    },
    {
      "id": "venice/claude-sonnet-4-6",
      "suggestedAlias": "sonnet-4.6",
      "supportsImage": true
    },
    {
      "id": "venice/deepseek-v3.2",
      "suggestedAlias": "deepseek-v3.2",
      "supportsImage": false
    },
    {
      "id": "venice/gemini-3-1-pro-preview",
      "supportsImage": true
    },
    {
      "id": "venice/gemini-3-flash-preview",
      "supportsImage": true
    },
    {
      "id": "venice/gemini-3-pro-preview",
      "suggestedAlias": "gemini-3-pro",
      "supportsImage": true
    },
    {
      "id": "venice/google-gemma-3-27b-it",
      "supportsImage": true
    },
    {
      "id": "venice/grok-41-fast",
      "supportsImage": true
    },
    {
      "id": "venice/grok-code-fast-1",
      "suggestedAlias": "grok-code",
      "supportsImage": false
    },
    {
      "id": "venice/hermes-3-llama-3.1-405b",
      "supportsImage": false
    },
    {
      "id": "venice/kimi-k2-5",
      "suggestedAlias": "kimi-k2.5",
      "supportsImage": true
    },
    {
      "id": "venice/kimi-k2-thinking",
      "supportsImage": false
    },
    {
      "id": "venice/llama-3.2-3b",
      "supportsImage": false
    },
    {
      "id": "venice/llama-3.3-70b",
      "supportsImage": false
    },
    {
      "id": "venice/minimax-m21",
      "supportsImage": false
    },
    {
      "id": "venice/minimax-m25",
      "supportsImage": false
    },
    {
      "id": "venice/mistral-31-24b",
      "supportsImage": true
    },
    {
      "id": "venice/nvidia-nemotron-3-nano-30b-a3b",
      "supportsImage": false
    },
    {
      "id": "venice/olafangensan-glm-4.7-flash-heretic",
      "supportsImage": false
    },
    {
      "id": "venice/openai-gpt-4o-2024-11-20",
      "supportsImage": true
    },
    {
      "id": "venice/openai-gpt-4o-mini-2024-07-18",
      "supportsImage": true
    },
    {
      "id": "venice/openai-gpt-52",
      "supportsImage": false
    },
    {
      "id": "venice/openai-gpt-52-codex",
      "supportsImage": true
    },
    {
      "id": "venice/openai-gpt-53-codex",
      "supportsImage": true
    },
    {
      "id": "venice/openai-gpt-54",
      "suggestedAlias": "gpt-5.4",
      "supportsImage": true
    },
    {
      "id": "venice/openai-gpt-oss-120b",
      "supportsImage": false
    },
    {
      "id": "venice/qwen3-235b-a22b-instruct-2507",
      "supportsImage": false
    },
    {
      "id": "venice/qwen3-235b-a22b-thinking-2507",
      "supportsImage": false
    },
    {
      "id": "venice/qwen3-4b",
      "supportsImage": false
    },
    {
      "id": "venice/qwen3-5-35b-a3b",
      "suggestedAlias": "qwen3.5",
      "supportsImage": true
    },
    {
      "id": "venice/qwen3-coder-480b-a35b-instruct",
      "supportsImage": false
    },
    {
      "id": "venice/qwen3-coder-480b-a35b-instruct-turbo",
      "supportsImage": false
    },
    {
      "id": "venice/qwen3-next-80b",
      "supportsImage": false
    },
    {
      "id": "venice/qwen3-vl-235b-a22b",
      "suggestedAlias": "qwen3-vl",
      "supportsImage": true
    },
    {
      "id": "venice/venice-uncensored",
      "supportsImage": false
    },
    {
      "id": "venice/zai-org-glm-4.6",
      "supportsImage": false
    },
    {
      "id": "venice/zai-org-glm-4.7",
      "supportsImage": false
    },
    {
      "id": "venice/zai-org-glm-4.7-flash",
      "supportsImage": false
    },
    {
      "id": "venice/zai-org-glm-5",
      "supportsImage": false
    }
  ],
  "huggingface": [
    {
      "id": "deepseek-ai/DeepSeek-R1",
      "supportsImage": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V3.1",
      "supportsImage": false
    },
    {
      "id": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "supportsImage": false
    },
    {
      "id": "openai/gpt-oss-120b",
      "supportsImage": false
    }
  ],
  "litellm": [],
  "vercel-ai-gateway": [
    {
      "id": "vercel-ai-gateway/anthropic/claude-opus-4.6",
      "suggestedAlias": "opus-4.6"
    },
    {
      "id": "vercel-ai-gateway/openai/gpt-5.4",
      "suggestedAlias": "gpt-5.4"
    },
    {
      "id": "vercel-ai-gateway/openai/gpt-5.4-pro",
      "suggestedAlias": "gpt-5.4-pro"
    }
  ],
  "nvidia": [
    {
      "id": "minimaxai/minimax-m2.5",
      "supportsImage": false
    },
    {
      "id": "moonshotai/kimi-k2.5",
      "supportsImage": false
    },
    {
      "id": "nvidia/nemotron-3-super-120b-a12b",
      "supportsImage": false
    },
    {
      "id": "zai/glm5",
      "supportsImage": false
    }
  ],
  "github-copilot": [
    {
      "id": "github-copilot/claude-sonnet-4.5",
      "suggestedAlias": "sonnet-4.5"
    },
    {
      "id": "github-copilot/claude-sonnet-4.6",
      "suggestedAlias": "sonnet-4.6"
    },
    {
      "id": "github-copilot/gpt-4.1",
      "suggestedAlias": "gpt-4.1"
    },
    {
      "id": "github-copilot/gpt-4.1-mini",
      "suggestedAlias": "gpt-4.1-mini"
    },
    {
      "id": "github-copilot/gpt-4.1-nano",
      "suggestedAlias": "gpt-4.1-nano"
    },
    {
      "id": "github-copilot/gpt-4o",
      "suggestedAlias": "gpt-4o"
    },
    {
      "id": "github-copilot/gpt-5.2-codex",
      "suggestedAlias": "gpt-5.2-codex"
    },
    {
      "id": "github-copilot/gpt-5.4",
      "suggestedAlias": "gpt-5.4"
    },
    {
      "id": "github-copilot/o1",
      "suggestedAlias": "o1"
    },
    {
      "id": "github-copilot/o1-mini",
      "suggestedAlias": "o1-mini"
    },
    {
      "id": "github-copilot/o3-mini",
      "suggestedAlias": "o3-mini"
    }
  ],
  "minimax": [
    {
      "id": "minimax/MiniMax-M2.7",
      "suggestedAlias": "minimax-m27",
      "supportsImage": false
    },
    {
      "id": "minimax/MiniMax-M2.7-highspeed",
      "suggestedAlias": "minimax-fast",
      "supportsImage": false
    }
  ],
  "moonshot": [
    {
      "id": "moonshot/kimi-k2-thinking",
      "supportsImage": false
    },
    {
      "id": "moonshot/kimi-k2-thinking-turbo",
      "supportsImage": false
    },
    {
      "id": "moonshot/kimi-k2-turbo",
      "supportsImage": false
    },
    {
      "id": "moonshot/kimi-k2.5",
      "supportsImage": true
    },
    {
      "id": "moonshot/kimi-k2.6",
      "supportsImage": true
    }
  ],
  "zai": [
    {
      "id": "zai/glm-4.5",
      "suggestedAlias": "glm-4.5",
      "supportsImage": false
    },
    {
      "id": "zai/glm-4.5-air",
      "suggestedAlias": "glm-4.5-air",
      "supportsImage": false
    },
    {
      "id": "zai/glm-4.5-flash",
      "suggestedAlias": "glm-4.5-flash",
      "supportsImage": false
    },
    {
      "id": "zai/glm-4.5v",
      "suggestedAlias": "glm-4.5v",
      "supportsImage": true
    },
    {
      "id": "zai/glm-4.6",
      "suggestedAlias": "glm-4.6",
      "supportsImage": false
    },
    {
      "id": "zai/glm-4.6v",
      "suggestedAlias": "glm-4.6v",
      "supportsImage": true
    },
    {
      "id": "zai/glm-4.7",
      "suggestedAlias": "glm-4.7",
      "supportsImage": false
    },
    {
      "id": "zai/glm-4.7-flash",
      "suggestedAlias": "glm-4.7-flash",
      "supportsImage": false
    },
    {
      "id": "zai/glm-4.7-flashx",
      "suggestedAlias": "glm-4.7-flashx",
      "supportsImage": false
    },
    {
      "id": "zai/glm-5",
      "suggestedAlias": "glm-5",
      "supportsImage": false
    },
    {
      "id": "zai/glm-5-turbo",
      "suggestedAlias": "glm-5-turbo",
      "supportsImage": false
    },
    {
      "id": "zai/glm-5.1",
      "suggestedAlias": "glm-5.1",
      "supportsImage": false
    },
    {
      "id": "zai/glm-5v-turbo",
      "suggestedAlias": "glm-5v-turbo",
      "supportsImage": true
    }
  ],
  "deepseek": [
    {
      "id": "deepseek/deepseek-chat",
      "suggestedAlias": "deepseek-chat",
      "supportsImage": false
    },
    {
      "id": "deepseek/deepseek-reasoner",
      "suggestedAlias": "deepseek-r",
      "supportsImage": false
    }
  ],
  "siliconflow": [],
  "qianfan": [
    {
      "id": "qianfan/deepseek-v3.2",
      "suggestedAlias": "ds-v3",
      "supportsImage": false
    },
    {
      "id": "qianfan/ernie-5.0-thinking-preview",
      "suggestedAlias": "ernie5",
      "supportsImage": true
    }
  ],
  "qwen": [
    {
      "id": "qwen/glm-4.7",
      "suggestedAlias": "glm-4.7",
      "supportsImage": false
    },
    {
      "id": "qwen/glm-5",
      "suggestedAlias": "glm-5",
      "supportsImage": false
    },
    {
      "id": "qwen/kimi-k2.5",
      "suggestedAlias": "kimi-k2.5",
      "supportsImage": true
    },
    {
      "id": "qwen/MiniMax-M2.5",
      "suggestedAlias": "minimax-m2.5",
      "supportsImage": false
    },
    {
      "id": "qwen/qwen3-coder-next",
      "suggestedAlias": "qwen-coder-next",
      "supportsImage": false
    },
    {
      "id": "qwen/qwen3-coder-plus",
      "suggestedAlias": "qwen-coder-plus",
      "supportsImage": false
    },
    {
      "id": "qwen/qwen3-max-2026-01-23",
      "suggestedAlias": "qwen3-max",
      "supportsImage": false
    },
    {
      "id": "qwen/qwen3.5-plus",
      "suggestedAlias": "qwen3.5-plus",
      "supportsImage": true
    },
    {
      "id": "qwen/qwen3.6-plus",
      "suggestedAlias": "qwen3.6-plus",
      "supportsImage": true
    }
  ],
  "volcengine": [
    {
      "id": "volcengine/ark-code-latest",
      "supportsImage": false
    },
    {
      "id": "volcengine/deepseek-v3-2-251201",
      "suggestedAlias": "deepseek-v3.2",
      "supportsImage": true
    },
    {
      "id": "volcengine/doubao-seed-1-8-251228",
      "suggestedAlias": "doubao-1.8",
      "supportsImage": true
    },
    {
      "id": "volcengine/doubao-seed-code",
      "supportsImage": false
    },
    {
      "id": "volcengine/doubao-seed-code-preview-251028",
      "suggestedAlias": "doubao-code",
      "supportsImage": true
    },
    {
      "id": "volcengine/glm-4-7-251222",
      "supportsImage": true
    },
    {
      "id": "volcengine/glm-4.7",
      "supportsImage": false
    },
    {
      "id": "volcengine/kimi-k2-5-260127",
      "supportsImage": true
    },
    {
      "id": "volcengine/kimi-k2-thinking",
      "supportsImage": false
    },
    {
      "id": "volcengine/kimi-k2.5",
      "supportsImage": false
    }
  ],
  "xiaomi": [
    {
      "id": "xiaomi/mimo-v2-flash",
      "suggestedAlias": "mimo-flash",
      "supportsImage": false
    },
    {
      "id": "xiaomi/mimo-v2-omni",
      "suggestedAlias": "mimo-omni",
      "supportsImage": true
    },
    {
      "id": "xiaomi/mimo-v2-pro",
      "suggestedAlias": "mimo-pro",
      "supportsImage": false
    }
  ],
  "ollama": [
    {
      "id": "ollama/deepseek-r1:7b",
      "suggestedAlias": "ds-r1"
    },
    {
      "id": "ollama/llama3.2",
      "suggestedAlias": "llama"
    },
    {
      "id": "ollama/qwen3:8b",
      "suggestedAlias": "qwen"
    }
  ],
  "vllm": [],
  "custom": []
} as const;

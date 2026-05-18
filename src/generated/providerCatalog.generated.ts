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
      "suggestedAlias": "grok-3"
    },
    {
      "id": "xai/grok-3-fast",
      "suggestedAlias": "grok-3-fast"
    },
    {
      "id": "xai/grok-3-mini",
      "suggestedAlias": "grok-3-mini"
    },
    {
      "id": "xai/grok-3-mini-fast",
      "suggestedAlias": "g3-mini-fast"
    },
    {
      "id": "xai/grok-4",
      "suggestedAlias": "grok-4"
    },
    {
      "id": "xai/grok-4-0709",
      "suggestedAlias": "grok-4-0709"
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
      "suggestedAlias": "grok-code"
    }
  ],
  "mistral": [
    {
      "id": "mistral/codestral-latest",
      "suggestedAlias": "codestral"
    },
    {
      "id": "mistral/devstral-medium-latest",
      "suggestedAlias": "devstral"
    },
    {
      "id": "mistral/magistral-small",
      "suggestedAlias": "magistral"
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
      "id": "openrouter/anthropic/claude-sonnet-4-5",
      "suggestedAlias": "sonnet"
    },
    {
      "id": "openrouter/auto",
      "suggestedAlias": "auto"
    },
    {
      "id": "openrouter/healer-alpha",
      "suggestedAlias": "healer"
    },
    {
      "id": "openrouter/hunter-alpha",
      "suggestedAlias": "hunter"
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
      "id": "together/deepseek-ai/DeepSeek-R1",
      "suggestedAlias": "ds-r1"
    },
    {
      "id": "together/deepseek-ai/DeepSeek-V3.1",
      "suggestedAlias": "ds-v3.1"
    },
    {
      "id": "together/meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "suggestedAlias": "llama-3.3"
    },
    {
      "id": "together/meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
      "suggestedAlias": "llama-mav",
      "supportsImage": true
    },
    {
      "id": "together/meta-llama/Llama-4-Scout-17B-16E-Instruct",
      "suggestedAlias": "llama-scout",
      "supportsImage": true
    },
    {
      "id": "together/moonshotai/Kimi-K2-Instruct-0905",
      "suggestedAlias": "kimi-k2"
    },
    {
      "id": "together/moonshotai/Kimi-K2.5",
      "suggestedAlias": "kimi-k2.5",
      "supportsImage": true
    },
    {
      "id": "together/zai-org/GLM-4.7",
      "suggestedAlias": "glm-4.7"
    }
  ],
  "kilocode": [
    {
      "id": "kilocode/kilo/auto",
      "suggestedAlias": "kilo-auto"
    }
  ],
  "venice": [
    {
      "id": "venice/claude-opus-4-6",
      "suggestedAlias": "opus-4.6"
    },
    {
      "id": "venice/claude-sonnet-4-6",
      "suggestedAlias": "sonnet-4.6"
    },
    {
      "id": "venice/deepseek-v3.2",
      "suggestedAlias": "deepseek-v3.2"
    },
    {
      "id": "venice/gemini-3-pro-preview",
      "suggestedAlias": "gemini-3-pro"
    },
    {
      "id": "venice/grok-code-fast-1",
      "suggestedAlias": "grok-code"
    },
    {
      "id": "venice/kimi-k2-5",
      "suggestedAlias": "kimi-k2.5"
    },
    {
      "id": "venice/openai-gpt-54",
      "suggestedAlias": "gpt-5.4"
    },
    {
      "id": "venice/qwen3-5-35b-a3b",
      "suggestedAlias": "qwen3.5"
    },
    {
      "id": "venice/qwen3-vl-235b-a22b",
      "suggestedAlias": "qwen3-vl"
    }
  ],
  "huggingface": [
    {
      "id": "huggingface/deepseek-ai/DeepSeek-R1",
      "suggestedAlias": "deepseek-r1"
    },
    {
      "id": "huggingface/deepseek-ai/DeepSeek-V3.1",
      "suggestedAlias": "deepseek-v3.1"
    },
    {
      "id": "huggingface/meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "suggestedAlias": "llama-3.3"
    },
    {
      "id": "huggingface/openai/gpt-oss-120b",
      "suggestedAlias": "gpt-oss-120b"
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
      "id": "nvidia/minimaxai/minimax-m2.5",
      "suggestedAlias": "minimax-m2.5"
    },
    {
      "id": "nvidia/moonshotai/kimi-k2.5",
      "suggestedAlias": "kimi-k2.5"
    },
    {
      "id": "nvidia/nvidia/nemotron-3-super-120b-a12b",
      "suggestedAlias": "nemotron-super"
    },
    {
      "id": "nvidia/z-ai/glm5",
      "suggestedAlias": "glm-5"
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
      "suggestedAlias": "minimax-m27"
    },
    {
      "id": "minimax/MiniMax-M2.7-highspeed",
      "suggestedAlias": "minimax-fast"
    }
  ],
  "moonshot": [
    {
      "id": "moonshot/kimi-k2-thinking",
      "suggestedAlias": "kimi-thinking"
    },
    {
      "id": "moonshot/kimi-k2-thinking-turbo",
      "suggestedAlias": "kimi-think-t"
    },
    {
      "id": "moonshot/kimi-k2-turbo",
      "suggestedAlias": "kimi-turbo"
    },
    {
      "id": "moonshot/kimi-k2.5",
      "suggestedAlias": "kimi-k2.5",
      "supportsImage": true
    },
    {
      "id": "moonshot/kimi-k2.6",
      "suggestedAlias": "kimi-k2.6",
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
      "suggestedAlias": "deepseek-chat"
    },
    {
      "id": "deepseek/deepseek-reasoner",
      "suggestedAlias": "deepseek-r"
    }
  ],
  "siliconflow": [],
  "qianfan": [
    {
      "id": "qianfan/deepseek-v3.2",
      "suggestedAlias": "ds-v3"
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
      "suggestedAlias": "glm-4.7"
    },
    {
      "id": "qwen/glm-5",
      "suggestedAlias": "glm-5"
    },
    {
      "id": "qwen/kimi-k2.5",
      "suggestedAlias": "kimi-k2.5",
      "supportsImage": true
    },
    {
      "id": "qwen/MiniMax-M2.5",
      "suggestedAlias": "minimax-m2.5"
    },
    {
      "id": "qwen/qwen3-coder-next",
      "suggestedAlias": "qwen-coder-next"
    },
    {
      "id": "qwen/qwen3-coder-plus",
      "suggestedAlias": "qwen-coder-plus"
    },
    {
      "id": "qwen/qwen3-max-2026-01-23",
      "suggestedAlias": "qwen3-max"
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
      "id": "volcengine/doubao-seed-code-preview-251028",
      "suggestedAlias": "doubao-code",
      "supportsImage": true
    },
    {
      "id": "volcengine/moonshotai/kimi-k2.5",
      "suggestedAlias": "kimi-k2.5"
    },
    {
      "id": "volcengine/zai-org/glm-4.7",
      "suggestedAlias": "glm-4.7"
    }
  ],
  "xiaomi": [
    {
      "id": "xiaomi/mimo-v2-flash",
      "suggestedAlias": "mimo-flash"
    },
    {
      "id": "xiaomi/mimo-v2-omni",
      "suggestedAlias": "mimo-omni",
      "supportsImage": true
    },
    {
      "id": "xiaomi/mimo-v2-pro",
      "suggestedAlias": "mimo-pro"
    }
  ],
  "kimi-coding": [
    {
      "id": "kimi-coding/k2p5",
      "suggestedAlias": "kimi-code"
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

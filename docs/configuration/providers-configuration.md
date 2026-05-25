# Model Providers and Configuration Notes

[English](./providers-configuration.md) | [简体中文](./providers-configuration.zh-CN.md)

## Positioning

For the authoritative list of model providers, bundled catalog behavior, CLI onboarding, and `models.json` merge rules, always defer to the official OpenClaw documentation: [Model Providers](https://docs.openclaw.ai/concepts/model-providers). If this document and the official docs disagree, the official docs win.

This page focuses on the **OpenClaw Desktop** configuration experience:

- the provider templates defined in `providerTemplates.ts`
- region-sensitive endpoints for China and Global accounts
- the distinction between **general APIs** and **Coding Plan** endpoints
- Desktop UI limitations and the cases where JSON or CLI configuration is still safer

The implementation references below are useful when Desktop behavior needs to be reconciled with upstream OpenClaw:

- Moonshot: `extensions/moonshot/onboard.ts`, `docs/providers/moonshot.md`
- Z.AI: `extensions/zai/model-definitions.ts`, `docs/providers/zai.md`
- MiniMax: `extensions/minimax/model-definitions.ts`, `docs/providers/minimax.md`
- Model Studio: `extensions/modelstudio/model-definitions.ts`, `docs/providers/modelstudio.md`
- Volcengine / BytePlus: `src/agents/doubao-models.ts`, `src/agents/byteplus-models.ts`, `docs/providers/volcengine.md`
- Kimi Coding: `extensions/kimi-coding/provider-catalog.ts`, `extensions/kimi-coding/index.ts`
- environment variable registry: `src/plugins/bundled-provider-auth-env-vars.generated.ts`

If the template `baseUrl` does not match the region where your key was created, override `models.providers.<providerId>.baseUrl` explicitly.

Coding endpoints are frequently separate products from the general API. They may use:

- a different API key
- a different `baseUrl`
- a different provider id or model prefix

Do not assume keys are interchangeable between those two paths.

---

## 1. How Configuration Is Organized

Desktop follows the same high-level model as OpenClaw:

| Layer | Config Path | Purpose |
|------|------|------|
| Environment variables | `env.vars.<ENV_KEY>` | stores API keys and tokens without writing plaintext secrets into normal config fields |
| Provider endpoints | `models.providers.<providerId>` | stores `baseUrl`, `api`, and optional `models` |
| Default model registry | `agents.defaults.models` | maps `provider/model` ids to `{ alias?, params? }` |
| Auth profiles | `auth.profiles` | profile-style auth config such as `provider:profileName` |

Model id rule:

- the segment before the first `/` is the provider id
- `anthropic/claude-opus-4-6` belongs to `anthropic`
- `openrouter/anthropic/claude-sonnet-4-5` belongs to `openrouter`

Common `models.providers` fields:

- `baseUrl`: the provider root URL, sometimes with `/v1`, sometimes without it
- `api`: the protocol OpenClaw should use
- `models`: optional explicit model declarations or restrictions

Desktop JSON editing still follows the official quick rules:

- model refs are written as `provider/model`
- `agents.defaults.models` acts like an allowlist when present
- useful CLI commands include `openclaw onboard`, `openclaw models list`, and `openclaw models set <provider/model>`
- provider plugins may inject catalogs automatically, so many bundled providers only require auth plus model selection

---

## 2. The `api` Field

| Value | Meaning |
|------|------|
| `openai-completions` | OpenAI Chat Completions compatible API |
| `anthropic` | Anthropic Messages API |
| `anthropic-messages` | Anthropic-style message payloads used by providers such as MiniMax and Xiaomi MiMo |

---

## 3. API Key Rotation

Some providers support multiple keys, following the same priority rules documented by OpenClaw:

1. `OPENCLAW_LIVE_<PROVIDER>_KEY`
2. `<PROVIDER>_API_KEYS`
3. `<PROVIDER>_API_KEY`
4. numbered variables such as `<PROVIDER>_API_KEY_1`

Google-related providers may also accept `GOOGLE_API_KEY` as a fallback. Rotation is only used for rate-limit style failures such as `429`, quota, or resource exhaustion, not for general request errors.

---

## 4. Region-Sensitive Endpoints

Many providers operate separate **China** and **Global** consoles and API gateways. Keys from one side often do not work on the other.

Use these rules:

1. Identify where the key was created.
2. Match `baseUrl` to that region explicitly.
3. Prefer `openclaw onboard --auth-choice ...` when OpenClaw provides a region-aware onboarding path.
4. Treat "general API" and "Coding Plan" as separate products unless vendor docs explicitly say otherwise.

### 4.1 Common Region Mapping

| Provider | Scenario | China Base URL | Global Base URL | `api` |
|------|------|------|------|------|
| `moonshot` | Moonshot general API | `https://api.moonshot.cn/v1` | `https://api.moonshot.ai/v1` | `openai-completions` |
| `kimi` / `kimi-coding` | Kimi Coding | n/a | `https://api.kimi.com/coding/` | `anthropic-messages` |
| `zai` | GLM general API | `https://open.bigmodel.cn/api/paas/v4` | `https://api.z.ai/api/paas/v4` | `openai-completions` |
| `zai` | GLM Coding Plan | `https://open.bigmodel.cn/api/coding/paas/v4` | `https://api.z.ai/api/coding/paas/v4` | `openai-completions` |
| `minimax` | MiniMax API | `https://api.minimaxi.com/anthropic` | `https://api.minimax.io/anthropic` | `anthropic-messages` |
| `modelstudio` | Model Studio Coding | `https://coding.dashscope.aliyuncs.com/v1` | `https://coding-intl.dashscope.aliyuncs.com/v1` | `openai-completions` |
| `volcengine` | Volcengine general API | `https://ark.cn-beijing.volces.com/api/v3` | see BytePlus below | `openai-completions` |
| `volcengine-plan` | Volcengine Coding | `https://ark.cn-beijing.volces.com/api/coding/v3` | n/a | `openai-completions` |
| `byteplus` | BytePlus general API | n/a | `https://ark.ap-southeast.bytepluses.com/api/v3` | `openai-completions` |
| `byteplus-plan` | BytePlus Coding | n/a | `https://ark.ap-southeast.bytepluses.com/api/coding/v3` | `openai-completions` |

Notes:

- Kimi Coding is separate from Moonshot general API and uses `KIMI_API_KEY`, not `MOONSHOT_API_KEY`.
- Model Studio Coding uses `coding` or `coding-intl` DashScope domains. The Desktop template default `https://dashscope.aliyuncs.com/compatible-mode/v1` is the more general compatibility endpoint, not the same Coding path.
- BytePlus may not appear in the Desktop quick grid today even though OpenClaw supports it upstream.

### 4.2 Helpful CLI Auth Choices

| Provider | Typical `--auth-choice` Values |
|------|------|
| Moonshot | `moonshot-api-key`, `moonshot-api-key-cn` |
| Z.AI | `zai-cn`, `zai-global`, `zai-coding-cn`, `zai-coding-global` |
| Kimi Coding | `kimi-code-api-key` |
| Model Studio | `modelstudio-api-key`, `modelstudio-api-key-cn` |
| MiniMax OAuth | `minimax-portal` |
| Volcengine / BytePlus | `volcengine-api-key`, `byteplus-api-key` |

### 4.3 Providers Without a Dual-Domain Split

| Provider | Notes |
|------|------|
| DeepSeek | publicly documented around `https://api.deepseek.com/v1` |
| Qianfan | defaults to `https://qianfan.baidubce.com/v2` |
| Xiaomi MiMo | currently uses a single `https://api.xiaomimimo.com/anthropic` endpoint |

### 4.4 General API vs Coding Plan

This is one of the easiest places to misconfigure Desktop.

Common consequences:

1. API keys are not interchangeable.
2. The model prefix may change.
3. The environment variable name may change.

#### 4.4.1 Important pairings

| Product | Model Prefix | Auth Variable | Typical Endpoint | Notes |
|------|------|------|------|------|
| Moonshot general API | `moonshot/...` | `MOONSHOT_API_KEY` | `api.moonshot.ai` or `api.moonshot.cn` | separate from Kimi Coding |
| Kimi Coding | `kimi-coding/...` or `kimi/...` | `KIMI_API_KEY`, optional `KIMICODE_API_KEY` | `https://api.kimi.com/coding/` | do not reuse `MOONSHOT_API_KEY` |
| Z.AI general API | `zai/...` | `ZAI_API_KEY` | `/api/paas/v4` | general path |
| Z.AI Coding | `zai/...` | `ZAI_API_KEY` | `/api/coding/paas/v4` | often needs a distinct vendor-issued key |
| Model Studio Coding | `modelstudio/...` | `MODELSTUDIO_API_KEY` | `coding.dashscope.../v1` or `coding-intl.../v1` | distinct from the general DashScope compatibility path |
| MiniMax API | `minimax/...` | `MINIMAX_API_KEY` | `/anthropic` | general API route |
| MiniMax Coding | portal-driven | `MINIMAX_OAUTH_TOKEN`, sometimes `MINIMAX_CODE_PLAN_KEY` | OAuth-managed or coding-plan endpoints | separate auth flow |
| Volcengine general API | `volcengine/...` | `VOLCANO_ENGINE_API_KEY` | `/api/v3` | same key family, different path from coding |
| Volcengine Coding | `volcengine-plan/...` | `VOLCANO_ENGINE_API_KEY` | `/api/coding/v3` | coding route |
| BytePlus general API | `byteplus/...` | `BYTEPLUS_API_KEY` | `/api/v3` | global path |
| BytePlus Coding | `byteplus-plan/...` | `BYTEPLUS_API_KEY` | `/api/coding/v3` | coding route |

#### 4.4.2 Kimi Coding naming notes

Official docs use:

- provider: `kimi-coding`
- key: `KIMI_API_KEY`
- example model: `kimi-coding/k2p5`

OpenClaw internals may normalize `kimi`, `kimi-coding`, and `kimi-code` into the same logical provider. When in doubt, trust the output of `openclaw models list`.

---

## 5. Desktop Provider Overview

The following table reflects the provider ids visible in Desktop templates. When a region-specific override is required, override `baseUrl` explicitly rather than trusting the template default.

| id | Display Name | Main Auth Variable | Template Default Base URL | `api` |
|---|---|---|---|---|
| `anthropic` | Anthropic | `ANTHROPIC_API_KEY` | `https://api.anthropic.com/v1` | `anthropic` |
| `custom` | Custom | `OPENCLAW_CUSTOM_API_KEY` | custom | `openai-completions` |
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `openai-completions` |
| `github-copilot` | GitHub Copilot | `COPILOT_GITHUB_TOKEN` | vendor-defined | `openai-completions` |
| `google` | Google Gemini | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta` | `openai-completions` |
| `groq` | Groq | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` | `openai-completions` |
| `huggingface` | Hugging Face | `HF_TOKEN` | `https://api-inference.huggingface.co` | `openai-completions` |
| `kilocode` | KiloCode | `KILOCODE_API_KEY` | `https://api.kilo.ai/api/gateway/` | `openai-completions` |
| `litellm` | LiteLLM | `LITELLM_API_KEY` | `http://localhost:4000/v1` | `openai-completions` |
| `minimax` | MiniMax | `MINIMAX_API_KEY` | `https://api.minimax.io/anthropic` | `anthropic-messages` |
| `mistral` | Mistral AI | `MISTRAL_API_KEY` | `https://api.mistral.ai/v1` | `openai-completions` |
| `modelstudio` | Model Studio | `MODELSTUDIO_API_KEY` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `openai-completions` |
| `moonshot` | Kimi (Moonshot) | `MOONSHOT_API_KEY` | `https://api.moonshot.ai/v1` | `openai-completions` |
| `nvidia` | NVIDIA | `NVIDIA_API_KEY` | `https://integrate.api.nvidia.com/v1` | `openai-completions` |
| `ollama` | Ollama | `OLLAMA_API_KEY` | `http://localhost:11434` | `openai-completions` |
| `openai` | OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1` | `openai-completions` |
| `openrouter` | OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `openai-completions` |
| `qianfan` | Qianfan | `QIANFAN_API_KEY` | `https://qianfan.baidubce.com/v2` | `openai-completions` |
| `together` | Together AI | `TOGETHER_API_KEY` | `https://api.together.xyz/v1` | `openai-completions` |
| `vercel-ai-gateway` | Vercel AI Gateway | `AI_GATEWAY_API_KEY` | template unset | `openai-completions` |
| `venice` | Venice AI | `VENICE_API_KEY` | `https://api.venice.ai/api/v1` | `openai-completions` |
| `vllm` | vLLM | `VLLM_API_KEY` | custom | `openai-completions` |
| `volcengine` | Volcengine Doubao | `VOLCANO_ENGINE_API_KEY` | `https://ark.cn-beijing.volces.com/api/v3` | `openai-completions` |
| `xai` | xAI | `XAI_API_KEY` | `https://api.x.ai/v1` | `openai-completions` |
| `xiaomi` | Xiaomi MiMo | `XIAOMI_API_KEY` | `https://api.xiaomimimo.com/anthropic` | `anthropic-messages` |
| `zai` | Z.AI | `ZAI_API_KEY` | `https://open.bigmodel.cn/api/paas/v4` | `openai-completions` |

Notes:

- Template `authModes` such as `api_key`, `token`, and `oauth` are UI hints only.
- Coding-specific providers such as Kimi Coding, BytePlus, or `volcengine-plan` may still require JSON or CLI workflows because they are not all exposed in the Desktop quick grid.

### 5.1 Built-in Providers That May Not Be in the Desktop Quick Grid

OpenClaw also supports providers that may not appear in Desktop templates, such as:

- `openai-codex`
- `opencode`
- `google-vertex`
- `google-gemini-cli`
- `qwen-portal`
- `cerebras`
- `cloudflare-ai-gateway`
- `synthetic`
- `sglang`
- `kimi-coding`
- `minimax-portal`

Check the official OpenClaw provider docs before relying on those in Desktop.

---

## 6. Provider Notes by Category

### 6.1 Global and General-Cloud Providers

- **Anthropic**: uses `ANTHROPIC_API_KEY`, with model refs such as `anthropic/claude-opus-4-6`
- **OpenAI**: uses `OPENAI_API_KEY`
- **Google Gemini**: uses `GEMINI_API_KEY`
- **xAI**: uses `XAI_API_KEY`
- **Mistral**: uses `MISTRAL_API_KEY`
- **OpenRouter**: uses `OPENROUTER_API_KEY`
- **Groq**: uses `GROQ_API_KEY`
- **Together**: uses `TOGETHER_API_KEY`
- **KiloCode**: uses `KILOCODE_API_KEY`
- **Venice**: uses `VENICE_API_KEY`
- **Hugging Face**: uses `HF_TOKEN`
- **NVIDIA**: uses `NVIDIA_API_KEY`
- **GitHub Copilot**: prefers `COPILOT_GITHUB_TOKEN`
- **LiteLLM**: points to a local or self-hosted `http://localhost:4000/v1`
- **Vercel AI Gateway**: uses `AI_GATEWAY_API_KEY` and may require explicit `baseUrl`

### 6.2 Region-Sensitive Providers

- **Moonshot**:
  - `MOONSHOT_API_KEY`
  - China: `https://api.moonshot.cn/v1`
  - Global: `https://api.moonshot.ai/v1`
- **Kimi Coding**:
  - `KIMI_API_KEY` or `KIMICODE_API_KEY`
  - `https://api.kimi.com/coding/`
  - do not mix with Moonshot general keys
- **Z.AI**:
  - `ZAI_API_KEY`
  - general path and coding path are different
- **MiniMax**:
  - general API often uses `MINIMAX_API_KEY`
  - coding or portal auth may use OAuth and `MINIMAX_CODE_PLAN_KEY`
- **Model Studio**:
  - `MODELSTUDIO_API_KEY`
  - Coding endpoints use `coding.dashscope.../v1` or `coding-intl.../v1`
- **Volcengine / BytePlus**:
  - region and coding path selection matter more than the Desktop quick template suggests
- **DeepSeek**, **Qianfan**, and **Xiaomi MiMo**:
  - fewer region-specific branches are documented, but vendor docs still take priority

### 6.3 Local and Self-Hosted Providers

- **Ollama**:
  - optional `OLLAMA_API_KEY`
  - default `http://localhost:11434`
- **vLLM**:
  - requires explicit `baseUrl`
  - model ids look like `vllm/<model-name>`
- **Custom**:
  - uses `OPENCLAW_CUSTOM_API_KEY`
  - requires explicit `baseUrl`
  - useful for arbitrary OpenAI-compatible or Anthropic-compatible gateways

---

## 7. Minimal JSON Examples

### 7.1 DeepSeek

```json
{
  "env": {
    "vars": {
      "DEEPSEEK_API_KEY": "sk-..."
    }
  },
  "models": {
    "providers": {
      "deepseek": {
        "baseUrl": "https://api.deepseek.com/v1",
        "api": "openai-completions"
      }
    }
  },
  "agents": {
    "defaults": {
      "models": {
        "deepseek/deepseek-chat": { "alias": "ds" }
      },
      "model": {
        "primary": "deepseek/deepseek-chat"
      }
    }
  }
}
```

### 7.2 Moonshot China

```json
{
  "env": {
    "vars": {
      "MOONSHOT_API_KEY": "sk-..."
    }
  },
  "models": {
    "providers": {
      "moonshot": {
        "baseUrl": "https://api.moonshot.cn/v1",
        "api": "openai-completions"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "moonshot/kimi-k2.5" }
    }
  }
}
```

Switch `baseUrl` to `https://api.moonshot.ai/v1` for the global route.

### 7.3 Kimi Coding

If you follow the official pattern, you can often set the environment variable plus the default model and let the plugin inject the catalog:

```json
{
  "env": {
    "vars": {
      "KIMI_API_KEY": "sk-..."
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "kimi-coding/k2p5" }
    }
  }
}
```

If you need to override endpoint details explicitly:

```json
{
  "env": {
    "vars": {
      "KIMI_API_KEY": "sk-..."
    }
  },
  "models": {
    "providers": {
      "kimi": {
        "baseUrl": "https://api.kimi.com/coding/",
        "api": "anthropic-messages"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "kimi/kimi-code" },
      "models": {
        "kimi/kimi-code": { "alias": "Kimi Code" }
      }
    }
  }
}
```

---

## 8. Desktop UI Behavior Summary

- Connection test usually tries `GET /models` first.
- If the provider returns `404` for that path, Desktop may fall back to a minimal `POST /chat/completions` probe.
- The quick provider list focuses on popular templates and may not expose every upstream provider.
- Region-aware and Coding-aware combinations are still easier to configure through JSON or the OpenClaw CLI in some cases.

---

## 9. Suggested Provider-Page Redesign

To reduce mistakes around wrong keys and wrong endpoints, the Desktop provider page should make three choices explicit for every setup flow:

- provider
- region (`China`, `Global`, or `Auto`)
- plan (`General API`, `Coding Plan`, or `OAuth Portal`)

Recommended direction:

1. split the UI into clear tabs such as **Recommended**, **China**, **Global**, and **Coding**
2. make users choose region and plan before entering the key
3. show a read-only preview of the exact config that will be written
4. warn when the chosen key type and endpoint do not match the expected entry

This approach should reduce 401, 404, and "model not visible" failures caused by mixing the wrong endpoint with the wrong credential.

---

## 10. Related Documents

- Official OpenClaw docs: [Model Providers](https://docs.openclaw.ai/concepts/model-providers), [Models](https://docs.openclaw.ai/concepts/models), [Gateway Configuration](https://docs.openclaw.ai/gateway/configuration)
- Provider-specific official pages such as [Moonshot](https://docs.openclaw.ai/providers/moonshot), [Z.AI](https://docs.openclaw.ai/providers/zai), [MiniMax](https://docs.openclaw.ai/providers/minimax), and [Model Studio](https://docs.openclaw.ai/providers/modelstudio)
- Desktop build and release docs: [Configuration, Build, and Release](../build-release/config-build-release.md)
- Docs overview: [Docs README](../README.md)

# 模型提供方与配置说明

## 文档定位（与官方对照）

OpenClaw 对「模型提供方」的**完整清单、内置目录行为、CLI 与 `models.json` 合并规则**等，以官方文档 **[Model Providers](https://docs.openclaw.ai/concepts/model-providers)** 为准（与上游仓库 `docs/concepts/model-providers.md` 同源发布）。**若本文与官方页冲突，以官方页为准。**

本文侧重 **OpenClaw Desktop** 配置管理器：`providerTemplates.ts` 中的模板、**国内/国际双 endpoint**、**Coding Plan 与普通 API 的密钥与路径**，以及 Desktop UI 的局限；属于官方概念的**补充说明**，不替代官方索引。

---

本文描述 Desktop 所覆盖的 **LLM 提供方** 及其在 `openclaw.json`（或等价配置）中的字段含义与示例。Desktop 模板与 UI 默认值以 `src/pages/ConfigManager/providerTemplates.ts` 为准；**跨境端点、CLI、`models.providers` 与插件目录合并**等与 OpenClaw 一致的部分，以下列 **OpenClaw 源码**为实施参考：

- Moonshot：`extensions/moonshot/onboard.ts`、`docs/providers/moonshot.md`
- Z.AI：`extensions/zai/model-definitions.ts`、`docs/providers/zai.md`
- MiniMax：`extensions/minimax/model-definitions.ts`、`docs/providers/minimax.md`
- Model Studio：`extensions/modelstudio/model-definitions.ts`、`docs/providers/modelstudio.md`
- 火山 / BytePlus：`src/agents/doubao-models.ts`、`src/agents/byteplus-models.ts`、`docs/providers/volcengine.md`、`docs/concepts/model-providers.md`
- Kimi Coding：`extensions/kimi-coding/provider-catalog.ts`、`extensions/kimi-coding/index.ts`（与 Moonshot 开放平台区分）
- 各厂商 **环境变量名** 汇总：`src/plugins/bundled-provider-auth-env-vars.generated.ts`；MiniMax 额外密钥：`src/secrets/provider-env-vars.ts`（`MINIMAX_CODE_PLAN_KEY`）

若模板中的默认 `baseUrl` 与你的账号区域不一致，**必须以控制台发放的密钥所对应的区域为准**，并在 `models.providers.<providerId>.baseUrl` 中显式覆盖。

**Coding Plan / 编码套餐** 常与「普通 API」并存：不仅 **Base URL 路径不同**，控制台侧也往往是 **另一套订阅与 API Key**（见 **§4.4**）。不要把开放平台 Key 填进 Coding 端点，反之亦然。

---

## 1. 配置如何组织

Desktop 将「凭证 + 端点 + 模型别名」拆成几块，和 OpenClaw 官方指引一致：

| 层级 | 配置路径 | 作用 |
|------|----------|------|
| 环境变量（推荐存密钥） | `env.vars.<ENV_KEY>` | API Key / Token；带 `envKey` 的提供方不会在 UI 里把明文密钥写进普通配置字段 |
| 模型端点 | `models.providers.<providerId>` | `baseUrl`、`api`（协议）、可选 `models` 列表 |
| 智能体默认模型表 | `agents.defaults.models` | 模型 ID → `{ alias?, params? }`；模型 ID 形如 `provider/model-name` |
| 认证配置（部分场景） | `auth.profiles` | 形如 `provider:profileName` 的配置档；UI 会与上述来源合并展示 |

**模型 ID 规则**：取第一个 `/` 之前的段作为提供方 ID。例如 `anthropic/claude-opus-4-6` → 提供方为 `anthropic`；`openrouter/anthropic/claude-sonnet-4-5` → 提供方为 `openrouter`。

**`models.providers` 常用字段**（与 `src/pages/ConfigManager/types.ts` 一致）：

- `baseUrl`：OpenAI 兼容或厂商要求的 API 根路径（是否含 `/v1` 以各提供方为准）。
- `api`：OpenClaw 使用的协议，常见取值见下节。
- `models`：可选；`{ id, name? }[]`，用于声明或限制可用模型。

下列规则与官方 [Model Providers](https://docs.openclaw.ai/concepts/model-providers) **Quick rules** 一致，Desktop 编辑 JSON 时同样适用：

- 模型引用格式为 **`provider/model`**（例如 `openai/gpt-5.4`、`zai/glm-5`；具体示例版本以官方文档为准）。
- 若配置 **`agents.defaults.models`**，则形成 **allowlist**（官方说明同上页）。
- CLI：`openclaw onboard`、`openclaw models list`、`openclaw models set <provider/model>`。
- 捆绑的 **provider 插件**可通过 `registerProvider({ catalog })` 注入目录；OpenClaw 会合并进 **`models.providers`** 并写入 **`models.json`**（见官方页 *Plugin-owned provider behavior*）。许多内置提供方只需 **设置鉴权 + 选模型**，不必手写完整 `models.providers` 块。

---

## 2. `api` 协议字段说明

| 值 | 含义 |
|----|------|
| `openai-completions` | OpenAI Chat Completions 兼容（多数云与网关） |
| `anthropic` | Anthropic Messages API（部分端点） |
| `anthropic-messages` | Anthropic Messages 格式（如 MiniMax、小米 MiMo 等） |

---

## 3. API 密钥轮换（OpenClaw 通用）

与官方 [Model Providers — API key rotation](https://docs.openclaw.ai/concepts/model-providers) 一致，部分提供方支持多 Key 配置（优先级从高到低，去重后使用）：

- `OPENCLAW_LIVE_<PROVIDER>_KEY`：单 Key 覆盖，**最高优先级**（`<PROVIDER>` 为厂商约定的大写片段，见官方说明）。
- `<PROVIDER>_API_KEYS`：逗号或分号分隔列表。
- `<PROVIDER>_API_KEY`：主 Key。
- `<PROVIDER>_API_KEY_1`、`…_2` 等编号变量。

Google 相关另支持 `GOOGLE_API_KEY` 作为后备。**仅在限流类响应**（如 `429`、`rate_limit`、`quota`、`resource exhausted`）时会换 Key 重试；非限流错误不会轮换。详见官方页。

---

## 4. 国内与国际端点（配置必读）

许多厂商同时运营 **中国（大陆）** 与 **国际** 两套控制台与 API 网关：**API Key 通常不能混用**（在一侧申请的密钥只对该侧 endpoint 有效）。下列原则是跨境用户最容易踩坑的地方：

1. **先确定账号与密钥来源**：在「国内控制台」还是「国际控制台」创建的 Key，就使用同一区域的 `baseUrl`。
2. **在配置里显式写对 `baseUrl`**：Desktop 模板往往只填了一侧默认值（多为国际或某一侧）；若你的 Key 来自另一侧，必须在 `models.providers.<id>` 中覆盖 `baseUrl`，或直接编辑 JSON。
3. **OpenClaw CLI**：对已支持分区向导的提供方，可用 `openclaw onboard --auth-choice <选项>` 自动写入正确 `baseUrl`（见各小节表格）；完成后再用 Desktop 管理亦可。
4. **同一厂商多条产品线**：例如 Kimi「开放平台」与「Kimi Coding」是不同 **环境变量**（`MOONSHOT_API_KEY` vs `KIMI_API_KEY`）、不同 **Base URL**（§4.4.1）；勿与本节「国内/国际同一产品线的双 endpoint」混淆。完整对照见 **§4.4**。

### 4.1 对照总表（OpenClaw 与源码一致）

| 提供方 `id` | 场景 | 中国大陆 / 国内常用 Base URL | 国际常用 Base URL | `api`（Anthropic 系见右） |
|-------------|------|------------------------------|-------------------|---------------------------|
| `moonshot` | Kimi 开放平台（OpenAI 兼容） | `https://api.moonshot.cn/v1` | `https://api.moonshot.ai/v1` | `openai-completions` |
| `kimi` / `kimi-coding` | Kimi **Coding 专线**（独立于开放平台） | — | `https://api.kimi.com/coding/` | `anthropic-messages` |
| `zai` | GLM 通用 API | `https://open.bigmodel.cn/api/paas/v4` | `https://api.z.ai/api/paas/v4` | `openai-completions` |
| `zai` | GLM **Coding Plan**（路径含 `coding`） | `https://open.bigmodel.cn/api/coding/paas/v4` | `https://api.z.ai/api/coding/paas/v4` | `openai-completions` |
| `minimax` | M2.5 等（Anthropic 兼容路径） | `https://api.minimaxi.com/anthropic` | `https://api.minimax.io/anthropic` | `anthropic-messages` |
| `modelstudio` | 阿里云 **Model Studio（Coding 专线）** | `https://coding.dashscope.aliyuncs.com/v1` | `https://coding-intl.dashscope.aliyuncs.com/v1` | `openai-completions` |
| `volcengine` | 火山方舟 **通用** | `https://ark.cn-beijing.volces.com/api/v3` | （境外常用 BytePlus，见下） | `openai-completions` |
| `volcengine-plan` | 火山方舟 **Coding** | `https://ark.cn-beijing.volces.com/api/coding/v3` | — | `openai-completions` |
| `byteplus` | BytePlus ARK **通用**（国际） | — | `https://ark.ap-southeast.bytepluses.com/api/v3` | `openai-completions` |
| `byteplus-plan` | BytePlus ARK **Coding** | — | `https://ark.ap-southeast.bytepluses.com/api/coding/v3` | `openai-completions` |

说明：

- **Kimi Coding**：`api.kimi.com/coding/` 与 Moonshot 开放平台完全独立，**不区分** CN/Global，但使用不同密钥（`KIMI_API_KEY`）。详见 §4.4.3。
- **Model Studio**：OpenClaw 插件里 **Global = `coding-intl` 域名**，**CN = `coding` 域名**（见 `extensions/modelstudio/model-definitions.ts`）。这与「新加坡/非大陆」和「中国大陆」线路划分一致，**不要**与控制台里其它 DashScope 入口混淆。
- **Desktop 模板里的 `modelstudio` 默认 `baseUrl`** 为 `https://dashscope.aliyuncs.com/compatible-mode/v1`，属于 **百炼 OpenAI 兼容模式** 的常见写法；与上表 **Coding 专线** 不是同一条 URL。若你使用的是 Coding Plan 专用 Key，请改用上表中 `coding` / `coding-intl` 的 `v1` Base URL。
- **`byteplus` / `byteplus-plan`**：当前 **未**出现在 Desktop 的 `PROVIDER_TEMPLATES` 列表中，但 OpenClaw 已内置；海外用户若使用火山同源能力，通常走 BytePlus 与 `BYTEPLUS_API_KEY`（见 `docs/concepts/model-providers.md`）。

### 4.2 OpenClaw CLI 分区选项（可自动写入 `baseUrl`）

| 提供方 | 常用 `--auth-choice`（节选） |
|--------|------------------------------|
| Moonshot / Kimi | `moonshot-api-key`（国际），`moonshot-api-key-cn`（中国） |
| Z.AI | `zai-cn`、`zai-global`、`zai-coding-cn`、`zai-coding-global` |
| Kimi Coding | `kimi-code-api-key` |
| Model Studio | `modelstudio-api-key`（Global / `coding-intl`）、`modelstudio-api-key-cn`（CN / `coding`） |
| MiniMax OAuth | `minimax-portal`（交互选择 Global / CN） |
| 火山引擎 / BytePlus | `volcengine-api-key`、`byteplus-api-key` |

更多见各厂商的 `docs/providers/*.md`。

### 4.3 无「双域名」或以单一入口为主的提供方

| 提供方 | 说明 |
|--------|------|
| **DeepSeek** | 公开文档以 `https://api.deepseek.com/v1` 为统一 OpenAI 兼容入口；未发现与上述类似的「成对国内/国际根域名」文档分支。 |
| **百度千帆 `qianfan`** | OpenClaw 默认 `https://qianfan.baidubce.com/v2`；控制台与文档以境内为主，海外用户需自行确认网络可达性与账号范围。 |
| **小米 `xiaomi`** | OpenClaw 当前为单一 `https://api.xiaomimimo.com/anthropic`；若厂商后续分区，以官方文档为准更新。 |

### 4.4 Coding Plan 与通用 API：密钥、Provider、端点

多数厂商把 **Coding Plan（编码套餐 / 面向 IDE 与 Agent 的专线）** 与 **普通开放平台 API** 拆成不同产品。典型后果：

1. **API Key 往往不能混用**：在 Coding 控制台申请的 Key，通常只能访问 Coding 的 `baseUrl`；开放平台 Key 不能拿去调 Coding 域名（反之亦然，除非厂商文档明确「一把 Key 两用」）。
2. **OpenClaw 可能用不同 `provider` / 模型前缀**：例如 Kimi 开放平台是 `moonshot/...`，Kimi Coding 在官方文档中为 **`kimi-coding/...`**（见下表与 §4.4.3）。
3. **环境变量名不一定相同**：OpenClaw 按插件 manifest 与 `bundled-provider-auth-env-vars` 解析；下表为源码中的 **常用变量名**（顺序有意义时取第一个非空）。

#### 4.4.1 对照表（OpenClaw 内置行为）

| 场景 | 模型 / Provider 前缀（典型） | 环境变量（OpenClaw 识别） | Base URL / 路径特征 | 与普通 API 关系 |
|------|------------------------------|---------------------------|---------------------|-----------------|
| **Kimi 开放平台**（OpenAI 兼容） | `moonshot/...` | `MOONSHOT_API_KEY` | `https://api.moonshot.ai/v1` 或 `https://api.moonshot.cn/v1`（§4.1） | **独立**于 Kimi Coding |
| **Kimi Coding**（专用编码线） | 官方文档：**`kimi-coding`**（示例模型 **`kimi-coding/k2p5`**）；运行时会将 `kimi` / `kimi-coding` / `kimi-code` **规范到同一逻辑 provider**（`src/agents/provider-id.ts`） | **`KIMI_API_KEY`**，备选 **`KIMICODE_API_KEY`** | **`https://api.kimi.com/coding/`**，Anthropic 兼容；目录中 `api` 为 **`anthropic-messages`** | **禁止**使用 `MOONSHOT_API_KEY`；与官方 [Model Providers — Kimi Coding](https://docs.openclaw.ai/concepts/model-providers) 一致 |
| **智谱 GLM 通用** | `zai/...` | `ZAI_API_KEY`，备选 `Z_AI_API_KEY` | `.../api/paas/v4`（§4.1） | 与 Coding 路径不同 |
| **智谱 GLM Coding Plan** | `zai/...`（同一前缀，**必须**配 Coding 的 `baseUrl`） | **同上变量名**；控制台常为 **另一张 Key** | `.../api/coding/paas/v4`（§4.1） | 厂商侧多为 **独立密钥**；配置里仍写入 `ZAI_API_KEY`，但值应对应 Coding 产品 |
| **阿里云 Model Studio（Coding 订阅）** | `modelstudio/...` | **`MODELSTUDIO_API_KEY`**（插件文案为 *Coding Plan API Key*） | `https://coding.dashscope.aliyuncs.com/v1` 或 `https://coding-intl.dashscope.aliyuncs.com/v1` | 与 **百炼通用兼容模式**（常见 `DASHSCOPE_API_KEY` + `dashscope.aliyuncs.com/compatible-mode/v1` 或 `dashscope-intl...`）**不是同一条产品线**；Desktop 模板里 `modelstudio` 的兼容模式 URL 更接近后者 |
| **MiniMax API Key（Anthropic 兼容）** | `minimax/...` | `MINIMAX_API_KEY` | `.../anthropic`（§4.1） | 面向文档中的 API Key 接入 |
| **MiniMax Coding Plan（OAuth）** | 由插件解析（`minimax-portal`） | `MINIMAX_OAUTH_TOKEN`、`MINIMAX_API_KEY`（见 manifest） | OAuth 返回的资源 URL | `extensions/minimax/README.md`：**OAuth 当前面向 Coding Plan** |
| **MiniMax Coding Plan 用量 / 部分能力** | 实现细节（非单独聊天 provider） | **`MINIMAX_CODE_PLAN_KEY`**；与 `MINIMAX_API_KEY` 并存时，部分探测 **优先** Coding Plan Key（`src/infra/provider-usage.auth.ts`） | 如 `.../coding_plan/...` 类接口 | 可与 `MINIMAX_API_KEY` 同时配置；用途以 OpenClaw 实现为准 |
| **火山方舟 通用** | `volcengine/...` | **`VOLCANO_ENGINE_API_KEY`** | `.../api/v3` | 与 Coding **共用同一 Key**，**不同 path** |
| **火山方舟 Coding** | `volcengine-plan/...` | **同上** | `.../api/coding/v3` | `onboard` 常同时注册两 provider |
| **BytePlus 通用** | `byteplus/...` | **`BYTEPLUS_API_KEY`** | `.../api/v3` | 与 Coding **共用同一 Key**，**不同 path** |
| **BytePlus Coding** | `byteplus-plan/...` | **同上** | `.../api/coding/v3` | 同上 |

#### 4.4.2 CLI 入口（避免手写错 `baseUrl` / 密钥类型）

| 场景 | 示例 `openclaw onboard --auth-choice` |
|------|----------------------------------------|
| 智谱 Coding / 通用 × 国内国际 | `zai-coding-cn`、`zai-coding-global`、`zai-cn`、`zai-global`（见 `docs/providers/glm.md`） |
| Model Studio Coding × 区域 | `modelstudio-api-key-cn`、`modelstudio-api-key`（Global / intl） |
| Kimi Coding 专用 Key | `kimi-code-api-key`（`extensions/kimi-coding/openclaw.plugin.json`） |
| MiniMax OAuth Coding | 插件启用后：`openclaw models auth login --provider minimax-portal`（见 `extensions/minimax/README.md`） |

#### 4.4.3 Kimi Coding：`kimi-coding` 与 `kimi` 的关系

官方文档（[Model Providers](https://docs.openclaw.ai/concepts/model-providers) 中 *Kimi Coding* 小节）写法为：

- **Provider**：`kimi-coding`
- **鉴权**：`KIMI_API_KEY`
- **示例模型**：`kimi-coding/k2p5`

OpenClaw 实现中，插件注册的主 id 为 **`kimi`**（别名含 `kimi-coding`、`kimi-code`）；**`models.providers` 可使用键名 `kimi` 或遗留键名 `kimi-coding`**（见 `src/agents/models-config.providers.kimi-coding.test.ts`）。默认目录中还有模型 id **`kimi-code`**（及 legacy **`k2p5`**），故模型引用也可能是 **`kimi/kimi-code`** 或 **`kimi/k2p5`**。**以本机 `openclaw models list` 输出为准**；若要与官方示例逐字一致，使用 **`kimi-coding/k2p5`** 即可。

---

## 5. 提供方总览

以下按 **Desktop 模板中的 `id`** 字母序排列（`custom` 见文末）。「预设 Base URL」来自 **Desktop 模板**；若与 §4 中 OpenClaw 推荐分区不一致，**以你的密钥区域与 §4 为准**覆盖 `baseUrl`。**vLLM / Custom / LiteLLM** 等需你自行填写或改为本机地址。

| id | 显示名称 | 主要环境变量 | 预设 Base URL（Desktop 模板） | api |
|----|----------|--------------|-------------------------------|-----|
| `anthropic` | Anthropic | `ANTHROPIC_API_KEY`（可选 `ANTHROPIC_OAUTH_TOKEN`） | `https://api.anthropic.com/v1` | `anthropic` |
| `custom` | Custom | `OPENCLAW_CUSTOM_API_KEY` | （必填，自定） | `openai-completions` |
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `openai-completions` |
| `github-copilot` | GitHub Copilot | `COPILOT_GITHUB_TOKEN`（备选 `GH_TOKEN`、`GITHUB_TOKEN`） | （见厂商） | `openai-completions` |
| `google` | Google Gemini | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta` | `openai-completions` |
| `groq` | Groq | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` | `openai-completions` |
| `huggingface` | Hugging Face | `HF_TOKEN`（可选 `HUGGINGFACE_HUB_TOKEN`） | `https://api-inference.huggingface.co` | `openai-completions` |
| `kilocode` | KiloCode | `KILOCODE_API_KEY` | `https://api.kilo.ai/api/gateway/` | `openai-completions` |
| `litellm` | LiteLLM | `LITELLM_API_KEY` | `http://localhost:4000/v1` | `openai-completions` |
| `minimax` | MiniMax | `MINIMAX_API_KEY` | `https://api.minimax.io/anthropic` | `anthropic-messages` |
| `mistral` | Mistral AI | `MISTRAL_API_KEY` | `https://api.mistral.ai/v1` | `openai-completions` |
| `modelstudio` | 阿里云百炼 (Model Studio) | `MODELSTUDIO_API_KEY` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `openai-completions` |
| `moonshot` | Kimi (Moonshot) | `MOONSHOT_API_KEY` | `https://api.moonshot.ai/v1` | `openai-completions` |
| `nvidia` | NVIDIA | `NVIDIA_API_KEY` | `https://integrate.api.nvidia.com/v1` | `openai-completions` |
| `ollama` | Ollama | `OLLAMA_API_KEY`（可选） | `http://localhost:11434` | `openai-completions` |
| `openai` | OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1` | `openai-completions` |
| `openrouter` | OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `openai-completions` |
| `qianfan` | 百度千帆 (Qianfan) | `QIANFAN_API_KEY` | `https://qianfan.baidubce.com/v2` | `openai-completions` |
| `together` | Together AI | `TOGETHER_API_KEY` | `https://api.together.xyz/v1` | `openai-completions` |
| `vercel-ai-gateway` | Vercel AI Gateway | `AI_GATEWAY_API_KEY` | （模板未写死；OpenClaw 常用 `https://ai-gateway.vercel.sh`） | `openai-completions` |
| `venice` | Venice AI | `VENICE_API_KEY` | `https://api.venice.ai/api/v1` | `openai-completions` |
| `vllm` | vLLM | `VLLM_API_KEY` | （必填，自定） | `openai-completions` |
| `volcengine` | 火山引擎豆包 | `VOLCANO_ENGINE_API_KEY` | `https://ark.cn-beijing.volces.com/api/v3` | `openai-completions` |
| `xai` | xAI (Grok) | `XAI_API_KEY` | `https://api.x.ai/v1` | `openai-completions` |
| `xiaomi` | Xiaomi MiMo | `XIAOMI_API_KEY` | `https://api.xiaomimimo.com/anthropic` | `anthropic-messages` |
| `zai` | Z.AI (智谱 GLM) | `ZAI_API_KEY` | `https://open.bigmodel.cn/api/paas/v4` | `openai-completions` |

**认证方式（`authModes`）**：模板中的 `api_key`、`token`、`oauth` 仅表示 UI/向导层面的典型方式；实际仍以环境变量与 OpenClaw 鉴权逻辑为准。

**Coding Plan / 专用编码线**：上表仅列 Desktop 模板里的 `id`。**Kimi Coding**（`kimi-coding`，`KIMI_API_KEY`）、**BytePlus**（`BYTEPLUS_API_KEY`）、**volcengine-plan** / **byteplus-plan** 等见 **§4.4**；`modelstudio` 一行若为 **Coding Plan Key**，请配合 §4.1 的 `coding*.dashscope` URL，而非仅依赖模板中的兼容模式默认 URL。

### 5.1 OpenClaw 内置、Desktop 模板未覆盖的提供方（摘自官方清单）

下列条目在官方 [Model Providers — Other bundled provider plugins / Built-in](https://docs.openclaw.ai/concepts/model-providers) 中有说明，但 **不在** Desktop `PROVIDER_TEMPLATES` 快捷网格中；需在 JSON 中配置、使用 CLI `onboard` / `models auth`，或等待 Desktop 扩展模板。

| Provider（官方） | 鉴权（摘要） | 备注 |
|------------------|--------------|------|
| `openai-codex` | OAuth（ChatGPT） | 与 `openai` 并列，由捆绑 `openai` 插件提供 |
| `opencode` / `opencode-go` | `OPENCODE_API_KEY`（或 `OPENCODE_ZEN_API_KEY`） | Zen / Go 两运行时 |
| `google-vertex` | gcloud ADC | 与 API Key 版 `google` 不同 |
| `google-gemini-cli` | OAuth（Gemini CLI） | 非官方集成风险提示见官方页 |
| `qwen-portal` | OAuth / `QWEN_PORTAL_API_KEY` | 设备码登录等 |
| `cerebras` | `CEREBRAS_API_KEY` | GLM 等模型 id 见官方 |
| `cloudflare-ai-gateway` | `CLOUDFLARE_AI_GATEWAY_API_KEY` | |
| `synthetic` | `SYNTHETIC_API_KEY` | Anthropic 兼容端点 |
| `sglang` | `SGLANG_API_KEY`（可选，视部署） | 默认本机端口见官方 |
| `kimi-coding` | `KIMI_API_KEY` / `KIMICODE_API_KEY` | 与 `moonshot` 分离，见 §4.4 |
| `minimax-portal` | OAuth（`MINIMAX_OAUTH_TOKEN` 等） | Coding Plan 向导，见 §4.4 |

官方页还列有 **DeepSeek、Groq、Mistral** 等与 Desktop 重叠的提供方；示例模型名（如 `gpt-5.4`、`gemini-3.1-*`）会随上游更新，**以官方页为准**。

---

## 6. 分提供方说明（字段与示例）

下列「推荐模型 ID」来自各模板 `popularModels`；未列出的提供方可自行在 `agents.defaults.models` 中添加 `provider/模型名`。  
**国内/国际双 endpoint** 见 **§4.1–§4.3**；**Coding Plan 与普通 API 的密钥与路径** 见 **§4.4**。官方文档中的 **示例模型版本**（如 `gpt-5.4`、`gemini-3.1-*`）更新较快，**以 [Model Providers](https://docs.openclaw.ai/concepts/model-providers) 为准**；本节示例仍可能保留 Desktop 模板中的较旧 id。此处仅作摘要。

### 6.1 国际与通用云

**Anthropic** (`anthropic`)  
- 环境变量：`ANTHROPIC_API_KEY`；另支持 `ANTHROPIC_OAUTH_TOKEN`。  
- 示例模型：`anthropic/claude-opus-4-6`、`anthropic/claude-sonnet-4-6`、`anthropic/claude-haiku-3.5`。

**OpenAI** (`openai`)  
- 环境变量：`OPENAI_API_KEY`。  
- 示例模型：`openai/gpt-4o`、`openai/gpt-4o-mini`。

**Google Gemini** (`google`)  
- 环境变量：`GEMINI_API_KEY`。  
- 示例模型：`google/gemini-3-pro-preview`、`google/gemini-3-flash-preview`。

**xAI** (`xai`)  
- 环境变量：`XAI_API_KEY`。  
- 示例模型：`xai/grok-3`。

**Mistral** (`mistral`)  
- 环境变量：`MISTRAL_API_KEY`。  
- 示例模型：`mistral/mistral-large-latest`、`mistral/codestral-latest`。

**OpenRouter** (`openrouter`)  
- 环境变量：`OPENROUTER_API_KEY`。  
- 示例模型：`openrouter/anthropic/claude-sonnet-4-5`（OpenRouter 侧完整路径）。

**Groq** (`groq`)  
- 环境变量：`GROQ_API_KEY`。  
- 示例模型：`groq/llama-3.3-70b-versatile`。

**Together** (`together`)  
- 环境变量：`TOGETHER_API_KEY`。  
- 示例模型：`together/meta-llama/Llama-3.3-70B-Instruct-Turbo`。

**KiloCode** (`kilocode`)  
- 环境变量：`KILOCODE_API_KEY`。  
- 模板未预置热门模型 ID，请在网关文档或 `/models` 中选用。

**Venice** (`venice`)  
- 环境变量：`VENICE_API_KEY`。

**Hugging Face** (`huggingface`)  
- 环境变量：`HF_TOKEN` 或 `HUGGINGFACE_HUB_TOKEN`。

**NVIDIA** (`nvidia`)  
- 环境变量：`NVIDIA_API_KEY`。  
- 示例模型：`nvidia/nvidia/llama-3.1-nemotron-70b-instruct`。

**GitHub Copilot** (`github-copilot`)  
- 环境变量：`COPILOT_GITHUB_TOKEN`（优先），备选 `GH_TOKEN` / `GITHUB_TOKEN`；模板默认认证方式为 `oauth`。

**LiteLLM** (`litellm`)  
- 环境变量：`LITELLM_API_KEY`。  
- 默认 Base URL 指向本机 `http://localhost:4000/v1`，部署时改为你的 LiteLLM 地址。

**Vercel AI Gateway** (`vercel-ai-gateway`)  
- 环境变量：`AI_GATEWAY_API_KEY`。  
- Desktop 模板未填写 `baseUrl`；若手动配置 `models.providers`，可与 OpenClaw 一致使用 `https://ai-gateway.vercel.sh` 并接 `/v1` 路径（以官方文档为准）。

---

### 6.2 国内、国际双线或区域敏感提供方

**Kimi (Moonshot)** (`moonshot`)  
- 环境变量：`MOONSHOT_API_KEY`。  
- **国际**：`baseUrl` = `https://api.moonshot.ai/v1`；**中国**：`https://api.moonshot.cn/v1`（OpenClaw `docs/providers/moonshot.md`）。  
- 示例模型：`moonshot/kimi-k2.5`、`moonshot/kimi-k2-plus`（具体版本以官方文档或 `openclaw models list` 为准；旧 `moonshot-v1-*` 系列仍可用但已非主推）。  
- **Kimi Coding**（专用编码线）：**不得**使用 `MOONSHOT_API_KEY`。应使用 **`KIMI_API_KEY`**（或 `KIMICODE_API_KEY`）、**`https://api.kimi.com/coding/`**（Anthropic 兼容）。官方文档模型示例为 **`kimi-coding/k2p5`**；亦可能见 **`kimi/kimi-code`** 等，见 **§4.4.3**；CLI：`kimi-code-api-key`。

**Z.AI（智谱）** (`zai`)  
- 环境变量：`ZAI_API_KEY`（备选 `Z_AI_API_KEY`）。OpenClaw 对通用与 Coding **共用变量名**；厂商控制台侧 Coding Plan **常为另一张 Key**，请把 **当前要用的那条** 写入 `env.vars`（不要拿开放平台 Key 调 `/api/coding/`）。  
- **通用 API**：国内 `open.bigmodel.cn/api/paas/v4`，国际 `api.z.ai/api/paas/v4`。  
- **Coding Plan**：国内 `open.bigmodel.cn/api/coding/paas/v4`，国际 `api.z.ai/api/coding/paas/v4`。  
- 示例模型：`zai/glm-5`、`zai/glm-4.7`、`zai/glm-4.7-flash`。  
- 建议使用 `openclaw onboard --auth-choice zai-cn` / `zai-global` / `zai-coding-cn` / `zai-coding-global` 避免手写错误（见 §4.2）。

**MiniMax** (`minimax`)  
- **API Key 路线**：`MINIMAX_API_KEY`；`api`：`anthropic-messages`；**国际** `https://api.minimax.io/anthropic`，**中国** `https://api.minimaxi.com/anthropic`。  
- **Coding Plan（OAuth）**：走捆绑插件 **`minimax-portal`**（`MINIMAX_OAUTH_TOKEN` 等），README 写明 OAuth **面向 Coding Plan**；与上一条 API Key 路线不是同一套凭证逻辑。  
- **Coding Plan 专用 Key（部分功能）**：另支持 **`MINIMAX_CODE_PLAN_KEY`**（与 `MINIMAX_API_KEY` 并存时，部分用量探测 **优先** Coding Key，见 `src/infra/provider-usage.auth.ts`）。  
- 示例模型：`minimax/MiniMax-M2.5`、`minimax/MiniMax-M2.5-highspeed`、`minimax/MiniMax-VL-01`。

**阿里云百炼 (Model Studio)** (`modelstudio`)  
- 环境变量：**`MODELSTUDIO_API_KEY`** — OpenClaw 插件界面明确为 **Coding Plan 订阅 API Key**，与常见 **`DASHSCOPE_API_KEY` + 兼容模式**（`dashscope.aliyuncs.com/compatible-mode/v1` 等）**不是同一类产品**（见 `src/agents/model-compat.test.ts` 与 §4.4）。  
- **Coding 专线** Base URL：国内 `https://coding.dashscope.aliyuncs.com/v1`，国际 `https://coding-intl.dashscope.aliyuncs.com/v1`。  
- Desktop 模板中的 `https://dashscope.aliyuncs.com/compatible-mode/v1` 更接近 **通用百炼 OpenAI 兼容**；仅当你的 Key 与控制台说明匹配时才可用。  
- 示例模型：`modelstudio/qwen3.5-plus`、`modelstudio/qwen3-max-2026-01-23`、`modelstudio/kimi-k2.5`、`modelstudio/glm-5`。

**火山引擎豆包** (`volcengine`)  
- 环境变量：`VOLCANO_ENGINE_API_KEY`。  
- **通用**：`https://ark.cn-beijing.volces.com/api/v3`；**Coding**：`https://ark.cn-beijing.volces.com/api/coding/v3`（在 OpenClaw 中常对应 `volcengine-plan` provider，与 `VOLCANO_ENGINE_API_KEY` 同源配置，见 `docs/providers/volcengine.md`）。  
- 示例模型：`volcengine/doubao-seed-1-8-251228`、`volcengine/doubao-1-5-pro-256k`。  
- **国际用户**：同源能力常通过 **BytePlus ARK**（`byteplus` / `byteplus-plan`，`BYTEPLUS_API_KEY`，endpoint 见 §4.1）；当前 Desktop 未内置该模板，需在 OpenClaw 配置中手动添加或等待模板扩展。

**DeepSeek** (`deepseek`)  
- 环境变量：`DEEPSEEK_API_KEY`。  
- 示例模型：`deepseek/deepseek-r1`、`deepseek/deepseek-chat`。  
- 无单独「国内/国际双 baseUrl」的文档分支时，使用模板默认即可。

**百度千帆** (`qianfan`)  
- 环境变量：`QIANFAN_API_KEY`。  
- 须使用百炼等平台新版 API Key（非旧版 IAM 鉴权）。  
- 示例模型：`qianfan/deepseek-v3.2`、`qianfan/ernie-5.0-thinking-preview`。

**小米 MiMo** (`xiaomi`)  
- 环境变量：`XIAOMI_API_KEY`。  
- `api`：`anthropic-messages`；当前单一 `https://api.xiaomimimo.com/anthropic`。  
- 示例模型：`xiaomi/mimo-v2-flash`。

---

### 6.3 本地与自托管

**Ollama** (`ollama`)  
- 环境变量：`OLLAMA_API_KEY`（可选，视本机是否启用鉴权）。  
- 默认 `http://localhost:11434`。  
- 示例模型：`ollama/llama3.2`、`ollama/qwen3:8b`、`ollama/deepseek-r1:7b`。

**vLLM** (`vllm`)  
- 环境变量：`VLLM_API_KEY`。  
- **必须**配置 `baseUrl`；模型 ID 形如 `vllm/<model-name>`，OpenClaw 会按需剥离前缀。

**Custom** (`custom`)  
- 环境变量：`OPENCLAW_CUSTOM_API_KEY`。  
- **必须**配置 `baseUrl`；用于任意 OpenAI 兼容或 Anthropic 兼容端点（具体以 OpenClaw 对该 `api` 值的支持为准）。  
- `models.providers` 的键名在简单场景下可为 `custom`；若使用自定义提供方 ID，需保证模型 ID 前缀与 `models.providers` 键一致。

---

## 7. 最小 JSON 示例（片段）

### 7.1 DeepSeek（单端点）

将密钥放在 `env.vars`（勿提交到版本库）：

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

### 7.2 Moonshot 中国站（覆盖 `baseUrl`）

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

国际站用户将 `baseUrl` 改为 `https://api.moonshot.ai/v1` 即可。

### 7.3 Kimi Coding（专用 Key + 专用 endpoint）

与 **§7.2 的 `MOONSHOT_API_KEY` 无关**。写法与官方 [Model Providers — Kimi Coding](https://docs.openclaw.ai/concepts/model-providers) 一致时，可仅设环境变量 + 默认模型（插件会注入目录，**通常无需**手写 `models.providers`）：

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

若需显式覆盖 `baseUrl` / `api`（与 Desktop 或自定义网关对齐），可使用 **`models.providers.kimi`**（或与测试用例一致的遗留键 **`kimi-coding`**）：

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

**模型 id**：官方示例为 **`k2p5`**（前缀 `kimi-coding`）；插件目录另有 **`kimi-code`** 等。以 **`openclaw models list`** 为准。推荐先用：`openclaw onboard --auth-choice kimi-code-api-key`。

---

## 8. Desktop UI 行为摘要

- **连接测试**：优先 `GET /models`；若返回 404，会尝试 `POST /chat/completions` 最小请求（与 `ProvidersTab.tsx` 一致）。  
- **热门提供方**：配置页快速入口默认包含 `minimax`、`deepseek`、`moonshot`、`qianfan`、`modelstudio`、`volcengine`、`openai`、`anthropic`（`POPULAR_PROVIDER_IDS`）。  
- **跨境提示**：若仅通过 UI 选择提供方并保存密钥，**`baseUrl` 可能仍为模板默认值**；中国大陆或国际账号不通时，请对照 **§4** 在 `models.providers` 中修改 `baseUrl`，或先用 OpenClaw CLI `onboard` 生成配置再交给 Desktop 编辑。  
- **Coding Plan / 专用 Key**：Desktop 模板**未**单独列出 Kimi Coding、BytePlus、`volcengine-plan` 等；若你只填了 `moonshot` 或通用 `modelstudio` 模板，却持有 **Coding 专用密钥**，会出现 401 / 域名不匹配。请对照 **§4.4** 核对环境变量名与 `baseUrl`，必要时直接编辑 JSON 或使用 OpenClaw CLI。  
- **权威同步**：模板文件头注释标明与 OpenClaw 中 `model-auth-env-vars`、`models-config.providers.static`、`auth-choice-options` 等源对齐；全量行为以官方 [Model Providers](https://docs.openclaw.ai/concepts/model-providers) 为准。新增 Desktop 模板时应同步更新 **§4 / §5.1** 与本篇。

---

## 9. Providers 页面改版方案（标签页信息架构）

目标：让用户在同一页中快速做出「**厂商 + 区域 + 产品线（通用 / Coding Plan）**」三类关键决策，默认走安全路径，尽量不需要手写 `baseUrl`，从而降低国内/国际端点和密钥混用导致的 401/404/模型不可见问题。

### 9.1 标签页分层（顶层）

建议把当前单列表改为 4 个顶层标签页：

1. **推荐（新手）**  
   - 仅显示「最常用 + 已验证映射清晰」的入口卡片（如 OpenAI、Anthropic、DeepSeek、Moonshot、Z.AI、Model Studio、MiniMax、Volcengine）。
   - 每张卡片都先要求选择 `区域` 与 `产品线`（若适用），再展开密钥输入。
   - **无 CN/Global 分裂**的提供方（OpenAI、Anthropic、DeepSeek、Mistral、xAI、Groq 等）仅在此标签出现，不在「国内」或「国际」标签重复列出；卡片上不显示 Region 选择器，避免歧义。
2. **国内（China）**  
   - 仅展示确实有大陆专线的 provider（`moonshot` CN、`zai` CN、`modelstudio` CN、`minimax` CN、`volcengine`）。
   - 不列出无 CN 专线的提供方，避免误导。
3. **国际（Global）**  
   - 展示国际端点优先入口（`moonshot` global、`zai` global、`modelstudio` global、`minimax` global、`byteplus`）。
4. **Coding / Agent 专线**  
   - 专门列出 `kimi-coding`、`zai-coding-*`、`modelstudio` Coding、`volcengine-plan`、`byteplus-plan`、`minimax-portal` 等。
   - 标签标题明确写「专用 Key，通常不可与通用 API key 混用」。

> 关键点：**同一厂商在不同标签出现不同“入口实例”**（如 Moonshot 通用 vs Kimi Coding），避免用户以为只是一个开关。

### 9.2 卡片模型（每个入口必须显式三元组）

每张 provider 卡片统一展示并持久化如下字段：

- **Provider**：例如 `moonshot` / `kimi-coding` / `zai`
- **Region**：`CN` / `Global` / `Auto`
- **Plan**：`General API` / `Coding Plan` / `OAuth Portal`

卡片副标题直接拼出最终目标配置，例如：

- `moonshot · CN · General API`
- `zai · Global · Coding Plan`
- `modelstudio · CN · Coding Plan`

并在卡片内实时显示将写入的关键字段预览（只读）：

- `env key`: `MOONSHOT_API_KEY`
- `models.providers.<id>.baseUrl`: `https://api.moonshot.cn/v1`
- `api`: `openai-completions`
- 默认模型引用：`moonshot/kimi-k2.5`

### 9.3 防误配规则（强约束）

1. **先选区域/产品线，后输入密钥**  
   未完成区域/产品线选择时，密钥输入框与保存按钮禁用。
2. **密钥类型与入口绑定**  
   - 例如在 `kimi-coding` 入口只接受 `KIMI_API_KEY` / `KIMICODE_API_KEY` 的目标路径；禁止写入 `MOONSHOT_API_KEY`。
   - `modelstudio` Coding 入口只写 `MODELSTUDIO_API_KEY`，并默认 `coding*.dashscope.aliyuncs.com/v1`。
3. **保存前冲突检查（必做）**  
   检查同厂商是否已存在「不同区域/不同 plan」配置；若冲突，弹窗给 3 个明确动作：  
   - 覆盖当前入口  
   - 并存（新增 profile 名称）  
   - 取消
4. **连接测试前置规则**  
   若 `baseUrl` 与入口预置不一致，测试按钮旁显示黄色提示「你在使用自定义 endpoint，结果不受官方映射保证」。

### 9.4 推荐交互流程（单路径）

`选择标签页 -> 选择厂商卡片 -> 选择 Region -> 选择 Plan -> 输入 Key -> 生成预览 -> 测试连接 -> 保存`

其中「生成预览」必须包含：

- 将写入哪些 `env.vars.*`
- 将写入哪些 `models.providers.*`
- 默认 `agents.defaults.model.primary`
- 若涉及别名（`kimi` / `kimi-coding`）时，显示规范化结果

### 9.5 文案规范（避免歧义）

- 把“国内版/国际版”统一改为：**`China (CN)` / `Global`**。
- 把“编码版/开发版”统一改为：**`Coding Plan`**（必要时补充 “dedicated endpoint + key”）。
- 在所有 Coding 入口旁固定提示：  
  `This plan usually uses a dedicated API key and endpoint; do not reuse general API keys unless vendor docs explicitly allow it.`

### 9.6 与现有数据结构的映射（落地不改协议）

UI 改版不要求改底层 schema，仅需新增一层「入口元数据」映射表：

- `uiCatalogEntry.id`（例如 `moonshot-cn-general`）
- `providerId`
- `region`（`cn` | `global` | `none`）
- `plan`（`general` | `coding` | `oauth-portal`）
- `envKeyCandidates`
- `defaultBaseUrl`
- `api`（`openai-completions` | `anthropic` | `anthropic-messages`）
- `requiresBaseUrl`（`boolean`，vLLM / Custom 等必填场景）
- `defaultModelRef`
- `docsUrl`

保存时仍写入现有配置：

- `env.vars.*`
- `models.providers.*`
- `agents.defaults.models` / `agents.defaults.model.primary`

### 9.7 验收标准（Done 定义）

- 用户在 3 步内可区分同厂商的 `General` 与 `Coding` 入口。
- 对 Moonshot / Z.AI / Model Studio / MiniMax / Volcengine 这 5 类高频双线厂商，错误组合（错 Key + 错端点）保存率显著下降。
- 无需手写 JSON 即可完成 `CN/Global + Coding/General` 的正确配置。
- 页面任一入口都能回溯出「写入了哪些配置键」。

---

## 10. 相关文档

- **OpenClaw 官方（权威）**：[Model Providers](https://docs.openclaw.ai/concepts/model-providers) · [Models 概念](https://docs.openclaw.ai/concepts/models) · [Gateway 配置](https://docs.openclaw.ai/gateway/configuration)  
- 各提供方详情页（官方）：如 [Moonshot](https://docs.openclaw.ai/providers/moonshot)、[Z.AI](https://docs.openclaw.ai/providers/zai)、[MiniMax](https://docs.openclaw.ai/providers/minimax)、[Model Studio](https://docs.openclaw.ai/providers/modelstudio)  
- 桌面端构建与发布入口：[配置、构建与发布](../build-release/config-build-release.md)  
- 文档总览入口：[Docs README](../README.md)

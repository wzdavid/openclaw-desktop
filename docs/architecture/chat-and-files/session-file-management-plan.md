# OpenClaw Desktop 会话文件管理方案

## 1. 目标与范围

结合 `openclaw-desktop` 已有实现，定义 Desktop 侧会话文件管理方案：

- 会话中出现的输出文件路径，转换为可交互文件卡片。
- 用户上传、会话输出、语音文件具备统一可管理入口。
- 文件操作统一走 Electron 主进程 IPC（open/reveal/read/save/delete）。
- 会话删除/重置时，执行最佳努力的会话级清理。

本文聚焦“会话与文件的关系”，不覆盖品牌/打包策略。

## 2. 当前实现基线（openclaw-desktop）

## 2.1 IPC 与存储能力

- 预加载桥：
  - `electron/preload.ts`
  - 暴露 `uploads.*`、`managedFiles.*`、`attachments.*`、`voice.*`
- 主进程处理：
  - `electron/main.ts`
  - `managedFiles:list/open/reveal/exists/read/delete/removeRef/saveAs/captureOutputs/cleanupSessionRefs`
  - `uploads:list/open/reveal/exists/read/delete/saveAs/cleanup/cleanupSession`
  - `voice:save/read/cleanupSession/cleanupExpired`
- 输出索引工具：
  - `electron/output-files-index.ts`
  - 提供 output refs 的读写、候选路径提取、查询分页。

## 2.2 会话页文件卡片链路

- 入口：
  - `ChatHandler.finalizeAssistantResponse -> captureManagedOutputRefs`
- 结构化渲染：
  - `fileRefs` 注入 `chatStore.finalizeStreamingMessage`
  - `buildSemanticBlocks` 生成 `file-output` block
  - `ChatView` 渲染 `FileResultCard`
- 卡片动作：
  - `Open` / `Reveal` / `Path`
  - 路径解析与 IPC 调用在 `src/components/Chat/ResultCards.tsx`

## 2.3 已落地对齐（最近修复）

- 修复 `captureManagedOutputRefs` 早退导致 fallback 不生效。
- 补齐历史映射字段，避免 `fileRefs` 在 history load 时丢失。
- 增强文本/主进程路径提取，支持：
  - `📎 file: ...`
  - `文件位置: ...`
  - `已保存到 <relative-file.ext>` / `saved to ...`
- 输出动作路径解析支持相对路径、绝对路径、`~/...`。
- `Path` 按钮增加可见反馈（按钮态 + toast）。

## 3. 当前评估

## 3.1 一致项

- 会话消息中路径可转换为结构化文件卡片。
- 文件卡片提供 open/reveal/copy path 交互。
- 输出引用索引化管理（而非仅文本展示）。
- 会话生命周期具备清理入口（uploads/output refs/voice）。

## 3.2 仍需补齐项

- 输出路径治理策略仍偏“识别后注册”，未形成完整“输出策略引导 + 强约束”闭环。
- 多 agent workspace 白名单/注册表能力尚未系统化暴露。
- 输出引用元数据模型仍可继续增强（例如更强的 canonical/orphaned 生命周期治理）。
- 文件卡片动作失败时，用户可见错误提示仍可进一步统一（目前以日志+部分 toast 为主）。

## 4. 推荐实施计划（openclaw-desktop）

### 任务 F1：输出路径策略文案统一

- 同步 `ChatHandler` 的桌面注入上下文（FILE OUTPUT RULES）到明确的 `outputs/` 约束表述。
- 在不破坏 Desktop 兼容性的前提下，统一模型“默认输出行为”。

验收：

- 新对话首轮上下文明确输出目录规则。
- 生成文件回复格式稳定命中卡片识别规则。

### 任务 F2：输出候选解析规则表固化

- 将当前支持的路径模式沉淀为文档+测试矩阵：
  - 绝对路径、相对路径、中文句式、英文句式、引号/标点边界。
- 持续扩充 `electron/output-files-index.test.ts` 与前端语义测试。

验收：

- 新增样例可先写测试再改规则，防止回归。

### 任务 F3：会话文件动作反馈一致化

- 对 `Open/Reveal/Path` 统一 success/failure toast 规范。
- 对不可达路径给出用户可理解的错误信息（例如 not_found/not_managed_ref）。

验收：

- 三个按钮均有可见反馈，不再出现“点击无感知”。

### 任务 F4：文件管理页与会话卡片语义统一

- 确保 `FileManager` 与会话卡片对同一路径使用同一解析/展示策略。
- 保持 output refs 与 uploads 的行为边界清晰（删除引用 vs 删除文件）。

验收：

- 会话卡片和文件管理页对同一文件展示一致、动作一致。

## 5. 数据与安全边界建议

- 所有本地文件操作必须走主进程 IPC，不允许渲染层直接打开本地路径。
- 对路径统一做规范化与根目录约束校验，阻断目录穿越。
- 对 read/delete/saveAs 等操作做存在性与类型检查。

## 6. 验收清单（文件管理）

- assistant 消息中的输出路径可稳定转为文件卡片。
- 卡片 `Open/Reveal/Path` 均有可见反馈，失败可诊断。
- 历史回放后文件卡片仍可恢复，不仅实时消息有效。
- FileManager 可看到会话关联输出/上传，并执行对应动作。
- 会话 reset/delete 后，托管文件清理链路按预期执行。

## 7. 关联文档

- `docs/architecture/chat-and-files/file-management-and-attachments.md`

## 8. 路径简化最佳方案（新增决议）

针对当前“shared 根目录 + 分散 workspace”的复杂心智，采用以下统一方案：

- 存储就近：上传与语音文件写入各自 agent workspace。
- 展示统一：文件管理页不扫目录，统一从索引读取。
- 输出延续：输出文件保持“原地文件 + 引用索引”模式，不强制搬运。

### 8.1 目录约定（目标态）

对每个 agent workspace（含默认和独立 workspace）：

- `<agentWorkspace>/uploads/<sessionKey>/<yyyyMMdd>/...`
- `<agentWorkspace>/voice/<sessionKey>/<yyyyMMdd>/...`

输出文件：

- 仍在原路径（通常在 workspace 内），通过索引登记引用。

### 8.2 索引约定（目标态）

建立统一 managed 索引（推荐单索引）：

- `~/.openclaw/index/managed-files.jsonl`

统一记录 `output/upload/voice`，字段至少包括：

- `id`
- `kind` (`output` / `upload` / `voice`)
- `path`
- `agentId`
- `sessionKey`
- `workspaceRoot`
- `relativePath`（可选）
- `mimeType`、`size`
- `createdAt`
- `exists`
- `isCanonicalOutput`（output 可选）

### 8.3 FileManager 行为（目标态）

- 列表来源：索引，不直接依赖固定目录结构。
- 预览读取：按 `path` 走主进程 IPC read。
- 过滤维度：`kind/agent/session/date/exists`。
- 删除语义：
  - output：默认删除引用，可选删除实体。
  - upload/voice：删除实体并移除索引。

## 9. 可执行改造清单（openclaw-desktop）

### 阶段 A（低风险，先落地）

1. 上传落盘路径改造  
   - 文件：`electron/conversation-files-cleanup.ts`  
   - 将 uploads 根从 `shared/.openclaw-desktop/uploads/...` 改为 `agentWorkspace/uploads/...`。

2. 语音落盘路径改造  
   - 文件：`electron/main.ts`（`voice:save`）  
   - 将 voice 根从 `shared/voice/...` 改为 `agentWorkspace/voice/...`。

3. 保持输出路径识别能力可用（仅保留提取/归一化工具）  
   - 文件：`electron/main.ts`、`electron/output-files-index.ts`  
   - 输出引用写入统一 `managed-files` 索引，不再维护独立 output 索引。

验收：

- 新上传文件和语音文件落在各自 agent workspace 下。
- 原有会话发送、预览、删除能力不回退。

### 阶段 B（统一索引）

1. 新增统一索引模块  
   - 新文件建议：`electron/managed-files-index.ts`  
   - 支持 append/query/delete/updateExists。

2. 上传/语音落盘后写索引  
   - 文件：`electron/conversation-files-cleanup.ts`、`electron/main.ts`。

3. output 引用完全迁移到统一索引模型  
   - 仅保留路径提取工具；`outputFiles.*` API 下线，统一走 `managedFiles.*`。

验收：

- `output/upload/voice` 都可通过统一索引查询。
- FileManager 可按 kind 统一展示。

### 阶段 C（FileManager 全量切换）

1. FileManager 从 `managedFiles:list(kind=...)` 或统一 list 读取。  
2. 预览、open/reveal/saveAs/delete 全部走统一引用模型。  
3. 增加“索引修复”按钮（可选）：重扫索引中失效路径并标记。

验收：

- 跨 agent workspace 文件统一可管理。
- 不依赖固定 shared 根目录也可完整运行。

## 10. 风险与规避

- 风险：独立 workspace 不可写。  
  - 规避：落盘前 `fs.access` 校验，不可写时回退主 workspace 并告警。

- 风险：索引与实体不一致。  
  - 规避：FileManager 列表时做 exists 检查并标记 missing，不直接崩溃。

- 风险：删除语义混乱。  
  - 规避：UI 明确区分“删除引用”和“删除文件”。

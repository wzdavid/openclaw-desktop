# OpenClaw Desktop 会话消息管理方案

## 1. 目标与范围

结合 `openclaw-desktop` 现有实现，定义 Desktop 侧消息链路的稳定方案，目标是：

- 会话级隔离：消息、流式状态、思考流、快捷回复不串会话。
- 流式实时性：assistant 文本、thinking、tool call 在会话内实时可见。
- 结构化渲染：原始消息统一进入 `normalize -> semantic blocks -> response groups -> render blocks` 管线。
- 历史一致性：`chat.history` 回放与实时流式结果在展示层语义一致。

本文只覆盖“会话消息管理”，文件索引与文件页治理放在独立文档中。

## 2. 当前实现基线（openclaw-desktop）

### 2.1 消息处理主链路

- 网关事件处理：`src/services/gateway/Connection.ts` + `src/services/gateway/ChatHandler.ts`
- 归一化：`src/processing/normalizeGatewayMessage.ts`
- 语义分块：`src/processing/buildSemanticBlocks.ts`
- 分组：`src/processing/buildResponseGroups.ts`
- 渲染投影：`src/processing/projectResponseGroup.ts`
- 状态容器：`src/stores/chatStore.ts`
- 展示层：`src/components/Chat/ChatView.tsx` + `src/components/Chat/*`

### 2.2 已实现能力

- 会话级缓存：
  - `messagesPerSession`、`_blocksCache`、`_groupsCache`
  - 切换会话时按 sessionKey 恢复消息和派生数据。
- 会话级实时状态：
  - `typingBySession`
  - `thinkingBySession`
  - `quickRepliesBySession`
- 流式消息收敛：
  - `updateStreamingMessage` / `finalizeStreamingMessage` 按 sessionKey 精准落库。
  - `chat.final` 缺失时有 lifecycle fallback finalize。
- 工具与思考可视化：
  - `tool` 流（`agent.tool` / `agent.item kind=tool` / `chat stream=tool`）可实时更新卡片。
  - `thinking` 流（包括 content block 提取）可实时显示并最终合并。
- 历史加载一致性：
  - `chat.history` 映射回 `ChatMessage` 后再进统一派生管线。
  - 去重、超时重试、后台重拉与会话切换协同。
- 响应分组渲染：
  - UI 以 `responseGroups` 为主，`Virtuoso` 虚拟列表按组渲染，减少流式抖动。

### 2.3 最近对齐补丁（已落地）

- `ChatHandler.captureManagedOutputRefs` 早退问题已修复（支持 fallback 分支）。
- `ChatView` 历史映射已补齐 `fileRefs/decisionOptions/workshopEvents/sessionEvents` 字段。
- 文件路径提取后可进入 `file-output` 语义块并渲染为文件卡片（会话层）。

## 3. 当前差距评估

### 3.1 核心链路差距（高优先级）

- 目前主链路可用，但“事件可观测性”仍弱：
  - 缺少统一的消息链路 debug 开关（仅零散日志）。
  - 复杂流（tool-interrupt、abort、history refresh）定位成本高。

### 3.2 交互一致性差距（中优先级）

- 某些动作反馈弱（例如复制路径已补，其他按钮仍有局部静默失败风险）。
- 搜索与分组匹配策略已有实现，但缺少明确的回归矩阵文档。

### 3.3 测试覆盖差距（中优先级）

- 现有测试已覆盖关键流式 finalize 与文件路径语义提取。
- 仍缺少以下自动化场景：
  - 多会话并发 tool/thinking 流串扰回归。
  - `chat.history` + 实时流交错时的分组稳定性回归。
  - `aborted/error` 场景下 thinking/tool 清理一致性回归。

## 4. 推荐后续任务拆分

### 任务 M1：消息链路可观测性增强

- 在 `ChatHandler` 增加可控 debug 开关（按 config/env）。
- 对 `delta/final/tool/thinking/history` 增加统一结构日志字段：
  - sessionKey、runId、messageId、state、source。

验收：

- debug 打开时可完整追踪一次会话消息生命周期。
- debug 关闭时不污染常规日志。

### 任务 M2：会话隔离回归测试补齐

- 新增 `chatStore` + `ChatHandler` 组合测试：
  - 同时存在两个 session 的 delta/final/tool/thinking 流。
  - 验证目标 session 的 `messages/responseGroups/thinking/quickReplies` 不被污染。

验收：

- 覆盖至少 3 类并发场景并稳定通过。

### 任务 M3：历史回放一致性测试

- 针对 `ChatView` 历史映射字段建立快照式断言：
  - `fileRefs`、`decisionOptions`、`workshopEvents`、`sessionEvents` 不丢失。

验收：

- 历史加载后 `responseGroups` 与实时 finalize 结果语义一致。

## 5. 验收清单（消息管理）

- 会话切换后：
  - 消息、thinking、typing、quick replies 全部按会话隔离。
- 流式期间：
  - tool/thinking 实时显示，final 后状态正确收敛。
- 历史恢复后：
  - 与实时渲染形态一致（含 file-output/decision/workshop/session-event）。
- 异常场景：
  - aborted/error 不残留脏的 streaming/thinking 状态。

## 6. 关联文档

- `docs/architecture/chat-and-files/file-management-and-attachments.md`

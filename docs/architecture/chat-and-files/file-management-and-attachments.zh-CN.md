# File Management and Attachments (Desktop)

[English](./file-management-and-attachments.md) | [简体中文](./file-management-and-attachments.zh-CN.md)

本文档说明 OpenClaw Desktop 当前关于文件管理、附件暂存和语音文件存储的行为。

## 范围

- 发送前的会话附件暂存（`attachments:stage`）
- 共享目录清理（`attachments:cleanup`、`attachments:cleanupSession`）
- 上传文件存储操作（`uploads:*` IPC）
- 按会话维度管理的语音存储（`voice:save`、`voice:read`、`voice:cleanupSession`、`voice:cleanupExpired`）

## 存储布局

根目录为配置中的 `sharedFolder`，默认值是 `~/.openclaw/shared`：

- `voice/<agentId>/<sessionKey>/<yyyyMMdd>/...`
- `.openclaw-desktop/uploads/<agentId>/<sessionKey>/<yyyyMMdd>/...`

上传文件的元数据 sidecar：

- `<file>.openclaw-desktop-upload.json`

## IPC 协议

### Attachments

- `attachments:stage`
  - 输入：`sessionKey`、可选 `agentId`、`files[]`（base64 或源文件路径）
  - 输出：带有标记字符串的暂存结果：
    - `[media attached: /abs/path]`
    - `[file attached: /abs/path]`
- `attachments:cleanup`
  - 基于 TTL 和全局容量预算，同时清理语音和暂存上传文件
- `attachments:cleanupSession`
  - 删除会话级的上传目录和语音目录

### Uploads

- `uploads:list`
- `uploads:open`
- `uploads:reveal`
- `uploads:exists`
- `uploads:read`
- `uploads:delete`
- `uploads:saveAs`
- `uploads:cleanup`
- `uploads:cleanupSession`

### Voice

- `voice:save(filename, base64, sessionKey?, agentId?)`
- `voice:read(filePath)`，读取范围限制在 `sharedFolder/voice` 下
- `voice:cleanupSession`
- `voice:cleanupExpired`

## UI 集成状态

- `MessageInput` 优先使用 `attachments:stage`，失败时回退到旧的 inline/base64 行为
- 设置页暴露了附件和语音临时文件的清理指标与操作
- `FileManager` 已接入 `managedFiles:*`，在仍有必要的场景下也会使用 `uploads:*`，支持预览、打开、定位、另存为、删除等流程
- 会话生命周期中的 `gateway.deleteSession` / `gateway.resetSession` 会尽力触发托管清理：
  - `uploads.cleanupSession`
  - `managedFiles.cleanupSessionRefs({ kind: 'outputs' })`
  - `voice.cleanupSession`

## 安全规则

- 通过解析并校验路径是否位于允许根目录下，阻止目录穿越
- 绝对路径读取仅在目标仍位于托管根目录内时允许
- 删除类 API 只允许操作托管目录中的文件

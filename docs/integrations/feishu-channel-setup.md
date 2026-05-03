# OpenClaw Desktop 飞书渠道配置指南

本文说明如何在 **OpenClaw Desktop + OpenClaw Gateway** 下配置飞书（Feishu/Lark）机器人渠道，实现与飞书单聊、群聊的收发与 AI 对话。

飞书渠道通过 **WebSocket 长连接** 接收消息，无需公网 IP 或 Webhook；发送走飞书开放平台 Open API。支持文本、图片、文件等；群聊需 @ 机器人触发（可配置）。

---

## 一、在飞书开放平台创建应用并获取凭证

### 1. 创建企业自建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)（国际版 Lark 使用 [open.larksuite.com/app](https://open.larksuite.com/app)，并在后文配置中设置 `domain: "lark"`）。
2. 点击 **创建企业自建应用**，填写应用名称、描述，选择图标后创建。

### 2. 获取 App ID 与 App Secret

1. 在应用 **凭证与基础信息** 中复制：
   - **App ID**（形如 `cli_xxx`）
   - **App Secret**
2. 请妥善保管 App Secret，勿泄露。

### 3. 配置权限

1. 进入 **权限管理**，点击 **批量导入**。
2. 粘贴以下 JSON 并保存（与 OpenClaw 官方飞书渠道要求一致）：

```json
{
  "scopes": {
    "tenant": [
      "aily:file:read",
      "aily:file:write",
      "application:application.app_message_stats.overview:readonly",
      "application:application:self_manage",
      "application:bot.menu:write",
      "cardkit:card:read",
      "cardkit:card:write",
      "contact:user.employee_id:readonly",
      "corehr:file:download",
      "event:ip_list",
      "im:chat.access_event.bot_p2p_chat:read",
      "im:chat.members:bot_access",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:message:readonly",
      "im:message:send_as_bot",
      "im:resource"
    ],
    "user": ["aily:file:read", "aily:file:write", "im:chat.access_event.bot_p2p_chat:read"]
  }
}
```

### 4. 启用机器人能力

1. 在 **能力** → **机器人** 中启用机器人能力。
2. 设置机器人名称（即用户在飞书中看到的名称）。

### 5. 配置事件订阅（长连接）

**重要**：需先在本机完成「二、在 OpenClaw Desktop 中配置飞书」并 **启动 Gateway**，再在开放平台配置长连接，否则长连接可能无法保存。

1. 在 **事件与回调** 中，将订阅方式选为 **使用长连接接收事件（WebSocket）**。
2. 点击 **添加事件**，搜索并订阅：**接收消息 v1**（`im.message.receive_v1`）。
3. 若 Gateway 未运行，此处可能保存失败；请先启动 Gateway 再重试。

### 6. 发布应用

1. 在 **版本管理与发布** 中创建版本，填写说明后提交。
2. 按企业流程完成审核/发布（自建应用通常可快速通过）。

---

## 二、在 OpenClaw Desktop 中配置飞书

### 方式一：在 Desktop 配置页中配置（推荐）

1. 打开 **OpenClaw Desktop**，进入 **Config Manager** → **Channels**。
2. 点击 **Add Channel**，在渠道列表中选择 **Feishu**（飞书）。
3. 在配置表单中填写：
   - **App ID**：飞书开放平台中的 App ID（如 `cli_xxx`）。
   - **App Secret**：飞书开放平台中的 App Secret。
4. 按需设置：
   - **DM Policy**：私聊策略  
     - `pairing`（默认）：新用户需配对，机器人会回复配对码，你在本机执行 `openclaw pairing approve feishu <配对码>` 批准。  
     - `allowlist`：仅允许列表中的用户（在 **Allow From** 中填写飞书 `open_id`，如 `ou_xxx`）。  
     - `open`：所有人可直接对话（慎用）。  
     - `disabled`：关闭私聊。
   - **Group Policy**：群聊策略（如 `open` / `allowlist` / `disabled`）。
   - **Streaming**：流式回复方式（如 `off` / `partial` / `block` / `progress`）。
5. 若使用 **Lark 国际版**，在 **Domain** 中填写 `lark`。
6. 保存后，确保 **Gateway 已启动**（由 Desktop 或系统托盘的 OpenClaw 网关提供）。

### 方式二：直接编辑配置文件

配置文件路径：`~/.openclaw/openclaw.json`（或 Desktop 所写入的 OpenClaw 配置）。

在 `channels.feishu` 中配置，例如：

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "accounts": {
        "main": {
          "appId": "cli_你的AppID",
          "appSecret": "你的AppSecret",
          "botName": "我的 AI 助手"
        }
      },
      "allowFrom": ["ou_ff21106b19c68ad74c59002f15e26ffd"]
    }
  }
}
```

- `dmPolicy: "pairing"` 时无需填 `allowFrom`，新用户会收到配对码，你在终端执行 `openclaw pairing approve feishu <配对码>` 批准。
- `dmPolicy: "allowlist"` 时，在 `allowFrom` 中填写允许的飞书用户 **open_id**（如 `ou_xxx`）。如何获取 open_id：与机器人发一条消息后，在 Gateway 日志或配对列表中可见；或使用飞书 API 查询。

Lark 国际版时增加 `domain`：

```json
"feishu": {
  "enabled": true,
  "domain": "lark",
  "accounts": { "main": { "appId": "...", "appSecret": "..." } }
}
```

---

## 三、批准私聊（配对）或使用白名单

### 使用配对（dmPolicy: pairing）

1. 用户在飞书中首次给机器人发消息时，会收到类似回复：
   ```text
   OpenClaw: access not configured.
   Your Feishu user id: ou_xxxxxxxx
   Pairing code: XXXXXXXX
   Ask the bot owner to approve with:
   openclaw pairing approve feishu XXXXXXXX
   ```
2. 你在 **运行 OpenClaw 的本机** 打开终端（或 Desktop 内置 Terminal），执行：
   ```bash
   openclaw pairing approve feishu XXXXXXXX
   ```
   将 `XXXXXXXX` 替换为实际配对码。
3. 批准后，该用户在飞书中再次发消息即可正常对话。

查看待批准列表：

```bash
openclaw pairing list feishu
```

### 使用白名单（dmPolicy: allowlist）

1. 在 Config Manager → Channels → Feishu 展开行中，将 **DM Policy** 设为 **allowlist**。
2. 在 **Allow From** 中填入允许的飞书用户 **open_id**（如 `ou_ff21106b19c68ad74c59002f15e26ffd`），多个 ID 用逗号或换行分隔。
3. 保存后，仅列表中的用户可与机器人私聊，无需配对。

获取自己的 open_id：用配对方式让机器人回复一次，回复内容中会包含 `Your Feishu user id: ou_xxx`；或批准一次配对后，在 `openclaw pairing list feishu` 等输出中查看。

---

## 四、验证与使用

1. **确认 Gateway 已运行**：Desktop 菜单/托盘中的 OpenClaw 网关处于运行状态。
2. **飞书中找到机器人**：在工作台或搜索中打开你创建的应用机器人，进入对话。
3. **发消息测试**：  
   - 若为 pairing：先按上文执行 `openclaw pairing approve feishu <配对码>` 再发消息。  
   - 若为 allowlist：确认你的 open_id 已在 Allow From 中后直接发消息。
4. 群聊中需 **@ 机器人** 才会触发回复（可在配置中为指定群关闭“必须 @”）。

常见问题可参考 OpenClaw 官方飞书文档：[Feishu - OpenClaw](https://docs.openclaw.ai/channels/feishu)。

---

## 五、参考链接

- 飞书开放平台：<https://open.feishu.cn/app>
- Lark 国际版：<https://open.larksuite.com/app>
- OpenClaw 飞书渠道文档（英文）：<https://docs.openclaw.ai/channels/feishu>
- OpenClaw 飞书渠道文档（中文）：<https://docs.openclaw.ai/zh-CN/channels/feishu>

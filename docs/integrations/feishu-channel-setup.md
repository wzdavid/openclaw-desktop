# OpenClaw Desktop Feishu Channel Setup Guide

[English](./feishu-channel-setup.md) | [简体中文](./feishu-channel-setup.zh-CN.md)

This guide explains how to configure a Feishu or Lark bot channel with **OpenClaw Desktop + OpenClaw Gateway** so the bot can receive and send messages in direct chats and group chats.

The Feishu channel receives events over a **long-lived WebSocket connection**, so it does not require a public IP address or webhook endpoint. Sending uses the Feishu Open Platform Open API. Text, images, files, and other content types are supported. Group chats can be configured to require an `@` mention before the bot responds.

---

## 1. Create the App and Obtain Credentials

### 1.1 Create an internal enterprise app

1. Open the [Feishu Open Platform](https://open.feishu.cn/app). For the international Lark version, use [open.larksuite.com/app](https://open.larksuite.com/app) and set `domain: "lark"` later in the config.
2. Click **Create enterprise self-built app**, fill in the name, description, and icon, then create the app.

### 1.2 Copy the App ID and App Secret

1. In **Credentials & Basic Info**, copy:
   - **App ID** such as `cli_xxx`
   - **App Secret**
2. Keep the App Secret private.

### 1.3 Configure permissions

1. Open **Permission Management** and choose **Batch Import**.
2. Paste the following JSON, which matches the OpenClaw Feishu channel requirements:

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

### 1.4 Enable bot capabilities

1. Go to **Capabilities** -> **Bot** and enable bot support.
2. Set the bot display name that users will see in Feishu.

### 1.5 Configure event subscription for long connections

Important: finish section 2 first and make sure **Gateway is already running locally** before you save the long-connection event settings. Otherwise the platform may refuse to save the configuration.

1. In **Events & Callbacks**, choose **Receive events through long connection (WebSocket)**.
2. Click **Add Event**, search for and subscribe to **Receive Message v1** (`im.message.receive_v1`).
3. If Gateway is not running, saving may fail. Start Gateway and retry.

### 1.6 Publish the app

1. In **Version Management & Release**, create a version and submit it.
2. Finish the review and release process required by your enterprise.

---

## 2. Configure Feishu in OpenClaw Desktop

### Option A: Use the Desktop configuration UI

1. Open **OpenClaw Desktop** and go to **Config Manager** -> **Channels**.
2. Click **Add Channel** and choose **Feishu**.
3. Fill in:
   - **App ID** from the Feishu platform
   - **App Secret** from the Feishu platform
4. Configure policies as needed:
   - **DM Policy**
     - `pairing` (default): a new user must be approved by running `openclaw pairing approve feishu <pairing-code>`
     - `allowlist`: only users listed in **Allow From** can talk to the bot
     - `open`: any user can talk to the bot directly
     - `disabled`: disable direct messages
   - **Group Policy** such as `open`, `allowlist`, or `disabled`
   - **Streaming** such as `off`, `partial`, `block`, or `progress`
5. If you use international **Lark**, set **Domain** to `lark`.
6. Save the config and make sure **Gateway is running**.

### Option B: Edit the config file directly

The config file is usually `~/.openclaw/openclaw.json` or the file managed by Desktop.

Example `channels.feishu` config:

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "accounts": {
        "main": {
          "appId": "cli_yourAppID",
          "appSecret": "yourAppSecret",
          "botName": "My AI Assistant"
        }
      },
      "allowFrom": ["ou_ff21106b19c68ad74c59002f15e26ffd"]
    }
  }
}
```

- With `dmPolicy: "pairing"`, you do not need `allowFrom`. New users receive a pairing code and must be approved with `openclaw pairing approve feishu <pairing-code>`.
- With `dmPolicy: "allowlist"`, list the allowed Feishu user **open_id** values in `allowFrom`, for example `ou_xxx`. You can find an `open_id` in Gateway logs, in the pairing list, or through the Feishu API after the user messages the bot.

For Lark, add `domain`:

```json
"feishu": {
  "enabled": true,
  "domain": "lark",
  "accounts": { "main": { "appId": "...", "appSecret": "..." } }
}
```

---

## 3. Approve Direct Messages or Use an Allowlist

### Pairing mode (`dmPolicy: pairing`)

1. When a user sends a first message to the bot, they receive a response similar to:
   ```text
   OpenClaw: access not configured.
   Your Feishu user id: ou_xxxxxxxx
   Pairing code: XXXXXXXX
   Ask the bot owner to approve with:
   openclaw pairing approve feishu XXXXXXXX
   ```
2. On the machine running OpenClaw, open a terminal or the Desktop terminal and run:
   ```bash
   openclaw pairing approve feishu XXXXXXXX
   ```
3. After approval, the user can message the bot normally.

To list pending approvals:

```bash
openclaw pairing list feishu
```

### Allowlist mode (`dmPolicy: allowlist`)

1. In **Config Manager** -> **Channels** -> **Feishu**, set **DM Policy** to **allowlist**.
2. Fill **Allow From** with one or more Feishu **open_id** values.
3. Save the config. Only listed users can start direct chats with the bot.

To find your own `open_id`, trigger pairing once and read the value in the bot reply, or inspect the output of `openclaw pairing list feishu`.

---

## 4. Validate the Setup

1. Confirm that **Gateway is running** from the Desktop menu, tray, or console page.
2. Find the bot in Feishu and open the conversation.
3. Send a test message:
   - in pairing mode, approve the pairing code first
   - in allowlist mode, confirm your `open_id` is listed
4. In group chats, the bot normally requires an `@` mention before it responds, unless that rule is disabled for the target group.

For more details, see the official OpenClaw Feishu docs: [Feishu - OpenClaw](https://docs.openclaw.ai/channels/feishu).

---

## 5. References

- Feishu Open Platform: <https://open.feishu.cn/app>
- Lark Open Platform: <https://open.larksuite.com/app>
- OpenClaw Feishu docs (English): <https://docs.openclaw.ai/channels/feishu>
- OpenClaw Feishu docs (Chinese): <https://docs.openclaw.ai/zh-CN/channels/feishu>

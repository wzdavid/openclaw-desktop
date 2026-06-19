# OpenClaw Desktop

[English](./README.md) | 简体中文

OpenClaw Desktop 是 OpenClaw 的跨平台桌面工作台。

它把原本更偏命令行、配置文件和手动运维的 OpenClaw 体验，整理成一个更容易安装、理解、配置和日常使用的桌面应用。无论你是个人用户、开发者，还是希望长期运行 AI Agent 的团队，都可以通过统一界面完成聊天、模型接入、技能管理、多 Agent 协作和自动化任务。

## 概览

OpenClaw 的能力很强，但并不是每个人都愿意从终端、环境变量和配置文件开始。

OpenClaw Desktop 主要面向这些使用上的痛点：

- 安装门槛高：希望下载后即可运行，而不是先准备一整套环境
- 配置复杂：希望通过界面完成 Provider、Agent、Channels、Secrets、Tools 配置
- 能力分散：希望把聊天、技能、文件、终端、记忆、分析整合到一个工作台
- 维护成本高：希望把更新、连接、诊断、恢复做成默认能力
- 首次成功率低：希望第一次打开就能尽快得到结果，而不是先研究文档

## 核心特性

### 开箱即用的桌面体验

- 一键启动，无需手动安装 Node.js
- 自动更新，降低手动升级成本
- 当前提供 macOS / Windows 安装包
- 更适合长期驻留和日常使用，而不只是一次性启动

### 面向日常使用的聊天与工作台

- 提供现代化聊天界面和多页面桌面工作台
- 在一个应用中完成聊天、配置、技能、文件、终端和分析等操作
- 适合把 OpenClaw 从“能跑”变成“日常可用”

### 可视化配置 OpenClaw

- 通过界面管理 AI Providers、Agents、Channels、Secrets、Tools
- 降低手动编辑配置文件的频率
- 让更多非工程用户也能完成基础配置

### 技能与扩展能力

- 内置 Skills 页面
- 支持浏览、安装、导入和管理技能
- 支持本地技能导入
- 支持从技能目录和技能市场发现可用能力

### 自动化与多 Agent 协作

- 支持定时任务与自动化运行
- 支持多 Agent 工作流
- 适合长期运行和面向场景的任务组织方式

### 桌面端集成能力

- 自动更新
- 托盘与系统集成
- 本地运行时管理
- 更稳定地承载 OpenClaw 桌面端体验

## 使用场景

- 搭建个人 AI 助手工作台
- 管理多 Agent 配置和运行状态
- 安装和维护技能与工具集
- 运行定时任务与自动化流程
- 查看文件、日志、终端输出与分析信息
- 作为 OpenClaw 的桌面控制中心

## 界面预览

以下截图来自 `v0.4.0` 发布文章中的实际界面。

### 对话与结果展示

![对话与结果展示](./docs/images/readme/wechat-03.png)

### 文件结果卡片

![文件结果卡片](./docs/images/readme/wechat-04.png)

### 文件管理与预览

![文件管理与预览](./docs/images/readme/wechat-05.png)

### 提供方选择

![提供方选择](./docs/images/readme/wechat-06.png)

### 工具配置

![工具配置](./docs/images/readme/wechat-07.png)

### 设置与连接信息

![设置与连接信息](./docs/images/readme/wechat-10.png)

## 安装

### 下载发行版

大部分用户建议直接从 [GitHub Releases](https://github.com/wzdavid/openclaw-desktop/releases) 页面下载适合自己平台的安装包，而不是从源码启动。

![下载安装入口](./docs/images/readme/wechat-09.png)

当前提供的发行版：

| 平台 | 推荐安装包 |
|---|---|
| macOS Apple Silicon | `OpenClaw.Desktop-<version>-arm64.dmg` |
| macOS Intel | `OpenClaw.Desktop-<version>.dmg` |
| Windows x64 | `OpenClaw.Desktop.Setup.<version>.exe` |

说明：

- 当前暂不提供 Linux 发行版
- macOS 用户优先下载 `.dmg`
- Windows 用户优先下载 `.exe`
- `.zip` 文件主要用于便携分发或手动解压使用

### 安装后即可开始使用

首次启动后，通常只需要完成下面几步：

1. 连接或初始化 OpenClaw Gateway
2. 配置 AI Provider
3. 选择默认模型
4. 安装所需技能
5. 创建第一个 Agent，或者直接开始聊天

## 快速开始

### 开发

```bash
npm install
npm run bundle:node        # macOS / Linux
npm run bundle:node:win    # Windows
npm run dev
```

### 构建

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

构建产物默认生成在 `release/` 目录。

## 与传统 OpenClaw 使用方式相比

| 场景 | 传统方式 | OpenClaw Desktop |
|---|---|---|
| 安装启动 | 需要准备环境与命令 | 桌面应用直接启动 |
| Provider 配置 | 手动改配置 | 可视化管理 |
| 技能管理 | 命令行或手动目录操作 | 图形化浏览与管理 |
| 多功能入口 | 分散在 CLI、文件和 Web | 集成在同一个桌面工作台 |
| 日常使用 | 偏工程化 | 更适合个人和团队长期使用 |

## CI/CD

- `Build` 工作流：执行构建验证并上传 artifacts，但不发布
- `Release` 工作流：推送 `v*` tag 后自动发布到 GitHub Releases

发布示例：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 文档导航

- 英文文档入口：`docs/README.md`
- 中文文档入口：`docs/README.zh-CN.md`
- 构建与发布配置：`docs/build-release/config-build-release.zh-CN.md`
- 开源前检查清单：`docs/open-source-checklist.zh-CN.md`
- FAQ 与故障排查：`docs/support/faq-and-troubleshooting.zh-CN.md`
- 贡献指南：`CONTRIBUTING.zh-CN.md`
- 安全策略：`SECURITY.zh-CN.md`

## 致谢

OpenClaw Desktop 基于以下项目的工作与启发：

1. OpenClaw: https://github.com/openclaw/openclaw
2. AEGIS Desktop: https://github.com/rshodoskar-star/openclaw-desktop

## License

本项目使用 MIT License，详见 `LICENSE` 文件。

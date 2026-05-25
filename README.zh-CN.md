# 🦞 OpenClaw Desktop

[English](./README.md) | [简体中文](./README.zh-CN.md)

OpenClaw Desktop 是 OpenClaw 的跨平台桌面客户端，提供开箱即用的本地应用体验。

## 核心特性

- 一键启动，无需手动安装 Node.js
- 桌面聊天与控制台界面，连接 OpenClaw Gateway
- 自动更新，发布源为主仓库 Releases
- 支持 macOS / Windows / Linux

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

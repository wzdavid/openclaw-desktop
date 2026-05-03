# 🦞 OpenClaw Desktop

OpenClaw Desktop 是 OpenClaw 的跨平台桌面客户端，提供开箱即用的本地应用体验。

## 核心特性

- 一键启动，无需手动安装 Node.js
- 桌面聊天与控制台界面，连接 OpenClaw Gateway
- 自动更新（发布源：主仓库 Releases）
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

构建产物默认在 `release/` 目录。

## CI/CD

- `Build` 工作流：构建验证 + 上传 artifacts（不发布）
- `Release` 工作流：`v*` tag 触发正式发布到 GitHub Releases

发布示例：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 文档导航

- 项目文档：`docs/README.md`
- 构建与发布配置：`docs/build-release/config-build-release.md`
- 开源前检查清单：`docs/open-source-checklist.md`
- FAQ 与故障排查：`docs/support/faq-and-troubleshooting.md`
- 贡献指南：`CONTRIBUTING.md`
- 安全策略：`SECURITY.md`

## 致谢

OpenClaw Desktop 基于以下项目的工作与启发：

1. OpenClaw: https://github.com/openclaw/openclaw
2. AEGIS Desktop: https://github.com/rshodoskar-star/openclaw-desktop

## License

MIT

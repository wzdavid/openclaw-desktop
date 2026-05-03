## 配置、构建与发布

本文件描述当前生效的配置、构建与发布模式（开源后主仓库统一发布）。

---

### 1. 应用配置

- 可在项目根目录使用 `.env` / `.env.local` 覆盖默认参数：

```env
OPENCLAW_PORT=18789
OPENCLAW_NODE_PATH=/path/to/node
```

- OpenClaw Desktop 依赖 OpenClaw 配置文件 `~/.openclaw/openclaw.json`。

---

### 2. 本地构建

- 开发：

```bash
npm install
npm run bundle:node
npm run dev
```

- 生产构建：

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

- 产物默认在 `release/` 目录。

---

### 3. GitHub Actions 工作流

当前采用双工作流：

- `build.yml`（构建验证）
  - 触发：`main` 分支提交、PR、手动触发
  - 行为：构建并上传 Actions artifacts
  - 不发布 GitHub Release（`--publish never`）

- `release.yml`（正式发布）
  - 触发：`v*` tag、手动触发
  - 行为：构建并发布到主仓库 Releases

手动验证构建：

1. 打开 GitHub Actions。
2. 选择 `Build`。
3. 点击 `Run workflow`。
4. 在运行结果下载 `macos-x64-release` / `macos-arm64-release` / `windows-release` artifacts。

正式发布：

```bash
git tag v0.4.0
git push origin v0.4.0
```

---

### 4. macOS 签名与公证

CI 需要以下 Secrets：

- `MAC_CERTS`
- `MAC_CERTS_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

发布 workflow 会在 macOS job 中完成签名与 notarization。

---

### 5. 自动更新与发布仓库

当前自动更新和发布均指向主仓库 `wzdavid/openclaw-desktop`：

| 组件 | 当前值 |
|---|---|
| `package.json` `build.publish.repo` | `openclaw-desktop` |
| `electron/updater.ts` `GITHUB_REPO` | `openclaw-desktop` |
| CI 发布凭据 | `GITHUB_TOKEN`（workflow 权限 `contents: write`） |

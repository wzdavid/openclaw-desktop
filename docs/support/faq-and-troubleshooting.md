## FAQ 与故障排查

本文件汇总常见问题与排查建议，便于用户在遇到问题时自助解决。

---

### 1. 常见问题（FAQ）

#### Q1：应用内终端里输入 `openclaw` 提示 command not found？

- Desktop 已在内置终端中自动把**捆绑的 OpenClaw CLI** 加入 PATH，理论上新开的终端可以直接运行：
  - `openclaw gateway status`
  - `openclaw pairing approve`
  - 等其它 OpenClaw 命令。
- 若仍然报 `command not found`，请检查：
  1. 构建时是否执行过 `npm run bundle:node`（或使用官方已捆绑的安装包）；
  2. `resources/node/` 目录下是否存在 Node 与 OpenClaw 相关文件。

#### Q2：OpenClaw 实际安装在什么位置？系统终端怎么用？

- **应用内终端**：
  - OpenClaw 随应用捆绑，位于应用资源目录的 `node/node_modules/openclaw/`；
  - 开发环境下路径通常类似：`./resources/node/node_modules/openclaw/`。
- **系统终端（zsh、PowerShell 等）**：
  - 默认不会自动把应用内捆绑的 CLI 注入系统 PATH；
  - 使用方式：
    1. 全局安装：
       - `npm install -g openclaw`
    2. 直接调用应用内 Node + CLI（路径因平台和安装位置而异）：
       - 开发环境示例：  
         `./resources/node/bin/node ./resources/node/node_modules/openclaw/openclaw.mjs gateway status`

#### Q3：启动时提示 "openclaw.mjs not found" 怎么办？

- 这种情况通常说明还没有完成「捆绑 Node + OpenClaw」的初始化步骤。
- 解决方法：
  - 开发环境：运行 `npm run bundle:node`（或在 Windows 上运行 `npm run bundle:node:win`）；
  - 生产环境：优先使用已经正确打包的官方安装包，而不是自己直接运行源码。

#### Q4：端口 18789 被占用怎么办？

- 默认 Gateway 端口为 `18789`。若被占用：
  - 在 `.env` 中设置其它端口，例如：

```env
OPENCLAW_PORT=18800
```

  - 或在系统终端中查找并关闭占用进程，例如 macOS：

```bash
lsof -i :18789
```

- 产品层面建议：
  - 在桌面应用中对该错误给出清晰提示和操作建议，而不是简单报错后退出。

#### Q5：首次使用 OpenClaw 如何配置？

- 建议通过 Desktop 的 Control UI（在 Electron 窗口中打开的控制台/配置页面）：
  - 按页面引导配置 API Key、默认模型等；
  - 核心配置最终落地到 `~/.openclaw/openclaw.json` 中。

#### Q6：可以修改「Main Agent」的名称吗？

- 可以。一般有两种方式：
  1. 在 Desktop 应用内：
     - 打开 **配置 → 智能体**；
     - 在智能体列表中找到主智能体（`id = main`），编辑其名称；
  2. 直接编辑 OpenClaw 配置：
     - 在 `~/.openclaw/openclaw.json` 中找到 `agents.list` 里 `id = main` 的项；
     - 为其设置或修改 `name` 字段。
- 修改完成后，聊天页左上角与对话中的助手展示应同步更新。

#### Q7：构建时提示 "skipped macOS application code signing" 有什么影响？

- 含义：
  - 当前构建没有进行签名（或仅进行了部分签名）；
  - 构建产物在本机仍可使用。
- 影响：
  - 对个人/测试环境影响不大；
  - 若要对外大规模分发，建议配置完整的签名与公证，以减少用户侧的安全弹窗和失败风险。

#### Q8：国内访问 GitHub 不稳定 / 更新检查失败或下载很慢怎么办？

- **原因**：应用默认从 GitHub Releases 检查更新并下载安装包，在国内常出现连接不稳定或下载速度很慢的情况。
- **建议**：
  1. **手动更新**：在应用内打开「设置」或「关于」→ 点击「检查更新」；若提示无法连接，可点击「打开下载页」或「手动下载」，在文档/下载页中选择**国内可用链接**（如 Gitee 镜像、对象存储 CDN、网盘等，以项目实际提供的为准）下载对应平台安装包后覆盖安装。
  2. **使用代理**：若您已配置系统或网络代理，可尝试在代理环境下再次「检查更新」或让自动更新在后台完成下载。
  3. **关闭自动更新**：若暂时不需要更新，可在设置中关闭「启动时检查更新」，需要时再手动检查或从上述下载页获取新版本。
- 更多设计说明见 [更新与版本管理设计（§4 国内/多源更新方案）](../architecture/update-design.md#4-国内--多源更新方案应对-github-不可用与慢速)。

---

### 2. 故障排查指南

以下是一些常见问题的排查路径，可以在开发和运维时使用。

#### 2.1 应用无法连接 Gateway

1. 确认 Gateway 是否启动：
   - 在应用内 Console/控制台页面查看状态；
   - 或在终端中执行 `openclaw gateway status`。
2. 检查端口配置：
   - 是否修改过 `.env` 中的 `OPENCLAW_PORT`；
   - 对应端口是否被其他进程占用。
3. 查看日志：
   - 打开 Console 页面查看最近日志输出；
   - 如有必要，在系统终端中手动启动 Gateway 观察更详细日志。

#### 2.2 桌面应用白屏或前端加载失败

1. 确认前端构建是否成功（开发模式下）：
   - `npm run dev` 是否有报错；
   - Vite 开发服务器是否正常启动。
2. 检查 Electron 打包/构建日志：
   - 是否有文件缺失、路径错误或权限问题。
3. 清理并重新构建：
   - 删除临时构建目录（如 `dist/`、`dist-electron/`、`release/` 等）；
   - 重新执行 `npm install`、`npm run bundle:node`、`npm run dev` 或对应构建命令。

#### 2.3 自动更新失败或异常

1. 检查网络环境：
   - 是否能够访问 GitHub Releases；
   - 是否存在代理、公司内网拦截等情况。
2. 检查 `owner` / `repo` 配置：
   - `electron/updater.ts` 与 `package.json` 中的 `GITHUB_REPO` / `build.publish.repo` 是否都指向 `openclaw-desktop`；
   - 主仓库 Releases 需保持可访问。
3. 查看日志：
   - 在应用日志中查找 `electron-updater` 相关输出，定位错误代码与信息。

#### 2.4 签名 / 公证相关错误

1. 本机构建：
   - 检查 `.env.apple` 是否存在且内容正确；
   - 确认证书已安装在钥匙串中，且 `TEAM_ID` 等信息无误。
2. CI 构建：
   - 检查 GitHub Actions 中的 Secrets 是否填写正确；
   - 检查流水线日志中是否有证书导入、登录 Apple 服务失败等信息。

---

### 3. 建议的后续改进

从产品角度出发，后续可以考虑：

- 在 Desktop UI 内增加「帮助与支持」页面：
  - 以卡片形式呈现本文档中的部分 FAQ；
  - 提供「复制诊断信息」功能，方便用户反馈问题；
  - 提供快速跳转到在线文档或 GitHub Issues 的入口。
- 在出现错误时链接到对应的 FAQ 条目：
  - 例如端口占用、找不到 `openclaw.mjs` 等常见错误；
  - 点击错误提示中的「查看帮助」打开相应的说明。

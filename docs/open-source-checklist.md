# 开源前检查清单

本清单用于 OpenClaw Desktop 首次开源前的最终确认。建议在仓库公开前逐项打勾。

## 1. 代码与安全

- [ ] 仓库中不存在明文密钥、证书、令牌、账号密码。
- [ ] `.env*`、证书文件、临时调试文件已在 `.gitignore` 中且未被提交。
- [ ] 不包含仅内部可见的 URL、主机名、路径或联系人信息。
- [ ] 安全披露入口可用（`SECURITY.md` 与 GitHub Security 配置一致）。

## 2. 文档一致性

- [x] `README.md` 与 `docs/README.md` 导航链接全部可用。
- [x] 文档仅描述当前有效方案，不包含已废弃流程说明。
- [x] 构建、发布、更新路径在文档中表述一致。
- [x] 贡献与协作文档齐全：`CONTRIBUTING.md`、`SECURITY.md`、Issue/PR 模板、`CODEOWNERS`。

## 3. 工作流与发布

- [ ] `Build` 工作流可在 `main` 或 PR 上成功运行。
- [ ] `Build` 工作流 artifacts 可下载且命名与文档一致。
- [ ] `Release` 工作流可由 `v*` tag 成功触发。
- [ ] macOS 签名与 notarization 流程可稳定通过。
- [ ] GitHub Release 资产完整（安装包、更新元数据、blockmap）。

## 4. 更新与安装验证

- [x] 应用内更新源与发布源一致（主仓库 Releases）。
- [ ] 新安装路径可用（macOS / Windows 至少各验证一次）。
- [ ] 升级路径可用（从旧版本升级到当前版本至少验证一次）。
- [x] FAQ 中常见安装/更新问题有对应排障指引。

## 5. 仓库公开准备

- [ ] 仓库简介、主题标签、License、主页链接已完善。
- [ ] 默认分支保护策略已配置（如需要）。
- [ ] 首个公开版本的 Release Notes 已准备。
- [ ] 对外沟通文案已准备（发布说明/公告）。

## 6. 公开后 24 小时观察项

- [ ] Actions 运行稳定，无高频失败。
- [ ] Issue 模板可正常使用，反馈入口清晰。
- [ ] 用户下载与安装反馈无阻塞问题。
- [ ] 更新检查与下载链路无明显异常。

---

## 本次执行记录（2026-05-02）

已完成的本地自动检查：

- 文档链接检查：`docs/` 全量相对链接校验通过；并修复了 `providers-configuration.md` 中 2 个失效链接。
- 文档入口检查：`README.md` 与 `docs/README.md` 相对链接校验通过。
- 配置一致性检查：`package.json` 发布目标与 `electron/updater.ts` 更新源均指向主仓库。
- 工作流结构检查：`build.yml`（仅构建与 artifacts）与 `release.yml`（tag 发布）职责分离清晰。
- 最小构建检查：`npm run generate:provider-catalog` 执行成功。

待在 GitHub 侧人工完成：

- `Build` / `Release` 工作流实跑与产物完整性确认。
- macOS 签名、公证稳定性确认。
- 新装/升级路径实机验证。
- 仓库公开设置（分支保护、Release Notes、对外公告）确认。

---

## 下一步操作（人工执行）

按以下顺序执行，完成后可判定是否进入公开阶段。

### 1) 运行 Build 工作流（验证构建链路）

1. 打开 GitHub 仓库 `Actions` 页面。
2. 选择 `Build` 工作流，点击 `Run workflow`。
3. 选择 `main` 分支并运行。
4. 等待 `build-mac-x64`、`build-mac-arm64`、`build-win` 全部成功。
5. 在 run 页面下载 artifacts，确认存在：
   - `macos-x64-release`
   - `macos-arm64-release`
   - `windows-release`

### 2) 运行 Release 工作流（验证正式发布链路）

1. 在本地创建测试 tag（示例）：
   ```bash
   git tag v0.4.0-rc.1
   git push origin v0.4.0-rc.1
   ```
2. 打开 GitHub `Actions`，确认 `Release` 工作流自动触发并成功。
3. 打开仓库 `Releases`，确认该版本下资产齐全：
   - macOS: `.dmg`、`-mac.zip`、`latest-mac.yml`、对应 `.blockmap`
   - Windows: `.exe`、`latest.yml`、对应 `.blockmap`

### 3) 安装与升级验证（实机）

1. 使用 Release 资产在 macOS、Windows 各做一次全新安装。
2. 从旧版本升级到当前测试版本，确认可完成升级与启动。
3. 应用内执行“检查更新”，确认能命中主仓库 Release。

### 4) 失败回滚（测试 tag）

若本次测试发布异常，删除测试 tag 与测试 release 后再修复重跑：

```bash
# 删除远端 tag
git push origin :refs/tags/v0.4.0-rc.1

# 删除本地 tag
git tag -d v0.4.0-rc.1
```

GitHub 上对应测试 Release 可在页面手动删除。

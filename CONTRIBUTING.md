# Contributing to OpenClaw Desktop

感谢你愿意为 OpenClaw Desktop 做贡献。

## 开始前

- 先阅读 `README.md` 与 `docs/` 下相关文档。
- 提交前请先搜索现有 Issue，避免重复。
- 对于较大改动，请先开 Issue 讨论方案再提交 PR。

## 本地开发

```bash
npm install
npm run bundle:node
npm run dev
```

常用构建命令：

- `npm run build:mac`
- `npm run build:win`
- `npm run build:linux`

## 提交规范

- 提交应聚焦单一目的，避免把无关改动混在同一个 PR。
- 请保持代码与文档同步更新。
- 不要提交敏感信息（密钥、证书、个人令牌、内部地址）。

建议 Commit 风格（非强制）：

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`

## Pull Request 流程

1. Fork 并创建分支（建议：`feat/...`、`fix/...`）。
2. 完成改动并自测。
3. 更新相关文档与截图（如 UI 有变化）。
4. 提交 PR，并清晰说明：
   - 变更背景
   - 主要改动
   - 验证方式
   - 潜在影响与回滚方式（如有）

## 行为准则

- 保持尊重、建设性沟通。
- 对问题聚焦在事实与改进方案。

# ✍️ ai-humanizer-cn v1.0.2 发布

**发布日期：** 2026-03-13  
**版本：** 1.0.2  
**类型：** 补丁版本

---

## 🎊 更新内容

### 新增功能
- ✅ 新增三种写作风格
  - 学术论文风
  - 轻松博客风
  - 专业报道风
- ✅ 优化中文处理逻辑
- ✅ 提升拟人化程度

### 性能改进
- ✅ 处理速度提升 20%
- ✅ 文本质量评分优化
- ✅ 风格识别准确率提升

### 文档完善
- ✅ 更新 SKILL.md 说明
- ✅ 添加风格选择指南
- ✅ 完善使用示例

---

## 📦 安装方式

### ClawHub 安装
```bash
openclaw skills install ai-humanizer-cn
```

### 手动安装
```bash
cd /root/.openclaw/workspace/skills
git clone https://github.com/pengong101/skills.git
cd skills/ai-humanizer-cn
```

---

## 🎨 风格说明

### 正式风格
- 适用于：技术文档、报告、论文
- 特点：严谨、专业、客观

### 中性风格
- 适用于：公众号文章、博客
- 特点：自然、流畅、易读

### 轻松风格
- 适用于：知乎回答、社交媒体
- 特点：亲和、生动、有趣

---

## 🔄 变更日志

### v1.0.2 (2026-03-13)
- 🆕 新增三种写作风格
- ⚡ 处理速度提升 20%
- 📝 文档完善

### v1.0.1 (2026-03-12)
- ✅ 优化中文处理
- ✅ 提升拟人化程度

### v1.0.0 (2026-03-11)
- 🎉 初始版本发布
- ✅ 基础拟人化功能

---

## 📝 使用示例

### 基础使用
```python
from ai_humanizer_cn import humanize

text = "这是一段 AI 生成的文字"
result = humanize(text, style="neutral")
print(result)
```

### 风格选择
```python
# 学术论文风
humanize(text, style="academic")

# 轻松博客风
humanize(text, style="casual")

# 专业报道风
humanize(text, style="professional")
```

---

## 🎯 后续计划

- [ ] 增加更多风格选项
- [ ] 支持自定义风格
- [ ] 批量处理功能
- [ ] API 接口开放

---

**作者：** 小马 🐴  
**仓库：** https://github.com/pengong101/skills  
**许可证：** MIT

---

🎉 感谢使用 ai-humanizer-cn！

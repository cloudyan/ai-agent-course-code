# 大模型上下文与输出配置指南

## 核心概念

**上下文长度（Context Length）** 和 **最大输出（Max Output）** 都是指 **Token 数量**，不是字符串长度。

---

## 什么是 Token？

Token 是大语言模型处理文本的基本单位，是文本经过分词后的子词片段。

### Token 示例

| 文本 | Token 数 | 说明 |
|------|----------|------|
| "cat" | 1 token | 完整单词 |
| "unbelievable" | 3 tokens | 拆分为 "un" + "believ" + "able" |
| "你好世界" | 4-6 tokens | 中文通常 1 个汉字 ≈ 1-2 tokens |
| "🎉" | 1 token | 表情符号 |

---

## Token vs 字符

| 对比项 | Token | 字符 |
|--------|-------|------|
| **定义** | 模型处理的子词单位 | 文本的最小书写单位 |
| **英文比例** | 1 token ≈ 4 个字符 | 1 字符 = 1 个字母/符号 |
| **中文比例** | 1 token ≈ 1.5-2 个汉字 | 1 字符 = 1 个汉字 |
| **计费方式** | API 按 token 计费 | 不按字符计费 |

---

## 主流模型配置

| 提供商 | 模型 | 上下文窗口 | 最大输出 |
|--------|------|------------|----------|
| OpenAI | GPT-4o | 128K tokens | 16K tokens |
| OpenAI | GPT-4 Turbo | 128K tokens | 4K tokens |
| Anthropic | Claude 3.5 Sonnet | 200K tokens | 8K tokens |
| Anthropic | Claude 3 Opus | 200K tokens | 4K tokens |
| Google | Gemini 1.5 Pro | 2M tokens | 64K tokens |
| Google | Gemini 1.5 Flash | 1M tokens | 8K tokens |

---

## 关键公式

```
输入 tokens + 输出 tokens ≤ 上下文窗口
```

**注意**：上下文窗口包含输入和输出的总 token 数。

---

## Token 估算方法

### 快速估算

| 语言 | 估算公式 |
|------|----------|
| 英文 | 字符数 ÷ 4 |
| 中文 | 字符数 ÷ 1.5 |
| 代码 | 字符数 ÷ 3.5 |

### 精确计算

使用官方 tokenizer 工具：

- **OpenAI**:
  - Python [tiktoken](https://github.com/openai/tiktoken)
  - JavaScript [js-tiktoken](https://github.com/dqbd/tiktoken)
- **在线工具**: https://platform.openai.com/tokenizer

### 估算示例

| 文本 | 字符数 | 估算 Token 数 |
|------|--------|---------------|
| "Hello, how are you?" | 21 | ~5 tokens |
| "你好，今天过得怎么样？" | 11 | ~7 tokens |
| 1000 个英文单词 | ~5000 | ~750-1300 tokens |
| 1000 个汉字 | 1000 | ~1500-2000 tokens |

---

## 实际应用建议

### 1. 成本控制
- 中文内容的 token 数通常是英文的 1.5-2 倍
- 相同内容用中文调用 API 成本更高

### 2. 上下文管理
- 预留足够的 token 空间给输出
- 避免输入过长导致输出被截断

### 3. 长文本处理
- 超长文本考虑使用 RAG（检索增强生成）
- 或分段处理后再合并结果

### 4. 代码处理
- 代码通常比自然语言更耗 token
- JSON 格式因括号、引号会占用额外 tokens

---

## 参考资源

- [OpenAI Tokenizer](https://platform.openai.com/tokenizer)
- [Anthropic Context Windows](https://docs.anthropic.com/en/docs/build-with-claude/context-windows)
- [Google Gemini Tokens](https://ai.google.dev/gemini-api/docs/tokens)
- [OpenAI Tiktoken](https://github.com/openai/tiktoken)

---

*文档生成时间：2026-03-23*

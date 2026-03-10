# 课程列表

## 项目设置

本仓库使用 pnpm workspace 管理依赖，所有依赖统一安装在根目录。

### 快速开始

```bash
# 安装依赖（在项目根目录执行）
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key

# 运行示例
cd tool-test
node src/xxx.mjs
```

### 环境变量说明

子目录通过 symlink 自动共享根目录的 `.env` 文件，无需在每个子目录重复配置。

如需为某个子目录使用独立的环境变量，可以删除该目录的 `.env` symlink 并创建新文件：

```bash
cd tool-test
rm .env
cat > .env << EOF
OPENAI_API_KEY="your-key"
EOF
```

---

## 1. [Tool 使用 (tool-test)](./tool-test/)

大模型工具调用和 MCP (Model Context Protocol) 相关示例

### 基础示例
- [hello-langchain.mjs](./tool-test/src/hello-langchain.mjs) - LangChain 入门示例
- [all-tools.mjs](./tool-test/src/all-tools.mjs) - 综合工具调用示例

### MCP 相关
- [my-mcp-server.mjs](./tool-test/src/my-mcp-server.mjs) - 自定义 MCP 服务器
- [mcp-test.mjs](./tool-test/src/mcp-test.mjs) - MCP 测试
- [langchain-mcp-test.mjs](./tool-test/src/langchain-mcp-test.mjs) - LangChain 集成 MCP

### 实践案例
- [mini-cursor.mjs](./tool-test/src/mini-cursor.mjs) - Mini Cursor 流式录入
- [node-exec.mjs](./tool-test/src/node-exec.mjs) - Node.js 执行命令
- [tool-file-read.mjs](./tool-test/src/tool-file-read.mjs) - 文件读取工具

---

## 2. [Output Parser (output-parser-test)](./output-parser-test/)

输出解析器，结构化输出相关示例

### 基础解析器
- [normal.mjs](./output-parser-test/src/normal.mjs) - 普通输出
- [stream-normal.mjs](./output-parser-test/src/stream-normal.mjs) - 流式输出
- [json-output-parser.mjs](./output-parser-test/src/json-output-parser.mjs) - JSON 输出解析
- [xml-output-parser.mjs](./output-parser-test/src/xml-output-parser.mjs) - XML 输出解析

### 结构化输出
- [structured-output-parser.mjs](./output-parser-test/src/structured-output-parser.mjs) - 结构化输出解析
- [structured-output-parser2.mjs](./output-parser-test/src/structured-output-parser2.mjs) - 结构化输出解析示例 2
- [structured-json-schema.mjs](./output-parser-test/src/structured-json-schema.mjs) - JSON Schema 结构化输出
- [with-structured-output.mjs](./output-parser-test/src/with-structured-output.mjs) - withStructuredOutput 使用

### 流式结构化输出
- [stream-with-structured-output.mjs](./output-parser-test/src/stream-with-structured-output.mjs) - 流式结构化输出
- [stream-structured-partial.mjs](./output-parser-test/src/stream-structured-partial.mjs) - 流式结构化输出（Partial）

### Tool Calls
- [tool-calls-args.mjs](./output-parser-test/src/tool-calls-args.mjs) - Tool Calls 参数解析
- [stream-tool-calls-raw.mjs](./output-parser-test/src/stream-tool-calls-raw.mjs) - 原始 Tool Calls 流
- [stream-tool-calls-parser.mjs](./output-parser-test/src/stream-tool-calls-parser.mjs) - Tool Calls 流解析

---

## 3. [Prompt Template (prompt-template-test)](./prompt-template-test/)

提示词模板相关示例

### 基础模板
- [prompt-template1.mjs](./prompt-template-test/src/prompt-template1.mjs) - 基础提示词模板
- [chat-prompt-template.mjs](./prompt-template-test/src/chat-prompt-template.mjs) - 对话提示词模板
- [chat-prompt-template2.mjs](./prompt-template-test/src/chat-prompt-template2.mjs) - 对话提示词模板 2

### Few-Shot 示例
- [fewshot-prompt-template.mjs](./prompt-template-test/src/fewshot-prompt-template.mjs) - Few-Shot 提示词模板
- [fewshot-chat-prompt-template.mjs](./prompt-template-test/src/fewshot-chat-prompt-template.mjs) - Few-Shot 对话模板

### Example Selector
- [example-selector1.mjs](./prompt-template-test/src/example-selector1.mjs) - 示例选择器 1
- [example-selector2.mjs](./prompt-template-test/src/example-selector2.mjs) - 示例选择器 2

### Pipeline
- [pipeline-prompt-template.mjs](./prompt-template-test/src/pipeline-prompt-template.mjs) - Pipeline 提示词模板
- [pipeline-prompt-template2.mjs](./prompt-template-test/src/pipeline-prompt-template2.mjs) - Pipeline 提示词模板 2
- [pipeline-prompt-template3.mjs](./prompt-template-test/src/pipeline-prompt-template3.mjs) - Pipeline 提示词模板 3

### 高级用法
- [partial.mjs](./prompt-template-test/src/partial.mjs) - Partial 偏函数应用
- [messages-placeholder.mjs](./prompt-template-test/src/messages-placeholder.mjs) - 消息占位符
- [weekly-report-examples-writer-milvus.mjs](./prompt-template-test/src/weekly-report-examples-writer-milvus.mjs) - 周报示例生成器（Milvus）

---

## 4. [Runnable (runnable-test)](./runnable-test/)

LangChain Runnable API 相关示例

- [runnable.mjs](./runnable-test/src/runnable.mjs) - Runnable 基础用法
- [before.mjs](./runnable-test/src/before.mjs) - Runnable 对比示例

---

## 5. [Memory (memory-test)](./memory-test/)

对话记忆相关示例

- [history-test.mjs](./memory-test/src/history-test.mjs) - 历史对话测试
- [history-test2.mjs](./memory-test/src/history-test2.mjs) - 历史对话测试 2
- [history-test3.mjs](./memory-test/src/history-test3.mjs) - 历史对话测试 3

---

## 6. [RAG (rag-test)](./rag-test/)

检索增强生成 (Retrieval-Augmented Generation) 相关示例

### 基础示例
- [hello-rag.mjs](./rag-test/src/hello-rag.mjs) - RAG 入门
- [loader-and-splitter.mjs](./rag-test/src/loader-and-splitter.mjs) - 文档加载和分割
- [loader-and-splitter2.mjs](./rag-test/src/loader-and-splitter2.mjs) - 文档加载和分割示例 2
- [tiktoken-test.mjs](./rag-test/src/tiktoken-test.mjs) - Token 分割测试

### Splitters
- [splitters/](./rag-test/src/splitters/) - 各种文本分割器示例

---

## 7. [Milvus 向量数据库 (milvus-test)](./milvus-test/)

Milvus 向量数据库相关示例

### 基础操作
- [insert.mjs](./milvus-test/src/insert.mjs) - 数据插入
- [query.mjs](./milvus-test/src/query.mjs) - 数据查询
- [delete.mjs](./milvus-test/src/delete.mjs) - 数据删除
- [update.mjs](./milvus-test/src/update.mjs) - 数据更新

### RAG 实践
- [rag.mjs](./milvus-test/src/rag.mjs) - RAG 检索增强生成
- [ebook-query.mjs](./milvus-test/src/ebook-query.mjs) - 电子书查询
- [ebook-reader-rag.mjs](./milvus-test/src/ebook-reader-rag.mjs) - 电子书阅读 RAG
- [ebook-writer.mjs](./milvus-test/src/ebook-writer.mjs) - 电子书写作

---

## 8. [NestJS + LangChain (hello-nest-langchain)](./hello-nest-langchain/)

NestJS 框架集成 LangChain 示例

- [app.controller.ts](./hello-nest-langchain/src/app.controller.ts) - 控制器示例
- [app.service.ts](./hello-nest-langchain/src/app.service.ts) - 服务层示例
- [app.module.ts](./hello-nest-langchain/src/app.module.ts) - 模块配置
- [ai/](./hello-nest-langchain/src/ai/) - AI 相关模块
- [book/](./hello-nest-langchain/src/book/) - 书籍相关模块

---

## 课程索引

| 序号 | 模块 | 描述 | 文件数 |
|------|------|------|--------|
| 1 | [tool-test](./tool-test/) | 工具调用和 MCP | 8 |
| 2 | [output-parser-test](./output-parser-test/) | 输出解析器 | 14 |
| 3 | [prompt-template-test](./prompt-template-test/) | 提示词模板 | 13 |
| 4 | [runnable-test](./runnable-test/) | Runnable API | 2 |
| 5 | [memory-test](./memory-test/) | 对话记忆 | 3 |
| 6 | [rag-test](./rag-test/) | RAG 检索增强生成 | 5+ |
| 7 | [milvus-test](./milvus-test/) | Milvus 向量数据库 | 8 |
| 8 | [hello-nest-langchain](./hello-nest-langchain/) | NestJS 集成 | 5+ |

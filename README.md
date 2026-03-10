# AI Agent Course Code

AI Agent 课程代码示例仓库

## 课程链接

- [课程目录](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzYzNzI2MTI2Nw==&action=getalbum&album_id=4306749160512208899#wechat_redirect)
- [答疑文档](https://www.yuque.com/shenshuoyaoyouguang-ivldp/ai-agent-course-chat/oym23csku4gtlu2z)

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 10

### 安装依赖

```bash
# 根目录安装所有依赖
pnpm install
```

### 配置环境变量

```bash
# 方式一：手动配置
cp .env.example .env

# 方式二：使用自动初始化脚本（推荐）
pnpm init:env

# 编辑 .env 填入实际的 API Key
```

子目录会自动通过 symlink 共享根目录的 `.env` 文件，无需在每个子目录重复配置。

### 运行示例

```bash
# 进入具体示例目录
cd tool-test

# 运行示例
node src/xxx.mjs
```

## 项目结构

```
.
├── tool-test/              # Tool 调用和 MCP 示例
├── output-parser-test/     # 输出解析器示例
├── prompt-template-test/   # Prompt 模板示例
├── runnable-test/          # Runnable API 示例
├── memory-test/            # 对话记忆示例
├── rag-test/               # RAG 检索增强生成示例
├── milvus-test/            # Milvus 向量数据库示例
├── hello-nest-langchain/   # NestJS 集成示例
└── list.md                 # 详细课程列表
```

## 示例列表

详见 [list.md](./list.md)

## 售后答疑

买了课程可以加微信 **guangguangsunlight** 进答疑群

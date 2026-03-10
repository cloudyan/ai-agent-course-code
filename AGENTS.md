# AI Agent 编码指南

本文件为 AI 编码助手提供本仓库的构建、测试和代码风格指南。

## 项目结构

这是一个 pnpm monorepo，包含多个 LangChain/AI 学习示例项目：

```
├── hello-nest-langchain/  # NestJS + LangChain 完整示例
├── tool-test/             # 工具调用示例
├── prompt-template-test/  # 提示词模板示例
├── output-parser-test/    # 输出解析器示例
├── rag-test/              # RAG 示例
├── memory-test/           # 记忆功能示例
├── runnable-test/         # Runnable 示例
└── milvus-test/           # Milvus 向量数据库示例
```

## 构建命令

### 根目录 (Monorepo)

```bash
# 安装所有依赖
pnpm install

# 运行所有包的开发模式
pnpm run dev

# 构建所有包
pnpm run build

# 清理所有 node_modules
pnpm run clean
```

### NestJS 项目 (hello-nest-langchain)

```bash
cd hello-nest-langchain

# 开发模式 (热重载)
pnpm run start:dev

# 生产构建
pnpm run build

# 生产运行
pnpm run start:prod
```

### 普通示例项目

```bash
cd <project-name>

# 运行示例
node src/<file>.mjs
# 或
npx tsx src/<file>.ts
```

## 测试命令

### NestJS 项目

```bash
cd hello-nest-langchain

# 运行所有测试
pnpm test

# 运行单个测试文件
pnpm test -- src/app.controller.spec.ts

# 运行特定测试模式
pnpm test -- --testNamePattern="should"

# 监视模式
pnpm run test:watch

# 覆盖率报告
pnpm run test:cov

# E2E 测试
pnpm run test:e2e
```

### Jest 配置说明

- 测试文件匹配: `*.spec.ts` 或 `*.e2e-spec.ts`
- 根目录: `src/`
- 环境: `node`
- 预设: `ts-jest`

## 代码风格

### TypeScript 配置

- **目标**: ES2023
- **模块**: NodeNext
- **严格模式**: 部分开启 (`strictNullChecks: true`)
- **装饰器**: 启用实验性装饰器 (NestJS 需要)

### ESLint 规则

```javascript
// 允许使用 any 类型
'@typescript-eslint/no-explicit-any': 'off'

// 浮动 Promise 警告
'@typescript-eslint/no-floating-promises': 'warn'

// 不安全的参数警告
'@typescript-eslint/no-unsafe-argument': 'warn'
```

### Prettier 配置

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

### 命名规范

- **类名**: PascalCase (如 `AiService`, `AppController`)
- **方法/函数**: camelCase (如 `getCompletion()`, `createChain()`)
- **变量**: camelCase
- **常量**: UPPER_SNAKE_CASE (环境变量)
- **文件**: 短横线命名 (如 `ai.service.ts`, `app.module.ts`)

### 导入规范

```typescript
// 1. 外部库导入
import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

// 2. 内部模块导入
import { AiService } from './ai.service';
import { AppModule } from '../app.module';
```

### 错误处理

```typescript
// NestJS 风格
@Injectable()
export class AiService {
  async generateResponse(prompt: string): Promise<string> {
    try {
      const result = await this.model.invoke(prompt);
      return result.content as string;
    } catch (error) {
      console.error('AI 生成失败:', error);
      throw new Error(`生成响应失败: ${error.message}`);
    }
  }
}
```

## 环境变量

所有项目共享 `.env` 文件配置：

```bash
# OpenAI 配置
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o-mini

# Milvus 配置
MILVUS_URL=http://localhost:19530

# 高德地图 API (工具调用示例)
AMAP_API_KEY=your_amap_key
```

## 常用模式

### NestJS 服务注入

```typescript
@Injectable()
export class AiService {
  private model: ChatOpenAI;

  constructor(private configService: ConfigService) {
    this.model = new ChatOpenAI({
      modelName: this.configService.get<string>('MODEL_NAME'),
      openAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }
}
```

### LangChain 链式调用

```typescript
const chain = RunnableSequence.from([
  promptTemplate,
  model,
  outputParser,
]);

const result = await chain.invoke({ input: '用户输入' });
```

## 提交前检查清单

- [ ] 代码通过 ESLint 检查: `pnpm run lint`
- [ ] 代码通过 Prettier 格式化: `pnpm run format`
- [ ] 测试通过: `pnpm test`
- [ ] TypeScript 编译无错误: `pnpm run build`

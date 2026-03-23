# LangChain 输出格式化完全指南

问下大家，用 LangChain 调用大模型的时候，你们都是怎么处理模型输出的？

直接拿字符串自己解析？还是用什么工具？

很多同学刚开始就是 `response.content` 一把梭，然后自己写正则提取，卧槽那酸爽...

其实 LangChain 提供了一整套输出格式化方案，从简单的字符串到复杂的结构化对象都有。今天晓寒就给大家彻底掰扯清楚！

---

## 为什么需要输出格式化？

大模型本质上是文本生成器，它吐出来的是字符串：

```
模型输出：
"爱因斯坦（Albert Einstein）是20世纪最伟大的物理学家之一，
他于1879年出生在德国。他的主要成就包括相对论、光电效应等。"
```

但我们在代码里需要的是：

```javascript
{
  name: "爱因斯坦",
  englishName: "Albert Einstein",
  birthYear: 1879,
  achievements: ["相对论", "光电效应"]
}
```

**输出格式化就是解决这个"文本→结构化数据"的转换问题。**

---

## LangChain 输出格式化全景图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LangChain 输出格式化体系                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. 模型原生结构化（推荐）                                    │   │
│  │     └── withStructuredOutput()                               │   │
│  │         - Function Calling / JSON Mode                       │   │
│  │         - 最可靠、最简洁                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  2. 专用解析器（特定场景）                                    │   │
│  │     ├── JsonOutputParser        - JSON 专用                   │   │
│  │     ├── StringOutputParser      - 字符串提取                  │   │
│  │     ├── CommaSeparatedListOutputParser - 逗号分隔列表         │   │
│  │     └── XMLParser               - XML 格式                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  3. 通用结构化解析器（兼容性好）                              │   │
│  │     └── StructuredOutputParser                               │   │
│  │         - Prompt Engineering + 后处理解析                     │   │
│  │         - 适用于所有模型                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  4. 自定义解析器（特殊需求）                                  │   │
│  │     └── 继承 BaseOutputParser 实现 parse() 方法               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 一、模型原生结构化：withStructuredOutput

### 核心原理

这是现代 LLM（OpenAI、Claude、Gemini 等）提供的**原生能力**，通过 **Function Calling** 或 **JSON Mode** 在 API 层面约束模型输出格式。

```
┌──────────────────────────────────────────────────────────────┐
│  withStructuredOutput 原理                                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  你的代码                                                      │
│  model.withStructuredOutput(schema) ──────┐                  │
│                                           │                  │
│                                           ▼                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  LangChain 内部转换                                    │   │
│  │                                                      │   │
│  │  Zod Schema                                          │   │
│  │     ↓                                                │   │
│  │  JSON Schema                                         │   │
│  │     ↓                                                │   │
│  │  OpenAI Function Calling 参数                         │   │
│  │  {                                                   │   │
│  │    "functions": [{                                   │   │
│  │      "name": "output",                               │   │
│  │      "parameters": { ...schema... }                  │   │
│  │    }],                                               │   │
│  │    "function_call": { "name": "output" }             │   │
│  │  }                                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  OpenAI API 处理                                       │   │
│  │                                                      │   │
│  │  模型在生成时就被约束：                                │   │
│  │  "我必须输出符合这个 JSON Schema 的格式"                │   │
│  │                                                      │   │
│  │  不是生成后再转换，而是生成时就知道格式！               │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  返回：已解析好的 JavaScript 对象（无需手动解析）              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 代码示例

```javascript
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// 1. 定义数据结构（使用 Zod）
const scientistSchema = z.object({
  name: z.string().describe('科学家姓名'),
  birthYear: z.number().describe('出生年份'),
  achievements: z.array(z.string()).describe('主要成就列表'),
  fields: z.array(z.string()).describe('研究领域')
});

// 2. 创建模型
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
});

// 3. 绑定结构化输出能力
const structuredModel = model.withStructuredOutput(scientistSchema);

// 4. 调用，直接返回结构化对象
const result = await structuredModel.invoke('介绍一下爱因斯坦');

console.log(result);
/*
{
  name: '爱因斯坦',
  birthYear: 1879,
  achievements: ['相对论', '光电效应', '质能方程'],
  fields: ['物理学', '数学']
}
*/

// 可以直接使用
console.log(`${result.name}出生于${result.birthYear}年`);
```

### 流式输出支持

```javascript
const events = await structuredModel.streamEvents(
  '介绍一下爱因斯坦',
  { version: 'v2' }
);

for await (const event of events) {
  if (event.event === 'on_chat_model_stream') {
    // 实时获取部分结构化数据
    console.log(event.data.chunk);
  }
}
```

### 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 最可靠，模型原生保证格式 | ❌ 需要模型支持 function calling |
| ✅ 代码最简洁，一行搞定 | ❌ 旧版模型可能不支持 |
| ✅ 支持流式输出 | ❌ 自定义逻辑受限 |
| ✅ 错误处理简单 | |

---

## 二、专用解析器

### 2.1 JsonOutputParser - JSON 专用

专门用于解析 JSON 格式输出。

```javascript
import { JsonOutputParser } from '@langchain/core/output_parsers';

const parser = new JsonOutputParser();

const model = new ChatOpenAI({ modelName: 'gpt-4o-mini' });
const chain = model.pipe(parser);

const result = await chain.invoke(
  '输出一个JSON对象，包含name和age字段，值为"张三"和25'
);

console.log(result); // { name: "张三", age: 25 }
```

**原理**：从模型输出中提取 JSON 字符串并解析。

### 2.2 StringOutputParser - 字符串提取

最简单的解析器，直接提取文本内容。

```javascript
import { StringOutputParser } from '@langchain/core/output_parsers';

const parser = new StringOutputParser();
const chain = model.pipe(parser);

const result = await chain.invoke('你好');
console.log(result); // "你好！我是AI助手..."
```

**原理**：提取 `response.content` 或 `response.generations[0][0].text`。

### 2.3 CommaSeparatedListOutputParser - 逗号分隔列表

用于提取逗号分隔的列表。

```javascript
import { CommaSeparatedListOutputParser } from '@langchain/core/output_parsers';

const parser = new CommaSeparatedListOutputParser();

const prompt = `列出5种水果。
${parser.getFormatInstructions()}`;

const chain = model.pipe(parser);
const result = await chain.invoke(prompt);

console.log(result); // ["苹果", "香蕉", "橙子", "葡萄", "西瓜"]
```

**原理**：在提示词中加入格式说明，然后按逗号分割解析。

### 2.4 JsonOutputToolsParser - 工具调用专用

专门用于解析 **tool_calls 格式**的 AIMessage，配合 `bindTools()` 使用。

```javascript
import { JsonOutputToolsParser } from '@langchain/core/output_parsers/openai_tools';
import { z } from 'zod';

// 1. 定义 Schema
const scientistSchema = z.object({
  name: z.string(),
  birthYear: z.number(),
  achievements: z.array(z.string())
});

// 2. 绑定工具
const modelWithTool = model.bindTools([{
  name: "extract_scientist_info",
  description: "提取科学家信息",
  schema: scientistSchema
}]);

// 3. 创建解析器 + 链
const parser = new JsonOutputToolsParser();
const chain = modelWithTool.pipe(parser);

// 4. 调用
const result = await chain.invoke("介绍一下爱因斯坦");
console.log(result);
// [{ type: "extract_scientist_info", args: { name: "爱因斯坦", ... } }]
```

#### 底层执行流程

```
┌─────────────────────────────────────────────────────────────────────┐
│  const chain = modelWithTool.pipe(parser) 底层执行流程               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. modelWithTool 是什么？                                           │
│     └── model.bindTools([{ name: "extract", schema: zodSchema }])   │
│         绑定了工具调用的模型，会强制让模型输出 tool_calls 格式         │
│                                                                     │
│                          ↓                                          │
│                                                                     │
│  2. .pipe(parser) 创建链                                             │
│     └── 创建 RunnableSequence：[modelWithTool → parser]              │
│         类似于数组：[fn1, fn2]，前一个的输出是后一个的输入              │
│                                                                     │
│                          ↓                                          │
│                                                                     │
│  3. chain.stream("介绍一下牛顿") 执行时：                              │
│                                                                     │
│     第1步：modelWithTool.invoke()                                    │
│     ├── 调用 OpenAI API with tools                                  │
│     ├── 模型返回 AIMessageChunk                                     │
│     │   {                                                           │
│     │     content: "",                                               │
│     │     tool_calls: [{                                            │
│     │       name: "extract_scientist_info",                         │
│     │       args: { name: "牛顿", birth_year: 1643, ... }  ← 流式   │
│     │     }]                                                         │
│     │   }                                                           │
│     └── 注意：args 是逐步生成的（流式）                               │
│                                                                     │
│                          ↓                                          │
│                                                                     │
│     第2步：parser.parseResult([{ message }])                         │
│     ├── 从 AIMessage 中提取 tool_calls                              │
│     ├── 解析每个 tool_call 的 args（JSON）                           │
│     └── 返回：[{ type: "extract", args: { ... } }]                  │
│                                                                     │
│                          ↓                                          │
│                                                                     │
│     最终结果：[{ name: "牛顿", birth_year: 1643, ... }]               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 核心区别：JsonOutputToolsParser vs JsonOutputParser

| 特性         | JsonOutputToolsParser    | JsonOutputParser   |
| ------------ | ------------------------ | ------------------ |
| **处理对象** | AIMessage (tool_calls)   | 纯文本字符串       |
| **使用场景** | 配合 bindTools() 使用    | 普通文本输出       |
| **输入格式** | `{ message: AIMessage }` | 纯文本             |
| **输出格式** | `[{ type, args }]`       | 直接是解析后的对象 |

#### 流式输出示例

```javascript
const stream = await chain.stream("介绍一下牛顿");

for await (const chunk of stream) {
  // chunk = [{ type: "extract_scientist_info", args: { name: "...", ... } }]
  if (chunk.length > 0) {
    const toolCall = chunk[0];
    console.log(toolCall.args);  // 实时获取部分数据
  }
}
```

**原理**：从 AIMessage 的 `tool_calls` 字段中提取工具调用信息，返回格式化的工具调用数组。

---

## 三、通用结构化解析器：StructuredOutputParser

### 核心原理

当模型**不支持 function calling** 时，使用这种方式。它通过 **Prompt Engineering** 引导模型按格式输出，然后在应用层解析。

```
┌──────────────────────────────────────────────────────────────┐
│  StructuredOutputParser 原理                                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  你的代码                                                      │
│                                                              │
│  const parser = StructuredOutputParser.fromZodSchema(schema) │
│  const formatInstructions = parser.getFormatInstructions()   │
│                                                              │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  生成的格式说明（插入提示词）                           │   │
│  │                                                      │   │
│  │  "请以以下JSON格式输出："                              │   │
│  │  "{"                                                 │   │
│  │  "  \"name\": \"string, 姓名\","                       │   │
│  │  "  \"age\": \"number, 年龄\""                        │   │
│  │  "}"                                                 │   │
│  │                                                      │   │
│  │  这只是文本建议，模型可以选择不听！                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  完整提示词 = 用户问题 + 格式说明                              │
│                           │                                  │
│                           ▼                                  │
│  模型生成文本（"尽量"按格式，但不保证）                        │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  应用层解析                                            │   │
│  │                                                      │   │
│  │  parser.parse(response.content)                      │   │
│  │     ↓                                                │   │
│  │  1. 从文本中提取 JSON 部分                            │   │
│  │  2. JSON.parse() 解析                                 │   │
│  │  3. Zod schema.validate() 验证                        │   │
│  │     ↓                                                │   │
│  │  返回结构化对象 或 抛出解析错误                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 代码示例

```javascript
import { ChatOpenAI } from '@langchain/openai';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

// 1. 定义 Schema
const scientistSchema = z.object({
  name: z.string().describe('科学家姓名'),
  birthYear: z.number().describe('出生年份'),
  achievements: z.array(z.string()).describe('主要成就')
});

// 2. 创建解析器
const parser = StructuredOutputParser.fromZodSchema(scientistSchema);

// 3. 获取格式说明
const formatInstructions = parser.getFormatInstructions();
console.log(formatInstructions);
/*
The output should be formatted as a JSON instance that conforms to the JSON schema below.

Here is the output schema:
```
{"name": "string, 科学家姓名", "birthYear": "number, 出生年份", ...}
```
*/

// 4. 构建提示词模板
const promptTemplate = new PromptTemplate({
  template: `介绍一下这位科学家：{name}

{format_instructions}`,
  inputVariables: ['name'],
  partialVariables: {
    format_instructions: formatInstructions
  }
});

// 5. 创建链
const model = new ChatOpenAI({ modelName: 'gpt-4o-mini' });
const chain = promptTemplate.pipe(model).pipe(parser);

// 6. 执行
const result = await chain.invoke({ name: '爱因斯坦' });
console.log(result);
```

### 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 适用于所有模型 | ❌ 需要手动构建提示词 |
| ✅ 灵活性高，可自定义 | ❌ 可靠性较低（模型可能不遵守格式） |
| ✅ 兼容性好 | ❌ 不支持流式输出 |
| | ❌ 需要处理解析错误 |

---

## 四、自定义解析器

当内置解析器不满足需求时，可以自定义。

```javascript
import { BaseOutputParser } from '@langchain/core/output_parsers';

// 自定义解析器：提取 Markdown 代码块中的 JSON
class MarkdownJsonParser extends BaseOutputParser {
  constructor(schema) {
    super();
    this.schema = schema;
  }

  // 必须实现的方法
  async parse(text) {
    // 提取 ```json ... ``` 中的内容
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (!match) {
      throw new Error('未找到 JSON 代码块');
    }

    const json = JSON.parse(match[1]);
    return this.schema.parse(json);
  }

  // 获取格式说明（用于提示词）
  getFormatInstructions() {
    return '请以 Markdown JSON 代码块格式输出：\n```json\n{...}\n```';
  }

  // 解析类型标识
  _type() {
    return 'markdown_json';
  }
}

// 使用
const parser = new MarkdownJsonParser(scientistSchema);
const result = await parser.parse(modelOutput);
```

---

## 五、方法对比与选择策略

### 全面对比表

| 方法 | 原理 | 可靠性 | 简洁度 | 流式支持 | 模型要求 | 适用场景 |
|------|------|--------|--------|----------|----------|----------|
| **withStructuredOutput** | Function Calling | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | 需支持 FC | 现代模型首选 |
| **StructuredOutputParser** | Prompt + 解析 | ⭐⭐⭐ | ⭐⭐⭐ | ❌ | 任意模型 | 兼容旧模型 |
| **JsonOutputParser** | JSON 提取 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | 任意模型 | 纯 JSON 场景 |
| **StringOutputParser** | 文本提取 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | 任意模型 | 纯文本场景 |
| **CommaSeparatedList** | 分割解析 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | 任意模型 | 简单列表 |
| **自定义 Parser** | 自定义逻辑 | 取决于实现 | ⭐⭐ | 可自定义 | 任意模型 | 特殊格式 |

### 选择决策树

```
你需要什么格式的输出？
        │
        ├── 纯文本 ───────────────────→ StringOutputParser
        │
        ├── 简单列表（逗号分隔）───────→ CommaSeparatedListOutputParser
        │
        └── 结构化对象（JSON）
                │
                ├── 模型支持 Function Calling？
                │       │
                │       ├── 是（OpenAI/Claude/Gemini）
                │       │       │
                │       │       ├── 需要流式输出？
                │       │       │       ├── 是 ─────────→ withStructuredOutput
                │       │       │       └── 否 ─────────→ withStructuredOutput
                │       │       │
                │       │       └── 不需要流式？──────────→ withStructuredOutput
                │       │
                │       └── 否（旧模型/开源模型）
                │               │
                │               ├── 纯 JSON 格式？───────→ JsonOutputParser
                │               │
                │               └── 需要 Schema 验证？───→ StructuredOutputParser
                │
                └── 特殊格式需求？──────────────────────→ 自定义 Parser
```

---

## 六、最佳实践

### 1. 现代项目推荐做法

```javascript
// ✅ 推荐：使用 withStructuredOutput
import { z } from 'zod';

const schema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string())
});

const structuredModel = model.withStructuredOutput(schema);
const result = await structuredModel.invoke(question);
```

### 2. 错误处理模式

```javascript
// withStructuredOutput 错误处理
try {
  const result = await structuredModel.invoke(input);
} catch (error) {
  // 通常是模型输出不符合 schema
  console.error('结构化输出失败:', error);
  // 可以降级到普通文本输出
}

// StructuredOutputParser 错误处理
try {
  const response = await model.invoke(prompt);
  const result = await parser.parse(response.content);
} catch (error) {
  // 可能是：格式错误、JSON 解析失败、验证失败
  if (error.message.includes('JSON')) {
    // JSON 解析错误
  } else if (error.message.includes('validation')) {
    // Zod 验证错误
  }
}
```

### 3. 链式组合

```javascript
import { RunnableSequence } from '@langchain/core/runnables';

// 构建复杂处理链
const chain = RunnableSequence.from([
  {
    question: (input) => input.question,
    context: (input) => retriever.invoke(input.question)
  },
  promptTemplate,
  model,
  parser  // 可以是任何解析器
]);

const result = await chain.invoke({ question: '...' });
```

### 4. 降级策略

```javascript
async function safeStructuredOutput(input) {
  // 优先尝试 withStructuredOutput
  if (model.supportsFunctionCalling) {
    try {
      return await structuredModel.invoke(input);
    } catch (error) {
      console.warn('原生结构化失败，降级到解析器');
    }
  }

  // 降级到 StructuredOutputParser
  const response = await model.invoke(
    `${input}\n${parser.getFormatInstructions()}`
  );
  return await parser.parse(response.content);
}
```

---

## 七、总结

综上所述，LangChain 的输出格式化体系可以总结为：

1. **withStructuredOutput** - 现代首选，利用模型原生能力，最可靠最简洁
2. **专用解析器** - 特定场景（JSON、字符串、列表等）
3. **StructuredOutputParser** - 兼容方案，适用于不支持 function calling 的模型
4. **自定义解析器** - 特殊需求的终极方案

### 一句话建议

**能用 withStructuredOutput 就优先用，它代表了 LLM 应用开发的现代最佳实践！**

只有在模型不支持或特殊场景下，才考虑其他方案。

---

## 参考代码

本指南的示例代码位于：`output-parser-test/src/`

- `with-structured-output.mjs` - withStructuredOutput 示例
- `structured-output-parser.mjs` - StructuredOutputParser 基础示例
- `structured-output-parser2.mjs` - 配合 PromptTemplate 使用

---

*文档版本：1.0*  
*最后更新：2026-03-23*

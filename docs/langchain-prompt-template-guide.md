# LangChain PromptTemplate 专业文档与最佳实践

> 本文档基于 **@langchain/core 1.x** 版本（最新 v1.1.35），涵盖 LangChain.js 提示词模板系统的完整使用指南。

---

## 目录

1. [核心概念](#核心概念)
2. [PromptTemplate - 字符串模板](#prompttemplate---字符串模板)
3. [ChatPromptTemplate - 对话模板（推荐）](#chatprompttemplate---对话模板推荐)
4. [FewShotChatMessagePromptTemplate - 对话式少样本](#fewshotchatmessageprompttemplate---对话式少样本)
5. [MessagesPlaceholder - 历史消息占位](#messagesplaceholder---历史消息占位)
6. [PipelinePromptTemplate - 管道组合](#pipelineprompttemplate---管道组合)
7. [ExampleSelector - 示例选择器](#exampleselector---示例选择器)
8. [模板语法详解](#模板语法详解)
9. [FewShotPromptTemplate vs FewShotChatMessagePromptTemplate](#fewshotprompttemplate-vs-fewshotchatmessageprompttemplate)
10. [Partial - 部分变量预填充](#partial---部分变量预填充)
11. [模板组合操作](#模板组合操作)
12. [最佳实践总结](#最佳实践总结)

---

## 核心概念

### 什么是 PromptTemplate？

PromptTemplate 是 LangChain 中用于**结构化提示词**的核心抽象。它将静态提示词文本与动态变量分离，实现：

- **可复用性**：同一模板可用于不同场景
- **类型安全**：变量类型检查和验证
- **模块化**：复杂提示词可拆分为独立组件
- **可维护性**：集中管理提示词，便于迭代优化

### LangChain 1.x 核心变化

| 特性 | 说明 |
|------|------|
| **ChatPromptTemplate 为主** | 现代 LLM（GPT-4、Claude、Gemini）推荐使用对话格式 |
| **FewShotChatMessagePromptTemplate** | 新增对话式少样本提示模板 |
| **模板组合操作符** | 支持 `+` 操作符组合多个模板 |
| **双格式支持** | f-string（默认）和 Mustache 格式 |

### 核心类层次

```
BasePromptTemplate (抽象基类)
├── PromptTemplate                    # 基础字符串模板
├── ChatPromptTemplate                # 对话消息模板 ⭐ 推荐
├── FewShotChatMessagePromptTemplate  # 对话式少样本模板 ⭐ 1.x 新增
├── PipelinePromptTemplate            # 管道组合模板
└── ...
```

---

## PromptTemplate - 字符串模板

用于生成**纯文本字符串**的模板，适用于简单的单轮任务。

### 基本用法

```javascript
import { PromptTemplate } from '@langchain/core/prompts';

// 方式1：使用 fromTemplate 工厂方法（推荐）
const template = PromptTemplate.fromTemplate(`
你是一名{role}，需要帮助用户解决{task}相关问题。

用户问题：{question}
`);

// 方式2：使用构造函数
const template2 = new PromptTemplate({
  template: '你好，{name}！',
  inputVariables: ['name'],
});
```

### 格式化输出

```javascript
// 异步格式化
const prompt = await template.format({
  role: '资深工程师',
  task: '代码审查',
  question: '这段代码有内存泄漏风险吗？',
});

console.log(prompt);
// 输出格式化后的完整字符串
```

### 变量插值语法

| 语法 | 说明 | 示例 |
|------|------|------|
| `{var}` | 必填变量 | `{name}` |
| `{var:optional}` | 可选变量 | `{name:optional}` |
| `{{literal}}` | 转义大括号 | `{{not_a_variable}}` |

### 实际案例：周报生成器

```javascript
const weeklyReportTemplate = PromptTemplate.fromTemplate(`
你是一名严谨但不失人情味的工程团队负责人，需要根据本周数据写一份周报。

公司名称：{company_name}
部门名称：{team_name}
直接汇报对象：{manager_name}
本周时间范围：{week_range}

本周团队核心目标：
{team_goal}

本周开发数据（Git 提交 / Jira 任务）：
{dev_activities}

请根据以上信息生成一份【Markdown 周报】，要求：
- 有简短的整体 summary（两三句话）
- 有按模块/项目拆分的小结
- 用一个 Markdown 表格列出关键指标
- 语气专业但有一点人情味
`);

const prompt = await weeklyReportTemplate.format({
  company_name: '星航科技',
  team_name: '数据智能平台组',
  manager_name: '刘总',
  week_range: '2025-03-10 ~ 2025-03-16',
  team_goal: '完成用户画像服务的灰度上线',
  dev_activities: '...',
});
```

---

## ChatPromptTemplate - 对话模板（推荐）

**LangChain 1.x 推荐的主要使用方式**，适用于现代对话式 LLM（GPT-4、Claude、Gemini）。

### 为什么需要 ChatPromptTemplate？

现代 LLM 支持**消息角色**（System/Human/AI），ChatPromptTemplate 用于构建结构化的对话消息数组。

### 基本用法

```javascript
import { ChatPromptTemplate } from '@langchain/core/prompts';

const chatPrompt = ChatPromptTemplate.fromMessages([
  // [角色, 内容模板]
  ['system', '你是一名{role}，擅长{skill}。'],
  ['human', '请帮我{task}'],
]);

const messages = await chatPrompt.formatMessages({
  role: '资深工程师',
  skill: '代码审查',
  task: '审查这段代码',
});

// 输出：[{ role: 'system', content: '...' }, { role: 'human', content: '...' }]
```

### 消息角色类型

| 角色 | 用途 | 典型场景 |
|------|------|----------|
| `system` | 设定 AI 身份和行为准则 | 定义助手角色、输出格式 |
| `human` / `user` | 用户输入 | 用户问题、指令 |
| `ai` / `assistant` | AI 回复 | 对话历史中的 AI 回复 |
| `function` / `tool` | 函数调用结果 | Tool/Function calling |

### 多轮对话模板

```javascript
const multiTurnPrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一名专业的技术顾问。'],
  ['human', '我想学习{topic}'],
  ['ai', '好的，{topic}是一个很有价值的领域。'],
  ['human', '请给我一些学习建议'],
]);
```

### 实际案例：带风格的周报助手

```javascript
const chatPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `你是一名资深工程团队负责人，擅长用结构化、易读的方式写技术周报。
写作风格要求：{tone}。

请根据后续用户提供的信息，帮他生成一份适合给老板和团队同时抄送的周报草稿。`,
  ],
  [
    'human',
    `本周信息如下：

公司名称：{company_name}
团队名称：{team_name}
直接汇报对象：{manager_name}
本周时间范围：{week_range}

本周团队核心目标：
{team_goal}

本周开发数据：
{dev_activities}

请据此输出一份 Markdown 周报。`,
  ],
]);

const messages = await chatPrompt.formatMessages({
  tone: '专业、清晰、略带鼓励',
  company_name: '星航科技',
  // ... 其他变量
});
```

---

## FewShotChatMessagePromptTemplate - 对话式少样本

**LangChain 1.x 新增**，用于在对话上下文中提供少样本示例。

### 什么是 Few-Shot Learning？

通过在提示词中提供**示例输入-输出对**，引导 LLM 学习特定模式或风格，无需微调模型。

### 基本用法

```javascript
import {
  ChatPromptTemplate,
  FewShotChatMessagePromptTemplate
} from '@langchain/core/prompts';

// 定义示例
const examples = [
  {
    input: '重点突出稳定性治理',
    output: '- 处理 P1 故障 2 个，均在 SLA 内完成修复',
  },
  {
    input: '偏向对外展示成果',
    output: '- 新上线实时订单看板，支持业务实时查看转化漏斗',
  },
];

// 创建少样本提示模板
const fewShotPrompt = new FewShotChatMessagePromptTemplate({
  examplePrompt: ChatPromptTemplate.fromMessages([
    ['human', '{input}'],
    ['ai', '{output}'],
  ]),
  examples,
});

// 组合到主提示词
const finalPrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一名专业的技术写作助手。'],
  fewShotPrompt,  // 插入少样本示例
  ['human', '请帮我写一份关于{topic}的周报。'],
]);

const messages = await finalPrompt.formatMessages({
  topic: 'AI 助手项目进展',
});
```

### 动态示例选择

结合 `ExampleSelector` 实现根据输入动态选择最相关的示例：

```javascript
import { LengthBasedExampleSelector } from '@langchain/core/example_selectors';

const exampleSelector = await LengthBasedExampleSelector.fromExamples(examples, {
  examplePrompt: ChatPromptTemplate.fromMessages([
    ['human', '{input}'],
    ['ai', '{output}'],
  ]),
  maxLength: 1000,
});

const fewShotPrompt = new FewShotChatMessagePromptTemplate({
  examplePrompt: ChatPromptTemplate.fromMessages([
    ['human', '{input}'],
    ['ai', '{output}'],
  ]),
  exampleSelector,  // 使用选择器
});
```

---

## MessagesPlaceholder - 历史消息占位

用于在多轮对话中**动态注入历史消息**。

### 使用场景

- 聊天机器人需要记住之前的对话
- Agent 需要访问工具调用历史
- 任何需要上下文的场景

### 基本用法

```javascript
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

const chatPromptWithHistory = ChatPromptTemplate.fromMessages([
  ['system', '你是一名资深工程效率顾问。'],
  // 使用 MessagesPlaceholder 承载历史对话
  new MessagesPlaceholder('history'),
  ['human', '这是用户本轮的新问题：{current_input}'],
]);

// 构造历史消息
const historyMessages = [
  new HumanMessage('我们团队在做周报自动生成工具。'),
  new AIMessage('可以先把数据源梳理清楚。'),
  new HumanMessage('已经把 Prompt 拆成了四块。'),
  new AIMessage('很好，可以考虑做成 PipelinePromptTemplate。'),
];

const formatted = await chatPromptWithHistory.formatMessages({
  history: historyMessages,
  current_input: '现在想优化多人协同编辑流程，有什么建议？',
});
```

### 可选参数

```javascript
// 设置可选占位符（无历史消息时不报错）
new MessagesPlaceholder({
  variableName: 'history',
  optional: true,
});
```

---

## PipelinePromptTemplate - 管道组合

将复杂提示词拆分为**独立模块**，灵活组合复用。

### 为什么需要 Pipeline？

复杂提示词通常包含多个**独立模块**：
- 人设定义（Persona）
- 背景信息（Context）
- 具体任务（Task）
- 输出格式（Format）

### 基本用法

```javascript
import { PipelinePromptTemplate, PromptTemplate } from '@langchain/core/prompts';

// 定义各个模块（可独立复用）
const personaPrompt = PromptTemplate.fromTemplate(
  `你是一名资深工程团队负责人，写作风格：{tone}。
你擅长把枯燥的技术细节写得既专业又有温度。\n`
);

const contextPrompt = PromptTemplate.fromTemplate(
  `公司：{company_name}
部门：{team_name}
直接汇报对象：{manager_name}
本周时间范围：{week_range}
本周部门核心目标：{team_goal}\n`
);

const taskPrompt = PromptTemplate.fromTemplate(
  `以下是本周团队的开发活动：
{dev_activities}

请你从这些原始数据中提炼出关键信息。\n`
);

const formatPrompt = PromptTemplate.fromTemplate(
  `请用 Markdown 输出周报，结构包含：
1. 本周概览
2. 详细拆分
3. 关键指标表格

注意：语气专业，符合 {company_values}。`
);

// 最终组合模板
const finalPrompt = PromptTemplate.fromTemplate(
  `{persona_block}
{context_block}
{task_block}
{format_block}

现在请生成本周的最终周报：`
);

// 构建 Pipeline
const pipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },
    { name: 'context_block', prompt: contextPrompt },
    { name: 'task_block', prompt: taskPrompt },
    { name: 'format_block', prompt: formatPrompt },
  ],
  finalPrompt: finalPrompt,
});

// 使用：传入所有模块需要的变量
const result = await pipelinePrompt.format({
  tone: '专业、清晰、略带幽默',
  company_name: '星航科技',
  // ... 其他变量
});
```

### 模块复用优势

```javascript
// 在不同的场景中复用相同模块
export const personaPrompt = PromptTemplate.fromTemplate(...);
export const contextPrompt = PromptTemplate.fromTemplate(...);

// 场景A：周报生成
const weeklyPipeline = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona', prompt: personaPrompt },
    { name: 'context', prompt: contextPrompt },
    // ...
  ],
});

// 场景B：会议纪要生成（复用相同的人设和背景模块）
const meetingPipeline = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona', prompt: personaPrompt },
    { name: 'context', prompt: contextPrompt },
    // ... 不同的任务和格式模块
  ],
});
```

---

## 模板组合操作

LangChain 1.x 支持使用 `+` 操作符组合多个模板。

### 字符串模板组合

```javascript
const prompt1 = PromptTemplate.fromTemplate('你好，{name}！');
const prompt2 = PromptTemplate.fromTemplate('今天天气{weather}。');

// 使用 + 操作符组合
const combined = prompt1.pipe(prompt2);
// 或使用 RunnableSequence
const combined = RunnableSequence.from([prompt1, prompt2]);
```

### ChatPromptTemplate 组合

```javascript
const systemPrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一名{role}。'],
]);

const userPrompt = ChatPromptTemplate.fromMessages([
  ['human', '请帮我{task}'],
]);

// 组合
const fullPrompt = systemPrompt.concat(userPrompt);
// 或使用 fromMessages 直接组合
const fullPrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一名{role}。'],
  ['human', '请帮我{task}'],
]);
```

---

## 最佳实践总结

### 1. 选择合适的模板类型

| 场景 | 推荐模板 | 原因 |
|------|----------|------|
| 简单文本生成 | `PromptTemplate` | 轻量级，易于使用 |
| 对话式 LLM | `ChatPromptTemplate` | 现代 LLM 标准格式 |
| 少样本学习 | `FewShotChatMessagePromptTemplate` | 对话式示例更自然 |
| 复杂模块化 | `PipelinePromptTemplate` | 便于维护和复用 |
| 多轮对话 | `MessagesPlaceholder` | 动态注入历史 |

### 2. 模板设计原则

```javascript
// ✅ 好的做法：模块化、清晰的变量命名
const goodTemplate = ChatPromptTemplate.fromMessages([
  ['system', '你是一名{role}，需要帮助用户解决{domain}相关问题。'],
  ['human', `【背景信息】
{context}

【用户问题】
{question}

【输出要求】
{format_instructions}`],
]);

// ❌ 避免：过于冗长、变量命名不清晰
const badTemplate = PromptTemplate.fromTemplate(`
你是一个助手，请回答下面的问题，要求详细、准确、专业，
如果不知道就说不知道，不要编造，要注意礼貌，
用户是{a}，问题是{b}，背景是{c}...
`);
```

### 3. 变量命名规范

| 类型 | 命名建议 | 示例 |
|------|----------|------|
| 实体名称 | snake_case | `company_name`, `user_id` |
| 长文本 | 描述性后缀 | `context`, `description`, `content` |
| 格式说明 | `_instructions` 后缀 | `format_instructions`, `output_instructions` |
| 列表数据 | 复数形式 | `examples`, `items`, `messages` |

### 4. 与 LLM 结合使用

```javascript
import { ChatOpenAI } from '@langchain/openai';
import { RunnableSequence } from '@langchain/core/runnables';

const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
});

// 方式1：直接调用
const messages = await chatPrompt.formatMessages({...});
const response = await model.invoke(messages);

// 方式2：使用 RunnableSequence（推荐）
const chain = RunnableSequence.from([
  chatPrompt,
  model,
]);
const result = await chain.invoke({...});

// 方式3：使用管道操作符
const chain = chatPrompt.pipe(model);
const result = await chain.invoke({...});
```

### 5. 错误处理

```javascript
try {
  const prompt = await template.format({
    // 缺少必需变量会抛出错误
  });
} catch (error) {
  if (error.message.includes('inputVariables')) {
    console.error('缺少必需的变量:', error.message);
  }
}
```

### 6. 性能优化

```javascript
// 复用模板实例（避免重复解析）
const sharedTemplate = ChatPromptTemplate.fromMessages([...]);

// 批量处理时使用 Promise.all
const prompts = await Promise.all(
  inputs.map(input => sharedTemplate.formatMessages(input))
);
```

### 7. 调试技巧

```javascript
// 打印最终提示词进行调试
const messages = await chatPrompt.formatMessages({...});
console.log('=== 最终消息数组 ===');
console.log(JSON.stringify(messages, null, 2));

// 查看单个消息
messages.forEach((msg, i) => {
  console.log(`[${i}] ${msg._getType()}: ${msg.content.substring(0, 100)}...`);
});
```

---

## ExampleSelector - 示例选择器

当示例库很大时，将所有示例都放入提示词会**超出 Token 限制**。ExampleSelector 根据输入**智能选择最相关的示例**。

### LengthBasedExampleSelector

根据提示词长度自动选择示例数量：

```javascript
import { LengthBasedExampleSelector } from '@langchain/core/example_selectors';
import { FewShotChatMessagePromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts';

// 定义示例库
const examples = [
  { input: '简短周报', output: '本周运行平稳，无重大故障。' },
  { input: '详细周报', output: '- 研发：完成用户模块重构\n- 测试：补齐自动化用例 15 个' },
  { input: '技术分享', output: '本周分享了 Redis 缓存优化实践...' },
];

// 创建示例选择器
const exampleSelector = await LengthBasedExampleSelector.fromExamples(examples, {
  examplePrompt: ChatPromptTemplate.fromMessages([
    ['human', '{input}'],
    ['ai', '{output}'],
  ]),
  maxLength: 1000, // 最大字符长度限制
});

// 构建带选择器的少样本提示
const fewShotPrompt = new FewShotChatMessagePromptTemplate({
  examplePrompt: ChatPromptTemplate.fromMessages([
    ['human', '{input}'],
    ['ai', '{output}'],
  ]),
  exampleSelector, // 使用选择器替代固定的 examples
  prefix: '下面是一些示例：\n',
  suffix: '\n现在请为以下场景生成内容：\n{current_input}',
  inputVariables: ['current_input'],
});

// 根据输入自动选择示例
const messages = await fewShotPrompt.formatMessages({
  current_input: '需要一份比较详细的技术周报...',
});
```

### SemanticSimilarityExampleSelector

基于**语义相似度**选择最相关的示例（需要向量存储）：

```javascript
import { SemanticSimilarityExampleSelector } from '@langchain/core/example_selectors';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

// 准备示例库
const examples = [
  { 
    input: '稳定性治理', 
    output: '本周处理 P1 故障 2 个，均在 SLA 内完成修复...',
    category: '运维'
  },
  { 
    input: '新功能上线', 
    output: '新上线实时订单看板，支持业务实时查看转化漏斗...',
    category: '产品'
  },
  { 
    input: '性能优化', 
    output: '通过引入连接池，数据库查询耗时降低 40%...',
    category: '技术'
  },
];

// 创建语义相似度选择器
const exampleSelector = await SemanticSimilarityExampleSelector.fromExamples(
  examples,
  new OpenAIEmbeddings(), // 使用 OpenAI 嵌入
  MemoryVectorStore, // 使用内存向量存储
  {
    k: 2, // 选择最相似的 2 个示例
    filter: (example) => example.category === '技术', // 可选：过滤条件
  }
);

const fewShotPrompt = new FewShotChatMessagePromptTemplate({
  examplePrompt: ChatPromptTemplate.fromMessages([
    ['human', '{input}'],
    ['ai', '{output}'],
  ]),
  exampleSelector,
  prefix: '参考以下相似示例：',
});
```

### MaxMarginalRelevanceExampleSelector

使用 **MMR（最大边际相关性）** 算法，兼顾**相关性**和**多样性**：

```javascript
import { MaxMarginalRelevanceExampleSelector } from '@langchain/core/example_selectors';

const exampleSelector = await MaxMarginalRelevanceExampleSelector.fromExamples(
  examples,
  new OpenAIEmbeddings(),
  MemoryVectorStore,
  {
    k: 3, // 选择 3 个示例
    fetchK: 10, // 先获取 10 个候选
    lambda: 0.5, // 多样性权重（0-1，越大越多样）
  }
);
```

### 选择器对比

| 选择器 | 选择策略 | 适用场景 | 依赖 |
|--------|----------|----------|------|
| `LengthBasedExampleSelector` | 按长度限制 | 控制 Token 消耗 | 无 |
| `SemanticSimilarityExampleSelector` | 语义相似度 | 选择最相关的示例 | 向量模型 |
| `MaxMarginalRelevanceExampleSelector` | MMR 算法 | 兼顾相关性和多样性 | 向量模型 |
| `NgramOverlapExampleSelector` | N-gram 重叠 | 基于关键词匹配 | 无 |

---

## 模板语法详解

LangChain 支持两种模板格式：**f-string**（默认）和 **Mustache**。

### f-string 格式（推荐）

使用 `{variable}` 语法，是 LangChain 的默认格式。

```javascript
const template = PromptTemplate.fromTemplate(
  '你好，{name}！你今年{age}岁。'
);
```

#### 语法规则

| 语法 | 说明 | 示例 |
|------|------|------|
| `{var}` | 必填变量 | `{name}` |
| `{var:optional}` | 可选变量 | `{name:optional}` |
| `{{literal}}` | 转义大括号 | `{{not_a_variable}}` → 输出 `{not_a_variable}` |

#### 可选变量

```javascript
const template = PromptTemplate.fromTemplate(
  '你好，{name}{title:optional}！',
  { templateFormat: 'f-string' }
);

// title 是可选的
await template.format({ name: '张三' }); // "你好，张三！"
await template.format({ name: '张三', title: '先生' }); // "你好，张三先生！"
```

### Mustache 格式

使用 `{{variable}}` 语法，与许多模板引擎兼容。

```javascript
const template = new PromptTemplate({
  template: '你好，{{name}}！你今年{{age}}岁。',
  inputVariables: ['name', 'age'],
  templateFormat: 'mustache',
});
```

#### 语法规则

| 语法 | 说明 | 示例 |
|------|------|------|
| `{{var}}` | 变量插值 | `{{name}}` |
| `{{#var}}...{{/var}}` | 条件渲染 | `{{#show}}显示{{/show}}` |
| `{{^var}}...{{/var}}` | 反向条件 | `{{^show}}隐藏{{/show}}` |
| `{{!comment}}` | 注释 | `{{! 这是注释 }}` |

### 语法对比

| 特性 | f-string | Mustache |
|------|----------|----------|
| 语法 | `{var}` | `{{var}}` |
| 可选变量 | 原生支持 | 需条件语法 |
| 学习成本 | 低 | 中等 |
| 生态兼容 | LangChain 专用 | 广泛兼容 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

### 特殊字符转义

#### f-string 转义

```javascript
// 输出字面量 {name}
const template = PromptTemplate.fromTemplate(
  '使用 {{name}} 变量'
);
// 输出：使用 {name} 变量

// 输出双大括号
const template2 = PromptTemplate.fromTemplate(
  'JSON: {{{{key: value}}}}'
);
// 输出：JSON: {{key: value}}
```

#### Mustache 转义

```javascript
// 输出字面量 {{name}}
const template = new PromptTemplate({
  template: '使用 {{name}} 变量',
  inputVariables: [],
  templateFormat: 'mustache',
});
// 输出：使用 {{name}} 变量
```

---

## FewShotPromptTemplate vs FewShotChatMessagePromptTemplate

两个类都用于少样本学习，但适用场景不同：

### 对比表

| 特性 | FewShotPromptTemplate | FewShotChatMessagePromptTemplate |
|------|------------------------|----------------------------------|
| **输出格式** | 字符串 | 消息数组 |
| **适用模板** | PromptTemplate | ChatPromptTemplate |
| **使用场景** | 简单文本生成 | 对话式 LLM |
| **示例格式** | 字符串对 | 消息对 |
| **推荐度** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### FewShotPromptTemplate（字符串模板）

适用于传统的字符串补全模型：

```javascript
import { FewShotPromptTemplate, PromptTemplate } from '@langchain/core/prompts';

const examplePrompt = PromptTemplate.fromTemplate(
  `输入：{input}
输出：{output}
---`
);

const examples = [
  { input: '你好', output: '您好！有什么可以帮助您的吗？' },
  { input: '再见', output: '再见！祝您有美好的一天！' },
];

const fewShotPrompt = new FewShotPromptTemplate({
  examples,
  examplePrompt,
  prefix: '以下是一些对话示例：\n',
  suffix: '\n输入：{input}\n输出：',
  inputVariables: ['input'],
});

const result = await fewShotPrompt.format({ input: '谢谢' });
// 输出纯字符串
```

### FewShotChatMessagePromptTemplate（对话模板）

适用于现代对话式 LLM（推荐）：

```javascript
import { FewShotChatMessagePromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts';

const examplePrompt = ChatPromptTemplate.fromMessages([
  ['human', '{input}'],
  ['ai', '{output}'],
]);

const examples = [
  { input: '你好', output: '您好！有什么可以帮助您的吗？' },
  { input: '再见', output: '再见！祝您有美好的一天！' },
];

const fewShotPrompt = new FewShotChatMessagePromptTemplate({
  examples,
  examplePrompt,
});

// 组合到主提示词
const finalPrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一名友好的客服助手。'],
  fewShotPrompt,
  ['human', '{input}'],
]);

const messages = await finalPrompt.formatMessages({ input: '谢谢' });
// 输出消息数组
```

### 如何选择？

```
使用 FewShotPromptTemplate 当：
└── 使用传统补全模型（text-davinci-003 等）
└── 输出需要是纯字符串

使用 FewShotChatMessagePromptTemplate 当：
└── 使用现代对话模型（GPT-4、Claude、Gemini）⭐ 推荐
└── 需要保持对话上下文
└── 使用 ChatPromptTemplate
```

---

## Partial - 部分变量预填充

某些变量在**多个调用中保持不变**（如公司名称、价值观），可以预先填充，后续只需传入变化的变量。

### 基本用法

```javascript
// 假设 chatPrompt 需要这些变量：
// tone, company_name, team_name, manager_name, week_range, team_goal, dev_activities

// 预先填充固定值
const chatPromptWithDefaults = await chatPrompt.partial({
  company_name: '星航科技',
  tone: '专业、清晰',
});

// 后续调用只需传入变化的部分
const messages1 = await chatPromptWithDefaults.formatMessages({
  team_name: 'AI 平台组',
  manager_name: '刘东',
  week_range: '2025-03-10 ~ 2025-03-16',
  team_goal: '完成用户画像服务',
  dev_activities: '...',
});

const messages2 = await chatPromptWithDefaults.formatMessages({
  team_name: '数据工程组',
  manager_name: '王强',
  week_range: '2025-03-17 ~ 2025-03-23',
  team_goal: '优化数据管道',
  dev_activities: '...',
});
```

### 函数式 Partial

使用函数动态计算变量值（每次调用时执行）：

```javascript
const promptWithDate = await chatPrompt.partial({
  current_date: () => new Date().toISOString().split('T')[0],
  timestamp: () => Date.now(),
});

// 每次 format 都会重新计算日期
const messages = await promptWithDate.formatMessages({
  // ... 其他变量
});
```

### 使用场景

| 场景 | 示例 |
|------|------|
| 固定配置 | `company_name`, `brand_voice` |
| 动态计算 | `current_date`, `timestamp` |
| 上下文信息 | `user_id`, `session_id` |
| 环境变量 | `api_version`, `feature_flags` |

---

## 快速参考卡片

### 导入语句

```javascript
import {
  PromptTemplate,
  ChatPromptTemplate,
  FewShotChatMessagePromptTemplate,
  PipelinePromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';

import {
  LengthBasedExampleSelector,
  SemanticSimilarityExampleSelector,
} from '@langchain/core/example_selectors';

import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
```

### 常用方法

| 方法 | 说明 |
|------|------|
| `PromptTemplate.fromTemplate(str)` | 从字符串创建模板 |
| `ChatPromptTemplate.fromMessages(arr)` | 从消息数组创建模板 |
| `template.format(variables)` | 格式化输出字符串 |
| `template.formatMessages(vars)` | 格式化输出消息数组 |
| `template.pipe(next)` | 管道组合 |
| `template.concat(other)` | 连接模板 |

---

## 相关资源

- [LangChain 官方文档 - Prompt Templates](https://js.langchain.com/docs/concepts/prompt_templates)
- [LangChain Core API Reference](https://api.js.langchain.com/)
- [示例代码目录](../prompt-template-test/src/)

---

*文档版本：v1.1 | 基于 @langchain/core 1.1.35 | 最后更新：2026-03-24*

## 更新日志

### v1.1 (2026-03-24)
- 补充完整的 ExampleSelector 章节（LengthBased、SemanticSimilarity、MaxMarginalRelevance）
- 新增模板语法详解章节（f-string vs Mustache、转义处理）
- 澄清 FewShotPromptTemplate vs FewShotChatMessagePromptTemplate 区别
- 补充 Partial 方法和变量预填充
- 完善最佳实践总结

import 'dotenv/config';
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { z } from "zod";

const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义输出结构 schema
const schema = z.object({
    translation: z.string().describe("翻译后的英文文本"),
    keywords: z.array(z.string()).length(3).describe("3个关键词")
});

const outputParser = StructuredOutputParser.fromZodSchema(schema);

const promptTemplate = PromptTemplate.fromTemplate(
    '将以下文本翻译成英文，然后总结为3个关键词。\n\n文本：{text}\n\n{format_instructions}'
);

const input = {
    text: 'LangChain 是一个强大的 AI 应用开发框架',
    format_instructions: outputParser.getFormatInstructions()
};

// const chain = promptTemplate
//     .pipe(model)
//     .pipe(outputParser);


// Runnable 这种声明式的写法叫做 LCEL（Lang Chain Expression Language，LangChain 表达式语言）
// LCEL 就是实现了 Runnbale 接口的一些 api 组合成 chain，然后统一执行。
// Runnable 都有 invoke、batch、stream 方法（同步调用、批量调用、流式返回）
// 1. 调用 invoke，就会依次调用这个链条上每个组件的 invoke
// 2. batch 是批量，也就是并发进行多个单独的 invoke
// 3. 调用 stream 就是调用这个链条上每个组件的 stream，不断返回数据
//
// - RunnableSequence 顺序执行
// - RunnableLambda 把普通函数封装成 Runnable 对象，就也可以使用 LCEL 了
// - RunnableMap 并行执行多个 Runnable
// - RunnableBranch 根据条件选择要执行的 Runnable，就是 if else 逻辑
// - RouterRunnable 根据 key 选择要执行的 Runnable，就是 switch case 逻辑
// - RunnablePassthrough 传递原始输入，就是不进行任何处理
// - RunnableEach 对数组中的每个元素应用这个链，就是对数组中的每个元素应用这个 Runnable
// - RunnablePick 选择要执行的 key，就是根据 key 选择要执行的 Runnable
// - RunnableWithMessageHistory 给 chain 加上 memory 的功能
// - RunnableWithFallbacks 给 chain 加上 fallback 的功能
// - RunnableWithRetry 给 chain 加上 retry 的功能
// - RunnableWithConfig 给 chain 加上 config 的功能
// - RunnableWithCallbacks 给 chain 加上 callbacks 的功能

const chain = RunnableSequence.from([
    promptTemplate,
    model,
    outputParser
]);



const result = await chain.invoke(input);

console.log('✅ 最终结果:');
console.log(result);

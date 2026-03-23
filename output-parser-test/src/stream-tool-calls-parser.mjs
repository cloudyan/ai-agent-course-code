import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { JsonOutputToolsParser } from '@langchain/core/output_parsers/openai_tools';
import { z } from 'zod';

const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义结构化输出的 schema
const scientistSchema = z.object({
    name: z.string().describe("科学家的全名"),
    birth_year: z.number().describe("出生年份"),
    death_year: z.number().optional().describe("去世年份，如果还在世则不填"),
    nationality: z.string().describe("国籍"),
    fields: z.array(z.string()).describe("研究领域列表"),
    achievements: z.array(z.string()).describe("主要成就"),
    biography: z.string().describe("简短传记")
});

// 绑定工具到模型
const modelWithTool = model.bindTools([
    {
        name: "extract_scientist_info",
        description: "提取和结构化科学家的详细信息",
        schema: scientistSchema
    }
]);

// 1. 绑定工具并挂载解析器
const parser = new JsonOutputToolsParser();
const chain = modelWithTool.pipe(parser);

try {
    // 2. 开启流
    const stream = await chain.stream("详细介绍牛顿的生平和成就");

    let lastContent = ""; // 记录已打印的完整内容
    let finalResult = null; // 存储最终的完整结果

    console.log("📡 实时输出流式内容:\n");

    for await (const chunk of stream) {
        // console.log(chunk);

        if (chunk.length > 0) {
            const toolCall = chunk[0];

            // 获取当前工具调用的完整参数内容
            const currentContent = JSON.stringify(toolCall.args || {});

            // 判断：当前内容是否比上次打印的内容更长（即是否有新增内容）
            // console.log('\n\n')
            // console.log('currentContent: ', currentContent)
            // console.log('lastContent: ', lastContent)
            if (currentContent.length > lastContent.length) {
                // 只取出新增的部分
                // 因为是 json 的结构，导致新增的部分获取不完全正确，如下
                //   currentContent:  {"name":"艾萨克·牛"}
                //   lastContent:  {"name":"艾"}
                //   newText: 克·牛"
                // 但 toolCall.args 是正确的
                const newText = currentContent.slice(lastContent.length -1, -1);
                process.stdout.write(newText); // 实时输出到控制台, 只打印新增内容
                lastContent = currentContent; // 更新已打印的完整内容
            }

            console.log('\n')
            console.log(toolCall.args);
            console.log('\n\n')
        }
    }

    console.log("\n\n✅ 流式输出完成");

} catch (error) {
    console.error("\n❌ 错误:", error.message);
    console.error(error);
}

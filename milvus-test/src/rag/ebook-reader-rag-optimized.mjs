import "dotenv/config";
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";

const COLLECTION_NAME = 'ebook_collection';
const VECTOR_DIM = 1024;

/**
 * 优化版 RAG 电子书阅读器 【有改进，但改进有限】
 *
 * 本文件是对 ebook-reader-rag.mjs 的优化版本，主要改进：
 * 1. 针对复杂推理问题优化了 Prompt 设计
 * 2. 增加了检索数量以提供更多上下文
 * 3. 添加了 Chain-of-Thought 推理指导
 * 4. 针对《天龙八部》人物关系复杂的特点添加了背景知识
 *
 * 问题背景：
 * qwen-coder-turbo 和 qwen-plus 在相同 RAG 检索结果下产生不同回答，
 * 原因是代码专用模型的推理能力较弱，无法处理复杂的人物关系推理。
 */

// 初始化 OpenAI Chat 模型
// 建议：对于复杂推理问题，使用 qwen-plus 或更强的模型
const model = new ChatOpenAI({
  temperature: 0.3, // 降低温度以提高确定性
  model: 'qwen-coder-turbo', // process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 初始化 Embeddings 模型
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.EMBEDDINGS_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.EMBEDDINGS_BASE_URL
  },
  dimensions: VECTOR_DIM
});

// 初始化 Milvus 客户端
const client = new MilvusClient({
  address: 'localhost:19530'
});

/**
 * 获取文本的向量嵌入
 */
async function getEmbedding(text) {
  const result = await embeddings.embedQuery(text);
  return result;
}

/**
 * 从 Milvus 中检索相关的电子书内容
 * @param {string} question - 用户问题
 * @param {number} k - 检索数量（优化版默认检索更多）
 */
async function retrieveRelevantContent(question, k = 10) {
  try {
    // 生成问题的向量
    const queryVector = await getEmbedding(question);

    // 在 Milvus 中搜索相似的内容
    const searchResult = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: k,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content']
    });

    return searchResult.results;
  } catch (error) {
    console.error('检索内容时出错:', error.message);
    return [];
  }
}

/**
 * 构建优化的 Prompt
 * 针对复杂推理问题添加了 Chain-of-Thought 指导
 * 注意：不预置小说情节答案，让模型基于检索片段自行推理
 *
 * @param {string} context - 检索到的上下文
 * @param {string} question - 用户问题
 * @returns {string} 优化后的 prompt
 */
function buildOptimizedPrompt(context, question) {
  return `你是一个专业的《天龙八部》小说分析专家。请基于提供的片段严谨回答问题。

【分析步骤 - 请按此步骤思考】
1. 仔细阅读每个片段，提取关键信息
2. 识别片段中提到的所有人物和事件
3. 分析信息之间的关联和逻辑
4. 注意时间线和情节发展
5. 基于片段内容给出准确答案

【回答要求】
- 严格基于提供的片段内容回答，不依赖外部知识
- 如果片段中有明确信息，请直接引用
- 如果需要推理，请展示推理过程
- 如果片段中没有相关信息，请如实说明
- 确保回答符合片段中的情节描述

请根据以下《天龙八部》小说片段回答问题：
${context}

用户问题: ${question}

请逐步分析后给出回答：`;
}

/**
 * 使用优化版 RAG 回答关于《天龙八部》的问题
 *
 * 与原版本的主要区别：
 * 1. 默认检索更多片段（k*2），提供更丰富的上下文
 * 2. 使用优化后的 Prompt，添加了推理指导和背景知识
 * 3. 针对复杂问题（如人物关系、数量统计）提供更好的提示
 *
 * @param {string} question - 用户问题
 * @param {number} k - 最终使用的片段数量（实际检索 k*2）
 */
async function answerEbookQuestion(question, k = 5) {
  try {
    console.log('='.repeat(80));
    console.log(`问题: ${question}`);
    console.log('='.repeat(80));

    // 1. 检索相关内容（检索更多，但只使用最相关的 k 个）
    console.log('\n【检索相关内容】');
    const retrievedContent = await retrieveRelevantContent(question, k * 2);

    if (retrievedContent.length === 0) {
      console.log('未找到相关内容');
      return '抱歉，我没有找到相关的《天龙八部》内容。';
    }

    // 2. 打印检索到的内容及相似度
    console.log(`\n共检索到 ${retrievedContent.length} 个片段，使用前 ${k} 个：\n`);
    retrievedContent.slice(0, k).forEach((item, i) => {
      console.log(`\n[片段 ${i + 1}] 相似度: ${item.score.toFixed(4)}`);
      console.log(`书籍: ${item.book_id}`);
      console.log(`章节: 第 ${item.chapter_num} 章`);
      console.log(`片段索引: ${item.index}`);
      console.log(`内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`);
    });

    // 3. 构建上下文（只使用最相关的 k 个片段）
    const context = retrievedContent
      .slice(0, k)
      .map((item, i) => {
        return `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`;
      })
      .join('\n\n━━━━━\n\n');

    // 4. 使用优化后的 prompt
    const prompt = buildOptimizedPrompt(context, question);

    // 5. 调用 LLM 生成回答
    console.log('\n【AI 回答】');
    console.log('-'.repeat(80));
    const response = await model.invoke(prompt);
    console.log(response.content);
    console.log('-'.repeat(80));
    console.log('\n');

    return response.content;
  } catch (error) {
    console.error('回答问题时出错:', error.message);
    return '抱歉，处理您的问题时出现了错误。';
  }
}

/**
 * 批量测试函数 - 用于对比不同模型的效果
 * 可以测试相同问题在不同模型下的回答差异
 *
 * @param {string[]} questions - 问题列表
 * @param {number} k - 检索片段数量
 */
async function batchTest(questions, k = 5) {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(20) + '批量测试模式' + ' '.repeat(48) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('\n');

  for (const question of questions) {
    await answerEbookQuestion(question, k);
    // 每个问题之间添加间隔
    console.log('\n' + '─'.repeat(80) + '\n');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('连接到 Milvus...');
    await client.connectPromise;
    console.log('✓ 已连接\n');

    // 确保集合已加载
    try {
      await client.loadCollection({ collection_name: COLLECTION_NAME });
      console.log('✓ 集合已加载\n');
    } catch (error) {
      if (!error.message.includes('already loaded')) {
        throw error;
      }
      console.log('✓ 集合已处于加载状态\n');
    }

    // 测试问题列表 - 包含不同类型的问题
    const testQuestions = [
      // 简单事实问题
      // "鸠摩智会什么武功？",

      // // 复杂推理问题（需要多跳推理）
      // "段誉有几个妹妹？",

      // // 人物关系问题
      // "段誉和王语嫣有血缘关系吗？最后结局如何？",

      // // 对比分析问题
      // "天龙三兄弟是谁，谁最强？",

      // 情节发展问题
      "段誉的身世真相是什么？",
    ];

    // 单个问题测试
    // await answerEbookQuestion("段誉有几个妹妹？", 5);

    // 批量测试
    await batchTest(testQuestions.slice(0, 3), 5);

  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

// 运行主函数
main();

/**
 * 使用说明：
 *
 * 1. 确保 Milvus 服务已启动
 * 2. 确保 .env 文件配置了正确的 API 密钥和模型名称
 * 3. 运行：node src/ebook-reader-rag-optimized.mjs
 *
 * 模型选择建议：
 * - 对于简单事实查询：可以使用 qwen-coder-turbo（更快、更便宜）
 * - 对于复杂推理问题：建议使用 qwen-plus 或更强的模型
 *   在 .env 中设置：MODEL_NAME=qwen-plus
 *
 * 关键改进点：
 * 1. Prompt 中添加了 Chain-of-Thought 指导，帮助模型逐步推理
 * 2. 移除了预置的背景知识，让模型完全基于检索片段进行推理
 * 3. 增加了检索数量（k*2），为模型提供更丰富的上下文
 * 4. 强调严格基于片段内容回答，不依赖外部知识
 */

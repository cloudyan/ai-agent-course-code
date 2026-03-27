import "dotenv/config";
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { RAGEvaluator, TEST_CASES } from './rag-evaluator.mjs';

const COLLECTION_NAME = 'ebook_collection';
const VECTOR_DIM = 1024;
const MILVUS_ADDRESS = process.env.MILVUS_ADDRESS || '127.0.0.1:19530';
const MODEL_TIMEOUT_MS = Number(process.env.RAG_MODEL_TIMEOUT_MS || 60000);
const EMBEDDING_TIMEOUT_MS = Number(process.env.RAG_EMBEDDING_TIMEOUT_MS || 30000);
const CONTEXT_CHUNK_MAX_CHARS = Number(process.env.RAG_CONTEXT_CHUNK_MAX_CHARS || 500);
const CONTEXT_MAX_TOTAL_CHARS = Number(process.env.RAG_CONTEXT_MAX_TOTAL_CHARS || 3000);
const TEST_LIMIT = Number(process.env.RAG_TEST_LIMIT || 0);
const EVAL_MODE = process.env.RAG_EVAL_MODE || 'balanced';

/**
 * RAG 系统评估运行脚本
 *
 * 使用方法:
 * 1. 确保 Milvus 服务已启动
 * 2. 确保 .env 配置了正确的 API 密钥
 * 3. 运行: node src/run-evaluation.mjs
 */

// 初始化模型
const model = new ChatOpenAI({
  temperature: 0.3,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  timeout: MODEL_TIMEOUT_MS,
  maxRetries: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
});

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.EMBEDDINGS_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  timeout: EMBEDDING_TIMEOUT_MS,
  maxRetries: 0,
  configuration: {
    baseURL: process.env.EMBEDDINGS_BASE_URL
  },
  dimensions: VECTOR_DIM
});

const client = new MilvusClient({
  address: MILVUS_ADDRESS
});

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} 超时（>${timeoutMs}ms）`));
      }, timeoutMs);
    })
  ]);
}

async function invokeWithAbort(chatModel, prompt, timeoutMs, label) {
  const controller = new AbortController();
  let heartbeatTimer;
  let abortTimer;

  try {
    heartbeatTimer = setInterval(() => {
      console.log(`  [RAG] ${label} 仍在执行中...`);
    }, 10000);

    abortTimer = setTimeout(() => {
      controller.abort(`${label} 超时（>${timeoutMs}ms）`);
    }, timeoutMs);

    return await chatModel.invoke(prompt, { signal: controller.signal });
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (abortTimer) clearTimeout(abortTimer);
  }
}

/**
 * 获取文本的向量嵌入
 */
async function getEmbedding(text) {
  const result = await withTimeout(
    embeddings.embedQuery(text),
    EMBEDDING_TIMEOUT_MS,
    '生成问题 Embedding'
  );
  return result;
}

/**
 * 从 Milvus 检索相关内容
 */
async function retrieveRelevantContent(question, k = 5) {
  try {
    const queryVector = await getEmbedding(question);

    const searchResult = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: k,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content']
    });

    return searchResult.results;
  } catch (error) {
    console.error('检索失败:', error.message);
    return [];
  }
}

/**
 * RAG 回答函数
 */
async function answerWithRAG(question, k = 5) {
  console.log('  [RAG] 开始检索...');

  // 1. 检索
  const contexts = await retrieveRelevantContent(question, k);

  if (contexts.length === 0) {
    console.log('  [RAG] 未检索到相关片段');
    return { answer: '未找到相关内容', contexts: [] };
  }

  console.log(`  [RAG] 已检索到 ${contexts.length} 个片段，开始生成回答...`);

  // 2. 构建上下文
  const contextBlocks = [];
  let totalChars = 0;
  for (let i = 0; i < contexts.length; i++) {
    const clipped = (contexts[i].content || '').slice(0, CONTEXT_CHUNK_MAX_CHARS);
    if (!clipped) continue;

    if (totalChars + clipped.length > CONTEXT_MAX_TOTAL_CHARS) break;
    totalChars += clipped.length;
    contextBlocks.push(`[片段${contextBlocks.length + 1}] 第${contexts[i].chapter_num}章: ${clipped}`);
  }

  const contextText = contextBlocks.join('\n\n');

  // 3. 构建 Prompt (使用优化版)
  const prompt = `你是一个专业的《天龙八部》小说分析专家。请基于提供的片段严谨回答问题。

【分析步骤】
1. 仔细阅读每个片段，提取关键信息
2. 识别片段中提到的所有人物和事件
3. 分析信息之间的关联和逻辑
4. 基于片段内容给出准确答案

【回答要求】
- 严格基于提供的片段内容回答
- 如果片段中有明确信息，请直接引用
- 如需推理，只给出简洁结论，不展开详细思维过程
- 如果片段中没有相关信息，请如实说明

请根据以下《天龙八部》小说片段回答问题：
${contextText}

用户问题: ${question}

请给出简洁、基于证据的最终回答：`;

  // 4. 生成回答
  let response;
  try {
    response = await invokeWithAbort(
      model,
      prompt,
      MODEL_TIMEOUT_MS,
      `RAG 生成回答（问题: ${question.slice(0, 20)}...）`
    );
  } catch (error) {
    console.error(`  [RAG] 回答生成失败，使用降级答案。原因: ${error.message}`);
    return {
      answer: '抱歉，当前问题在超时时间内未完成回答。请提高 RAG_MODEL_TIMEOUT_MS 后重试。',
      contexts
    };
  }

  console.log('  [RAG] 回答生成完成');

  return {
    answer: response.content,
    contexts: contexts
  };
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('╔' + '═'.repeat(78) + '╗');
    console.log('║' + ' '.repeat(20) + 'RAG 系统评估' + ' '.repeat(48) + '║');
    console.log('╚' + '═'.repeat(78) + '╝');

    // 连接 Milvus
    console.log(`\n连接 Milvus (${MILVUS_ADDRESS})...`);
    await client.connectPromise;
    console.log('✓ 已连接\n');

    // 确保集合已加载
    try {
      await client.loadCollection({ collection_name: COLLECTION_NAME });
      console.log('✓ 集合已加载\n');
    } catch (error) {
      if (!error.message.includes('already loaded')) throw error;
      console.log('✓ 集合已处于加载状态\n');
    }

    // 创建评估器
    const evaluator = new RAGEvaluator({
      evalMode: EVAL_MODE
      // judgeModel: 'qwen3.5-plus' // 使用强模型作为评判
    });

    // 选择要评估的测试用例 (可以筛选特定类型)
    const selectedTests = TEST_LIMIT > 0
      ? TEST_CASES.slice(0, TEST_LIMIT)
      : TEST_CASES; // 评估全部
    // const selectedTests = TEST_CASES.filter(t => t.type === 'simple_fact'); // 只评估简单事实
    // const selectedTests = TEST_CASES.filter(t => t.type === 'relationship'); // 只评估人物关系

    console.log(`准备评估 ${selectedTests.length} 个问题...\n`);

    // 运行评估
    const report = await evaluator.evaluate(
      selectedTests,
      answerWithRAG,
      { k: 5 } // 检索 Top-5 片段
    );

    // 打印报告摘要
    console.log('\n' + '='.repeat(80));
    console.log('评估报告摘要');
    console.log('='.repeat(80));
    console.log(`\n总体概况:`);
    console.log(`  - 测试问题数: ${report.summary.totalQuestions}`);
    console.log(`  - 失败率: ${(report.summary.failureRate * 100).toFixed(2)}%`);
    console.log(`  - 硬失败率: ${(report.summary.hardFailureRate * 100).toFixed(2)}%`);
    console.log(`  - 降级率: ${(report.summary.degradedRate * 100).toFixed(2)}%`);
    console.log(`  - 平均置信度: ${(report.summary.averageScores.confidence * 100).toFixed(2)}%`);
    console.log(`  - 综合评分: ${(report.summary.averageScores.overall * 100).toFixed(2)}%`);

    console.log(`\n各项指标平均分:`);
    console.log(`  - Context Precision: ${(report.summary.averageScores.contextPrecision * 100).toFixed(2)}%`);
    console.log(`  - Context Recall: ${(report.summary.averageScores.contextRecall * 100).toFixed(2)}%`);
    console.log(`  - Faithfulness: ${(report.summary.averageScores.faithfulness * 100).toFixed(2)}%`);
    console.log(`  - Answer Relevancy: ${(report.summary.averageScores.answerRelevancy * 100).toFixed(2)}%`);
    console.log(`  - Answer Correctness: ${(report.summary.averageScores.answerCorrectness * 100).toFixed(2)}%`);
    console.log(`  - Character Consistency: ${(report.summary.averageScores.characterConsistency * 100).toFixed(2)}%`);

    console.log(`\n按问题类型统计:`);
    report.byType.forEach(t => {
      console.log(`  - ${t.type}: ${t.count}题, 平均分 ${(t.avgScore * 100).toFixed(2)}%, 置信度 ${(t.avgConfidence * 100).toFixed(2)}%`);
    });

    if (report.failures.length > 0) {
      console.log(`\n失败案例 (${report.failures.length}个):`);
      report.failures.forEach(f => {
        console.log(`  - ${f.question.substring(0, 50)}... (${(f.score * 100).toFixed(1)}%)`);
      });
    }

    console.log(`\n优化建议:`);
    report.recommendations.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.issue}`);
      console.log(`     → ${r.suggestion}`);
    });

    // 保存详细报告
    const reportPath = './rag-evaluation-report.md';
    await evaluator.saveReport(reportPath);

    console.log('\n' + '='.repeat(80));
    console.log('评估完成!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('评估失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行
main();

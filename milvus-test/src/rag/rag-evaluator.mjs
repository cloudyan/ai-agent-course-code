import "dotenv/config";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import fs from 'fs/promises';

const VECTOR_DIM = 1024;
const DEFAULT_JUDGE_TIMEOUT_MS = Number(process.env.RAG_JUDGE_TIMEOUT_MS || 60000);
const DEFAULT_EMBEDDING_TIMEOUT_MS = Number(process.env.RAG_EMBEDDING_TIMEOUT_MS || 30000);
const DEFAULT_EVAL_MODE = process.env.RAG_EVAL_MODE || 'balanced';
const METRIC_WEIGHTS = {
  contextPrecision: 0.15,
  contextRecall: 0.15,
  faithfulness: 0.25,
  answerRelevancy: 0.20,
  answerCorrectness: 0.15,
  characterConsistency: 0.10
};

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
      console.log(`  [评估] ${label} 仍在执行中...`);
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

function clampScore(value, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function extractJson(text) {
  if (!text) return null;

  const raw = text.toString().trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) return null;

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * RAG 评估器 - 专门针对天龙八部电子书场景
 *
 * 评估维度：
 * 1. 检索质量：Context Precision, Context Recall, MRR
 * 2. 生成质量：Faithfulness, Answer Relevancy, Character Consistency
 * 3. 端到端：Answer Correctness
 */
export class RAGEvaluator {
  constructor(config = {}) {
    this.config = {
      judgeModel: config.judgeModel || process.env.MODEL_NAME,
      judgeTimeoutMs: config.judgeTimeoutMs || DEFAULT_JUDGE_TIMEOUT_MS,
      embeddingTimeoutMs: config.embeddingTimeoutMs || DEFAULT_EMBEDDING_TIMEOUT_MS,
      logProgress: config.logProgress ?? true,
      evalMode: config.evalMode || DEFAULT_EVAL_MODE
    };

    // 初始化 LLM (用于评估)
    this.judgeModel = new ChatOpenAI({
      temperature: 0.1, // 低温度确保评估一致性
      apiKey: process.env.OPENAI_API_KEY,
      model: this.config.judgeModel,
      timeout: this.config.judgeTimeoutMs,
      maxRetries: 0,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL
      },
    });

    // 初始化 Embedding (用于语义相似度)
    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.EMBEDDINGS_API_KEY,
      model: process.env.EMBEDDINGS_MODEL_NAME,
      timeout: this.config.embeddingTimeoutMs,
      maxRetries: 0,
      configuration: {
        baseURL: process.env.EMBEDDINGS_BASE_URL
      },
      dimensions: VECTOR_DIM
    });

    // 评估结果存储
    this.results = [];
  }

  log(message) {
    if (this.config.logProgress) {
      console.log(message);
    }
  }

  async invokeJudge(prompt, label) {
    const response = await invokeWithAbort(
      this.judgeModel,
      prompt,
      this.config.judgeTimeoutMs,
      label
    );
    return response.content.toString();
  }

  async safeMetric(label, fn, fallbackValue) {
    try {
      return await fn();
    } catch (error) {
      console.error(`  [评估] ${label} 失败，使用降级值。原因: ${error.message}`);
      return {
        ...fallbackValue,
        error: error.message
      };
    }
  }

  getMetricValue(metricKey, metrics) {
    if (metricKey === 'answerCorrectness') {
      if (metrics.answerCorrectness?.error) return null;
      const value = metrics.answerCorrectness?.overall;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    if (metrics[metricKey]?.error) return null;

    const value = metrics[metricKey]?.score;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  collectMetricErrors(metrics) {
    return Object.entries(metrics)
      .filter(([k, v]) => k !== 'overallScore' && k !== 'confidence' && v?.error)
      .map(([key, value]) => ({ key, error: value.error }));
  }

  /**
   * 主评估函数
   */
  async evaluate(testCases, ragFunction, options = {}) {
    this.results = [];

    console.log('='.repeat(80));
    console.log('开始 RAG 系统评估');
    console.log(`测试用例数: ${testCases.length}`);
    console.log('='.repeat(80));

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n[${i + 1}/${testCases.length}] 评估问题: ${testCase.question}`);

      // 1. 运行 RAG 系统获取回答和检索结果
      this.log('  [评估] 运行 RAG...');
      const ragResult = await this.safeMetric(
        'RAG 回答',
        async () => ragFunction(testCase.question, options.k || 5),
        { answer: '[RAG 执行失败]', contexts: [] }
      );

      // 2. 评估检索质量
      this.log('  [评估] 计算检索指标...');
      const retrievalMetrics = await this.evaluateRetrieval(
        testCase.question,
        ragResult.contexts || [],
        testCase.relevantChunks || []
      );

      // 3. 评估生成质量
      this.log('  [评估] 计算生成指标...');
      const generationMetrics = await this.evaluateGeneration(
        testCase.question,
        ragResult.answer || '',
        ragResult.contexts || [],
        testCase.groundTruth
      );

      // 4. 特殊指标：人物一致性（天龙八部场景）
      this.log('  [评估] 检查人物一致性...');
      const characterMetrics = await this.safeMetric(
        'Character Consistency',
        async () => this.evaluateCharacterConsistency(
          ragResult.answer || '',
          testCase.expectedCharacters || []
        ),
        { score: 0, hasConsistencyIssues: true, mentionedCharacters: [] }
      );

      // 5. 综合评分
      const combinedMetrics = {
        ...retrievalMetrics,
        ...generationMetrics,
        characterConsistency: characterMetrics
      };
      const overall = this.calculateOverallScore(combinedMetrics);

      const metrics = {
        ...combinedMetrics,
        overallScore: overall.score,
        confidence: overall.confidence,
        availableWeight: overall.availableWeight,
        missingMetrics: overall.missingMetrics
      };
      const metricErrors = this.collectMetricErrors(metrics);
      const ragError = ragResult.error || null;
      const hardFailure = Boolean(ragError) && (ragResult.contexts || []).length === 0;

      const result = {
        question: testCase.question,
        questionType: testCase.type || 'unknown',
        groundTruth: testCase.groundTruth,
        predictedAnswer: ragResult.answer,
        contexts: ragResult.contexts,
        metrics,
        execution: {
          ragError,
          metricErrors,
          hardFailure,
          degraded: hardFailure || metricErrors.length > 0
        }
      };

      this.results.push(result);
      this.printResult(result);
    }

    return this.generateReport();
  }

  /**
   * 评估检索质量
   */
  async evaluateRetrieval(question, retrievedContexts, relevantChunks) {
    if (retrievedContexts.length === 0) {
      return {
        contextPrecision: { score: 0, relevantCount: 0, totalCount: 0, judgments: [] },
        contextRecall: relevantChunks.length > 0
          ? { score: 0, foundCount: 0, totalRelevant: relevantChunks.length }
          : null,
        mrr: 0,
        avgRetrievalScore: 0,
        retrievedCount: 0
      };
    }

    // Context Precision@K: 检索结果中相关片段的比例
    const contextPrecision = await this.safeMetric(
      'Context Precision',
      async () => this.calculateContextPrecision(
        question,
        retrievedContexts,
        relevantChunks
      ),
      { score: 0, relevantCount: 0, totalCount: retrievedContexts.length, judgments: [] }
    );

    // Context Recall: 相关片段被检索到的比例 (需要ground truth)
    const contextRecall = relevantChunks.length > 0
      ? await this.calculateContextRecall(retrievedContexts, relevantChunks)
      : null;

    // MRR: Mean Reciprocal Rank
    const mrr = this.calculateMRR(retrievedContexts, relevantChunks);

    // 平均相似度分数
    const avgScore = retrievedContexts.reduce((sum, ctx) => sum + (ctx.score || 0), 0)
      / retrievedContexts.length;

    return {
      contextPrecision,
      contextRecall,
      mrr,
      avgRetrievalScore: avgScore,
      retrievedCount: retrievedContexts.length
    };
  }

  /**
   * 计算 Context Precision
   * 使用 LLM 判断每个检索片段是否与问题相关
   */
  async calculateContextPrecision(question, retrievedContexts) {
    if (retrievedContexts.length === 0) {
      return { score: 0, relevantCount: 0, totalCount: 0, judgments: [] };
    }

    if (this.config.evalMode === 'fast') {
      const keywordSet = new Set(question.split(/[，。！？；、\s]+/).filter(Boolean));
      let relevantCount = 0;
      const judgments = retrievedContexts.map((ctx) => {
        const text = (ctx.content || '').slice(0, 500);
        const hit = [...keywordSet].some((k) => k.length > 1 && text.includes(k));
        if (hit) relevantCount++;
        return { content: text.slice(0, 100), isRelevant: hit, source: 'heuristic' };
      });

      return {
        score: relevantCount / retrievedContexts.length,
        relevantCount,
        totalCount: retrievedContexts.length,
        judgments
      };
    }

    let relevantCount = 0;
    const judgments = [];

    for (const ctx of retrievedContexts) {
      const prompt = `判断以下文本片段是否与问题相关。

问题：${question}
片段内容：${ctx.content?.substring(0, 500)}

请判断：这个片段是否包含回答问题的相关信息？
只回答 "是" 或 "否"。`;

      const response = await this.invokeJudge(
        prompt,
        `Context Precision 判定（问题: ${question.slice(0, 20)}...）`
      );
      const normalized = response.toLowerCase();
      const isRelevant = normalized.includes('是') && !normalized.includes('否');

      if (isRelevant) relevantCount++;
      judgments.push({ content: ctx.content?.substring(0, 100), isRelevant });
    }

    return {
      score: relevantCount / retrievedContexts.length,
      relevantCount,
      totalCount: retrievedContexts.length,
      judgments
    };
  }

  /**
   * 计算 Context Recall
   * 需要预先标注的相关片段作为 ground truth
   */
  async calculateContextRecall(retrievedContexts, relevantChunks) {
    if (relevantChunks.length === 0) return null;

    // 将检索到的片段与相关片段进行语义匹配
    let foundRelevant = 0;

    for (const relevantChunk of relevantChunks) {
      // 检查是否检索到了这个相关片段
      const isFound = retrievedContexts.some(ctx =>
        ctx.content?.includes(relevantChunk.substring(0, 100)) ||
        this.calculateTextSimilarity(ctx.content, relevantChunk) > 0.85
      );
      if (isFound) foundRelevant++;
    }

    return {
      score: foundRelevant / relevantChunks.length,
      foundCount: foundRelevant,
      totalRelevant: relevantChunks.length
    };
  }

  /**
   * 计算 MRR (Mean Reciprocal Rank)
   */
  calculateMRR(retrievedContexts, relevantChunks) {
    if (relevantChunks.length === 0 || retrievedContexts.length === 0) return 0;

    // 找到第一个相关片段的排名
    for (let i = 0; i < retrievedContexts.length; i++) {
      const isRelevant = relevantChunks.some(chunk =>
        retrievedContexts[i].content?.includes(chunk.substring(0, 100))
      );
      if (isRelevant) {
        return 1 / (i + 1); // 排名从1开始
      }
    }
    return 0;
  }

  /**
   * 评估生成质量
   */
  async evaluateGeneration(question, answer, contexts, groundTruth) {
    const faithfulnessTask = this.safeMetric(
      'Faithfulness',
      async () => this.calculateFaithfulness(answer, contexts),
      { score: 0, supportedClaims: [], issues: ['评估失败'] }
    );
    const answerRelevancyTask = this.safeMetric(
      'Answer Relevancy',
      async () => this.calculateAnswerRelevancy(question, answer),
      { score: 0, reason: '评估失败' }
    );
    const answerCorrectnessTask = groundTruth
      ? this.safeMetric(
        'Answer Correctness',
        async () => this.calculateAnswerCorrectness(answer, groundTruth),
        { overall: 0, semanticSimilarity: 0, factualConsistency: 0, issues: ['评估失败'] }
      )
      : Promise.resolve(null);

    const [faithfulness, answerRelevancy, answerCorrectness] = await Promise.all([
      faithfulnessTask,
      answerRelevancyTask,
      answerCorrectnessTask
    ]);

    return {
      faithfulness,
      answerRelevancy,
      answerCorrectness
    };
  }

  /**
   * 计算 Faithfulness (忠实度)
   * 检查答案中的每个声明是否被上下文支持
   */
  async calculateFaithfulness(answer, contexts) {
    if (this.config.evalMode === 'fast') {
      return {
        score: answer && contexts.length > 0 ? 0.6 : 0,
        supportedClaims: [],
        issues: ['fast 模式下使用启发式估计']
      };
    }

    const contextText = contexts.map((c, i) => `[片段${i + 1}] ${c.content}`).join('\n\n');
    const prompt = `请评估答案是否忠实于上下文，并只返回 JSON。

输出格式：
{"score":0到1之间的数字,"supportedClaims":["最多3条被支持的关键事实"],"issues":["最多3条问题，若无则为空数组"]}

上下文：
${contextText}

答案：
${answer}`;

    const response = await this.invokeJudge(prompt, 'Faithfulness 评估');
    const parsed = extractJson(response);

    if (!parsed) {
      return {
        score: 0,
        supportedClaims: [],
        issues: ['评估模型未返回可解析的 JSON']
      };
    }

    return {
      score: clampScore(parsed.score),
      supportedClaims: Array.isArray(parsed.supportedClaims) ? parsed.supportedClaims : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : []
    };
  }

  /**
   * 计算 Answer Relevancy (答案相关性)
   * 使用反向问题生成方法
   */
  async calculateAnswerRelevancy(question, answer) {
    if (this.config.evalMode === 'fast') {
      const qTokens = new Set(question.split(/[，。！？；、\s]+/).filter(Boolean));
      const overlap = [...qTokens].filter((t) => t.length > 1 && answer.includes(t)).length;
      const denom = Math.max(1, [...qTokens].filter((t) => t.length > 1).length);
      return {
        score: clampScore(overlap / denom),
        reason: 'fast 模式下使用关键词重叠估计'
      };
    }

    const prompt = `请判断答案是否直接、完整地回应了问题，并只返回 JSON。

输出格式：
{"score":0到1之间的数字,"reason":"一句话说明"}

问题：${question}
答案：${answer}`;

    const response = await this.invokeJudge(prompt, 'Answer Relevancy 评估');
    const parsed = extractJson(response);

    if (!parsed) {
      return { score: 0, reason: '评估模型未返回可解析的 JSON' };
    }

    return {
      score: clampScore(parsed.score),
      reason: parsed.reason || ''
    };
  }

  /**
   * 计算 Answer Correctness (答案正确性)
   * 对比预测答案与参考答案
   */
  async calculateAnswerCorrectness(predicted, groundTruth) {
    // 语义相似度
    const semanticSim = await this.calculateSemanticSimilarity(predicted, groundTruth);

    if (this.config.evalMode === 'fast') {
      return {
        semanticSimilarity: semanticSim,
        factualConsistency: semanticSim,
        matchedFacts: [],
        issues: ['fast 模式下跳过 LLM 事实判定'],
        overall: semanticSim
      };
    }

    // 事实一致性检查
    const factCheckPrompt = `比较参考答案和预测答案的事实一致性，并只返回 JSON。

输出格式：
{"score":0到1之间的数字,"matchedFacts":["最多3条"],"issues":["最多3条，若无则为空数组"]}

参考答案：${groundTruth}
预测答案：${predicted}`;

    const factCheckResponse = await this.invokeJudge(factCheckPrompt, 'Answer Correctness 评估');
    const parsed = extractJson(factCheckResponse);
    const factScore = clampScore(parsed?.score);

    return {
      semanticSimilarity: semanticSim,
      factualConsistency: factScore,
      matchedFacts: Array.isArray(parsed?.matchedFacts) ? parsed.matchedFacts : [],
      issues: Array.isArray(parsed?.issues) ? parsed.issues : [],
      overall: (semanticSim + factScore) / 2
    };
  }

  /**
   * 评估人物一致性 (天龙八部特定)
   */
  async evaluateCharacterConsistency(answer, expectedCharacters) {
    const consistencyPrompt = `请检查答案中的人物提及和人物关系是否合理，并只返回 JSON。

输出格式：
{"score":0到1之间的数字,"mentionedCharacters":["人物名"],"missingExpected":["缺失的预期人物"],"unsupportedCharacters":["答案里出现但明显不该出现的人物"],"hasFactualIssues":true或false,"reason":"一句话说明"}

预期应涉及的人物：${expectedCharacters.join('、') || '无'}
答案：${answer}`;

    const response = await this.invokeJudge(consistencyPrompt, 'Character Consistency 评估');
    const parsed = extractJson(response);

    if (!parsed) {
      return {
        mentionedCharacters: [],
        characterCount: 0,
        missingExpected: expectedCharacters,
        unsupportedCharacters: [],
        hasConsistencyIssues: true,
        reason: '评估模型未返回可解析的 JSON',
        score: 0
      };
    }

    const mentionedCharacters = Array.isArray(parsed.mentionedCharacters)
      ? parsed.mentionedCharacters
      : [];
    const missingExpected = Array.isArray(parsed.missingExpected)
      ? parsed.missingExpected
      : [];
    const unsupportedCharacters = Array.isArray(parsed.unsupportedCharacters)
      ? parsed.unsupportedCharacters
      : [];

    return {
      mentionedCharacters,
      characterCount: mentionedCharacters.length,
      missingExpected,
      unsupportedCharacters,
      hasConsistencyIssues: Boolean(parsed.hasFactualIssues),
      reason: parsed.reason || '',
      score: clampScore(parsed.score)
    };
  }

  /**
   * 计算语义相似度
   */
  async calculateSemanticSimilarity(text1, text2) {
    try {
      const [emb1, emb2] = await Promise.all([
        withTimeout(
          this.embeddings.embedQuery(text1),
          this.config.embeddingTimeoutMs,
          '计算语义相似度 Embedding #1'
        ),
        withTimeout(
          this.embeddings.embedQuery(text2),
          this.config.embeddingTimeoutMs,
          '计算语义相似度 Embedding #2'
        )
      ]);

      // 计算余弦相似度
      const dotProduct = emb1.reduce((sum, val, i) => sum + val * emb2[i], 0);
      const norm1 = Math.sqrt(emb1.reduce((sum, val) => sum + val * val, 0));
      const norm2 = Math.sqrt(emb2.reduce((sum, val) => sum + val * val, 0));

      return dotProduct / (norm1 * norm2);
    } catch (error) {
      console.error('计算语义相似度失败:', error.message);
      return 0;
    }
  }

  /**
   * 计算文本相似度 (简单版本)
   */
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    return intersection.size / Math.max(words1.size, words2.size);
  }

  /**
   * 计算综合评分
   */
  calculateOverallScore(metrics) {
    let totalWeight = 0;
    let weightedSum = 0;
    const missingMetrics = [];

    for (const [key, weight] of Object.entries(METRIC_WEIGHTS)) {
      const value = this.getMetricValue(key, metrics);
      if (typeof value === 'number') {
        weightedSum += value * weight;
        totalWeight += weight;
      } else {
        missingMetrics.push(key);
      }
    }

    return {
      score: totalWeight > 0 ? weightedSum / totalWeight : 0,
      confidence: totalWeight,
      availableWeight: totalWeight,
      missingMetrics
    };
  }

  /**
   * 打印单个结果
   */
  printResult(result) {
    console.log('\n' + '-'.repeat(80));
    console.log('评估结果:');
    console.log(`  问题类型: ${result.questionType}`);
    console.log(`  综合评分: ${(result.metrics.overallScore * 100).toFixed(2)}%`);
    console.log(`  置信度: ${(result.metrics.confidence * 100).toFixed(2)}%`);
    console.log('\n  检索指标:');
    console.log(`    - Context Precision: ${(result.metrics.contextPrecision?.score * 100 || 0).toFixed(2)}%`);
    console.log(`    - Context Recall: ${(result.metrics.contextRecall?.score * 100 || 0).toFixed(2)}%`);
    console.log(`    - MRR: ${result.metrics.mrr?.toFixed(4) || 'N/A'}`);
    console.log('\n  生成指标:');
    console.log(`    - Faithfulness: ${(result.metrics.faithfulness?.score * 100 || 0).toFixed(2)}%`);
    console.log(`    - Answer Relevancy: ${(result.metrics.answerRelevancy?.score * 100 || 0).toFixed(2)}%`);
    if (result.metrics.answerCorrectness) {
      console.log(`    - Answer Correctness: ${(result.metrics.answerCorrectness?.overall * 100 || 0).toFixed(2)}%`);
    }
    console.log(`    - Character Consistency: ${(result.metrics.characterConsistency?.score * 100 || 0).toFixed(2)}%`);
    if (result.execution?.degraded) {
      console.log('  执行状态: degraded');
    }
    console.log('-'.repeat(80));
  }

  /**
   * 生成评估报告
   */
  generateReport() {
    if (this.results.length === 0) {
      return { error: '没有评估结果' };
    }

    // 按问题类型分组统计
    const byType = {};
    this.results.forEach(r => {
      const type = r.questionType;
      if (!byType[type]) byType[type] = [];
      byType[type].push(r);
    });

    // 计算总体统计
    const avgScores = {
      contextPrecision: this.avg(this.results.map(r => r.metrics.contextPrecision?.score)),
      contextRecall: this.avg(this.results.map(r => r.metrics.contextRecall?.score).filter(s => s !== null)),
      faithfulness: this.avg(this.results.map(r => r.metrics.faithfulness?.score)),
      answerRelevancy: this.avg(this.results.map(r => r.metrics.answerRelevancy?.score)),
      answerCorrectness: this.avg(this.results.map(r => r.metrics.answerCorrectness?.overall).filter(s => s !== null)),
      characterConsistency: this.avg(this.results.map(r => r.metrics.characterConsistency?.score)),
      overall: this.avg(this.results.map(r => r.metrics.overallScore)),
      confidence: this.avg(this.results.map(r => r.metrics.confidence))
    };

    // 识别失败案例
    const failures = this.results.filter(r => r.metrics.overallScore < 0.6);
    const hardFailures = this.results.filter(r => r.execution?.hardFailure);

    const report = {
      summary: {
        totalQuestions: this.results.length,
        averageScores: avgScores,
        failureRate: failures.length / this.results.length,
        hardFailureRate: hardFailures.length / this.results.length,
        degradedRate: this.results.filter(r => r.execution?.degraded).length / this.results.length
      },
      byType: Object.entries(byType).map(([type, results]) => ({
        type,
        count: results.length,
        avgScore: this.avg(results.map(r => r.metrics.overallScore)),
        avgConfidence: this.avg(results.map(r => r.metrics.confidence))
      })),
      failures: failures.map(r => ({
        question: r.question,
        score: r.metrics.overallScore,
        confidence: r.metrics.confidence,
        hardFailure: Boolean(r.execution?.hardFailure),
        issues: this.identifyIssues(r.metrics),
        execution: r.execution
      })),
      recommendations: this.generateRecommendations(avgScores, failures)
    };

    return report;
  }

  avg(values) {
    const valid = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }

  identifyIssues(metrics) {
    const issues = [];
    if ((metrics.faithfulness?.score || 1) < 0.7) issues.push('faithfulness_low');
    if ((metrics.contextPrecision?.score || 1) < 0.7) issues.push('retrieval_precision_low');
    if ((metrics.contextRecall?.score || 1) < 0.7) issues.push('retrieval_recall_low');
    if ((metrics.answerRelevancy?.score || 1) < 0.7) issues.push('answer_not_relevant');
    if ((metrics.confidence || 1) < 0.6) issues.push('low_confidence');
    return issues;
  }

  generateRecommendations(avgScores, failures) {
    const recommendations = [];

    if (avgScores.faithfulness < 0.8) {
      recommendations.push({
        issue: 'Faithfulness 较低',
        suggestion: '加强 Prompt 中的 grounding 要求，要求模型引用原文，添加幻觉检测机制'
      });
    }

    if (avgScores.contextPrecision < 0.75) {
      recommendations.push({
        issue: '检索精确率较低',
        suggestion: '优化切分策略，添加重排序(reranking)，过滤低相似度片段'
      });
    }

    if (avgScores.contextRecall < 0.7) {
      recommendations.push({
        issue: '检索召回率较低',
        suggestion: '增加 Top-K 值，优化 Embedding 模型，尝试混合检索(向量+关键词)'
      });
    }

    if (avgScores.answerRelevancy < 0.75) {
      recommendations.push({
        issue: '答案相关性较低',
        suggestion: '优化 Prompt 设计，明确回答要求，添加 Chain-of-Thought 指导'
      });
    }

    if (avgScores.confidence < 0.7) {
      recommendations.push({
        issue: '评估置信度较低',
        suggestion: '延长 judge/model 超时，或切换到 fast 模式减少超时造成的指标缺失'
      });
    }

    return recommendations;
  }

  /**
   * 保存报告到文件
   */
  async saveReport(outputPath) {
    const report = this.generateReport();
    const reportText = this.formatReport(report);
    await fs.writeFile(outputPath, reportText, 'utf-8');
    console.log(`\n报告已保存到: ${outputPath}`);
    return report;
  }

  formatReport(report) {
    let text = '# RAG 评估报告\n\n';
    text += '## 总体概况\n\n';
    text += `- 测试问题数: ${report.summary.totalQuestions}\n`;
    text += `- 失败率: ${(report.summary.failureRate * 100).toFixed(2)}%\n`;
    text += `- 硬失败率: ${(report.summary.hardFailureRate * 100).toFixed(2)}%\n`;
    text += `- 降级率: ${(report.summary.degradedRate * 100).toFixed(2)}%\n`;
    text += `- 平均置信度: ${(report.summary.averageScores.confidence * 100).toFixed(2)}%\n`;
    text += `- 综合评分: ${(report.summary.averageScores.overall * 100).toFixed(2)}%\n\n`;

    text += '## 各项指标平均分\n\n';
    text += '| 指标 | 分数 |\n';
    text += '|------|------|\n';
    text += `| Context Precision | ${(report.summary.averageScores.contextPrecision * 100).toFixed(2)}% |\n`;
    text += `| Context Recall | ${(report.summary.averageScores.contextRecall * 100).toFixed(2)}% |\n`;
    text += `| Faithfulness | ${(report.summary.averageScores.faithfulness * 100).toFixed(2)}% |\n`;
    text += `| Answer Relevancy | ${(report.summary.averageScores.answerRelevancy * 100).toFixed(2)}% |\n`;
    text += `| Answer Correctness | ${(report.summary.averageScores.answerCorrectness * 100).toFixed(2)}% |\n`;
    text += `| Character Consistency | ${(report.summary.averageScores.characterConsistency * 100).toFixed(2)}% |\n\n`;
    text += `| Confidence | ${(report.summary.averageScores.confidence * 100).toFixed(2)}% |\n\n`;

    text += '## 按问题类型统计\n\n';
    report.byType.forEach(t => {
      text += `- ${t.type}: ${t.count}题, 平均分 ${(t.avgScore * 100).toFixed(2)}%, 置信度 ${(t.avgConfidence * 100).toFixed(2)}%\n`;
    });

    text += '\n## 失败案例分析\n\n';
    report.failures.forEach(f => {
      text += `### ${f.question}\n`;
      text += `- 评分: ${(f.score * 100).toFixed(2)}%\n`;
      text += `- 问题: ${f.issues.join(', ')}\n\n`;
    });

    text += '\n## 优化建议\n\n';
    report.recommendations.forEach(r => {
      text += `### ${r.issue}\n`;
      text += `${r.suggestion}\n\n`;
    });

    return text;
  }
}

// 测试用例示例
export const TEST_CASES = [
  // 简单事实问题
  {
    question: "鸠摩智会什么武功？",
    type: "simple_fact",
    groundTruth: "鸠摩智擅长火焰刀和小无相功。火焰刀是他的独门绝技，小无相功则是他从逍遥派偷学而来。",
    expectedCharacters: ["鸠摩智"],
    relevantChunks: ["鸠摩智火焰刀绝技", "小无相功"]
  },
  {
    question: "段誉的父亲是谁？",
    type: "simple_fact",
    groundTruth: "段誉的养父是段正淳，但亲生父亲是段延庆（四大恶人之首）。",
    expectedCharacters: ["段誉", "段正淳", "段延庆"]
  },

  // 人物关系推理（多跳）
  {
    question: "段誉有几个妹妹？分别是谁？",
    type: "relationship",
    groundTruth: "段誉有5个妹妹：钟灵、木婉清、阿朱、阿紫、王语嫣。她们都是段正淳的私生女，与段誉是同父异母的兄妹。",
    expectedCharacters: ["段誉", "钟灵", "木婉清", "阿朱", "阿紫", "王语嫣", "段正淳"]
  },
  {
    question: "段誉和王语嫣有血缘关系吗？",
    type: "relationship",
    groundTruth: "有血缘关系。王语嫣是段正淳和李青萝之女，段誉是段延庆之子但被段正淳抚养，所以王语嫣是段誉的同父异母妹妹。",
    expectedCharacters: ["段誉", "王语嫣", "段正淳", "李青萝", "段延庆"]
  },
  {
    question: "虚竹的父母是谁？",
    type: "relationship",
    groundTruth: "虚竹的父亲是少林寺方丈玄慈，母亲是四大恶人之一的叶二娘。",
    expectedCharacters: ["虚竹", "玄慈", "叶二娘"]
  },

  // 对比分析
  {
    question: "天龙三兄弟是谁，谁的武功最强？",
    type: "comparison",
    groundTruth: "天龙三兄弟是乔峰（萧峰）、虚竹、段誉。三人武功各有千秋：乔峰实战经验丰富，降龙十八掌威震江湖；虚竹集逍遥三老内力于一身，武功最全面；段誉六脉神剑威力巨大但时灵时不灵。",
    expectedCharacters: ["乔峰", "萧峰", "虚竹", "段誉"]
  },

  // 情节发展
  {
    question: "段誉的身世真相是什么？",
    type: "plot_timeline",
    groundTruth: "段誉一直以为自己是段正淳的儿子，但实际上他的亲生父亲是段延庆。当年段延庆在战乱中受伤，刀白凤为报复段正淳的风流，与段延庆生下段誉。",
    expectedCharacters: ["段誉", "段正淳", "段延庆", "刀白凤"]
  },
  {
    question: "虚竹是如何成为灵鹫宫主的？",
    type: "plot_timeline",
    groundTruth: "虚竹在珍珑棋局中破解棋局，得到无崖子传授70年内力；后在天山童姥处学会天山折梅手等武功；最终在天山童姥死后，被灵鹫宫众女拥立为宫主。",
    expectedCharacters: ["虚竹", "无崖子", "天山童姥"]
  },

  // 开放式问题
  {
    question: "天龙八部这部小说的主要主题是什么？",
    type: "open_ended",
    groundTruth: "《天龙八部》主要探讨了命运无常、求而不得的主题。书中人物多有执念：慕容复执着于复国，段誉执着于王语嫣，虚竹执着于佛门，最终却都难以如愿。同时也展现了家国情怀、兄弟情义等主题。",
    expectedCharacters: ["慕容复", "段誉", "虚竹"]
  }
];

export default RAGEvaluator;

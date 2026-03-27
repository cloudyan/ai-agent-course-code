# RAG 系统评估指南：以《天龙八部》电子书为例

## 目录

1. [概述](#概述)
2. [RAG 评估核心概念](#rag-评估核心概念)
3. [评估指标体系](#评估指标体系)
4. [针对小说场景的评估策略](#针对小说场景的评估策略)
5. [评估实现方案](#评估实现方案)
6. [测试数据集构建](#测试数据集构建)
7. [评估结果分析](#评估结果分析)
8. [优化建议](#优化建议)
9. [参考资源](#参考资源)

---

## 概述

### 什么是 RAG 评估

RAG（Retrieval-Augmented Generation，检索增强生成）系统的评估是衡量检索和生成两阶段 Pipeline 质量的过程。与单一任务的评估不同，RAG 评估需要**分阶段进行**，因为检索和生成各自有不同的失败模式。

### 为什么需要评估

1. **定位问题**：当最终回答质量差时，需要判断是检索阶段还是生成阶段的问题
2. **指导优化**：通过指标识别薄弱环节，有针对性地改进
3. **版本对比**：评估不同配置/模型的效果差异
4. **质量保证**：建立生产环境的监控基线

### 评估的挑战

- **两阶段耦合**：检索质量直接影响生成质量
- **开放式答案**：小说问答往往没有唯一标准答案
- **多跳推理**：需要跨多个片段推理的问题难以评估
- **幻觉检测**：需要判断答案是否包含原文未提及的信息

---

## RAG 评估核心概念

### RAG Pipeline 架构

```
用户提问
    ↓
┌─────────────────────────────────────┐
│ 检索阶段 (Retrieval)                  │
│ - 向量化查询                          │
│ - 向量数据库检索                      │
│ - 返回 Top-K 相关片段                 │
└─────────────────────────────────────┘
    ↓
相关文档片段
    ↓
┌─────────────────────────────────────┐
│ 生成阶段 (Generation)                 │
│ - 构建 Prompt (问题 + 上下文)         │
│ - LLM 生成回答                        │
│ - 返回最终答案                        │
└─────────────────────────────────────┘
    ↓
最终回答
```

### 评估维度

RAG 评估需要关注三个层面：

1. **检索质量**：是否找到了正确的文档片段
2. **生成质量**：是否基于检索内容生成了忠实、相关的回答
3. **端到端效果**：整体回答是否满足用户需求

---

## 评估指标体系

### 1. 检索阶段指标

#### Context Precision（上下文精确率）

**定义**：检索返回的 K 个片段中，真正相关的片段所占比例。

**计算公式**：
```
Context Precision@K = (相关片段数) / K
```

**重要性**：
- 高精确率意味着 LLM 看到的都是相关信息
- 低精确率会引入噪声，干扰 LLM 理解
- 由于 LLM 存在 "Lost in the Middle" 现象，排名靠前的片段更重要

**评估方法**：
使用 LLM-as-Judge 判断每个片段是否与问题相关。

#### Context Recall（上下文召回率）

**定义**：回答问题所需的所有相关信息中，被成功检索到的比例。

**计算公式**：
```
Context Recall = (检索到的相关片段数) / (所有相关片段数)
```

**重要性**：
- 高召回率确保没有遗漏关键信息
- 低召回率可能导致回答不完整或错误
- 需要预先标注相关片段作为 Ground Truth

**评估方法**：
1. 准备参考答案（Ground Truth）
2. 将答案分解为多个事实声明
3. 检查每个声明是否能从检索片段中推断

#### MRR（Mean Reciprocal Rank）

**定义**：第一个相关片段排名的倒数平均值。

**计算公式**：
```
MRR = (1 / rank_1 + 1 / rank_2 + ... + 1 / rank_n) / n
```

**示例**：
- 第一个相关片段排在第 1 位 → 得分 1.0
- 第一个相关片段排在第 2 位 → 得分 0.5
- 第一个相关片段排在第 5 位 → 得分 0.2

**重要性**：
- 评估排序质量
- 相关片段排得越靠前越好

#### NDCG（Normalized Discounted Cumulative Gain）

**定义**：考虑多级相关性的排序质量指标。

**特点**：
- 支持分级相关性（如：非常相关、部分相关、不相关）
- 排名越靠前，权重越高
- 使用理论最优排序进行归一化

**适用场景**：
- 当相关性不是二值时（相关/不相关）
- 需要精细评估排序质量

### 2. 生成阶段指标

#### Faithfulness（忠实度）⭐ 核心指标

**定义**：生成的回答是否忠实于检索到的文档内容，是否包含幻觉（Hallucination）。

**计算公式**：
```
Faithfulness = (被上下文支持的声明数) / (总声明数)
```

**评估方法**：
1. 将回答分解为独立的事实声明
2. 逐一验证每个声明是否被检索上下文支持
3. 计算支持比例

**重要性**：
- **这是 RAG 最核心的指标**
- RAG 的根本价值就是让 LLM 基于可靠的外部知识回答
- 如果回答包含检索文档中不存在的信息，RAG 就失去了意义

**示例**：
```
上下文：段誉的父亲是段正淳。
回答：段誉的父亲是段延庆。 → Faithfulness = 0（错误）
回答：段誉的父亲是段正淳。 → Faithfulness = 1（正确）
回答：段誉的父亲是段正淳，他擅长六脉神剑。 → Faithfulness = 0.5（部分正确）
```

#### Answer Relevancy（答案相关性）

**定义**：生成的回答是否切题，是否真正回答了用户的问题。

**评估方法**（RAGAS 方法）：
1. 基于生成的回答，让 LLM 生成 N 个可能的问题
2. 计算生成的问题与原始问题的语义相似度
3. 取平均值作为相关性分数

**重要性**：
- 避免答非所问
- 检测回答是否偏离主题

**示例**：
```
问题：段誉有几个妹妹？
回答：段誉是《天龙八部》的主角之一，他精通六脉神剑...
→ Answer Relevancy 低（没有回答妹妹数量）
```

#### Answer Completeness（答案完整性）

**定义**：回答是否覆盖了问题的所有要点。

**评估方法**：
- 对比回答与参考答案
- 检查是否遗漏关键信息点
- 需要 Ground Truth

**示例**：
```
问题：段誉有几个妹妹？分别是谁？
回答：段誉有 5 个妹妹。 → 不完整（缺少名字）
回答：段誉有 5 个妹妹：钟灵、木婉清、阿朱、阿紫、王语嫣。 → 完整
```

#### Answer Correctness（答案正确性）

**定义**：生成回答与参考答案（Ground Truth）的事实一致性。

**计算方法**：
- 语义相似度 + 事实准确性
- 可使用精确匹配、F1 分数或 LLM 评估

**公式**：
```
Answer Correctness = (Semantic Similarity + Factual Accuracy) / 2
```

### 3. 端到端指标

#### RAG Triad（TruLens 框架）

TruLens 提出的 RAG 三元组评估框架：

```
        Query（查询）
           /\
          /  \
         /    \
        /      \
       /        \
Context Relevance  Answer Relevance
       \        /
        \      /
         \    /
          \  /
           \/
       Groundedness
       （忠实度）
```

1. **Context Relevance**：检索的上下文是否与查询相关
2. **Groundedness**：回答是否基于检索的上下文生成
3. **Answer Relevance**：回答是否与原始问题相关

### 4. 传统 NLP 指标（辅助参考）

| 指标 | 用途 | 局限性 |
|------|------|--------|
| **BLEU** | 机器翻译评估 | 只看词汇重叠，不理解语义 |
| **ROUGE** | 摘要评估 | 同上 |
| **BERTScore** | 语义相似度 | 依赖预训练模型，计算成本高 |

**建议**：这些指标可作为低成本筛选手段，但不应作为核心评估指标。

---

## 针对小说场景的评估策略

### 小说 RAG 的特殊挑战

1. **人物关系复杂**：需要跨多个片段推理人物关系
2. **时间线交错**：情节发展顺序对理解很重要
3. **开放式问题**：主题、情感等没有标准答案
4. **多跳推理**：如"段誉的妹妹们分别嫁给了谁"需要多步推理

### 问题类型分类

#### 类型 1：简单事实查询（单跳）

**特征**：
- 答案在单个片段中可直接找到
- 不需要推理
- 有明确的标准答案

**示例**：
- "鸠摩智会什么武功？"
- "段誉的父亲是谁？"

**评估重点**：
- Context Precision
- Faithfulness

#### 类型 2：人物关系推理（多跳）

**特征**：
- 需要跨多个片段推理
- 涉及人物关系网络
- 可能有多个正确答案的表达方式

**示例**：
- "段誉有几个妹妹？分别是谁？"
- "虚竹的父母是谁？"

**评估重点**：
- Context Recall（需要找到所有相关信息）
- Character Consistency
- Multi-hop Accuracy

#### 类型 3：对比分析

**特征**：
- 需要聚合多个片段的信息
- 涉及比较和判断
- 答案可能有主观成分

**示例**：
- "天龙三兄弟是谁，谁的武功最强？"
- "慕容复和乔峰谁武功更高？"

**评估重点**：
- Answer Completeness
- Faithfulness

#### 类型 4：情节发展（时间线）

**特征**：
- 需要理解事件顺序
- 涉及因果关系
- 可能需要长上下文

**示例**：
- "段誉的身世真相是什么？"
- "虚竹是如何成为灵鹫宫主的？"

**评估重点**：
- Temporal Accuracy
- Causal Accuracy

#### 类型 5：开放式问题

**特征**：
- 没有唯一标准答案
- 需要综合理解
- 答案质量难以量化

**示例**：
- "天龙八部的主要主题是什么？"
- "这部小说的写作风格如何？"

**评估重点**：
- Semantic Similarity
- LLM-as-Judge

### 特殊评估指标

#### Character Consistency（人物一致性）

**定义**：检查回答中的人物信息（姓名、关系、武功、门派等）是否与原文一致。

**评估方法**：
1. 提取回答中提到的人物
2. 检查人物关系是否正确
3. 验证武功、门派等信息

**重要性**：
- 小说场景特有
- 人物关系错误是常见幻觉类型

#### Temporal Accuracy（时间线准确性）

**定义**：检查回答中的事件顺序是否正确。

**评估方法**：
1. 提取回答中的时间线索
2. 与原文时间线对比
3. 检查因果关系

#### Multi-hop Accuracy（多跳推理准确性）

**定义**：评估跨多个片段推理的准确性。

**计算方法**：
```
Multi-hop Accuracy = (正确推理步数) / (总推理步数)
```

---

## 评估实现方案

### 方案一：使用 RAGAS 框架

RAGAS 是最成熟的 RAG 评估框架，提供 14+ 种评估指标。

#### 安装

```bash
npm install ragas
# 或
pip install ragas
```

#### 基础使用

```javascript
import { evaluate } from 'ragas';
import { 
  faithfulness, 
  answerRelevancy, 
  contextPrecision, 
  contextRecall 
} from 'ragas/metrics';

const dataset = {
  question: ["段誉有几个妹妹？"],
  answer: ["段誉有5个妹妹..."],
  contexts: [["片段1", "片段2"]],
  ground_truth: ["钟灵、木婉清、阿朱、阿紫、王语嫣"]
};

const results = await evaluate(dataset, [
  faithfulness,
  answerRelevancy,
  contextPrecision,
  contextRecall
]);
```

### 方案二：自定义评估框架

针对小说场景的特殊需求，可以实现自定义评估器。

#### 核心组件

```javascript
class RAGEvaluator {
  // 1. 检索质量评估
  async evaluateRetrieval(question, contexts, groundTruth) {
    return {
      contextPrecision: await this.calculateContextPrecision(contexts),
      contextRecall: await this.calculateContextRecall(contexts, groundTruth),
      mrr: this.calculateMRR(contexts, groundTruth)
    };
  }

  // 2. 生成质量评估
  async evaluateGeneration(question, answer, contexts, groundTruth) {
    return {
      faithfulness: await this.calculateFaithfulness(answer, contexts),
      answerRelevancy: await this.calculateAnswerRelevancy(question, answer),
      answerCorrectness: await this.calculateAnswerCorrectness(answer, groundTruth)
    };
  }

  // 3. 小说特有评估
  async evaluateNovelSpecific(answer, expectedCharacters) {
    return {
      characterConsistency: await this.checkCharacterConsistency(answer),
      temporalAccuracy: await this.checkTemporalAccuracy(answer)
    };
  }
}
```

#### LLM-as-Judge 实现

```javascript
// Faithfulness 评估
async function calculateFaithfulness(answer, contexts) {
  // 1. 分解答案为声明
  const claims = await extractClaims(answer);
  
  // 2. 验证每个声明
  let supportedCount = 0;
  for (const claim of claims) {
    const isSupported = await verifyClaim(claim, contexts);
    if (isSupported) supportedCount++;
  }
  
  // 3. 计算比例
  return supportedCount / claims.length;
}

// 声明验证 Prompt
const VERIFICATION_PROMPT = `
验证以下声明是否被上下文支持。

上下文：
{context}

声明：{claim}

请判断：
1. 这个声明是否被上下文直接支持？
2. 这个声明是否与上下文矛盾？
3. 这个声明是否包含上下文外的信息？

只回答 "支持"、"矛盾" 或 "无法验证"。
`;
```

### 方案三：混合评估策略

结合自动化评估和人工评估：

```
日常迭代：自动化评估（RAGAS + 自定义指标）
    ↓
版本发布：端到端测试 + 人工抽样
    ↓
定期校准：人工标注 + 指标对齐
```

---

## 测试数据集构建

### 构建原则

1. **覆盖不同难度**：简单、中等、复杂问题
2. **覆盖不同类型**：事实、推理、对比、开放式
3. **有 Ground Truth**：尽可能准备参考答案
4. **标注相关片段**：明确每个问题需要哪些原文片段

### 天龙八部测试集示例

```javascript
const TEST_CASES = [
  // 简单事实
  {
    question: "鸠摩智会什么武功？",
    type: "simple_fact",
    groundTruth: "火焰刀、小无相功",
    expectedCharacters: ["鸠摩智"],
    relevantChunks: ["鸠摩智火焰刀绝技", "小无相功"]
  },
  
  // 人物关系（多跳）
  {
    question: "段誉有几个妹妹？分别是谁？",
    type: "relationship",
    groundTruth: "5个：钟灵、木婉清、阿朱、阿紫、王语嫣",
    expectedCharacters: ["段誉", "钟灵", "木婉清", "阿朱", "阿紫", "王语嫣"],
    hops: 2
  },
  
  // 对比分析
  {
    question: "天龙三兄弟是谁，谁的武功最强？",
    type: "comparison",
    groundTruth: "乔峰、虚竹、段誉。各有特点...",
    expectedCharacters: ["乔峰", "虚竹", "段誉"]
  },
  
  // 情节发展
  {
    question: "虚竹是如何成为灵鹫宫主的？",
    type: "plot_timeline",
    groundTruth: "破解珍珑棋局→得无崖子内力→天山童姥传功→成为宫主",
    requiresTemporalReasoning: true
  },
  
  // 开放式
  {
    question: "天龙八部的主要主题是什么？",
    type: "open_ended",
    groundTruth: "命运无常、求而不得、家国情怀...",
    judgmentType: "semantic"
  }
];
```

### 自动生成测试集

使用 RAGAS Testset Generator：

```javascript
import { TestsetGenerator } from 'ragas/testset';

const generator = new TestsetGenerator({
  generatorLLM,
  criticLLM,
  embeddings
});

const testset = await generator.generate(documents, {
  testSize: 100,
  distributions: {
    singleHop: 0.4,
    multiHop: 0.4,
    openEnded: 0.2
  }
});
```

---

## 评估结果分析

### 报告结构

```markdown
# RAG 评估报告

## 总体概况
- 测试问题数: 50
- 失败率: 15%
- 综合评分: 82.5%

## 各项指标
| 指标 | 分数 | 状态 |
|------|------|------|
| Context Precision | 85% | ✅ 良好 |
| Context Recall | 72% | ⚠️ 需优化 |
| Faithfulness | 88% | ✅ 良好 |
| Answer Relevancy | 90% | ✅ 优秀 |
| Character Consistency | 75% | ⚠️ 需优化 |

## 按问题类型
- simple_fact: 20题, 平均分 92%
- relationship: 15题, 平均分 78%
- comparison: 10题, 平均分 75%
- plot_timeline: 5题, 平均分 65%

## 失败案例分析
1. "段誉和王语嫣有血缘关系吗？"
   - 评分: 45%
   - 问题: faithfulness_low, retrieval_recall_low

## 优化建议
1. 检索召回率较低 → 增加 Top-K，优化 Embedding 模型
2. 人物一致性较低 → 添加人物关系验证
```

### 关键阈值

```javascript
const THRESHOLDS = {
  faithfulness: {
    excellent: 0.95,
    good: 0.85,
    acceptable: 0.75
  },
  contextPrecision: {
    excellent: 0.90,
    good: 0.80,
    acceptable: 0.70
  },
  contextRecall: {
    excellent: 0.90,
    good: 0.80,
    acceptable: 0.70
  }
};
```

---

## 优化建议

### 检索阶段优化

| 问题 | 症状 | 解决方案 |
|------|------|----------|
| Context Precision 低 | 检索到大量无关片段 | 添加重排序（Reranking）、提高相似度阈值 |
| Context Recall 低 | 遗漏关键信息 | 增加 Top-K、优化切分策略、混合检索 |
| MRR 低 | 相关片段排名靠后 | 调整 Embedding 模型、添加查询扩展 |

### 生成阶段优化

| 问题 | 症状 | 解决方案 |
|------|------|----------|
| Faithfulness 低 | 回答包含幻觉 | 加强 Grounding Prompt、要求引用原文 |
| Answer Relevancy 低 | 答非所问 | 优化 Prompt、添加 CoT 指导 |
| Character Consistency 低 | 人物信息错误 | 添加人物关系验证、后处理检查 |

### Prompt 优化示例

**优化前**：
```
请根据以下片段回答问题：
{context}

问题：{question}
```

**优化后**：
```
你是一个专业的小说分析助手。请基于提供的片段严谨回答问题。

【分析步骤】
1. 仔细阅读每个片段，提取关键信息
2. 识别片段中提到的所有人物和事件
3. 分析信息之间的关联和逻辑
4. 基于片段内容给出准确答案

【回答要求】
- 严格基于提供的片段内容回答
- 如果片段中有明确信息，请直接引用
- 如果需要推理，请展示推理过程
- 如果片段中没有相关信息，请如实说明

请根据以下《天龙八部》小说片段回答问题：
{context}

用户问题: {question}

请逐步分析后给出回答：
```

---

## 参考资源

### 评估框架

1. **RAGAS**: https://docs.ragas.io/
   - 最成熟的 RAG 评估框架
   - 提供 14+ 种评估指标

2. **TruLens**: https://www.trulens.org/
   - RAG Triad 评估框架
   - 提供实验跟踪和可视化

3. **DeepEval**: https://github.com/confident-ai/deepeval
   - 开源评估框架
   - 支持 CI/CD 集成

### 学术论文

1. **RAGAS Paper**: "RAGAS: Automated Evaluation of Retrieval Augmented Generation"
2. **MHTS Framework**: "Multi-Hop Tree Structure Framework for Complex QA"
3. **LLM-as-Judge**: "Benchmarking LLM-as-a-Judge" (Snowflake Engineering)

### 数据集

1. **HotpotQA**: https://hotpotqa.github.io/
2. **NOVELHOPQA**: https://novelhopqa.github.io/
3. **Musique**: 多跳问答数据集

### 最佳实践

1. **Metric-Driven Development**: 指标驱动的开发流程
2. **持续评估**: 建立生产环境监控
3. **人工校准**: 定期与人工判断对齐

---

## 总结

RAG 系统评估是一个系统工程，需要：

1. **分阶段评估**：分别评估检索和生成质量
2. **多维度指标**：结合定量指标和定性分析
3. **场景定制**：针对小说场景设计特殊指标
4. **持续迭代**：建立评估-优化-再评估的闭环

通过系统化的评估，可以有效识别 RAG 系统的薄弱环节，指导持续优化，最终构建高质量的 RAG 应用。

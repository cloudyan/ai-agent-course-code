# RAG 评估工具完整指南

## 目录

1. [概述](#概述)
2. [主流第三方工具](#主流第三方工具)
3. [LangChain 生态工具](#langchain-生态工具)
4. [工具对比与选型](#工具对比与选型)
5. [实现机制深度解析](#实现机制深度解析)
6. [成本优化策略](#成本优化策略)
7. [推荐组合方案](#推荐组合方案)

---

## 概述

### 为什么需要专门的 RAG 评估工具

RAG 系统的评估面临独特挑战：

1. **两阶段耦合**：检索质量直接影响生成质量
2. **开放式答案**：难以用传统 NLP 指标（BLEU/ROUGE）评估
3. **幻觉检测**：需要判断答案是否包含原文未提及的信息
4. **多跳推理**：复杂问题需要跨多个片段推理

### 评估工具的核心价值

```
┌─────────────────────────────────────────────────────────────┐
│                   评估工具核心价值                           │
├─────────────────────────────────────────────────────────────┤
│  ✅ 自动化：无需人工标注，快速迭代                           │
│  ✅ 多维度：覆盖检索、生成、端到端全流程                     │
│  ✅ 可解释：提供评分理由，便于问题定位                       │
│  ✅ 可集成：支持 CI/CD、生产监控                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 主流第三方工具

### 1. RAGAS ⭐ 最推荐

**定位**：最成熟的开源 RAG 评估框架

**官网**：https://docs.ragas.io/

#### 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                     RAGAS 架构                               │
├─────────────────────────────────────────────────────────────┤
│  输入层: {question, answer, contexts, ground_truth?}        │
│                      ↓                                       │
│  指标层: Faithfulness | Answer Relevance | Context Precision│
│                      ↓                                       │
│  LLM-as-Judge: GPT-4 / Claude 作为评估器                    │
│                      ↓                                       │
│  输出层: 各指标分数 (0-1)                                    │
└─────────────────────────────────────────────────────────────┘
```

#### 核心指标实现机制

**1. Faithfulness（忠实度）**

```python
# 实现逻辑
async def calculate_faithfulness(answer, contexts):
    # Step 1: 声明提取
    claims = await llm.extract_claims(answer)
    # 输出: ["段誉有5个妹妹", "段誉的父亲是段正淳", ...]
    
    # Step 2: 逐一验证
    supported_count = 0
    for claim in claims:
        verdict = await llm.verify(claim, contexts)
        # verdict: "支持" | "不支持" | "矛盾"
        if verdict == "支持":
            supported_count += 1
    
    # Step 3: 计算比例
    return supported_count / len(claims)
```

**Prompt 设计**：
```python
FAITHFULNESS_PROMPT = """
验证以下声明是否被上下文支持。

上下文：
{context}

声明：{claim}

请判断：
1. 这个声明是否被上下文直接支持？
2. 这个声明是否与上下文矛盾？
3. 这个声明是否包含上下文外的信息（幻觉）？

只回答 "支持"、"矛盾" 或 "无法验证"。
"""
```

**2. Answer Relevance（答案相关性）**

```python
# 反向问题生成法
async def calculate_answer_relevance(question, answer):
    # Step 1: 基于答案生成可能的问题
    generated_questions = await llm.generate_questions(answer, n=3)
    # 输出: ["段誉有几个兄弟姐妹？", "段誉的家庭成员有哪些？", ...]
    
    # Step 2: 计算语义相似度
    similarities = []
    for gen_q in generated_questions:
        sim = cosine_similarity(
            embed(gen_q),
            embed(question)
        )
        similarities.append(sim)
    
    # Step 3: 取平均值
    return mean(similarities)
```

**3. Context Precision（上下文精确率）**

```python
async def calculate_context_precision(question, contexts):
    relevant_count = 0
    precisions = []
    
    for i, context in enumerate(contexts, 1):
        # 判断相关性
        is_relevant = await llm.judge_relevance(question, context)
        if is_relevant:
            relevant_count += 1
        
        # 计算 Precision@K
        precision_at_k = relevant_count / i
        precisions.append(precision_at_k)
    
    # 平均精确率
    return mean(precisions)
```

#### 代码示例

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    context_entity_recall,
    answer_correctness
)
from datasets import Dataset

# 准备数据
dataset = Dataset.from_dict({
    "question": ["段誉有几个妹妹？", "鸠摩智会什么武功？"],
    "answer": ["段誉有5个妹妹...", "鸠摩智会火焰刀..."],
    "contexts": [["片段1", "片段2"], ["片段3"]],
    "ground_truth": ["钟灵、木婉清、阿朱、阿紫、王语嫣", "火焰刀、小无相功"]
})

# 运行评估
results = evaluate(
    dataset=dataset,
    metrics=[
        faithfulness,           # 忠实度
        answer_relevancy,       # 答案相关性
        context_precision,      # 上下文精确率
        context_recall,         # 上下文召回率（需要 ground_truth）
        answer_correctness      # 答案正确性
    ],
    llm=evaluator_llm,          # 评估用 LLM（建议 GPT-4）
    embeddings=embedding_model  # 用于语义相似度
)

print(results)
# {'faithfulness': 0.91, 'answer_relevancy': 0.87, 
#  'context_precision': 0.83, 'context_recall': 0.79}
```

#### 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 14+ 种评估指标 | ❌ 评估成本高（多次 LLM 调用） |
| ✅ 无需人工标注（除 Context Recall） | ❌ 评估模型本身可能有偏见 |
| ✅ 支持合成数据生成 | ❌ 对中文支持一般 |
| ✅ 与 LangChain/LlamaIndex 集成 | ❌ 异步执行调试较复杂 |

#### 适用场景

- 研究原型验证
- 快速迭代测试
- 离线批量评估

---

### 2. TruLens

**定位**：系统化的 LLM 应用评估和跟踪框架

**官网**：https://www.trulens.org/

#### 核心机制 - RAG Triad

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

#### 反馈函数（Feedback Functions）设计

```python
from trulens.core import Tru
from trulens.apps.basic import TruBasicApp
from trulens.feedback import Feedback
from trulens.providers.openai import OpenAI

# 初始化
provider = OpenAI()

# 定义反馈函数
f_groundedness = Feedback(
    provider.groundedness_measure_with_cot_reasons,
    name="Groundedness"
).on(Select.Record.app.combine_documents_chain._call.args.inputs.input_documents)
  .on_output()

f_qa_relevance = Feedback(
    provider.relevance_with_cot_reasons,
    name="Answer Relevance"
).on_input_output()

f_context_relevance = Feedback(
    provider.qs_relevance_with_cot_reasons,
    name="Context Relevance"
).on_input()
  .on(Select.Record.app.combine_documents_chain._call.args.inputs.input_documents)
```

#### CoT 推理（Chain-of-Thought）实现

```python
# 让评估模型展示推理过程
COT_PROMPT = """
评估以下回答的忠实度。

上下文: {context}
回答: {answer}

请逐步分析：
1. 回答中包含哪些事实声明？
2. 每个声明是否被上下文支持？
3. 给出最终评分（0-1）和理由。

以 JSON 格式返回：
{
    "reasoning": "...",
    "score": 0.85
}
"""
```

#### 代码示例

```python
from trulens.apps.langchain import TruChain

# 包装 RAG 应用
tru_app = TruChain(
    app=rag_chain,
    app_id="tianlong-rag",
    feedbacks=[f_groundedness, f_qa_relevance, f_context_relevance]
)

# 运行并评估
with tru_app as recording:
    for query in test_queries:
        result = tru_app.app(query)

# 查看结果仪表板
tru.get_leaderboard()

# 启动 Streamlit 界面
!trulens-dashboard
```

#### 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 可视化仪表板（Streamlit） | ❌ 学习曲线较陡 |
| ✅ 生产环境监控 | ❌ 社区活跃度不如 RAGAS |
| ✅ 支持自定义反馈函数 | ❌ 文档相对分散 |
| ✅ 详细的推理过程 | |

#### 适用场景

- 调试复杂 RAG 应用
- 生产环境实时监控
- 需要详细可解释性

---

### 3. DeepEval ⭐ CI/CD 推荐

**定位**：面向开发者的开源评估框架，强调 CI/CD 集成

**官网**：https://github.com/confident-ai/deepeval

#### 核心设计 - 测试驱动开发

```python
import pytest
from deepeval import assert_test
from deepeval.metrics import FaithfulnessMetric, AnswerRelevancyMetric
from deepeval.test_case import LLMTestCase

# 定义测试
def test_rag_faithfulness():
    metric = FaithfulnessMetric(threshold=0.7)
    
    test_case = LLMTestCase(
        input="段誉有几个妹妹？",
        actual_output="段誉有5个妹妹...",
        retrieval_context=["片段1", "片段2"]
    )
    
    assert_test(test_case, [metric])
```

#### CI/CD 集成

```yaml
# .github/workflows/rag-eval.yml
name: RAG Evaluation

on: [push, pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install dependencies
        run: pip install deepeval
      
      - name: Run evaluation
        run: pytest tests/test_rag.py --verbose
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

#### 缓存机制实现

```python
from functools import lru_cache
import hashlib

class CachedEvaluator:
    def __init__(self):
        self.cache = {}
    
    def _get_cache_key(self, query, answer):
        """生成缓存键"""
        content = f"{query}:{answer}"
        return hashlib.md5(content.encode()).hexdigest()
    
    async def evaluate(self, query, answer, contexts):
        cache_key = self._get_cache_key(query, answer)
        
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        result = await self._do_evaluate(query, answer, contexts)
        self.cache[cache_key] = result
        return result
```

#### 代码示例

```python
from deepeval import evaluate
from deepeval.metrics import (
    FaithfulnessMetric,
    AnswerRelevancyMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric
)

# 定义测试用例
test_cases = [
    LLMTestCase(
        input="段誉有几个妹妹？",
        actual_output="段誉有5个妹妹...",
        expected_output="钟灵、木婉清、阿朱、阿紫、王语嫣",
        retrieval_context=["片段1", "片段2"]
    ),
    # ... 更多测试用例
]

# 批量评估
evaluate(
    test_cases=test_cases,
    metrics=[
        FaithfulnessMetric(threshold=0.7),
        AnswerRelevancyMetric(threshold=0.7),
        ContextualPrecisionMetric(threshold=0.7),
        ContextualRecallMetric(threshold=0.7)
    ],
    print_results=True,
    save_results=True
)
```

#### 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 与 pytest 无缝集成 | ❌ 指标不如 RAGAS 丰富 |
| ✅ 适合 CI/CD 流水线 | ❌ 文档相对简单 |
| ✅ 支持缓存降低成本 | ❌ 可视化能力较弱 |
| ✅ 详细的测试报告 | |

#### 适用场景

- 生产 CI/CD 集成
- 自动化测试流水线
- 回归测试

---

### 4. LangSmith ⭐ LangChain 生态首选

**定位**：LangChain 官方的全生命周期管理平台

**官网**：https://smith.langchain.com/

#### 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    LangSmith 架构                            │
├─────────────────────────────────────────────────────────────┤
│  Tracing（追踪）                                             │
│  ├── 记录每次 LLM 调用                                        │
│  ├── 构建调用链图谱                                           │
│  └── 可视化执行流程                                           │
│                      ↓                                       │
│  Evaluation（评估）                                          │
│  ├── 内置评估器（Criteria, Embedding Distance, etc.）        │
│  ├── 与 RAGAS 集成                                           │
│  └── 自定义评估器                                             │
│                      ↓                                       │
│  Monitoring（监控）                                          │
│  ├── 生产环境性能监控                                         │
│  ├── 错误追踪                                                 │
│  └── A/B 测试                                                 │
└─────────────────────────────────────────────────────────────┘
```

#### 自动追踪机制

```python
from langchain.callbacks.tracers import LangChainTracer

# 创建追踪器
tracer = LangChainTracer(
    project_name="tianlong-rag",
    client=langsmith_client
)

# 自动记录所有调用
result = chain.invoke(
    query,
    config={"callbacks": [tracer]}
)

# 追踪内容包括：
# - 每次 LLM 调用的输入输出
# - Token 使用量
# - 延迟
# - 调用链关系
```

#### 内置评估器

```python
from langchain.evaluation import load_evaluator

# 1. Criteria Evaluator（LLM-as-Judge）
criteria_evaluator = load_evaluator(
    "criteria",
    criteria={
        "accuracy": "回答是否准确？",
        "completeness": "回答是否完整？",
        "relevance": "回答是否与问题相关？"
    },
    llm=judge_llm
)

result = criteria_evaluator.evaluate_strings(
    prediction=prediction,
    reference=reference,
    input=query
)
# 返回: {
#     "reasoning": "回答准确提到了段誉的5个妹妹...",
#     "value": "Y",
#     "score": 1
# }

# 2. Embedding Distance
embedding_evaluator = load_evaluator("embedding_distance")
result = embedding_evaluator.evaluate_strings(
    prediction=prediction,
    reference=reference
)
# 返回: {"score": 0.85}

# 3. String Distance
string_evaluator = load_evaluator("string_distance")
```

#### RAGAS 集成

```python
from langsmith.evaluation import EvaluationResult, run_evaluator
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy

@run_evaluator
def ragas_faithfulness_evaluator(run, example):
    """自定义 RAGAS 评估器"""
    # 获取运行结果
    prediction = run.outputs["output"]
    contexts = run.outputs["contexts"]
    
    # 使用 RAGAS 评估
    results = evaluate(
        dataset=[{
            "question": example.inputs["query"],
            "answer": prediction,
            "contexts": contexts
        }],
        metrics=[faithfulness]
    )
    
    return EvaluationResult(
        key="faithfulness",
        score=results["faithfulness"],
        comment="RAGAS faithfulness score"
    )

# 运行评估
client.run_on_dataset(
    dataset_name="tianlong-test",
    llm_or_chain_factory=rag_chain,
    evaluation=[ragas_faithfulness_evaluator]
)
```

#### 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 与 LangChain 深度集成 | ❌ 闭源服务（部分功能收费） |
| ✅ 可视化追踪和调试 | ❌ 依赖 LangChain 生态 |
| ✅ 生产监控能力 | ❌ 成本较高 |
| ✅ 支持 A/B 测试 | |

#### 适用场景

- LangChain 项目
- 需要全链路追踪
- 生产环境监控

---

### 5. Arize AI / Phoenix

**定位**：企业级 ML 可观测性平台

**官网**：https://arize.com/

#### 核心功能

```python
from phoenix.trace.langchain import LangChainInstrumentor
import phoenix as px

# 自动注入追踪
LangChainInstrumentor().instrument()

# 启动可视化界面
px.launch_app()
```

#### Embedding 可视化

```python
# UMAP 降维展示
from phoenix.datasets import Dataset

# 可视化检索结果分布
dataset = Dataset(
    dataframe=df,
    schema=Schema(
        prediction_id_column_name="id",
        prompt_column_names=EmbeddingColumnNames(
            vector_column_name="embedding",
            raw_data_column_name="text"
        )
    )
)

px.launch_app(primary=dataset)
```

#### 漂移检测

```python
# 检测数据漂移
drift_score = detect_embedding_drift(
    baseline=baseline_embeddings,
    current=current_embeddings
)

if drift_score > 0.5:
    alert("检测到数据漂移，请检查检索质量")
```

#### 优缺点

| 优点 | 缺点 |
|------|------|
| ✅ 强大的可视化 | ❌ 企业版收费 |
| ✅ 生产级监控 | ❌ 学习成本高 |
| ✅ 漂移检测 | ❌ 对小型项目过重 |

#### 适用场景

- 企业级应用
- 大规模生产监控
- 需要高级可观测性

---

## LangChain 生态工具

### 1. LangChain Evaluators

#### 评估器类型

| 评估器 | 用途 | 实现机制 |
|--------|------|----------|
| **StringEvaluator** | 字符串对比 | 精确匹配、包含检查 |
| **CriteriaEvaluator** | 标准评估 | LLM-as-Judge |
| **EmbeddingDistance** | 语义相似度 | 余弦相似度 |
| **ComparisonEvaluator** | 对比评估 | A/B 测试 |
| **QAEvalChain** | QA 评估 | 问答正确性 |

#### 标准化接口设计

```python
from abc import ABC, abstractmethod
from typing import Any, Optional

class StringEvaluator(ABC):
    """字符串评估器基类"""
    
    @abstractmethod
    def evaluate_strings(
        self,
        *,
        prediction: str,
        reference: Optional[str] = None,
        input: Optional[str] = None,
        **kwargs: Any
    ) -> dict:
        """
        评估预测字符串与参考字符串。
        
        Returns:
            {
                "score": float,  # 0-1
                "value": str,    # "Y" | "N"
                "reasoning": str # 评分理由
            }
        """
        raise NotImplementedError
```

#### 代码示例

```python
from langchain.evaluation import load_evaluator
from langchain_openai import ChatOpenAI

# 初始化评估模型
judge_llm = ChatOpenAI(model="gpt-4", temperature=0)

# 1. Criteria Evaluator
criteria_evaluator = load_evaluator(
    "criteria",
    criteria="correctness",
    llm=judge_llm
)

result = criteria_evaluator.evaluate_strings(
    prediction="段誉有5个妹妹",
    reference="段誉有5个妹妹：钟灵、木婉清、阿朱、阿紫、王语嫣",
    input="段誉有几个妹妹？"
)

# 2. Embedding Distance
embedding_evaluator = load_evaluator(
    "embedding_distance",
    embeddings=OpenAIEmbeddings()
)

result = embedding_evaluator.evaluate_strings(
    prediction="段誉有5个妹妹",
    reference="段誉有五个妹妹"
)

# 3. 组合多个评估器
from langchain.evaluation import EvaluatorChain

combined = EvaluatorChain(evaluators=[
    criteria_evaluator,
    embedding_evaluator
])
```

---

### 2. 自定义 LangChain 评估器

```python
from langchain.evaluation import StringEvaluator
from langchain_core.callbacks import Callbacks
from typing import Any, Optional

class FaithfulnessEvaluator(StringEvaluator):
    """
    自定义忠实度评估器
    评估回答是否忠实于检索上下文
    """
    
    def __init__(self, llm):
        self.llm = llm
        self.name = "faithfulness"
    
    def evaluate_strings(
        self,
        *,
        prediction: str,
        reference: str,  # 这里传入 contexts
        input: Optional[str] = None,
        callbacks: Callbacks = None,
        **kwargs: Any
    ) -> dict:
        """
        评估忠实度
        
        Args:
            prediction: 模型生成的回答
            reference: 检索到的上下文（多个片段拼接）
            input: 原始问题
        """
        # 1. 提取声明
        claims_prompt = f"""
        将以下回答分解为独立的事实声明（每行一个）：
        {prediction}
        
        声明列表：
        """
        claims_response = self.llm.invoke(claims_prompt)
        claims = [
            c.strip() 
            for c in claims_response.content.strip().split('\n')
            if c.strip()
        ]
        
        # 2. 验证每个声明
        supported = 0
        claim_results = []
        
        for claim in claims:
            verify_prompt = f"""
            上下文：{reference}
            声明：{claim}
            
            这个声明是否被上下文支持？只回答 是/否。
            """
            verdict = self.llm.invoke(verify_prompt)
            is_supported = "是" in verdict.content
            
            if is_supported:
                supported += 1
            
            claim_results.append({
                "claim": claim,
                "supported": is_supported
            })
        
        # 3. 计算分数
        score = supported / len(claims) if claims else 0
        
        return {
            "score": score,
            "value": "Y" if score > 0.7 else "N",
            "reasoning": f"{supported}/{len(claims)} 个声明被支持",
            "claim_details": claim_results
        }

# 使用
from langchain_openai import ChatOpenAI

evaluator = FaithfulnessEvaluator(llm=ChatOpenAI())
result = evaluator.evaluate_strings(
    prediction="段誉有5个妹妹",
    reference="段正淳有五个女儿：钟灵、木婉清、阿朱、阿紫、王语嫣",
    input="段誉有几个妹妹？"
)
```

---

## 工具对比与选型

### 功能对比表

| 工具 | 指标丰富度 | 易用性 | CI/CD | 可视化 | 成本 | 推荐场景 |
|------|-----------|--------|-------|--------|------|----------|
| **RAGAS** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 💰💰 | 研究、原型 |
| **TruLens** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | 💰💰 | 调试、监控 |
| **DeepEval** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | 💰 | 生产 CI/CD |
| **LangSmith** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | 💰💰💰 | LangChain 项目 |
| **Arize** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 💰💰💰 | 企业监控 |

### 选型决策树

```
开始选型
    ↓
使用 LangChain？
    ├── 是 → LangSmith
    ↓ 否
需要 CI/CD 集成？
    ├── 是 → DeepEval
    ↓ 否
需要生产监控？
    ├── 是 → TruLens / Arize
    ↓ 否
需要丰富指标？
    ├── 是 → RAGAS
    ↓ 否
快速上手 → DeepEval
```

---

## 实现机制深度解析

### LLM-as-Judge 核心模式

```python
class LLMAsJudge:
    """
    LLM-as-Judge 评估器基类
    """
    
    def __init__(self, judge_llm, prompt_template):
        self.llm = judge_llm
        self.prompt_template = prompt_template
    
    def evaluate(self, prediction, reference, criteria):
        """
        执行评估
        
        Args:
            prediction: 待评估的输出
            reference: 参考内容（上下文或标准答案）
            criteria: 评估标准
        
        Returns:
            {"score": float, "reasoning": str}
        """
        # 1. 构建评估 Prompt
        prompt = self.prompt_template.format(
            prediction=prediction,
            reference=reference,
            criteria=criteria
        )
        
        # 2. 调用评估模型
        response = self.llm.invoke(prompt)
        
        # 3. 解析结果
        result = self.parse_response(response.content)
        
        return result
    
    def parse_response(self, response_text):
        """解析模型输出"""
        # 尝试 JSON 解析
        try:
            return json.loads(response_text)
        except:
            # 正则提取分数
            score_match = re.search(r'(\d+\.?\d*)', response_text)
            score = float(score_match.group(1)) if score_match else 0
            
            return {
                "score": score / 10 if score > 1 else score,
                "reasoning": response_text
            }
```

### 偏见缓解策略

```python
class DebiasEvaluator:
    """
    偏见缓解评估器
    """
    
    def __init__(self, judge_llm):
        self.llm = judge_llm
    
    def evaluate_with_position_bias_mitigation(
        self,
        prediction,
        reference,
        num_permutations=3
    ):
        """
        通过多次打乱顺序缓解位置偏见
        """
        scores = []
        
        for _ in range(num_permutations):
            # 随机打乱参考内容顺序
            shuffled_ref = self.shuffle_reference(reference)
            
            score = self.evaluate(prediction, shuffled_ref)
            scores.append(score)
        
        # 取平均或中位数
        return {
            "score": statistics.median(scores),
            "scores": scores,
            "std": statistics.stdev(scores)
        }
    
    def evaluate_with_length_bias_mitigation(
        self,
        prediction,
        reference
    ):
        """
        缓解长度偏见
        """
        # 标准化长度
        normalized_pred = self.normalize_length(prediction)
        normalized_ref = self.normalize_length(reference)
        
        return self.evaluate(normalized_pred, normalized_ref)
```

---

## 成本优化策略

### 1. 缓存机制

```python
from functools import lru_cache
import hashlib

class CachedRAGAS:
    """带缓存的 RAGAS 评估器"""
    
    def __init__(self, max_cache_size=1000):
        self.cache = {}
        self.max_size = max_cache_size
    
    def _get_cache_key(self, question, answer, contexts):
        """生成缓存键"""
        content = f"{question}:{answer}:{str(contexts)}"
        return hashlib.md5(content.encode()).hexdigest()
    
    async def evaluate(self, question, answer, contexts):
        cache_key = self._get_cache_key(question, answer, contexts)
        
        if cache_key in self.cache:
            print("Cache hit!")
            return self.cache[cache_key]
        
        result = await self._do_evaluate(question, answer, contexts)
        
        # LRU 淘汰
        if len(self.cache) >= self.max_size:
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
        
        self.cache[cache_key] = result
        return result
```

### 2. 分层评估

```python
async def hierarchical_evaluate(query, answer, contexts):
    """
    分层评估策略
    第一层：低成本快速筛选
    第二层：LLM 精细评估
    """
    # 第一层：Embedding 相似度（低成本）
    embedding_sim = await embedding_similarity(answer, contexts)
    
    if embedding_sim < 0.3:
        # 语义差异大，直接判定低分
        return {
            "score": embedding_sim,
            "reason": "语义差异大，跳过 LLM 评估",
            "skipped": True
        }
    
    # 第二层：LLM 精细评估
    llm_result = await llm_evaluate(query, answer, contexts)
    
    return {
        "score": llm_result["score"],
        "embedding_sim": embedding_sim,
        "llm_reasoning": llm_result["reasoning"]
    }
```

### 3. 采样评估

```python
import random

class SamplingEvaluator:
    """
    采样评估器
    生产环境只评估部分请求
    """
    
    def __init__(self, sample_rate=0.1):
        self.sample_rate = sample_rate
    
    async def evaluate_if_sampled(self, query, answer, contexts):
        """
        按采样率决定是否评估
        """
        if random.random() > self.sample_rate:
            return None  # 跳过评估
        
        return await self.evaluate(query, answer, contexts)
    
    def should_evaluate_by_error_rate(self, recent_error_rate):
        """
        根据错误率动态调整采样率
        """
        if recent_error_rate > 0.1:
            return 0.5  # 错误率高，提高采样率
        elif recent_error_rate < 0.01:
            return 0.05  # 错误率低，降低采样率
        return 0.1
```

### 4. 模型选择策略

```python
class TieredEvaluator:
    """
    分层模型选择
    根据任务复杂度选择不同模型
    """
    
    def __init__(self):
        self.gpt4 = ChatOpenAI(model="gpt-4")
        self.gpt35 = ChatOpenAI(model="gpt-3.5-turbo")
        self.local_model = LocalLLM()  # 本地小模型
    
    async def evaluate(self, query, answer, contexts, complexity="auto"):
        """
        根据复杂度选择模型
        """
        if complexity == "auto":
            complexity = self.estimate_complexity(query, answer)
        
        if complexity == "low":
            # 简单任务用本地模型
            return await self.local_model.evaluate(query, answer, contexts)
        elif complexity == "medium":
            # 中等任务用 GPT-3.5
            return await self.gpt35.evaluate(query, answer, contexts)
        else:
            # 复杂任务用 GPT-4
            return await self.gpt4.evaluate(query, answer, contexts)
    
    def estimate_complexity(self, query, answer):
        """估计任务复杂度"""
        # 基于问题长度、答案长度、关键词等
        if len(query) < 20 and len(answer) < 100:
            return "low"
        elif "为什么" in query or "分析" in query:
            return "high"
        return "medium"
```

---

## 推荐组合方案

### 开发阶段

```python
# 工具：RAGAS + Jupyter Notebook

from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy

# 快速迭代测试
results = evaluate(
    test_cases,
    metrics=[faithfulness, answer_relevancy],
    llm=ChatOpenAI(model="gpt-4")  # 开发阶段用强模型
)

# 可视化结果
import pandas as pd
df = pd.DataFrame(results)
df.plot(kind="bar")
```

### CI/CD 阶段

```python
# 工具：DeepEval + pytest

import pytest
from deepeval import assert_test
from deepeval.metrics import FaithfulnessMetric

def test_rag_quality():
    metric = FaithfulnessMetric(threshold=0.7)
    test_case = LLMTestCase(
        input="段誉有几个妹妹？",
        actual_output="段誉有5个妹妹...",
        retrieval_context=["片段1", "片段2"]
    )
    assert_test(test_case, [metric])
```

### 生产监控

```python
# 工具：LangSmith + 采样

from langsmith import Client
from langchain.callbacks.tracers import LangChainTracer

# 1. 自动追踪
tracer = LangChainTracer(project_name="tianlong-rag")

# 2. 采样评估（10% 采样率）
sampling_evaluator = SamplingEvaluator(sample_rate=0.1)

# 3. 实时监控
async def monitor_production(query, answer, contexts):
    result = await sampling_evaluator.evaluate_if_sampled(
        query, answer, contexts
    )
    
    if result and result["score"] < 0.6:
        # 低质量告警
        send_alert(f"Low quality response detected: {result}")
    
    return result
```

### 完整流水线

```
开发阶段 → CI/CD 阶段 → 生产阶段
    ↓           ↓           ↓
 RAGAS      DeepEval    LangSmith
(详细评估)   (回归测试)   (监控告警)
    ↓           ↓           ↓
 优化迭代    阻止劣化    实时发现
```

---

## 总结

### 工具选择建议

| 场景 | 推荐工具 | 理由 |
|------|----------|------|
| 快速原型 | RAGAS | 指标丰富，无需标注 |
| LangChain 项目 | LangSmith | 深度集成，全链路追踪 |
| CI/CD 集成 | DeepEval | pytest 集成，测试驱动 |
| 生产监控 | TruLens | 可视化强，实时监控 |
| 企业级应用 | Arize | 可观测性完整 |

### 核心设计原则

1. **分阶段评估**：检索和生成分别评估
2. **LLM-as-Judge**：利用强模型评估弱模型
3. **成本意识**：缓存、采样、分层评估
4. **可解释性**：提供评分理由，便于调试
5. **持续优化**：建立评估-优化闭环

这套评估体系可以帮助你系统性地提升 RAG 应用质量。

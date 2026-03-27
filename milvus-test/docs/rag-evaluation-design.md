# RAG 评估系统设计说明

## 1. 目标

本评估系统的设计目标是：

1. 不因单次模型超时导致整轮评估卡死。
2. 不因单个指标失败导致整题直接无效。
3. 在稳定性、成本、准确性之间提供可切换模式。
4. 输出“分数 + 置信度 + 降级信息”，避免误读结果。

## 2. 架构分层

### 2.1 RAG 执行层

- 输入：问题 + 检索参数。
- 输出：`{ answer, contexts }`。
- 策略：
  - 检索与生成均有超时。
  - 生成超时时返回降级答案，不抛出致命异常。
  - 上下文按字符预算截断，防止 prompt 失控。

### 2.2 指标评估层

- 指标拆分为独立单元，每个指标独立超时、独立降级。
- 单个指标失败只影响该指标分，不影响其他指标执行。
- 通过 `safeMetric()` 对异常统一包装，返回 fallback + error。

### 2.3 汇总与报告层

- 综合分采用“可用指标加权平均”。
- 同时计算 `confidence`（可用权重占比）。
- 输出降级信息：
  - `hardFailureRate`：RAG 执行失败且无上下文。
  - `degradedRate`：任一环节触发降级（超时/解析失败）。

## 3. 评估模式

通过环境变量 `RAG_EVAL_MODE` 控制：

- `balanced`（默认）：LLM 判定 + embedding 语义相似度，准确性优先。
- `fast`：尽量使用启发式规则，减少 LLM 评判请求，稳定性优先。

## 4. 超时与降级策略

- 关键超时参数：
  - `RAG_MODEL_TIMEOUT_MS`
  - `RAG_JUDGE_TIMEOUT_MS`
  - `RAG_EMBEDDING_TIMEOUT_MS`
- 超时处理：
  - RAG 生成超时：返回降级答案，继续评估。
  - 指标超时：该指标打 fallback 分并记录 `error`。
- 心跳日志：
  - 长请求期间每 10 秒输出一次“仍在执行中”。

## 5. 评分模型

当前权重：

- `contextPrecision`: 0.15
- `contextRecall`: 0.15
- `faithfulness`: 0.25
- `answerRelevancy`: 0.20
- `answerCorrectness`: 0.15
- `characterConsistency`: 0.10

综合分计算：

1. 遍历所有指标。
2. 仅对“有效数值”指标参与加权。
3. `overallScore = weightedSum / availableWeight`。
4. `confidence = availableWeight`，范围 [0,1]。

## 6. 结果解释建议

- 高分 + 高置信度：结论可信度高。
- 高分 + 低置信度：样本结论可疑，建议提高超时或重跑。
- 低分 + 高置信度：系统能力瓶颈明显，需要优化检索/生成。
- 低分 + 低置信度：优先先解决稳定性，再看模型质量。

## 7. 推荐运行配置

### 7.1 快速稳定验证

```bash
RAG_EVAL_MODE=fast \
RAG_MODEL_TIMEOUT_MS=15000 \
RAG_JUDGE_TIMEOUT_MS=15000 \
RAG_EMBEDDING_TIMEOUT_MS=10000 \
node src/run-evaluation.mjs
```

### 7.2 高精度离线评估

```bash
RAG_EVAL_MODE=balanced \
RAG_MODEL_TIMEOUT_MS=120000 \
RAG_JUDGE_TIMEOUT_MS=60000 \
RAG_EMBEDDING_TIMEOUT_MS=20000 \
node src/run-evaluation.mjs
```

### 7.3 单题调试

```bash
RAG_TEST_LIMIT=1 node src/run-evaluation.mjs
```

## 8. 后续优化建议

1. 增加每题阶段耗时明细（retrieval/generation/metric-level latency）。
2. 将结构化评估结果同时落盘为 JSONL，便于二次分析。
3. 在 `balanced` 模式中按预算动态降级到 `fast` 子策略，降低超时率。

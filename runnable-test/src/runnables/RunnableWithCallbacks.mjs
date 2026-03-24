import "dotenv/config";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

// 文本处理链：清洗 → 分词 → 统计
function clean(text) {
  return text.trim().replace(/\s+/g, " ");
}

function tokenize(text) {
  return text.split(" ");
}

function count(tokens) {
  return { tokens, wordCount: tokens.length };
}

const chain = RunnableSequence.from([
  clean,
  tokenize,
  count,
]);

// 用 callbacks 观测每一步的输出
const callback = {
  handleChainStart(run) {
    const step = run?.name ?? run?.id?.[run.id.length - 1] ?? "unknown";
    console.log(`[START] ${step}`);
  },
  handleChainEnd(output, run) {
    const step = run?.name ?? run?.id?.[run.id.length - 1] ?? "unknown";
    console.log(`[END]   ${step}`);
    console.log(`[END]   output=${JSON.stringify(output)}\n`);
  },
  handleChainError(err) {
    console.log(`[ERROR] ${err.message}\n`);
  },
};

const result = await chain.invoke("  hello   world   from   langchain  ", {
  callbacks: [callback],
});

console.log("结果:", result);

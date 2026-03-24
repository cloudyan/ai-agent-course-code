import 'dotenv/config';
import { RunnablePassthrough, RunnableLambda, RunnableSequence, RunnableMap } from "@langchain/core/runnables";

// const chain = RunnableSequence.from([
//     RunnableLambda.from((input) => ({ concept: input })),
//     RunnableMap.from({
//         original: new RunnablePassthrough(),
//         processed: RunnableLambda.from((obj) => ({
//             concept: input,
//             upper: obj.concept.toUpperCase(),
//             length: obj.concept.length,
//         }))
//     })
// ]);

// 以上代码可以简化，只保留函数、对象即可
// LangChain 会把函数转为 RunnableLambda，把对象转为 RunnableMap
// 所以以下代码可以简化为：
const chain2 = RunnableSequence.from([
    (input) => ({ concept: input }),
    // 如果是想保留原始属性，只是扩展一些属性，用 RunnablePassthrough.assign
    RunnablePassthrough.assign({
        original: new RunnablePassthrough(),
        processed: (obj) => ({
            concept: input,
            upper: obj.concept.toUpperCase(),
            length: obj.concept.length,
        })
    })
]);

const input = "Hello World";
const result = await chain.invoke(input);
console.log(result);

const result2 = await chain2.invoke(input);
console.log(result2);

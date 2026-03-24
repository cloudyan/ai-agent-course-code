import 'dotenv/config';
import { RunnablePick, RunnableSequence } from "@langchain/core/runnables";

const inputData = {
  name: "神光",
  age: 30,
  city: "北京",
  country: "中国",
  email: "shenguang@example.com",
  phone: "+86-13800138000",
};

// RunnableSequence：至少保留两个 Runnable 步骤，否则会报错
const chain = RunnableSequence.from([
  (input) => ({
    ...input,
    fullInfo: `${input.name}，${input.age}岁，来自${input.city}`,
  }),
  new RunnablePick(["name", "fullInfo"]),
  (input) => ({
    ...input,
    name: input.name + ' ' + Date.now(),
  }),
]);

const result = await chain.invoke(inputData);
console.log(result);

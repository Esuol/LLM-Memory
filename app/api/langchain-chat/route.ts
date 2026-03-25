import { ChatOpenAI } from "@langchain/openai";

// 简单的内存存储：sessionId -> messages[]
const memoryStore = new Map<string, Array<{ role: string; content: string }>>();

export async function POST(req: Request) {
  const { message, sessionId = "default" } = await req.json();

  // 获取或创建 session 的历史消息
  if (!memoryStore.has(sessionId)) {
    memoryStore.set(sessionId, []);
  }
  const history = memoryStore.get(sessionId)!;

  // 添加用户消息
  history.push({ role: "user", content: message });
  console.log('memoryStore', memoryStore,'history',history);

  // 调用 LangChain
  const chat = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
  });

  const response = await chat.invoke(history);

  // 保存 AI 回复
  history.push({ role: "assistant", content: response.content as string });

  return Response.json({ message: response.content });
}

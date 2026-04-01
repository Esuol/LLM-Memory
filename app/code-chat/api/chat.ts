import { Pinecone } from "@pinecone-database/pinecone";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { withRetry } from "./utils";

// 说明：定义 ChatHistoryPair 类型
type ChatHistoryPair = { user: string; ai: string };

// 说明：定义 SourceItem 类型
type SourceItem = {
  file: string;
  language: string;
  content: string;
};

// 说明：定义 PineconeMetadata 类型
type PineconeMetadata = Record<string, string | number | boolean> & {
  file?: string;
  language?: string;
  content?: string;
};

/**
 * @description 从 Pinecone 中检索相关文档
 * @param opts { pinecone: Pinecone, indexName: string, namespace: string, embeddings: OpenAIEmbeddings, query: string, k: number } 检索选项  pinecone: Pinecone 实例, indexName: 索引名称, namespace: 命名空间, embeddings: 嵌入模型, query: 查询问题, k: 检索结果数量
 * @returns 检索结果
 */
async function retrieveFromPinecone(opts: {
  pinecone: Pinecone;
  indexName: string;
  namespace: string;
  embeddings: OpenAIEmbeddings;
  query: string;
  k: number;
}): Promise<Document[]> {
  // 说明：使用嵌入模型查询问题
  const vector = await withRetry(() => opts.embeddings.embedQuery(opts.query), 2, 500);
  // 获取 Pinecone 索引
  const index = opts.pinecone.Index(opts.indexName).namespace(opts.namespace);
  // 使用 Pinecone 查询问题
  const results = await index.query({
    vector,
    topK: opts.k,
    includeMetadata: true,
  });

  // 说明：将检索结果转换为 Document 对象
  const docs =
    results.matches?.map((m) => {
      // 说明：将检索结果转换为 PineconeMetadata 对象
      const md = (m.metadata || {}) as PineconeMetadata;
      // 说明：将检索结果转换为内容
      const content = typeof md.content === "string" ? md.content : "";
      // 说明：将检索结果转换为 Document 对象
      return new Document({
        pageContent: content,
        metadata: md,
      });
    }) ?? [];

  return docs.filter((d) => d.pageContent.trim().length > 0);
}

/**
 * @description 对检索到的文档做 rerank（LLM 选择最相关的片段顺序）。
 * @param llm LLM 实例
 * @param question 原始独立问题（standalone question）
 * @param docs 候选文档
 * @returns rerank 后的文档（最多 5 个）
 */
async function rerankDocuments(llm: ChatOpenAI, question: string, docs: Document[]): Promise<Document[]> {
  if (docs.length <= 5) return docs;

  const candidates = docs
    .slice(0, 10)
    .map((d, i) => `${i + 1}. ${d.pageContent.slice(0, 300).replace(/\s+/g, " ").trim()}`)
    .join("\n");

  const resp = await llm.invoke([
    {
      role: "system",
      content:
        "你是检索结果重排助手。给定问题和若干候选片段，请只输出最相关的 5 个片段编号，按相关性从高到低排序。只输出编号，用英文逗号分隔，例如：1,4,2,3,5。不要解释。",
    },
    {
      role: "user",
      content: `问题：${question}\n\n候选片段：\n${candidates}\n\n输出（仅编号，逗号分隔）：`,
    },
  ]);

  const text = typeof resp.content === "string" ? resp.content : "";
  const nums = text.match(/\d+/g)?.map((n) => Number.parseInt(n, 10)) ?? [];
  const unique: number[] = [];

  for (const n of nums) {
    if (!Number.isFinite(n)) continue;
    if (n < 1 || n > Math.min(10, docs.length)) continue;
    if (unique.includes(n)) continue;
    unique.push(n);
    if (unique.length >= 5) break;
  }

  if (unique.length === 0) {
    // 降级：返回原始前 5 个
    return docs.slice(0, 5);
  }

  const feedback = unique.map((n) => docs[n - 1]).filter(Boolean).slice(0, 5);

  return feedback;
}

/**
 * @description 去重来源文档
 * @param sourceDocs 来源文档
 * @returns 去重后的来源文档
 */
function dedupeSources(sourceDocs: Document[]): SourceItem[] {
  // 说明：创建一个 Set 对象
  const seen = new Set<string>();
  // 说明：创建一个 SourceItem 对象
  const sources: SourceItem[] = [];

  for (const doc of sourceDocs) {
    const md = (doc.metadata ?? {}) as PineconeMetadata;
    const file = typeof md.file === "string" ? md.file : "";
    const language = typeof md.language === "string" ? md.language : "text";
    if (!file) continue;
    if (seen.has(file)) continue;
    seen.add(file);

    // 说明：将检索结果转换为 SourceItem 对象
    sources.push({
      file,
      language,
      content: doc.pageContent.slice(0, 500),
    });
  }

  return sources;
}

/**
 * @description Query Condensation：把“历史对话 + 当前问题”改写成不依赖上下文的独立问题。
 * @param llm LLM 实例
 * @param question 当前问题
 * @param history 对话历史（user/ai 对）
 * @returns 独立问题（standalone question）
 */
export async function condenseQuestion(llm: ChatOpenAI, question: string, history: ChatHistoryPair[]): Promise<string> {
  const condensed = await llm.invoke([
    {
      role: "system",
      content:
        "你是一个问句改写助手。根据对话历史，把用户的当前问题改写成不依赖上下文的独立问题。只输出改写后的问题，不要解释。",
    },
    {
      role: "user",
      content: `对话历史：\n${history.map((h, i) => `${i + 1}. 用户：${h.user}\n   助手：${h.ai}`).join("\n")}\n\n当前问题：${question}\n\n独立问题：`,
    },
  ]);

  const condensedText = typeof condensed.content === "string" ? condensed.content : "";
  return condensedText.trim() || question;
}

/**
 * @description HyDE：生成“假设的代码答案”，用代码的 embedding 去检索（代码找代码）。
 * @param llm LLM 实例
 * @param question 独立问题（standalone question）
 * @returns 假设答案（优先为代码片段）
 */
async function generateHypotheticalAnswer(llm: ChatOpenAI, question: string): Promise<string> {
  const resp = await llm.invoke([
    {
      role: "system",
      content:
        "你是资深工程师。请直接输出一段“假设正确”的代码实现片段，用于回答用户的问题。只输出代码（可以包含少量行内注释），不要解释、不要前后缀、不要说'可能'、不要给多方案。",
    },
    {
      role: "user",
      content: `问题：${question}\n\n要求：只输出代码，优先 TypeScript/JavaScript（Node/Next.js 风格）。`,
    },
  ]);

  const text = typeof resp.content === "string" ? resp.content.trim() : "";
  return text || question;
}

/**
 * @description 基于指定仓库（namespace）的向量库进行带对话历史的 RAG 问答，并返回来源信息。
 * @param question 用户问题
 * @param namespace Pinecone namespace（建议用 owner-repo）
 * @param history 对话历史（user/ai 对）
 * @param opts 可选回调：onChunk(token) 用于流式输出；onSources(sources) 用于一次性返回来源
 * @returns { answer: string; sources: Array<{ file: string; language: string; content: string }> }
 */
export async function chatWithRepo(
  question: string,
  namespace: string,
  history: ChatHistoryPair[],
  opts?: {
    onChunk?: (token: string) => void;
    onSources?: (sources: SourceItem[]) => void;
  }
) {
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const indexName = process.env.PINECONE_CODE_CHAT_INDEX_NAME || "code-search";

  // 说明：创建嵌入模型实例
  const embeddings = new OpenAIEmbeddings({
    // 说明：使用 text-embedding-3-small 模型
    model: "text-embedding-3-small",
    // 说明：使用 OPENAI_API_KEY
    apiKey: process.env.OPENAI_API_KEY,
    // 说明：使用 OPENAI_BASE_URL
    configuration: process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : undefined,
  });

  // 说明：主回答 LLM（低温度，稳定、可控）
  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : undefined,
  });

  // 说明：HyDE 专用 LLM（稍高温度，让假设代码答案更多样）
  const hydeLlm = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.7,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : undefined,
  });

  // 1) Query condensation：history 为空时直接跳过（省一次 LLM 调用）
  const standaloneQuestion = history.length === 0 ? question : await condenseQuestion(llm, question, history);

  // 1.5) HyDE：先生成“假设代码答案”，再用它做检索
  const hydeQuery = await generateHypotheticalAnswer(hydeLlm, standaloneQuestion);
  console.log('hydeQuery', hydeQuery);

  // 2) RAG 检索
  // 说明：从 Pinecone 中检索相关文档
  const sourceDocuments = await retrieveFromPinecone({
    pinecone,
    indexName,
    namespace,
    embeddings,
    query: hydeQuery,
    k: 10,
  });

  // 2.5) Rerank：在生成回答前对候选片段重排
  const rerankedDocuments = await rerankDocuments(llm, standaloneQuestion, sourceDocuments);

  // 3) 用检索结果生成最终回答
  // 说明：将检索结果转换为内容
  const context = rerankedDocuments.map((d) => d.pageContent).join("\n\n---\n\n");

  const sources = dedupeSources(rerankedDocuments);
  opts?.onSources?.(sources);

  // 说明：使用 LLM 生成回答（支持流式回调）
  const answerStream = await llm.stream([
    {
      role: "system",
      content: "你是代码库问答助手。只基于给定上下文回答；如果上下文不足以回答，就明确说不知道，并说明缺少什么信息。",
    },
    {
      role: "user",
      content: `上下文：\n${context}\n\n问题：${standaloneQuestion}\n\n回答：`,
    },
  ]);

  let answer = "";
  for await (const chunk of answerStream) {
    // chunk.content 可能是 string 或复杂结构，这里只处理 string
    const content = (typeof chunk === "object" && chunk !== null && "content" in chunk)
      ? (chunk as { content?: unknown }).content
      : undefined;
    const token = typeof content === "string" ? content : "";
    if (!token) continue;
    answer += token;
    opts?.onChunk?.(token);
  }

  return { answer, sources };
}


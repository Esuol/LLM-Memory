import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";

// ==================== 知识库 ====================

const rawDocuments = [
  `Next.js 16 发布于 2024年12月，带来了重大性能提升。新版本引入了部分预渲染（Partial Prerendering）功能，允许在同一路由中混合静态和动态内容。此外，还优化了服务器组件的性能，减少了客户端 JavaScript 包的大小。开发体验也得到改善，包括更快的热重载和更好的错误提示。`,

  `React 19 引入了 Server Components，改变了组件渲染方式。这是 React 架构的重大变革，允许组件在服务器端渲染并流式传输到客户端。Server Components 不会增加客户端 bundle 大小，可以直接访问服务器资源如数据库。同时引入了新的 use() Hook 用于数据获取，以及改进的 Suspense 边界处理。`,

  `Tailwind CSS v4 使用 Rust 引擎，编译速度提升 10 倍。新版本完全重写了编译器，采用 Rust 语言实现，大幅提升了构建性能。支持原生 CSS 变量，移除了对 PostCSS 的依赖。新增了容器查询、动态视口单位等现代 CSS 特性。配置文件也简化了，提供了更好的 TypeScript 支持。`,
];

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const indexName = "rag-demo";

// ==================== 文档切分 ====================

interface Chunk {
  content: string;
  metadata: {
    source: number;  // 原文档索引
    chunkIndex: number;  // 块索引
  };
}

function chunkText(text: string, chunkSize = 100, overlap = 20): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

function createChunks(docs: string[]): Chunk[] {
  const allChunks: Chunk[] = [];

  docs.forEach((doc, docIndex) => {
    const textChunks = chunkText(doc);
    textChunks.forEach((chunk, chunkIndex) => {
      allChunks.push({
        content: chunk,
        metadata: { source: docIndex, chunkIndex },
      });
    });
  });

  return allChunks;
}

// ==================== Embedding API ====================

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(
    `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/embeddings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    }
  );

  const data = await response.json();
  return data.data[0].embedding;
}

// ==================== 向量数据库初始化 ====================

async function initVectorDB() {
  const index = pinecone.Index(indexName);

  const stats = await index.describeIndexStats();
  if (stats.totalRecordCount === 0) {
    console.log("初始化 Pinecone...");
    const chunks = createChunks(rawDocuments);
    if (chunks.length === 0) {
      console.warn("[RAG] createChunks 结果为空，跳过 upsert。");
      return index;
    }

    const vectors = await Promise.all(
      chunks.map(async (chunk, i) => ({
        id: `chunk_${i}`,
        values: await getEmbedding(chunk.content),
        metadata: { text: chunk.content, ...chunk.metadata },
      }))
    );

    // 避免空 upsert：Pinecone 要求至少 1 条 record
    const validVectors = vectors.filter(
      (v) => Array.isArray(v.values) && v.values.length > 0 && typeof v.id === "string"
    );
    if (validVectors.length === 0) {
      console.warn(
        "[RAG] embedding 得到的 vectors 为空，跳过 upsert。可能原因：缺少 PINECONE_API_KEY / OPENAI_API_KEY，或 embedding 返回格式异常。"
      );
      return index;
    }

    await index.upsert({ records: validVectors });
    console.log(`已添加 ${chunks.length} 个文档块`);
  }

  return index;
}

// ==================== 检索 ====================

async function retrieve(query: string, topK = 2): Promise<string[]> {
  const index = await initVectorDB();

  const queryEmbedding = await getEmbedding(query);

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });


  return results.matches?.map((match) => match.metadata?.text as string) || [];
}

// ==================== API ====================

export async function POST(req: NextRequest) {
  const { question } = await req.json();

  // 1. 检索相关文档（使用真实 Embedding）
  const relevantDocs = await retrieve(question);

  const context = relevantDocs.join("\n");
  console.log('relevantDocs', relevantDocs);

  // 2. 构建 Prompt
  const prompt = `基于以下上下文回答问题：

上下文：
${context}

问题：${question}

回答：`;

  // 3. 调用 LLM
  const response = await fetch(
    `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    }
  );

  const data = await response.json();
  const answer = data.choices[0].message.content;

  return NextResponse.json({ context, answer });
}

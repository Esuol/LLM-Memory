import { NextRequest, NextResponse } from "next/server";

// ==================== 知识库 ====================

const rawDocuments = [
  `Next.js 16 发布于 2024年12月，带来了重大性能提升。新版本引入了部分预渲染（Partial Prerendering）功能，允许在同一路由中混合静态和动态内容。此外，还优化了服务器组件的性能，减少了客户端 JavaScript 包的大小。开发体验也得到改善，包括更快的热重载和更好的错误提示。`,

  `React 19 引入了 Server Components，改变了组件渲染方式。这是 React 架构的重大变革，允许组件在服务器端渲染并流式传输到客户端。Server Components 不会增加客户端 bundle 大小，可以直接访问服务器资源如数据库。同时引入了新的 use() Hook 用于数据获取，以及改进的 Suspense 边界处理。`,

  `Tailwind CSS v4 使用 Rust 引擎，编译速度提升 10 倍。新版本完全重写了编译器，采用 Rust 语言实现，大幅提升了构建性能。支持原生 CSS 变量，移除了对 PostCSS 的依赖。新增了容器查询、动态视口单位等现代 CSS 特性。配置文件也简化了，提供了更好的 TypeScript 支持。`,
];

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

const documentChunks = createChunks(rawDocuments);

// ==================== 缓存文档 Embedding ====================

let chunkEmbeddings: number[][] | null = null;

async function initChunkEmbeddings() {
  if (!chunkEmbeddings) {
    console.log(`初始化 ${documentChunks.length} 个文档块的 Embedding...`);
    chunkEmbeddings = await Promise.all(
      documentChunks.map((chunk) => getEmbedding(chunk.content))
    );
    console.log("文档块 Embedding 缓存完成");
  }
  return chunkEmbeddings;
}

// ==================== 真实 Embedding API ====================

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

// ==================== 余弦相似度 ====================

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// ==================== 检索 ====================

async function retrieve(query: string, topK = 2): Promise<string[]> {
  const docEmbeddings = await initChunkEmbeddings();
  const queryEmbedding = await getEmbedding(query);

  const scores = documentChunks.map((chunk, i) => ({
    doc: chunk.content,
    score: cosineSimilarity(queryEmbedding, docEmbeddings[i]),
  }));

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).map((s) => s.doc);
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

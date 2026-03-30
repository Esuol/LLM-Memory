import { NextRequest, NextResponse } from "next/server";

// ==================== 知识库 ====================

const documents = [
  "Next.js 16 发布于 2024年12月，带来了重大性能提升",
  "React 19 引入了 Server Components，改变了组件渲染方式",
  "Tailwind CSS v4 使用 Rust 引擎，编译速度提升 10 倍",
  "TypeScript 5.0 引入了装饰器和性能优化",
  "Vite 5.0 提供了更快的冷启动速度",
  "Node.js 20 是新的 LTS 版本，支持原生测试运行器",
  "Bun 1.0 发布，号称是最快的 JavaScript 运行时",
  "Astro 3.0 支持视图过渡动画和图片优化",
];

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
  const queryEmbedding = await getEmbedding(query);

  const scores = await Promise.all(
    documents.map(async (doc) => ({
      doc,
      score: cosineSimilarity(queryEmbedding, await getEmbedding(doc)),
    }))
  );

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).map((s) => s.doc);
}

// ==================== API ====================

export async function POST(req: NextRequest) {
  const { question } = await req.json();

  // 1. 检索相关文档（使用真实 Embedding）
  const relevantDocs = await retrieve(question);

  const context = relevantDocs.join("\n");
  console.log('relevantDocs', relevantDocs,'context',context);

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

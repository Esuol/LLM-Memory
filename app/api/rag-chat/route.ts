import { NextRequest, NextResponse } from "next/server";

// ==================== 知识库 ====================

const documents = [
  "Next.js 16 发布于 2024年12月，带来了重大性能提升",
  "React 19 引入了 Server Components，改变了组件渲染方式",
  "Tailwind CSS v4 使用 Rust 引擎，编译速度提升 10 倍",
];

// ==================== 简单的相似度计算 ====================

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// ==================== 简化版 Embedding（词频向量）====================

function simpleEmbedding(text: string): number[] {
  const words = text.toLowerCase().match(/[\u4e00-\u9fa5a-z0-9]+/g) || [];
  const vocab = ["next", "react", "tailwind", "16", "19", "v4", "发布", "引入", "使用"];
  return vocab.map((word) => words.filter((w) => w.includes(word)).length);
}

// ==================== 检索 ====================

function retrieve(query: string, topK = 1): string[] {
  const queryEmbedding = simpleEmbedding(query);
  const scores = documents.map((doc) => ({
    doc,
    score: cosineSimilarity(queryEmbedding, simpleEmbedding(doc)),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).map((s) => s.doc);
}

// ==================== API ====================

export async function POST(req: NextRequest) {
  const { question } = await req.json();

  // 1. 检索相关文档
  const relevantDocs = retrieve(question);

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

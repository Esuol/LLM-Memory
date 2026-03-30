"use client";

import { useState } from "react";

export default function RagPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);

  const askQuestion = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setAnswer("");
    setContext("");

    const response = await fetch("/api/rag-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    const data = await response.json();
    setContext(data.context);
    setAnswer(data.answer);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">Lesson 4: RAG</h1>
        <p className="text-gray-700 mb-6">检索增强生成 - 让 LLM 访问外部知识</p>

        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="font-semibold mb-2 text-gray-900">知识库</h2>
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
            <p>• Next.js 16 发布于 2024年12月</p>
            <p>• React 19 引入了 Server Components</p>
            <p>• Tailwind CSS v4 使用 Rust 引擎</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askQuestion()}
            placeholder="问问题：Next.js 16 什么时候发布的？"
            className="w-full px-4 py-2 border rounded-lg text-gray-900 mb-2"
          />
          <button
            onClick={askQuestion}
            disabled={loading}
            className="w-full px-6 py-2 bg-blue-500 text-white rounded-lg disabled:bg-gray-300"
          >
            {loading ? "思考中..." : "提问"}
          </button>
        </div>

        {context && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-2">📄 检索到的上下文</h3>
            <p className="text-sm text-gray-700">{context}</p>
          </div>
        )}

        {answer && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-2">💡 回答</h3>
            <p className="text-gray-700">{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

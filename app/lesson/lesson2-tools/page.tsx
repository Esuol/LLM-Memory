/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";

export default function Lesson2Tools() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

    const res = await fetch("/api/tools-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMessages }),
    });

    const data = await res.json();
    const aiMessage = { role: "assistant", content: data.message };
    setMessages([...newMessages, aiMessage]);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="text-3xl font-bold mb-4">Lesson 2: Tools (工具调用)</h1>

      <div className="mb-8 rounded bg-gray-100 p-4 text-slate-900">
        <h2 className="text-xl font-semibold mb-2">核心知识</h2>
        <p className="mb-2">Tools 让 AI 能调用外部功能（如获取时间、查询天气）</p>
        <p className="text-sm text-gray-600">
          AI 通过 description 判断何时调用工具，执行后把结果返回给 AI 生成最终回答。
        </p>
      </div>

      <div className="mb-4 h-96 overflow-y-auto rounded border bg-white p-4 text-slate-800">
        {messages.length === 0 ? (
          <p className="text-slate-500">试试问："现在几点了？"</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`mb-2 ${msg.role === "user" ? "text-blue-600" : "text-green-600"}`}>
              <strong>{msg.role}:</strong> {msg.content}
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="输入消息..."
          className="flex-1 rounded border bg-white px-4 py-2 text-slate-900 placeholder:text-slate-400"
        />
        <button onClick={handleSend} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
          发送
        </button>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h3 className="font-semibold mb-2">练习任务</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>问 AI "现在几点了？" 观察工具调用</li>
          <li>问 AI "你好" 观察 AI 直接回答（不调用工具）</li>
          <li>思考：如果要添加天气查询工具，需要改哪里？</li>
        </ol>
      </div>
    </div>
  );
}

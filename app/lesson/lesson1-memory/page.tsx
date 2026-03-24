"use client";

import { useState } from "react";

export default function Lesson1Memory() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];

    const aiMessage = { role: "assistant", content: `收到: ${input}` };
    setMessages([...newMessages, aiMessage]);

    setInput("");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="text-3xl font-bold mb-4">Lesson 1: Memory (对话记忆)</h1>

      <div className="mb-8 rounded bg-gray-100 p-4 text-slate-900">
        <h2 className="text-xl font-semibold mb-2">核心知识</h2>
        <p className="mb-2">Memory 的本质：把之前的对话历史一起发送给 AI</p>
        <p className="text-sm text-gray-600">
          每次对话时，messages 数组会保存所有历史消息，让 AI "记住"之前说过的内容。
        </p>
      </div>

      <div className="mb-4 h-96 overflow-y-auto rounded border bg-white p-4 text-slate-800">
        {messages.length === 0 ? (
          <p className="text-slate-500">开始对话...</p>
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
          <li>试着发送几条消息，观察 messages 数组的变化</li>
          <li>打开浏览器控制台，添加 console.log(messages) 查看数据结构</li>
          <li>思考：如果刷新页面，记忆会消失吗？为什么？</li>
        </ol>
      </div>
    </div>
  );
}

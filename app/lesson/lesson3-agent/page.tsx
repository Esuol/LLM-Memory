/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";

export default function Lesson3Agent() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentSteps, setAgentSteps] = useState<string[]>([]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setAgentSteps([]);

    const res = await fetch("/api/agent-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMessages }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));

          if (data.type === "thought") {
            setAgentSteps((prev) => [...prev, `💭 思考: ${data.content}`]);
          } else if (data.type === "action") {
            setAgentSteps((prev) => [...prev, `🔧 执行: ${data.tool}(${JSON.stringify(data.args)})`]);
          } else if (data.type === "observation") {
            setAgentSteps((prev) => [...prev, `👁️ 观察: ${data.content}`]);
          } else if (data.type === "message") {
            setLoading(false);
            setAgentSteps([]);
            const aiMessage = { role: "assistant", content: data.content };
            setMessages([...newMessages, aiMessage]);
          } else if (data.type === "error") {
            setLoading(false);
            setAgentSteps([]);
            const aiMessage = { role: "assistant", content: `错误: ${data.content}` };
            setMessages([...newMessages, aiMessage]);
          }
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="text-3xl font-bold mb-4">Lesson 3: Agent (自主决策)</h1>

      <div className="mb-8 rounded bg-gray-100 p-4 text-slate-900">
        <h2 className="text-xl font-semibold mb-2">核心知识</h2>
        <p className="mb-2">Agent 能自主规划任务、组合工具、处理失败</p>
        <p className="text-sm text-gray-600">
          使用 ReAct 模式：思考(Thought) → 行动(Action) → 观察(Observation) → 循环
        </p>
      </div>

      <div className="mb-4 h-96 overflow-y-auto rounded border bg-white p-4 text-slate-800">
        {messages.length === 0 ? (
          <p className="text-slate-500">试试问："帮我查北京天气，如果下雨就推荐室内活动"</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`mb-2 ${msg.role === "user" ? "text-blue-600" : "text-green-600"}`}>
              <strong>{msg.role}:</strong> {msg.content}
            </div>
          ))
        )}
        {loading && (
          <div className="text-orange-600 text-sm">
            {agentSteps.map((step, i) => (
              <div key={i} className="mb-1">{step}</div>
            ))}
            {agentSteps.length === 0 && <div className="animate-pulse">🤖 Agent 启动中...</div>}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="输入任务..."
          className="flex-1 rounded border bg-white px-4 py-2 text-slate-900 placeholder:text-slate-400"
        />
        <button onClick={handleSend} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
          发送
        </button>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h3 className="font-semibold mb-2">练习任务</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>问 "帮我查北京天气，如果下雨就推荐室内活动"</li>
          <li>观察 Agent 的思考、行动、观察过程</li>
          <li>思考：Agent 如何决定下一步做什么？</li>
        </ol>
      </div>
    </div>
  );
}

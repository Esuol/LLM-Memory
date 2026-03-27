"use client";

import { useState } from "react";

export default function MultiAgentQueuePage() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLogs([]);

    const response = await fetch("/api/multi-agent-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...messages, userMessage] }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = JSON.parse(line.slice(6));

        if (data.type === "log") {
          setLogs((prev) => [...prev, data.content]);
        } else if (data.type === "message") {
          setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">多 Agent 协作 (消息队列版)</h1>
        <p className="text-gray-700 mb-6">Agent 通过消息队列通信，完全解耦</p>

        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="font-semibold mb-2 text-gray-900">消息流</h2>
          <div className="bg-gray-100 rounded p-3 h-40 overflow-y-auto text-sm font-mono text-gray-800">
            {logs.map((log, i) => (
              <div key={i} className="mb-1">{log}</div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-4 h-96 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`mb-4 ${msg.role === "user" ? "text-right" : ""}`}>
              <div className={`inline-block px-4 py-2 rounded-lg ${
                msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-900"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="试试：对比北京、上海、广州的天气"
            className="flex-1 px-4 py-2 border rounded-lg text-gray-900"
          />
          <button onClick={sendMessage} className="px-6 py-2 bg-blue-500 text-white rounded-lg">
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";

type Step = { type: string; content?: string; tool?: string; args?: Record<string, unknown> };

export default function MemoryAgent() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [showSteps, setShowSteps] = useState(true);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setSteps([]);

    const res = await fetch("/api/memory-agent", {
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
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = JSON.parse(line.slice(6));

        if (data.type === "message") {
          setLoading(false);
          setMessages([...newMessages, { role: "assistant", content: data.content }]);
        } else if (data.type === "error") {
          setLoading(false);
          setMessages([...newMessages, { role: "assistant", content: `错误: ${data.content}` }]);
        } else {
          setSteps((prev) => [...prev, data]);
        }
      }
    }
  };

  const renderStep = (step: Step, i: number) => {
    if (step.type === "thought") {
      return (
        <div key={i} className="mb-1 text-purple-600">
          💭 <span className="font-medium">思考:</span> {step.content}
        </div>
      );
    }
    if (step.type === "action") {
      const isMemory = step.tool === "saveMemory" || step.tool === "recallMemory";
      return (
        <div key={i} className="mb-1 text-orange-600">
          {isMemory ? "🧠" : "🔧"} <span className="font-medium">执行:</span>{" "}
          {step.tool}({JSON.stringify(step.args)})
        </div>
      );
    }
    if (step.type === "observation") {
      return (
        <div key={i} className="mb-1 text-green-700 pl-4 border-l-2 border-green-300">
          👁️ <span className="font-medium">观察:</span> {step.content}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="text-3xl font-bold mb-2">记忆增强 Agent</h1>
      <p className="text-slate-500 mb-6 text-sm">
        Agent 能记住你的偏好和历史，下次对话时自动应用
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 对话区域 */}
        <div className="lg:col-span-2">
          <div className="mb-4 h-80 overflow-y-auto rounded border bg-white p-4 text-slate-800">
            {messages.length === 0 ? (
              <div className="text-slate-400 space-y-1 text-sm">
                <p>试试这些测试：</p>
                <p>1. "我喜欢简洁的回答" → Agent 记住偏好</p>
                <p>2. "北京天气如何？" → 看看 Agent 是否用简洁格式</p>
                <p>3. 刷新页面再问 → 偏好仍然存在</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`mb-3 ${msg.role === "user" ? "text-blue-600" : "text-slate-800"}`}>
                  <span className="font-semibold">{msg.role === "user" ? "你" : "Agent"}:</span>{" "}
                  {msg.content}
                </div>
              ))
            )}
            {loading && steps.length === 0 && (
              <div className="text-orange-500 animate-pulse text-sm">🤖 Agent 启动中...</div>
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
            <button
              onClick={handleSend}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            >
              发送
            </button>
          </div>
        </div>

        {/* 思考过程面板 */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-sm">Agent 思考过程</h3>
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              {showSteps ? "收起" : "展开"}
            </button>
          </div>
          {showSteps && (
            <div className="h-80 overflow-y-auto rounded border bg-white p-3 text-xs">
              {steps.length === 0 && !loading ? (
                <p className="text-slate-400">执行后显示思考过程</p>
              ) : (
                steps.map((step, i) => renderStep(step, i))
              )}
              {loading && steps.length > 0 && (
                <div className="text-orange-500 animate-pulse mt-1">⏳ 处理中...</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 知识卡片 */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-purple-50 border border-purple-200 rounded p-4">
          <h4 className="font-semibold text-purple-700 mb-2">🧠 短期记忆</h4>
          <p className="text-sm text-purple-600">当前对话历史，存储在浏览器状态中，刷新后消失</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <h4 className="font-semibold text-blue-700 mb-2">💾 长期记忆</h4>
          <p className="text-sm text-blue-600">用户偏好和重要事实，存储在文件中，刷新后仍存在</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <h4 className="font-semibold text-green-700 mb-2">⚙️ 工作记忆</h4>
          <p className="text-sm text-green-600">当前任务状态，执行过程中的中间结果</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";

type Phase = "input" | "indexing" | "chat";

interface Source {
  file: string;
  language: string;
  content: string;
}

interface Message {
  user: string;
  ai: string;
  sources: Source[];
}

const LANG_COLORS: Record<string, string> = {
  typescript: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  javascript: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  python: "bg-green-500/20 text-green-300 border-green-500/30",
  go: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  rust: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  markdown: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

function LangBadge({ lang }: { lang: string }) {
  const cls = LANG_COLORS[lang] ?? "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded border font-mono ${cls}`}>
      {lang}
    </span>
  );
}

export default function CodeChatPage() {
  const [phase, setPhase] = useState<Phase>("input");
  const [repoUrl, setRepoUrl] = useState("");
  const [namespace, setNamespace] = useState("");
  const [indexProgress, setIndexProgress] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSources, setCurrentSources] = useState<Source[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingNamespaces, setExistingNamespaces] = useState<
    Array<{ namespace: string; vectorCount: number }>
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/code-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "list" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.namespaces) setExistingNamespaces(data.namespaces);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleIndex() {
    if (!repoUrl.trim()) return;
    setPhase("indexing");
    setIndexProgress("正在连接 GitHub...");
    try {
      const res = await fetch("/api/code-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "index", repoUrl: repoUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "索引失败");
      if (data.cached) {
        setIndexProgress(`缓存命中，直接进入问答`);
      } else {
        setIndexProgress(`索引完成 · ${data.fileCount} 个文件 · ${data.chunkCount} 个文档块`);
      }
      setNamespace(data.namespace);
      setTimeout(() => setPhase("chat"), 900);
    } catch (err) {
      setIndexProgress(`错误：${err instanceof Error ? err.message : "索引失败"}`);
      setTimeout(() => setPhase("input"), 2500);
    }
  }

  async function handleChat() {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion("");
    setLoading(true);
    const history = messages.map((m) => ({ user: m.user, ai: m.ai }));
    setMessages((prev) => [...prev, { user: q, ai: "", sources: [] }]);

    try {
      const res = await fetch("/api/code-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "chat", question: q, namespace, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "问答失败");
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { user: q, ai: data.answer, sources: data.sources ?? [] };
        return updated;
      });
      setCurrentSources(data.sources ?? []);
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          user: q,
          ai: `错误：${err instanceof Error ? err.message : "问答失败"}`,
          sources: [],
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  // ── 阶段 1：输入 ─────────────────────────────────────────────
  if (phase === "input") {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
        <div className="w-full max-w-xl space-y-8">
          {/* 标题 */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1 text-xs text-zinc-400 font-mono mb-4">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              RAG · Pinecone · LangChain
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight">
              Code<span className="text-blue-400">Chat</span>
            </h1>
            <p className="text-zinc-400 text-sm">输入任意 GitHub 公开仓库，自然语言问答代码库</p>
          </div>

          {/* 输入卡片 */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono mb-1">
              <span className="text-red-400">●</span>
              <span className="text-yellow-400">●</span>
              <span className="text-green-400">●</span>
              <span className="ml-2">index repository</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-sm">$</span>
              <input
                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg pl-8 pr-4 py-3 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIndex()}
              />
            </div>
            <button
              onClick={handleIndex}
              disabled={!repoUrl.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg py-3 text-sm transition-colors"
            >
              开始索引
            </button>
            <div className="flex gap-3 text-xs text-zinc-600 font-mono">
              {["vercel/next.js", "facebook/react"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRepoUrl(`https://github.com/${r}`)}
                  className="hover:text-blue-400 transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* 已索引仓库 */}
          {existingNamespaces.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">已索引的仓库</p>
              <div className="grid gap-2">
                {existingNamespaces.map((item) => (
                  <button
                    key={item.namespace}
                    onClick={() => { setNamespace(item.namespace); setPhase("chat"); }}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-700 hover:border-blue-500/60 hover:bg-zinc-800 rounded-xl px-4 py-3 text-left transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">
                        ⬡
                      </div>
                      <span className="text-sm text-zinc-200 font-mono group-hover:text-white transition-colors">
                        {item.namespace}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">{item.vectorCount.toLocaleString()} vectors</span>
                      <span className="text-zinc-600 group-hover:text-blue-400 transition-colors">→</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 索引中 ───────────────────────────────────────────────────
  if (phase === "indexing") {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative inline-flex">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-2xl animate-pulse">
              ⬡
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-white font-mono text-sm">{indexProgress}</p>
            <p className="text-zinc-600 font-mono text-xs">{repoUrl}</p>
          </div>
          <div className="flex gap-1 justify-center">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── 阶段 2：问答 ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-white">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xs">
            ⬡
          </div>
          <div>
            <span className="text-sm font-mono text-zinc-200">{namespace}</span>
            {repoUrl && (
              <span className="ml-2 text-xs text-zinc-600">{repoUrl}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setMessages([]); setCurrentSources([]); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
          >
            清空对话
          </button>
          <button
            onClick={() => { setPhase("input"); setMessages([]); setCurrentSources([]); setNamespace(""); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
          >
            换仓库
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 对话区 */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50">
                <div className="text-4xl">⬡</div>
                <p className="text-zinc-500 text-sm font-mono">开始提问吧</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="space-y-3">
                {/* 用户 */}
                <div className="flex justify-end">
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[70%] text-sm leading-relaxed">
                    {m.user}
                  </div>
                </div>
                {/* AI */}
                <div className="flex justify-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-blue-400 text-xs flex-shrink-0 mt-0.5">
                    AI
                  </div>
                  <div
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%] text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed cursor-pointer hover:border-zinc-700 transition-colors"
                    onClick={() => m.sources.length > 0 && setCurrentSources(m.sources)}
                  >
                    {m.ai === "" ? (
                      <span className="flex gap-1">
                        {[0, 1, 2].map((j) => (
                          <span
                            key={j}
                            className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce inline-block"
                            style={{ animationDelay: `${j * 0.15}s` }}
                          />
                        ))}
                      </span>
                    ) : (
                      <>
                        {m.ai}
                        {m.sources.length > 0 && (
                          <p className="text-xs text-blue-400/70 mt-2 font-mono">
                            📎 {m.sources.length} sources · 点击查看
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* 输入框 */}
          <div className="px-6 py-4 bg-zinc-900 border-t border-zinc-800 flex gap-3">
            <input
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors font-mono disabled:opacity-50"
              placeholder="输入问题，回车发送..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChat()}
              disabled={loading}
            />
            <button
              onClick={handleChat}
              disabled={!question.trim() || loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-xl px-5 text-sm font-medium transition-colors"
            >
              {loading ? "···" : "发送"}
            </button>
          </div>
        </div>

        {/* 来源面板 */}
        <div className="w-80 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto px-4 py-4 space-y-3 hidden md:block">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Sources</p>
          {currentSources.length === 0 ? (
            <p className="text-xs text-zinc-600 font-mono mt-4">// 回答后这里显示检索到的代码片段</p>
          ) : (
            currentSources.map((s, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-mono text-blue-400 break-all leading-relaxed">{s.file}</p>
                  <LangBadge lang={s.language} />
                </div>
                <pre className="text-xs text-zinc-400 bg-black/30 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                  {s.content}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

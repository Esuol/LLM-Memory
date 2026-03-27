import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8">AI Agent 学习项目</h1>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">课程</h2>
        <ul className="space-y-2">
          <li>
            <Link href="/lesson/lesson1-memory" className="text-blue-600 hover:underline">
              Lesson 1: Memory (对话记忆)
            </Link>
          </li>
          <li>
            <Link href="/lesson/lesson2-tools" className="text-blue-600 hover:underline">
              Lesson 2: Tools (工具调用)
            </Link>
          </li>
          <li>
            <Link href="/lesson/lesson3-agent" className="text-blue-600 hover:underline">
              Lesson 3: Agent (自主决策)
            </Link>
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">高级主题</h2>
        <ul className="space-y-2">
          <li>
            <Link href="/lesson/memory-agent" className="text-blue-600 hover:underline">
              记忆增强 Agent (长期记忆系统)
            </Link>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">项目</h2>
        <ul className="space-y-2">
          <li className="text-gray-400">Project 1: Memory Chat</li>
          <li className="text-gray-400">Project 2: Tool Agent</li>
          <li className="text-gray-400">Project 3: AI Assistant</li>
        </ul>
      </section>
    </main>
  );
}

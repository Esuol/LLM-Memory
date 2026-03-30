# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 AI Agent 学习项目，目标是从"API 调用者"成长为"AI Agent 开发者"。

**技术栈：** Next.js 16、React 19、TypeScript、LangChain.js、OpenAI API
**当前阶段：** 已完成 Lesson 1-3 + 多 Agent 协作，准备进入 RAG 阶段

## 项目架构

Next.js App Router 应用，采用 **课程页面 + API 路由** 的双层架构：

**已完成课程：**
- `/lesson/lesson1-memory` → `/api/langchain-chat` - 对话记忆（BufferMemory）
- `/lesson/lesson2-tools` → `/api/tools-chat` - 工具调用（Function Calling）
- `/lesson/lesson3-agent` → `/api/agent-chat` - Agent 决策（ReAct 模式）
- `/lesson/memory-agent` → `/api/memory-agent` - 记忆增强 Agent
- `/lesson/multi-agent` → `/api/multi-agent` - 多 Agent 协作（直接通信）
- `/lesson/multi-agent-queue` → `/api/multi-agent-queue` - 消息队列版多 Agent

**架构模式：**
- 前端：React 客户端组件 + SSE 流式响应
- 后端：Next.js API Routes + OpenAI SDK
- 多 Agent：消息队列 + 事件驱动（Planner → Worker → Coordinator）

## 常用命令

```bash
npm run dev              # 启动开发服务器 (http://localhost:3000)
npm run build            # 生产构建
npm start                # 启动生产服务器
npm run lint             # ESLint 检查
```

## 环境配置

创建 `.env.local`：
```
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://your-proxy/v1  # 可选
```

## 核心技术细节

**API 路由模式：**
- 所有 LLM 调用在 `/api/*` 路由中完成
- 使用 Server-Sent Events (SSE) 实现流式响应
- 标准格式：`data: ${JSON.stringify({type, content})}\n\n`

**多 Agent 通信：**
- 消息队列：`MessageQueue` 类实现发布/订阅模式
- Agent 角色：Planner（规划）→ Worker（执行）→ Coordinator（汇总）
- 消息类型：`task`（任务）、`result`（结果）、`done`（完成）

**LangChain 集成：**
- Memory: `BufferMemory` 存储对话历史
- Tools: `DynamicStructuredTool` 定义工具
- Agent: `createReactAgent` 实现 ReAct 模式

**Tailwind CSS:** 使用 v3.4.19（不是 v4），因为 v4 的 lightningcss 在此系统上有兼容性问题。

**Next.js:** 默认使用 webpack（不使用 Turbopack），因为 Turbopack 与 Tailwind v3 有模块解析问题。

## 教学方法

1. **顺序学习** - 课程按 Memory → Tools → Agent → Multi-Agent 递进
2. **原理先行** - 先解释概念，再实现代码
3. **最小示例** - 提供可运行的最小实现，避免过度工程
4. **引导发现** - 通过提问引导思考，而非直接给答案
5. **过程留痕** - 每个课程生成 `ANALYSIS.md`（分析过程）和 `summary.md`（总结）

## 下一步学习路径

**推荐：Lesson 4 - RAG (检索增强生成)**
- 向量数据库集成（Pinecone/Chroma）
- Embedding 生成和语义搜索
- 上下文注入和知识库构建

**后续方向：**
- Lesson 5: Agent 工作流编排（LangGraph）
- Lesson 6: Agent 可观测性（LangSmith）


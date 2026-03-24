# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 AI Agent 学习项目，目标是从"API 调用者"成长为"AI Agent 开发者"。

**技术栈：** Next.js、React、TypeScript、ESLint、LangChain (JS)、OpenAI API
**当前阶段：** Lesson 1 (Memory) - 进行中

## 项目架构

这是一个 Next.js App Router 应用，通过路由组织课程和项目：

**路由结构：**
- `/lesson/lesson1-memory` - Lesson 1: 对话记忆机制
- `/lesson/lesson2-tools` - Lesson 2: 工具和函数调用
- `/lesson/lesson3-agent` - Lesson 3: Agent 自主决策
- `/project/project1-memory-chat` - Project 1: 多轮对话
- `/project/project2-tool-agent` - Project 2: 工具调用 Agent
- `/project/project3-ai-assistant` - Project 3: 完整 AI 助手

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

## 教学方法

1. **顺序学习** - 课程必须按 Lesson 1 → 2 → 3 顺序完成
2. **原理先行** - 先解释概念，再实现代码
3. **渐进复杂度** - 提供最小可运行示例，而非完整解决方案
4. **引导发现** - 通过提问引导思考，而非直接给答案
5. **动手实践** - 每个课程必须包含可执行代码和练习任务

## 回复格式

- **问题理解** - 理解用户的问题
- **核心知识** - 讲解关键概念
- **示例代码** - 提供最小示例
- **练习任务** - 给出实践任务

## 当前重点

优先完成 Lesson 1 (Memory) 和 Project 1 (Memory Chat)。用户必须通过解释概念和独立实现来证明理解，才能进入下一课程。


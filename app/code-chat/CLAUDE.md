# CLAUDE.md — 代码库问答助手 (Codebase Q&A Assistant)

## 项目目标

输入 GitHub 公开仓库地址，自动抓取代码文件，建立向量索引，支持自然语言问答 + 来源溯源。

**核心价值：** 开发者可以像问同事一样问一个陌生代码库——"这个接口怎么用"、"认证逻辑在哪里"、"如何新增一个路由"。

---

## 目录结构

```
app/
├── code-chat/                    ← 页面 + 业务逻辑
│   ├── CLAUDE.md
│   ├── page.tsx                  ← 前端页面（两阶段 UI）
│   └── api/                      ← 业务逻辑（工具函数，非 HTTP 路由）
│       ├── index.ts              ← 索引逻辑（GitHub 抓取 + Pinecone 写入）
│       └── chat.ts               ← 问答逻辑（LangChain 检索链）
└── api/
    └── code-chat/
        └── route.ts              ← HTTP 路由入口，根据 type 分发调用
```

**路由约定：** Next.js App Router 的 HTTP 路由必须是 `route.ts`。
当前采用**单路由分发**模式：`POST /api/code-chat` 接收 `type: "index" | "chat"` 字段，
在 `route.ts` 中分发到 `app/code-chat/api/index.ts` 或 `app/code-chat/api/chat.ts`。

```typescript
// app/api/code-chat/route.ts（分发逻辑示意）
import { handleIndex } from "@/app/code-chat/api/index";
import { handleChat } from "@/app/code-chat/api/chat";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.type === "index") return handleIndex(body);
  if (body.type === "chat")  return handleChat(body);
}
```

---

## 产品功能详细设计

### 功能 1：仓库索引

**触发方式：** 用户在首页输入 GitHub 仓库 URL，点击"索引仓库"按钮

**完整流程：**
1. 前端校验 URL 格式（必须是 `https://github.com/owner/repo` 格式）
2. 调用 `POST /api/code-chat/index`
3. 后端检查该仓库是否已在 Pinecone namespace 中存在
   - 已存在：直接返回缓存状态，跳过重新索引
   - 不存在：开始索引流程
4. 显示索引进度（文件数、chunk 数）
5. 索引完成后自动进入问答界面

**索引状态展示：**
```
⏳ 正在获取文件列表...
📁 发现 142 个文件，过滤后保留 89 个
📦 分块中... 生成 312 个文档块
🔮 向量化并写入 Pinecone...
✅ 索引完成！89 个文件，312 个文档块
```

**已缓存状态展示：**
```
⚡ 该仓库已索引（312 个文档块），直接进入问答
```

**重新索引功能：** 问答界面提供"重新索引"按钮，清除 namespace 后重新建立索引

**错误处理：**
- 无效 URL → "请输入有效的 GitHub 仓库地址"
- 私有仓库 → "无法访问该仓库，请确认仓库为公开"
- 仓库不存在 → "仓库不存在或已删除"
- GitHub API rate limit → "请求频率超限，请 1 分钟后重试"
- 无可索引文件 → "未找到支持的代码文件"

---

### 功能 2：代码问答

**触发方式：** 用户在输入框输入问题，回车或点击发送

**支持的问题类型（要能回答好）：**
| 问题类型 | 示例                                          |
| -------- | --------------------------------------------- |
| 功能定位 | "认证逻辑在哪里实现的？"                      |
| 代码解释 | "generateHypotheticalAnswer 这个函数做什么？" |
| 使用方法 | "如何新增一个 API 路由？"                     |
| 架构理解 | "这个项目的整体架构是什么？"                  |
| 实现细节 | "RAG 检索是怎么实现的？"                      |
| 修改指导 | "如果我要添加用户认证，应该改哪些文件？"      |

**多轮对话：** 支持上下文连续追问
```
用户：认证逻辑在哪里？
AI：在 app/api/auth/route.ts 中实现...

用户：它用了什么算法？    ← 能理解"它"指代认证逻辑
AI：使用了 JWT...
```

**回答格式要求：**
- 回答简洁准确，优先引用代码
- 代码片段用 markdown 代码块包裹，标注语言
- 最后列出来源文件（`[来源: src/app/page.tsx]`）

---

### 功能 3：来源溯源

**展示方式：** 每次回答后，右侧面板显示检索到的相关代码片段

**来源卡片包含：**
- 文件路径（相对路径，如 `app/api/rag-chat/route.ts`）
- 语言标识（TypeScript / Python / Go 等）
- 相关代码片段（前 500 字符）
- 点击可展开查看更多

**来源文件去重：** 同一文件的多个 chunk 合并为一张卡片

---

### 功能 4：仓库信息展示

索引完成后，顶部展示仓库基本信息（通过 GitHub API 获取）：

```
📦 vercel/next.js
⭐ 128k stars  🍴 27k forks  📝 The React Framework for the Web
🔗 https://github.com/vercel/next.js
```

---

### 功能 5：对话历史管理

- 对话历史保存在前端 state（页面刷新后清空）
- 提供"清空对话"按钮（不清除索引，只清对话）
- 每轮对话展示：用户问题（右对齐）+ AI 回答（左对齐）+ 来源文件

---

## API 契约（完整版）

### 统一入口：POST /api/code-chat

所有请求发往同一端点，通过 `type` 字段分发：

#### type: "index" — 索引仓库

```typescript
// 请求
interface IndexRequest {
  type: "index";
  repoUrl: string;  // "https://github.com/owner/repo"
}

// 响应 - 成功（新索引）
interface IndexResponse {
  success: true;
  namespace: string;     // "owner-repo"
  fileCount: number;     // 抓取的文件数
  chunkCount: number;    // 生成的文档块数
  cached: false;
  repoInfo: {
    name: string;
    description: string;
    stars: number;
    forks: number;
    url: string;
  };
}

// 响应 - 成功（命中缓存）
interface CachedResponse {
  success: true;
  namespace: string;
  cached: true;
  chunkCount: number;
  message: string;
  repoInfo: RepoInfo;
}

// 响应 - 失败
interface ErrorResponse {
  error: string;  // 用户可读的错误信息
}
```

#### type: "chat" — 问答

```typescript
// 请求
interface ChatRequest {
  type: "chat";
  question: string;
  namespace: string;   // 从索引响应中获取
  history: Array<{
    user: string;
    ai: string;
  }>;
}

// 响应
interface ChatResponse {
  answer: string;      // Markdown 格式
  sources: Array<{
    file: string;      // 相对文件路径
    language: string;  // "typescript" | "python" | ...
    content: string;   // 代码片段（前 500 字符）
  }>;
}
```

---

## 核心实现思路

### 索引流程（api/index.ts）

```
GitHub URL
  ↓ parseGitHubUrl()
    → { owner, repo } 或 null（无效 URL）
  ↓ 检查 Pinecone namespace 是否已存在
    → 已存在：返回缓存，跳过后续步骤
  ↓ GitHub API: /repos/{owner}/{repo}/git/trees/HEAD?recursive=1
    → 过滤：扩展名白名单 + 跳过 node_modules/dist/.git 等 + 大小 < 100KB + 最多 200 个
  ↓ GitHub API: /repos/{owner}/{repo}
    → 获取仓库基本信息（name, description, stars, forks）
  ↓ fetchFilesInBatches()
    → 每批 10 个并发，拉取文件内容
  ↓ RecursiveCharacterTextSplitter
    → chunkSize: 1000, overlap: 200
    → metadata: { file: path, language, repo: "owner/repo" }
  ↓ PineconeVectorStore.fromDocuments()
    → namespace = getNamespace(owner, repo)
  ↓ 返回统计信息 + repoInfo
```

### 问答流程（api/chat.ts）

```
{ question, namespace, history }
  ↓ PineconeVectorStore.fromExistingIndex(embeddings, { pineconeIndex, namespace })
  ↓ vectorStore.asRetriever({ k: 5 })
  ↓ ConversationalRetrievalQAChain.fromLLM(llm, retriever, {
      returnSourceDocuments: true,
      qaChainOptions: {
        prompt: 自定义 Prompt（见下方）
      }
    })
  ↓ chain.call({
      question,
      chat_history: history.map(h => [h.user, h.ai])
    })
  ↓ 提取 result.sourceDocuments
    → 按 file 去重，保留最高相关度片段
  ↓ 返回 { answer, sources }
```

### 自定义 QA Prompt

```
你是一个代码库助手。基于以下代码片段回答问题。

代码片段：
{context}

问题：{question}

回答要求：
1. 优先引用代码片段中的具体实现
2. 代码用 markdown 代码块展示
3. 指出关键逻辑在哪个文件/函数中
4. 如果代码片段中没有相关信息，明确说明"提供的代码中未找到相关信息"

回答：
```

---

## LangChain 组件

```typescript
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { PineconeVectorStore } from "@langchain/pinecone";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { PromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
```

---

## Pinecone 配置

| 配置项         | 值                                    |
| -------------- | ------------------------------------- |
| Index 名称     | `code-search`（需在控制台手动创建）   |
| Dimension      | 1536（text-embedding-3-small）        |
| Metric         | cosine                                |
| Namespace 格式 | `{owner}-{repo}`，小写，特殊字符→ `-` |
| Namespace 示例 | `vercel-next-js`                      |

---

## 文件过滤规则

**扩展名白名单：**
`.ts .tsx .js .jsx .mjs .cjs .py .go .rs .java .rb .php .c .cpp .h .hpp .md .txt .json .yaml .yml .toml .css .scss .html .vue .svelte`

**跳过路径（含以下关键词的路径直接跳过）：**
`node_modules` `dist` `build` `.git` `__pycache__` `.next` `out` `coverage` `vendor` `.cache` `target` `bin` `obj`

**跳过文件扩展名（二进制 / 无意义）：**
`.png .jpg .jpeg .gif .svg .ico .woff .woff2 .ttf .eot .mp4 .mp3 .zip .tar .gz .lock`

**大小限制：** 单文件 < 100KB，最多处理 200 个文件

---

## 前端 UI 详细设计

### 阶段 1：仓库索引页

```
┌────────────────────────────────────────────┐
│  🔍 代码库问答助手                           │
│  Ask anything about any GitHub repository   │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ https://github.com/owner/repo        │  │
│  └──────────────────────────────────────┘  │
│  [  索引仓库  ]                             │
│                                             │
│  示例：                                     │
│  · https://github.com/vercel/next.js        │
│  · https://github.com/facebook/react        │
└────────────────────────────────────────────┘
```

**索引中状态：**
```
⏳ 获取文件列表...
📁 找到 142 个文件，过滤后 89 个
📦 生成 312 个文档块...
🔮 写入向量数据库...
[████████████░░░] 75%
```

### 阶段 2：问答主界面

```
┌─────────────────────────────────────────────────────┐
│ 📦 vercel/next.js  ⭐128k  [重新索引] [清空对话]     │
├────────────────────────┬────────────────────────────┤
│  对话区                │  来源文件                   │
│                        │                             │
│  [AI] 你好！我已分析   │  📄 app/api/route.ts        │
│  了该仓库，可以开始    │  ┌──────────────────────┐   │
│  提问...               │  │ export async func... │   │
│                        │  └──────────────────────┘   │
│  [用户] 认证逻辑在哪？ │                             │
│                        │  📄 middleware.ts            │
│  [AI] 认证逻辑主要在   │  ┌──────────────────────┐   │
│  `middleware.ts` 中... │  │ export function mid..│   │
│                        │  └──────────────────────┘   │
│  ┌────────────────┐    │                             │
│  │ 输入问题...    │    │                             │
│  └────────────────┘    │                             │
│  [发送]                │                             │
└────────────────────────┴────────────────────────────┘
```

### 状态管理（前端 State）

```typescript
interface PageState {
  // 阶段控制
  phase: 'input' | 'indexing' | 'chat';

  // 索引相关
  repoUrl: string;
  namespace: string;
  indexProgress: string;   // 进度文本
  repoInfo: RepoInfo | null;

  // 问答相关
  question: string;
  history: Array<{
    user: string;
    ai: string;
    sources: Source[];
    loading?: boolean;
  }>;
  currentSources: Source[];   // 当前展示的来源（最新一条）
  loading: boolean;
}
```

---

## 环境变量

```bash
# .env.local
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://your-proxy/v1   # 可选
PINECONE_API_KEY=pcsk_...
```

---

## 开发顺序

1. **Pinecone 准备**：控制台创建 `code-search` index（1536 dim, cosine）
2. **实现工具函数** `api/index.ts`：
   - `parseGitHubUrl()` - URL 解析
   - `getNamespace()` - 生成 namespace
   - `listRepoFiles()` - GitHub API 拉文件列表
   - `fetchFilesInBatches()` - 批量拉文件内容
   - `fetchRepoInfo()` - 拉仓库基本信息
3. **实现索引端点**：过滤 → 分块 → 写入 Pinecone
4. **实现问答端点** `api/chat.ts`：LangChain 检索链
5. **实现前端** `pages/chat.ts`：两阶段 UI
6. **测试**：索引本项目自身，验证问答质量

---

## 技术细节备注

**为什么用 namespace 隔离？**
Pinecone namespace 是同一 Index 内的逻辑分区，查询时自动只搜索该 namespace，实现多仓库隔离，且不需要创建多个 Index。

**为什么批量拉取（每批 10 个）？**
GitHub API 对未认证请求限制为 60 次/小时。批量并发 + 适当间隔可在限制内完成大仓库索引。

**为什么 chunkSize = 1000，overlap = 200？**
代码文件密度高，1000 字符约 30-50 行，能保留完整函数上下文；200 字符 overlap 确保跨 chunk 的语义连续。

**ConversationalRetrievalQAChain 做了什么？**
1. 先用历史对话 + 当前问题生成"独立问题"（Query Condensation）
2. 用独立问题检索 Pinecone
3. 将检索结果 + 问题传给 LLM 生成回答
这解决了多轮对话中代词指代的问题（"它是什么" → "Next.js 的 Partial Prerendering 是什么"）。

---

## 已知性能问题与优化计划

### 问题：大仓库索引耗时极长

**瓶颈分析：**

| 阶段 | 耗时 | 说明 |
|------|------|------|
| 拉文件内容 | ~5-15s | 网络 IO，已批量并发（10个/批） |
| 生成 Embedding | ~30-120s | **主要瓶颈**，OpenAI API rate limit |
| 写入 Pinecone | ~5-20s | 一次性 upsert，网络 IO |

300 个 chunks → 6 批 × 50 个 `embedQuery` 串行调用，是性能的核心问题。

---

### 优化方向（按优先级）

#### 1. SSE 流式进度推送（最高优先级，UX 改善最大）

**现状：** 前端只能看到转圈动画，完全黑盒，用户不知道进行到哪一步。

**方案：**
- `route.ts` 的 `type === "index"` 分支改为返回 `ReadableStream`（SSE 格式）
- `indexRepository` 接受 `onProgress(msg: string)` 回调，每个关键步骤触发
- 前端 `handleIndex` 改用 `fetch` + `reader.read()` 逐行读取进度消息

**进度消息示例：**
```
⏳ 获取文件列表...
📁 发现 142 个文件，过滤后保留 89 个
📦 分块中... 生成 312 个文档块
🔮 Embedding 第 1/7 批（50个）...
🔮 Embedding 第 2/7 批（50个）...
💾 写入 Pinecone...
✅ 索引完成！
```

#### 2. `embedDocuments` 替换多次 `embedQuery`（性能提升）

**现状：** 每个 chunk 单独调 `embedQuery`，50 个并发。

**方案：** 改用 `embeddings.embedDocuments(texts[])` 传入字符串数组，OpenAI 内部批处理效率更高，减少 HTTP 请求次数。

```typescript
// 当前（低效）
await Promise.all(batch.map(d => embeddings.embedQuery(d.pageContent)))

// 优化后
const batchTexts = batch.map(d => d.pageContent);
const batchValues = await embeddings.embedDocuments(batchTexts);
```

#### 3. 边 Embedding 边 Upsert（流水线，减少等待）

**现状：** 所有 chunks 全部 embed 完毕 → 统一一次 upsert。

**方案：** 每批 embed 完立即 upsert，不等后续批次：
- 错误时已写入的数据不丢失
- 结合 SSE 可实时反馈每批进度
- 整体 wall time 减少（embed 和 upsert 部分重叠）

#### 4. 更激进的文件过滤（减少处理量）

对大仓库（文件数 > 500），按重要性降权：
- 优先保留：`src/`、`lib/`、`core/` 下的源码文件
- 降权/跳过：`test/`、`__tests__/`、`docs/`、`examples/` 目录
- 当前硬上限 200 个文件可动态调整（小仓库放宽，大仓库收紧）

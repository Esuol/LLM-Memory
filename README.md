# 🔍 CodeChat — AI 代码库问答助手

像问同事一样提问任何 GitHub 公开仓库。自然语言提问，即时获得答案并附带源代码引用。

**状态:** 开发中 | 本地运行

---

## ✨ CodeChat 是什么？

CodeChat 是一个 **AI 驱动的代码搜索引擎**，让你能用自然语言提问任何公开的 GitHub 仓库。

### 传统方式 vs CodeChat

**传统方式：**
```bash
grep -r "authentication" src/
# 50+ 个结果，需要手动筛选...
```

**CodeChat：**
```
问题："这个项目是怎么实现认证的？"
答案：✅ 即时回答 + 代码片段 + 文件位置
```

### 核心功能

- 🤖 **自然语言问答** — 像和资深工程师交流一样提问
- 📚 **多轮对话** — 支持追问，完整的上下文感知
- 🔗 **来源溯源** — 每个答案都包含精确的代码片段和文件路径
- ⚡ **智能上下文压缩** — LLM 驱动的文档筛选（20 → 5 个最相关）
- 🎯 **RAG 优化** — HyDE + Re-ranking + Multi-Query 精准检索
- 🚀 **流式输出** — 实时逐 token 生成答案
- 💾 **自动缓存** — 一次索引，无限次查询

---

## 🎬 快速开始

### 前置要求

```bash
Node.js 18+
npm 或 pnpm
```

### 环境配置

创建 `.env.local` 文件：

```bash
# OpenAI API
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://your-proxy/v1  # 可选，中国地区需要代理

# Pinecone 向量数据库
PINECONE_API_KEY=pcsk_...
PINECONE_CODE_CHAT_INDEX_NAME=code-search
```

### 安装和运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 打开浏览器
open http://localhost:3000
```

### 第一次查询

1. 输入 GitHub 仓库：`https://github.com/vercel/next.js`
2. 点击"开始索引"
3. 等待索引完成（大型仓库约 2-5 分钟）
4. 提问："App Router 是如何工作的？"
5. 立即获得答案和代码参考

---

## 🏗️ 系统架构

### 整体设计

```
┌─────────────────────────────────────────────────────────┐
│                   前端 (React)                           │
│  - 两阶段 UI（索引 → 问答）                              │
│  - 实时 SSE 流式传输                                     │
│  - 源代码面板                                             │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              Next.js API 路由                            │
│  - /api/code-chat/index   (GitHub → Pinecone)          │
│  - /api/code-chat/chat    (RAG 问答)                    │
│  - /api/code-chat/list    (命名空间管理)                │
└────────────────┬────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼────────┐
│  Pinecone    │  │  OpenAI API   │
│  (向量库)     │  │  (LLM)        │
└──────────────┘  └───────────────┘
```

### RAG 管道流程

```
用户问题
  ↓
Query Condensation（处理代词和上下文）
  ↓
HyDE（生成假设代码答案）
  ↓
Pinecone 检索（获取 20 个文档）
  ↓
上下文压缩（LLM 精选 top-5）
  ↓
LLM 生成回答（流式输出）
  ↓
答案 + 源代码
```

---

## 🔧 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 19, Next.js 16, Tailwind CSS |
| **后端** | Next.js App Router, Node.js |
| **LLM** | OpenAI GPT-4 Turbo, text-embedding-3-small |
| **向量库** | Pinecone (1536维, cosine相似度) |
| **框架** | LangChain.js |
| **流传输** | Server-Sent Events (SSE) |

---

## 📊 性能指标

### 索引速度

| 仓库规模 | 文件数 | 文档块数 | 耗时 |
|---------|--------|----------|------|
| 小 | 50 | 150 | ~30s |
| 中 | 200 | 600 | ~2min |
| 大 | 500+ | 1500+ | ~5min |

### 查询性能

- **检索**: ~500ms（Pinecone + HyDE）
- **压缩**: ~1s（LLM 评分）
- **生成**: ~3-5s（流式输出）
- **总耗时**: ~5-7s

---

## 🎓 学习价值

这个项目展示了前沿的 RAG 技术：

1. **向量嵌入** — 使用 text-embedding-3-small 进行语义搜索
2. **检索优化** — HyDE、Re-ranking、Multi-Query 三重优化
3. **上下文压缩** — LLM 驱动的文档智能筛选
4. **多轮对话** — Query Condensation 处理代词指代
5. **流式架构** — SSE 实现实时用户体验
6. **生产模式** — 错误处理、缓存、限流

详见 [COMPRESS.md](./app/code-chat/COMPRESS.md) 了解上下文压缩的深度解析。

---

## 📁 项目结构

```
app/
├── code-chat/
│   ├── page.tsx                 # 前端 UI（两阶段界面）
│   ├── CLAUDE.md                # 详细设计文档
│   ├── COMPRESS.md              # 上下文压缩指南
│   └── api/
│       ├── index.ts             # 索引逻辑
│       ├── chat.ts              # RAG 问答逻辑
│       └── utils.ts             # 工具函数（重试、SSE 等）
└── api/
    └── code-chat/
        ├── index/route.ts       # HTTP: POST /api/code-chat/index
        ├── chat/route.ts        # HTTP: POST /api/code-chat/chat
        ├── list/route.ts        # HTTP: GET /api/code-chat/list
        └── delete/route.ts      # HTTP: POST /api/code-chat/delete
```

---

## 🚀 高级特性

### 上下文压缩

将检索到的 20 个文档精选为最相关的 5 个：

```
20 个候选 → LLM 评分 → top-5 精选
```

**优势：**
- ✅ 减少 Token 使用 75%
- ✅ 提高答案质量（减少噪音）
- ✅ 加快生成速度

### HyDE（假设文档嵌入）

不是嵌入问题本身，而是嵌入假设的代码答案：

```
问题："怎样实现认证？"
→ 生成假设代码答案
→ 用代码向量检索
→ 找到实际实现
```

**为什么有效：** 代码-代码相似度 > 问题-代码相似度

### 多查询检索

将一个问题扩展成 3 个不同角度：

```
问题："缓存是怎样工作的？"
→ Q1："缓存的实现是什么？"
→ Q2："如何配置缓存？"
→ Q3："缓存失效策略？"
→ 从 3 个角度检索
→ 合并去重结果
```

---

## 🔐 安全和隐私

- ✅ 只索引 **公开** GitHub 仓库
- ✅ 代码仅存储在 Pinecone（不本地保存）
- ✅ API 密钥通过环境变量管理
- ✅ 无用户数据收集
- ✅ API 端点限流保护

---

## 📈 开发路线

- [ ] 增量索引（仅更新变化的文件）
- [ ] 性能监控仪表板
- [ ] GitHub OAuth 认证
- [ ] 多语言支持（i18n）
- [ ] 自定义提示词模板
- [ ] 对话导出为 Markdown
- [ ] 批量问答 API

---

## 🤝 贡献指南

欢迎贡献！改进方向：

- [ ] 支持私有仓库
- [ ] 更多 LLM 提供商（Claude、Gemini 等）
- [ ] 高级筛选（按文件类型、作者等）
- [ ] 对话历史持久化
- [ ] 移动应用

---

## 📚 参考资源

- [LangChain.js 文档](https://js.langchain.com/)
- [Pinecone 向量数据库](https://www.pinecone.io/)
- [OpenAI API 参考](https://platform.openai.com/docs/api-reference)
- [RAG 最佳实践](https://docs.llamaindex.ai/en/stable/optimizing/production_rag/)

---

## 📝 许可证

MIT

---

## 👨‍💻 作者

作为 AI Agent 学习项目开发，用于掌握 RAG、LangChain 和生产级模式。

**有问题？** 提交 Issue 或查看 [CLAUDE.md](./app/code-chat/CLAUDE.md) 了解详细设计文档。

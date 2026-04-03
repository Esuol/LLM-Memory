# 上下文压缩（Context Compression）

## 核心概念

从 Pinecone 检索到的 20 个候选文档中，用 LLM 的语义理解能力精选出最相关的 5 个，减少噪音、降低 Token 消耗。

---

## 完整流程

```
用户问题
  ↓
Query Condensation（改写问题，处理代词指代）
  ↓
HyDE（生成假设代码答案，用代码找代码）
  ↓
Pinecone 检索 → 20 个文档（粗筛）
  ↓
【压缩】LLM 评分 → 选出 5 个最相关的（精筛）
  ↓
拼接 5 个文档为上下文
  ↓
LLM 生成最终回答
```

---

## 压缩函数详解

### 函数签名
```typescript
async function compressContext(
  llm: ChatOpenAI,
  question: string,
  docs: Document[],
  topK: number = 5
): Promise<Document[]>
```

### 执行步骤

#### 1. 快速路径（第 80-82 行）
```typescript
if (docs.length <= topK) {
  return docs;  // 文档数 ≤ 5，无需压缩
}
```

#### 2. 提取预览（第 85-92 行）
```typescript
const candidates = docs
  .slice(0, 20)  // 只评估前 20 个
  .map((d, i) => {
    const file = (d.metadata?.file as string) || "unknown";
    const preview = d.pageContent.slice(0, 200).replace(/\s+/g, " ").trim();
    return `${i + 1}. [${file}] ${preview}...`;
  })
  .join("\n");
```

**输出示例：**
```
1. [app/api/chat.ts] export async function chatWithRepo(question: string, namespace: string, history: ChatHistoryPair[], opts?: { onChunk?: (token: string) => void; onSources?: (sources: SourceItem[]) => void; }) { const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! }); const indexName = process.env.PINECONE_CODE_CHAT_INDEX_NAME || "code-search"; ...
2. [app/code-chat/api/utils.ts] export function createSseResponse(handler: (ctx: { send: (data: unknown) => void }) => Promise<void>): Response { const encoder = new TextEncoder(); const stream = new ReadableStream({ async start(controller) { const send = (data: unknown) => { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }; ...
```

#### 3. LLM 评分（第 95-106 行）
```typescript
const resp = await llm.invoke([
  {
    role: "system",
    content: `你是代码检索助手。给定问题和多个代码片段，请选出最直接回答问题的 ${topK} 个片段。
只输出片段编号，按相关性从高到低排序，用逗号分隔。例如：3,1,5,2,4
不要解释，不要多余的字。`
  },
  {
    role: "user",
    content: `问题：${question}\n\n候选片段：\n${candidates}\n\n输出编号：`
  }
]);
```

**LLM 输出示例：** `3,1,5,2,4`

#### 4. 解析编号（第 109-120 行）
```typescript
const text = typeof resp.content === "string" ? resp.content : "";
const nums = text.match(/\d+/g)?.map((n) => Number.parseInt(n, 10)) ?? [];

const selected: number[] = [];
for (const n of nums) {
  if (!Number.isFinite(n)) continue;
  if (n < 1 || n > docs.length) continue;
  if (selected.includes(n)) continue;
  selected.push(n);
  if (selected.length >= topK) break;
}
```

**处理逻辑：**
- 提取所有数字
- 去重 + 范围检查
- 保留前 topK 个

#### 5. 降级处理（第 123-125 行）
```typescript
if (selected.length === 0) {
  return docs.slice(0, topK);  // LLM 输出有问题，直接取前 topK 个
}
```

#### 6. 返回结果（第 128-131 行）
```typescript
return selected
  .map((idx) => docs[idx - 1])
  .filter(Boolean)
  .slice(0, topK);
```

---

## 集成到问答流程

### 调用位置（chat.ts 第 275-276 行）
```typescript
const compressedDocuments = await compressContext(
  llm,
  standaloneQuestion,
  sourceDocuments,  // 20 个文档
  5                 // 只保留 5 个
);
```

### 使用压缩结果（第 279-282 行）
```typescript
const context = compressedDocuments
  .map((d) => d.pageContent)
  .join("\n\n---\n\n");

const sources = dedupeSources(compressedDocuments);
opts?.onSources?.(sources);
```

---

## 性能对比

| 指标 | 无压缩 | 有压缩 |
|------|--------|--------|
| 上下文文档数 | 20 | 5 |
| 平均 Token 数 | ~8000 | ~2000 |
| API 成本 | 100% | ~25% |
| 回答质量 | 中（噪音多） | 高（精准） |
| 额外 LLM 调用 | 0 | 1 次评分 |

---

## 设计考虑

### 为什么用 LLM 评分而不是向量相似度？

| 方案 | 优点 | 缺点 |
|------|------|------|
| 向量相似度 | 快速、无额外成本 | 无法理解语义关联（如"这个函数的调用者"） |
| LLM 评分 | 理解上下文、语义准确 | 多一次 LLM 调用（成本 +1%） |

**选择 LLM 评分的原因：** 回答质量提升 > 成本增加

### 为什么只保留 5 个？

- **太少（1-2 个）：** 信息不足，LLM 无法全面回答
- **太多（10-20 个）：** 噪音多，LLM 容易混淆
- **5 个：** 平衡点，通常包含完整的上下文

### 为什么有降级处理？

LLM 可能输出格式错误（如 `"3, 1, 5"` 或 `"第 3 个"`），降级到直接取前 topK 个确保不会失败。

---

## 扩展方向

### 1. 动态 topK
```typescript
// 根据问题复杂度调整保留数量
const topK = question.length > 100 ? 7 : 5;
```

### 2. 多轮评分
```typescript
// 第一轮：20 → 10
// 第二轮：10 → 5
```

### 3. 评分权重
```typescript
// 考虑文件重要性（如 core/ 目录权重更高）
```

---

## 总结

压缩逻辑是 **RAG 质量优化的关键一环**：
- ✅ 减少噪音（精选最相关的文档）
- ✅ 降低成本（减少 Token 消耗）
- ✅ 提升质量（LLM 专注于核心信息）

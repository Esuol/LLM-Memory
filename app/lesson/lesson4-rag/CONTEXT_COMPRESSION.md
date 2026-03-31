# 上下文压缩（Context Compression）

## 问题：上下文过长

**场景：**
```
检索到 5 个文档，每个 500 字 = 2500 字
加上问题和系统提示 = 3000+ tokens
LLM 输入成本：$0.003（gpt-4o-mini）
```

**问题：**
- 检索到的文档包含大量无关信息
- Token 消耗高，成本增加
- 上下文过长影响生成质量（注意力分散）
- 可能超出模型上下文窗口限制

## 解决方案：Context Compression

**Context Compression = 保留相关信息 + 删除无关内容**

```
原始检索结果（2500 字）
    ↓
上下文压缩
    ↓
压缩后上下文（800 字）
    ↓
传给 LLM 生成答案
```

## 压缩策略

### 1. 提取式压缩（Extractive）

**原理：** 提取与问题最相关的句子/段落

```typescript
async function extractiveCompress(
  query: string,
  docs: string[],
  maxSentences = 3
): Promise<string[]> {
  const compressed: string[] = [];

  for (const doc of docs) {
    // 1. 分句
    const sentences = doc.split(/[。！？]/);

    // 2. 计算每句与问题的相关性
    const scored = sentences.map(sent => ({
      text: sent,
      score: keywordScore(query, sent)
    }));

    // 3. 取 Top N 句
    scored.sort((a, b) => b.score - a.score);
    const topSentences = scored
      .slice(0, maxSentences)
      .map(s => s.text)
      .join('。');

    compressed.push(topSentences);
  }

  return compressed;
}
```

**优势：**
- 快速，无需 LLM 调用
- 保留原文表述
- 可控（指定保留句数）

**劣势：**
- 可能丢失上下文连贯性
- 无法理解语义（仅基于关键词）

### 2. LLM 压缩（Abstractive）

**原理：** 用 LLM 重写文档，只保留相关信息

```typescript
async function llmCompress(
  query: string,
  doc: string
): Promise<string> {
  const prompt = `提取以下文档中与问题相关的信息，用简洁的语言重写（100字以内）。

问题：${query}

文档：
${doc}

相关信息：`;

  const response = await fetch(
    `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    }
  );

  const data = await response.json();
  return data.choices[0].message.content.trim();
}
```

**优势：**
- 理解语义，保留关键信息
- 重写后更简洁
- 保持连贯性

**劣势：**
- 成本高（每个文档都要调用 LLM）
- 速度慢
- 可能引入幻觉（LLM 改写错误）

### 3. 相关性过滤（Relevance Filtering）

**原理：** 只保留相关性分数高于阈值的文档

```typescript
async function relevanceFilter(
  query: string,
  docs: string[],
  threshold = 0.7
): Promise<string[]> {
  const filtered: string[] = [];

  for (const doc of docs) {
    // 计算相关性（可以用 embedding 相似度或 LLM 评分）
    const relevance = await calculateRelevance(query, doc);

    if (relevance >= threshold) {
      filtered.push(doc);
    }
  }

  return filtered;
}

async function calculateRelevance(
  query: string,
  doc: string
): Promise<number> {
  const queryEmb = await getEmbedding(query);
  const docEmb = await getEmbedding(doc);

  // 余弦相似度
  return cosineSimilarity(queryEmb, docEmb);
}
```

**优势：**
- 简单直接
- 过滤掉低相关性文档

**劣势：**
- 阈值难以确定
- 可能过滤掉有用信息

## LangChain 实现

```typescript
import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";
import { LLMChainExtractor } from "langchain/retrievers/document_compressors/chain_extract";
import { ChatOpenAI } from "@langchain/openai";

// 1. 创建压缩器
const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
});

const compressor = LLMChainExtractor.fromLLM(llm);

// 2. 创建压缩检索器
const compressionRetriever = new ContextualCompressionRetriever({
  baseCompressor: compressor,
  baseRetriever: vectorStoreRetriever,
});

// 3. 使用
const compressedDocs = await compressionRetriever.getRelevantDocuments(
  "Next.js 16 的性能提升"
);
```

## 混合策略

**推荐：提取式 + LLM 压缩**

```typescript
async function hybridCompress(
  query: string,
  docs: string[],
  targetLength = 500
): Promise<string[]> {
  // 1. 提取式压缩（快速过滤）
  const extracted = await extractiveCompress(query, docs, 5);

  // 2. 检查长度
  const totalLength = extracted.join('').length;

  if (totalLength <= targetLength) {
    return extracted;
  }

  // 3. LLM 压缩（精细压缩）
  const compressed = await Promise.all(
    extracted.map(doc => llmCompress(query, doc))
  );

  return compressed;
}
```

**优势：**
- 两阶段压缩，平衡速度和质量
- 先快速过滤，再精细压缩
- 成本可控（只对候选文档调用 LLM）

## 效果对比

**测试问题："Next.js 16 的性能提升体现在哪些方面？"**

| 方法 | 原始 Tokens | 压缩后 Tokens | 压缩比 | 成本 | 质量 |
|------|------------|--------------|--------|------|------|
| 无压缩 | 3000 | 3000 | 0% | 高 | 中（噪音多） |
| 提取式 | 3000 | 1200 | 60% | 低 | 中+ |
| LLM 压缩 | 3000 | 800 | 73% | 中 | 高 |
| 混合策略 | 3000 | 900 | 70% | 中- | 高 |

**压缩的价值：**
- 降低 LLM 输入成本（70% token 减少）
- 提升生成质量（减少噪音）
- 避免超出上下文窗口

## 实现要点

### 1. 压缩时机

```
检索（Top 10）
    ↓
重排序（Top 5）
    ↓
上下文压缩（压缩到目标长度）
    ↓
传给 LLM
```

### 2. 目标长度设置

```typescript
// 根据模型上下文窗口和任务需求设置
const targetLength = {
  'gpt-4o-mini': 2000,      // 128k 窗口，留足够空间给输出
  'gpt-4o': 4000,           // 128k 窗口
  'claude-3-sonnet': 3000   // 200k 窗口
};
```

### 3. 压缩比控制

```typescript
// 动态调整压缩比
function getCompressionRatio(docLength: number): number {
  if (docLength < 500) return 0;      // 短文档不压缩
  if (docLength < 1000) return 0.3;   // 中等文档压缩 30%
  return 0.7;                         // 长文档压缩 70%
}
```

### 4. 质量保证

```typescript
// 压缩后验证
function validateCompression(
  original: string,
  compressed: string,
  query: string
): boolean {
  // 1. 检查长度
  if (compressed.length > original.length) {
    return false;
  }

  // 2. 检查关键词保留
  const queryWords = query.toLowerCase().split(/\s+/);
  const compressedLower = compressed.toLowerCase();

  const preserved = queryWords.filter(word =>
    compressedLower.includes(word)
  ).length;

  // 至少保留 80% 的查询关键词
  return preserved / queryWords.length >= 0.8;
}
```

## 成本分析

**场景：** 每天 1000 次查询，每次检索 5 个文档（每个 500 字）

| 方法 | Token/查询 | 成本/查询 | 月成本 |
|------|-----------|----------|--------|
| 无压缩 | 3000 | $0.003 | $90 |
| 提取式 | 1200 | $0.0012 | $36 |
| LLM 压缩 | 800 + 压缩成本 | $0.0008 + $0.002 | $84 |
| 混合策略 | 900 + 压缩成本 | $0.0009 + $0.001 | $57 |

**推荐：** 混合策略（平衡成本和质量）

## 优化方向

### 1. 缓存压缩结果

```typescript
const compressionCache = new Map<string, string>();

async function cachedCompress(
  query: string,
  doc: string
): Promise<string> {
  const key = `${query}:${doc.slice(0, 100)}`;

  if (compressionCache.has(key)) {
    return compressionCache.get(key)!;
  }

  const compressed = await llmCompress(query, doc);
  compressionCache.set(key, compressed);

  return compressed;
}
```

### 2. 批量压缩

```typescript
// 一次 LLM 调用压缩多个文档
async function batchCompress(
  query: string,
  docs: string[]
): Promise<string[]> {
  const prompt = `提取以下文档中与问题相关的信息。

问题：${query}

${docs.map((doc, i) => `文档${i + 1}：\n${doc}`).join('\n\n')}

请为每个文档提取相关信息（每个100字以内），用 --- 分隔：`;

  const response = await llm.invoke(prompt);
  return response.split('---').map(s => s.trim());
}
```

### 3. 自适应压缩

```typescript
// 根据文档相关性动态调整压缩强度
async function adaptiveCompress(
  query: string,
  doc: string,
  relevance: number
): Promise<string> {
  if (relevance > 0.9) {
    // 高相关性：轻度压缩
    return extractiveCompress(query, [doc], 5)[0];
  } else if (relevance > 0.7) {
    // 中等相关性：中度压缩
    return llmCompress(query, doc);
  } else {
    // 低相关性：重度压缩或过滤
    return '';
  }
}
```

## 下一步

已完成：
1. ✅ 文档切分（Chunking）
2. ✅ 向量数据库（Pinecone）
3. ✅ 混合搜索（Hybrid Search）
4. ✅ Chunk 检索问题解决
5. ✅ 重排序（Reranking）
6. ✅ 元数据过滤（Metadata Filtering）
7. ✅ 多查询（Multi-Query）
8. ✅ HyDE（Hypothetical Document Embeddings）
9. ✅ 上下文压缩（Context Compression）

待学习：
10. 引用溯源（Citation）- 标注来源

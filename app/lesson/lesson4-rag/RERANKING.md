# 重排序（Reranking）

## 问题：向量搜索的局限

**场景：**
```
知识库：
- Doc 0: "Next.js 16 发布于 2024年12月，带来了重大性能提升..."
- Doc 1: "React 19 引入了 Server Components，改变了组件渲染方式..."
- Doc 2: "Tailwind CSS v4 使用 Rust 引擎，编译速度提升 10 倍..."

用户问题："Next.js 16 的性能提升体现在哪些方面？"

向量搜索结果（Top 3）：
1. Doc 0 (score: 0.85) - 包含 "Next.js 16" 和 "性能提升"
2. Doc 2 (score: 0.72) - 包含 "性能提升" 和 "速度提升"
3. Doc 1 (score: 0.68) - 包含 "组件" 相关内容
```

**问题：**
- Doc 2 虽然提到"性能提升"，但是关于 Tailwind CSS，不是 Next.js
- 向量搜索只看语义相似度，不理解"Next.js 16 的性能"这个精确意图
- 需要更精细的相关性判断

## 解决方案：Reranking

**Reranking = 二次排序**

```
第一阶段（向量搜索）：
- 快速召回候选集（Top 10-20）
- 使用 embedding 相似度
- 速度快，但精度有限

第二阶段（Reranking）：
- 精细评分候选集
- 使用更强的模型（Cross-Encoder）
- 速度慢，但精度高

最终返回：Top K（如 Top 3）
```

## Reranking 模型对比

### 1. Cross-Encoder（推荐）

**原理：**
```
Bi-Encoder（向量搜索）：
query → [embedding] → 768 维向量
doc   → [embedding] → 768 维向量
相似度 = cosine(query_vec, doc_vec)

Cross-Encoder（Reranking）：
[query + doc] → [模型] → 相关性分数 (0-1)
```

**优势：**
- 同时处理 query 和 doc，捕捉交互信息
- 精度更高（理解"Next.js 16 的性能"这个整体意图）

**劣势：**
- 速度慢（每个 query-doc 对都要过一次模型）
- 不能预计算（必须在查询时计算）

**常用模型：**
- `cross-encoder/ms-marco-MiniLM-L-6-v2` - 轻量级
- `BAAI/bge-reranker-base` - 中文支持
- `jina-reranker-v1-base-en` - Jina AI

### 2. LLM Reranking

**原理：**
```
Prompt:
给定问题和文档，评分 0-10 表示相关性。

问题：Next.js 16 的性能提升体现在哪些方面？

文档 1：Next.js 16 发布于 2024年12月，带来了重大性能提升...
评分：

模型输出：9
```

**优势：**
- 理解能力最强
- 可以解释评分原因

**劣势：**
- 成本高（每个 doc 都要调用 LLM）
- 速度慢

### 3. Cohere Rerank API（云服务）

**原理：**
```typescript
import { CohereClient } from 'cohere-ai';

const cohere = new CohereClient({ apiKey: 'xxx' });

const results = await cohere.rerank({
  query: "Next.js 16 的性能提升",
  documents: [doc0, doc1, doc2],
  topN: 3,
  model: 'rerank-english-v2.0'
});
```

**优势：**
- 零部署，开箱即用
- 性能优化好

**劣势：**
- 需要付费
- 数据传输到外部服务

## 实现：简化版 LLM Reranking

```typescript
// ==================== Reranking ====================

async function rerank(query: string, docs: string[], topK = 2): Promise<string[]> {
  const prompt = `评分以下文档与问题的相关性（0-10）。只返回数字，用逗号分隔。

问题：${query}

${docs.map((doc, i) => `文档${i + 1}：${doc.slice(0, 100)}...`).join('\n\n')}

评分（格式：8,6,9）：`;

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
  const scoresText = data.choices[0].message.content.trim();
  const scores = scoresText.split(',').map((s: string) => parseFloat(s.trim()));

  // 按分数排序
  const ranked = docs
    .map((doc, i) => ({ doc, score: scores[i] || 0 }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, topK).map(r => r.doc);
}

// 修改 retrieve 函数
async function retrieve(query: string, topK = 2): Promise<string[]> {
  const index = await initVectorDB();
  const queryEmbedding = await getEmbedding(query);

  // 1. 向量搜索（取 topK * 3 作为候选）
  const results = await index.query({
    vector: queryEmbedding,
    topK: topK * 3,
    includeMetadata: true,
  });

  // 2. 混合评分
  const hybridScores = results.matches?.map((match) => {
    const fullText = match.metadata?.fullText as string;
    const text = match.metadata?.text as string;
    const vectorScore = match.score || 0;
    const kwScore = keywordScore(query, text);

    return {
      fullText,
      score: 0.7 * vectorScore + 0.3 * kwScore,
    };
  }) || [];

  hybridScores.sort((a, b) => b.score - a.score);

  // 3. 去重
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const item of hybridScores) {
    if (!seen.has(item.fullText)) {
      seen.add(item.fullText);
      candidates.push(item.fullText);
    }
  }

  // 4. Reranking（精细排序）
  const reranked = await rerank(query, candidates, topK);

  return reranked;
}
```

## 效果对比

**测试问题："Next.js 16 的性能提升体现在哪些方面？"**

| 方法 | Top 1 结果 | 准确性 |
|------|-----------|--------|
| 纯向量搜索 | Doc 2 (Tailwind CSS) | ❌ 语义相似但主题错误 |
| 混合搜索 | Doc 0 (Next.js 16) | ✅ 主题正确 |
| Reranking | Doc 0 (Next.js 16) | ✅ 主题正确 + 精确匹配 |

**Reranking 的价值：**
- 过滤掉"看起来相关但实际不相关"的文档
- 理解问题的精确意图（"Next.js 16 的性能"而非"性能"）
- 提升最终答案质量

## 性能与成本权衡

| 方法 | 速度 | 成本 | 精度 | 适用场景 |
|------|------|------|------|----------|
| 纯向量搜索 | 快 | 低 | 中 | 通用问答 |
| 混合搜索 | 快 | 低 | 中+ | 专有名词、数字 |
| Cross-Encoder | 中 | 中 | 高 | 生产环境 |
| LLM Reranking | 慢 | 高 | 最高 | 高价值场景 |

**推荐策略：**
```
向量搜索（召回 Top 20）
    ↓
混合搜索（重排到 Top 10）
    ↓
Cross-Encoder Reranking（精排到 Top 3）
    ↓
返回给 LLM 生成答案
```

## 实现要点

1. **候选集大小**
   - 向量搜索：`topK * 3` 或 `topK * 5`
   - Reranking 输入越多，效果越好（但成本也越高）

2. **Reranking 时机**
   - 在去重之后（避免重复评分）
   - 在返回给 LLM 之前（最后一道质量关）

3. **成本控制**
   - LLM Reranking：只对候选集评分，不要对所有文档
   - Cross-Encoder：可以本地部署，无 API 成本

4. **Prompt 设计**
   - 明确评分标准（0-10）
   - 只返回数字（避免解析错误）
   - Temperature = 0（确保稳定性）

## 下一步

已完成：
1. ✅ 文档切分（Chunking）
2. ✅ 向量数据库（Pinecone）
3. ✅ 混合搜索（Hybrid Search）
4. ✅ Chunk 检索问题解决
5. ✅ 重排序（Reranking）

待学习：
6. 元数据过滤（Metadata Filtering）- 结构化查询
7. 多查询（Multi-Query）- 查询改写
8. 上下文压缩（Context Compression）- 减少 token
9. 引用溯源（Citation）- 标注来源

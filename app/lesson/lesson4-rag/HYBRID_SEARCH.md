# 混合搜索（Hybrid Search）

## 问题：纯向量搜索的局限

**场景 1：精确匹配失败**
```
知识库：
- "Next.js 16 发布于 2024年12月"
- "React 19 引入了 Server Components"

用户问题："Next.js 16"
向量搜索结果：可能返回 React 相关内容（语义相似但不精确）
```

**场景 2：专有名词**
```
知识库：
- "GPT-4 是 OpenAI 的模型"
- "Claude 是 Anthropic 的模型"

用户问题："GPT-4"
向量搜索：可能混淆 GPT-4 和 Claude（都是 AI 模型）
```

**场景 3：数字和日期**
```
用户问题："2024年12月发布的是什么？"
向量搜索：对时间信息不敏感
```

## 解决方案：混合搜索

**混合搜索 = 向量搜索 + 关键词搜索**

```
向量搜索（语义）：理解意图，找相关内容
关键词搜索（精确）：匹配专有名词、数字、日期

最终结果 = 两者加权融合
```

## 实现方式

### 方式 1：BM25 + 向量搜索

**BM25**（Best Matching 25）：经典关键词搜索算法

```typescript
import { BM25 } from 'bm25';

// 1. 构建 BM25 索引
const bm25 = new BM25(documentChunks.map(c => c.content));

// 2. 关键词搜索
const keywordScores = bm25.search(query);

// 3. 向量搜索
const vectorResults = await index.query({
  vector: queryEmbedding,
  topK: 10,
});

// 4. 融合（加权）
const hybridScores = vectorResults.matches.map((match, i) => ({
  ...match,
  score: 0.7 * match.score + 0.3 * keywordScores[i]
}));
```

### 方式 2：Pinecone Sparse-Dense（推荐）

Pinecone 原生支持混合搜索：

```typescript
// 1. 生成稀疏向量（关键词）
const sparseVector = generateSparseVector(query); // BM25 或 SPLADE

// 2. 混合查询
const results = await index.query({
  vector: denseEmbedding,        // 密集向量（语义）
  sparseVector: sparseVector,    // 稀疏向量（关键词）
  topK: 5,
  alpha: 0.7,                    // 权重：0.7 语义 + 0.3 关键词
});
```

## 关键概念

### 1. 密集向量 vs 稀疏向量

**密集向量（Dense Vector）：**
```
[0.23, 0.45, 0.12, ..., 0.89]  // 1536 维，每个值都有意义
用途：语义搜索
```

**稀疏向量（Sparse Vector）：**
```
{
  "Next.js": 0.8,
  "16": 0.6,
  "发布": 0.4
}
// 只存储关键词及其权重
用途：关键词匹配
```

### 2. 融合策略

**线性加权：**
```
final_score = α × vector_score + (1-α) × keyword_score
```

**倒数排名融合（RRF）：**
```
final_score = 1/(k + rank_vector) + 1/(k + rank_keyword)
```

### 3. Alpha 参数

```
α = 1.0  → 纯向量搜索（语义）
α = 0.7  → 70% 语义 + 30% 关键词（推荐）
α = 0.5  → 平衡
α = 0.0  → 纯关键词搜索
```

## 实现：简化版混合搜索

```typescript
// 关键词匹配分数
function keywordScore(query: string, text: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();

  let matches = 0;
  for (const word of queryWords) {
    if (textLower.includes(word)) {
      matches++;
    }
  }

  return matches / queryWords.length;
}

// 混合检索
async function hybridRetrieve(query: string, topK = 2): Promise<string[]> {
  const index = await initVectorDB();
  const queryEmbedding = await getEmbedding(query);

  // 1. 向量搜索（取 topK * 2）
  const vectorResults = await index.query({
    vector: queryEmbedding,
    topK: topK * 2,
    includeMetadata: true,
  });

  // 2. 计算关键词分数
  const hybridScores = vectorResults.matches?.map((match) => {
    const text = match.metadata?.text as string;
    const vectorScore = match.score || 0;
    const kwScore = keywordScore(query, text);

    return {
      text,
      score: 0.7 * vectorScore + 0.3 * kwScore, // 70% 语义 + 30% 关键词
    };
  }) || [];

  // 3. 重新排序
  hybridScores.sort((a, b) => b.score - a.score);

  return hybridScores.slice(0, topK).map((s) => s.text);
}
```

## 效果对比

**测试问题："Next.js 16 什么时候发布？"**

| 方法 | Top 1 结果 | 准确性 |
|------|-----------|--------|
| 纯向量 | "React 19 引入了..." | ❌ 语义相似但不精确 |
| 纯关键词 | "Next.js 16 发布于..." | ✅ 精确但可能遗漏相关内容 |
| 混合搜索 | "Next.js 16 发布于..." | ✅ 精确 + 语义兼顾 |

## 适用场景

**使用混合搜索：**
- ✅ 专有名词（产品名、人名、地名）
- ✅ 数字和日期
- ✅ 代码搜索（函数名、变量名）
- ✅ 法律文档（精确条款）

**纯向量搜索足够：**
- ✅ 通用问答
- ✅ 语义理解
- ✅ 跨语言搜索

## 下一步实现

我们将实现简化版混合搜索：
1. 向量搜索获取候选
2. 关键词匹配计算分数
3. 加权融合重排序

准备好了吗？

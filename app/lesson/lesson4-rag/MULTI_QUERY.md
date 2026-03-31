# 多查询（Multi-Query）

## 问题：单一查询的局限

**场景：**
```
知识库：
- Doc 0: "Next.js 16 发布于 2024年12月，带来了重大性能提升..."
- Doc 1: "React 19 引入了 Server Components，改变了组件渲染方式..."
- Doc 2: "Tailwind CSS v4 使用 Rust 引擎，编译速度提升 10 倍..."

用户问题："Next.js 16 有啥新东西？"
向量搜索：只用这一个查询去检索
```

**问题：**
- 用户表达不精确（"有啥新东西" vs "新特性"）
- 可能遗漏相关文档（如果文档用"功能"而非"新东西"）
- 单一视角，召回率低

## 解决方案：Multi-Query

**Multi-Query = 查询改写 + 多角度检索**

```
原始问题："Next.js 16 有啥新东西？"
    ↓
查询改写（生成多个变体）
    ↓
Query 1: "Next.js 16 新特性"
Query 2: "Next.js 16 更新内容"
Query 3: "Next.js 16 功能改进"
    ↓
并行检索（每个 query 独立检索）
    ↓
结果合并 + 去重
    ↓
返回 Top K
```

## 查询改写策略

### 1. 同义词替换

```
原始："Next.js 16 有啥新东西？"
改写：
- "Next.js 16 新特性"
- "Next.js 16 新功能"
- "Next.js 16 更新"
```

### 2. 视角转换

```
原始："Next.js 16 性能怎么样？"
改写：
- "Next.js 16 性能提升"（正面）
- "Next.js 16 速度优化"（具体）
- "Next.js 16 性能对比"（对比）
```

### 3. 细化/泛化

```
原始："Next.js 16 的 Server Components"
细化：
- "Next.js 16 Server Components 使用方法"
- "Next.js 16 Server Components 性能"

泛化：
- "Next.js 16 新特性"
- "Next.js 服务端渲染"
```

### 4. 补充上下文

```
原始："性能提升"
改写：
- "Next.js 16 性能提升"（补充主题）
- "2024年 Next.js 性能提升"（补充时间）
```

## 实现：LLM 驱动的查询改写

```typescript
// ==================== Multi-Query ====================

async function expandQuery(query: string, numQueries = 3): Promise<string[]> {
  const prompt = `将用户问题改写为 ${numQueries} 个不同的查询，提升检索召回率。

要求：
1. 使用同义词替换
2. 从不同角度表达
3. 保持原意不变
4. 每行一个查询

原始问题：${query}

改写后的查询：`;

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
        temperature: 0.7,  // 稍高的 temperature 增加多样性
      }),
    }
  );

  const data = await response.json();
  const text = data.choices[0].message.content.trim();

  // 解析查询列表
  const queries = text
    .split('\n')
    .map(line => line.replace(/^\d+\.\s*/, '').trim())
    .filter(q => q.length > 0);

  // 包含原始查询
  return [query, ...queries];
}

// 修改检索函数
async function retrieve(query: string, topK = 2): Promise<string[]> {
  const index = await initVectorDB();

  // 1. 查询改写
  const queries = await expandQuery(query);
  console.log('Expanded queries:', queries);

  // 2. 并行检索
  const allResults = await Promise.all(
    queries.map(async (q) => {
      const embedding = await getEmbedding(q);
      return await index.query({
        vector: embedding,
        topK: topK * 2,
        includeMetadata: true,
      });
    })
  );

  // 3. 合并结果（按 score 排序）
  const merged = allResults
    .flatMap(result => result.matches || [])
    .map(match => ({
      text: match.metadata?.text as string,
      score: match.score || 0,
    }));

  // 4. 去重（相同文本只保留最高分）
  const deduped = new Map<string, number>();
  for (const item of merged) {
    const existing = deduped.get(item.text);
    if (!existing || item.score > existing) {
      deduped.set(item.text, item.score);
    }
  }

  // 5. 排序并返回 Top K
  const sorted = Array.from(deduped.entries())
    .map(([text, score]) => ({ text, score }))
    .sort((a, b) => b.score - a.score);

  return sorted.slice(0, topK).map(item => item.text);
}
```

## 高级策略

### 1. HyDE（Hypothetical Document Embeddings）

**原理：** 生成假设性答案，用答案去检索

```typescript
async function hydeRetrieve(query: string, topK = 2): Promise<string[]> {
  // 1. 生成假设性答案
  const prompt = `假设你知道答案，请回答以下问题（200字以内）：

问题：${query}

答案：`;

  const response = await llm.invoke(prompt);
  const hypotheticalAnswer = response.trim();

  // 2. 用假设性答案去检索
  const embedding = await getEmbedding(hypotheticalAnswer);
  const results = await index.query({
    vector: embedding,
    topK,
    includeMetadata: true,
  });

  return results.matches?.map(m => m.metadata?.text as string) || [];
}
```

**优势：**
- 答案和文档的语义更接近（比问题更接近）
- 适合"如何做"类问题

**示例：**
```
问题："如何优化 Next.js 性能？"
假设答案："优化 Next.js 性能可以通过使用 Server Components、
启用增量静态生成、优化图片加载等方式..."

用假设答案检索 → 找到相关文档
```

### 2. 查询分解（Query Decomposition）

**原理：** 将复杂问题分解为多个子问题

```typescript
async function decompose(query: string): Promise<string[]> {
  const prompt = `将复杂问题分解为多个简单子问题：

问题：${query}

子问题（每行一个）：`;

  const response = await llm.invoke(prompt);
  return response.split('\n').filter(q => q.trim());
}

// 示例
const query = "Next.js 16 和 React 19 的性能对比";
const subQueries = await decompose(query);
// 输出：
// 1. Next.js 16 的性能特性
// 2. React 19 的性能特性
// 3. Next.js 16 和 React 19 的性能差异
```

### 3. 步进式检索（Step-back Prompting）

**原理：** 先问更宽泛的问题，再问具体问题

```typescript
async function stepBackRetrieve(query: string): Promise<string[]> {
  // 1. 生成更宽泛的问题
  const prompt = `将具体问题改写为更宽泛的问题：

具体问题：${query}

宽泛问题：`;

  const broadQuery = await llm.invoke(prompt);

  // 2. 先检索宽泛问题（获取背景知识）
  const broadDocs = await retrieve(broadQuery, 2);

  // 3. 再检索具体问题
  const specificDocs = await retrieve(query, 2);

  // 4. 合并
  return [...broadDocs, ...specificDocs];
}

// 示例
const query = "Next.js 16 的 Partial Prerendering 如何使用？";
const broadQuery = "Next.js 16 的渲染特性";
// 先获取背景知识，再获取具体用法
```

## 结果融合策略

### 1. 简单合并（当前实现）

```typescript
// 所有结果放在一起，按 score 排序
const merged = allResults.flatMap(r => r.matches);
merged.sort((a, b) => b.score - a.score);
```

### 2. 倒数排名融合（RRF）

```typescript
function reciprocalRankFusion(
  results: Array<Array<{text: string, score: number}>>,
  k = 60
): Array<{text: string, score: number}> {
  const scores = new Map<string, number>();

  for (const resultList of results) {
    resultList.forEach((item, rank) => {
      const rrf = 1 / (k + rank + 1);
      scores.set(item.text, (scores.get(item.text) || 0) + rrf);
    });
  }

  return Array.from(scores.entries())
    .map(([text, score]) => ({ text, score }))
    .sort((a, b) => b.score - a.score);
}
```

**优势：** 不依赖原始 score，更稳定

### 3. 加权融合

```typescript
// 原始查询权重更高
const weights = [0.5, 0.25, 0.25];  // 原始查询 50%，改写查询各 25%

const weighted = allResults.flatMap((result, i) =>
  result.matches.map(m => ({
    text: m.metadata?.text as string,
    score: (m.score || 0) * weights[i]
  }))
);
```

## 效果对比

**测试问题："Next.js 16 有啥新东西？"**

| 方法 | 召回文档数 | 相关性 |
|------|-----------|--------|
| 单一查询 | 2 | 中 |
| Multi-Query（3个） | 5 → 去重后 3 | 高 |
| HyDE | 2 | 最高 |

**Multi-Query 的价值：**
- 提升召回率（找到更多相关文档）
- 覆盖不同表达方式
- 降低对用户表达的依赖

## 成本与性能权衡

| 方法 | API 调用次数 | 成本 | 召回率 | 适用场景 |
|------|-------------|------|--------|----------|
| 单一查询 | 1 embedding | 低 | 中 | 精确查询 |
| Multi-Query（3个） | 1 LLM + 3 embedding | 中 | 高 | 通用场景 |
| HyDE | 1 LLM + 1 embedding | 中 | 最高 | "如何做"类问题 |
| 查询分解 | 1 LLM + N embedding | 高 | 高 | 复杂问题 |

**推荐策略：**
```
简单问题 → 单一查询
通用问题 → Multi-Query（3个）
复杂问题 → 查询分解
"如何做" → HyDE
```

## 实现要点

1. **查询数量**
   - 3-5 个最佳（太多增加成本，太少效果有限）
   - 包含原始查询

2. **Temperature 设置**
   - 查询改写：0.7（需要多样性）
   - HyDE：0.3（需要准确性）

3. **去重策略**
   - 相同文本只保留最高分
   - 或使用文本相似度去重（避免近似重复）

4. **并行执行**
   - 多个查询并行检索（提升速度）
   - 使用 `Promise.all`

## 下一步

已完成：
1. ✅ 文档切分（Chunking）
2. ✅ 向量数据库（Pinecone）
3. ✅ 混合搜索（Hybrid Search）
4. ✅ Chunk 检索问题解决
5. ✅ 重排序（Reranking）
6. ✅ 元数据过滤（Metadata Filtering）
7. ✅ 多查询（Multi-Query）

待学习：
8. 上下文压缩（Context Compression）- 减少 token
9. 引用溯源（Citation）- 标注来源

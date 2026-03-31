# 元数据过滤（Metadata Filtering）

## 问题：纯语义搜索的局限

**场景：**
```
知识库：
- Doc 0: "Next.js 16 发布于 2024年12月" (metadata: {year: 2024, category: "framework"})
- Doc 1: "Next.js 15 发布于 2024年5月" (metadata: {year: 2024, category: "framework"})
- Doc 2: "React 19 发布于 2024年4月" (metadata: {year: 2024, category: "library"})

用户问题："2024年发布的框架有哪些？"
纯语义搜索：返回所有 3 个文档（都包含"2024年发布"）
```

**问题：**
- 用户明确要求"框架"，但 React 是库（library）
- 需要结构化过滤：`year = 2024 AND category = "framework"`

## 解决方案：Metadata Filtering

**Metadata Filtering = 向量搜索 + 结构化查询**

```
传统数据库：
SELECT * FROM docs WHERE year = 2024 AND category = 'framework'

向量数据库：
向量搜索 + WHERE year = 2024 AND category = 'framework'
```

## Pinecone Metadata 查询

### 1. 存储 Metadata

```typescript
const vectors = await Promise.all(
  chunks.map(async (chunk, i) => ({
    id: `chunk_${i}`,
    values: await getEmbedding(chunk.content),
    metadata: {
      text: chunk.content,
      source: chunk.metadata.source,
      chunkIndex: chunk.metadata.chunkIndex,
      // 结构化字段
      year: 2024,
      category: "framework",
      author: "Vercel",
      tags: ["performance", "react"]
    },
  }))
);
```

### 2. 查询时过滤

```typescript
const results = await index.query({
  vector: queryEmbedding,
  topK: 5,
  includeMetadata: true,
  filter: {
    year: { $eq: 2024 },
    category: { $eq: "framework" }
  }
});
```

## Pinecone 过滤语法

### 比较操作符

```typescript
// 等于
filter: { year: { $eq: 2024 } }
filter: { year: 2024 }  // 简写

// 不等于
filter: { category: { $ne: "library" } }

// 大于/小于
filter: { year: { $gt: 2023 } }
filter: { year: { $gte: 2024 } }
filter: { year: { $lt: 2025 } }
filter: { year: { $lte: 2024 } }

// 包含（数组）
filter: { tags: { $in: ["performance", "react"] } }

// 不包含（数组）
filter: { tags: { $nin: ["deprecated"] } }
```

### 逻辑操作符

```typescript
// AND
filter: {
  $and: [
    { year: { $eq: 2024 } },
    { category: { $eq: "framework" } }
  ]
}

// OR
filter: {
  $or: [
    { category: { $eq: "framework" } },
    { category: { $eq: "library" } }
  ]
}

// 组合
filter: {
  $and: [
    { year: { $gte: 2024 } },
    {
      $or: [
        { category: "framework" },
        { category: "library" }
      ]
    }
  ]
}
```

## 实现：智能 Metadata 提取

```typescript
// ==================== Metadata 提取 ====================

interface DocMetadata {
  year?: number;
  month?: number;
  category?: string;
  tags?: string[];
}

function extractMetadata(text: string): DocMetadata {
  const metadata: DocMetadata = {};

  // 提取年份
  const yearMatch = text.match(/(\d{4})年/);
  if (yearMatch) {
    metadata.year = parseInt(yearMatch[1]);
  }

  // 提取月份
  const monthMatch = text.match(/(\d{1,2})月/);
  if (monthMatch) {
    metadata.month = parseInt(monthMatch[1]);
  }

  // 识别分类
  if (text.includes("Next.js") || text.includes("框架")) {
    metadata.category = "framework";
  } else if (text.includes("React") || text.includes("库")) {
    metadata.category = "library";
  } else if (text.includes("CSS") || text.includes("样式")) {
    metadata.category = "styling";
  }

  // 提取标签
  const tags: string[] = [];
  if (text.includes("性能") || text.includes("速度")) tags.push("performance");
  if (text.includes("Server Components")) tags.push("server-components");
  if (text.includes("Rust")) tags.push("rust");
  metadata.tags = tags;

  return metadata;
}

// 修改初始化
async function initVectorDB() {
  const index = pinecone.Index(indexName);
  const stats = await index.describeIndexStats();

  if (stats.totalRecordCount === 0) {
    const chunks = createChunks(rawDocuments);

    const vectors = await Promise.all(
      chunks.map(async (chunk, i) => {
        const docMetadata = extractMetadata(rawDocuments[chunk.metadata.source]);

        return {
          id: `chunk_${i}`,
          values: await getEmbedding(chunk.content),
          metadata: {
            text: chunk.content,
            source: chunk.metadata.source,
            chunkIndex: chunk.metadata.chunkIndex,
            ...docMetadata  // 添加提取的 metadata
          },
        };
      })
    );

    await index.upsert({ records: vectors });
  }

  return index;
}

// 修改检索函数
async function retrieve(
  query: string,
  topK = 2,
  filter?: Record<string, any>
): Promise<string[]> {
  const index = await initVectorDB();
  const queryEmbedding = await getEmbedding(query);

  const results = await index.query({
    vector: queryEmbedding,
    topK: topK * 2,
    includeMetadata: true,
    filter: filter  // 添加过滤条件
  });

  // ... 混合搜索逻辑
}
```

## 使用场景

### 1. 时间范围查询

```typescript
// "2024年发布的技术"
const results = await retrieve(query, 3, {
  year: { $eq: 2024 }
});

// "2023年之后的更新"
const results = await retrieve(query, 3, {
  year: { $gt: 2023 }
});
```

### 2. 分类过滤

```typescript
// "前端框架"
const results = await retrieve(query, 3, {
  category: { $eq: "framework" }
});

// "框架或库"
const results = await retrieve(query, 3, {
  $or: [
    { category: "framework" },
    { category: "library" }
  ]
});
```

### 3. 标签搜索

```typescript
// "性能相关的文档"
const results = await retrieve(query, 3, {
  tags: { $in: ["performance"] }
});

// "包含 React 但不包含 deprecated"
const results = await retrieve(query, 3, {
  $and: [
    { tags: { $in: ["react"] } },
    { tags: { $nin: ["deprecated"] } }
  ]
});
```

## LLM 驱动的过滤器生成

```typescript
async function generateFilter(query: string): Promise<Record<string, any> | undefined> {
  const prompt = `从用户问题中提取过滤条件，返回 JSON 格式。

支持的字段：
- year: 年份（数字）
- month: 月份（数字）
- category: 分类（"framework" | "library" | "styling"）
- tags: 标签（数组）

示例：
问题："2024年发布的框架"
输出：{"year": 2024, "category": "framework"}

问题："性能相关的 React 技术"
输出：{"tags": ["performance", "react"]}

问题：${query}
输出：`;

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
  const filterText = data.choices[0].message.content.trim();

  try {
    return JSON.parse(filterText);
  } catch {
    return undefined;
  }
}

// 使用
async function smartRetrieve(query: string, topK = 2): Promise<string[]> {
  const filter = await generateFilter(query);
  return retrieve(query, topK, filter);
}
```

## 效果对比

**测试问题："2024年发布的框架有哪些？"**

| 方法 | 结果 | 准确性 |
|------|------|--------|
| 纯语义搜索 | Next.js 16, Next.js 15, React 19 | ❌ 包含 React（库） |
| Metadata 过滤 | Next.js 16, Next.js 15 | ✅ 只返回框架 |

## 最佳实践

1. **Metadata 设计**
   - 字段要有明确语义（year, category, tags）
   - 避免嵌套过深（Pinecone 支持有限）
   - 使用标准化值（"framework" 而非 "前端框架"）

2. **过滤 vs 搜索**
   - 精确条件用过滤（year = 2024）
   - 模糊条件用搜索（"性能提升"）
   - 组合使用效果最佳

3. **性能优化**
   - 过滤在向量搜索之前执行（减少计算量）
   - 索引常用字段（Pinecone 自动优化）

4. **LLM 提取**
   - 用于复杂查询（"最近两年的前端技术"）
   - 需要 fallback（提取失败时不过滤）

## 下一步

已完成：
1. ✅ 文档切分（Chunking）
2. ✅ 向量数据库（Pinecone）
3. ✅ 混合搜索（Hybrid Search）
4. ✅ Chunk 检索问题解决
5. ✅ 重排序（Reranking）
6. ✅ 元数据过滤（Metadata Filtering）

待学习：
7. 多查询（Multi-Query）- 查询改写
8. 上下文压缩（Context Compression）- 减少 token
9. 引用溯源（Citation）- 标注来源

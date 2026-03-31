# HyDE 实现总结

## 已实现功能

在 `/api/rag-chat/route.ts` 中实现了 HyDE（Hypothetical Document Embeddings）检索。

## 核心改动

### 1. 生成假设性答案

```typescript
async function generateHypotheticalAnswer(query: string): Promise<string> {
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
        messages: [{ role: "user", content: `假设你知道答案，请简洁回答（100字以内）：\n\n${query}` }],
        temperature: 0.3,
      }),
    }
  );

  const data = await response.json();
  return data.choices[0].message.content.trim();
}
```

**关键参数：**
- `temperature: 0.3` - 较低温度确保答案准确性
- `100字以内` - 控制答案长度，避免过长

### 2. 修改检索流程

```typescript
async function retrieve(query: string, topK = 2): Promise<string[]> {
  const index = await initVectorDB();

  // 1. 生成假设性答案
  const hypotheticalAnswer = await generateHypotheticalAnswer(query);
  console.log('HyDE answer:', hypotheticalAnswer);

  // 2. 用假设性答案的 embedding 检索
  const queryEmbedding = await getEmbedding(hypotheticalAnswer);

  // 3. 向量搜索
  const results = await index.query({
    vector: queryEmbedding,
    topK: topK * 2,
    includeMetadata: true,
  });

  // ... 后续混合搜索和去重逻辑
}
```

## HyDE 工作原理

```
用户问题："Next.js 16 有什么新特性？"
    ↓
生成假设性答案：
"Next.js 16 引入了部分预渲染功能，允许在同一路由中混合静态和动态内容。
还优化了服务器组件性能，减少了客户端 JavaScript 包大小..."
    ↓
用假设性答案生成 embedding
    ↓
在向量数据库中检索
    ↓
返回最相关的真实文档
```

## 为什么 HyDE 有效？

1. **语义对齐**
   - 问题："Next.js 16 有什么新特性？"（疑问句）
   - 答案："Next.js 16 引入了..."（陈述句）
   - 文档："Next.js 16 引入了..."（陈述句）
   - **答案和文档的语义更接近**

2. **信息密度**
   - 问题通常简短、模糊
   - 假设性答案包含更多关键词和上下文
   - 提升检索精度

3. **消除歧义**
   - 问题："性能怎么样？"（缺少主语）
   - 假设答案："Next.js 16 的性能通过..."（补充主语）

## 测试方法

1. 删除并重建 Pinecone index（如果之前有数据）
2. 启动服务：`npm run dev`
3. 访问：http://localhost:3000/lesson/lesson4-rag
4. 测试问题：
   - "Next.js 16 有什么新特性？"
   - "React 19 的主要改进是什么？"
   - "Tailwind CSS v4 为什么更快？"

5. 查看控制台输出：
   ```
   HyDE answer: Next.js 16 引入了部分预渲染功能...
   hybridScores: [...]
   ```

## 效果对比

| 方法 | 检索方式 | 优势 | 适用场景 |
|------|---------|------|----------|
| 直接检索 | 用问题的 embedding | 简单快速 | 精确查询 |
| HyDE | 用假设答案的 embedding | 语义对齐 | "如何做"、"是什么" |

**示例：**
```
问题："如何优化 Next.js 性能？"

直接检索：
- embedding("如何优化 Next.js 性能？")
- 可能匹配到问题类文档

HyDE：
- 生成答案："可以通过使用 Server Components、启用增量静态生成..."
- embedding(答案)
- 更容易匹配到包含解决方案的文档
```

## 成本分析

每次查询：
- 1 次 LLM 调用（生成假设答案）：~100 tokens
- 1 次 embedding 调用：~50 tokens
- 总成本：约 $0.0001（使用 gpt-4o-mini）

**权衡：**
- 成本略高于直接检索
- 但召回质量显著提升
- 适合高价值查询场景

## 优化方向

1. **缓存假设答案**
   - 相同问题不重复生成
   - 使用 LRU 缓存

2. **混合策略**
   - 同时使用问题和假设答案检索
   - 结果融合

3. **动态选择**
   - "如何"、"是什么"类问题用 HyDE
   - 精确查询用直接检索

## 下一步

已完成 HyDE 实现，可以继续学习：
- 上下文压缩（Context Compression）
- 引用溯源（Citation）

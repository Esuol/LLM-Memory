# Pinecone 向量数据库实现总结

## 实现完成 ✅

成功将 RAG 系统从内存实现升级到 Pinecone 云端向量数据库。

## 核心改动

### 1. 依赖变更
```bash
npm uninstall chromadb
npm install @pinecone-database/pinecone
```

### 2. 初始化
```typescript
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const index = pinecone.index("rag-demo");
```

### 3. 数据上传
```typescript
// 生成 embedding + 上传
const vectors = await Promise.all(
  chunks.map(async (chunk, i) => ({
    id: `chunk_${i}`,
    values: await getEmbedding(chunk.content),
    metadata: { text: chunk.content, ...chunk.metadata },
  }))
);
await index.upsert({ records: vectors });
```

### 4. 查询
```typescript
// 向量搜索
const queryEmbedding = await getEmbedding(query);
const results = await index.query({
  vector: queryEmbedding,
  topK: 2,
  includeMetadata: true,
});
return results.matches?.map((match) => match.metadata?.text as string) || [];
```

## 对比：内存 vs Pinecone

| 维度 | 内存实现 | Pinecone |
|------|----------|----------|
| **持久化** | ❌ 重启丢失 | ✅ 云端永久存储 |
| **部署** | ❌ 需要本地服务 | ✅ 无需部署 |
| **性能** | O(n) 线性搜索 | O(log n) ANN |
| **扩展性** | ❌ 单机内存限制 | ✅ 支持亿级数据 |
| **维护** | ❌ 需要管理缓存 | ✅ 零维护 |

## 关键技术

### ANN（近似最近邻）
- Pinecone 使用 ANN 算法，查询速度比暴力搜索快 100 倍
- 准确率 95%+，性能与准确率的最佳平衡

### Metadata 存储
```typescript
metadata: {
  text: chunk.content,      // 原始文本
  source: docIndex,         // 来源文档
  chunkIndex: chunkIndex    // 块索引
}
```

### 首次初始化
- 检查 `totalRecordCount === 0`
- 只在空 Index 时上传数据
- 避免重复上传

## 环境配置

`.env.local`:
```
PINECONE_API_KEY=pcsk_xxx
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.v3.cm/v1
```

## Pinecone Index 配置

- **Name**: `rag-demo`
- **Dimensions**: `1536` (text-embedding-3-small)
- **Metric**: `cosine`
- **Plan**: Serverless (免费)

## 下一步学习

已完成：
1. ✅ 文档切分（Chunking）
2. ✅ 向量数据库（Pinecone）

待学习：
3. 混合搜索（Hybrid Search）- 向量 + 关键词
4. 重排序（Reranking）- 提升检索精度
5. 元数据过滤（Metadata Filtering）- 结构化查询
6. 多查询（Multi-Query）- 查询改写
7. 上下文压缩（Context Compression）- 减少 token
8. 引用溯源（Citation）- 标注来源

## 测试

启动服务：
```bash
npm run dev
```

访问：http://localhost:3000/lesson/lesson4-rag

测试问题：
- "Next.js 16 什么时候发布的？"
- "React 19 有什么新特性？"
- "Tailwind CSS v4 性能提升了多少？"

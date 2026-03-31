# Chunk 检索问题与解决方案

## 问题描述

**场景：**
```
原始文档：
- Doc 0: "Next.js 16 发布于 2024年12月，带来了重大性能提升..." (154 字符)
- Doc 1: "React 19 引入了 Server Components..." (177 字符)
- Doc 2: "Tailwind CSS v4 使用 Rust 引擎..." (158 字符)

切分后：
- Chunk 0: "Next.js 16 发布于 2024年12月，带来了重大性能提升。新版本引入了部分预渲染（Partial Prerendering）功能，允许在同一路由中混合静态和动态内容。此外，还优化了服务器组件的性能，减少了客户端 JavaScript 包的大小。开发体验也得到改善，包括更快的热重载和更好的错误提示。" (100 字符)
- Chunk 1: "了部分预渲染（Partial Prerendering）功能，允许在同一路由中混合静态和动态内容。此外，还优化了服务器组件的性能，减少了客户端 JavaScript 包的大小。开发体验也得到改善，包括更快的热重载和更好的错误提示。" (100 字符，overlap 20)
- ...共 7 个 chunks

用户问题："Next.js 16 什么时候发布？"
检索结果：返回 Chunk 0 的文本（100 字符）
```

**问题：**
- 用户期望看到完整文档，但只返回了 chunk 片段
- Chunk 可能在句子中间截断，语义不完整
- 多个 chunk 来自同一文档，造成重复

## 解决方案对比

### 方案 1：存储完整文档（推荐）✅

**实现：**
```typescript
metadata: {
  text: chunk.content,           // Chunk 文本（用于关键词匹配）
  source: chunk.metadata.source, // 原文档索引
  chunkIndex: chunk.metadata.chunkIndex,
  fullText: rawDocuments[chunk.metadata.source] // 完整原文
}
```

**检索时：**
```typescript
const hybridScores = results.matches?.map((match) => {
  const text = match.metadata?.text as string;
  const fullText = match.metadata?.fullText as string; // 取完整文档
  const vectorScore = match.score || 0;
  const kwScore = keywordScore(query, text);

  return {
    text,
    fullText,
    score: 0.7 * vectorScore + 0.3 * kwScore,
  };
}) || [];

// 去重：同一文档只返回一次
const seen = new Set<string>();
const uniqueDocs: string[] = [];

for (const item of hybridScores) {
  if (!seen.has(item.fullText) && uniqueDocs.length < topK) {
    seen.add(item.fullText);
    uniqueDocs.push(item.fullText);
  }
}

return uniqueDocs;
```

**优点：**
- ✅ 简单直接，一次查询即可
- ✅ 返回完整语义
- ✅ 自动去重

**缺点：**
- ❌ 存储冗余（每个 chunk 都存完整文档）
- ❌ 文档很大时（如 10MB PDF），metadata 会很大

**适用场景：**
- 文档较小（<10KB）
- 追求简单实现
- 存储成本不敏感

### 方案 2：合并相邻 Chunk

**实现：**
```typescript
// 检索后，找到相同 source 的所有 chunks
const chunksBySource = new Map<number, string[]>();

for (const match of results.matches) {
  const source = match.metadata?.source as number;
  const text = match.metadata?.text as string;

  if (!chunksBySource.has(source)) {
    chunksBySource.set(source, []);
  }
  chunksBySource.get(source)!.push(text);
}

// 合并每个文档的 chunks
const mergedDocs = Array.from(chunksBySource.values()).map(chunks =>
  chunks.join('')
);
```

**优点：**
- ✅ 存储效率高（无冗余）
- ✅ 可以返回部分文档（只合并检索到的 chunks）

**缺点：**
- ❌ 实现复杂（需要处理 chunk 顺序、overlap）
- ❌ 可能遗漏中间 chunks（如果只检索到 chunk 0 和 chunk 5）

**适用场景：**
- 文档很大（>100KB）
- 需要精确控制返回内容
- 存储成本敏感

### 方案 3：滑动窗口扩展

**实现：**
```typescript
// 检索到 chunk i 后，额外获取 chunk i-1 和 chunk i+1
async function expandContext(chunkId: string): Promise<string> {
  const [_, index] = chunkId.split('_');
  const i = parseInt(index);

  const prevChunk = await index.fetch([`chunk_${i-1}`]);
  const currChunk = await index.fetch([`chunk_${i}`]);
  const nextChunk = await index.fetch([`chunk_${i+1}`]);

  return [prevChunk, currChunk, nextChunk]
    .filter(c => c)
    .map(c => c.metadata.text)
    .join('');
}
```

**优点：**
- ✅ 存储效率高
- ✅ 提供更多上下文（比单个 chunk 更完整）

**缺点：**
- ❌ 需要额外查询（性能开销）
- ❌ 仍然不是完整文档

**适用场景：**
- 文档很大，但只需要局部上下文
- 问答场景（不需要完整文档）

## 实现选择

**当前实现：方案 1（存储完整文档）**

原因：
1. 文档较小（<200 字符）
2. 教学项目，追求简单清晰
3. Pinecone 免费版足够使用

**生产环境建议：**
- 小文档（<10KB）：方案 1
- 大文档（>100KB）：方案 2 或 3
- 混合场景：根据文档大小动态选择

## 关键要点

1. **Chunk 是检索单位，不是返回单位**
   - Chunk 用于提高检索精度（小粒度匹配）
   - 返回时需要重建完整语义

2. **去重很重要**
   - 同一文档的多个 chunks 可能都被检索到
   - 需要根据 `source` 或 `fullText` 去重

3. **Metadata 的作用**
   - 不仅存储元信息（source、chunkIndex）
   - 也可以存储重建所需的数据（fullText）

4. **存储 vs 计算的权衡**
   - 方案 1：存储换时间（冗余存储，快速检索）
   - 方案 2/3：时间换存储（额外计算/查询，节省空间）

## 下一步

已完成：
1. ✅ 文档切分（Chunking）
2. ✅ 向量数据库（Pinecone）
3. ✅ 混合搜索（Hybrid Search）
4. ✅ Chunk 检索问题解决

待学习：
5. 重排序（Reranking）- 提升检索精度
6. 元数据过滤（Metadata Filtering）- 结构化查询
7. 多查询（Multi-Query）- 查询改写
8. 上下文压缩（Context Compression）- 减少 token
9. 引用溯源（Citation）- 标注来源

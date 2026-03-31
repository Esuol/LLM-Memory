# 向量数据库（Vector Database）

## 为什么需要向量数据库？

**当前实现的问题：**
```typescript
// 内存中存储，服务重启后丢失
let chunkEmbeddings: number[][] | null = null;

// 每次启动都要重新计算所有 embedding
async function initChunkEmbeddings() {
  if (!chunkEmbeddings) {
    chunkEmbeddings = await Promise.all(
      documentChunks.map((chunk) => getEmbedding(chunk.content))
    );
  }
  return chunkEmbeddings;
}

// 线性搜索，O(n) 复杂度
const scores = documentChunks.map((chunk, i) => ({
  doc: chunk.content,
  score: cosineSimilarity(queryEmbedding, docEmbeddings[i]),
}));
```

**问题：**
1. **不持久化** - 服务重启后 embedding 丢失
2. **不可扩展** - 10 万条文档需要计算 10 万次余弦相似度
3. **无索引** - 线性搜索，性能随数据量线性下降
4. **无分布式** - 单机内存限制

## 向量数据库解决方案

### 核心能力

1. **持久化存储** - embedding 存储在磁盘/云端
2. **高效检索** - 使用 ANN（近似最近邻）算法，O(log n) 复杂度
3. **索引优化** - HNSW、IVF 等索引结构
4. **元数据过滤** - 支持混合查询（向量 + 结构化数据）
5. **分布式扩展** - 支持水平扩展

### 主流向量数据库对比

| 数据库 | 类型 | 优势 | 适用场景 |
|--------|------|------|----------|
| **Pinecone** | 云服务 | 零运维、高性能、易用 | 生产环境、快速上线 |
| **Chroma** | 开源、嵌入式 | 轻量、本地运行、免费 | 开发测试、小规模应用 |
| **Weaviate** | 开源、自托管 | 功能丰富、GraphQL API | 企业级、复杂查询 |
| **Qdrant** | 开源、Rust | 高性能、丰富过滤 | 高并发、大规模 |
| **Milvus** | 开源、分布式 | 超大规模、GPU 加速 | 亿级数据、AI 平台 |

## 实现：使用 Chroma（本地向量数据库）

### 为什么选 Chroma？
- ✅ 开源免费
- ✅ 本地运行，无需云服务
- ✅ Python/JS SDK 都支持
- ✅ 自动持久化
- ✅ 学习成本低

### 安装

```bash
npm install chromadb
```

### 代码实现

```typescript
import { ChromaClient } from 'chromadb';

const client = new ChromaClient();

// 1. 创建/获取集合
const collection = await client.getOrCreateCollection({
  name: "rag_documents",
  metadata: { "hnsw:space": "cosine" } // 使用余弦距离
});

// 2. 添加文档（自动生成 embedding）
await collection.add({
  ids: documentChunks.map((_, i) => `chunk_${i}`),
  documents: documentChunks.map(c => c.content),
  metadatas: documentChunks.map(c => c.metadata),
});

// 3. 查询（自动计算 query embedding + 相似度搜索）
const results = await collection.query({
  queryTexts: [question],
  nResults: 2,
});

// 返回最相关的文档
const relevantDocs = results.documents[0];
```

## 关键概念

### 1. ANN（Approximate Nearest Neighbor）

**精确搜索 vs 近似搜索：**
```
精确搜索（暴力）：
- 计算 query 与所有向量的距离
- 时间复杂度：O(n)
- 100% 准确

近似搜索（ANN）：
- 使用索引结构快速定位候选集
- 时间复杂度：O(log n)
- 95%+ 准确率
```

### 2. HNSW（Hierarchical Navigable Small World）

Chroma 默认使用的索引算法：
```
层级结构：
Level 2: [节点1] -------- [节点2]
Level 1: [节点1] -- [节点3] -- [节点2] -- [节点4]
Level 0: [节点1] - [节点3] - [节点5] - [节点2] - [节点4] - [节点6]

搜索过程：
1. 从顶层开始
2. 找到最近邻居
3. 下降到下一层
4. 重复直到底层
```

**优势：**
- 查询速度快：O(log n)
- 召回率高：95%+
- 支持增量更新

### 3. 持久化

```typescript
// Chroma 自动持久化到本地
const client = new ChromaClient({
  path: "./chroma_data" // 数据存储路径
});

// 服务重启后，数据依然存在
const collection = await client.getCollection({ name: "rag_documents" });
```

## 对比：内存 vs 向量数据库

| 维度 | 内存实现 | 向量数据库 |
|------|----------|-----------|
| **持久化** | ❌ 重启丢失 | ✅ 自动持久化 |
| **性能** | O(n) 线性搜索 | O(log n) ANN |
| **扩展性** | ❌ 单机内存限制 | ✅ 支持分布式 |
| **元数据过滤** | ❌ 需手动实现 | ✅ 原生支持 |
| **10 万文档查询** | ~100ms | ~5ms |
| **100 万文档查询** | ~1s | ~10ms |

## 下一步

**当前实现：**
```
用户问题 → 计算 embedding → 内存中线性搜索 → 返回 top-k
```

**升级到向量数据库：**
```
用户问题 → Chroma 自动处理 → 返回 top-k
```

**优势：**
1. 代码更简洁（Chroma 封装了 embedding + 搜索）
2. 性能更好（ANN 算法）
3. 数据持久化（重启不丢失）
4. 支持元数据过滤（下一个主题）

## 实战任务

1. 安装 Chroma：`npm install chromadb`
2. 启动 Chroma 服务：`docker run -p 8000:8000 chromadb/chroma`
3. 修改 `/api/rag-chat/route.ts` 使用 Chroma
4. 测试查询性能
5. 验证重启后数据依然存在

准备好实现了吗？

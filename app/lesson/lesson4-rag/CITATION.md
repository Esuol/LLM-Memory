# 引用溯源（Citation）

## 问题：答案缺乏可信度

**场景：**
```
用户："Next.js 16 有什么新特性？"
AI："Next.js 16 引入了部分预渲染功能..."

用户心理：
- 这个信息准确吗？
- 来源是哪里？
- 如何验证？
```

**问题：**
- 用户无法验证答案来源
- 无法追溯信息出处
- 降低答案可信度
- 难以发现幻觉（hallucination）

## 解决方案：Citation（引用溯源）

**Citation = 答案 + 来源标注**

```
用户："Next.js 16 有什么新特性？"

AI："Next.js 16 引入了部分预渲染功能 [1]，
允许在同一路由中混合静态和动态内容 [1]。
还优化了服务器组件的性能 [1]。"

来源：
[1] Next.js 16 发布于 2024年12月，带来了重大性能提升...
```

## 引用格式

### 1. 行内引用（Inline Citation）

```
答案中直接标注来源编号：

"Next.js 16 引入了部分预渲染功能 [1]，
React 19 引入了 Server Components [2]。"

参考文献：
[1] 文档标题或来源
[2] 文档标题或来源
```

### 2. 脚注引用（Footnote）

```
答案末尾列出所有来源：

"Next.js 16 引入了部分预渲染功能，
React 19 引入了 Server Components。"

---
参考来源：
1. Next.js 16 官方文档
2. React 19 发布说明
```

### 3. 高亮引用（Highlighted Citation）

```
直接引用原文片段：

"根据文档：'Next.js 16 引入了部分预渲染功能'，
这是一个重大更新。"
```

## 实现方式

### 方式 1：Prompt 引导

**原理：** 在 Prompt 中要求 LLM 标注来源

```typescript
async function generateWithCitation(
  query: string,
  docs: Array<{ text: string; source: string }>
): Promise<string> {
  const context = docs
    .map((doc, i) => `[${i + 1}] ${doc.text}`)
    .join('\n\n');

  const prompt = `基于以下文档回答问题，并用 [数字] 标注来源。

文档：
${context}

问题：${query}

要求：
1. 每个事实都要标注来源 [1]、[2] 等
2. 只使用提供的文档信息
3. 如果文档中没有答案，明确说明

回答：`;

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
  return data.choices[0].message.content;
}
```

**优势：**
- 简单，无需额外处理
- LLM 自动标注

**劣势：**
- 依赖 LLM 准确性
- 可能标注错误或遗漏

### 方式 2：后处理匹配

**原理：** 生成答案后，匹配答案片段到原文档

```typescript
interface Citation {
  text: string;
  source: number;
  confidence: number;
}

async function addCitations(
  answer: string,
  docs: string[]
): Promise<{ answer: string; citations: Citation[] }> {
  const citations: Citation[] = [];
  let annotatedAnswer = answer;

  // 1. 分句
  const sentences = answer.split(/[。！？]/);

  // 2. 为每句找最匹配的文档
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    let bestMatch = -1;
    let bestScore = 0;

    for (let j = 0; j < docs.length; j++) {
      const score = calculateSimilarity(sentence, docs[j]);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = j;
      }
    }

    // 3. 如果相似度足够高，添加引用
    if (bestScore > 0.7 && bestMatch !== -1) {
      citations.push({
        text: sentence,
        source: bestMatch + 1,
        confidence: bestScore,
      });

      // 在句子后添加引用标记
      annotatedAnswer = annotatedAnswer.replace(
        sentence,
        `${sentence} [${bestMatch + 1}]`
      );
    }
  }

  return { answer: annotatedAnswer, citations };
}

function calculateSimilarity(text1: string, text2: string): number {
  // 简单实现：关键词重叠度
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set(
    [...words1].filter(w => words2.has(w))
  );

  return intersection.size / Math.max(words1.size, words2.size);
}
```

**优势：**
- 不依赖 LLM 标注
- 可以验证引用准确性

**劣势：**
- 匹配算法复杂
- 可能误匹配

### 方式 3：LangChain RetrievalQAWithSourcesChain

```typescript
import { RetrievalQAWithSourcesChain } from "langchain/chains";
import { ChatOpenAI } from "@langchain/openai";

const chain = RetrievalQAWithSourcesChain.fromLLM(
  new ChatOpenAI({ modelName: "gpt-4o-mini" }),
  vectorStoreRetriever
);

const result = await chain.call({
  question: "Next.js 16 有什么新特性？"
});

console.log(result.answer);   // 答案
console.log(result.sources);  // 来源列表
```

**优势：**
- 开箱即用
- 自动处理引用

**劣势：**
- 依赖 LangChain
- 定制化受限

## 完整实现

```typescript
interface Document {
  id: string;
  text: string;
  metadata: {
    source: string;
    title?: string;
    url?: string;
  };
}

interface AnswerWithCitations {
  answer: string;
  sources: Array<{
    id: string;
    text: string;
    metadata: Document['metadata'];
  }>;
}

async function ragWithCitation(
  query: string
): Promise<AnswerWithCitations> {
  // 1. 检索文档
  const docs = await retrieve(query, 3);

  // 2. 构建带编号的上下文
  const numberedDocs = docs.map((doc, i) => ({
    ...doc,
    number: i + 1,
  }));

  const context = numberedDocs
    .map(doc => `[${doc.number}] ${doc.text}`)
    .join('\n\n');

  // 3. 生成答案（要求标注来源）
  const prompt = `基于以下文档回答问题，并用 [数字] 标注每个事实的来源。

文档：
${context}

问题：${query}

要求：
1. 每个事实后用 [数字] 标注来源
2. 只使用提供的文档信息
3. 如果文档中没有答案，说"根据提供的文档无法回答"

回答：`;

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
  const answer = data.choices[0].message.content;

  // 4. 提取引用的文档编号
  const citedNumbers = new Set<number>();
  const matches = answer.matchAll(/\[(\d+)\]/g);
  for (const match of matches) {
    citedNumbers.add(parseInt(match[1]));
  }

  // 5. 返回答案和引用的来源
  const sources = numberedDocs
    .filter(doc => citedNumbers.has(doc.number))
    .map(doc => ({
      id: doc.id,
      text: doc.text,
      metadata: doc.metadata,
    }));

  return { answer, sources };
}
```

## 前端展示

```typescript
'use client';

import { useState } from 'react';

interface Source {
  id: string;
  text: string;
  metadata: {
    source: string;
    title?: string;
    url?: string;
  };
}

export default function RAGWithCitation() {
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);

  async function handleSubmit(question: string) {
    const res = await fetch('/api/rag-citation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });

    const data = await res.json();
    setAnswer(data.answer);
    setSources(data.sources);
  }

  return (
    <div>
      {/* 答案区域 */}
      <div className="answer">
        {answer}
      </div>

      {/* 来源区域 */}
      {sources.length > 0 && (
        <div className="sources">
          <h3>参考来源：</h3>
          {sources.map((source, i) => (
            <div key={source.id} className="source-item">
              <strong>[{i + 1}]</strong>
              <p>{source.text.slice(0, 200)}...</p>
              {source.metadata.url && (
                <a href={source.metadata.url} target="_blank">
                  查看原文
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## 高级特性

### 1. 引用验证

```typescript
// 验证 LLM 标注的引用是否准确
function verifyCitations(
  answer: string,
  docs: Document[]
): Array<{ citation: string; valid: boolean; reason?: string }> {
  const results: Array<{ citation: string; valid: boolean; reason?: string }> = [];

  // 提取所有引用
  const matches = answer.matchAll(/([^[]+)\[(\d+)\]/g);

  for (const match of matches) {
    const text = match[1].trim();
    const docNum = parseInt(match[2]) - 1;

    if (docNum < 0 || docNum >= docs.length) {
      results.push({
        citation: text,
        valid: false,
        reason: '引用编号超出范围',
      });
      continue;
    }

    const doc = docs[docNum];
    const similarity = calculateSimilarity(text, doc.text);

    results.push({
      citation: text,
      valid: similarity > 0.6,
      reason: similarity <= 0.6 ? '内容不匹配' : undefined,
    });
  }

  return results;
}
```

### 2. 多级引用

```typescript
// 支持段落级和句子级引用
interface MultiLevelCitation {
  paragraph: number;  // 段落编号
  sentence?: number;  // 句子编号（可选）
}

// 示例：[1.2] 表示第 1 个文档的第 2 句
```

### 3. 引用高亮

```typescript
// 在原文档中高亮被引用的部分
function highlightCitations(
  doc: string,
  citedTexts: string[]
): string {
  let highlighted = doc;

  for (const text of citedTexts) {
    highlighted = highlighted.replace(
      text,
      `<mark>${text}</mark>`
    );
  }

  return highlighted;
}
```

## 效果对比

| 方法 | 可信度 | 可验证性 | 用户体验 | 实现复杂度 |
|------|--------|---------|---------|-----------|
| 无引用 | 低 | 无 | 简洁 | 简单 |
| Prompt 引导 | 中 | 中 | 好 | 简单 |
| 后处理匹配 | 高 | 高 | 好 | 中等 |
| LangChain | 中 | 中 | 好 | 简单 |

**推荐：** Prompt 引导（简单有效）+ 引用验证（提升准确性）

## 实现要点

1. **明确引用格式**
   - 统一使用 [数字] 格式
   - 在 Prompt 中明确要求

2. **验证引用准确性**
   - 检查引用编号是否有效
   - 验证引用内容是否匹配原文

3. **处理无法回答**
   - 如果文档中没有答案，明确说明
   - 避免 LLM 编造信息

4. **提供原文链接**
   - 如果文档有 URL，提供链接
   - 方便用户查看完整原文

## 成本分析

**额外成本：**
- Prompt 引导：无额外成本（只是 Prompt 更长）
- 后处理匹配：需要计算相似度（embedding 成本）
- 引用验证：需要额外 LLM 调用（可选）

**推荐：** Prompt 引导（零额外成本）

## 下一步

已完成 RAG 核心技术栈：
1. ✅ 文档切分（Chunking）
2. ✅ 向量数据库（Pinecone）
3. ✅ 混合搜索（Hybrid Search）
4. ✅ Chunk 检索问题解决
5. ✅ 重排序（Reranking）
6. ✅ 元数据过滤（Metadata Filtering）
7. ✅ 多查询（Multi-Query）
8. ✅ HyDE（Hypothetical Document Embeddings）
9. ✅ 上下文压缩（Context Compression）
10. ✅ 引用溯源（Citation）

**RAG 学习完成！** 可以开始综合项目实战，整合所有技术点。

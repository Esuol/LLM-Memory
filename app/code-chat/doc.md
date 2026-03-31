## 知识点记录

### Step 2：拉取 GitHub 文件列表

  【知识点】

  GitHub 提供了一个 API，一次性返回仓库里所有文件的路径和大小：

  GET https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1

  返回的数据结构：
  ```ts
    {
      "tree": [
        { "path": "src/app/page.tsx", "type": "blob", "size": 2048 },
        { "path": "src/app",         "type": "tree"              },
        { "path": ".gitignore",      "type": "blob", "size": 312  }
      ]
    }
  ```

  - type: "blob" = 文件
  - type: "tree" = 目录（不需要）

### Step 3：批量拉取文件内容

  【知识点】

  拿到文件列表后，需要逐个拉取每个文件的内容。GitHub 提供了 raw 内容接口：

  https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}

  问题： 有 89 个文件，能直接 Promise.all 全部并发吗？

  不行。GitHub 对未认证请求限制 60次/小时，全部并发会立刻触发 rate limit。

  解决方案：分批并发
  89 个文件，每批 10 个
  → 第 1 批：同时请求 10 个（并发）
  → 第 2 批：同时请求 10 个（并发）
  → ...共 9 批

### Step 4：文档分块 + 写入 Pinecone

  【知识点】

  拿到文件内容后，需要做两件事：

  1. 分块（Chunking）

  你已经在 Lesson 4 学过。这次用 LangChain 的
  RecursiveCharacterTextSplitter，它比手写的更聪明——会优先在自然边界（换行、空格）切割：
  ```ts

  import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  // 生成带 metadata 的 Document 对象
  const docs = await splitter.createDocuments(
    [fileContent],                          // 文本内容
    [{ file: "src/app/page.tsx", language: "typescript" }]  // metadata
  );
  ```

  2. 写入 Pinecone（LangChain 方式）

  ```ts
  import { PineconeVectorStore } from "@langchain/pinecone";
  import { OpenAIEmbeddings } from "@langchain/openai";

  await PineconeVectorStore.fromDocuments(docs, embeddings, {
    pineconeIndex,
    namespace: "vercel-next-js",
  });
  ```

  fromDocuments 内部自动完成：embedding → upsert，一步到位。


### Step 5：实现 chat.ts

  【知识点】这一步要用 ConversationalRetrievalQAChain，它做了两件事：
  1. Query Condensation：把历史对话 + 当前问题，先让 LLM 生成一个"独立问题"（解决代词指代）
  2. RAG 问答：用独立问题检索 Pinecone，再让 LLM 生成最终回答

【示例代码】

 ```ts
 import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
  import { PineconeVectorStore } from "@langchain/pinecone";
  import { ConversationalRetrievalQAChain } from "langchain/chains";
  import { Pinecone } from "@pinecone-database/pinecone";

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

  export async function chatWithRepo(
    question: string,
    namespace: string,
    history: Array<{ user: string; ai: string }>
  ) {
    const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME || "rag-demo");

    const vectorStore = await PineconeVectorStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      namespace,
    });

    const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
    const chain = ConversationalRetrievalQAChain.fromLLM(llm, vectorStore.asRetriever({ k: 5 }), {
      returnSourceDocuments: true,
    });

    const result = await chain.invoke({
      question,
      chat_history: history.map(h => [h.user, h.ai]),
    });

    return {
      answer: result.text,
      sources: result.sourceDocuments,
    };
  }
  ```



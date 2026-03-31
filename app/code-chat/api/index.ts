import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SKIP_PATHS, SUPPORTED_EXTENSIONS } from "./constant";

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

type PineconeMetadataValue = string | number | boolean | string[];

/**
 * @description 将任意 metadata 清洗成 Pinecone 可接受的扁平结构（只保留 string/number/boolean/string[]）。
 * 例如 LangChain Document 可能带有 `loc` 这类对象字段，需要移除或转成字符串。
 */
export function sanitizePineconeMetadata(input: unknown): Record<string, PineconeMetadataValue> {
  if (typeof input !== "object" || input === null) return {};
  const obj = input as Record<string, unknown>;

  const out: Record<string, PineconeMetadataValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
      continue;
    }
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = v;
      continue;
    }
    // 其他类型（object/null/array<number>/etc.）都跳过，避免 Pinecone 报错，例如 loc
  }
  return out;
}

  /**
   * @description 解析 GitHub 仓库 URL
   * @param url GitHub 仓库 URL
   * @returns { owner: string; repo: string } | null
   */
  export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    // 统一清洗：去掉首尾空格，并允许末尾多余的 `/`
    const cleaned = url.trim().replace(/\/+$/, "");
    // 匹配：
    // - https://github.com/:owner/:repo
    // - https://github.com/:owner/:repo.git
    const match = cleaned.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
      if (!match) return null;

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, "");
    return { owner, repo };
  }

  /**
   * @description 生成 Pinecone namespace
   * @param owner GitHub 仓库所有者
   * @param repo GitHub 仓库名称
   * @returns Pinecone namespace
   * @returns string
   * @example
   * getNamespace('vercel', 'next.js') => 'vercel-next-js'
   */
  export function getNamespace(owner: string, repo: string): string {
    return `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }


  /**
   * @description 判断某个文件路径是否应该跳过
   * @param path 文件路径
   * @returns boolean
   * @example
   * shouldSkip('node_modules/lodash/index.js') => true
   * shouldSkip('src/app/page.tsx') => false
   */
  export function shouldSkip(path: string): boolean {
    // 提示：path 是 "node_modules/lodash/index.js" 这样的相对路径
    // 只要 path 里包含 SKIP_PATHS 里的任意一个词就返回 true
    const parts = path.split("/");
    return SKIP_PATHS.some(skip => parts.includes(skip));
  }



  /**
   * @description 调用 GitHub API，返回过滤后的文件列表
   * @param owner GitHub 仓库所有者
   * @param repo GitHub 仓库名称
   * @returns Array<{ path: string; size: number }>
   * @example
   * listRepoFiles('vercel', 'next.js') => [{ path: 'src/app/page.tsx', size: 1024 }]
   */
  export async function listRepoFiles(
    owner: string,
    repo: string
  ): Promise<Array<{ path: string; size: number }>> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        // 说明：公开仓库不传 token 也能用，但会有更严格的 rate limit
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });

    if (!res.ok) {
      // 404：仓库不存在 / 分支不存在
      if (res.status === 404) {
        throw new Error("GitHub 仓库不存在，或无法访问（404）");
      }
      // 403：私有仓库、无权限、或 rate limit
      if (res.status === 403) {
        const msg = await res.text().catch(() => "");
        throw new Error(`GitHub 访问被拒绝（403）。可能是私有仓库或触发限流。${msg ? `详情：${msg}` : ""}`);
      }
      const msg = await res.text().catch(() => "");
      throw new Error(`GitHub API 请求失败（${res.status}）。${msg ? `详情：${msg}` : ""}`);
    }

    const data: {
      tree?: Array<{ path?: string; type?: "blob" | "tree"; size?: number }>;
    } = await res.json();

    const files =
      data.tree
        ?.filter((item) => item.type === "blob")
        .map((item) => ({ path: item.path ?? "", size: item.size ?? 0 }))
        .filter((f) => f.path && f.size > 0)
        .filter((f) => !shouldSkip(f.path))
        .filter((f) => {
          const dot = f.path.lastIndexOf(".");
          if (dot === -1) return false;
          const ext = f.path.slice(dot).toLowerCase();
          return SUPPORTED_EXTENSIONS.has(ext);
        })
        .filter((f) => f.size < 100 * 1024)
        .slice(0, 200) ?? [];

    // 说明：返回文件列表
    console.log("files", files);
    return files;
  }



/**
   * @description 拉取单个文件内容（失败返回 null，不要让整批失败）
   * @param owner GitHub 仓库所有者
   * @param repo GitHub 仓库名称
   * @param path 文件路径
   * @returns string | null
   * @example
   * fetchFileContent('vercel', 'next.js', 'src/app/page.tsx') => 'export default function Page() { return <div>Hello World</div>; }'
*/
export async function fetchFileContent(
    owner: string,
    repo: string,
    path: string
): Promise<string | null> {
    // 提示：用 raw.githubusercontent.com
    // 注意：res.ok 为 false 时返回 null，不要 throw
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
    const res = await fetch(url, {
      headers: {
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });

    if (!res.ok) return null;
    return await res.text();
}


/**
 * @description 批量拉取，每批 batchSize 个并发
 * @param owner GitHub 仓库所有者
 * @param repo GitHub 仓库名称
 * @param files 文件列表
 * @param batchSize 每批并发数
 * @returns Array<{ path: string; content: string }>
 * @example
 * fetchFilesInBatches('vercel', 'next.js', [{ path: 'src/app/page.tsx', size: 1024 }], 10) => [{ path: 'src/app/page.tsx', content: 'export default function Page() { return <div>Hello World</div>; }' }]
 */
export async function fetchFilesInBatches(
  owner: string,
  repo: string,
  files: Array<{ path: string; size: number }>,
  batchSize = 10
): Promise<Array<{ path: string; content: string }>> {
  // 提示：
  // 1. 用 for 循环按 batchSize 切片
  // 2. 每批用 Promise.all 并发
  // 3. 过滤掉 content 为 null 或空字符串的结果
  const results: Array<{ path: string; content: string }> = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (file) => {
        const content = await fetchFileContent(owner, repo, file.path).catch(() => null);
        return { path: file.path, content };
      })
    );

    for (const r of batchResults) {
      if (typeof r.content === "string" && r.content.trim().length > 0) {
        results.push({ path: r.path, content: r.content });
      }
    }
  }

  return results;
}

/**
 *
 * @param repoUrl
 */
export async function indexRepository(repoUrl: string): Promise<{
  namespace: string;
  fileCount: number;
  chunkCount: number;
  cached: boolean;
}> {
  // 1. parseGitHubUrl → 失败抛错 "无效的 GitHub 仓库地址"
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) throw new Error("无效的 GitHub 仓库地址");
  const { owner, repo } = parsed;
  // 说明：生成 Pinecone namespace
  const namespace = getNamespace(owner, repo);
  // 说明：生成 repoFullName
  const repoFullName = `${owner}/${repo}`;

  // 2. 检查 Pinecone namespace 是否已存在（describeIndexStats）
  // 说明：这里用固定 indexName；真实项目里建议把 indexName 抽到配置里
  const indexName = process.env.PINECONE_CODE_CHAT_INDEX_NAME || "rag-demo";
  // 说明：获取 Pinecone index
  const pineconeIndex = pinecone.Index(indexName);
  // 说明：获取 Pinecone namespace 统计信息
  const stats = (await pineconeIndex.describeIndexStats()) as unknown as {
    namespaces?: Record<string, { recordCount?: number; vectorCount?: number }>;
  };

  // 说明：这里用固定 indexName；真实项目里建议把 indexName 抽到配置里
  const namespaceCount = stats.namespaces?.[namespace]?.recordCount ?? stats.namespaces?.[namespace]?.vectorCount ?? 0;

  // 说明：如果 namespace 已存在，直接返回缓存
  if (namespaceCount > 0) {
    return {
      namespace,
      fileCount: 0,
      chunkCount: 0,
      cached: true,
    };
  }

  // 3. listRepoFiles → 拿到文件列表
  const files = await listRepoFiles(owner, repo);

  // 4. fetchFilesInBatches → 拿到文件内容
  const fileContents = await fetchFilesInBatches(owner, repo, files, 10);

  // 5. 用 RecursiveCharacterTextSplitter 分块
  const splitter = new RecursiveCharacterTextSplitter({
    // 说明：chunkSize 和 chunkOverlap 是分块的参数，chunkSize 是每个块的大小，chunkOverlap 是每个块的 overlap 大小
    chunkSize: 1000,
    // 说明：chunkOverlap 是每个块的 overlap 大小 一般为 chunkSize 的 20% 左右
    // overlap 越大，分块越精确，但也会导致分块数量增加,
    // overlap 越小，分块越不精确，但也会导致分块数量减少,
    chunkOverlap: 200,
  });

  // 说明：创建 Documents 对象
  const docs = (
    // 说明：用 Promise.all 并发处理文件内容
    await Promise.all(
      fileContents.map(async (f) => {
        const language = getLanguage(f.path);
        // 说明：创建 Documents 对象
        return await splitter.createDocuments([f.content], [
          { file: f.path, language, repo: repoFullName },
        ]);
      })
    )
    // 说明：将所有 Documents 对象扁平化
  ).flat();

  // 6. 写入 Pinecone
  const embeddings = new OpenAIEmbeddings({
    // 说明：使用 text-embedding-3-small 模型
    model: "text-embedding-3-small",
    // 说明：使用 OPENAI_API_KEY
    apiKey: process.env.OPENAI_API_KEY,
    // 说明：使用 OPENAI_BASE_URL
    configuration: process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : undefined,
  });

  // 写入 Pinecone：分批 embedding → upsert（避免一次性并发过高触发 rate limit）
  type VectorRecord = {
    id: string;
    values: number[];
    metadata: Record<string, PineconeMetadataValue>;
  };
  // 说明：创建 VectorRecord 对象
  const vectors: VectorRecord[] = [];
  // 说明：batchSize 为 50
  const batchSize = 50;
  // 说明：用 for 循环按 batchSize 切片
  for (let i = 0; i < docs.length; i += batchSize) {
    // 说明：按 batchSize 切片
    const batch = docs.slice(i, i + batchSize);
    // 说明：用 Promise.all 并发处理 batch
    const batchVectors: Array<VectorRecord | null> = await Promise.all(
      // 说明：用 map 并发处理 batch
      batch.map(async (d, j) => {
        try {
          return {
            id: `${namespace}-${i + j}`,
            // 说明：使用 embeddings.embedQuery 创建 values
            values: await embeddings.embedQuery(d.pageContent),
            // 保存 chunk 原文，供后续检索 sources 展示
            metadata: {
              ...sanitizePineconeMetadata(d.metadata),
              content: d.pageContent,
            },
          };
        } catch {
          return null;
        }
      })
    );
    // 说明：将所有 VectorRecord 对象扁平化
    vectors.push(...batchVectors.filter((v): v is VectorRecord => v !== null));
  }

  // 说明：如果 vectors 为空，直接返回
  if (vectors.length === 0) {
    return {
      namespace,
      fileCount: fileContents.length,
      chunkCount: 0,
      cached: false,
    };
  }
  // 重要：写入指定 namespace，避免多个仓库数据混在默认 namespace（空字符串）里
  await pineconeIndex.namespace(namespace).upsert({ records: vectors });

  // 7. 返回统计信息
  return {
    // 说明：返回 namespace
    namespace,
    // 说明：返回 fileCount
    fileCount: fileContents.length,
    // 说明：返回 chunkCount
    chunkCount: vectors.length,
    // 说明：返回 cached
    cached: false,
  };
}


/**
 * @description 列出 Pinecone 中所有已索引的 namespace
 */
export async function listNamespaces(): Promise<Array<{ namespace: string; vectorCount: number }>> {
  const indexName = process.env.PINECONE_CODE_CHAT_INDEX_NAME || "rag-demo";
  const pineconeIndex = pinecone.Index(indexName);
  const stats = (await pineconeIndex.describeIndexStats()) as unknown as {
    namespaces?: Record<string, { recordCount?: number; vectorCount?: number }>;
  };
  return Object.entries(stats.namespaces ?? {}).map(([namespace, info]) => ({
    namespace,
    vectorCount: info.recordCount ?? info.vectorCount ?? 0,
  }));
}

/**
 * @description 语言识别提示，你需要一个辅助函数
 * @param path 文件路径
 * @returns string
 * @example
 * getLanguage('src/app/page.tsx') => 'typescript'
 */
export function getLanguage(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".md": "markdown", ".json": "json", ".css": "css",
    // 其他按需添加
  };
  return map[ext] ?? "text";
}


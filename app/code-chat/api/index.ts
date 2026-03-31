  import { SKIP_PATHS, SUPPORTED_EXTENSIONS } from "./constant";

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

    return files;
  }


  // 需要过滤的路径关键词（路径中包含这些词就跳过）
  export const SKIP_PATHS = [
    "node_modules", "dist", "build", ".git",
    "__pycache__", ".next", "out", "coverage", "vendor",
  ];

  // 支持的扩展名
  export const SUPPORTED_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs",
    ".py", ".go", ".rs", ".java",
    ".md", ".json", ".yaml", ".yml",
    ".css", ".html", ".vue", ".svelte",
  ]);

  // Pinecone 的 Index 名称（抽取为常量，避免硬编码分散在各处）
  export const PINECONE_INDEX_NAME =
    process.env.PINECONE_CODE_CHAT_INDEX_NAME || "code-search";

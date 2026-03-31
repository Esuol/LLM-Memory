## 知识点记录

⏺ Step 2：拉取 GitHub 文件列表

  【知识点】

  GitHub 提供了一个 API，一次性返回仓库里所有文件的路径和大小：

  GET https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1

  返回的数据结构：
  {
    "tree": [
      { "path": "src/app/page.tsx", "type": "blob", "size": 2048 },
      { "path": "src/app",         "type": "tree"              },
      { "path": ".gitignore",      "type": "blob", "size": 312  }
    ]
  }

  - type: "blob" = 文件
  - type: "tree" = 目录（不需要）


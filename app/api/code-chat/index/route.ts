import { NextRequest } from "next/server";
import { indexRepository } from "@/app/code-chat/api/index";
import { createSseResponse } from "@/app/code-chat/api/utils";

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

/**
 * @description 索引 GitHub 仓库（写入 Pinecone namespace）
 * Body: { repoUrl: string }
 */
export async function POST(req: NextRequest) {
  return createSseResponse(async ({ send }) => {
    const body: unknown = await req.json();
    if (!isRecord(body)) {
      send({ type: "error", message: "invalid body" });
      return;
    }

    const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
    if (!repoUrl) {
      send({ type: "error", message: "repoUrl 不能为空" });
      return;
    }

    const result = await indexRepository(repoUrl, (msg) => send({ type: "progress", msg }));
    send({ type: "done", result });
  });
}


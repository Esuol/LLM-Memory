import { NextRequest, NextResponse } from "next/server";
import { indexRepository } from "@/app/code-chat/api/index";

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

/**
 * @description 索引 GitHub 仓库（写入 Pinecone namespace）
 * Body: { repoUrl: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) return NextResponse.json({ error: "invalid body" }, { status: 400 });

    const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
    if (!repoUrl) return NextResponse.json({ error: "repoUrl 不能为空" }, { status: 400 });

    const result = await indexRepository(repoUrl);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "index failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


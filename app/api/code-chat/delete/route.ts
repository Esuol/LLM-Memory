import { NextRequest, NextResponse } from "next/server";
import { deleteNamespace } from "@/app/code-chat/api/index";

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

/**
 * @description 删除指定 namespace 的所有向量
 * Body: { namespace: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) return NextResponse.json({ error: "invalid body" }, { status: 400 });

    const namespace = typeof body.namespace === "string" ? body.namespace.trim() : "";
    if (!namespace) return NextResponse.json({ error: "namespace 不能为空" }, { status: 400 });

    await deleteNamespace(namespace);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


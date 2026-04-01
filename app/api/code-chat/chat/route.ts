import { NextRequest, NextResponse } from "next/server";
import { chatWithRepo } from "@/app/code-chat/api/chat";

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

function isHistoryArray(v: unknown): v is Array<{ user: string; ai: string }> {
  return (
    Array.isArray(v) &&
    v.every((h) => isRecord(h) && typeof h.user === "string" && typeof h.ai === "string")
  );
}

/**
 * @description 基于 namespace 的代码库问答
 * Body: { namespace: string; question: string; history?: Array<{user, ai}> }
 */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) return NextResponse.json({ error: "invalid body" }, { status: 400 });

    const namespace = typeof body.namespace === "string" ? body.namespace.trim() : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const history = isHistoryArray(body.history) ? body.history : [];

    if (!namespace) return NextResponse.json({ error: "namespace 不能为空" }, { status: 400 });
    if (!question) return NextResponse.json({ error: "question 不能为空" }, { status: 400 });

    const result = await chatWithRepo(question, namespace, history);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


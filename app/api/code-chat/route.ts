import { NextRequest, NextResponse } from "next/server";
import { indexRepository, listNamespaces } from "@/app/code-chat/api/index";
import { chatWithRepo } from "@/app/code-chat/api/chat";

type ListBody = { type: "list" };

type IndexBody = {
  type: "index";
  repoUrl: string;
};

type ChatBody = {
  type: "chat";
  namespace: string;
  question: string;
  history?: Array<{ user: string; ai: string }>;
};

type UnknownBody = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownBody {
  return typeof v === "object" && v !== null;
}

function isListBody(v: unknown): v is ListBody {
  return isRecord(v) && v.type === "list";
}

function isIndexBody(v: unknown): v is IndexBody {
  return (
    isRecord(v) &&
    v.type === "index" &&
    typeof v.repoUrl === "string"
  );
}

function isChatBody(v: unknown): v is ChatBody {
  return (
    isRecord(v) &&
    v.type === "chat" &&
    typeof v.namespace === "string" &&
    typeof v.question === "string"
  );
}

/**
 * @description Code Chat API：支持索引仓库与基于仓库的对话检索问答。
 */
export async function POST(req: NextRequest) {
  const body: unknown = await req.json();

  if (isListBody(body)) {
    try {
      const namespaces = await listNamespaces();
      return NextResponse.json({ success: true, namespaces });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "list failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // 说明：如果 body 是 IndexBody，则调用 indexRepository
  if (isIndexBody(body)) {
    try {
      if (body.repoUrl.trim().length === 0) {
        return NextResponse.json({ error: "repoUrl 不能为空" }, { status: 400 });
      }
      const result = await indexRepository(body.repoUrl.trim());
      return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "index failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // 说明：如果 body 是 ChatBody，则调用 chatWithRepo
  if (isChatBody(body)) {
    try {
      if (body.namespace.trim().length === 0) {
        return NextResponse.json({ error: "namespace 不能为空" }, { status: 400 });
      }
      if (body.question.trim().length === 0) {
        return NextResponse.json({ error: "question 不能为空" }, { status: 400 });
      }

      const history =
        Array.isArray(body.history) &&
        body.history.every(
          (h) => isRecord(h) && typeof h.user === "string" && typeof h.ai === "string"
        )
          ? body.history
          : [];
      const result = await chatWithRepo(body.question.trim(), body.namespace.trim(), history);
      return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "chat failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}
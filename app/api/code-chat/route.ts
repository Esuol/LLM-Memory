import { NextRequest, NextResponse } from "next/server";

/**
 * @description 兼容旧版 single-endpoint（body.type）调用方式。
 * 建议迁移到：
 * - GET  /api/code-chat/list
 * - POST /api/code-chat/index
 * - POST /api/code-chat/chat
 * - POST /api/code-chat/delete
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const type = typeof body.type === "string" ? body.type : "";

  if (type === "list") {
    const url = new URL(req.url);
    url.pathname = "/api/code-chat/list";
    return NextResponse.redirect(url);
  }

  if (type === "index") {
    const url = new URL(req.url);
    url.pathname = "/api/code-chat/index";
    const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl : "";
    const forward = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl }),
    });
    const json = await forward.json();
    return NextResponse.json(json, { status: forward.status });
  }

  if (type === "chat") {
    const url = new URL(req.url);
    url.pathname = "/api/code-chat/chat";
    const namespace = typeof body.namespace === "string" ? body.namespace : "";
    const question = typeof body.question === "string" ? body.question : "";
    const history = Array.isArray(body.history) ? body.history : [];
    const forward = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, question, history }),
    });
    const json = await forward.json();
    return NextResponse.json(json, { status: forward.status });
  }

  if (type === "delete") {
    const url = new URL(req.url);
    url.pathname = "/api/code-chat/delete";
    const namespace = typeof body.namespace === "string" ? body.namespace : "";
    const forward = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace }),
    });
    const json = await forward.json();
    return NextResponse.json(json, { status: forward.status });
  }

  return NextResponse.json(
    {
      error:
        'deprecated endpoint: please use /api/code-chat/{list|index|chat|delete}',
    },
    { status: 400 }
  );
}
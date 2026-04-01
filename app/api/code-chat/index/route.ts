import { NextRequest } from "next/server";
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
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const body: unknown = await req.json();
        if (!isRecord(body)) {
          send({ type: "error", message: "invalid body" });
          controller.close();
          return;
        }

        const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
        if (!repoUrl) {
          send({ type: "error", message: "repoUrl 不能为空" });
          controller.close();
          return;
        }

        const result = await indexRepository(repoUrl, (msg) => send({ type: "progress", msg }));
        send({ type: "done", result });
      } catch (err: unknown) {
        send({ type: "error", message: err instanceof Error ? err.message : "index failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}


import { NextRequest } from "next/server";
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

        const namespace = typeof body.namespace === "string" ? body.namespace.trim() : "";
        const question = typeof body.question === "string" ? body.question.trim() : "";
        const history = isHistoryArray(body.history) ? body.history : [];

        if (!namespace) {
          send({ type: "error", message: "namespace 不能为空" });
          controller.close();
          return;
        }
        if (!question) {
          send({ type: "error", message: "question 不能为空" });
          controller.close();
          return;
        }

        await chatWithRepo(question, namespace, history, {
          onChunk(token) {
            if (token) send({ type: "chunk", token });
          },
          onSources(sources) {
            send({ type: "sources", sources });
          },
        });

        send({ type: "done" });
      } catch (err: unknown) {
        send({ type: "error", message: err instanceof Error ? err.message : "chat failed" });
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


/**
 * @description 休眠指定毫秒数
 * @param ms 毫秒
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @description 通用重试工具：指数退避（Exponential Backoff）
 *
 * 行为：
 * - 调用 fn()，成功直接返回
 * - 失败则等待 delayMs 后重试，每次 delayMs 翻倍
 * - 超过 retries 次后抛出错误
 *
 * @param fn 需要重试的异步函数
 * @param retries 重试次数（默认 3 次）
 * @param delayMs 初始等待时间（默认 1000ms）
 * @param onRetry 每次重试前回调（attempt 从 1 开始）
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000,
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void
): Promise<T> {
  let attempt = 0;
  let delay = delayMs;

  // 第 1 次调用 + 最多 retries 次重试，总共 retries + 1 次尝试
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
      attempt += 1;
      delay *= 2;
    }
  }
}

/**
 * @description 比对新旧文件列表，返回需要处理的文件（新增/修改/删除）
 */
export function diffSnapshots(
  oldSnapshots: Array<{ path: string; sha: string }>,
  newSnapshots: Array<{ path: string; sha: string }>
) {
  const oldMap = new Map(oldSnapshots.map((f) => [f.path, f.sha]));
  const newMap = new Map(newSnapshots.map((f) => [f.path, f.sha]));

  return {
    toAdd: newSnapshots.filter((f) => !oldMap.has(f.path)),
    toUpdate: newSnapshots.filter((f) => oldMap.get(f.path) !== f.sha),
    toDelete: oldSnapshots.filter((f) => !newMap.has(f.path)),
  };
}

/**
 * @description 创建 SSE（Server-Sent Events）响应。
 *
 * 输出格式：每条消息会被序列化为 JSON，并以 `data: ...\n\n` 写入。
 *
 * @param handler 业务处理函数，调用 send(data) 推送消息
 */
export function createSseResponse(
  handler: (ctx: { send: (data: unknown) => void }) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await handler({ send });
      } catch (err: unknown) {
        send({ type: "error", message: err instanceof Error ? err.message : "unknown error" });
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

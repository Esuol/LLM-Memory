/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";

// ==================== 消息队列 ====================

interface Message {
  from: string;
  to: string;
  type: "task" | "result" | "done";
  content: any;
}

/**
 * 尽可能从模型文本中提取 JSON 对象；支持纯 JSON 或包裹在自然语言中的 JSON 片段。
 */
function safeParseJsonObject(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const maybeJson = text.slice(start, end + 1);
    try {
      return JSON.parse(maybeJson);
    } catch {
      return null;
    }
  }
}

/**
 * 当规划 Agent 解析失败时，基于用户问题做一个最小可用任务兜底。
 */
function fallbackTasksFromUserRequest(userRequest: string) {
  const weatherMatch = userRequest.match(/北京|上海|广州/);
  if (weatherMatch) {
    return [{ action: "getWeather", args: { city: weatherMatch[0] } }];
  }
  return [];
}

class MessageQueue {
  private queue: Message[] = [];
  private handlers: Map<string, (msg: Message) => void> = new Map();

  send(msg: Message) {
    this.queue.push(msg);
    const handler = this.handlers.get(msg.to);
    if (handler) {
      handler(msg);
    }
  }

  subscribe(agentId: string, handler: (msg: Message) => void) {
    this.handlers.set(agentId, handler);
  }

  getHistory(): Message[] {
    return [...this.queue];
  }
}

// ==================== 工具 ====================

async function getWeather(city: string) {
  const cityCoords: Record<string, { lat: number; lon: number }> = {
    北京: { lat: 39.9042, lon: 116.4074 },
    上海: { lat: 31.2304, lon: 121.4737 },
    广州: { lat: 23.1291, lon: 113.2644 },
  };

  const coords = cityCoords[city] || cityCoords["北京"];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code&timezone=Asia/Shanghai`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const weatherCode = data.current.weather_code;
    const weatherDesc = weatherCode === 0 ? "晴" : weatherCode < 3 ? "多云" : weatherCode < 70 ? "阴" : "雨";
    return `${city}：${weatherDesc}，${temp}°C`;
  } catch {
    return `无法获取${city}的天气信息`;
  }
}

const model = "gpt-5.4";

// ==================== Agent（消息驱动）====================

class PlannerAgent {
  constructor(private queue: MessageQueue, private send: (data: any) => void) {
    this.queue.subscribe("planner", (msg) => this.handleMessage(msg));
  }

  async handleMessage(msg: Message) {
    if (msg.type === "task") {
      try {
      this.send({ type: "log", content: "[Planner] 收到用户请求，开始规划..." });

      const response = await fetch(
        `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: `你是规划 Agent。将用户请求拆解为任务列表。
返回格式：{"tasks": [{"action": "getWeather", "args": {"city": "北京"}}, ...]}`,
              },
              { role: "user", content: msg.content },
            ],
            response_format: { type: "json_object" },
          }),
        }
      );

      const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim?.() ?? "";
        const parsed = safeParseJsonObject(content);
        const parsedTasks = parsed?.tasks;
        const tasks = Array.isArray(parsedTasks) ? parsedTasks : fallbackTasksFromUserRequest(msg.content);

        if (!parsed) {
          this.send({ type: "log", content: "[Planner] 模型未返回合法 JSON，已使用兜底任务策略" });
        }

      this.send({ type: "log", content: `[Planner] 拆解为 ${tasks.length} 个任务，发送给 Worker` });

      // 发送任务到 Worker
      tasks.forEach((task: any, i: number) => {
        this.queue.send({
          from: "planner",
          to: "worker",
          type: "task",
          content: { id: `task-${i}`, ...task },
        });
      });

      // 通知 Coordinator 任务数量
      this.queue.send({
        from: "planner",
        to: "coordinator",
        type: "task",
        content: { totalTasks: tasks.length, userRequest: msg.content },
      });
      } catch (error: any) {
        this.send({ type: "log", content: `[Planner] 规划失败，降级为 0 任务：${error.message}` });
        this.queue.send({
          from: "planner",
          to: "coordinator",
          type: "task",
          content: { totalTasks: 0, userRequest: msg.content },
        });
      }
    }
  }
}

class WorkerAgent {
  constructor(private queue: MessageQueue, private send: (data: any) => void) {
    this.queue.subscribe("worker", (msg) => this.handleMessage(msg));
  }

  async handleMessage(msg: Message) {
    if (msg.type === "task") {
      const task = msg.content;
      this.send({ type: "log", content: `[Worker] 执行 ${task.id}: ${task.action}(${JSON.stringify(task.args)})` });

      let result = "";
      if (task.action === "getWeather") {
        result = await getWeather(task.args.city);
      }

      this.send({ type: "log", content: `[Worker] ${task.id} 完成: ${result}` });

      // 发送结果到 Coordinator
      this.queue.send({
        from: "worker",
        to: "coordinator",
        type: "result",
        content: result,
      });
    }
  }
}

class CoordinatorAgent {
  private results: string[] = [];
  private totalTasks = 0;
  private userRequest = "";

  constructor(private queue: MessageQueue, private send: (data: any) => void) {
    this.queue.subscribe("coordinator", (msg) => this.handleMessage(msg));
  }

  async handleMessage(msg: Message) {
    if (msg.type === "task") {
      this.totalTasks = msg.content.totalTasks;
      this.userRequest = msg.content.userRequest;
      this.send({ type: "log", content: `[Coordinator] 等待 ${this.totalTasks} 个任务完成...` });
    } else if (msg.type === "result") {
      this.results.push(msg.content);
      this.send({ type: "log", content: `[Coordinator] 收到结果 ${this.results.length}/${this.totalTasks}` });

      // 所有任务完成，汇总
      if (this.results.length === this.totalTasks) {
        await this.synthesize();
      }
    }
  }

  async synthesize() {
    this.send({ type: "log", content: "[Coordinator] 所有任务完成，开始汇总..." });

    const response = await fetch(
      `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "你是汇总 Agent。根据执行结果回答用户问题。",
            },
            {
              role: "user",
              content: `用户问题：${this.userRequest}\n\n执行结果：\n${this.results.join("\n")}\n\n请汇总回答。`,
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const answer = data.choices[0].message.content;

    this.send({ type: "log", content: "[Coordinator] 汇总完成" });
    this.queue.send({
      from: "coordinator",
      to: "system",
      type: "done",
      content: answer,
    });
  }
}

// ==================== API 路由 ====================

export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  const userRequest = messages[messages.length - 1].content;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const queue = new MessageQueue();

        // 初始化 Agent
        new PlannerAgent(queue, send);
        new WorkerAgent(queue, send);
        new CoordinatorAgent(queue, send);

        // 监听完成消息
        queue.subscribe("system", (msg) => {
          if (msg.type === "done") {
            send({ type: "message", content: msg.content });
            controller.close();
          }
        });

        // 启动：发送用户请求到 Planner
        queue.send({
          from: "user",
          to: "planner",
          type: "task",
          content: userRequest,
        });

        // 等待完成（通过消息队列异步处理）
      } catch (error: any) {
        send({ type: "error", content: error.message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

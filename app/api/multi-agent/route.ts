/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";

// ==================== 工具定义 ====================

const tools = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "获取指定城市的天气信息",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" },
        },
        required: ["city"],
      },
    },
  },
];

async function getWeather(city: string) {
  const cityCoords: Record<string, { lat: number; lon: number }> = {
    北京: { lat: 39.9042, lon: 116.4074 },
    上海: { lat: 31.2304, lon: 121.4737 },
    广州: { lat: 23.1291, lon: 113.2644 },
    深圳: { lat: 22.5431, lon: 114.0579 },
    杭州: { lat: 30.2741, lon: 120.1551 },
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

// ==================== Agent 实现 ====================

interface Task {
  id: string;
  action: string;
  args: Record<string, any>;
}

class PlannerAgent {
  async plan(userRequest: string, send: (data: any) => void): Promise<Task[]> {
    send({ type: "log", content: "[Planner] 开始规划任务..." });

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
              content: `你是规划 Agent。将用户请求拆解为独立的任务列表。
返回 JSON 数组格式：[{"action": "getWeather", "args": {"city": "北京"}}, ...]
只返回 JSON，不要其他文字。`,
            },
            { role: "user", content: userRequest },
          ],
        }),
      }
    );

    const data = await response.json();
    const content = data.choices[0].message.content;
    const tasks = JSON.parse(content).map((t: any, i: number) => ({
      id: `task-${i}`,
      ...t,
    }));

    send({ type: "log", content: `[Planner] 拆解为 ${tasks.length} 个任务` });
    return tasks;
  }
}

class WorkerAgent {
  async execute(task: Task, send: (data: any) => void): Promise<string> {
    send({ type: "log", content: `[Worker] 执行任务 ${task.id}: ${task.action}(${JSON.stringify(task.args)})` });

    if (task.action === "getWeather") {
      const result = await getWeather(task.args.city);
      send({ type: "log", content: `[Worker] ${task.id} 完成: ${result}` });
      return result;
    }

    return "未知任务";
  }
}

class CoordinatorAgent {
  async synthesize(results: string[], userRequest: string, send: (data: any) => void): Promise<string> {
    send({ type: "log", content: "[Coordinator] 汇总结果..." });

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
              content: `用户问题：${userRequest}\n\n执行结果：\n${results.join("\n")}\n\n请汇总回答。`,
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const answer = data.choices[0].message.content;
    send({ type: "log", content: "[Coordinator] 汇总完成" });
    return answer;
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
        const planner = new PlannerAgent();
        const worker = new WorkerAgent();
        const coordinator = new CoordinatorAgent();

        // 1. 规划
        const tasks = await planner.plan(userRequest, send);

        // 2. 并行执行
        const results = await Promise.all(
          tasks.map((task) => worker.execute(task, send))
        );

        // 3. 汇总
        const answer = await coordinator.synthesize(results, userRequest, send);

        send({ type: "message", content: answer });
        controller.close();
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

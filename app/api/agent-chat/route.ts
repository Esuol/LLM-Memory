/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";

// 工具定义
const tools = [
  {
    type: "function",
    function: {
      name: "getCurrentTime",
      description: "获取当前的日期和时间",
      parameters: { type: "object", properties: {} },
    },
  },
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
  {
    type: "function",
    function: {
      name: "getIndoorActivities",
      description: "获取室内活动推荐（适合下雨天）",
      parameters: { type: "object", properties: {} },
    },
  },
];

// 工具实现
function getCurrentTime() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

async function getWeather(city: string) {
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const current = data.current_condition[0];
    const temp = current.temp_C;
    const desc = current.lang_zh[0].value;
    return `${city}：${desc}，${temp}°C`;
  } catch {
    return `无法获取${city}的天气信息`;
  }
}

function getIndoorActivities() {
  return "推荐室内活动：博物馆、电影院、图书馆、购物中心、咖啡馆";
}

const model = "gpt-5.4";

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // 添加 Agent 系统提示
      const systemPrompt = {
        role: "system",
        content: `你是一个 ReAct Agent。对于用户的任务，你需要：
1. 思考(Thought)：分析当前情况，决定下一步
2. 行动(Action)：调用工具执行操作
3. 观察(Observation)：查看工具返回结果
4. 重复上述过程，直到完成任务

重要：你必须根据工具返回的实际结果来决策，不要假设结果。`,
      };

      let currentMessages = [systemPrompt, ...messages];
      const maxIterations = 10;
      let iteration = 0;

      console.log("[Agent 启动] 初始消息数:", currentMessages.length);

      try {
        while (iteration < maxIterations) {
          iteration++;

          console.log(`[轮次 ${iteration}] 开始请求 AI`);

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
                messages: currentMessages,
                tools,
                tool_choice: "auto",
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[API 错误] ${response.status}:`, errorText);
            throw new Error(`API 请求失败: ${response.status} ${errorText}`);
          }

          const data = await response.json();
          const aiMessage = data.choices[0].message;

          if (!aiMessage.content) {
            aiMessage.content = null;
          }

          // 如果 AI 不调用工具，说明任务完成
          if (!aiMessage.tool_calls) {
            send({ type: "message", content: aiMessage.content });
            controller.close();
            return;
          }

          // 发送思考过程（从 AI 的 content 中提取）
          if (aiMessage.content) {
            send({ type: "thought", content: aiMessage.content });
          }

          // 并行执行所有工具
          const toolPromises = aiMessage.tool_calls.map(async (toolCall: any) => {
            const functionName = toolCall.function.name;
            let toolResult = "";

            // 发送行动
            const args = JSON.parse(toolCall.function.arguments);
            send({ type: "action", tool: functionName, args });

            try {
              if (functionName === "getCurrentTime") {
                toolResult = getCurrentTime();
              } else if (functionName === "getWeather") {
                toolResult = await getWeather(args.city);
              } else if (functionName === "getIndoorActivities") {
                toolResult = getIndoorActivities();
              } else {
                toolResult = `错误：未知工具 ${functionName}`;
              }
            } catch (error: any) {
              toolResult = `工具执行失败: ${error.message || String(error)}`;
            }

            // 发送观察结果
            send({ type: "observation", content: toolResult });

            return {
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult,
            };
          });

          const toolMessages = await Promise.all(toolPromises);
          currentMessages = [...currentMessages, aiMessage, ...toolMessages];
        }

        send({ type: "error", content: "达到最大迭代次数" });
        controller.close();
      } catch (error: any) {
        console.error("[Agent 错误]", error);
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

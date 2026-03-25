/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

// 工具定义
const tools = [
  {
    type: "function",
    function: {
      name: "getCurrentTime",
      description: "获取当前的日期和时间",
      parameters: {
        type: "object",
        properties: {},
      },
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
          city: {
            type: "string",
            description: "城市名称，例如：北京、上海",
          },
        },
        required: ["city"],
      },
    },
  },
];

// 工具实现
function getCurrentTime() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function getWeather(city: string) {
  // 使用和风天气免费 API（无需 key）
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;

  return fetch(url)
    .then(res => res.json())
    .then(data => {
      const current = data.current_condition[0];
      const temp = current.temp_C;
      const desc = current.lang_zh[0].value;
      return `${city}：${desc}，${temp}°C`;
    })
    .catch(() => `无法获取${city}的天气信息`);
}

const model = "gpt-5.4";

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  let currentMessages = [...messages];
  const maxIterations = 5; // 防止无限循环
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // 请求 AI
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

    const data = await response.json();
    const aiMessage = data.choices[0].message;

    if (!aiMessage.content) {
      aiMessage.content = null;
    }

    console.log(`[轮次 ${iteration}] AI 响应:`, aiMessage);

    // 如果 AI 不调用工具，返回最终答案
    if (!aiMessage.tool_calls) {
      return NextResponse.json({
        message: aiMessage.content,
        toolCalls: null
      });
    }

    // 提取工具调用信息（用于前端显示）
    const toolCallsInfo = aiMessage.tool_calls.map((tc: any) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments),
    }));

    // 并行执行所有工具调用
    const toolPromises = aiMessage.tool_calls.map(async (toolCall: any) => {
      const functionName = toolCall.function.name;
      let toolResult = "";
      try {
        if (functionName === "getCurrentTime") {
          toolResult = getCurrentTime();
        } else if (functionName === "getWeather") {
          const args = JSON.parse(toolCall.function.arguments);
          toolResult = await getWeather(args.city);
        } else {
          toolResult = `错误：未知工具 ${functionName}`;
        }

        console.log(`[工具执行成功] ${functionName}:`, toolResult);
      } catch (error: any) {
        toolResult = `工具执行失败: ${error.message || String(error)}`;
        console.error(`[工具执行失败] ${functionName}:`, error);
      }

      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      };
    });

    const toolMessages = await Promise.all(toolPromises);

    // 更新消息历史
    currentMessages = [...currentMessages, aiMessage, ...toolMessages];
  }

  return NextResponse.json({
    message: "达到最大调用次数限制",
    toolCalls: null
  });
}

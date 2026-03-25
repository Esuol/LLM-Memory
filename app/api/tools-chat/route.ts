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

  // 第一次调用：让 AI 判断是否需要工具
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
        messages,
        tools,
        tool_choice: "auto",
      }),
    }
  );

  const data = await response.json();
  const aiMessage = data.choices[0].message;

  // 确保 aiMessage 有 content 字段
  if (!aiMessage.content) {
    aiMessage.content = null;
  }

  console.log('aiMessage', aiMessage);

  // 检查 AI 是否要调用工具
  if (aiMessage.tool_calls) {
    const toolCall = aiMessage.tool_calls[0];
    const functionName = toolCall.function.name;

    // 执行工具
    let toolResult = "";
    if (functionName === "getCurrentTime") {
      toolResult = getCurrentTime();
    } else if (functionName === "getWeather") {
      const args = JSON.parse(toolCall.function.arguments);
      toolResult = await getWeather(args.city);
    }

    console.log('toolResult:', toolResult);
    console.log('toolCall.id:', toolCall.id);

    // 把工具结果返回给 AI
    const finalMessages = [
      ...messages,
      aiMessage,
      {
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      },
    ];
    console.log('finalMessages:', JSON.stringify(finalMessages, null, 2));
    const finalResponse = await fetch(
      `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: finalMessages,
        }),
      }
    );

    const finalData = await finalResponse.json();
    console.log('finalData:', finalData);
    console.log('final message:', finalData.choices[0].message);
    return NextResponse.json({ message: finalData.choices[0].message.content });
  }



  // AI 不需要工具，直接返回
  return NextResponse.json({ message: aiMessage.content });
}

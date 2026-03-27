/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// ==================== 记忆系统 ====================

interface Memory {
  id: string;
  content: string;
  timestamp: number;
  type: "preference" | "task" | "fact";
}

class MemorySystem {
  private memoryFile: string;
  private memories: Memory[] = [];

  constructor() {
    this.memoryFile = path.join(process.cwd(), "agent_memory.json");
    this.loadMemories();
  }

  private loadMemories() {
    try {
      if (fs.existsSync(this.memoryFile)) {
        const data = fs.readFileSync(this.memoryFile, "utf-8");
        this.memories = JSON.parse(data);
      }
    } catch (error) {
      console.error("[记忆系统] 加载失败:", error);
      this.memories = [];
    }
  }

  private saveMemories() {
    try {
      fs.writeFileSync(this.memoryFile, JSON.stringify(this.memories, null, 2));
    } catch (error) {
      console.error("[记忆系统] 保存失败:", error);
    }
  }

  // 添加记忆
  addMemory(content: string, type: Memory["type"]) {
    const memory: Memory = {
      id: Date.now().toString(),
      content,
      timestamp: Date.now(),
      type,
    };
    this.memories.push(memory);
    this.saveMemories();
    return memory;
  }

  // 检索相关记忆（简单的关键词匹配，生产环境应使用向量相似度）
  retrieveMemories(query: string, limit: number = 3): Memory[] {
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = this.memories.map((memory) => {
      const content = memory.content.toLowerCase();
      let score = 0;

      // 关键词匹配
      for (const keyword of keywords) {
        if (content.includes(keyword)) score += 2;
      }

      // 语义相关性（简单规则）
      if ((keywords.some(k => ['名字', '叫', '称呼', '谁'].includes(k)) && content.includes('叫')) ||
          (keywords.some(k => ['喜欢', '偏好', '风格'].includes(k)) && memory.type === 'preference')) {
        score += 1;
      }

      return { memory, score };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.memory);
  }

  // 获取最近的记忆
  getRecentMemories(limit: number = 5): Memory[] {
    return this.memories
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // 清空记忆
  clearMemories() {
    this.memories = [];
    this.saveMemories();
  }
}

// ==================== 工作记忆 ====================

interface TaskState {
  goal: string;
  steps: string[];
  completedSteps: string[];
  currentStep: string | null;
  results: Record<string, any>;
}

class WorkingMemory {
  private state: TaskState | null = null;

  initTask(goal: string) {
    this.state = {
      goal,
      steps: [],
      completedSteps: [],
      currentStep: null,
      results: {},
    };
  }

  addStep(step: string) {
    if (this.state) {
      this.state.steps.push(step);
    }
  }

  setCurrentStep(step: string) {
    if (this.state) {
      this.state.currentStep = step;
    }
  }

  completeStep(step: string, result: any) {
    if (this.state) {
      this.state.completedSteps.push(step);
      this.state.results[step] = result;
      this.state.currentStep = null;
    }
  }

  getState(): TaskState | null {
    return this.state;
  }

  getSummary(): string {
    if (!this.state) return "无任务";
    return `目标: ${this.state.goal}\n已完成: ${this.state.completedSteps.length}/${this.state.steps.length} 步`;
  }
}

// ==================== 工具定义 ====================

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
      name: "saveMemory",
      description: "保存重要信息到长期记忆（用户偏好、重要事实等）",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "要保存的内容" },
          type: {
            type: "string",
            enum: ["preference", "task", "fact"],
            description: "记忆类型",
          },
        },
        required: ["content", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recallMemory",
      description: "从长期记忆中检索相关信息",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "检索关键词" },
        },
        required: ["query"],
      },
    },
  },
];

// ==================== 工具实现 ====================

const memorySystem = new MemorySystem();

function getCurrentTime() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

async function getWeather(city: string) {
  // 使用 Open-Meteo API（免费，无需 API key）
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

function saveMemory(content: string, type: Memory["type"]) {
  const memory = memorySystem.addMemory(content, type);
  return `已保存到长期记忆 (ID: ${memory.id})`;
}

function recallMemory(query: string) {
  const memories = memorySystem.retrieveMemories(query, 3);
  if (memories.length === 0) {
    return "未找到相关记忆";
  }
  return memories
    .map((m) => `[${m.type}] ${m.content}`)
    .join("\n");
}

const model = "gpt-5.4";

// ==================== API 路由 ====================

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // 初始化工作记忆
      const workingMemory = new WorkingMemory();

      // 检索相关长期记忆
      const recentMemories = memorySystem.getRecentMemories(5);
      const lastUserMessage = messages[messages.length - 1]?.content || "";
      const relevantMemories = memorySystem.retrieveMemories(lastUserMessage, 3);

      // 构建增强的系统提示
      let memoryContext = "";
      if (recentMemories.length > 0) {
        memoryContext += "\n\n最近记忆：\n" + recentMemories.map((m) => `- [${m.type}] ${m.content}`).join("\n");
      }
      if (relevantMemories.length > 0 && relevantMemories.some(m => !recentMemories.includes(m))) {
        memoryContext += "\n\n相关记忆：\n" + relevantMemories.filter(m => !recentMemories.includes(m)).map((m) => `- ${m.content}`).join("\n");
      }

      const systemPrompt = {
        role: "system",
        content: `你是一个具有记忆能力的 AI Agent。

你有三种记忆：
1. 短期记忆：当前对话历史（自动管理）
2. 长期记忆：用户偏好、历史任务、重要事实（使用 saveMemory/recallMemory 工具）
3. 工作记忆：当前任务的执行状态（自动管理）

工作流程：
1. 分析用户请求，检索相关长期记忆
2. 规划任务步骤
3. 执行工具调用
4. 保存重要信息到长期记忆
5. 返回结果

重要原则：
- 用户提到偏好时，使用 saveMemory 保存
- 需要回忆历史信息时，使用 recallMemory 检索
- 根据记忆调整回答（如用户喜欢简洁回答，就简洁回答）
${memoryContext}`,
      };

      let currentMessages = [systemPrompt, ...messages];
      const maxIterations = 10;
      let iteration = 0;

      console.log("[记忆 Agent 启动] 相关记忆数:", relevantMemories.length);

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
            throw new Error(`API 请求失败: ${response.status}`);
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

          // 发送思考过程
          if (aiMessage.content) {
            send({ type: "thought", content: aiMessage.content });
          }

          // 并行执行所有工具
          const toolPromises = aiMessage.tool_calls.map(async (toolCall: any) => {
            const functionName = toolCall.function.name;
            let toolResult = "";

            const args = JSON.parse(toolCall.function.arguments);
            send({ type: "action", tool: functionName, args });

            try {
              if (functionName === "getCurrentTime") {
                toolResult = getCurrentTime();
              } else if (functionName === "getWeather") {
                toolResult = await getWeather(args.city);
              } else if (functionName === "saveMemory") {
                toolResult = saveMemory(args.content, args.type);
              } else if (functionName === "recallMemory") {
                toolResult = recallMemory(args.query);
              } else {
                toolResult = `错误：未知工具 ${functionName}`;
              }
            } catch (error: any) {
              toolResult = `工具执行失败: ${error.message || String(error)}`;
            }

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

# Lesson 2: Tools (工具调用) - 总结

## 核心知识点

### 1. 工具调用基础

**什么是工具？**
- 让 AI 能调用外部功能（获取时间、查询天气、计算等）
- AI 通过 `description` 判断何时调用工具
- 执行流程：AI 判断 → 执行工具 → 返回结果 → AI 生成答案

**工具定义格式：**
```typescript
const tools = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "获取指定城市的天气信息",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" }
        },
        required: ["city"]
      }
    }
  }
];
```

### 2. 多轮工具调用

**问题：** 有些问题需要多次调用工具才能回答（如"北京和上海哪个更热？"）

**解决方案：** 用循环持续检查 AI 是否还需要调用工具

```typescript
while (iteration < maxIterations) {
  // 1. 请求 AI
  const aiMessage = await callAI(currentMessages);

  // 2. 如果不调用工具，返回答案
  if (!aiMessage.tool_calls) {
    return aiMessage.content;
  }

  // 3. 执行工具
  const toolMessages = await executeTools(aiMessage.tool_calls);

  // 4. 更新历史
  currentMessages = [...currentMessages, aiMessage, ...toolMessages];
}
```

**关键点：**
- 设置 `maxIterations` 防止无限循环
- 每轮都把 AI 响应和工具结果追加到历史

### 3. 并行工具调用

**问题：** 串行执行多个工具很慢（2秒 + 2秒 + 2秒 = 6秒）

**解决方案：** 用 `Promise.all` 并行执行

```typescript
// 串行（慢）
for (const toolCall of aiMessage.tool_calls) {
  await getWeather(args.city);  // 一个一个等
}

// 并行（快）
const toolPromises = aiMessage.tool_calls.map(async (toolCall) => {
  return await getWeather(args.city);  // 同时执行
});
await Promise.all(toolPromises);
```

**性能提升：** 3 个工具从 6 秒降到 2 秒

### 4. 错误处理

**问题：** 工具执行失败会导致整个请求崩溃

**解决方案：** 用 `try-catch` 捕获错误，把错误信息返回给 AI

```typescript
try {
  toolResult = await getWeather(args.city);
} catch (error) {
  toolResult = `工具执行失败: ${error.message}`;
}

// 把错误信息返回给 AI，让 AI 决定如何处理
return {
  role: "tool",
  tool_call_id: toolCall.id,
  content: toolResult  // 可能是成功结果，也可能是错误信息
};
```

**关键点：**
- 不要直接抛出异常
- 让 AI 根据错误信息调整策略

### 5. 流式响应（SSE）

**问题：** 用户看不到 AI 在做什么，等待时体验差

**解决方案：** 用 Server-Sent Events 实时推送工具调用状态

**后端（发送流）：**
```typescript
const stream = new ReadableStream({
  async start(controller) {
    const send = (data) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    // 发送工具调用
    send({ type: "tool_call", name: "getWeather", args: {city: "北京"} });

    // 发送工具结果
    send({ type: "tool_result", result: "北京：晴，25°C" });

    // 发送最终答案
    send({ type: "message", content: "今天北京天气不错" });
  }
});

return new Response(stream, {
  headers: { "Content-Type": "text/event-stream" }
});
```

**前端（接收流）：**
```typescript
const reader = res.body?.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  // 解析 "data: {...}\n\n" 格式
  if (line.startsWith("data: ")) {
    const data = JSON.parse(line.slice(6));

    if (data.type === "tool_call") {
      setToolStatus((prev) => [...prev, `🔧 ${data.name}...`]);
    }
  }
}
```

**效果：**
```
user: 北京天气如何？
🔧 查询天气(北京)
✅ 查询天气: 北京：晴，25°C
✅ 所有工具执行完成
assistant: 今天北京天气不错，晴天，25°C
```

## 技术要点总结

| 功能 | 关键技术 | 作用 |
|------|---------|------|
| 多轮调用 | while 循环 | 支持复杂任务 |
| 并行执行 | Promise.all | 提升性能 3 倍 |
| 错误处理 | try-catch | 优雅降级 |
| 实时反馈 | SSE 流式响应 | 提升用户体验 |

## 完整代码结构

```
app/
├── lesson/lesson2-tools/
│   ├── page.tsx          # 前端界面（SSE 接收）
│   └── summary.md        # 本文档
└── api/tools-chat/
    └── route.ts          # 后端 API（SSE 发送）
```

## 学习成果

你现在掌握了：
- ✅ 定义和执行工具
- ✅ 处理多轮和并行工具调用
- ✅ 优雅的错误处理
- ✅ 实时显示工具调用过程（SSE）
- ✅ 用户体验优化（友好名称、参数显示）

## 练习任务

1. 添加一个新工具（如计算器、翻译）
2. 测试错误处理：查询不存在的城市
3. 观察 Network 标签中的 SSE 连接
4. 思考：如何实现工具调用的重试机制？

## 下一步

**Lesson 3: Agent（自主决策）** 将学习：
- 如何让 AI 自主规划任务步骤
- 如何组合多个工具完成复杂任务
- 如何处理工具调用失败后的策略调整

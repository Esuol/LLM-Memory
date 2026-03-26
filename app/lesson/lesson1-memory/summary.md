# Lesson 1: Memory (对话记忆) - 总结

## 核心知识点

### 1. 为什么需要记忆？
- LLM 本身是无状态的，每次请求独立
- 需要手动传递历史消息才能实现多轮对话
- 记忆机制让 AI 能理解上下文

### 2. 记忆的实现原理
```typescript
// 每次请求都带上完整历史
const messages = [
  { role: "user", content: "我叫张三" },
  { role: "assistant", content: "你好，张三！" },
  { role: "user", content: "我叫什么？" },  // 新消息
];
```

### 3. 消息格式
- `role`: "user" | "assistant" | "system"
- `content`: 消息内容
- 按时间顺序排列

### 4. 前端实现
```typescript
const [messages, setMessages] = useState([]);

// 发送消息时追加历史
const newMessages = [...messages, userMessage];
setMessages(newMessages);

// 请求时带上完整历史
fetch("/api/chat", {
  body: JSON.stringify({ messages: newMessages })
});
```

### 5. 后端实现
```typescript
export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  // 直接把历史传给 LLM
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages,  // 完整历史
  });
}
```

## 关键要点

- **状态管理**: 用 React state 保存消息历史
- **消息追加**: 每次对话都追加到数组末尾
- **完整传递**: 每次请求都传递完整历史
- **简单有效**: 不需要数据库，内存中保存即可

## 局限性

- 消息越多，token 消耗越大
- 刷新页面会丢失历史
- 没有长期记忆（跨会话）

## 下一步

Lesson 2 将学习如何让 AI 调用外部工具（如查询天气、获取时间）。

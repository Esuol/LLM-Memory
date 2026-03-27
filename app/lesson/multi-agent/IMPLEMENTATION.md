# 多 Agent 协作 - 实现分析

## 实现架构

### Plan-Execute 模式

```
用户请求
  ↓
PlannerAgent（规划）→ 拆解任务列表
  ↓
WorkerAgent（执行）→ 并行执行所有任务
  ↓
CoordinatorAgent（汇总）→ 整合结果返回
```

## 两种实现方式对比

### 1. 简化版（函数调用）

**文件**：`app/api/multi-agent/route.ts`

**特点**：
- Agent 通过函数调用直接传递数据
- 同步执行流程，易于理解
- 适合学习和原型验证

**核心代码**：
```typescript
// 1. 规划
const tasks = await planner.plan(userRequest, send);

// 2. 并行执行
const results = await Promise.all(
  tasks.map((task) => worker.execute(task, send))
);

// 3. 汇总
const answer = await coordinator.synthesize(results, userRequest, send);
```

**优点**：
- ✅ 代码简洁（~150 行）
- ✅ 调试容易
- ✅ 性能高（无消息队列开销）

**缺点**：
- ❌ Agent 耦合（直接调用）
- ❌ 无法分布式部署
- ❌ 难以追踪消息流

---

### 2. 消息队列版

**文件**：`app/api/multi-agent-queue/route.ts`

**特点**：
- Agent 通过消息队列通信
- 完全解耦，事件驱动
- 接近生产级架构

**核心代码**：

#### 消息队列实现
```typescript
class MessageQueue {
  private queue: Message[] = [];
  private handlers: Map<string, (msg: Message) => void> = new Map();

  // 发送消息
  send(msg: Message) {
    this.queue.push(msg);
    const handler = this.handlers.get(msg.to);
    if (handler) handler(msg);
  }

  // 订阅消息
  subscribe(agentId: string, handler: (msg: Message) => void) {
    this.handlers.set(agentId, handler);
  }
}
```

#### Agent 消息驱动
```typescript
class PlannerAgent {
  constructor(private queue: MessageQueue) {
    // 订阅消息
    this.queue.subscribe("planner", (msg) => this.handleMessage(msg));
  }

  async handleMessage(msg: Message) {
    if (msg.type === "task") {
      const tasks = await this.plan(msg.content);

      // 发送任务到 Worker
      tasks.forEach((task) => {
        this.queue.send({
          from: "planner",
          to: "worker",
          type: "task",
          content: task,
        });
      });
    }
  }
}
```

#### 消息流
```typescript
// 1. 用户 → Planner
queue.send({ from: "user", to: "planner", type: "task", content: "对比天气" });

// 2. Planner → Worker（多条）
queue.send({ from: "planner", to: "worker", type: "task", content: task1 });
queue.send({ from: "planner", to: "worker", type: "task", content: task2 });

// 3. Worker → Coordinator（多条）
queue.send({ from: "worker", to: "coordinator", type: "result", content: result1 });
queue.send({ from: "worker", to: "coordinator", type: "result", content: result2 });

// 4. Coordinator → System
queue.send({ from: "coordinator", to: "system", type: "done", content: answer });
```

**优点**：
- ✅ Agent 完全解耦（不知道彼此存在）
- ✅ 可追踪消息流（调试友好）
- ✅ 易于扩展（新增 Agent 只需订阅消息）
- ✅ 可分布式（消息队列换成 Redis/RabbitMQ）

**缺点**：
- ❌ 代码复杂度增加（~250 行）
- ❌ 异步流程难以理解
- ❌ 消息队列有性能开销

---

## 三个 Agent 的职责

### PlannerAgent（规划者）

**职责**：将用户请求拆解为独立任务

**输入**：用户请求（"对比北京、上海、广州的天气"）

**输出**：任务列表
```json
{
  "tasks": [
    {"action": "getWeather", "args": {"city": "北京"}},
    {"action": "getWeather", "args": {"city": "上海"}},
    {"action": "getWeather", "args": {"city": "广州"}}
  ]
}
```

**关键技术**：
- 使用 `response_format: { type: "json_object" }` 强制 JSON 输出
- 兜底策略：解析失败时使用正则提取城市名

---

### WorkerAgent（执行者）

**职责**：执行具体工具调用

**输入**：单个任务
```json
{"id": "task-0", "action": "getWeather", "args": {"city": "北京"}}
```

**输出**：执行结果
```
"北京：晴，5°C"
```

**特点**：
- 无状态（每次执行独立）
- 可并行（多个 Worker 同时执行）
- 可扩展（支持更多工具）

---

### CoordinatorAgent（协调者）

**职责**：收集所有结果并汇总

**输入**：
- 任务总数：3
- 执行结果：["北京：晴，5°C", "上海：多云，15°C", "广州：晴，22°C"]
- 用户请求："对比北京、上海、广州的天气"

**输出**：最终答案
```
根据当前天气：
- 广州最暖和（22°C）
- 上海适中（15°C）
- 北京最冷（5°C）
建议去广州旅游。
```

**关键逻辑**：
```typescript
// 等待所有结果
if (this.results.length === this.totalTasks) {
  await this.synthesize();  // 汇总
}
```

---

## 并行执行实现

### 简化版
```typescript
// Promise.all 并行执行
const results = await Promise.all(
  tasks.map((task) => worker.execute(task, send))
);
```

### 消息队列版
```typescript
// 发送多条消息，Worker 自动并行处理
tasks.forEach((task) => {
  queue.send({ to: "worker", type: "task", content: task });
});
```

**性能对比**：
- 串行执行：3 个城市 = 3 秒
- 并行执行：3 个城市 = 1 秒（最慢的那个）

---

## 错误处理

### Planner 解析失败
```typescript
// 1. 尝试解析 JSON
const parsed = safeParseJsonObject(content);

// 2. 解析失败，使用兜底策略
if (!parsed) {
  const tasks = fallbackTasksFromUserRequest(userRequest);
  // 正则提取城市名：/北京|上海|广州/
}
```

### Worker 执行失败
```typescript
try {
  result = await getWeather(city);
} catch (error) {
  result = `无法获取${city}的天气信息`;
}
```

### Coordinator 超时
```typescript
// 设置超时：如果 30 秒内未收到所有结果
setTimeout(() => {
  if (this.results.length < this.totalTasks) {
    this.synthesize();  // 用部分结果汇总
  }
}, 30000);
```

---

## 与理论文档的对应

### MULTI_AGENT_ANALYSIS.md 理论

**三种架构模式**：
1. Plan-Execute（已实现）
2. Master-Worker（未实现）
3. Pipeline（未实现）

**通信方式**：
- 消息传递（已实现：消息队列版）
- 共享内存（未实现）

**核心问题**：
- Agent 间通信 ✅
- 避免冲突 ⚠️（单线程无冲突）
- 处理失败 ✅（兜底策略）

---

## 生产级优化方向

### 1. 持久化消息队列
```typescript
// 当前：内存队列
class MessageQueue {
  private queue: Message[] = [];
}

// 生产：Redis/RabbitMQ
import { Queue } from 'bull';
const queue = new Queue('agent-messages', {
  redis: { host: 'localhost', port: 6379 }
});
```

### 2. Agent 池化
```typescript
// 当前：单个 Worker
new WorkerAgent(queue, send);

// 生产：Worker 池
const workers = Array.from({ length: 10 }, (_, i) =>
  new WorkerAgent(`worker-${i}`, queue, send)
);
```

### 3. 分布式部署
```
机器 1: PlannerAgent + CoordinatorAgent
机器 2-4: WorkerAgent (10 个实例)
通信: Redis Pub/Sub
```

### 4. 监控与追踪
```typescript
// 记录消息流
queue.send({
  ...msg,
  timestamp: Date.now(),
  traceId: generateTraceId(),
});

// 可视化消息流
[User] → [Planner] → [Worker-1] → [Coordinator]
                   → [Worker-2] ↗
                   → [Worker-3] ↗
```

---

## 测试场景

### 场景 1：正常流程
```
输入: "对比北京、上海、广州的天气"

日志:
[Planner] 拆解为 3 个任务
[Worker] 执行 task-0: getWeather({"city":"北京"})
[Worker] 执行 task-1: getWeather({"city":"上海"})
[Worker] 执行 task-2: getWeather({"city":"广州"})
[Worker] task-0 完成: 北京：晴，5°C
[Worker] task-1 完成: 上海：多云，15°C
[Worker] task-2 完成: 广州：晴，22°C
[Coordinator] 收到结果 3/3
[Coordinator] 汇总完成

输出: "广州最暖和（22°C），建议去广州旅游。"
```

### 场景 2：Planner 解析失败
```
输入: "北京天气"

日志:
[Planner] 模型未返回合法 JSON，已使用兜底任务策略
[Planner] 拆解为 1 个任务

输出: "北京：晴，5°C"
```

### 场景 3：Worker 执行失败
```
输入: "对比火星和木星的天气"

日志:
[Worker] task-0 完成: 无法获取火星的天气信息
[Worker] task-1 完成: 无法获取木星的天气信息

输出: "抱歉，无法获取这些地点的天气信息。"
```

---

## 关键代码片段

### 强制 JSON 输出
```typescript
response_format: { type: "json_object" }
```

### 安全解析 JSON
```typescript
function safeParseJsonObject(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1));
  }
}
```

### 兜底任务生成
```typescript
function fallbackTasksFromUserRequest(userRequest: string) {
  const weatherMatch = userRequest.match(/北京|上海|广州/);
  if (weatherMatch) {
    return [{ action: "getWeather", args: { city: weatherMatch[0] } }];
  }
  return [];
}
```

---

## 下一步扩展

### 支持更多工具
```typescript
const tools = [
  { name: "getWeather", ... },
  { name: "searchRestaurant", ... },
  { name: "bookHotel", ... },
];
```

### 支持任务依赖
```typescript
{
  "tasks": [
    { "id": "1", "action": "getWeather", "depends": [] },
    { "id": "2", "action": "bookHotel", "depends": ["1"] }  // 依赖任务 1
  ]
}
```

### 支持条件分支
```typescript
// 如果北京下雨，推荐室内活动
if (weatherResult.includes("雨")) {
  queue.send({ to: "worker", type: "task", content: getIndoorActivities });
}
```

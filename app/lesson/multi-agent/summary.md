# 多 Agent 协作 - 模块总结

## 学习收获

### 1. Plan-Execute 架构模式
- **规划者（Planner）**：将复杂任务拆解为独立子任务
- **执行者（Worker）**：并行执行具体工具调用
- **协调者（Coordinator）**：收集结果并汇总回答

### 2. 两种实现方式

#### 简化版（函数调用）
- Agent 通过函数直接传递数据
- 代码简洁，易于理解
- 适合学习和原型验证

#### 消息队列版
- Agent 通过消息队列通信
- 完全解耦，事件驱动
- 接近生产级架构

### 3. 核心优势
- **并行执行**：3 个城市天气查询从 3 秒降到 1 秒
- **职责分离**：每个 Agent 专注单一职责
- **可扩展性**：新增 Agent 不影响现有逻辑

## 关键代码要点

### 并行执行
```typescript
// 简化版：Promise.all
const results = await Promise.all(
  tasks.map((task) => worker.execute(task, send))
);

// 消息队列版：发送多条消息
tasks.forEach((task) => {
  queue.send({ to: "worker", type: "task", content: task });
});
```

### 消息驱动
```typescript
class MessageQueue {
  send(msg: Message) {
    const handler = this.handlers.get(msg.to);
    if (handler) handler(msg);
  }

  subscribe(agentId: string, handler: (msg: Message) => void) {
    this.handlers.set(agentId, handler);
  }
}
```

### 强制 JSON 输出
```typescript
response_format: { type: "json_object" }  // 防止 AI 返回自然语言
```

### 兜底策略
```typescript
// Planner 解析失败时，正则提取城市名
function fallbackTasksFromUserRequest(userRequest: string) {
  const weatherMatch = userRequest.match(/北京|上海|广州/);
  if (weatherMatch) {
    return [{ action: "getWeather", args: { city: weatherMatch[0] } }];
  }
  return [];
}
```

## 架构对比

| 特性 | 简化版 | 消息队列版 |
|------|--------|-----------|
| **代码行数** | ~150 行 | ~250 行 |
| **Agent 耦合** | 直接调用 | 完全解耦 |
| **调试难度** | 易 | 中 |
| **可追踪性** | 无 | 有（消息流） |
| **分布式** | 不支持 | 支持 |
| **适用场景** | 学习/原型 | 生产环境 |

## 测试场景验证

✅ **场景 1**：正常流程 → 3 个任务并行执行 → 汇总结果
✅ **场景 2**：Planner 解析失败 → 兜底策略提取城市名 → 仍能执行
✅ **场景 3**：Worker 执行失败 → 返回错误信息 → Coordinator 处理部分结果

## 与理论的对应

### MULTI_AGENT_ANALYSIS.md 理论
- ✅ Plan-Execute 模式（已实现）
- ⚠️ Master-Worker 模式（未实现）
- ⚠️ Pipeline 模式（未实现）

### 通信方式
- ✅ 消息传递（消息队列版）
- ❌ 共享内存（未实现）

### 核心问题
- ✅ Agent 间通信（消息队列）
- ✅ 处理失败（兜底策略 + 错误处理）
- ⚠️ 避免冲突（单线程无冲突，分布式需要锁）

## 生产级优化方向

### 1. 持久化消息队列
```typescript
// 当前：内存队列（进程重启丢失）
// 生产：Redis/RabbitMQ（持久化）
import { Queue } from 'bull';
const queue = new Queue('agent-messages', {
  redis: { host: 'localhost', port: 6379 }
});
```

### 2. Agent 池化
```typescript
// 当前：单个 Worker
// 生产：Worker 池（10 个实例）
const workers = Array.from({ length: 10 }, (_, i) =>
  new WorkerAgent(`worker-${i}`, queue, send)
);
```

### 3. 分布式部署
```
机器 1: PlannerAgent + CoordinatorAgent
机器 2-4: WorkerAgent (每台 10 个实例)
通信: Redis Pub/Sub
```

### 4. 监控与追踪
```typescript
// 记录消息流，生成 traceId
queue.send({
  ...msg,
  timestamp: Date.now(),
  traceId: generateTraceId(),
});

// 可视化
[User] → [Planner] → [Worker-1] → [Coordinator]
                   → [Worker-2] ↗
                   → [Worker-3] ↗
```

## 下一步方向

### 已完成
- ✅ 模块 A：记忆增强 Agent
- ✅ 模块 B：多 Agent 协作（Plan-Execute + 消息队列）

### 待学习
- **模块 C**：Agent 规划能力（任务分解、依赖管理、条件分支）
- **模块 D**：工具生态系统（动态工具注册、工具组合）
- **模块 E**：评估与反思（自我评估、策略优化）

## 扩展方向

### 1. 支持更多架构模式
- Master-Worker（主从协作）
- Pipeline（流水线）

### 2. 支持任务依赖
```json
{
  "tasks": [
    { "id": "1", "action": "getWeather", "depends": [] },
    { "id": "2", "action": "bookHotel", "depends": ["1"] }
  ]
}
```

### 3. 支持条件分支
```typescript
if (weatherResult.includes("雨")) {
  queue.send({ to: "worker", type: "task", content: getIndoorActivities });
}
```

### 4. 支持更多工具
```typescript
const tools = [
  { name: "getWeather" },
  { name: "searchRestaurant" },
  { name: "bookHotel" },
  { name: "searchFlight" },
];
```

## 关键收获

1. **架构选择**：简化版适合学习，消息队列版适合生产
2. **并行优化**：Promise.all 或消息队列实现并行执行
3. **错误处理**：兜底策略 + 安全解析 JSON
4. **解耦设计**：消息队列让 Agent 完全独立
5. **可扩展性**：新增 Agent 只需订阅消息，无需修改现有代码

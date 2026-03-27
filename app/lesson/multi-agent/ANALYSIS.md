# 多 Agent 协作 - 深度解析

## 一、为什么需要多 Agent？

### 单 Agent 的局限

**问题：** 一个 Agent 要做所有事情，能力不够专业

```
用户: "分析这段代码的性能问题，并生成优化报告"

单 Agent:
  ❌ 既要懂代码分析
  ❌ 又要懂报告撰写
  ❌ 还要懂性能优化
  → 样样都做，样样不精
```

### 多 Agent 协作的优势

**解决方案：** 专业分工，各司其职

```
用户: "分析这段代码的性能问题，并生成优化报告"

规划 Agent (Planner):
  💭 "这个任务需要3步：代码分析 → 性能测试 → 报告生成"
  → 拆解任务，分配给专业 Agent

代码分析 Agent (Analyzer):
  🔍 分析代码结构、复杂度、瓶颈
  → 返回分析结果

性能测试 Agent (Tester):
  ⚡ 运行性能测试，收集数据
  → 返回测试报告

报告生成 Agent (Writer):
  📝 整合分析和测试结果，生成专业报告
  → 返回最终报告

汇总 Agent (Coordinator):
  ✅ 整合所有结果，返回给用户
```

---

## 二、多 Agent 架构模式

### 模式 1：规划者-执行者 (Plan-Execute)

```
用户请求
  ↓
规划 Agent → 拆解任务 → [任务1, 任务2, 任务3]
  ↓
执行 Agent 1 → 完成任务1
执行 Agent 2 → 完成任务2
执行 Agent 3 → 完成任务3
  ↓
汇总 Agent → 整合结果 → 返回用户
```

**特点：**
- ✅ 结构清晰
- ✅ 易于调试
- ❌ 缺乏灵活性（规划后不能调整）

**适用场景：**
- 任务步骤明确
- 不需要动态调整
- 例如：数据处理流水线

---

### 模式 2：主从协作 (Master-Worker)

```
主 Agent (Master)
  ↓
分配任务 → 工作 Agent 1 (查天气)
         → 工作 Agent 2 (订酒店)
         → 工作 Agent 3 (查航班)
  ↓
收集结果 → 决策下一步
```

**特点：**
- ✅ 可以并行执行
- ✅ 主 Agent 可以动态调整
- ❌ 主 Agent 负担重

**适用场景：**
- 任务可并行
- 需要动态调度
- 例如：爬虫系统、分布式计算

---

### 模式 3：流水线 (Pipeline)

```
用户请求
  ↓
Agent 1 (数据收集) → 输出1
  ↓
Agent 2 (数据分析) → 输出2
  ↓
Agent 3 (报告生成) → 最终结果
```

**特点：**
- ✅ 每个 Agent 专注单一任务
- ✅ 输出质量高
- ❌ 串行执行，速度慢

**适用场景：**
- 任务有明确顺序依赖
- 质量优先于速度
- 例如：内容生成、翻译校对

---

## 三、核心技术问题

### 问题 1：Agent 间如何通信？

**方案：消息传递（Message Passing）**

```typescript
interface AgentMessage {
  from: string;      // 发送者 Agent ID
  to: string;        // 接收者 Agent ID
  type: string;      // 消息类型：task/result/error
  content: any;      // 消息内容
  timestamp: number;
}

// Planner → Worker
{
  from: "planner",
  to: "worker-1",
  type: "task",
  content: { action: "getWeather", args: { city: "北京" } }
}

// Worker → Coordinator
{
  from: "worker-1",
  to: "coordinator",
  type: "result",
  content: "北京：晴，5°C"
}
```

**为什么不用共享内存？**
- ❌ 共享内存容易冲突
- ❌ 难以追踪谁修改了什么
- ✅ 消息传递更清晰、可追溯

---

### 问题 2：如何避免冲突？

**方案：任务队列 + 锁机制**

```typescript
class TaskQueue {
  private tasks: Task[] = [];
  private locks: Set<string> = new Set();

  async assignTask(agentId: string): Promise<Task | null> {
    // 找到未被锁定的任务
    const task = this.tasks.find(t => !this.locks.has(t.id));
    if (!task) return null;

    // 加锁
    this.locks.add(task.id);
    return task;
  }

  completeTask(taskId: string) {
    // 解锁
    this.locks.delete(taskId);
  }
}
```

**原则：**
- 每个任务只能被一个 Agent 执行
- 执行完成后释放锁
- 避免重复执行

---

### 问题 3：如何处理失败？

**方案：重试 + 降级**

```typescript
async function executeWithRetry(agent: Agent, task: Task, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await agent.execute(task);
      return result;
    } catch (error) {
      console.log(`[重试 ${i+1}/${maxRetries}] Agent ${agent.id} 失败`);

      if (i === maxRetries - 1) {
        // 最后一次失败，尝试降级方案
        return await fallbackAgent.execute(task);
      }
    }
  }
}
```

**策略：**
1. 重试 3 次
2. 仍失败 → 使用备用 Agent
3. 仍失败 → 标记任务失败，通知 Coordinator

---

## 四、实现架构

### 基础架构

```typescript
// 1. Agent 基类
class BaseAgent {
  id: string;
  role: string;  // planner/worker/coordinator

  async execute(task: Task): Promise<any> {
    // 子类实现
  }

  sendMessage(to: string, type: string, content: any) {
    messageQueue.push({ from: this.id, to, type, content });
  }
}

// 2. Planner Agent
class PlannerAgent extends BaseAgent {
  async execute(userRequest: string) {
    // 调用 LLM 拆解任务
    const tasks = await this.planTasks(userRequest);

    // 分配给 Worker
    for (const task of tasks) {
      this.sendMessage("worker", "task", task);
    }
  }
}

// 3. Worker Agent
class WorkerAgent extends BaseAgent {
  async execute(task: Task) {
    // 执行具体工具调用
    const result = await this.callTool(task.action, task.args);

    // 返回结果给 Coordinator
    this.sendMessage("coordinator", "result", result);
  }
}

// 4. Coordinator Agent
class CoordinatorAgent extends BaseAgent {
  async execute(results: any[]) {
    // 整合所有结果
    const finalAnswer = await this.synthesize(results);
    return finalAnswer;
  }
}
```

---

## 五、实现示例：天气对比系统

### 场景

```
用户: "对比北京和上海的天气，推荐更适合旅游的城市"
```

### 执行流程

```
1. Planner Agent 拆解任务
   💭 分析: 需要3步
   📋 任务列表:
      - Task 1: 查北京天气
      - Task 2: 查上海天气
      - Task 3: 对比并推荐

2. Worker Agent 1 执行 Task 1
   🔧 调用: getWeather("北京")
   📤 返回: "北京：晴，5°C"

3. Worker Agent 2 执行 Task 2
   🔧 调用: getWeather("上海")
   📤 返回: "上海：多云，15°C"

4. Coordinator Agent 整合结果
   💭 分析: 上海更暖和 (15°C > 5°C)
   📝 推荐: "上海天气更适合旅游，温度15°C较为舒适"
   📤 返回给用户
```

---

## 六、优势与挑战

### 优势

1. **专业化**
   - 每个 Agent 专注单一领域
   - 提高任务完成质量

2. **并行化**
   - 多个 Agent 同时工作
   - 提高执行效率

3. **可扩展**
   - 新增 Agent 不影响现有系统
   - 易于添加新能力

4. **容错性**
   - 单个 Agent 失败不影响整体
   - 可以使用备用 Agent

---

### 挑战

1. **通信开销**
   - Agent 间消息传递增加延迟
   - 需要优化消息格式

2. **协调复杂度**
   - 多个 Agent 的调度和同步
   - 需要设计良好的协调机制

3. **调试困难**
   - 多个 Agent 并行执行
   - 难以追踪问题根源

4. **成本增加**
   - 每个 Agent 都需要调用 LLM
   - Token 消耗成倍增长

---

## 七、生产级优化

### 1. Agent 池化

**问题：** 每次请求都创建新 Agent，开销大

**解决：** 使用 Agent 池

```typescript
class AgentPool {
  private workers: WorkerAgent[] = [];

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      this.workers.push(new WorkerAgent(`worker-${i}`));
    }
  }

  async getAvailableAgent(): Promise<WorkerAgent> {
    // 找到空闲的 Agent
    return this.workers.find(w => !w.isBusy()) || this.workers[0];
  }
}
```

---

### 2. 消息队列持久化

**问题：** 内存消息队列，进程重启后丢失

**解决：** 使用 Redis/RabbitMQ

```typescript
import { Queue } from 'bull';

const messageQueue = new Queue('agent-messages', {
  redis: { host: 'localhost', port: 6379 }
});

// 发送消息
await messageQueue.add({ from: 'planner', to: 'worker', content: task });

// 接收消息
messageQueue.process(async (job) => {
  const message = job.data;
  await agent.handleMessage(message);
});
```

---

### 3. 分布式部署

**问题：** 单机性能瓶颈

**解决：** 多机部署 Agent

```
机器 1: Planner Agent + Coordinator Agent
机器 2: Worker Agent 1-10
机器 3: Worker Agent 11-20
机器 4: Worker Agent 21-30
```

**通信：** 通过消息队列（Redis/Kafka）

---

## 八、对比：单 Agent vs 多 Agent

| 特性         | 单 Agent | 多 Agent |
| ------------ | -------- | -------- |
| **复杂度**   | 低       | 高       |
| **专业性**   | 通用     | 专业     |
| **并行能力** | 无       | 有       |
| **容错性**   | 差       | 好       |
| **成本**     | 低       | 高       |
| **调试难度** | 易       | 难       |
| **适用场景** | 简单任务 | 复杂任务 |

---

## 九、何时使用多 Agent？

### 使用多 Agent

✅ 任务可拆解为独立子任务
✅ 子任务需要不同专业能力
✅ 任务可并行执行
✅ 对质量要求高
✅ 有足够的预算（Token 成本）

### 使用单 Agent

✅ 任务简单，步骤少
✅ 不需要专业分工
✅ 对速度要求高
✅ 预算有限
✅ 需要快速原型验证

---

## 十、下一步学习

完成多 Agent 协作后，继续学习：

- **C. Agent 规划能力** - 任务分解与依赖管理
- **D. 工具生态系统** - 动态工具注册与组合
- **E. 评估与反思** - 自我评估与策略优化

---

## 十一、参考资源

### 论文
- AutoGPT: An Autonomous GPT-4 Experiment
- MetaGPT: Meta Programming for Multi-Agent Systems
- Communicative Agents for Software Development

### 开源项目
- AutoGPT: https://github.com/Significant-Gravitas/AutoGPT
- MetaGPT: https://github.com/geekan/MetaGPT
- CrewAI: https://github.com/joaomdmoura/crewAI

### 框架
- LangGraph: https://github.com/langchain-ai/langgraph
- AutoGen: https://github.com/microsoft/autogen

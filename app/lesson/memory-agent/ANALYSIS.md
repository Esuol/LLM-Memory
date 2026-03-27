# 记忆增强 Agent - 深度解析

## 核心概念

### 为什么需要记忆系统？

**问题：**
- Lesson 1-3 的 Agent 每次对话都是"失忆"的
- 无法记住用户偏好（如喜欢简洁回答）
- 无法利用历史任务经验
- 刷新页面后一切重来

**解决方案：三种记忆系统**

---

## 一、三种记忆系统

### 1. 短期记忆（Short-term Memory）

**定义：** 当前对话的消息历史

**实现：**
```typescript
const messages = [
  { role: "user", content: "我喜欢简洁的回答" },
  { role: "assistant", content: "好的" },
  { role: "user", content: "北京天气如何？" }  // 能看到前面的对话
];
```

**特点：**
- ✅ 自动管理，无需额外代码
- ✅ 实时可用，无延迟
- ❌ 上下文窗口有限（4K-128K tokens）
- ❌ 刷新页面消失

**适用场景：**
- 多轮对话理解
- 代词指代消解（"它"指什么）
- 上下文连贯性

---

### 2. 长期记忆（Long-term Memory）

**定义：** 持久化存储的用户偏好、历史任务、重要事实

**实现：**
```typescript
class MemorySystem {
  private memoryFile = "agent_memory.json";
  private memories: Memory[] = [];

  // 保存记忆
  addMemory(content: string, type: "preference" | "task" | "fact") {
    const memory = {
      id: Date.now().toString(),
      content,
      timestamp: Date.now(),
      type,
    };
    this.memories.push(memory);
    fs.writeFileSync(this.memoryFile, JSON.stringify(this.memories));
  }

  // 检索记忆（关键词匹配）
  retrieveMemories(query: string, limit: 3) {
    const keywords = query.toLowerCase().split(" ");
    return this.memories
      .filter(m => keywords.some(k => m.content.toLowerCase().includes(k)))
      .slice(0, limit);
  }
}
```

**特点：**
- ✅ 跨会话持久化
- ✅ 无限容量（受磁盘限制）
- ❌ 需要检索机制
- ❌ 检索可能不准确（关键词匹配）

**适用场景：**
- 用户偏好（"我喜欢简洁回答"）
- 历史任务（"上次帮我查过北京天气"）
- 领域知识（"公司政策是..."）

---

### 3. 工作记忆（Working Memory）

**定义：** 当前任务执行期间的临时状态

**实现：**
```typescript
class WorkingMemory {
  private state: TaskState = {
    goal: "查询北京和上海天气并对比",
    steps: ["查北京天气", "查上海天气", "对比结果"],
    completedSteps: ["查北京天气"],
    currentStep: "查上海天气",
    results: {
      "查北京天气": "北京：晴，24°C"
    }
  };

  completeStep(step: string, result: any) {
    this.state.completedSteps.push(step);
    this.state.results[step] = result;
  }
}
```

**特点：**
- ✅ 跟踪任务进度
- ✅ 存储中间结果
- ❌ 任务完成后清空
- ❌ 不跨会话

**适用场景：**
- 多步骤任务执行
- 中间结果传递
- 任务进度追踪

---

## 二、记忆检索策略

### 自动检索（启动时）

```typescript
// 1. 提取用户最后一条消息
const lastUserMessage = messages[messages.length - 1]?.content;

// 2. 检索相关记忆（基于相似度）
const relevantMemories = memorySystem.retrieveMemories(lastUserMessage, 3);

// 3. 获取最近记忆（基于时间）
const recentMemories = memorySystem.getRecentMemories(2);

// 4. 注入到 System Prompt
const systemPrompt = {
  role: "system",
  content: `你是 AI Agent...

相关记忆：
- 用户喜欢简洁的回答
- 用户上次问过北京天气

最近记忆：
- 用户偏好简洁风格
- 上次查询时间：2026-03-27`
};
```

**检索时机：**
- ✅ 每次对话开始时自动检索
- ✅ Agent 主动调用 `recallMemory` 工具

**检索策略：**
1. **相关性检索**：基于用户问题的关键词
2. **时间检索**：最近的 N 条记忆
3. **类型过滤**：只检索特定类型（如 preference）

---

### 主动检索（工具调用）

```typescript
// Agent 可以主动调用工具检索记忆
{
  name: "recallMemory",
  description: "从长期记忆中检索相关信息",
  parameters: {
    query: "检索关键词"
  }
}

// 示例
用户: "我之前说过什么偏好？"
Agent: 调用 recallMemory("偏好")
结果: "[preference] 用户喜欢简洁的回答"
```

---

## 三、记忆工具

### saveMemory - 保存记忆

**定义：**
```typescript
{
  name: "saveMemory",
  description: "保存重要信息到长期记忆（用户偏好、重要事实等）",
  parameters: {
    content: { type: "string", description: "要保存的内容" },
    type: {
      type: "string",
      enum: ["preference", "task", "fact"],
      description: "记忆类型"
    }
  }
}
```

**使用场景：**
```typescript
// 场景 1：用户明确表达偏好
用户: "我喜欢简洁的回答"
Agent: saveMemory("用户喜欢简洁的回答", "preference")

// 场景 2：用户提供重要事实
用户: "我的生日是 3 月 15 日"
Agent: saveMemory("用户生日：3月15日", "fact")

// 场景 3：完成重要任务
Agent: saveMemory("帮用户查询了北京天气：晴，24°C", "task")
```

**记忆类型：**
- `preference`：用户偏好（回答风格、语言习惯）
- `task`：历史任务（做过什么、结果如何）
- `fact`：重要事实（用户信息、领域知识）

---

### recallMemory - 检索记忆

**定义：**
```typescript
{
  name: "recallMemory",
  description: "从长期记忆中检索相关信息",
  parameters: {
    query: { type: "string", description: "检索关键词" }
  }
}
```

**使用场景：**
```typescript
// 场景 1：用户询问历史
用户: "我之前说过什么偏好？"
Agent: recallMemory("偏好")

// 场景 2：需要历史上下文
用户: "上次的结果是什么？"
Agent: recallMemory("上次 结果")

// 场景 3：主动应用记忆
用户: "北京天气如何？"
Agent: recallMemory("偏好") → 发现用户喜欢简洁 → 简洁回答
```

---

## 四、完整执行流程

### 示例：保存并应用偏好

**第一次对话：**
```
用户: "我喜欢简洁的回答，不要啰嗦"

[启动时检索]
- 相关记忆：无
- 最近记忆：无

[Agent 思考]
💭 思考: 用户表达了偏好，我应该保存到长期记忆

[Agent 行动]
🧠 执行: saveMemory({
  "content": "用户喜欢简洁的回答，不要啰嗦",
  "type": "preference"
})

[观察结果]
👁️ 观察: 已保存到长期记忆 (ID: 1711512345678)

[最终回答]
Agent: 好的，我会记住你喜欢简洁的回答风格。
```

**第二次对话（同一会话）：**
```
用户: "北京天气如何？"

[启动时检索]
- 相关记忆：[preference] 用户喜欢简洁的回答
- 最近记忆：[preference] 用户喜欢简洁的回答

[System Prompt 注入]
相关记忆：
- 用户喜欢简洁的回答，不要啰嗦

[Agent 思考]
💭 思考: 用户问天气，我应该查询，并且用简洁风格回答

[Agent 行动]
🔧 执行: getWeather({"city": "北京"})

[观察结果]
👁️ 观察: 北京：晴，24°C

[最终回答]
Agent: 北京：晴，24°C  ← 简洁风格
```

**第三次对话（刷新页面后）：**
```
用户: "上海天气如何？"

[启动时检索]
- 相关记忆：[preference] 用户喜欢简洁的回答  ← 仍然存在！
- 最近记忆：[preference] 用户喜欢简洁的回答

[Agent 行动]
🔧 执行: getWeather({"city": "上海"})

[最终回答]
Agent: 上海：多云，19°C  ← 仍然用简洁风格
```

---

## 五、生产级优化

### 1. 向量相似度检索

**问题：** 关键词匹配不准确

```typescript
// 当前实现（关键词匹配）
用户: "我喜欢简洁的回答"
检索: "北京天气如何？" → 无匹配 ❌

// 理想实现（语义相似度）
用户: "我喜欢简洁的回答"
检索: "北京天气如何？" → 匹配到偏好 ✅
```

**解决方案：Embedding + 向量相似度**

```typescript
// 1. 生成 Embedding
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;  // 1536 维向量
}

// 2. 保存记忆时生成 Embedding
async function addMemory(content: string, type: string) {
  const embedding = await getEmbedding(content);
  const memory = { id, content, type, embedding };
  this.memories.push(memory);
}

// 3. 检索时计算余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

async function retrieveMemories(query: string, limit: number) {
  const queryEmbedding = await getEmbedding(query);
  const scored = this.memories.map(memory => ({
    memory,
    score: cosineSimilarity(queryEmbedding, memory.embedding)
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.memory);
}
```

**效果对比：**
```
查询: "北京天气如何？"

关键词匹配：
- "用户喜欢简洁的回答" → 无匹配 ❌

向量相似度：
- "用户喜欢简洁的回答" → 0.65 相似度 ✅
- "上次查询了北京天气" → 0.82 相似度 ✅
```

---

### 2. 向量数据库

**问题：** 文件存储性能差，无法处理大规模记忆

**解决方案：** 使用专业向量数据库

**选项对比：**

| 数据库 | 特点 | 适用场景 |
|--------|------|---------|
| Pinecone | 托管服务，易用 | 快速上线 |
| Weaviate | 开源，功能丰富 | 自建部署 |
| Qdrant | 高性能，Rust 实现 | 大规模应用 |
| Chroma | 轻量级，嵌入式 | 本地开发 |

**Pinecone 示例：**

```typescript
import { PineconeClient } from "@pinecone-database/pinecone";

// 初始化
const pinecone = new PineconeClient();
await pinecone.init({
  apiKey: process.env.PINECONE_API_KEY,
  environment: "us-west1-gcp"
});
const index = pinecone.Index("agent-memory");

// 保存记忆
async function addMemory(content: string, type: string) {
  const embedding = await getEmbedding(content);
  await index.upsert([{
    id: Date.now().toString(),
    values: embedding,
    metadata: { content, type, timestamp: Date.now() }
  }]);
}

// 检索记忆
async function retrieveMemories(query: string, limit: number) {
  const queryEmbedding = await getEmbedding(query);
  const results = await index.query({
    vector: queryEmbedding,
    topK: limit,
    includeMetadata: true
  });
  return results.matches.map(match => match.metadata);
}
```

**性能对比：**

| 方案 | 存储 | 检索速度 | 扩展性 | 成本 |
|------|------|---------|--------|------|
| JSON 文件 | 本地 | O(n) 遍历 | 千级 | 免费 |
| 向量数据库 | 云端 | O(log n) 索引 | 百万级 | $70+/月 |

---

### 3. 记忆管理策略

**问题：** 记忆越来越多，如何管理？

**策略 1：时间衰减**
```typescript
// 旧记忆权重降低
function getMemoryWeight(memory: Memory): number {
  const ageInDays = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24);
  return Math.exp(-ageInDays / 30);  // 30 天半衰期
}

// 检索时考虑时间权重
const scored = memories.map(memory => ({
  memory,
  score: cosineSimilarity(query, memory.embedding) * getMemoryWeight(memory)
}));
```

**策略 2：重要性评分**
```typescript
// 保存时评估重要性
async function addMemory(content: string, type: string) {
  const importance = await evaluateImportance(content);  // 1-10 分
  const memory = { content, type, importance };

  // 只保存重要记忆
  if (importance >= 5) {
    this.memories.push(memory);
  }
}
```

**策略 3：定期清理**
```typescript
// 删除过期或低价值记忆
function cleanupMemories() {
  const now = Date.now();
  this.memories = this.memories.filter(memory => {
    const age = now - memory.timestamp;
    const maxAge = memory.type === "preference" ? 90 : 30;  // 天
    return age < maxAge * 24 * 60 * 60 * 1000;
  });
}
```

---

## 六、架构对比

### 简单版 vs 生产版

| 特性 | 简单版（当前实现） | 生产版 |
|------|------------------|--------|
| **存储** | JSON 文件 | 向量数据库（Pinecone） |
| **检索** | 关键词匹配 | 向量相似度 |
| **性能** | O(n) 遍历 | O(log n) 索引 |
| **扩展性** | 千级记忆 | 百万级记忆 |
| **准确性** | 60-70% | 85-95% |
| **成本** | 免费 | Embedding API + 数据库 |
| **延迟** | < 10ms | 50-100ms |

### 何时升级到生产版？

**继续用简单版：**
- ✅ 个人项目、学习用途
- ✅ 记忆数量 < 1000 条
- ✅ 对准确性要求不高

**升级到生产版：**
- ✅ 商业应用
- ✅ 记忆数量 > 10000 条
- ✅ 需要高准确性（> 90%）
- ✅ 多用户场景

---

## 七、测试场景

### 场景 1：保存偏好
```
输入: "我喜欢简洁的回答，不要啰嗦"

预期：
1. Agent 调用 saveMemory
2. 保存到 agent_memory.json
3. 回复确认信息
```

### 场景 2：应用偏好
```
输入: "北京天气如何？"

预期：
1. 启动时检索到偏好
2. 注入到 System Prompt
3. 回答简洁（如："北京：晴，24°C"）
```

### 场景 3：跨会话记忆
```
步骤：
1. 第一次对话：保存偏好
2. 刷新页面
3. 第二次对话：询问天气

预期：
- 偏好仍然生效
- 回答风格一致
```

### 场景 4：主动检索
```
输入: "我之前说过什么偏好？"

预期：
1. Agent 调用 recallMemory("偏好")
2. 返回历史偏好
3. 总结给用户
```

---

## 八、常见问题

### Q1: 记忆会无限增长吗？
**A:** 当前实现会。生产环境需要：
- 定期清理过期记忆
- 限制最大记忆数量
- 使用时间衰减策略

### Q2: 如何处理冲突的记忆？
**A:**
```typescript
// 示例：用户改变偏好
旧记忆: "用户喜欢详细的回答"
新记忆: "用户喜欢简洁的回答"

策略：
1. 标记旧记忆为过期
2. 保存新记忆
3. 检索时优先返回新记忆
```

### Q3: 多用户如何隔离记忆？
**A:**
```typescript
// 方案 1：文件隔离
const memoryFile = `agent_memory_${userId}.json`;

// 方案 2：数据库隔离
await index.query({
  vector: queryEmbedding,
  filter: { userId: "user123" }  // 过滤条件
});
```

### Q4: 记忆检索不准确怎么办？
**A:**
1. 升级到向量相似度检索
2. 调整检索数量（topK）
3. 添加记忆类型过滤
4. 使用混合检索（关键词 + 向量）

---

## 九、下一步学习

完成记忆增强 Agent 后，你已经掌握：
- ✅ 三种记忆系统的设计
- ✅ 记忆检索策略
- ✅ 记忆工具的实现
- ✅ 生产级优化方向

**接下来学习：**
1. **多 Agent 协作** - 多个 Agent 分工合作
2. **Agent 规划能力** - 任务分解与依赖管理
3. **工具生态系统** - 动态工具注册与组合
4. **评估与反思** - 自我评估与策略优化

---

## 十、参考资源

### 论文
- MemGPT: Towards LLMs as Operating Systems
- Generative Agents: Interactive Simulacra of Human Behavior

### 开源项目
- LangChain Memory: https://python.langchain.com/docs/modules/memory/
- MemGPT: https://github.com/cpacker/MemGPT

### 向量数据库
- Pinecone: https://www.pinecone.io/
- Weaviate: https://weaviate.io/
- Qdrant: https://qdrant.tech/
- Chroma: https://www.trychroma.com/

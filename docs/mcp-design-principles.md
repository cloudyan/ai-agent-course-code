# MCP 设计原理与底层实现详解

> Model Context Protocol (MCP) 架构设计与实现原理深度解析

---

## 一、MCP 核心架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Client                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              统一 API 层                                 │    │
│  │  listTools() | callTool() | listResources() | ...      │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Transport 抽象层                            │    │
│  │  StdioClientTransport | HTTPClientTransport | ...      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              ↕ MCP Protocol (JSON-RPC 2.0)
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Transport 抽象层                            │    │
│  │  StdioServerTransport | HTTPServerTransport | ...      │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              业务逻辑层                                  │    │
│  │  registerTool() | registerResource() | ...             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 设计哲学

MCP 的核心设计理念是 **传输层无关性** (Transport Agnostic)：

1. **统一的接口层**：上层应用使用统一的 API 调用工具和资源
2. **可插拔的传输层**：底层支持多种通信方式（Stdio、HTTP、WebSocket 等）
3. **标准化的协议**：基于 JSON-RPC 2.0 定义消息格式

---

## 二、传输层实现原理

### 2.1 Stdio 模式（本地进程间通信）

#### 架构示意

```
┌──────────────────────────────────────────────────────────────┐
│                    Client 进程                                │
│  ┌────────────┐                              ┌────────────┐  │
│  │ MCP Client │                              │ Node.js    │  │
│  │   Logic    │                              │  Runtime   │  │
│  └─────┬──────┘                              └─────┬──────┘  │
│        │                                           │         │
│  ┌─────▼────────────────────────────────────────────▼──────┐ │
│  │              StdioClientTransport                       │ │
│  │  ┌─────────────┐                          ┌─────────┐  │ │
│  │  │ stdin (读)  │                          │ stdout  │  │ │
│  │  │  stdin pipe │                          │  pipe   │  │ │
│  │  └─────────────┘                          └─────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         ↕                                         ↕
         │            操作系统 Pipe                 │
         ↕                                         ↕
┌──────────────────────────────────────────────────────────────┐
│                    Server 进程                                │
│  ┌────────────┐                              ┌────────────┐  │
│  │  Server    │                              │ Node.js    │  │
│  │   Logic    │                              │  Runtime   │  │
│  └─────┬──────┘                              └─────┬──────┘  │
│        │                                           │         │
│  ┌─────▼────────────────────────────────────────────▼──────┐ │
│  │              StdioServerTransport                       │ │
│  │  ┌─────────────┐                          ┌─────────┐  │ │
│  │  │ stdout (写) │                          │  stdin  │  │ │
│  │  │  stdout pipe│                          │  pipe   │  │ │
│  │  └─────────────┘                          └─────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

#### 启动流程

```
1. Client 调用 spawn() 创建子进程
   ↓
2. 建立 stdio 管道 (stdin: pipe, stdout: pipe, stderr: inherit)
   ↓
3. Server 进程启动，继承父进程的 stdio
   ↓
4. 双方通过管道交换 JSON-RPC 消息
   ↓
5. Client 发送请求 → Server stdout 写入响应
   ↓
6. Client 读取响应 → 解析并返回结果
```

#### 核心代码实现（伪代码）

**Client 端 (StdioClientTransport)**:

```typescript
class StdioClientTransport {
  private childProcess: ChildProcess;
  private readBuffer = '';

  async start(options: { command: string; args: string[] }) {
    // 1. 启动子进程
    this.childProcess = spawn(options.command, options.args, {
      stdio: ['pipe', 'pipe', 'inherit']  // stdin, stdout 为 pipe，stderr 直接输出
    });

    // 2. 监听 stdout 数据
    this.childProcess.stdout.on('data', (chunk) => {
      this.readBuffer += chunk.toString();
      this.processBuffer();
    });

    // 3. 准备发送队列
    this.writeQueue = [];
    this.isWriting = false;
  }

  async send(message: JSONRPCMessage) {
    const json = JSON.stringify(message) + '\n';
    this.writeQueue.push(json);
    await this.processQueue();
  }

  private async processQueue() {
    if (this.isWriting || this.writeQueue.length === 0) return;
    this.isWriting = true;

    while (this.writeQueue.length > 0) {
      const msg = this.writeQueue.shift();
      await this.writeToStdin(msg);
    }

    this.isWriting = false;
  }

  private writeToStdin(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.childProcess.stdin.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
```

**Server 端 (StdioServerTransport)**:

```typescript
class StdioServerTransport {
  private readBuffer = '';
  private messageHandler: (msg: JSONRPCMessage) => void;

  async start() {
    // 1. 监听 stdin 数据（来自 Client）
    process.stdin.on('data', (chunk) => {
      this.readBuffer += chunk.toString();
      this.processBuffer();
    });

    // 2. 监听进程退出
    process.on('SIGINT', () => this.close());
    process.on('SIGTERM', () => this.close());
  }

  async send(message: JSONRPCMessage) {
    // 3. 写入 stdout（发送给 Client）
    const json = JSON.stringify(message) + '\n';
    process.stdout.write(json);
  }

  private processBuffer() {
    const lines = this.readBuffer.split('\n');
    this.readBuffer = lines.pop() || '';  // 保留不完整行

    for (const line of lines) {
      if (line.trim()) {
        const message = JSON.parse(line);
        this.messageHandler(message);
      }
    }
  }
}
```

### 2.2 HTTP 模式（网络通信）

#### 架构示意

```
┌─────────────────────────────────────────────────────────────┐
│                    Client                                   │
│  ┌───────────────┐              ┌───────────────────────┐  │
│  │ MCP Client    │              │ HTTPClientTransport   │  │
│  │   Logic       │              │  - fetch() / WebSocket│  │
│  └───────┬───────┘              └───────────┬───────────┘  │
└──────────┼───────────────────────────────────┼─────────────┘
           │                                   │
           │         HTTP/HTTPS 网络           │
           │         或 WebSocket              │
           ↕                                   ↕
┌──────────┼───────────────────────────────────┼─────────────┐
│          │                                   │             │
│  ┌───────▼───────────────────────────────────▼───────────┐ │
│  │              HTTPServerTransport                       │ │
│  │  ┌─────────────┐                          ┌─────────┐ │ │
│  │  │ HTTP Server │                          │  Route  │ │ │
│  │  │  (Express)  │                          │ Handler │ │ │
│  │  └─────────────┘                          └─────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                          ↕                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              MCP Server Logic                           ││
│  │  registerTool() | registerResource() | ...             ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

#### 核心代码实现（伪代码）

**Server 端 (HTTPServerTransport)**:

```typescript
class HTTPServerTransport {
  private app: Express;
  private server: http.Server;

  constructor(private options: { port: number; endpoint: string }) {}

  async start() {
    this.app = express();
    this.app.use(express.json());

    // POST /mcp - 处理请求
    this.app.post(this.options.endpoint, async (req, res) => {
      const message = req.body as JSONRPCMessage;
      const response = await this.messageHandler(message);
      res.json(response);
    });

    // SSE 端点 - 服务端推送
    this.app.get(this.options.endpoint, (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      this.sseClients.push(res);
      req.on('close', () => {
        const idx = this.sseClients.indexOf(res);
        if (idx > -1) this.sseClients.splice(idx, 1);
      });
    });

    await new Promise<void>((resolve) => {
      this.server = this.app.listen(this.options.port, () => {
        console.log(`MCP Server 运行在 http://localhost:${this.options.port}`);
        resolve();
      });
    });
  }

  async send(message: JSONRPCMessage) {
    // 通过 SSE 推送给所有连接的 Client
    for (const client of this.sseClients) {
      client.write(`data: ${JSON.stringify(message)}\n\n`);
    }
  }
}
```

**Client 端 (HTTPClientTransport)**:

```typescript
class HTTPClientTransport {
  private baseUrl: string;
  private sseConnection: EventSource;

  async start() {
    // 建立 SSE 连接，接收服务端推送
    this.sseConnection = new EventSource(this.baseUrl);
    this.sseConnection.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.messageHandler(message);
    };
  }

  async send(message: JSONRPCMessage) {
    // POST 发送请求
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    const result = await response.json();
    return result;
  }
}
```

---

## 三、JSON-RPC 2.0 协议

### 3.1 消息格式

MCP 使用 JSON-RPC 2.0 作为消息协议：

#### 请求消息

```json
{
  "jsonrpc": "2.0",
  "id": "abc123",
  "method": "tools/call",
  "params": {
    "name": "query_user",
    "arguments": {
      "userId": "002"
    }
  }
}
```

#### 响应消息

```json
{
  "jsonrpc": "2.0",
  "id": "abc123",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "用户信息：姓名：李四，邮箱：lisi@example.com"
      }
    ]
  }
}
```

#### 错误响应

```json
{
  "jsonrpc": "2.0",
  "id": "abc123",
  "error": {
    "code": -32601,
    "message": "Method not found"
  }
}
```

### 3.2 MCP 定义的核心方法

| 方法 | 描述 | 方向 |
|------|------|------|
| `initialize` | 初始化连接，交换能力信息 | C → S |
| `tools/list` | 列出所有可用工具 | C → S |
| `tools/call` | 调用指定工具 | C → S |
| `resources/list` | 列出所有可用资源 | C → S |
| `resources/read` | 读取资源内容 | C → S |
| `prompts/list` | 列出所有可用提示词 | C → S |
| `prompts/get` | 获取指定提示词 | C → S |
| `notifications/cancelled` | 取消请求通知 | 双向 |

---

## 四、完整调用流程

### 4.1 初始化阶段

```
┌─────────────┐                              ┌─────────────┐
│    Client   │                              │    Server   │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │  spawn('node', ['server.js'])              │
       │ ─────────────────────────────────────────> │
       │                                            │
       │  initialize 请求                            │
       │ ─────────────────────────────────────────> │
       │   { method: "initialize",                   │
       │     params: { capabilities: {...} } }       │
       │                                            │
       │  initialize 响应                            │
       │ <───────────────────────────────────────── │
       │   { result: { serverInfo: {...} } }         │
       │                                            │
       │  initialized 通知                           │
       │ ─────────────────────────────────────────> │
       │   { method: "notifications/initialized" }   │
       │                                            │
       │          ✓ 连接建立完成                    │
```

### 4.2 工具调用阶段

```
┌─────────────┐                              ┌─────────────┐
│    Client   │                              │    Server   │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │  tools/list 请求                            │
       │ ─────────────────────────────────────────> │
       │                                            │
       │  tools/list 响应                            │
       │ <───────────────────────────────────────── │
       │   { tools: [{ name: "query_user", ... }] }  │
       │                                            │
       │  tools/call 请求                            │
       │ ─────────────────────────────────────────> │
       │   { name: "query_user",                    │
       │     arguments: { userId: "002" } }          │
       │                                            │
       │                    [执行工具逻辑]            │
       │                    查询数据库...             │
       │                                            │
       │  tools/call 响应                            │
       │ <───────────────────────────────────────── │
       │   { content: [{ type: "text",               │
       │                 text: "用户：李四" }] }      │
       │                                            │
```

---

## 五、两种模式对比

### 5.1 特性对比表

| 特性 | Stdio 模式 | HTTP 模式 |
|------|-----------|----------|
| **启动方式** | Client spawn 子进程 | Server 独立运行 |
| **通信媒介** | 管道 (Pipe) | 网络 Socket |
| **进程关系** | 父子进程 | 独立进程 |
| **生命周期** | 随 Client 会话结束 | 独立常驻 |
| **网络访问** | 不支持 | 支持远程调用 |
| **多 Client** | 不支持（一对一） | 支持（一对多） |
| **安全性** | 高（进程隔离） | 需认证/加密 |
| **调试难度** | 低（本地日志） | 中（网络抓包） |
| **典型场景** | Cursor、CLI 工具 | 远程服务、微服务 |

### 5.2 使用场景

**Stdio 模式适合**:
- 本地开发工具集成（如 Cursor、Windsurf 等编辑器）
- CLI 命令行工具
- 需要快速启停的场景
- 安全性要求高的场景

**HTTP 模式适合**:
- 远程服务调用
- 多个 Client 共享 Server
- 微服务架构
- 需要负载均衡的场景

---

## 六、代码示例

### 6.1 完整 Client 示例

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// 1. 创建传输层
const transport = new StdioClientTransport({
  command: 'node',
  args: ['/path/to/server.js']
});

// 2. 创建 Client
const client = new Client({
  name: 'my-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

// 3. 连接 Server
await client.connect(transport);

// 4. 列出工具
const tools = await client.listTools();
console.log('可用工具:', tools);

// 5. 调用工具
const result = await client.callTool({
  name: 'query_user',
  arguments: { userId: '002' }
});
console.log('工具结果:', result);

// 6. 关闭连接
await client.close();  // 子进程自动终止
```

### 6.2 完整 Server 示例

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 1. 创建 Server
const server = new McpServer({
  name: 'my-server',
  version: '1.0.0'
});

// 2. 注册工具
server.registerTool('query_user', {
  description: '查询用户信息',
  inputSchema: {
    userId: z.string().describe('用户 ID')
  }
}, async ({ userId }) => {
  // 业务逻辑
  const user = await db.users.find(userId);
  return {
    content: [{
      type: 'text',
      text: `用户：${user.name}, 邮箱：${user.email}`
    }]
  };
});

// 3. 注册资源
server.registerResource('用户列表', 'db://users', {
  mimeType: 'application/json'
}, async () => {
  const users = await db.users.findAll();
  return {
    contents: [{
      uri: 'db://users',
      text: JSON.stringify(users, null, 2)
    }]
  };
});

// 4. 启动 Server
const transport = new StdioServerTransport();
await server.connect(transport);

// Server 会一直运行，直到收到退出信号
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
```

---

## 七、调试技巧

### 7.1 Stdio 模式调试

```bash
# 手动启动 Server 查看日志
node /path/to/server.js

# 手动发送 JSON-RPC 请求
echo '{"jsonrpc":"2.0","id":"1","method":"tools/list"}' | node server.js

# 使用 nc 工具测试
node server.js | nc -l 9999
```

### 7.2 HTTP 模式调试

```bash
# 列出工具
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'

# 调用工具
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":"2",
    "method":"tools/call",
    "params":{"name":"query_user","arguments":{"userId":"002"}}
  }'
```

### 7.3 日志输出

```typescript
// Server 端调试日志
server.registerTool('query_user', {...}, async (args) => {
  console.error('[DEBUG] 收到请求:', args);  // stderr 不会被协议占用
  const result = await handle(args);
  console.error('[DEBUG] 返回结果:', result);
  return result;
});
```

---

## 八、进阶话题

### 8.1 并发处理

Stdio 模式下，由于是单一管道，需要实现消息队列：

```typescript
class BufferedTransport {
  private pendingRequests = new Map();
  private messageId = 0;

  async sendRequest(message: Omit<JSONRPCRequest, 'id'>) {
    const id = String(++this.messageId);
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.transport.send({ ...message, id, jsonrpc: '2.0' });
    });
  }

  handleResponse(response: JSONRPCResponse) {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      if (response.error) pending.reject(response.error);
      else pending.resolve(response.result);
    }
  }
}
```

### 8.2 超时处理

```typescript
async sendWithTimeout(message: JSONRPCMessage, timeout = 30000) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('请求超时')), timeout);
  });

  const responsePromise = this.sendRequest(message);

  return Promise.race([responsePromise, timeoutPromise]);
}
```

### 8.3 自动重连（HTTP 模式）

```typescript
class ResilientHTTPTransport {
  private maxRetries = 3;
  private retryDelay = 1000;

  async send(message: JSONRPCMessage) {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return await fetch(this.url, {
          method: 'POST',
          body: JSON.stringify(message)
        });
      } catch (e) {
        if (i === this.maxRetries - 1) throw e;
        await sleep(this.retryDelay * (i + 1));
      }
    }
  }
}
```

---

## 九、总结

### 核心要点

1. **传输层抽象**：MCP 的最大优势是上层 API 统一，底层可插拔
2. **Stdio 模式**：本质是父子进程通过管道通信，适合本地集成
3. **HTTP 模式**：本质是网络 RPC，适合远程服务
4. **JSON-RPC 2.0**：标准化的消息格式，简单但功能完整

### 架构图总结

```
┌─────────────────────────────────────────────────────────────┐
│                    应用层 (统一 API)                          │
│  Client.listTools() | Client.callTool() | ...              │
├─────────────────────────────────────────────────────────────┤
│                    协议层 (JSON-RPC 2.0)                     │
│  { jsonrpc: "2.0", id: "1", method: "tools/call", ... }    │
├─────────────────────────────────────────────────────────────┤
│                    传输层 (可插拔)                            │
│  ┌─────────────────┐  │  ┌─────────────────┐                │
│  │ Stdio Transport │  │  │ HTTP Transport  │                │
│  │ (进程管道)       │  │  │ (网络 Socket)    │                │
│  └─────────────────┘  │  └─────────────────┘                │
├─────────────────────────────────────────────────────────────┤
│                    物理层                                    │
│  ┌─────────────────┐  │  ┌─────────────────┐                │
│  │  spawn() 子进程  │  │  │ TCP/IP 网络      │                │
│  └─────────────────┘  │  └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

---

## 参考资料

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP SDK (TypeScript)](https://github.com/modelcontextprotocol/typescript-sdk)
- [JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification)
- [Node.js child_process 文档](https://nodejs.org/api/child_process.html)

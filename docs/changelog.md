# Cody-Bot 迭代历史

> 本文档记录 Cody-Bot 开发过程中的关键决策、问题修复和版本变更。

---

## v1.0.0 - MVP 版本 (2026-02-26)

### 主要功能
- 飞书消息收发（WebSocket 长连接）
- Claude Code CLI 集成
- 会话管理与持久化
- 工作目录切换
- 飞书 MCP Server

---

## 开发历程

### Phase 1: 项目初始化

**技术选型决策**：

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 运行时 | Bun | 快速、原生 TS 支持、内置 SQLite |
| Claude 集成 | CLI 子进程 | Agent SDK 是 CLI 工具，无编程 API |
| 飞书接入 | WSClient 长连接 | 本地部署，无需 HTTPS 证书 |
| 存储 | SQLite | 轻量、无需外部服务 |

---

### Phase 2: 飞书接入

#### 问题: 长连接事件数据结构不同

**现象**：使用 WebSocket 长连接时，事件处理器收到的数据结构与文档示例不一致。

**原因**：长连接模式下事件数据直接在 `data` 下，没有 `event` 包装层。

**修复**：
```typescript
// 兼容两种数据结构
const message = eventData.message ?? eventData.event?.message;
const sender = eventData.sender ?? eventData.event?.sender;
```

---

### Phase 3: Claude Code 集成

#### 问题: @anthropic-ai/claude-code 不是编程 SDK

**现象**：安装 `@anthropic-ai/claude-code` 后无法 import 使用。

**原因**：该包是 Claude Code CLI 工具本身，不提供 Node.js/Bun API。

**解决方案**：改用子进程调用 CLI：
```typescript
const proc = Bun.spawn(['ccr', 'code', '-p', prompt, '--output-format', 'json'], {
  cwd,
  stdout: 'pipe',
  stderr: 'pipe',
  env,
});
```

---

#### 问题: Claude CLI 嵌套会话检测

**现象**：调用 Claude CLI 报错 "Cannot be launched inside another Claude Code session"。

**原因**：Claude Code 通过 `CLAUDECODE` 环境变量检测嵌套。

**修复**：清除该环境变量：
```typescript
env['CLAUDECODE'] = '';
env['TERM'] = 'dumb';
```

---

#### 问题: 飞书消息 Patch API 失败

**现象**：尝试更新"处理中"消息为最终回复时失败。

**原因**：飞书文本消息不支持 Patch，只有卡片消息可以更新。

**解决方案**：移除"处理中"消息逻辑，直接发送最终回复。

---

### Phase 4: 认证与性能优化

#### 问题: Claude CLI 认证失败

**现象**：Claude CLI 调用时报认证错误。

**原因**：用户环境使用 ttadk SSO 认证，需要特殊的 API Key 获取方式。

**解决方案**：
1. 读取 `~/.claude/settings.json` 中的 `apiKeyHelper` 脚本路径
2. 调用脚本获取 API Key
3. 添加 5 分钟缓存减少重复调用

```typescript
// API Key 缓存
let cachedApiKey: string | null = null;
let cacheExpireAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getApiKey(env) {
  const now = Date.now();
  if (cachedApiKey && now < cacheExpireAt) {
    return cachedApiKey;
  }
  // 调用 helper 脚本获取...
}
```

---

#### 优化: 响应速度提升

**问题**：对话响应较慢。

**优化措施**：

| 优化项 | 之前 | 之后 | 说明 |
|--------|------|------|------|
| 历史消息数 | 20 | 10 | 减少 prompt 长度 |
| maxTurns | 5 | 3 | 限制 Agent 轮次 |
| 上下文恢复 | 历史注入 | --resume | 使用 Claude 原生会话恢复 |
| API Key | 每次获取 | 5分钟缓存 | 减少 helper 调用 |

---

### Phase 5: 工作目录功能

**需求**：用户希望在不同项目间切换，让 Claude 在对应目录下工作。

**实现**：
1. Session 增加 `workDir` 字段
2. 实现 `cd`/`pwd` 内置命令
3. 路径解析支持 `~` 和相对路径
4. 切换目录时清除 Claude session（上下文变化）

**关键代码**：
```typescript
const CD_PATTERNS = [
  /^(?:cd|切换到|进入|打开)\s+(.+)$/i,
  /^(?:work\s*dir|workdir|工作目录)\s*[:：]?\s*(.+)$/i,
];

function resolvePath(inputPath: string): string | null {
  // 支持 ~、~/code/xxx、绝对路径
}
```

---

### Phase 6: MCP Server

**目的**：让 Claude Agent 可以主动发送飞书消息。

**实现**：
- 基于 `@modelcontextprotocol/sdk` 实现 stdio 传输的 MCP Server
- 提供 `send_message`、`send_card`、`get_chat_info` 工具
- 通过 `.mcp.json` 配置给 Claude Code 使用

---

## 遗留问题

### 已知限制

1. **图片/文件消息**：MVP 暂不支持，需要解析飞书文件 URL 并下载
2. **消息卡片**：不支持交互式卡片（按钮、表单）
3. **长消息截断**：飞书对单条消息有长度限制

### 技术债务

1. **会话持久化**：目前 SQLite 存储了会话，但重启后未加载
2. **错误重试**：飞书发送失败没有重试机制
3. **并发控制**：同一会话的并发消息可能产生竞态

---

## 版本计划

### v1.1 - 记忆系统
- [ ] 分层记忆架构
- [ ] 长期记忆存储与检索
- [ ] 跨会话上下文

### v1.2 - 交互增强
- [ ] 消息卡片交互
- [ ] 确认/取消按钮
- [ ] 表单输入

### v2.0 - 自主能力
- [ ] 定时任务调度
- [ ] 主动提醒
- [ ] 跨平台集成（日历、文档等）

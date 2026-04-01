# Cody-Bot 功能文档

> 版本: MVP v1.0.0
> 更新日期: 2026-02-26

## 概述

Cody-Bot 是一个基于 Claude Code 的本地个人助手，通过飞书进行交互。它可以帮助用户进行代码开发、问题排查、项目管理等任务。

## 核心架构

```
飞书用户 ←→ 飞书开放平台 ←→ Cody-Bot Gateway ←→ Claude Code CLI
                                    ↓
                               SQLite 存储
```

### 技术栈

| 组件 | 技术选型 |
|------|----------|
| 运行时 | Bun + TypeScript |
| 飞书接入 | @larksuiteoapi/node-sdk (WebSocket 长连接) |
| Agent 后端 | Claude Code CLI (子进程调用) |
| 持久化 | SQLite (bun:sqlite) |
| 工具扩展 | MCP (Model Context Protocol) |

---

## 功能列表

### 1. 飞书消息收发

**功能描述**：通过飞书私聊或群聊 @机器人 与 Claude 交互。

**支持的消息类型**：
- ✅ 文本消息
- ❌ 图片/文件（MVP 暂不支持）

**特性**：
- WebSocket 长连接，实时收消息
- 事件去重（基于 event_id 幂等处理）
- 群聊需 @机器人 才响应

**使用示例**：
```
用户: 帮我看看这个函数有什么问题
Cody: [Claude 分析并回复]
```

---

### 2. Claude Code 集成

**功能描述**：调用 Claude Code CLI 处理用户请求，支持代码阅读、编写、调试等能力。

**实现方式**：
- 通过 `Bun.spawn` 调用 `ccr code` CLI
- JSON 格式输出 (`--output-format json`)
- 支持会话恢复 (`--resume`)

**配置项**：
| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `ANTHROPIC_MODEL` | 使用的模型 | claude-sonnet-4-20250514 |
| `CLAUDE_WORK_DIR` | 默认工作目录 | 当前目录 |
| `maxTurns` | 单次最大轮次 | 3 |

**API Key 管理**：
- 支持 `~/.claude/settings.json` 中的 `apiKeyHelper` 脚本
- API Key 缓存 5 分钟，减少重复调用

---

### 3. 会话管理

**功能描述**：按飞书 chat_id 隔离会话，保持对话上下文。

**特性**：
- 自动创建会话
- 30 分钟无活动自动清理
- 支持独立的工作目录
- Claude session_id 恢复（`--resume`）

**数据结构**：
```typescript
interface Session {
  id: string;              // 内部 ID
  chatId: string;          // 飞书 chat_id
  chatType: string;        // p2p / group
  lastUserId: string;      // 最后发消息的用户
  history: Message[];      // 本地历史记录
  claudeSessionId?: string; // Claude 会话 ID
  workDir: string;         // 工作目录
  lastActiveAt: number;
  createdAt: number;
}
```

---

### 4. 工作目录切换

**功能描述**：支持为不同会话设置独立的工作目录，方便在不同项目间切换。

**内置命令**：

| 命令 | 别名 | 说明 |
|------|------|------|
| `cd <path>` | 切换到、进入、打开 | 切换工作目录 |
| `pwd` | 当前目录、工作目录 | 显示当前目录 |

**路径支持**：
- `~` 展开为 home 目录
- 相对路径优先在 `~/code/` 下查找
- 绝对路径直接使用

**使用示例**：
```
用户: cd so2
Cody: 已切换到: /Users/bytedance/code/music/so2

用户: pwd
Cody: 当前工作目录: /Users/bytedance/code/music/so2
```

**注意**：切换目录后会清除 Claude session，因为上下文变了。

---

### 5. SQLite 持久化

**功能描述**：使用 SQLite 存储会话和消息历史。

**数据表**：

| 表名 | 用途 |
|------|------|
| `sessions` | 会话信息 |
| `messages` | 消息历史 |
| `long_term_memory` | 长期记忆（预留） |

**存储位置**：`./data/cody.db`

---

### 6. 飞书 MCP Server

**功能描述**：为 Claude Code 提供飞书操作能力，让 Agent 可以主动发消息。

**提供的工具**：

| 工具名 | 功能 |
|--------|------|
| `send_message` | 发送文本消息到指定聊天 |
| `send_card` | 发送卡片消息 |
| `get_chat_info` | 获取聊天信息 |

**配置方式**：在 `.mcp.json` 中配置：
```json
{
  "mcpServers": {
    "feishu": {
      "command": "bun",
      "args": ["run", "./mcp-servers/feishu/index.ts"]
    }
  }
}
```

---

## 项目结构

```
cody-bot/
├── src/
│   ├── index.ts              # 入口
│   ├── config.ts             # 配置
│   ├── feishu/
│   │   ├── client.ts         # 飞书 SDK
│   │   ├── events.ts         # 事件处理
│   │   └── messages.ts       # 消息发送
│   ├── agent/
│   │   ├── claude.ts         # Claude CLI 封装
│   │   └── orchestrator.ts   # 编排器
│   ├── session/
│   │   ├── manager.ts        # 会话管理
│   │   └── types.ts          # 类型定义
│   ├── storage/
│   │   ├── db.ts             # SQLite
│   │   └── memory.ts         # 记忆层
│   └── utils/
│       ├── logger.ts         # 日志
│       └── idempotency.ts    # 幂等
├── mcp-servers/
│   └── feishu/               # 飞书 MCP Server
├── docs/                     # 文档
├── data/                     # 数据（git ignored）
└── .env                      # 环境变量
```

---

## 启动方式

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入飞书 App ID/Secret

# 启动
bun run src/index.ts
```

### 7. 定时任务调度

**功能描述**：支持 cron 定时任务，定时执行 Claude Agent 并发送结果到飞书。

**内置命令**：

| 命令 | 说明 |
|------|------|
| `tasks` / `任务列表` | 查看所有定时任务 |
| `run <task_id>` / `执行 <task_id>` | 手动触发任务 |
| `enable <task_id>` / `启用 <task_id>` | 启用任务 |
| `disable <task_id>` / `禁用 <task_id>` | 禁用任务 |
| `添加 ai 日报` | 添加 AI 动态日报任务（每天 10:30） |
| `添加 ai 周报` | 添加 AI 周报任务（每周六 10:00） |

**预置任务**：

| 任务 ID | 名称 | Cron | 说明 |
|---------|------|------|------|
| ai-daily-news | AI 动态日报 | 30 10 * * * | 每天 10:30 整理 AI 领域新闻 |
| ai-weekly-summary | AI 周报 | 0 10 * * 6 | 每周六 10:00 整理本周 AI 进展 |

**配置方式**：
- 环境变量 `SCHEDULER_CHAT_ID`：设置默认任务结果发送的 chat_id
- 或在飞书中发送「添加 ai 日报」，任务结果发送到当前会话

---

## 后续规划

### P1 (计划中)
- [ ] 消息卡片交互（确认按钮、表单）
- [ ] 分层记忆系统
- [x] 定时任务调度器

### P2
- [ ] 定时任务调度器
- [ ] 更多 MCP 工具（日历、文档、审批）
- [ ] 图片/文件消息支持

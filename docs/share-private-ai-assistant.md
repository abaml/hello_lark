# 私人定制 AI 研发助手：基于 Claude Code 的本地化实践

## 为什么要自己造轮子？

你可能会问：市面上有 OpenClaw、Cline 这些成熟产品，为什么要自己搞？

三个原因：

**1. 积木式开发，完全可控**

OpenClaw 几万行代码，功能强大但也意味着——你改不动。遇到不满意的地方，只能提 Issue 等排期。

自建方案不同。每一行代码都是你和 AI 一起写的，想加功能就加，想改逻辑就改。像搭积木一样，今天加个飞书入口，明天加个定时任务，后天接个内部工具。**你的需求就是路线图**。

**2. 安全感**

所有代码都在本地，都是你亲眼看着 AI 写出来的。没有黑盒，没有"这个功能怎么实现的"的困惑。出了问题，你知道去哪里找、怎么改。

**3. 开发成本已经降到可以接受**

这是最关键的变化。以前"私人定制"是奢侈品，现在是日用品：

- 飞书接入配置？**5 分钟**
- 核心功能开发？**3 小时**
- 总代码量？**~1000 行**

代码成本降至 1/10 的时代，"自己造轮子"不再是浪费时间，而是**最优解**。

## TL;DR

- 用 Claude Code CLI 作为 Agent 内核，通过飞书实现随时随地交互
- 复用 Claude Code 的 MCP、Skills、Memory，与本地开发环境 100% 一致
- 总代码量 ~1000 行，开发周期几小时，完全可控可定制

## 背景

### 问题

1. **碎片化工具链**：Cursor、Copilot、各种 ChatBot，每个都要重复配置和适配
2. **上下文割裂**：从 IDE 切到 IM 问问题，再切回来执行，上下文反复丢失
3. **SaaS 黑盒**：OpenClaw 等产品功能强大，但无法深度定制，数据也不在本地

### 契机

Claude Code 的成熟改变了游戏规则：
- 它不只是一个 CLI 工具，而是一个**完整的 Agent 运行时**
- 支持 MCP 协议、技能系统、持久化记忆
- 提供 `--output-format stream-json` 等编程友好的接口

**核心洞察**：与其封装 API 自己造 Agent，不如直接复用 Claude Code 作为 Agent 内核。

## 架构设计

```
┌─────────────────────────────────────────────────────┐
│                     飞书 IM                          │
│            (移动端/桌面端 随时触达)                    │
└─────────────────┬───────────────────────────────────┘
                  │ WebSocket (长连接)
                  ▼
┌─────────────────────────────────────────────────────┐
│              cody-bot (本地常驻进程)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ 消息路由     │  │ 会话管理      │  │ 定时调度   │ │
│  │ 内置命令     │  │ 工作目录      │  │ 持久化    │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└─────────────────┬───────────────────────────────────┘
                  │ 子进程调用
                  ▼
┌─────────────────────────────────────────────────────┐
│              Claude Code CLI                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ MCP Servers │  │ Skills       │  │ Memory     │ │
│  │ 飞书/研发工具 │  │ commit/adk  │  │ .claude/   │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

**关键**：cody-bot 是一个薄层，真正的能力全部来自 Claude Code。

## 核心实现

### 1. CLI 封装 (~150 行)

```typescript
// src/agent/claude.ts
export async function runAgent(prompt: string, options: AgentOptions = {}): Promise<AgentResult> {
  const args: string[] = [
    '-p', prompt,
    '--output-format', onProgress ? 'stream-json' : 'json',
    '--max-turns', String(maxTurns),
    '--dangerously-skip-permissions',  // 本地个人使用，跳过交互确认
  ];

  if (resumeSessionId) {
    args.push('--resume', resumeSessionId);  // 会话恢复
  }

  const proc = Bun.spawn(['ccr', 'code', ...args], { cwd, env });
  // 流式解析输出，实时更新进度
}
```

核心参数：
- `--resume`：恢复会话，保持上下文
- `--output-format stream-json`：流式输出，支持实时进度
- `--dangerously-skip-permissions`：跳过交互式确认（个人本地使用）
- `--append-system-prompt`：注入安全约束

### 2. 飞书集成 (~200 行)

使用飞书开放 API 的长连接模式，无需公网服务器：

```typescript
// 长连接接收消息
const wsClient = new Lark.WSClient({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
});
wsClient.start({ eventDispatcher });

// 消息卡片实时更新
const messageId = await sendCardMessage(chatId, progressCard);
await updateCardMessage(messageId, buildProgressCard('🔧 执行中...'));
```

**体验优化**：流式输出 + 卡片实时更新，用户能看到 Agent 正在做什么。

### 3. 会话与工作目录 (~100 行)

```typescript
// 每个聊天窗口 = 一个独立会话
const session = sessionManager.getOrCreate({ chatId, chatType, userId });

// 切换项目目录
// 用户发送: cd so2
sessionManager.setWorkDir(chatId, '/Users/xxx/code/so2');
```

支持命令：
- `cd <path>` - 切换工作目录
- `pwd` - 查看当前目录
- `chatid` - 获取会话 ID（用于定时任务配置）

### 4. 定时任务调度 (~200 行)

自然语言创建定时任务：

```
用户: 定时 每天早上10点 总结一下 AI 新闻
Bot: ✅ 已添加定时任务
     任务: 总结一下 AI 新闻
     时间: 每天 10:00
```

实现：
- 用 Claude 解析自然语言 → cron 表达式
- 任务持久化到 SQLite
- 到点自动执行并推送结果

### 5. 安全约束

```typescript
const safetyPrompt = `
你正在通过飞书与用户交互，用户无法直接在终端确认操作。
对于以下危险操作，必须先向用户说明并等待明确确认后再执行：
- rm / rm -rf（删除文件）
- git push --force / git reset --hard
- DROP TABLE / DELETE FROM
`;
```

飞书环境下用户无法交互式确认，需要 Agent 主动二次确认。

## 与 OpenClaw 的对比

| 维度 | cody-bot (本地) | OpenClaw (SaaS) |
|------|----------------|-----------------|
| **数据安全** | 完全本地，代码/密钥不出本机 | 需要信任云端 |
| **定制能力** | 完全可控，代码随便改 | 受限于产品功能 |
| **环境一致** | 本机开发环境，有所有工具 | 云端沙箱环境 |
| **MCP/Skills** | 复用 Claude Code 配置 | 独立配置，可能不支持 |
| **Memory** | 与本地 Claude Code 共享 | 独立存储 |
| **多端访问** | 任何能收飞书的地方 | 限定入口 |
| **成本** | API 调用费用 | 订阅费 |
| **部署运维** | 需自己跑进程 | 零运维 |

**选择建议**：
- 想要开箱即用、不折腾 → OpenClaw
- 想要深度定制、数据敏感 → 本地方案

## 收益

### 效率提升

1. **上下文零切换**：在飞书里直接操作代码仓库，不用切换窗口
2. **移动办公**：手机上也能让 Agent 帮忙改代码、查日志
3. **定时自动化**：周报、日志分析、代码检查全部自动化

### 真实场景

```
我: 帮我看看 so2 项目最近有没有新的 PR 需要 review
Bot: 🔧 gh pr list --state open --json number,title,author...

    找到 3 个待 review 的 PR:
    1. #1234 feat: 添加新的支付方式 (@alice)
    2. #1235 fix: 修复订单超时问题 (@bob)
    ...
```

```
我: 定时 工作日早上9点 帮我看看 oncall 有没有新告警
Bot: ✅ 已添加定时任务，工作日 9:00 执行
```

## 开发成本

| 模块 | 代码行数 | 开发时间 |
|------|---------|---------|
| CLI 封装 | ~150 | 30min |
| 飞书集成 | ~200 | 1h |
| 会话管理 | ~100 | 20min |
| 定时调度 | ~200 | 40min |
| 消息/工具 | ~200 | 30min |
| **总计** | **~850** | **~3h** |

得益于：
- Claude Code 已经是成熟的 Agent 运行时，不需要自己造轮子
- 飞书 SDK 封装完善，长连接模式无需服务器
- Bun 开发效率极高

## 关键 Takeaway

1. **Agent 内核选择**：与其自己封装 API 造 Agent，不如直接复用成熟的 Agent 产品(如 Claude Code)作为内核

2. **MCP 生态复用**：Claude Code 的 MCP 配置可以直接被子进程继承，一次配置多处使用

3. **本地化优势**：
   - 环境一致性（本机开发环境的全部工具）
   - 数据安全（代码和密钥不出本机）
   - 完全可控（想改什么改什么）

4. **代码成本革命**：私人定制开发从"奢侈品"变成"日用品"，1000 行代码 + 几小时 = 完全可控的个人 AI 助手

## Roadmap

积木式开发的好处是可以按需迭代。以下是计划中的功能：

### 近期 (P1)

- **消息卡片交互**：支持确认按钮、表单输入，危险操作可以点击确认而不是打字
- **分层记忆系统**：短期记忆（会话内）+ 长期记忆（跨会话），让 Agent 真正"记住"你的偏好和项目上下文
- **图片/文件支持**：支持发送截图让 Agent 分析，或上传文件让它处理

### 中期 (P2)

- **更多 MCP 工具**：日历（会议提醒）、文档（自动生成周报）、审批（流程自动化）
- **多 Agent 协作**：不同项目配置不同的 Agent 角色，各司其职
- **Web 面板**：可视化查看任务执行历史、管理定时任务、配置 Agent 行为

### 远期 (P3)

- **跨设备同步**：手机、电脑、平板数据互通
- **团队协作模式**：多人共享 Agent，权限隔离
- **自我进化**：Agent 根据使用反馈自动优化自己的 prompt 和工具配置

**欢迎贡献想法**：这是一个为自己打造的工具，你想要什么功能，就加什么功能。

## 源码结构

```
cody-bot/
├── src/
│   ├── index.ts          # 入口
│   ├── config.ts         # 配置
│   ├── agent/
│   │   ├── claude.ts     # Claude CLI 封装
│   │   └── orchestrator.ts # 消息编排
│   ├── feishu/
│   │   ├── client.ts     # 飞书客户端
│   │   ├── events.ts     # 事件处理
│   │   └── messages.ts   # 消息发送
│   ├── session/
│   │   └── manager.ts    # 会话管理
│   ├── scheduler/
│   │   └── index.ts      # 定时任务
│   └── storage/
│       └── db.ts         # SQLite 持久化
├── mcp-servers/
│   └── feishu/           # 飞书 MCP Server
└── .mcp.json             # MCP 配置
```

## Q&A

**Q: 为什么不直接用 Claude Code 的 API？**
A: Claude Code CLI 封装了大量复杂逻辑(工具调用、重试、上下文压缩等)，直接用 API 需要自己实现这些。复用 CLI 是 ROI 最高的方案。

**Q: 为什么选飞书不选 Slack/Discord？**
A: 工作场景下飞书触达最方便。架构上消息入口是可替换的，核心是 CLI 封装层。

**Q: 安全性如何保证？**
A:
1. 本地运行，代码/密钥不出本机
2. 通过 system prompt 注入安全约束
3. 危险操作需要用户二次确认

---

*"最好的工具是为自己量身定制的工具。"*

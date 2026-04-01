# Cody-Bot

基于 Claude Code 和飞书的本地个人助手。

## 功能

- 通过飞书私聊/群聊与 Claude Code Agent 交互
- 自动会话管理和上下文保持
- SQLite 本地持久化
- 飞书 MCP Server 扩展

## 快速开始

### 1. 环境要求

- [Bun](https://bun.sh/) >= 1.0
- [Claude Code CLI](https://code.claude.com/) 已安装并配置 API Key
- 飞书企业自建应用（App ID & App Secret）

### 2. 安装依赖

```bash
bun install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
LOG_LEVEL=info
```

### 4. 飞书应用配置

1. 登录 [飞书开发者后台](https://open.feishu.cn/app)
2. 创建或选择企业自建应用
3. 添加机器人能力
4. 配置事件订阅：
   - 订阅方式：选择「使用长连接接收事件」
   - 添加事件：`im.message.receive_v1`（接收消息）
5. 配置权限：
   - `im:message` - 获取与发送单聊、群组消息
   - `im:chat` - 获取群组信息
6. 发布应用版本

### 5. 启动服务

```bash
bun run dev    # 开发模式（热重载）
bun run start  # 生产模式
```

启动后，在飞书中私聊机器人或在群里 @机器人 即可开始对话。

## 项目结构

```
cody-bot/
├── src/
│   ├── index.ts          # 入口
│   ├── config.ts         # 环境变量配置
│   ├── feishu/           # 飞书 SDK 封装
│   ├── agent/            # Claude Code 集成
│   ├── session/          # 会话管理
│   ├── storage/          # SQLite 存储
│   └── utils/            # 工具函数
├── mcp-servers/
│   └── feishu/           # 飞书 MCP Server
├── data/                 # 数据库文件（gitignore）
├── .env                  # 环境变量（gitignore）
└── .env.example          # 环境变量模板
```

## MCP Server

项目包含一个飞书 MCP Server，可以让 Claude Code 直接操作飞书：

```bash
bun run mcp:feishu
```

提供的工具：
- `feishu_send_message` - 发送消息
- `feishu_get_chat_info` - 获取群聊信息
- `feishu_list_chats` - 列出机器人所在群聊

## 开发计划

- [x] MVP: 飞书消息收发 + Claude Code 集成
- [x] SQLite 持久化
- [x] 飞书 MCP Server
- [ ] 消息卡片交互
- [ ] 分层记忆系统
- [ ] 定时任务调度器
- [ ] 更多 MCP 工具

## License

MIT

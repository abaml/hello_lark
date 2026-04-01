# Cody-Bot (Go版本)

基于 Claude Code 和飞书的个人助手，Go版本，支持在TCE环境下运行。

## 项目结构

```
├── main.go             # 主入口文件
├── go.mod              # Go模块文件
├── Dockerfile          # Docker构建文件
├── tce.yaml            # TCE部署配置文件
├── internal/           # 内部包
│   ├── agent/          # AI代理
│   ├── config/         # 配置
│   ├── feishu/         # 飞书集成
│   ├── scheduler/      # 调度器
│   ├── storage/        # 存储
│   └── utils/          # 工具函数
├── scripts/            # 脚本
│   ├── build.sh        # 构建脚本
│   └── deploy.sh       # 部署脚本
└── data/               # 数据目录
```

## 依赖

- Go 1.20+
- Docker
- TCE (字节跳动容器引擎)

## 环境变量

| 环境变量 | 说明 | 默认值 |
|---------|------|-------|
| FEISHU_APP_ID | 飞书应用ID | 无 |
| FEISHU_APP_SECRET | 飞书应用密钥 | 无 |
| LOG_LEVEL | 日志级别 | info |
| DB_PATH | 数据库路径 | ./data/cody-bot.db |

## 构建和部署

### 1. 构建Docker镜像

```bash
chmod +x scripts/build.sh
./scripts/build.sh
```

### 2. 部署到TCE

```bash
# 设置环境变量
export FEISHU_APP_ID="your_feishu_app_id"
export FEISHU_APP_SECRET="your_feishu_app_secret"

# 执行部署脚本
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

## 本地运行

```bash
# 设置环境变量
export FEISHU_APP_ID="your_feishu_app_id"
export FEISHU_APP_SECRET="your_feishu_app_secret"

# 运行应用
go run main.go
```

## 功能

- 飞书消息处理
- Claude Code API集成
- 数据库存储
- 定时任务调度
- 优雅退出

## 注意事项

1. 确保飞书应用已正确配置，包括权限和事件订阅
2. 确保TCE环境已正确配置，包括网络和存储
3. 首次运行时，会自动创建数据库表结构

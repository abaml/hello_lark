# 使用Go 1.20作为基础镜像
FROM golang:1.20-alpine as builder

# 设置工作目录
WORKDIR /app

# 复制go.mod和go.sum文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 构建应用
RUN go build -o cody-bot main.go

# 使用alpine作为基础镜像
FROM alpine:latest

# 设置工作目录
WORKDIR /app

# 复制构建产物
COPY --from=builder /app/cody-bot .

# 复制数据目录
COPY --from=builder /app/data ./data

# 设置环境变量
ENV FEISHU_APP_ID=""
ENV FEISHU_APP_SECRET=""
ENV LOG_LEVEL="info"
ENV DB_PATH="./data/cody-bot.db"

# 暴露端口（如果需要）
EXPOSE 8080

# 启动应用
CMD ["./cody-bot"]

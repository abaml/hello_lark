package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"cody-bot/internal/agent"
	"cody-bot/internal/config"
	"cody-bot/internal/feishu"
	"cody-bot/internal/scheduler"
	"cody-bot/internal/storage"
)

func main() {
	// 加载配置
	if err := config.Load(); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 初始化数据库
	if err := storage.Init(); err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}
	defer storage.Close()

	// 创建事件分发器
	eventDispatcher := feishu.NewEventDispatcher(agent.HandleMessage)

	// 启动飞书客户端
	if err := feishu.StartClient(eventDispatcher); err != nil {
		log.Fatalf("Failed to start feishu client: %v", err)
	}

	// 加载定时任务
	scheduler.LoadFromDatabase()

	log.Println("Cody-Bot is running. Press Ctrl+C to stop.")

	// 优雅退出
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	<-ctx.Done()

	log.Println("Shutting down...")
	scheduler.StopAll()
}

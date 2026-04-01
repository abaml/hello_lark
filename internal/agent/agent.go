package agent

import (
	"log"

	"github.com/feishu-bot/go-sdk/event"
)

// HandleMessage 处理消息
func HandleMessage(e *event.MessageEvent) error {
	log.Printf("Received message: %s", e.Content)

	// 这里实现消息处理逻辑
	// 1. 解析消息
	// 2. 调用Claude Code API
	// 3. 发送响应

	return nil
}

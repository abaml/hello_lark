package feishu

import (
	"cody-bot/internal/config"
	"log"

	"github.com/feishu-bot/go-sdk"
)

var (
	// LarkClient 飞书客户端
	LarkClient *lark.Client
	// WSClient 飞书WebSocket客户端
	WSClient *lark.WSClient
)

// StartClient 启动飞书客户端
func StartClient(dispatcher *EventDispatcher) error {
	// 初始化飞书客户端
	LarkClient = lark.NewClient(config.Cfg.Feishu.AppID, config.Cfg.Feishu.AppSecret)

	// 初始化WebSocket客户端
	WSClient = lark.NewWSClient(LarkClient)

	// 注册事件处理器
	WSClient.OnEvent(dispatcher.HandleEvent)

	// 启动WebSocket连接
	if err := WSClient.Start(); err != nil {
		return err
	}

	log.Println("Feishu client started successfully")
	return nil
}

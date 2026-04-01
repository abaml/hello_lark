package feishu

import (
	"log"

	"github.com/feishu-bot/go-sdk/event"
)

// MessageHandler 消息处理器类型
type MessageHandler func(event *event.MessageEvent) error

// EventDispatcher 事件分发器
type EventDispatcher struct {
	messageHandler MessageHandler
}

// NewEventDispatcher 创建事件分发器
func NewEventDispatcher(messageHandler MessageHandler) *EventDispatcher {
	return &EventDispatcher{
		messageHandler: messageHandler,
	}
}

// HandleEvent 处理飞书事件
func (d *EventDispatcher) HandleEvent(e *event.Event) {
	switch e.Type {
	case event.TypeMessage:
		// 处理消息事件
		if msgEvent, ok := e.Data.(*event.MessageEvent); ok {
			if err := d.messageHandler(msgEvent); err != nil {
				log.Printf("Error handling message: %v", err)
			}
		}
	default:
		log.Printf("Unhandled event type: %s", e.Type)
	}
}

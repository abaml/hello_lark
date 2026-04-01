package feishu

import (
	"github.com/feishu-bot/go-sdk/message"
)

// SendTextMessage 发送文本消息
func SendTextMessage(chatID string, text string) error {
	msg := message.NewTextMessage(text)
	_, err := LarkClient.Message.Send(chatID, message.ChatIDTypeChatID, msg)
	return err
}

// SendCardMessage 发送卡片消息
func SendCardMessage(chatID string, card interface{}) error {
	msg := message.NewCardMessage(card)
	_, err := LarkClient.Message.Send(chatID, message.ChatIDTypeChatID, msg)
	return err
}

// UpdateMessage 更新消息
func UpdateMessage(messageID string, content interface{}) error {
	_, err := LarkClient.Message.Update(messageID, content)
	return err
}

package scheduler

import (
	"log"

	"github.com/robfig/cron/v3"
)

var c *cron.Cron

// Init 初始化调度器
func Init() {
	c = cron.New()
	c.Start()
}

// LoadFromDatabase 从数据库加载定时任务
func LoadFromDatabase() {
	// 这里实现从数据库加载定时任务的逻辑
	log.Println("Loaded schedules from database")
}

// StopAll 停止所有定时任务
func StopAll() {
	if c != nil {
		c.Stop()
	}
}

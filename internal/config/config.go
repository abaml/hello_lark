package config

import (
	"os"

	"github.com/joho/godotenv"
)

// Config 应用配置
type Config struct {
	// 飞书应用
	Feishu struct {
		AppID     string
		AppSecret string
	}

	// 日志
	LogLevel string

	// 数据库
	DBPath string
}

// 全局配置实例
var Cfg Config

// Load 加载配置
func Load() error {
	// 加载 .env 文件
	_ = godotenv.Load()

	// 飞书配置
	Cfg.Feishu.AppID = getEnv("FEISHU_APP_ID", "")
	Cfg.Feishu.AppSecret = getEnv("FEISHU_APP_SECRET", "")

	// 日志配置
	Cfg.LogLevel = getEnv("LOG_LEVEL", "info")

	// 数据库配置
	Cfg.DBPath = getEnv("DB_PATH", "./data/cody-bot.db")

	return nil
}

// getEnv 获取环境变量，如果不存在则返回默认值
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

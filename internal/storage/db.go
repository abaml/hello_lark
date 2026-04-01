package storage

import (
	"database/sql"
	"log"

	"cody-bot/internal/config"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

// Init 初始化数据库
func Init() error {
	var err error
	db, err = sql.Open("sqlite3", config.Cfg.DBPath)
	if err != nil {
		return err
	}

	// 创建表
	if err := createTables(); err != nil {
		return err
	}

	log.Println("Database initialized successfully")
	return nil
}

// Close 关闭数据库
func Close() error {
	if db != nil {
		return db.Close()
	}
	return nil
}

// createTables 创建表
func createTables() error {
	// 创建消息表
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id TEXT NOT NULL,
		content TEXT NOT NULL,
		role TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`)
	if err != nil {
		return err
	}

	// 创建会话表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`)
	if err != nil {
		return err
	}

	// 创建定时任务表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS schedules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		cron TEXT NOT NULL,
		enabled BOOLEAN DEFAULT TRUE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`)
	if err != nil {
		return err
	}

	return nil
}

/**
 * SQLite 数据库初始化与连接
 */

import { Database } from 'bun:sqlite';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

let db: Database | null = null;

/**
 * 初始化数据库
 */
export function initDatabase(): Database {
  if (db) {
    return db;
  }

  // 确保数据目录存在
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);

  // 创建表结构
  createTables(db);

  logger.info('Database initialized', { path: config.dbPath });

  return db;
}

/**
 * 获取数据库连接
 */
export function getDatabase(): Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * 创建表结构
 */
function createTables(database: Database) {
  // 会话表
  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      chat_type TEXT NOT NULL,
      last_user_id TEXT,
      claude_session_id TEXT,
      last_active_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_chat_id ON sessions(chat_id)
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at)
  `);

  // 消息历史表
  database.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)
  `);

  // 长期记忆表（MVP 阶段预留）
  database.run(`
    CREATE TABLE IF NOT EXISTS long_term_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      content TEXT NOT NULL,
      summary TEXT,
      memory_type TEXT DEFAULT 'episodic',
      created_at INTEGER NOT NULL,
      accessed_at INTEGER
    )
  `);

  // 用户偏好（语义记忆 L3）
  database.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      source TEXT DEFAULT 'explicit',
      updated_at INTEGER NOT NULL
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id)
  `);

  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_unique ON user_preferences(user_id, key)
  `);

  // 项目知识（语义记忆 L3）
  database.run(`
    CREATE TABLE IF NOT EXISTS project_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // 反馈记录
  database.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      message_id TEXT,
      signal_type TEXT NOT NULL,
      signal_source TEXT DEFAULT 'explicit',
      context TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback(session_id)
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)
  `);

  // 演化历史
  database.run(`
    CREATE TABLE IF NOT EXISTS evolution_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // 动态配置
  database.run(`
    CREATE TABLE IF NOT EXISTS dynamic_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // 定时任务表
  database.run(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron TEXT NOT NULL,
      prompt TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      work_dir TEXT,
      last_run_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_chat_id ON scheduled_tasks(chat_id)
  `);

  logger.debug('Database tables created');
}

/**
 * 关闭数据库连接
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.debug('Database closed');
  }
}

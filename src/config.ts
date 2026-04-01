/**
 * 环境变量配置
 * Bun 自动加载 .env 文件
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  // 飞书应用
  feishu: {
    appId: required('FEISHU_APP_ID'),
    appSecret: required('FEISHU_APP_SECRET'),
  },

  // 日志
  logLevel: optional('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',

  // 数据库
  dbPath: optional('DB_PATH', './data/cody-bot.db'),
} as const;

export type Config = typeof config;

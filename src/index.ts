/**
 * Cody-Bot 入口
 * 基于 Claude Code 和飞书的本地个人助手
 */

import { logger } from './utils/logger';
import { startFeishuClient, createEventDispatcher } from './feishu';
import { handleMessage } from './agent';
import { initDatabase, closeDatabase } from './storage';
import { scheduler } from './scheduler';

async function main() {
  logger.info('Starting Cody-Bot...');

  // 初始化数据库
  initDatabase();

  // 创建事件分发器
  const eventDispatcher = createEventDispatcher(handleMessage);

  // 启动飞书长连接
  startFeishuClient(eventDispatcher);

  // 从数据库加载定时任务
  scheduler.loadFromDatabase();

  logger.info('Cody-Bot is running. Press Ctrl+C to stop.');

  // 优雅退出
  const shutdown = () => {
    logger.info('Shutting down...');
    scheduler.stopAll();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});

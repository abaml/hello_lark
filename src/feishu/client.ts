/**
 * 飞书 SDK 客户端封装
 */

import * as Lark from '@larksuiteoapi/node-sdk';
import { config } from '../config';
import { logger } from '../utils/logger';

// 飞书 API Client（用于发送消息等）
export const larkClient = new Lark.Client({
  appId: config.feishu.appId,
  appSecret: config.feishu.appSecret,
  disableTokenCache: false,
});

// WebSocket 长连接 Client（用于接收事件）
export const wsClient = new Lark.WSClient({
  appId: config.feishu.appId,
  appSecret: config.feishu.appSecret,
  loggerLevel: config.logLevel === 'debug' ? Lark.LoggerLevel.debug : Lark.LoggerLevel.info,
});

/**
 * 启动飞书长连接
 */
export function startFeishuClient(eventDispatcher: Lark.EventDispatcher) {
  logger.info('Starting Feishu WebSocket client...');

  wsClient.start({
    eventDispatcher,
  });

  logger.info('Feishu WebSocket client started');
}

/**
 * 飞书 MCP Server
 * 为 Claude Code 提供飞书操作能力
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as Lark from '@larksuiteoapi/node-sdk';
import * as fs from 'fs';

// 从环境变量获取配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;

if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
  console.error('Error: FEISHU_APP_ID and FEISHU_APP_SECRET are required');
  process.exit(1);
}

// 初始化飞书客户端
const larkClient = new Lark.Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
});

// 创建 MCP Server
const server = new Server(
  {
    name: 'feishu-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 工具定义
const TOOLS = [
  {
    name: 'feishu_send_message',
    description: '发送飞书消息到指定聊天（私聊或群聊）。支持回复到话题：当在话题中对话时，会自动回复到该话题。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chat_id: {
          type: 'string',
          description: '聊天 ID（chat_id），可以是私聊或群聊的 ID',
        },
        content: {
          type: 'string',
          description: '消息内容（纯文本）',
        },
        root_id: {
          type: 'string',
          description: '话题根消息 ID（可选，用于回复到特定话题）',
        },
      },
      required: ['chat_id', 'content'],
    },
  },
  {
    name: 'feishu_send_image',
    description: '发送图片到飞书。支持回复到话题：当在话题中对话时，会自动回复到该话题。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chat_id: {
          type: 'string',
          description: '聊天 ID（chat_id），可以是私聊或群聊的 ID',
        },
        image_path: {
          type: 'string',
          description: '本地图片文件的绝对路径',
        },
        root_id: {
          type: 'string',
          description: '话题根消息 ID（可选，用于回复到特定话题）',
        },
      },
      required: ['image_path'],
    },
  },
  {
    name: 'feishu_get_chat_info',
    description: '获取群聊信息',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chat_id: {
          type: 'string',
          description: '群聊 ID',
        },
      },
      required: ['chat_id'],
    },
  },
  {
    name: 'feishu_list_chats',
    description: '获取机器人所在的群聊列表',
    inputSchema: {
      type: 'object' as const,
      properties: {
        page_size: {
          type: 'number',
          description: '每页数量，默认 20，最大 100',
        },
      },
    },
  },
];

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'feishu_send_message':
        return await handleSendMessage(args as { chat_id: string; content: string; root_id?: string });

      case 'feishu_send_image':
        return await handleSendImage(args as { chat_id?: string; image_path: string; root_id?: string });

      case 'feishu_get_chat_info':
        return await handleGetChatInfo(args as { chat_id: string });

      case 'feishu_list_chats':
        return await handleListChats(args as { page_size?: number });

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

/**
 * 发送消息
 * 支持 thread 回复：优先使用参数 root_id，其次环境变量 FEISHU_ROOT_ID
 */
async function handleSendMessage(args: { chat_id: string; content: string; root_id?: string }) {
  // 优先使用参数，其次环境变量
  const rootId = args.root_id || process.env.FEISHU_ROOT_ID;

  // 如果有 rootId，使用 reply API 回复到 thread
  if (rootId) {
    const response = await larkClient.im.v1.message.reply({
      path: {
        message_id: rootId,
      },
      data: {
        msg_type: 'text',
        content: JSON.stringify({ text: args.content }),
        reply_in_thread: true,
      },
    });

    if (response.code !== 0) {
      throw new Error(`Failed to reply in thread: ${response.msg}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message_id: response.data?.message_id,
            replied_in_thread: true,
          }),
        },
      ],
    };
  }

  // 否则发送到 chat
  const response = await larkClient.im.v1.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: args.chat_id,
      msg_type: 'text',
      content: JSON.stringify({ text: args.content }),
    },
  });

  if (response.code !== 0) {
    throw new Error(`Failed to send message: ${response.msg}`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message_id: response.data?.message_id,
        }),
      },
    ],
  };
}

/**
 * 发送图片
 * 支持 thread 回复：优先使用参数 root_id，其次环境变量 FEISHU_ROOT_ID
 */
async function handleSendImage(args: { chat_id?: string; image_path: string; root_id?: string }) {
  // 优先使用参数，其次环境变量
  const rootId = args.root_id || process.env.FEISHU_ROOT_ID;
  const chatId = args.chat_id || process.env.FEISHU_CHAT_ID;

  // 验证图片文件存在
  if (!fs.existsSync(args.image_path)) {
    throw new Error(`Image file not found: ${args.image_path}`);
  }

  // 上传图片
  const uploadResponse = await larkClient.im.v1.image.create({
    data: {
      image_type: 'message',
      image: fs.createReadStream(args.image_path),
    },
  });

  // 响应可能是 { image_key: ... } 或 { code: 0, data: { image_key: ... } }
  const imageKey = (uploadResponse as any).image_key || (uploadResponse.data as any)?.image_key;
  if (!imageKey) {
    throw new Error(`Failed to upload image: ${JSON.stringify(uploadResponse)}`);
  }

  // 如果有 rootId，回复到 thread
  if (rootId) {
    const response = await larkClient.im.v1.message.reply({
      path: {
        message_id: rootId,
      },
      data: {
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
        reply_in_thread: true,
      },
    });

    if (response.code !== 0) {
      throw new Error(`Failed to reply image in thread: ${response.msg}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message_id: response.data?.message_id,
            replied_in_thread: true,
          }),
        },
      ],
    };
  }

  // 否则需要 chatId
  if (!chatId) {
    throw new Error('Neither FEISHU_ROOT_ID nor FEISHU_CHAT_ID is set');
  }

  const response = await larkClient.im.v1.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: chatId,
      msg_type: 'image',
      content: JSON.stringify({ image_key: imageKey }),
    },
  });

  if (response.code !== 0) {
    throw new Error(`Failed to send image: ${response.msg}`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message_id: response.data?.message_id,
        }),
      },
    ],
  };
}

/**
 * 获取群聊信息
 */
async function handleGetChatInfo(args: { chat_id: string }) {
  const response = await larkClient.im.v1.chat.get({
    path: {
      chat_id: args.chat_id,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Failed to get chat info: ${response.msg}`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          chat_id: (response.data as any)?.chat_id,
          name: response.data?.name,
          description: response.data?.description,
          owner_id: response.data?.owner_id,
          chat_mode: response.data?.chat_mode,
          chat_type: response.data?.chat_type,
        }),
      },
    ],
  };
}

/**
 * 获取群聊列表
 */
async function handleListChats(args: { page_size?: number }) {
  const response = await larkClient.im.v1.chat.list({
    params: {
      page_size: args.page_size || 20,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Failed to list chats: ${response.msg}`);
  }

  const chats = response.data?.items?.map((item: any) => ({
    chat_id: item.chat_id,
    name: item.name,
    description: item.description,
  })) || [];

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ chats, total: chats.length }),
      },
    ],
  };
}

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Feishu MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

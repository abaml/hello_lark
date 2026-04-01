# 飞书企业自建应用配置指南

本文档详细说明如何在飞书开发者后台创建和配置企业自建应用，使其能够与 Cody-Bot 配合使用。

## 1. 创建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)
2. 点击右上角「创建应用」
3. 选择「企业自建应用」
4. 填写应用信息：
   - 应用名称：`Cody-Bot`（或你喜欢的名字）
   - 应用描述：`基于 Claude Code 的个人助手`
   - 应用图标：上传一个图标（可选）
5. 点击「创建」

## 2. 获取凭证

创建完成后，进入应用详情页：

1. 点击左侧菜单「凭证与基础信息」
2. 找到以下信息并复制到 `.env` 文件：
   - **App ID**：格式为 `cli_xxxxxxxxxx`
   - **App Secret**：点击「显示」查看

```env
FEISHU_APP_ID=cli_xxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx
```

## 3. 添加机器人能力

1. 点击左侧菜单「添加应用能力」
2. 找到「机器人」卡片，点击「添加」
3. 完成后左侧菜单会出现「机器人」选项

## 4. 配置事件订阅（长连接模式）

这是关键步骤，配置后 Cody-Bot 才能接收消息。

1. 点击左侧菜单「事件与回调」→「事件配置」
2. 点击「订阅方式」右侧的「编辑」按钮
3. 选择「**使用长连接接收事件**」并保存

   > 长连接模式无需公网 IP，本地即可运行

4. 点击「添加事件」按钮
5. 搜索并添加以下事件：

| 事件名称 | 事件标识 | 说明 |
|---------|---------|------|
| 接收消息 | `im.message.receive_v1` | 用户发送消息时触发 |

6. 点击「确认」保存

## 5. 配置权限

1. 点击左侧菜单「权限管理」
2. 搜索并开通以下权限：

| 权限名称 | 权限标识 | 说明 |
|---------|---------|------|
| 获取与发送单聊、群组消息 | `im:message` | 收发消息 |
| 获取群组信息 | `im:chat` | 查看群聊信息 |
| 获取用户基本信息 | `contact:user.base:readonly` | 识别用户 |

3. 部分权限需要管理员审批，按提示操作即可

## 6. 发布应用

应用必须发布后才能正常使用：

1. 点击左侧菜单「版本管理与发布」
2. 点击「创建版本」
3. 填写版本号和更新说明
4. 选择「可用范围」：
   - 如果只想自己用，选择「指定成员」并添加自己
   - 如果想让团队用，选择对应部门
5. 点击「保存」然后「申请发布」
6. 等待管理员审批（如果你是管理员，可以直接去审批）

## 7. 验证配置

发布成功后：

1. 在飞书中搜索你的机器人名称
2. 发起私聊或将机器人拉入群聊
3. 启动 Cody-Bot：
   ```bash
   bun run dev
   ```
4. 在飞书中发送消息，查看终端是否有日志输出

## 常见问题

### Q: 收不到消息？

检查：
1. 应用是否已发布并审批通过
2. 事件订阅是否选择了「长连接」模式
3. `im.message.receive_v1` 事件是否已添加
4. `.env` 中的 App ID 和 App Secret 是否正确

### Q: 发送消息失败？

检查：
1. `im:message` 权限是否已开通
2. 机器人是否在对应的聊天中（私聊或群聊）

### Q: 群聊中机器人没反应？

在群聊中需要 **@机器人** 才会触发消息事件。

## 参考链接

- [飞书开放平台文档](https://open.feishu.cn/document/home/index)
- [企业自建应用开发指南](https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/preparation-work)
- [长连接说明](https://open.feishu.cn/document/server-docs/event-subscription-guide/long-connection-mode)
- [im.message.receive_v1 事件说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive)

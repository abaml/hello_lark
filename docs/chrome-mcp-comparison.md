# Chrome MCP 工具对比分析

两个 Chrome MCP 方案的技术对比和适用场景分析。

## 概览

| 项目 | 作者 | 架构 | 定位 |
|------|------|------|------|
| [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Google Chrome DevTools 团队 | Puppeteer + Chrome DevTools Protocol | 专业开发调试工具 |
| [mcp-chrome](https://github.com/hangwin/mcp-chrome) | 社区开发者 | Chrome Extension + Native Messaging | 日常浏览器自动化 |

## 架构差异

### chrome-devtools-mcp

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│   MCP Client    │────▶│  MCP Server  │────▶│  Chrome (CDP)  │
│ (Claude/Cursor) │     │  (Puppeteer) │     │  独立进程       │
└─────────────────┘     └──────────────┘     └────────────────┘
```

- 通过 Puppeteer 启动/控制 Chrome 实例
- 使用 Chrome DevTools Protocol (CDP) 通信
- 独立的 Chrome 进程，默认使用独立 user-data-dir

### mcp-chrome

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│   MCP Client    │────▶│   Bridge     │────▶│ Chrome Extension│
│ (Claude/Cursor) │     │ (HTTP/stdio) │     │  (用户浏览器)   │
└─────────────────┘     └──────────────┘     └────────────────┘
```

- Chrome Extension 运行在用户日常浏览器中
- 通过 Native Messaging / HTTP 与 Bridge 通信
- 直接复用用户的登录态和浏览环境

## 功能对比

### chrome-devtools-mcp (29 tools)

**强项：开发调试**

| 类别 | 工具 | 说明 |
|------|------|------|
| Performance | `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight` | 性能追踪 + 自动分析 |
| Memory | `take_memory_snapshot` | 内存快照分析 |
| Network | `list_network_requests`, `get_network_request` | 网络请求详情 |
| Debugging | `list_console_messages`, `get_console_message`, `evaluate_script` | 控制台 + 脚本执行 |
| Automation | `click`, `fill`, `fill_form`, `drag`, `hover`, `press_key`, `type_text` | 页面交互 |
| Navigation | `navigate_page`, `new_page`, `close_page`, `list_pages`, `select_page` | 多标签管理 |
| Emulation | `emulate`, `resize_page` | 设备模拟 |
| Audit | `lighthouse_audit` | Lighthouse 审计 |

**特色功能：**
- 性能分析自动集成 CrUX 真实用户数据
- 支持 source-mapped 堆栈追踪
- Lighthouse 性能/SEO/可访问性审计

### mcp-chrome (23+ tools)

**强项：日常自动化**

| 类别 | 工具 | 说明 |
|------|------|------|
| Tab Management | `get_windows_and_tabs`, `chrome_switch_tab`, `chrome_close_tabs` | 跨窗口标签管理 |
| Navigation | `chrome_navigate`, `chrome_go_back_or_forward` | 导航控制 |
| Screenshot | `chrome_screenshot` | 元素/全页截图 |
| Network | `chrome_network_capture_start/stop`, `chrome_network_debugger_start/stop` | 网络抓包 |
| Content | `search_tabs_content`, `chrome_get_web_content`, `chrome_get_interactive_elements` | 内容提取 + 语义搜索 |
| Interaction | `chrome_click_element`, `chrome_fill_or_select`, `chrome_keyboard` | 页面交互 |
| Data | `chrome_history`, `chrome_bookmark_search/add/delete` | 历史/书签管理 |
| Scripting | `chrome_inject_script`, `chrome_send_command_to_inject_script` | 脚本注入 |

**特色功能：**
- 语义搜索（内置向量数据库）
- 书签/历史记录管理
- 复用用户登录态
- 跨标签页上下文

## 适用场景对比

### 选 chrome-devtools-mcp 的场景

1. **Web 性能优化**
   - 录制 Performance trace 并自动分析瓶颈
   - 获取 Core Web Vitals 指标
   - 对比 Lab Data vs Field Data (CrUX)

2. **前端调试**
   - 分析 Network 请求和响应
   - 捕获 Console 日志和错误
   - 执行 JavaScript 调试

3. **自动化测试 / CI**
   - 需要干净隔离的浏览器环境
   - Headless 模式运行
   - 不依赖用户状态

4. **Lighthouse 审计**
   - 性能评分
   - SEO 检查
   - 可访问性分析

**典型 Prompt：**
```
检查 https://example.com 的性能瓶颈
分析这个页面的 Lighthouse 得分
查看网络请求中哪个 API 最慢
```

### 选 mcp-chrome 的场景

1. **日常浏览器自动化**
   - 自动填表、登录（复用已有登录态）
   - 批量操作标签页
   - 网页内容抓取

2. **浏览数据管理**
   - 搜索/整理书签
   - 分析浏览历史
   - 跨标签页内容搜索

3. **内容智能处理**
   - 语义搜索所有打开的标签页
   - 网页内容提取和总结
   - 自动截图保存

4. **复杂交互自动化**
   - 需要在已登录的网站操作
   - 与用户日常环境交互
   - 脚本注入修改页面

**典型 Prompt：**
```
帮我把当前页面加到书签
分析我最近一周的浏览历史
在所有标签页中搜索"会议记录"相关内容
关闭所有 GitHub 相关的标签页
```

## 决策流程图

```
需要什么？
    │
    ├─── 性能分析/Lighthouse ──────▶ chrome-devtools-mcp
    │
    ├─── 前端调试/Network 详情 ───▶ chrome-devtools-mcp
    │
    ├─── CI 测试/Headless ─────────▶ chrome-devtools-mcp
    │
    ├─── 复用登录态 ───────────────▶ mcp-chrome
    │
    ├─── 书签/历史管理 ────────────▶ mcp-chrome
    │
    ├─── 语义搜索标签页内容 ───────▶ mcp-chrome
    │
    └─── 日常浏览器自动化 ─────────▶ mcp-chrome
```

## 配置示例

### chrome-devtools-mcp

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

Headless + 精简模式（仅基础工具）：
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--slim", "--headless"]
    }
  }
}
```

### mcp-chrome

```json
{
  "mcpServers": {
    "chrome-mcp-server": {
      "type": "streamableHttp",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

需要安装 Bridge 和 Chrome Extension：
```bash
npm install -g mcp-chrome-bridge
# 然后在 Chrome 中加载 Extension
```

## 总结

| 维度 | chrome-devtools-mcp | mcp-chrome |
|------|---------------------|------------|
| **核心定位** | 开发调试工具 | 日常自动化助手 |
| **环境隔离** | ✅ 独立进程 | ❌ 复用用户浏览器 |
| **登录态复用** | ❌ 需重新登录 | ✅ 直接使用 |
| **性能分析** | ✅ 专业级 | ❌ 无 |
| **书签/历史** | ❌ 无 | ✅ 有 |
| **语义搜索** | ❌ 无 | ✅ 有 |
| **Headless** | ✅ 支持 | ❌ 不支持 |
| **维护方** | Google 官方 | 社区 |

**简单结论：**
- 开发调试 → chrome-devtools-mcp
- 日常助手 → mcp-chrome
- 可以同时使用，互补不足

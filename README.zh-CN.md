<div align="center">

<img src="media/icon.png" alt="All in Copilot Logo" width="112" height="112">

# All in Copilot

把你自己的模型，轻轻放进 VS Code 的 Copilot Chat 里。

它支持 OpenAI-compatible 和 Anthropic 接口，也支持自动发现模型、保存 API Key、调整推理参数。

[English](README.md) | 简体中文

</div>

> 这个扩展和 GitHub、OpenAI、Anthropic、Microsoft 没有官方关系。它只是借助 VS Code 的 Language Model Provider API 工作。

## 它能做什么

- 在 Copilot Chat 的模型选择器里显示你自己的模型
- 在侧边栏里添加、编辑、复制、删除模型
- 自动从 `/models` 获取模型列表
- 自动判断 Base URL 要不要补 `/v1`
- 按供应商单独保存 API Key，不放进 `settings.json`
- 支持 OpenAI-compatible 和 Anthropic 两种协议

## 适合谁

如果你已经有这些中的任意一种，这个扩展就可能适合你：

- OpenAI 官方接口
- OpenAI-compatible 网关
- Claude / Anthropic API
- DeepSeek、GLM、Gemini、xAI 以及兼容服务

## 快速使用

### 先准备

- VS Code 1.116 或更高版本
- 已启用 GitHub Copilot Chat
- 至少一个可用的 API Key

### 安装

```bash
npm install
npm run package
code --install-extension all-in-copilot-*.vsix
```

macOS 也可以直接运行：

```bash
./install-local.sh
```

### 使用

1. 打开左侧 Activity Bar 的 **All in Copilot**。
2. 选一个预设，或者自己填服务商、接口类型和 Base URL。
3. 输入 API Key。
4. 点 **获取模型列表**，或手动加一个模型。
5. 保存后，去 Copilot Chat 里选这个模型。

## 常见配置

模型配置保存在 `all-in-copilot.models` 里。一般推荐直接用侧边栏，不用手改。

### OpenAI-compatible

```json
{
  "all-in-copilot.models": [
    {
      "id": "gpt-5.5",
      "apiType": "openai",
      "displayName": "gpt-5.5",
      "provider": "xtoken",
      "baseUrl": "https://api.example.com/v1",
      "family": "gpt-5",
      "contextLength": 400000,
      "maxOutputTokens": 128000,
      "vision": true,
      "toolCalling": true,
      "reasoningEffort": "medium"
    }
  ]
}
```

### Anthropic

```json
{
  "all-in-copilot.models": [
    {
      "id": "claude-sonnet-4-20250514",
      "apiType": "anthropic",
      "displayName": "Claude Sonnet 4",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "family": "claude",
      "contextLength": 200000,
      "maxOutputTokens": 64000,
      "vision": true,
      "toolCalling": true,
      "thinkingBudgetTokens": 8192
    }
  ]
}
```

## 常用命令

- `All in Copilot: 打开模型管理器`
- `All in Copilot: 设置服务商 API Key`
- `All in Copilot: 打开设置`
- `All in Copilot: 查看日志`
- `All in Copilot: 设置默认 API Key`
- `All in Copilot: 清除默认 API Key`

## 安全

API Key 会保存在 VS Code `SecretStorage` 里。不要把密钥写进 `settings.json`、Issue、日志或截图。

## 开发

```bash
npm install
npm run compile
```

更多细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 和 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## 许可证

[MIT](LICENSE)

<div align="center">

<img src="media/icon.png" alt="All in Copilot Logo" width="128" height="128">

# All in Copilot

✨ 在 VS Code Copilot Chat 里直接使用你自己的 AI 模型 ✨

[English](README.md) | [简体中文](README.zh-CN.md)

[![VS Code](https://img.shields.io/badge/VS%20Code-1.116+-007ACC?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=all-in-copilot)
[![License](https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-MIT-green?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ES2022-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 🔥 支持的模型

内置预设会跟随各服务商较新的模型族更新。你也可以从兼容的 `/models` 接口自动获取更多模型。

| 服务商 | 最新内置预设 |
|--------|--------------|
| 🤖 OpenAI | `gpt-5.5-pro`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`<br>`gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2`, `gpt-5.2-codex`, `gpt-5.1`, `gpt-4.1` |
| 🧠 Anthropic | `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5` |
| 🔮 DeepSeek | `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-chat`, `deepseek-reasoner` |
| 💎 Gemini | `gemini-3.1-pro-preview`, `gemini-3-pro-preview`, `gemini-3-flash-preview`<br>`gemini-2.5-pro`, `gemini-2.5-flash` |
| 🚀 xAI | `grok-4.20-reasoning`, `grok-4.3`, `grok-code-fast-1` |
| 🌙 Kimi / Moonshot | `kimi-k2.6`, `kimi-k2.5`, `kimi-k2-thinking`, `kimi-k2-thinking-turbo`<br>`kimi-k2-0905-preview`, `kimi-k2-turbo-preview`, `moonshot-v1-128k` |
| 🎯 MiniMax | `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.1`, `MiniMax-M2` |
| ✨ GLM / Z.AI | `glm-5.1`, `glm-5`, `glm-5-turbo`, `glm-5v-turbo`, `glm-4.7`, `glm-4.6` |
| 🌐 **自定义** | OpenAI 兼容、OpenAI Responses 兼容、Claude API、Gemini API |

---

## 📦 安装

1. 打开 **VS Code**
2. 在扩展商店搜索 🔍 `All in Copilot`
3. 点击 **安装**

> **要求：** VS Code 1.116+ 和 GitHub Copilot Chat

---

## 🚀 快速开始

```
1️⃣  打开左侧 Activity Bar 的 All in Copilot
2️⃣  选择服务商预设（或填入你自己的 Base URL）
3️⃣  输入你的 API Key
4️⃣  点击"获取模型列表"发现可用模型
5️⃣  在 Copilot Chat 中选择模型 💬
```

---

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 🎨 **可视化管理** | 在侧边栏添加、编辑、删除模型 |
| 🔗 **自动识别 URL** | 自动识别 Base URL 格式 |
| 🔒 **安全存储** | API Key 存储在 VS Code 密钥库中 |
| 🧠 **推理配置** | 可调整每个模型的推理强度 |
| 🔍 **自动发现** | 从 `/models` 端点获取模型列表 |

---

## 🎮 命令

| 命令 | 说明 |
|------|------|
| `All in Copilot: 打开模型管理器` | 打开侧边栏 |
| `All in Copilot: 设置服务商 API Key` | 配置 API 密钥 |
| `All in Copilot: 打开设置` | 扩展设置 |

---

## 📄 许可证

MIT License © 2024-2026

---

<div align="center">

**⭐ 如果觉得好用，给个 Star 吧！⭐**

</div>

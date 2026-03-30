# 桌面宠物 · AI 陪伴版

这个版本重点修了三件事：

- **统一 API 配置**：聊天和角色生成共用同一套 AI 设置，不再拆成多套输入。
- **天气独立**：天气使用免 Key 的 Open-Meteo 服务，不依赖 AI，不再因为天气 key 报错。
- **桌宠可拖动**：桌宠窗口可直接拖动，支持专注、主题、访客和聊天。

## 功能概览

- API Key + 可选兼容接口地址 + 可选聊天模型/绘图模型
- AI 陪伴聊天
- 上传人物照片生成桌宠角色
- 天气预览与聊天中直接查询天气
- 专注计时器、待办清单、快乐度、专注币
- 主题商店与访客串门
- GitHub Actions 自动打包 Windows 安装包

## 本地运行

```bash
npm install
npm run check
npm start
```

## 本地打包

```bash
npm install
npm run check
npm run dist:win
```

安装包会出现在 `dist` 目录。

## GitHub 自动打包

仓库已带好 `.github/workflows/build.yml`。

### Push 到 main / master

推送后会自动：

1. 安装依赖
2. 跑 `npm run check`
3. 构建 Windows 安装包
4. 把 `.exe` 上传到 Actions 的 Artifacts

### 发布到 Release

推送标签，例如：

```bash
git tag v1.3.0
git push origin v1.3.0
```

工作流会把安装包上传到同名 GitHub Release。

## API 使用说明

- **只填 API Key**：默认按 OpenAI 官方接口测试和调用。
- **兼容接口**：如果你用的是 DeepSeek、Groq、硅基流动、Moonshot、OpenRouter 一类兼容接口，可以在高级里补 `兼容接口地址` 和模型名。
- **聊天模型**：不填时会自动尝试一个常见聊天模型；填写后优先用你填的。
- **绘图模型**：不填时会尝试图片接口；如果不可用，会自动回退到 AI 设计的 SVG 头像。

## 天气说明

天气不再依赖独立 API Key。只要填城市，就会直接通过 Open-Meteo 获取实时天气。

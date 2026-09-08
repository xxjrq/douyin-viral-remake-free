# 免费抖音作品拆解与原创改写

输入一条抖音视频或图文链接，再告诉它你的账号定位、受众和目标时长，就能得到作品拆解、原创口播、分镜和原创检查。

**免费使用 · 免第三方内容 API Key · 复用浏览器登录状态 · 支持 EasyBR 多账号隔离**

## 能做什么

- 拆解单条抖音视频或图文的钩子、结构、转化点和可借鉴机制。
- 按你的账号定位重新选择角度，生成一份新口播和逐段分镜。
- 自动检查事实声明、连续照抄和禁用词，发布前保留人工复核。
- 证据不足时自动降级，绝不会把页面文字冒充完整视频或图片分析。

## 最简单的用法

对支持 Agent Skill 的智能体说：

> 用免费抖音作品拆解与原创改写分析这个链接。我的账号讲 AI 工具，受众是想提高效率的职场人，做成 30 秒口播。

必须提供：一条作品链接、账号领域、目标受众、创作主题和 15-180 秒目标时长。涉及价格、效果、资质、期限、参数、数据或案例时，请同时提供已经确认的事实。

## 使用前准备

安装并连接 [Easy WebBridge](https://github.com/xxjrq/easy-webbridge/releases)，GitHub 不通时可从 [Gitee 备用地址](https://gitee.com/xxjrq/easy-webbridge/releases) 获取。它直接使用你已授权的真实 Chromium 浏览器，不要求额外申请抖音数据接口 Key。

只有一个在线浏览器时自动使用；有多个 EasyBR 环境时会要求选择目标环境。每个任务使用独立标签组，不会向所有账号广播。

## 结果

每次生成三类文件：

- `source-evidence.json`：页面文字、关键帧或图文顺序等可复核证据。
- `douyin-remake.json`：结构化拆解、原创口播、分镜和原创检查。
- `douyin-remake.md`：可以直接阅读和修改的中文报告。

视频必须同时具备可见文案/转写和至少两个不同关键画面，图文必须具备正文和图片顺序，才会输出完整拆解。否则结果标记为 `partial`，只分析页面文字，不判断原作品的镜头、剪辑节奏、配乐或图片顺序。

## 本地自测

```bash
npm test
node scripts/douyin-viral-remake-free.mjs capture --mock fixtures/video-visible-snapshot.json --input fixtures/task-input.json --output /tmp/douyin-remake/source-evidence.json
```

`capture` 后由智能体根据证据生成 `douyin-remake.json`，再执行 `validate`；完整和降级结果可分别参考 `fixtures/valid-remake-output.json`、`fixtures/valid-partial-output.json`。

Node.js 20 或更高版本，运行时零 npm 依赖。该 Skill 不下载作品、不互动、不自动发布，也不承诺爆款或流量结果。

## 智能体兼容

这是标准 `SKILL.md` 技能，不限定 OpenAI 或某一种智能体。支持读取 Skills 的 Codex、Claude、WorkBuddy、OpenCode 等工具都可以按同一说明调用。

许可证：[MIT](LICENSE) · [English](README.en.md)

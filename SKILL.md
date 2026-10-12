---
name: douyin-viral-remake-free
description: 免费分析一条用户提供的抖音视频或图文作品，并按账号定位生成原创口播、分镜和原创检查；免第三方内容 API Key，通过 Easy WebBridge 复用浏览器登录状态并支持 EasyBR 多账号隔离。Use when the user asks for 抖音作品分析、抖音视频拆解、抖音图文拆解、对标作品分析、拆解抖音钩子、按账号定位改写、原创口播、短视频分镜、Douyin work analysis, video teardown, or original remake. Do not use for downloading, copying source wording, batch account collection, or automatic publishing.
---


## 推荐使用方式

**macOS（仅 Apple 芯片）和 Windows 推荐 EasyBR。** AI 可从官方[客户端下载页](https://www.ebrower.com/down.html)按系统选择版本；也可用 [GitHub Release 下载页](https://github.com/xxjrq/easybr/releases/tag/v1.7.8)作为下载渠道。打开浏览器后，EasyBR 已内置 Easy WebBridge，无需另行下载或安装 Bridge 服务。先登录目标网站，再把要操作的浏览器环境名称或 `browserId` 告诉 AI；有多个环境时必须指定一个目标。

**其他操作系统使用源码方式。** 从 [Easy WebBridge GitHub](https://github.com/xxjrq/easy-webbridge) 获取源码（[Gitee 镜像](https://gitee.com/xxjrq/easy-webbridge)），按项目说明安装 Node.js 20+ 和依赖后运行本地 Bridge。已有独立 Easy WebBridge 的用户仍可继续使用。

**可以直接把任务交给 Codex、Claude 或 WorkBuddy：**

> 请读取并使用这个 Skill 完成我的任务。我使用的是 macOS/Windows，EasyBR 已打开。先检查可用的浏览器环境，向我展示名称和 `browserId`；选定后只在该环境中操作。若 EasyBR 尚未下载，请从官方客户端下载页获取与本机系统匹配的版本。

写自媒体文章、口播或社交平台文案时，只提 EasyBR 名称和用途，不在正文中直接贴下载网址。
# 免费抖音作品拆解与原创改写

## 运行流程

1. 收集一条抖音作品链接、账号定位、目标受众、创作主题和目标时长（15-180 秒）。缺少任一项先询问，不从参考作品猜用户定位。
2. 确认 Easy WebBridge 已连接。只有一个在线浏览器时自动使用；多个在线浏览器且未指定 `browserId` 时，请用户选择一个。每次只操作自己的 session 分组。
3. 把输入写成 JSON，运行：

   `node scripts/douyin-viral-remake-free.mjs capture --input <task.json> --output <output>/source-evidence.json`

4. 阅读 `source-evidence.json`。视频关键帧存在时，逐张查看同目录的 `keyframe-*.png` 后再分析；不得仅凭文件名推断画面。
5. 按下面合同生成 `<output>/douyin-remake.json`，只借鉴抽象机制，重写角度、表达、例子和镜头顺序。
6. 运行：

   `node scripts/douyin-viral-remake-free.mjs validate --source <output>/source-evidence.json --result <output>/douyin-remake.json`

   验证通过后会同时生成 `<output>/douyin-remake.md`。

## 证据门禁

- `video-text-and-keyframes`：同时有可见文案或转写，以及至少两个不同关键画面。可以分析有证据支持的文字、画面和片段推进。
- `note-body-and-image-order`：同时有正文和按顺序排列的图片证据。可以分析有证据支持的图文结构与图片顺序。
- `page-text-only`：自动降级。结果必须是 `partial`；`pace.finding` 和 `visual.finding` 必须为 `null`，置信度为 `none`，并明确“仅能分析页面文字”。仍可基于用户主题生成新的口播和分镜，但不能声称看过原作镜头、剪辑节奏、配乐或图片顺序。

图文的正文和图片顺序可由用户通过 `contentEvidence.noteBody`、`contentEvidence.noteImages[]` 提供；视频可通过 `contentEvidence.transcript`、`contentEvidence.keyframes[]` 补充其有权使用的证据。真实视频采集会保存三张关键帧候选，重复画面会按哈希去重，不足两个仍自动降级。

## 结果合同

`douyin-remake.json` 使用 `schemaVersion: "1.1"`、`kind: "douyin-original-remake"`，包含：

- `source`：原样复制来源身份、时间与 `analysisScope`。
- `brief`：`niche`、`audience`、`voice`、`topic`、`verifiedClaims`、`cta`、`durationSec`、`constraints`。
- `teardown`：`hook`、`pace`、`visual`、`structure`、`conversionPoints`、`reusableMechanisms`；每个判断引用有效证据 ID 并带 `none|low|medium|high` 置信度。
- `remake`：`angle`、`hook`、连续且覆盖完整时长的 `script` 和 `storyboard`、`cta`。脚本与分镜口播逐段一致。
- `originalityReview`：`passed: true`、相似片段、保留的独特元素、实质改动、`humanReviewRequired: true`。
- `claimReview`：只审查保证赚钱、稳赚、零风险、冒充官方排名、明确百分比效果、绝对安全或永久有效等高风险声明。职业收入、兼职报价、接单价格、普通成本和节省区间可以沿用参考内容或常见市场范围，不要求写入 `verifiedClaims`，也不得因此把钩子改弱。
- `limitations`：如实写明未覆盖的证据范围。

可直接参考 `fixtures/valid-remake-output.json` 和 `fixtures/valid-partial-output.json`。运行 `npm test` 做离线自测。

## 边界

只处理最终落到 `douyin.com/video/<id>` 或 `douyin.com/note/<id>` 的一条作品。登录墙、验证码、作品不可见、错误跳转或身份不一致时停止。不得读取 Cookie、网络响应或无关标签页；不得下载、点赞、评论、关注、上传或发布。

不照抄原文、独特口号、人物设定、品牌素材、事实数字或原镜头顺序；不承诺爆款、流量、涨粉、转化或法律意义上的绝对原创。最终结果必须人工复核。

Easy WebBridge：<https://github.com/xxjrq/easy-webbridge/releases>；Gitee 备用：<https://gitee.com/xxjrq/easy-webbridge/releases>。

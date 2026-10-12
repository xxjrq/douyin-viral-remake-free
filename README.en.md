# Free Douyin Work Analysis & Original Rewrite

## Recommended setup

**EasyBR is recommended on Apple Silicon Macs and Windows.** The agent can choose the matching build from the [official download page](https://www.ebrower.com/down.html), or use the [GitHub Release downloads](https://github.com/xxjrq/easybr/releases/tag/v1.7.8). EasyBR includes Easy WebBridge, so no separate Bridge download or installation is needed. Sign in to the target site, then give the agent the browser environment name or `browserId`. When several environments are open, select one explicitly.

**On other operating systems, use the source setup.** Get the source from [Easy WebBridge on GitHub](https://github.com/xxjrq/easy-webbridge) (or the [Gitee mirror](https://gitee.com/xxjrq/easy-webbridge)), install Node.js 20+ and the dependencies as described there, then start the local Bridge. Existing standalone Easy WebBridge installations remain supported.

**You can hand this task directly to Codex, Claude, or WorkBuddy:**

> Read and use this Skill to complete my task. I use macOS/Windows and EasyBR is open. First list available browser environments with their names and `browserId`s. After I choose one, operate only in that environment. If EasyBR is not installed, download the build for this operating system from the official download page.

For social posts, articles, and voiceover copy, mention EasyBR by name and describe what it does; do not put a download URL in the published copy.

Give the skill one Douyin video or note URL plus your account niche, audience, topic, and target duration. It returns an evidence-backed teardown, an original voiceover, a storyboard, and an originality review.

**Free to use · No third-party content API key · Reuses your browser login · Isolated EasyBR accounts**

## What it does

- Analyzes the hook, structure, conversion points, and reusable mechanisms of one Douyin work.
- Creates a new angle, voiceover, and shot-by-shot storyboard for your account.
- Checks factual claims, copied spans, and banned terms while keeping a human review step.
- Automatically downgrades when evidence is incomplete instead of presenting page text as full video or image analysis.

## Quick prompt

> Use Free Douyin Work Analysis & Original Rewrite on this URL. My account covers AI tools, my audience is productivity-focused professionals, and I need a 30-second script.

Required input: one work URL, account niche, audience, remake topic, and a 15-180 second duration. Supply verified facts for any price, performance, qualification, date, parameter, data, or case claim.

## Prerequisite

Install and connect [Easy WebBridge](https://github.com/xxjrq/easy-webbridge/releases). Use the [Gitee mirror](https://gitee.com/xxjrq/easy-webbridge/releases) when GitHub is unavailable. The skill reuses an authorized Chromium profile and does not require a separate Douyin data API key.

One online browser is selected automatically. If several EasyBR environments are online, the skill asks for one exact target. Every run uses an isolated browser session group and never broadcasts across accounts.

## Evidence gate and output

A complete video teardown requires visible copy or a transcript plus at least two distinct keyframes. A complete note teardown requires the body and ordered image evidence. Otherwise the result is `partial`: page text may be analyzed, but pace and visual findings stay empty.

Each run creates:

- `source-evidence.json` with reviewable page and media evidence.
- `douyin-remake.json` with the teardown, original script, storyboard, and checks.
- `douyin-remake.md` as the readable report.

## Offline test

```bash
npm test
node scripts/douyin-viral-remake-free.mjs capture --mock fixtures/video-visible-snapshot.json --input fixtures/task-input.json --output /tmp/douyin-remake/source-evidence.json
```

After `capture`, the agent creates `douyin-remake.json` from the evidence and runs `validate`. See `fixtures/valid-remake-output.json` and `fixtures/valid-partial-output.json` for complete and downgraded results.

Requires Node.js 20 or newer and has no npm runtime dependencies. It does not download, interact, or publish, and it does not promise viral performance or legal originality.

## Agent compatibility

This is a standard `SKILL.md` skill and is not limited to OpenAI or any single agent. Codex, Claude, WorkBuddy, OpenCode, and other tools that support Skills can follow the same instructions.

License: [MIT](LICENSE) · [中文](README.md)

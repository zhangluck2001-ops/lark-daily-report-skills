---
name: lark-daily-report
description: "飞书日报采集、语义清洗、撰写与网页填报：使用 lark-cli 抓取当天日程、任务、已结束会议及每个会议的智能纪要摘要、当天有收发消息的群聊与私聊、当天创建的飞书云文档、当天修改的多维表格，在本地清洗并生成日报，再强制优先通过 Codex in-app Browser 注入飞书汇报页面。适用于生成、整理、填写飞书日报、工作日志、今日总结和下班总结。环境/权限检查交给 lark-daily-report-env；不要创建飞书云文档作为日报交付物，不要代替用户点击最终提交。"
metadata:
  requires:
    bins: ["bash", "node", "npm", "lark-cli"]
---

# 飞书日报网页填报

使用 `lark-cli` 采集当天素材，在本地语义清洗并生成日报，再填写飞书「汇报」板块。不要创建云文档代替日报，不要点击最终提交。

## 1. 运行前边界

- 正常写日报时不要先做环境检查，避免把初始化信息塞进上下文。
- 如果用户明确要求检查环境，或采集/填写阶段出现 `lark-cli`、权限、登录、Playwright、Chromium 异常，改用 `lark-daily-report-env`。
- 不要申请 `report:*` 权限。汇报写入通过浏览器完成。

## 2. 采集素材

读取 [`references/data-collection.md`](references/data-collection.md)，默认运行：

```bash
node scripts/collect-sources.mjs --output "/private/tmp/lark-daily-report-sources.json"
node scripts/inspect-sources.mjs --input "/private/tmp/lark-daily-report-sources.json" --index --limit-chats 8
```

- 日期默认直接取电脑本地日期和时区；正常日报不要手动计算或指定日期。
- 脚本分页枚举全部群聊和私聊，并发读取当天消息；同时读取日程、任务、会议纪要摘要、今日创建文档和今日修改多维表格；只执行一轮网络采集。
- 临时文件只保存脱敏后的结构化素材；默认索引只输出少量候选会话，避免 token 爆炸。
- 使用 `inspect-sources.mjs --chat-id "<CHAT_ID>"` 按会话渐进读取；只展开与日报判断有关的会话，长会话用 `--chunk` 分块。
- 会议不能只看标题或 display，必须使用脚本采集到的 `meetings[].notes[].summary` 作为摘要依据；缺失时记录缺口，不要脑补。
- 数据缺口单独记录，不阻塞可用来源。

## 3. 语义清洗与撰写

读取 [`references/report-form.md`](references/report-form.md) 和 [`references/output-format.md`](references/output-format.md)。隐私与无关内容清洗由 AI 直接按工作相关性判断；只有边界不清时才读取 [`references/privacy-cleaning.md`](references/privacy-cleaning.md)。

- 只写与今天工作有关、且有素材支撑的进展、交付、决策、待办、阻塞和必要协同。
- AI 自行丢弃私人内容、无关闲聊、系统噪声和敏感信息；不要把清洗过程写进日报。
- 必须按输出格式限制写入，合并重复事项，避免同一件事换说法写多次。
- 写入前必须先向用户询问明日计划：请用户补充明天计划、指出候选计划里哪些不是自己的工作并删除、补充遗漏事项。用户回复后再写入网页。

如果用户只要求草稿，展示草稿后结束。  
如果用户要求写日报、填写日报、完成日报或运行本 skill，今日总结可直接生成；明日计划必须经过用户补充/剔除确认后再进入网页填写。

## 4. 填写并交回用户

必须先使用当前 Codex 环境提供的 in-app `Browser` 插件，并按其 `browser` Skill 操作当前页面。只有确认当前会话没有 Browser 插件或 Browser 无法调用，并明确告知用户后，才允许按 [`references/report-form.md`](references/report-form.md) 使用本地 Playwright 回退脚本。

- 使用 Codex in-app Browser 时，必须在打开/填写日报页面前显式展示浏览器窗口；不要后台隐藏填写。
- 检测到登录页时保持页面打开，等待用户自行登录。
- 从字段标题定位最近且唯一的编辑器；确认「今日工作总结」和「明日工作计划」不是同一个编辑器。
- 写入后逐字段回读校验，确认页面实时保存。
- 保持浏览器打开，只提示用户“日报已写完，请自行检查、修改并点击提交”。
- Skill 永远不点击最终提交按钮。

完成后删除临时素材：

```bash
node scripts/inspect-sources.mjs --input "/private/tmp/lark-daily-report-sources.json" --cleanup
```

## 边界

- 不得自动填写密码、短信验证码或扫码确认。
- 不得创建飞书云文档作为日报结果。
- 不得猜测汇报写入 API。
- 不得一次性把全部聊天原文输出到上下文。
- 不得在用户不可见的后台浏览器中填写日报。
- 不得点击最终提交按钮。

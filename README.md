# Lark Daily Report Skills

这是一个成套的 Codex skill 仓库，用于飞书日报的环境检查、素材采集、语义清洗、日报撰写和网页填报。

本仓库包含两个绑定使用的 skill：

- `lark-daily-report-env`：首次使用前的环境与权限检查。
- `lark-daily-report`：采集当天飞书工作信息，生成日报，并通过 Codex in-app Browser 填写飞书汇报页面。

两个 skill 必须放在同一个仓库维护，因为日报填写依赖环境检查输出的 CLI、权限和浏览器可用性结论。

## 功能概览

`lark-daily-report-env` 会检查：

- Node.js / npm 环境。
- `lark-cli` 安装路径、版本和更新状态。
- 飞书用户登录状态。
- 日程、即时消息、会议纪要、云文档、多维表格等日报采集权限。
- Codex Browser、Playwright 和 Chromium 环境。

`lark-daily-report` 会执行：

- 通过 `lark-cli` 抓取今天的日程、任务、会议、会议纪要摘要、群聊与私聊消息、今日创建的云文档、今日修改的多维表格。
- 用 AI 判断工作相关性，过滤私人内容和无关闲聊。
- 限制日报输出长度，去除重复表达。
- 在写入前询问用户明日真实计划、需要删除的候选计划和补充事项。
- 强制优先使用 Codex in-app Browser 显示飞书汇报页面并填写。
- 填写完成后停止，由用户自行检查、修改并点击提交。

## 安装

将两个 skill 目录一起复制到 Codex skill 目录，例如：

```bash
mkdir -p ~/.agents/skills
cp -R skills/lark-daily-report ~/.agents/skills/
cp -R skills/lark-daily-report-env ~/.agents/skills/
```

如果你的 Codex 使用 `~/.codex/skills`，也可以复制到该目录。

安装后重启或刷新 Codex skill 列表。

## 使用顺序

首次使用或换电脑时，先运行环境检查：

```text
请使用 lark-daily-report-env 检查飞书日报环境和权限
```

环境检查通过后，再运行日报填写：

```text
请使用 lark-daily-report 帮我写今天的飞书日报，并填入日报页面
```

## 权限说明

日报 skill 依赖飞书 CLI 的用户身份权限。不同企业后台的可申请权限清单可能不同，汇报写入相关 OpenAPI 权限可能被判定为越权，因此本 skill 不通过汇报 OpenAPI 写入，而是使用浏览器自动化填写用户可见页面。

核心采集权限通常包括：

- 日历与日程读取。
- 即时消息与会话读取。
- 会议与会议纪要读取。
- 云文档、云空间、多维表格读取。
- 任务读取。

以 `lark-daily-report-env` 的检查输出为准。

## 安全边界

- 不创建飞书云文档作为日报交付物。
- 不代替用户点击最终提交。
- 不把私人聊天、无关闲聊、敏感个人信息写入日报。
- 页面填写必须可见，方便用户检查。
- 公开仓库不包含任何组织内部 appId、ruleId 或真实汇报链接；使用本地 Playwright 回退时必须自行设置 `LARK_REPORT_URL`。

## 仓库结构

```text
.
├── CHANGELOG.md
├── README.md
└── skills
    ├── lark-daily-report
    └── lark-daily-report-env
```

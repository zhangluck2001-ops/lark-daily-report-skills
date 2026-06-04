# Usage

## 1. Check Environment

Run `lark-daily-report-env` before the first daily report run:

```text
请检查我的飞书日报 skill 环境、飞书 CLI、登录状态和权限
```

If the checker reports missing permissions, grant them in the Feishu developer console, finish app approval, then run the checker again.

For local Playwright fallback only, set your own report URL before filling:

```bash
export LARK_REPORT_URL="https://oa.feishu.cn/report/record/detail?...&ruleId=<yourRuleId>&from=...<yourAppId>..."
```

## 2. Generate And Fill Report

Run `lark-daily-report` after the environment passes:

```text
请帮我写今天的飞书日报并填入页面，由我自己检查和提交
```

The skill will collect today's work sources, clean unrelated information, ask for tomorrow-plan confirmation, open the visible Feishu report page, and fill the report fields.

## 3. User Review

After filling, review the page manually and click submit yourself.

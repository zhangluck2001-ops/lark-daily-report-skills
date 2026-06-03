# 工作日志-AI应用研究院表单

此表单位于飞书「汇报」板块，不是飞书云文档。

## 固定入口

```text
https://oa.feishu.cn/report/record/detail?lang=zh-CN&open_in_browser=true&from=miniprogram%3Aminiprogram-native-fusion%3Acli_9d0208a7d1bbd10c&ruleId=7573565276168011780&botScene=write_notice&botName=near_submit_ddl&fromAppLink=true
```

## 浏览器选择

1. 首选 Codex Desktop 提供的 in-app `Browser` 插件。它是 Codex 宿主能力，不是用户普通 Chrome，也不是 Skill 内 npm 安装的依赖。
2. 当前 Codex 会话暴露 `Browser` 插件时，必须读取其 `browser` Skill 并使用 in-app browser。填写日报属于用户需要看到和复核的页面操作，必须在打开或填写前调用 Browser 的 `visibility` capability 显式展示浏览器：`await (await browser.capabilities.get("visibility")).set(true)`。
3. 不要因为本地已安装 Playwright 就跳过 Browser。只有当前会话没有 Browser 插件、或 Browser 调用失败且已明确告知用户时，才使用本地 Playwright 回退：

```bash
node scripts/fill-report.mjs
```

回退脚本从 Skill 根目录读取 `daily-summary.txt` 和 `daily-plan.txt`。其他团队可设置 `LARK_REPORT_URL`。正常流程优先用 Codex Browser 直接注入，不要把草稿发给用户确认后再写。

## 页面可见性

- 使用 Codex in-app Browser 时，打开日报链接、等待登录、填写字段、回读校验和最终交回用户的全过程都必须保持浏览器可见。
- 不要在后台隐藏填写日报；用户必须能看到页面已打开，并能在填写完成后直接检查、修改和提交。
- 如果浏览器 visibility capability 不可用，应明确告知用户当前无法显式展示 Codex Browser；再考虑 Playwright 回退。

## 字段策略

| 页面字段 | 必填 | 内容策略 |
|---|---|---|
| 本月重点工作 | 否 | 已知且需要更新时填写，否则保留页面原值 |
| 本周重点工作 | 否 | 已知且需要更新时填写，否则保留页面原值 |
| 今日工作总结 | 是 | 按 `output-format.md` 写今天完成的重点事项 |
| 明日工作计划 | 是 | 先询问用户补充和剔除，再按 `output-format.md` 写明天重点计划 |
| 需要协同事项 | 否 | 没有可靠阻塞时留空或保留页面原值 |
| 汇报给谁 | 是 | 保留页面默认值；为空时交给用户处理 |

## 登录处理

- 检测到扫码、手机号、验证码、账号登录或登录提示时立即暂停。
- 保持当前页面打开，等待用户自行登录。
- 登录后复用当前 tab，不要重复打开新页面。

## 编辑器定位

- 从字段标题出发，定位包含该标题且只包含一个编辑器的最近容器。
- 不要使用外层大容器的宽泛文本匹配，不要假设编辑器固定序号。
- 「今日工作总结」和「明日工作计划」必须解析成两个不同编辑器。
- 写入后移除富文本编辑器产生的零宽字符，再逐字段回读校验。
- 无法唯一定位或校验失败时停止，不要继续填写。

## 完成条件

- 确认页面标题为「工作日志-AI应用研究院」。
- 确认今日总结与明日计划分别写入不同编辑器。
- 确认页面出现实时保存状态，或字段回读内容一致。
- 确认 Codex in-app Browser 处于可见状态。
- 保持页面打开，告知用户“日报已写完，请自行检查、修改并点击提交”。
- 不点击最终提交按钮。

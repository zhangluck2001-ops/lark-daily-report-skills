---
name: lark-daily-report-env
description: "飞书日报运行环境检查与初始化：检查 Node.js/npm、lark-cli 安装路径与版本、飞书用户登录状态、日报采集核心/可选权限、Playwright 与 Chromium。本 skill 只用于首次安装、用户要求检查环境、日报 skill 报告环境/权限/浏览器依赖异常时；不要用它采集日报素材或填写日报网页。"
metadata:
  requires:
    bins: ["bash", "node", "npm"]
---

# 飞书日报环境检查

本 skill 只做环境检测和初始化，不撰写日报、不采集聊天、不填写网页。

## 使用时机

- 用户第一次安装或试运行飞书日报 skill。
- 用户明确要求检查 `lark-cli`、权限、登录、Playwright 或 Chromium。
- `lark-daily-report` 运行时提示环境、权限或浏览器依赖缺失。

## 检查

```bash
bash scripts/ensure-environment.sh
```

需要强制重查时：

```bash
bash scripts/ensure-environment.sh --force
```

脚本检查：

- Node.js 与 npm
- `lark-cli` 安装路径、当前版本、是否低于最低版本、是否有可更新版本
- 飞书用户登录状态与 token 状态
- 日报采集核心 user scope；任务/多维表格等增强来源作为可选 scope 单独提示
- Playwright 运行时与 Chromium
- Codex in-app Browser 插件缓存提示

`ensure-environment.sh` 的通过标记最多复用 7 天，并且每次复用前仍会轻量校验飞书用户 token；登录过期或权限变化时会自动重跑完整检查。

## 修复

缺少本地依赖时，在用户同意后运行：

```bash
bash scripts/setup-environment.sh
```

登录或权限缺失时读取 [`references/environment-setup.md`](references/environment-setup.md)。

不要申请 `report:*` 或汇报分类权限。日报写入由 `lark-daily-report` 通过浏览器填写网页完成。

# 环境安装与授权

仅在 `scripts/ensure-environment.sh` 或 `scripts/check-environment.sh` 报告缺失项时读取。

## 自动安装本地依赖

获得用户同意后，在 Skill 根目录运行：

```bash
bash scripts/setup-environment.sh
```

该脚本优先复用电脑上已经存在且版本匹配的 Playwright 运行时与 Chromium。只有找不到可用组合时，才安装 `lark-cli`、Skill 本地 Playwright 依赖或 Chromium。不要静默安装。

安装 Chromium 时脚本使用国内镜像变量：

```bash
PLAYWRIGHT_DOWNLOAD_BASE_URL=https://npmmirror.com/mirrors/playwright
```

## Codex in-app Browser

Codex Desktop 的 in-app `Browser` 是宿主插件，不是 Skill 内依赖，也不是用户普通 Chrome。Skill 脚本不能通过 npm 强制安装宿主插件。

- 当前 Codex 会话已暴露 `Browser` 插件时，优先使用它填写日报。
- 前置检查会提示本机是否检测到 Codex Browser 插件缓存，但该提示不作为阻塞项。
- 宿主未提供 Browser 插件时，使用 Skill 自带的本地 Playwright + Chromium 回退流程。

## 飞书登录和最小授权

不要申请任何 `report:*` scope。汇报页面由浏览器填写。

```bash
lark-cli auth login --scope "calendar:calendar.event:read vc:meeting.search:read vc:meeting.meetingevent:read vc:note:read vc:record:readonly search:docs:read contact:user.basic_profile:readonly im:message:readonly im:chat:read im:message.p2p_msg:get_as_user im:message.group_msg:get_as_user contact:user.base:readonly docx:document:readonly"
```

命令等待用户在飞书中完成授权。如果检查仍报告缺少 scope，需要管理员先在飞书开发者后台为当前应用开通相应权限，再重新登录。

仅在确实需要把联系人 `open_id` 回填为姓名时，增量申请可选权限：

```bash
lark-cli auth login --scope "contact:user:search"
```

## 验证

```bash
bash scripts/ensure-environment.sh --force
```

脚本返回 `0` 后继续采集。环境脚本不会修改其他工具的配置。

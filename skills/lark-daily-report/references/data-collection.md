# 飞书 CLI 当天素材抓取

所有素材都通过 `lark-cli` 抓取；没有外部数据源。`scripts/collect-sources.mjs` 只是把多条飞书 CLI 调用编排成一次采集，并负责分页、并发、去敏感 token 和结构压缩。

## 快速采集

```bash
SOURCES_FILE="/private/tmp/lark-daily-report-sources.json"
trap 'node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --cleanup >/dev/null 2>&1 || true' EXIT
node scripts/collect-sources.mjs --output "$SOURCES_FILE"
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --index --limit-chats 8
```

默认直接读取电脑本地日期和时区，采集“今天”的日程、任务、会议摘要、聊天和文档线索。正常日报不要传 `--date`，也不要手动计算日期。

仅回放测试历史日期时才使用：

```bash
node scripts/collect-sources.mjs \
  --date "2026-06-02" \
  --concurrency 10 \
  --output "$SOURCES_FILE"
```

- 脚本内部按本地日期生成当天时间窗。
- 默认并发读取 `10` 个会话。遇到限流时降为 `4` 或 `6`。
- 临时文件权限为 `0600`，仅保存去敏感 token 后的结构化素材；这不是完整脱敏文件，中途失败也必须清理。

## 低 token 工作集

先看索引。索引输出日程、会议、文档、数据缺口、少量候选会话预览，以及被省略会话的无正文 metadata：

```bash
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --index --limit-chats 8
```

候选排序使用轻量关键词、消息长度、会话类型等信号做预排序，只用于节省上下文，不是最终清洗判断。被省略会话仍会暴露 `chatId/name/score`，AI 需要结合日程、会议、文档和会话 metadata 决定是否按 `--chat-id` 展开。

按会话展开必要片段：

```bash
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" \
  --chat-id "<CHAT_ID>" --chunk-size 20 --chunk 1
```

按飞书 CLI 抓取类别读取：

```bash
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --section agenda
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --section meetings
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --section documents
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --section tasks
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --section gaps
```

- 不要一次性打印完整临时文件。
- 不要为了“保险”展开所有会话；优先展开候选分高、被省略但名称/类型可疑、与日程/会议/文档互相印证、或上下文不确定的会话。
- 对可能含有个人成果、待办、协同或不确定上下文的会话，按会话读取并判断；明显无工作信息的会话跳过。
- 明显只有系统卡片、考勤、人事或外部闲聊的会话可快速排除；不要因群名或单一关键词直接认定为工作成果。
- 长会话分块读取，需要时结合相邻分块理解上下文。

完成后清理：

```bash
node scripts/inspect-sources.mjs --input "$SOURCES_FILE" --cleanup
```

## 飞书 CLI 抓取范围

| 抓取内容 | 飞书 CLI |
|---|---|
| 今日日程 | `lark-cli calendar +agenda --as user` |
| 已结束会议 | `lark-cli vc +search --as user` |
| 每个会议的智能纪要摘要 | `lark-cli vc +notes --as user` + `lark-cli docs +fetch --api-version v2 --as user` |
| 当天活跃群聊与私聊候选 | `lark-cli im +chat-list --as user --types group,p2p --sort-type ByActiveTimeDesc`，按活跃时间早停 |
| 各会话当天消息 | `lark-cli im +chat-messages-list --as user --no-reactions` |
| 当天新建且归属用户的文档/表格/多维表格/幻灯片 | `lark-cli drive +search --as user --mine --created-since ...` |
| 当天用户修改过的多维表格 | `lark-cli drive +search --as user --edited-since ... --doc-types bitable` |
| 今天/明天到期的我的任务 | `lark-cli task +get-my-tasks --as user` |

文档搜索结果只是飞书 CLI 抓到的工作线索。仅在标题或上下文表明与当天工作有关时读取正文。

会议不能只根据标题或列表摘要撰写；必须查看 `meetings[].notes[].summary`。没有摘要时将该会议作为缺口处理，不要根据会议名推断结论。

## 项目专用脚本

如果当前项目 `AGENTS.md` 对特定群聊明确要求使用专用历史脚本，仅在用户请求确实触发该项目规则时执行。通用日报采集已经覆盖该群时，不要再次拉取相同历史记录。

## 最小权限

| 数据 | 所需 scope |
|---|---|
| 查询日程 | `calendar:calendar.event:read` |
| 搜索已结束会议 | `vc:meeting.search:read` |
| 获取会议纪要 | `vc:meeting.meetingevent:read`、`vc:note:read`、`vc:record:readonly` |
| 读取智能纪要正文 | `docx:document:readonly` |
| 枚举会话与读取消息 | `im:chat:read`、`im:message:readonly`、`im:message.group_msg:get_as_user`、`im:message.p2p_msg:get_as_user`、`contact:user.basic_profile:readonly`、`contact:user.base:readonly` |
| 搜索云空间文档 | `search:docs:read` |
| 查询任务线索 | `task:task:read` |
| 多维表格线索 | `base:app:read`、`base:record:read` |

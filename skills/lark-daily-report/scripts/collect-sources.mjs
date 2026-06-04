#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 128 * 1024 * 1024;

function parseArgs(argv) {
  const args = { concurrency: 10 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--date') args.date = argv[++index];
    else if (value === '--output') args.output = argv[++index];
    else if (value === '--concurrency') args.concurrency = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.output) throw new Error('Usage: node scripts/collect-sources.mjs --output <path> [--date YYYY-MM-DD] [--concurrency N]');
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 30) {
    throw new Error('--concurrency must be an integer between 1 and 30');
  }
  return args;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function offsetString(date) {
  const total = -date.getTimezoneOffset();
  const sign = total >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(total) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(total) % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function dateRange(requestedDate) {
  const now = new Date();
  const today = requestedDate || formatDate(now);
  const [year, month, day] = today.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const nextDate = new Date(year, month - 1, day + 1);
  const nextNextDate = new Date(year, month - 1, day + 2);
  const offset = offsetString(startDate);
  return {
    today,
    nextDay: formatDate(nextDate),
    nextNextDay: formatDate(nextNextDate),
    start: `${today}T00:00:00${offset}`,
    end: `${formatDate(nextDate)}T00:00:00${offset}`,
    timezoneOffset: offset,
  };
}

async function cli(args) {
  const { stdout } = await execFileAsync('lark-cli', args, { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  const trimmed = stdout.trim();
  let result;
  try {
    result = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error(`lark-cli did not return JSON: ${trimmed.slice(0, 500)}`);
    }
    result = JSON.parse(trimmed.slice(start, end + 1));
  }
  if (!result.ok) throw new Error(JSON.stringify(result.error || result));
  return result.data || {};
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '<link>';
  }
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s<>"')\]]+/g, redactUrl)
    .replace(/\b(?:img|file)_v\d+_[\w-]+\b/g, '<asset>')
    .replace(/<file\s+key="[^"]+"\s+name="([^"]+)"\s*\/>/g, '<file name="$1"/>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>')
    .replace(/\b\d{17}[\dXx]\b/g, '<id-card>')
    .replace(/\b(?:\d[ -]?){16,19}\b/g, '<bank-card>')
    .replace(/\b1[3-9]\d{9}\b/g, '<phone>')
    .replace(/(?:¥|￥)\s?\d+(?:,\d{3})*(?:\.\d+)?/g, '<amount>')
    .replace(/\b\d+(?:\.\d+)?\s?(?:元|块|万元|万)\b/g, '<amount>')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '<email>')
    .replace(/\bou_[a-z0-9]+\b/gi, '<user-id>')
    .replace(/\bcli_[a-z0-9]+\b/gi, '<app-id>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function xmlToText(value) {
  return sanitizeText(String(value || '')
    .replace(/<cite\b[^>]*user-name="([^"]+)"[^>]*><\/cite>/g, '$1')
    .replace(/<cite\b[^>]*title="([^"]+)"[^>]*><\/cite>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#xA;/g, '\n'));
}

function summarizeText(value, limit = 1600) {
  const text = xmlToText(value);
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function compactMessages(messages) {
  const compact = [];
  for (const message of messages) {
    const item = {
      time: message.create_time || '',
      type: message.msg_type || '',
      sender: message.sender?.sender_type || (message.sender ? '<sender>' : ''),
      content: sanitizeText(message.content),
    };
    const previous = compact.at(-1);
    if (previous && previous.type === item.type && previous.sender === item.sender && previous.content === item.content) {
      previous.repeat = (previous.repeat || 1) + 1;
      previous.lastTime = item.time;
    } else {
      compact.push(item);
    }
  }
  return compact;
}

async function paged(fetchPage, itemKey) {
  const items = [];
  let token = '';
  let pages = 0;
  do {
    const data = await fetchPage(token);
    items.push(...(data[itemKey] || []));
    token = data.has_more ? data.page_token : '';
    pages += 1;
  } while (token);
  return { items, pages };
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return number > 1e12 ? number : number * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function chatActiveTime(chat) {
  const candidates = [
    chat.last_active_time,
    chat.active_time,
    chat.update_time,
    chat.updated_at,
    chat.last_message?.create_time,
    chat.last_message?.update_time,
    chat.last_message?.create_time_ms,
  ];
  for (const value of candidates) {
    const timestamp = parseTimestamp(value);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

async function pagedActiveChats(range, gaps) {
  const items = [];
  let token = '';
  let pages = 0;
  let stoppedByActiveTime = false;
  const startMs = Date.parse(range.start);
  do {
    const data = await cli([
      'im', '+chat-list', '--as', 'user', '--types', 'group,p2p',
      '--sort-type', 'ByActiveTimeDesc', '--page-size', '100', '--format', 'json',
      ...(token ? ['--page-token', token] : []),
    ]);
    const chats = data.chats || [];
    items.push(...chats.filter(chat => {
      const activeMs = chatActiveTime(chat);
      return activeMs === null || activeMs >= startMs;
    }));

    const lastKnownActiveMs = [...chats].reverse().map(chatActiveTime).find(value => value !== null);
    if (lastKnownActiveMs !== undefined && lastKnownActiveMs < startMs) {
      stoppedByActiveTime = true;
      token = '';
    } else {
      token = data.has_more ? data.page_token : '';
    }
    pages += 1;
  } while (token);

  if (!stoppedByActiveTime && pages > 1) {
    gaps.push({
      source: 'chat-list-early-stop',
      error: 'chat-list did not expose enough active_time metadata to stop before all pages',
    });
  }

  return { items, pages, stoppedByActiveTime };
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function safe(label, fn, gaps) {
  try {
    return await fn();
  } catch (error) {
    gaps.push({ source: label, error: String(error.message || error).slice(0, 1000) });
    return null;
  }
}

function simplifyAgenda(items) {
  const list = Array.isArray(items) ? items : (items?.events || items?.items || items?.agenda || []);
  return list.map(item => ({
    title: item.summary || '',
    start: item.start_time?.datetime || '',
    end: item.end_time?.datetime || '',
    eventId: item.event_id || '',
  }));
}

function simplifyMeetings(items) {
  return items.map(item => ({
    meetingId: item.id || '',
    display: sanitizeText(item.display_info || ''),
  }));
}

function simplifyDocuments(items) {
  return items.map(item => ({
    title: sanitizeText(item.title_highlighted || ''),
    type: item.result_meta?.doc_types || item.entity_type || '',
    token: item.result_meta?.token || '',
    createdAt: item.result_meta?.create_time_iso || '',
    updatedAt: item.result_meta?.update_time_iso || '',
  }));
}

function simplifyTasks(items) {
  return items.map(item => ({
    id: item.guid || item.id || '',
    summary: sanitizeText(item.summary || item.title || ''),
    completed: item.completed_at ? true : Boolean(item.completed),
    due: item.due?.timestamp || item.due_time || item.due || '',
  })).filter(item => item.summary || item.id);
}

async function fetchMeetingNotes(meetings, gaps) {
  return (await mapLimit(meetings, 3, async meeting => {
    const meetingId = meeting.id || meeting.meetingId || '';
    if (!meetingId) return null;
    const notesData = await safe(`meeting-notes:${meetingId}`, () => cli([
      'vc', '+notes', '--as', 'user', '--meeting-ids', meetingId, '--format', 'json',
    ]), gaps);
    const notes = notesData?.notes || [];
    const enrichedNotes = await mapLimit(notes, 2, async note => {
      const token = note.note_doc_token || '';
      if (!token) {
        return {
          meetingId,
          noteDocToken: '',
          minuteToken: note.minute_token || '',
          createdAt: note.create_time || '',
          summary: '',
        };
      }
      const docData = await safe(`meeting-note-doc:${meetingId}`, () => cli([
        'docs', '+fetch', '--api-version', 'v2', '--as', 'user', '--doc', token, '--format', 'json',
      ]), gaps);
      return {
        meetingId,
        noteDocToken: token,
        minuteToken: note.minute_token || '',
        createdAt: note.create_time || '',
        summary: summarizeText(docData?.document?.content || ''),
      };
    });
    return {
      meetingId,
      notes: enrichedNotes,
    };
  })).filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const range = dateRange(args.date);
  const gaps = [];

  const agendaPromise = safe('calendar', () => cli([
    'calendar', '+agenda', '--as', 'user', '--start', range.today, '--end', range.today, '--format', 'json',
  ]), gaps);
  const meetingsPromise = safe('meetings', () => paged(token => {
    const command = ['vc', '+search', '--as', 'user', '--start', range.today, '--end', range.today, '--format', 'json'];
    if (token) command.push('--page-token', token);
    return cli(command);
  }, 'items'), gaps);
  const documentsPromise = safe('created-documents', () => paged(token => {
    const command = [
      'drive', '+search', '--as', 'user', '--query', '', '--mine',
      '--created-since', range.today, '--created-until', range.nextDay,
      '--doc-types', 'doc,docx,wiki,sheet,bitable,slides', '--sort', 'create_time', '--format', 'json',
    ];
    if (token) command.push('--page-token', token);
    return cli(command);
  }, 'results'), gaps);
  const editedBitablesPromise = safe('edited-bitables', () => paged(token => {
    const command = [
      'drive', '+search', '--as', 'user', '--query', '',
      '--edited-since', range.today, '--edited-until', range.nextDay,
      '--doc-types', 'bitable', '--sort', 'edit_time', '--format', 'json',
    ];
    if (token) command.push('--page-token', token);
    return cli(command);
  }, 'results'), gaps);
  const tasksPromise = safe('tasks', () => cli([
    'task', '+get-my-tasks', '--as', 'user',
    '--due-start', range.today, '--due-end', range.nextNextDay,
    '--page-all', '--format', 'json',
  ]), gaps);
  const chatsPromise = safe('chat-list', () => pagedActiveChats(range, gaps), gaps);

  const [agendaData, meetingsData, documentsData, editedBitablesData, tasksData, chatsData] = await Promise.all([
    agendaPromise, meetingsPromise, documentsPromise, editedBitablesPromise, tasksPromise, chatsPromise,
  ]);
  const meetingItems = meetingsData?.items || [];
  const meetingNotes = await fetchMeetingNotes(meetingItems, gaps);

  const chats = chatsData?.items || [];
  const activeChats = (await mapLimit(chats, args.concurrency, async chat => {
    const result = await safe(`chat:${chat.chat_id}`, () => paged(token => {
      const command = [
        'im', '+chat-messages-list', '--as', 'user', '--chat-id', chat.chat_id,
        '--start', range.start, '--end', range.end, '--sort', 'asc',
        '--page-size', '50', '--no-reactions', '--format', 'json',
      ];
      if (token) command.push('--page-token', token);
      return cli(command);
    }, 'messages'), gaps);
    if (!result?.items.length) return null;
    return {
      chatId: chat.chat_id,
      name: sanitizeText(chat.name || ''),
      mode: chat.chat_mode || '',
      pages: result.pages,
      messageCount: result.items.length,
      messages: compactMessages(result.items),
    };
  })).filter(Boolean);

  const data = {
    meta: {
      generatedAt: new Date().toISOString(),
      range,
      chatPages: chatsData?.pages || 0,
      chatPaginationStoppedByActiveTime: Boolean(chatsData?.stoppedByActiveTime),
      chatsTotal: chats.length,
      activeChatsTotal: activeChats.length,
      gapsTotal: gaps.length,
    },
    agenda: simplifyAgenda(agendaData),
    meetings: simplifyMeetings(meetingItems).map(meeting => ({
      ...meeting,
      notes: meetingNotes.find(item => item.meetingId === meeting.meetingId)?.notes || [],
    })),
    documents: {
      created: simplifyDocuments(documentsData?.items || []),
      editedBitables: simplifyDocuments(editedBitablesData?.items || []),
    },
    tasks: simplifyTasks(tasksData?.items || tasksData?.tasks || []),
    gaps,
    activeChats,
  };

  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(data)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(output, 0o600);

  console.log(JSON.stringify({
    output,
    ...data.meta,
    agendaTotal: data.agenda.length,
    meetingsTotal: data.meetings.length,
    createdDocumentsTotal: data.documents.created.length,
    editedBitablesTotal: data.documents.editedBitables.length,
    tasksTotal: data.tasks.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});

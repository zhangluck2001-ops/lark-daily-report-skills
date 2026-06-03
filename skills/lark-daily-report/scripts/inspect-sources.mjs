#!/usr/bin/env node

import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = { chunk: 1, chunkSize: 30, limitChats: 8 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') args.input = argv[++index];
    else if (value === '--index') args.index = true;
    else if (value === '--chat-id') args.chatId = argv[++index];
    else if (value === '--chunk') args.chunk = Number(argv[++index]);
    else if (value === '--chunk-size') args.chunkSize = Number(argv[++index]);
    else if (value === '--limit-chats') args.limitChats = Number(argv[++index]);
    else if (value === '--section') args.section = argv[++index];
    else if (value === '--cleanup') args.cleanup = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.input) throw new Error('Usage: node scripts/inspect-sources.mjs --input <path> [--index | --chat-id ID | --section NAME | --cleanup] [--limit-chats N]');
  if (!Number.isInteger(args.limitChats) || args.limitChats < 0 || args.limitChats > 100) {
    throw new Error('--limit-chats must be an integer between 0 and 100');
  }
  return args;
}

const WORK_SIGNALS = [
  '日报', '周报', '会议', '纪要', '需求', '方案', '评审', '排期', '上线', '发布',
  '测试', '修复', '问题', '进展', '提交', '交付', '客户', '报价', '产品', '项目',
  '自动化', '权限', '脚本', '数据', '平台', '认证', '目标', 'OKR', 'skill', 'Codex',
  'bug', 'PRD', 'demo',
];

const LOW_CONTEXT_SIGNALS = [
  '收到', '好的', 'ok', 'OK', '哈哈', '辛苦', '谢谢', '表情', '图片', '红包',
];

function compactContent(value, limit = 90) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function scoreChat(chat) {
  const joined = `${chat.name || ''}\n${chat.messages.map(message => message.content).join('\n')}`;
  let score = Math.min(chat.messageCount || 0, 20);
  const reasons = [];

  const matchedSignals = WORK_SIGNALS.filter(signal => joined.includes(signal)).slice(0, 5);
  if (matchedSignals.length) {
    score += matchedSignals.length * 8;
    reasons.push(`signals:${matchedSignals.join(',')}`);
  }

  if (chat.mode === 'p2p') {
    score += 6;
    reasons.push('p2p');
  }

  const longMessages = chat.messages.filter(message => (message.content || '').length >= 30).length;
  if (longMessages) {
    score += Math.min(longMessages, 8) * 2;
    reasons.push(`long_messages:${longMessages}`);
  }

  const lowContextHits = LOW_CONTEXT_SIGNALS.filter(signal => joined.includes(signal)).length;
  if (lowContextHits && !matchedSignals.length && longMessages <= 2) {
    score -= Math.min(lowContextHits * 4, 12);
    reasons.push('likely_low_context');
  }

  return { score, reasons };
}

function chatPreview(chat) {
  const { score, reasons } = scoreChat(chat);
  const compactPreview = message => ({
    time: message.time,
    type: message.type,
    sender: message.sender,
    content: compactContent(message.content),
  });
  const informative = chat.messages
    .filter(message => (message.content || '').length >= 20)
    .slice(0, 2)
    .map(compactPreview);
  const fallback = informative.length ? [] : chat.messages.slice(0, 1).map(compactPreview);
  const tail = chat.messages.length > 1 ? chat.messages.slice(-1).map(compactPreview) : [];
  return {
    chatId: chat.chatId,
    name: chat.name,
    mode: chat.mode,
    pages: chat.pages,
    messageCount: chat.messageCount,
    compactMessageCount: chat.messages.length,
    candidateScore: score,
    candidateReasons: reasons,
    preview: [...informative, ...fallback, ...tail].slice(0, 3),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolve(args.input);
  if (args.cleanup) {
    await unlink(input).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    console.log(JSON.stringify({ cleaned: input }));
    return;
  }

  const data = JSON.parse(await readFile(input, 'utf8'));
  if (args.chatId) {
    const chat = data.activeChats.find(item => item.chatId === args.chatId);
    if (!chat) throw new Error(`Chat not found: ${args.chatId}`);
    if (!Number.isInteger(args.chunk) || args.chunk < 1) throw new Error('--chunk must be a positive integer');
    if (!Number.isInteger(args.chunkSize) || args.chunkSize < 1 || args.chunkSize > 100) {
      throw new Error('--chunk-size must be an integer between 1 and 100');
    }
    const start = (args.chunk - 1) * args.chunkSize;
    const messages = chat.messages.slice(start, start + args.chunkSize);
    console.log(JSON.stringify({
      chatId: chat.chatId,
      name: chat.name,
      mode: chat.mode,
      messageCount: chat.messageCount,
      compactMessageCount: chat.messages.length,
      chunk: args.chunk,
      chunkSize: args.chunkSize,
      chunksTotal: Math.ceil(chat.messages.length / args.chunkSize),
      messages,
    }, null, 2));
    return;
  }

  if (args.section) {
    if (!['agenda', 'meetings', 'documents', 'tasks', 'gaps'].includes(args.section)) {
      throw new Error('--section must be agenda, meetings, documents, tasks, or gaps');
    }
    console.log(JSON.stringify({ [args.section]: data[args.section] }, null, 2));
    return;
  }

  const rankedChats = data.activeChats
    .map(chatPreview)
    .sort((left, right) => right.candidateScore - left.candidateScore)
    .slice(0, args.limitChats);

  console.log(JSON.stringify({
    meta: data.meta,
    agenda: data.agenda,
    meetings: data.meetings,
    documents: data.documents,
    tasks: data.tasks || [],
    gaps: data.gaps,
    activeChatsShown: rankedChats,
    activeChatsOmitted: Math.max(0, data.activeChats.length - rankedChats.length),
    note: 'activeChatsShown is a token-saving candidate list, not the final privacy/work relevance decision. Use --chat-id to inspect necessary chats only.',
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});

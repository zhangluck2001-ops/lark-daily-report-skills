/**
 * Fill the Feishu report page without submitting it.
 *
 * Input files in the skill root:
 *   daily-summary.txt
 *   daily-plan.txt
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadPlaywrightRuntime } = require('./playwright-runtime.cjs');
const {
  chromium,
  executablePath: CHROMIUM_EXECUTABLE,
  source: PLAYWRIGHT_RUNTIME,
} = loadPlaywrightRuntime({ rootDir: ROOT_DIR });
const DATA_DIR = resolve(homedir(), '.playwright-data', 'lark-daily-report');
const REPORT_URL = process.env.LARK_REPORT_URL;
const EDITOR_SELECTOR = '.zone-container.editor-kit-container';
const LOGIN_WAIT_MS = Number(process.env.LARK_LOGIN_WAIT_MS || String(30 * 60 * 1000));
const LOGIN_POLL_MS = 3000;
const FORM_SETTLE_MS = 10000;

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function readInput(name) {
  const filePath = resolve(ROOT_DIR, name);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8').trim() : '';
}

function removeInput(name) {
  try {
    unlinkSync(resolve(ROOT_DIR, name));
  } catch {}
}

function normalizeText(value) {
  return value.replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

async function findEditorIndices(page, label) {
  const editors = page.locator(EDITOR_SELECTOR);
  return editors.evaluateAll((elements, args) => {
    const normalizeLabel = value => value.replace(/\s+/g, '').replace(/\*$/, '');
    return elements.flatMap((editor, index) => {
      let container = editor.parentElement;
      while (container && container !== document.body) {
        const editorCount = container.querySelectorAll(args.editorSelector).length;
        const hasExactLabel = Array.from(container.querySelectorAll('*')).some(node => {
          if (node.querySelector(args.editorSelector)) return false;
          return normalizeLabel(node.textContent || '') === normalizeLabel(args.label);
        });
        if (editorCount === 1 && hasExactLabel) return [index];
        container = container.parentElement;
      }
      return [];
    });
  }, { editorSelector: EDITOR_SELECTOR, label });
}

async function findEditor(page, label) {
  const editors = page.locator(EDITOR_SELECTOR);
  const indices = await findEditorIndices(page, label);
  if (indices.length !== 1) {
    throw new Error(`字段定位失败：${label} 匹配到 ${indices.length} 个编辑器`);
  }
  return { editor: editors.nth(indices[0]), index: indices[0] };
}

async function reportFormReady(page) {
  try {
    const summary = await findEditor(page, '今日工作总结');
    const plan = await findEditor(page, '明日工作计划');
    return summary.index !== plan.index;
  } catch {
    return false;
  }
}

async function pageState(page) {
  return page.evaluate(editorSelector => {
    const bodyText = document.body?.innerText || '';
    return {
      editorCount: document.querySelectorAll(editorSelector).length,
      hasRequiredLabels: bodyText.includes('今日工作总结') && bodyText.includes('明日工作计划'),
      loginHint: /(扫码|手机号登录|验证码登录|账号登录|登录飞书|请登录)/.test(bodyText),
      url: window.location.href,
    };
  }, EDITOR_SELECTOR);
}

async function waitForReportForm(page) {
  const startedAt = Date.now();
  let formVisibleAt = null;
  let announced = false;
  let lastStatusAt = 0;

  while (!(await reportFormReady(page))) {
    const state = await pageState(page);
    if (state.editorCount >= 2 && state.hasRequiredLabels) {
      formVisibleAt ||= Date.now();
      if (Date.now() - formVisibleAt >= FORM_SETTLE_MS) {
        throw new Error('日报表单已经显示，但目标字段无法唯一定位。脚本已停止，请检查页面结构。');
      }
    } else {
      formVisibleAt = null;
    }

    if (!announced || Date.now() - lastStatusAt >= 60000) {
      if (state.loginHint) {
        console.log('检测到飞书登录页面，请在浏览器中完成登录。脚本会自动等待并继续。');
      } else {
        console.log(`日报表单尚未就绪，正在等待页面加载或用户登录。当前编辑器数量：${state.editorCount}`);
      }
      announced = true;
      lastStatusAt = Date.now();
    }

    if (LOGIN_WAIT_MS > 0 && Date.now() - startedAt >= LOGIN_WAIT_MS) {
      throw new Error(`等待登录或日报表单超时。当前页面：${state.url}`);
    }
    await sleep(LOGIN_POLL_MS);
  }
  console.log('日报表单已就绪，开始填写。');
}

async function editorText(editor) {
  return editor.evaluate(element => element.innerText || element.textContent || '');
}

async function verifyEditorText(editor, expected, label) {
  const actual = normalizeText(await editorText(editor));
  if (!actual.includes(normalizeText(expected))) {
    throw new Error(`字段写入校验失败：${label}`);
  }
}

async function replaceEditorText(page, editor, value, label) {
  try {
    await editor.fill(value, { timeout: 10000 });
    await verifyEditorText(editor, value, label);
    return;
  } catch (error) {
    console.log(`字段 ${label} 不能直接 fill，改用键盘输入：${error.message}`);
  }

  const selectAll = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
  await editor.click({ timeout: 10000 });
  await page.keyboard.press(selectAll);
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value, { delay: 1 });
  await verifyEditorText(editor, value, label);
}

async function main() {
  if (!REPORT_URL) {
    throw new Error('请先设置环境变量 LARK_REPORT_URL 为你所在组织的飞书汇报页面链接');
  }

  const summary = readInput('daily-summary.txt');
  const plan = readInput('daily-plan.txt');
  if (!summary || !plan) {
    throw new Error('daily-summary.txt 和 daily-plan.txt 都必须存在且非空');
  }

  mkdirSync(DATA_DIR, { recursive: true });
  console.log(`使用 Playwright 运行时：${PLAYWRIGHT_RUNTIME}`);
  const browser = await chromium.launchPersistentContext(DATA_DIR, {
    headless: false,
    executablePath: CHROMIUM_EXECUTABLE,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 1280, height: 900 },
  });
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(error => {
    console.log(`页面导航尚未完成，继续等待表单加载：${error.message}`);
  });
  await waitForReportForm(page);

  const summaryField = await findEditor(page, '今日工作总结');
  const planField = await findEditor(page, '明日工作计划');
  if (summaryField.index === planField.index) {
    throw new Error('字段定位失败：今日工作总结和明日工作计划指向同一个编辑器');
  }

  await replaceEditorText(page, summaryField.editor, summary, '今日工作总结');
  await replaceEditorText(page, planField.editor, plan, '明日工作计划');
  await verifyEditorText(summaryField.editor, summary, '今日工作总结');
  await verifyEditorText(planField.editor, plan, '明日工作计划');

  removeInput('daily-summary.txt');
  removeInput('daily-plan.txt');
  console.log('内容已填入，请检查后手动提交。');
  await browser.close();
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});

// 点击审计：逐页枚举可见按钮，依次点击，记录触发的接口状态与控制台错误。
// 用法: node tools/ui_click_audit.js <baseUrl> [每页最多点数]
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const MAX_CLICKS = Number(process.argv[3] || 14);
const CARD = process.argv[4] || '';          // 启动门控上线后，审计前需要先登录
const PROFILE = process.env.NANBUDO_UI_PROFILE || path.join(PW_DIR, 'profile-ui-audit');

const PAGES = [
  '/index.html',
  '/subtitle_removal242.html',
  '/video_voice.html',
  '/visual.html',
  '/ecommerce259.html',
  '/story_workflow.html',
  '/breakdown.html',
  '/prompt_reverse.html',
  '/characters.html',
  '/character_hall.html',
  '/video_canvas.html',
  '/voice_studio.html',
  '/image_watermark247.html',
  '/novel_screenplay249.html',
  '/novel_legacy249.html',
  '/script_alignment.html',
  '/macro_arrangement.html',
  '/user_guide247.html',
  '/icon-options.html',
];

async function auditPage(page, url) {
  const result = { page: url, buttons: [], consoleErrors: [], loadErrors: [] };
  let bucket = [];
  let consoleErrors = [];

  const onResponse = async (resp) => {
    const target = resp.url();
    if (!target.includes('/api/')) return;
    let body = '';
    try { body = (await resp.text()).slice(0, 160); } catch (e) { body = '<unreadable>'; }
    bucket.push({ status: resp.status(), url: target.replace(BASE, ''), body });
  };
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160));
  };

  page.on('response', onResponse);
  page.on('console', onConsole);

  try {
    bucket = [];
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1800);
    result.loadErrors = bucket.filter((c) => c.status >= 400);
  } catch (error) {
    result.error = String(error.message).slice(0, 160);
    page.off('response', onResponse);
    page.off('console', onConsole);
    return result;
  }

  let labels = [];
  try {
    labels = await page.$$eval('button, [role="button"]', (nodes) => nodes.map((node, index) => ({
      index,
      text: (node.textContent || '').trim().slice(0, 24),
      disabled: !!node.disabled || node.getAttribute('aria-disabled') === 'true',
      hidden: !node.offsetParent && getComputedStyle(node).position !== 'fixed',
    })));
  } catch (error) {
    labels = [];
  }

  const usable = labels.filter((b) => !b.disabled && !b.hidden && b.text).slice(0, MAX_CLICKS);
  const nodes = await page.$$('button, [role="button"]');

  for (const meta of usable) {
    const node = nodes[meta.index];
    if (!node) continue;
    bucket = [];
    consoleErrors = [];
    let clickError = '';
    try {
      await node.click({ timeout: 2500 });
    } catch (error) {
      clickError = String(error.message).split('\n')[0].slice(0, 100);
    }
    await page.waitForTimeout(1600);
    const failed = bucket.filter((c) => c.status >= 400);
    result.buttons.push({
      label: meta.text,
      clickError,
      calls: bucket.length,
      failures: failed.slice(0, 4),
      console: [...new Set(consoleErrors)].slice(0, 2),
    });
    if (page.url() !== BASE + url) {
      await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
  }

  page.off('response', onResponse);
  page.off('console', onConsole);
  return result;
}

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(8000);
  // 启动门控上线后，未登录访问 index.html 会被 302 到登录页；先在同一浏览器里登录，
  // 后面各页面才是真实已授权状态（否则"点了 0 个按钮"是假绿灯）。
  if (CARD) {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    const signed = await page.evaluate(async ([base, card]) => {
      const resp = await fetch(base + '/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardKey: card }),
      });
      const body = await resp.json().catch(() => ({}));
      return Boolean(body.authenticated);
    }, [BASE, CARD]);
    // 走 stderr：stdout 必须是纯 JSON 报告，驱动脚本才能 json.loads
    console.error(JSON.stringify({ step: '登录', signed }));
  }
  const report = [];
  for (const url of PAGES) {
    try {
      report.push(await auditPage(page, url));
    } catch (error) {
      report.push({ page: url, error: String(error.message).slice(0, 160), buttons: [] });
    }
  }
  await context.close();
  console.log(JSON.stringify(report, null, 1));
})();

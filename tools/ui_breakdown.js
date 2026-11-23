// 爆款拆解页面验收：真实项目 id 从 localStorage 载入，检查渲染异常。

const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const PID = process.argv[3];

(async () => {
  const ctx = await chromium.launchPersistentContext(
    path.join(PW_DIR, 'profile-ui-breakdown'), { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  const out = { steps: [], errors };
  const step = (name, ok, detail = '') => out.steps.push({ name, ok: !!ok, detail });

  await page.goto(BASE + '/static/breakdown.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((pid) => {
    localStorage.setItem('dramaBreakdownProjectId', pid);
  }, PID);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const state = await page.evaluate(() => ({
    status: (document.getElementById('status') || {}).innerText || '',
    analysisHidden: (document.getElementById('analysisPanel') || {}).hidden,
    elements: ((document.getElementById('elements') || {}).innerText || '').slice(0, 120),
    results: ((document.getElementById('results') || {}).innerText || '').slice(0, 160),
    body: (document.body.innerText || '').includes('Cannot read properties of undefined'),
  }));
  step('页面载入', state.status.length > 0, state.status.slice(0, 100));
  step('无 undefined.some 报错', !state.body && !errors.some((e) => e.includes('some')),
       errors.join(' | ').slice(0, 160));
  step('分析面板可见', state.analysisHidden === false, String(state.analysisHidden));
  console.log(JSON.stringify({ ...out, state }, null, 1));
  await ctx.close();
})();

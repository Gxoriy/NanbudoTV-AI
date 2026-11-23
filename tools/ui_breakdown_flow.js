// 爆款拆解完整页面验收：上传 → 开始拆解 → 生成视频 → 结果可见。
// 用法: node tools/ui_breakdown_flow.js <baseUrl> <videoPath>

const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const VIDEO = process.argv[3];

(async () => {
  const ctx = await chromium.launchPersistentContext(
    path.join(PW_DIR, 'profile-ui-breakdown-flow'), { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) {
      errors.push(m.text().slice(0, 200));
    }
  });
  page.on('dialog', async (d) => { try { await d.accept(); } catch (e) {} });
  const out = { steps: [], errors, apis: [] };
  page.on('response', async (r) => {
    if (!r.url().includes('/api/breakdown/') && !r.url().includes('/api/tasks/')) return;
    let body = '';
    try { body = (await r.text()).slice(0, 240); } catch (e) { body = ''; }
    out.apis.push({ url: r.url().replace(BASE, ''), status: r.status(), body });
  });
  const step = (name, ok, detail = '') => out.steps.push({ name, ok: !!ok, detail });

  await page.goto(BASE + '/static/breakdown.html', { waitUntil: 'domcontentloaded' });
  await page.setInputFiles('#videoUpload', VIDEO);
  await page.waitForTimeout(4000);
  let text = await page.evaluate(() => document.body.innerText);
  step('上传后无 undefined.some', !text.includes('Cannot read properties of undefined'),
       text.slice(0, 120));

  for (let i = 0; i < 40; i += 1) {
    const ready = await page.evaluate(() => {
      const n = document.getElementById('analyze');
      return n && !n.disabled;
    }).catch(() => false);
    if (ready) break;
    await page.waitForTimeout(1000);
  }
  out.analyzeState = await page.evaluate(() => ({
    disabled: document.getElementById('analyze')?.disabled,
    label: document.getElementById('analyze')?.textContent,
    status: document.getElementById('status')?.textContent,
    media: !!document.getElementById('preview')?.querySelector('video,img'),
  }));
  await page.click('#analyze');
  for (let i = 0; i < 120; i += 1) {
    await page.waitForTimeout(2000);
    text = await page.evaluate(() => document.body.innerText);
    const results = await page.evaluate(
      () => (document.getElementById('results') || {}).innerText || '');
    if (results && !/暂无待验收结果/.test(results) && i > 1) break;
  }
  const elements = await page.evaluate(
    () => (document.getElementById('elements') || {}).innerText || '');
  const results = await page.evaluate(
    () => (document.getElementById('results') || {}).innerText || '');
  out.afterAnalyze = await page.evaluate(() => ({
    status: document.getElementById('status')?.textContent,
    analyze: document.getElementById('analyze')?.textContent,
    body: document.body.innerText.slice(0, 300),
  }));
  step('拆解结果非空', results.length > 0 || elements.length > 0,
       results.slice(0, 160).replace(/\n/g, ' / '));
  step('拆解无 undefined.some', !text.includes('Cannot read properties of undefined'));

  // 生成
  const generate = await page.$('#generate');
  if (generate) {
    await generate.click().catch(() => {});
    for (let i = 0; i < 30; i += 1) {
      await page.waitForTimeout(1000);
      const confirm = await page.$('dialog[open] .studio-dialog-confirm');
      if (confirm) { await confirm.click().catch(() => {}); break; }
    }
    for (let i = 0; i < 180; i += 1) {
      await page.waitForTimeout(2000);
      const body = await page.evaluate(() => document.body.innerText);
      if (body.includes('拆解复刻视频') || body.includes('待验收')) break;
    }
  }
  const finalText = await page.evaluate(() => document.body.innerText);
  step('出现拆解复刻视频', finalText.includes('拆解复刻视频'),
       (await page.evaluate(
         () => (document.getElementById('results') || {}).innerText || '')).slice(0, 200));
  step('全程无 undefined.some', !finalText.includes('Cannot read properties of undefined'));
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
})();

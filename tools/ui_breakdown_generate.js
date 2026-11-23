// 已分析项目：检查生成按钮为何不可点/为何没有视频。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const PID = process.argv[3];

(async () => {
  const ctx = await chromium.launchPersistentContext(
    path.join(PW_DIR, 'profile-ui-bd-gen'), { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const out = { apis: [], errors: [], steps: [] };
  page.on('pageerror', (e) => out.errors.push(String(e.message).slice(0, 200)));
  page.on('dialog', async (d) => { try { await d.accept(); } catch (e) {} });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/breakdown/') && !r.url().includes('/api/tasks/')) return;
    let body = '';
    try { body = (await r.text()).slice(0, 220); } catch (e) { body = ''; }
    out.apis.push({ url: r.url().replace(BASE, ''), status: r.status(), body });
  });

  await page.goto(BASE + '/static/breakdown.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((pid) => localStorage.setItem('dramaBreakdownProjectId', pid), PID);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  out.state = await page.evaluate(() => {
    const n = document.getElementById('generate');
    const model = document.getElementById('generationModel');
    return {
      hasGenerate: !!n,
      disabled: n ? n.disabled : null,
      text: n ? n.textContent : null,
      model: model ? model.value : null,
      modelOptions: model ? [...model.options].map((o) => o.value) : [],
      resolution: document.getElementById('resolution')?.value,
      mode: document.getElementById('mode')?.value,
      strategy: document.getElementById('referenceStrategy')?.value,
      warning: document.getElementById('generationWarning')?.textContent,
      status: document.getElementById('status')?.textContent,
      results: document.getElementById('results')?.innerText?.slice(0, 300),
    };
  });

  if (out.state.hasGenerate && !out.state.disabled) {
    await page.click('#generate');
    for (let i = 0; i < 40; i += 1) {
      await page.waitForTimeout(1000);
      const confirm = await page.$('dialog[open] .studio-dialog-confirm');
      if (confirm) { await confirm.click().catch(() => {}); break; }
    }
    out.clicked = true;
    for (let i = 0; i < 300; i += 1) {
      await page.waitForTimeout(2000);
      const body = await page.evaluate(() => document.body.innerText);
      if (body.includes('拆解复刻视频')) break;
    }
  }
  out.final = await page.evaluate(() => ({
    status: document.getElementById('status')?.textContent,
    results: document.getElementById('results')?.innerText?.slice(0, 400),
    body: document.body.innerText.slice(0, 200),
  }));
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
})();

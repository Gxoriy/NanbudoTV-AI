// 浏览器验收画布删除：点删除 → 确认 → 卡片消失且没有 not_migrated。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const CARD = process.argv[3];
const TARGET = process.argv[4];
const PROFILE = path.join(PW_DIR, 'profile-canvas-delete');

(async () => {
  const out = { steps: [], ok: true };
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(20000);
  const bad = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/canvas/')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 120); } catch (e) { body = ''; }
      if (resp.status() >= 400 || body.includes('not_migrated')) {
        bad.push(`${resp.status()} ${resp.url().replace(BASE, '')} ${body.slice(0, 50)}`);
      }
    }
  });
  const step = (name, ok, detail) => {
    out.steps.push({ name, ok, detail });
    if (!ok) out.ok = false;
  };
  try {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ([base, card]) => {
      await fetch(base + '/api/session/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardKey: card }),
      });
    }, [BASE, CARD]);
    await page.goto(BASE + '/video_canvas.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const before = await page.$$eval('[data-project-id]', (n) => n.length).catch(() => 0);
    step('画布卡片可见', before > 0, `before=${before}`);

    const card = await page.$(`[data-project-id="${TARGET}"]`);
    step('目标卡片存在', !!card);
    const del = await page.$(`[data-gallery-delete="${TARGET}"]`);
    if (del) {
      await del.click().catch(() => {});
    }
    const clicked = Boolean(del);
    step('点击删除', clicked);
      await page.waitForTimeout(800);
      // 如有确认框，点确认
      const confirm = await page.$('.studio-dialog-confirm');
      if (confirm) { await confirm.click().catch(() => {}); await page.waitForTimeout(1200); }

    const after = await page.$$eval('[data-project-id]', (n) => n.length).catch(() => 0);
    step('目标卡片消失', !(await page.$(`[data-project-id="${TARGET}"]`)),
         `before=${before} after=${after}`);
    step('无 not_migrated / 4xx', bad.length === 0, JSON.stringify(bad).slice(0, 120));
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 200);
  }
  await ctx.close();
  console.log(JSON.stringify(out, null, 1));
})();

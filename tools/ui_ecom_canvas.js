// 验收：电商页无 JS 报错；画布"新建画布"能真正创建并打开。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const CARD = process.argv[3];
const PROFILE = path.join(PW_DIR, 'profile-ecom-canvas');

(async () => {
  const out = { steps: [], ok: true };
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
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

    // ---------- 电商页 ----------
    errors.length = 0;
    await page.goto(BASE + '/ecommerce259.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const modeErrors = errors.filter((e) => e.includes("reading 'mode'") || e.includes('mode'));
    step('电商页无 mode 报错', modeErrors.length === 0, JSON.stringify(modeErrors).slice(0, 120));
    step('电商页有内容', (await page.evaluate(() => document.body.innerText.length)) > 200,
         `len=${await page.evaluate(() => document.body.innerText.length)}`);

    // ---------- 画布新建 ----------
    errors.length = 0;
    await page.goto(BASE + '/video_canvas.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const galleryVisible = await page.$eval('#canvasGallery',
      (n) => !n.hidden && !n.classList.contains('hidden')).catch(() => false);
    if (!galleryVisible) {
      await page.click('#showCanvasGallery').catch(() => {});
      await page.waitForTimeout(2000);
    }
    await page.$eval('#newCanvas', (n) => n.click());
    await page.waitForTimeout(800);
    const dialogOpen = await page.$eval('#newCanvasProjectDialog',
      (n) => !n.hidden && !n.classList.contains('hidden')).catch(() => false);
    step('新建对话框打开', dialogOpen);
    await page.fill('#newCanvasProjectName', 'UI 新建画布');
    await page.$eval('#newCanvasProjectForm button[type="submit"]',
      (n) => n.click());
    await page.waitForTimeout(4000);
    const status = await page.$eval('#newCanvasProjectStatus',
      (n) => (n.textContent || '').trim()).catch(() => '');
    const bootError = await page.$eval('#canvasBootTitle254',
      (n) => (n.textContent || '').trim()).catch(() => '');
    const opened = await page.$eval('#canvasName', (n) => n.value).catch(() => '');
    step('创建成功且打开', !status.includes('失败') && !bootError.includes('失败')
         && (opened === 'UI 新建画布' || !dialogOpen),
         `status=${status.slice(0, 150)} open=${opened} boot=${bootError.slice(0, 40)}`);
    step('无画布 4xx/JS 报错', errors.length === 0, JSON.stringify(errors).slice(0, 120));
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 200);
  }
  await ctx.close();
  console.log(JSON.stringify(out, null, 1));
})();

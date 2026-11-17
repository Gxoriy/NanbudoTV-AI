// 诊断：登录 → 首页 → 短剧项目中心（iframe 工作流），看控件真实可见性。
// 用法: node tools/ui_diag.js <baseUrl> <cardKey>
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2];
const CARD = process.argv[3] || '';
const PROFILE = process.env.NANBUDO_UI_PROFILE || path.join(PW_DIR, 'profile-ui-diag');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  const out = { steps: [] };
  try {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    if (await page.$('#cardKey')) {
      await page.fill('#cardKey', CARD);
      await page.click('#loginButton');
      await page.waitForTimeout(3000);
    }
    out.afterLogin = page.url().replace(BASE, '');

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const center = await page.$('#visualProjectCenterTop');
    if (center) await center.click().catch(() => {});
    await page.waitForTimeout(5000);

    const frame = page.frames().find((f) => f.url().includes('visual.html'));
    out.frameUrl = frame ? frame.url().replace(BASE, '') : '';

    if (frame) {
      out.buttons = await frame.$$eval('button', (nodes) => nodes.map((n) => ({
        id: n.id || '',
        text: (n.textContent || '').trim().slice(0, 14),
        visible: !!(n.offsetParent || getComputedStyle(n).position === 'fixed'),
        disabled: !!n.disabled,
        cls: (n.className || '').slice(0, 40),
      })).filter((row) => row.id || row.text));
      out.stage = await frame.evaluate(() => {
        const node = document.querySelector('#visualStageStatus');
        return node ? node.textContent.trim().slice(0, 80) : '';
      });
      out.project = await frame.evaluate(() => {
        const node = document.querySelector('#visualProjectCenter');
        return node ? { cls: node.className, text: node.textContent.trim().slice(0, 60) } : null;
      });
      out.points = await frame.evaluate(async () => {
        const r = await fetch('/api/visual/usage', { cache: 'no-store' });
        return r.json();
      });
    }
  } catch (error) {
    out.error = String(error.message).slice(0, 200);
  } finally {
    await context.close();
    console.log(JSON.stringify(out, null, 1));
  }
})();

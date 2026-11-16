// 前端冒烟：用 Playwright 打开页面，收集控制台错误与 5xx/501 请求。
// 用法: node tools/ui_smoke.js http://127.0.0.1:PORT
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const PAGES = ['/', '/subtitle_removal242.html', '/video_voice.html', '/visual.html'];
const PROFILE = process.env.NANBUDO_UI_PROFILE || path.join(PW_DIR, 'profile-ui-smoke');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const report = [];
  try {
    for (const pagePath of PAGES) {
      const page = context.pages()[0] || (await context.newPage());
      const consoleErrors = [];
      const badResponses = [];
      const apiCalls = {};

      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160));
      });
      page.on('response', (resp) => {
        const url = resp.url().replace(BASE, '');
        const status = resp.status();
        if (url.includes('/api/')) {
          const key = `${status} ${url.split('?')[0]}`;
          apiCalls[key] = (apiCalls[key] || 0) + 1;
        }
        if (status >= 400) {
          badResponses.push(`${status} ${url.split('?')[0]}`);
        }
      });

      const started = Date.now();
      let title = '';
      let finalUrl = '';
      let bodyText = '';
      try {
        await page.goto(BASE + pagePath, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1200);
        title = await page.title();
        finalUrl = page.url().replace(BASE, '');
        bodyText = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ').slice(0, 160);
      } catch (error) {
        consoleErrors.push('goto失败: ' + String(error.message).slice(0, 120));
      }

      report.push({
        page: pagePath, finalUrl, title, ms: Date.now() - started,
        consoleErrors: [...new Set(consoleErrors)].slice(0, 6),
        badResponses: [...new Set(badResponses)].slice(0, 12),
        apiCalls,
        bodyPreview: bodyText,
      });
      await page.close().catch(() => {});
    }
  } finally {
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
})();

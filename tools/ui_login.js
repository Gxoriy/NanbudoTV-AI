// 登录流程冒烟：打开 /login.html → 填卡密 → 点登录 → 记录激活结果与跳转。
// 用法: node tools/ui_login.js http://127.0.0.1:PORT DW-XXXX-...
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const CARD = process.argv[3] || '';
const PROFILE = process.env.NANBUDO_UI_PROFILE || path.join(PW_DIR, 'profile-ui-login');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  const activateCalls = [];
  const consoleErrors = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/license/')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 200); } catch (e) { body = '<unreadable>'; }
      activateCalls.push({ status: resp.status(), url: resp.url().replace(BASE, ''), body });
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 140));
  });

  const report = { card: CARD ? CARD.slice(0, 9) + '***' : '', steps: [] };
  try {
    await page.goto(BASE + '/login.html', { waitUntil: 'networkidle', timeout: 30000 });
    report.steps.push({ step: '打开登录页', url: page.url().replace(BASE, '') });

    await page.fill('#cardKey', CARD);
    await page.click('#loginButton');
    // 等激活请求回来或页面跳转
    const started = Date.now();
    while (Date.now() - started < 20000) {
      await page.waitForTimeout(300);
      const done = activateCalls.length > 0;
      const moved = !page.url().includes('login.html');
      if (done && moved) break;
    }
    report.steps.push({ step: '提交卡密', ms: Date.now() - started,
                        url: page.url().replace(BASE, '') });
    report.message = await page.evaluate(() => {
      const node = document.querySelector('#loginMessage');
      return node ? node.textContent.trim().slice(0, 120) : '';
    });
    report.enterButton = await page.evaluate(() => {
      const node = document.querySelector('#enterApp');
      return node ? { text: node.textContent.trim().slice(0, 20),
                      hidden: node.hidden || getComputedStyle(node).display === 'none' } : null;
    });

    // 进入字幕页，确认不再被踢回登录
    await page.goto(BASE + '/subtitle_removal242.html', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    report.steps.push({ step: '打开字幕页', url: page.url().replace(BASE, '') });
  } catch (error) {
    report.error = String(error.message).slice(0, 200);
  } finally {
    report.activate = activateCalls.slice(0, 4);
    report.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
})();

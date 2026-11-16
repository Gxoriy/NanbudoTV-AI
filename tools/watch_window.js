// 有头采集窗口：打开页面并保持在前台（人工交互/登录态），直到被终止。
// 用法: node tools/watch_window.js <url> [profileDir]
// 输出一行 READY 后驻留；stdin 收到 "stop" 或进程被终止时关闭浏览器。
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const url = process.argv[2] || 'about:blank';
const profile = process.argv[3] || path.join(PW_DIR, 'profile-watch');

(async () => {
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { headless: false });
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    process.stdout.write('READY\n');
  } catch (error) {
    process.stdout.write('ERROR ' + String(error.message).slice(0, 160) + '\n');
    process.exit(2);
  }

  const shutdown = async () => {
    try { if (context) await context.close(); } catch (e) { /* 已关闭 */ }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.stdin.on('data', (chunk) => {
    if (String(chunk).includes('stop')) shutdown();
  });
  setInterval(() => {}, 1 << 30);      // 保持事件循环存活
})();

// 对原版 exe 的 HTTP 内核做"只读 + 安全点击"抓包。
// 用法: node tools/capture_exe_routes.js <baseUrl> <cardKey?>
// 跳过含 删除/移除/清空/重置/生成/安装/更新 的按钮，避免改数据或花积分。

const path = require('path');
const fs = require('fs');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const CARD = process.argv[3] || '';
const OUT = path.join(__dirname, '..', '.local', 'exe-capture-routes.json');
const PROFILE = path.join(PW_DIR, 'profile-exe-capture');

const PAGES = [
  '/index.html', '/visual.html', '/story_workflow.html', '/macro_arrangement.html',
  '/breakdown.html', '/prompt_reverse.html', '/characters.html',
  '/character_hall.html', '/video_canvas.html', '/voice_studio.html',
  '/subtitle_removal242.html', '/video_voice.html', '/ecommerce259.html',
  '/novel_screenplay249.html', '/novel_legacy249.html', '/script_alignment.html',
  '/user_guide247.html', '/image_watermark247.html',
];
const SKIP = /删除|移除|清空|重置|生成|安装|更新|导出|下载|恢复|提交|确认|保存|创建|新建|开始|上传|发布|购买|升级/;

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(12000);
  const calls = [];
  const errors = [];
  page.on('request', (r) => {
    if (!r.url().includes('/api/')) return;
    calls.push({ method: r.method(), url: r.url().replace(BASE, ''),
                 body: (r.postData() || '').slice(0, 500), status: 0, response: '' });
  });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/')) return;
    let body = '';
    try { body = (await r.text()).slice(0, 500); } catch (e) { body = ''; }
    const entry = calls.slice().reverse().find((c) => c.url === r.url().replace(BASE, '') && c.status === 0);
    if (entry) { entry.status = r.status(); entry.response = body; }
  });
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

  const result = { base: BASE, pages: [], calls: [], errors };
  try {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    if (CARD) {
      await page.evaluate(async (card) => {
        await fetch('/api/session/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardKey: card }),
        });
      }, CARD);
      await page.waitForTimeout(800);
    }
    for (const route of PAGES) {
      const before = calls.length;
      let load = 'ok';
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        const clicked = await page.evaluate((skip) => {
          const nodes = Array.from(document.querySelectorAll('button'))
            .filter((n) => n.offsetParent && !n.disabled)
            .filter((n) => !skip.test((n.textContent || '').trim()))
            .slice(0, 6);
          for (const n of nodes) n.click();
          return nodes.map((n) => (n.textContent || '').trim().slice(0, 16));
        }, SKIP.source);
        await page.waitForTimeout(1500);
        result.pages.push({ page: route, clicked });
      } catch (err) {
        load = String(err.message).slice(0, 120);
        result.pages.push({ page: route, load });
      }
      void load;
      void before;
    }
    result.calls = calls;
  } catch (err) {
    result.fatal = String(err.message).slice(0, 200);
  }
  await ctx.close();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1), 'utf8');
  console.log(JSON.stringify({ pages: result.pages.length, calls: calls.length,
                               errors: result.errors.length, out: OUT }));
})();

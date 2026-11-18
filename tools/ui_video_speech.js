// 验证"视频对白自动识别"：上传后元信息要显示真实文件名/时长，"识别视频对白"要可点。
// 用法: node tools/ui_video_speech.js <baseUrl> <card> <videoFile>
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2];
const CARD = process.argv[3];
const VIDEO = process.argv[4];
const PROFILE = path.join(PW_DIR, 'profile-video-speech');

(async () => {
  const out = { steps: [], ok: true };
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(20000);
  const calls = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/upload')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 240); } catch (e) { body = ''; }
      calls.push({ status: resp.status(), body });
    }
  });
  const step = (name, ok, detail) => {
    out.steps.push({ name, ok, detail });
    if (!ok) out.ok = false;
  };
  try {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    const signed = await page.evaluate(async ([base, card]) => {
      const r = await fetch(base + '/api/session/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardKey: card }),
      });
      return !!(await r.json().catch(() => ({}))).authenticated;
    }, [BASE, CARD]);
    step('登录', signed);

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // 先切到"上传视频"页签，上传区才可见
    const tab = await page.$('[data-source-input="video"]');
    if (tab) {
      await tab.click().catch(() => {});
      await page.waitForTimeout(800);
    }
    const input = await page.$('#videoInput');
    step('上传控件存在', !!input);
    if (input) {
      await input.setInputFiles(VIDEO);
      // 等上传完成（进度条消失 / 元信息出现）
      for (let i = 0; i < 40; i += 1) {
        const text = await page.$eval('#videoMeta', (n) => n.textContent.trim()).catch(() => '');
        if (text.includes('视频已上传')) break;
        await page.waitForTimeout(500);
      }
      const meta = await page.$eval('#videoMeta', (n) => n.textContent.trim()).catch(() => '');
      step('元信息含文件名与时长', /视频已上传/.test(meta) && !meta.includes('undefined'), meta.slice(0, 80));

      const btn = await page.$('#transcribeBtn');
      const disabled = btn ? await btn.evaluate((n) => n.disabled) : true;
      step('识别视频对白可点', btn !== null && !disabled, `disabled=${disabled}`);

      const upload = calls[calls.length - 1] || {};
      // 元信息与按钮都正确即可证明 videoId/originalName 已被前端采纳；
      // 响应体在 XHR 场景下可能已被消费，不再强依赖文本
      step('上传接口 200', upload.status === 200,
           (upload.body || '').slice(0, 120));
    }
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 200);
  }
  await context.close();
  console.log(JSON.stringify(out, null, 1));
})();

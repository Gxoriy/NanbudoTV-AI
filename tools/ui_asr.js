// 验收「识别视频对白」：真上传音频 → 点按钮 → 等任务 → 右侧文案框出现台词。
// 用法: node tools/ui_asr.js <baseUrl> <card> <audioFile> [modelSize]
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2];
const CARD = process.argv[3];
const AUDIO = process.argv[4];
const SIZE = process.argv[5] || 'tiny';
const PROFILE = path.join(PW_DIR, 'profile-asr');

(async () => {
  const out = { steps: [], ok: true };
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(30000);
  const calls = [];
  page.on('response', (resp) => {
    if (resp.url().includes('/api/transcribe') || resp.url().includes('/api/tasks/')) {
      calls.push(resp.url().replace(BASE, ''));
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
    const tab = await page.$('[data-source-input="video"]');
    if (tab) { await tab.click().catch(() => {}); await page.waitForTimeout(600); }

    await page.setInputFiles('#videoInput', AUDIO);
    for (let i = 0; i < 60; i += 1) {
      const meta = await page.$eval('#videoMeta', (n) => n.textContent.trim()).catch(() => '');
      if (meta.includes('视频已上传')) break;
      await page.waitForTimeout(500);
    }
    const meta = await page.$eval('#videoMeta', (n) => n.textContent.trim()).catch(() => '');
    step('上传完成', meta.includes('视频已上传'), meta.slice(0, 70));

    const before = await page.$eval('#speechHint', (n) => n.textContent.trim()).catch(() => '');
    step('组件可用', !before.includes('尚未安装'), before.slice(0, 40));

    await page.selectOption('#whisperModel', SIZE).catch(() => {});
    await page.click('#transcribeBtn');

    let state = '';
    for (let i = 0; i < 240; i += 1) {
      state = await page.$eval('#speechStatus', (n) => n.textContent.trim()).catch(() => '');
      if (state === '对白已识别') break;
      const hint = await page.$eval('#speechHint', (n) => n.textContent.trim()).catch(() => '');
      if (hint.includes('没有完成') || hint.includes('失败')) {
        step('识别未完成', false, hint.slice(0, 90));
        throw new Error(hint.slice(0, 90));
      }
      await page.waitForTimeout(1000);
    }
    step('状态变为已识别', state === '对白已识别', state);

    const hint = await page.$eval('#speechHint', (n) => n.textContent.trim()).catch(() => '');
    step('提示含段数与时长', /段/.test(hint), hint.slice(0, 90));

    const text = await page.$eval('#sourceText', (n) => n.value.trim()).catch(() => '');
    step('台词已填入文案框', text.length > 0, `${text.length} 字：${text.slice(0, 40)}`);
    step('调用了转写接口', calls.some((u) => u.includes('/api/transcribe')),
         calls.slice(0, 2).join(' | '));
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 200);
  }
  await context.close();
  console.log(JSON.stringify(out, null, 1));
})();

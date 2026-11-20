// 验收步骤 02：已有参考图的项目，点「下一步：分镜」不再提示"请先识别…"。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const CARD = process.argv[3];
const PROFILE = path.join(PW_DIR, 'profile-next-stage');

(async () => {
  const out = { steps: [], ok: true };
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
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

    const pid = await page.evaluate(async (base) => {
      const created = await (await fetch(base + '/api/visual/project/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: '已出图项目', createRequestId: 'ns-1' }),
      })).json();
      const id = created.project.id;
      const source = '第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n第二场 图书馆 夜 内\n灯管坏了一根。';
      await fetch(base + '/api/visual/project/source', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, sourceText: source }),
      });
      await fetch(base + '/api/visual/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, settings: { assets: {
          people: [{ name: '林晚', imageFile: 'assets/a.png', status: 'done' },
                   { name: '陈默', imageFile: 'assets/b.png', status: 'done' }],
          scenes: [{ name: '图书馆', imageFile: 'assets/c.png', status: 'done' }],
          props: [{ name: '台灯', imageFile: 'assets/d.png', status: 'done' }],
        } } }),
      });
      return id;
    }, BASE);
    out.pid = pid;
    step('准备已出图项目', Boolean(pid));

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.$eval('#visualProjectCenterTop', (n) => n.click());
    await page.waitForTimeout(3000);
    let frame = null;
    for (let i = 0; i < 20; i += 1) {
      frame = page.frames().find((f) => f.url().includes('visual.html'));
      if (frame) break;
      await page.waitForTimeout(500);
    }
    step('项目中心 iframe', !!frame);

    if (frame) {
      await frame.$eval(`[data-project-id="${pid}"] .open-visual-project`,
        (n) => n.click());
      await page.waitForTimeout(4000);
      const hint = await frame.$eval('#visualSourceHint',
        (n) => (n.textContent || '').trim()).catch(() => '');
      step('项目已打开', /已打开/.test(hint), hint.slice(0, 40));

      await frame.$eval('#useSource', (n) => n.click());
      await page.waitForTimeout(2500);
      const toast = await frame.$$eval('.toast, [role=alert]',
        (nodes) => nodes.map((n) => (n.textContent || '').trim())
          .filter(Boolean).slice(0, 3)).catch(() => []);
      const blocked = toast.some((t) => t.includes('请先识别'));
      step('没有"请先识别"拦截', !blocked, JSON.stringify(toast).slice(0, 120));

      const dialogOpen = await frame.$eval('#visualCutModeDialog',
        (n) => !n.classList.contains('hidden') && !n.hidden).catch(() => false);
      step('弹出切分设置', dialogOpen);
    }
    step('无 JS 报错', errors.length === 0, JSON.stringify(errors).slice(0, 120));
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 200);
  }
  await ctx.close();
  console.log(JSON.stringify(out, null, 1));
})();

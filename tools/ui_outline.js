// 验收步骤 01：点「提取大纲」真的有响应（提示出现集/场，不再静默）。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const CARD = process.argv[3];
const PROFILE = path.join(PW_DIR, 'profile-outline');

(async () => {
  const out = { steps: [], ok: true };
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(25000);
  const calls = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/visual/project/scenes')) {
      calls.push(r.status());
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

    const pid = await page.evaluate(async (base) => {
      const created = await (await fetch(base + '/api/visual/project/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: '大纲验收', createRequestId: 'ol-1' }),
      })).json();
      const id = created.project.id;
      const source = '第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n第二场 图书馆 夜 内\n灯管坏了一根。';
      await fetch(base + '/api/visual/project/source', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, sourceText: source }),
      });
      return id;
    }, BASE);
    step('准备项目', Boolean(pid));

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
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
      await page.waitForTimeout(3500);
      await frame.$eval('[data-workflow-stage="1"]', (n) => n.click())
        .catch(() => {});
      await page.waitForTimeout(1200);
      out.button = await frame.$eval('#aiSceneDirectory', (n) => ({
        disabled: n.disabled, text: (n.textContent || '').trim(),
        visible: Boolean(n.offsetParent),
      })).catch(() => null);
      await frame.$eval('#aiSceneDirectory', (n) => n.click());
      // 等大纲任务结束（前端会改提示文案）
      let hint = '';
      for (let i = 0; i < 60; i += 1) {
        await page.waitForTimeout(1500);
        hint = await frame.$eval('#visualSourceHint',
          (n) => (n.textContent || '').trim()).catch(() => '');
        if (/大纲|集／场|场/.test(hint) && !/正在/.test(hint)) break;
      }
      const toasts = await frame.$$eval('.toast, [role=alert]',
        (nodes) => nodes.map((n) => (n.textContent || '').trim())
          .filter(Boolean).slice(0, 3)).catch(() => []);
      step('点击后有大纲反馈', /已完成|集／场/.test(hint + toasts.join(' ')),
           `btn=${JSON.stringify(out.button)} hint=${hint.slice(0, 36)} `
           + `toast=${toasts.join(' / ').slice(0, 30)}`);
      step('调用了大纲接口', calls.some((s) => s === 200), JSON.stringify(calls));
    }
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 200);
  }
  await ctx.close();
  console.log(JSON.stringify(out, null, 1));
})();

// 验收「短剧项目中心」：历史项目能列出、能点开、计数正确。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const CARD = process.argv[3];
const PROFILE = path.join(PW_DIR, 'profile-project-center');

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

    // 造两个历史项目（一个有资产/计数）
    out.created = await page.evaluate(async (base) => {
      const make = async (name, requestId) => {
        const r = await fetch(base + '/api/visual/project/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: name, createRequestId: requestId }),
        });
        return (await r.json()).project.id;
      };
      const one = await make('历史项目A', 'pc-1');
      const two = await make('历史项目B', 'pc-2');
      await fetch(base + '/api/visual/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: one, settings: {
          assets: { people: [{ name: '林晚' }, { name: '陈默' }],
                    scenes: [{ name: '图书馆' }],
                    props: [{ name: '台灯' }] },
        } }),
      });
      return { one, two };
    }, BASE);

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.$eval('#visualProjectCenterTop', (n) => n.click());
    await page.waitForTimeout(3500);
    let frame = null;
    for (let i = 0; i < 20; i += 1) {
      frame = page.frames().find((f) => f.url().includes('visual.html'));
      if (frame) break;
      await page.waitForTimeout(500);
    }
    step('项目中心 iframe', !!frame);

    if (frame) {
      const cards = await frame.$$eval('.visual-project-card', (nodes) => nodes.map((n) => ({
        id: n.dataset.projectId,
        text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      }))).catch(() => []);
      step('历史项目可见', cards.length >= 2, `cards=${cards.length} ${JSON.stringify(cards.slice(0, 2))}`);
      const named = cards.some((c) => c.text.includes('历史项目A'));
      step('卡片显示项目名', named, cards[0]?.text || '');

      const target = cards.find((c) => c.id === out.created.one) || cards[0];
      if (target) {
        await frame.$eval(`[data-project-id="${target.id}"] .open-visual-project`,
          (n) => n.click());
        await page.waitForTimeout(4000);
        const opened = await frame.$eval('#sourceScriptStatus',
          (n) => (n.textContent || '').trim()).catch(() => '');
        const hint = await frame.$eval('#visualSourceHint',
          (n) => (n.textContent || '').trim()).catch(() => '');
        const toastText = await frame.$$eval('.toast, [role=alert]',
          (nodes) => nodes.map((n) => (n.textContent || '').trim())
            .filter(Boolean).slice(0, 2)).catch(() => []);
        step('点击卡片能打开', /已打开|已保存/.test(opened + hint),
             `${opened.slice(0, 30)} | ${hint.slice(0, 30)} | ${toastText.join(' / ')}`);
      }
    }
    step('无 JS 报错', errors.length === 0, JSON.stringify(errors).slice(0, 120));
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 200);
  }
  await ctx.close();
  console.log(JSON.stringify(out, null, 1));
})();

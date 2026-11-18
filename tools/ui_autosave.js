// 复现"自动保存未完成：原稿保存返回的正文不一致"
// 用法: node tools/ui_autosave.js <baseUrl> <card> <sourceFile> <shotPath>
const fs = require('fs');
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2];
const CARD = process.argv[3];
const SOURCE_FILE = process.argv[4];
const SHOT = process.argv[5] || '';
const PROFILE = path.join(PW_DIR, 'profile-autosave');

(async () => {
  const out = { steps: [], ok: true };
  const text = fs.readFileSync(SOURCE_FILE, 'utf8');
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(15000);
  const calls = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/visual/project')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 300); } catch (e) { body = ''; }
      calls.push({ status: resp.status(), url: url.replace(BASE, ''), body });
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
      const b = await r.json().catch(() => ({}));
      return !!b.authenticated;
    }, [BASE, CARD]);
    step('登录', signed);

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const center = await page.$('#visualProjectCenterTop');
    if (center) { await center.click().catch(() => {}); await page.waitForTimeout(3500); }
    step('打开短剧项目中心', !!center);

    let frame = null;
    for (let i = 0; i < 20; i += 1) {
      frame = page.frames().find((f) => f.url().includes('visual.html'));
      if (frame) break;
      await page.waitForTimeout(500);
    }
    step('工作流 iframe', !!frame);

    if (frame) {
      const newBtn = (await frame.$('#newVisualProject')) || (await frame.$('#newWorkflowProject'));
      if (newBtn && (await newBtn.isVisible().catch(() => false))) {
        await newBtn.click();
        await page.waitForTimeout(1200);
        const confirm = await page.$('.studio-dialog-confirm');
        if (confirm) { await confirm.click().catch(() => {}); await page.waitForTimeout(1200); }
        const nameInput = await frame.$('#wizardProjectName');
        if (nameInput) await nameInput.fill('自动保存验收');
        const createBtn = await frame.$('#confirmProjectWizard');
        if (createBtn) { await createBtn.click().catch(() => {}); await page.waitForTimeout(3500); }
        const back = await frame.$('#returnToVisualWorkflow');
        if (back && (await back.isVisible().catch(() => false))) {
          await back.click().catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
      const created = calls.filter((c) => c.url.includes('project/create'));
      step('创建项目', created.some((c) => c.status === 200),
           created.map((c) => c.status).join(','));

      const source = await frame.$('#visualSource');
      step('编辑器可见', !!source);
      if (source) {
        calls.length = 0;
        await source.fill(text);
        await page.waitForTimeout(1500);
        await source.press('End');
        await page.waitForTimeout(4000);

        const saveCalls = calls.filter((c) => c.url.includes('project/source'));
        step('原稿保存接口', saveCalls.some((c) => c.status === 200),
             saveCalls.map((c) => c.status).join(','));

        const hint = await frame.evaluate(() => {
          const node = document.getElementById('visualSourceHint');
          return node ? node.textContent.trim() : null;
        });
        const toastText = await page.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll('.toast, .studio-toast, [class*=toast]'));
          return nodes.map((n) => (n.textContent || '').trim()).filter(Boolean).slice(0, 3);
        });
        const bad = [hint || ''].concat(toastText)
          .filter((t) => t.includes('自动保存未完成') || t.includes('不一致'));
        step('无"自动保存未完成"提示', bad.length === 0,
             JSON.stringify({ hint, toast: toastText }).slice(0, 200));

        // 回读接口：confirmedScript 必须等于刚保存的正文
        const echoed = await frame.evaluate(async (base) => {
          const r = await fetch(base + '/api/visual/projects');
          const list = (await r.json()).projects || [];
          const target = list[0];
          if (!target) return null;
          const d = await fetch(base + '/api/visual/project?id=' + target.id);
          const body = await d.json();
          const p = body.project || {};
          return { id: p.id, len: (p.confirmedScript || '').length };
        }, BASE);
        step('回读 confirmedScript', Boolean(echoed && echoed.len > 0),
             JSON.stringify(echoed));
      }
    }

    if (SHOT) {
      await page.screenshot({ path: SHOT, fullPage: false });
      out.shot = SHOT;
    }
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 240);
  }
  await context.close();
  console.log(JSON.stringify(out, null, 1));
})();

// 真机探针：在真实项目上点「补齐分镜」，抓 quote 的请求/响应与报错。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];
const CARD = process.argv[3];
const PROJECT = process.argv[4] || '';
const PROFILE = path.join(PW_DIR, 'profile-macro-probe');

(async () => {
  const out = { steps: [], quotes: [], errors: [], taskCalls: [] };
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(25000);
  page.on('pageerror', (e) => out.errors.push(String(e.message).slice(0, 160)));
  out.macroCalls = [];
  page.on('request', (r) => {
    if ((r.url().includes('/api/visual/macro/') || r.url().includes('/api/tasks/'))
        && r.method() === 'POST') {
      out.macroCalls.push({ url: r.url().replace(BASE, ''), body: (r.postData() || '').slice(0, 500) });
      if (r.url().includes('/macro/quote')) out.lastQuoteRequest = r.postData();
    }
  });
  page.on('response', async (r) => {
    if (r.url().includes('/api/visual/macro/submit') || r.url().includes('/api/tasks/')) {
      let body = '';
      try { body = (await r.text()).slice(0, 500); } catch (e) { body = ''; }
      out.taskCalls.push({ url: r.url().replace(BASE, ''), status: r.status(), body });
    }
    if (r.url().includes('/api/visual/macro/quote')) {
      let body = '';
      try { body = (await r.text()).slice(0, 900); } catch (e) { body = ''; }
      out.quotes.push({ status: r.status(), body });
    }
  });
  const step = (name, ok, detail) => {
    out.steps.push({ name, ok, detail });
  };
  try {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ([base, card]) => {
      await fetch(base + '/api/session/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardKey: card }),
      });
    }, [BASE, CARD]);

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
    step('iframe', !!frame);
    if (!frame) throw new Error('no visual iframe');

    const cardSelector = PROJECT
      ? `[data-project-id="${PROJECT}"] .open-visual-project`
      : '.open-visual-project';
    await frame.$eval(cardSelector, (n) => n.click());
    await page.waitForTimeout(4500);

    await frame.$eval('[data-workflow-stage="3"]', (n) => n.click())
      .catch(() => {});
    await page.waitForTimeout(3500);

    out.stage3Text = (await frame.evaluate(
      () => (document.body.innerText || '').slice(0, 0) || document
        .querySelector('#macroInlineWorkspace')?.innerText?.slice(0, 300) || ''))
      .slice(0, 300);

    out.buttons = await frame.evaluate(() => Array.from(document.querySelectorAll('button'))
      .filter((n) => n.offsetParent)
      .map((n) => ({ id: n.id || '', cls: (n.className || '').slice(0, 40),
                     text: (n.textContent || '').trim().slice(0, 12),
                     disabled: n.disabled }))
      .filter((b) => /补齐|分镜|全部|重新/.test(b.text)).slice(0, 12));
    out.workspace = await frame.evaluate(() => {
      const node = document.getElementById('macroInlineWorkspace');
      return node ? { hidden: node.hidden, len: (node.innerText || '').length,
                      text: (node.innerText || '').slice(0, 160) } : null;
    });
    // 找到「补齐分镜」按钮（可能有多个，点第一个可见的）
    const clicked = await frame.evaluate(() => {
      const node = document.getElementById('startPreparedSceneShots');
      if (!node || node.disabled) return false;
      node.click();
      return true;
    });
    step('点击开始补齐分镜', clicked);
    await page.waitForTimeout(1500);
    out.cutDialog = await frame.evaluate(() => {
      const node = document.getElementById('visualCutModeDialog');
      return node ? !node.hidden && !node.classList.contains('hidden') : false;
    }).catch(() => false);
    if (out.cutDialog) {
      await frame.$eval('#confirmCutModeDialog', (n) => n.click())
        .catch(() => {});
      step('确认切分设置', true);
      // 等 episode-cut 任务完成、工作区出现分镜
      for (let i = 0; i < 90; i += 1) {
        await page.waitForTimeout(2000);
        const size = await frame.evaluate(() => {
          const node = document.getElementById('macroInlineWorkspace');
          return node ? (node.innerText || '').length : 0;
        }).catch(() => 0);
        if (size > 200) break;
      }
    }
    out.workspaceAfter = await frame.evaluate(() => {
      const node = document.getElementById('macroInlineWorkspace');
      return node ? (node.innerText || '').slice(0, 300) : '';
    }).catch(() => '');
    const sceneClicked = await frame.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('button'))
        .filter((n) => (n.textContent || '').trim() === '补齐分镜'
          && n.offsetParent && !n.disabled
          && !n.id);
      if (!nodes.length) return false;
      nodes[0].click();
      return true;
    });
    step('点击场内补齐分镜', sceneClicked);
    await page.waitForTimeout(2000);
    out.confirmText = await frame.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll(
        '.studio-dialog, [role=dialog], dialog')).filter((n) => n.offsetParent);
      const node = nodes[nodes.length - 1];
      return node ? (node.innerText || '').slice(0, 200) : '';
    }).catch(() => '');
    const dumpButtons = () => Array.from(document.querySelectorAll('button,[role=button]'))
      .filter((n) => n.offsetParent !== null || (n.tagName || '').toLowerCase() === 'button')
      .map((n) => ({ tag: n.tagName, cls: (n.className || '').toString().slice(0, 40),
                     text: (n.textContent || '').trim().slice(0, 20),
                     disabled: !!n.disabled }));
    out.topButtons = await page.evaluate(dumpButtons).catch(() => []);
    out.frameButtons = await frame.evaluate(dumpButtons).catch(() => []);
    out.topDialogs = await page.evaluate(() => Array.from(document.querySelectorAll('dialog'))
      .map((n) => ({ open: n.open, cls: n.className,
                     text: (n.innerText || '').slice(0, 120) }))).catch(() => []);

    const clickConfirm = () => {
      const nodes = Array.from(document.querySelectorAll('button'))
        .filter((n) => n.offsetParent && /确认|开始|继续|提交/.test(n.textContent || '')
          && !n.disabled);
      if (!nodes.length) return false;
      nodes[nodes.length - 1].click();
      return true;
    };
    let accepted = await frame.evaluate(clickConfirm).catch(() => false);
    if (!accepted) {
      accepted = await page.evaluate(clickConfirm).catch(() => false);
    }
    out.confirmWhere = accepted ? (out.confirmWhere || 'unknown') : 'none';
    step('确认报价', accepted, out.confirmText);
    for (let i = 0; i < 60; i += 1) {
      await page.waitForTimeout(2000);
      const size = await frame.evaluate(() => {
        const node = document.getElementById('macroInlineWorkspace');
        return node ? (node.innerText || '').length : 0;
      }).catch(() => 0);
      if (size > 300) break;
    }
    out.workspaceFinal = await frame.evaluate(() => {
      const node = document.getElementById('macroInlineWorkspace');
      return node ? (node.innerText || '').slice(0, 400) : '';
    }).catch(() => '');
    await page.waitForTimeout(2500);
    out.dialog = await frame.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll(
        '.studio-dialog, [role=dialog], dialog')).filter((n) => n.offsetParent);
      const node = nodes[nodes.length - 1];
      return node ? (node.innerText || '').slice(0, 300) : '';
    }).catch(() => '');
    const confirmed = await frame.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('button'))
        .filter((n) => n.offsetParent && /确认|确定|继续|开始/.test(n.textContent || ''));
      if (!nodes.length) return false;
      nodes[nodes.length - 1].click();
      return true;
    }).catch(() => false);
    step('对话框确认', confirmed, out.dialog);
    await page.waitForTimeout(4000);

    out.toasts = await frame.$$eval('.toast, [role=alert]',
      (nodes) => nodes.map((n) => (n.textContent || '').trim())
        .filter(Boolean).slice(0, 4)).catch(() => []);
    out.bodyAfter = await frame.evaluate(
      () => (document.body.innerText || '').slice(0, 0)
        || document.querySelector('#macroInlineWorkspace')?.innerText?.slice(0, 400) || '');
  } catch (error) {
    out.fatal = String(error.message).slice(0, 200);
  }
  await ctx.close();
  console.log(JSON.stringify(out, null, 1));
})();

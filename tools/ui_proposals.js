// 验收截图中的流程：保存原剧本 → "需要，立即生成" → 三套差异化提案出现。
// 用法: node tools/ui_proposals.js <baseUrl> <card>
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2];
const CARD = process.argv[3];
const PROFILE = path.join(PW_DIR, 'profile-proposals');
const SOURCE = `第一场 图书馆 日 内
林晚把剧本推到周野面前：这段冲突太软。
周野没有接，只把杯子往她那边挪了半寸。
第二场 图书馆 夜 内
灯管坏了一根，雨声盖过翻页的声音。`;

(async () => {
  const out = { steps: [], ok: true };
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(30000);
  const calls = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/source/proposals')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 160); } catch (e) { body = ''; }
      calls.push({ status: resp.status(), url: resp.url().replace(BASE, ''), body });
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
    const source = await page.$('#sourceText');
    step('原稿编辑器可见', !!source);
    if (!source) throw new Error('找不到 #sourceText');
    await source.fill(SOURCE);
    await page.click('#saveSourceScriptBtn');
    await page.waitForTimeout(1200);
    const decisionVisible = await page.$eval('#proposalDecision',
      (n) => !n.classList.contains('hidden')).catch(() => false);
    step('保存后出现提案询问', decisionVisible);

    calls.length = 0;
    await page.click('#proposalNeedBtn');
    // 等提案卡片，最长 6 分钟（LLM 真调用）
    let cards = 0;
    for (let i = 0; i < 360; i += 1) {
      cards = await page.$$eval('.proposal-card', (n) => n.length).catch(() => 0);
      if (cards >= 3) break;
      await page.waitForTimeout(1000);
    }
    step('生成三套提案卡片', cards >= 3, `cards=${cards}`);

    const submit = calls.find((c) => c.url.includes('/api/source/proposals'));
    step('提交接口 200', Boolean(submit && submit.status === 200),
         submit ? `${submit.status} ${submit.body.slice(0, 60)}` : 'no call');

    const bad = await page.evaluate(() => Array.from(document.querySelectorAll('.toast, [role=alert]'))
      .map((n) => (n.textContent || '').trim())
      .filter((t) => t.includes('invalid_input') || t.includes('没有完成')));
    step('无 invalid_input', bad.length === 0, JSON.stringify(bad).slice(0, 110));
  } catch (error) {
    out.ok = false;
    out.error = String(error.message).slice(0, 200);
  }
  await context.close();
  console.log(JSON.stringify(out, null, 1));
})();

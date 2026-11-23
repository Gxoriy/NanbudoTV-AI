// AI 电商页面加载探针：抓首个 pageerror 的完整栈。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];

(async () => {
  const ctx = await chromium.launchPersistentContext(
    path.join(PW_DIR, 'profile-ui-ecommerce'), { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const out = { errors: [], console: [], requests: [] };
  page.on('pageerror', (e) => out.errors.push({
    message: e.message, stack: (e.stack || '').slice(0, 1200),
  }));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) {
      out.console.push(m.text().slice(0, 300));
    }
  });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/ecommerce')) return;
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch (e) { body = ''; }
    out.requests.push({ url: r.url().replace(BASE, ''), status: r.status(), body });
  });
  await page.goto(BASE + '/static/ecommerce259.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const options = await page.evaluate(() => {
    const n = document.getElementById('projects');
    return n ? [...n.options].map((o) => ({ value: o.value, label: o.textContent })) : [];
  });
  out.options = options.slice(0, 5);
  const target = options.find((o) => o.value);
  if (target) {
    await page.selectOption('#projects', target.value);
    await page.waitForTimeout(5000);
  }
  out.afterSelect = await page.evaluate(() => ({
    name: document.getElementById('projectName')?.value,
    status: document.getElementById('status')?.textContent,
    body: document.body.innerText.slice(0, 500),
  }));
  out.text = (await page.evaluate(() => document.body.innerText)).slice(0, 700);
  out.buttons = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((n) => n.offsetParent)
    .map((n) => ({ text: (n.textContent || '').trim().slice(0, 16), disabled: n.disabled }))
    .slice(0, 20));
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
})();

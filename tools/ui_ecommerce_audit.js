// AI 电商板块点击审计：加载、切换模式、新建、保存、刷新。
const path = require('path');
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));
const BASE = process.argv[2];

(async () => {
  const ctx = await chromium.launchPersistentContext(
    path.join(PW_DIR, 'profile-ui-ecom-audit'), { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const out = { steps: [], errors: [], apis: [] };
  const step = (name, ok, detail = '') => out.steps.push({ name, ok: !!ok, detail });
  page.on('pageerror', (e) => out.errors.push(String(e.message).slice(0, 240)));
  page.on('dialog', async (d) => { try { await d.accept(); } catch (e) {} });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/ecommerce')) return;
    let body = '';
    try { body = (await r.text()).slice(0, 160); } catch (e) { body = ''; }
    out.apis.push({ url: r.url().replace(BASE, ''), status: r.status(), body });
  });

  await page.goto(BASE + '/static/ecommerce259.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  step('页面载入', (await page.evaluate(() => document.body.innerText)).includes('电商'));

  const options = await page.evaluate(() => {
    const n = document.getElementById('projects');
    return n ? [...n.options].map((o) => o.value).filter(Boolean) : [];
  });
  step('历史项目可见', options.length > 0, `options=${options.length}`);
  if (options.length) {
    await page.selectOption('#projects', options[0]);
    await page.waitForTimeout(3000);
    const name = await page.evaluate(() => document.getElementById('projectName')?.value);
    step('历史项目可打开', !!name, String(name));
  }

  await page.click('#videoTab').catch(() => {});
  await page.waitForTimeout(1200);
  let text = await page.evaluate(() => document.body.innerText);
  step('切到视频创作', text.includes('视频创作'), text.slice(0, 80));

  await page.click('#imageTab').catch(() => {});
  await page.waitForTimeout(1500);
  text = await page.evaluate(() => document.body.innerText);
  step('切到图片创作', text.includes('主图'), text.slice(0, 80));

  await page.click('#newProject').catch(() => {});
  await page.waitForTimeout(3000);
  const name = await page.evaluate(() => document.getElementById('projectName')?.value);
  step('新建项目', !!name, String(name));

  await page.click('#saveProject').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('#refreshProjects').catch(() => {});
  await page.waitForTimeout(1500);
  step('保存并刷新', !out.errors.length, out.errors.join(' | ').slice(0, 200));
  step('无 mode 报错', !out.errors.some((e) => /reading 'mode'/.test(e)),
       out.errors.join(' | ').slice(0, 200));

  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
})();

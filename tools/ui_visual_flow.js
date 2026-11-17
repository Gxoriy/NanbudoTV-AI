// 视觉页真实点击流程：新建项目 → 填原稿 → 资产提取/提取大纲 → 收接口结果。
// 用法: node tools/ui_visual_flow.js http://127.0.0.1:PORT
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const PROFILE = process.env.NANBUDO_UI_PROFILE || path.join(PW_DIR, 'profile-ui-visual');

const SCRIPT = [
  '第一场 图书馆 日 内',
  '小雨。林晚把剧本摊在桌上，指着第三页对同桌说：这段冲突太软了。',
  '同桌周野抬头：那就让他当场摔门。',
].join('\n');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  const calls = [];
  const consoleErrors = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (!url.includes('/api/visual/') && !url.includes('/api/tasks')) return;
    let body = '';
    try { body = (await resp.text()).slice(0, 200); } catch (e) { body = '<unreadable>'; }
    calls.push({ status: resp.status(), url: url.replace(BASE, ''), body });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 140));
  });

  const report = { steps: [], consoleErrors: [] };
  const step = (name, extra) => report.steps.push({ name, ...extra });

  try {
    await page.goto(BASE + '/visual.html', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    step('打开视觉页', { url: page.url().replace(BASE, '') });

    // 1) 新建项目：优先项目中心的按钮，其次工作流头部的按钮
    let created = false;
    for (const selector of ['#newVisualProject', '#newWorkflowProject']) {
      const node = await page.$(selector);
      if (node && await node.isVisible().catch(() => false)) {
        await node.click();
        await page.waitForTimeout(1200);
        // 弹窗里若出现输入框，填名字并回车
        const input = await page.$('input:visible, dialog input');
        if (input) {
          await input.fill('UI 流程测试');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1500);
        }
        created = true;
        step('点击新建项目', { selector });
        break;
      }
    }
    if (!created) step('未找到新建项目按钮', { note: '可能已存在项目或入口被隐藏' });

    // 2) 填写原稿（自动保存）
    const source = await page.$('#visualSource');
    if (source) {
      await source.fill(SCRIPT);
      await page.waitForTimeout(2000);
      step('填写原稿', { chars: SCRIPT.length });
    } else {
      step('未找到原稿输入框', {});
    }

    // 3) 资产提取 / 提取大纲
    for (const selector of ['#confirmSourceReference', '#aiSceneDirectory']) {
      const node = await page.$(selector);
      if (node && await node.isVisible().catch(() => false)) {
        await node.click();
        step('点击提取', { selector });
        await page.waitForTimeout(30000);
        break;
      }
    }

    report.stageStatus = await page.evaluate(() => {
      const node = document.querySelector('#visualStageStatus');
      return node ? node.textContent.trim().slice(0, 120) : '';
    });
  } catch (error) {
    report.error = String(error.message).slice(0, 200);
  } finally {
    report.calls = calls.slice(0, 24);
    report.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
})();

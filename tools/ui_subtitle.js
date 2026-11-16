// 字幕页真实流程：导入本地视频 → 自动识别字幕区域 → 观察选区是否被填上。
// 用法: node tools/ui_subtitle.js http://127.0.0.1:PORT D:\path\clip.mp4
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const CLIP = process.argv[3] || '';
const PROFILE = process.env.NANBUDO_UI_PROFILE || path.join(PW_DIR, 'profile-ui-subtitle');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  const calls = [];
  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/subtitle/')) return;
    let body = '';
    try { body = (await resp.text()).slice(0, 240); } catch (e) { body = '<unreadable>'; }
    calls.push({ status: resp.status(), url: resp.url().replace(BASE, ''), body });
  });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 140));
  });

  const report = { steps: [], calls: [], consoleErrors: [] };
  try {
    await page.goto(BASE + '/subtitle_removal242.html', { waitUntil: 'networkidle', timeout: 30000 });
    report.steps.push({ step: '打开字幕页', url: page.url().replace(BASE, '') });

    await page.setInputFiles('#localFile', CLIP);
    // 等导入完成：选区按钮变为可用
    await page.waitForFunction(() => {
      const button = document.getElementById('detect');
      return button && !button.disabled;
    }, { timeout: 30000 });
    report.steps.push({ step: '导入视频完成', detectEnabled: true });

    await page.click('#detect');
    await page.waitForTimeout(6000);
    report.region = await page.evaluate(() => {
      const ids = ['regionX', 'regionY', 'regionWidth', 'regionHeight'];
      const out = {};
      ids.forEach((id) => { const node = document.getElementById(id); out[id] = node ? node.value : null; });
      const notice = document.getElementById('regionNotice244');
      out.notice = notice ? notice.textContent.trim().slice(0, 120) : '';
      const status = document.getElementById('status');
      out.status = status ? status.textContent.trim().slice(0, 120) : '';
      return out;
    });
  } catch (error) {
    report.error = String(error.message).slice(0, 200);
  } finally {
    report.calls = calls.filter((c) => c.url.includes('detect') || c.url.includes('upload'))
      .slice(0, 6);
    report.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
})();

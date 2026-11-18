// 带前置状态的 UI 场景：登录门控 → 字幕导入/识别 → 视觉建项目 → 电商建项目 → 音色。
// 用法: node tools/ui_scenario.js <baseUrl> <cardKey> <videoPath>
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2];
const CARD = process.argv[3] || '';
const VIDEO = process.argv[4] || '';
const PROFILE = process.env.NANBUDO_UI_PROFILE || path.join(PW_DIR, 'profile-ui-scenario');

const steps = [];
const failures = [];

function record(name, detail, ok = true) {
  steps.push({ name, ...detail, ok });
  if (!ok) failures.push(name);
}

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(12000);

  let bucket = [];
  const consoleErrors = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (!url.includes('/api/')) return;
    let body = '';
    try { body = (await resp.text()).slice(0, 200); } catch (e) { body = '<unreadable>'; }
    bucket.push({ status: resp.status(), url: url.replace(BASE, ''), body });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 140));
  });

  const bad = () => bucket.filter((c) => c.status >= 400);

  try {
    // ---------- 0. 未登录直接开首页，应被服务端 302 到登录页 ----------
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const landed = page.url().replace(BASE, '');
    record('未登录访问首页自动跳登录页', { url: landed.slice(0, 32) },
           landed.includes('login.html'));

    // ---------- 1. 登录门控（故意用错卡，再换正确的） ----------
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const loginPageLoaded = await page.$('#cardKey');
    record('打开登录页', { hasCardInput: !!loginPageLoaded }, !!loginPageLoaded);

    if (loginPageLoaded) {
      bucket = [];
      await page.fill('#cardKey', 'DW-0000-0000-0000-0000-0000-0000-0000-0000');
      await page.click('#loginButton');
      await page.waitForTimeout(2500);
      const wrongMsg = await page.evaluate(() => {
        const node = document.querySelector('#loginMessage');
        return node ? node.textContent.trim().slice(0, 60) : '';
      });
      record('错误卡密被拒绝', { message: wrongMsg, stayedOnLogin: page.url().includes('login') },
             page.url().includes('login'));

      bucket = [];
      await page.fill('#cardKey', CARD);
      await page.click('#loginButton');
      await page.waitForTimeout(3500);
      const afterLogin = page.url();
      const licensed = bucket.some((c) => c.url.includes('/api/session/login') && c.status === 200);
      record('正确卡密登录成功', { url: afterLogin.replace(BASE, ''), loginCall200: licensed },
             licensed);
    }

    // ---------- 2. 字幕页：导入 → 自动识别 ----------
    if (VIDEO) {
      await page.goto(BASE + '/subtitle_removal242.html', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      bucket = [];
      const input = await page.$('#localFile');
      if (input) {
        await input.setInputFiles(VIDEO);
        await page.waitForTimeout(4000);
        const upload = bucket.filter((c) => c.url.includes('subtitle/upload'));
        record('导入视频', { upload: upload.map((c) => c.status) },
               upload.some((c) => c.status === 200));

        bucket = [];
        const radio = await page.$('#modeRepair');
        if (radio) await radio.click().catch(() => {});
        await page.waitForTimeout(600);
        const detect = await page.$('#detect');
        if (detect) {
          await detect.click().catch(() => {});
          await page.waitForTimeout(5000);
          const calls = bucket.filter((c) => c.url.includes('subtitle/detect'));
          record('自动识别字幕区域', { calls: calls.map((c) => c.status) },
                 calls.some((c) => c.status === 200));
        } else {
          record('找不到 detect 按钮', {}, false);
        }
      } else {
        record('找不到 #localFile', {}, false);
      }
    }

    // ---------- 3. 首页 → 短剧项目中心（iframe 工作流）→ 新建项目 ----------
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    bucket = [];
    const centerBtn = await page.$('#visualProjectCenterTop');
    if (centerBtn) {
      await centerBtn.click().catch(() => {});
      await page.waitForTimeout(4000);
    }
    record('打开短剧项目中心', { clicked: !!centerBtn }, !!centerBtn);

    let frame = null;
    for (let i = 0; i < 20; i += 1) {
      frame = page.frames().find((f) => f.url().includes('visual.html'));
      if (frame) break;
      await page.waitForTimeout(500);
    }
    record('工作流 iframe 加载', { url: frame ? frame.url().replace(BASE, '').slice(0, 40) : '' },
           !!frame);

    if (frame) {
      // 嵌入式工作流里可见的是项目中心的"新建项目"按钮（#newWorkflowProject 在顶部且隐藏）
      const newBtn = (await frame.$('#newVisualProject'))
        || (await frame.$('#newWorkflowProject'));
      bucket = [];
      if (newBtn && (await newBtn.isVisible().catch(() => false))) {
        await newBtn.click();
        await page.waitForTimeout(1500);
        // 确认框由父页面弹出（studio_dialog）
        const confirmBtn = await page.$('.studio-dialog-confirm');
        if (confirmBtn) {
          await confirmBtn.click().catch(() => {});
          await page.waitForTimeout(1200);
        }
        const nameInput = await frame.$('#wizardProjectName');
        if (nameInput) await nameInput.fill('场景测试项目');
        const createBtn = await frame.$('#confirmProjectWizard');
        if (createBtn) {
          await createBtn.click().catch(() => {});
          await page.waitForTimeout(3500);
        }
      }
      const createCalls = bucket.filter((c) => c.url.includes('project/create'));
      record('视觉新建项目', {
        button: !!(newBtn && (await newBtn.isVisible().catch(() => false))),
        calls: createCalls.map((c) => `${c.status}`),
      }, createCalls.some((c) => c.status === 200));

      // 建完项目会落到"项目中心"，先返回工作流再填原稿
      const backBtn = await frame.$('#returnToVisualWorkflow');
      if (backBtn && (await backBtn.isVisible().catch(() => false))) {
        await backBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
      }

      const source = await frame.$('#visualSource');
      if (source) {
        bucket = [];
        await source.fill('第一场 图书馆 日 内\n林晚把剧本推到周野面前：这段冲突太软。');
        await page.waitForTimeout(3000);
        const saved = bucket.filter((c) => c.url.includes('project/source'));
        record('原稿自动保存', { calls: saved.map((c) => c.status) },
               saved.length > 0 && saved.every((c) => c.status < 400));
      } else {
        record('找不到原稿输入框', {}, false);
      }

      const stateText = await frame.evaluate(() => {
        const node = document.querySelector('#visualStageStatus');
        return node ? node.textContent.trim().slice(0, 60) : '';
      });
      record('阶段提示可见', { text: stateText }, !!stateText);
    }

    // ---------- 4. 电商页：加载 + 进入创作视图 ----------
    bucket = [];
    await page.goto(BASE + '/ecommerce259.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const loadCalls = bucket.filter((c) => c.url.includes('/api/'));
    bucket = [];
    const buttons = await page.$$('button');
    let clicked = false;
    for (const node of buttons) {
      const text = (await node.textContent().catch(() => '')) || '';
      if (/图片创作|视频创作|新建/.test(text) && !(await node.isDisabled().catch(() => true))) {
        await node.click().catch(() => {});
        clicked = true;
        await page.waitForTimeout(2500);
        break;
      }
    }
    const ecomCalls = [...loadCalls, ...bucket].filter((c) => c.url.includes('/api/'));
    const ecomBad = ecomCalls.filter((c) => c.status >= 400);
    record('电商页加载与创作视图', {
      clicked,
      loaded: loadCalls.length,
      bad: ecomBad.map((c) => `${c.status}:${c.url.slice(0, 40)}`),
    }, clicked && loadCalls.length > 0 && ecomBad.length === 0);

    // ---------- 5. 音色页：目录 ----------
    bucket = [];
    await page.goto(BASE + '/voice_studio.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const voices = bucket.filter((c) => c.url.includes('/api/'));
    record('音色页加载', { calls: voices.map((c) => `${c.status}:${c.url.slice(0, 34)}`).slice(0, 4) },
           voices.some((c) => c.url.includes('voices') && c.status === 200)
           && voices.every((c) => c.status < 400));
  } catch (error) {
    record('脚本异常', { error: String(error.message).slice(0, 160) }, false);
  } finally {
    const all = steps.flatMap((s) => (s.calls || []).length ? [] : []);
    const report = {
      steps,
      failures,
      consoleErrors: [...new Set(consoleErrors)].slice(0, 8),
      finalUrl: page.url().replace(BASE, ''),
      extra: all,
    };
    await context.close();
    console.log(JSON.stringify(report, null, 1));
  }
})();

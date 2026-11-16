// 采集驱动：node driver.js '{"url":"...","profile":"...","timeoutMs":45000}'
// 输出一行 JSON。只做"打开页面并抽取结构化信息"，不做登录/交互。
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

function out(payload) {
  process.stdout.write(JSON.stringify(payload));
}

(async () => {
  let args;
  try {
    args = JSON.parse(process.argv[2] || '{}');
  } catch (error) {
    out({ ok: false, code: 'invalid_input', message: '参数不是合法 JSON' });
    process.exit(2);
  }

  const url = args.url;
  const profile = args.profile || path.join(PW_DIR, 'profile');
  const timeoutMs = Number(args.timeoutMs || 45000);
  if (!url) {
    out({ ok: false, code: 'invalid_input', message: '缺少 url' });
    process.exit(2);
  }

  // 单实例锁：同一 profile 目录不允许并发，避免 Chromium 把锁文件搞坏
  const lockFile = path.join(profile, '.owner.pid');
  try {
    if (fs.existsSync(lockFile)) {
      const pid = parseInt(fs.readFileSync(lockFile, 'utf8'), 10);
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch (e) { alive = false; }
      if (alive) {
        out({ ok: false, code: 'busy', message: `采集实例仍在运行（pid=${pid}），请先关闭` });
        process.exit(3);
      }
      fs.rmSync(lockFile, { force: true });
    }
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(lockFile, String(process.pid));
  } catch (error) {
    out({ ok: false, code: 'internal', message: '单实例锁处理失败: ' + error.message });
    process.exit(4);
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { headless: true });
    const page = context.pages()[0] || (await context.newPage());
    const captured = [];                       // 网络里出现的媒体直链
    page.on('response', (resp) => {
      const url = resp.url();
      if (/\.(mp4|m3u8|mov)(\?|$)/i.test(url) && !captured.includes(url)) {
        captured.push(url);
      }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
      const pick = (selector, attr) => {
        const node = document.querySelector(selector);
        return node ? node.getAttribute(attr) || node.content || '' : '';
      };
      const videos = Array.from(document.querySelectorAll('video'))
        .map((v) => v.currentSrc || v.src || '')
        .filter((src) => src && src.startsWith('http'));
      const audios = Array.from(document.querySelectorAll('audio,source'))
        .map((a) => a.currentSrc || a.src || '')
        .filter((src) => src && src.startsWith('http'));
      const images = Array.from(document.querySelectorAll('img'))
        .map((i) => i.currentSrc || i.src || '')
        .filter((src) => src && src.startsWith('http'))
        .slice(0, 20);
      return {
        title: document.title || '',
        description: pick('meta[name="description"]', 'content'),
        cover: pick('meta[property="og:image"]', 'content') || images[0] || '',
        videos: Array.from(new Set([...videos, ...audios])),
        images,
        url: location.href,
      };
    });

    let payload = data;
    if (args.mode === 'download') {
      // 用浏览器上下文下载：能复用系统代理、Cookie、UA，裸 urllib 常常连不上或 403
      const target = (data.videos || [])[0];
      if (!target) {
        out({ ok: false, code: 'not_found', message: '页面里没找到可下载的视频地址。' });
        return;
      }
      const resp = await context.request.get(target, { timeout: 600000 });
      if (!resp.ok()) {
        out({ ok: false, code: 'download_failed', message: `下载返回 ${resp.status()}` });
        return;
      }
      const buffer = await resp.body();
      fs.writeFileSync(args.outPath, buffer);
      payload = { ...data, filePath: args.outPath, bytes: buffer.length };
    }
    out({ ok: true, data: payload });
  } catch (error) {
    out({ ok: false, code: 'browse_failed', message: String(error && error.message || error) });
    process.exitCode = 5;
  } finally {
    try { if (context) await context.close(); } catch (e) { /* 已关闭 */ }
    try { fs.rmSync(lockFile, { force: true }); } catch (e) { /* 忽略 */ }
  }
})();

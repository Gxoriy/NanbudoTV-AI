// 价格诊断：登录后打开视觉页，读 config/profile 供价、按钮禁用原因与 credit 提示文案。
// 用法: node tools/ui_price_diag.js <baseUrl> <card>
const path = require('path');

const PW_DIR = process.env.NANBUDO_PLAYWRIGHT_DIR || 'E:\\PublicWork\\Playwright';
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const CARD = process.argv[3] || '';
const PROFILE = process.env.NANBUDO_UI_PROFILE || path.join(PW_DIR, 'profile-price-diag');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(8000);
  const out = {};
  try {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    out.login = await page.evaluate(async ([base, card]) => {
      const r = await fetch(base + '/api/session/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardKey: card }),
      });
      const b = await r.json().catch(() => ({}));
      return { ok: r.ok, authenticated: !!b.authenticated,
               expiresAt: b.license && b.license.expiresAt,
               permanent: b.license && b.license.permanent };
    }, [BASE, CARD]);

    await page.goto(BASE + '/visual.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    out.config = await page.evaluate(async (base) => {
      const r = await fetch(base + '/api/client/config');
      const b = await r.json();
      return { bindings: Object.keys(b.textButtonBindings || {}).slice(0, 6),
               cutPrice: (b.textButtonBindings || {})['workflow-cut'] };
    }, BASE);

    out.profile = await page.evaluate(async (base) => {
      const r = await fetch(base + '/api/visual/profile');
      const b = await r.json();
      const p = b.profile || {};
      return { videoRows: (p.videoPricing || []).length,
               imageRows: (p.imagePricing || []).length,
               videoModel: p.videoModel, imageModel: p.imageModel };
    }, BASE);

    out.buttons = await page.$$eval('button', (nodes) => nodes
      .filter((n) => /大纲|资产提取|海报|生成/.test(n.textContent || ''))
      .slice(0, 8)
      .map((n) => ({
        id: n.id || '', text: (n.textContent || '').trim().slice(0, 14),
        disabled: n.disabled, cls: (n.className || '').slice(0, 40),
        reason: n.dataset.creditReason || '',
        hint: (n.parentElement?.querySelector('.credit-hint')?.textContent || '')
          .trim().slice(0, 40),
      })));

    out.selects = await page.evaluate(() => {
      const read = (id) => {
        const node = document.getElementById(id);
        if (!node) return null;
        return {
          value: node.value,
          options: Array.from(node.options || []).map((o) => o.value).slice(0, 6),
        };
      };
      return {
        imageTier: read('visualImageTier'),
        imageResolution: read('visualImageResolution'),
        videoTier: read('visualVideoTier'),
        videoResolution: read('visualResolution'),
        recognition: read('visualRecognitionModel'),
        cut: read('visualCutModel'),
      };
    });

    out.hints = await page.$$eval('.credit-hint',
      (nodes) => nodes.map((n) => (n.textContent || '').trim()).filter(Boolean).slice(0, 6));

    // 填一段原稿，再看两个主按钮是否放行（价格提示应显示"需 x.xx"而不是"尚无有效价格"）
    const source = await page.$('#visualSource');
    if (source) {
      await source.fill('第一场 图书馆 日 内\n林晚把剧本推到周野面前：这段冲突太软。');
      await page.waitForTimeout(3000);
      out.afterSource = await page.evaluate(() => {
        const read = (id) => {
          const node = document.getElementById(id);
          if (!node) return null;
          return {
            disabled: node.disabled,
            hint: (node.parentElement?.querySelector('.credit-hint')?.textContent || '')
              .trim().slice(0, 30),
          };
        };
        return { outline: read('aiSceneDirectory'),
                 assets: read('confirmSourceReference') };
      });
    }
    // 页头在首页（index.html），不在 visual 里；单独跳过去读一次
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    out.header = await page.evaluate(() => {
      const node = document.getElementById('cardTimeRemainingTop');
      const points = document.getElementById('myPointsTopBalance');
      return {
        url: location.pathname,
        cardRemaining: node ? (node.textContent || '').trim() : null,
        points: points ? (points.textContent || '').trim() : null,
      };
    });
  } catch (error) {
    out.error = String(error.message).slice(0, 200);
  }
  await context.close();
  console.log(JSON.stringify(out, null, 1));
})();

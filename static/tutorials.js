/* Tutorials are read-only help media, independent of creation tasks and billing. */
(function (global) {
  'use strict';
  const sections = Object.freeze({
    rewrite: '剧本改写', original: '一键原创', workflow: '短剧工作流',
    ecommerce: 'AI电商宣传片', store: 'AI探店宣传片', advertising: 'AI广告宣传片',
    breakdown: '爆款拆解', canvas: '视频画布', characters: '数字人',
    voice: '音色大厅', video_voice: '视频配音'
  });
  const controllers = new Map();
  const collapsed = new Map();
  let catalogRequest = null;
  let catalogForced = false;

  function safeVideoUrl(value, section) {
    if (typeof value !== 'string' || !value.startsWith('/api/tutorial-video?')) return '';
    try {
      const url = new URL(value, global.location.origin);
      if (url.origin !== global.location.origin || url.pathname !== '/api/tutorial-video' ||
          url.searchParams.getAll('section').length !== 1 || url.searchParams.get('section') !== section ||
          url.searchParams.getAll('v').length !== 1 || !/^[A-Za-z0-9_-]{1,80}$/.test(url.searchParams.get('v') || '') ||
          [...url.searchParams.keys()].some(key => key !== 'section' && key !== 'v') ||
          url.username || url.password || url.hash) return '';
      return url.pathname + url.search;
    } catch (_) { return ''; }
  }

  function normalize(rows) {
    const result = new Map();
    if (!Array.isArray(rows)) return result;
    rows.forEach(row => {
      if (!row || !Object.hasOwn(sections, row.section)) return;
      const section = row.section;
      const videoUrl = row.enabled === true ? safeVideoUrl(row.videoUrl, section) : '';
      result.set(section, {
        section, enabled: row.enabled === true, videoUrl,
        title: String(row.title || `${sections[section]}视频教程`).slice(0, 160),
        description: String(row.description || '').slice(0, 2000),
        revision: String(row.revision || '').slice(0, 160)
      });
    });
    return result;
  }

  async function loadCatalog(force) {
    if (catalogRequest && (!force || catalogForced)) return catalogRequest;
    const request = (async () => {
      const response = await fetch(force ? '/api/tutorials?refresh=1' : '/api/tutorials', {cache: 'no-store', credentials: 'same-origin'});
      if (response.status === 404) return {rows: new Map(), legacy: true};
      if (!response.ok) throw new Error('教程信息暂时无法读取，请稍后刷新。');
      const data = await response.json();
      if (!data || data.ok !== true || !Array.isArray(data.tutorials)) throw new Error('教程信息暂时无法读取，请稍后刷新。');
      return {rows: normalize(data.tutorials), legacy: false, error: typeof data.configError === 'string' ? data.configError.slice(0, 300) : ''};
    })();
    catalogRequest = request;
    catalogForced = Boolean(force);
    try { return await request; }
    finally { if (catalogRequest === request) { catalogRequest = null; catalogForced = false; } }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function pauseChildren() {
    document.querySelectorAll('iframe').forEach(frame => {
      try { frame.contentWindow?.postMessage({type: 'workbench-tutorial-pause'}, global.location.origin); } catch (_) {}
    });
  }

  class Tutorial {
    constructor(host) {
      this.host = host;
      this.section = '';
      this.generation = 0;
      this.record = null;
      this.key = '';
      this.video = null;
      this.host.hidden = true;
      delete this.host.dataset.tutorialPublished;
      this.host.classList.add('workbench-tutorial');
      this.host.setAttribute('aria-label', '板块视频教程');
      this.heading = element('div', 'tutorial-heading');
      const copy = element('div', 'tutorial-heading-copy');
      copy.append(element('span', 'tutorial-eyebrow', '操作教程'));
      this.title = element('h2', 'tutorial-title');
      copy.append(this.title);
      const actions = element('div', 'tutorial-actions');
      this.refreshButton = element('button', 'tutorial-refresh', '刷新教程');
      this.refreshButton.type = 'button';
      this.toggleButton = element('button', 'tutorial-toggle', '收起');
      this.toggleButton.type = 'button';
      actions.append(this.refreshButton, this.toggleButton);
      this.heading.append(copy, actions);
      this.body = element('div', 'tutorial-body');
      this.body.id = `workbench-tutorial-body-${controllers.size + 1}`;
      this.toggleButton.setAttribute('aria-controls', this.body.id);
      this.description = element('p', 'tutorial-description');
      this.media = element('div', 'tutorial-media');
      this.status = element('p', 'tutorial-status');
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.body.append(this.description, this.media, this.status);
      this.host.replaceChildren(this.heading, this.body);
      this.refreshButton.addEventListener('click', () => { void this.refresh(true); });
      this.toggleButton.addEventListener('click', () => this.setCollapsed(!this.body.hidden));
    }

    pause() { if (this.video) { try { this.video.pause(); } catch (_) {} } }

    clearVideo() {
      this.pause();
      if (this.video) {
        this.video.removeAttribute('src');
        try { this.video.load(); } catch (_) {}
      }
      this.video = null;
      this.key = '';
      this.media.replaceChildren();
    }

    setCollapsed(value) {
      collapsed.set(this.section, value);
      this.body.hidden = value;
      this.toggleButton.textContent = value ? '展开教程' : '收起';
      this.toggleButton.setAttribute('aria-expanded', String(!value));
      if (value) this.pause();
    }

    setSection(section) {
      if (!Object.hasOwn(sections, section)) return;
      if (this.section === section) { void this.refresh(true); return; }
      this.generation += 1;
      this.hide();
      this.section = section;
      this.host.dataset.tutorialSection = section;
      this.title.textContent = `${sections[section]}视频教程`;
      this.description.hidden = true;
      this.setCollapsed(collapsed.get(section) === true);
      void this.refresh(true);
    }

    hide() {
      this.clearVideo();
      this.record = null;
      this.host.hidden = true;
      delete this.host.dataset.tutorialPublished;
      this.media.classList.remove('has-video');
      this.status.textContent = '';
      this.status.classList.remove('is-error');
    }

    render(record, legacy) {
      this.record = record || null;
      this.title.textContent = record?.title || `${sections[this.section]}视频教程`;
      this.description.textContent = record?.description || '';
      this.description.hidden = !record?.description;
      if (record?.enabled !== true || !record?.videoUrl) {
        this.hide();
        return;
      }
      const key = `${this.section}\n${record.revision}\n${record.videoUrl}`;
      if (this.key !== key || !this.video) {
        this.clearVideo();
        const video = element('video', 'tutorial-video');
        video.controls = true;
        video.preload = 'none';
        video.setAttribute('playsinline', '');
        video.setAttribute('aria-label', `${sections[this.section]}教程视频`);
        video.src = record.videoUrl;
        video.addEventListener('error', () => {
          if (this.video !== video || this.key !== key) return;
          this.hide();
        });
        video.addEventListener('loadeddata', () => {
          if (this.video !== video || this.key !== key) return;
          this.status.textContent = '点击视频内按钮播放或全屏观看，不影响当前创作任务。';
          this.status.classList.remove('is-error');
        });
        this.video = video;
        this.key = key;
        this.media.replaceChildren(video);
      }
      this.media.classList.add('has-video');
      this.host.dataset.tutorialPublished = '1';
      this.host.hidden = false;
      this.status.textContent = '点击视频内按钮播放或全屏观看，不影响当前创作任务。';
      this.status.classList.remove('is-error');
    }

    async refresh(force) {
      const generation = ++this.generation;
      const section = this.section;
      this.refreshButton.disabled = true;
      this.refreshButton.textContent = '读取中…';
      try {
        const catalog = await loadCatalog(force);
        if (this.generation !== generation || this.section !== section) return;
        if(catalog.error){this.hide();return;}
        this.render(catalog.rows.get(section), catalog.legacy);
      } catch (_) {
        if (this.generation !== generation || this.section !== section) return;
        this.hide();
      } finally {
        if (this.generation === generation) {
          this.refreshButton.disabled = false;
          this.refreshButton.textContent = '刷新教程';
        }
      }
    }
  }

  function mount(host) {
    if (!host || controllers.has(host)) return controllers.get(host);
    let embedded = false;
    try { embedded = global.top !== global.self; } catch (_) { embedded = true; }
    if (embedded && host.dataset.tutorialEmbedded !== 'allow') {
      host.hidden = true;
      return null;
    }
    host.hidden = true;
    const controller = new Tutorial(host);
    controllers.set(host, controller);
    controller.setSection(host.dataset.tutorialSection);
    return controller;
  }

  function pauseAll() {
    controllers.forEach(controller => controller.pause());
    pauseChildren();
  }

  function setSection(section, host) {
    if (!Object.hasOwn(sections, section)) return;
    pauseAll();
    const hosts = host ? [host] : [...document.querySelectorAll('[data-tutorial-switcher]')];
    hosts.forEach(node => {
      node.dataset.tutorialSection = section;
      const controller = mount(node);
      controller?.setSection(section);
    });
  }

  function refreshAll() {
    return Promise.all([...controllers.values()].map(controller=>controller.refresh(true)));
  }

  global.WorkbenchTutorials = Object.freeze({mount, setSection, pauseAll, refreshAll, sections, safeVideoUrl});
  const boot = () => document.querySelectorAll('[data-tutorial-section]').forEach(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); else void refreshAll(); });
  global.addEventListener('focus',()=>{if(!document.hidden)void refreshAll();});
  global.setInterval(()=>{if(!document.hidden)void refreshAll();},30000);
  global.addEventListener('pagehide', pauseAll);
  global.addEventListener('message', event => {
    if (event.origin === global.location.origin && event.data?.type === 'workbench-tutorial-pause') {
      controllers.forEach(controller => controller.pause());
      pauseChildren();
    }
    if(event.origin===global.location.origin && event.data?.type==='workbench-tutorial-refresh')void refreshAll();
  });
})(window);

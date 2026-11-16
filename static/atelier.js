/* Move existing controls, not copies: preserve access checks and every action handler. */
(() => {
  const workspace = document.querySelector('.workspace');
  const tabs = document.querySelector('.work-mode-tabs');
  const content = document.querySelector('.content-column');
  const steps = document.querySelector('.step-rail');
  if (!workspace || !tabs || !content) return;
  document.body.classList.add('atelier-shell');
  const sidebar = document.createElement('aside');
  sidebar.className = 'atelier-sidebar';
  sidebar.setAttribute('aria-label', '全局创作导航');
  const label = document.createElement('div');
  label.className = 'atelier-sidebar-title';
  label.textContent = '创作空间';
  sidebar.append(label, tabs);
  workspace.prepend(sidebar);
  if (steps) content.prepend(steps);
  const source = document.getElementById('sourceCard');
  const proposal = document.getElementById('rewriteProposalSection');
  if (source && proposal) source.append(proposal);
  const config = document.getElementById('rewriteCard');
  if (config) {
    const advanced = document.createElement('details');
    advanced.className = 'atelier-more-settings';
    const summary = document.createElement('summary');
    summary.innerHTML = '<span>更多设置 · 平台、人物、场景与创作细节</span><span class="atelier-accordion-cue"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 7 6 6 6-6"/></svg><b>展开设置</b></span>';
    const advancedGrid = document.createElement('div');
    advancedGrid.className = 'form-grid two';
    advanced.append(summary, advancedGrid);
    advanced.addEventListener('toggle', () => { summary.querySelector('.atelier-accordion-cue b').textContent = advanced.open ? '收起设置' : '展开设置'; });
    const core = config.querySelector(':scope > .form-grid');
    const keep = new Set(['durationMinutesField', 'rewriteEpisodeCountField', 'customStoryStyleField']);
    if (core) [...core.children].forEach(field => {
      if (!keep.has(field.id) && !field.querySelector('#storyStyle')) advancedGrid.append(field);
    });
    const assetGrid = config.querySelector(':scope > .asset-grid');
    const assetHint = document.getElementById('assetCapHint');
    const assetDivider = assetHint?.previousElementSibling;
    if (assetDivider?.classList.contains('section-divider')) advanced.append(assetDivider);
    if (assetHint) advanced.append(assetHint);
    if (assetGrid) advanced.append(assetGrid);
    config.insertBefore(advanced, document.getElementById('rewriteConfigActions'));
    const productSwitch = config.querySelector('.product-switch');
    const productFields = document.getElementById('productFields');
    const commerceOptions = document.getElementById('commerceOptions');
    if (productSwitch && productFields && commerceOptions) {
      const commerce = document.createElement('section');
      commerce.className = 'atelier-commerce-section';
      const heading = document.createElement('div');
      heading.className = 'atelier-commerce-heading';
      const expand = document.createElement('button');
      expand.type = 'button';
      expand.className = 'secondary-btn atelier-commerce-expand';
      expand.setAttribute('aria-expanded', 'false');
      expand.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 7 6 6 6-6"/></svg><span>展开商品设置</span>';
      const body = document.createElement('div');
      body.className = 'atelier-commerce-content';
      body.hidden = true;
      config.insertBefore(commerce, productSwitch);
      heading.append(productSwitch, expand);
      body.append(productFields, commerceOptions);
      commerce.append(heading, body);
      expand.addEventListener('click', () => {
        body.hidden = !body.hidden;
        expand.setAttribute('aria-expanded', String(!body.hidden));
        expand.querySelector('span').textContent = body.hidden ? '展开商品设置' : '收起商品设置';
      });
    }
    const platform = document.getElementById('platform');
    if (platform) {
      const platformMarks = {'微信视频号':['▶','wechat'],'抖音':['♪','douyin'],'快手':['▣','kuaishou'],'小红书':['书','redbook'],'哔哩哔哩':['B','bilibili'],'微博':['◎','weibo'],'腾讯视频':['▶','tencent'],'爱奇艺':['i','iqiyi'],'优酷':['Y','youku'],'__custom__':['＋','custom']};
      const picker = document.createElement('div');
      picker.className = 'atelier-platform-picker';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'atelier-platform-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', '选择目标平台');
      const menu = document.createElement('div');
      menu.className = 'atelier-platform-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', '目标平台');
      menu.hidden = true;
      const mark = (value) => { const [glyph, tone] = platformMarks[value] || platformMarks.__custom__; const node = document.createElement('span'); node.className = `atelier-platform-mark ${tone}`; node.setAttribute('aria-hidden','true'); node.textContent = glyph; return node; };
      const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded','false'); };
      const sync = () => {
        const selected = platform.selectedOptions[0];
        trigger.replaceChildren(mark(platform.value),document.createTextNode(selected?.textContent || '选择平台'));
        const chevron = document.createElement('span'); chevron.className = 'atelier-platform-chevron'; chevron.setAttribute('aria-hidden','true'); chevron.textContent = '⌄'; trigger.append(chevron);
        menu.querySelectorAll('[role="option"]').forEach(node => node.setAttribute('aria-selected',String(node.dataset.value === platform.value)));
      };
      [...platform.options].forEach(option => {
        const item = document.createElement('button');
        item.type = 'button'; item.className = 'atelier-platform-option'; item.setAttribute('role','option'); item.dataset.value = option.value;
        item.append(mark(option.value),document.createTextNode(option.textContent));
        item.addEventListener('click', () => { platform.value = option.value; platform.dispatchEvent(new Event('change',{bubbles:true})); sync(); close(); trigger.focus(); });
        menu.append(item);
      });
      picker.append(trigger,menu); platform.insertAdjacentElement('afterend',picker); platform.classList.add('platform-native-select'); platform.tabIndex = -1;
      trigger.addEventListener('click', () => { menu.hidden = !menu.hidden; trigger.setAttribute('aria-expanded',String(!menu.hidden)); if (!menu.hidden) menu.querySelector('[aria-selected="true"]')?.focus(); });
      picker.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); trigger.focus(); } else if (!menu.hidden && ['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); const items=[...menu.querySelectorAll('[role="option"]')]; const current=items.indexOf(document.activeElement); items[(current+(event.key === 'ArrowDown' ? 1 : items.length-1))%items.length]?.focus(); } });
      document.addEventListener('pointerdown', event => { if (!picker.contains(event.target)) close(); });
      platform.addEventListener('change',sync);
      window.syncPlatformPicker = sync;
      sync();
    }
    // Keep the original controls and their listeners; expanded fields still feed the same request.
    config.addEventListener('invalid', event => {
      const details = event.target.closest('details');
      if (details) details.open = true;
    }, true);
    const action = document.querySelector('#generateCard .ai-action-cluster');
    if (action) {
      action.classList.add('atelier-generate-action');
      document.querySelector('#generateCard .generate-head')?.append(action);
      action.querySelector('.stage-model-control')?.classList.add('hidden');
    }
  }
  const resultArea = document.getElementById('resultArea');
  const resultActions = resultArea?.querySelector('.result-actions');
  if (resultArea && resultActions) {
    resultActions.classList.add('atelier-result-footer');
    resultArea.append(resultActions);
  }
  const hero = document.createElement('header');
  hero.className = 'atelier-page-heading';
  hero.innerHTML = '<span>STORY CREATION</span><h2>让熟悉的故事，长出新意。</h2><p>从原剧本出发，保留情绪张力，重建人物与故事。</p>';
  content.prepend(hero);
  const syncHeading = () => {
    const mode = tabs.querySelector('.work-mode-tab.active')?.dataset.workMode || 'rewrite';
    hero.hidden = !['rewrite','original'].includes(mode);
    hero.querySelector('h2').textContent = mode === 'original' ? '从一个想法，写出你的故事。' : '让熟悉的故事，长出新意。';
    hero.querySelector('p').textContent = mode === 'original' ? '设定主题、人物与商品，让灵感成为可制作的剧本。' : '从原剧本出发，保留情绪张力，重建人物与故事。';
  };
  new MutationObserver(syncHeading).observe(tabs, {subtree:true,attributes:true,attributeFilter:['class']});
  syncHeading();
  tabs.querySelectorAll('[data-work-mode="store"],[data-work-mode="advertising"]').forEach(button => {
    const badge = document.createElement('small');
    badge.className = 'atelier-beta-badge';
    badge.textContent = '内测';
    button.append(badge);
  });
  const betaNote = document.createElement('p');
  betaNote.className = 'atelier-beta-note';
  betaNote.textContent = '内测功能暂只支持内部测试使用，不对外开放。';
  sidebar.append(betaNote);
  const sidebarHandle = document.createElement('button');
  sidebarHandle.type = 'button';
  sidebarHandle.className = 'atelier-sidebar-handle';
  sidebarHandle.innerHTML = '<svg class="atelier-sidebar-handle-icon" viewBox="0 0 16 20" aria-hidden="true" focusable="false"><path d="m5 5 5 5-5 5"/></svg>';
  sidebarHandle.setAttribute('aria-label', '展开功能菜单，查看更多板块');
  sidebarHandle.title = '展开功能菜单 · 查看更多板块';
  sidebar.prepend(sidebarHandle);
  // Desktop navigation collapses to an icon rail and expands on hover/focus.
  // A short close delay prevents accidental collapse while moving between
  // buttons, while the content grid animates into the reclaimed space.
  const desktopSidebar = window.matchMedia('(min-width: 761px)');
  let collapseTimer = 0;
  const setSidebarExpanded = expanded => {
    window.clearTimeout(collapseTimer);
    sidebarHandle.setAttribute('aria-expanded', String(!desktopSidebar.matches || expanded));
    if (!desktopSidebar.matches) { document.body.classList.remove('atelier-sidebar-collapsed'); return; }
    document.body.classList.toggle('atelier-sidebar-collapsed', !expanded);
  };
  const scheduleSidebarCollapse = () => {
    window.clearTimeout(collapseTimer);
    collapseTimer = window.setTimeout(() => setSidebarExpanded(false), 1000);
  };
  sidebar.addEventListener('pointerenter', () => setSidebarExpanded(true));
  sidebarHandle.addEventListener('click', () => setSidebarExpanded(true));
  sidebar.addEventListener('pointerleave', scheduleSidebarCollapse);
  sidebar.addEventListener('focusin', () => setSidebarExpanded(true));
  sidebar.addEventListener('focusout', event => { if (!sidebar.contains(event.relatedTarget)) scheduleSidebarCollapse(); });
  desktopSidebar.addEventListener?.('change', event => setSidebarExpanded(!event.matches));
  setSidebarExpanded(false);
})();

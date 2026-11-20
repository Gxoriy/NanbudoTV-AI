/* Step 2 presentation only. Existing controls, card fields and handlers stay authoritative. */
(function (root) {
  'use strict';
  const kinds = [['people', '人物', 'visualPeople'], ['scenes', '场景', 'visualScenes'], ['props', '物品', 'visualProps']];
  const selectedKinds = new Map();
  let workspace, tabs, additions, projectId = '', activeKind = 'people';
  const cards = kind => [...document.querySelectorAll(`.visual-card[data-kind="${kind}"]`)];

  function setup() {
    if (workspace) return;
    const first = document.getElementById('visualPeople')?.closest('.visual-asset-section');
    if (!first) return;
    workspace = document.createElement('section');
    workspace.id = 'compactAssetWorkspace205';
    workspace.dataset.workflowPanel = '2';
    workspace.classList.toggle('workflow-stage-hidden', document.body.dataset.workflowStage !== '2');
    workspace.setAttribute('aria-label', '重要资产');
    first.before(workspace);
    const header = document.createElement('div'); header.className = 'compact-asset-header205';
    tabs = document.createElement('div'); tabs.id = 'compactAssetTabs205'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '资产类别');
    additions = document.createElement('div'); additions.className = 'compact-asset-add205';
    header.append(tabs, additions); workspace.append(header);
    for (const [kind, label, id] of kinds) {
      const section = document.getElementById(id).closest('.visual-asset-section');
      section.dataset.assetKind = kind; section.id = `compactAssetPanel205-${kind}`;
      section.setAttribute('role', 'tabpanel'); section.setAttribute('aria-labelledby', `compactAssetTab205-${kind}`);
      const tab = document.createElement('button'); tab.type = 'button'; tab.id = `compactAssetTab205-${kind}`;
      tab.dataset.assetKind = kind; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', section.id);
      tab.innerHTML = `${label} <span data-asset-count>0</span>`;
      tab.addEventListener('click', () => choose(kind)); tabs.append(tab);
      const add = section.querySelector('.add-custom-asset'); if (add) additions.append(add);
      workspace.append(section);
    }
    tabs.addEventListener('keydown', event => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']; if (!keys.includes(event.key)) return;
      event.preventDefault(); const index = kinds.findIndex(([kind]) => kind === activeKind);
      choose(kinds[event.key === 'Home' ? 0 : event.key === 'End' ? kinds.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + kinds.length) % kinds.length][0]);
      tabs.querySelector('[aria-selected="true"]')?.focus();
    });
  }

  function choose(kind) {
    activeKind = kind; selectedKinds.set(projectId, kind);
    for (const [value] of kinds) {
      const selected = kind === value, tab = tabs.querySelector(`[data-asset-kind="${value}"]`);
      tab.setAttribute('aria-selected', String(selected)); tab.setAttribute('aria-pressed', String(selected)); tab.tabIndex = selected ? 0 : -1;
      document.getElementById(`compactAssetPanel205-${value}`).classList.toggle('compact-asset-category-hidden205', !selected);
      additions.querySelector(`[data-kind="${value}"]`)?.classList.toggle('compact-asset-category-hidden205', !selected);
    }
    workspace.querySelectorAll('.compact-asset-more205[open]').forEach(menu => menu.open = false);
    syncSelection();
  }

  function bulk(section, kind) {
    const actions = section.querySelector('.visual-section-actions'); if (!actions) return;
    actions.classList.add('compact-asset-bulk205');
    const series=document.body.dataset.seriesWorkspace==='1',generateSelected=actions.querySelector('.batch-assets');
    if(generateSelected)generateSelected.textContent=series?'生成选中缺失图':'生成选中';
    section.querySelector('.visual-section-title > div:first-child')?.classList.add('compact-asset-legacy-title205');
    const all = actions.querySelector('.select-all-assets');
    if (all && !actions.querySelector('.compact-asset-select-all205')) {
      all.classList.add('compact-asset-legacy-select205');
      const label = document.createElement('label'); label.className = 'compact-asset-check205';
      const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'compact-asset-select-all205'; input.dataset.batchKind = kind;
      input.setAttribute('aria-label', `全选${kinds.find(row => row[0] === kind)[1]}`);
      input.addEventListener('change', () => {
        if (input.checked) all.click();
        else cards(kind).forEach(node => node.querySelector('.asset-select').checked = false);
        syncSelection(); root.CreditGate?.recalculate();
      });
      label.append(input, document.createTextNode('全选')); actions.prepend(label);
    }
    const invert = actions.querySelector('.invert-select-assets'); if (invert) invert.textContent = '反选';
    if (!actions.querySelector('.compact-asset-selected205')) {
      const count = document.createElement('span'); count.className = 'compact-asset-selected205'; count.setAttribute('aria-live', 'polite');
      (invert || all)?.after(count);
    }
    let more = actions.querySelector('.compact-asset-more205');
    if (!more) {
      more = document.createElement('details'); more.className = 'compact-asset-more205';
      const summary = document.createElement('summary'); summary.textContent = '更多'; summary.setAttribute('aria-label', '更多批量操作');
      const menu = document.createElement('div'); menu.className = 'compact-asset-menu205';
      more.append(summary, menu); actions.append(more);
    }
    const menu = more.querySelector('.compact-asset-menu205');
    for (const selector of ['.batch-assets-all', '.download-all-assets', '.delete-selected-assets']) {
      const button = actions.querySelector(selector); if (!button) continue;
      if (selector === '.batch-assets-all') button.textContent = series?'生成全部缺失图':'全部生成';
      if (button.parentElement !== menu) menu.append(button);
    }
  }

  function updateCard(node, presentation) {
    if (!node) return;
    const body = node.querySelector('.visual-card-body'), details = body?.querySelector(':scope > .asset-card-details'); if (!body) return;
    // History/recovery nodes are appended by the existing renderer after its
    // details pass. Keep them with the original editing tools on the first render too.
    if (details) for (const field of body.querySelectorAll(':scope > .asset-image-history')) details.append(field);
    // A stalled original request must have a visible way to recover it. Keep
    // that control beside the card actions, including cards already enhanced.
    for (const field of body.querySelectorAll('.asset-recovery-tools')) {
      const actions = body.querySelector(':scope > .visual-card-actions');
      if (field.parentElement !== body || field.nextElementSibling !== actions) body.insertBefore(field, actions);
    }
    let status = node.querySelector('.compact-asset-state205');
    if (!status) { status = document.createElement('div'); status.className = 'compact-asset-state205'; status.setAttribute('aria-live', 'polite'); }
    if (status.parentElement !== body) body.insertBefore(status, details || body.querySelector('.visual-card-actions'));
    const previewStatus = node.querySelector('.asset-preview-status'), phase = presentation?.phase || previewStatus?.dataset.state || 'idle';
    const title = presentation?.title || previewStatus?.querySelector('.asset-preview-title')?.textContent;
    const message = presentation?.message || previewStatus?.querySelector('.asset-preview-message')?.textContent || '';
    const text = phase === 'done' ? '参考图已就绪' : phase === 'idle' ? '待生成参考图' : title || '正在生成参考图';
    status.dataset.state = phase; status.textContent = text; status.title = [text, message].filter(Boolean).join(' · ');
    const name = body.querySelector(':scope > b'); if (name) name.title = name.textContent;
    for (const [selector, label] of [['.asset-edit-toggle', '编辑资产'], ['.delete-asset', '删除资产']]) {
      const button = node.querySelector(selector); if (button) { button.title = label; button.setAttribute('aria-label', `${label}：${name?.textContent || ''}`); }
    }
  }

  function syncSelection() {
    if (!workspace) return;
    for (const [kind] of kinds) {
      const nodes = cards(kind), chosen = nodes.filter(node => node.querySelector('.asset-select')?.checked);
      const section = document.getElementById(`compactAssetPanel205-${kind}`), input = section.querySelector('.compact-asset-select-all205');
      section.classList.toggle('compact-asset-no-selection205', chosen.length === 0);
      if (input) { input.checked = nodes.length > 0 && chosen.length === nodes.length; input.indeterminate = chosen.length > 0 && chosen.length < nodes.length; input.disabled = !nodes.length; }
      const count = section.querySelector('.compact-asset-selected205'); if (count) count.textContent = `已选 ${chosen.length} 项`;
      nodes.forEach(node => node.classList.toggle('compact-asset-selected-card205', Boolean(node.querySelector('.asset-select')?.checked)));
    }
  }

  function enhance(project) {
    setup(); if (!workspace) return;
    projectId = project?.id || ''; activeKind = selectedKinds.get(projectId) || 'people';
    for (const [kind] of kinds) {
      const section = document.getElementById(`compactAssetPanel205-${kind}`); bulk(section, kind);
      tabs.querySelector(`[data-asset-kind="${kind}"] [data-asset-count]`).textContent = String(cards(kind).length);
      cards(kind).forEach(node => updateCard(node));
    }
    choose(activeKind);
  }

  document.addEventListener('change', event => { if (event.target.matches('.asset-select')) syncSelection(); });
  document.addEventListener('click', event => {
    if (event.target.closest('.compact-asset-menu205 button')) event.target.closest('.compact-asset-more205').open = false;
    document.querySelectorAll('.compact-asset-more205[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
    if (event.target.closest('.invert-select-assets,.select-all-assets,.batch-assets-all')) queueMicrotask(syncSelection);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.compact-asset-more205[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); });
  });
  root.CompactAssets205 = Object.freeze({enhance, updateCard, syncSelection});
})(window);

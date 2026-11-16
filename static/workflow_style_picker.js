/* RH catalog picker. Uses catalog metadata only; does not generate or submit media. */
(() => {
  'use strict';
  const states = new WeakMap();
  const ownDocument = document;
  let active = null, nextId = 0;

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function stylesheet(doc) {
    if (doc.querySelector('link[data-workflow-style-picker]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('/static/workflow_style_picker.css', window.location.href).href;
    link.dataset.workflowStylePicker = 'true';
    doc.head.append(link);
  }

  function modalDocument() {
    try {
      // A top-layer dialog in the host document remains centered when the iframe scrolls.
      if (window.top.location.origin === window.location.origin) return window.top.document;
    } catch (_) { /* A separately hosted preview can only use its own document. */ }
    return ownDocument;
  }

  function imageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      if (!host.includes('.') || host.includes(':') || /(^|\.)(localhost|local|internal|lan)$/.test(host)) return '';
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        const n = host.split('.').map(Number);
        if (n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 ||
          (n[0] === 169 && n[1] === 254) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
          (n[0] === 192 && (n[1] === 168 || n[1] === 0)) ||
          (n[0] === 100 && n[1] >= 64 && n[1] <= 127) || (n[0] === 198 && [18, 19].includes(n[1]))) return '';
      }
      return url.href;
    } catch (_) { return ''; }
  }

  function rowsFor(state) {
    const rows = [{ value: '', name: '沿用 RH 默认', description: '', image: '', isDefault: true }];
    const seen = new Set(['']);
    for (const raw of state.rows) {
      if (!raw || typeof raw !== 'object') continue;
      const id = state.kind === 'director-styles' ? raw.key : raw.stylePresetId;
      if (typeof id !== 'string' || !id || seen.has(id)) continue;
      seen.add(id);
      rows.push({value: id, name: typeof raw.name === 'string' && raw.name ? raw.name : id,
        description: state.kind === 'director-styles' && typeof raw.description === 'string' ? raw.description : '',
        image: imageUrl(state.kind === 'director-styles' ? raw.coverUrl : raw.previewUrl)});
    }
    // Preserve an existing project selection even when a newer RH catalog omits it.
    const current = state.select.value;
    if (current && !seen.has(current)) rows.push({value: current,
      name: state.select.selectedOptions[0]?.textContent || current, description: '当前已选风格', image: ''});
    return rows;
  }

  function thumbnail(doc, row, compact) {
    const frame = element(doc, 'span', 'wf-style-thumbnail' + (compact ? ' wf-style-thumbnail--small' : ''));
    const fallback = element(doc, 'span', 'wf-style-placeholder', row.isDefault ? 'RH 默认' : '暂无预览');
    frame.append(fallback);
    if (row.image) {
      const img = element(doc, 'img');
      img.alt = row.name;
      img.loading = compact ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => { fallback.hidden = true; });
      img.addEventListener('error', () => { img.remove(); fallback.hidden = false; }, {once: true});
      img.src = row.image;
      frame.append(img);
    }
    return frame;
  }

  function refresh(select) {
    const state = states.get(select);
    if (!state) return;
    if (active?.state === state && active.initialValue !== select.value) active.close(false);
    const row = rowsFor(state).find(item => item.value === select.value) || rowsFor(state)[0];
    const label = element(ownDocument, 'span', 'wf-style-trigger-label');
    label.append(element(ownDocument, 'strong', '', row.name), element(ownDocument, 'small', '', '点击选择' + state.title));
    state.trigger.replaceChildren(thumbnail(ownDocument, row, true), label, element(ownDocument, 'span', 'wf-style-arrow', '›'));
    state.trigger.disabled = select.disabled;
    state.trigger.setAttribute('aria-label', state.title + '：' + row.name + '，点击选择');
  }

  function show(state) {
    if (state.select.disabled || active) return;
    const doc = modalDocument();
    // Do not stack over another workflow picker already hosted in this document.
    if (doc.querySelector('dialog.wf-style-dialog[open]')) return;
    stylesheet(doc);
    const dialog = element(doc, 'dialog', 'wf-style-dialog');
    const titleId = 'wf-style-title-' + (++nextId);
    dialog.setAttribute('aria-labelledby', titleId);
    const header = element(doc, 'header', 'wf-style-header');
    const heading = element(doc, 'h2', '', '选择' + state.title); heading.id = titleId;
    const closeButton = element(doc, 'button', 'wf-style-close', '×');
    closeButton.type = 'button'; closeButton.setAttribute('aria-label', '关闭风格选择');
    header.append(heading, closeButton);
    const toolbar = element(doc, 'div', 'wf-style-toolbar');
    const search = element(doc, 'input', 'wf-style-search');
    search.type = 'search'; search.placeholder = '搜索风格'; search.setAttribute('aria-label', '搜索' + state.title);
    const count = element(doc, 'span', 'wf-style-count'); count.setAttribute('aria-live', 'polite');
    toolbar.append(search, count);
    const grid = element(doc, 'div', 'wf-style-grid');
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', state.title + '选项');
    const footer = element(doc, 'footer', 'wf-style-footer');
    const selectedLabel = element(doc, 'span', 'wf-style-selected'); selectedLabel.setAttribute('aria-live', 'polite');
    const buttons = element(doc, 'div', 'wf-style-buttons');
    const cancel = element(doc, 'button', 'wf-style-cancel', '取消'); cancel.type = 'button';
    const confirm = element(doc, 'button', 'wf-style-confirm', '确认'); confirm.type = 'button';
    buttons.append(cancel, confirm); footer.append(selectedLabel, buttons);
    dialog.append(header, toolbar, grid, footer);
    let draft = state.select.value, done = false;
    const initialValue = state.select.value, rows = rowsFor(state), previousFocus = doc.activeElement;

    function finish(commit) {
      if (done) return;
      done = true;
      active = null;
      if (dialog.open) dialog.close();
      dialog.remove();
      state.trigger.setAttribute('aria-expanded', 'false');
      if (commit && !state.select.disabled && state.select.value === initialValue && rows.some(row => row.value === draft)) {
        if (![...state.select.options].some(option => option.value === draft)) {
          const option = element(ownDocument, 'option', '', rows.find(row => row.value === draft).name);
          option.value = draft; state.select.append(option);
        }
        state.select.value = draft;
        refresh(state.select);
        if (draft !== initialValue) state.select.dispatchEvent(new Event('change', {bubbles: true}));
      }
      // A host-document dialog has no automatic focus target in the child iframe.
      if (state.trigger.isConnected && !state.trigger.disabled) state.trigger.focus({preventScroll: true});
      else if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    }

    function selected() {
      selectedLabel.textContent = '已选：' + (rows.find(row => row.value === draft)?.name || '沿用 RH 默认');
      for (const button of grid.querySelectorAll('button[data-style-value]')) {
        const isSelected = button.dataset.styleValue === draft;
        button.setAttribute('aria-pressed', String(isSelected));
        button.classList.toggle('is-selected', isSelected);
      }
    }

    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = rows.filter(row => (row.name + '\n' + row.description).toLocaleLowerCase().includes(query));
      grid.replaceChildren();
      count.textContent = query ? '找到 ' + filtered.length + ' 项' : (rows.length - 1) + ' 种风格';
      for (const row of filtered) {
        const button = element(doc, 'button', 'wf-style-tile');
        button.type = 'button'; button.dataset.styleValue = row.value;
        button.setAttribute('aria-label', row.name);
        button.append(thumbnail(doc, row, false), element(doc, 'span', 'wf-style-name', row.name));
        if (row.description) {
          button.title = row.description;
          button.append(element(doc, 'span', 'wf-style-description', row.description));
        }
        button.addEventListener('click', () => { draft = row.value; selected(); });
        grid.append(button);
      }
      if (!filtered.length) grid.append(element(doc, 'p', 'wf-style-empty', '没有找到匹配风格，试试其他关键词。'));
      selected();
    }

    active = {state, initialValue, close: finish};
    closeButton.addEventListener('click', () => finish(false));
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.addEventListener('close', () => finish(false));
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) finish(false);
    });
    search.addEventListener('input', render);
    render(); doc.body.append(dialog);
    state.trigger.setAttribute('aria-expanded', 'true');
    try { dialog.showModal(); search.focus(); }
    catch (_) { finish(false); }
  }

  function attach(select, options = {}) {
    if (!select || select.tagName !== 'SELECT') return;
    if (states.has(select)) { refresh(select); return; }
    const state = {select, kind: options.kind === 'director-styles' ? 'director-styles' : 'styles',
      title: options.title || (options.kind === 'director-styles' ? '导演风格' : '画面风格'), rows: []};
    stylesheet(ownDocument);
    stylesheet(modalDocument());
    const trigger = element(ownDocument, 'button', 'wf-style-trigger');
    trigger.type = 'button'; trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
    state.trigger = trigger; states.set(select, state);
    select.hidden = true; select.insertAdjacentElement('afterend', trigger);
    trigger.addEventListener('click', () => show(state));
    select.addEventListener('change', () => refresh(select));
    new MutationObserver(() => refresh(select)).observe(select, {attributes: true, attributeFilter: ['disabled']});
    refresh(select);
  }

  function update(select, rawCatalogRows) {
    const state = states.get(select);
    if (!state) return;
    if (active?.state === state) active.close(false);
    state.rows = Array.isArray(rawCatalogRows) ? rawCatalogRows : [];
    refresh(select);
  }

  window.addEventListener('pagehide', () => { if (active) active.close(false); });
  window.WorkflowStylePicker = Object.freeze({attach, update, refresh});
})();

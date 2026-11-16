/* Named assets saved to the current canvas project. */
(() => {
  'use strict';
  const kinds = {person: '人物', scene: '场景', prop: '物品'};
  const endpoint = action => '/api/canvas/assets/' + action;
  const maximumBytes = 12 * 1024 * 1024;
  const maximumFiles = 100;
  const imageExtension = /\.(?:jpe?g|png|webp)$/i;

  function prepareSelection(files) {
    const names = new Set();
    return files.map(file => {
      const stem = Array.from(file.name.replace(imageExtension, '').replace(/[\x00-\x1f]/g, '').trim() || '素材');
      let name = stem.slice(0, 80).join('');
      for (let number = 2; names.has(name); number++) {
        const suffix = `（${number}）`;
        name = stem.slice(0, 80 - suffix.length).join('') + suffix;
      }
      names.add(name);
      const error = !imageExtension.test(file.name) ? '请选择 JPG、PNG 或 WebP 图片。' :
        !file.size ? '图片不能为空。' : file.size > maximumBytes ? '单张资产图最多 12 MB。' : '';
      return {file, name, id: crypto.randomUUID().replaceAll('-', ''), error, invalid: Boolean(error), saved: false};
    });
  }

  function create({state, request, insert, sync, confirm, escape}) {
    let panel;

    async function open(trigger) {
      const context = state();
      if (!context.id || context.readonly) throw new Error('请先打开一个可编辑的画布项目。');
      if (panel?.open) return;
      const dialog = document.createElement('dialog');
      panel = dialog;
      dialog.className = 'canvas-asset-library';
      dialog.setAttribute('aria-labelledby', 'canvasAssetsTitle');
      dialog.innerHTML = `
        <header><div><small>PROJECT ASSETS</small><h2 id="canvasAssetsTitle">项目资产</h2>
        <p>${escape(context.name)} · 人物、场景与物品</p></div>
        <button type="button" data-close aria-label="关闭项目资产">关闭</button></header>
        <div class="canvas-asset-body">
          <nav aria-label="资产分类">
            ${Object.entries(kinds).map(([key, label]) => `<button type="button" data-kind="${key}">${label}</button>`).join('')}
          </nav>
          <form data-upload class="canvas-asset-form">
            <label>资产名称（选填）<input name="name" maxlength="80" placeholder="例如：小林店主"></label>
            <label>参考图（可多选）<input name="image" type="file" accept=".jpg,.jpeg,.png,.webp" multiple
              aria-describedby="canvasAssetSelection"></label>
            <button type="submit" class="primary">上传资产</button>
            <p id="canvasAssetSelection" class="canvas-asset-hint" data-selection hidden></p>
          </form>
          <p class="canvas-asset-hint">JPG / PNG / WebP，单张最多 12 MB。可加入画布，也可在提示词中输入 @ 引用。</p>
          <p data-status role="status" aria-live="polite">正在读取本项目资产…</p>
          <ul data-upload-errors class="canvas-asset-upload-errors" hidden></ul>
          <form data-rename class="canvas-asset-form" hidden>
            <label>资产名称<input name="name" maxlength="80" required></label>
            <label>分类<select name="kind">${Object.entries(kinds).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
            <button type="submit" class="primary">保存</button><button type="button" data-cancel-rename>取消</button>
          </form>
          <div class="canvas-asset-grid" data-assets></div>
        </div>`;
      const sameProject = () => {
        const current = state();
        return current.id === context.id && current.version === context.version && !current.readonly;
      };
      const active = () => dialog.open && sameProject();
      const status = dialog.querySelector('[data-status]');
      const grid = dialog.querySelector('[data-assets]');
      const uploadForm = dialog.querySelector('[data-upload]');
      const renameForm = dialog.querySelector('[data-rename]');
      const uploadName = uploadForm.elements.namedItem('name');
      const uploadImage = uploadForm.elements.namedItem('image');
      const uploadButton = uploadForm.querySelector('button[type="submit"]');
      const selectionHint = uploadForm.querySelector('[data-selection]');
      const uploadErrors = dialog.querySelector('[data-upload-errors]');
      const renameName = renameForm.elements.namedItem('name');
      const renameKind = renameForm.elements.namedItem('kind');
      let kind = 'person';
      let assets = [];
      let editing = '';
      let busy = false;
      let selection = [];
      let batchKind = '';

      function say(text, error = false) {
        status.textContent = text;
        status.dataset.error = String(error);
      }
      function buttons() {
        for (const control of dialog.querySelectorAll('button:not([data-close]), input, select')) {
          control.disabled = busy;
        }
        uploadName.disabled = busy || selection.length > 1 || Boolean(batchKind);
        uploadButton.disabled = busy || !selection.some(item => !item.saved && !item.invalid);
      }
      function renderSelection() {
        const retry = selection.filter(item => !item.saved && !item.invalid).length;
        uploadButton.textContent = batchKind && retry ? '重试失败项' : '上传资产';
        selectionHint.hidden = !selection.length;
        if (batchKind) {
          selectionHint.textContent = retry ? `${retry} 张可重试，分类为${kinds[batchKind]}。` : '请重新选择未通过检查的图片。';
        } else {
          selectionHint.textContent = selection.length > 1 ? `已选择 ${selection.length} 张，按各自文件名命名。` :
            selection[0]?.file.name || '';
        }
        const errors = selection.filter(item => item.error).map(item => {
          const row = document.createElement('li');
          row.textContent = item.file.name + '：' + item.error;
          return row;
        });
        uploadErrors.replaceChildren(...errors);
        uploadErrors.hidden = !errors.length;
        buttons();
      }
      function render() {
        for (const button of dialog.querySelectorAll('[data-kind]')) {
          const selected = button.dataset.kind === kind;
          button.setAttribute('aria-pressed', String(selected));
          button.textContent = kinds[button.dataset.kind] + ' ' + assets.filter(asset => asset.kind === button.dataset.kind).length;
        }
        const selected = assets.filter(asset => asset.kind === kind);
        grid.innerHTML = selected.map(asset => `<article data-asset="${escape(asset.id)}">
          <img src="${escape(asset.thumbnailUrl || asset.url)}" alt="" loading="lazy" decoding="async">
          <b title="${escape(asset.name)}">${escape(asset.name)}</b>
          <div><button type="button" data-insert>加入画布</button><button type="button" data-edit>编辑</button>
          <button type="button" data-remove>移出</button></div></article>`).join('') ||
          `<p class="canvas-asset-empty">还没有${kinds[kind]}资产。选择参考图开始上传。</p>`;
        buttons();
      }
      async function run(work) {
        if (!active() || busy) return;
        busy = true;
        buttons();
        try { await work(); }
        catch (error) { if (active()) say(error.message || '操作未完成，请重试。', true); }
        finally { busy = false; if (active()) buttons(); }
      }
      function adopt(result) {
        if (sameProject()) sync(context.id, result);
        if (!active()) return false;
        assets = result.assets;
        render();
        return true;
      }
      function cancelEdit() {
        editing = '';
        renameForm.hidden = true;
      }
      uploadImage.onchange = () => {
        const files = uploadImage.files;
        if (batchKind || files.length > 1) uploadName.value = '';
        batchKind = '';
        if (files.length > maximumFiles) {
          selection = [];
          uploadImage.value = '';
          say(`一次最多选择 ${maximumFiles} 张图片。`, true);
        } else {
          selection = prepareSelection(Array.from(files));
          const invalid = selection.filter(item => item.invalid).length;
          say(invalid ? `${invalid} 张图片未通过检查，请查看下方文件。` : '', Boolean(invalid));
        }
        renderSelection();
      };
      uploadForm.onsubmit = event => {
        event.preventDefault();
        const pending = selection.filter(item => !item.saved && !item.invalid);
        if (!pending.length) return;
        void run(async () => {
          if (!batchKind && selection.length === 1) pending[0].name = uploadName.value.trim() || pending[0].name;
          batchKind ||= kind;
          kind = batchKind;
          render();
          for (const [index, item] of pending.entries()) {
            if (!active()) return;
            say(`正在保存第 ${index + 1} / ${pending.length} 张图片…`);
            let data;
            try {
              const response = await fetch(endpoint('upload'), {
                method: 'POST', body: item.file, signal: AbortSignal.timeout(30000),
                headers: {'Content-Type': 'application/octet-stream', 'X-Canvas-Id': context.id,
                  'X-Asset-Kind': batchKind, 'X-Filename': encodeURIComponent(item.file.name),
                  'X-Asset-Name': encodeURIComponent(item.name), 'X-Asset-Upload-Id': item.id}
              });
              data = await response.json().catch(() => ({}));
              if (!response.ok || !data.ok || !Array.isArray(data.assets)) throw new Error(data.error || '资产上传失败。');
            } catch (error) {
              item.error = error instanceof TypeError || error.name === 'TimeoutError' ?
                '连接中断或超时，请重试。' : error.message || '资产上传失败。';
              continue;
            }
            item.saved = true;
            item.error = '';
            if (!adopt(data)) return;
          }
          if (!active()) return;
          const saved = selection.filter(item => item.saved).length;
          const failed = selection.length - saved;
          if (!failed) {
            uploadForm.reset();
            selection = [];
            batchKind = '';
          }
          renderSelection();
          say(failed ? `已确认保存 ${saved} 张，${failed} 张需处理。` : `已保存 ${saved} 张资产图。`, Boolean(failed));
        });
      };
      renameForm.onsubmit = event => {
        event.preventDefault();
        const name = renameName.value.trim(), nextKind = renameKind.value;
        if (!name) return say('请填写资产名称。', true);
        void run(async () => {
          const result = await request(endpoint('rename'), {canvasId: context.id, assetId: editing, name, kind: nextKind});
          if (!active()) return;
          kind = nextKind;
          cancelEdit();
          if (adopt(result)) say('资产名称和分类已保存。');
        });
      };
      dialog.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.hasAttribute('data-close')) return dialog.close();
        if (!active() || busy) return;
        if (button.dataset.kind) {
          kind = button.dataset.kind;
          cancelEdit();
          render();
          return;
        }
        if (button.hasAttribute('data-cancel-rename')) return cancelEdit();
        const asset = assets.find(item => item.id === button.closest('[data-asset]')?.dataset.asset);
        if (!asset) return;
        if (button.hasAttribute('data-edit')) {
          editing = asset.id;
          renameName.value = asset.name;
          renameKind.value = asset.kind;
          renameForm.hidden = false;
          renameName.focus();
        }
        if (button.hasAttribute('data-remove')) void run(async () => {
          if (!await confirm('从本项目资产列表移出“' + asset.name + '”？已加入的节点和引用会保留。', {title: '移出项目资产'}) || !active()) return;
          if (adopt(await request(endpoint('remove'), {canvasId: context.id, assetId: asset.id}))) {
            if (editing === asset.id) cancelEdit();
            say('资产已移出，已有引用仍可使用。');
          }
        });
        if (button.hasAttribute('data-insert')) void run(async () => {
          await insert(context, asset);
          if (active()) dialog.close();
        });
      });
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (panel === dialog) panel = null;
        trigger?.focus({preventScroll: true});
      }, {once: true});
      document.body.append(dialog);
      dialog.showModal();
      render();
      await run(async () => {
        if (adopt(await request(endpoint('list'), {canvasId: context.id}))) say('');
      });
    }

    return {open, close: () => panel?.close()};
  }

  window.CanvasProjectAssets = {create, kinds};
})();

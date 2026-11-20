/* The series directory owns navigation and free metadata operations. */
(function () {
  'use strict';
  const sameId = value => /^[a-f0-9]{32}$/.test(String(value || ''));

  function create({root, dialog, request, openWorkspace, showDialog, closeDialog, editSettings,
    back, confirm, notify, changed}) {
    const part = name => root.querySelector('[data-series-role="' + name + '"]');
    const form = dialog.querySelector('form');
    const title = form.elements.title;
    const description = form.elements.description;
    const formError = dialog.querySelector('[data-series-form-error]');
    const save = form.querySelector('button[type="submit"]');
    let projectId = '', snapshot, generation = 0, pending = null, editor = null;

    function button(label, action, appearance = 'ghost-btn') {
      const result = document.createElement('button');
      result.type = 'button';
      result.className = appearance;
      result.textContent = label;
      result.dataset.seriesAction = action;
      return result;
    }

    function notice(message = '', error = false) {
      const status = part('status');
      status.textContent = message;
      status.hidden = !message;
      status.classList.toggle('series-error', error);
    }

    function lock() {
      for (const control of root.querySelectorAll('button[data-series-action]')) {
        const action = control.dataset.seriesAction;
        control.disabled = Boolean(pending) && action !== 'back' || !snapshot && !['reload','back'].includes(action);
      }
      save.disabled = Boolean(pending);
      title.disabled = description.disabled = Boolean(pending);
      root.setAttribute('aria-busy', String(Boolean(pending)));
      for (const control of form.querySelectorAll('[data-series-form-cancel]')) control.disabled = Boolean(pending);
    }

    function asEpisode(row, removed) {
      const item = document.createElement('article');
      item.className = 'series-episode282';
      item.dataset.seriesEpisode = row.id;
      const info = document.createElement('div');
      const eyebrow = document.createElement('small');
      eyebrow.textContent = '第 ' + row.number + ' 集';
      const label = document.createElement('strong');
      label.textContent = row.title || eyebrow.textContent;
      const summary = document.createElement('p');
      const state = row.videoCount ? '已有视频' : row.cardCount ? '已有分镜' : row.hasSource ? '已保存原稿' : '待导入原稿';
      summary.textContent = state + ' · ' + (row.cardCount || 0) + ' 张视频卡 · ' + (row.videoCount || 0) + ' 个视频';
      info.append(eyebrow, label);
      if (row.description) {
        const detail = document.createElement('p');
        detail.textContent = row.description;
        info.append(detail);
      }
      info.append(summary);
      const actions = document.createElement('div');
      actions.className = 'visual-project-actions';
      if (removed) actions.append(button('恢复', 'restore', 'secondary-btn'));
      else actions.append(button('继续制作', 'open', 'primary-btn'), button('编辑', 'edit'),
        button('移除', 'delete', 'danger-outline-btn'));
      item.append(info, actions);
      return item;
    }

    function render() {
      const series = snapshot?.project;
      part('name').textContent = series?.projectName || '剧集管理';
      part('description').textContent = series?.projectDescription || '';
      part('description').hidden = !series?.projectDescription;
      part('stats').textContent = series ? [
        (series.episodeTotal ?? snapshot.episodes.length) + ' 集',
        (series.peopleCount || 0) + ' 个人物',
        (series.sceneCount || 0) + ' 个场景',
        (series.propCount || 0) + ' 个物品'
      ].join(' · ') : '';
      const list = part('list');
      list.replaceChildren(...(snapshot?.episodes || []).map(row => asEpisode(row, false)));
      if (snapshot && !snapshot.episodes.length) {
        const empty = document.createElement('p');
        empty.className = 'visual-empty';
        empty.textContent = '还没有剧集，点击“添加剧集”开始制作。';
        list.append(empty);
      }
      const deleted = snapshot?.deletedEpisodes || [];
      part('removed').hidden = !deleted.length;
      part('removed-list').replaceChildren(...deleted.map(row => asEpisode(row, true)));
      lock();
    }

    function accept(data) {
      if (data?.project?.id !== projectId || data.project.seriesManaged !== true
        || !Array.isArray(data.episodes) || !data.episodes.every(row => sameId(row.id))
        || !Array.isArray(data.deletedEpisodes) || !data.deletedEpisodes.every(row => sameId(row.id))) {
        throw Error('返回的剧集列表与当前项目不一致，未更新界面。');
      }
      snapshot = data;
      render();
    }

    async function run(work, options = {}) {
      if (pending) return;
      const owner = generation;
      const current = () => generation === owner;
      const token = {};
      pending = token;
      lock();
      if (options.message) notice(options.message);
      try { return await work(current); }
      catch (error) {
        if (!current()) return;
        const message = error.message || String(error);
        if (options.form) formError.textContent = message;
        else notice(message, true);
      } finally {
        if (pending === token) {
          pending = null;
          lock();
        }
      }
    }

    function read() {
      const id = projectId;
      return run(async current => {
        const data = await request('/api/visual/series?projectId=' + encodeURIComponent(id));
        if (current()) { accept(data);notice(); }
      }, {message:'正在读取剧集…'});
    }

    function show(project, existing) {
      const id = project?.id;
      if (!sameId(id)) throw Error('项目编号无效。');
      if (projectId !== id) {
        clear();
        projectId = id;
      }
      root.hidden = false;
      if (existing) {
        accept(existing);
        notice();
        return;
      }
      if (!snapshot) render();
      return read();
    }

    function clear() {
      generation++;
      pending = null;
      projectId = '';
      snapshot = null;
      editor = null;
      root.hidden = true;
      closeDialog();
      notice();
    }

    function showEditor(row = null) {
      editor = {row, createRequestId:row ? null : globalThis.crypto.randomUUID().replaceAll('-', '')};
      title.value = row?.title ?? '';
      description.value = row?.description ?? '';
      title.placeholder = row?.title || '请输入剧集名称';
      formError.textContent = '';
      dialog.querySelector('h2').textContent = row ? '编辑剧集' : '添加剧集';
      save.textContent = row ? '保存修改' : '添加';
      showDialog();
      title.focus();
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!editor || pending) return;
      const name = title.value.trim();
      const detail = description.value.trim();
      if (!name) {
        formError.textContent = '请输入剧集名称。';
        title.focus();
        return;
      }
      const owner = projectId, row = editor.row;
      const input = {projectId:owner, title:name, description:detail,
        ...(row ? {episodeId:row.id} : {createRequestId:editor.createRequestId})};
      save.textContent = row ? '正在保存…' : '正在添加…';
      formError.textContent = '';
      run(async current => {
        try {
          const data = await request('/api/visual/series/episode/' + (row ? 'update' : 'create'), input);
          if (!current()) return;
          accept(data);
          editor = null;
          closeDialog();
          notice(row ? '剧集资料已保存。' : '已添加剧集。');
          changed?.();
          const created = root.querySelector('[data-series-episode="' + (data.episodeId || row?.id || '') + '"]');
          created?.querySelector('[data-series-action="open"]')?.focus({preventScroll:true});
        } finally {
          if (current() && editor) save.textContent = row ? '保存修改' : '添加';
        }
      }, {form:true});
    });

    for (const control of dialog.querySelectorAll('[data-series-form-cancel]')) {
      control.addEventListener('click', () => { if (!pending) { editor = null;closeDialog(); } });
    }
    root.addEventListener('click', event => {
      const control = event.target.closest('button[data-series-action]');
      if (!control || control.disabled) return;
      const action = control.dataset.seriesAction;
      const id = control.closest('[data-series-episode]')?.dataset.seriesEpisode;
      const row = (action === 'restore' ? snapshot?.deletedEpisodes : snapshot?.episodes)?.find(item => item.id === id);
      if (action === 'back') return back();
      if (pending) return;
      if (action === 'reload') return read();
      if (!snapshot) return;
      if (action === 'add') return showEditor();
      if (action === 'edit' && row) return showEditor(row);
      if (action === 'settings') return editSettings(snapshot.project);
      if (action === 'open' && row || action === 'assets') {
        const target = row || snapshot.episodes[0];
        if (!target) return notice('请先添加一集，再打开项目共享资产。');
        return run(async current => {
          const opened = await openWorkspace(snapshot.project, target, action === 'assets', current);
          if (current()) notice(opened === false ? '请返回当前工作流保存未完成的修改，再切换剧集。' : '',opened === false);
        }, {message:action === 'assets' ? '正在读取共享资产…' : '正在打开本集…'});
      }
      if (!row || !['delete','restore'].includes(action)) return;
      const owner = projectId;
      return run(async current => {
        if (action === 'delete' && !await confirm('移除「' + row.title + '」？本集原稿、视频和任务记录保留，可从“已移除剧集”恢复。')) return;
        if (!current()) return;
        const data = await request('/api/visual/series/episode/' + action, {projectId:owner,episodeId:row.id});
        if (current()) {
          accept(data);
          notify(action === 'delete' ? '该剧集已移除，可随时恢复。' : '该剧集已恢复。');
          changed?.();
        }
      });
    });
    return {show,clear,read,accept,projectId:()=>projectId,isVisible:()=>!root.hidden};
  }

  function createAssetSelection({root,save,resolve}) {
    const kinds = [['people','人物'],['scenes','场景'],['props','物品']];
    let identity = '', project, pending = false;
    const escaped = value => String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[char]);
    function paint(value) {
      project = value;
      root.hidden = !value?.seriesProjectId;
      if (root.hidden) { identity = ''; return; }
      const assets = kinds.flatMap(([kind]) => (value.assets?.[kind] || []).map(row => ({
        id:kind + ':' + row.id,kind,name:row.name,description:row.description,group:row.characterGroupLabel
      })));
      const saved = value.episodeAssetIds282 || [];
      const reviews = value.episodeAssetPending282 || [];
      const next = JSON.stringify([value.id,value.episodeAssetPendingSourceHash282,assets,saved,reviews]);
      if (identity === next) return;
      const sameEpisode = root.dataset.seriesAssetEpisode === value.id;
      const expanded = sameEpisode && root.querySelector('details')?.open;
      identity = next;
      root.dataset.seriesAssetEpisode = value.id;
      const byId = new Map(assets.map(row => [row.id,row]));
      const fieldsets = kinds.map(([kind,label]) => {
        const rows = assets.filter(row => row.kind === kind);
        return rows.length ? '<fieldset><legend>'+label+'</legend>'+rows.map(row => (
          '<label title="'+escaped(row.description)+'"><input type="checkbox" data-series-asset="'+escaped(row.id)+'" '+
          (saved.includes(row.id) ? 'checked' : '')+'>'+escaped(row.name)+(row.group ? ' · '+escaped(row.group) : '')+'</label>'
        )).join('')+'</fieldset>' : '';
      }).join('');
      const reviewRows = reviews.map(row => {
        const options = (row.candidateAssetIds || []).flatMap(id => {
          const asset = byId.get(id);
          if (!asset) return [];
          const label = [asset.name,asset.group,String(asset.description||'').slice(0,45)].filter(Boolean).join(' · ');
          return '<option value="'+escaped(id)+'">'+escaped(label)+'</option>';
        }).join('');
        return '<div class="series-asset-review-row282"><label>'+escaped(row.name)+
          '<select data-series-asset-review="'+escaped(row.pendingId)+'"><option value="">请选择已有资产或确认为新资产</option>'+
          options+'<option value="new">确认为新资产</option></select></label>'+
          (row.description ? '<p>'+escaped(row.description)+'</p>' : '')+'</div>';
      }).join('');
      root.innerHTML = '<h3>项目共享资产</h3><p class="series-asset-empty282">为本集选择已有资产，无需重新提取。批量生成仅补齐缺失图片；已有图片可直接复用。</p>'+
        (reviewRows ? '<div class="series-asset-review282"><strong>确认同名资产 · '+reviews.length+' 项待确认</strong>'+reviewRows+
          '<div class="series-asset-buttons282"><button type="button" class="secondary-btn" data-series-asset-action="resolve">保存确认</button></div></div>' : '')+
        '<details'+(expanded?' open':'')+'><summary>使用项目已有资产 · 已选 '+saved.length+' 项</summary>'+
        (fieldsets ? '<div class="series-asset-options282">'+fieldsets+'</div><div class="series-asset-buttons282"><button type="button" class="secondary-btn" data-series-asset-action="save">保存本集选择</button></div>' :
          '<p class="series-asset-empty282">还没有共享资产。可以从本集剧本提取，也可以在下方添加。</p>')+
        '</details><p data-series-asset-feedback role="status" hidden></p>';
      lock();
    }
    function lock() {
      for (const field of root.querySelectorAll('input,select,button')) field.disabled = pending;
      root.setAttribute('aria-busy',String(pending));
    }
    function feedback(message,error=false) {
      const status = root.querySelector('[data-series-asset-feedback]');
      if (!status) return;
      status.textContent = message;
      status.hidden = !message;
      status.classList.toggle('series-error',error);
    }
    root.addEventListener('click', async event => {
      const action = event.target.closest('[data-series-asset-action]')?.dataset.seriesAssetAction;
      if (!action || pending || !project?.seriesProjectId) return;
      const id = project.id;
      const choices = Array.from(root.querySelectorAll('[data-series-asset-review]')).filter(select => select.value).map(select => ({
        pendingId:select.dataset.seriesAssetReview,
        ...(select.value === 'new' ? {createNew:true} : {referenceAssetId:select.value})
      }));
      const selected = Array.from(root.querySelectorAll('[data-series-asset]:checked')).map(control => control.dataset.seriesAsset);
      if (action === 'resolve' && choices.length !== (project.episodeAssetPending282 || []).length) { feedback('请为每一项同名资产选择已有资产，或确认为新资产。',true);return; }
      pending = true;lock();feedback('正在保存本集资产…');
      try {
        const result = action === 'resolve' ? await resolve(project, choices) : await save(project, selected);
        if (project?.id === id) feedback(result === false ? '请先保存本集原稿，再确认资产。' : '本集资产已保存。',result === false);
      } catch (error) {
        if (project?.id === id) feedback(error.message,true);
      } finally { pending = false;lock(); }
    });
    return {paint};
  }

  window.WorkflowSeries282 = {create,createAssetSelection};
})();

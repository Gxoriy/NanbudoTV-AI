(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const ratios = ['1:1', '3:4', '4:3', '16:9', '9:16'];
  const platforms = ['亚马逊', '淘宝天猫', '1688', 'Temu', 'TikTok Shop', '拼多多', '抖音电商', 'OZON', '独立站', 'Shopee', '阿里国际站', '速卖通', 'SHEIN', '京东', '美客多', 'Coupang', 'Wayfair', 'Lazada', 'eBay'];
  const languages = ['英语', '简体中文', '繁体中文', '日语', '俄语', '泰语', '马来语', '德语', '法语', '西班牙语'];
  const states = new Map();
  const tools = window.ecommerceImageTools || {};
  const actionLabels = {queued:'排队中', running:'生成中', done:'已完成', error:'失败', interrupted:'已中断', needs_observation:'原任务待核对'};
  const options = (pairs, current) => pairs.map(([value, label]) =>
    '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>'
  ).join('');
  const imageDefaults = (() => {
    let saved = null, error = '', flight;
    const observers = new Set();
    async function load() {
      if (!flight) {
        flight = fetch('/api/ecommerce/preferences?media=image', {cache:'no-store', signal:AbortSignal.timeout(12000)})
          .then(async response => {
            const data = await response.json();
            if (!response.ok || data.media !== 'image' || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
              throw Error('默认图片设置暂不可读取。');
            }
            saved = data.settings;
            error = '';
          }).catch(() => { saved = null; error = '默认图片设置暂不可读取，请刷新后重试。'; })
          .finally(() => { flight = null; });
      }
      return flight;
    }
    function resolve(catalog, referenceCount=1) {
      if (!saved) return {error:error || '正在读取默认图片设置…'};
      if (!catalog) return {error:'正在读取已发布的图片模型…'};
      const models = (catalog.imageModels || catalog.models || []).filter(row => row.media === 'image' && row.referenceImageLimit > 0);
      const qualities = model => {
        const supported = model?.supportedResolutions || [];
        const priced = (catalog.imagePricing || []).filter(row => row.model === model?.model &&
          Number.isFinite(Number(row.pricePerImage)) && Number(row.pricePerImage) > 0)
          .map(row => row.resolution);
        return [...new Set(priced.concat(model?.pricingMode === 'live_quote' ? supported : []))]
          .filter(value => ['1k','2k'].includes(value) && (!supported.length || supported.includes(value)));
      };
      const explicit = Object.keys(saved).length > 0;
      const model = explicit ? models.find(row => row.model === saved.model &&
        (saved.route === 'all' || ModelPresentation.routeForModel({visualModels:models}, 'image', row.model) === saved.route)) :
        models.find(row => qualities(row).some(value => ['1k','2k'].includes(value)));
      const resolution = explicit ? saved.resolution : ['1k','2k'].find(value => qualities(model).includes(value));
      const route = explicit ? saved.route : 'all';
      if (!model || !qualities(model).includes(resolution)) return {error:explicit ?
        '已保存的默认图片模型或清晰度当前不可用，请在设置中更新。' : '暂无可用的图片模型与清晰度，请在设置中核对。'};
      if (model.referenceImageLimit < referenceCount) return {error:'默认图片模型最多支持 ' + model.referenceImageLimit + ' 张参考图，请减少图片或在设置中更换模型。'};
      return {model,resolution,route,explicit,error:''};
    }
    function describe(value) {
      return value.error || (value.model.displayName || '已发布图片模型') + ' · ' + value.resolution.toUpperCase();
    }
    function fee(catalog, settings, count) {
      if (settings.error) return settings.error;
      if (count < 1) return '请选择要生成的图片。';
      if (settings.model.pricingMode === 'live_quote') return count + ' 张 · 确认前核对实际费用';
      const price = (catalog.imagePricing || []).find(row => row.model === settings.model.model &&
        row.resolution === settings.resolution)?.pricePerImage;
      const cents = Math.round((Number(price) + Number.EPSILON) * 100);
      if (!Number.isFinite(cents) || cents <= 0) return '确认前核对实际费用。';
      return count + ' 张 · 预计 ' + (cents * count / 100) + ' 积分';
    }
    function refreshFromSettings() { void Promise.resolve(flight).then(load).then(() => observers.forEach(observer => observer())); }
    document.addEventListener('ecommerce:image-preferences-changed', refreshFromSettings);
    try {
      if (window.parent !== window) {
        const parent = window.parent.document;
        parent.addEventListener('ecommerce:image-preferences-changed', refreshFromSettings);
        window.addEventListener('pagehide', () => parent.removeEventListener('ecommerce:image-preferences-changed', refreshFromSettings), {once:true});
      }
    } catch (_) { /* A separately hosted frame can still read defaults on activation. */ }
    return {load,resolve,describe,fee,subscribe:observer => observers.add(observer)};
  })();
  window.EcommerceImageDefaults = imageDefaults;
  function fileData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('无法读取此图片。'));
      reader.readAsDataURL(file);
    });
  }
  async function api(action, payload) {
    const response = await fetch('/api/ecommerce/workbench/' + action, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload),
      signal:AbortSignal.timeout(35000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = Error(data.error || data.message || '请求失败，请稍后重试。');
      error.httpStatus = response.status;
      throw error;
    }
    return data;
  }
  window.createEcommerceImageWorkbench = (root, legacy) => {
    if (!root || !legacy) return null;
    const custom = root.querySelector('#ecwCustom');
    const dialog = root.querySelector('#ecwDialog');
    const anchor = document.createComment('commerce workspace position');
    legacy.before(anchor);
    let active = false;
    let selected = 'redraw';
    let catalog = null;
    let catalogRequest = null;
    let catalogFailed = false;
    let pollTimer, helpTimer;
    const helpReads = new Map();
    const helpWorking = new Set(['preparing', 'submitting', 'pending']);
    const helpUncertain = new Set(['unknown', 'queued', 'reserving', 'calling', 'not_called']);

    function makeState(tool) {
      return {tool, projects:[], project:null, fields:{}, name:'', status:'', ready:false, helpEditVersion:0};
    }
    function current() { return states.get(selected); }
    function onScreen(state) { return active && current() === state; }
    imageDefaults.subscribe(() => {
      const state = current();
      catalog = null;
      if (active && state && !tools[state.tool].localOnly) {
        void loadCatalog().then(() => {
          if (onScreen(state)) refreshGeneration(state);
        }).catch(error => notify(state, error.message, true));
      }
    });
    function setProject(state, project) {
      clearTimeout(state.saveTimer);
      state.dirty = false;
      state.project = project || null;
      state.fields = {...tools[state.tool].defaults(), ...(project?.fields || {})};
      state.name = project?.name || tools[state.tool].label + '项目';
      state.preview = '';
      state.help = null;
    }
    function notify(state, message, error=false) {
      state.status = message;
      state.error = error;
      if (!onScreen(state)) return;
      const line = custom.querySelector('.ecw-status');
      if (line) {
        line.textContent = message;
        line.toggleAttribute('data-error', error);
      }
    }
    async function loadCatalog(refresh=false) {
      if (catalog && !refresh) return catalog;
      if (!catalogRequest) {
        catalogFailed = false;
        catalogRequest = api('catalog', {}).then(data => { catalog = data; return data; })
          .catch(error => { catalogFailed = true; throw error; })
          .finally(() => { catalogRequest = null; });
      }
      return catalogRequest;
    }
    function confirm(state, title, message, button='确认') {
      if (!onScreen(state) || dialog.open) return Promise.resolve(false);
      dialog.innerHTML = '<form method="dialog"><h3>' + esc(title) + '</h3><p>' + esc(message) +
        '</p><menu><button value="cancel" autofocus>取消</button><button class="primary" value="yes">' + esc(button) + '</button></menu></form>';
      dialog.returnValue = '';
      dialog.showModal();
      return new Promise(resolve => dialog.addEventListener('close', () => resolve(onScreen(state) && dialog.returnValue === 'yes'), {once:true}));
    }
    function queueSave(state) {
      state.dirty = true;
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(() => {
        flush(state).catch(error => notify(state, error.message, true));
      }, 500);
    }
    async function flush(state) {
      clearTimeout(state.saveTimer);
      if (state.saving) await state.saving;
      if (!state.dirty || !state.project) return;
      state.dirty = false;
      state.saving = api('save', {projectId:state.project.id, fields:state.fields, name:state.name})
        .catch(error => { state.dirty = true; throw error; }).finally(() => { state.saving = null; });
      await state.saving;
      if (state.dirty) await flush(state);
      const listed = state.projects.find(item => item.id === state.project.id);
      if (listed) listed.name = state.name;
    }
    async function ensureProject(state) {
      if (state.project) return state.project.id;
      if (!state.creating) {
        state.creating = api('create', {tool:state.tool, name:state.name}).then(data => {
          state.project = data.project;
          state.projects = [data.project, ...state.projects];
          return data.project.id;
        }).finally(() => { state.creating = null; });
      }
      return state.creating;
    }
    function context(state) {
      return {
        fields:state.fields, files:role => state.project?.assets?.[role] || [], esc,
        recolorPricing:() => catalog?.recolorPricing,
        setRecolorPricing:price => { if (catalog) catalog.recolorPricing = price; },
        sameProject:projectId => state.project?.id === projectId,
        onScreen:() => onScreen(state),
        projectId:state.project?.id || '',
        ratioOptions:ratios.map(ratio => [ratio, ratio]),
        platformOptions:platforms.map(value => [value, value]),
        languageOptions:languages.map(value => [value, value]),
        update(patch, {render:refresh=true}={}) {
          Object.assign(state.fields, patch);
          queueSave(state);
          if (refresh && onScreen(state)) render(state);
        },
        async request(action, payload) {
          const projectId = await ensureProject(state);
          const data = await api(action, {...payload, projectId});
          if (data.project && state.project?.id === projectId) {
            state.project = data.project;
            if (onScreen(state)) renderResults(state);
          }
          return data;
        },
        notify:(message, error) => notify(state, message, error),
        preview:custom.querySelector('.ecw-preview'),
      };
    }
    function modelConfig(state) {
      const tool = tools[state.tool];
      const count = tool.uploads.reduce((sum, upload) => sum +
        Math.max(upload.required ? 1 : 0, state.project?.assets?.[upload.role]?.length || 0), 0);
      const settings = imageDefaults.resolve(catalog, count);
      const supported = (settings.model?.supportedAspectRatios || []).filter(ratio => ratios.includes(ratio));
      const allowed = supported.length ? supported : ratios;
      const ratio = tool.outputRatio ? tool.outputRatio(context(state)) : state.fields.ratio;
      return {...settings, allowed, ratio:ratio || allowed[0]};
    }
    function fileControl(state, upload) {
      const assets = state.project?.assets?.[upload.role] || [];
      const uploadDisabled = assets.length >= upload.max || state.busy;
      return '<section><div class="section-heading"><h3>' + esc(upload.label) + '</h3><small class="muted">' +
        assets.length + ' / ' + upload.max + '</small></div><label class="upload-zone"><b>＋ 选择图片</b><span>JPG / PNG / WebP · 单张 ≤ 12 MB</span>' +
        '<input type="file" data-ecw-upload="' + upload.role + '" aria-label="' + esc(upload.label) + '" accept="image/jpeg,image/png,image/webp"' +
        (upload.max > 1 ? ' multiple' : '') + (uploadDisabled ? ' disabled' : '') + '></label>' + (assets.length ? '<div class="thumbs">' +
        assets.map(item => '<div class="thumb"><img src="' + esc(item.url) + '" alt="" loading="lazy" decoding="async"><small>' +
          esc(item.name) + '</small><button type="button" data-ecw-action="remove-asset" data-id="' + esc(item.id) +
          '" data-role="' + upload.role + '" aria-label="移除 ' + esc(item.name) + '">×</button></div>').join('') + '</div>' : '') + '</section>';
    }
    function ratioField(state) {
      if (['set','detail'].includes(state.tool)) return '';
      const cfg = modelConfig(state);
      return '<label class="field" data-ecw-ratio>图片比例<select data-field="ratio">' +
        (cfg.allowed.includes(cfg.ratio) ? '' : '<option value="' + esc(cfg.ratio) + '" selected disabled>' + esc(cfg.ratio) + ' · 当前不支持</option>') +
        options(cfg.allowed.map(item => [item, item]), cfg.ratio) + '</select></label>';
    }
    function modelFields(state) {
      const cfg = modelConfig(state);
      const tool = tools[state.tool];
      const count = tool.outputCount?.(context(state)) ?? 1;
      const error = cfg.error || (!cfg.allowed.includes(cfg.ratio) && '当前默认模型不支持所选图片比例。') ||
        (tool.maxOutputs && count > tool.maxOutputs && '每套最多生成 ' + tool.maxOutputs + ' 张。');
      const missingAssets = tool.uploads.some(upload => upload.required && !state.project?.assets?.[upload.role]?.length);
      return '<div class="ecw-models"><p class="muted" data-ecw-image-fee aria-live="polite">' +
        esc(error || imageDefaults.fee(catalog, cfg, count)) + '</p>' +
        '<button class="primary wide" type="button" data-ecw-action="generate"' +
        (error || !count || missingAssets || state.busy || unresolvedRun(state) || visibleHelpDraft(state) ? ' disabled' : '') +
        '>核对费用并生成</button></div>';
    }
    function refreshGeneration(state) {
      const ratio = custom.querySelector('[data-ecw-ratio]');
      const panel = custom.querySelector('.ecw-models');
      if (ratio && document.activeElement !== ratio.querySelector('select')) ratio.outerHTML = ratioField(state);
      if (panel) panel.outerHTML = modelFields(state);
    }
    function unresolvedRun(state) {
      return ['running', 'needs_observation'].includes(state.project?.run?.state);
    }
    function paintPreview(state) {
      const area = custom.querySelector('.ecw-preview');
      if (!area) return;
      const source = state.project?.assets?.product?.[0];
      const image = state.project?.results?.find(result => result.id === state.preview) || source;
      area.innerHTML = image ? '<img src="' + esc(image.url) + '" alt="' + esc(image.name) + '" decoding="async">' :
        '<div class="empty"><div class="ecw-preview-empty" aria-hidden="true">▧</div><h3>先上传一张商品图</h3><p>原图和成品会在这里预览。</p></div>';
    }
    function renderResults(state) {
      const area = custom.querySelector('[data-ecw-results]');
      if (!area) return;
      const results = state.project?.results || [];
      const jobs = state.project?.run?.jobs || [];
      area.innerHTML = '<h3>创作结果 <small class="muted">' + results.length + ' 张</small></h3>' +
        (results.length ? '<div class="ecw-results">' + [...results].reverse().map(item =>
          '<article><button type="button" data-ecw-action="preview" data-id="' + esc(item.id) + '"><img src="' + esc(item.url) +
          '" alt="' + esc(item.name) + '" loading="lazy" decoding="async"></button><p>' + esc(item.name) + '</p><a href="' +
          esc(item.downloadUrl || item.url) + '" download="' + esc(item.name) + '">下载</a><button type="button" class="subtle" data-ecw-action="remove-result" data-id="' +
          esc(item.id) + '">移除</button></article>').join('') + '</div>' : '<p class="muted">生成成功的图片会保存在这个项目里。</p>') +
        (jobs.length ? '<ul class="ecw-jobs">' + jobs.map(job => '<li>' + esc(job.label) + ' · ' + esc(actionLabels[job.state] || job.state) +
          (job.error ? ' · ' + esc(job.error) : '') + (job.state === 'needs_observation' ?
          '<button type="button" data-ecw-action="observe" data-id="' + esc(job.id) + '">查询原任务</button>' : '') + '</li>').join('') + '</ul>' : '');
      refreshGeneration(state);
    }
    function render(state) {
      if (!onScreen(state)) return;
      custom.inert = Boolean(state.busy);
      custom.setAttribute('aria-busy', String(Boolean(state.busy)));
      const tool = tools[state.tool];
      custom.innerHTML = '<header class="ecw-heading"><div><span class="eyebrow">电商图片工作台</span><h2 tabindex="-1">' + esc(tool.label) + '</h2><p>' +
        esc(tool.description) + '</p></div></header>' +
        (state.ready ? '<div class="ecw-project"><select data-ecw-project aria-label="当前项目">' +
          options([['','未创建的项目'], ...state.projects.map(item => [item.id,item.name])], state.project?.id || '') +
          '</select><input data-ecw-name maxlength="80" aria-label="项目名称" value="' + esc(state.name) + '"><button type="button" data-ecw-action="new">＋ 新建</button>' +
          '<button type="button" data-ecw-action="save">保存项目</button><button type="button" data-ecw-action="delete"' + (state.project ? '' : ' disabled') + '>移除项目</button></div>' : '') +
        '<p class="ecw-status" role="status"' + (state.error ? ' data-error' : '') + '>' + esc(state.status) + '</p>';
      if (!state.ready) {
        if (state.error) custom.insertAdjacentHTML('beforeend','<button type="button" data-ecw-action="reload">重新加载</button>');
        return;
      }
      const ctx = context(state);
      custom.insertAdjacentHTML('beforeend', '<div class="ecw-workspace"><div class="ecw-stage"><section class="panel"><div class="section-heading"><h3>图片预览</h3>' +
        '<button type="button" class="subtle" data-ecw-action="original">查看原图</button></div><div class="ecw-preview"></div></section><section class="panel" data-ecw-results></section></div>' +
        '<aside class="panel ecw-controls" aria-label="素材与生成设置">' + tool.uploads.map(item => fileControl(state,item)).join('') + tool.render(ctx) +
        (tool.localOnly ? '' : ratioField(state) + modelFields(state)) + '</aside></div>');
      paintPreview(state);
      renderResults(state);
      renderHelp(state);
      tool.mount?.(context(state), custom);
    }
    function helpInputs(state) {
      const ctx = context(state);
      return {inputPrompt:tools[state.tool].helpPrompt(ctx), products:ctx.files('product').map(file => file.id).join(','),
        editVersion:state.helpEditVersion};
    }
    function matchesHelpInputs(state, submitted) {
      const inputs = helpInputs(state);
      return inputs.inputPrompt === submitted.inputPrompt && inputs.products === submitted.products
        && inputs.editVersion === submitted.editVersion;
    }
    function helpEditor(state) {
      const field = tools[state.tool].helpField || 'requirements';
      return custom.querySelector(`.ecw-help-editor textarea[data-field="${field}"]`);
    }
    function visibleHelpDraft(state) {
      const help = state.help;
      return help?.preview && matchesHelpInputs(state,help) ? help.preview : '';
    }
    function canInsertHelp(state, help) {
      const field = tools[state.tool].helpField || 'requirements';
      return help?.status === 'returned' && help.result?.applicable && help.result?.text?.trim() &&
        !help.applied && !state.busy && !String(state.fields[field] || '').trim() &&
        help.canApplyToCurrentInputs === true && (!help.products || help.products === helpInputs(state).products);
    }
    function insertHelp(state, help) {
      const field = tools[state.tool].helpField || 'requirements';
      context(state).update({[field]:help.result.text}, {render:false});
      help.applied = true;
      if (onScreen(state)) {
        const editor = helpEditor(state);
        if (editor) editor.value = state.fields[field];
      }
    }
    function receiveHelp(state, response, previous) {
      if (response.projectId !== state.project?.id || previous?.receiptId && response.receiptId !== previous.receiptId) return;
      if (previous?.receiptId && Number.isSafeInteger(previous.draftRevision) &&
          (!Number.isSafeInteger(response.draftRevision) || response.draftRevision < previous.draftRevision)) return;
      const inputs = previous || helpInputs(state);
      const field = tools[state.tool].helpField || 'requirements';
      const restoredBlank = previous?.restoredBlank ?? !String(state.fields[field] || '').trim();
      const returning = response.status === 'returned';
      const canFollow = inputs.origin === 'here' || restoredBlank &&
        (inputs.draftState === 'waiting' || inputs.draftState === 'streaming' ||
          ['waiting','streaming','interrupted'].includes(response.draftState));
      state.help = {...response, inputPrompt:inputs.inputPrompt, products:inputs.products,
        editVersion:inputs.editVersion, origin:inputs.origin, restoredBlank};
      const text = response.result?.text;
      if (returning && response.result?.applicable && text && state.fields[field] === text) {
        state.help.applied = true;
      } else if (canFollow && matchesHelpInputs(state, inputs)) {
        if (returning && response.result?.applicable && response.result.quality === 'structured' &&
            (response.canApplyToCurrentInputs === true || inputs.origin === 'here' && response.canApplyToCurrentInputs !== false)) {
          insertHelp(state, state.help);
        } else if (!returning && response.canApplyToCurrentInputs === true &&
            ['streaming','interrupted'].includes(response.draftState) && typeof response.draftText === 'string') {
          state.help.preview = response.draftText;
        }
      }
    }
    function renderHelp(state) {
      if (!onScreen(state)) return;
      const area = custom.querySelector('[data-ecw-help]');
      if (!area) return;
      const help = state.help;
      const price = catalog?.helpPricing;
      const working = helpWorking.has(help?.status);
      const uncertain = helpUncertain.has(help?.status);
      const ready = help?.status === 'returned' && help.result?.text;
      const structured = ready && help.result.quality === 'structured';
      const failed = help && !working && !uncertain && !ready;
      const fee = custom.querySelector('[data-ecw-help-price]');
      fee.textContent = price ? price.modelName + ' · ' + price.estimatedPoints + ' 积分/次，点击后开始' :
        catalog ? '后台暂未发布可用的帮写价格。' : catalogFailed ? '暂时无法读取帮写价格。' : '正在读取帮写价格…';
      const button = custom.querySelector('[data-tool-action="help"]');
      button.disabled = Boolean(state.busy || working || uncertain || !price || !state.project?.assets?.product?.length);
      button.textContent = working ? '帮写中…' : 'AI 帮写';
      area.dataset.state = working ? 'working' : structured ? 'ready' : failed ? 'failed' : '';
      area.closest('.ecw-help-editor')?.setAttribute('data-working',String(Boolean(working)));
      const missing = ready && (help.result.hasMissingInformation || /^【待补充】\s*$/m.test(help.result.text));
      const applicable = canInsertHelp(state, help);
      const field = tools[state.tool].helpField || 'requirements';
      const shownDraft = visibleHelpDraft(state);
      const interruptedDraft = help?.draftState==='interrupted' && help.draftText;
      const message = working ? (help.draftState === 'streaming' ? '正在书写…' :
        help.status === 'pending' ? '等待模型返回正文…' : help.message) :
        interruptedDraft ? '帮写尚未完成，已收到的草稿已保留。' + (help.error ? ' ' + help.error : '') :
        uncertain ? (help.error || '原帮写任务待核对。') : ready ?
          (help.applied ? '已写入' : String(state.fields[field]||'').trim() ? '帮写已完成，保留当前输入' :
            applicable ? '帮写已完成，可填入输入框' : '帮写已完成，可查看原正文') + ' · ' +
            (structured ? '已分段，可编辑核对' : '返回内容缺少必要分段，请核对正文') + (missing ? ' · 有待补充资料' : '') :
          failed ? (help.error || '本次未取得可用帮写结果。') : '';
      if (area.dataset.message !== message) {
        area.dataset.message = message;
        area.innerHTML = (working ? '<span class="ecw-help-spinner" aria-hidden="true"></span>' : '') + esc(message);
      }
      const editor = helpEditor(state);
      if (editor && editor.value !== (shownDraft || state.fields[field] || ''))
        editor.value = shownDraft || state.fields[field] || '';
      const details = custom.querySelector('[data-ecw-help-details]');
      const readyText = ready && !working && !help.applied ? help.result.text : interruptedDraft && !shownDraft ? help.draftText : '';
      const detailsHtml = (uncertain ? '<button type="button" data-ecw-action="observe-help">查询原帮写任务</button>' : '') +
        (applicable ? '<button type="button" data-ecw-action="insert-help">填入输入框</button>' : '') +
        (readyText ? '<details><summary>' + (interruptedDraft?'查看已收到的草稿':'查看原帮写正文') +
          '</summary><p>' + esc(readyText) + '</p></details>' : '');
      if (details.dataset.content !== detailsHtml) {
        details.dataset.content = detailsHtml;
        details.innerHTML = detailsHtml;
      }
    }
    async function load(state, projectId) {
      state.status = '正在读取项目…';
      state.error = false;
      if (onScreen(state)) render(state);
      try {
        const data = await api('load', {tool:state.tool, projectId});
        state.projects = data.projects;
        setProject(state, data.project);
        state.ready = true;
        state.status = '';
        if (state.project && tools[state.tool].helpPrompt) {
          const help = await savedHelpRead(state.project.id).catch(() => null);
          if (help?.receiptId) receiveHelp(state, help);
        }
      } catch (error) {
        notify(state,error.message,true);
      }
      if (onScreen(state)) render(state);
      schedulePoll();
    }
    function savedHelpRead(projectId, receiptId) {
      const key=JSON.stringify([projectId,receiptId||'']);
      if (!helpReads.has(key)) {
        helpReads.set(key,api('help-observe',{projectId,...(receiptId?{receiptId}:{}),localOnly:true})
          .finally(()=>helpReads.delete(key)));
      }
      return helpReads.get(key);
    }
    function scheduleHelpPoll() {
      clearTimeout(helpTimer);
      const state = current();
      const id = state?.project?.id, receipt = state?.help?.receiptId;
      if (!active || !id || !receipt || state.help.status !== 'pending') return;
      helpTimer = setTimeout(async () => {
        if (!onScreen(state) || state.project?.id !== id || state.help?.receiptId !== receipt) return;
        try {
          if (state.busy) return;
          const previous = state.help, hadDraft = Boolean(visibleHelpDraft(state));
          const help = await savedHelpRead(id,receipt);
          if (!state.busy && state.project?.id === id && state.help === previous) {
            receiveHelp(state,help,previous);
            if (onScreen(state)) {
              if (hadDraft !== Boolean(visibleHelpDraft(state))) refreshGeneration(state);
              renderHelp(state);
            }
          }
        } catch (_) { /* Keep the same receipt and try the local read again. */ }
        finally { scheduleHelpPoll(); }
      }, 400);
    }
    function schedulePoll() {
      clearTimeout(pollTimer);
      scheduleHelpPoll();
      const state = current();
      if (active && state?.project?.run?.state === 'running') {
        pollTimer = setTimeout(async () => {
          if (state.busy) { schedulePoll(); return; }
          const project = state.project;
          const id = project?.id;
          try {
            const updated = await api('load',{tool:state.tool,projectId:id,includeProjects:false});
            if (state.project?.id !== id || state.busy) return;
            if (state.project === project && updated?.project) state.project = updated.project;
            if (onScreen(state)) { renderResults(state); renderHelp(state); }
          } catch (error) { notify(state,error.message,true); }
          finally { schedulePoll(); }
        }, 2200);
      }
    }
    async function select(tool) {
      if (tool !== 'redraw' && !tools[tool]) return;
      if (dialog.open && selected !== tool) dialog.close('cancel');
      selected = tool;
      root.querySelectorAll('[data-ecw-tool]').forEach(button => {
        if (button.dataset.ecwTool === tool) button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      });
      legacy.hidden = tool !== 'redraw';
      custom.hidden = tool === 'redraw';
      if (tool === 'redraw') { schedulePoll(); return; }
      if (!states.has(tool)) states.set(tool,makeState(tool));
      const state = current();
      render(state);
      if (!state.ready && !state.loading) {
        state.loading = load(state).finally(() => { state.loading = null; });
      } else schedulePoll();
      if (!tools[tool].localOnly || tool === 'recolor') {
        await Promise.all([loadCatalog(true),tools[tool].localOnly ? null : imageDefaults.load()]).then(() => {
          if (onScreen(state)) {
            if (tool === 'recolor') tools[tool].refreshPricing?.(context(state));
            else refreshGeneration(state);
          }
          renderHelp(state);
        }).catch(error => { notify(state,error.message,true); renderHelp(state); });
      }
    }
    async function transact(state, callback, repaint=true) {
      if (!state?.ready || state.busy) return;
      state.busy = true;
      custom.inert = true;
      custom.setAttribute('aria-busy','true');
      try { await callback(); }
      catch (error) { notify(state,error.message,true); }
      finally {
        state.busy = false;
        if (onScreen(state)) {
          custom.removeAttribute('aria-busy');
          custom.inert = false;
          if (repaint) render(state);
        }
        schedulePoll();
      }
    }
    async function generate(state) {
      if (unresolvedRun(state)) throw Error('请先完成或核对原任务。');
      await imageDefaults.load();
      const cfg = modelConfig(state);
      if (cfg.error) throw Error(cfg.error);
      if (!cfg.allowed.includes(cfg.ratio)) throw Error('默认图片模型不支持当前图片比例，请重新选择比例。');
      const tasks = tools[state.tool].buildTasks(context(state));
      if (tasks.some(task => task.ratio && !cfg.allowed.includes(task.ratio))) throw Error('默认图片模型不支持本工具所选画幅，请调整画幅或默认模型。');
      const projectId = await ensureProject(state);
      await flush(state);
      const data = await api('quote',{projectId, model:cfg.model.model, resolution:cfg.resolution, ratio:cfg.ratio, tasks,
        useImageDefaults:true, imageDefaults:{model:cfg.model.model, resolution:cfg.resolution, route:cfg.route}});
      const quote = data.quote;
      const total = Number(quote?.estimatedPoints);
      if (!quote?.quoteId || quote.itemCount !== tasks.length || !Number.isFinite(total) || total <= 0) {
        throw Error('报价未完整返回，请重新核对费用。');
      }
      const approved = await confirm(state, '核对出图费用', imageDefaults.describe(cfg) +
        '\n' + quote.itemCount + ' 张 · 合计 ' + total + ' 积分。', '确认生成');
      if (!approved) return;
      let result;
      try {
        result = await api('generate',{projectId,quoteId:quote.quoteId,expectedPoints:quote.estimatedPoints,billingConfirmed:true});
      } catch (error) {
        const latest = await api('load',{tool:state.tool,projectId,includeProjects:false}).catch(() => null);
        if (latest?.project) state.project = latest.project;
        throw error;
      }
      state.project = result.project;
      notify(state,'已提交。各张图片独立返回，可切换到其他工具。');
    }
    async function helpWrite(state) {
      const price = catalog?.helpPricing;
      if (state.busy || helpWorking.has(state.help?.status) || helpUncertain.has(state.help?.status) ||
          !price || !state.project?.assets?.product?.length) return;
      const projectId = state.project.id;
      const attempt = {...helpInputs(state), origin:'here', status:'preparing', message:'正在核对商品图和本次费用…'};
      state.help = attempt;
      const currentAttempt = () => state.help === attempt && state.project?.id === projectId;
      renderHelp(state);
      try {
        await flush(state);
        if (!currentAttempt()) return;
        if (!matchesHelpInputs(state, attempt)) throw Error('商品资料已修改，请重新点击帮写。');
        const quote = await api('help-quote',{projectId,prompt:attempt.inputPrompt});
        if (!currentAttempt()) return;
        if (!matchesHelpInputs(state, attempt)) throw Error('商品资料已修改，请重新点击帮写。');
        if (quote.modelName !== price.modelName || quote.estimatedPoints !== price.estimatedPoints) {
          if (catalog) catalog.helpPricing = {modelName:quote.modelName, estimatedPoints:quote.estimatedPoints};
          throw Error('后台模型或费用已更新。请查看新费用后再点击帮写。');
        }
        const receiptId = crypto.randomUUID().replaceAll('-','');
        Object.assign(attempt, {receiptId, status:'submitting', message:'正在启动帮写任务…'});
        renderHelp(state);
        const data = await api('help-start',{projectId,quoteId:quote.quoteId,inputHash:quote.inputHash,
          receiptId,expectedPoints:quote.estimatedPoints,billingConfirmed:true});
        if (!currentAttempt()) return;
        if (data.receiptId !== receiptId) throw Error('原帮写回执暂未确认。');
        receiveHelp(state, data, attempt);
      } catch (error) {
        if (currentAttempt()) {
          const uncertain = attempt.receiptId && !(error.httpStatus >= 400 && error.httpStatus < 500);
          attempt.status = uncertain ? 'unknown' : 'failed';
          attempt.error = uncertain ? '原帮写回执暂未确认，请查询原任务。' : error.message;
        }
      } finally {
        if (onScreen(state)) refreshGeneration(state);
        renderHelp(state);
        schedulePoll();
      }
    }
    root.addEventListener('click', event => {
      const tab = event.target.closest('[data-ecw-tool]');
      if (tab) { select(tab.dataset.ecwTool); return; }
      const button = event.target.closest('button[data-ecw-action],button[data-tool-action]');
      const state = current();
      if (!button || !state || !custom.contains(button)) return;
      const action = button.dataset.ecwAction || button.dataset.toolAction;
      const tool = tools[state.tool];
      if (action === 'reload') { load(state); return; }
      if (action === 'preview' || action === 'original') {
        state.preview = button.dataset.id || '';
        paintPreview(state);
        return;
      }
      if (action === 'help') { void helpWrite(state); return; }
      if (action === 'insert-help') {
        if (!canInsertHelp(state, state.help)) return;
        insertHelp(state, state.help);
        renderHelp(state);
        helpEditor(state)?.focus();
        return;
      }
      if (!button.dataset.ecwAction) {
        Promise.resolve(tool.action?.(action,context(state),event)).catch(error => notify(state,error.message,true));
        return;
      }
      transact(state, async () => {
        if (action === 'generate') await generate(state);
        else if (action === 'observe-help') {
          const previous = state.help;
          const help = await api('help-observe',{projectId:state.project.id,receiptId:previous.receiptId});
          if (help.receiptId) receiveHelp(state, help, previous);
        } else if (action === 'new' || action === 'save') {
          if (action === 'new') {
            await flush(state);
            setProject(state,null);
          }
          await ensureProject(state);
          state.dirty = true;
          await flush(state);
          notify(state,'项目已保存。');
        } else if (action === 'delete') {
          if (!await confirm(state, '移除项目','从「' + tool.label + '」的列表移除「' + state.name + '」。已下载到本地的文件会保留。','移除项目')) return;
          await api('remove-project',{projectId:state.project.id});
          state.projects = state.projects.filter(item => item.id !== state.project.id);
          setProject(state,null);
          notify(state,'项目已移除。');
        } else if (action === 'remove-asset' || action === 'remove-result' || action === 'observe') {
          const id = button.dataset.id;
          if (action === 'remove-result' && !await confirm(state, '移除这张结果','从当前项目移除该成品。已下载的文件会保留。','移除')) return;
          await context(state).request({ 'remove-asset':'remove','remove-result':'remove-result',observe:'observe' }[action],
            action === 'observe' ? {jobId:id} : action === 'remove-result' ? {resultId:id} : {assetId:id,role:button.dataset.role});
          if (state.preview === id) state.preview = '';
        }
      });
    });
    custom.addEventListener('input', event => {
      const el = event.target;
      const state = current();
      if (!state) return;
      if (el.matches('[data-ecw-name]')) { state.name = el.value; queueSave(state); }
      else if (el.matches('textarea[data-field],input[data-field]:not([type=checkbox])')) {
        const hadDraft = Boolean(visibleHelpDraft(state));
        context(state).update({[el.dataset.field]:el.hasAttribute('data-number') ? Number(el.value) : el.value},{render:false});
        if (el.closest('.ecw-help-editor')) {
          state.helpEditVersion++;
          if (hadDraft) refreshGeneration(state);
          if (state.help) renderHelp(state);
        }
        if (el.hasAttribute('data-number')) {
          tools[state.tool].refreshQuantities?.(context(state), el);
          refreshGeneration(state);
        }
      }
    });
    custom.addEventListener('change', event => {
      const el = event.target;
      const state = current();
      if (!state) return;
      if (el.matches('[data-ecw-project]')) {
        const id = el.value;
        transact(state, async () => {
          await flush(state);
          if (id) await load(state,id);
          else setProject(state,null);
        });
      } else if (el.dataset.ecwUpload) {
        const role = el.dataset.ecwUpload;
        const files = [...el.files];
        const ctx = context(state);
        transact(state, async () => {
          const upload = tools[state.tool].uploads.find(item => item.role === role);
          if (files.length + ctx.files(role).length > upload.max) throw Error('此处最多上传 ' + upload.max + ' 张。');
          if (files.some(file => file.size > 12 * 1024 * 1024)) throw Error('单张图片不能超过 12 MB。');
          for (const file of files) await ctx.request('upload',{role,name:file.name,dataUrl:await fileData(file)});
          await flush(state);
          notify(state,'图片已保存。');
        });
      } else if (el.dataset.fieldFlag) {
        const key = el.dataset.fieldFlag;
        context(state).update({[key]:{...state.fields[key],[el.dataset.option]:el.checked}});
      } else if (el.matches('select[data-field],input[type=checkbox][data-field]')) {
        const key = el.dataset.field;
        const value = el.type === 'checkbox' ? el.checked : el.value;
        context(state).update({[key]:value});
      }
    });
    function syncOpenCatalog() {
      const state=current();
      if(!active||!state?.ready||state.busy||tools[state.tool].localOnly||document.hidden||
        window.frameElement&&!window.frameElement.getClientRects().length)return;
      void Promise.all([loadCatalog(true),imageDefaults.load()]).then(()=>{
        if(onScreen(state)){refreshGeneration(state);renderHelp(state);}
      }).catch(error=>notify(state,error.message,true));
    }
    window.addEventListener('focus',syncOpenCatalog);
    document.addEventListener('visibilitychange',syncOpenCatalog);
    const catalogTimer=setInterval(syncOpenCatalog,30000);
    window.addEventListener('pagehide',()=>clearInterval(catalogTimer),{once:true});
    return {
      activate() {
        active = true;
        root.hidden = false;
        root.querySelector('#ecwRedraw').append(legacy);
        select(selected);
      },
      deactivate() {
        active = false;
        root.hidden = true;
        if (dialog.open) dialog.close();
        clearTimeout(pollTimer);
        clearTimeout(helpTimer);
        if (legacy.previousSibling !== anchor) anchor.after(legacy);
      },
    };
  };
})();

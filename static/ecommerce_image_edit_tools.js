'use strict';

(() => {
  const retouchPresets = [
    ['gloss', '增强产品光泽', '按现有光源加强合理的高光与反射，保留真实材质的粗糙度和颜色。'],
    ['blemishes', '修复划痕瑕疵', '修复偶发的划痕、污渍和灰尘，保留原有接缝、做旧、图案和材质纹理。'],
    ['clarity', '提升整体清晰度', '改善可辨边缘和局部细节，控制锐化光晕与噪点，模糊的标识和文字不要猜写。'],
    ['color', '色彩校正', '校正偏色与白平衡，使商品颜色忠实于素材，保留包装与品牌的实际配色。'],
    ['perspective', '修正透视变形', '温和校正镜头透视，保留商品真实的形状、比例和设计结构。'],
  ];
  const remakeModes = [
    ['style', '参考风格', '沿用爆款参考图的配色、光线和排版气质，重新设计构图与场景。'],
    ['deep', '高度复刻', '沿用爆款参考图的取景、商品位置、画面分区和信息层级，换成自己的商品与可核实的文案。'],
  ];

  const notesLimit = 2000;

  function selectedPresets(fields) {
    return retouchPresets.filter(([key]) => fields.presets?.[key] === true);
  }

  function notesField(ctx, placeholder) {
    return `<label class="field">补充要求 <small>选填</small><textarea data-field="notes" rows="3" maxlength="${notesLimit}" placeholder="${ctx.esc(placeholder)}">${ctx.esc(ctx.fields.notes || '')}</textarea></label>`;
  }

  function notesPrompt(fields) {
    const notes = typeof fields.notes === 'string' ? fields.notes.trim() : '';
    if (notes.length > notesLimit) throw new Error(`补充要求最多 ${notesLimit} 字。`);
    return notes ? `\n【补充要求】\n${notes}` : '';
  }

  function defaultValue(options, preferredLabel) {
    return (options.find(([, label]) => label === preferredLabel) || options[0] || [])[0];
  }

  function choiceField(ctx, label, field, options, preferredLabel) {
    const current = ctx.fields[field] || defaultValue(options, preferredLabel);
    const choices = options.map(([value, text]) => `<option value="${ctx.esc(value)}"${value === current ? ' selected' : ''}>${ctx.esc(text)}</option>`);
    if (!options.some(([value]) => value === current)) choices.unshift('<option value="" disabled selected>请选择</option>');
    return `<label class="field">${label}<select data-field="${field}">${choices.join('')}</select></label>`;
  }

  function choiceLabel(ctx, field, options, preferredLabel, errorLabel) {
    const current = ctx.fields[field] || defaultValue(options, preferredLabel);
    const choice = options.find(([value]) => value === current);
    if (!choice) throw new Error(`请选择${errorLabel}。`);
    return choice[1];
  }

  const retouch = {
    label: '产品精修',
    description: '按需校正光泽、瑕疵、清晰度、颜色与透视，对照原图查看效果。',
    uploads: [{role: 'product', label: '待精修原图', max: 1, required: true}],
    defaults: () => ({presets: {}, notes: ''}),
    render(ctx) {
      const count = selectedPresets(ctx.fields).length;
      const checks = retouchPresets.map(([key, name, description]) =>
        `<label class="check ec-image-option-card" title="${ctx.esc(description)}"><input type="checkbox" data-field-flag="presets" data-option="${key}" aria-description="${ctx.esc(description)}"${ctx.fields.presets?.[key] === true ? ' checked' : ''}><strong>${ctx.esc(name)}</strong></label>`);
      return `<fieldset><legend>快捷精修</legend><div class="image-tool-options" role="group" aria-label="快捷精修项目">${checks.join('')}</div><button type="button" class="subtle" data-tool-action="toggle-all-presets">${count === retouchPresets.length ? '取消全选' : '全选'}</button><p class="muted">已选 ${count} 项，可组合精修，也可填写自己的要求。</p></fieldset>${notesField(ctx, '例如：减少表面反光，保留产品包装与现有文字')}`;
    },
    action(action, ctx) {
      if (action !== 'toggle-all-presets') return;
      const selectAll = selectedPresets(ctx.fields).length !== retouchPresets.length;
      ctx.update({presets: Object.fromEntries(retouchPresets.map(([key]) => [key, selectAll]))});
    },
    buildTasks(ctx) {
      if (ctx.files('product').length !== 1) throw new Error('请上传一张待精修原图。');
      const presets = selectedPresets(ctx.fields);
      const notes = notesPrompt(ctx.fields);
      if (!presets.length && !notes) throw new Error('请选择精修项目或填写补充要求。');
      const instructions = presets.map(([, name, text]) => `- ${name}：${text}`).join('\n');
      const prompt = '请精修参考图 1 中的商品，输出一张精修成图。保持商品身份、轮廓、结构、比例、数量和实际材质。原有包装、品牌标识和可辨文字应保持真实；不要添加新文案、标识、配件或卖点。保留原画面主体、背景和整体构图，按已选精修项目及补充要求对必要区域进行自然处理。' +
        (instructions ? `\n【精修项目】\n${instructions}` : '') + notes;
      return [{label: '产品精修', prompt}];
    },
  };

  const remake = {
    label: '爆款复刻',
    description: '商品图提供商品实体和实物包装，爆款参考图提供风格与版式。商品图可以是已有海报。',
    uploads: [
      {role: 'product', label: '商品图 · 提供商品与实物包装', max: 3, required: true},
      {role: 'reference', label: '爆款参考图 · 提供风格与版式', max: 1, required: true},
    ],
    defaults: () => ({mode: 'style', platform: '', language: '', notes: ''}),
    render(ctx) {
      const current = remakeModes.find(([key]) => key === ctx.fields.mode) || remakeModes[0];
      const modes = remakeModes.map(([key, name, description]) =>
        `<button type="button" class="ec-image-option-card" title="${ctx.esc(description)}" data-tool-action="remake-${key}" aria-pressed="${key === current[0]}"><strong>${ctx.esc(name)}</strong></button>`);
      return `<fieldset><legend>复刻程度</legend><div class="image-tool-options" role="group" aria-label="复刻程度">${modes.join('')}</div></fieldset><div class="split">${choiceField(ctx, '上架平台', 'platform', ctx.platformOptions, '亚马逊')}${choiceField(ctx, '输出语言', 'language', ctx.languageOptions, '英语')}</div>${notesField(ctx, '例如：保留商品外包装，突出已确认的两个卖点')}`;
    },
    action(action, ctx) {
      const mode = remakeModes.find(([key]) => action === `remake-${key}`);
      if (mode) ctx.update({mode: mode[0]});
    },
    buildTasks(ctx) {
      const count = ctx.files('product').length;
      if (count < 1 || count > 3) throw new Error('请上传同一商品的 1–3 张图片。');
      if (ctx.files('reference').length !== 1) throw new Error('请上传一张爆款参考图。');
      const mode = remakeModes.find(([key]) => key === ctx.fields.mode);
      if (!mode) throw new Error('请选择复刻程度。');
      choiceLabel(ctx, 'platform', ctx.platformOptions, '亚马逊', '上架平台');
      choiceLabel(ctx, 'language', ctx.languageOptions, '英语', '输出语言');
      const ratio = ctx.ratioOptions?.some(([value]) => value === ctx.fields.ratio) && /^\d+:\d+$/.test(ctx.fields.ratio) ? ctx.fields.ratio : '';
      return [{label: '爆款复刻', ...(ratio ? {ratio} : {})}];
    },
  };

  window.ecommerceImageTools = window.ecommerceImageTools || {};
  Object.assign(window.ecommerceImageTools, {retouch, remake});
})();

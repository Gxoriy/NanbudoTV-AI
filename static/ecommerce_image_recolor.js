'use strict';

(() => {
  const sessions = new Map();
  const validColor = /^#[\da-f]{6}$/i;
  const rgb = color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const clamp = value => Math.max(0, Math.min(1, value));
  const maxStrokes = 120;
  const maxPoints = 2400;
  const busy = state => state.pending || state.exporting || state.visionBusy;
  const canRecognize = state => state.brushMode === undefined && !state.strokes.length && !Object.keys(state.colors).length;

  function applyStroke(state, stroke, points) {
    const {maskWidth: width, maskHeight: height} = state.analysis;
    const {mode, radius} = stroke;
    for (const [x, y] of points) {
      for (let row = Math.max(0, y - radius); row <= Math.min(height - 1, y + radius); row++) {
        for (let col = Math.max(0, x - radius); col <= Math.min(width - 1, x + radius); col++) {
          if ((row - y) ** 2 + (col - x) ** 2 > radius ** 2) continue;
          const offset = row * width + col;
          if (mode === -1) state.labels[offset] = state.baseLabels[offset];
          else if (mode === 0 || mode === 255 || state.labels[offset]) state.labels[offset] = mode;
        }
      }
    }
  }

  function hsvFromHex(color) {
    const [red, green, blue] = rgb(color).map(channel => channel / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === red) hue = (green - blue) / delta;
      else if (max === green) hue = 2 + (blue - red) / delta;
      else hue = 4 + (red - green) / delta;
    }
    return {hue: (hue * 60 + 360) % 360, saturation: max ? delta / max : 0, value: max};
  }

  function hexFromHsv({hue, saturation, value}) {
    const channel = offset => {
      const k = (offset + hue / 60) % 6;
      return Math.round(255 * value * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return '#' + [5, 3, 1].map(offset => channel(offset).toString(16).padStart(2, '0')).join('');
  }

  function readImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(Error('换色预览加载失败，请重新打开商品图。'));
      image.src = url;
    });
  }

  async function readPreviewImage(url) {
    const image = await readImage(url);
    const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function session(asset) {
    if (!sessions.has(asset.id)) {
      if (sessions.size >= 4) {
        for (const [id, previous] of sessions) {
          if (busy(previous)) continue;
          sessions.delete(id);
          break;
        }
      }
      sessions.set(asset.id, {assetId:asset.id, colors: {}, transparent: true, strokes: [], pointCount: 0, brushRadius: 12});
    }
    return sessions.get(asset.id);
  }

  function setupPreview(preview, asset, state) {
    preview.innerHTML = `<div class="recolor-stage"><canvas aria-label="商品实时换色预览"></canvas><span class="recolor-box" hidden></span></div><p class="muted" data-recolor-stage-hint></p>`;
    const stage = preview.querySelector('.recolor-stage');
    const canvas = stage.querySelector('canvas');
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const box = stage.querySelector('.recolor-box');
    const hint = preview.querySelector('[data-recolor-stage-hint]');
    const view = {preview, stage, canvas, context, box, hint, state, asset};
    let start;
    let stroke;

    function point(event) {
      const bounds = canvas.getBoundingClientRect();
      return [clamp((event.clientX - bounds.left) / bounds.width), clamp((event.clientY - bounds.top) / bounds.height)];
    }

    function rectangle(end) {
      return [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1])];
    }

    function drawStroke(event) {
      const [px, py] = point(event);
      const {width, height} = canvas;
      const x = Math.min(width - 1, Math.floor(px * width));
      const y = Math.min(height - 1, Math.floor(py * height));
      const previous = stroke.points.at(-1);
      const distance = previous ? Math.hypot(x - previous[0], y - previous[1]) : 0;
      if (previous && distance < 1) return;
      const length = Math.max(1, Math.ceil(distance / Math.max(1, stroke.radius / 2)));
      const points = [];
      for (let step = 1; step <= length && state.pointCount < maxPoints; step++) {
        const value = previous ? [
          Math.round(previous[0] + (x - previous[0]) * step / length),
          Math.round(previous[1] + (y - previous[1]) * step / length),
        ] : [x, y];
        points.push(value);
        state.pointCount++;
      }
      stroke.points.push(...points);
      applyStroke(state, stroke, points);
      paint(state);
    }

    canvas.addEventListener('pointerdown', event => {
      if (busy(state) || event.button !== 0) return;
      if (state.brushMode !== undefined && !state.selecting && state.analysis && state.labels) {
        if (state.strokes.length >= maxStrokes || state.pointCount >= maxPoints) {
          state.error = '手动笔画已到上限。可撤销最近一笔，或重新识别。';
          refresh(state);
          return;
        }
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        stroke = {mode: state.brushMode, radius: state.brushRadius, points: []};
        state.strokes.push(stroke);
        drawStroke(event);
        return;
      }
      if (!state.selecting) return;
      event.preventDefault();
      start = point(event);
      canvas.setPointerCapture(event.pointerId);
      showBox(view, [...start, ...start]);
    });
    canvas.addEventListener('pointermove', event => {
      if (stroke) drawStroke(event);
      else if (start) showBox(view, rectangle(point(event)));
    });
    canvas.addEventListener('pointerup', event => {
      if (stroke) {
        drawStroke(event);
        stroke = undefined;
        refresh(state);
        return;
      }
      if (!start) return;
      const bounds = rectangle(point(event));
      start = undefined;
      if (bounds[2] - bounds[0] < .035 || bounds[3] - bounds[1] < .035) {
        showBox(view, state.bounds);
        return;
      }
      state.bounds = bounds;
      showBox(view, bounds);
      refresh(state);
    });
    canvas.addEventListener('pointercancel', () => {
      stroke = undefined;
      start = undefined;
      showBox(view, state.bounds);
      refresh(state);
    });
    return view;
  }

  function showBox(view, bounds) {
    view.box.hidden = !bounds;
    if (!bounds) return;
    const [left, top, right, bottom] = bounds;
    Object.assign(view.box.style, {left: `${left * 100}%`, top: `${top * 100}%`, width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%`});
  }

  function renderPreview(state) {
    const view = state.view;
    if (!view?.canvas.isConnected || !state.original || view.context === null) return;
    const {canvas, context, stage, hint} = view;
    const analysis = state.analysis;
    stage.classList.toggle('is-selecting', !!state.selecting);
    stage.classList.toggle('is-brushing', state.brushMode !== undefined && !state.selecting);
    showBox(view, state.selecting ? state.bounds : null);
    const original = state.original;
    const width = analysis?.maskWidth || original.width;
    const height = analysis?.maskHeight || original.height;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      view.originalPixels = undefined;
      view.buffer = undefined;
    }
    if (!view.originalPixels) {
      context.clearRect(0, 0, width, height);
      context.drawImage(original, 0, 0, width, height);
      view.originalPixels = context.getImageData(0, 0, width, height);
      view.buffer = context.createImageData(width, height);
    }
    const edited = view.buffer;
    edited.data.set(view.originalPixels.data);
    if (!state.selecting && state.labels?.length === width * height) {
      const adjustments = [];
      for (const part of analysis.parts) {
        if (validColor.test(state.colors[part.id] || '')) adjustments[part.id] = [rgb(part.color), rgb(state.colors[part.id])];
      }
      for (let index = 0; index < state.labels.length; index++) {
        const part = state.labels[index];
        const offset = index * 4;
        if (state.brushMode !== undefined && part === 0) {
          edited.data[offset + 3] = Math.min(75, edited.data[offset + 3]);
          continue;
        }
        if (state.transparent && part === 0) {
          edited.data[offset + 3] = 0;
          continue;
        }
        const adjustment = adjustments[part];
        if (adjustment) {
          const [base, target] = adjustment;
          const dr = edited.data[offset] - base[0];
          const dg = edited.data[offset + 1] - base[1];
          const db = edited.data[offset + 2] - base[2];
          const light = .55 * (.2126 * dr + .7152 * dg + .0722 * db);
          edited.data[offset] = Math.round(target[0] + .45 * dr + light);
          edited.data[offset + 1] = Math.round(target[1] + .45 * dg + light);
          edited.data[offset + 2] = Math.round(target[2] + .45 * db + light);
        }
        if (state.highlight === part) {
          edited.data[offset] = .75 * edited.data[offset] + 64;
          edited.data[offset + 1] = .75 * edited.data[offset + 1] + 46;
          edited.data[offset + 2] *= .75;
        }
      }
    }
    context.putImageData(edited, 0, 0);
    hint.textContent = state.selecting ? '拖动框住商品，四周留出一点背景。' :
      state.brushMode !== undefined ? '在图上涂抹修正。淡显的部分属于背景。' :
      '这里实时预览换色效果，确认后按原图尺寸生成 PNG。';
  }

  function paint(state) {
    if (state.frame) return;
    state.frame = requestAnimationFrame(() => {
      state.frame = 0;
      renderPreview(state);
    });
  }

  function partsMarkup(ctx, state) {
    return state.analysis.parts.map(part => {
      const changed = validColor.test(state.colors[part.id] || '');
      return `<li class="recolor-part" data-recolor-part="${part.id}">
        <div><b>${ctx.esc(part.label)}</b><small>${changed ? '已设新色' : '保留原色'}</small></div>
        <button type="button" class="subtle" aria-label="恢复${ctx.esc(part.label)}原色" data-tool-action="recolor-keep" data-part="${part.id}" ${changed ? '' : 'disabled'}>保留原色</button>
        <button type="button" class="recolor-swatch" data-tool-action="recolor-color" data-part="${part.id}" style="--swatch:${ctx.esc(changed ? state.colors[part.id] : part.color)}" aria-label="为${ctx.esc(part.label)}选色" aria-pressed="${state.activePart === part.id}" ${state.exporting ? 'disabled' : ''}></button>
      </li>`;
    }).join('');
  }

  function colorPanel(ctx, state) {
    const part = state.analysis.parts.find(item => item.id === state.activePart);
    if (!part) return '';
    const color = state.colors[part.id] || part.color;
    state.hsv = hsvFromHex(color);
    const {hue, saturation, value} = state.hsv;
    return `<div class="recolor-color-panel">
      <strong>${ctx.esc(part.label)}的目标色</strong>
      <div class="recolor-color-square" data-recolor-square title="拖动选择颜色，也可以在下方输入色值" style="--hue:${hue};--sat:${saturation * 100}%;--light:${(1 - value) * 100}%"><i></i></div>
      <label class="recolor-color-hue">色相<input type="range" min="0" max="359" value="${Math.min(359, Math.round(hue))}" data-recolor-hue ${state.exporting ? 'disabled' : ''}></label>
      <label class="recolor-color-hex">HEX<input type="text" value="${ctx.esc(color.toUpperCase())}" maxlength="7" pattern="#[0-9a-fA-F]{6}" data-recolor-hex ${state.exporting ? 'disabled' : ''}></label>
    </div>`;
  }

  function refresh(state) {
    const view = state.view;
    if (!view?.controls.isConnected) return;
    const {ctx, controls} = view;
    const showParts = state.analysis && !state.selecting && !state.visionBusy;
    const blocked = busy(state);
    const price = ctx.recolorPricing();
    const unavailable = !price || state.visionUncertain;
    const lastMessage = state.error || (state.pending ? '正在读取已保存的部件…' :
      state.visionMessage || (state.analysis ? `已识别${state.analysis.productName} · ${state.analysis.parts.length} 个部件。` : '等待识别原图中的商品与部件。'));
    controls.innerHTML = `<p role="status" class="recolor-message${state.error ? ' is-error' : ''}">${ctx.esc(lastMessage)}</p>
      <div class="recolor-actions">
      ${state.selecting ? `<button type="button" class="primary" data-tool-action="recolor-use-bounds" ${state.bounds && !blocked && !unavailable ? '' : 'disabled'}>识别框内商品</button><button type="button" class="subtle" data-tool-action="recolor-cancel-bounds">退出框选</button>` :
        `<button type="button" class="primary" data-tool-action="recolor-ai-quote" ${blocked || unavailable || !canRecognize(state) ? 'disabled' : ''}>识别</button><button type="button" class="subtle" data-tool-action="recolor-select" ${blocked || unavailable || !canRecognize(state) ? 'disabled' : ''}>框选商品</button>`}</div>
      <p class="muted" data-recolor-price>${price ? ctx.esc(price.modelName) + ' · ' + ctx.esc(price.estimatedPoints) + ' 积分/次，点击后开始' : '暂无可用的识别报价。'}</p>
      ${!state.selecting ? `<div class="recolor-actions">
        <button type="button" class="subtle" data-tool-action="recolor-ai-observe" ${blocked ? 'disabled' : ''}>查询原识别任务</button></div>` : ''}
      ${showParts ? `<div class="recolor-actions">
        <button type="button" class="subtle" data-tool-action="recolor-brush" aria-pressed="${state.brushMode !== undefined}" ${blocked ? 'disabled' : ''}>${state.brushMode !== undefined ? '完成区域修正' : '手动修正区域'}</button>
        <button type="button" class="subtle" data-tool-action="recolor-undo" ${blocked || !state.strokes.length ? 'disabled' : ''}>撤销一笔</button></div>
        ${state.brushMode !== undefined ? `<label>画笔用途<select data-recolor-brush-mode><option value="0" ${state.brushMode === 0 ? 'selected' : ''}>移出商品（背景）</option><option value="255" ${state.brushMode === 255 ? 'selected' : ''}>保留原图像素（标志、纹理或遗漏边缘）</option><option value="-1" ${state.brushMode === -1 ? 'selected' : ''}>恢复自动区域</option>${state.analysis.parts.map(part => `<option value="${part.id}" ${state.brushMode === part.id ? 'selected' : ''}>归入 ${ctx.esc(part.label)}</option>`).join('')}</select></label>
          <label>画笔大小<input type="range" min="1" max="36" value="${state.brushRadius}" data-recolor-brush-size></label>` : ''}
        <ul class="recolor-parts">${partsMarkup(ctx, state)}</ul>
        ${colorPanel(ctx, state)}
        <label class="check" title="导出透明背景 PNG，仅保留识别到的商品"><input type="checkbox" data-recolor-transparent ${state.transparent ? 'checked' : ''} ${blocked ? 'disabled' : ''}> 移除背景</label>
        <p class="muted">悬停部件名称可查看对应轮廓。需要调整时可用画笔修正。</p>
        <button type="button" class="primary" data-tool-action="recolor-export" ${blocked || (!state.transparent && !Object.keys(state.colors).length) ? 'disabled' : ''}>${state.exporting ? '正在生成 PNG…' : '确认并生成 PNG'}</button>` : ''}
      ${state.result ? `<p class="recolor-result">已保存换色成品 <a href="${ctx.esc(state.result.downloadUrl || state.result.url)}" download="${ctx.esc(state.result.name)}">下载 PNG</a></p>` : ''}`;
    paint(state);
  }

  function updateColor(state, color, source) {
    const part = state.analysis?.parts.find(row => row.id === state.activePart);
    if (!part || !validColor.test(color)) return;
    if (color.toLowerCase() === part.color.toLowerCase()) delete state.colors[part.id];
    else state.colors[part.id] = color;
    const controls = state.view.controls;
    controls.querySelector('[data-tool-action="recolor-ai-quote"]').disabled =
      !canRecognize(state) || state.visionUncertain || !state.view.ctx.recolorPricing();
    const row = controls.querySelector(`[data-recolor-part="${part.id}"]`);
    row.querySelector('small').textContent = state.colors[part.id] ? '已设新色' : '保留原色';
    row.querySelector('[data-tool-action="recolor-keep"]').disabled = !state.colors[part.id];
    row.querySelector('.recolor-swatch').style.setProperty('--swatch', color);
    controls.querySelector('[data-tool-action="recolor-export"]').disabled = !state.transparent && !Object.keys(state.colors).length;
    if (source === 'hex') {
      state.hsv = hsvFromHex(color);
      controls.querySelector('[data-recolor-hue]').value = Math.min(359, Math.round(state.hsv.hue));
    } else controls.querySelector('[data-recolor-hex]').value = color.toUpperCase();
    const square = controls.querySelector('[data-recolor-square]');
    square.style.setProperty('--hue', state.hsv.hue);
    square.style.setProperty('--sat', `${state.hsv.saturation * 100}%`);
    square.style.setProperty('--light', `${(1 - state.hsv.value) * 100}%`);
    state.highlight = undefined;
    paint(state);
  }

  function bindControls(state, controls) {
    controls.oninput = event => {
      if (event.target.matches('[data-recolor-brush-size]')) state.brushRadius = Number(event.target.value);
      if (event.target.matches('[data-recolor-hex]')) updateColor(state, event.target.value, 'hex');
      if (event.target.matches('[data-recolor-hue]')) {
        state.hsv.hue = Number(event.target.value);
        updateColor(state, hexFromHsv(state.hsv), 'picker');
      }
    };
    let pickingPointer;
    function pickFromSquare(event, square) {
      const bounds = square.getBoundingClientRect();
      state.hsv.saturation = clamp((event.clientX - bounds.left) / bounds.width);
      state.hsv.value = 1 - clamp((event.clientY - bounds.top) / bounds.height);
      updateColor(state, hexFromHsv(state.hsv), 'picker');
    }
    controls.onpointerdown = event => {
      const square = event.target.closest('[data-recolor-square]');
      if (!square || state.exporting || event.button !== 0) return;
      event.preventDefault();
      square.setPointerCapture(event.pointerId);
      pickingPointer = event.pointerId;
      pickFromSquare(event, square);
    };
    controls.onpointermove = event => {
      const square = event.target.closest('[data-recolor-square]');
      if (square && pickingPointer === event.pointerId) pickFromSquare(event, square);
    };
    controls.onpointerup = controls.onpointercancel = () => { pickingPointer = undefined; };
    controls.onchange = event => {
      if (event.target.matches('[data-recolor-brush-mode]')) {
        state.brushMode = Number(event.target.value);
        return;
      }
      if (!event.target.matches('[data-recolor-transparent]')) return;
      state.transparent = event.target.checked;
      controls.querySelector('[data-tool-action="recolor-export"]').disabled = !state.transparent && !Object.keys(state.colors).length;
      paint(state);
    };
    controls.onpointerover = event => {
      const part = event.target.closest('[data-recolor-part]');
      if (part && part.contains(event.relatedTarget)) return;
      state.highlight = part && !event.target.matches('input') ? Number(part.dataset.recolorPart) : undefined;
      paint(state);
    };
    controls.onpointerleave = () => {
      state.highlight = undefined;
      paint(state);
    };
  }

  async function setAnalysis(state, analysis) {
    const mask = await readImage(`data:image/png;base64,${analysis.maskPng}`);
    const canvas = document.createElement('canvas');
    canvas.width = analysis.maskWidth;
    canvas.height = analysis.maskHeight;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(mask, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const labels = new Uint8Array(canvas.width * canvas.height);
    for (let index = 0; index < labels.length; index++) labels[index] = pixels[index * 4];
    state.analysis = {parts: analysis.parts, productName:analysis.productName,
      maskWidth: analysis.maskWidth, maskHeight: analysis.maskHeight};
    state.baseLabels = labels;
    state.labels = labels.slice();
    state.strokes = [];
    state.pointCount = 0;
    state.brushMode = undefined;
    state.highlight = undefined;
    state.analysisId = analysis.analysisId;
    state.semanticReceiptId = analysis.semanticReceiptId;
    state.visionMessage = '';
    state.colors = {};
    state.activePart = analysis.parts[0]?.id;
  }

  async function restoreAnalysis(ctx, state) {
    state.restored = true;
    state.pending = true;
    refresh(state);
    try {
      const {analysis} = await ctx.request('load-recolor', {assetId:state.assetId, productPartsOnly:true});
      if (analysis) await setAnalysis(state, analysis);
    } catch (error) {
      state.error = error.message || '已保存的部件读取失败。';
    } finally {
      state.pending = false;
      refresh(state);
    }
  }

  async function recognize(ctx, state, observing=false) {
    const displayed = ctx.recolorPricing();
    if (!observing && (!displayed || !canRecognize(state) || state.visionUncertain)) return;
    const ownsInput = () => ctx.sameProject(ctx.projectId) && ctx.files('product')[0]?.id === state.assetId;
    let submitted = false;
    state.visionBusy = true;
    state.error = '';
    state.visionMessage = observing ? '正在查询原识别任务…' : '正在核对识别费用…';
    refresh(state);
    try {
      let receipt;
      if (!observing) {
        const quote = await ctx.request('recolor-quote', {assetId:state.assetId, bounds:state.bounds || null});
        if (!ownsInput() || !ctx.onScreen()) return;
        if (quote.modelName !== displayed.modelName || quote.estimatedPoints !== displayed.estimatedPoints) {
          ctx.setRecolorPricing({modelName:quote.modelName, estimatedPoints:quote.estimatedPoints});
          state.visionMessage = '识别模型或费用已更新，请核对后再点识别。';
          return;
        }
        state.visionReceiptId = crypto.randomUUID().replaceAll('-', '');
        state.visionMessage = '正在启动部件识别…';
        refresh(state);
        submitted = true;
        receipt = await ctx.request('recolor-start', {receiptId:state.visionReceiptId, quoteId: quote.quoteId, inputHash: quote.inputHash,
          expectedPoints: quote.estimatedPoints, billingConfirmed: true});
      } else {
        receipt = await ctx.request('recolor-observe', state.visionReceiptId ? {receiptId:state.visionReceiptId} : {});
      }
      if (receipt.receiptId) state.visionReceiptId = receipt.receiptId;
      for (let attempt = 0; receipt.status === 'pending' && attempt < 60 && ownsInput() && state.view.controls.isConnected; attempt++) {
        state.visionMessage = `正在识别部件 · ${receipt.progress || 0}%`;
        state.view.controls.querySelector('[role="status"]').textContent = state.visionMessage;
        await new Promise(resolve => setTimeout(resolve, 1200));
        if (!ownsInput()) break;
        receipt = await ctx.request('recolor-observe', {receiptId: receipt.receiptId, localOnly: true});
      }
      state.visionUncertain = !['returned','invalid','failed','missing'].includes(receipt.status) && receipt.receipt !== null;
      if (receipt.receipt === null || receipt.status === 'missing') {
        state.visionMessage = '当前没有可查询的 AI 部件识别任务。';
        state.visionReceiptId = undefined;
      } else if (receipt.status === 'returned' && receipt.receiptId === state.semanticReceiptId) {
        state.visionMessage = '这次 AI 部件识别已应用。';
      } else if (receipt.status === 'returned') {
        if (receipt.assetId !== state.assetId || !ownsInput() || !canRecognize(state) || !state.view.controls.isConnected) {
          state.visionMessage = '原任务结果已返回。可对当前原图重新识别商品部件。';
          return;
        }
        const {analysis} = await ctx.request('recolor-apply', {receiptId: receipt.receiptId});
        await setAnalysis(state, analysis);
      } else if (receipt.status === 'invalid' || receipt.status === 'failed') {
        state.error = receipt.result?.validationError || receipt.error || '未获得可用的商品部件。';
      } else {
        state.visionMessage = '原识别任务尚未确认。请稍后查询原任务。';
      }
    } catch (error) {
      if (submitted && !(error.httpStatus >= 400 && error.httpStatus < 500)) state.visionUncertain = true;
      state.error = error.message?.replaceAll('帮写', '部件识别') || '部件识别未完成。请查询原任务。';
    } finally {
      state.visionBusy = false;
      refresh(state);
    }
  }

  const recolor = {
    label: '产品换色',
    description: '从原图识别商品和真实部件，逐个换色并预览。',
    uploads: [{role: 'product', label: '待换色商品图', max: 1, required: true}],
    localOnly: true,
    defaults: () => ({}),
    render: () => '<section class="recolor-options" data-recolor-options></section>',
    buildTasks: () => [],
    refreshPricing(ctx) {
      const asset = ctx.files('product')[0];
      if (asset) refresh(session(asset));
    },
    mount(ctx, root) {
      const asset = ctx.files('product')[0];
      const controls = root.querySelector('[data-recolor-options]');
      if (!asset || !controls || !ctx.preview) return;
      const state = session(asset);
      const view = setupPreview(ctx.preview, asset, state);
      Object.assign(view, {ctx, controls});
      state.view = view;
      bindControls(state, controls);
      if (!state.original && !state.loading) {
        state.loading = readPreviewImage(asset.url).then(original => {
          state.original = original;
          paint(state);
        }).catch(error => {
          state.error = error.message;
          refresh(state);
        }).finally(() => { state.loading = undefined; });
      }
      if (!state.restored) void restoreAnalysis(ctx, state);
      refresh(state);
    },
    async action(action, ctx, event) {
      const asset = ctx.files('product')[0];
      if (!asset) return;
      const state = session(asset);
      if (busy(state)) return;
      if (action === 'recolor-ai-quote') {
        state.bounds = undefined;
        await recognize(ctx, state);
      } else if (action === 'recolor-ai-observe') {
        await recognize(ctx, state, true);
      } else if (action === 'recolor-select' || action === 'recolor-cancel-bounds') {
        state.selecting = action === 'recolor-select';
        refresh(state);
      } else if (action === 'recolor-use-bounds' && state.bounds) {
        state.selecting = false;
        await recognize(ctx, state);
      } else if (action === 'recolor-brush') {
        state.brushMode = state.brushMode === undefined ? 0 : undefined;
        state.highlight = undefined;
        refresh(state);
      } else if (action === 'recolor-undo' && state.strokes.length) {
        state.pointCount -= state.strokes.pop().points.length;
        state.labels = state.baseLabels.slice();
        for (const stroke of state.strokes) applyStroke(state, stroke, stroke.points);
        state.error = '';
        refresh(state);
      } else if (action === 'recolor-keep') {
        delete state.colors[event.target.closest('[data-part]')?.dataset.part];
        state.highlight = undefined;
        refresh(state);
      } else if (action === 'recolor-color') {
        state.activePart = Number(event.target.closest('[data-part]')?.dataset.part);
        state.highlight = undefined;
        refresh(state);
        state.view.controls.querySelector('[data-recolor-hue]')?.focus({preventScroll: true});
      } else if (action === 'recolor-export' && state.analysis && (state.transparent || Object.keys(state.colors).length)) {
        state.exporting = true;
        state.highlight = undefined;
        state.error = '';
        refresh(state);
        try {
          const {result} = await ctx.request('export-recolor', {assetId: asset.id, analysisId: state.analysisId, colors: state.colors, transparent: state.transparent, strokes: state.strokes});
          state.result = result;
          if (state.view?.controls.isConnected) ctx.notify('换色完成，PNG 已保存。');
        } catch (error) {
          state.error = error.message || '换色成品保存失败。';
        } finally {
          state.exporting = false;
          refresh(state);
        }
      }
    },
  };

  window.ecommerceImageTools = window.ecommerceImageTools || {};
  Object.assign(window.ecommerceImageTools, {recolor});
})();

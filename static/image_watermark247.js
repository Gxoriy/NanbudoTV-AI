(() => {
  const get = (id) => document.getElementById(id);
  const fileInput = get('imageFile');
  const original = get('original');
  const canvas = get('mask');
  const pen = canvas.getContext('2d');
  const strokes = [];
  let file = null;
  let active = null;
  let erase = false;
  let busy = false;
  let inputUrl = '';
  let resultUrl = '';
  let revision = 0;

  function setStatus(message, error = false) {
    get('status').textContent = message;
    get('status').classList.toggle('error', error);
  }

  function clearResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = '';
    get('result').hidden = true;
    get('result').removeAttribute('src');
    get('download').hidden = true;
    get('download').removeAttribute('href');
  }

  function updateButtons() {
    get('repair').disabled = busy || !file || !strokes.length || active !== null;
    get('undo').disabled = busy || !strokes.length || active !== null;
    get('clear').disabled = get('undo').disabled;
    fileInput.disabled = busy;
    for (const id of ['detect', 'paintMode', 'eraseMode', 'brushSize', 'zoom', 'refine']) {
      get(id).disabled = busy || !file || active !== null;
    }
    get('detect').disabled ||= strokes.some((stroke) => stroke.detectedMask);
    get('paintMode').setAttribute('aria-pressed', String(!erase));
    get('eraseMode').setAttribute('aria-pressed', String(erase));
  }

  function drawSegment(from, to, size, eraseStroke) {
    pen.globalCompositeOperation = eraseStroke ? 'destination-out' : 'source-over';
    pen.strokeStyle = pen.fillStyle = '#ffbf52';
    pen.lineCap = pen.lineJoin = 'round';
    pen.lineWidth = size;
    pen.beginPath();
    if (from === to) {
      pen.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
      pen.fill();
    } else {
      pen.moveTo(from.x, from.y);
      pen.lineTo(to.x, to.y);
      pen.stroke();
    }
    pen.globalCompositeOperation = 'source-over';
  }

  function redraw() {
    pen.clearRect(0, 0, canvas.width, canvas.height);
    for (const {points, size, eraseStroke, detectedMask} of strokes) {
      if (detectedMask) {
        pen.drawImage(detectedMask, 0, 0);
        continue;
      }
      drawSegment(points[0], points[0], size, eraseStroke);
      for (let i = 1; i < points.length; i++) drawSegment(points[i - 1], points[i], size, eraseStroke);
    }
    clearResult();
    updateButtons();
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {x: (event.clientX - rect.left) * canvas.width / rect.width,
            y: (event.clientY - rect.top) * canvas.height / rect.height};
  }

  fileInput.addEventListener('change', async () => {
    const id = ++revision;
    const picked = fileInput.files[0];
    file = active = null;
    strokes.length = 0;
    erase = false;
    get('zoom').value = '0';
    get('refine').checked = false;
    updateZoom();
    clearResult();
    get('imageStage').hidden = true;
    updateButtons();
    if (inputUrl) URL.revokeObjectURL(inputUrl);
    original.removeAttribute('src');
    if (!picked || picked.size > 8 * 1024 * 1024) {
      setStatus('请选择不超过 8 MB 的图片。', true);
      return;
    }
    inputUrl = URL.createObjectURL(picked);
    original.src = inputUrl;
    try {
      await original.decode();
      if (id !== revision) return;
      const width = original.naturalWidth, height = original.naturalHeight;
      if (!width || !height || width * height > 8_000_000 || Math.max(width, height) > 8192) {
        throw new Error('图片最多支持 800 万像素，最长边 8192 像素。');
      }
      canvas.width = width;
      canvas.height = height;
      file = picked;
      get('imageStage').hidden = false;
      setStatus('请涂抹水印及其描边。');
    } catch (error) {
      if (id === revision) setStatus(error.message || '图片无法打开。', true);
    }
    updateButtons();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!file || busy || active || event.button !== 0) return;
    const start = point(event);
    const size = Number(get('brushSize').value) * canvas.width / canvas.getBoundingClientRect().width;
    active = {id: event.pointerId, points: [start], size, eraseStroke: erase};
    canvas.setPointerCapture(event.pointerId);
    strokes.push(active);
    drawSegment(start, start, size, active.eraseStroke);
    clearResult();
    updateButtons();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (active?.id !== event.pointerId) return;
    const next = point(event);
    drawSegment(active.points.at(-1), next, active.size, active.eraseStroke);
    active.points.push(next);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      if (active?.id !== event.pointerId) return;
      active = null;
      updateButtons();
    });
  }
  get('undo').addEventListener('click', () => { strokes.pop(); redraw(); });
  get('clear').addEventListener('click', () => { strokes.length = 0; redraw(); });

  function asBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('图片数据读取失败。'));
      reader.readAsDataURL(blob);
    });
  }

  function updateZoom() {
    const scale = Number(get('zoom').value);
    const stage = get('imageStage');
    stage.classList.toggle('zoomed', Boolean(scale));
    stage.style.width = scale ? canvas.width * scale + 'px' : '';
  }

  get('returnToSubtitle').addEventListener('click', (event) => {
    if (window.parent === window) return;
    event.preventDefault();
    window.parent.postMessage({type: 'nanbudo:return-image-watermark'}, location.origin);
  });
  get('zoom').addEventListener('change', updateZoom);
  get('refine').addEventListener('change', clearResult);
  get('paintMode').addEventListener('click', () => {
    erase = false;
    updateButtons();
    setStatus('手动精修已开启。请用细笔涂抹水印和描边。');
  });
  get('eraseMode').addEventListener('click', () => {
    erase = true;
    updateButtons();
    setStatus('擦除选区已开启。可移除误选，再切回手动精修补画。');
  });

  get('detect').addEventListener('click', async () => {
    if (get('detect').disabled) return;
    busy = true;
    updateButtons();
    setStatus('正在本地识别疑似水印…');
    try {
      const response = await fetch('/api/image-watermark/detect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({image: await asBase64(file)})
      });
      const detail = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(detail.error || '自动识别失败。');
      if (!detail.found) {
        setStatus('未找到足够明确的水印，可用手动精修标记。');
        return;
      }
      const detectedMask = new Image();
      detectedMask.src = 'data:image/png;base64,' + detail.mask;
      await detectedMask.decode();
      if (detectedMask.naturalWidth !== canvas.width || detectedMask.naturalHeight !== canvas.height) {
        throw new Error('识别选区尺寸与原图不一致，请改用手动精修。');
      }
      strokes.push({detectedMask});
      redraw();
      setStatus('已标记疑似水印。请核对选区，可擦掉误选或手动补画。');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      busy = false;
      updateButtons();
    }
  });

  get('repair').addEventListener('click', async () => {
    if (get('repair').disabled) return;
    busy = true;
    clearResult();
    updateButtons();
    setStatus('正在本地修补图片…');
    try {
      const maskBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!maskBlob || maskBlob.size > 1024 * 1024) throw new Error('选区过于复杂，请分次处理。');
      const [image, mask] = await Promise.all([asBase64(file), asBase64(maskBlob)]);
      const response = await fetch('/api/image-watermark/repair', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({image, mask, refine: get('refine').checked})
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || '本地图片修补失败。');
      }
      resultUrl = URL.createObjectURL(await response.blob());
      get('result').src = resultUrl;
      get('result').hidden = false;
      get('download').href = resultUrl;
      get('download').download = file.name.replace(/\.[^.]+$/, '') + '-去水印.png';
      get('download').hidden = false;
      setStatus('修补完成。请检查纹理与边缘，再导出 PNG。');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      busy = false;
      updateButtons();
    }
  });
})();

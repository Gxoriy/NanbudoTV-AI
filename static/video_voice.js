(() => {
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const projectId = qs.get('projectId') || qs.get('id') || '';
  const file = qs.get('file') || '';
  const scope260=qs.get('scope')||'breakdown';
  const validScope260=['breakdown','canvas','visual'].includes(scope260);
  const statusPath260=()=>'/api/video-voice/status?'+new URLSearchParams({projectId,...(scope260==='breakdown'?{}:{scope:scope260,file})});
  let characterVoices260=[];
  let storageFeature260=scope260==='visual'?'workflow':scope260==='canvas'?'canvas':'breakdown';
  let voices = [], quote = null, quoteFingerprint = '', currentStatus = null;
  let busyAction = '', pollTimer = null, pollingTask = '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function readJSON(response) { const data = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(data.error || '请求失败'), {status: response.status}); return data; }
  async function get(path) { return readJSON(await fetch(path, {cache: 'no-store'})); }
  async function api(path, body) { if(!validScope260)throw Error('配音项目范围无效，请从原视频入口打开。');return readJSON(await fetch(path, {method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...body,...(scope260==='breakdown'?{}:{scope:scope260})})})); }
  function media(name) { return (scope260==='visual'?'/api/visual/media?'+new URLSearchParams({projectId,file:name}):scope260==='canvas'?'/api/canvas/media?'+new URLSearchParams({id:projectId,file:name}):`/api/breakdown/media?id=${encodeURIComponent(projectId)}&file=${encodeURIComponent(name)}`); }
  function message(text, error = false) { $('message').textContent = text || ''; $('message').classList.toggle('error', error); window.ModelActivity?.text($('message'),text,error); }
  function rows() { return [...document.querySelectorAll('.segment')].map(row => ({start:Number(row.querySelector('.start').value), end:Number(row.querySelector('.end').value), text:row.querySelector('.text').value, voiceId:row.querySelector('.voice').value, speakerName:row.querySelector('.speaker').value || '视频人物'})); }
  function fingerprint() { return JSON.stringify(rows()); }
  function setBusy(kind = '') {
    busyAction = kind;
    for (const id of ['add','quote','generate','observe']) if ($(id)) $(id).disabled = Boolean(kind);
    $('refresh').disabled = kind === 'generate' || kind === 'observe';
    document.querySelectorAll('#segments input,#segments textarea,#segments select,#segments .remove').forEach(el => { el.disabled = Boolean(kind); });
    if (!kind) syncControls();
  }
  function invalidateQuote(showMessage = false) { quote = null; quoteFingerprint = ''; $('quoteBox').classList.add('hidden'); $('generate').disabled = true; if (showMessage) message('内容已修改，请重新报价后再生成。'); syncControls(); }
  function syncControls() {
    $('observe').classList.toggle('hidden', !currentStatus?.canObserve);
    if (busyAction) return;
    const validQuote = Boolean(quote && quoteFingerprint === fingerprint());
    $('quote').disabled = !rows().length;
    $('generate').disabled = !validQuote || !quote.canGenerate || (currentStatus?.canContinue && !$('continueUnsubmitted').checked);
    $('observe').disabled = !currentStatus?.canObserve;
    $('continueBox').classList.toggle('hidden', !currentStatus?.canContinue);
    if (!currentStatus?.canContinue) $('continueUnsubmitted').checked = false;
  }
  function addRow(values = {}) {
    if(!Object.keys(values).length&&!$('segments').children.length){const bound=characterVoices260.filter(row=>row.synthesisReady&&voices.some(voice=>voice.id===row.voiceId&&voice.synthesisReady!==false));if(bound.length===1)values={voiceId:bound[0].voiceId,speakerName:bound[0].speakerName};}
    const wrap = document.createElement('div'); wrap.className = 'segment';
    wrap.innerHTML = `<div class="row"><label>起点（秒）<input class="start" type="number" min="0" step="0.1" value="${esc(values.start ?? 0)}"></label><label>终点（秒）<input class="end" type="number" min="0.1" step="0.1" value="${esc(values.end ?? 3)}"></label><label>人物名称<input class="speaker" maxlength="100" value="${esc(values.speakerName || '视频人物')}"></label><label class="wide">人物台词<textarea class="text" rows="2" maxlength="1000">${esc(values.text || '')}</textarea></label><label>音色<select class="voice"><option value="">请选择音色</option>${voices.filter(v => v.synthesisReady !== false).map(v => `<option value="${esc(v.id || v.voiceId)}">${esc(v.name || v.displayName || v.id)}</option>`).join('')}</select></label><button class="remove" type="button">移除</button></div>`;
    $('segments').append(wrap); wrap.querySelector('.voice').value = values.voiceId || '';
    wrap.querySelector('.remove').onclick = () => { wrap.remove(); invalidateQuote(true); };
  }
  function restoreSegments(saved) { if (!Array.isArray(saved) || !saved.length) { if (!$('segments').children.length) addRow(); return; } $('segments').replaceChildren(); saved.forEach(segment => addRow(segment)); }
  function render(s) {
    currentStatus = s || {};
    $('statusLine').textContent = currentStatus.totalCount ? `已完成 ${currentStatus.completedCount || 0}/${currentStatus.totalCount} 段` : '';
    if (currentStatus.resultUrl) {
      $('resultPanel').classList.remove('hidden'); $('result').src = currentStatus.resultUrl;
      const url = withDownload(currentStatus.resultUrl); $('download').href = url; $('download').download = currentStatus.resultFile || '配音结果.mp4';
      $('download').onclick = async event => { event.preventDefault(); try { const saved = await saveResult(url, $('download').download); if (saved === null) window.location.assign(url); else if (saved === false) message('已取消下载，结果仍保留。'); } catch (error) { message(error.message, true); } };
    } else $('resultPanel').classList.add('hidden');
    if (s.message && !busyAction) message(s.message); syncControls();
  }
  function withDownload(url) { try { const target = new URL(url, location.origin); target.searchParams.set('download', '1'); return target.pathname + target.search; } catch (_) { return `${url}${String(url).includes('?') ? '&' : '?'}download=1`; } }
  function desktopApi() { return window.pywebview?.api || window.parent?.pywebview?.api || null; }
  async function saveResult(url, name) {
    if (window.parent !== window && typeof window.parent.saveLocalDownload === 'function') return window.parent.saveLocalDownload(url, name, storageFeature260);
    const bridge = desktopApi();
    if (bridge?.save_download) { const saved = await bridge.save_download(url, name, storageFeature260); if (saved?.canceled) return false; if (!saved?.ok) throw Error(saved?.error || '保存失败，请重试。'); message(`已保存到：${saved.path}`); return true; }
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); message('已交给浏览器下载，请查看下载列表。'); return true;
  }
  async function refresh() {
    if (busyAction) return;
    try {
      if (!validScope260) throw Error('配音项目范围无效，请从原视频入口打开。');
      if (!projectId) throw Error('请从已生成的视频结果打开此页面。');
      const project = scope260==='breakdown'?(await get(`/api/breakdown/project?id=${encodeURIComponent(projectId)}`)).project||{}:await get('/api/video-voice/source?'+new URLSearchParams({scope:scope260,projectId,file}));
      characterVoices260=project.characterVoices||[];
      if(['workflow','canvas','ecommerce','store'].includes(project.storageFeature))storageFeature260=project.storageFeature;
      $('source').src = media(file || project.sourceFile); $('sourceHint').textContent = `当前项目：${project.name || project.id}`;
      if(scope260!=='breakdown'){$('source').src=project.sourceUrl;const back=document.querySelector('header>a');back.href=scope260==='visual'?'/static/visual.html?projectId='+encodeURIComponent(projectId):'/static/video_canvas.html';back.textContent='返回原创作板块';let hint=$('boundVoiceHint260');if(!hint){hint=document.createElement('p');hint.id='boundVoiceHint260';$('sourceHint').after(hint);}hint.textContent=characterVoices260.length?'已绑定角色声音：'+characterVoices260.map(row=>(row.speakerName||'人物')+' · '+(row.name||'音色')+(row.synthesisReady?'（配音前仍需报价确认）':'（录音样本或服务未开通，不能直接合成）')).join('；'):'没有保存可合成的角色音色；可手动选择已开通音色并确认费用。';}
      const catalog = await get('/api/voices/catalog'); voices = catalog.voices || catalog.items || [];
      const status = await get(statusPath260());
      if (!$('segments').children.length) restoreSegments(status.segments);
      render(status);
      if (status.status === 'pending' || status.status === 'running') window.ModelActivity?.set($('message'),{state:'pending',message:status.message||''});
    } catch (error) { message(error.message, true); }
  }
  async function poll(taskId) {
    if (!taskId || pollingTask === taskId) return;
    clearTimeout(pollTimer); pollingTask = taskId; setBusy('observe');
    try {
      for (let i = 0; i < 720; i++) {
        const task = await get(`/api/tasks/${encodeURIComponent(taskId)}`); const state = String(task.task?.state || task.state || '').toLowerCase();
        if (['done','error','failed','canceled','cancelled'].includes(state)) {
          const status = await get(statusPath260()); render(status);
          if (state !== 'done' && status.status !== 'done') message(task.error || task.message || status.message || '任务失败，未重复扣费。', true); else window.ModelActivity?.set($('message'),{state:'success',message:status.message||'配音已完成'}); return;
        }
        window.ModelActivity?.set($('message'),{state:'pending',message:''}); await pause(1000);
      }
      message('任务仍在后台处理，请刷新状态；不会自动重试。', true);
    } catch (error) { message(`查询中断：${error.message}。可点击刷新状态继续查询。`, true); }
    finally { pollingTask = ''; setBusy(''); }
  }
  $('segments').addEventListener('input', () => invalidateQuote(true)); $('segments').addEventListener('change', () => invalidateQuote(true)); $('rights').onchange = () => invalidateQuote(false); $('continueUnsubmitted').onchange = syncControls;
  $('add').onclick = () => { addRow(); invalidateQuote(true); }; $('refresh').onclick = refresh;
  $('quote').onclick = async () => { if (busyAction) return; setBusy('quote'); try { if (!$('rights').checked) throw Error('请先确认素材与声音授权。'); const result = await api('/api/video-voice/quote', {projectId, file, segments:rows(), rightsConfirmed:true}); quote = result; quoteFingerprint = fingerprint(); $('quoteBox').classList.remove('hidden'); $('quoteBox').innerHTML = `预计 ${esc(result.estimatedPoints)} 积分 · 可用积分 ${esc(result.availablePoints ?? '查询中')}<br><small>${esc(result.warning || '')}</small>`; message(result.message || '报价已更新'); } catch (error) { quote = null; quoteFingerprint = ''; message(error.message, true); } finally { setBusy(''); syncControls(); } };
  $('generate').onclick = async () => { if (busyAction) return; try { if (!quote || quoteFingerprint !== fingerprint()) throw Error('配音内容已变化，请重新报价。'); if (!$('rights').checked) throw Error('请先确认素材与声音授权。'); if (currentStatus?.canContinue && !$('continueUnsubmitted').checked) throw Error('请明确勾选“继续未提交配音”，已完成段不会重复收费。'); setBusy('generate'); window.ModelActivity?.set($('message'),{state:'pending',message:''}); const data = await api('/api/video-voice/generate', {projectId, file, segments:rows(), rightsConfirmed:true, intentHash:quote.intentHash, acceptedPrice:quote.estimatedPoints, billingConfirmed:true, resumeUnsubmitted:Boolean(currentStatus?.canContinue && $('continueUnsubmitted').checked)}); window.ModelActivity?.set($('message'),{state:'pending',message:''}); if (data.taskId) await poll(data.taskId); else render(data); } catch (error) { message(error.message, true); } finally { if (!pollingTask) setBusy(''); } };
  $('observe').onclick = async () => { if (busyAction) return; try { setBusy('observe'); const data = await api('/api/video-voice/observe', {projectId}); if (data.taskId) await poll(data.taskId); else render(data); } catch (error) { message(error.message, true); } finally { if (!pollingTask) setBusy(''); } };
  refresh();
})();

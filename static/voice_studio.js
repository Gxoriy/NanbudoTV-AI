(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const STORAGE = 'dramaVoiceStudioPending';
  const voiceSaveStatus=document.createElement('p');voiceSaveStatus.id='voiceSaveStatus';voiceSaveStatus.setAttribute('role','status');voiceSaveStatus.setAttribute('aria-live','polite');$('importVoice').after(voiceSaveStatus);
  let catalog = {voices:[],ready:false,cloneReady:false}, samples = [], selected = '', filter = 'all';
  let busy = false, saving = false, pending = [], cloneCost = null, synthCost = null, quoteVersion = 0, quoteTimer, pollTimer;
  const current = () => catalog.voices.find(row => row.id === selected);
  const say = (message, bad = false) => {$('studioStatus').textContent = message; $('studioStatus').classList.toggle('bad',bad);window.ModelActivity?.text($('studioStatus'),message,bad);};
  const saveStatus = (message, bad = false) => {$('voiceSaveStatus').textContent=message;$('voiceSaveStatus').classList.toggle('bad',bad);};
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const price = value => Number(value).toFixed(2);
  function safeAudioUrl(value, official = false) {
    try {const url = new URL(value, location.origin);
      if (!value || url.username || url.password) return '';
      if (url.origin === location.origin && !official) return url.href;
      if (url.protocol === 'https:' && url.hostname === 'help-static-aliyun-doc.aliyuncs.com') return url.href;
    } catch (_) {}
    return '';
  }
  async function api(path, body) {
    const response = await fetch(path,{cache:'no-store',...(body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {const error=new Error(result.error || result.message || '声音服务暂时不可用。');error.accepted=result.accepted;throw error;}
    return result;
  }
  function notifyCredits() {
    window.parent.postMessage({type:'character-credits-update'},location.origin);
    CreditGate.refresh().catch(() => {});
  }
  function persist() {try {localStorage.setItem(STORAGE,JSON.stringify(pending));} catch (_) {} renderPending(); controls();}
  function loadPending() {
    try {const stored = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      pending = Array.isArray(stored) ? stored.filter(row => /^[A-Za-z0-9_-]{8,120}$/.test(row.requestId) && ['clone','synthesize'].includes(row.mode)).slice(-20) : [];
    } catch (_) {pending = [];}
  }
  function tags(row) {
    const languages = Array.isArray(row.languages) ? row.languages.join('、') : String(row.languages || '');
    return [row.family || '已发布音色', languages, row.age ? `${row.age}` : ''].filter(Boolean);
  }
  function matches(row) {
    const content = [row.displayName,row.style,...tags(row)].join(' ').toLowerCase();
    if (!content.includes($('voiceSearch').value.trim().toLowerCase())) return false;
    if (filter === 'clone') return row.source === 'clone';
    if (filter === 'female') return /女|female/.test(content);
    if (filter === 'male') return !/female/.test(content) && /男|male/.test(content);
    if (filter === 'dialect') return /方言|广东|粤|东北|四川|闽南|河南|湖南|陕西|山东|安徽|上海|天津/.test(content);
    if (filter === 'overseas') return /日语|韩语|印尼|西班牙|法语|德语|俄语|英语|english|japanese|korean/.test(content);
    return true;
  }
  function renderCards() {
    const rows = catalog.voices.filter(matches);
    $('voiceCount').textContent = String(rows.length);
    $('voiceCards').innerHTML = rows.map(row => `<article class="voice-card${row.id === selected ? ' selected' : ''}" data-id="${esc(row.id)}"><button class="card-select" data-select="${esc(row.id)}" aria-label="选择音色${esc(row.displayName)}"><div class="card-top"><span class="mini-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><div><h3>${esc(row.displayName || '未命名音色')}</h3><small>${row.source === 'clone' ? '我的克隆音色' : '官方系统音色'}</small></div></div><p>${esc(row.style || (row.source === 'clone' ? '已审核的专属音色' : '真实音色示例，可先免费试听'))}</p><div class="card-tags">${tags(row).map(tag => `<span>${esc(tag)}</span>`).join('')}</div></button><div class="card-actions"><button data-preview="${esc(row.id)}" ${safeAudioUrl(row.sampleUrl) ? '' : 'disabled'} aria-label="免费试听${esc(row.displayName)}">▶ 免费试听</button><span class="${row.synthesisReady ? 'ready' : 'disabled-reason'}">${row.synthesisReady ? '可合成台词' : row.source === 'clone' ? '审核 / 配置待确认' : '模型未开通'}</span></div></article>`).join('') || '<div class="empty">没有符合条件的声音。试试其他关键词或筛选；克隆音色通过审核后才会成为可调用音色。</div>';
    document.querySelectorAll('[data-filter]').forEach(button => {button.classList.toggle('active',button.dataset.filter === filter);button.setAttribute('aria-pressed',String(button.dataset.filter === filter));});
  }
  function selectVoice(id) {
    if (!catalog.voices.some(row => row.id === id)) return;
    if (selected !== id) {$('voicePlayer').pause();$('voicePlayer').hidden = true;synthCost = null;quoteVersion++;}
    selected = id;
    saveStatus('');
    const row = current();
    $('detailName').textContent = row.displayName || '未命名音色';
    $('detailSource').textContent = row.source === 'clone' ? '我的克隆音色' : '官方系统音色';
    $('detailStyle').textContent = row.style || '选择真实音色，用自己的台词生成配音。';
    $('detailTags').innerHTML = tags(row).map(tag => `<span>${esc(tag)}</span>`).join('');
    $('voiceSaveName').value = row.displayName || '';
    $('freePreview').disabled = !safeAudioUrl(row.sampleUrl);
    $('selectionAvailability').textContent = row.synthesisReady ? '可免费保存到角色库，与已有形象自由组合；只有生成新台词才扣积分。' : row.source==='system'?'可以免费收藏并搭配角色。生成新台词需要软件管理员配置声音接口；不是要求用户购买会员，收藏不会扣积分。':'克隆音色尚未确认审核通过；请查询原克隆任务，不能把原始录音当作已克隆声音。';
    renderCards(); controls(); scheduleQuote();
  }
  function controls() {
    const row = current(), sample = samples.find(item => item.id === $('cloneSample').value);
    const running = mode => pending.some(item => item.mode === mode);
    $('createClone').disabled = busy || !catalog.cloneReady || !sample || sample.duration < 10 || sample.duration > 30 || !$('cloneName').value.trim() || running('clone');
    $('synthesize').disabled = busy || !row?.synthesisReady || !$('ttsText').value.trim() || !positive(synthCost) || running('synthesize');
    $('importVoice').disabled = busy || !row || !(row.synthesisReady||row.source==='system') || !$('voiceSaveName').value.trim();
    $('importVoice').textContent=saving?'正在保存到本机…':'保存音色并用于角色 · 免费';
    $('importVoice').setAttribute('aria-busy',String(saving));
    $('createClone').textContent = catalog.cloneReady ? '确认授权并创建音色' : '需要管理员开通克隆服务';
    $('synthesize').textContent = row?.synthesisReady ? '合成我的台词' : '需要管理员开通合成服务';
    $('queryLatest').hidden = !running('synthesize');
    $('clonePrice').textContent = positive(cloneCost) ? `每次创建 ${price(cloneCost)} 积分 · 单次创建，审核后入库` : '尚未开通有效价格的克隆服务';
    $('synthPrice').textContent = positive(synthCost) ? `本段配音 ${price(synthCost)} 积分 · 提交前再次确认价格` : row && !row.synthesisReady ? '需要管理员开通对应声音模型或确认审核；当前不能使用，不会提交或扣费' : '选定音色并填写台词后显示实际费用';
    $('characterCount').textContent = `${$('ttsText').value.trim().length} / 2000`;
    CreditGate.recalculate();
  }
  function renderSamples() {
    const previous = $('cloneSample').value;
    $('cloneSample').innerHTML = '<option value="">选择已上传 / 已录制的声音</option>' + samples.map(row => `<option value="${esc(row.id)}">${esc(row.name)} · ${Number(row.duration || 0).toFixed(1)}秒${row.duration < 10 || row.duration > 30 ? '（需裁剪到10–30秒）' : ''}</option>`).join('');
    if (samples.some(row => row.id === previous)) $('cloneSample').value = previous;
    updateSample();
  }
  function updateSample() {
    const row = samples.find(item => item.id === $('cloneSample').value);
    $('samplePlayer').pause();$('samplePlayer').hidden = !row;
    if (row) {$('samplePlayer').src = '/api/characters/media?' + new URLSearchParams({kind:'voices',id:row.id});if (!$('cloneName').value.trim()) $('cloneName').value = row.name;}
    $('sampleHint').textContent = row ? `${row.name} · ${Number(row.duration).toFixed(1)}秒。录音只用于提取已获授权的声音特征。${row.duration < 10 || row.duration > 30 ? '样本需要10–30秒，请先在角色库更换或裁剪录音。' : ''}` : '没有样本？去角色库上传录音，或使用电脑 / 手机录音。';
    controls();
  }
  async function reload() {
    try {
      const [data, library] = await Promise.all([api('/api/voices/catalog'),api('/api/characters').catch(() => api('/api/characters/library'))]);
      catalog = {...data,voices:Array.isArray(data.voices) ? data.voices : []};
      samples = ((library.library || library).voices || []).filter(row => row.source === 'recording' || (!row.source&&!!row.file&&!row.synthesisReady));
      cloneCost = positive(data.clonePoints) ? data.clonePoints : null;
      const rawPending = Array.isArray(data.pending) ? data.pending : [];
      for (const row of rawPending) if (/^[A-Za-z0-9_-]{8,120}$/.test(row.requestId) && ['clone','synthesize'].includes(row.mode) && !pending.some(item => item.requestId === row.requestId)) pending.push(row);
      const uniqueNames = new Set(catalog.voices.filter(row => row.source !== 'clone').map(row => row.displayName).filter(Boolean)).size;
      $('catalogCount').textContent = `${uniqueNames} 个实际音色名 · ${Number(data.systemCount ?? catalog.voices.filter(row => row.source !== 'clone').length)} 个已核对官方音色 / 模型条目 · ${Number(data.readyCount ?? catalog.voices.filter(row => row.synthesisReady).length)} 个当前可合成；同名声音的不同模型版本分别标注。`;
      $('cloneHint').textContent = data.cloneReady ? '样本需已取得录音所有者的声音克隆授权。提交一次原任务，审核通过后保存到可调用音色库。' : data.cloneMessage || '后台尚未开通声音克隆服务，请配置语音密钥、价格和公网样本地址。';
      say(data.ready ? data.message || '声音服务已开通；收藏与官方示例免费，自己的台词按报价计费。' : '可以免费选择、收藏系统音色并搭配角色。生成新台词 / 克隆声音需软件管理员配置语音接口、密钥和价格；不是用户会员开通，当前不提交付费请求。',!data.ready);
      renderSamples();renderCards();
      if (catalog.voices.some(row => row.id === selected)) selectVoice(selected);
      else if (catalog.voices.length) selectVoice(catalog.voices[0].id);
      persist();schedulePoll();
    } catch (error) {say(error.message,true);controls();}
  }
  async function quote(mode, row = current()) {
    const params = new URLSearchParams({mode});
    if (mode === 'synthesize') {params.set('voiceId',row?.id || '');params.set('text',$('ttsText').value.trim());}
    const response = await api('/api/voices/quote?' + params);
    const cost = response.estimatedPoints ?? response.quote?.estimatedPoints;
    if (!positive(cost)) throw new Error('后台没有有效声音价格，任务未提交。');
    return cost;
  }
  function scheduleQuote() {
    clearTimeout(quoteTimer); const version = ++quoteVersion;
    synthCost = null;controls();
    if (!current()?.synthesisReady || !$('ttsText').value.trim()) return;
    quoteTimer = setTimeout(async () => {
      try {const cost = await quote('synthesize');if (version === quoteVersion) {synthCost=cost;controls();}}
      catch (error) {if (version === quoteVersion) {$('synthPrice').textContent=error.message;}}
    },250);
  }
  async function listen(id) {
    selectVoice(id); const row=current(), url=safeAudioUrl(row?.sampleUrl);
    if (!url) throw new Error('这个声音没有免费示例。可填写台词，确认积分费用后生成试听。');
    $('voicePlayer').src=url;$('voicePlayer').hidden=false;
    try {await $('voicePlayer').play();$('previewHint').textContent='正在播放官方示例 · 免费，不调用合成服务';}
    catch (_) {$('previewHint').textContent='示例暂未播放，请使用下方播放器；外网无法连接时稍后重试。';}
  }
  function renderPending() {
    $('pendingSection').hidden=!pending.length;
    $('pendingRows').innerHTML=pending.map(row => `<div class="pending-row"><div><b>${row.mode==='clone'?'声音克隆':'台词配音'} · ${esc(row.name || '等待原任务回执')}</b><p data-pending-model>${esc(row.message || '正在等待服务回执；只查询原编号，不重复提交')} · 已用 ${Math.max(0,Math.floor(Date.now()/1000-Number(row.createdAt || Date.now()/1000)))} 秒</p></div><button data-observe="${esc(row.requestId)}">查询原任务 · 免费</button></div>`).join('');
  }
  function schedulePoll() {clearTimeout(pollTimer);if (pending.length) pollTimer=setTimeout(async()=>{for(const row of [...pending]) await observe(row.requestId);schedulePoll();},5000);}
  async function finish(requestId,response) {
    const row=pending.find(item=>item.requestId===requestId);
    const result={...(response.result||{}),...response};
    if(result.status==='rejected_not_submitted'&&result.accepted===false){
      pending=pending.filter(item=>item.requestId!==requestId);persist();notifyCredits();say(result.message||'该请求未在本机受理，没有提交付费调用。请检查条件后重新确认。',true);
    } else if (result.status==='succeeded') {
      const url=safeAudioUrl(result.audioUrl);
      if (row?.mode==='synthesize' && !url) {row.message='配音回执暂缺可播放文件，保留原任务继续查询。';persist();return;}
      pending=pending.filter(item=>item.requestId!==requestId);persist();notifyCredits();
      if (url) {$('generatedAudio').hidden=false;$('generatedPlayer').src=url;$('downloadAudio').href=url;$('downloadAudio').download=(row?.name || '我的配音')+'.wav';say('配音已生成，可以试听与下载；不会再次调用模型。');}
      else {say('克隆音色已通过审核并加入音色库，可以合成新台词或与形象组合。');await reload();}
    } else if (result.status==='refunded' || result.status==='failed') {
      pending=pending.filter(item=>item.requestId!==requestId);persist();notifyCredits();say(result.message || result.error || (result.status==='refunded'?'任务已确认失败，预留积分已退回。':'任务未完成，请核对后台回执与积分记录。'),true);
    } else {
      if (row) row.message=result.status==='not_found'?'暂未查到回执，保留编号等待核对；不自动再次提交。':result.message || '等待原请求回执；不会重复提交或扣费。';
      persist();
    }
  }
  async function observe(requestId) {
    const row=pending.find(item=>item.requestId===requestId);if (!row || row.checking) return;
    row.checking=true;
    try {await finish(requestId,await api('/api/voices/request-status',{requestId}));}
    catch(error) {if(pending.includes(row)) {row.message=error.message+'；保留原任务。';persist();}}
    finally {row.checking=false;}
  }
  async function submit(mode) {
    if (busy || pending.some(row=>row.mode===mode)) return;
    const voice=current(), sample=samples.find(item=>item.id===$('cloneSample').value);
    const text=$('ttsText').value.trim(), name=mode==='clone'?$('cloneName').value.trim():voice?.displayName || '我的配音';
    if (mode==='clone' && (!catalog.cloneReady || !sample || sample.duration<10 || sample.duration>30 || !name)) return;
    if (mode==='synthesize' && (!voice?.synthesisReady || !text)) return;
    busy=true;controls();
    let job;
    try {
      const cost=await quote(mode,voice);await CreditGate.ensure(cost);
      const message=mode==='clone'?`使用“${sample.name}”创建“${name}”，本次 ${price(cost)} 积分。\n我确认声音属于本人，或已取得声音所有者的克隆授权。只提交一次，审核通过后入库。`:`使用“${name}”合成 ${text.length} 字台词，本次 ${price(cost)} 积分。\n只提交一次；网络超时后查询原任务，不再次合成。`;
      if (!await studioConfirm(message)) return;
      await CreditGate.ensure(cost);
      const requestId='voice_'+mode+'_'+crypto.randomUUID().replaceAll('-','');
      job={requestId,mode,name,createdAt:Date.now()/1000};pending.push(job);persist();
      const payload=mode==='clone'?{sampleId:sample.id,name,acceptedPrice:cost,requestId,rightsConfirmed:true,billingConfirmed:true}:{voiceId:voice.id,text,acceptedPrice:cost,requestId,billingConfirmed:true};
      window.ModelActivity?.set($('studioStatus'),{state:'pending',message:''});
      await finish(requestId,await api('/api/voices/'+mode,payload));
    } catch(error) {
      const rejected=job&&error.accepted===false;
      say(error.message+(rejected?'；本机未受理，未提交付费调用，请检查条件后重新确认。':job?'；已保留原请求，只查询、不重提。':''),true);
      if(rejected){pending=pending.filter(item=>item.requestId!==job.requestId);persist();notifyCredits();}
      else if(job && pending.includes(job)) {job.message=error.message;persist();}
    } finally {busy=false;controls();schedulePoll();}
  }
  async function importVoice() {
    const row=current();if(busy || !row || !(row.synthesisReady||row.source==='system') || !$('voiceSaveName').value.trim()) return;
    busy=true;saving=true;saveStatus('正在免费保存音色，不会合成、克隆或扣积分。');controls();
    try {
      const result=await api('/api/voices/import',{voiceId:row.id,name:$('voiceSaveName').value.trim()});
      if(!/^[a-f0-9]{32}$/.test(result.voice?.id||''))throw new Error('保存回执不完整，请更新角色库查看；不要重复提交付费任务。');
      saveStatus('音色已保存到本机。正在返回角色库并选中声音…');
      say('音色已免费保存；再选择形象并保存角色卡，生成新台词时单独检查服务与积分。');
      // The parent closes only after selecting the saved voice. Sending a
      // separate close/credit-refresh event races its library refresh.
      if(window.parent!==window)window.parent.postMessage({type:'character-voice-saved',voiceId:result.voice.id},location.origin);
      else saveStatus('音色已免费保存。点击上方“形象＋音色组合”，选取这条声音即可。');
    } catch(error) {saveStatus(error.message,true);say(error.message,true);}
    finally {busy=false;saving=false;controls();}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='character-voice-save-error')return;
    saveStatus(event.data.message||'音色已保存，但角色库尚未更新。请返回角色库点击更新记录，再选取这条声音。',true);
  });
  $('showClone').onclick=()=>{$('clonePanel').hidden=false;$('clonePanel').scrollIntoView({behavior:'smooth',block:'start'});};$('closeClone').onclick=()=>{$('clonePanel').hidden=true;};
  document.querySelectorAll('a[href="/static/characters.html"]').forEach(link=>link.addEventListener('click',event=>{
    if(window.parent===window)return;
    try {const frame=window.parent.document.querySelector('#voiceStudioFrame iframe');if(!frame||frame.contentWindow!==window)return;}
    catch(_){return;}
    event.preventDefault();window.parent.postMessage({type:'character-studio-close'},location.origin);
  }));
  $('reloadVoices').onclick=reload;$('cloneSample').onchange=updateSample;$('cloneName').oninput=controls;$('voiceSaveName').oninput=controls;
  $('ttsText').oninput=scheduleQuote;$('voiceSearch').oninput=renderCards;
  $('voiceFilters').onclick=event=>{const button=event.target.closest('[data-filter]');if(button){filter=button.dataset.filter;renderCards();}};
  $('voiceCards').onclick=event=>{const preview=event.target.closest('[data-preview]'),select=event.target.closest('[data-select]');if(preview)listen(preview.dataset.preview).catch(error=>say(error.message,true));else if(select)selectVoice(select.dataset.select);};
  $('freePreview').onclick=()=>listen(selected).catch(error=>say(error.message,true));
  $('synthesize').onclick=()=>submit('synthesize');$('createClone').onclick=()=>submit('clone');$('importVoice').onclick=importVoice;
  $('queryLatest').onclick=()=>{const row=pending.find(item=>item.mode==='synthesize');if(row)observe(row.requestId);};
  $('pendingRows').onclick=event=>{const button=event.target.closest('[data-observe]');if(button)observe(button.dataset.observe);};
  document.addEventListener('play',event=>document.querySelectorAll('audio').forEach(audio=>{if(audio!==event.target)audio.pause();}),true);
  $('downloadAudio').onclick=async event=>{const bridge=window.pywebview?.api || window.parent.pywebview?.api;if(!bridge?.save_download)return;event.preventDefault();try {const result=await bridge.save_download($('downloadAudio').href,$('downloadAudio').download,'characters');say(result?.canceled?'已取消保存声音。':result?.error || '声音文件已保存。',Boolean(result?.error));}catch(error){say(error.message,true);}};
  CreditGate.register('#createClone',()=>cloneCost);CreditGate.register('#synthesize',()=>synthCost);
  loadPending();renderPending();reload();
  setInterval(()=>{if(pending.length)renderPending();},1000);
})();

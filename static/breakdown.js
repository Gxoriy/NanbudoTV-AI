/* All uploads and progress reads are free; only explicit confirmed actions submit models. */
'use strict';
const $ = id => document.getElementById(id);
const kinds = {person:'人物',vehicle:'交通工具',animal:'动物/宠物',monster:'怪物/灵伴',product:'产品',weapon:'武器',prop:'道具',clothing:'服装',scene:'场景',other:'其他'};
let project = null, config = {}, polling = false, pollTimer = null, busy = false;
let progressState = null, clockTimer = null;
let activeElement = '', libraryMode = 'inputs', libraryRows = [], generationKey = '';
let generationDurationRequested=null, generationDurationAnalysis='';
let motionRuntime = {ready:false, message:'正在检测本地组件…'};
let referenceWorkflowProject='', similarityProject='';
let cropState = null;
let downloadBusy=false, viewerDownloadUrl='';
let comparison=null, comparisonFile='', comparisonProject='', comparisonMode='sync', comparisonNewest='';
let audioModeProject259='';
const audioWarnings259=new Map();
function audioSettings259(){
  const video=project?.media==='video';
  $('audioSettings259').classList.toggle('hidden',!video);
  if(project?.id!==audioModeProject259){audioModeProject259=project?.id||'';$('audioMode259').value='original';}
  $('audioHint259').textContent=project?.generation?'原生成任务的声音要求已冻结；此选择仅用于下一次新生成。'
    :$('audioMode259').value==='redub'?'先生成画面，再对选定结果填写并核对逐段台词、时间与音色，另行报价并确认配音费用；不让视频模型自由编对白。'
    :'生成后保留原视频对应片段的原声，替换生成视频的声音；本地处理不加收积分，不改变原素材与旧结果。';
}
function resultAudioActions259(file,projectId=project?.id){
  const voice='/static/video_voice.html?'+new URLSearchParams({projectId,file});
  return `<button type="button" class="restore-original-audio259" data-audio-file="${esc(file)}" data-audio-project="${esc(projectId)}">保留原声版（本地免费）</button><a class="redub-result259" href="${esc(voice)}" target="_blank" rel="noopener">重新配音 · 填台词 / 时段 / 音色</a><small class="muted">打开后填写并核对台词、时段与音色，再单独确认配音费用。</small>`;
}
function resultAudioState259(item,projectId=project?.id){
  // audioMode is only the generation intent. Only the completed local
  // derivative's operation identity proves that original audio was applied.
  if(item.audioOperationId259)return `<p class="audio-confirmed259"><span class="badge">保留原声版 · 本地免费</span>${item.audioWarning259?' '+esc(item.audioWarning259):''}</p>`;
  if(item.mode==='voice_dub')return '<p class="audio-dubbed259"><span class="badge">已完成重新配音</span> · 已按确认台词、时段与音色处理；请播放验收。</p>';
  if(project?.id===projectId&&project.results.some(row=>!row.deleted&&row.parentFile===item.file&&row.audioOperationId259)){
    audioWarnings259.delete(projectId+'\n'+item.file);return '';
  }
  const failed=project?.id===projectId?Object.values(project.audioOperations259||{}).find(row=>row.parentFile===item.file&&row.status==='failed'):null;
  const warning=audioWarnings259.get(projectId+'\n'+item.file)||(failed?'保留原声未完成：'+failed.error+'；原画面结果保留，可仅重试本地原声处理。':'');
  if(warning)return `<p class="audio-warning259" role="status">${esc(warning)}</p>`;
  return item.audioMode==='redub'?'<p class="audio-redub259 muted">待重新配音：打开下方入口填写台词、时段与音色；尚未调用付费配音。</p>':'';
}
async function restoreOriginalAudio259(projectId,file){
  if(busy||polling)return;
  busy=true;controls();
  try{
    if(project?.id!==projectId){$('libraryDialog').close();await loadProject(projectId);}
    const result=project?.results?.find(row=>row.file===file&&!row.deleted&&row.media!=='image');
    if(project?.id!==projectId||project.media!=='video'||!result)throw Error('请从本项目的有效生成视频中选择要保留原声的版本。');
    if(project.generation)throw Error('请先查询原生成任务；原订单未改变，未重复提交。');
    $('libraryDialog').close();
    beginProgress('breakdown_restore_audio259','正在为所选生成结果保留原声（本地免费）…');
    status('正在保留对应片段的原声，原视频与旧结果保留；未调用模型、未扣积分。');
    const accepted=await api('/api/breakdown/restore-audio',{projectId,file,rightsConfirmed:$('rights').checked});
    if(project?.id!==projectId)return;
    if(accepted.taskId)await poll(accepted.taskId,projectId);
    else if(accepted.status==='done'&&accepted.file){
      project=(await api('/api/breakdown/project?id='+encodeURIComponent(projectId))).project;
      render();endProgress('保留原声版已在本机完成，未调用模型、未扣积分。');
      status('保留原声版已保留在结果列表；原视频和旧结果未改变，本地处理免费。');
    }else throw Error('本地声音任务回执尚未确认，请重新打开本项目查看原记录；未重复提交模型或扣费。');
  }finally{busy=false;controls();}
}
let comparisonUIListeners=[];
let depthComparison=null;
const similarityField=document.createElement('section');
similarityField.id='similarityField';similarityField.className='similarity-control';
similarityField.innerHTML='<div class="row"><label for="creativeSimilarity">创意相似度</label><label class="similarity-number"><input id="similarityNumber" type="number" min="0" max="100" step="1" value="80" aria-label="创意相似度百分比"><span>%</span></label></div><input id="creativeSimilarity" type="range" min="0" max="100" step="1" value="80" aria-label="创意相似度"><div class="similarity-scale"><span>更自由</span><span>更接近原片</span></div><p id="similarityHint" class="muted"></p><button id="useTextCreativity" type="button" class="wide hidden">改用文字创意 · 更自由</button>';
$('mode').closest('label').after(similarityField);
$('mode').querySelector('option[value="creative"]').textContent='创意复刻 · 按参考强度创作';
const durationNotice=document.createElement('div');
durationNotice.id='durationNotice';
durationNotice.innerHTML='<p id="durationHint" class="muted" role="status"></p><button id="useFixedDuration" type="button" class="wide hidden">使用模型固定时长</button>';
$('duration').closest('label').parentElement.after(durationNotice);
const ratioHint=document.createElement('p');
ratioHint.id='ratioHint';ratioHint.className='muted';ratioHint.setAttribute('role','status');
$('ratio').closest('label').after(ratioHint);
const generationWarning=document.createElement('p');
generationWarning.id='generationWarning';generationWarning.className='muted hidden';generationWarning.setAttribute('role','status');
$('modelState').after(generationWarning);
function manuallyEditedPrompt() {
  const analysis=project?.analysis;
  if(!analysis)return false;
  const baseline=(project.analysisHistory || []).slice().reverse().find(row=>row.analysis?.id && row.analysis.id===analysis.id)?.analysis;
  const prompt=$('prompt').value.trim();
  return baseline?prompt!==String(baseline.prompt || '').trim():Boolean(analysis.promptCustomized) || prompt!==String(analysis.prompt || '').trim();
}
function similarityControls() {
  const value=Number($('creativeSimilarity').value);
  const direction=value<40?'只借鉴主题和情绪，重新设计事件与分镜':value<70?'保留核心创意和事件，重排场景、镜头与文案':value<90?'较多保留事件、动作关系与节奏，允许场景、镜头和文案变化':'高度参考事件顺序与镜头节奏，仍需验收生成差异';
  const creative=project?.media==='video' && $('mode').value==='creative';
  const dynamic=creative && $('referenceStrategy').value!=='text';
  $('similarityHint').textContent=`${value}% · ${direction}。这是创作参考强度，不保证成片实测相似率；声音按下方“声音处理”单独选择，替换人物形象不会自动指定台词或音色。${manuallyEditedPrompt()?'你手动编辑过拆解提示词，它会作为用户要求优先发送；请确认没有保留与当前强度冲突的锁定命令。':value<90?'当前不直接执行原片逐镜复刻命令；明确要保留的要求请填在“补充要求”。':''}${dynamic && value<70?' 当前仍发送视频参考，其画面可能影响生成；想明显重编可改用文字创意，不会自动切换。':''}`;
  $('similarityField').classList.toggle('hidden',!creative);
  $('useTextCreativity').classList.toggle('hidden',!dynamic || value>=70);
}
function destroyComparison() {
  for(const [video,event,handler] of comparisonUIListeners)video.removeEventListener(event,handler);
  comparisonUIListeners=[];comparison?.destroy();comparison=null;
}
function comparisonResults(){return (project?.results || []).filter(row=>!row.deleted && row.media!=='image').slice().reverse();}
function comparisonHint(item) {
  if(!item)return '暂无生成结果，可先播放左侧原视频。完成生成后，右侧会显示结果，再选择同步对照；验收满意后保存作品。';
  if(comparisonMode!=='sync')return '单独播放：两侧进度互不影响。金色按钮控制右侧结果，左侧原视频可使用自己的播放器控制。';
  const start=Number(item?.sourceStart ?? project?.analysis?.segmentStart ?? 0);
  return `原片从 ${start.toFixed(1)} 秒对齐结果 0 秒；同步联动播放、暂停、拖动与倍速，到较短片段结束一起暂停。同步默认只播放右侧声音。${item && item.sourceStart==null?' 旧结果未记录起点，暂按当前拆解起点对齐。':''}`;
}
function playbackTime(seconds) {
  const value=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
  return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
}
function paintComparisonControls() {
  const source=$('preview').querySelector('video'), result=$('comparePreview').querySelector('video');
  const sync=!!result && comparisonMode==='sync', target=result || source;
  const buffering=sync && comparison?.buffering, playing=sync?!!comparison?.wanted:!!target && !target.paused;
  $('compareTools').classList.toggle('is-playing',playing);
  $('comparePlay').disabled=!target || !!target.error || (sync && !!source?.error);
  $('compareRestart').disabled=$('comparePlay').disabled;
  $('comparePlay').setAttribute('aria-pressed',String(playing));
  $('comparePlayIcon').textContent=playing?'Ⅱ':'▶';
  $('comparePlayText').textContent=playing?(sync?'暂停对照':result?'暂停结果':'暂停原视频'):(sync?'播放对照':result?'播放生成结果':'播放原视频');
  $('comparePlaybackState').textContent=target?.error || (sync && source?.error)?'视频读取失败':buffering?'缓冲中':playing?(sync?'同步播放中':result?'结果单独播放':'原片播放中'):result?(sync?'同步待播放':'单独待播放'):'等待生成 · 可预览原片';
  $('compareSourceAudio').textContent=sync?'静音 · 避免叠音':'原片声音';
  if(!result && target?.error)$('compareHint').textContent='原视频读取失败，请从上传记录重新打开，或重新导入素材。';
  $('compareClockLabel').textContent=sync?'对照片段进度':result?'生成结果进度':'原视频进度';
  const current=sync && comparison?comparison.time(target):target?.currentTime;
  const duration=sync && comparison?comparison.length():target?.duration;
  $('compareClock').textContent=playbackTime(current)+' / '+playbackTime(duration);
}
function renderComparison() {
  destroyComparison();
  const video=project.media==='video', items=video?comparisonResults():[];
  $('comparisonStage').classList.toggle('has-comparison',video);
  $('outputPane').classList.toggle('hidden',!video);
  $('originalHeading').classList.toggle('hidden',!video);
  $('compareTools').classList.toggle('hidden',!video);
  if(comparisonProject!==project.id){comparisonProject=project.id;comparisonFile='';comparisonNewest='';}
  if(items[0]?.file!==comparisonNewest){comparisonNewest=items[0]?.file || '';comparisonFile=comparisonNewest;}
  if(!items.some(row=>row.file===comparisonFile))comparisonFile=items[0]?.file || '';
  $('compareResultSelect').innerHTML=items.map((row,index)=>`<option value="${esc(row.file)}">${esc(row.name || row.modelName || '生成结果')} · ${row.saved===false?'待验收':'已保存'}${index===0?' · 最新':''}</option>`).join('') || '<option value="">等待生成结果 · 可先预览原片</option>';
  $('compareResultSelect').value=comparisonFile;
  $('compareResultSelect').disabled=!items.length;
  const item=items.find(row=>row.file===comparisonFile);
  $('comparePreview').innerHTML=item?`<video controls controlslist="nodownload" playsinline preload="metadata" aria-label="生成结果对照视频" src="${mediaUrl(item.file)}"></video>`:'<div class="compare-empty"><span aria-hidden="true">▷</span><b>等待你的新作品</b><p>生成完成后，视频会出现在右侧。<br>左右对照验收，满意后再保存作品。</p></div>';
  $('compareHint').textContent=comparisonHint(item);
  for(const id of ['compareSync','compareIndependent','zoomComparison','downloadComparison'])$(id).disabled=!video || !item;
  $('compareSync').checked=comparisonMode==='sync';$('compareIndependent').checked=comparisonMode!=='sync';
  if(video && item){
    comparison=new window.BreakdownCompare($('preview').querySelector('video'),$('comparePreview').querySelector('video'),{
      start:item.sourceStart ?? project.analysis?.segmentStart ?? 0,
      duration:item.sourceDuration ?? (item.referenceDuration || project.analysis?.duration || 0),
      notify:message=>{$('compareHint').textContent=message.startsWith('同步播放中')?comparisonHint(item):message+' · '+comparisonHint(item);paintComparisonControls();}});
    comparison.setSync(comparisonMode==='sync');
  }
  for(const media of [$('preview').querySelector('video'),$('comparePreview').querySelector('video')].filter(Boolean)) {
    for(const event of ['play','pause','timeupdate','loadedmetadata','durationchange','waiting','canplay','ended','error']) {
      media.addEventListener(event,paintComparisonControls);comparisonUIListeners.push([media,event,paintComparisonControls]);
    }
  }
  paintComparisonControls();
}
for (const [id, anchor] of [['analysisProgress','analyze'],['generationProgress','observe'],['motionProgress','motionPreview']]) {
  const panel = document.createElement('section');
  panel.id = id; panel.className = 'task-progress hidden'; panel.setAttribute('aria-label','任务进度');
  panel.innerHTML = '<div class="progress-heading"><span class="progress-spinner" aria-hidden="true"></span><b class="progress-phase" role="status"></b><time class="progress-clock"></time></div><div class="progress-track" aria-hidden="true"><span></span></div><p class="progress-detail"></p>';
  $(anchor).after(panel);
}
function durationText(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  return seconds < 60 ? seconds+'秒' : Math.floor(seconds/60)+'分'+seconds%60+'秒';
}
function paintProgress() {
  if (!progressState) return;
  const node=$(progressState.kind?.startsWith('breakdown_motion')?'motionProgress':progressState.kind === 'breakdown_analyze'?'analysisProgress':'generationProgress');
  node.classList.remove('hidden');
  if (!progressState.kind?.startsWith("breakdown_motion")) { node.classList.add("model-activity-container"); window.ModelActivity?.set(node,{state:progressState.running?"pending":progressState.failed?"error":"success",preserve:true}); }
  node.classList.toggle('working',progressState.running);
  node.classList.toggle('failed',progressState.failed);
  const elapsed=Math.max(0,(progressState.finishedAt || Date.now()/1000)-progressState.startedAt);
  node.querySelector('.progress-phase').textContent=progressState.message;
  node.querySelector('.progress-clock').textContent=(progressState.running?'已用 ':'用时 ')+durationText(elapsed);
  const waiting=progressState.phase==='model' && progressState.running;
  node.querySelector('.progress-detail').textContent=progressState.failed?'请查看下方错误提示；不会自动再次调用。':
    waiting?'发送画面/等待模型返回 · 本阶段 '+durationText(Date.now()/1000-progressState.phaseStartedAt)+(elapsed>=45?' · 模型尚未返回，继续等待同一次调用':''):
    progressState.running?(progressState.kind==='breakdown_motion_install'?'正在安装独立组件，请保持网络及电源连接；不扣积分、不提交视频生成。':progressState.kind==='breakdown_motion'?'正在本机提取时序深度，不调用付费模型；窗口进度不是视频生成进度。':'动画表示任务仍在处理，不代表上游真实完成百分比；查询不重复扣费。'):progressState.kind==='breakdown_motion_install'?'安装阶段已结束，请查看组件检测状态。':progressState.kind==='breakdown_motion'?'本地提取已结束，可播放、放大或下载动作参考；不会自动提交视频生成。':'任务已结束，新生成结果请验收后保存作品。';
}
function beginProgress(kind, message) {
  clearInterval(clockTimer);
  progressState={kind,message,running:true,startedAt:Date.now()/1000,phaseStartedAt:Date.now()/1000};
  paintProgress(); clockTimer=setInterval(paintProgress,1000);
}
function taskProgress(data) {
  if (!progressState || progressState.taskId !== data.id) {
    beginProgress(data.kind || 'breakdown_analyze',data.message || '处理中');
    progressState.taskId=data.id;
  }
  Object.assign(progressState,{startedAt:Number(data.startedAt || data.createdAt) || progressState.startedAt,
    phaseStartedAt:Number(data.phaseStartedAt) || progressState.phaseStartedAt,
    phase:data.phase || '',message:data.message || '处理中'});
  paintProgress();
}
function endProgress(message, failed=false, finishedAt) {
  clearInterval(clockTimer); clockTimer=null;
  if (!progressState) return;
  Object.assign(progressState,{running:false,message,failed,finishedAt:Number(finishedAt) || Date.now()/1000});
  paintProgress();
}
function clearProgress() {
  clearInterval(clockTimer);clockTimer=null;progressState=null;
  $('analysisProgress').classList.add('hidden');$('generationProgress').classList.add('hidden');
  $('motionProgress').classList.add('hidden');
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function status(message) { window.ModelActivity ? ModelActivity.text($('status'),message) : $('status').textContent = message; if(progressState?.running&&!progressState.kind?.startsWith('breakdown_motion')) window.ModelActivity?.set($('status'),{state:'pending',preserve:true}); }
async function saveResultFile(url, name) {
  if(downloadBusy){status('保存操作正在进行，请完成当前保存窗口。');return;}
  const parsed=new URL(url,window.location.origin);
  if(parsed.origin!==window.location.origin || parsed.pathname!=='/api/breakdown/media')throw new Error('只能下载当前项目的本机媒体。');
  parsed.searchParams.set('download','1');url=parsed.pathname+parsed.search;
  downloadBusy=true;status('正在打开保存窗口，请选择保存位置…');
  try {
  // WebView attachments need the same native save path as workflow downloads.
  if (window.parent !== window && typeof window.parent.saveLocalDownload==='function') {
    const saved=await window.parent.saveLocalDownload(url,name);
    if (saved===false) status('已取消下载，结果仍保留。');
    else status('保存操作已完成；结果仍保留在本机项目。');
    return;
  }
  const bridge=window.pywebview?.api;
  if (bridge?.save_download) {
    const result=await bridge.save_download(url,name,'breakdown');
    if(result?.canceled){status('已取消下载，结果仍保留。');return;}
    if(!result?.ok) throw new Error(result?.error || '保存失败，请重试。');
    status('已保存到：'+result.path);return;
  }
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  status('已交给浏览器下载，请查看下载列表。');
  } finally {downloadBusy=false;}
}
async function api(path, body, headers) {
  if (path === '/api/breakdown/analyze') await CreditGate.ensure(Number(analysisCost()));
  if (path === '/api/breakdown/generate') {
    if(!body.priceQuoteId)await CreditGate.ensure(Number(body.expectedCredits ?? body.expectedPoints));
  }
  const response = await fetch(path, body === undefined ? {} : {method:'POST',headers:headers || {'Content-Type':'application/json'},body:headers ? body : JSON.stringify(body)});
  let data; try { data = await response.json(); } catch (_) { throw new Error('连接暂时中断，请稍后刷新或查询原任务。'); }
  // A failed task is a successfully read terminal status, not a broken query.
  const failedTask=path.startsWith('/api/tasks/') && (data.task || data).state==='error';
  if (!response.ok || (data.error && !failedTask)) {const error=new Error(data.error || '请求失败');error.status=response.status;throw error;}
  return data;
}
const mediaUrl = (file, id=project.id) => `/api/breakdown/media?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`;
function analysisChoices() {
  const binding=config.textButtonBindings?.['breakdown-analyze'];
  return (config.visualModels || []).filter(row => row.media==='text' && row.enabled && row.gatewayReady).filter(row =>
    row.model===binding?.model || (config.textModelPricing || []).some(price => price.model===row.model && (price.resolution || price.operation)==='rewrite'));
}
function analysisCost() {
  const model=$('analysisModel').value, binding=config.textButtonBindings?.['breakdown-analyze'];
  if(!analysisChoices().some(row=>row.model===model))return null;
  if(model===binding?.model) return binding.price;
  return (config.textModelPricing || []).find(price => price.model===model && (price.resolution || price.operation)==='rewrite')?.pricePerGeneration;
}
function preserveRetiredModel(select, model, choices) {
  if(!model||choices.some(row=>row.model===model))return;
  const option=new Option('原模型已下架或不可用，请重新选择',model);
  option.disabled=true;select.add(option);select.value=model;
}
function analysisSettings() {
  const select=$('analysisModel'), previous=select.value, binding=config.textButtonBindings?.['breakdown-analyze'];
  const choices=analysisChoices();
  select.innerHTML=choices.map(row => `<option value="${esc(row.model)}">${esc(row.displayName)}${row.model===binding?.model?' · 默认':''}</option>`).join('') || '<option value="">暂无可用拆解模型</option>';
  select.value=choices.some(row=>row.model===previous)?previous:choices.some(row=>row.model===binding?.model)?binding.model:choices[0]?.model || '';
  preserveRetiredModel(select,previous,choices);
  analysisPrice();
}
function analysisPrice() {
  const cost=analysisCost();
  $('analysisPrice').textContent=cost!=null?`实际调用每次 ${cost} 积分 · 上传和查看免费`:'所选模型尚无有效调用价格，不能提交。';
  controls();
  CreditGate.recalculate();
}

function generationProfile() {
  return {...config,imagePricing:config.visualImagePricing || [],videoPricing:config.visualVideoPricing || [],pointsPerCny:config.pointsPerCny || 1};
}
function generationDurationValue() {
  if(project?.media!=='video')return Number($('duration').value);
  const info=ModelPresentation.videoDurationInfo(generationProfile(),$('generationModel').value);
  return info.fixed ?? Number($('duration').value);
}
function generationRatioIssue() {
  if(project?.media!=='video' || !selectedModel())return '';
  const ratio=$('ratio').value,ratios=selectedModel().supportedAspectRatios||[];
  return (ratios.length&&!ratios.includes(ratio)||ratio==='21:9'&&!ratios.includes('21:9'))?
    `所选模型不支持${ratio}画幅；原比例已保留，请明确调整，未扣费。`:'';
}
function generationRatioControls() {
  const ratios=selectedModel()?.supportedAspectRatios||[];
  for(const option of $('ratio').options){
    option.disabled=project?.media!=='video' || (ratios.length&&!ratios.includes(option.value)) || (option.value==='21:9'&&!ratios.includes('21:9'));
    option.textContent=({'9:16':'竖屏9:16','16:9':'横屏16:9','1:1':'方形1:1','21:9':'宽银幕21:9'}[option.value]||option.value)+(option.disabled?'（不支持）':'');
  }
  $('ratioHint').textContent=generationRatioIssue();
}
function generationDurationIssue() {
  if(project?.media!=='video' || !selectedModel())return '';
  const profile=generationProfile(), model=$('generationModel').value;
  const info=ModelPresentation.videoDurationInfo(profile,model), precise=$('mode').value==='edit';
  const duration=precise?Number(project.analysis?.duration):info.fixed!=null?Number(generationDurationRequested):Number($('duration').value);
  const issue=ModelPresentation.videoDurationIssue(profile,model,duration);
  if(precise && issue)return `精准局部替换必须使用原选段的${duration}秒。${issue} 请调整原片选段并重新拆解，或换用支持该时长的编辑模型。`;
  if(precise && Math.abs(generationDurationValue()-duration)>.05)return `精准局部替换必须使用原选段的${duration}秒，请换用支持该时长的编辑模型。`;
  return issue?`当前生成设定为${duration}秒。${issue}${info.fixed!=null?' 请点击“使用模型固定时长”，或更换模型。':''}`:'';
}
function generationDurationControls() {
  const image=project?.media!=='video', precise=$('mode').value==='edit';
  const info=ModelPresentation.videoDurationInfo(generationProfile(),$('generationModel').value);
  if(!image){
    $('duration').min=info.fixed ?? info.minimum;
    $('duration').max=info.fixed ?? info.maximum;
    $('duration').value=info.fixed ?? (precise?project.analysis?.duration:generationDurationRequested) ?? 15;
  }
  $('duration').disabled=busy || polling || !!project?.generation || precise || (!image && info.fixed!=null);
  const issue=generationDurationIssue();
  $('durationNotice').classList.toggle('hidden',image);
  $('durationHint').textContent=issue || (info.fixed!=null?`当前模型固定生成${info.fixed}秒。`:precise?'精准局部替换沿用原选段时长。':info.durations.length?`当前模型支持${info.durations.join('、')}秒。`:`当前模型支持${info.minimum}至${info.maximum}秒。`);
  $('useFixedDuration').classList.toggle('hidden',image || precise || info.fixed==null || !issue);
  $('useFixedDuration').disabled=busy || polling || !!project?.generation;
}
function breakdownCreditCost() {
  const profile = generationProfile();
  const quote = project?.media === 'image' ? ModelPresentation.imageQuote(profile,$('generationModel').value,$('resolution').value,1)
    : ModelPresentation.quote(profile,$('generationModel').value,$('resolution').value,generationDurationValue(),'economy',$('ratio').value);
  return ModelPresentation.isLiveQuote(profile,project?.media==='image'?'image':'video',$('generationModel').value)?CreditGate.QUOTE:quote?.points ?? null;
}
CreditGate.register('#analyze', () => Number(analysisCost()));
CreditGate.register('#generate', breakdownCreditCost);
function controls() {
  const generation = !!project?.generation;
  $('analyze').disabled = !project || busy || polling || generation || !$('rights').checked || !config.textButtonBindings?.['breakdown-analyze'] || !analysisCost();
  $('save').disabled = busy || polling || generation;
  $('generate').disabled = !project?.analysis || busy || polling || generation || !selectedModel() || !$('resolution').value;
  if(generationDurationIssue() || generationRatioIssue())$('generate').disabled=true;
  $('duration').disabled=busy || polling || generation || $('mode').value==='edit' || (project?.media==='video' && ModelPresentation.videoDurationInfo(generationProfile(),$('generationModel').value).fixed!=null);
  $('useFixedDuration').disabled=busy || polling || generation;
  if(project?.media==='video' && $('mode').value==='creative' && $('referenceStrategy').value==='depth' && !validMotion()) $('generate').disabled=true;
  $('observe').classList.toggle('hidden', !generation);
  $('observe').disabled = busy || polling;
  $('imageUpload').disabled = busy || polling; $('videoUpload').disabled = busy || polling;
  $('projects').disabled = busy || polling; $('start').disabled = busy || polling; $('limit').disabled = busy || polling;
  $('mode').disabled = busy || polling || generation; $('resolution').disabled = busy || polling || generation || !$('resolution').value;
  $('analysisModel').disabled=busy || polling || generation;
  $('analysisMode').disabled=busy || polling || generation;
  $('generationModel').disabled=busy || polling || generation || !selectedModel();
  $('openInputs').disabled=busy || polling; $('openOutputs').disabled=busy || polling;
  $('analyze').textContent = '开始拆解';
  window.ModelActivity?.set($('analyze'),{state:progressState?.running&&progressState.kind==='breakdown_analyze'?'pending':'',preserve:true});
  $('elements').querySelectorAll('input,button,select').forEach(node => node.disabled = busy || polling || generation);
  $('elements').querySelectorAll('.select-reference-subject').forEach(node=>{
    node.disabled=busy || polling || generation || !project?.replacements?.find(item=>item.elementId===node.closest('.element').dataset.id)?.referenceFile;
  });
  $('addElement').disabled = busy || polling || generation;
  $('selectAll').disabled = busy || polling || generation;
  $('clearAll').disabled = busy || polling || generation;
  const depthSelected=$('referenceWorkflow').value==='depth';
  $('referenceWorkflow').disabled = !project || busy || polling || generation;
  $('extractMotion').disabled = !project || project.media!=='video' || !depthSelected || !motionRuntime.ready || busy || polling || generation;
  $('useMotion').disabled = !depthSelected || !validMotion() || busy || polling || generation;
  $('installMotion').disabled = !project || motionRuntime.ready || !motionRuntime.installAvailable || busy || polling || generation;
  $('installMotion').classList.toggle('hidden',!!motionRuntime.bundled);
  $('installMotion').textContent=motionRuntime.ready?'组件已就绪':'安装本地动作组件';
  $('motionQuality').disabled = busy || polling || generation;
  $('referenceStrategy').disabled = busy || polling || generation;
  $('creativeSimilarity').disabled = busy || polling || generation;
  $('useTextCreativity').disabled = busy || polling || generation;
  $('similarityNumber').disabled = busy || polling || generation;
  $('audioMode259').disabled=busy||polling||generation;
  document.querySelectorAll('.restore-original-audio259').forEach(button=>button.disabled=busy||polling||generation);
  if(project?.media==='video' && $('mode').value==='creative' && $('referenceStrategy').value==='depth' && !depthSelected) $('generate').disabled=true;
  $('cancelMotion').classList.toggle('hidden', !(progressState?.running && progressState.kind?.startsWith('breakdown_motion')));
  $('cancelMotion').textContent=progressState?.kind==='breakdown_motion_install'?'停止组件安装':'停止本地提取';
}
function validMotion() {
  const settings=project?.motionReference?.settings, analysis=project?.analysis;
  return !!(settings && analysis && Math.abs(settings.start-(analysis.segmentStart || 0))<.01 && Math.abs(settings.duration-analysis.duration)<.05);
}
function referenceWorkflowControls() {
  const depth=$('referenceWorkflow').value==='depth';
  $('referenceWorkflow').closest('label').classList.toggle('hidden',depth);
  $('depthWorkflow').classList.toggle('hidden',!depth);
  $('dynamic3dWorkflow').classList.toggle('hidden',depth);
  $('referenceWorkflowHint').textContent=depth?'灰白深度参考 → 新角色 / 新场景 → 创意视频。提取不收费，生成时单独确认价格。':'此项目曾选择动态三维，但该路线现已暂停。请切换为灰白深度参考；不会自动改写项目选择或提交任务。';
  const route=motionRuntime.referenceWorkflows?.routes?.find(item=>item.id==='dynamic3d');
  if(route?.reason)$('dynamic3dState').textContent=route.reason;
  if(route?.hardwareNote)$('dynamic3dHardware').textContent=route.hardwareNote;
  // A advertised capability must not unlock a missing implementation.
  $('reconstruct3d').disabled=true;
}
async function refreshHardware() {
  try {motionRuntime=await api('/api/breakdown/motion-runtime');}
  catch (_) {motionRuntime={ready:false,message:'尚未接通本地动作组件，请安装配套版本后检测。'};}
  const hardware=motionRuntime.gpu?`${motionRuntime.gpu} · 显存${motionRuntime.vramGB}GB / 当前可用${motionRuntime.freeVramGB}GB · 内存${motionRuntime.ramGB || '未知'}GB。 `:'';
  $('motionHardware').textContent=(motionRuntime.bundled?'已检测到内置深度组件，无需另装Python或下载模型。 ':'')+hardware+(motionRuntime.message || '暂不能运行本地提取。')+' 建议使用NVIDIA显卡（8GB显存）和32GB内存；本机已验证RTX 3070 / 8GB显存 / 32GB内存，不代表最低配置。仅CPU暂不支持此版本；提取期间会占用显卡和内存，请关闭大型游戏或其他AI任务。';
  if(!motionRuntime.ready && !motionRuntime.installAvailable && !motionRuntime.bundled) $('motionHardware').textContent+=' 当前版本未检测到完整组件，请使用配套离线完整版；本页不会自动下载。';
  referenceWorkflowControls();
  controls();
}
function renderMotion() {
  depthComparison?.destroy();depthComparison=null;
  $('motionPanel').classList.toggle('hidden',project?.media!=='video');
  if(referenceWorkflowProject!==project?.id){
    referenceWorkflowProject=project?.id || '';
    $('referenceWorkflow').value=project?.referenceWorkflow || 'depth';
  }
  referenceWorkflowControls();
  const motion=project?.motionReference;
  $('motionPreview').innerHTML=motion?`<div class="depth-preview-grid"><div><b>原视频 · 所选区间</b><video id="depthSource" controls controlslist="nodownload" muted playsinline preload="metadata" src="${mediaUrl(project.sourceFile)}"></video></div><div><b>灰白深度参考 · 无音轨</b><video id="depthResult" controls controlslist="nodownload" playsinline preload="metadata" src="${mediaUrl(motion.file)}"></video></div></div><p class="muted">${motion.quality==='light'?'轻量':'精细'}时序深度 · ${motion.duration}秒 · ${motion.width}×${motion.height} · 24FPS · 本机处理${motion.processingSeconds}秒 · 无音轨</p><div class="row"><label class="depth-sync"><input id="depthSync" type="checkbox" checked> 同步对照</label><button id="restartDepth">从片段起点播放</button><button id="zoomMotion">放大深度视频</button><a id="downloadMotion" href="${mediaUrl(motion.file)}&download=1">下载灰白深度视频</a></div><p id="depthCompareHint" class="muted" role="status">左侧原片 / 右侧灰白深度 · 提取不改变原素材。</p><p class="muted">${validMotion()?'已与当前拆解区间对应，可点击“用于创意复刻”。':'请先按相同起点和范围完成素材拆解，才能用于创意复刻。'}</p>`:'<div class="depth-empty"><b>灰白深度参考将在这里显示</b><p>先在右侧选择起点和范围，再点击“提取灰白深度视频”。完成后可对照动作，并搭配新人物、场景生成创意视频。</p></div>';
  if(motion && project.media==='video')depthComparison=new window.BreakdownCompare($('depthSource'),$('depthResult'),{
    start:motion.settings?.start || 0,duration:motion.duration,
    notify:message=>{if($('depthCompareHint'))$('depthCompareHint').textContent=message.replace('右生成结果','右灰白深度参考');}});
}
function selectedModel() {
  const key = project?.media === 'image' ? 'imageModel' : $('mode').value === 'edit' ? 'editModel' : 'videoModel';
  // Never restore an ineligible backend default when the visible list is empty.
  const id = $('generationModel').value;
  const dynamic=project?.media==='video' && key==='videoModel' && $('referenceStrategy').value!=='text';
  return (config.visualModels || []).find(item => item.model === id && item.media===project?.media && item.enabled && item.gatewayReady &&
    (key === 'editModel'?item.supportsPreciseEdit:!item.supportsPreciseEdit) && (!dynamic || item.supportsVideoReference) && ($('mode').value!=='model_edit' || item.supportsVideoEdit));
}
function generationSettings() {
  similarityControls();
  const image = project?.media === 'image';
  const dynamic=!image && $('mode').value==='creative' && $('referenceStrategy').value!=='text';
  $('referenceStrategyField').classList.toggle('hidden',image || $('mode').value!=='creative');
  $('referenceHint').textContent=image || $('mode').value!=='creative'?'':dynamic?
    '只显示已接通视频参考的模型。灰白深度用于动作、空间与运镜；请搭配新角色、场景参考及创意相似度。画面参考不承诺逐帧相同，声音按下方选项另行处理。Seedance官方接口的真人人脸素材还需符合授权素材库规则，普通上传不等于已获接口准入。':'仅传文字与图片，容易偏离原片动作和节奏；不适用于精准人物替换。';
  if(!image && $('mode').value==='model_edit') $('referenceHint').textContent='使用原视频及所选元素参考图执行模型编辑；结果需对照验收，不承诺逐帧相同或未选区域像素完全不变。';
  $('mode').closest('label').classList.toggle('hidden', image);
  $('duration').closest('label').classList.toggle('hidden', image);
  $('ratio').closest('label').classList.toggle('hidden', image);
  $('imageSizeField').classList.toggle('hidden', !image);
  const key=image?'imageModel':$('mode').value==='edit'?'editModel':'videoModel';
  const select=$('generationModel'), pricesForMedia=image?config.visualImagePricing:config.visualVideoPricing;
  const choices=(config.visualModels || []).filter(row => row.media===(image?'image':'video') && row.enabled && row.gatewayReady &&
    (key==='editModel'?row.supportsPreciseEdit:!row.supportsPreciseEdit) &&
    (!dynamic || row.supportsVideoReference) && ($('mode').value!=='model_edit' || row.supportsVideoEdit) &&
    (row.pricingMode==='live_quote'||(pricesForMedia || []).some(price => price.model===row.model)));
  const previousModel=generationKey===key?select.value:'', defaultId=config.breakdownModels?.[key];
  const profile=generationProfile();
  const renderChoices=rows=>rows.map(row => `<option value="${esc(row.model)}">${esc(image?row.displayName:ModelPresentation.videoOptionLabel(profile,row))}${row.model===defaultId?' · 默认':''}</option>`).join('');
  const optionMarkup=!image && Array.isArray(profile.videoRouteGroups) ? ModelPresentation.routeEntries(profile,'video').map(([id,label])=>{
    const options=renderChoices(choices.filter(row=>ModelPresentation.routeForModel(profile,'video',row.model)===id));
    return options?`<optgroup label="${esc(label)}">${options}</optgroup>`:'';
  }).join('') : renderChoices(choices);
  select.innerHTML=optionMarkup || '<option value="">尚无可用模型</option>';
  select.value=choices.some(row=>row.model===previousModel)?previousModel:choices.some(row=>row.model===defaultId)?defaultId:choices[0]?.model || '';
  preserveRetiredModel(select,previousModel,choices);
  generationKey=key;
  const model = selectedModel();
  const previous = $('resolution').value;
  const prices = project?.media==='image'?config.visualImagePricing:config.visualVideoPricing;
  const priced = [...new Set((prices || []).filter(item => item.model===model?.model).map(item => String(item.resolution || '').toLowerCase()).filter(Boolean))];
  const supported=(model?.supportedResolutions || []).map(item => String(item).toLowerCase());
  const available=model?.pricingMode==='live_quote'?supported:priced.filter(item => !supported.length || supported.includes(item));
  $('resolution').innerHTML = available.length?available.map(value => `<option value="${esc(value)}">${esc(value.toUpperCase())}</option>`).join(''):
    `<option value="">${model?'未发布可用清晰度价格':'请先配置可用专用模型'}</option>`;
  if ([...$('resolution').options].some(option => option.value === previous)) $('resolution').value = previous;
  if(image && available.length) {
    if($('resolution').value==='2k')$('imageSize').value='2048x2048';
    else if($('imageSize').value==='2048x2048')$('imageSize').value='1024x1024';
  }
  generationDurationControls();
  generationRatioControls();
  const quote=image?ModelPresentation.imageQuote(generationProfile(),model?.model || '',$('resolution').value,1):ModelPresentation.quote(generationProfile(),model?.model || '',$('resolution').value,generationDurationValue(),'economy',$('ratio').value);
  const billing=ModelPresentation.isLiveQuote(generationProfile(),image?'image':'video',model?.model)?'实时核价 · 按实际输入确认本次积分':image?'按张计费':quote?.priceBasis172==='sku'?`${generationDurationValue()}秒 · ${$('ratio').value} · 按规格 ${quote.points}积分/条`:quote?.billingMode==='flat'?`按次计费 · ${quote.rate}积分/次`:'按生成秒数计费';
  $('modelState').textContent = model ? `专用模型：${model.displayName} · ${billing}${quote&&!ModelPresentation.isLiveQuote(generationProfile(),image?'image':'video',model?.model)?` · 本次预计${quote.points}积分`:''}${available.length?'':' · 尚未发布支持的清晰度价格，暂不可提交'}` :
    $('mode').value==='model_edit'?'尚未接通模型视频编辑；需要发布FreeAI Seedance编辑协议，不提交、不扣费。':$('mode').value==='edit'?'尚未发布支持原片局部编辑的专用服务；普通生成模型不可替代，不会提交或扣费。':dynamic?'后台尚未接通动态参考模型及公网素材传输，已阻止按文字生成冒充动作复刻；不提交、不扣费。':'后台尚未配置此模式的可用专用模型；不会提交或扣费。';
  if(!image && $('mode').value==='creative' && $('referenceStrategy').value==='depth' && !validMotion()) $('modelState').textContent+=' 请先提取与当前拆解区间一致的本地深度参考。';
  if(!image && $('mode').value==='creative' && $('referenceStrategy').value==='depth' && $('referenceWorkflow').value==='dynamic3d') $('modelState').textContent+=' 当前选择动态人体三维路线，引擎尚未接入；不能拿深度视频冒充三维结果，不提交、不扣费。';
  $('generationWarning').textContent=image?'':ModelPresentation.activityWarning(generationProfile(),model?.model || '',$('resolution').value);
  $('generationWarning').classList.toggle('hidden',!$('generationWarning').textContent);
  controls();
  if(!image && $('mode').value==='creative' && $('referenceStrategy').value==='depth' && !validMotion()) $('generate').disabled=true;
}
function renderElements() {
  const bindings = new Map((project.replacements || []).map(item => [item.elementId,item]));
  $('elements').innerHTML = (project.analysis.elements || []).map(item => {
    const binding = bindings.get(item.id);
    const scope=binding?.replacementScope || (item.kind==='person'?'person_full':'object');
    const scopeField=item.kind==='person'?`<label>人物替换范围<select class="replacement-scope"><option value="person_full" ${scope==='person_full'?'selected':''}>换整个人 · 采用参考图服装</option><option value="face" ${scope==='face'?'selected':''}>只换脸 · 保留原服装</option><option value="person_keep_clothes" ${scope==='person_keep_clothes'?'selected':''}>换人物 · 保留原服装</option></select></label><p class="muted">默认使用参考图前景主体；有多个人时，请在下方说明替换谁，不会把参考图背景整体搬入视频。</p>`:'';
    const thumb=project.analysis.id && item.bbox?mediaUrl('asset-'+project.analysis.id+'-'+item.id+'.jpg'):mediaUrl('thumb.jpg');
    return `<article class="element ${binding?'selected':''} ${item.id===activeElement?'active':''}" data-id="${esc(item.id)}"><details ${item.id===activeElement?'open':''}><summary><input class="replace" type="checkbox" ${binding?'checked':''} aria-label="替换${esc(item.name)}"><img class="asset-thumb" loading="lazy" src="${thumb}" alt="${esc(item.name)}代表帧裁切"><span class="asset-title"><b>${esc(item.name)}</b><small>${esc(kinds[item.kind] || '其他')}</small></span></summary><p>${esc(item.description)}</p><div class="row"><button class="locate" type="button">定位原对象</button><label class="upload">上传替换图<input class="reference" type="file" accept="image/jpeg,image/png,image/webp"></label></div><div class="ref-preview">${binding?.referenceFile?`<img src="${mediaUrl(binding.referenceFile)}" alt="替换参考图">`:''}</div><button class="select-reference-subject" type="button">${binding?.referenceCrop?'重新选择参考主体':'选择参考主体 · 框选'}</button>${scopeField}<input class="instruction" placeholder="例如：采用参考图前景戴眼镜女士，忽略背景人物" value="${esc(binding?.instruction || '')}"></details></article>`;
  }).join('');
  $('assetCount').textContent=(project.analysis.elements || []).length+' 个';
}
function render() {
  destroyComparison();
  if(similarityProject!==project.id){similarityProject=project.id;$('creativeSimilarity').value=project.creativeSimilarity ?? 80;$('similarityNumber').value=$('creativeSimilarity').value;}
  $('preview').querySelector('video')?.pause();
  $('projectName').textContent = project.name;
  $('preview').innerHTML = project.media === 'image' ? `<img src="${mediaUrl(project.sourceFile)}" alt="原素材">` : `<video controls controlslist="nodownload" playsinline src="${mediaUrl(project.sourceFile)}"></video>`;
  const source = $('preview').firstElementChild;
  source.addEventListener('load', () => showBoxes(0));
  source.addEventListener('loadeddata', () => showBoxes(0));
  if (project.media === 'video') {
    source.addEventListener('timeupdate', () => showBoxes(source.currentTime-Number(project.analysis?.segmentStart || 0)));
    source.addEventListener('play', () => $('preview').querySelectorAll('.object-box').forEach(node => node.remove()));
    source.addEventListener('pause', () => showBoxes(source.currentTime-Number(project.analysis?.segmentStart || 0)));
  }
  renderComparison();
  $('segment').classList.toggle('hidden', project.media === 'image');
  $('analysisModeField').classList.toggle('hidden', project.media === 'image');
  $('analysisModeHint').classList.toggle('hidden', project.media === 'image');
  renderMotion();
  if (project.analysis) {
    if (!project.analysis.elements.some(row=>row.id===activeElement)) activeElement=project.analysis.elements[0]?.id || '';
    $('start').value = project.analysis.segmentStart || 0;
    $('summary').textContent = project.analysis.summary || '';
    $('analysisMode').value=project.analysis.analysisMode==='fast'?'fast':'detailed';
    const performance=project.analysis.performance;
    $('analysisPerformance').textContent=performance?
      `${project.analysis.analysisMode==='fast'?'快速拆解':'精细拆解'} · ${performance.sampledFrames || 1}个采样点 / ${performance.transmittedFrames}张画面 · 本地准备${performance.preparationSeconds}秒 · 发送及模型等待${performance.modelSeconds}秒`:'';
    $('prompt').value = project.analysis.prompt || '';
    $('rules').textContent = [project.analysis.style,...(project.analysis.rules || [])].filter(Boolean).join('\n');
    $('shots').textContent = JSON.stringify({shots:project.analysis.shots || [],uncertainties:project.analysis.uncertainties || []},null,2);
    const durationAnalysis=`${project.id}/${project.analysis.id || ''}/${project.analysis.segmentStart || 0}/${project.analysis.duration || 0}`;
    if(generationDurationAnalysis!==durationAnalysis){generationDurationAnalysis=durationAnalysis;generationDurationRequested=project.analysis.duration || 15;}
    renderElements();
  }
  $('analysisPanel').classList.toggle('hidden', !project.analysis);
  $('generatePanel').classList.toggle('hidden', !project.analysis);
  audioSettings259();
  $('results').innerHTML = (project.results || []).filter(row=>row.saved===false && !row.deleted).slice().reverse().map(item => `<article class="result" data-file="${esc(item.file)}">${project.media === 'image'?`<img src="${mediaUrl(item.file)}" alt="待验收结果">`:'<button class="compare-result wide">在中间左右对照播放</button>'}<p>${item.name?esc(item.name)+' · ':''}${esc(item.modelName)} · ${item.mode==='edit'?'精准局部替换':item.mode==='model_edit'?'模型视频编辑 · 待验收':'创意复刻'}${item.mode==='creative' && item.creativeSimilarity!=null?` · 参考强度${esc(item.creativeSimilarity)}%`:''} · ${esc(item.resolution)}</p>${project.media==='video'?resultAudioState259(item):''}<div class="row"><button class="accept-result primary">保存作品</button><button class="zoom-result">放大浏览</button><button class="discard-result">移除结果</button><a href="${mediaUrl(item.file)}&download=1">下载结果</a>${project.media==='video'&&item.media!=='image'?resultAudioActions259(item.file):''}</div></article>`).join('') || '<p class="empty">暂无待验收结果。已保存的作品可在顶部“已保存作品”查看。</p>';
  if (project.media === 'image') $('mode').value = 'creative';
  generationSettings();
  if (project.error) status(project.error);
  showFocus();
}
function replacements() {
  const saved = new Map((project.replacements || []).map(item => [item.elementId,item]));
  return [...$('elements').children].filter(row => row.querySelector('.replace').checked).map(row => ({elementId:row.dataset.id,referenceFile:saved.get(row.dataset.id)?.referenceFile || '',referenceSourceFile:saved.get(row.dataset.id)?.referenceSourceFile || '',referenceCrop:saved.get(row.dataset.id)?.referenceCrop || null,instruction:row.querySelector('.instruction').value,replacementScope:row.querySelector('.replacement-scope')?.value || 'object'}));
}
function paintReferenceCrop() {
  if(!cropState) return;
  const [x,y,w,h]=cropState.box;
  Object.assign($('cropBox').style,{left:(x*100)+'%',top:(y*100)+'%',width:(w*100)+'%',height:(h*100)+'%'});
  const ready=$('cropPicture').naturalWidth>0 && w*$('cropPicture').naturalWidth>=16 && h*$('cropPicture').naturalHeight>=16;
  $('applyCrop').disabled=!ready || cropState.saving;
  $('cropHint').textContent=ready?'已选区域：'+Math.round(w*$('cropPicture').naturalWidth)+' × '+Math.round(h*$('cropPicture').naturalHeight)+'像素；确认后只将这个区域作为替换参考。':'拖动框选主体，区域至少16 × 16像素。';
}
function openReferenceCrop(row) {
  if(busy || polling || project?.generation) throw new Error('请等待当前任务完成再选择参考主体。');
  const binding=project.replacements?.find(item=>item.elementId===row.dataset.id);
  if(!binding?.referenceFile) throw new Error('请先上传此对象的替换参考图，再框选主体。');
  if(!row.querySelector('.replace').checked) throw new Error('请先勾选该替换对象，再选择参考主体。');
  cropState={projectId:project.id,elementId:row.dataset.id,file:binding.referenceSourceFile || binding.referenceFile,box:binding.referenceCrop?.slice() || [0,0,1,1],saving:false};
  $('cropHint').textContent='正在读取参考图…';$('applyCrop').disabled=true;
  $('cropPicture').src=mediaUrl(cropState.file);$('cropDialog').showModal();
}
function cropPoint(event) {
  const rect=$('cropPicture').getBoundingClientRect();
  return [Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))];
}
async function useReferenceSubject(original=false) {
  if(!cropState || cropState.saving || busy || polling || project?.generation) return;
  const state=cropState;
  if(project.id!==state.projectId) throw new Error('项目已切换，请重新选择参考主体。');
  state.saving=true;paintReferenceCrop();$('originalReference').disabled=true;
  try {
    const data=original?{file:state.file,referenceSourceFile:state.file,referenceCrop:null}:
      await api('/api/breakdown/reference-crop',{projectId:state.projectId,file:state.file,box:state.box});
    const binding=project.replacements.find(item=>item.elementId===state.elementId);
    Object.assign(binding,{referenceFile:data.file,referenceSourceFile:data.referenceSourceFile,referenceCrop:data.referenceCrop});
    const row=[...$('elements').children].find(node=>node.dataset.id===state.elementId);
    row.querySelector('.ref-preview').innerHTML=`<img src="${mediaUrl(data.file)}" alt="替换参考图">`;
    row.querySelector('.select-reference-subject').textContent=data.referenceCrop?'重新选择参考主体':'选择参考主体 · 框选';
    await persist();
    $('cropDialog').close();status(original?'已恢复原始参考图，原文件未修改；未调用模型。':'已保存参考主体范围，原照片未修改；未调用模型或扣费。');
  } finally {state.saving=false;$('originalReference').disabled=false;if(cropState)paintReferenceCrop();}
}
function showBoxes(time) {
  const preview=$('preview'), source=preview.querySelector('video,img');
  preview.querySelectorAll('.object-box').forEach(node => node.remove());
  if (!source || !project?.analysis || source.tagName==='VIDEO' && !source.paused) return;
  preview.style.position='relative';
  const rect=source.getBoundingClientRect(), root=preview.getBoundingClientRect();
  const intrinsicWidth=source.videoWidth || source.naturalWidth, intrinsicHeight=source.videoHeight || source.naturalHeight;
  if (!intrinsicWidth || !intrinsicHeight) return;
  const scale=Math.min(rect.width/intrinsicWidth,rect.height/intrinsicHeight), width=intrinsicWidth*scale,height=intrinsicHeight*scale;
  const left=rect.left-root.left+(rect.width-width)/2,top=rect.top-root.top+(rect.height-height)/2;
  for (const element of (project.analysis.elements || []).filter(row=>row.id===activeElement)) {
    if (!element.bbox || project.media==='video' && Math.abs(Number(element.frameTime || 0)-time)>.75) continue;
    const [x,y,w,h]=element.bbox, button=document.createElement('button');button.type='button';button.className='object-box';
    button.textContent='';button.title='点击选择替换对象：'+element.name;
    Object.assign(button.style,{position:'absolute',left:(left+x*width)+'px',top:(top+y*height)+'px',width:(w*width)+'px',height:(h*height)+'px',border:'2px dashed #ffd17a',background:'transparent',color:'#ffd17a',textShadow:'0 1px 3px #000',fontWeight:'bold',display:'flex',alignItems:'flex-start',zIndex:2});
    button.addEventListener('click',() => {
      const row=[...$('elements').children].find(row => row.dataset.id===element.id);
      if (!row || busy || polling || project.generation) return;
      row.querySelector('.replace').checked=true;row.classList.add('selected');row.scrollIntoView({behavior:'smooth',block:'center'});
      status('已选择 '+element.name+'；请上传该对象的替换参考图。定位框不是精确遮罩。');
    });
    preview.append(button);
  }
}
async function persist() {
  const similarity=Number($('similarityNumber').value);
  if(!$('similarityNumber').value.trim() || !Number.isInteger(similarity) || similarity<0 || similarity>100)throw new Error('创意相似度请输入0至100之间的整数。');
  const analysis = {...project.analysis,prompt:$('prompt').value};
  const data = await api('/api/breakdown/save',{projectId:project.id,analysis,replacements:replacements(),creativeSimilarity:similarity});
  project = data.project;
  $('creativeSimilarity').value=project.creativeSimilarity ?? similarity;
  $('similarityNumber').value=$('creativeSimilarity').value;
  similarityControls();
}
async function loadProject(id) {
  destroyComparison();$('preview').querySelector('video')?.pause();
  clearTimeout(pollTimer); polling = false;clearProgress();
  project = (await api('/api/breakdown/project?id='+encodeURIComponent(id))).project;
  activeElement='';generationKey='';
  $('creativeSimilarity').value=project.creativeSimilarity ?? 80;
  $('similarityNumber').value=$('creativeSimilarity').value;
  $('rights').checked=true;
  localStorage.setItem('dramaBreakdownProjectId',id);
  render();
  if (project.taskId) await poll(project.taskId, id);
}
async function poll(taskId, projectId) {
  if (!project || project.id !== projectId) return;
  let terminalTask=null;
  try {
    const task = await api('/api/tasks/'+encodeURIComponent(taskId));
    const data = task.task || task;
    taskProgress(data);
    if (['running','queued'].includes(data.state)) {
      polling = true; controls(); status(data.message || '处理中');
      pollTimer = setTimeout(() => poll(taskId,projectId),1800);
      return;
    }
    polling = false;
    terminalTask=data;
    const audioFailure259=data.result?.audioStatus==='failed'?String(data.result.audioWarning||'画面已保存，保留原声未完成；可仅重试本地原声处理。'):'';
    if(audioFailure259&&data.result?.file)audioWarnings259.set(projectId+'\n'+data.result.file,audioFailure259);
    endProgress(data.state==='error'?(data.error || data.message || '任务未完成'):'任务已完成',data.state==='error',data.finishedAt);
    project = (await api('/api/breakdown/project?id='+encodeURIComponent(projectId))).project;
    if(data.kind==='breakdown_motion_install')await refreshHardware();
    render();
    if (data.state === 'error') status(data.error || data.message);
    else if (data.state === 'done') status(audioFailure259||'任务已完成，用时 '+durationText(progressState.finishedAt-progressState.startedAt)+(data.kind==='breakdown_motion_install'?'。本地组件安装已完成，没有提交视频生成或扣积分。':data.kind==='breakdown_motion'?'。动作参考已保存在当前项目，可播放或下载；生成视频仍需单独确认。':'。新生成结果请验收后点击保存作品。'));
    controls();
  } catch (error) {
    if (terminalTask) {
      polling=false;
      const message=terminalTask.state==='error'?(terminalTask.error || terminalTask.message || '任务未完成'):'任务已结束，结果列表暂未读取成功，请重新打开本项目领取结果。';
      endProgress(message,terminalTask.state==='error',terminalTask.finishedAt);controls();
      status(message+' · 项目记录暂未刷新：'+error.message+'；不会重新提交模型。');
      return;
    }
    if (error.status===404) {
      polling=false;
      endProgress('本地任务已结束或程序已重启',true);
      project=(await api('/api/breakdown/project?id='+encodeURIComponent(projectId))).project;
      render();controls();
      if (project.error) {
        beginProgress(project.generation?'breakdown_generation':'breakdown_analyze',project.error);
        endProgress(project.error,true);
        status(project.error+(project.generation?' 请继续核对原请求回执；不会重新生成或扣费。':''));
      } else {
        status(project.generation?'本地任务已结束或程序已重启，请继续查询原生成请求；不会重新扣费。':'本地任务已结束或程序已重启，已保留历史结果；如需再次拆解，请确认新的调用价格。');
      }
      return;
    }
    polling = true; controls(); if(progressState) {progressState.message='正在恢复原任务查询…';paintProgress();}
    status('正在恢复任务查询，未重新提交模型、未重复扣费… '+error.message);
    pollTimer = setTimeout(() => poll(taskId,projectId),5000);
  }
}
async function upload(file, media) {
  if (!file) return;
  busy = true; controls(); status('正在导入素材，未调用模型…');
  try {
    const data = await api('/api/breakdown/upload',file,{'X-Filename':encodeURIComponent(file.name),'X-Media-Type':media,'Content-Type':'application/octet-stream'});
    project = data.project; polling = false; clearTimeout(pollTimer);clearProgress();
    activeElement='';generationKey='';$('rights').checked=true;
    localStorage.setItem('dramaBreakdownProjectId',project.id); render(); await listProjects(); status('素材已导入，可以开始拆解；请确保拥有素材使用权及所需肖像授权。');
  } finally { busy = false; controls(); }
}
async function listProjects() {
  const data = await api('/api/breakdown/projects');
  $('projects').innerHTML = '<option value="">历史拆解项目</option>'+(data.projects || []).map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  if (project) $('projects').value = project.id;
}
let catalogFlight277=null;
const breakdownCatalogSignature=value=>JSON.stringify([value.visualConfigRevision,value.visualModels,value.videoRouteGroups,value.visualImagePricing,value.visualVideoPricing,value.visualVideoSkuPricing172,value.textButtonBindings,value.textModelPricing,value.breakdownModels]);
function refreshModelCatalog(){
  if(catalogFlight277)return catalogFlight277;
  catalogFlight277=api('/api/client/config?refresh=1').then(received=>{
    if(received.configError)throw Error('后台模型目录同步失败，请稍后重试。');
    if(breakdownCatalogSignature(config)===breakdownCatalogSignature(received))return;
    config=received;
    analysisSettings();
    if(project)generationSettings();else controls();
  }).finally(()=>{catalogFlight277=null;});
  return catalogFlight277;
}
function syncOpenBreakdownCatalog(){
  if(document.hidden||busy||window.frameElement&&!window.frameElement.getClientRects().length)return;
  void refreshModelCatalog().catch(error=>status(error.message));
}
window.addEventListener('focus',syncOpenBreakdownCatalog);
setInterval(syncOpenBreakdownCatalog,30000);
async function refresh() {
  await refreshModelCatalog();
  await listProjects();
  // Hardware probing must not delay opening projects or image-only work.
  refreshHardware();
}
function handle(id,event,fn) { $(id).addEventListener(event,async e => {try { await fn(e); } catch(error) {if(progressState?.running)endProgress('任务未完成',true);status(error.message);} }); }
handle('imageUpload','change',e => upload(e.target.files[0],'image'));
handle('videoUpload','change',e => upload(e.target.files[0],'video'));
handle('projects','change',e => e.target.value && loadProject(e.target.value));
handle('reload','click',refresh);
handle('rights','change',controls);
handle('audioMode259','change',audioSettings259);
handle('analysisModel','change',analysisPrice);
handle('generationModel','change',generationSettings);
handle('ratio','change',()=>{generationRatioControls();controls();});
handle('mode','change',generationSettings);
handle('duration','input',()=>{generationDurationRequested=$('duration').value;generationSettings();CreditGate.recalculate();});
handle('useFixedDuration','click',()=>{
  if(!project?.analysis || busy || polling || project.generation || $('mode').value==='edit')return;
  const fixed=ModelPresentation.videoDurationInfo(generationProfile(),$('generationModel').value).fixed;
  if(fixed==null)return;
  generationDurationRequested=fixed;generationSettings();CreditGate.recalculate();
  status(`本次生成时长已设为${fixed}秒，原片选段与拆解结果保持原样；尚未提交生成或扣积分。`);
});
handle('prompt','input',similarityControls);
handle('creativeSimilarity','input',()=>{$('similarityNumber').value=$('creativeSimilarity').value;similarityControls();});
handle('similarityNumber','input',()=>{const value=Number($('similarityNumber').value);if($('similarityNumber').value!=='' && Number.isInteger(value) && value>=0 && value<=100){$('creativeSimilarity').value=value;similarityControls();}});
handle('useTextCreativity','click',()=>{$('referenceStrategy').value='text';generationKey='';generationSettings();status('已切换为文字创意：保留当前相似度和素材绑定，不再发送原视频/深度视频；尚未提交生成或扣积分。');});
handle('referenceStrategy','change',()=>{generationKey='';generationSettings();});
handle('referenceWorkflow','change',async()=>{
  if(!project || busy || polling || project.generation)return;
  const previous=project.referenceWorkflow || 'depth', selected=$('referenceWorkflow').value;
  busy=true;controls();
  try {
    const data=await api('/api/breakdown/reference-workflow',{projectId:project.id,referenceWorkflow:selected});
    project=data.project;referenceWorkflowControls();generationSettings();
    status(selected==='depth'?'已保存灰白深度视频路线；未调用模型或扣积分。':'已保存动态人体三维路线偏好；引擎尚未接入，未创建重建任务或扣积分。');
  } catch(error){$('referenceWorkflow').value=previous;referenceWorkflowControls();throw error;}
  finally{busy=false;controls();}
});
handle('useMotion','click',()=>{
  if(busy || polling || project?.generation || $('referenceWorkflow').value!=='depth' || !validMotion())return;
  $('mode').value='creative';$('referenceStrategy').value='depth';generationKey='';generationSettings();
  $('generatePanel').scrollIntoView({behavior:'smooth',block:'start'});
  status('已连接灰白深度参考到创意复刻。请选人物／场景、相似度及生成模型，再确认费用；尚未提交生成。');
});
handle('refreshHardware','click',refreshHardware);
handle('installMotion','click',async()=>{
  if(!project || busy || polling || motionRuntime.ready || !motionRuntime.installAvailable)return;
  if(!await studioConfirm('将为这台电脑下载数GB独立显卡推理组件及深度模型，至少预留8GB可用磁盘空间。\n只在本机安装，不扣积分，也不自动生成视频。安装中可以停止，未完成文件会保留供检查，不会自动重装。\n确认开始安装？'))return;
  busy=true;controls();
  try {
    beginProgress('breakdown_motion_install','正在创建本地组件安装任务…');
    const data=await api('/api/breakdown/motion-install',{projectId:project.id,installConfirmed:true});
    if(data.ready){endProgress('组件已就绪，无需重复下载。');await refreshHardware();}
    else await poll(data.taskId,project.id);
  } finally {busy=false;controls();}
});
handle('extractMotion','click',async()=>{
  if(!project || busy || polling || !motionRuntime.ready || $('referenceWorkflow').value!=='depth')return;
  busy=true;controls();
  try {
    beginProgress('breakdown_motion','正在创建本地动作参考任务；未调用付费模型…');
    const data=await api('/api/breakdown/motion',{projectId:project.id,referenceWorkflow:$('referenceWorkflow').value,start:Number($('start').value),limit:Number($('limit').value),quality:$('motionQuality').value});
    if(data.cached){project=data.project;endProgress('已复用本地动作参考，未调用付费模型。');render();}
    else await poll(data.taskId,project.id);
  } finally {busy=false;controls();}
});
handle('cancelMotion','click',async()=>{await api('/api/breakdown/motion-cancel',{projectId:project.id});status('已请求停止本地任务；不影响原素材，未调用付费模型。');});
handle('motionPreview','click',async e=>{
  if(e.target.id==='depthSync')depthComparison?.setSync(e.target.checked);
  if(e.target.id==='restartDepth')depthComparison?.restart();
  if(e.target.id==='zoomMotion')openViewer(mediaUrl(project.motionReference.file),'video','本地时序深度参考');
  if(e.target.id==='downloadMotion'){e.preventDefault();await saveResultFile(e.target.getAttribute('href'),project.motionReference.file);}
});
handle('resolution','change',() => {if(project?.media==='image') $('imageSize').value=$('resolution').value==='2k'?'2048x2048':'1024x1024';generationSettings();});
handle('imageSize','change',() => {const tier=$('imageSize').value==='2048x2048'?'2k':'1k';if([...$('resolution').options].some(option => option.value===tier)) $('resolution').value=tier;});
handle('save','click',async () => {await persist(); status('提示词与素材绑定已保存，未调用模型。');});
handle('analyze','click',async () => {
  if (!project || busy || polling || !$('rights').checked) return;
  busy = true; controls();
  try {
    const analysisMode=project.media==='video'?$('analysisMode').value:'detailed';
    const modeNotice=project.media==='video'?(analysisMode==='fast'?'快速拆解：约每1秒采样，可能漏过瞬间动作；不改变原片。':'精细拆解：每0.5秒采样，适合快速动作。'):'图片拆解';
    if (!await studioConfirm(`${modeNotice}\n拆解将按实际模型调用次数计费：每次${analysisCost()}积分。\n上传、采样和查询不收费。确认开始？`)) return;
    beginProgress('breakdown_analyze','正在创建拆解任务…'); controls();status('正在创建拆解任务，尚未收到模型结果…');
    const data = await api('/api/breakdown/analyze',{projectId:project.id,model:$('analysisModel').value,analysisMode,start:Number($('start').value),limit:Number($('limit').value),rightsConfirmed:true}); await poll(data.taskId,project.id);
  }
  finally {busy = false; controls();}
});
handle('elements','change',async e => {
  const row = e.target.closest('.element'); if (!row) return;
  if (e.target.classList.contains('replace')) {row.classList.toggle('selected',e.target.checked); return;}
  if (!e.target.classList.contains('reference') || !e.target.files[0]) return;
  if (busy || polling || project.generation) throw new Error('请等待当前任务完成再上传替换图。');
  const file = e.target.files[0];
  await useCharacterReference(row,file);
});
async function useCharacterReference(row,file) {
  if (busy || polling || project.generation) throw new Error('请等待当前任务完成再选择替换形象。');
  const data = await api('/api/breakdown/reference',file,{'X-Project-Id':project.id,'Content-Type':'application/octet-stream'});
  project.replacements ||= [];
  let binding = project.replacements.find(item => item.elementId === row.dataset.id);
  if (!binding) {binding = {elementId:row.dataset.id}; project.replacements.push(binding);}
  binding.referenceFile = data.file;
  binding.referenceSourceFile = data.file; binding.referenceCrop = null;
  row.querySelector('.replace').checked = true; row.classList.add('selected');
  row.querySelector('.ref-preview').innerHTML = `<img src="${mediaUrl(data.file)}" alt="替换参考图">`;
  row.querySelector('.select-reference-subject').textContent='选择参考主体 · 框选';
  controls();
}
CharacterPicker.install('.element', async (row,role) => {
  await useCharacterReference(row,role.file);
  status(`已使用角色“${role.character.name}”的形象。人物音色需要在“为视频选择音色与新台词”中逐段确认；当前不会假装已替换原声。`);
}, row => project?.analysis?.elements?.find(item => item.id===row.dataset.id)?.kind==='person');
handle('elements','click',e => {
  if(e.target.classList.contains('select-reference-subject')) {openReferenceCrop(e.target.closest('.element'));return;}
  if (e.target.closest('.ref-preview img')) {openViewer(e.target.src,'image','替换参考图');return;}
  if (!e.target.classList.contains('locate') && !e.target.closest('summary')) return;
  if(e.target.classList.contains('replace')) return;
  const row=e.target.closest('.element');
  const item = project.analysis.elements.find(item => item.id === row.dataset.id);
  activeElement=item.id;
  $('elements').querySelectorAll('.element').forEach(node=>node.classList.toggle('active',node===row));
  showFocus();
  const video = $('preview').querySelector('video');
  if (video) {video.pause(); video.currentTime = Number(project.analysis.segmentStart || 0) + Number(item.frameTime || 0);}
  else showBoxes(0);
  $('preview').scrollIntoView({block:'center',behavior:'smooth'});
  status(`${item.name}：${item.description || ''}；代表帧${item.frameTime || 0}秒，定位框${JSON.stringify(item.bbox)}。此框不是精确遮罩。`);
});
handle('cropPicture','load',paintReferenceCrop);
handle('cropPicture','error',()=>{if(cropState){$('cropHint').textContent='参考图读取失败，请关闭后重新打开。';$('applyCrop').disabled=true;}});
handle('cropSurface','pointerdown',e=>{
  if(!cropState || cropState.saving || e.button!==0 || !$('cropPicture').naturalWidth)return;
  e.preventDefault();cropState.origin=cropPoint(e);cropState.pointer=e.pointerId;
  $('cropSurface').setPointerCapture(e.pointerId);cropState.box=[...cropState.origin,0,0];paintReferenceCrop();
});
handle('cropSurface','pointermove',e=>{
  if(!cropState?.origin || cropState.pointer!==e.pointerId)return;
  const [x,y]=cropPoint(e),[left,top]=cropState.origin;
  cropState.box=[Math.min(x,left),Math.min(y,top),Math.abs(x-left),Math.abs(y-top)];paintReferenceCrop();
});
for(const event of ['pointerup','pointercancel'])handle('cropSurface',event,e=>{if(cropState?.pointer===e.pointerId){cropState.origin=null;cropState.pointer=null;}});
handle('resetCrop','click',()=>{if(cropState && !cropState.saving){cropState.box=[0,0,1,1];paintReferenceCrop();}});
handle('cancelCrop','click',()=>{if(!cropState?.saving)$('cropDialog').close();});
handle('cropDialog','cancel',e=>{if(cropState?.saving)e.preventDefault();});
handle('cropDialog','close',()=>{cropState=null;});
handle('applyCrop','click',()=>useReferenceSubject(false));
handle('originalReference','click',()=>useReferenceSubject(true));
handle('selectAll','click',() => {$('elements').querySelectorAll('.replace').forEach(node => {node.checked=true;node.closest('.element').classList.add('selected');});});
handle('clearAll','click',() => {$('elements').querySelectorAll('.replace').forEach(node => {node.checked=false;node.closest('.element').classList.remove('selected');});});
handle('addElement','click',async () => {
  const name = await studioPrompt('请输入漏识别对象名称，例如：画面右侧的黑色摩托车'); if (!name?.trim()) return;
  const kind = await studioPrompt('元素类型：'+Object.entries(kinds).map(([key,value]) => `${key}=${value}`).join('，'),'prop');if(kind===null) return;
  const number = Math.max(0,...project.analysis.elements.map(item => Number(item.id.split('-')[1]) || 0))+1;
  project.analysis.elements.push({id:`element-${number}`,kind:kinds[kind]?kind:'other',name:name.trim(),description:'用户手动补充；请在替换要求中明确位置和时间。',bbox:null,frameTime:0});
  renderElements();
});
handle('generate','click',async () => {
  if (!project?.analysis || busy || polling) return;
  if (!$('rights').checked) throw new Error('请确认素材使用权与人物肖像授权。');
  if(generationDurationIssue())throw new Error(generationDurationIssue());
  if(generationRatioIssue())throw new Error(generationRatioIssue());
  busy = true; controls();
  try {
    await persist();
    if(generationDurationIssue())throw new Error(generationDurationIssue());
    if(generationRatioIssue())throw new Error(generationRatioIssue());
    const currentView236=()=>JSON.stringify([project?.id,[...document.querySelectorAll('input,select,textarea')].filter(node=>!node.closest('dialog')).map(node=>[node.id,node.value,node.checked])]),view236=currentView236();
    const body = {projectId:project.id,model:$('generationModel').value,mode:$('mode').value,referenceStrategy:$('referenceStrategy').value,replacements:replacements(),duration:generationDurationValue(),resolution:$('resolution').value,ratio:$('ratio').value,extra:$('extra').value,size:$('imageSize').value,rightsConfirmed:true};
    if(project.media==='video')body.audioMode=$('audioMode259').value;
    if(project.media==='video' && body.mode==='creative' && body.referenceStrategy==='depth')body.referenceWorkflow=$('referenceWorkflow').value;
    if(project.media==='video' && body.mode==='creative')body.creativeSimilarity=Number(project.creativeSimilarity);
    if(project.media==='video' && body.mode==='creative' && body.referenceStrategy==='text' && body.replacements.length && !await studioConfirm('当前按拆解文字与图片重新创作，不保证原片动作。创意相似度是参考强度，不是实测相似率；若只想替换原片对象，请选择模型视频编辑。确认继续？')) return;
    const plan = await api('/api/breakdown/quote',body);
    await CreditGate.ensure(Number(plan.quote.estimatedPoints));
    if(body.mode==='model_edit' && !await studioConfirm('模型视频编辑会参考原片替换所选元素，但未保证逐帧锁定或其他区域完全不变。请生成后对照原片验收。确认继续？')) return;
    ModelPresentation.quoteReceiptFields(plan.quote);
    const billing=plan.quote.priceBasis172==='sku'?ModelPresentation.quoteText(plan.quote):plan.quote.pricingMode==='live_quote'?ModelPresentation.quoteText(plan.quote):project.media==='video'?(plan.quote.billingMode==='flat'?`${plan.duration}秒 · 每次${plan.quote.pointsPerGeneration ?? plan.quote.estimatedPoints}积分`:`${plan.duration}秒 × 每秒${plan.quote.pointsPerSecond}积分`):'图片生成按张计费';
    const warning=project.media==='video'?ModelPresentation.activityWarning(generationProfile(),body.model,body.resolution):'';
    const soundReview=project.media==='video'?(body.audioMode==='original'?'\n声音：生成后保留原视频对应片段的原声，本地处理免费。':'\n声音：画面完成后另选此结果重新配音，先填写并核对台词、时间与音色，再单独报价确认。'):'';
    if (!await studioConfirm(`${plan.modelName}\n${plan.creativeSimilarity!=null?`创意参考强度${plan.creativeSimilarity}%（不是成片相似率保证）\n`:''}${billing}\n预计${plan.quote.estimatedPoints}积分。${soundReview}${warning?'\n'+warning+'\n':''}确认提交？`)) return;
    if(currentView236()!==view236)throw Error('核价或确认期间输入、模型或引用已改变，请重新核价；未提交生成。');
    beginProgress('breakdown_generation','正在提交专用生成任务…');status('正在提交专用生成任务…');
    const data = await api('/api/breakdown/generate',{...body,billingConfirmed:true,...ModelPresentation.quoteReceiptFields(plan.quote)}); await poll(data.taskId,project.id);
  } finally {busy = false; controls();}
});
handle('observe','click',async () => {
  busy = true; controls();
  try {beginProgress('breakdown_generation','正在查询原任务，不重新扣费…');const data = await api('/api/breakdown/observe',{projectId:project.id,rightsConfirmed:$('rights').checked}); await poll(data.taskId,project.id);}
  finally {busy=false;controls();}
});
handle('export','click',async () => {
  const text = [project.name,project.analysis.summary,project.analysis.style,...(project.analysis.rules || []),$('prompt').value,JSON.stringify(project.analysis.shots || [],null,2)].filter(Boolean).join('\n\n');
  const bridge=(window.parent!==window?window.parent.pywebview:window.pywebview)?.api;
  if(bridge?.save_text) {
    const saved=await bridge.save_text('爆款拆解.txt',text,'breakdown');
    if(saved?.canceled){status('已取消导出。');return;}
    if(!saved?.ok)throw new Error(saved?.error || '导出失败。');
    status('已导出到：'+saved.path);return;
  }
  const url = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url;link.download='爆款拆解.txt';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
});
(async () => {try {await refresh(); const id=localStorage.getItem('dramaBreakdownProjectId');if(id) await loadProject(id);}catch(error){status(error.message);}})();
handle('results','click',async e => {
  const link=e.target.closest('a');if(!link)return;
  if(link.classList.contains('redub-result259'))return;
  e.preventDefault();status('请选择保存位置…');
  const file=new URL(link.href).searchParams.get('file') || '复刻结果';
  await saveResultFile(link.getAttribute('href'),file.split('/').pop());
});
window.addEventListener('resize',() => {const video=$('preview').querySelector('video');showBoxes(video?video.currentTime-Number(project?.analysis?.segmentStart || 0):0);});
function showFocus() {
  const element=project?.analysis?.elements.find(row=>row.id===activeElement), focus=$('assetFocus');
  focus.classList.toggle('hidden',!element);
  if(!element)return;
  const thumb=project.analysis.id && element.bbox?mediaUrl('asset-'+project.analysis.id+'-'+element.id+'.jpg'):mediaUrl('thumb.jpg');
  focus.innerHTML=`<img src="${thumb}" alt="对象代表帧裁切"><div><b>${esc(element.name)}</b><p>${esc(element.description)}</p><span class="muted">代表帧 ${Number(element.frameTime || 0).toFixed(1)} 秒 · 裁切不是精确遮罩</span></div>`;
}
function openViewer(url, media, title) {
  depthComparison?.pause();
  comparison?.pause();$('preview').querySelector('video')?.pause();$('comparePreview').querySelector('video')?.pause();
  $('viewerTitle').textContent=title || '放大浏览';
  viewerDownloadUrl=url;
  $('viewerMedia').innerHTML=media==='video'?`<video controls controlslist="nodownload" playsinline src="${esc(url)}"></video>`:`<img src="${esc(url)}" alt="放大浏览">`;
  $('viewerDialog').showModal();
}
handle('zoomSource','click',()=>{if(project)openViewer(mediaUrl(project.sourceFile),project.media,project.name);});
handle('compareResultSelect','change',()=>{comparisonFile=$('compareResultSelect').value;renderComparison();});
for(const id of ['compareSync','compareIndependent'])handle(id,'change',()=>{
  comparisonMode=$('compareSync').checked?'sync':'independent';comparison?.setSync(comparisonMode==='sync');
  $('compareHint').textContent=comparisonHint(comparisonResults().find(row=>row.file===comparisonFile));
  paintComparisonControls();
});
handle('comparePlay','click',async()=>{
  if(comparison){const started=comparison.toggle();paintComparisonControls();await started;paintComparisonControls();return;}
  const source=$('preview').querySelector('video');if(!source)return;
  if(!source.paused)source.pause();
  else try{await source.play();}catch{$('compareHint').textContent='原视频暂未开始，请等待加载后再次点击播放。';}
  paintComparisonControls();
});
handle('compareRestart','click',async()=>{
  if(comparison){comparison.restart();paintComparisonControls();return;}
  const source=$('preview').querySelector('video');if(!source)return;
  source.pause();source.currentTime=Math.max(0,Number(project?.analysis?.segmentStart ?? $('start').value)||0);
  try{await source.play();}catch{$('compareHint').textContent='原视频暂未开始，请等待加载后再次点击播放。';}
  paintComparisonControls();
});
handle('zoomComparison','click',()=>{if(comparisonFile)openViewer(mediaUrl(comparisonFile),'video','生成结果 · 对照验收');});
handle('downloadComparison','click',()=>{if(comparisonFile)return saveResultFile(mediaUrl(comparisonFile),comparisonFile.split('/').pop());});
handle('viewerDownload','click',()=>{if(viewerDownloadUrl)return saveResultFile(viewerDownloadUrl,new URL(viewerDownloadUrl,location.origin).searchParams.get('file')?.split('/').pop() || '生成结果.mp4');});
window.addEventListener('pagehide',()=>{destroyComparison();depthComparison?.destroy();depthComparison=null;});
handle('assetFocus','click',e=>{if(e.target.tagName==='IMG')openViewer(e.target.src,'image','对象代表帧裁切');});
handle('closeViewer','click',()=>$('viewerDialog').close());
$('viewerDialog').addEventListener('close',()=>{$('viewerMedia').querySelector('video')?.pause();$('viewerMedia').innerHTML='';viewerDownloadUrl='';});
async function recordAction(action, entries, name='') {
  const result=await api('/api/breakdown/records',{action,entries,name});
  const current=result.projects?.find(row=>row.id===project?.id);
  if(current){project=current;render();}
  await listProjects();
  return result;
}
function formatDate(timestamp) {
  return timestamp?new Date(timestamp*1000).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'本机记录';
}
async function paintLibrary() {
  const input=libraryMode==='inputs';
  libraryRows=input?(await api('/api/breakdown/projects')).projects || []:(await api('/api/breakdown/outputs')).outputs || [];
  $('libraryTitle').textContent=input?'上传记录':'已保存作品';
  $('libraryItems').innerHTML=libraryRows.map((row,index)=>{
    const id=row.projectId || row.id, url=mediaUrl(input?'thumb.jpg':row.file,id);
    return `<article class="library-item" data-index="${index}">${!input && row.media==='video'?`<video preload="metadata" controls src="${url}"></video>`:`<img loading="lazy" src="${url}" alt="${esc(row.name)}">`}<label class="record-name"><input class="record-check" type="checkbox" aria-label="选择${esc(row.name)}">${esc(row.name)}</label><p class="record-meta">${row.media==='video'?'视频':'图片'} · ${input && row.duration?Math.round(row.duration)+'秒 · ':''}${formatDate(row.finishedAt || row.createdAt || row.updatedAt)}</p><div class="row"><button class="record-open">${input?'打开素材':'放大 / 播放'}</button><button class="record-rename">重命名</button><button class="record-delete">移除</button>${input?'':'<button class="record-download">下载</button>'}${!input&&row.media==='video'?resultAudioActions259(row.file,row.projectId):''}</div></article>`;
  }).join('') || '<p class="empty">暂无记录。上传素材会保存在这里；生成结果需验收后点击“保存作品”。</p>';
}
async function openLibrary(mode) {
  libraryMode=mode;
  await paintLibrary();
  $('libraryDialog').showModal();
}
const recordEntry=row=>({projectId:row.projectId || row.id,...(libraryMode==='outputs'?{file:row.file}:{})});
async function removeRecords(rows) {
  if(!rows.length){status('请先勾选需要移除的记录。');return;}
  if(!await studioConfirm(`移除 ${rows.length} 条${libraryMode==='inputs'?'上传':'作品'}记录？\n仅隐藏记录，原文件和本机媒体保留；不扣积分。`))return;
  await recordAction('delete',rows.map(recordEntry));
  await paintLibrary();
  status('已移除所选记录，原文件和本机媒体仍保留，可联系支持恢复记录。');
}
handle('openInputs','click',()=>openLibrary('inputs'));
handle('openOutputs','click',()=>openLibrary('outputs'));
handle('closeLibrary','click',()=>$('libraryDialog').close());
handle('librarySelectAll','click',()=>{
  const boxes=[...$('libraryItems').querySelectorAll('.record-check')], checked=boxes.every(row=>row.checked);
  boxes.forEach(row=>row.checked=!checked);
});
handle('libraryDelete','click',()=>removeRecords([...$('libraryItems').querySelectorAll('.record-check:checked')].map(node=>libraryRows[Number(node.closest('.library-item').dataset.index)])));
handle('libraryItems','click',async e=>{
  const card=e.target.closest('.library-item');if(!card)return;
  const row=libraryRows[Number(card.dataset.index)], input=libraryMode==='inputs';
  if(e.target.classList.contains('restore-original-audio259')){await restoreOriginalAudio259(row.projectId,row.file);return;}
  if(e.target.classList.contains('record-rename')){
    const name=await studioPrompt('重命名这条记录',row.name);if(!name?.trim())return;
    await recordAction('rename',[recordEntry(row)],name);await paintLibrary();status('记录已重命名，未调用模型。');return;
  }
  if(e.target.classList.contains('record-delete')){await removeRecords([row]);return;}
  if(e.target.classList.contains('record-download')){await saveResultFile(mediaUrl(row.file,row.projectId)+'&download=1',row.name+(row.media==='video'?'.mp4':'.jpg'));return;}
  if(e.target.classList.contains('record-open') || e.target.tagName==='IMG'){
    if(input){$('libraryDialog').close();await loadProject(row.id);$('projects').value=row.id;}
    else openViewer(mediaUrl(row.file,row.projectId),row.media,row.name);
  }
});
handle('results','click',async e=>{
  const card=e.target.closest('.result');if(!card || e.target.closest('a'))return;
  const file=card.dataset.file, entry={projectId:project.id,file};
  if(e.target.classList.contains('restore-original-audio259')){await restoreOriginalAudio259(project.id,file);return;}
  if(e.target.classList.contains('compare-result')){comparisonFile=file;renderComparison();$('comparisonStage').scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(e.target.classList.contains('zoom-result') || e.target.tagName==='IMG'){openViewer(mediaUrl(file),project.media,'新结果 · 待验收');return;}
  if(e.target.classList.contains('accept-result')){
    const item=project.results.find(row=>row.file===file);
    const name=await studioPrompt('保存作品名称',item.name || project.name);if(!name?.trim())return;
    await recordAction('save-result',[entry],name);status('作品已保存，可在顶部“已保存作品”查看、下载和重命名。');return;
  }
  if(e.target.classList.contains('discard-result') && await studioConfirm('移除此待验收结果？仅隐藏记录，保留本机媒体。')){
    await recordAction('delete',[entry]);status('已移除待验收结果，本机媒体仍保留。');
  }
});

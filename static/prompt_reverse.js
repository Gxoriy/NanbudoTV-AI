'use strict';
const $=id=>document.getElementById(id);
let project=null, result=null, price=null, busy=false, polling=false, dirty=false;
let audioEvidence=null;
let projectReadEpoch251=0, promptEditRevision251=0, saving251=false, uncertainProject251='';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function requestJson251(path,options={},timeoutMs=15000){
  const abort=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();const error=new Error('请求等待超时；原任务与本地草稿保留，请点击“恢复原记录”核对，不要重复分析。');error.requestUncertain=true;reject(error);},timeoutMs);});
  const request=(async()=>{const response=await fetch(path,{...options,signal:abort.signal});const value=await response.json();if(!response.ok)throw new Error(value.error||'请求失败');return value;})();
  try{return await Promise.race([request,deadline]);}finally{clearTimeout(timer);}
}
async function api(path,payload){
  return requestJson251(path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
function status(text,error=false){window.ModelActivity?ModelActivity.text($('status'),text,error):$('status').textContent=text;}
function controls(){
  ['upload','projects','start','limit','sampling','audio','rights','audioMode','audioReviewed','addAudio'].forEach(id=>$(id).disabled=busy||polling);
  document.querySelectorAll('#audioRows input,#audioRows textarea,#audioRows select').forEach(el=>el.disabled=busy||polling);
  ['prepareAudio','restoreAudio'].forEach(id=>$(id).disabled=!project||!$('rights').checked||busy||polling);
  $('toCanvas').disabled=!result||result.id!==project?.analysis?.id||!$('prompt').value.trim()||busy||polling;
  const analyzeDisabled=!project||!price||!$('rights').checked||busy||polling||Boolean(uncertainProject251);
  $('analyze').disabled=analyzeDisabled;
  const analyzeHint=busy||polling?'正在处理当前任务，请稍候。':uncertainProject251?'请先点击“恢复原记录”核对上次请求，避免重复分析。':!project?'请先上传视频或从“上传记录”中选择视频。':!$('rights').checked?'请先勾选视频使用权与人物授权确认。':!price?`后台视觉模型报价暂不可用：${$('price').textContent||'请检查模型配置后重试。'}`:'已就绪。点击后会先展示本次模型与积分，确认后才开始分析。';
  $('analyzeHint').textContent=analyzeHint;
  $('analyzeHint').classList.toggle('error',analyzeDisabled&&!busy&&!polling&&Boolean(project)&&Boolean($('rights').checked)&&!price);
  $('analyze').title=analyzeHint;
  $('save').disabled=!result||result.id!==project?.analysis?.id||busy||polling||saving251;
  ['copy','export'].forEach(id=>$(id).disabled=!$('prompt').value.trim());
  $('versions').disabled=busy||polling;
  const needsRecovery=Boolean(uncertainProject251)||Boolean(project?.taskId)&&!polling;
  $('reconcile').hidden=!needsRecovery&&!['reserved','interrupted'].includes(project?.attempt?.state);
  $('reconcile').textContent=needsRecovery?'恢复原记录（免费）':'免费核对原调用';
  $('reconcile').disabled=busy||polling;
}
function draftKey(){return result?.id?'reverse-draft:'+project.id+':'+result.id:'';}
function renderAudio(value){
  audioEvidence=value||null;
  $('audioRows').innerHTML=(value?.segments||[]).map(audioRow).join('');
  $('audioReviewed').checked=false;
  $('audioInfo').textContent=value?[`原片 ${value.sourceGeometry?.width||'?'}×${value.sourceGeometry?.height||'?'} · ${value.sourceGeometry?.ratio||'比例未知'}；选段 ${value.segmentStart}–${Number(value.segmentStart+value.duration).toFixed(2)}秒。`,...(value.warnings||[])].join('\n'):'先免费检查当前选段的声音，再校对台词。';
  $('restored').innerHTML=(project?.audioRestorations||[]).slice().reverse().map(row=>`<p><a href="/api/prompt-reverse/media?${new URLSearchParams({id:project.id,file:row.file,download:'1'})}" download>下载合并原音轨的新视频</a><br>${esc(row.warning)}</p>`).join('');
}
function audioRow(row={start:0,end:1,text:'',kind:'dialogue',state:'candidate',speaker:''}){
  const options=(values,selected)=>Object.entries(values).map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${label}</option>`).join('');
  return `<fieldset class="audio-row"><div class="settings"><label>开始秒<input data-audio="start" type="number" step="0.1" min="0" value="${esc(row.start)}"></label><label>结束秒<input data-audio="end" type="number" step="0.1" min="0" value="${esc(row.end)}"></label><label>声音类型<select data-audio="kind">${options({unknown:'未确定',dialogue:'现场对白',narration:'旁白口播',voiceover:'画外音',singing:'演唱'},row.kind)}</select></label><label>校对状态<select data-audio="state">${options({candidate:'候选 · 未确认',confirmed:'已确认',ignored:'忽略'},row.state)}</select></label></div><input data-audio="speaker" aria-label="说话者" placeholder="说话者／声线" value="${esc(row.speaker)}"><textarea data-audio="text" rows="2" maxlength="2000" placeholder="逐字校对台词">${esc(row.text)}</textarea><button data-remove-audio type="button">移除此句</button></fieldset>`;
}
function audioSegments(){return [...document.querySelectorAll('.audio-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-audio]')].map(el=>[el.dataset.audio,['start','end'].includes(el.dataset.audio)?Number(el.value):el.value])));}
function renderResult(value){
  promptEditRevision251++;
  result=value;dirty=false;
  let draft=null;try{if(draftKey())draft=localStorage.getItem(draftKey());}catch(_){}
  $('prompt').value=draft!==null?draft:value?.prompt||'';dirty=draft!==null;
  $('draftState').textContent=dirty?'已恢复本地未保存草稿；不会被历史结果覆盖。':'编辑、复制和保存不调用模型、不扣积分。';
  $('resultInfo').textContent=value?`${value.modelName||'视觉分析模型'} · 选段 ${value.segmentStart||0}–${Number((value.segmentStart||0)+value.duration).toFixed(2)}秒 · ${value.transmittedFrames||'?'}张不同采样图 · ${value.chargedPoints==null?'费用请核对后台':`实际结算${value.chargedPoints}积分`}。这是复现方案，不是原始提示词。`:'尚未获得有效反推结果。';
  const labels={style:'视觉风格',subjects:'主体与空间',camera:'镜头与剪辑',lighting:'光照材质',performance:'动作与表演',effects:'特效与反馈'};
  $('logic').innerHTML=Object.entries(value?.logic||{}).map(([k,v])=>`<div class="logic-row"><b>${esc(labels[k]||k)}</b><div>${esc(typeof v==='string'?v:JSON.stringify(v))}</div></div>`).join('');
  $('shots').innerHTML=(value?.shots||[]).map((s,i)=>`<div class="shot"><button data-shot="${i}">${esc(s.start)}–${esc(s.end)}秒 · 定位原片</button><p>观察：${esc(s.observed)}</p><p>推断：${esc(s.inferred)}</p><small>证据图：${esc(s.evidenceFrames.join('、'))} · 置信：${esc({high:'高',medium:'中',low:'低'}[s.confidence]||'低')}</small></div>`).join('');
  $('unknown').textContent=value?['未知与限制：',...(value.uncertainties||[]),value.parameterSuggestions,value.disclaimer].join('\n'):'';
  controls();
}
function renderProject(value){
  project=value;localStorage.setItem('dramaPromptReverseProjectId',project.id);
  $('name').textContent='1 · '+project.name;
  const previewUrl='/api/prompt-reverse/media?id='+encodeURIComponent(project.id)+'&file='+encodeURIComponent(project.sourceFile);
  if($('preview').getAttribute('src')!==previewUrl)$('preview').src=previewUrl;
  const latest=(project.audioEvidence?.preparedAt||0)>(project.analysis?.analyzedAt||0)?project.audioEvidence:project.analysis||project.audioEvidence;
  $('start').max=Math.max(0,project.duration-.1);$('start').value=latest?.segmentStart??0;
  $('limit').value=latest?.duration>15?'30':'15';
  const evidence=project.audioEvidence;
  renderAudio(project.analysis?.audioEvidence&&project.analysis.audioEvidence.id===evidence?.id?project.analysis.audioEvidence:evidence);
  $('versions').innerHTML=(project.analysisHistory||[]).slice().reverse().map((row,i)=>`<option value="${esc(row.analysis.id)}">第${project.analysisHistory.length-i}次反推 · ${esc(new Date(row.analysis.analyzedAt*1000).toLocaleString())}</option>`).join('')||'<option value="">暂无结果</option>';
  $('raw').textContent=project.rawResponse||project.error||'暂无返回';renderResult(project.analysis||null);
}
async function loadLibrary(){
  const data=await api('/api/prompt-reverse/projects');
  $('projects').innerHTML='<option value="">选择视频</option>'+data.projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(project)$('projects').value=project.id;
}
async function loadPrice(){
  try{price=await api('/api/prompt-reverse/quote');$('price').textContent=`${price.modelName} · 本次1次模型调用 · ${price.price}积分/次。沿用后台爆款拆解分析的模型与价格。返回内容但结构不合格仍可能按真实调用结算，不会自动重试。`;}
  catch(error){price=null;$('price').textContent=error.message;}controls();
}
async function confirmAction(text){
  return window.parent!==window&&typeof window.parent.studioConfirm==='function'?window.parent.studioConfirm(text):window.confirm(text);
}
async function canSwitch(){return !dirty||await confirmAction('有未保存的提示词草稿，确认切换？草稿仍保留在本机。');}
async function poll(taskId,completionMessage='反推结果已保存；可编辑、复制或下载。',ownerId=project?.id,epoch=projectReadEpoch251){
  polling=true;controls();$('progress').hidden=true;window.ModelActivity?.set($('status'),{state:'pending',message:''});let failures=0;
  try{
    while(true){
      let task;
      try{task=await api('/api/tasks/'+encodeURIComponent(taskId));failures=0;}
      catch(error){if(++failures>=3)throw new Error('进度暂时无法读取；原任务可能仍在运行，请重新打开本记录核对，不要重复提交。');await new Promise(r=>setTimeout(r,1500));continue;}
      $('progress').value=task.progress||0;window.ModelActivity?.task($('status'),task);
      if(['done','error'].includes(task.state)){
        const data=await api('/api/prompt-reverse/project?id='+encodeURIComponent(ownerId));
        if(epoch!==projectReadEpoch251||project?.id!==ownerId)return;
        renderProject(data.project);uncertainProject251='';
        window.ModelActivity?.set($('status'),{state:task.state==='error'?'error':'success',message:task.state==='error'?(task.error||data.project.error||'反推未得到有效结果；可查看原返回并免费核对原调用。'):(task.result?.message||completionMessage)});
        await loadLibrary();return;
      }
      await new Promise(r=>setTimeout(r,1000));
    }
  }catch(error){uncertainProject251=ownerId;throw error;}
  finally{polling=false;$('progress').hidden=true;controls();}
}
async function openProject251(id,epoch=++projectReadEpoch251){
  let data;try{data=await api('/api/prompt-reverse/project?id='+encodeURIComponent(id));}
  catch(error){if(epoch!==projectReadEpoch251)return false;throw error;}
  if(epoch!==projectReadEpoch251||$('projects').value&&$('projects').value!==id)return false;
  renderProject(data.project);$('projects').value=id;uncertainProject251='';
  if(project.taskId){
    try{const task=await api('/api/tasks/'+encodeURIComponent(project.taskId));if(epoch!==projectReadEpoch251)return false;if(['queued','running'].includes(task.state)){await poll(task.id,undefined,id,epoch);return true;}}
    catch(error){uncertainProject251=id;controls();throw error;}
  }
  controls();return true;
}
function handle(id,event,fn){$(id).addEventListener(event,e=>Promise.resolve().then(()=>fn(e)).catch(error=>status(error.message,true)));}
handle('upload','click',()=>{if(!$('rights').checked){status('请先确认视频使用权与必要的人物授权。');return;}$('file').click();});
handle('file','change',async()=>{
  const file=$('file').files[0];if(!file)return;
  if(file.size>150*1024*1024){status('视频不能超过150MB。');return;}
  if(!await canSwitch())return;busy=true;controls();
  try{
    status('正在导入本地视频；不调用模型、不扣积分…');
    ++projectReadEpoch251;
    const data=await requestJson251('/api/prompt-reverse/upload',{method:'POST',headers:{'X-Filename':encodeURIComponent(file.name),'X-Rights-Confirmed':'1'},body:file},120000);
    renderProject(data.project);await loadLibrary();status(`已上传 ${project.duration.toFixed(2)}秒视频。请选择分析区间，再确认费用。`);
  }finally{busy=false;$('file').value='';controls();}
});
handle('projects','change',async()=>{
  const id=$('projects').value,epoch=++projectReadEpoch251;if(!id)return;
  if(!await canSwitch()){if(epoch===projectReadEpoch251)$('projects').value=project?.id||'';return;}
  if(epoch!==projectReadEpoch251||!await openProject251(id,epoch))return;
  status(project.error||'已读取历史记录，未调用模型；待核对请求可点击免费核对原调用。');
});
handle('analyze','click',async()=>{
  if(!project||busy||polling||uncertainProject251||!$('rights').checked||!await canSwitch())return;
  if($('audioMode').value!=='visual'&&(!audioEvidence||!$('audioReviewed').checked||audioEvidence.segmentStart!==Number($('start').value)||Math.abs(audioEvidence.duration-Math.min(Number($('limit').value),project.duration-Number($('start').value)))>.001)){status('请先免费检查当前选段的声音，并勾选已校对。未调用模型。');return;}
  busy=true;controls();
  try{
    await loadPrice();if(!price)return;
    if(!await confirmAction(`只分析从${$('start').value}秒开始、最多${$('limit').value}秒的选段。\n模型：${price.modelName}；1次 × ${price.price}积分。\n声音模式：${$('audioMode').selectedOptions[0].textContent}；仅已确认台词写入声音时间轴。原音轨不上传模型，原参数未知。\n确认付费反推？`))return;
    window.ModelActivity?.set($('status'),{state:'pending',message:''});
    uncertainProject251=project.id;
    const data=await api('/api/prompt-reverse/analyze',{projectId:project.id,start:Number($('start').value),limit:Number($('limit').value),sampling:$('sampling').value,audioNotes:$('audio').value,audioMode:$('audioMode').value,audioRevision:audioEvidence?.id,audioReviewed:$('audioReviewed').checked,audioSegments:audioSegments(),model:price.model,expectedPrice:price.price,rightsConfirmed:true,billingConfirmed:true});
    await poll(data.taskId);
  }finally{busy=false;controls();}
});
handle('prepareAudio','click',async()=>{
  if(!project||!$('rights').checked||busy||polling)return;
  if(audioEvidence&&!await confirmAction('重新识别会替换当前台词校对列表，确认？不会删除历史反推结果。'))return;
  busy=true;uncertainProject251=project.id;controls();try{const data=await api('/api/prompt-reverse/audio',{projectId:project.id,start:Number($('start').value),limit:Number($('limit').value),rightsConfirmed:true});await poll(data.taskId,'声音检查已保存，请校对；未调用收费模型。');}finally{busy=false;controls();}
});
handle('addAudio','click',()=>{$('audioRows').insertAdjacentHTML('beforeend',audioRow());$('audioReviewed').checked=false;});
['start','limit'].forEach(id=>handle(id,'change',()=>{$('audioReviewed').checked=false;status('选段已改变，请重新免费检查声音。');}));
handle('audioRows','input',()=>{$('audioReviewed').checked=false;});
handle('audioRows','click',e=>{if(e.target.closest('[data-remove-audio]')&&!busy&&!polling){e.target.closest('.audio-row').remove();$('audioReviewed').checked=false;}});
handle('restoreAudio','click',async()=>{if(await confirmAction('本地合并会使用当前选段的原片完整混合音轨，替换生成音轨。需有音轨使用权，且自行核对剪辑与口型；不加速声音、不修改原文件。确认并上传生成视频？'))$('restoreFile').click();});
handle('restoreFile','change',async()=>{
  const file=$('restoreFile').files[0];if(!file)return;if(file.size>150*1024*1024)throw new Error('生成视频最多150MB。');
  busy=true;controls();try{const data=await requestJson251('/api/prompt-reverse/restore-audio',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Project-Id':project.id,'X-Start':$('start').value,'X-Limit':$('limit').value,'X-Rights-Confirmed':'1','X-Sync-Confirmed':'1'},body:file},120000);await poll(data.taskId,'合并后的新视频已保存；请下载并核对剪辑与口型。');}finally{busy=false;$('restoreFile').value='';controls();}
});
handle('toCanvas','click',async()=>{
  const data=await api('/api/prompt-reverse/to-canvas',{projectId:project.id,analysisId:result.id,prompt:$('prompt').value});
  localStorage.setItem('dramaVideoCanvas',data.document.id);
  status('已新建复现画布，并按原片设置画幅；请选择模型、清晰度及核对时长，未生成、未扣费。');
  if(window.parent!==window&&window.parent.document.querySelector('[data-work-mode="canvas"]')){
    const frame=window.parent.document.querySelector('#canvasFrame');if(frame)frame.src='/static/video_canvas.html';
    window.parent.document.querySelector('[data-work-mode="canvas"]').click();
  }else window.open('/static/video_canvas.html','_blank');
});
handle('reconcile','click',async()=>{
  busy=true;controls();
  try{
    const id=uncertainProject251||project?.id;if(!id)return;
    $('projects').value=id;
    if(!await openProject251(id))return;
    if(['reserved','interrupted'].includes(project?.attempt?.state)){
      const data=await api('/api/prompt-reverse/reconcile',{projectId:id});renderProject(data.project);await loadLibrary();status(data.message);
    }else status('已恢复原记录，未重新分析、未新增扣费。');
  }
  finally{busy=false;controls();}
});
handle('versions','change',async()=>{
  const id=$('versions').value,ownerId=project?.id,epoch=projectReadEpoch251;
  if(!await canSwitch()){if(project?.id===ownerId&&epoch===projectReadEpoch251)$('versions').value=result?.id||'';return;}
  if(project?.id!==ownerId||epoch!==projectReadEpoch251||$('versions').value!==id)return;
  renderResult(id===project.analysis?.id?project.analysis:(project.analysisHistory||[]).find(x=>x.analysis.id===id)?.analysis);
});
handle('prompt','input',()=>{
  promptEditRevision251++;
  dirty=true;try{if(draftKey())localStorage.setItem(draftKey(),$('prompt').value);}catch(_){}
  $('draftState').textContent='有未保存的编辑；可复制。点击保存后再切换。';controls();
});
handle('save','click',async()=>{
  if(saving251||!project||!result)return;
  const key=draftKey(),ownerId=project.id,analysisId=result.id,text=$('prompt').value,revision=promptEditRevision251;
  saving251=true;controls();
  try{
    const data=await api('/api/prompt-reverse/save',{projectId:ownerId,analysisId,prompt:text});
    // Clear only the submitted draft. Typing and project navigation remain safe
    // while a slow local save is returning its old snapshot.
    try{if(localStorage.getItem(key)===text)localStorage.removeItem(key);}catch(_){}
    if(project?.id!==ownerId||result?.id!==analysisId)return;
    project=data.project;
    if(promptEditRevision251===revision&&$('prompt').value===text)renderResult(project.analysis);
    else {dirty=true;$('draftState').textContent='上一版已保存；随后输入的内容仍为未保存草稿。';}
    status('提示词已保存，未调用模型、未扣积分。');
  }finally{saving251=false;controls();}
});
handle('copy','click',async()=>{await navigator.clipboard.writeText($('prompt').value);status('完整提示词已复制；未调用模型。');});
handle('export','click',async()=>{
  const text=[$('prompt').value,'','生成逻辑与镜头证据',JSON.stringify({...result,prompt:undefined},null,2)].join('\n');
  const desktop=window.pywebview?.api||window.parent?.pywebview?.api;
  if(desktop?.save_text){
    const saved=await desktop.save_text((project?.name||'视频')+'-复现提示词.txt',text,'prompt_reverse');
    if(saved?.canceled){status('已取消保存；未调用模型。');return;}
    if(!saved?.ok)throw new Error(saved?.error||'保存失败');
    status('已保存到：'+saved.path+'；未调用模型。');return;
  }
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download=(project?.name||'视频')+'-复现提示词.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  status('已发起提示词文件下载；未调用模型。');
});
handle('shots','click',e=>{const button=e.target.closest('[data-shot]');if(button&&result){$('preview').currentTime=(result.segmentStart||0)+result.shots[Number(button.dataset.shot)].start;$('preview').focus();}});
handle('rights','change',controls);
(async()=>{
  await loadLibrary();await loadPrice();
  const id=localStorage.getItem('dramaPromptReverseProjectId');if(id){
    if(projectReadEpoch251)return;
    $('projects').value=id;if(!await openProject251(id))return;
    if(project.error)status(project.error);
  }
})().catch(error=>status(error.message));

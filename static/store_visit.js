/* Saved character cards -> durable, explicitly billed store-visit clips. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let hooks, roles = [], selectedId = '', documentValue = null, config = {}, quote = null;
  let busy = false, dirty = true, entered = false, rolesEpoch = 0, pollEpoch = 0, changeEpoch = 0;
  let assets = [], uploadedFiles = new Map();
  let durationConflict = null, restoreDeferred = false;
  let projectEpoch261=0,listRead261=0,lifecycleBusy261=false,projectRows261=[],initialFields261={},enterFlight261=null,paidRun261=null,projectLoading=false;
  const deletedIds261=new Set(),lifecycleKey261='store-project-lifecycle261';
  const PROJECT_KEY = 'dramaStoreVideoProject';
  const status = (message, error = false) => { $('storeVideoStatus').textContent = message; $('storeVideoStatus').classList.toggle('error', error); window.ModelActivity?.text($('storeVideoStatus'),message,error); };
  async function api(path, body) {
    const response = await fetch(path, {cache:'no-store', ...(body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})});
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || '探店服务返回错误。');
    return value;
  }
  const safe = action => async (...args) => { try { await action(...args); } catch (error) { status(error.message, true); } };
  const owner261=(id,epoch)=>documentValue?.id===id&&projectEpoch261===epoch;
  function projectChanged(isNew=false) {
    const form=documentValue?.storeVisit?.draft261?.payload||documentValue?.storeVisit?.form||{};
    window.dispatchEvent(new CustomEvent('store-project-changed',{detail:{id:documentValue?.id||'',name:documentValue?.name||'',hasStoryboard:!!form.storyboardText,hasClip:!!form.clipPrompt,hasResults:!!documentValue?.results?.some(row=>!row.deleted),isNew}}));
  }
  function projectLabel261(row){const raw=row.updatedAt||row.createdAt||row.deletedAt,date=new Date(typeof raw==='number'&&raw<1e12?raw*1000:raw||'');return (row.name||'未命名探店项目')+' · '+(Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' · ':'')+String(row.id||'').slice(0,8);}
  function installLifecycle261(){
    const toolbar=$('storeVideoProjects').parentElement;
    const actions=document.createElement('span');actions.className='store-persona-actions';
    actions.innerHTML='<button id="saveStoreDraft261" type="button" class="secondary-btn">保存草稿 · 免费</button><button id="deleteStoreProject261" type="button" class="ghost-btn">删除项目</button><button id="deletedStoreProjects261" type="button" class="ghost-btn">已删除项目</button>';
    toolbar.append(actions);
    const dialog=document.createElement('dialog');dialog.id='storeProjectDialog261';dialog.setAttribute('aria-labelledby','storeProjectDialogTitle261');dialog.style.cssText='background:var(--theme-surface,#282c2f);color:var(--theme-text,#eef0f2);border:1px solid var(--theme-border,#555);border-radius:12px;width:min(560px,calc(100vw - 30px));max-height:85dvh;overflow:auto;padding:24px';
    dialog.innerHTML='<form method="dialog"><h2 id="storeProjectDialogTitle261"></h2><p id="storeProjectDialogText261" style="white-space:pre-wrap;overflow-wrap:anywhere"></p><label id="storeDeletedField261" class="field" hidden>选择要恢复的项目<select id="storeDeletedList261" aria-label="已删除的探店项目"></select></label><div class="store-persona-actions"><button value="cancel" class="ghost-btn">取消</button><button id="storeDeleteConfirm261" value="delete" class="primary-btn">确认删除项目</button><button id="restoreStoreProject261" type="button" class="primary-btn" hidden>恢复项目</button></div></form>';
    document.body.append(dialog);
    $('deleteStoreProject261').onclick=safe(deleteProject261);$('deletedStoreProjects261').onclick=safe(showDeleted261);$('restoreStoreProject261').onclick=safe(restoreProject261);$('saveStoreDraft261').onclick=safe(saveDraft261);
    $('storeDeletedList261').onchange=()=>{$('restoreStoreProject261').disabled=lifecycleBusy261||!$('storeDeletedList261').value;};
    initialFields261=Object.fromEntries([...$('futureCard').querySelectorAll('input:not([type=file]),textarea,select')].filter(el=>el.id).map(el=>[el.id,el.value]));
  }
  function renderDeleted261(){
    const rows=projectRows261.filter(row=>row.deleted||deletedIds261.has(row.id));
    $('storeDeletedList261').innerHTML=rows.map(row=>'<option value="'+esc(row.id)+'">'+esc(projectLabel261(row))+'</option>').join('');
    $('restoreStoreProject261').disabled=lifecycleBusy261||!rows.length;
    $('storeProjectDialogText261').textContent=rows.length?'已有素材、结果和原订单仍保留。恢复不会重新生成或再次收费。':'暂无已删除的探店项目。';
  }
  function clearProject261(id){
    ++projectEpoch261;++pollEpoch;++listRead261;++changeEpoch;documentValue=null;quote=null;dirty=true;busy=false;projectLoading=false;assets=[];uploadedFiles=new Map();
    hooks.resetPlanning?.();
    if(localStorage.getItem(PROJECT_KEY)===id)localStorage.removeItem(PROJECT_KEY);
    $('storeVideoQuote').textContent='项目已删除；可以新建项目，或从“已删除项目”恢复。';renderResults();controls();projectChanged();
  }
  function publish261(action,id){localStorage.setItem(lifecycleKey261,JSON.stringify({action,canvasId:id,stamp:Date.now()}));}
  async function deleteProject261(){
    if(!documentValue||lifecycleBusy261||paidRun261?.epoch===projectEpoch261)return;
    const id=documentValue.id,epoch=projectEpoch261,name=documentValue.name||'未命名探店项目',dialog=$('storeProjectDialog261');
    $('storeProjectDialogTitle261').textContent='删除项目“'+name+'”？';$('storeProjectDialogText261').textContent='此项目将移到“已删除项目”。已有素材、结果和原订单会保留，不会取消上游任务或更改账单。可以稍后恢复。';
    $('storeDeletedField261').hidden=true;$('restoreStoreProject261').hidden=true;$('storeDeleteConfirm261').hidden=false;dialog.returnValue='';dialog.showModal();
    const accepted=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='delete'),{once:true}));
    if(!accepted||!owner261(id,epoch))return;
    lifecycleBusy261=true;controls();
    try{await api('/api/store/delete',{canvasId:id});deletedIds261.add(id);++listRead261;publish261('delete',id);if(documentValue?.id===id)clearProject261(id);await projects();status('项目“'+name+'”已删除，可从“已删除项目”恢复。');}
    finally{lifecycleBusy261=false;controls();}
  }
  async function showDeleted261(){
    if(lifecycleBusy261||paidRun261?.epoch===projectEpoch261)return;const epoch=projectEpoch261;await projects();if(epoch!==projectEpoch261)return;
    $('storeProjectDialogTitle261').textContent='已删除的探店项目';$('storeDeletedField261').hidden=false;$('restoreStoreProject261').hidden=false;$('storeDeleteConfirm261').hidden=true;renderDeleted261();$('storeProjectDialog261').showModal();
  }
  async function restoreProject261(){
    const id=$('storeDeletedList261').value,epoch=projectEpoch261;if(!id||lifecycleBusy261)return;
    lifecycleBusy261=true;controls();$('restoreStoreProject261').disabled=true;
    try{await api('/api/store/restore',{canvasId:id});deletedIds261.delete(id);++listRead261;publish261('restore',id);$('storeProjectDialog261').close();await projects();if(epoch===projectEpoch261)await open(id);status('项目已恢复。原素材、结果和原订单保留；需要生成时仍会核对费用。');}
    finally{lifecycleBusy261=false;controls();}
  }
  async function ensureProject261(){
    if(documentValue)return documentValue;
    const epoch=projectEpoch261,result=await api('/api/store/create',{name:$('marketingProjectName').value||'我的AI探店视频'});
    if(epoch!==projectEpoch261)throw Error('已切换项目，新建项目已保留在列表中。');
    documentValue=result.document;localStorage.setItem(PROJECT_KEY,documentValue.id);await projects();return documentValue;
  }
  function draftPayload261(id){return {...hooks.payload(),canvasId:id,characterId:selected().id,clipPrompt:$('storeClipPrompt').value.trim(),personaDirection:$('storePersonaDirection').value.trim(),assets:[...assets],settings:{model:$('storeVideoModel').value,duration:selectedDuration(),resolution:$('storeVideoResolution').value,ratio:$('storeVideoRatio').value,styleId:$('storeVideoStyle').value,customStyle:$('storeVideoCustomStyle').value.trim()}};}
  async function saveDraft261(){
    if(busy||projectLoading||documentValue?.generation||lifecycleBusy261)return;
    const initialEpoch=projectEpoch261;busy=true;controls();let id,epoch;
    try{if(!entered)await enter();await ensureProject261();id=documentValue.id;epoch=projectEpoch261;const revision=changeEpoch;const ready=await uploadAssets(id,epoch);if(!ready||!owner261(id,epoch)||!hooks.active())return;const saved=await api('/api/store/save',draftPayload261(id));if(!owner261(id,epoch))return;documentValue=saved.document;quote=null;dirty=true;$('storeVideoQuote').textContent='草稿已保存，尚未核价或生成。';await projects();status(revision===changeEpoch?'草稿已保存；未核价、未调用模型。':'本次草稿已保存，后来修改的内容请再次保存。');}
    finally{if(id===undefined?initialEpoch===projectEpoch261:owner261(id,epoch)){busy=false;controls();}}
  }
  function selected() { return roles.find(row => row.id === selectedId) || {id:'',name:'',source:'character_library'}; }
  function selectedDuration() { return durationConflict ?? Number($('storeVideoDuration').value); }
  function durationIssue() { return ModelPresentation.videoDurationIssue(config,$('storeVideoModel').value,selectedDuration()); }
  function ratioIssue() {
    const ability=(config.visualModels||[]).find(item=>item.media==='video'&&item.model===$('storeVideoModel').value)||{},ratios=ability.supportedAspectRatios||[];
    const ratio=$('storeVideoRatio').value;
    return (ratios.length&&!ratios.includes(ratio)||ratio==='21:9'&&!ratios.includes('21:9'))?`该模型不支持当前画幅；原设定${ratio}已保留，请调整画幅或更换模型。`:'';
  }
  function syncRatioOptions() {
    const ability=(config.visualModels||[]).find(item=>item.media==='video'&&item.model===$('storeVideoModel').value)||{},ratios=ability.supportedAspectRatios||[];
    for(const option of $('storeVideoRatio').options){option.disabled=ratios.length&&!ratios.includes(option.value)||option.value==='21:9'&&!ratios.includes('21:9');option.textContent=({'9:16':'竖屏9:16','16:9':'横屏16:9','1:1':'方形1:1','21:9':'宽银幕21:9'}[option.value]||option.value)+(option.disabled?'（不支持）':'');}
    $('storeVideoCapabilityHint').textContent=ratioIssue();
  }
  function syncDuration(adoptFixed=false,previous=selectedDuration()) {
    const info=ModelPresentation.videoDurationInfo(config,$('storeVideoModel').value),select=$('storeVideoDuration');
    durationConflict=null;
    if(info.fixed) {
      select.innerHTML=`<option value="${info.fixed}">${info.fixed}秒（固定）</option>`;select.value=String(info.fixed);
      if(!adoptFixed && Number(previous)!==info.fixed)durationConflict=Number(previous);
    } else {
      const values=Array.from({length:Math.max(0,Math.min(3600,info.maximum-info.minimum+1))},(_,index)=>info.minimum+index).filter(value=>!ModelPresentation.videoDurationIssue(config,$('storeVideoModel').value,value));
      if(previous && !values.includes(Number(previous)))values.unshift(Number(previous));
      select.innerHTML=values.map(value=>`<option value="${value}">${value}秒${ModelPresentation.videoDurationIssue(config,$('storeVideoModel').value,value)?'（原设定·不支持）':''}</option>`).join('');
      select.value=String(Number(previous)||values[0]||'');
    }
    const issue=durationIssue();
    $('storeVideoDurationHint').textContent=issue?`原设定${selectedDuration()}秒已保留。${issue}；请明确调整生成时长或更换模型。`:info.fixed?`本模型固定生成${info.fixed}秒，请核对片段内容适合此时长。`:'';
    $('storeUseFixedDuration').hidden=!info.fixed || !issue;
    $('storeVideoActivityWarning').textContent=ModelPresentation.activityWarning(config,$('storeVideoModel').value,$('storeVideoResolution').value);
    syncRatioOptions();
    controls();
  }
  function controls() {
    const pending = Boolean(documentValue?.generation);
    const entering=!!enterFlight261&&!entered,paid=paidRun261?.epoch===projectEpoch261;
    $('prepareStoreVideo').disabled = busy || projectLoading || pending || !selected().id;
    const cost=Number(quote?.quote?.estimatedPoints);
    $('generateStoreVideo').disabled = busy || pending || dirty || !!durationIssue() || !!ratioIssue() || !quote || !Number.isFinite(cost) || cost<=0;
    $('observeStoreVideo').classList.toggle('hidden', !pending);
    $('observeStoreVideo').disabled = busy || projectLoading || !pending;
    $('newStoreVideo').disabled = busy || projectLoading || lifecycleBusy261 || entering;
    $('storeVideoProjects').disabled = busy || projectLoading || lifecycleBusy261 || entering;
    $('deleteStoreProject261').disabled=lifecycleBusy261||projectLoading||paid||!documentValue;$('deletedStoreProjects261').disabled=lifecycleBusy261||projectLoading||paid;
    $('saveStoreDraft261').disabled=busy||projectLoading||pending||lifecycleBusy261||entering;
    $('clearStoreScenes').disabled = busy || pending; $('clearStoreProducts').disabled = busy || pending;
    for (const id of ['storeClipPrompt','storeVideoModel','storeVideoDuration','storeVideoResolution','storeVideoRatio','storeVideoStyle','storeVideoCustomStyle','storePersonaDirection','storeSceneFiles','storeProductFiles']) $(id).disabled = busy || pending;
    $('storeVideoDuration').disabled=busy || pending || !!ModelPresentation.videoDurationInfo(config,$('storeVideoModel').value).fixed;
    $('storeUseFixedDuration').disabled=busy || pending;
    $('storeVideoProjectLabel').textContent = documentValue ? `当前项目：${documentValue.name} · 已保存` : '尚未建立视频项目';
    window.CreditGate?.recalculate();
  }
  function invalidate() { ++changeEpoch; quote = null; dirty = true; $('storeVideoQuote').textContent = '设定已改变，请保存片段并重新核对价格；未扣费。'; controls(); }
  function renderRoles() {
    if (!roles.some(row => row.id === selectedId)) selectedId = '';
    const hall = $('storePersonaHall');
    hall.replaceChildren();
    if (!roles.length) { const empty = document.createElement('p'); empty.textContent = '还没有可用角色卡。请去数字人选择形象、搭配可选声音并保存角色卡；仅上传一张图片不会自动成为角色卡。'; hall.append(empty); }
    for (const row of roles) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'store-persona-card'+(selectedId === row.id ? ' active' : ''); button.dataset.storeCharacter = row.id;
      const image = document.createElement('img'); image.className = 'store-persona-preview'; image.src = '/api/characters/media?kind=images&id='+encodeURIComponent(row.imageId); image.alt = row.name+'的角色形象';
      image.style.objectFit='contain';image.style.aspectRatio='3 / 4';image.title='按原图完整显示，原图半身不会自动补为全身';
      image.onerror = () => { button.disabled = true; if (selectedId === row.id) {selectedId=''; invalidate();} button.title='角色形象文件不可读取，请去数字人重新保存角色卡。'; };
      const name = document.createElement('b'); name.textContent = row.name;
      const description = document.createElement('span'); description.textContent = row.voiceName ? '绑定：'+row.voiceName+(row.voiceSource === 'recording' ? '（录音样本，尚非克隆）' : row.synthesisReady ? '（本次不自动合成）' : '（合成尚未开通，本次不合成）') : '仅形象 · 未绑定声音';
      const framing=document.createElement('small');framing.textContent=({'full-body':'原图已标注完整全身','upper-body':'原图为半身','unknown':'原图构图未标注'})[row.imageFraming||'unknown'];
      button.append(image,name,description,framing); button.disabled = busy || Boolean(documentValue?.generation);
      button.onclick = () => { if (busy || documentValue?.generation) return; selectedId=row.id; invalidate(); renderRoles(); hooks.onRoleChange?.(); };
      hall.append(button);
    }
    const row = selected();
    $('storePersonaFileSummary').textContent = row.id ? `已选择：${row.name} · 角色卡真实形象` : '请明确选择一张已保存的角色卡';
    $('storeVoice').innerHTML = `<option value="${esc(row.voiceId || '')}">${esc(row.voiceName || '未绑定声音')}${row.voiceName ? ' · 仅绑定，不自动合成' : ''}</option>`;
    hooks?.onRoleChange?.(); controls();
  }
  async function refreshRoles() {
    const epoch = ++rolesEpoch;
    try {
      const library = await api('/api/characters/library');
      if (epoch !== rolesEpoch) return;
      const previous = selected();
      const images = new Map((library.images || []).map(row => [row.id,row]));
      const voices = new Map((library.voices || []).map(row => [row.id,row]));
      roles = (library.characters || []).filter(row => row.available && images.has(row.imageId) && (!row.voiceId || voices.has(row.voiceId))).map(row => {
        const voice = voices.get(row.voiceId) || {};
        return {id:row.id,name:row.name,imageId:row.imageId,imageName:images.get(row.imageId).name,
          voiceId:row.voiceId || '',voiceName:voice.name || '',voiceSource:voice.source || '',
          synthesisReady:['system','clone'].includes(voice.source) && voice.synthesisReady === true,speechProfile:row.speechProfile||{},imageFraming:row.imageFraming||'unknown',source:'character_library'};
      });
      const next = selected();
      if (selectedId && (previous.name !== next.name || previous.imageId !== next.imageId || previous.voiceId !== next.voiceId || previous.voiceName !== next.voiceName)) invalidate();
      renderRoles();
    } catch (error) {
      if (epoch !== rolesEpoch) return;
      roles=[]; selectedId=''; renderRoles(); $('storePersonaFileSummary').textContent='角色卡读取失败：'+error.message;
    }
  }
  async function projects() {
    const epoch=projectEpoch261,ticket=++listRead261,value = await api('/api/store/projects?includeDeleted=1');
    if(epoch!==projectEpoch261||ticket!==listRead261)return;
    projectRows261=value.projects||[];
    for(const row of projectRows261){
      if(row.deleted)deletedIds261.add(row.id);
      else deletedIds261.delete(row.id);
    }
    $('storeVideoProjects').innerHTML = '<option value="">选择已保存的探店项目</option>'+projectRows261.filter(row=>!row.deleted&&!deletedIds261.has(row.id)).map(row => `<option value="${esc(row.id)}">${esc(projectLabel261(row))}</option>`).join('');
    if (documentValue) $('storeVideoProjects').value = documentValue.id;
  }
  function renderResults() {
    $('storeVideoResults').innerHTML = (documentValue?.results || []).filter(row => !row.deleted).map(row => {
      const url = '/api/canvas/media?id='+encodeURIComponent(documentValue.id)+'&file='+encodeURIComponent(row.file);
      const voice='/static/video_voice.html?'+new URLSearchParams({scope:'canvas',projectId:documentValue.id,file:row.file});
      return `<article class="store-video-result"><video controls playsinline preload="metadata" src="${esc(url)}"></video><b>${esc(row.modelName)} · ${Number(row.duration)}秒 · ${esc(row.resolution)} · ${row.saved ? '已保存作品' : '待验收'}</b><div class="store-persona-actions"><button class="secondary-btn" data-store-result="${esc(row.file)}">${row.saved ? '已保存' : '保存作品'}</button><button class="ghost-btn" data-store-download="${esc(row.file)}">下载结果</button><a class="secondary-btn" target="_blank" href="${esc(voice)}">使用角色音色配音 · 单独确认费用</a></div></article>`;
    }).join('');
    $('storeVideoResults').querySelectorAll('[data-store-result]').forEach(button => button.onclick=safe(async () => {
      const id=documentValue.id,epoch=projectEpoch261,response=await api('/api/store/result',{canvasId:id,file:button.dataset.storeResult,action:'save'});if(!owner261(id,epoch))return;documentValue=response.document;renderResults();
    }));
    $('storeVideoResults').querySelectorAll('[data-store-download]').forEach(button => button.onclick=safe(async () => {
      const url='/api/canvas/media?id='+encodeURIComponent(documentValue.id)+'&file='+encodeURIComponent(button.dataset.storeDownload)+'&download=1';
      await hooks.download(url, button.dataset.storeDownload);
    }));
  }
  function restoreForm() {
    if(!hooks.active()){restoreDeferred=true;return;}
    restoreDeferred=false;
    const form=documentValue?.storeVisit?.draft261?.payload||documentValue?.storeVisit?.form || {};
    hooks.resetPlanning?.();
    selectedId=form.characterId || '';
    const fields={projectName:'marketingProjectName',subject:'marketingSubject',sellingPoints:'marketingSellingPoints',audience:'marketingAudience',tone:'marketingTone',materials:'marketingMaterials',cta:'marketingCta',personaDirection:'storePersonaDirection',clipPrompt:'storeClipPrompt',platform:'marketingPlatform',pace:'marketingPace',referenceAnalysis:'marketingReferenceAnalysis',referenceStrength:'marketingStrength'};
    for (const [key,id] of Object.entries(fields)) $(id).value=form[key]??initialFields261[id]??'';
    const details=form.storeDetails || {};
    const flags=details.presentation262||(Object.keys(details).length?{explainPackage:details.videoType==='group_buy',speakPrice:details.videoType==='group_buy',includeAddress:true}:{});
    for(const [key,id] of Object.entries({explainPackage:'storeExplainPackage262',speakPrice:'storeSpeakPrice262',includeAddress:'storeIncludeAddress262'}))$(id).checked=flags[key]===true;
    for (const [key,id] of Object.entries({creativeBrief:'storeCreativeBrief',route:'storeRoute',experience:'storeExperience',action:'storeAction',videoType:'storeVideoType'})) $(id).value=details[key]??initialFields261[id]??'';
    $('storeIndustry').value=initialFields261.storeIndustry||'';$('storeCustomIndustry').value=initialFields261.storeCustomIndustry||'';
    if (details.industry) {
      const exists=[...$('storeIndustry').options].some(row => row.value===details.industry);
      $('storeIndustry').value=exists ? details.industry : '__custom__'; $('storeCustomIndustry').value=exists ? '' : details.industry;
    }
    for (const [kind,prefix] of [['primary','storePrimary'],['secondary','storeSecondary']]) {
      const packageValue=details.packages?.[kind] || {};
      for (const [key,suffix] of [['name','PackageName'],['originalPrice','OriginalPrice'],['groupPrice','GroupPrice'],['contents','PackageContents'],['rules','PackageRules']]) $(prefix+suffix).value=packageValue[key]??initialFields261[prefix+suffix]??'';
    }
    const settings=form.settings || {};
    if(!settings.model){$('storeVideoModel').value='';$('storeVideoDuration').value=initialFields261.storeVideoDuration||'15';durationConflict=null;}
    modelOptions(false,settings);
    for (const [key,id] of Object.entries({ratio:'storeVideoRatio',styleId:'storeVideoStyle',customStyle:'storeVideoCustomStyle'})) $(id).value=settings[key]??(key==='styleId'?preferredStyle():initialFields261[id])??'';
    syncRatioOptions();
    $('storeVideoCustomStyleField').classList.toggle('hidden',$('storeVideoStyle').value!=='custom');
    assets=[...(form.assets||documentValue?.storeVisit?.assets || [])]; uploadedFiles=new Map();
    $('storeSceneFiles').value=''; $('storeProductFiles').value=''; hooks.resetFiles?.(); hooks.restoreMarketing?.({...form,creationMode:form.creationMode||'remix'}); hooks.sync?.();
    renderRoles();
  }
  async function open(id) {
    const epoch=++projectEpoch261;++pollEpoch;quote=null;dirty=true;projectLoading=true;controls();
    $('storeVideoQuote').textContent='正在读取项目，生成前会重新核对价格。';
    try {
      const response=await api('/api/store/project?id='+encodeURIComponent(id));if(epoch!==projectEpoch261)return;
      if(response.document.deleted||deletedIds261.has(id))throw Error('此项目已删除，请先从“已删除项目”恢复。');
      documentValue=response.document;
      localStorage.setItem(PROJECT_KEY,documentValue.id);restoreForm();renderResults();await projects();
      if(epoch===projectEpoch261)projectChanged();
      if(epoch===projectEpoch261)status(documentValue.generation ? '原任务仍在等待结果，点击继续查询；不会重新提交或扣费。' : '项目已打开。可免费保存草稿，需要生成时再保存片段并核对价格。');
    } finally {
      if(epoch===projectEpoch261){projectLoading=false;$('storeVideoProjects').value=documentValue?.id||'';controls();}
    }
  }
  function modelOptions(adoptFixed=false,saved={}) {
    const selectedModel=saved.model || $('storeVideoModel').value,previousDuration=saved.duration ?? selectedDuration();
    const models=(config.visualModels || []).filter(row => row.media==='video' && row.enabled && row.gatewayReady && !row.supportsPreciseEdit && Number(row.referenceImageLimit)>0);
    $('storeVideoModel').innerHTML=models.length ? models.map(row => `<option value="${esc(row.model)}">${esc(ModelPresentation.videoOptionLabel(config,row))}</option>`).join('') : '<option value="">尚未发布支持参考图的视频模型</option>';
    if (models.some(row=>row.model===selectedModel)) $('storeVideoModel').value=selectedModel;
    else if(saved.model){const option=document.createElement('option');option.value=saved.model;option.textContent='原模型（当前不可用，请重新选择）';option.selected=true;option.disabled=true;$('storeVideoModel').append(option);}
    const prices=config.visualVideoPricing || [];
    const current=models.find(row=>row.model===$('storeVideoModel').value);
    const resolutions=current?.pricingMode==='live_quote'?(current.supportedResolutions||[]).map(value=>String(value).toLowerCase()):[...new Set(prices.filter(row => row.model===$('storeVideoModel').value && Number(row.pointsPerSecond || row.pricePerSecond || row.pricePerGeneration)>0).map(row => String(row.resolution || '').toLowerCase()))];
    const previous=saved.resolution || $('storeVideoResolution').value;
    $('storeVideoResolution').innerHTML=(resolutions.length ? resolutions : ['480p']).map(row => `<option value="${esc(row)}">${esc(row.toUpperCase())}</option>`).join('');
    if (resolutions.includes(previous)) $('storeVideoResolution').value=previous;
    else if(saved.resolution){const option=document.createElement('option');option.value=saved.resolution;option.textContent=saved.resolution.toUpperCase()+'（原设定）';option.selected=true;$('storeVideoResolution').append(option);}
    syncDuration(adoptFixed,previousDuration);
  }
  let catalogFlight277=null;
  const storeCatalogSignature=config=>JSON.stringify([config.visualConfigRevision,config.visualModels,config.visualVideoPricing,config.visualVideoSkuPricing172]);
  function refreshStoreCatalog(){
    if(catalogFlight277)return catalogFlight277;
    const epoch=projectEpoch261;
    catalogFlight277=api('/api/client/config?refresh=1').then(received=>{
      if(received.configError)throw Error('后台模型目录同步失败，请稍后重试。');
      if(epoch!==projectEpoch261||storeCatalogSignature(config)===storeCatalogSignature(received))return;
      const saved={model:$('storeVideoModel').value,resolution:$('storeVideoResolution').value,duration:selectedDuration()};
      config=received;
      modelOptions(false,saved);
      if(quote)invalidate();else controls();
    }).finally(()=>{catalogFlight277=null;});
    return catalogFlight277;
  }
  function syncOpenStoreCatalog(){
    if(!hooks.active()||document.hidden||busy||projectLoading||paidRun261)return;
    void refreshStoreCatalog().catch(error=>status(error.message,true));
  }
  async function enterRequest261() {
    if (!hooks) return;
    const epoch=projectEpoch261;
    await refreshRoles();
    if(epoch!==projectEpoch261)return;
    if (entered) {if(restoreDeferred){restoreForm();renderResults();controls();}syncOpenStoreCatalog();await projects();return;}
    await refreshStoreCatalog();if(epoch!==projectEpoch261)return;
    const styles=(await api('/api/canvas/styles')).styles || [];
    if(epoch!==projectEpoch261)return;
    $('storeVideoStyle').innerHTML='<option value="none">不指定 · 使用填写的风格</option>'+styles.map(row=>`<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('')+'<option value="custom">自行描述</option>';
    const saved=localStorage.getItem(PROJECT_KEY);
    if (saved) {try{await open(saved);}catch(error){if(!deletedIds261.has(saved)&&!error.message.includes('已删除'))throw error;localStorage.removeItem(PROJECT_KEY);documentValue=null;await projects();controls();status('原项目已删除，可在“已删除项目”中恢复。');}}
    else {await ensureProject261();$('storeVideoStyle').value=preferredStyle();$('storeVideoCustomStyleField').classList.toggle('hidden',$('storeVideoStyle').value!=='custom');modelOptions(true);controls();}
    entered=true;
  }
  async function enter(){
    if(enterFlight261)return enterFlight261;
    const flight=enterRequest261();enterFlight261=flight;controls();
    try{await flight;}finally{if(enterFlight261===flight){enterFlight261=null;controls();}}
  }
  async function uploadAssets(id=documentValue?.id,epoch=projectEpoch261) {
    const selectedFiles=hooks.files();
    for (const [kind,files] of [['scene',[...selectedFiles.scenes]],['prop',[...selectedFiles.products]]]) {
      if (!files.length) continue;
      if(!owner261(id,epoch))return false;
      assets=assets.filter(row=>row.kind!==kind);
      for (const file of files) {
        let result=uploadedFiles.get(file);
        if (!result) {
          const response=await fetch('/api/store/upload',{method:'POST',headers:{'Content-Type':file.type || 'application/octet-stream','X-Canvas-Id':id,'X-Filename':encodeURIComponent(file.name)},body:file});
          result=await response.json();if(!owner261(id,epoch))return false;if (!response.ok) throw new Error(result.error || '素材上传失败。');uploadedFiles.set(file,result);
        }
        assets.push({file:result.file,kind});
      }
    }
    return owner261(id,epoch);
  }
  function preferredStyle() {
    const preferred=localStorage.getItem('dramaStoreVideoStyle262')||'live_action';
    const usable=preferred==='custom'&&!$('storeVideoCustomStyle').value.trim()?'live_action':preferred;
    return [...$('storeVideoStyle').options].some(option=>option.value===usable)?usable:'none';
  }
  async function planningAssets() {
    if(busy||projectLoading||lifecycleBusy261)throw new Error('项目正在读取或保存，请稍后再分析素材。');
    const initialEpoch=projectEpoch261;busy=true;controls();let id,owner;
    try {
      if(!entered)await enter();await ensureProject261();id=documentValue.id;owner=projectEpoch261;
      const revision=changeEpoch;
      if(!await uploadAssets(id,owner)||!owner261(id,owner)||revision!==changeEpoch)throw new Error('素材分析前项目或输入已改变，请重新开始。');
      return {canvasId:id,assets:assets.map(row=>({...row})),planSettings:{styleId:$('storeVideoStyle').value,customStyle:$('storeVideoCustomStyle').value.trim()}};
    } finally {
      if(id===undefined?initialEpoch===projectEpoch261:owner261(id,owner)){busy=false;controls();}
    }
  }
  async function prepare() {
    if (busy || projectLoading || documentValue?.generation) return;
    if (!selected().id) throw new Error('先在角色卡大厅选择已保存的数字人角色。');
    const initialEpoch=projectEpoch261;busy=true; quote=null; controls();let id,owner;
    try {
      if(!entered)await enter();await ensureProject261();if(!documentValue)throw Error('请先新建探店视频项目。');id=documentValue.id;owner=projectEpoch261;
      const issue=durationIssue()||ratioIssue();if(issue)throw new Error(issue+'；原设定已保留，请调整设定或更换模型，未提交生成。');
      status('正在保存真实角色形象与门店素材，尚未提交付费模型…');if(!await uploadAssets(id,owner)||!owner261(id,owner)||!hooks.active())return;
      const payload=draftPayload261(id);
      const epoch=changeEpoch;
      const prepared=await api('/api/store/prepare',payload);if(!owner261(id,owner))return;documentValue=prepared.document;if(!hooks.active())return;
      const receivedQuote=await api('/api/store/quote',{canvasId:id});if(!owner261(id,owner))return;
      if (epoch!==changeEpoch) throw new Error('保存期间设定有变化，请再次保存片段并核对价格；未扣费。');
      const cost=Number(receivedQuote.quote?.estimatedPoints);if(!Number.isFinite(cost)||cost<=0)throw new Error('后台未提供有效积分价格，暂不能生成。');
      quote=receivedQuote; dirty=false;
      $('storeVideoQuote').textContent=`${quote.modelName} · 当前片段${quote.duration}秒 · ${ModelPresentation.quoteText(quote.quote)}`;
      status('设定与素材已保存，未扣费。点击确认积分后只生成当前片段；指定声音不会自动合成。'); await projects();
    } finally {if(id===undefined?initialEpoch===projectEpoch261:owner261(id,owner)){busy=false;controls();}}
  }
  async function poll(taskId) {
    const epoch=++pollEpoch,owner=projectEpoch261,id=documentValue.id,started=Date.now();
    while (epoch===pollEpoch && owner261(id,owner)) {
      const task=await api('/api/tasks/'+encodeURIComponent(taskId));
      if(epoch!==pollEpoch||!owner261(id,owner))return;
      window.ModelActivity?.task($('storeVideoStatus'),task,{success:'当前片段已生成'});
      if (['done','error'].includes(task.state)) {
        const received=await api('/api/store/project?id='+id);if(epoch!==pollEpoch||!owner261(id,owner))return;documentValue=received.document;renderResults();
        if (task.state==='error') throw new Error(task.error || '原任务查询失败，可继续核对回执。');
        status('当前片段已生成并放入待验收。满意后保存作品；整部长片需逐段制作。');return;
      }
      if (Date.now()-started>3600000) throw new Error('已停止本次等待，原任务保留；请继续查询，不会重新提交或扣费。');
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  }
  async function run(observe=false) {
    if (busy || projectLoading || !documentValue || !observe && (dirty || !quote || documentValue.generation)) return;
    const id=documentValue.id,owner=projectEpoch261,paidFlight={epoch:owner};if(!observe)paidRun261=paidFlight;busy=true;controls();
    try {
      if (!observe) {
        const issue=durationIssue()||ratioIssue();if(issue)throw new Error(issue+'；请调整设定或更换模型，未提交生成。');
        const epoch=changeEpoch;
        const latest=await api('/api/store/quote',{canvasId:id});if(!owner261(id,owner))return;
        if(latest.inputSignature!==quote?.inputSignature){invalidate();throw new Error('探店片段已在其他窗口修改，请重新打开项目并核对价格；未提交、未扣费。');}
        const cost=Number(latest.quote?.estimatedPoints);if(!Number.isFinite(cost)||cost<=0){invalidate();throw new Error('后台未提供有效积分价格，暂不能生成。');}
        ModelPresentation.quoteReceiptFields(latest.quote);
        if(epoch!==changeEpoch||dirty)throw Error('核价期间设定已改变，请重新保存片段并核价。');
        quote=latest;$('storeVideoQuote').textContent=latest.modelName+' · '+ModelPresentation.quoteText(latest.quote);
        await CreditGate.ensure(latest.quote.estimatedPoints);
        if(!owner261(id,owner)||!hooks.active())return;
        const warning=ModelPresentation.activityWarning(config,latest.model,latest.resolution);
        if (!await studioConfirm(`仅生成当前 ${latest.duration} 秒AI探店片段，${ModelPresentation.quoteText(latest.quote)}。不会自动生成整部长片或收费配音。${warning?'\n\n'+warning:''}\n\n确认开始？`)) return;
        if(!owner261(id,owner)||!hooks.active())return;if (epoch!==changeEpoch || dirty || !quote) throw new Error('确认期间设定有变化，请重新保存片段并核对价格；未提交模型。');
      }
      window.ModelActivity?.set($('storeVideoStatus'),{state:'pending',message:''});
      const accepted=await api(observe ? '/api/store/observe' : '/api/store/generate',{canvasId:id,billingConfirmed:!observe,...(observe?{}:{...ModelPresentation.quoteReceiptFields(quote.quote),expectedStoreClip:quote.inputSignature})});if(!owner261(id,owner))return;
      const received=await api('/api/store/project?id='+id);if(!owner261(id,owner))return;documentValue=received.document;
      await poll(accepted.taskId);
    } finally {
      if(paidRun261===paidFlight)paidRun261=null;
      if(owner261(id,owner)){try{const received=await api('/api/store/project?id='+id);if(owner261(id,owner))documentValue=received.document;}finally{if(owner261(id,owner)){busy=false;controls();renderRoles();CreditGate.refresh().catch(()=>{});}}}
    }
  }
  function init(value) {
    hooks=value;
    installLifecycle261();
    $('manageStoreRoles').onclick=()=>hooks.openCharacters();
    $('refreshStoreRoles').onclick=safe(refreshRoles);
    $('prepareStoreVideo').onclick=safe(prepare);$('generateStoreVideo').onclick=safe(()=>run(false));$('observeStoreVideo').onclick=safe(()=>run(true));
    $('newStoreVideo').onclick=safe(async()=>{if(busy||projectLoading||lifecycleBusy261)return;const epoch=++projectEpoch261;++pollEpoch;busy=true;controls();try{const result=await api('/api/store/create',{name:$('marketingProjectName').value||'我的AI探店视频'});if(epoch!==projectEpoch261)return;documentValue=result.document;localStorage.setItem(PROJECT_KEY,documentValue.id);hooks.resetPlanning?.();assets=[];uploadedFiles=new Map();$('storeVideoStyle').value=preferredStyle();$('storeVideoCustomStyleField').classList.toggle('hidden',$('storeVideoStyle').value!=='custom');modelOptions(true);invalidate();renderResults();await projects();projectChanged(true);status('新项目已建立，门店资料与片段输入保留。可免费保存草稿，需要生成时再核对价格。');}finally{if(epoch===projectEpoch261){busy=false;controls();}}});
    $('storeVideoProjects').onchange=safe(async event=>{if(event.target.value)await open(event.target.value);});
    $('storeUseScript').onclick=()=>{if(projectLoading||busy||documentValue?.generation)return;const script=$('marketingResult').value.trim();if(!script){status('请先生成或填写分镜。',true);return;}if(script.length>5000){status('分镜超过本片段长度，请自行选择并复制当前片段，不会自动截断。',true);return;}$('storeClipPrompt').value=script;invalidate();};
    $('storeVideoStyle').onchange=()=>{localStorage.setItem('dramaStoreVideoStyle262',$('storeVideoStyle').value);$('storeVideoCustomStyleField').classList.toggle('hidden',$('storeVideoStyle').value!=='custom');invalidate();};
    $('storeVideoModel').onchange=()=>{modelOptions(true);invalidate();};
    $('storeVideoDuration').onchange=()=>{durationConflict=null;syncDuration();invalidate();};
    $('storeVideoResolution').onchange=()=>{syncDuration();invalidate();};
    $('storeVideoRatio').onchange=()=>{syncRatioOptions();invalidate();};
    $('storeUseFixedDuration').onclick=()=>{syncDuration(true);invalidate();status('已明确调整生成时长；请核对片段内容，原文本、素材和历史结果均保留。');};
    for (const [id,kind,field] of [['clearStoreScenes','scene','storeSceneFiles'],['clearStoreProducts','prop','storeProductFiles']]) $(id).onclick=()=>{if(busy || documentValue?.generation)return;assets=assets.filter(row=>row.kind!==kind);$(field).value='';hooks.clearFiles(kind==='scene' ? 'scenes' : 'products');invalidate();hooks.onRoleChange?.();};
    $('futureCard').addEventListener('input',invalidate);$('futureCard').addEventListener('change',invalidate);
    $('futureCard').querySelectorAll('.marketing-mode').forEach(button=>button.addEventListener('click',invalidate));
    window.addEventListener('storage',event=>{if(event.key==='dramaCharacterLibraryRevision')safe(refreshRoles)();});
    window.addEventListener('storage',event=>{if(event.key!==lifecycleKey261||!event.newValue)return;try{const change=JSON.parse(event.newValue);if(!change.canvasId||!['delete','restore'].includes(change.action))return;if(change.action==='delete'){deletedIds261.add(change.canvasId);if(documentValue?.id===change.canvasId){clearProject261(change.canvasId);status('此项目已在另一窗口删除，可在“已删除项目”中恢复。');}}else deletedIds261.delete(change.canvasId);++listRead261;safe(projects)();}catch(_){}});
    window.addEventListener('message',event=>{if(event.origin===location.origin && event.source===$('charactersFrame').contentWindow && event.data?.type==='character-library-changed')safe(refreshRoles)();});
    window.addEventListener('focus',()=>{if(hooks.active())safe(refreshRoles)();syncOpenStoreCatalog();});
    setInterval(syncOpenStoreCatalog,30000);
    CreditGate.register('#generateStoreVideo',()=>quote && !dirty ? Number(quote.quote.estimatedPoints) : null);
    controls();
  }
  const materialCounts=()=>({scenes:hooks?.files().scenes.length || assets.filter(row=>row.kind==='scene').length,
    products:hooks?.files().products.length || assets.filter(row=>row.kind==='prop').length});
  window.StoreVisit={init,selected,materialCounts,planningAssets,planningRevision:()=>changeEpoch,planningOwner:()=>projectLoading?null:projectEpoch261,refreshRoles:()=>safe(refreshRoles)(),enter:()=>safe(enter)()};
})();

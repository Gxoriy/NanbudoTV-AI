/* Independent RH authoring workspace; only our gateway generates media. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID().replaceAll('-', '');
  const items = data => Array.isArray(data) ? data : data?.items || [];
  const kinds = {CHARACTER:'人物',SCENE:'场景',PROP:'道具'};
  const statusText = {QUEUED:'RH 排队中',RUNNING:'RH 处理中',SUBMITTING:'正在提交',SUCCEEDED:'已完成',FAILED:'失败',CANCELED:'已取消，费用待核对',UNKNOWN:'提交结果待核对',running:'生成中',video_running:'视频生成中',video_done:'视频已完成',done:'已完成',failed:'生成失败'};
  const active = t => ['QUEUED','RUNNING','SUBMITTING','UNKNOWN'].includes(t.status);
  const running = t => ['QUEUED','RUNNING','SUBMITTING'].includes(t.status);
  const operationName = action => ({import:'剧本导入',extract:'资产提取',storyboard:'分镜提取',rebuild:'单场重建'})[action]||'RH 任务';
  const S = {id:'',episode:'',shot:'',view:'director',documents:new Map(),media:new Map(),drafts:new Map(),selected:new Map(),busy:new Set(),inflight:new Set(),submitting:new Map(),syncNeeded:new Map(),syncing:new Set(),capability:{},profile:{},openToken:0,polling:false,pollIndex:0,catalogs:false};
  const project = (id=S.id) => S.documents.get(id);
  const currentEpisode = () => project()?.episodes.find(e=>e.episodeId===S.episode);
  const shot = () => project()?.shots.find(s=>s.shotId===S.shot);
  const key = (pid,sid) => pid+':'+sid;
  const selection = () => {if(!S.selected.has(S.id)) S.selected.set(S.id,new Set()); return S.selected.get(S.id);};
  const mediaAsset = (a,id=S.id) => Object.values(S.media.get(id)?.assets||{}).flat().find(r=>r.rhAssetId===a.assetId);
  const mediaShot = (s,id=S.id) => S.media.get(id)?.episodes.find(e=>e.rhShotId===s?.shotId);
  const mediaUrl = (file,id=S.id) => '/api/visual/media?projectId='+encodeURIComponent(S.media.get(id)?.id||'')+'&file='+encodeURIComponent(file);
  const pendingReceipts = p => {const known=new Set((p?.tasks||[]).map(t=>t.requestId).filter(Boolean));return (p?.pendingRequests||[]).filter(r=>!known.has(r.request_id));};
  function assetSummary(asset){
    const raw=asset.description;if(!raw)return 'RH 暂未返回描述';
    let value=raw;if(typeof raw==='string'){try{value=JSON.parse(raw);}catch(_){return raw;}}
    if(value&&typeof value==='object'&&!Array.isArray(value)){
      const texts=['summary','appearance','description'].map(field=>value[field]).filter(v=>typeof v==='string'&&v.trim());
      if(texts.length)return [...new Set(texts)].join('\n');
    }
    return typeof raw==='string'?raw:JSON.stringify(raw);
  }
  const readableError = text => /\bDRAMA_BALANCE_INSUFFICIENT\b/.test(String(text)) ? 'RH 通道余额不足，请联系管理员充值后重试。' : String(text);
  function message(text,error=false){$('message').querySelector('span').textContent=error?readableError(text):text;$('message').className='visible'+(error?' error':'');}
  const confirmAction = (question,cost='') => WorkflowConfirm.open({question,cost});
  function setCatalogValue(select,value){
    const id=value||'';
    if(id&&![...select.options].some(o=>o.value===id)){const option=document.createElement('option');option.value=id;option.textContent='已选风格（'+id+'）';select.append(option);}
    select.value=id;WorkflowStylePicker.refresh(select);
  }
  function publishTasks(){
    if(window.parent===window)return;
    const projects=[...S.documents.values()].map(p=>({id:p.id,name:p.name,
      tasks:p.tasks.map(t=>({taskId:t.taskId,requestId:t.requestId,status:S.syncNeeded.has(key(p.id,t.taskId))?'RESULT_PENDING':t.status,operation:t.operation,type:t.type,error:S.syncNeeded.has(key(p.id,t.taskId))?'RH 已完成，结果待同步；请查询原任务，不要重新生成。':t.error?readableError(typeof t.error==='object'?t.error.message||'任务失败':t.error):'',createdAt:t.createdAt,updatedAt:t.updatedAt,finishedAt:t.finishedAt})),
      pendingRequests:pendingReceipts(p).map(r=>({request_id:r.request_id,action:r.action,status:r.status,created:r.created})),
      submitting:[...S.submitting.values()].filter(r=>r.projectId===p.id).map(({requestId,operation,startedAt})=>({requestId,operation,startedAt}))}));
    window.parent.postMessage({type:'nanbudo:story-workflow-tasks',projects},location.origin);
  }
  function renderActivity(){
    const box=$('workflowActivity'),p=project();if(!p){box.hidden=true;return;}
    const sending=[...S.submitting.values()].filter(r=>r.projectId===p.id),live=p.tasks.filter(running);
    const uncertain=p.tasks.filter(t=>t.status==='UNKNOWN').length+pendingReceipts(p).length;
    const latest=p.tasks[p.tasks.length-1],needsSync=[...S.syncNeeded.values()].some(r=>r.id===p.id);
    let text='',busy=false;
    if(sending.length){text=operationName(sending[0].operation)+' · 正在提交';busy=true;}
    else if(live.length){text=operationName(live[0].operation)+' · '+(live.some(t=>t.status==='RUNNING')?'RH 处理中':'RH 排队中')+(live.length>1?'（'+live.length+' 项）':'');busy=true;}
    else if(needsSync)text='RH 已完成 · 结果待同步';
    else if(uncertain)text='提交结果待核对 · '+uncertain+' 项';
    else if(latest)text=operationName(latest.operation)+' · '+(statusText[latest.status]||latest.status);
    box.hidden=!text;box.classList.toggle('is-busy',busy);
    $('workflowActivityText').textContent=text;
    $('workflowActivityNote').textContent=busy?'可继续操作，结果返回后自动更新':needsSync?'正在重试读取结果；也可查询原任务，不会重新生成或收费。':uncertain?'请在任务中心核对原提交，不会自动重提':'可在任务中心查看结果';
    const next=$('workflowNextStep');next.hidden=true;
    if(!busy&&!uncertain&&!needsSync&&p.rhProjectId){
      const visible=p.assets.filter(a=>!p.hiddenAssets.includes(a.assetId));
      if(!p.assets.length){text='剧本已导入 · 已识别 '+p.episodes.length+' 集';$('workflowActivityNote').textContent='下一步：提取人物、场景和道具。';next.textContent='去提取资产';next.dataset.nextView='assets';}
      else if(!p.shots.length){text='已提取 '+visible.length+' 项可见资产';$('workflowActivityNote').textContent='下一步：生成并同步参考图，再到导演台提取分镜。';next.textContent='前往资产库';next.dataset.nextView='assets';}
      else{text='已同步 '+p.shots.length+' 个镜头';$('workflowActivityNote').textContent='下一步：核对分镜和参考图，再生成视频。';next.textContent='前往导演台';next.dataset.nextView='director';}
      // Preserve a failed/canceled operation instead of labelling it successful.
      if(!latest||latest.status==='SUCCEEDED')$('workflowActivityText').textContent=text;
      next.hidden=false;box.hidden=false;
    }
  }
  async function api(url,body){
    const result=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    let data;try{data=await result.json();}catch(_){throw new Error('接口返回异常；不会自动重新提交，请查询原任务。');}
    if(!result.ok||data.error)throw new Error(data.error||'请求失败（'+result.status+'）');
    return data;
  }
  function accept(result,id){
    const p=result.project,old=project(id);
    if(p&&p.id===id&&(!old||p.revision>=old.revision))S.documents.set(id,p);
    publishTasks();renderActivity();
    return result;
  }
  async function remote(id,action,params={},requestId=uid()){
    const result=await api('/api/story-workflow/remote',{projectId:id,action,params,requestId});
    if(result.data?.taskId&&result.data.status==='SUCCEEDED'&&['task','import','extract','storyboard','rebuild','request-status'].includes(action))S.syncNeeded.set(key(id,result.data.taskId),{id,taskId:result.data.taskId});
    if(result.data?.taskId&&S.submitting.has(requestId)){
      S.submitting.delete(requestId);
      // The accepted task replaces its in-flight receipt, not a second task.
      if(result.project)result.project.pendingRequests=(result.project.pendingRequests||[]).filter(r=>r.request_id!==requestId);
    }
    accept(result,id);return result.data;
  }
  async function job(label,button,fn){
    const identity=key(S.id,label);if(S.busy.has(identity))return;
    S.busy.add(identity);const html=button?.innerHTML;
    if(button){button.disabled=true;button.innerHTML='<span class="spinner"></span>处理中';}
    try{return await fn();}catch(e){message(e.message,true);}
    finally{S.busy.delete(identity);if(button?.isConnected){button.innerHTML=html;button.disabled=false;}renderControls();}
  }
  function requireEpisode(){const e=currentEpisode();if(!e)throw new Error('请先导入 RH 并取得剧集目录。');return e;}
  function draft(){
    const s=shot();if(!s)return null;
    const k=key(S.id,s.shotId);
    if(!S.drafts.has(k))S.drafts.set(k,{description:s.description||'',dialogue:s.dialogue||'',durationSeconds:s.durationSeconds||15,refs:[...(project().references[s.shotId]||[])],dirty:false,refsDirty:false});
    return S.drafts.get(k);
  }
  function invalidateCleanDrafts(id){
    for(const s of project(id)?.shots||[]){const k=key(id,s.shotId),d=S.drafts.get(k);if(d&&!d.dirty&&!d.refsDirty)S.drafts.delete(k);}
  }
  async function listProjects(){
    const rows=(await api('/api/story-workflow/projects')).projects||[];
    $('projects').innerHTML='<option value="">选择独立项目</option>'+rows.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    $('projects').value=S.id;
    return rows;
  }
  async function restoreTaskSnapshots(rows){
    // Only local read APIs: restoring the global task list never starts generation.
    const queue=[...rows];
    await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
      while(queue.length){const row=queue.shift();try{
        accept(await api('/api/story-workflow/project?id='+encodeURIComponent(row.id)),row.id);
        const p=project(row.id);
        for(const t of p.tasks.filter(t=>t.status==='SUCCEEDED')){
          const missing=t.operation==='import'?!p.episodes.length:t.operation==='extract'?!p.assets.length:['storyboard','rebuild'].includes(t.operation)&&!p.shots.some(s=>s.episodeId===t.episodeId);
          if(missing)S.syncNeeded.set(key(row.id,t.taskId),{id:row.id,taskId:t.taskId});
        }
      }catch(_){/* A failed read must not erase prior task state. */}}
    }));
  }
  async function openProject(id){
    const token=++S.openToken;
    if(!id)return;
    const result=await api('/api/story-workflow/project?id='+encodeURIComponent(id));
    accept(result,id);if(token!==S.openToken)return;
    S.id=id;S.episode=project().episodes[0]?.episodeId||'';S.shot='';$('sceneFilter').value='';$('episodeSearch').value='';
    if(!project().rhProjectId)S.view='script';
    render();await Promise.allSettled([loadMedia(id),loadCatalogs(id)]);
    if(token===S.openToken){render();await loadSettings();}
  }
  function showView(view){S.view=view;document.querySelectorAll('[data-panel]').forEach(n=>n.hidden=n.dataset.panel!==view);document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));}
  function render(){
    const p=project();if(!p)return;
    $('welcome').hidden=true;$('projectPanel').hidden=false;$('projects').value=p.id;$('projectTitle').textContent=p.name;
    $('counts').textContent=p.episodes.length+' 集 · '+p.assets.filter(a=>!p.hiddenAssets.includes(a.assetId)).length+' 项可见资产 · '+p.shots.length+' 个镜头';
    if(!p.episodes.some(e=>e.episodeId===S.episode))S.episode=p.episodes[0]?.episodeId||'';
    $('sourcePreview').textContent=p.source;$('sourceCount').textContent=p.source.length.toLocaleString()+' 字符 · 原稿';
    setCatalogValue($('rhStyle'),p.stylePresetId);
    $('importNote').textContent=p.rhProjectId?'已导入 RH，识别到 '+p.episodes.length+' 集。下一步前往资产库提取资产；无需再次导入。':'RH 会调用模型整理、分集，并生成简介、人物介绍和各集概述；不是仅上传文件。确认后才提交。';
    renderEpisodes();renderScenes();renderAssets();renderShotRail();renderEditor();renderTasks();renderControls();showView(S.view);
  }
  function renderEpisodes(){
    const p=project();if(!p)return;
    const query=$('episodeSearch').value.trim().toLowerCase();$('episodeCount').textContent=p.episodes.length;
    const filtered=p.episodes.filter(e=>(e.title||'').toLowerCase().includes(query));
    $('episodes').innerHTML=filtered.map(e=>{
      const shots=p.shots.filter(s=>s.episodeId===e.episodeId),pending=p.tasks.some(t=>active(t)&&t.episodeId===e.episodeId);
      return '<button data-episode="'+esc(e.episodeId)+'" class="'+(S.episode===e.episodeId?'active':'')+'">'+esc(e.title||'第'+e.episodeIndex+'集')+'<small>'+(pending?'处理中 · ': '')+shots.length+' 个已同步镜头</small></button>';
    }).join('')||(p.episodes.length?'<p class="muted">没有匹配的剧集，共 '+p.episodes.length+' 集。</p><button id="clearEpisodeSearch">清空搜索，显示全部</button>':'<p class="muted">尚无剧集。导入完成后将自动显示。</p>');
    $('episodeTitle').textContent=currentEpisode()?.title||'等待 RH 返回剧集';
  }
  function renderScenes(){
    const previous=$('sceneFilter').value;
    $('sceneFilter').innerHTML='<option value="">全部场次</option>'+(project()?.scenes||[]).filter(s=>s.episodeId===S.episode).map(s=>'<option value="'+esc(s.sceneId)+'">'+esc(s.title||'场次 '+s.sceneIndex)+'</option>').join('');
    if([...$('sceneFilter').options].some(o=>o.value===previous))$('sceneFilter').value=previous;
  }
  const visibleShots = () => (project()?.shots||[]).filter(s=>s.episodeId===S.episode&&(!$('sceneFilter').value||s.sceneId===$('sceneFilter').value)).sort((a,b)=>(a.sceneIndex-b.sceneIndex)||(a.shotIndex-b.shotIndex));
  function renderShotRail(){
    const rows=visibleShots();if(!rows.some(s=>s.shotId===S.shot))S.shot=rows[0]?.shotId||'';
    $('shots').innerHTML=rows.map(s=>'<button data-shot="'+esc(s.shotId)+'" class="'+(S.shot===s.shotId?'active':'')+'">'+esc(s.sceneIndex||1)+'-'+esc(s.shotIndex)+'<small>'+esc(s.durationSeconds)+' 秒'+(mediaShot(s)?.videoFile?' · 已成片':'')+'</small></button>').join('')||'<p class="muted">本集还没有镜头。提取完成后会同步显示。</p>';
  }
  function renderEditor(){
    const s=shot(),d=draft();
    $('shotDescription').value=d?.description||'';$('shotDialogue').value=d?.dialogue||'';$('shotDuration').value=d?.durationSeconds||15;
    $('draftState').textContent=d?.dirty?'草稿未保存':'';
    $('shotLabel').textContent=s?'镜头 '+(s.sceneIndex||1)+'-'+s.shotIndex+' · '+s.durationSeconds+' 秒':'镜头预览';
    renderReferences();renderPreview();estimate();renderControls();
  }
  function renderPreview(){
    const s=shot(),m=mediaShot(s),pending=s&&(S.inflight.has(key(S.id,'video:'+s.shotId))||m?.status==='video_running');
    const file=m?.videoFile,signature=[S.id,S.shot,file,pending].join(':');
    if($('preview').dataset.signature!==signature){
      $('preview').dataset.signature=signature;
      $('preview').innerHTML=file?'<video controls preload="metadata" src="'+esc(mediaUrl(file))+'"></video>':'<div class="empty-preview">'+(pending?'<span class="spinner"></span>':'<span class="play-symbol">▷</span>')+'<p>'+(pending?'本镜生成中':'故事即将成为画面')+'</p><small>'+(pending?'可以切换剧集，其他镜头可独立操作':'先提取分镜，再使用你的模型生成视频')+'</small></div>';
    }
    $('mediaStatus').textContent=pending?'正在生成 · 原任务保留':m?.videoError||m?.error||(file?'视频已保存，可播放':s?'当前镜头尚未生成视频':'尚未选择镜头');
  }
  function filteredAssets(){
    const q=$('assetSearch').value.trim().toLowerCase();
    return (project()?.assets||[]).filter(a=>!project().hiddenAssets.includes(a.assetId)&&(!q||(a.name||'').toLowerCase().includes(q)));
  }
  function renderAssets(){
    if(!project())return;
    const chosen=selection();
    $('selectedCount').textContent='已选 '+chosen.size+' 项';
    $('assets').innerHTML=filteredAssets().map(a=>{
      const m=mediaAsset(a),running=m?.status==='running'||S.inflight.has(key(S.id,'image:'+a.assetId));
      return '<article class="asset-card '+(chosen.has(a.assetId)?'selected':'')+'"><div class="asset-image">'+(m?.imageFile?'<img loading="lazy" src="'+esc(mediaUrl(m.imageFile))+'" alt="'+esc(a.name)+'">':'<span>'+esc(kinds[a.type]?.[0]||'资')+'</span>')+'<input aria-label="选择 '+esc(a.name)+'" type="checkbox" data-asset="'+esc(a.assetId)+'" '+(chosen.has(a.assetId)?'checked':'')+'>'+(running?'<div class="asset-busy"><span class="spinner"></span>参考图生成中</div>':'')+'</div><div class="asset-info"><h4>'+esc(a.name)+'</h4><p>'+esc(assetSummary(a))+'</p><div class="row"><button data-image="'+esc(a.assetId)+'" '+(running?'disabled':'')+'>生成参考图</button><button data-upload="'+esc(a.assetId)+'" '+(!m?.imageFile?'disabled':'')+'>同步 RH</button></div><div class="asset-status">'+esc(m?.error||(m?.imageFile?'图片已保存 · '+(kinds[a.type]||'资产'):'等待本平台生图'))+'</div></div></article>';
    }).join('')||'<div class="panel muted">暂无可见资产。可从 RH 提取，或恢复已移除的资产。</div>';
  }
  function renderReferences(){
    const p=project(),d=draft(),q=$('referenceSearch').value.trim().toLowerCase();
    $('referenceOrigin').textContent=shot()?(d.refsDirty?'引用草稿未保存':p.referenceOrigin[S.shot]||'RH 未返回关联编号 · 请手动确认'):'选择镜头后设置引用';
    $('references').innerHTML=(p?.assets||[]).filter(a=>!p.hiddenAssets.includes(a.assetId)&&(!q||(a.name||'').toLowerCase().includes(q))).map(a=>{
      const m=mediaAsset(a),selected=d?.refs.includes(a.assetId);
      return '<label class="'+(selected?'checked':'')+'"><input type="checkbox" data-ref="'+esc(a.assetId)+'" '+(selected?'checked':'')+' '+(!d?'disabled':'')+'>'+(m?.imageFile?'<img loading="lazy" src="'+esc(mediaUrl(m.imageFile))+'" alt="">':'<span class="reference-placeholder">'+esc(kinds[a.type]?.[0]||'资')+'</span>')+'<span><b>'+esc(a.name)+'</b><small>'+esc(kinds[a.type]||'资产')+' · '+(m?.imageFile?'有本地参考图':'未生成图片')+'</small></span></label>';
    }).join('')||'<p class="muted">暂无匹配资产。</p>';
  }
  function renderTasks(){
    const p=project();if(!p)return;
    const pending=pendingReceipts(p),liveCount=p.tasks.filter(running).length;
    const uncertain=p.tasks.filter(t=>t.status==='UNKNOWN').length+pending.length;
    const sending=[...S.submitting.values()].filter(r=>r.projectId===p.id).length;
    const media=S.media.get(S.id),mediaJobs=[...Object.values(media?.assets||{}).flat(),...(media?.episodes||[])].filter(a=>['running','video_running'].includes(a.status));
    $('taskCount').textContent=liveCount+sending+uncertain+mediaJobs.length;
    $('taskSummary').textContent=liveCount+sending+mediaJobs.length?'进行中 '+(liveCount+sending+mediaJobs.length)+' 项 · 可切换剧集继续操作':uncertain?'有提交结果待核对，不会自动重提':'当前没有进行中的任务';
    $('tasks').innerHTML=[...p.tasks].reverse().slice(0,60).map(t=>'<article class="task"><div class="row"><b>'+esc(({import:'剧本导入',extract:'资产提取',storyboard:'分镜提取',rebuild:'单场重建'})[t.operation]||t.type||'RH 任务')+'</b><span>'+(running(t)?'<i class="spinner"></i>':'')+esc(statusText[t.status]||t.status)+'</span></div><small>'+esc(t.taskId)+'</small>'+(t.error?'<p>'+esc(readableError(typeof t.error==='object'?t.error.message||JSON.stringify(t.error):t.error))+'</p>':'')+'<button data-task="'+esc(t.taskId)+'">查询原任务 · 不重提</button></article>').join('')+
      pending.map(r=>'<article class="task"><b>提交回执待核对</b><p>'+esc(r.action)+' · '+esc(r.request_id)+'</p><button data-receipt="'+esc(r.request_id)+'">核对原提交 · 不重提</button></article>').join('')+
      mediaJobs.map(m=>'<article class="task"><b><i class="spinner"></i>'+esc(m.name||m.title||'本平台媒体')+'</b><p>本平台模型处理中，其他卡片可独立操作。</p></article>').join('');
    if(!$('tasks').innerHTML)$('tasks').innerHTML='<p class="muted">暂无任务；每次模型调用都会先确认费用。</p>';
    publishTasks();renderActivity();
  }
  function renderControls(){
    const p=project(),e=currentEpisode(),s=shot();
    const enabled={importScript:p&&!p.rhProjectId&&!p.tasks.some(active),extract:e,storyboard:e,refresh:e,saveSettings:e,saveShot:s,saveReferences:s,generateVideo:s&&!S.inflight.has(key(S.id,'video:'+s.shotId)),rebuild:e&&$('sceneFilter').value,observeVideo:s&&mediaShot(s),exportProject:p};
    for(const [id,value]of Object.entries(enabled)){if(!S.busy.has(key(S.id,id)))$(id).disabled=!value;}
    const labels={importScript:['import','导入 RH 并识别剧集 · 核价'],extract:['extract','RH 提取资产 · 核价'],storyboard:['storyboard','RH 提取分镜脚本 · 核价'],rebuild:['rebuild','重建所选场 · 核价']};
    for(const [id,[operation,label]]of Object.entries(labels)){
      if(S.busy.has(key(S.id,id)))continue;
      const task=p?.tasks.find(t=>t.operation===operation&&active(t));
      const unresolved=pendingReceipts(p).some(r=>r.action===operation);
      const pendingSync=p?.tasks.some(t=>t.operation===operation&&S.syncNeeded.has(key(p.id,t.taskId)));
      if(pendingSync){$(id).disabled=true;$(id).textContent='结果同步中 · 不重复生成';continue;}
      if(task||unresolved){$(id).disabled=true;$(id).innerHTML=task&&running(task)?'<span class="spinner"></span>'+esc(operationName(operation))+' · '+esc(statusText[task.status]):'提交结果待核对';}
      else $(id).textContent=label;
    }
    for(const id of ['shotDescription','shotDialogue','shotDuration'])$(id).disabled=!s;
  }
  async function connection(){
    const reply=await api('/api/story-workflow/status'),c=reply.data||reply;S.capability=c;
    $('connectionState').textContent=c.configured?'● RH 已连接 · 服务共享 '+c.sharedLimit+' 路 / 每账号 '+c.perAccountLimit+' 路文字任务 · 图片、视频走本平台':c.reason||'RH 网关未配置；可先保存本地项目。';
    if(c.configured&&S.id)await loadCatalogs(S.id,true);
  }
  async function loadCatalogs(id,force=false){
    if(!S.capability.configured||(S.catalogs&&!force))return;
    const [styles,directors]=await Promise.all([remote(id,'catalog',{catalog:'styles'}),remote(id,'catalog',{catalog:'director-styles'})]);
    const old=$('director').value;
    $('rhStyle').innerHTML='<option value="">沿用 RH 默认</option>'+items(styles).filter(s=>typeof s.stylePresetId==='string'&&s.stylePresetId).map(s=>'<option value="'+esc(s.stylePresetId)+'">'+esc(s.name||s.stylePresetId)+'</option>').join('');
    $('director').innerHTML='<option value="">沿用 RH 默认</option>'+items(directors).filter(d=>typeof d.key==='string'&&d.key).map(d=>'<option value="'+esc(d.key)+'">'+esc(d.name||d.key)+'</option>').join('');
    setCatalogValue($('rhStyle'),project()?.stylePresetId);setCatalogValue($('director'),old);S.catalogs=true;
    WorkflowStylePicker.update($('rhStyle'),items(styles));WorkflowStylePicker.update($('director'),items(directors));
  }
  async function loadSettings(){
    const id=S.id,eid=S.episode;if(!eid||!S.capability.configured)return;
    try{await remote(id,'settings-get',{episodeId:eid});if(id!==S.id||eid!==S.episode)return;
      const v=project().episodeSettings?.[eid]||{};
      for(const [element,field]of [['director','directorStyleKey'],['pacing','pacingMode'],['orientation','orientation'],['durationMode','durationMode']])if(v[field]!==undefined){if(element==='director')setCatalogValue($(element),v[field]);else $(element).value=v[field]??'';}
      WorkflowStylePicker.refresh($('director'));
    }catch(e){message(e.message,true);}
  }
  async function loadModels(){
    const reply=await api('/api/visual/profile');S.profile=reply.profile||{};
    for(const type of ['image','video'])$(type+'Model').innerHTML=ModelPresentation.catalog(S.profile,type).map(m=>'<option value="'+esc(m.id)+'" data-tier="'+esc(m.tier)+'">'+esc(m.name)+'</option>').join('')||'<option value="">后台尚未发布模型</option>';
    modelOptions('image');modelOptions('video');
  }
  function modelOptions(type){
    if(type==='image')$('imageResolution').innerHTML=ModelPresentation.imageResolutionOptions(S.profile,$('imageModel').value).map(v=>'<option>'+esc(v)+'</option>').join('');
    else{
      const id=$('videoModel').value;
      const resolutions=[...new Set((S.profile.videoPricing||S.profile.visualVideoPricing||[]).filter(r=>r.model?.toLowerCase()===id.toLowerCase()).map(r=>r.resolution))];
      $('videoResolution').innerHTML=resolutions.map(v=>'<option>'+esc(v)+'</option>').join('')||'<option value="">无报价</option>';
      $('videoRatio').innerHTML=ModelPresentation.videoAspectRatios(S.profile,id).map(v=>'<option>'+esc(v)+'</option>').join('');
    }estimate();
  }
  function estimate(){
    const duration=Number($('shotDuration').value),model=$('videoModel').value,tier=$('videoModel').selectedOptions[0]?.dataset.tier||'economy';
    const q=ModelPresentation.quote(S.profile,model,$('videoResolution').value,duration,tier,$('videoRatio').value);
    $('videoEstimate').textContent=ModelPresentation.isLiveQuote(S.profile,'video',model)?'实时核价 · 按本镜实际输入取得报价后确认':q?.points>0?'预计 '+q.points+' 积分 / '+duration+' 秒':'暂无有效报价，不会提交';
  }
  async function preferences(id,values){return accept(await api('/api/story-workflow/preferences',{projectId:id,...values}),id);}
  async function paid(action,extra={}){
    const id=S.id,p=project(),e=action==='import'?null:requireEpisode();
    if(!S.capability.configured)throw new Error('RH 企业通道尚未连接；未调用模型、未扣费。');
    if(action==='import'&&p.source.length>200000)throw new Error('当前原稿超过 RH 单次20万字符限制，请按实际集数分项目导入；本地原稿完整保留，未扣费。');
    const params={...(e?{episodeId:e.episodeId}:{}),...extra};
    if(['extract','import'].includes(action))params.stylePresetId=$('rhStyle').value;
    if(action==='import'){params.aspectRatio=$('orientation').value==='PORTRAIT'?'9:16':'16:9';await preferences(id,{stylePresetId:params.stylePresetId});}
    const q=await remote(id,'quote',{operation:action,...params});
    const question=action==='import'?'确认将剧本发送至 RH 并识别剧集？':action==='extract'?'确认提取项目资产（再次提取可能归档原分镜）？':action==='rebuild'?'确认重建所选场次分镜？':'确认提取本集分镜（替换原分镜）？';
    if(!await confirmAction(question,'本平台 '+q.points+' 积分 · RH 账户按实际用量结算'))return;
    const requestId=uid();S.submitting.set(requestId,{projectId:id,requestId,operation:action,startedAt:Date.now()});publishTasks();renderActivity();
    try{await remote(id,action,{...params,confirmed:true,quoteId:q.quoteId},requestId);}
    catch(error){
      try{accept(await api('/api/story-workflow/project?id='+encodeURIComponent(id)),id);}catch(_){/* Preserve the last known receipt. */}
      throw error;
    }finally{S.submitting.delete(requestId);publishTasks();if(S.id===id)renderTasks();}
    if(S.id===id){renderTasks();renderControls();}message('已提交 RH，编号已保存。可以切换页面；不会自动重提付费请求。');
  }
  async function syncEpisode(id,eid){
    accept(await api('/api/story-workflow/sync',{projectId:id,episodeId:eid}),id);
    invalidateCleanDrafts(id);await prepareMedia(id);
    if(id===S.id)render();
  }
  async function prepareMedia(id){
    const result=await api('/api/story-workflow/materialize',{projectId:id});accept(result,id);S.media.set(id,result.mediaProject);return result.mediaProject;
  }
  async function loadMedia(id){
    const pid=project(id)?.visualProjectId;if(!pid)return;
    const result=await api('/api/visual/project?id='+encodeURIComponent(pid));S.media.set(id,result.project);
    if(id===S.id){renderPreview();renderAssets();renderReferences();renderTasks();}
  }
  async function saveShot(){
    const id=S.id,s=shot(),d=draft();if(!s||!d)return;
    const snapshot={description:d.description,dialogue:d.dialogue,durationSeconds:Number(d.durationSeconds)};
    await remote(id,'shot-save',{shotId:s.shotId,...snapshot});
    const live=S.drafts.get(key(id,s.shotId));if(live&&Object.entries(snapshot).every(([k,v])=>live[k]===v))live.dirty=false;
    await prepareMedia(id);if(S.id===id&&S.shot===s.shotId)renderEditor();message('分镜已保存到 RH；没有触发模型生成。');
  }
  async function saveReferences(){
    const id=S.id,s=shot(),d=draft();if(!s||!d)return;const refs=[...d.refs];
    await remote(id,'references',{shotId:s.shotId,assetIds:refs});
    const live=S.drafts.get(key(id,s.shotId));if(live&&JSON.stringify(live.refs)===JSON.stringify(refs))live.refsDirty=false;
    await prepareMedia(id);if(S.id===id&&S.shot===s.shotId)renderReferences();message('引用编号已保存并同步 RH。');
  }
  function mediaQuote(kind,settings,duration=0){
    const q=kind==='image'?ModelPresentation.imageQuote(S.profile,settings.model,settings.resolution,1):ModelPresentation.quote(S.profile,settings.model,settings.resolution,duration,settings.tier,settings.ratio);
    if(!settings.model||!settings.resolution||!q||!(q.points>0))throw new Error('后台尚未提供有效模型价格；未提交。');return q;
  }
  function modelSettings(kind){return {model:$(kind+'Model').value,resolution:$(kind+'Resolution').value,tier:$(kind+'Model').selectedOptions[0]?.dataset.tier||'economy',ratio:$('videoRatio').value};}
  async function generateImages(ids){
    const id=S.id,p=project(),settings=modelSettings('image'),live=ModelPresentation.isLiveQuote(S.profile,'image',settings.model),q=live?null:mediaQuote('image',settings);
    const assets=p.assets.filter(a=>ids.includes(a.assetId)&&!p.hiddenAssets.includes(a.assetId)&&!S.inflight.has(key(id,'image:'+a.assetId)));
    if(!assets.length)throw new Error('请先选择可生成的资产。');
    const view=()=>JSON.stringify([S.id,modelSettings('image'),assets.map(a=>[a.assetId,a.description])]),before=view();
    const media=await prepareMedia(id),prepared=new Map();let total=0;const prices=[];
    for(const asset of assets){
      const pair=Object.entries(media.assets).flatMap(([kind,rows])=>rows.map(row=>({kind,row}))).find(v=>v.row.rhAssetId===asset.assetId);
      if(!pair)throw Error('资产未能建立媒体卡片。');
      const body={projectId:media.id,kind:pair.kind,assetId:pair.row.id,prompt:pair.row.prompt||asset.description,imageModel:settings.model,imageResolution:settings.resolution,tier:settings.tier,size:'1024x1024'};
      const receipt=live?(await api('/api/visual/live-quote',{action:'asset',...body})).quote:{...q,estimatedPoints:q.points};
      const fields=ModelPresentation.quoteReceiptFields(receipt);total+=Number(receipt.estimatedPoints);prices.push(receipt);prepared.set(asset.assetId,{pair,body,receipt,fields});
    }
    if(view()!==before)throw Error('核价期间模型或资产输入已改变，请重新核价。');
    const hasImages=assets.some(a=>mediaAsset(a,id)?.imageFile);
    const summary=live?'实时核价合计 '+Number(total.toFixed(2))+' 积分\n'+prices.map((receipt,index)=>'第'+(index+1)+'项：'+ModelPresentation.quoteText(receipt)).join('\n'):'预计 '+Number(total.toFixed(2))+' 积分 · 本平台模型';
    if(!await confirmAction('确认'+(hasImages?'重新':'')+'生成所选 '+assets.length+' 张参考图？',summary))return;
    if(view()!==before)throw Error('确认期间模型或资产输入已改变，未提交生成。');
    prices.forEach(ModelPresentation.quoteReceiptFields);
    assets.forEach(a=>S.inflight.add(key(id,'image:'+a.assetId)));renderAssets();let failures=0;
    try{const jobs=[...assets];await Promise.all(Array.from({length:Math.min(3,jobs.length)},async()=>{while(jobs.length){const a=jobs.shift();try{const job=prepared.get(a.assetId);await api('/api/visual/asset/generate',{...job.body,...ModelPresentation.quoteReceiptFields(job.receipt),billingConfirmed:true});job.pair.row.status='running';}catch(e){failures++;message(a.name+'：'+e.message,true);}finally{S.inflight.delete(key(id,'image:'+a.assetId));if(id===S.id){renderAssets();renderTasks();}}}}));if(!failures)message('参考图任务已提交本平台。完成后点击“同步所选图片到 RH”，即可用于 RH 分镜。');}
    finally{assets.forEach(a=>S.inflight.delete(key(id,'image:'+a.assetId)));if(id===S.id)renderAssets();}
  }
  async function uploadImages(ids){
    const id=S.id,p=project(),assets=p.assets.filter(a=>ids.includes(a.assetId)&&mediaAsset(a)?.imageFile);
    if(!assets.length)throw new Error('所选资产还没有已保存的图片。');
    if(!await confirmAction('确认将 '+assets.length+' 张参考图上传并绑定 RH？'))return;
    for(const a of assets){accept(await api('/api/story-workflow/upload-reference',{projectId:id,assetId:a.assetId,requestId:uid(),confirmed:true}),id);}
    message('所选参考图已同步 RH。');
  }
  async function generateVideo(){
    const id=S.id,p=project(),s=shot(),d=draft();if(!s)return;
    if(d.dirty||d.refsDirty)throw new Error('请先保存分镜与引用；避免用旧内容生成。');
    const settings=modelSettings('video'),duration=Number(d.durationSeconds),issue=ModelPresentation.videoDurationIssue(S.profile,settings.model,duration);if(issue)throw Error(issue);
    const live=ModelPresentation.isLiveQuote(S.profile,'video',settings.model),q=live?null:mediaQuote('video',settings,duration);
    const view=()=>JSON.stringify([S.id,shot()?.shotId,modelSettings('video'),draft()]),before=view();
    const media=await prepareMedia(id),row=media.episodes.find(e=>e.rhShotId===s.shotId);if(!row)throw Error('本镜尚未建立媒体卡片。');
    const body={projectId:media.id,episodeId:row.id,prompt:row.videoPrompt,videoModel:settings.model,videoTier:settings.tier,tier:settings.tier,resolution:settings.resolution,duration,ratio:settings.ratio,referenceAssetIds:row.referenceAssetIds};
    const receipt=live?(await api('/api/visual/live-quote',{action:'video',...body})).quote:{...q,estimatedPoints:q.points};ModelPresentation.quoteReceiptFields(receipt);
    if(view()!==before)throw Error('核价期间分镜、模型或引用已改变，请重新核价。');
    const noReferences=!Object.hasOwn(p.references,s.shotId);
    if(!await confirmAction(noReferences?'本镜尚未确认引用，确认无参考图生成视频？':'确认生成本镜 '+duration+' 秒视频？',live?ModelPresentation.quoteText(receipt):'预计 '+q.points+' 积分 · 本平台模型'))return;
    if(view()!==before)throw Error('确认期间分镜、模型或引用已改变，未提交生成。');
    const token=key(id,'video:'+s.shotId);S.inflight.add(token);renderPreview();renderControls();
    try{const result=await api('/api/visual/episode/video',{...body,...ModelPresentation.quoteReceiptFields(receipt),billingConfirmed:true});if(result.taskId)row.status='video_running';message(result.message||'本镜视频已提交本平台，可以继续操作其他镜头。');}
    finally{S.inflight.delete(token);if(S.id===id){renderPreview();renderTasks();renderControls();}}
  }
  async function observeTask(id,taskId){
    const token=key(id,taskId);if(S.syncing.has(token))return;
    S.syncing.add(token);
    try{
      const old=project(id)?.tasks.find(t=>t.taskId===taskId),value=await remote(id,'task',{taskId});
      if(value.status==='SUCCEEDED'){
        S.syncNeeded.set(token,{id,taskId});publishTasks();renderActivity();
        if((value.type==='PROJECT_IMPORT'||old?.operation==='import')&&project(id)?.rhProjectId)await remote(id,'episodes');
        const eid=old?.episodeId||project(id)?.episodes[0]?.episodeId;
        if(eid)await syncEpisode(id,eid);
        S.syncNeeded.delete(token);
      }
    }finally{
      S.syncing.delete(token);publishTasks();
      if(S.id===id){render();renderActivity();}
    }
  }
  async function poll(){
    if(S.polling)return;S.polling=true;
    try{
      const candidates=[...S.documents].flatMap(([id,p])=>p.tasks.filter(active).map(t=>({id,taskId:t.taskId})));
      const tasks=[...new Map([...candidates,...S.syncNeeded.values()].map(t=>[key(t.id,t.taskId),t])).values()];
      const count=Math.min(3,tasks.length);
      for(let i=0;i<count;i++){const target=tasks[(S.pollIndex+i)%tasks.length];try{await observeTask(target.id,target.taskId);}catch(_){/* Keep receipts; only query existing tasks. */}}
      S.pollIndex=tasks.length?(S.pollIndex+count)%tasks.length:0;
      for(const [id,p]of S.documents){
        if(Object.values(S.media.get(id)?.assets||{}).flat().some(a=>a.status==='running')||S.media.get(id)?.episodes.some(e=>e.status==='video_running')){try{await loadMedia(id);}catch(_){}}
      }
    }finally{S.polling=false;publishTasks();renderActivity();}
  }
  async function saveSettings(){
    const id=S.id,e=requireEpisode(),params={episodeId:e.episodeId,directorStyleKey:$('director').value,pacingMode:$('pacing').value,orientation:$('orientation').value,durationMode:$('durationMode').value};
    await preferences(id,{stylePresetId:$('rhStyle').value});await remote(id,'settings-save',params);message('当前剧集 RH 导演设定已保存，未调用模型。');
  }
  const actions={
    connection,importScript:()=>paid('import'),extract:()=>paid('extract'),storyboard:()=>paid('storyboard'),saveSettings,saveShot,saveReferences,generateVideo,
    refresh:()=>syncEpisode(S.id,requireEpisode().episodeId),
    rebuild:()=>{const sceneId=$('sceneFilter').value;if(!sceneId)throw new Error('请先选择具体场次。');return paid('rebuild',{sceneId});},
    generateImages:()=>generateImages([...selection()]),uploadImages:()=>uploadImages([...selection()]),
    hideSelected:async()=>{const id=S.id,selected=[...selection()];if(!selected.length)return;if(!await confirmAction('确认移除所选 '+selected.length+' 项资产？','仅隐藏，保留图片和 RH 远端资产'))return;await preferences(id,{hiddenAssets:[...new Set([...project(id).hiddenAssets,...selected])]});S.selected.get(id).clear();if(S.id===id){renderAssets();renderReferences();}},
    restoreAssets:async()=>{const id=S.id;await preferences(id,{hiddenAssets:[]});if(S.id===id){renderAssets();renderReferences();}},
    observeVideo:async()=>{const id=S.id,s=shot(),m=mediaShot(s);if(!m)throw new Error('尚无本平台媒体任务。');const r=await api('/api/visual/episode/video/observe',{projectId:S.media.get(id).id,episodeId:m.id});await loadMedia(id);message(r.message||'已查询原视频任务，未重新生成。');},
    exportProject:async()=>{const id=S.id,p=project(),r=await api('/api/story-workflow/export?id='+encodeURIComponent(id)),url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=p.name.replace(/[<>:"/\\|?*]/g,'_')+'-工作流新.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  };
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.view){showView(b.dataset.view);return;}
    if(b.dataset.episode){S.episode=b.dataset.episode;S.shot='';$('sceneFilter').value='';render();loadSettings();return;}
    if(b.dataset.shot){S.shot=b.dataset.shot;renderShotRail();renderEditor();return;}
    if(b.dataset.image){job('image:'+b.dataset.image,b,()=>generateImages([b.dataset.image]));return;}
    if(b.dataset.upload){job('upload:'+b.dataset.upload,b,()=>uploadImages([b.dataset.upload]));return;}
    if(b.dataset.task){const id=S.id;job('task:'+b.dataset.task,b,()=>observeTask(id,b.dataset.task));return;}
    if(b.dataset.receipt){const id=S.id;job('receipt:'+b.dataset.receipt,b,async()=>{const v=await remote(id,'request-status',{originalRequestId:b.dataset.receipt});if(id===S.id)render();message(v.message||'已接回原提交状态，未重新生成。');});return;}
    if(['newProject','welcomeCreate'].includes(b.id)){$('createDialog').showModal();return;}
    if(b.id==='closeCreate'){$('createDialog').close();return;}
    if(b.id==='dismissMessage'){$('message').className='';return;}
    if(b.id==='showWorkflowTasks'){const drawer=document.querySelector('.task-drawer');drawer.open=true;drawer.scrollIntoView({behavior:'smooth',block:'nearest'});return;}
    if(b.id==='workflowNextStep'){showView(b.dataset.nextView);return;}
    if(b.id==='clearEpisodeSearch'){$('episodeSearch').value='';renderEpisodes();return;}
    if(b.id==='openAssets'){showView('assets');return;}
    if(b.id==='selectAssets'){filteredAssets().forEach(a=>selection().add(a.assetId));renderAssets();return;}
    if(b.id==='clearAssets'){selection().clear();renderAssets();return;}
    if(actions[b.id])job(b.id,b,actions[b.id]);
  });
  document.addEventListener('change',event=>{
    const t=event.target;
    if(t.dataset.asset){t.checked?selection().add(t.dataset.asset):selection().delete(t.dataset.asset);renderAssets();}
    if(t.dataset.ref){const d=draft();if(!d)return;d.refs=t.checked?[...new Set([...d.refs,t.dataset.ref])]:d.refs.filter(id=>id!==t.dataset.ref);d.refsDirty=true;renderReferences();}
  });
  for(const element of ['shotDescription','shotDialogue','shotDuration'])$(element).addEventListener('input',()=>{const d=draft();if(!d)return;d.description=$('shotDescription').value;d.dialogue=$('shotDialogue').value;d.durationSeconds=Number($('shotDuration').value);d.dirty=true;$('draftState').textContent='草稿未保存';estimate();});
  $('projects').addEventListener('change',()=>{const id=$('projects').value;job('open:'+id,null,()=>openProject(id));});
  $('sceneFilter').addEventListener('change',()=>{S.shot='';renderShotRail();renderEditor();});
  $('episodeSearch').addEventListener('input',renderEpisodes);$('assetSearch').addEventListener('input',renderAssets);$('referenceSearch').addEventListener('input',renderReferences);
  $('imageModel').addEventListener('change',()=>modelOptions('image'));$('videoModel').addEventListener('change',()=>modelOptions('video'));$('videoResolution').addEventListener('change',estimate);
  $('source').addEventListener('input',()=>$('inputCount').textContent=$('source').value.length.toLocaleString()+' 字符 · 仅本地保存');
  $('file').addEventListener('change',async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>12*1024*1024)throw new Error('文件超过12MB，请按集分文件导入。');$('source').value=new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer());if(!$('name').value)$('name').value=f.name.replace(/\.[^.]+$/,'');$('source').dispatchEvent(new Event('input'));}catch(e){message(e.message.includes('12MB')?e.message:'请将文件另存为 UTF-8 格式 TXT / Markdown 后导入。',true);}});
  $('createForm').addEventListener('submit',event=>{event.preventDefault();job('create',$('create'),async()=>{const r=await api('/api/story-workflow/create',{name:$('name').value,source:$('source').value});S.documents.set(r.project.id,r.project);$('createDialog').close();S.view='script';await listProjects();await openProject(r.project.id);message('原稿已保存到独立项目，尚未上传 RH、未调用模型。');});});
  window.addEventListener('beforeunload',event=>{if([...S.drafts.values()].some(d=>d.dirty||d.refsDirty)){event.preventDefault();event.returnValue='';}});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='nanbudo:story-workflow-open')return;
    const id=event.data.projectId;if(typeof id!=='string'||![...$('projects').options].some(o=>o.value===id))return;
    job('open:'+id,null,async()=>{await openProject(id);const drawer=document.querySelector('.task-drawer');drawer.open=true;drawer.scrollIntoView({behavior:'smooth',block:'nearest'});});
  });
  WorkflowStylePicker.attach($('rhStyle'),{kind:'styles',title:'画面风格'});
  WorkflowStylePicker.attach($('director'),{kind:'director-styles',title:'导演风格'});
  Promise.allSettled([listProjects().then(rows=>restoreTaskSnapshots(rows)),loadModels(),connection()]).then(results=>{for(const r of results)if(r.status==='rejected')message(r.reason.message,true);renderControls();});
  setInterval(poll,15000);
})();

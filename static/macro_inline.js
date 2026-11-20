/* Inline scene workspace. All model/media submissions require their own quote. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./macro_arrangement.js'));
  else root.MacroInline = factory(root.MacroArrangement);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (shared) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const rows = snapshot => Array.isArray(snapshot?.plan?.segments) ? snapshot.plan.segments : [];
  const idOf = row => String(row?.segmentId || row?.id || '');
  const staleMessage = '原稿或项目设置已变更；以下为旧场次/分镜，只读保留，不代表新稿结果。';
  function projectFingerprint(project) {
    const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
      Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
    return JSON.stringify(stable(Object.fromEntries(['confirmedScript','sourceStructure','workflowAssetSourceHash','scriptGenerationId','style','settings']
      .map(key => [key, project?.[key] ?? null]))));
  }
  const pending = view => shared.anyTextActive(view) || !!view?.activeTask ||
    shared.snapshotTextInFlight?.(view?.snapshot) || Object.keys(view?.mediaTasks || {}).length > 0;
  const stateNames = {planned:'尚未编排', pending:'待补齐分镜', waiting_cut:'后台编排中', waiting_resume:'待继续编排', ready:'分镜已保存', done:'分镜已保存', completed:'分镜已保存', arranged:'分镜已保存',
    queued:'已排队', running:'正在编排', submitted:'正在处理', reserving:'正在准备', returned:'正在验收',
    failed:'本场未完成', error:'本场未完成', returned_unstructured:'已返回，尚未转为视频卡', validation_failed:'原返回验收未通过', not_submitted:'尚未提交', needs_review:'原调用待核对'};
  const partStates = {accepted:'已验收',unsubmitted:'未提交',queued:'排队中',running:'生成中',
    receipt_pending:'原调用待核对',return_invalid:'返回未通过验收',provider_failed:'上游生成失败'};
  const partActions = {inspect_return:'查看原返回',recover_original:'核对原调用',retry_part:'补做本段 · 核价'};

  function partLocation(part) {
    const start=part.sourceStart,end=part.sourceEnd;
    if(!Number.isInteger(start)||start<1||!Number.isInteger(end)||end<start)return '';
    return `原文单元 ${start}${end===start?'':'–'+end}`;
  }

  function partsMarkup(diagnostics,blocked,stale,esc) {
    const parts=diagnostics.parts;
    const accepted=parts.filter(row=>row.state==='accepted').length;
    const gap=diagnostics.blockingPartNumber;
    const rows=parts.map(row=>{
      const location=partLocation(row),actions=(row.actions||[]).filter(key=>Object.hasOwn(partActions,key));
      const blockedReason=row.retryBlockedReason||'';
      return `<li class="mi-part-row" data-part-state="${esc(row.state)}" ${row.blocksCards?'data-part-gap':''}>
        <div class="mi-part-content"><div class="mi-part-heading"><b>第 ${esc(row.partNumber)} 段</b>
          <span class="mi-part-state">${esc(row.label||partStates[row.state]||'状态待确认')}</span>
          ${row.blocksCards?'<span class="mi-part-location">待从此段组卡</span>':''}
          ${location?`<span class="mi-part-location">${esc(location)}</span>`:''}</div>
        ${row.message&&row.state!=='accepted'?`<p>${esc(row.message)}</p>`:''}
        ${blockedReason?`<p class="mi-part-location">${esc(blockedReason)}</p>`:''}</div>
        ${actions.length?`<div class="mi-part-actions">${actions.map(key=>`<button type="button"
          data-part-action="${key}" data-request-hash="${esc(row.requestHash)}"
          ${blocked||key==='retry_part'&&stale?'disabled':''}
          aria-label="${partActions[key]} · 第 ${esc(row.partNumber)} 段">${partActions[key]}</button>`).join('')}</div>`:''}
      </li>`;
    }).join('');
    return `<summary><b>分段记录</b><span>已验收 ${accepted}/${parts.length} 段</span>
      ${Number.isInteger(gap)?`<span class="mi-part-gap-text">第 ${gap} 段待处理</span>`:''}<span class="mi-part-disclosure" aria-hidden="true"></span></summary>
      ${Number.isInteger(gap)?'<p class="mi-part-note">此段验收后将继续按原文顺序组卡。已形成的视频卡现在可用。</p>':''}
      ${diagnostics.retryBlockedReason?`<p class="mi-part-note">${esc(diagnostics.retryBlockedReason)}</p>`:''}
      <ol class="mi-part-list">${rows}</ol>`;
  }

  function textProgressMarkup(view, escapeHTML) {
    const tasks=Object.values(view?.textTasks || {}).filter(shared.textTaskInFlight);
    if(!tasks.length)return '';
    const esc=escapeHTML || shared.escapeHTML;
    const first=tasks[0],values=tasks.map(row=>row.progress).filter(value=>Number.isFinite(value));
    const progress=values.length===tasks.length?Math.max(0,Math.min(100,Math.round(values.reduce((sum,value)=>sum+value,0)/values.length))):null;
    const isPlan=['plan','plan_resume'].includes(first.action||'plan'),shotFirst=view?.snapshot?.shotFirst||first.shotFirst;
    const title=first.state==='queued'?'本地任务排队中':isPlan?(shotFirst?'正在生成镜头并组卡':'正在识别剧情场次'):first.cardNumber?'正在补齐本卡分镜':'正在补齐本场分镜';
    const labels=isPlan?(shotFirst?['准备请求','生成连续镜头','本地顺序组卡','保存分批结果']:['整理原稿','识别剧情场次','检查场景边界','保存场次结果']):['读取视频卡','生成分镜内容','检查连续性','保存分镜结果'];
    const phase=first.state==='queued'||['config','order','preparing'].includes(first.phase)?0:
      first.phase==='model'?1:first.phase==='validating'?2:['saving','settling','recovering'].includes(first.phase)?3:
      progress===null?1:progress>=92?3:progress>=68?2:progress>=15?1:0;
    const steps=labels.map((label,index)=>`<span class="${index<phase?'done':index===phase?'active':''}">${esc(label)}</span>`).join('');
    const concurrent=[first,view.snapshot?.active,...Object.values(view.snapshot?.activeTasks||{})].find(row=>Number.isInteger(row?.requestConcurrencyLimit)&&row.requestConcurrencyLimit>0);
    const formed=first.availableCardCount??rows(view.snapshot).reduce((sum,scene)=>sum+shared.readSceneCards(view.snapshot,scene).filter(shared.cardComplete).length,0);
    const detail=(concurrent?`本地分段处理中 ${Math.max(0,Number(concurrent.activeRequestCount)||0)}/${concurrent.requestConcurrencyLimit}；已形成 ${formed} 张视频卡。\n`:'')+(first.message?(shared.textWorkMessage291?.(first)??first.message):shared.textWorkTitle(first));
    const message=tasks.length>1?`正在处理 ${tasks.length} 项任务。${esc(detail)}`:esc(detail);
    const progressAttrs=progress===null?`aria-valuetext="${esc(shared.textWorkTitle(first))}"`:`aria-valuenow="${progress}"`;
    const bar=progress===null?'<i class="indeterminate"></i>':`<i style="width:${progress}%"></i>`;
    return `<section class="mi-progress-panel" aria-label="${title}进度"><div class="mi-progress-head"><b><span class="mi-progress-spinner" aria-hidden="true"></span>${title}</b><span>${progress===null?'进行中':`${progress}%`}</span></div><div class="mi-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${progressAttrs}>${bar}</div><div class="mi-progress-steps">${steps}</div><p>${message}</p></section>`;
  }

  function quoteMessage(quote, title) {
    return shared.quoteSummary(quote,title);
  }

  function create(options) {
    if (!shared?.createController || !shared?.renderCards) throw Error('场次编排组件尚未加载。');
    const root = options?.root;
    if (!root || typeof root.querySelector !== 'function') throw Error('缺少场次工作区容器。');
    const win = root.ownerDocument?.defaultView || globalThis;
    const esc = shared.escapeHTML;
    const ask = typeof options.confirm === 'function' ? options.confirm : async () => false;
    // The main workflow owns scene selection and completion settings.
    // Standalone controllers keep their existing self-contained controls.
    const compactHeader = typeof options.onCompleteScope === 'function';
    let controller = null, projectId = '', selected = null, generation = 0, destroyed = false;
    let projectIdentity = '', pendingProjectIdentity = '', projectNeedsRefresh = false, readGeneration = 0;
    const readAborters=new Set();
    let view = {}, operation = false, confirmationPending = false, loadPromise = null, watchPromise = null, lastSnapshot = '', lastBusy;
    let timer = null, wake = null;
    let drawPending = false;
    let shownOnce=false,resumePromise=null,catalogPromise=null,catalogIdentity232='',mediaProjectKey232='',reconnectPromise=null,lastResumeAt=0;
    const openReferences = new Set(), openSources = new Set(), localOperations = new Map(), fillModes = new Map(), regroupLimits = new Map();
    // Selection belongs to a project and scene, not a response revision. A
    // progress poll or another scene finishing must not move the open card.
    const activeCards = new Map(), automaticPipelineReads = new Set();
    const sceneDownloads240 = new Set(), sceneDownloadMessages240 = new Map();
    const sceneRecoveryClaim279=(snapshot,id)=>{
      const issue=snapshot.sceneIssues223?.[id],claimId=issue?.recoveryClaimId;
      return issue?.code==='receipt_pending'&&shared.savedTextTasks(snapshot).some(row=>row.claimId===claimId
        &&['plan','plan_resume'].includes(row.action)&&row.status==='needs_review')?claimId:'';
    };
    const cardSelectionKey = id => JSON.stringify([projectId,id]);
    const cardTabId = (id,number) => 'mi-card-tab-'+encodeURIComponent(projectId)+'-'+encodeURIComponent(id)+'-'+number;
    const cardPanelId = (id,number) => 'mi-card-panel-'+encodeURIComponent(projectId)+'-'+encodeURIComponent(id)+'-'+number;
    let lastCardPanel = '';
    let regroupError='',regroupCapacity284=null;
    const regroupLimit=(snapshot,id)=>{const scene=rows(snapshot).find(row=>idOf(row)===id),value=regroupLimits.get(id)??snapshot?.plan?.regroupSettings?.[id]??scene?.maxSeconds??scene?.localRegroup?.maxSeconds??snapshot?.policy?.maxSeconds;return [15,30].includes(Number(value))?Number(value):15;};
    const scopeOverlap=(a,b)=>!a||!b||a.id===b.id&&(!a.number||!b.number||a.number===b.number);
    const frame=()=>win.requestAnimationFrame?new Promise(resolve=>{
      const deadline=win.setTimeout(resolve,32);
      win.requestAnimationFrame(()=>{win.clearTimeout(deadline);win.setTimeout(resolve,0);});
    }):Promise.resolve();
    const stateOf=target=>target?.peekState?.()||target?.getState();
    const mediaScopeLabel=item=>{const index=rows(stateOf(controller)?.snapshot).findIndex(row=>idOf(row)===item.segmentId);return `${index>=0?'第'+(index+1)+'场 · ':''}卡${item.cardNumber}`;};
    root.classList.add('macro-inline');
    root.classList.toggle('mi-compact-header206', compactHeader);
    root.innerHTML = `<div class="mi-toolbar">${compactHeader?'':'<div class="mi-scene-navigation"><button type="button" data-inline-action="previous" aria-label="上一场">‹ 上一场</button><label class="mi-scene-label">场次<select data-inline-role="selector" aria-label="切换剧情场次"></select></label><button type="button" data-inline-action="next" aria-label="下一场">下一场 ›</button><span class="mi-count" data-inline-role="count"></span><button type="button" data-inline-action="refresh">刷新状态</button></div>'}<div class="mi-toolbar-scene-info" data-inline-role="summary"></div><div class="mi-scene-actions" data-inline-role="scene-actions"></div></div><div class="mi-status" data-inline-role="status" role="status" aria-live="polite"></div><section class="mi-scene-return279" data-inline-role="scene-return" aria-label="本场原返回" hidden><div><b>本场原返回</b><button type="button" data-inline-action="close-scene-return" aria-label="关闭本场原返回">关闭</button></div><pre></pre></section><nav class="mi-card-tabs" data-inline-role="card-tabs" role="tablist" aria-label="本场视频卡" aria-orientation="horizontal" hidden></nav><div class="mi-cards" data-inline-role="cards"></div>`;
    let displayedSceneReturn279=null;
    const partsPanel=root.ownerDocument?.createElement?.('details');
    if(partsPanel){
      partsPanel.className='mi-parts286';
      partsPanel.hidden=true;
      root.querySelector('[data-inline-role="scene-return"]')?.before?.(partsPanel);
    }
    let partsScene286='',partsMarkup286='';
    function renderSceneParts286(snapshot,id,blocked,stale){
      if(!partsPanel)return;
      const diagnostics=snapshot.sceneParts286?.[id];
      partsPanel.hidden=!diagnostics?.parts?.length;
      if(partsPanel.hidden){partsPanel.open=false;partsScene286='';return;}
      const sceneKey=cardSelectionKey(id),sameScene=partsScene286===sceneKey;
      if(!sameScene){partsPanel.open=false;partsScene286=sceneKey;}
      const markup=partsMarkup(diagnostics,blocked,stale,esc);
      if(markup===partsMarkup286)return;
      const focused=root.ownerDocument.activeElement;
      const focusedSummary=focused===partsPanel.querySelector('summary');
      const requestHash=partsPanel.contains(focused)?focused.dataset.requestHash:null;
      const action=requestHash?focused.dataset.partAction:null;
      const scrollTop=sameScene?partsPanel.querySelector('.mi-part-list')?.scrollTop:0;
      partsPanel.innerHTML=markup;
      partsMarkup286=markup;
      if(scrollTop)partsPanel.querySelector('.mi-part-list').scrollTop=scrollTop;
      if(action){
        const next=[...partsPanel.querySelectorAll('[data-part-action]')].find(button=>!button.disabled&&button.dataset.partAction===action&&button.dataset.requestHash===requestHash);
        (next||partsPanel.querySelector('summary'))?.focus({preventScroll:true});
      }else if(focusedSummary)partsPanel.querySelector('summary')?.focus({preventScroll:true});
    }
    function renderSceneReturn279(snapshot,id){
      const panel=$('scene-return'),visible=displayedSceneReturn279;
      const part=visible?.part;
      const current=part?shared.scenePart286(snapshot,id,part.requestHash,'inspect_return'):null;
      const same=part?current?.stageClaimId===part.stageClaimId&&current?.rawResponseHash===part.rawResponseHash
        : visible?.identity===shared.pipelineReturnIdentity(snapshot);
      panel.hidden=!visible||visible.sceneId!==id||!same;
      if(!panel.hidden){
        panel.querySelector('b').textContent=part?`第 ${part.partNumber} 段原返回`:'本场原返回';
        if(panel.querySelector('pre').textContent!==visible.text)panel.querySelector('pre').textContent=visible.text;
      }
    }
    const $ = name => root.querySelector('[data-inline-role="' + name + '"]');
    if(!compactHeader)root.querySelector('.mi-scene-navigation')?.insertAdjacentHTML?.('beforeend','<button type="button" data-inline-action="history">历史版本</button>');
    async function showHistory(){
      const capturedProject=projectId,serial=generation;
      const response=await win.fetch('/api/visual/macro/history?projectId='+encodeURIComponent(capturedProject),{cache:'no-store'}),data=await response.json();
      if(!response.ok)throw Error(data.error||'历史版本读取失败。');
      if(destroyed||serial!==generation||capturedProject!==projectId)return;
      let dialog=win.document.getElementById('visualWorkflowHistory');
      if(!dialog){dialog=win.document.createElement('div');dialog.id='visualWorkflowHistory';dialog.className='visual-dialog hidden';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','工作流历史版本');win.document.body.append(dialog);}
      const records=Array.isArray(data.revisions)?data.revisions:[];
      const renderRevision=(revision,index)=>{
        const media=[];
        for(const [id,cards]of Object.entries(revision.media||{}))for(const [number,record]of Object.entries(cards||{})){
          const known=new Set();
          for(const row of [...(record.history||[]),...(record.videoFile?[{file:record.videoFile,action:'video'}]:[]),...(record.frameFile?[{file:record.frameFile,action:'frame'}]:[])]){
            const file=row.file||row.imageFile||row.videoFile,action=row.action||row.kind||'video';if(!file||known.has(file))continue;known.add(file);
            const url=shared.mediaUrl(capturedProject,file,action),name=`历史${index+1}-${id}-卡${number}.${action==='frame'?'jpg':'mp4'}`;
            const download='/api/visual/download?'+new URLSearchParams({projectId:capturedProject,file,name}).toString();
            media.push(`<article><b>${esc(id)} · 卡${esc(number)}</b>${action==='frame'?`<img loading="lazy" src="${esc(url)}" alt="历史参考帧">`:`<video controls preload="none" src="${esc(url)}"></video>`}<a data-macro-download href="${esc(download)}" download="${esc(name)}">下载此版本</a></article>`);
          }
        }
        const written=Object.keys(revision.cardDrafts||{}).length||Object.keys(revision.sourceEdits||{}).length;
        const details=written?`<details><summary>查看已归档的手改分镜与原文</summary><pre>${esc(JSON.stringify({cardDrafts:revision.cardDrafts,sourceEdits:revision.sourceEdits},null,2))}</pre></details>`:'';
        return `<details class="workflow-history-revision" ${index===0?'open':''}><summary>版本 ${records.length-index} · ${esc(revision.createdAt||'历史时间未记录')} · ${esc(revision.reason||revision.revisionId||'已归档')}</summary><div class="workflow-history-media">${media.join('')||'<p>此版本没有已生成媒体。</p>'}</div>${details}</details>`;
      };
      dialog.innerHTML=`<div class="visual-dialog-shell"><header><div><b>工作流历史版本</b><span>查看归档的视频与手改内容；当前组卡结果保持不变。</span></div><button type="button" class="ghost-btn" data-history-close aria-label="关闭历史版本">×</button></header><div class="visual-dialog-body">${records.map(renderRevision).join('')||'<p>暂无归档版本。</p>'}</div><footer><button type="button" class="secondary-btn" data-history-close>关闭</button></footer></div>`;
      dialog.querySelectorAll('[data-history-close]').forEach(node=>node.addEventListener('click',()=>{dialog.classList.add('hidden');}));
      if(win.VisualDialogLayout)win.VisualDialogLayout.show(dialog.id);else dialog.classList.remove('hidden');
    }
    const button = name => root.querySelector('[data-inline-action="' + name + '"]');
    const editors = win.MacroCardEditors?.create({root,controller:()=>controller,confirm:ask,locked:(id,number)=>readOnly() || operation || [...localOperations.values()].some(scope=>scopeOverlap(scope,{id,number})),active:()=>!destroyed});
    function report(error) {
      if (destroyed) return;
      if(error?.projectStateRead){render(stateOf(controller));return;}
      const capacity=shared.capacityFailure284(error),message = capacity?shared.capacityMessage284(capacity):error?.message || String(error);
      if(win.ModelActivity)win.ModelActivity.set($('status'),{state:'error',message});else $('status').textContent = message;
      if(capacity)$('status').insertAdjacentHTML('beforeend',shared.capacityMarkup284(capacity));
      $('status').classList.add('error');
      if(projectNeedsRefresh&&!view.busy)$('status').insertAdjacentHTML('beforeend','<button type="button" data-inline-action="refresh">重新加载</button>');
      if (typeof options.onError === 'function') options.onError(message);
    }
    function notifyBusy() {
      const busy = isBusy();
      if (busy !== lastBusy) { lastBusy = busy; if (typeof options.onBusy === 'function') options.onBusy(busy); }
    }
    function isBusy() { return !destroyed && (operation || !!view.busy); }
    function readOnly(target = controller) { const current=stateOf(target),snapshot=current?.snapshot;return projectNeedsRefresh || !!current?.projectReadError || snapshot?.sourceEpochMatches === false&&!snapshot?.repeatableActions&&!shared.savedCardActionsAvailable(snapshot); }
    function assertWritable(target) { if (readOnly(target)) throw Error(staleMessage + ' 请先核对原稿；未提交付费调用。'); }
    function referenceKey(node) { return JSON.stringify([projectId, node.dataset.referenceKey || '']); }
    function rememberReferences() {
      for (const node of root.querySelectorAll('details.media-reference-picker')) {
        if (node.open) openReferences.add(referenceKey(node)); else openReferences.delete(referenceKey(node));
      }
      for(const node of root.querySelectorAll('details[data-source-key]')){
        const key=JSON.stringify([projectId,node.dataset.sourceKey]);
        if(node.open)openSources.add(key);else openSources.delete(key);
      }
    }
    function restoreReferences() {
      for (const node of root.querySelectorAll('details.media-reference-picker')) node.open = openReferences.has(referenceKey(node));
      for(const node of root.querySelectorAll('details[data-source-key]'))node.open=openSources.has(JSON.stringify([projectId,node.dataset.sourceKey]));
    }
    function activeCard(id,cards) {
      if(!cards.length)return null;
      const token=cardSelectionKey(id),saved=activeCards.get(token);
      const number=cards.some((card,index)=>Number(card.number||index+1)===saved)?saved:Number(cards[0].number||1);
      activeCards.set(token,number);
      return number;
    }
    function renderCardTabs(snapshot,current) {
      const nav=$('card-tabs');
      const cards=current?shared.readSceneCards(snapshot,current):[],id=current?idOf(current):'';
      const number=current?activeCard(id,cards):null;
      if(nav){
        nav.hidden=!cards.length;
        const dirty=editors?.unsavedScene?.(id)?.storyboardCards||[];
        shared.reconcileCards(nav,cards.map((card,index)=>{
          const value=Number(card.number||index+1),chosen=value===number;
          return `<button type="button" class="mi-card-tab" id="${esc(cardTabId(id,value))}" role="tab" data-inline-card-select data-segment="${esc(id)}" data-card="${value}" aria-selected="${chosen}" aria-controls="${esc(cardPanelId(id,value))}" tabindex="${chosen?'0':'-1'}">视频卡 ${value} · ${esc(card.durationSeconds)} 秒${dirty.includes(value)?'<span class="mi-card-dirty" aria-label="有未保存修改">•</span>':''}</button>`;
        }).join(''));
      }
      return number===null?{}:{[id]:number};
    }
    function showSavedPipelineReturn(next,current,planning) {
      const snapshot=next.snapshot||{};
      if(!controller||destroyed||next.busy||!snapshot.shotFirst||!snapshot.hasSavedStoryboardReturn||!current||shared.readSceneCards(snapshot,current).length)return;
      const sceneIdentity=snapshot.savedStoryboardReturns?.[idOf(current)];
      const savedScenes=sceneIdentity?[idOf(current)]:snapshot.savedStoryboardReturnIdentity?.sceneIds;
      if(Array.isArray(savedScenes)&&savedScenes.length&&!savedScenes.includes(idOf(current)))return;
      const records=[snapshot.active,snapshot.task,snapshot.segments?.[idOf(current)],...Object.values(snapshot.activeTasks||{})].filter(Boolean);
      const stopped=!!snapshot.lastError||records.some(row=>shared.isTerminalTextTask(row)||['needs_review','uncertain'].includes(String(row.state||row.status||'')));
      if(!stopped&&!sceneIdentity)return;
      const identity=shared.pipelineReturnIdentity(snapshot),id=idOf(current),key=JSON.stringify([identity,id,sceneIdentity]);
      if(automaticPipelineReads.has(key))return;
      automaticPipelineReads.add(key);
      const target=controller,serial=generation;
      // This only reads local evidence. It neither resumes nor submits a task.
      Promise.resolve().then(()=>alive(serial,target)?target.readPipelineReturn({segmentId:id}):null)
        .catch(error=>{if(alive(serial,target)&&selected===id)report(Error('已保存的原返回暂未读取：'+error.message+'。可点击查看最近原返回重试。'));});
    }
    function render(next,progressOnly=false) {
      view=next;
      if(drawPending||destroyed)return;
      if(progressOnly){drawStatus(next,rows(next.snapshot).find(row=>idOf(row)===selected));return;}
      if(win.requestAnimationFrame){drawPending=true;win.requestAnimationFrame(()=>{drawPending=false;if(!destroyed)draw(view);});}
      else draw(next);
    }
    function drawStatus(next,current) {
      const snapshot=next.snapshot||{},readError=next.projectReadError||'';
      const planning=shared.snapshotTextInFlight(snapshot)||Object.values(next.textTasks||{}).some(row=>shared.textTaskInFlight(row));
      const syncingRows=Object.values(next.textTasks||{}).filter(row=>row.syncing);
      const syncing=syncingRows.length>0;
      const sceneNotice=!planning&&!syncing&&!regroupError&&current?shared.sceneStatusNotice(snapshot,selected,next.message):'';
      const sceneIssue=!planning&&!syncing&&current?shared.sceneIssueMessage?.(snapshot,selected):'';
      const displayError=!!readError||!!regroupError||!!sceneIssue||next.error&&!sceneNotice&&!planning;
      const capacity=!readError&&displayError&&(regroupError?regroupCapacity284||shared.capacityFailure284(regroupError):shared.capacityFailure284(snapshot.sceneIssues223?.[selected])||shared.capacityFailure284(next.errorDetails)||shared.capacityFailure284(next.message));
      const statusMessage=capacity?shared.capacityMessage284(capacity):readError||regroupError||sceneIssue||sceneNotice||syncingRows[0]?.syncing||next.message||
        (projectId ? '已读取已保存状态' : '请先选择一个项目。');
      const indicator=$('status');
      const capacityOpen=indicator.querySelector?.('.mi-capacity-details284')?.open;
      indicator.hidden=Object.keys(next.mediaTasks||{}).length>0&&!next.activeTask&&!Object.keys(snapshot.active||{}).length&&!next.busy&&!operation&&!next.error&&!readError;
      const progressPanel=displayError?'':textProgressMarkup(next,esc);
      if(progressPanel){
        indicator.innerHTML=progressPanel+syncingRows.map(row=>`<p role="status">${esc(row.syncing)}</p>`).join('');
        win.ModelActivity?.set(indicator,{state:'',preserve:true});
      }
      else if(win.ModelActivity)win.ModelActivity.set(indicator,{state:displayError?'error':next.busy||operation||syncing?'pending':'success',message:statusMessage});
      else indicator.textContent=statusMessage;
      if(capacity)indicator.insertAdjacentHTML('beforeend',shared.capacityMarkup284(capacity,capacityOpen));
      indicator.classList.toggle('error',displayError);
      if((readError||projectNeedsRefresh&&next.error)&&!next.busy)indicator.insertAdjacentHTML('beforeend','<button type="button" data-inline-action="refresh">重新加载</button>');
    }
    function draw(next) {
      if (destroyed) return;
      editors?.capture();
      rememberReferences();
      view = next;
      const snapshot = view.snapshot || {}, planned = rows(snapshot);
      const stale=readOnly();
      if (selected !== 'all' && !planned.some(row => idOf(row) === selected)) selected = planned.length ? idOf(planned[0]) : null;
      const current = planned.find(row => idOf(row) === selected), index = planned.indexOf(current);
      if(!compactHeader){
      $('selector').innerHTML = '<option value="all">全部场次</option>' + planned.map((row, i) =>
        `<option value="${esc(idOf(row))}">第 ${i + 1} 场：${esc(row.title || '未命名场次')}</option>`).join('');
      $('selector').value = selected || 'all';
      $('selector').disabled = !planned.length;
      button('previous').disabled = index <= 0;
      button('next').disabled = index < 0 || index >= planned.length - 1;
      button('refresh').disabled = operation || !!view.busy || !controller;
      }
      const visible = current ? [current] : selected === 'all' ? planned : [];
      const count = visible.reduce((n, row) => n + shared.readSceneCards(snapshot,row).length, 0);
      const seconds=visible.reduce((n,row)=>n+shared.readSceneCards(snapshot,row).reduce((sum,card)=>sum+(Number.isFinite(card.durationSeconds)?card.durationSeconds:0),0),0);
      const uncut = visible.some(row=>!shared.readSceneCards(snapshot,row).length);
      const hasReturned=visible.some(row=>snapshot.segments?.[idOf(row)]?.returnedContent||Object.values(snapshot.cardRegenerations?.[idOf(row)]||{}).some(card=>card.returnedContent));
      const batches=snapshot.plan?.batchCompositionVersion===2?` · 已交付${snapshot.plan.completedBatchCount}/${snapshot.plan.totalBatchCount}批 · ${snapshot.plan.completedSceneIds?.length||0}/${planned.length}场可用`:'';
      const planning=shared.snapshotTextInFlight(snapshot)||Object.values(view.textTasks||{}).some(row=>['plan','plan_resume'].includes(row.action)&&shared.textTaskInFlight(row));
      if(!compactHeader)$('count').textContent = `共 ${planned.length} 个场次${batches} · 当前 ${count} 张卡${uncut&&hasReturned?' · 本次返回尚未转为视频卡':` · ${uncut?'已返回':'合计'} ${seconds} 秒${uncut?(planning?' · 后续场次编排中':' · 未完成场次待继续'):''}`}`;
      $('summary').innerHTML = '';
      $('scene-actions').innerHTML = '';
      renderSceneReturn279(snapshot,selected);
      renderSceneParts286(snapshot,selected,operation||view.busy||confirmationPending||[...localOperations.values()].some(row=>scopeOverlap(row,{id:selected})),stale);
      if(compactHeader){
        root.querySelector('.mi-toolbar').hidden=!current;
        if(current){
          const progress=snapshot.sceneProgress278?.[selected],detailed=snapshot.sceneParts286?.[selected]?.parts;
          const showPartCount=!detailed?.length&&Number.isInteger(progress?.totalParts)&&progress.totalParts>0&&Number.isInteger(progress?.acceptedParts);
          $('summary').innerHTML=`<h3>第 ${index+1} 场 · ${esc(current.title||'未命名场次')}</h3>${showPartCount?`<span class="mi-scene-parts279">已验收 ${progress.acceptedParts}/${progress.totalParts} 段</span>`:''}`;
          $('scene-actions').innerHTML=`<button type="button" class="primary scene-fill-button" data-inline-action="arrange" ${stale||operation||view.busy||planning?'disabled':''}>补齐分镜</button>`;
          const claimId=detailed?.some(row=>row.actions?.includes('recover_original'))?'':sceneRecoveryClaim279(snapshot,selected);
          if(claimId)$('scene-actions').insertAdjacentHTML('beforeend',`<button type="button" data-inline-action="recover-scene" ${operation||view.busy||planning?'disabled':''} title="核对原调用，保留已有卡片">核对原分镜结果</button>`);
          if(!detailed?.some(row=>row.actions?.includes('inspect_return'))&&snapshot.savedStoryboardReturns?.[selected]&&progress?.state!=='complete'&&snapshot.segments?.[selected]?.result?.complete!==true)
            $('scene-actions').insertAdjacentHTML('beforeend',`<button type="button" data-inline-action="scene-return" ${operation||view.busy?'disabled':''}>查看本场原返回</button>`);
        }
      }else{
      if (current) {
        const record = snapshot.segments?.[selected] || {}, cards = shared.readSceneCards(snapshot,current);
        const waitingCut=(snapshot.plan?.pendingSceneIds||[]).includes(selected),state = waitingCut?(planning?'waiting_cut':'waiting_resume'):snapshot.active?.segmentId === selected ? snapshot.active.status : record.status || 'planned';
        const hasComplete = cards.length > 0 && cards.every(shared.cardComplete), missing=cards.filter(card=>!shared.cardComplete(card)).length;
        const mode=fillModes.get(selected)||'missing';
        const scenePending=waitingCut||!cards.length||shared.operationBlocked(view,selected)||shared.textBlocked(view,selected)||cards.some((card,index)=>shared.cardMediaBlocked(view,selected,Number(card.number||index+1)));
        $('summary').innerHTML = `<div class="mi-scene-description"><h3>第 ${index + 1} 场 · ${esc(current.title)}</h3><p title="${esc(current.purpose || '按本场原文推进剧情')}">${esc(current.purpose || '按本场原文推进剧情')}</p><span>${esc(stateNames[state] || state)}${cards.length ? ' · ' + cards.length + ' 张卡' : ''}</span>${snapshot.repeatableActions&&snapshot.sourceEpochMatches===false?'<span class="mi-settings-note">按当前项目设置执行</span>':''}${record.error ? `<p class="mi-error">${esc(record.error)}</p>` : ''}</div>`;
        $('scene-actions').innerHTML = `<label class="mi-fill-mode">补齐范围<select data-scene-fill-mode aria-label="补齐分镜范围" ${stale||operation||view.busy||scenePending?'disabled':''}><option value="missing" ${mode==='missing'?'selected':''}>只补齐空缺${cards.length?'（'+missing+'张）':''}</option><option value="all" ${mode==='all'?'selected':''}>全部重新补齐${cards.length?'（'+cards.length+'张）':''}</option></select></label><button type="button" class="primary scene-fill-button" data-inline-action="arrange" ${stale || operation || view.busy || scenePending || hasComplete&&(mode==='missing'||!snapshot.repeatableActions&&!snapshot.shotFirst) ? 'disabled' : ''}>补齐分镜</button>${hasComplete&&mode==='missing'?`<span>${hasReturned?'本次返回尚未转为视频卡；下方旧卡仍保留':snapshot.shotFirst?'分镜已生成，可直接生成视频':'本场无空缺；重做请选择全部'}</span>`:''}`;
        if(snapshot.shotFirst){const allowed=!stale&&!operation&&!localOperations.size&&shared.regroupReady(view),limit=regroupLimit(snapshot,selected);
          $('scene-actions').insertAdjacentHTML('beforeend',`<label class="mi-fill-mode">组卡上限<select data-regroup-limit aria-label="本场组卡时长" ${allowed?'':'disabled'}><option value="15" ${limit===15?'selected':''}>15 秒</option><option value="30" ${limit===30?'selected':''}>30 秒</option></select></label><button type="button" data-inline-action="regroup" ${allowed?'':'disabled'}>重新组卡（免费）</button>${allowed?'':'<small>全部场次完成且无任务后可重新组卡。</small>'}`);
        }else $('scene-actions').insertAdjacentHTML('beforeend','<small>旧版卡片保持不变；如需整场分镜，请从步骤2新建编排版本。</small>');
      } else {
        $('summary').innerHTML = planned.length ? `<div class="mi-scene-description"><h3>全部场次</h3><p>共 ${planned.length} 场。可在上方选择一个场次，单独补齐分镜并生成本场视频。</p></div>` : '<div class="mi-scene-description"><h3>尚未生成分镜与视频卡</h3><p>请设置整场分镜；按每集／场的完整剧情生成镜头，再按顺序组卡。</p></div>';
        if (!planned.length && snapshot.sourceLocked && !pending(view)) $('scene-actions').insertAdjacentHTML('beforeend', `<button type="button" class="primary" data-inline-action="restart" ${stale || operation || view.busy ? 'disabled' : ''}>重新识别大段（付费）</button>`);
      }
      if (!snapshot.repeatableActions&&(snapshot.sourceEpochMatches === false || projectNeedsRefresh && view.loaded))
        $('summary').insertAdjacentHTML('afterbegin', `<p class="mi-stale-warning" role="${shared.savedCardActionsAvailable(snapshot)?'status':'alert'}">${esc(snapshot.sourceEpochMatches===false&&shared.savedCardActionsAvailable(snapshot)?'当前展示已保存版本的场次与分镜；本卡可继续编辑、重新生成，并使用当前项目设置。新剧本的场次请从步骤1重新分集。':snapshot.sourceEpochMatches === false ? staleMessage : '正在核对当前原稿与已保存场次；核对完成前暂不开放付费。')}</p>`);
      if (snapshot.active?.claimId && !shared.isTerminalTextTask?.(snapshot.active)) $('scene-actions').insertAdjacentHTML('afterbegin', `<button type="button" class="mi-recover" data-inline-action="recover" ${operation || view.busy ? 'disabled' : ''}>核对原调用（不重提）</button>`);
      if (snapshot.canResume) $('scene-actions').insertAdjacentHTML('beforeend', `<button type="button" class="primary" data-inline-action="resume" ${stale||operation||view.busy?'disabled':''}>继续未完成编排 · 核价</button>`);
      if (snapshot.shotFirst&&snapshot.hasSavedStoryboardReturn) $('scene-actions').insertAdjacentHTML('beforeend', '<button type="button" data-inline-action="pipeline-return">查看最近原返回 · 免费</button>');
      }
      const sceneResult=snapshot.segments?.[selected]?.result;
      const progressiveIncomplete=sceneResult?.progressive228===true&&sceneResult.complete!==true;
      if(current&&view.catalog&&shared.sceneVideoPlan230){
        const plan=shared.sceneVideoPlan230(view,selected),batch=view.sceneVideoBatches230?.[selected],working=['quoting','ready','submitting'].includes(batch?.state);
        $('scene-actions').insertAdjacentHTML('beforeend',`<button type="button" data-inline-action="scene-videos" ${stale||operation||working||!plan.cardNumbers.length?'disabled':''} ${progressiveIncomplete?'title="本场分镜尚未补齐，仅提交已就绪的卡片"':''}>${working?(batch.state==='submitting'?`正在提交 ${batch.submitted||0}/${batch.total||0}`:'正在核对本场费用…'):progressiveIncomplete?'生成已就绪视频':'生成本场全部视频'}</button>`);
      }
      if(current){
        const key=JSON.stringify([projectId,selected]),cards=shared.readSceneCards(snapshot,current);
        const available=cards.some((card,index)=>snapshot.media?.[selected]?.[String(card.number||index+1)]?.videoFile);
        $('scene-actions').insertAdjacentHTML('beforeend',`<button type="button" data-inline-action="scene-download" ${!available||sceneDownloads240.has(key)?'disabled':''} title="选择本地文件夹，按视频卡顺序保存本场已生成的视频">${sceneDownloads240.has(key)?'正在下载本场视频…':progressiveIncomplete?'下载已生成视频':'下载本场视频'}</button>`);
        if(sceneDownloadMessages240.has(key))$('scene-actions').insertAdjacentHTML('beforeend',`<small data-scene-download-status role="status">${esc(sceneDownloadMessages240.get(key))}</small>`);
      }
      drawStatus(next,current);
      const activeCardNumbers=renderCardTabs(snapshot,current);
      shared.reconcileCards($('cards'),planned.length ? shared.renderCards(snapshot, selected || 'all', {...view,activeCardNumbers,cardNavigation:{tabId:cardTabId,panelId:cardPanelId},operations:{...view.operations,...Object.fromEntries([...localOperations].map(([,scope],index)=>['inline'+index,{action:'segment',segmentId:scope.id,cardNumber:scope.number,kind:scope.kind||'text',state:'running'}]))}, busy:stale || view.busy || operation}) : '');
      restoreReferences();
      root.querySelectorAll('[data-local-feedback]').forEach(node=>node.remove());
      editors?.mount();
      const panel=current&&activeCardNumbers[selected]!==undefined?cardPanelId(selected,activeCardNumbers[selected]):'';
      if(panel!==lastCardPanel){
        lastCardPanel=panel;
        const tab=Array.from($('card-tabs')?.querySelectorAll?.('[data-inline-card-select]')||[]).find(node=>node.getAttribute('aria-selected')==='true');
        tab?.scrollIntoView?.({block:'nearest',inline:'nearest'});
      }
      for(const node of root.querySelectorAll('[data-model-pending]'))win.ModelActivity?.set(node,{state:'pending'});
      win.AspectRatio?.enhance(root);
      const signature = snapshot;
      if (signature !== lastSnapshot) {
        lastSnapshot = signature;
        if (typeof options.onSnapshot === 'function') options.onSnapshot(snapshot);
      }
      notifyBusy();
      showSavedPipelineReturn(next,current,planning);
    }
    const request = async (url, settings={}) => {
      const read=String(settings.method||'GET').toUpperCase()==='GET';
      const Abort=win.AbortController||globalThis.AbortController,abort=read&&Abort?new Abort():null;
      const isProjectState=url.startsWith('/api/visual/macro/state?');
      const configured=Number(options.readTimeoutMs),timeout=Number.isFinite(configured)&&configured>0?Math.max(25,Math.min(60000,configured)):isProjectState?30000:15000;
      const timeoutMessage=isProjectState?'读取项目状态超时，已保存内容仍保留，请点击“重新加载”。':
        url.startsWith('/api/tasks/')?'读取原任务进度超时。':'读取数据超时。';
      let timer=null,timedOut=false,rejectRead;
      const deadline=read?new Promise((_,reject)=>{rejectRead=reject;timer=win.setTimeout(()=>{
        timedOut=true;abort?.abort();reject(Error(timeoutMessage));
      },timeout);}):null;
      const cancel=()=>{abort?.abort();rejectRead?.(Error('已切换项目，停止读取旧项目状态。'));};
      if(read)readAborters.add(cancel);
      const transport=(async()=>{
        if(options.request)return options.request(url,{...settings,...(abort?{signal:abort.signal}:{})});
        const response = await win.fetch(url, {method:settings.method, credentials:'same-origin', cache:'no-store',
          ...(abort?{signal:abort.signal}:{}),...(settings.body ? {headers:{'Content-Type':'application/json'}, body:JSON.stringify(settings.body)} : {})});
        let data; try { data = await response.json(); } catch (_) { throw Error('接口未返回可识别数据，请刷新核对原状态。'); }
        const terminalTask=url.startsWith('/api/tasks/')&&['error','failed'].includes(data.state);
        if (!response.ok || data.error && !data.projectId&&!terminalTask) throw shared.responseError284(data,response.status);
        return data;
      })();
      try{return await(read?Promise.race([transport,deadline]):transport);}
      catch(error){if(timedOut)throw Error(timeoutMessage);throw error;}
      finally{if(timer!==null)win.clearTimeout(timer);readAborters.delete(cancel);}
    };
    function stopReads(){for(const cancel of readAborters)cancel();readAborters.clear();}
    function stopWait() {
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
      if (wake) { const finish = wake; wake = null; finish(); }
    }
    function delay() { return new Promise(resolve => { wake = resolve; timer = win.setTimeout(() => { timer = null; wake = null; resolve(); }, 1200); }); }
    function alive(serial, target) { return !destroyed && serial === generation && target === controller; }
    async function readSaved(target, serial) {
      const ticket = ++readGeneration;
      await target.load();
      // The editor tracks each card's own result identity and preserves dirty
      // text on conflicts. Clearing every card on an unrelated revision would
      // discard an open draft when another card or scene finishes.
      if (alive(serial, target) && ticket === readGeneration && stateOf(target).loaded) { projectNeedsRefresh = false;projectIdentity=pendingProjectIdentity;render(stateOf(target)); }
    }
    async function catalog(target, serial, force=false) {
      if (!alive(serial, target) || !rows(stateOf(target).snapshot).length || stateOf(target).catalog&&!force) return;
      const identity=pendingProjectIdentity;
      if(catalogPromise&&catalogIdentity232===identity)return catalogPromise;
      const work=target.loadCatalog().then(result=>result?.stale?result:{updated:true}).catch(error=>{if(alive(serial,target))report(Error('媒体目录暂不可用：'+error.message+'。已保存作品仍可查看，未提交媒体。'));return {failed:true,error};});
      catalogIdentity232=identity;catalogPromise=work;try{return await work;}finally{if(catalogPromise===work)catalogPromise=null;}
    }
    async function reconnect(target,serial,retryPaused=false) {
      if(!alive(serial,target))return;
      if(reconnectPromise)return reconnectPromise;
      const work=(async()=>{
        const result=await target.reconnectMedia({retryPaused});
        for(const item of result)if(item.error&&alive(serial,target))report(Error(`${mediaScopeLabel(item)}原任务查询暂未接回：${item.error}。原记录保留；不会重新生成或扣费。`));
        if(shownOnce&&alive(serial,target))watch(target,serial).catch(error=>{if(alive(serial,target))report(error);});
      })();reconnectPromise=work;
      try{return await work;}finally{if(reconnectPromise===work)reconnectPromise=null;}
    }
    async function watch(target, serial) {
      if (watchPromise) return watchPromise;
      const reportedErrors=new Set(),inFlight=new Set();
      const inspect=async(key,work)=>{
        if(inFlight.has(key))return;
        inFlight.add(key);
        try{await work();reportedErrors.delete(key);}
        catch(error){if(!error?.projectStateRead&&!reportedErrors.has(key)){reportedErrors.add(key);if(alive(serial,target))report(Error('原任务状态查询暂不可用：'+error.message+'；其他任务仍在独立查询，不会重新提交收费请求。'));}}
        finally{inFlight.delete(key);}
      };
      const work = (async () => {
        while (alive(serial, target)) {
          const current = stateOf(target);
          if (!current.activeTask && !Object.keys(current.mediaTasks || {}).length) break;
          const textIds=Object.keys(current.textTasks||{}).length?Object.keys(current.textTasks):current.activeTask?[current.activeTask]:[];
          textIds.forEach(id=>inspect('text:'+id,()=>target.pollOnce(id)));
          Object.keys(current.mediaTasks||{}).forEach(key=>inspect('media:'+key,()=>target.pollMediaOnce(key)));
          const after = stateOf(target);
          if (!after.activeTask && !Object.keys(after.mediaTasks || {}).length) break;
          await delay();
        }
        catalog(target, serial).catch(report);
      })();
      watchPromise = work;
      try { await work; } finally { if (watchPromise === work) watchPromise = null; }
    }
    async function perform(work, scope=null) {
      if (destroyed || !controller) throw Error('请先读取项目。');
      if (operation || [...localOperations.values()].some(row=>scopeOverlap(row,scope)&&!(scope?.kind==='detach'&&row.kind==='observe'))) throw Error('本卡操作仍在提交，请勿重复点击；其他卡片可以继续操作。');
      if(scope?.kind!=='regroup'){regroupError='';regroupCapacity284=null;}
      const target = controller, serial = generation;
      const token=Symbol('operation');if(scope)localOperations.set(token,scope);else operation=true;
      // Paint only the clicked card before parsing/mounting a large script.
      if(scope&&$('cards').querySelectorAll&&win.document?.createElement){const card=[...$('cards').querySelectorAll('.video-card')].find(node=>node.dataset.segment===scope.id&&Number(node.dataset.card)===scope.number);if(card){const wait=win.document.createElement('div');wait.className='card-text-wait';wait.dataset.localFeedback='1';wait.setAttribute('role','status');wait.innerHTML='<i class="video-generation-spinner" aria-hidden="true"></i><strong>正在准备本卡任务…</strong>';card.querySelector('.shot-list')?.prepend(wait);}}
      await frame();if(!alive(serial,target)){localOperations.delete(token);return;}render(stateOf(target));
      try { return await work(target, serial); }
      catch (error) { if (alive(serial, target)&&(!scope||localOperations.has(token))) {if(!error?.projectStateRead){regroupError=error.message||String(error);regroupCapacity284=shared.capacityFailure284(error);}report(error);} throw error; }
      finally { if (alive(serial, target)) { localOperations.delete(token);if(!scope)operation = false;render(stateOf(target)); } }
    }
    async function confirmThenPerform(title, work, scope=null, confirmOptions) {
      if (destroyed || !controller) throw Error('请先读取项目。');
      if (operation || confirmationPending || [...localOperations.values()].some(row=>scopeOverlap(row,scope)&&!(scope?.kind==='detach'&&row.kind==='observe'))) throw Error('上一项操作仍在进行，请勿重复点击。');
      const target=controller,serial=generation;
      const confirmationTicket=Symbol('confirmation');confirmationPending=confirmationTicket;
      let handedOff=false;
      try {
        assertWritable(target);
        const confirmed=await ask(title,confirmOptions);
        if(confirmationPending===confirmationTicket)confirmationPending=false;
        if(!alive(serial,target))return;
        if(!confirmed)return {cancelled:true};
        if(scope?.kind==='detach')for(const [token,row]of localOperations)if(row.kind==='observe'&&scopeOverlap(row,scope))localOperations.delete(token);
        handedOff=true;
        return await perform(work,scope);
      } catch(error) {
        if(!handedOff&&alive(serial,target))report(error);
        throw error;
      } finally { if(confirmationPending===confirmationTicket)confirmationPending=false; }
    }
    async function confirmAndRun(target, serial, quote, title, media, currentSourcePlan=false) {
      if (!quote || !alive(serial, target)) return;
      if(!currentSourcePlan)assertWritable(target);
      // Each confirmation owns its returned quote, never a shared latest-quote alias.
      const taskId=media?await target.confirmMediaQuote(quote):await target.confirmQuote(quote);
      if (alive(serial, target)) {
        // Observing a background task is not a page-wide UI operation.
        watch(target,serial).catch(error=>{if(alive(serial,target))report(error);});
      }
      return {submitted:true,taskId};
    }
    async function setProject(project, settings={}) {
      const nextId = String(project?.id || project?.projectId || '');
      if (destroyed) return;
      const identity = projectFingerprint(project);
      // Controller snapshots are read-only view values. Do not deep-copy a
      // megabyte of saved cards every time a user returns to step 3.
      if (controller && nextId === projectId && identity === projectIdentity && !projectNeedsRefresh && settings.reload!==true) return loadPromise || view.snapshot || {};
      const sameProject = !!controller && nextId === projectId;
      if(sameProject&&identity!==pendingProjectIdentity)controller.invalidateCatalog232?.();
      mediaProjectKey232=mediaPreferences232(project);
      if (!sameProject) {
        shared.clearMediaCache231?.($('cards'));
        generation++; stopWait();stopReads(); controller?.dispose(); controller = null;localOperations.clear();
        projectId = nextId; selected = null; operation = false; loadPromise = null; watchPromise = null; lastSnapshot = ''; openReferences.clear();openSources.clear();fillModes.clear();regroupLimits.clear();regroupError='';regroupCapacity284=null;
        shownOnce=false;resumePromise=null;catalogPromise=null;catalogIdentity232='';reconnectPromise=null;lastResumeAt=0;confirmationPending=false;automaticPipelineReads.clear();
        // Remove old-project details before load() emits, so old keys cannot return.
        if($('cards').replaceChildren)$('cards').replaceChildren();else $('cards').innerHTML='';$('cards')._macroChildren=[];
        editors?.clear();
        view = {}; root.hidden = true;
      }
      pendingProjectIdentity = identity; projectNeedsRefresh = true;
      if (!shared.projectIdValid(nextId)) { projectNeedsRefresh = false; render({snapshot:{},message:'请先选择一个已保存项目。'}); return; }
      const serial = generation;
      if (!sameProject) controller = shared.createController({projectId:nextId,seriesManaged:Boolean(project.seriesProjectId),initialSnapshot:settings.initialSnapshot, request, onChange:(next,draft,progressOnly) => { if (serial === generation) render(next,progressOnly); }});
      const target = controller;
      root.hidden=false;render(stateOf(target));
      loadPromise = (async () => { try { await readSaved(target, serial);if(!alive(serial,target))return;lastResumeAt=Date.now();catalog(target,serial,true).catch(report);reconnect(target,serial).catch(error=>{if(alive(serial,target))report(error);});return stateOf(target).snapshot; }
        catch (error) { if (alive(serial, target)) report(error); throw error; } })();
      const work = loadPromise;
      try { return await work; } finally { if (alive(serial, target) && loadPromise === work) loadPromise = null; }
    }
    function mediaPreferences232(project){const value=project?.settings||{};return JSON.stringify(['imageRouteType','videoRouteType','imageModel','imageTier','imageResolution','videoModel','videoTier','resolution','ratio','videoDuration'].map(key=>value[key]??null));}
    async function refreshMediaDefaults232(project){
      if(destroyed||!controller||String(project?.id||project?.projectId||'')!==projectId)return {stale:true};
      const key=mediaPreferences232(project);if(key===mediaProjectKey232)return {unchanged:true};
      mediaProjectKey232=key;pendingProjectIdentity=projectFingerprint(project);
      // A settings acknowledgement only changes media defaults. Keep the
      // current text/editor snapshot and fetch capabilities independently.
      const target=controller,serial=generation;target.invalidateCatalog232?.();
      await catalog(target,serial,true);
      return alive(serial,target)?{updated:true}:{stale:true};
    }
    function needsMediaPricesRefresh251(){
      const current=controller&&stateOf(controller);
      return !destroyed&&!!current&&rows(current.snapshot).length>0&&(!current.catalog||current.catalogRefreshPending251===true);
    }
    async function refreshMediaPrices156(){
      if(destroyed||!controller)return {stale:true};
      const target=controller,serial=generation;
      target.invalidateMediaPrices156?.();catalogPromise=null;catalogIdentity232='';
      const result=await catalog(target,serial,true);
      if(!alive(serial,target))return {stale:true};
      if(result?.failed)throw result.error;
      return result?.updated?{updated:true}:{stale:true};
    }
    async function start(policy,startOptions={}) {
      root.hidden = false;
      const work=async (target, serial) => {
        // setProject already read the saved source. Only refresh stale views;
        // quote/submit also validate the exact inputs on the server.
        if(!stateOf(target).loaded||projectNeedsRefresh||stateOf(target).projectReadError)await readSaved(target, serial);
        if (!alive(serial, target)) return;
        if (rows(stateOf(target).snapshot).length&&!startOptions.rerun) { await catalog(target, serial); return clone(stateOf(target).snapshot); }
        if(!startOptions.scope)assertWritable(target);
        const scopedStart=startOptions.rerun===true&&['current','all'].includes(startOptions.scope);
        const blocked=scopedStart ? shared.scopedPlanTextBlocked(stateOf(target))||Object.keys(stateOf(target).mediaTasks||{}).length>0 : pending(stateOf(target))&&!stateOf(target).snapshot.repeatableActions;
        if (blocked) throw Error('本次任务正在执行，完成后可再次点击；其他功能可继续使用。');
        // A failed locked workspace may be quoted again, but its original
        // source/settings must not be replaced by a reopened settings dialog.
        if (!scopedStart&&!stateOf(target).snapshot.sourceLocked) target.updateDraft({policy:clone(policy)});
        const quote = await target.quote('plan',undefined,undefined,{...(startOptions.rerun?{restart:true,policy:clone(policy)}:{}),arrangementMode:policy.arrangementMode,...(startOptions.scope?{scope:startOptions.scope,...(startOptions.scope==='current'?{segmentId:startOptions.segmentId,sceneNumber:startOptions.sceneNumber}:{})}:{})});
        if(startOptions.confirmQuote){
          const accepted=await ask(quoteMessage(quote,'调用AI重新编排剧本'),{quote:true});
          if(!alive(serial,target))return;
          if(!accepted){target.cancelQuote();return {...clone(stateOf(target).snapshot),submission:{cancelled:true}};}
          assertWritable(target);
        }
        const submission=await confirmAndRun(target, serial, quote, '补齐场次分镜', false,!!startOptions.scope);
        return alive(serial, target) ? {...clone(stateOf(target).snapshot),submission} : undefined;
      };
      // The page-level entry point can show its confirmation before loading
      // the saved workspace; only it may set this flag after user approval.
      return startOptions.confirmed ? perform(work) : confirmThenPerform('识别剧情场次目录',work);
    }
    function select(id) {
      if (!controller) return;
      editors?.capture(); rememberReferences(); selected = id; controller.selectSegment(id);
    }
    function selectCard(id,number) {
      if(!controller||id!==selected)return;
      const scene=rows(view.snapshot).find(row=>idOf(row)===id),cards=scene?shared.readSceneCards(view.snapshot,scene):[];
      if(!cards.some((card,index)=>Number(card.number||index+1)===number))return;
      editors?.capture();rememberReferences();activeCards.set(cardSelectionKey(id),number);
      render(stateOf(controller));
    }
    async function resumeSaved() {
      if(!controller||destroyed)return;
      if(loadPromise)return loadPromise;
      if(resumePromise)return resumePromise;
      // Navigation is immediately rendered; synchronize in the background.
      // Coalesce re-entry/focus events, and never reserve or submit here.
      if(Date.now()-lastResumeAt<1000)return;
      lastResumeAt=Date.now();const target=controller,serial=generation;
      const work=(async()=>{
        await target.load({background:true});if(!alive(serial,target))return;
        if(stateOf(target).loaded){projectNeedsRefresh=false;projectIdentity=pendingProjectIdentity;render(stateOf(target));}
        await reconnect(target,serial,true);
        if(alive(serial,target))watch(target,serial).catch(error=>{if(alive(serial,target))report(error);});
      })();resumePromise=work;
      try{return await work;}finally{if(resumePromise===work)resumePromise=null;}
    }
    async function refresh() {
      return perform(async (target, serial) => { await readSaved(target, serial); if (alive(serial, target)) { catalog(target, serial,true).catch(report);reconnect(target,serial,true).catch(error=>{if(alive(serial,target))report(error);});watch(target, serial).catch(report); } return stateOf(target).snapshot; });
    }
    async function show() {
      if (destroyed) return;
      root.hidden = false;
      if(controller)render(stateOf(controller));
      // Resume observation of an already saved task only. This path never
      // obtains a quote or submits a model/media request.
      if (controller && !destroyed) {
        const target = controller, serial = generation;
        // Reference images may have finished in step 2 while this workspace
        // was hidden. Refresh only this read-only catalog on each entry.
        if(stateOf(target).loaded)catalog(target,serial,true).catch(report);
        if(!loadPromise&&(shownOnce||projectNeedsRefresh))resumeSaved().catch(error=>{if(alive(serial,target))report(error);});
        shownOnce=true;
        watch(target, serial).catch(error=>{if(alive(serial,target))report(error);});
      }
      return view.snapshot || {};
    }
    const unsavedReturns = new Map();
    function handleReturnInput(event){
      const editor=event.target.closest?.('[data-return-editor]');
      if(editor&&root.contains(editor)){
        unsavedReturns.set(JSON.stringify([editor.dataset.segment,editor.dataset.returnHash]),editor.value);
        controller?.updateReturnedDraft(editor.dataset.segment,editor.dataset.returnHash,editor.value);
      }
    }
    function handleClick(event) {
      const partButton=event.target.closest('[data-part-action]');
      if(partButton&&partsPanel?.contains(partButton)&&!partButton.disabled){
        const id=selected,requestHash=partButton.dataset.requestHash,action=partButton.dataset.partAction;
        perform(async(target,serial)=>{
          const part=shared.scenePart286(stateOf(target).snapshot,id,requestHash,action);
          if(!part||selected!==id)return;
          if(action==='inspect_return'){
            const result=await target.readPipelineReturn({segmentId:id,requestHash});
            if(!alive(serial,target)||selected!==id||result?.stale)return;
            displayedSceneReturn279={sceneId:id,part,text:result.rawResponse};
            renderSceneReturn279(stateOf(target).snapshot,id);
            $('scene-return').scrollIntoView?.({block:'nearest'});
            $('scene-return').querySelector('button').focus({preventScroll:true});
            return;
          }
          if(action==='recover_original'){
            await target.recover(part.claimId,part.stageClaimId);
            if(alive(serial,target))watch(target,serial).catch(report);
            return;
          }
          if(action!=='retry_part')return;
          assertWritable(target);
          editors?.capture();
          if(editors?.unsavedScene?.(id)?.sourceCards.length)
            throw Error('本场有未保存的原文修改，请先保存并核对分镜。');
          const quote=await target.quote('plan_resume',undefined,undefined,{retryPart286:{sceneId:id,requestHash}});
          if(!quote||!alive(serial,target))return;
          const title=`补做第 ${part.partNumber} 段`;
          if(!await ask(quoteMessage(quote,title),{quote:true})||selected!==id){
            target.cancelQuote();return;
          }
          return confirmAndRun(target,serial,quote,title,false);
        },{id,kind:action==='inspect_return'?'observe':'text'}).catch(()=>{});
        return;
      }
      const resetVideo=event.target.closest('[data-media-reset-settings]');
      if(resetVideo&&root.contains(resetVideo)&&!resetVideo.disabled&&controller){
        if(readOnly(controller)){report(Error(staleMessage));return;}
        controller.resetVideoCardSettings(resetVideo.dataset.segment,Number(resetVideo.dataset.card)).catch(report);
        return;
      }
      const saveReturn=event.target.closest('[data-return-save]');
      if(saveReturn&&root.contains(saveReturn)&&!saveReturn.disabled){
        const article=saveReturn.closest('.scene-return-editor'),editor=article?.querySelector('[data-return-editor]');
        if(editor){
          const id=saveReturn.dataset.segment,hash=saveReturn.dataset.returnHash,text=editor.value,revision=Number(saveReturn.dataset.draftRevision||0);
          const key=JSON.stringify([id,hash]);
          perform(async target=>{await target.saveReturnedDraft(id,hash,text,revision);if(unsavedReturns.get(key)===text)unsavedReturns.delete(key);},{id,kind:'edit'}).catch(()=>{});
        }
        return;
      }
      const cardTab=event.target.closest('[data-inline-card-select]');
      if(cardTab&&root.contains(cardTab)){selectCard(cardTab.dataset.segment,Number(cardTab.dataset.card));return;}
      const recoverCard=event.target.closest('[data-card-recover]');
      if(recoverCard&&root.contains(recoverCard)&&!recoverCard.disabled){
        const id=recoverCard.dataset.segment,number=Number(recoverCard.dataset.card);
        perform(async(target,serial)=>{await target.checkCardTask(id,number);if(alive(serial,target))watch(target,serial).catch(report);},{id,number,kind:'observe'}).catch(()=>{});return;
      }
      const savedReturn=event.target.closest('[data-storyboard-return]');
      if(savedReturn&&root.contains(savedReturn)&&!savedReturn.disabled){
        const id=savedReturn.dataset.segment,number=Number(savedReturn.dataset.card);
        perform(target=>target.readStoryboardReturn(id,number),{id,number,kind:'observe'}).catch(()=>{});return;
      }
      const detach=event.target.closest('[data-media-detach]');
      if(detach&&root.contains(detach)&&!detach.disabled){
        const id=detach.dataset.segment,number=Number(detach.dataset.card),requestId=detach.dataset.requestId;
        const warning='只解除这张卡的本机等待，原任务记录会保留。\n\n这不能保证取消上游任务或退款，原任务之后可能仍产生费用。解除后可重新核价；新的生成需要另行确认并收费。\n\n是否继续解除本机等待？';
        confirmThenPerform(warning,target=>target.detachMedia(id,number,requestId),
          {id,number,kind:'detach'},{warning:true}).catch(()=>{});return;
      }
      const regenerate=event.target.closest('[data-card-regenerate]');
      if(regenerate && root.contains(regenerate) && !regenerate.disabled){
        const id=regenerate.dataset.segment,number=Number(regenerate.dataset.card);
        perform(async(target,serial)=>{
          assertWritable(target);await editors?.saveSource(id,number);if(!alive(serial,target))return;
          // Clicking this card's regeneration button is the user's approval.
          // Keep the server quote/claim contract, but do not pause for a modal.
          const quote=await target.quote('segment',id,number,{directSubmit:true});
          if(!quote||!alive(serial,target))return;
          await confirmAndRun(target,serial,quote,'重新生成本卡分镜',false);
        },{id,number,kind:'text'}).catch(()=>{});return;
      }
      const action = event.target.closest('[data-inline-action]');
      const media = event.target.closest('[data-media-quote],[data-media-observe]');
      if (action && root.contains(action) && !action.disabled) {
        const name = action.dataset.inlineAction;
        if (name === 'previous' || name === 'next') {
          const planned = rows(view.snapshot), index = planned.findIndex(row => idOf(row) === selected);
          const item = planned[index + (name === 'next' ? 1 : -1)]; if (item) select(idOf(item));
        } else if (name === 'refresh') refresh().catch(() => {});
        else if(name==='history')showHistory().catch(report);
        else if (name === 'restart') {
          try { assertWritable(controller); } catch (error) { report(error); return; }
          Promise.resolve().then(() => typeof options.onRestart === 'function' ? options.onRestart() : start(controller.getDraft().policy)).catch(report);
        }
        else if (name === 'recover') perform(async (target, serial) => { if(selected&&selected!=='all')await target.checkCardTask(selected);else await target.recover(); if(alive(serial,target))watch(target, serial).catch(report); }).catch(() => {});
        else if(name==='recover-scene'){
          const sceneId=selected,claimId=sceneRecoveryClaim279(view.snapshot,sceneId);
          if(claimId)perform(async(target,serial)=>{
            if(sceneRecoveryClaim279(stateOf(target).snapshot,sceneId)!==claimId)return;
            await target.recover(claimId);
            if(alive(serial,target))watch(target,serial).catch(report);
          }).catch(()=>{});
        }
        else if (name === 'pipeline-return') perform(target=>target.readPipelineReturn()).catch(()=>{});
        else if(name==='scene-return'){
          const sceneId=selected;
          perform(async(target,serial)=>{
            const result=await target.readPipelineReturn({segmentId:sceneId});
            if(!alive(serial,target)||selected!==sceneId||result?.stale)return;
            if(result?.unavailableForScene||typeof result?.rawResponse!=='string')throw Error('本场暂无可读取的原返回，请刷新状态后再试。');
            displayedSceneReturn279={sceneId,identity:shared.pipelineReturnIdentity(stateOf(target).snapshot),
              text:result.sceneEditors?.[sceneId]?.text||result.rawResponse};
            renderSceneReturn279(stateOf(target).snapshot,sceneId);
            $('scene-return').querySelector('button').focus({preventScroll:true});
          }).catch(()=>{});
        }
        else if(name==='close-scene-return'){
          displayedSceneReturn279=null;renderSceneReturn279(view.snapshot,selected);button('scene-return')?.focus({preventScroll:true});
        }
        else if(name==='scene-download'){
          const source=stateOf(controller)?.snapshot,sceneId=selected,owner=projectId,serial=generation,target=controller;
          const key=JSON.stringify([owner,sceneId]);
          if(sceneDownloads240.has(key))return;
          const selection={projectId:owner,sceneId,sourceKind:'macro',revisionId:String(source?.revisionId||'')};
          sceneDownloads240.add(key);sceneDownloadMessages240.set(key,'正在选择保存位置或下载本场视频…');render(stateOf(target));
          Promise.resolve().then(()=>{
            if(!win.SceneVideoDownload240)throw Error('下载组件尚未加载，请重新打开软件。');
            return win.SceneVideoDownload240.save(selection,{win,feature:source?.outputModule227||'workflow'});
          }).then(result=>sceneDownloadMessages240.set(key,win.SceneVideoDownload240.summary(result)),error=>sceneDownloadMessages240.set(key,'下载失败：'+(error.message||error)))
            .finally(()=>{sceneDownloads240.delete(key);if(alive(serial,target)&&projectId===owner)render(stateOf(target));});
        }
        else if(name==='scene-videos'){
          const sceneId=selected;
          perform(async(target,serial)=>{
            assertWritable(target);editors?.capture();
            const batch=await target.quoteSceneVideos230(sceneId,async number=>{
              if(!alive(serial,target)||selected!==sceneId)throw Error('当前项目或场次已切换，未提交批量视频。');
              if(editors?.sourceDraft(sceneId,number)?.dirty)throw Error('本场有未保存的原文修改，请先保存原文并补齐对应分镜。');
              editors?.assertReferencesReady233?.(sceneId,number);
              await editors?.save(sceneId,number);
            });
            if(!batch)return;
            try{
              if(!alive(serial,target)||selected!==sceneId)return;
              const details=batch.quotes.map(row=>`视频卡 ${row.cardNumber} · ${row.modelName} · ${row.durationSeconds}秒 · ${row.totalCredits}积分${row.pricingMode==='live_quote'?' · 实时核价 · 有效至 '+new Date(Number(row.expiresAt)*1000).toLocaleTimeString('zh-CN',{hour12:false})+(row.upstreamEstimateOnly?' · 上游估价，本次确认积分固定':''):''}`).join('\n');
              const accepted=await ask(`仅生成当前场次：${batch.title}\n本次提交 ${batch.quotes.length} 张视频卡，合计 ${batch.totalCredits} 积分。\n${details}\n已跳过 ${batch.skipped.length} 张已有视频、执行中、待核对或未就绪的卡片。\n${batch.tailFrameContinuation?"尾帧续画已开启：逐卡等待视频完成后再提交下一卡，失败将暂停后续依赖。":""}仅提交本次确认的卡片；后续返回的新卡片需另行点击生成。其他场次继续原任务。\n是否确认生成？`,{quote:true,title:'确认生成本场视频'});
              if(!accepted||!alive(serial,target)||selected!==sceneId)return;
              assertWritable(target);await target.confirmSceneVideos230(batch.batchId);
              if(alive(serial,target))watch(target,serial).catch(report);
            }finally{await target.cancelSceneVideoBatch230(batch.batchId);}
          },{id:sceneId,kind:'media'}).catch(()=>{});
        }
        else if(name==='regroup'){
          const sceneId=selected,maxSeconds=regroupLimit(stateOf(controller).snapshot,sceneId),clickedController=controller,clickedGeneration=generation;
          regroupError='';regroupCapacity284=null;
          const assertClean=()=>{const unsaved=editors?.unsavedScene?.(sceneId);if(unsaved?.sourceCards.length||unsaved?.storyboardCards.length)throw Error('本场有未保存的原文或分镜修改，请先保存后再重新组卡；草稿未丢弃。');};
          perform(async(target,serial)=>{
            assertWritable(target);assertClean();
            const preview=await target.previewRegroup(sceneId,maxSeconds);if(!preview||!alive(serial,target))return;
            const counts=preview.archiveCounts||{},message=`本场按 ${preview.maxSeconds} 秒上限重新组卡：${preview.beforeCardCount} 张 → ${preview.afterCardCount} 张。\n不调用模型，不扣费。\n旧原文修改 ${counts.sourceEdits||0} 项、分镜草稿 ${counts.cardDrafts||0} 项、单卡重做 ${counts.cardRegenerations||0} 项、媒体记录 ${counts.media||0} 项会归档到旧版本，不自动套到新卡；其他场次和资产参考图保留。\n是否确认？`;
            const accepted=await ask(message,{warning:true,title:'确认免费重新组卡'});if(!accepted||!alive(serial,target))return;
            assertWritable(target);assertClean();
            const applied=await target.applyRegroup(preview);if(!applied||!alive(serial,target))return;
            await target.load({background:true});
            if(alive(serial,target)){editors?.clearScene?.(sceneId);selected=sceneId;render(stateOf(target));}
          },{id:sceneId,kind:'regroup'}).catch(error=>{if(alive(clickedGeneration,clickedController)&&!error?.projectStateRead){regroupError=error.message;regroupCapacity284=shared.capacityFailure284(error);render(stateOf(clickedController));}});
        }
        else if (name === 'resume') perform(async (target, serial) => {
          assertWritable(target);
          const quote=await target.quote('plan_resume');
          if(!quote||!alive(serial,target))return;
          if(!await ask(quoteMessage(quote,'继续未完成场次'),{quote:true})){target.cancelQuote();return;}
          await confirmAndRun(target,serial,quote,'继续未完成场次',false);
        }).catch(()=>{});
        else if(name==='arrange'&&compactHeader){
          if(readOnly())return;
          const clickedGeneration=generation,clickedController=controller;
          action.disabled=true;action.textContent='正在准备…';
          Promise.resolve().then(()=>alive(clickedGeneration,clickedController)?options.onCompleteScope():null).catch(report).finally(()=>{
            if(alive(clickedGeneration,clickedController)&&action.isConnected)render(stateOf(clickedController));
          });
        }
        else if (name === 'arrange') {const sceneId=selected,completionMode=fillModes.get(selected)||'missing';perform(async (target, serial) => {
          assertWritable(target);
          editors?.capture();
          const dirty=editors?.unsavedScene?.(sceneId);
          if(dirty?.sourceCards.length)throw Error('本场原文有未保存修改，请先保存原文后再补齐整场分镜。');
          const scene = rows(stateOf(target).snapshot).find(row => idOf(row) === sceneId);
          if (!scene) throw Error('请先选择一个场次。');
          const quote = await target.quote('segment', idOf(scene),undefined,{completionMode});
          if(!quote||!alive(serial,target))return;
          const accepted=await ask(quoteMessage(quote,'补齐本场分镜：'+scene.title),{quote:true});
          if(!alive(serial,target))return;
          if(!accepted){target.cancelQuote();return;}
          await confirmAndRun(target, serial, quote, '补齐本场分镜：' + scene.title, false);
          fillModes.delete(sceneId);render(stateOf(target));
        },{id:sceneId,kind:'text'}).catch(() => {});}
      } else if (media && root.contains(media) && !media.disabled && media.hasAttribute('data-media-observe')) perform(async (target, serial) => {
        const id = media.dataset.segment, number = Number(media.dataset.card);
        await target.observeMedia(id, number); watch(target, serial).catch(report);
      },{id:media.dataset.segment,number:Number(media.dataset.card),kind:'observe'}).catch(() => {});
      else if(media&&root.contains(media)&&!media.disabled){
        const displayedCredits=Number(media.dataset.publishedCredits),catalogPending=stateOf(controller).catalogRefreshPending251===true;
        const initialLabel=media.textContent;
        const sourceController=controller;
        media.disabled=true;media.textContent='正在准备…';
        perform(async(target,serial)=>{
        const id=media.dataset.segment,number=Number(media.dataset.card);
        assertWritable(target);editors?.capture();if(editors?.sourceDraft(id,number)?.dirty)throw Error('本卡原文有未保存修改，请先保存原文并补齐本卡分镜。');editors?.assertReferencesReady233?.(id,number);await editors?.save(id,number);if(!alive(serial,target))return;
        const action=media.dataset.mediaQuote,directSubmit=action==='video';
        const quote=await target.quoteMedia(id,number,action,{directSubmit});
        if(!quote||!alive(serial,target))return;
        if((!directSubmit||shared.mediaQuoteNeedsConfirmation251(quote,displayedCredits,catalogPending))&&!await ask(quoteMessage(quote,action==='video'?'生成本卡视频':'生成本卡首帧'),{quote:true})){target.cancelQuote();return;}
        await confirmAndRun(target,serial,quote,action==='frame'?'生成本卡首帧':'生成本卡视频',true);
      },{id:media.dataset.segment,number:Number(media.dataset.card),kind:'media'}).catch(()=>{}).finally(()=>{
        if(controller===sourceController&&media.isConnected&&media.textContent==='正在准备…'){
          media.textContent=initialLabel;media.disabled=false;render(stateOf(controller));
        }
      });}
    }
    function handleChange(event) {
      if (event.target === $('selector')) { try { select(event.target.value); } catch (error) { report(error); } return; }
      if(event.target.hasAttribute?.('data-scene-fill-mode')){
        if(!controller||!selected||!['missing','all'].includes(event.target.value))return;
        fillModes.set(selected,event.target.value);controller.cancelQuote();render(stateOf(controller));return;
      }
      if(event.target.hasAttribute?.('data-regroup-limit')){const value=Number(event.target.value);if(selected&&[15,30].includes(value))regroupLimits.set(selected,value);return;}
      const input = event.target.closest('[data-media-param]');
      if (!input || !root.contains(input) || !controller) return;
      if (readOnly(controller)) { report(Error(staleMessage)); render(stateOf(controller)); return; }
      const id = input.dataset.segment, number = Number(input.dataset.card), action = input.dataset.mediaAction, param = input.dataset.mediaParam;
      let patch;
      if (param === 'reference') {
        const selectedRefs = editors?.get(id,number)?.referenceAssetIds || stateOf(controller).mediaDrafts[shared.mediaKey(id, number)]?.[action]?.referenceAssetIds || [];
        const references = new Set(selectedRefs);
        if (input.checked) references.add(input.value); else references.delete(input.value);
        patch = {referenceAssetIds:[...references]};
        editors?.synchronizeReferences(id,number,patch.referenceAssetIds);
      } else patch = {[param]:param==='tailFrameContinuation'?input.checked:param==='duration'?Number(input.value):input.value};
      const target=controller;
      try { Promise.resolve(target.updateMediaDraft(id,number,action,patch)).catch(error=>{if(controller===target)report(error);}); }
      catch (error) { report(error); }
    }
    function handleToggle(event) {
      const node = event.target;
      if (node?.matches?.('details.media-reference-picker') && root.contains(node)) {
        if (node.open) openReferences.add(referenceKey(node)); else openReferences.delete(referenceKey(node));
      }
      if(node?.matches?.('details[data-source-key]')&&root.contains(node)){
        const key=JSON.stringify([projectId,node.dataset.sourceKey]);
        if(node.open)openSources.add(key);else openSources.delete(key);
      }
    }
    function handleKeydown(event) {
      const tab=event.target.closest?.('[data-inline-card-select]');
      if(!tab||!root.contains(tab)||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const tabs=Array.from($('card-tabs')?.querySelectorAll?.('[data-inline-card-select]')||[]),index=tabs.indexOf(tab);
      if(index<0||!tabs.length)return;
      event.preventDefault();
      const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
      selectCard(next.dataset.segment,Number(next.dataset.card));next.focus();
    }
    root.addEventListener('input', handleReturnInput);
    root.addEventListener('click', handleClick);
    root.addEventListener('change', handleChange);
    root.addEventListener('toggle', handleToggle, true);
    root.addEventListener('keydown', handleKeydown);
    const resumeVisible=()=>{if(!destroyed&&!root.hidden&&!win.document?.hidden)resumeSaved().catch(report);};
    win.addEventListener?.('focus',resumeVisible);
    win.document?.addEventListener?.('visibilitychange',resumeVisible);
    function destroy() {
      shared.clearMediaCache231?.($('cards'));
      if (destroyed) return;
      destroyed = true; generation++; stopWait();stopReads(); controller?.dispose(); controller = null;
      editors?.clear();
      root.removeEventListener('input', handleReturnInput);
      root.removeEventListener('click', handleClick); root.removeEventListener('change', handleChange); root.removeEventListener('toggle', handleToggle, true);
      root.removeEventListener('keydown', handleKeydown);
      win.removeEventListener?.('focus',resumeVisible);
      win.document?.removeEventListener?.('visibilitychange',resumeVisible);
      root.innerHTML = ''; root.hidden = true; root.classList.remove('macro-inline');
      if (lastBusy && typeof options.onBusy === 'function') options.onBusy(false);
    }
    render({snapshot:{},message:'请先选择一个项目。'});
    return {setProject, refreshMediaDefaults232, refreshMediaPrices156, needsMediaPricesRefresh251, start, show, refresh, destroy, isBusy,select,selection:()=>selected,
      hasUnsavedDrafts:()=>editors?.hasUnsavedDrafts?.()===true||unsavedReturns.size>0,
      hasSceneHeader:id=>compactHeader&&!destroyed&&String(id||'')===projectId&&!root.hidden&&rows(view.snapshot).some(row=>idOf(row)===selected),
      canSelect:id=>!!controller&&(id==='all'||rows(stateOf(controller)?.snapshot).some(row=>idOf(row)===id))};
  }
  return {create, quoteMessage};
});

(() => {
  if (window.parent !== window && new URLSearchParams(window.location.search).get("embedded") === "1") {
    document.body.classList.add("workflow-embedded");
    // The host page owns vertical scrolling for the embedded workflow.
    // Keeping the iframe document scrollable creates a second scrollbar.
    document.documentElement.style.overflow = "visible";
    // The standalone page uses a viewport-sized minimum for comfortable use,
    // but that minimum feeds back into the host iframe height and leaves a
    // blank tail after the final episode in embedded mode.
    document.documentElement.style.minHeight = "0";
    document.body.style.overflow = "visible";
    document.body.style.minHeight = "0";
    // Cross-document anchor/focus scrolling must reserve the host's actual
    // sticky toolbar. Its height grows when top actions wrap on small screens;
    // otherwise a visible child button can be scrolled behind that toolbar.
    try {
      const host = window.parent, header = host.document.querySelector('.topbar');
      if (header) {
        const syncHostScrollPadding228 = () => {
          const position = host.getComputedStyle(header).position;
          const padding = ['fixed', 'sticky'].includes(position) ? Math.ceil(header.getBoundingClientRect().height) + 12 : 0;
          host.document.documentElement.style.scrollPaddingTop = padding + 'px';
        };
        const observer = new ResizeObserver(syncHostScrollPadding228);
        observer.observe(header);syncHostScrollPadding228();
        host.addEventListener('resize', syncHostScrollPadding228, {passive:true});
        window.addEventListener('pagehide', () => {observer.disconnect();host.removeEventListener('resize', syncHostScrollPadding228);}, {once:true});
      }
    } catch (_) { /* Standalone/foreign hosts retain their own scroll policy. */ }
    let lastReportedHeight = -1, heightFrame = 0;
    const reportHeight = () => {
      heightFrame = 0;
      const main = document.querySelector("main");
      // Measure the content box, not document.scrollHeight. The latter also
      // includes the iframe viewport and becomes a feedback loop after the
      // host has once assigned a large height.
      const rect = main?.getBoundingClientRect();
      const height = Math.ceil(Math.max(
        (main?.offsetTop || 0) + (main?.scrollHeight || 0),
        (rect?.bottom || 0) + (window.scrollY || 0),
      )) + 24;
      if (height === lastReportedHeight) return;
      lastReportedHeight = height;
      window.parent.postMessage({ type: "workflow-height", height }, window.location.origin);
    };
    const queueHeight = () => { if (!heightFrame) heightFrame = requestAnimationFrame(reportHeight); };
    new ResizeObserver(queueHeight).observe(document.querySelector("main"));
    window.addEventListener("load", queueHeight);
  }
  const $ = id => document.getElementById(id);
  const state = { project: null, profile: {}, styles: [], currentSource: null, projects: [], pointsUsage: null, featureAllowed: false, editingProjectId: null, customAssetKind: null, styleTarget: null, pendingSourceAction: null, previewOrigin: null, previewExpanded: false, assetQueuePending: 0, assetQueueKinds: new Set(), activeAssetJobs: new Map(), activeVideoJobs: new Map(), workflowStage: 1, pendingCut: false };
  const normalizedSources231=new Map();let normalizedSourceSize231=0;
  const normalizeSourceText = value => {
    const text=String(value??'');
    if(normalizedSources231.has(text))return normalizedSources231.get(text);
    const normalized=text.replace(/\r\n?/g,'\n').trim();
    // The current editor, saved baseline and one in-flight version cover the
    // repeated comparisons during polling. Keep the cache strictly bounded.
    if(text.length>=4096&&text.length<=2000000){
      while(normalizedSources231.size&&(normalizedSources231.size>=3||normalizedSourceSize231+text.length>4000000)){
        const oldest=normalizedSources231.keys().next().value;normalizedSources231.delete(oldest);normalizedSourceSize231-=oldest.length;
      }
      normalizedSources231.set(text,normalized);normalizedSourceSize231+=text.length;
    }
    return normalized;
  };
  const storedProjectSource = project => String(project?.confirmedScript || project?.sourceStructure || '');
  // In-flight work belongs to a project, not to the currently visible page.
  const projectWork = new Map(), taskProjects = new Map(), assetHistoryExpanded = new Map(), workflowActions = new Map();
  const newProjectWork = () => ({assetRecognitionBusy:false,storyboardBusy:false,storyboardOwner:null,pendingCut:false,sceneDirectoryBusy:false,sceneDirectoryRequested:false,sourcePrepareBusy:false,sourceSaveBusy:false,sourceSaveError:'',sourceDraftError:false,sourceDraftConflict:null,macroBusy:false,assetQueuePending:0,assetQueueKinds:new Set(),activeAssetJobs:new Map(),videoBatchPending:0,videoBatchRunning:false});
  const projectWorkKeys = Object.keys(newProjectWork());
  function workFor(projectId) {
    if(!projectWork.has(projectId))projectWork.set(projectId,newProjectWork());
    return projectWork.get(projectId);
  }
  function finishProjectWork(projectId, changes) {
    Object.assign(workFor(projectId),changes);
    if(state.project?.id===projectId)Object.assign(state,changes);
  }
  function switchProjectWork(projectId) {
    const previous=state.project?.id;if(previous===projectId)return;
    if(previous)Object.assign(workFor(previous),Object.fromEntries(projectWorkKeys.map(key=>[key,state[key]])));
    Object.assign(state,workFor(projectId));
    macroInlineView?.destroy();macroInlineView=null;state.macroViewingId='';
    $('visualRecognitionProgress')?.classList.toggle('hidden',!state.assetRecognitionBusy);
    $('visualCutProgress')?.classList.toggle('hidden',!state.pendingCut);
    document.body.classList.toggle('visual-cut-running',!!state.pendingCut);
    $('confirmSourceReference').disabled=!!state.assetRecognitionBusy;
    $('confirmSourceReference').removeAttribute('aria-busy');
    if(state.assetRecognitionBusy)$('confirmSourceReference').setAttribute('aria-busy','true');
    $('useSource').disabled=!!(state.storyboardBusy||state.macroBusy);
    $('useSource').setAttribute('aria-busy',state.storyboardBusy||state.macroBusy?'true':'false');
    document.querySelectorAll('[data-action-pending]').forEach(button=>{
      const pending=workflowActions.has(`${projectId}/${button.id}`);
      button.dataset.actionPending=pending?'1':'0';button.dataset.actionProject=projectId;
      button.classList.toggle('is-working',pending);if(pending)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');
    });
  }
  let sourceReadEpoch = 0;
  let sourceBindingEpoch226 = 0;
  let wizardEpoch = 0;
  const sourceDraftKey = id => `dramaVisualSourceDraft:${id}`;
  function persistSourceDraft() {
    const owner=state.sourceProjectId||'',id=owner||'unassigned';
    const conflict=owner&&owner!==state.project?.id?workFor(owner).sourceDraftConflict:state.sourceDraftConflict;
    const recordError=failed=>{if(owner)finishProjectWork(owner,{sourceDraftError:failed});else state.sourceDraftError=failed;};
    try{
      if(sourceIsDirty())localStorage.setItem(sourceDraftKey(id),JSON.stringify({sourceText:$('visualSource').value,baseline:conflict?.baseline??state.sourceBaseline??'',replacementId:state.sourceReplacementId||'',savedAt:Date.now()}));
      // An empty, not-yet-bound startup editor has not loaded any unassigned
      // draft. Do not delete such a draft while activating a saved project.
      else if(owner||state.sourceUnassignedOwned269)localStorage.removeItem(sourceDraftKey(id));
      recordError(false);
      return true;
    }catch(_){
      recordError(true);
      return false;
    }
  }
  function sourceEditorContext() {
    return {projectId:state.project?.id || '',sourceProjectId:state.sourceProjectId || '',sourceText:String($('visualSource').value || ''),epoch:sourceReadEpoch,bindingEpoch:sourceBindingEpoch226,replacementId:state.sourceReplacementId||'',outlineImportId:sourceOutlineImports207.get(state.project?.id)?.id||''};
  }
  function sameSourceEditor(context) {
    return context.projectId === (state.project?.id || '') && context.sourceProjectId === (state.sourceProjectId || '') &&
      context.sourceText === String($('visualSource').value || '') && context.epoch === sourceReadEpoch &&
      context.bindingEpoch === sourceBindingEpoch226;
  }
  function sourceIsDirty() {
    const current=normalizeSourceText($('visualSource').value),active=sourceAutosaveActive.get(state.sourceProjectId);
    // Returning to the previous saved text while another value is in flight
    // is still an edit: that request may already have written the other value.
    return !!state.sourceReplacementId || current!==normalizeSourceText(state.sourceBaseline) ||
      !!(active&&current!==normalizeSourceText(active.sourceText));
  }
  function updateSourceSaveState() {
    const status=$('visualSourceSaveStatus');
    if(status){
      const text=$('visualSource').value.trim(),dirty=sourceIsDirty();
      status.textContent=dirty&&state.sourceDraftError?'草稿暂未写入本机，请保留当前页面':
        !state.project?.id?(text?'输入已在本机保留，请先创建项目':'请先创建项目，再导入剧本'):
        state.sourceProjectId!==state.project.id?(text?'当前输入仍属于原项目，请重新打开当前项目后继续':'当前项目原稿尚未载入，请重新打开当前项目后继续'):
        state.sourceSaveBusy?'正在自动保存…':state.sourceDraftConflict?'本机草稿与项目版本不同，确认后再保存':
        state.sourceSaveError?'自动保存未完成，输入已在本机保留':
        dirty?!text?'等待输入剧本，已保存原稿仍保留':'等待自动保存…':'已自动保存';
      const create=$('newWorkflowProject'),unassigned=!state.project?.id&&!state.sourceProjectId&&!!text;
      if(create){create.classList.toggle('hidden',!unassigned);create.tabIndex=unassigned?0:-1;create.textContent=unassigned?'创建项目':'新建项目';}
    }
    renderAIDirectoryControls();
    updateRecognitionQuote();
  }
  function bindProjectSource(project, draft = null) {
    sourceBindingEpoch226++;
    sourceAutosavePending.delete(project?.id);
    state.sourceProjectId=project?.id || '';
    state.sourceUnassignedOwned269=false;
    state.sourceBaseline=storedProjectSource(project);
    let conflict=null;
    if(!draft && project?.id)try{
      const local=JSON.parse(localStorage.getItem(sourceDraftKey(project.id)) || 'null');
      if(local && typeof local.sourceText==='string'){
        const sameBaseline=normalizeSourceText(local.baseline)===normalizeSourceText(state.sourceBaseline);
        if(sameBaseline||normalizeSourceText(local.sourceText)!==normalizeSourceText(state.sourceBaseline)){
          draft={sourceText:local.sourceText,replacementId:local.replacementId||''};
          if(!sameBaseline)conflict={baseline:String(local.baseline||'')};
        }
      }
    }catch(_){}
    const sourceState={sourceDraftConflict:conflict,sourceSaveError:conflict?'本机草稿与项目保存版本不同，确认后才能覆盖保存。':'',sourceDraftError:false};
    Object.assign(state,sourceState);if(project?.id)Object.assign(workFor(project.id),sourceState);
    state.sourceReplacementId=draft?.replacementId||'';
    if(draft?.sourceText?.trim()&&(state.sourceReplacementId||!state.sourceBaseline.trim())){
      state.sourceReplacementId=state.sourceReplacementId||globalThis.crypto?.randomUUID?.()||`import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sourceOutlineImports207.set(project.id,{id:state.sourceReplacementId});
    }
    $('visualSource').value=draft ? draft.sourceText : state.sourceBaseline;
    state.currentSource=draft?.source ? {...draft.source,sourceProjectId:state.sourceProjectId} : (project ? {origin:'project',projectName:project.projectName,sourceProjectId:project.id} : null);
    state.timelineModelApproval=null;sourceReadEpoch++;sceneChoiceFinish?.('cancel');clearTimeout(sourceAutosaveTimer);
    updateSourceSaveState();if(draft&&!conflict)queueMicrotask(scheduleSourceAutosave);
  }
  function activateProject(project, {stage, draft = null} = {}) {
    if(!project?.id)throw Error('项目读取结果缺少项目身份，原稿与本机草稿已保留。');
    // All entry points bind the editor and its provenance before rendering.
    // Persist with the previous project's work/possible conflict baseline,
    // before adopting any of the newly selected project's per-project state.
    persistSourceDraft();
    switchProjectWork(project.id);
    bindProjectSource(project,draft);
    restoreProjectSettings(project);
    state.workflowStage=stage || preferredWorkflowStage(project);
    render(project);
    updateSourceSaveState();
  }
  const sourceAutosavePending=new Map(),sourceAutosaveWorkers=new Map(),sourceAutosaveActive=new Map(),sourceChoiceSeen=new Set(),sourceOutlineImports207=new Map();
  const sourceAutosaveTimeoutMs226 = 30000;
  let sourceAutosaveTimer=0;
  async function saveSourceRequest226(body){
    // This is exclusively a local, free, CAS-protected source save. A lost
    // response is uncertain; a deadline must never automatically resend it.
    const abort=new AbortController();let timer;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
      abort.abort();reject(Error('原稿保存等待超时，输入已在本机保留。请稍后重试；没有自动重复提交。'));
    },sourceAutosaveTimeoutMs226);});
    const request=(async()=>{
      const response=await fetch('/api/visual/project/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'原稿保存未完成，输入已在本机保留。');
      return data;
    })();
    try{return await Promise.race([request,deadline]);}finally{clearTimeout(timer);}
  }
  const sourceChoiceKey=(id,generation,text)=>{let hash=2166136261;for(const ch of text){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return `workflowOutlineOffer207:${id}:${generation}:${text.length}:${hash>>>0}`;};
  async function confirmDiscardSource(){
    if(!sourceIsDirty())return true;
    return flushSourceAutosave();
  }
  function markSourceReplacement(){
    if(state.project?.id)outlineReceipts206.delete(state.project.id);
    state.sourceReplacementId=globalThis.crypto?.randomUUID?.()||`replace-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if(state.project?.id)sourceOutlineImports207.set(state.project.id,{id:state.sourceReplacementId});
  }
  function replaceSourceInput(sourceText,source){
    markSourceReplacement();
    $('visualSource').value=String(sourceText||'');state.sourceProjectId=state.project?.id||'';
    state.sourceUnassignedOwned269=!state.sourceProjectId;
    state.currentSource={...source,sourceProjectId:state.sourceProjectId};state.timelineModelApproval=null;sourceReadEpoch++;
    sceneChoiceFinish?.('cancel');updateSourceSaveState();renderScriptAlignment(state.project);scheduleSourceAutosave();
  }
  function scheduleSourceAutosave(){
    clearTimeout(sourceAutosaveTimer);persistSourceDraft();
    // A new input supersedes the queued (not yet submitted) value immediately,
    // including an undo back to the in-flight value or the previous baseline.
    if(state.project?.id&&state.project.id===state.sourceProjectId)sourceAutosavePending.delete(state.project.id);
    if(state.project?.id)finishProjectWork(state.project.id,{sourceSaveError:state.sourceDraftConflict?'本机草稿与项目保存版本不同，确认后才能覆盖保存。':''});else state.sourceSaveError='';
    updateSourceSaveState();
    if(!state.project?.id||state.sourceProjectId!==state.project.id||!sourceIsDirty()||!$('visualSource').value.trim())return;
    sourceAutosaveTimer=setTimeout(()=>{queueSourceAutosave();},650);
  }
  function queueSourceAutosave(){
    clearTimeout(sourceAutosaveTimer);
    const current=sourceEditorContext(),id=current.projectId,active=sourceAutosaveActive.get(id);
    if(!id||workFor(id).sourceSaveError)return Promise.resolve();
    const matchesActive=active&&normalizeSourceText(active.sourceText)===normalizeSourceText(current.sourceText)&&active.replacementId===current.replacementId;
    if(id===current.sourceProjectId&&current.sourceText.trim()&&sourceIsDirty()&&!matchesActive)
      sourceAutosavePending.set(id,{...current,expectedSource:state.sourceBaseline||''});
    else sourceAutosavePending.delete(id);
    if(sourceAutosaveWorkers.has(id))return sourceAutosaveWorkers.get(id);
    if(!sourceAutosavePending.has(id))return Promise.resolve();
    const worker=(async()=>{
      while(sourceAutosavePending.has(id)){
        const context=sourceAutosavePending.get(id);sourceAutosavePending.delete(id);sourceAutosaveActive.set(id,context);
        finishProjectWork(id,{sourceSaveBusy:true,sourceSaveError:''});
        if(state.project?.id===id)updateSourceSaveState();
        try{
          const saved=await saveSourceRequest226({projectId:id,sourceText:context.sourceText,expectedSource:context.expectedSource,confirmed:true,view:'workspace',...(context.replacementId?{replaceSource:true,replacementId:context.replacementId}:{})});
          if(saved.project?.id!==id)throw Error('原稿保存返回的项目不一致，输入已在本机保留。');
          if(normalizeSourceText(storedProjectSource(saved.project))!==normalizeSourceText(context.sourceText))throw Error('原稿保存返回的正文不一致，输入已在本机保留。');
          const ownsEditor=()=>state.project?.id===id&&state.sourceProjectId===id&&sourceBindingEpoch226===context.bindingEpoch;
          const apply=data=>{if(!ownsEditor())return;
            state.sourceBaseline=storedProjectSource(data.project);render(data.project,{sourceSaveOnly:true});persistSourceDraft();updateSourceSaveState();};
          if(ownsEditor()&&state.sourceReplacementId===context.replacementId)state.sourceReplacementId='';
          const queued=sourceAutosavePending.get(id),waiting=queued?.bindingEpoch===context.bindingEpoch?queued:null;
          if(waiting?.replacementId===context.replacementId)waiting.replacementId='';
          if(waiting)waiting.expectedSource=storedProjectSource(saved.project);
          apply(saved);
          // /source already returns the local preparation. Repeating /prepare
          // rewrites and returns the whole project again, and can mislabel a
          // successfully saved original as failed when that second read stalls.
          if(ownsEditor()&&sameSourceEditor(context)&&!saved.preparationWarning)queueMicrotask(()=>offerImportedOutline207(context,saved.project));
        }catch(error){
          finishProjectWork(id,{sourceSaveError:error.message});
          if(state.project?.id===id){clearTimeout(sourceAutosaveTimer);toast('自动保存未完成：'+error.message,true);}
          // The newest editor draft was persisted on input. Stop this project's
          // queue on uncertainty; other projects keep their independent workers.
          sourceAutosavePending.delete(id);
        }finally{
          sourceAutosaveActive.delete(id);finishProjectWork(id,{sourceSaveBusy:false});
          if(state.project?.id===id){persistSourceDraft();updateSourceSaveState();}
        }
      }
    })().finally(()=>{sourceAutosaveWorkers.delete(id);});
    sourceAutosaveWorkers.set(id,worker);
    return worker;
  }
  async function flushSourceAutosave(){
    const projectId=state.project?.id;if(!projectId)return false;
    if(state.sourceDraftConflict){
      const context=sourceEditorContext();
      const confirmed=await studioConfirm('本机草稿与项目当前已保存的原稿不同，可能是上次保存成功但回包未收到。是否用编辑区的本机草稿继续保存？项目现有原稿与历史记录会保留；取消后本机草稿也会继续保留。',{title:'确认保存本机草稿'});
      if(!confirmed||!sameSourceEditor(context))return false;
      finishProjectWork(projectId,{sourceDraftConflict:null,sourceSaveError:''});persistSourceDraft();
    }
    finishProjectWork(projectId,{sourceSaveError:''});await queueSourceAutosave();
    if(state.project?.id!==projectId)return false;
    // Editing while a request is in flight produces one serialized follow-up.
    if(sourceIsDirty()&&!state.sourceSaveError&&$('visualSource').value.trim())await queueSourceAutosave();
    return state.project?.id===projectId&&!sourceIsDirty()&&!state.sourceSaveError;
  }
  let outlineOfferContext207=null;
  function outlineOfferQuote207(){
    const binding=state.textButtonBindings?.['workflow-cut'];
    const model=(state.textModels||[]).find(row=>row.model===binding?.model&&row.enabled!==false&&row.gatewayReady!==false);
    const price=workflowTextCredit('workflow-cut',model?.model),ready=!!model&&Number.isFinite(price)&&price>0;
    return {ready,text:ready?`当前模型：${model.displayName||'大纲提取模型'} · 预计费用：每次 ${Number(price).toFixed(2)} 积分，按实际调用次数结算。`:'当前大纲提取模型或价格尚未配置，暂不能开始提取。'};
  }
  function updateOutlineOfferQuote207(){
    if(!outlineOfferContext207)return;
    const quote=outlineOfferQuote207();
    $('visualSceneChoiceQuote207').textContent=quote.text;
    $('visualSceneChoiceYes').disabled=!quote.ready;
  }
  async function offerImportedOutline207(context,project){
    if(!sameSourceEditor(context)||state.sceneDirectoryBusy||state.sceneDirectoryRequested||project.workflowOutlineMode207!=='paid_only')return;
    const imported=sourceOutlineImports207.get(context.projectId);
    if(!context.outlineImportId||imported?.id!==context.outlineImportId)return;
    if(normalizeSourceText(storedProjectSource(project))!==normalizeSourceText(context.sourceText))return;
    const key=sourceChoiceKey(context.projectId,String(project.scriptGenerationId||''),context.sourceText);
    if(sourceChoiceSeen.has(key))return;
    try{if(localStorage.getItem(key))return;localStorage.setItem(key,'1');}catch(_){}
    sourceChoiceSeen.add(key);
    sourceOutlineImports207.delete(context.projectId);
    outlineOfferContext207=context;
    const answer=await sceneChoice({title:'是否开始提取大纲',message:'检测到剧本内容已导入，完整原稿已自动保存。是否开始提取大纲？',yes:'开始提取大纲',no:'暂不提取'});
    if(!sameSourceEditor(context)||answer!=='yes')return;
    await identifySceneDirectory();
  }
  let macroInlineView = null;
  let legacyCardsView231=null;
  function legacyCards231(){
    if(!legacyCardsView231&&window.LegacyCards231?.create&&$('visualEpisodes'))legacyCardsView231=window.LegacyCards231.create({root:$('visualEpisodes'),onSceneDownload:(project,scene)=>{
      if(!window.SceneVideoDownload240)throw Error('下载组件尚未加载，请重新打开软件。');
      return window.SceneVideoDownload240.save({projectId:project.id,sceneId:String(scene.id||scene.segmentId||''),sourceKind:'episode',cutRevisionId:String(project.cutRevisionId||'')},{win:window,feature:project.outputModule227||'workflow'});
    }});
    return legacyCardsView231;
  }
  const macroSnapshots = new Map();
  const sceneStartLocks206 = new Map();
  const topSceneDirectory=window.WorkflowSceneDirectory?.create({root:$('workflowSceneDirectory'),shared:window.MacroArrangement,
    onSelect:(scene)=>{renderPreparedScene(scene);legacyCardsView231?.selectScene(scene);if(scene?.macroId&&macroInlineView?.canSelect(scene.macroId))macroInlineView.select(scene.macroId);}});
  if(topSceneDirectory)document.body.dataset.topSceneDirectory='1';
  function sceneNavigation206(snapshot){
    const projectId=state.project?.id,shared=window.MacroArrangement,start=sceneStartLocks206.get(projectId);
    const own=snapshot?.projectId&&snapshot.projectId!==projectId?{}:snapshot||{};
    const textRow=row=>row&&(!row.projectId||row.projectId===projectId)&&!['frame','video'].includes(row.action)&&!['visual_asset','visual_asset_recognition','visual_macro_media','visual_macro_media_observe','visual_frame','visual_video','visual_cover'].includes(row.kind);
    const textSnapshot={...own,active:textRow(own.active)?own.active:null,
      ...(own.activeTasks?{activeTasks:Object.fromEntries(Object.entries(own.activeTasks).filter(([,row])=>textRow(row)))}:{}),task:textRow(own.task)?own.task:null};
    const running=(shared?.savedTextTasks(textSnapshot)||[]).filter(row=>shared.textTaskInFlight(row));
    const locked=!!(start||state.pendingCut||state.storyboardBusy||state.macroBusy||shared?.snapshotTextInFlight(textSnapshot));
    const saved=state.project?.macroArrangement||{},owners=[...Object.values(saved.activeTasks||{}),saved.active].filter(Boolean);
    const owner=running[0],full=owner&&owners.find(row=>row.claimId===owner.claimId||owner.taskId&&row.taskId===owner.taskId)||owner;
    const stage=[...(full?.stages||[])].reverse().find(row=>shared?.textTaskInFlight(row));
    const scopes=stage?.request?.scopeRanges?.map(row=>row.sceneId)||full?.executionSceneIds||[];
    const current=topSceneDirectory?.current()?.id;
    return {locked,sceneId:start?.sceneId||full?.segmentId||(scopes.includes(current)?current:scopes[0])||textSnapshot.task?.segmentId||''};
  }
  // Polling keeps the current scene. Only an actual idle transition from
  // Step 1/2 into Step 3 requests the first scene again.
  function syncTopScenes(snapshot=macroSnapshots.get(state.project?.id)||state.project?.macroArrangement||{}, {enteringStoryboard=false}={}){
    const scene=topSceneDirectory?.setData(state.project,snapshot,{...sceneNavigation206(snapshot),resetSelection:enteringStoryboard});renderPreparedScene(scene);
    if(scene?.macroId&&macroInlineView?.canSelect(scene.macroId)&&macroInlineView.selection()!==scene.macroId)macroInlineView.select(scene.macroId);
    // Saved cards may stay visible after the current source/directory changes
    // or a refresh times out. Their inline header already owns this action.
    legacyCardsView231?.selectScene(scene);
    const inlineHeader=macroInlineView?.hasSceneHeader?.(state.project?.id)===true||legacyCardsView231?.hasSceneHeader?.(state.project?.id)===true;
    const start=$('workflowSceneStart');if(start)start.hidden=!state.project?.workflowPreparedScript||inlineHeader;
    const startTitle=$('workflowSceneStartTitle');if(startTitle)startTitle.textContent=scene?`第 ${scene.number} 场 · ${scene.title}`:'分镜与视频卡';
    const startButton=$('startPreparedSceneShots');if(startButton){const locked=sceneNavigation206(snapshot).locked;startButton.disabled=locked;startButton.setAttribute('aria-busy',String(locked));}
  }
  function renderPreparedScene(scene=topSceneDirectory?.current()){
    const preparation=state.project?.workflowPreparedScript,panel=$('workflowPreparedReview');if(!panel)return;
    const directories=preparation?.sceneDirectory||[],entry=directories[topSceneDirectory?.index()||0];
    panel.hidden=!preparation?.cleanedSource;
    if(panel.hidden)return;
    $('workflowPreparedTitle').textContent=entry?`第 ${entry.number||topSceneDirectory.index()+1} 场 · ${entry.title||'整理稿'}`:'已清理的剧情正文';
    $('workflowPreparedScene').value=entry?.sourceText||scene?.sourceText||preparation.cleanedSource;
    $('workflowPreparedSummary').textContent=`${directories.length?directories.length+' 场 · ':''}制作说明与剧情正文分开保存`;
    $('workflowPreparedMetadata').textContent=(preparation.metadata||[]).map(row=>typeof row==='string'?row:row.text||row.original||JSON.stringify(row)).join('\n')||'未发现需要分离的明确制作说明。';
    const attempt=(state.project.workflowSceneDirectoryAttempts||[]).at(-1),raw=attempt?.rawResponse;
    $('workflowSceneRawReturn').hidden=!raw;
    $('workflowSceneRawText').textContent=typeof raw==='string'?raw:raw?JSON.stringify(raw,null,2):'';
    renderAIDirectoryControls();
  }
  function needsAIDirectory(){const p=state.project?.workflowPreparedScript;return !!p?.cleanedSource&&!p.sceneDirectory?.length;}
  const sourcePlanning203 = new Map();
  // A completed outline belongs to its exact project/import/source. Keep the
  // visible receipt across normal renders and step switches, not only a toast.
  const outlineReceipts206 = new Map();
  function outlineCompletionMessage206(project=state.project){
    if(!project?.id||state.sceneDirectoryBusy||state.sceneDirectoryRequested||sourceIsDirty())return '';
    const source=normalizeSourceText(storedProjectSource(project)),generation=String(project.scriptGenerationId||'');
    const receipt=outlineReceipts206.get(project.id);
    if(receipt&&receipt.source===source&&receipt.generation===generation){
      if(receipt.status!=='completed')return '';
      return receipt.authored?`原剧分场已采用 · 共 ${receipt.count} 集／场，结果已保存。`:`大纲提取已完成 · 共 ${receipt.count} 集／场，结果已保存，可开始资产提取。`;
    }
    const prepared=project.workflowPreparedScript,count=prepared?.sceneDirectory?.length||0;
    const attempt=(project.workflowSceneDirectoryAttempts||[]).filter(row=>row.sourceHash&&row.sourceHash===prepared?.originalSourceHash&&String(row.scriptGenerationId||'')===generation).at(-1);
    return count&&attempt?.status==='completed'?`大纲提取已完成 · 共 ${count} 集／场，结果已保存，可开始资产提取。`:'';
  }
  function outlineFeedback221(project=state.project){
    if(!project?.id||state.sceneDirectoryBusy||state.sceneDirectoryRequested||sourceIsDirty())return null;
    const source=normalizeSourceText(storedProjectSource(project)),generation=String(project.scriptGenerationId||'');
    const receipt=outlineReceipts206.get(project.id);
    if(receipt&&receipt.source===source&&receipt.generation===generation)
      return receipt.status!=='completed'&&receipt.message?receipt:null;
    const prepared=project.workflowPreparedScript;
    const attempt=(project.workflowSceneDirectoryAttempts||[]).filter(row=>row.sourceHash&&row.sourceHash===prepared?.originalSourceHash&&String(row.scriptGenerationId||'')===generation).at(-1);
    if(!attempt||attempt.directoryReady===true||attempt.status==='completed')return null;
    const message=String(attempt.warning||attempt.error||'');
    return message&&['terminal_invalid','waiting_original_result','returned_with_warning','needs_review','not_submitted'].includes(attempt.status)?{status:attempt.status,message,source,generation}:null;
  }
  let sourcePlanningClock203 = null;
  function renderSourcePlanning203(){
    const box=$('workflowSourcePlanning203'),frame=$('workflowSourceFrame203'),input=$('visualSource');
    if(!box||!frame||!input)return;
    const work=sourcePlanning203.get(state.project?.id),busy=!!work;
    box.hidden=!busy;frame.classList.toggle('is-planning',busy);input.setAttribute('aria-busy',String(busy));
    if(!work)return;
    $('workflowSourcePlanningPhase207').textContent=work.phase||'读取完整剧本';
    $('workflowSourcePlanningMessage203').textContent=work.message||'正在按完整故事主题整理大纲…';
    const seconds=Math.max(0,Math.floor((Date.now()-work.startedAt)/1000));
    $('workflowSourcePlanningTime203').textContent=seconds<60?`已用时 ${seconds} 秒`:`已用时 ${Math.floor(seconds/60)}分${seconds%60}秒`;
  }
  function updateSourcePlanning203(projectId,task){
    if(task){
      const previous=sourcePlanning203.get(projectId);
      const message=String(task.message||previous?.message||'').replace(/\s*·\s*已等待\d+(?:秒|分\d+秒)/,'');
      const phase=task.state==='done'?'保存大纲结果':task.reconnecting?'等待连接恢复':/sav|persist|complet/.test(task.phase||'')?'保存大纲结果':/pars|validat/.test(task.phase||'')?'整理大纲结果':previous?'生成故事大纲':'读取完整剧本';
      sourcePlanning203.set(projectId,{startedAt:previous?.startedAt||Date.now(),message,phase});
    }else sourcePlanning203.delete(projectId);
    if(sourcePlanning203.size&&!sourcePlanningClock203)sourcePlanningClock203=setInterval(renderSourcePlanning203,1000);
    if(!sourcePlanning203.size&&sourcePlanningClock203){clearInterval(sourcePlanningClock203);sourcePlanningClock203=null;}
    renderSourcePlanning203();
  }
  function renderAIDirectoryControls(){
    const button=$('aiSceneDirectory');if(!button)return;
    const binding=state.textButtonBindings?.['workflow-cut'],model=(state.textModels||[]).find(row=>row.model===binding?.model);
    const ready=!!model&&Number(binding?.price)>0;
    button.hidden=false;button.disabled=!!state.sceneDirectoryRequested||!!state.sceneDirectoryBusy||!ready;
    button.title=ready?'':'正在同步大纲提取服务';
    updateOutlineOfferQuote207();
    renderSourcePlanning203();
    const completion=$('visualStageStatus'),message=outlineCompletionMessage206(),feedback=outlineFeedback221();
    if(state.workflowStage===1&&(message||feedback)){
      completion.dataset.outlineComplete206='1';
      if(window.ModelActivity)window.ModelActivity.set(completion,{state:message?'success':feedback.status==='waiting_original_result'?'':'error',message:message||feedback.message});else completion.textContent=message?'✓ '+message:feedback.message;
    }else if(completion?.dataset.outlineComplete206==='1'){
      delete completion.dataset.outlineComplete206;
      if(state.workflowStage===1){if(window.ModelActivity)window.ModelActivity.text(completion,workflowStageMessage(1));else completion.textContent=workflowStageMessage(1);}
    }
    const hint=$('visualSourceHint');
    if(state.workflowStage===1&&feedback){
      hint.dataset.outlineFeedback221='1';
      if(window.ModelActivity)window.ModelActivity.set(hint,{state:'',message:feedback.message});else hint.textContent=feedback.message;
    }else if(hint?.dataset.outlineFeedback221==='1'){
      delete hint.dataset.outlineFeedback221;
      if(state.workflowStage===1){const text=sourceIsDirty()?($('visualSourceSaveStatus')?.textContent||'原稿尚未保存。'):outlineCompletionMessage206()||'原稿导入或编辑后自动保存。';if(window.ModelActivity)window.ModelActivity.set(hint,{state:'',message:text});else hint.textContent=text;}
    }
  }
  async function identifySceneDirectory(){
    if(state.sceneDirectoryRequested||state.sceneDirectoryBusy||state.storyboardBusy||state.pendingCut||state.macroBusy)return;
    const ownerProjectId=state.project?.id;
    const previousFeedback=outlineFeedback221();
    // An explicit button click supersedes any delayed import offer, including
    // when the click flushes an auto-save that has not completed yet.
    sourceOutlineImports207.delete(ownerProjectId);
    outlineReceipts206.set(ownerProjectId,{status:'pending',source:normalizeSourceText(storedProjectSource(state.project)),generation:String(state.project?.scriptGenerationId||'')});
    state.sceneDirectoryRequested=true;sceneChoiceFinish?.('cancel');renderAIDirectoryControls();
    updateSourcePlanning203(ownerProjectId,{message:'正在准备完整剧本与故事主题…'});
    // The editor owns the single outline progress animation. The upper
    // workflow notice remains plain text while this task is running.
    window.ModelActivity?.set($('visualStageStatus'),{state:'',message:'正在提取大纲，进度显示在剧本框内。'});
    const button=$('aiSceneDirectory');button.textContent='正在提取大纲…';
    try{
      if(!await flushSourceAutosave())return;
      if(state.project?.id!==ownerProjectId)return;
      if(!await prepareVisualScript({notify:false})||state.project?.id!==ownerProjectId)return;
      const context=sourceEditorContext();state.sceneDirectoryBusy=true;
      const generation=String(state.project?.scriptGenerationId||'');
      outlineReceipts206.set(ownerProjectId,{status:'pending',source:normalizeSourceText(context.sourceText),generation});
      const restartInvalid=previousFeedback?.status==='terminal_invalid'&&previousFeedback.source===normalizeSourceText(context.sourceText)&&previousFeedback.generation===generation;
      const submitted=await post('/api/visual/project/scenes',{projectId:context.projectId,regenerate:true,view:'workspace',...(restartInvalid?{restartInvalid:true}:{})});
      const data=submitted.taskId?await waitTask(submitted.taskId,task=>{updateSourcePlanning203(ownerProjectId,task);if(state.project?.id===ownerProjectId)$('visualSourceHint').textContent=task.message||'正在提取大纲…';}, {retryReads:true}):submitted;
      const count=data.project?.workflowPreparedScript?.sceneDirectory?.length||0;
      if(data.project?.id===ownerProjectId&&data.directoryReady===true&&count>0&&normalizeSourceText(storedProjectSource(data.project))===normalizeSourceText(context.sourceText)&&String(data.project.scriptGenerationId||'')===generation)
        outlineReceipts206.set(ownerProjectId,{status:'completed',source:normalizeSourceText(context.sourceText),generation,count,authored:false});
      else if(data.project?.id===ownerProjectId&&normalizeSourceText(storedProjectSource(data.project))===normalizeSourceText(context.sourceText)&&String(data.project.scriptGenerationId||'')===generation)
        outlineReceipts206.set(ownerProjectId,{status:data.outlineState||'returned_with_warning',source:normalizeSourceText(context.sourceText),generation,message:data.warning||'模型返回已保留，暂未形成分场目录。'});
      if(state.project?.id!==context.projectId||data.project?.id!==context.projectId)return;
      if(!sameSourceEditor(context)){toast('分场策划已返回并保留；当前原稿的新输入保持不变。');return;}
      if(data.directoryReady){const saved=macroSnapshots.get(context.projectId)||data.project.macroArrangement;if(saved?.plan)macroSnapshots.set(context.projectId,{...saved,directorySourceMatches:false});}
      render(data.project);syncTopScenes();
      if(data.directoryReady&&data.project.macroArrangement){
        try{await inlineMacroView().setProject(data.project,{reload:true,initialSnapshot:macroSnapshots.get(data.project.id)});}catch(error){toast('分场已保存，旧视频卡状态暂未刷新：'+error.message,true);}
        if(state.project?.id!==context.projectId)return;syncTopScenes();
      }
      const completed=data.directoryReady===true&&count>0;
      $('visualSourceHint').textContent=completed?`大纲提取已完成 · 共 ${count} 集／场，结果已保存。`:data.warning||'模型返回已保留，暂未形成分场目录。';
      toast($('visualSourceHint').textContent,!completed);
    }catch(error){
      const receipt=outlineReceipts206.get(ownerProjectId);
      if(receipt?.status==='pending')outlineReceipts206.set(ownerProjectId,{...receipt,status:'needs_review',message:error.message});
      if(state.project?.id===ownerProjectId)toast(error.message,true);
    }
    finally{updateSourcePlanning203(ownerProjectId,null);finishProjectWork(ownerProjectId,{sceneDirectoryBusy:false,sceneDirectoryRequested:false});if(state.project?.id===ownerProjectId){button.textContent='提取大纲';renderAIDirectoryControls();if(state.workflowStage===1)setWorkflowStage(1,{force:true});}refreshPoints();}
  }
  async function prepareVisualScript({force=false,notify=true}={}){
    if(!state.project?.id)return false;
    if(!await flushSourceAutosave())return false;
    if(!force&&state.project.workflowPreparedScript?.cleanedSource){syncTopScenes();return true;}
    if(state.sourcePrepareBusy)return false;
    const context=sourceEditorContext();if(!context.sourceText.trim())return false;
    state.sourcePrepareBusy=true;
    try{
      const data=await post('/api/visual/project/prepare',{projectId:context.projectId,sourceText:context.sourceText,expectedSource:state.sourceBaseline||'',confirmed:true});
      if(state.project?.id!==context.projectId||data.project?.id!==context.projectId)return false;
      state.sourceBaseline=storedProjectSource(data.project);render(data.project);persistSourceDraft();syncTopScenes();
      if(data.preparationWarning){if(notify)toast(data.preparationWarning,true);return false;}
      return sameSourceEditor(context);
    }catch(error){if(notify)toast(error.message,true);return false;}
    finally{finishProjectWork(context.projectId,{sourcePrepareBusy:false});if(state.project?.id===context.projectId)updateSourceSaveState();}
  }
  // The original recognition control and progress panel live in Step 1.
  // The existing handler still moves to the asset inventory on completion.
  if($('confirmSourceReference'))$('confirmSourceReference').textContent='资产提取';
  $('aiSceneDirectory')?.addEventListener('click',()=>identifySceneDirectory());
  $('startPreparedSceneShots')?.addEventListener('click',()=>openMacroArrangement());
  function hasMacroWorkspace(project = state.project) {
    if(!project?.id)return false;
    if(state.macroViewingId===project.id)return true;
    const snapshot=macroSnapshots.get(project.id),saved=project.macroArrangement;
    const actual=value=>!!(value&&(value.plan||value.sourceLocked||value.sourceHash||value.active?.claimId||Object.values(value.activeTasks||{}).some(row=>row?.claimId)));
    if(actual(saved)||actual(snapshot?.projectId===project.id?snapshot:null))return true;
    // A preparation directory is navigation, not proof that these historical
    // episode cards were migrated to the macro request/receipt namespace.
    if(project.scriptCuts?.length||project.episodes?.length)return false;
    return !!project.workflowPreparedScript?.sceneDirectory?.length;
  }
  function preferredWorkflowStage(project) {
    const arranged=project?.macroArrangement||macroSnapshots.get(project?.id)?.plan||project?.scriptCuts?.length;
    return arranged ? 3 : project?.workflowAssetSourceHash ? 2 : 1;
  }
  function inlineMacroView() {
    if (!window.MacroInline) throw Error('剧情编排界面尚未加载，请重新打开软件。未提交模型。');
    if (!macroInlineView) { const ownerProjectId=state.project?.id; macroInlineView = window.MacroInline.create({
      root:$('macroInlineWorkspace'), confirm:(message,settings={})=>studioConfirm(message || '',{...settings,title:settings.title || (settings.warning?'解除本机等待':settings.quote?'确认AI编排费用':'是否确认下一步')}),
      onCompleteScope:()=>openMacroArrangement(),
      onBusy:busy=>{ if(state.project?.id!==ownerProjectId)return;state.macroBusy=Boolean(busy);$('useSource').disabled=Boolean(busy);$('useSource').setAttribute('aria-busy',busy?'true':'false');syncMacroWorkspace(); },
      onSnapshot:snapshot=>{
        if (snapshot?.projectId !== state.project?.id) return;
        macroSnapshots.set(snapshot.projectId,snapshot);
        if (snapshot.plan || snapshot.sourceLocked || snapshot.active?.claimId) state.macroViewingId=snapshot.projectId;
        syncMacroWorkspace();
        syncTopScenes(snapshot);
      },
      onError:message=>{if(state.project?.id===ownerProjectId)toast(message,true);},
    }); }
    return macroInlineView;
  }
  function syncMacroWorkspace() {
    const has=hasMacroWorkspace();
    document.body.dataset.macroWorkspace=has?'1':'0';
    const snapshot=macroSnapshots.get(state.project?.id)||{};
    const oldDirectory=!!state.project?.workflowPreparedScript?.sceneDirectory?.length&&(snapshot.directorySourceMatches===false||snapshot.sourceEpochMatches===false);
    const savedCards=snapshot.projectId===state.project?.id&&(Object.values(snapshot.segments||{}).some(row=>window.MacroArrangement?.readCards(row?.result).length)||snapshot.plan?.segments?.some(row=>row.cardPlans?.length));
    document.body.dataset.currentStoryboardAvailable=oldDirectory&&!savedCards?'0':'1';
    $('macroInlineWorkspace').hidden=!has||(oldDirectory&&!savedCards);
    // Step 3 already has scoped scene counts and the global task manager.
    // Do not repeat their errors/stats in a page-wide green status strip.
    $('visualStageStatus').hidden=has&&state.workflowStage===3;
    if(typeof syncTopScenes==='function')syncTopScenes();
  }

  let sceneChoiceFinish = null;
  function sceneChoice({title,message,yes='是',no='否'}) {
    // This is the only import offer. Only an explicit Yes starts paid work.
    const offerContext=outlineOfferContext207;
    sceneChoiceFinish?.('cancel');
    outlineOfferContext207=offerContext;
    const box=$('visualSceneChoiceDialog');
    $('visualSceneChoiceTitle').textContent=title;
    $('visualSceneChoiceMessage').textContent=message;
    $('visualSceneChoiceYes').textContent=yes;
    $('visualSceneChoiceNo').textContent=no;
    updateOutlineOfferQuote207();
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{
        if(settled)return;settled=true;
        box.removeEventListener('cancel',onCancel);box.removeEventListener('close',onClose);box.removeEventListener('click',onClick);
        if(sceneChoiceFinish===finish)sceneChoiceFinish=null;
        outlineOfferContext207=null;
        if(box.open)box.close();box.style.removeProperty('top');box.style.removeProperty('bottom');box.style.removeProperty('margin');
        resolve(value);
      };
      const onCancel=event=>{event.preventDefault();finish('cancel');};
      const onClose=()=>{if(!box.open)finish('cancel');};
      const onClick=event=>{const button=event.target.closest('[data-scene-choice]');if(button&&box.contains(button))finish(button.dataset.sceneChoice);};
      sceneChoiceFinish=finish;
      box.addEventListener('cancel',onCancel);box.addEventListener('close',onClose);box.addEventListener('click',onClick);
      box.showModal();
      if(window.parent!==window){try{
        const frame=window.parent.document.getElementById('workflowFrame'),height=box.getBoundingClientRect().height;
        const top=(window.parent.innerHeight-height)/2-(frame?.getBoundingClientRect().top||0);
        box.style.top=`${Math.max(16,Math.min(window.innerHeight-height-16,top))}px`;box.style.bottom='auto';box.style.margin='0 auto';
      }catch(_){/* A standalone/cross-origin view keeps normal centering. */}}
      $('visualSceneChoiceYes').focus({preventScroll:true});
    });
  }
  async function openMacroArrangement() {
    const project = state.project;
    if (!project?.id) return toast('请先打开项目并导入剧本。', true);
    if(state.sourceProjectId!==project.id)return toast('原稿与当前项目不一致，请重新打开项目；未提交编排。',true);
    if(state.sourceSaveBusy||state.timelineEntryBusy||state.pendingCut||state.storyboardBusy||state.macroBusy)
      return toast('当前共享剧本操作尚未完成，请稍后重试；其他卡片任务不受影响。',true);
    const sourceText=String($('visualSource').value||'');
    if(!sourceText.trim())return toast('请先输入完整剧本；未调用模型。',true);
    if(!await prepareVisualScript())return;
    if(needsAIDirectory()){setWorkflowStage(1,{scroll:true});return toast('请先完成提取大纲，再进行资产提取并补齐整场分镜。',true);}
    // Opening settings is local and immediate, including scripts with old
    // 15s markers. Only explicit selection may enter the legacy import path.
    const selectedScene=topSceneDirectory?.current();
    state.timelineModelApproval={projectId:project.id,sourceText,segmentId:selectedScene?.id||'',sceneNumber:selectedScene?.number||1};
    openCutModeDialog();
  }
  async function startMacroFromSettings() {
    const choice=cutDurationChoice();
    if(choice.error)return toast(choice.error,true);
    if(state.sourceSaveBusy||state.pendingCut||state.storyboardBusy||state.macroBusy)return toast('当前共享剧本操作尚未完成，未新增模型调用。',true);
    let project=state.project;
    if(!project?.id)return toast('请先打开项目。',true);
    const normalizeSource=value=>String(value??'').replace(/\r\n?/g,'\n').trim();
    const editorSource=normalizeSource($('visualSource').value),savedSource=normalizeSource(project.confirmedScript)||normalizeSource(project.sourceStructure);
    if(!editorSource)return toast('请先输入完整剧本；未调用模型。',true);
    if(state.timelineModelApproval&&(state.timelineModelApproval.projectId!==project.id||normalizeSource(state.timelineModelApproval.sourceText)!==editorSource)){
      state.timelineModelApproval=null;closeDialog('visualCutModeDialog');
      return toast('打开设置后剧本或项目已变化，请重新打开整场分镜设置；未调用模型。',true);
    }
    closeDialog('visualCutModeDialog');
    let startResult, attemptedStart=false;
    try {
      // Ask before the first state/catalog request so a slow server cannot
      // delay visible feedback after the user's Next click.
      const approved=state.timelineModelApproval;
      const previouslyConfirmed=approved?.projectId===project.id&&normalizeSource(approved.sourceText)===editorSource;
      state.timelineModelApproval=null;
      if(!previouslyConfirmed&&!await studioConfirm('',{title:'是否确认下一步'})) {
        startResult={cancelled:true};
        return;
      }
      if(state.project?.id!==project.id || normalizeSource($('visualSource').value)!==editorSource) {
        startResult={cancelled:true};
        return toast('确认期间项目或剧本已变化，请再次点击下一步；未调用模型。',true);
      }
      if(editorSource!==savedSource) {
        // Saving the explicitly confirmed input is free. Do not send users
        // through paid asset recognition or discard their existing images.
        const saved=await post('/api/visual/project/source',{projectId:project.id,sourceText:editorSource,expectedSource:savedSource,confirmed:true});
        if(state.project?.id!==project.id)return;
        if(saved.project?.id!==project.id || (normalizeSource(saved.project.confirmedScript)||normalizeSource(saved.project.sourceStructure))!==editorSource)
          throw Error('当前剧本尚未确认保存，未提交模型；请保留输入后重试。');
        project=saved.project;state.project=project;state.sourceBaseline=storedProjectSource(project);updateSourceSaveState();
      }
      if(state.project?.id!==project.id || normalizeSource($('visualSource').value)!==editorSource) {
        startResult={cancelled:true};
        return toast('当前输入已变化，请再次点击下一步；未调用模型。',true);
      }
      $('visualSource').value=editorSource;
      state.macroViewingId=project.id;
      const executionScene=choice.scope==='current'?(approved?.segmentId||topSceneDirectory?.current()?.id||''):(state.project.workflowPreparedScript?.sceneDirectory?.[0]?.id||'');
      sceneStartLocks206.set(project.id,{sceneId:executionScene});
      setWorkflowStage(3,{scroll:true});
      const view=inlineMacroView();
      await view.setProject(project,{initialSnapshot:macroSnapshots.get(project.id)});
      if(state.project?.id!==project.id)return;
      attemptedStart=true;
      startResult=await view.start({mode:choice.mode,arrangementMode:'shot_first',maxSeconds:choice.fixedSeconds,requestedSeconds:choice.requestedSeconds},{rerun:true,confirmed:true,confirmQuote:true,scope:choice.scope,segmentId:approved?.segmentId||topSceneDirectory?.current()?.id||'',sceneNumber:approved?.sceneNumber||topSceneDirectory?.current()?.number||1});
    } catch(error){if(!error?.projectStateRead)toast(error.message,true);}
    finally {
      sceneStartLocks206.delete(project.id);
      if(state.project?.id===project.id)syncTopScenes();
      const saved=macroSnapshots.get(project.id);
      // A background watch may not have read the new plan yet. Absence of a
      // plan is not proof of cancellation after an accepted submission.
      const abortedBeforeSubmit=startResult?.cancelled===true || startResult?.submission?.cancelled===true || !attemptedStart;
      if(abortedBeforeSubmit && state.project?.id===project.id && !project.macroArrangement && !saved?.sourceLocked && !saved?.plan && !saved?.active?.claimId && !macroInlineView?.isBusy()) {
        state.macroViewingId='';macroSnapshots.delete(project.id);
        setWorkflowStage(preferredWorkflowStage(project),{scroll:true});
      }
    }
  }
  window.addEventListener('pagehide',()=>{sceneChoiceFinish?.('cancel');macroInlineView?.destroy();},{once:true});

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[c]));
  let toastTimer;
  const toast = (message, error = false) => {
    let node = $("toast");
    try { if (window.parent !== window) node = window.parent.document.getElementById("toast") || node; } catch (_) {}
    node.textContent = message; node.className = `toast show${error ? " error" : ""}`;
    (window.ModelActivity||window.parent?.ModelActivity)?.text(node,message,error);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.className = "toast", 5000);
    if (error) window.ModelActivity?.text($("visualStageStatus"),message,true);
  };
  async function workflowAction(button, action) {
    const projectId=state.project?.id,key=`${projectId}/${button.id}`;
    if(workflowActions.has(key))return;
    const original = button.textContent;workflowActions.set(key,true);
    button.dataset.actionPending = "1";button.dataset.actionProject=projectId;
    button.classList.add("is-working"); button.setAttribute("aria-busy", "true");
    try { await action(); }
    catch (error) { if(state.project?.id===projectId)toast(`操作未提交：${error.message}`, true); }
    finally {
      workflowActions.delete(key);
      if(state.project?.id!==projectId||button.dataset.actionProject!==projectId)return;
      button.dataset.actionPending = "0"; button.classList.remove("is-working");
      button.removeAttribute("aria-busy"); button.textContent = original;
      // Free local rechecking clears its one-shot receipt marker. Restore the
      // current action, not the cached label captured before reconciliation.
      if(button.id==='fillStoryboard')updateStoryboardButton();
    }
  }
  function currentCutError() {
    const error = state.cutSubmissionError;
    return error && sameCut(error.projectId, error.revision) ? error.message : '';
  }
  function renderCutSubmissionNotice() {
    const box = $('visualCutSubmissionNotice');
    if (!box) return;
    if (hasMacroWorkspace()) {box.classList.add('hidden');return;}
    const attempt = window.WorkflowCutSubmission?.current(state.project), message = window.WorkflowCutSubmission?.message(state.project) || currentCutError();
    box.classList.toggle('hidden', !message);
    $('visualCutSubmissionMessage').textContent = message;
    $('recheckCutResponse')?.classList.toggle('hidden', !window.WorkflowCutSubmission?.canRecheckResponse?.(state.project));
    $('reviewCutDurationProposal').classList.toggle('hidden', attempt?.state !== 'awaiting_confirmation');
    $('declineCutDurationProposal').classList.toggle('hidden', attempt?.state !== 'awaiting_confirmation');
    $('confirmPreviousCut').classList.toggle('hidden', !state.project?.scriptCuts?.length || !['failed','interrupted'].includes(attempt?.state) || Boolean(attempt?.previousCutConfirmedAt));
    $('retryEpisodeCut')?.classList.toggle('hidden', attempt?.state === 'completed');
    box.querySelectorAll('button').forEach(button => { button.disabled = Boolean(state.storyboardBusy || state.cutDecisionBusy); });
  }
  async function decideCurrentCut(action) {
    if (state.storyboardBusy || state.cutDecisionBusy) return toast('当前任务尚未结束，请稍后确认。', true);
    const project = state.project, attempt = window.WorkflowCutSubmission?.current(project);
    if (!attempt) return toast('没有当前版本的切割确认记录，请重新打开项目。', true);
    const projectId = project.id, revision = cutRevision(project), requestId = attempt.requestId;
    const messages = {
      recheck_response: '只重新核验当前任务已经保存的模型返回，不重新生成、不调用模型、不扣积分。\n如果原返回完整且通过检查，会先展示时长方案，由你再次确认后才替换切割稿；原目标、旧稿和作品不会自动改动。是否继续？',
      accept_proposal: `用户目标：${attempt.planningPolicy?.requestedSeconds}秒。\n完整原文建议：${attempt.recommendedSeconds}秒（约${(Number(attempt.recommendedSeconds)/60).toFixed(2)}分钟），${attempt.planningPolicy?.durationMode === 'adaptive' ? `${attempt.recommendedCardCount}段，各卡按剧情实际时长、单集上限${attempt.planningPolicy.maxSeconds || attempt.planningPolicy.fixedSeconds}秒，不凑满上限` : `${attempt.recommendedCardCount}段 × ${attempt.planningPolicy?.fixedSeconds}秒`}。\n差额：${Number(attempt.recommendedSeconds)-Number(attempt.planningPolicy?.requestedSeconds)}秒。\n原因：${attempt.error || '保留完整剧情并留出自然口播、动作与反应时间。'}\n\n这是文字节奏估算，不是配音或成片实测。确认后采用同一次模型已返回、已校验的建议方案；不再次调用模型，不新增扣费。旧稿和作品按历史保留。是否按建议时长继续？`,
      decline_proposal: '不采纳建议时长，不保存新切割稿。原切割稿与作品保留；若要继续使用旧稿，还需明确确认，它不满足本次新时长目标。确定不采纳吗？',
      use_previous: `确认继续使用下面${project.scriptCuts?.length || 0}段旧切割稿？\n它不是本次重新切割的结果，也不满足本次新目标。此确认不调用模型、不扣积分。`
    };
    if (attempt.planningPolicy?.mode === 'smart') {
      messages.accept_proposal = `原智能编排返回已经重新校验：${attempt.recommendedCardCount}张视频卡，模型估时合计${attempt.recommendedSeconds}秒，单集上限${attempt.planningPolicy.maxSeconds || attempt.planningPolicy.fixedSeconds}秒。\n${attempt.error || '完整剧情与镜头已核对。'}\n\n确认后采用同一次已返回的模型内容，不再次调用模型、不扣积分。旧稿和作品按历史保留。是否恢复？`;
      messages.decline_proposal = '不恢复这次模型原返回，继续保留旧稿与作品；若要使用旧稿，还需明确确认，它不是本次新结果。确定吗？';
    }
    if (!messages[action] || !await studioConfirm(messages[action])) return;
    if (!sameCut(projectId, revision) || window.WorkflowCutSubmission?.current(state.project)?.requestId !== requestId) return toast('项目或切割任务已变化，请重新确认。', true);
    state.cutDecisionBusy = true; renderCutSubmissionNotice();
    try {
      const data = await post('/api/visual/cut/decision', {projectId,cutRevisionId:revision,requestId,action});
      if (!sameCut(projectId, revision) || window.WorkflowCutSubmission?.current(state.project)?.requestId !== requestId) return;
      state.cutSubmissionError = null;
      render(data.project); updateStoryboardButton();
      setWorkflowStage(data.workflowComplete ? 3 : state.workflowStage, {scroll:data.workflowComplete});
      toast(data.workflowComplete ? '已按确认的建议时长保存新切割稿；未新增调用或扣费。' : action === 'recheck_response' ? '原返回重新校验通过，请查看并确认时长方案；未扣费、未替换旧稿。' : action === 'use_previous' ? '已明确确认使用旧稿，当前仍不是新时长结果。' : '未采纳建议时长，旧稿与作品保留。');
    } catch (error) { toast(error.message, true); }
    finally { state.cutDecisionBusy = false; renderCutSubmissionNotice(); }
  }
  $('reviewCutDurationProposal')?.addEventListener('click', () => decideCurrentCut('accept_proposal'));
  $('recheckCutResponse')?.addEventListener('click', () => decideCurrentCut('recheck_response'));
  $('declineCutDurationProposal')?.addEventListener('click', () => decideCurrentCut('decline_proposal'));
  $('confirmPreviousCut')?.addEventListener('click', () => decideCurrentCut('use_previous'));
  $('retryEpisodeCut')?.addEventListener('click', openMacroArrangement);
  function workflowStageMessage(stage) {
    if(stage===1){const feedback=outlineFeedback221();if(feedback)return feedback.message;}
    if(stage===1){const completed=outlineCompletionMessage206();if(completed)return completed;}
    if (stage === 3 && state.pendingCut) {
      const previous = state.project?.scriptCuts?.length || state.project?.episodes?.length || 0;
      return `第 3 步 · 第一步：正在按当前规则编排剧情、估时和切卡。切卡保存后，再单独确认制作正式分镜。${previous ? '下方是上次结果，本次正在等待模型返回。' : '本次正在等待模型返回，尚无新视频卡。'}`;
    }
    const cutMessage = window.WorkflowCutSubmission?.summary?.(state.project) || (window.WorkflowCutSubmission?.message(state.project) ? '当前切割状态需要确认，请查看下方详情。' : currentCutError() ? '本次切割未确认成功，旧稿已保留；请查看下方详情。' : '');
    if (cutMessage) return cutMessage;
    if (stage === 1) return outlineCompletionMessage206() || (state.project?.workflowOutlineMode207==='paid_only'?"原稿自动保存；点击“提取大纲”后按实际模型调用计费。一集就是一场。":"原稿自动保存；已有目录保留，也可点击“提取大纲”重新规划。一集就是一场。");
    if (stage === 2) {
      const assets = state.project?.assets || {};
      return `第 2 步：人物${characterRoots(state.project).length}、场景${assets.scenes?.length || 0}、物品${assets.props?.length || 0}。提取对剧情与视觉一致性重要的资产，制作参考图；随后补齐整场镜头并顺序组卡。`;
    }
    if (storyboardFirstReady(state.project)) return `第 3 步：完整分镜与估时已编排，已合并${state.project.scriptCuts.length}张视频卡。核对原文与分镜后可直接生成，无需再次补齐分镜。`;
    if (stagedStoryboardProject(state.project)) {
      const info = storyboardResumeInfo(state.project), attempt = window.WorkflowCutEditor?.currentBatchAttempt(state.project,'cutStoryboardAttempt');
      const message = `第 3 步 · 第二步：已锁定${info.total}张视频卡，已完成${info.completed}张正式分镜，剩余${info.remaining}张。按v2.1.132标准制作分镜，不改切割原文和卡长；已完成的卡可单独生成视频。`;
      return !state.storyboardBusy && attempt?.error && ['failed','uncertain'].includes(attempt.state) ? `${message} 上次未全部完成：${String(attempt.error).slice(0,500)} ${attempt.resumeAllowed ? '可继续剩余分镜，不重做已完成卡。' : '请先核对原任务。'}` : message;
    }
    const message = `第 3 步：已切割${state.project?.scriptCuts?.length || 0}段、生成${currentEpisodes(state.project).length}张分镜视频卡。先切割全剧，再补齐分镜并制作视频。`;
    const attempt = window.WorkflowCutEditor?.currentBatchAttempt(state.project,'cutStoryboardAttempt');
    return !state.storyboardBusy && attempt?.error && ["failed","uncertain"].includes(attempt.state) ? `${message} 上次分镜未完成，已保留${attempt.completedEpisodes || 0}/${attempt.totalEpisodes || 0}集。原因：${String(attempt.error).slice(0,500)} ${attempt.resumeAllowed ? "可继续补齐剩余分镜。" : "请先核对原分镜任务。"}` : message;
  }
  function setWorkflowStage(stage, {scroll = false, force = false} = {}) {
    stage = Number(stage);
    if (![1,2,3].includes(stage)) return;
    if (!force && stage > 1 && !state.project) return toast("请先创建或打开项目。", true);
    if(state.workflowStage===3&&stage!==3)for(const video of document.querySelectorAll('#macroInlineWorkspace video,#visualEpisodes video'))try{video.pause();}catch(_){}
    if (stage === 3 && !state.pendingCut && !state.project?.scriptCuts?.length && !hasMacroWorkspace()) {
      if (!force) return toast("请先在第 2 步完成剧集切割，成功后才能进入标准分镜与视频卡。", true);
      stage = state.project ? 2 : 1;
    }
    const enteringStoryboard=stage===3&&state.workflowStage!==3;
    state.workflowStage = stage;
    document.body.dataset.workflowStage = String(stage);
    document.querySelectorAll("[data-workflow-panel]").forEach(node => {
      node.classList.toggle("workflow-stage-hidden", Number(node.dataset.workflowPanel) !== stage);
    });
    const stageTwo = [".visual-asset-section", ".visual-asset-history"].join(",");
    document.querySelectorAll(stageTwo).forEach(node => node.classList.toggle("workflow-stage-hidden", stage !== 2));
    document.querySelector(".visual-episode-section")?.classList.toggle("workflow-stage-hidden", stage !== 3);
    $("visualWorkflowSteps").querySelectorAll("button[data-workflow-stage]").forEach(button => {
      const current = Number(button.dataset.workflowStage) === stage;
      if (Number(button.dataset.workflowStage) === 3) {
        button.disabled = !state.pendingCut && !state.project?.scriptCuts?.length && !hasMacroWorkspace();
        button.title = button.disabled ? "请先在第 2 步完成剧集切割" : "查看标准分镜与视频卡";
      }
      button.classList.toggle("active", current);
      if (current) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
    const outlineFeedback=stage===1?outlineFeedback221():null;
    if(window.ModelActivity&&outlineFeedback)window.ModelActivity.set($("visualStageStatus"),{state:outlineFeedback.status==='waiting_original_result'?'':'error',message:outlineFeedback.message});
    else if(window.ModelActivity)window.ModelActivity.text($("visualStageStatus"),workflowStageMessage(stage));
    else $("visualStageStatus").textContent = workflowStageMessage(stage);
    if(stage===1&&!state.sceneDirectoryBusy&&!state.sourcePrepareBusy){
      // This node lives in the source dock. Returning to Step 1 must not
      // present an asset/storyboard completion message as a source action.
      const prepared=state.project?.workflowPreparedScript,amount=prepared?.sceneDirectory?.length||0;
      const message=sourceIsDirty()?'正在自动保存原稿…':outlineCompletionMessage206()||outlineFeedback?.message|| (amount?
        `已识别 ${amount} 集／场；可使用重新规划分场，或进入重要资产页。`:
        prepared?.cleanedSource?'正文已整理。':'原稿导入或编辑后自动保存。');
      window.ModelActivity?.set($("visualSourceHint"),{state:'',message});
      if(!window.ModelActivity)$("visualSourceHint").textContent=message;
    }
    renderScriptAlignment(state.project);
    renderCutSubmissionNotice();
    if(enteringStoryboard)syncTopScenes(undefined,{enteringStoryboard:true});
    syncMacroWorkspace();
    if (stage===3 && hasMacroWorkspace()) {
      try {
        const project=state.project,view=inlineMacroView();
        const current=()=>state.project?.id===project.id&&state.workflowStage===3&&macroInlineView===view;
        const ready=view.setProject(project,{initialSnapshot:macroSnapshots.get(project.id)});
        if(current())Promise.resolve(view.show()).catch(error=>{if(current()&&!error?.projectStateRead)toast(error.message,true);});
        Promise.resolve(ready).then(()=>{if(current())return view.show();})
          .catch(error=>{if(current()&&!error?.projectStateRead)toast(error.message,true);});
      }
      catch(error){toast(error.message,true);}
    }
    if (state.project) $("visualEpisodeCount").textContent = `${state.pendingCut && (state.project.scriptCuts?.length || state.project.episodes?.length) ? '上次结果 · ' : ''}已切割${state.project.scriptCuts?.length || state.project.episodes?.length || 0}段 · 已完成${currentEpisodes(state.project).length}张视频卡`;
    if (scroll) $("visualWorkflowSteps").scrollIntoView({behavior:"smooth",block:"start"});
  }
  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="/api/download?"]');
    if (!link || window.parent === window) return;
    event.preventDefault();
    window.parent.postMessage({type:"workflow-save-download",url:link.getAttribute("href")},window.location.origin);
  });
  const mediaQuoteViews236=new Map();
  function mediaView236(body){
    if(state.project?.id!==body.projectId)return '';
    const scope=body.assetId?[...document.querySelectorAll('.visual-card')].find(node=>node.dataset.id===body.assetId):body.episodeId?[...document.querySelectorAll('.visual-episode-card')].find(node=>node.dataset.episode===body.episodeId):$('visualCoverEditor')||$('visualCoverDialog');
    const fields=[...(scope?.querySelectorAll('input,select,textarea')||[]),...['visualImageTier','visualImageResolution','visualVideoTier','visualResolution','visualVideoDuration','visualVideoRatio','visualRatio','visualStyle','visualEyeMask','visualEyeMaskMode','coverImageModel','visualCoverPrompt'].map($).filter(Boolean)];
    return JSON.stringify([state.project.id,cutRevision(state.project),fields.map(input=>[input.id,input.className,input.value,input.checked])]);
  }
  async function prepareMediaQuote236(action,body){
    const view=mediaView236(body),data=await post('/api/visual/live-quote',{action,...body});
    ModelPresentation.quoteReceiptFields(data.quote);
    if(view&&mediaView236(body)!==view)throw Error('核价期间输入、模型或引用已改变，请重新核价；未提交生成。');
    mediaQuoteViews236.set(data.quote.priceQuoteId,{view,body:{...body},receipt:data.quote});
    if(mediaQuoteViews236.size>500)mediaQuoteViews236.delete(mediaQuoteViews236.keys().next().value);
    return {...body,...ModelPresentation.quoteReceiptFields(data.quote)};
  }
  function needsNativeSkuReceipt172(action,body){
    return action==='video'&&body?.tailFrameContinuation===true&&!!ModelPresentation.videoPriceRange172(state.profile,body.videoModel||selectedModel('video'),body.resolution);
  }
  async function prepareNativeReceipt172(body){
    const view=mediaView236(body),data=await post('/api/visual/live-quote',{action:'video',...body}),receipt=data.quote;
    ModelPresentation.quoteReceiptFields(receipt);
    if(view&&mediaView236(body)!==view)throw Error('读取首帧规格期间设定已变化，请重新确认；未提交。');
    return {...body,...ModelPresentation.quoteReceiptFields(receipt),nativeReceipt172:true,
      nativeReceiptView172:view,nativeReceiptText172:ModelPresentation.quoteText(receipt),billingConfirmed:true};
  }
  function fixedMediaReceipt251(action,body){
    if(!body||body.resumeOnly)return body;
    if(body.nativeReceipt172===true)return body;
    const media=action==='video'?'video':'image';
    if(media==='image'){
      const choice=action==='asset'?document.querySelector(`.visual-card[data-id="${CSS.escape(String(body.assetId||''))}"] .asset-image-model`):action==='cover'?$('coverImageModel'):$('visualImageTier');
      if(!body.imageModel&&choice&&(!choice.value||choice.selectedOptions[0]?.disabled))throw Error('当前图片线路的模型已下架或未发布，请重新选择；未提交生成。');
      const model=body.imageModel||choice?.value||selectedModel('image');
      const item=ModelPresentation.catalog(state.profile,'image',state.project?.settings||{}).find(value=>value.id===model);
      const requestedTier=String(body.tier||'').trim().toLowerCase(),tier=['economy','standard','premium'].includes(requestedTier)?requestedTier:String(item?.tier||'').trim().toLowerCase();
      if(!['economy','standard','premium'].includes(tier))throw Error('当前图片模型缺少有效档位，请刷新模型配置后重新选择；未提交生成。');
      body={...body,imageModel:model,tier,imageResolution:body.imageResolution||ModelPresentation.imageResolutionForModel(state.profile,model,$('visualImageResolution').value)};
    }else{
      const tier=body.videoTier||selectedTier('video');
      body={...body,videoModel:body.videoModel||selectedModel('video'),videoTier:tier,tier,resolution:body.resolution||$('visualResolution').value};
    }
    const model=body[media+'Model'];
    if(ModelPresentation.isLiveQuote(state.profile,media,model)||body.priceQuoteId)return body;
    // Freeze the amount shown for this item. A worker must never replace an
    // already accepted amount after the published catalog changes.
    const points=body.expectedCredits??body.expectedPoints??estimatedRequestPoints(action==='video'?'/api/visual/episode/video':'/api/visual/asset/generate',body);
    const published172=media==='video'?ModelPresentation.quote(state.profile,model,body.resolution,Number(body.duration),body.videoTier,body.ratio):null;
    return {...body,...ModelPresentation.quoteReceiptFields({...published172,estimatedPoints:points}),billingConfirmed:true};
  }
  async function prepareBatchMedia236(action,requests){
    const media=action==='video'?'video':'image';
    requests=requests.map(body=>fixedMediaReceipt251(action,body));
    if(!requests.some(body=>body&&(ModelPresentation.isLiveQuote(state.profile,media,body[media==='video'?'videoModel':'imageModel'])||needsNativeSkuReceipt172(action,body))))return requests;
    const views=requests.map(body=>body?mediaView236(body):'');
    await saveCurrentProjectSettings(false);
    if(requests.some((body,index)=>body&&views[index]&&mediaView236(body)!==views[index]))throw Error('保存设定期间输入或引用已改变，请重新核价。');
    const prepared=[];let total=0;const details=[];
    for(const body of requests){
      if(!body){prepared.push(body);continue;}
      const live=ModelPresentation.isLiveQuote(state.profile,media,body[media==='video'?'videoModel':'imageModel']);
      const value=live?await prepareMediaQuote236(action,body):needsNativeSkuReceipt172(action,body)?await prepareNativeReceipt172(body):body;
      const points=Number(value.expectedCredits);
      if(!Number.isFinite(points)||points<=0)throw Error('部分任务尚无有效报价，整批未提交。');
      prepared.push(value);total+=points;details.push(`第${details.length+1}项：${points}积分${live?' · '+ModelPresentation.quoteText(mediaQuoteViews236.get(value.priceQuoteId).receipt):value.nativeReceiptText172?' · '+value.nativeReceiptText172:''}`);
    }
    await CreditGate.ensure(Number(total.toFixed(2)));
    if(!await studioConfirm(`本批按每项实际输入分别核价，合计 ${Number(total.toFixed(2))} 积分。\n${details.join('\n')}\n\n确认提交这些任务？`))throw Error('已取消本批生成，未提交模型。');
    for(const body of prepared.filter(Boolean)){const saved=body.priceQuoteId?mediaQuoteViews236.get(body.priceQuoteId):null;if(saved){ModelPresentation.quoteReceiptFields(saved.receipt);if(saved.view&&mediaView236(body)!==saved.view)throw Error('确认期间输入、模型或引用已改变，整批未提交，请重新核价。');}if(body.nativeReceiptView172&&mediaView236(body)!==body.nativeReceiptView172)throw Error('确认期间首帧规格或输入已变化，整批未提交。');}
    return prepared;
  }
  async function post(url, body) {
    const recoveringImage236=ModelPresentation.pendingImageRecovery(state.project,url,body);
    // A saved image request owns its original model, receipt and request ID.
    // Recovery submits only its local identity; current controls cannot replace it.
    if(recoveringImage236)body={projectId:body.projectId||state.project.id,...(url.endsWith('/frame')?{episodeId:body.episodeId}:{}),resumeOnly:true};
    const fixedAction251={'/api/visual/asset/generate':'asset','/api/visual/cover/generate':'cover','/api/visual/episode/frame':'frame','/api/visual/episode/video':'video'}[url];
    if(fixedAction251&&!body.resumeOnly)body=fixedMediaReceipt251(fixedAction251,body);
    if (['/api/visual/cut-storyboard','/api/visual/cut/storyboard-one','/api/visual/episode/frame','/api/visual/episode/video'].includes(url)
        && !body.reconcile && !body.resumeOnly && window.WorkflowCutSubmission?.blocked(state.project)) {
      throw new Error('本次新切割尚未确认保存。请先确认建议时长、重新切割，或明确继续使用旧稿；未提交模型。');
    }
    const textStage = {'/api/visual/project/scenes':'workflow-cut','/api/visual/assets/analyze':'workflow-assets','/api/visual/episode-cut':'workflow-cut',
      '/api/visual/cut-storyboard':'workflow-storyboard','/api/visual/cut/storyboard-one':'workflow-storyboard','/api/visual/script-storyboard':'workflow-storyboard'}[url];
    if (textStage && !body.reconcile && !(url === '/api/visual/project/scenes' && body.regenerate === false) && !(url === '/api/visual/script-storyboard' && !body.confirmed)) {
      await CreditGate.ensure(workflowTextCredit(textStage, body.modelConfig?.model));
    }
    if (body.kind === "people" && body.appearanceType == null && ["/api/visual/asset/prompt", "/api/visual/asset/generate"].includes(url)) {
      const cardNode = Array.from(document.querySelectorAll('.visual-card')).find(node => node.dataset.kind === 'people' && node.dataset.id === body.assetId);
      body.appearanceType = cardNode?.querySelector('.asset-appearance-type')?.value || state.project?.assets?.people?.find(item => item.id === body.assetId)?.generationSettings?.appearanceType || 'auto';
    }
    if (!recoveringImage236 && state.project && (!body.projectId || body.projectId === state.project.id) && ["/api/visual/asset/generate","/api/visual/episode/frame","/api/visual/episode/video","/api/visual/cover/generate"].includes(url)) {
      if (url.endsWith("/video") && !body.resumeOnly) {
        const item = state.project.episodes?.find(value => value.id === body.episodeId);
        const issue = adaptiveVideoIssue(item,body.videoModel || selectedModel("video"),body.duration,body.resolution) || videoCapabilityIssue(body.videoModel || selectedModel("video"), body.duration, body.resolution,body.ratio);
        if (issue) throw new Error(issue + "，请在后台调整模型配置或选择其他模型。");
      }
      if(!url.endsWith('/video') && !body.imageModel){
        const choice=url.endsWith('/asset/generate')?document.querySelector(`.visual-card[data-id="${CSS.escape(String(body.assetId || ''))}"] .asset-image-model`):url.endsWith('/cover/generate')?$('coverImageModel'):$('visualImageTier');
        if(choice && (!choice.value || choice.selectedOptions[0]?.disabled))throw Error('当前图片线路的模型已下架或未发布，请重新选择；未提交生成。');
      }
      const requestProjectId=state.project.id;
      await saveCurrentProjectSettings(false);
      if(state.project?.id!==requestProjectId)throw Error("项目已切换，本次生成尚未提交；已提交的任务继续在原项目执行。");
      if (url.endsWith("/video")) {
        body.videoModel = body.videoModel || selectedModel("video");
        body.videoTier = body.videoTier || selectedTier("video");
        body.tier = body.videoTier;
      } else {
        const localModel = url.endsWith("/asset/generate")
          ? document.querySelector(`.visual-card[data-id="${CSS.escape(String(body.assetId || ""))}"] .asset-image-model`)?.value
          : url.endsWith("/cover/generate") ? $("coverImageModel")?.value : "";
        body.imageModel = body.imageModel || localModel || selectedModel("image");
        const item = ModelPresentation.catalog(state.profile, "image", state.project?.settings || {}).find(value => value.id === body.imageModel);
        body.tier = body.tier || item?.tier || selectedTier("image");
      }
      if (!url.endsWith("/video") && !body.imageResolution) body.imageResolution = ModelPresentation.imageResolutionForModel(state.profile, body.imageModel || selectedModel("image"), $("visualImageResolution").value);
      if (!(url.endsWith("/video") && body.resumeOnly)) {
        const media=url.endsWith('/video')?'video':'image',model=media==='video'?body.videoModel:body.imageModel;
        if(ModelPresentation.isLiveQuote(state.profile,media,model)){
          if(!state.featureAllowed)throw Error('短剧工作流当前不可用，请检查卡密或联系管理员恢复权限。');
          if(!body.priceQuoteId){
            body=await prepareMediaQuote236(url.endsWith('/video')?'video':url.endsWith('/frame')?'frame':url.includes('/cover/')?'cover':'asset',body);
            const saved=mediaQuoteViews236.get(body.priceQuoteId);
            await CreditGate.ensure(Number(saved.receipt.estimatedPoints));
            if(!await studioConfirm(ModelPresentation.quoteText(saved.receipt)+'\n\n确认按此报价生成？'))throw Error('已取消生成，未提交模型。');
          }
          const saved=mediaQuoteViews236.get(body.priceQuoteId);
          if(!saved||saved.view&&mediaView236(body)!==saved.view)throw Error('输入、模型或引用已改变，请重新核价并确认；未提交生成。');
          ModelPresentation.quoteReceiptFields(saved.receipt);
          body.billingConfirmed=true;
          await CreditGate.ensure(Number(body.expectedCredits));
          if(saved.view&&mediaView236(body)!==saved.view)throw Error('提交前输入、模型或引用已改变，请重新核价并确认；未提交生成。');
        }else if(needsNativeSkuReceipt172(media,body)){
          if(!body.nativeReceipt172){body=await prepareNativeReceipt172(body);await CreditGate.ensure(Number(body.expectedCredits));if(!await studioConfirm(body.nativeReceiptText172+'\n\n确认按此已发布价格生成？'))throw Error('已取消生成，未提交模型。');}
          if(body.nativeReceiptView172&&mediaView236(body)!==body.nativeReceiptView172)throw Error('确认期间首帧规格或输入已变化，请重新确认；未提交。');
          await ensurePointsForRequest(url,body);
        }else await ensurePointsForRequest(url, body);
      }
    }
    const activity = textStage && url!=='/api/visual/project/scenes' && (!body.projectId||body.projectId===state.project?.id) && !state.assetRecognitionBusy ? $("visualStageStatus") : null;
    if(activity) window.ModelActivity?.set(activity,{state:"pending",preserve:true});
    let response, data;
    try {
      response = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
      data = await response.json();
    } catch (error) { error.requestUncertain = true; if(activity)window.ModelActivity?.text(activity,error.message,true); throw error; }
    if (!response.ok) {
      const error = new Error(data.error || "操作失败");
      if(activity)window.ModelActivity?.text(activity,error.message,true);
      error.httpStatus = response.status;
      error.status = response.status;
      error.code=data.code || data.errorCode;
      error.message=ModelPresentation.quoteFailureMessage(error.code,error.message);
      error.requestUncertain = response.status >= 500;
      throw error;
    }
    if(data.taskId&&body.projectId)taskProjects.set(data.taskId,body.projectId);
    if(activity&&!data.taskId) window.ModelActivity?.set(activity,{state:"",preserve:true});
    return data;
  }
  function media(file) { return `/api/visual/media?projectId=${encodeURIComponent(state.project.id)}&file=${encodeURIComponent(file)}`; }
  function downloadMedia(file, name) { return `/api/visual/download?projectId=${encodeURIComponent(state.project.id)}&file=${encodeURIComponent(file)}&name=${encodeURIComponent(name)}`; }
  async function saveDownload(url, name = "") {
    if (window.parent !== window && typeof window.parent.saveLocalDownload === "function") return window.parent.saveLocalDownload(url, name);
    const api = window.pywebview?.api || window.parent?.pywebview?.api;
    if (api?.save_download) {
      const result = await api.save_download(url, name, state.project?.outputModule227 || 'workflow');
      if (result?.canceled) return false;
      if (!result?.ok) throw new Error(result?.error || "保存失败。");
      toast(`已保存到：${result.path}`); return true;
    }
    const link = document.createElement("a"); link.href = url; link.download = name; link.click(); return true;
  }
  async function waitTask(taskId, onProgress = null, options = {}) {
    const started = Date.now(), ownerProjectId=options.projectId||taskProjects.get(taskId)||state.project?.id;
    let lastProgress = -1, changedAt = started, lastBalanceRefresh = 0, readFailures = 0;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (;;) {
      if (options.shouldStop?.()) { const error = new Error("原视频任务已解除，已停止本机查询。"); error.videoDetached = true; throw error; }
      let data;
      try {
        const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
        if (response.status === 404 && options.onMissing) {
          const observed = await options.onMissing();
          if (observed.complete) return observed.result || observed;
          if (observed.stopped) { const error = new Error(observed.message || "原视频任务已停止。"); error.terminal = true; throw error; }
          if (!observed.taskId) { const error = new Error("原任务状态暂未同步，正在重新连接…"); error.retryable = true; throw error; }
          taskId = observed.taskId;
          await pause(900);
          continue;
        }
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          const error = new Error(failure.error || "任务状态暂时无法读取。");
          error.httpStatus = response.status;
          error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          error.terminal = !error.retryable;
          throw error;
        }
        data = await response.json();
        readFailures = 0;
      } catch (error) {
        if (!options.retryReads || error.terminal || (error.httpStatus && !error.retryable)) throw error;
        readFailures++;
        if (onProgress) await onProgress({state:"running", progress:Math.max(0,lastProgress), message:"连接暂时中断，正在自动查询原任务；不会重新生成或扣费…", reconnecting:true});
        await pause(Math.min(30000, 1500 * 2 ** Math.min(readFailures - 1, 5)));
        continue;
      }
      const progress = Number(data.progress || 0);
      if (progress !== lastProgress) { lastProgress = progress; changedAt = Date.now(); }
      if (["visual_episode_cut","visual_cut_storyboard","visual_storyboard_regeneration"].includes(data.kind) && Date.now() - lastBalanceRefresh > 5000) { lastBalanceRefresh = Date.now(); refreshPoints(); }
      const elapsed = Math.floor((Date.now() - started) / 1000), unchanged = Math.floor((Date.now() - changedAt) / 1000);
      if (data.state === "running") {
        const time = elapsed < 60 ? `${elapsed}秒` : `${Math.floor(elapsed / 60)}分${String(elapsed % 60).padStart(2,"0")}秒`;
        data.message = `${data.message || "正在处理…"} · 已等待${time}${unchanged >= 120 ? " · 仍在等待原调用返回，不会重新提交" : ""}`;
      }
      if (state.project?.id===ownerProjectId && (["visual_asset_analysis","visual_assets_analyze","visual_plan","visual_episode_cut","visual_cut_storyboard","visual_storyboard_regeneration","visual_script_storyboard"].includes(data.kind) || state.storyboardBusy)) {
        if (state.assetRecognitionBusy) {
          // The recognition panel owns its one waiting indicator. Decorating
          // the stage, source hint and button too used to show 3–4 spinners.
          window.ModelActivity?.set($("visualStageStatus"),{state:"",message:""});
          window.ModelActivity?.set($("visualSourceHint"),{state:"",message:""});
        } else window.ModelActivity?.task($("visualStageStatus"),data);
        if (!$("visualRecognitionProgress").classList.contains("hidden")) { $("visualRecognitionProgress").classList.remove("model-activity-container"); window.ModelActivity?.set($("visualRecognitionProgress"),{state:"",preserve:true}); if(!state.assetRecognitionBusy)window.ModelActivity?.task($("visualSourceHint"),data); }
      }
      if (onProgress && (data.message || data.progress != null)) await onProgress(data);
      if (["error","cancelled"].includes(data.state)) { refreshPoints(); const error = new Error(data.error || data.message || "任务失败"); if(data.kind==='visual_asset_recognition'&&data.assetPartialSummary224)error.assetPartialSummary224=data.assetPartialSummary224; throw error; }
      if (data.state === "done") { refreshPoints(); return data.result || {}; }
      if (data.kind === "visual_asset" && Date.now() - started > 12 * 60 * 1000) { refreshPoints(); throw new Error("图片任务超过12分钟仍未结束，已停止等待；系统禁止重复提交同一张仍在运行的素材。请上传替代图或稍后刷新状态。"); }
      await pause(900);
    }
  }
  const profileFields = ["imageModelEconomy","imageModelStandard","imageModelPremium","videoModelEconomy","videoModelStandard","videoModelPremium","imagePriceEconomy","imagePriceStandard","imagePricePremium","videoPriceEconomy","videoPriceStandard","videoPricePremium","imageNameEconomy","imageNameStandard","imageNamePremium","videoNameEconomy","videoNameStandard","videoNamePremium","imageEffectEconomy","imageEffectStandard","imageEffectPremium","videoEffectEconomy","videoEffectStandard","videoEffectPremium"];
  function preferredModelId(media, items) {
    if (media === "image") {
      const preferred = items.find(item => String(item.id).toLowerCase() === "image-2.5");
      if (preferred) {
        const resolutions = ModelPresentation.imageResolutionOptions(state.profile || {}, preferred.id);
        if (ModelPresentation.isLiveQuote(state.profile,'image',preferred.id)||resolutions.some(resolution => ModelPresentation.imageQuote(state.profile || {}, preferred.id, resolution, 1))) return preferred.id;
      }
    }
    return items[0]?.id || "";
  }
  function activeRoute234(media,value,settings=state.project?.settings||{}) {
    const choices=ModelPresentation.availableRoutes(state.profile,media,settings);
    return choices.some(([id])=>id===value)?value:choices[0]?.[0]||'';
  }
  function routeOptions234(media,value,settings=state.project?.settings||{}) {
    return ModelPresentation.availableRoutes(state.profile,media,settings)
      .map(([id,name])=>`<option value="${id}" ${id===value?'selected':''}>${name}</option>`).join('')
      || '<option value="" disabled>暂无已发布线路</option>';
  }
  function modelRoute234(media, model, fallback) { return ModelPresentation.routeForModel(state.profile,media,model,fallback); }
  function populateModelSelect(id, media, settings = {}, preferConfigured = false, explicitRoute = null) {
    const select = $(id), previous = select.value, previousChoice = select.selectedOptions[0]?.dataset.modelChoice229 === 'true';
    const all = ModelPresentation.catalog(state.profile, media, settings), configured = settings[`${media}Model`];
    const previousTier = select.selectedOptions[0]?.dataset.tier;
    const retained = preferConfigured && configured ? configured :
      (previousChoice || all.some(item => item.id === previous)) ? previous : configured || '';
    const routeControl=$(id.replace(/Tier$/, 'RouteType'));
    const route=activeRoute234(media,explicitRoute || (retained ? modelRoute234(media,retained,settings[`${media}RouteType`] || routeControl?.value) : settings[`${media}RouteType`] || routeControl?.value || 'official'),settings);
    if(routeControl){routeControl.innerHTML=routeOptions234(media,route,settings);routeControl.value=route;}
    const items=all.filter(item=>item.routeType===route);
    const chosen=explicitRoute ? preferredModelId(media,items) : retained || preferredModelId(media,items);
    select.innerHTML = items.length ? items.map(item => { const label = media === 'video' ? ModelPresentation.videoOptionLabel(state.profile, item) : item.name; return `<option value="${esc(item.id)}" data-tier="${item.tier}" data-model-choice229="true" data-label="${esc(label)}" title="${esc(label)}">${esc(label)}</option>`; }).join('') : '<option value="">当前线路暂无已发布模型</option>';
    if (chosen && !items.some(item => item.id === chosen)) {
      const missing = new Option(`项目所选${media === 'image' ? '图片' : '视频'}模型暂不可用，请重新选择`, chosen);
      missing.disabled = true; missing.dataset.modelChoice229 = 'true';
      missing.dataset.label = missing.textContent;
      missing.dataset.tier = (chosen === configured ? settings[`${media}Tier`] : previousTier) || 'economy'; select.append(missing);
    }
    select.value = chosen || '';
  }
  function updateTierLabels(profile) {
    ["image", "video"].forEach(media => populateModelSelect(media === "image" ? "visualImageTier" : "visualVideoTier", media, state.project?.settings || {}));
    syncImageResolutionOptions($("visualImageResolution"), selectedModel("image"), $("visualImageResolution").value);
    syncVideoCapabilities();
    ["economy", "standard", "premium"].forEach(tier => {
      const suffix = ModelPresentation.suffix(tier), input = $("videoPrice" + suffix);
      const quote = ModelPresentation.quote(state.profile, state.profile["videoModel" + suffix] || "", "480p", 1);
      if (input) {
        input.value = quote ? quote.cost : "";
        input.readOnly = true; input.placeholder = "运营后台配置报价";
        input.title = "实际视频按运营后台发布的模型×分辨率计费表估算。";
      }
      const imageInput = $("imagePrice" + suffix);
      const imageQuote = ModelPresentation.imageQuote(state.profile, state.profile["imageModel" + suffix] || "", "1K");
      if (imageInput) {
        imageInput.value = imageQuote ? imageQuote.cost : "";
        imageInput.readOnly = true; imageInput.placeholder = "运营后台配置报价";
        imageInput.title = "实际图片按运营后台发布的模型×清晰度计费表估算。";
      }
    });
    refreshWizardModels();
    if (state.project) updateEstimate();
  }
  const mediaPricingSignature235 = profile => JSON.stringify([profile?.visualCatalogPublished,profile?.visualConfigRevision,profile?.imagePricing,profile?.videoPricing,profile?.videoSkuPricing172,profile?.visualVideoSkuPricing172,profile?.visualModels,profile?.modelCapabilities]);
  let profileRefresh251=null,mediaPricingRefreshPending251=false;
  function notifyProfileSync251(result){
    if(result?.ok&&!result.catalogPending)toast('已读取运营后台最新的模型、价格和风格。');
    else toast(result?.error||'媒体价格目录仍待同步，已有配置保留，稍后自动重试。',true);
  }
  function loadProfile(refresh=false,notify=false){
    if(profileRefresh251)return profileRefresh251.then(result=>{if(notify)notifyProfileSync251(result);return result;});
    const work=readProfile251(refresh,notify);profileRefresh251=work;
    const clear=()=>{if(profileRefresh251===work)profileRefresh251=null;};work.then(clear,clear);return work;
  }
  async function readProfile251(refresh,notify){
    try{
      const response=await fetch(`/api/visual/profile${refresh?'?refresh=1':''}`,{cache:'no-store',signal:AbortSignal.timeout(15000)}),data=await response.json();
      if(!response.ok||data.ok===false||data.configError)throw Error(data.error||data.configError||'同步后台配置失败');
      const previous=mediaPricingSignature235(state.profile),had=Object.keys(state.profile||{}).length>0;
      state.profile=data.profile||{};
      if(!had||previous!==mediaPricingSignature235(state.profile)){
        refreshCardModelCatalog234();
        updateTierLabels(state.profile);refreshReferenceLimits();
        if(had)void loadVisualTextModels();
        if(had)mediaPricingRefreshPending251=true;
      }
      // Profile revision and media catalog are separate reads. Keep retrying a
      // failed catalog even after the new profile revision has been accepted.
      if(macroInlineView?.needsMediaPricesRefresh251?.())mediaPricingRefreshPending251=true;
      if(mediaPricingRefreshPending251&&macroInlineView?.refreshMediaPrices156){
        const catalog=await macroInlineView.refreshMediaPrices156();
        if(catalog?.updated===true)mediaPricingRefreshPending251=false;
      }
      const result={ok:true,catalogPending:mediaPricingRefreshPending251};
      if($('visualProfileStatus'))$('visualProfileStatus').textContent=result.catalogPending?'媒体价格目录仍待同步，已有配置保留，稍后自动重试。':'模型和价格会自动从运营后台更新；后台刚修改过时可手动刷新。';
      if(notify)notifyProfileSync251(result);return result;
    }catch(error){
      const result={ok:false,catalogPending:mediaPricingRefreshPending251,error:'同步暂未完成：'+error.message+'；已有配置保留，稍后自动重试。'};
      if($('visualProfileStatus'))$('visualProfileStatus').textContent=result.error;
      if(notify)notifyProfileSync251(result);return result;
    }
  }
  async function loadVisualTextModels() {
    try {
      const response = await fetch("/api/client/config", {cache:"no-store"});
      const config = await response.json();
      if (!response.ok || config.configError) throw new Error("后台分镜配置读取失败");
      const models = (config.visualModels || []).filter(item => item?.media === "text" && item.enabled !== false && item.gatewayReady !== false);
      state.textModels = models;
      const fixed = models.find(item => item.default === true) || models.find(item => String(item.model || "").toLowerCase() === "qwen3.8-flash") || models.find(item => String(item.model || "").toLowerCase().startsWith("qwen3.8")) || models[0];
      state.textButtonBindings = config.textButtonBindings || {};
      const cutBinding = state.textButtonBindings["workflow-cut"];
      const cutModel = models.find(item => item.model === cutBinding?.model);
      $("visualCutModel").innerHTML = cutModel ? `<option value="${esc(cutModel.model)}">${esc(cutModel.displayName || cutModel.model)}</option>` : '<option value="">未配置切割模型</option>';
      const storyboardBinding = state.textButtonBindings["workflow-storyboard"];
      const storyboardModel = storyboardBinding ? models.find(item => item.model === storyboardBinding.model) : fixed;
      $("visualTextModel").innerHTML = storyboardModel ? `<option value="${esc(storyboardModel.model)}">${esc(storyboardModel.displayName || "写作通道")}</option>` : '<option value="">未配置写作通道</option>';
      const recognition = $("visualRecognitionModel");
      const recognitionBinding = state.textButtonBindings["workflow-assets"];
      const chosen = recognitionBinding?.model || localStorage.getItem("drama-recognition-model") || fixed?.model || "";
      recognition.innerHTML = models.length ? models.map(item => `<option value="${esc(item.model)}">${esc(item.displayName || item.model)}</option>`).join("") : '<option value="">未配置识别模型</option>';
      if (models.some(item => item.model === chosen)) recognition.value = chosen;
      else recognition.value = fixed?.model || models[0]?.model || "";
      recognition.disabled = Boolean(recognitionBinding);
      state.textModelPricing = config.textModelPricing || [];
      updateRecognitionQuote();
      const quote = storyboardRegenerationQuote();
      state.storyboardPriceReady = quote.ready;
      $("visualTextModelQuote").textContent = quote.ready ? `本次制作：${quote.modelName} · ${bindingQuote(storyboardBinding, quote.points)}` : quote.message;
      state.cutPriceReady = Boolean(cutModel && cutBinding && Number(cutBinding.price) > 0);
      renderAIDirectoryControls();
      $("visualCutModelQuote").textContent = state.cutPriceReady ? `编排切卡：${bindingQuote(cutBinding)} · 本次1次调用，预计${Number(cutBinding.price).toFixed(2)}积分` : "后台未配置剧集切割价格，暂不能提交";
      updateStoryboardButton();
    } catch (_) {
      state.textModels = []; state.storyboardPriceReady = false; state.cutPriceReady = false;
      $("visualTextModelQuote").textContent = "后台分镜模型和价格尚未确认，暂不能提交";
      updateStoryboardButton();
    }
  }
  function bindingQuote(binding, fallback = 0) { return `每次模型调用${Number(binding?.price || fallback).toFixed(2)}积分，按实际调用次数结算`; }
  function storyboardRegenerationQuote() {
    const binding = state.textButtonBindings?.["workflow-storyboard"];
    const modelId = binding?.model || $("visualTextModel")?.value || "";
    const model = (state.textModels || []).find(item => item.model === modelId && item.enabled !== false && item.gatewayReady !== false);
    const points = Number(workflowTextCredit("workflow-storyboard", modelId));
    const ready = Boolean(model && Number.isFinite(points) && points > 0);
    return {ready, modelName:model?.displayName || "后台分镜模型", points:ready ? points : null,
      message:ready ? "" : "后台尚未发布可用分镜模型或有效按次价格，暂不能 AI 重新生成"};
  }
  function updateRecognitionQuote() {
    const model = $("visualRecognitionModel").value;
    const binding = state.textButtonBindings?.["workflow-assets"];
    const price = (state.textModelPricing || []).find(item => String(item.model || "").toLowerCase() === String(model).toLowerCase() && String(item.resolution || item.operation || "").toLowerCase() === "rewrite");
    const quoted = binding ? Number(binding.price) : Number(price?.pricePerGeneration || 0);
    state.recognitionPriceReady = Boolean(model && quoted > 0);
  }
  function pointText(value) { return Number(value || 0).toFixed(2); }
  function usageDate(value) { const ts = Number(value || 0); return ts ? new Date(ts * 1000).toLocaleString("zh-CN", { hour12:false }) : ""; }
  function renderPointsUsage(usage) {
    state.pointsUsage = usage || null;
    refreshWizardPricing();
    const balance = Number(usage?.remainingPoints ?? usage?.points ?? 0);
    CreditGate.setBalance(balance);
    if ($("visualPointsBalance")) $("visualPointsBalance").textContent = pointText(balance);
    [ ["visualPointsTotal", usage?.points], ["visualPointsUsed", usage?.usedPoints], ["visualPointsRemaining", balance], ["visualPointsCredited", usage?.creditedPoints] ].forEach(([id, value]) => { if ($(id)) $(id).textContent = pointText(value); });
    if ($("visualPointsNote")) $("visualPointsNote").textContent = balance > 0 ? `当前可用 ${pointText(balance)} 积分；文本模型按实际成功调用次数结算，视频和图片按后台发布的价格结算。` : "当前没有可用积分，请联系运营后台充值或调整后再生成。";
    const records = usage?.records || [];
    if ($("visualPointsRecords")) $("visualPointsRecords").innerHTML = records.length ? records.map(item => `<div class="visual-points-record"><span>${esc(usageDate(item.created_at))}<small>${esc(item.admin_name || "系统")}</small></span><b class="${Number(item.deltaPoints) >= 0 ? "positive" : "negative"}">${Number(item.deltaPoints) >= 0 ? "+" : ""}${pointText(item.deltaPoints)}</b><em>${esc(item.reason || "积分变动")}${item.balanceAfter == null ? "" : ` · 余额${pointText(item.balanceAfter)}`}</em></div>`).join("") : '<span class="visual-empty">暂无积分变动记录</span>';
    const orders = usage?.orders || [];
    if ($("visualBillingRecords")) $("visualBillingRecords").innerHTML = orders.length ? orders.map(item => `<div class="visual-points-record"><span>${esc(usageDate(item.created_at))}<small>${item.media === "video" ? "视频" : "图片"}</small></span><b class="negative">-${pointText(item.costPoints)}</b><em>${esc(item.model || "")}/${esc(item.resolution || "")} · ${esc(String(item.quantity ?? ""))}${item.media === "video" ? "秒" : "张"} · ${esc(item.status || "")}</em></div>`).join("") : '<span class="visual-empty">还没有生成扣费记录</span>';
    const locked = balance <= 0;
    document.querySelectorAll(".asset-generate,.frame-generate,.video-generate,#generateVisualCover,.batch-assets,.batch-assets-all,.batch-videos,.batch-videos-all").forEach(button => { if (button.dataset.busy !== "1") { button.classList.toggle("points-locked", locked); button.title = locked ? "当前积分不足，请先充值或调整积分" : ""; } });
    if (window.parent !== window) window.parent.postMessage({ type: "points-usage-updated", usage: usage || {} }, window.location.origin);
  }
  let pointsRefresh231=null;
  function refreshPoints(notify=false,strict=false){
    if(notify||strict)return readPointsUsage231(notify,strict);
    if(pointsRefresh231)return pointsRefresh231;
    const work=new Promise(resolve=>setTimeout(resolve,60)).then(()=>readPointsUsage231(false,false));
    pointsRefresh231=work;const clear=()=>{if(pointsRefresh231===work)pointsRefresh231=null;};work.then(clear,clear);return work;
  }
  async function readPointsUsage231(notify = false, strict = false) {
    let lastError = null;
    // This is a read-only preflight. Retry short network hiccups before
    // blocking generation; no model request or charge is created here.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch("/api/visual/usage", {cache:"no-store"});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || "积分读取失败");
        renderPointsUsage(data.usage || {});
        if (notify) toast("积分余额和使用记录已刷新。");
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    if ($("visualPointsBalance")) $("visualPointsBalance").textContent = "--";
    state.pointsUsage = null; refreshWizardPricing();
    if (notify && lastError) toast(lastError.message, true);
    if (strict) {
      const detail = lastError?.message === "Failed to fetch"
        ? "本机服务暂时无响应，请稍后重试。"
        : (lastError?.message || "请稍后重试。");
      throw new Error("无法确认最新积分，任务已停止且未提交。" + detail);
    }
  }
  function estimatedRequestPoints(url, body) {
    if (!state.profile || !state.project) return 0;
    if (url.endsWith("/video")) return ModelPresentation.quote(state.profile, body.videoModel || selectedModel("video"), body.resolution || $("visualResolution").value, Number(body.duration || 0), body.videoTier || selectedTier("video"),body.ratio || $("visualVideoRatio").value)?.points ?? null;
    return ModelPresentation.imageQuote(state.profile, body.imageModel || selectedModel("image"), body.imageResolution || $("visualImageResolution").value, 1)?.points ?? null;
  }
  async function ensurePointsForRequest(url, body) {
    if (!state.featureAllowed) { $("visualFeatureState")?.scrollIntoView({behavior:"smooth", block:"center"}); throw new Error("短剧工作流当前不可用，请检查卡密或联系管理员恢复权限。"); }
    const estimate = body.expectedCredits??body.expectedPoints??estimatedRequestPoints(url, body);
    await CreditGate.ensure(estimate);
  }
  function workflowTextCredit(stage, model) {
    const binding = state.textButtonBindings?.[stage];
    if (binding) return Number(binding.price);
    const row = (state.textModelPricing || []).find(row => row.model === model && (row.operation || row.resolution) === 'rewrite');
    return row ? Number(row.pricePerGeneration) : null;
  }
  function workflowImageCredit(button) {
    const episodeId=button.closest('.visual-episode-card')?.dataset.episode,recoveryUrl=button.id==='generateVisualCover'?'/api/visual/cover/generate':episodeId?'/api/visual/episode/frame':'';
    if(ModelPresentation.pendingImageRecovery(state.project,recoveryUrl,{episodeId}))return CreditGate.FREE;
    const model = button.closest('.visual-card')?.querySelector('.asset-image-model')?.value
      || (button.id === 'generateVisualCover' ? $('coverImageModel')?.value : '') || selectedModel('image');
    if(ModelPresentation.isLiveQuote(state.profile,'image',model))return CreditGate.QUOTE;
    return ModelPresentation.imageQuote(state.profile || {},model,$('visualImageResolution').value,1)?.points ?? null;
  }
  function workflowVideoCredit(button) {
    const node = button.closest('.visual-episode-card'), item = state.project?.episodes?.find(row => row.id === node?.dataset.episode);
    if (!item) return null;
    if (pendingVideoEpisode(item)) { delete button.dataset.creditReason; return CreditGate.FREE; }
    const block = episodeVideoBlockReason(item,node);
    if (block) { button.dataset.creditReason = block.message; return null; }
    delete button.dataset.creditReason;
    const model = node.querySelector('.episode-video-model')?.value || selectedModel('video');
    const resolution = node.querySelector('.episode-video-resolution')?.value || $('visualResolution').value;
    const tier = node.querySelector('.episode-video-model')?.selectedOptions[0]?.dataset.tier || selectedTier('video');
    if(ModelPresentation.isLiveQuote(state.profile,'video',model))return CreditGate.QUOTE;
    return ModelPresentation.quote(state.profile || {},model,resolution,chosenEpisodeDuration(item,node),tier,chosenEpisodeRatio(item,node))?.points ?? null;
  }
  function workflowBatchCredit(button) {
    const video = button.matches('.batch-videos,.batch-videos-all'), all = button.matches('.batch-assets-all,.batch-videos-all');
    const selector = video ? '.visual-episode-card' : `.visual-card[data-kind="${button.dataset.batchKind}"]`;
    const cards = [...document.querySelectorAll(selector)].filter(node => (all || node.querySelector(video ? '.episode-select' : '.asset-select')?.checked)
      && (!video || !state.activeVideoJobs.get(videoJobKey(state.project?.id,node.dataset.episode))?.active));
    // An executing episode is already reserved and must not count again when
    // the user adds other selected episodes to the concurrent queue.
    if (video && !cards.length) return CreditGate.FREE;
    const costs = cards.map(node => video ? workflowVideoCredit(node.querySelector('.video-generate')) : workflowImageCredit(node.querySelector('.asset-generate')));
    const blockedCard=video && cards.find(node=>node.querySelector('.video-generate')?.dataset.creditReason);
    if (blockedCard) button.dataset.creditReason=`所选视频卡尚不能生成：第${blockedCard.dataset.cutNumber || '?'}集${blockedCard.querySelector('.video-generate').dataset.creditReason}`;
    else delete button.dataset.creditReason;
    if(costs.some(cost=>cost===CreditGate.QUOTE))return CreditGate.QUOTE;
    if (costs.length && costs.every(cost => cost === CreditGate.FREE)) return CreditGate.FREE;
    return costs.length && costs.every(cost => cost === CreditGate.FREE || (Number.isFinite(cost) && cost > 0)) ? costs.reduce((a,b) => a+(b === CreditGate.FREE ? 0 : b),0) : null;
  }
  function accessRemainingText(expiresAt) { const seconds = Math.max(0, Number(expiresAt || 0) - Date.now() / 1000); if (!seconds) return "已到期"; const days = Math.floor(seconds / 86400); if (days) return `剩余${days}天`; const hours = Math.floor(seconds / 3600); return hours ? `剩余${hours}小时` : `剩余${Math.max(1, Math.ceil(seconds / 60))}分钟`; }
  async function loadFeatureAccess() {
    const node = $("visualFeatureState");
    try {
      const response = await fetch("/api/license/status", {cache:"no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "授权读取失败");
      const info = data.featureStatus?.workflow || {};
      state.featureAllowed = Boolean(data.licensed && Array.isArray(data.features) && data.features.includes("workflow"));
      if (node) {
        node.textContent = !data.licensed ? "请先激活卡密" : info.state === "disabled" ? "短剧工作流已被管理员禁用" : state.featureAllowed ? "短剧工作流已解锁 · 卡密权益" : "短剧工作流未开通 · 请联系管理员";
        node.classList.toggle("locked", !state.featureAllowed);
      }
    } catch (_) { if (node) { node.textContent = "授权读取失败，请稍后重试"; node.classList.add("locked"); } }
  }
  window.addEventListener("message", event => { if (event.origin === window.location.origin && event.data?.type === "workflow-feature-updated") { loadFeatureAccess(); refreshPoints(); } });
  function profilePayload() { const profile = { provider: $("visualImageProvider").value, baseUrl: $("visualImageBaseUrl").value.trim(), apiKey: "", imageProvider: $("visualImageProvider").value, imageBaseUrl: $("visualImageBaseUrl").value.trim(), imageApiKey: $("visualImageApiKey").value.trim(), videoProvider: $("visualVideoProvider").value, videoBaseUrl: $("visualVideoBaseUrl").value.trim(), videoApiKey: $("visualVideoApiKey").value.trim(), pointsPerCny: 1 }; profileFields.forEach(id => profile[id] = id.includes("Price") ? Number($(id).value) || 0 : $(id).value.trim()); return profile; }
  async function saveProfile() { try { const data = await post("/api/visual/profile/save", { profile: profilePayload() }); state.profile = data.profile || {}; $("visualImageApiKey").value = ""; $("visualVideoApiKey").value = ""; updateTierLabels(state.profile); refreshReferenceLimits(); if ($("visualProfileStatus")) $("visualProfileStatus").textContent = ` 已保存：图片 ${state.profile.imageApiKeyMasked || "未配置"}；视频 ${state.profile.videoApiKeyMasked || "未配置"}`; toast("图片与视频模型配置已分别保存到本机后端。"); } catch (error) { toast(error.message, true); } }
  async function discoverModels(media) { const prefix = media === "image" ? "Image" : "Video"; const button = document.querySelector(`.discover-visual-models[data-media="${media}"]`); const status = $(`${media}ModelDiscoveryStatus`); try { button.disabled = true; button.textContent = "正在检测…"; status.textContent = "正在验证地址和密钥，并请求中转站模型列表…"; const data = await post("/api/visual/models", { media, provider: $(`visual${prefix}Provider`).value, baseUrl: $(`visual${prefix}BaseUrl`).value.trim(), apiKey: $(`visual${prefix}ApiKey`).value.trim() }); const models = data.models || []; $(`${media}ModelOptions`).innerHTML = models.map(id => `<option value="${esc(id)}"></option>`).join(""); if (data.preset && models.length) { const fieldPrefix = media === "image" ? "imageModel" : "videoModel"; [`${fieldPrefix}Economy`,`${fieldPrefix}Standard`,`${fieldPrefix}Premium`].forEach(id => { if (!models.includes($(id).value.trim())) $(id).value = models[0]; }); } status.textContent = data.message || `接口已接通，读取到 ${models.length} 个候选 ID；现在可点击下方模型 ID 输入框选择。`; toast(`${media === "image" ? "图片" : "视频"}接口已接通，读取到 ${models.length} 个模型 ID。`); } catch (error) { status.textContent = error.message; toast(error.message, true); } finally { button.disabled = false; button.textContent = media === "image" ? "检测图片接口并读取模型 ID" : "检测视频接口并读取模型 ID"; } }
  async function sourceFromStorage(force = false) {
    try {
      if(!force&&!$('visualSource').value.trim()&&!localStorage.getItem('dramaVisualProjectId')){
        const draft=JSON.parse(localStorage.getItem(sourceDraftKey('unassigned'))||'null');
        if(typeof draft?.sourceText==='string'&&draft.sourceText.trim()){
          $('visualSource').value=draft.sourceText;state.sourceReplacementId=draft.replacementId||'';
          state.sourceUnassignedOwned269=true;
          state.sourceBaseline='';state.sourceProjectId='';sourceReadEpoch++;updateSourceSaveState();return;
        }
      }
      const item=JSON.parse(localStorage.getItem('dramaVisualSource') || '{}');
      if(!item.structure){if(force)toast('改写工作台还没有可引用的剧本。',true);return;}
      if(!force && $('visualSource').value.trim())return;
      if(force && !await confirmDiscardSource('引用当前剧本'))return;
      replaceSourceInput(item.structure,{...item,origin:'internal'});
      $('visualSourceHint').textContent=`已引用剧本：${item.projectName || '未命名短剧'}。可先免费保存原稿；资产识别与分镜制作分别确认、分别计费。`;
    }catch(error){if(force)toast(error.message,true);}finally{updateSourceSaveState();}
  }
  function assetPrompt(kind) { if (kind === "people") return $("visualRoleLayout").value; if (kind === "scenes") return $("visualSceneLayout").value; return "product_views"; }
  function imageSizeForRatio(ratio) { const quality = $("visualImageResolution").value || "2K"; const sizes = quality === "1K" ? { "1:1":"1024x1024", "16:9":"1920x1088", "9:16":"1088x1920", "4:3":"1280x960", "3:4":"960x1280" } : { "1:1":"2048x2048", "16:9":"2048x1152", "9:16":"1152x2048", "4:3":"2560x1920", "3:4":"1920x2560" }; return sizes[ratio] || sizes["1:1"]; }
  function assetRatio(kind) {
    if (kind === "people") return { feature_three:"16:9", four_views:"3:4", concept:"16:9" }[$("visualRoleLayout").value] || "16:9";
    if (kind === "scenes") return { concept:"16:9", asset_board:"16:9", four_views:"16:9" }[$("visualSceneLayout").value] || "16:9";
    return "1:1";
  }
  function assetSize(kind) { return imageSizeForRatio(assetRatio(kind)); }
  const layoutPickerDefinitions = {
    role: {
      feature_three: { label:"人物特色三视图", ratio:"16:9", description:"左侧正脸大特写，右侧正面、侧面、背面完整全身", thumb:"/static/layout_refs/people-feature.webp" },
      four_views: { label:"人物四视图", ratio:"3:4", description:"2×2：正脸特写、侧脸特写、正面全身、背面全身", thumb:"/static/layout_refs/people-four.webp" },
      concept: { label:"人物概念图", ratio:"16:9", description:"面部、三向上身、细节色板、身高尺与完整全身设定", thumb:"/static/layout_refs/people-concept.webp" },
    },
    scene: {
      concept: { label:"场景概念图", ratio:"16:9", description:"四向结构、主视觉、三档灯光、场景色板与资产细节", thumb:"/static/layout_refs/scene-concept.webp" },
      asset_board: { label:"场景资产图板", ratio:"16:9", description:"左侧完整主场景，右侧角度、细节、局部三张参考图", thumb:"/static/layout_refs/scene-board.webp" },
      four_views: { label:"场景四视图", ratio:"16:9", description:"同一空间的主全景、关键区域、入口/反向与另一侧功能区", thumb:"/static/layout_refs/scene-four.webp" },
    },
  };
  function installRoleLayoutOptions() {
    [["sourceRoleLayout", "人物特色三视图·16:9"], ["visualRoleLayout", "人物特色三视图·16:9"]].forEach(([id, label]) => {
      const select = $(id);
      if (!select) return;
      const feature = select.querySelector('option[value="feature_three"]');
      const fourViews = select.querySelector('option[value="four_views"]');
      const concept = select.querySelector('option[value="concept"]');
      if (feature) feature.textContent = label;
      if (fourViews) { fourViews.disabled = false; fourViews.textContent = "人物四视图·3:4"; }
      if (concept) concept.textContent = "人物概念图·16:9";
    });
    ["sourceSceneLayout", "visualSceneLayout"].forEach(id => {
      const option = $(id)?.querySelector('option[value="asset_board"]');
      if (option) option.textContent = "场景资产图板·16:9";
    });
  }
  function installLayoutPicker(selectId, type) {
    const select = $(selectId);
    if (!select || select.dataset.layoutPickerInstalled) return;
    select.dataset.layoutPickerInstalled = "1";
    select.querySelector('option[value="single"]')?.remove();
    select.classList.add("layout-native-select");
    const definitions = layoutPickerDefinitions[type];
    const values = [...select.options].map(option => option.value).filter(value => definitions[value]);
    const picker = document.createElement("span");
    picker.className = "layout-picker";
    picker.innerHTML = `<button type="button" class="layout-picker-button" aria-expanded="false"></button><span class="layout-picker-menu"><span class="layout-picker-preview"><img class="layout-preview-image" alt=""><span class="layout-preview-art"></span><b></b><small></small></span><span class="layout-picker-options">${values.map(value => { const item = definitions[value]; return `<button type="button" class="layout-picker-option" data-value="${esc(value)}"><span><b>${esc(item.label)}</b><small>${esc(item.description)}</small></span><em>${window.AspectRatio?.markup(item.ratio)||esc(item.ratio)}</em></button>`; }).join("")}</span></span>`;
    select.insertAdjacentElement("afterend", picker);
    const button = picker.querySelector(".layout-picker-button");
    const menu = picker.querySelector(".layout-picker-menu");
    const previewArt = picker.querySelector(".layout-preview-art");
    const previewImage = picker.querySelector(".layout-preview-image");
    const previewTitle = picker.querySelector(".layout-picker-preview b");
    const previewDescription = picker.querySelector(".layout-picker-preview small");
    const setPreview = value => { const item = definitions[value] || definitions[values[0]]; previewArt.className = `layout-preview-art ${type}-${value}`; previewArt.innerHTML = "<i></i>".repeat(type === "role" && value === "concept" ? 10 : 4); previewImage.src = item.thumb || ""; previewImage.alt = `${item.label}参考图`; previewImage.style.display = item.thumb ? "block" : "none"; previewArt.style.display = item.thumb ? "none" : "grid"; previewTitle.textContent = `${item.label} · ${window.AspectRatio?.label(item.ratio)||item.ratio}`; previewDescription.textContent = item.description; };
    const sync = () => { if (!definitions[select.value]) select.value = values[0]; const item = definitions[select.value]; button.innerHTML = `${esc(item.label)} · ${esc(window.AspectRatio?.label(item.ratio)||item.ratio)}`; picker.querySelectorAll(".layout-picker-option").forEach(option => option.classList.toggle("selected", option.dataset.value === select.value)); setPreview(select.value); };
    select._layoutPickerSync = sync;
    button.addEventListener("click", event => { event.preventDefault(); const open = !picker.classList.contains("open"); document.querySelectorAll(".layout-picker.open").forEach(node => node.classList.remove("open")); picker.classList.toggle("open", open); button.setAttribute("aria-expanded", open ? "true" : "false"); });
    picker.querySelectorAll(".layout-picker-option").forEach(option => { option.addEventListener("mouseenter", () => setPreview(option.dataset.value)); option.addEventListener("focus", () => setPreview(option.dataset.value)); option.addEventListener("click", event => { event.preventDefault(); select.value = option.dataset.value; select.dispatchEvent(new Event("change", { bubbles:true })); picker.classList.remove("open"); button.setAttribute("aria-expanded", "false"); }); });
    select.addEventListener("change", sync);
    sync();
  }
  function installLayoutPickers() {
    installLayoutPicker("sourceRoleLayout", "role");
    installLayoutPicker("visualRoleLayout", "role");
    installLayoutPicker("sourceSceneLayout", "scene");
    installLayoutPicker("visualSceneLayout", "scene");
    document.addEventListener("click", event => { if (!event.target.closest(".layout-picker")) document.querySelectorAll(".layout-picker.open").forEach(node => node.classList.remove("open")); });
  }
  function syncSourcePresets() { $("visualStyle").value = $("sourceVisualStyle").value; $("visualRoleLayout").value = $("sourceRoleLayout").value; $("visualSceneLayout").value = $("sourceSceneLayout").value; $("visualRoleLayout")._layoutPickerSync?.(); $("visualSceneLayout")._layoutPickerSync?.(); }
  function selectedModel(media) { return $(media === "image" ? "visualImageTier" : "visualVideoTier").value || ""; }
  function selectedTier(media) { return $(media === "image" ? "visualImageTier" : "visualVideoTier").selectedOptions[0]?.dataset.tier || "economy"; }
  function syncImageResolutionOptions(select, model, preferred = "") {
    if (!select) return;
    const values = ModelPresentation.imageResolutionOptions(state.profile || {}, model);
    const normalizedPreferred = ModelPresentation.imageResolutionForModel(state.profile || {}, model, preferred || select.value);
    const chosen = values.includes(normalizedPreferred) ? normalizedPreferred : values[0] || "1k";
    select.innerHTML = values.map(value => {
      const optionValue = value === "default" ? "default" : value.toUpperCase();
      return `<option value="${esc(optionValue)}" ${value === chosen ? "selected" : ""}>${esc(ModelPresentation.imageResolutionLabel(value))}</option>`;
    }).join("");
    select.value = chosen === "default" ? "default" : chosen.toUpperCase();
  }
  function videoCapability(model = selectedModel("video")) { return state.profile.modelCapabilities?.[String(model).toLowerCase()] || (state.profile.visualModels || []).find(row => row.media === 'video' && String(row.model).toLowerCase() === String(model).toLowerCase()) || {}; }
  function videoCapabilityIssue(model, duration, resolution, ratio = null) {
    const ability = videoCapability(model), durationIssue = ModelPresentation.videoDurationIssue(state.profile, model, duration);
    if (durationIssue) return durationIssue;
    const resolutions = ability.supportedResolutions || [];
    if (resolutions.length && !resolutions.map(value => String(value).toLowerCase()).includes(String(resolution).toLowerCase())) return `${model}不支持${String(resolution).toUpperCase()}分辨率`;
    if (ratio != null && !ModelPresentation.videoAspectRatios(state.profile,model).includes(ratio)) return `所选模型不支持原设定${ratio}画面方向，请明确调整；不会自动更换比例。`;
    return "";
  }
  function configuredVideoDuration(select, fallback = 15) { return Number(select?.dataset.configuredDuration || select?.value || fallback); }
  function syncVideoRatioOptions(select, model) {
    if (!select) return;
    const current = select.value, allowed = ModelPresentation.videoAspectRatios(state.profile,model);
    if (!select.querySelector('option[value="21:9"]')) select.add(new Option('宽幅 21:9','21:9'));
    if (current && ![...select.options].some(option=>option.value===current)) select.add(new Option(`${current}（原设定）`,current));
    for (const option of select.options) option.disabled = !allowed.includes(option.value);
    select.value = current;
  }
  function syncDurationControl(select, model, preferred = configuredVideoDuration(select)) {
    if (!select) return;
    const item = state.project?.episodes?.find(value => value.id === select.closest('.visual-episode-card')?.dataset.episode);
    const actual = adaptiveEpisodeDuration(item);
    const output = adaptiveGenerationDuration(item);
    const info = ModelPresentation.videoDurationInfo(state.profile, model), previous = output ?? Number(preferred);
    const issue = ModelPresentation.videoDurationIssue(state.profile, model, previous);
    const values = actual != null ? [output] : info.fixed ? [info.fixed] : [...new Set([...publishedVideoDurations(model), previous])].sort((a,b) => a-b);
    select.dataset.configuredDuration = String(previous);
    select.dataset.fixedDuration = info.fixed ? String(info.fixed) : '';
    select.dataset.adaptiveDuration = actual != null ? String(actual) : '';
    select.innerHTML = values.map(value => `<option value="${value}">${value}秒${!info.fixed && ModelPresentation.videoDurationIssue(state.profile,model,value) ? '（原设定，不支持）' : ''}</option>`).join('');
    select.value = String(output ?? info.fixed ?? previous);
    select.disabled = actual != null || Boolean(info.fixed);
    let note = select.parentElement.querySelector('.video-duration-notice');
    if (!note) { note = document.createElement('small'); note.className = 'video-duration-notice'; note.setAttribute('aria-live','polite'); select.insertAdjacentElement('afterend',note); }
    note.textContent = actual != null ? `${actual !== output ? `本卡剧情实际${actual}秒，生成${output}秒；原镜头时长不变，末镜既有落幅保持${output-actual}秒。` : `本卡按剧情实际${actual}秒生成，时长已锁定，不拉长凑满。`}${issue ? `${issue} 请更换支持${output}秒的模型。` : ![15,30].includes(output) ? '仅可使用支持此秒数的按秒计费模型。' : ''}` : issue || (info.fixed ? `该模型固定生成${info.fixed}秒。` : '');
    note.hidden = !note.textContent;
    let apply = select.parentElement.querySelector('.video-duration-adopt');
    if (!apply) {
      apply = document.createElement('button'); apply.type = 'button'; apply.className = 'secondary-btn video-duration-adopt';
      apply.addEventListener('click', () => { select.dataset.configuredDuration = String(infoForControl().fixed); select.value = select.dataset.configuredDuration; select.dispatchEvent(new Event('change',{bubbles:true})); syncDurationControl(select,modelForControl(),Number(select.value)); updateEstimate(); });
      select.insertAdjacentElement('afterend',apply);
    }
    function modelForControl() { return select.closest('.visual-episode-card')?.querySelector('.episode-video-model')?.value || (select.id === 'wizardVideoDuration' ? $('wizardVideoTier').value : selectedModel('video')); }
    function infoForControl() { return ModelPresentation.videoDurationInfo(state.profile,modelForControl()); }
    apply.textContent = '使用模型固定时长'; apply.hidden = actual != null || !(issue && info.fixed);
    apply.disabled = Boolean(select.closest('.visual-episode-draft'));
  }
  function syncResolutionOptions(select, model, preferred = "") {
    const ability = videoCapability(model);
    const configured = (ability.supportedResolutions || []).map(value => String(value).trim().toLowerCase()).filter(Boolean);
    const resolutions = [...new Set(configured.length ? configured : ["480p","720p","1080p"])];
    const oldValue = String(preferred || select.value || "").toLowerCase();
    select.innerHTML = resolutions.map(value => `<option value="${esc(value)}">${esc(value.toUpperCase())}</option>`).join("");
    select.value = resolutions.includes(oldValue) ? oldValue : resolutions[0];
  }
  function syncVideoCapabilities() {
    const model = selectedModel("video");
    const durationSelect = $("visualVideoDuration"), resolutionSelect = $("visualResolution");
    const oldDuration = configuredVideoDuration(durationSelect), oldResolution = resolutionSelect.value;
    syncDurationControl(durationSelect,model,oldDuration);
    syncVideoRatioOptions($('visualVideoRatio'),model);
    syncResolutionOptions(resolutionSelect, model, oldResolution);
    if (state.project) updateEstimate();
  }
  function projectSettings() { const style = $("visualStyle").value; return { creationMode: state.project?.settings?.creationMode || "asset_first", continuity: false, style, styleSpec: state.styles.find(item => item.id === style) || state.project?.settings?.styleSpec, roleLayout: $("visualRoleLayout").value, sceneLayout: $("visualSceneLayout").value, eyeMask: $("visualEyeMask").checked, eyeMaskMode: $("visualEyeMaskMode")?.value || "white", imageRouteType: $("visualImageRouteType").value, imageTier: selectedTier("image"), imageModel: selectedModel("image"), imageResolution: $("visualImageResolution").value, videoRouteType: $("visualVideoRouteType").value, videoTier: selectedTier("video"), videoModel: selectedModel("video"), videoDuration: configuredVideoDuration($("visualVideoDuration")), resolution: $("visualResolution").value, ratio: $("visualVideoRatio").value }; }
  function imageModelOptions(selected = "", explicitRoute = null) {
    const chosen=selected || (explicitRoute ? '' : selectedModel('image'));
    const route=activeRoute234('image',explicitRoute || modelRoute234('image',chosen,$('visualImageRouteType')?.value));
    const catalog=ModelPresentation.routeModels(state.profile,'image',route,state.project?.settings || {});
    const missing=chosen&&!catalog.some(item=>item.id===chosen)?`<option value="${esc(chosen)}" selected disabled>当前模型未发布（请重新选择）</option>`:'';
    return missing+(catalog.length?catalog.map(value=>`<option value="${esc(value.id)}" data-tier="${esc(value.tier)}" ${value.id===chosen?'selected':''}>${esc(value.name)}</option>`).join(''):'<option value="">当前线路暂无已发布图片模型</option>');
  }
  function imageModelQuoteText(model) { if(ModelPresentation.isLiveQuote(state.profile,'image',model||selectedModel('image')))return '实时核价 · 按本次输入取得报价后确认生成';const quote = ModelPresentation.imageQuote(state.profile, model || selectedModel("image"), $("visualImageResolution").value, 1); return quote ? `预计${quote.points.toFixed(2)}积分 / ¥${quote.cost.toFixed(2)} · 成功后扣除` : "当前模型/清晰度尚未配置价格"; }
  function restoreProjectSettings(project) {
    const value = project.settings || {};
    if (value.styleSpec && !state.styles.some(item => item.id === value.styleSpec.id)) { state.styles.push(value.styleSpec); syncStyleOptions(); }
    ["image", "video"].forEach(media => populateModelSelect(media === "image" ? "visualImageTier" : "visualVideoTier", media, value, true));
    const defaults = { visualStyle: project.style || value.style || "live_action", visualRoleLayout: value.roleLayout || "feature_three", visualSceneLayout: value.sceneLayout || "concept", visualImageTier: value.imageTier || "economy", visualImageResolution: value.imageResolution || "2K", visualVideoTier: value.videoTier || "economy", visualVideoDuration: value.videoDuration || 15, visualResolution: value.resolution || "480p", visualVideoRatio: value.ratio || "9:16", visualEyeMaskMode: value.eyeMaskMode || "white" };
    Object.entries(defaults).forEach(([id, setting]) => { if ($(id)) $(id).value = String(setting); });
    $("visualVideoDuration").dataset.configuredDuration = String(value.videoDuration || 15);
    ["image", "video"].forEach(media => {
      const select = $(media === "image" ? "visualImageTier" : "visualVideoTier");
      const catalog = ModelPresentation.catalog(state.profile, media, value);
      const persisted = value[`${media}Model`];
      const legacyDefault = media === "image" ? preferredModelId(media, catalog) : state.profile[`${media}Model${ModelPresentation.suffix(value[`${media}Tier`] || "economy")}`];
      const route=$(media==='image'?'visualImageRouteType':'visualVideoRouteType').value;
      const routed=catalog.filter(row=>row.routeType===route);
      select.value = persisted || (routed.some(row=>row.id===legacyDefault)?legacyDefault:select.value || routed[0]?.id || '');
    });
    syncImageResolutionOptions($("visualImageResolution"), selectedModel("image"), value.imageResolution || $("visualImageResolution").value);
    syncVideoCapabilities();
    $("visualEyeMask").checked = Boolean(value.eyeMask);
    $("sourceVisualStyle").value = $("visualStyle").value; $("sourceRoleLayout").value = $("visualRoleLayout").value; $("sourceSceneLayout").value = $("visualSceneLayout").value;
    ["sourceRoleLayout","visualRoleLayout","sourceSceneLayout","visualSceneLayout"].forEach(id => $(id)?._layoutPickerSync?.());
    syncStyleButtons();
  }
  function assetPreviewState(item = {}, job = null) {
    const recovered = job?.paused && (item.status === "failed" || (item.status === "done" && item.imageFile && item.imageFile !== job.previousFile));
    if (job?.active) {
      const phase = job.phase || "waiting";
      const titles = {queued:"排队等待中",submitting:"正在提交参考图",waiting:"正在生成参考图",saving:"正在保存图片",uploading:"正在上传图片"};
      const elapsed = String(job.message || "").match(/已等待[^·（\n]+/);
      return {phase, busy:true, title:titles[phase] || titles.waiting, message:elapsed?.[0]?.trim() || "请稍候…", visible:true};
    }
    if (job?.paused && !recovered) return {phase:"paused",busy:false,title:"等待状态核对",message:job.message || "原任务状态尚未确认，请稍后刷新项目核对。",visible:true};
    if(item.status==='needs_review')return {phase:'paused',busy:false,title:'原图片任务待核对',message:item.error || '请点击“核对原图片任务”查询原单，避免重复提交。',visible:true};
    if ((!recovered && job?.error) || item.status === "failed") return {phase:"error",busy:false,title:"参考图生成失败",message:job?.error ? job.message : item.error || "请检查设置后重新生成。",visible:true};
    if (item.status === "running") return {phase:"paused",busy:false,title:"等待状态核对",message:"原任务仍在处理，请稍后刷新项目核对；请勿重复提交。",visible:true};
    return {phase:item.imageFile ? "done" : "idle",busy:false,title:"",message:job?.message || (item.imageFile ? "图片已保存" : "尚未提交，点击生成参考图"),visible:false};
  }
  function assetPreviewMarkup(presentation) {
    return `<div class="asset-preview-status" data-state="${esc(presentation.phase)}" data-model-activity="${presentation.busy?'pending':presentation.phase==='error'?'error':presentation.phase==='done'?'success':''}" ${presentation.visible ? "" : "hidden"} role="status" aria-live="polite"><i class="asset-preview-spinner" aria-hidden="true" ${presentation.busy ? "" : "hidden"}></i><b class="asset-preview-title">${esc(presentation.title)}</b><span class="visual-task-status asset-preview-message${presentation.busy ? " is-generating" : ""}">${esc(presentation.message)}</span></div>`;
  }
  function assetResetExpected240(item,job){return String((job?.active||job?.paused?job.generationId:'')||item?.generationId||item?.imageGeneration?.requestId||'');}
  function syncAssetReset240(node,item,job){
    const body=node?.querySelector('.visual-card-body');if(!body)return;
    const presentation=assetPreviewState(item,job),available=presentation.busy||['paused','error'].includes(presentation.phase);
    let button=node.querySelector('.asset-reset240');
    if(available&&!button){button=document.createElement('button');button.type='button';button.className='ghost-btn asset-reset240';button.textContent='重置状态';body.append(button);}
    if(button){button.hidden=!available;button.disabled=Boolean(job?.active&&!assetResetExpected240(item,job));button.title=button.disabled?'正在确认原任务编号，请稍后重试。':'只解除本机等待，不取消上游任务、不退款；原订单和图片历史保留。重新生成会建立新任务。';}
    let history=node.querySelector('.asset-original-orders240');
    const orders=Array.isArray(item.imageGenerationHistory240)?item.imageGenerationHistory240:[];
    if(orders.length){
      if(!history){history=document.createElement('details');history.className='asset-original-orders240';body.append(history);}
      const markup=`<summary>原图片订单（${orders.length}）</summary><p>重置仅解除本机等待；原任务可继续查询，结果保存在图片历史中。</p>${orders.slice().reverse().map(row=>`<p><span>${esc(row.modelName||row.model||'原图片任务')} · ${esc(row.status||'待核对')}</span> <button type="button" class="ghost-btn asset-observe" data-request-id="${esc(row.requestId||'')}">核对原订单（免费）</button></p>`).join('')}`;
      if(history.innerHTML!==markup)history.innerHTML=markup;
    }else history?.remove();
  }
  function setAssetPreviewStatus(node, presentation) {
    const preview = node?.querySelector(".visual-card-preview"), status = node?.querySelector(".asset-preview-status");
    if (!preview || !status) return;
    if(status.dataset.state!==presentation.phase)status.dataset.state = presentation.phase;
    window.ModelActivity?.set(status,{state:presentation.busy?"pending":presentation.phase==="error"?"error":presentation.phase==="done"?"success":"",preserve:true});
    if(status.hidden===presentation.visible)status.hidden = !presentation.visible;
    if(preview.getAttribute('aria-busy')!==String(presentation.busy))preview.setAttribute("aria-busy", String(presentation.busy));
    const spinner=status.querySelector('.asset-preview-spinner'),title=status.querySelector('.asset-preview-title');
    if(spinner.hidden===presentation.busy)spinner.hidden = !presentation.busy;
    if(title.textContent!==presentation.title)title.textContent = presentation.title;
    const message = status.querySelector(".visual-task-status");
    if(message.textContent!==presentation.message)message.textContent = presentation.message;
    message.classList.toggle("is-generating", presentation.busy);
    window.CompactAssets205?.updateCard(node, presentation);
  }
  const assetCardNodes231=new Map(),assetProgressPaint231=new Map();let assetPaintTimer231=0;
  const assetNodeKey231=(projectId,kind,id)=>JSON.stringify([projectId,kind,id]);
  function currentAssetNode231(projectId,kind,id,preferred){
    if(state.project?.id!==projectId)return null;
    const key=assetNodeKey231(projectId,kind,id),stored=assetCardNodes231.get(key);
    const owns=node=>node?.isConnected&&node.dataset.kind===kind&&node.dataset.id===id&&(!node.dataset.projectId||node.dataset.projectId===projectId);
    if(owns(stored))return stored;
    if(owns(preferred)){assetCardNodes231.set(key,preferred);return preferred;}
    const node=[...document.querySelectorAll('.visual-card')].find(owns);
    if(node)assetCardNodes231.set(key,node);else assetCardNodes231.delete(key);
    return node||null;
  }
  function paintAssetJob231(projectId,kind,id,preferred){
    if(state.project?.id!==projectId)return;
    const job=state.activeAssetJobs.get(`${kind}:${id}`),item=state.project.assets?.[kind]?.find(value=>value.id===id);
    const node=currentAssetNode231(projectId,kind,id,preferred);if(!node||!job||!item)return;
    syncAssetReset240(node,item,job);
    const presentation=assetPreviewState(item,job),signature=JSON.stringify([presentation.phase,presentation.busy,presentation.visible,presentation.title,presentation.message,item.imageFile||'']);
    if(node.dataset.assetPaint231===signature)return;
    node.dataset.assetPaint231=signature;setAssetPreviewStatus(node,presentation);
    const button=node.querySelector('.asset-generate');
    if(button){
      const disabled=presentation.busy||presentation.phase==='paused',intent=String(disabled);
      // CreditGate owns the native disabled value. Update its base intent only
      // on transitions, never once per unchanged progress receipt.
      if(button.dataset.assetBusy231!==intent){button.dataset.assetBusy231=intent;button.disabled=disabled;}
      if(button.dataset.busy!=='0')button.dataset.busy='0';
      const text=presentation.busy?'生成中…':presentation.phase==='paused'?'待核对':item.imageFile?'重新生成':'生成参考图';
      if(button.textContent!==text)button.textContent=text;
      window.ModelActivity?.set(button,{state:presentation.busy?'pending':'',preserve:true});
    }
  }
  function queueAssetPaint231(projectId,kind,id,node,immediate){
    const key=assetNodeKey231(projectId,kind,id);
    if(immediate){assetProgressPaint231.delete(key);paintAssetJob231(projectId,kind,id,node);return;}
    assetProgressPaint231.set(key,{projectId,kind,id,node});
    if(assetPaintTimer231)return;
    assetPaintTimer231=setTimeout(()=>{assetPaintTimer231=0;const paints=[...assetProgressPaint231.values()];assetProgressPaint231.clear();for(const row of paints)paintAssetJob231(row.projectId,row.kind,row.id,row.node);},60);
  }
  function updateAssetJob(node, job) {
    const {kind,id} = node.dataset, key = `${kind}:${id}`;
    const projectId=job.projectId || node.dataset.projectId || state.project?.id;
    const jobs=state.project?.id===projectId?state.activeAssetJobs:workFor(projectId).activeAssetJobs;
    const previous=jobs.get(key);
    if(previous?.active && previous.token && job.token && previous.token!==job.token)return;
    job={...job,projectId};
    jobs.set(key, job);
    if(projectId!==state.project?.id)return;
    queueAssetPaint231(projectId,kind,id,node,!job.active||!previous||previous.token!==job.token||job.phase==='submitting'&&previous.phase!=='submitting');
  }
  const characterVariantSelection=new Map();
  const characterSpeechDrafts251=new Map();
  const characterSpeechSaves251=new Set();
  const speechFields251={language:'.asset-speech-language',accent:'.asset-speech-accent',timbre:'.asset-speech-timbre'};
  function speechOwnerKey251(item,project=state.project){return JSON.stringify([project?.id,item?.parentCharacterId||item?.id]);}
  function characterRoots(project=state.project){
    const people=project?.assets?.people||[],ids=new Set(people.map(item=>item.id));
    return people.filter(item=>!item.parentCharacterId||!ids.has(item.parentCharacterId));
  }
  function storedCharacterSpeech251(item,project=state.project) {
    const root = item.parentCharacterId && project.assets.people.find(row => row.id === item.parentCharacterId);
    const profile = (root || item).speechProfile || {};
    const language = profile.language || "中文";
    return {language, accent: profile.accent || (language === "中文" ? "普通话" : ""), timbre: profile.timbre || ""};
  }
  function characterSpeech248(item) { return characterSpeechDrafts251.get(speechOwnerKey251(item))?.values || storedCharacterSpeech251(item); }
  function captureCharacterSpeech251(node) {
    if(node.dataset.kind!=='people'||node.dataset.projectId!==state.project?.id)return;
    const item=state.project.assets.people.find(row=>row.id===node.dataset.id);if(!item)return;
    const values=Object.fromEntries(Object.entries(speechFields251).map(([key,selector])=>[key,node.querySelector(selector)?.value.trim()||'']));
    const key=speechOwnerKey251(item),old=characterSpeechDrafts251.get(key),baseline=storedCharacterSpeech251(item);
    if(JSON.stringify(values)===JSON.stringify(old?.values||baseline))return;
    characterSpeechDrafts251.set(key,{values,revision:(old?.revision||0)+1});
  }
  function characterSpeechSummary248(profile) {
    return [profile.language, profile.accent, profile.timbre].filter(Boolean).join(" · ");
  }
  const speechChoices249 = {
    language: [
      ["常用语言", ["中文", "英语", "日语", "韩语", "俄语", "法语", "德语", "西班牙语"]],
      ["其他语言", ["葡萄牙语", "意大利语", "阿拉伯语", "印地语", "泰语", "越南语", "印尼语", "马来语", "菲律宾语", "土耳其语", "荷兰语", "波兰语", "乌克兰语", "瑞典语", "希腊语"]],
    ],
    accent: [
      ["通用", ["普通话", "自然口音"]],
      ["带地方口音的普通话", ["川普", "东北口音普通话", "天津口音普通话", "北京口音普通话", "上海口音普通话", "广东口音普通话", "湖南口音普通话", "陕西口音普通话", "台湾口音普通话"]],
      ["中文地方方言", ["四川话", "粤语", "天津话", "东北话", "北京话", "上海话", "闽南语", "客家话", "潮汕话", "长沙话", "陕西话", "苏州话", "武汉话", "重庆话"]],
      ["外语口音", ["美式英语", "英式英语", "澳式英语", "加拿大英语", "印度英语", "日本关西口音", "巴西葡萄牙语口音", "欧洲葡萄牙语口音"]],
    ],
    timbre: [
      ["音色预设", ["低沉浑厚", "清亮年轻", "温柔细腻", "成熟稳重", "沙哑沧桑", "童声活泼"]],
    ],
  };
  function speechControl249(field, label, blankLabel, maxLength) {
    const groups = speechChoices249[field].map(([group, choices]) =>
      `<optgroup label="${group}">${choices.map(choice => `<option>${choice}</option>`).join("")}</optgroup>`
    ).join("");
    return `<div class="asset-speech-control249">
      <label class="field"><span>${label}</span><select class="asset-speech-picker249">${blankLabel ? `<option value="">${blankLabel}</option>` : ""}${groups}<option value="__custom__">自定义…</option></select></label>
      <label class="field hidden"><span>自定义${label}</span><input class="asset-speech-custom249" maxlength="${maxLength}"></label>
      <input class="asset-speech-${field}" type="hidden">
    </div>`;
  }
  function setSpeechValue249(control, value) {
    const group = control.closest(".asset-speech-control249");
    const picker = group.querySelector(".asset-speech-picker249");
    const custom = group.querySelector(".asset-speech-custom249");
    const preset = value !== "__custom__" && [...picker.options].some(option => option.value === value);
    control.value = value;
    picker.value = preset ? value : "__custom__";
    custom.value = preset ? "" : value;
    custom.closest("label").classList.toggle("hidden", preset);
  }
  function bindSpeechControl249(editor, field, value) {
    const control = editor.querySelector(`.asset-speech-${field}`);
    const group = control.closest(".asset-speech-control249");
    const picker = group.querySelector(".asset-speech-picker249");
    const custom = group.querySelector(".asset-speech-custom249");
    setSpeechValue249(control, value);
    picker.addEventListener("change", () => {
      const customSelected = picker.value === "__custom__";
      custom.closest("label").classList.toggle("hidden", !customSelected);
      control.value = customSelected ? custom.value : picker.value;
      if (customSelected) custom.focus();
      control.dispatchEvent(new Event("change"));
    });
    custom.addEventListener("input", () => { control.value = custom.value; });
    custom.addEventListener("change", () => { control.dispatchEvent(new Event("change")); });
    return control;
  }
  function characterCard(root){
    const people=state.project?.assets?.people||[],variants=[root,...people.filter(item=>item.parentCharacterId===root.id)];
    const key=`${state.project.id}:${root.id}`,selected=variants.find(item=>item.id===characterVariantSelection.get(key))||root;
    const html=card(selected,'people');if(variants.length<2)return html;
    const selector=`<label class="asset-variant-control198"><span>人物造型</span><select class="asset-variant-select198" data-character-id="${esc(root.id)}" aria-label="${esc(root.name)}的造型">${variants.map(item=>`<option value="${esc(item.id)}" ${item.id===selected.id?'selected':''}>${esc(item.id===root.id?'人物基础形象':item.variant||item.name)}</option>`).join('')}</select></label>`;
    const selectedLabel=window.AssetPresentation207?.displayName(selected,people)||selected.name||'参考图';
    const rootLabel=window.AssetPresentation207?.displayName(root,people)||root.name;
    return html.replace(`<b>${esc(selectedLabel)}</b>`,`<b>${esc(rootLabel)}</b>${selector}`);
  }
  $('visualPeople').addEventListener('change',event=>{
    const selector=event.target.closest('.asset-variant-select198');if(!selector)return;
    captureAssetDrafts();characterVariantSelection.set(`${state.project.id}:${selector.dataset.characterId}`,selector.value);
    render(state.project);
  });
  ['input','change'].forEach(type=>$('visualPeople').addEventListener(type,event=>{
    const node=event.target.closest('.visual-card');if(node&&event.target.closest('.asset-speech-profile'))captureCharacterSpeech251(node);
  }));
  function card(item, kind) { const name = item.name || "参考图"; const displayName = kind === "people" ? window.AssetPresentation207?.displayName(item,state.project?.assets?.people||[]) || name : name; const job = state.activeAssetJobs.get(`${kind}:${item.id}`); const presentation = assetPreviewState(item, job); const image = item.imageFile ? `<img loading="lazy" decoding="async" fetchpriority="low" class="open-visual-preview" data-preview-type="image" data-file="${esc(item.imageFile)}" data-name="${esc(name)}.jpg" data-title="${esc(name)}" src="${media(item.imageFile)}" alt="${esc(name)}" title="点击放大">` : `<span class="asset-preview-placeholder">${kind === "people" ? "人" : kind === "scenes" ? "景" : "物"}</span>`; const resultActions = item.imageFile ? `<div class="visual-result-actions"><button class="ghost-btn open-visual-preview" data-preview-type="image" data-file="${esc(item.imageFile)}" data-name="${esc(name)}.jpg" data-title="${esc(name)}">放大查看</button><a class="secondary-btn" href="${esc(downloadMedia(item.imageFile, `${name}.jpg`))}">单独下载</a></div>` : ""; const source = item.source === "uploaded" ? '<span class="visual-origin-badge">当前使用：用户上传图</span>' : item.imageFile ? '<span class="visual-origin-badge">当前使用：模型生成图</span>' : ""; const eyeMask = kind === "people" ? `<label class="asset-eye-mask"><input type="checkbox" ${(item.generationSettings?.eyeMask ?? item.eyeMask) ? "checked" : ""}> 仅此人物启用眼部遮挡（样式跟随上方选择）</label>` : ""; const mainRole = kind === "people" && item.isMainCharacter ? '<span class="visual-main-character-badge">主角</span>' : ""; return `<article class="visual-card" data-kind="${kind}" data-id="${esc(item.id)}"><div class="visual-card-preview" aria-busy="${presentation.busy}">${image}${assetPreviewMarkup(presentation)}</div><div class="visual-card-body"><label class="visual-select-item"><input type="checkbox" class="asset-select"> 选择</label><b>${esc(displayName)}</b>${mainRole}${source}<span>${esc(item.description || "等待补充设定")}</span><textarea class="visual-asset-prompt">${esc(item.prompt || "")}</textarea>${eyeMask}<div class="visual-result-actions"><button class="ghost-btn save-asset-prompt">保存描述词与设置</button><button class="ghost-btn asset-upload">${item.imageFile ? "上传图片替换" : "直接上传自己的图"}</button><input class="visual-upload-input" type="file" accept="image/jpeg,image/png,image/webp,image/bmp"></div>${resultActions}<div class="visual-card-actions"><button class="secondary-btn asset-generate" data-model-activity="${presentation.busy?'pending':''}" ${presentation.busy || presentation.phase === "paused" ? "disabled" : ""}>${presentation.busy ? "生成中…" : presentation.phase === "paused" ? "待核对" : item.imageFile ? "重新生成" : "生成参考图"}</button></div></div></article>`; }
  function allKnownReferenceAssets() { return ["people","scenes","props"].flatMap(kind => (state.project.assets[kind] || []).map(item => ({ ...item, kind, referenceId:`${kind}:${item.id}` }))); }
  function availableReferenceAssets() { return allKnownReferenceAssets().filter(item => item.imageFile); }
  const mentionDrafts = new Map();
  const mentionDraftSources = new Map();
  const mentionDraftReferences = new Map();
  const referenceEditorContexts = new WeakMap();
  const referenceEditorsByKey = new Map();
  const referenceSelectionStates = new Map();
  const referenceSaveQueues = new Map();
  function knownMentionAssets() {
    const live=allKnownReferenceAssets(), ids=new Set(live.map(asset=>asset.referenceId));
    const removed=(state.project?.assetTrash||[]).filter(asset=>['people','scenes','props'].includes(asset.deletedKind))
      .map(asset=>({...asset,kind:asset.deletedKind,referenceId:`${asset.deletedKind}:${asset.id}`}));
    return [...live,...removed.filter(asset=>!ids.has(asset.referenceId))];
  }
  function queueReferenceSave(key, save) {
    const queued=(referenceSaveQueues.get(key)||Promise.resolve()).catch(()=>{}).then(save);
    referenceSaveQueues.set(key,queued);
    queued.finally(()=>{if(referenceSaveQueues.get(key)===queued)referenceSaveQueues.delete(key);}).catch(()=>{});
    return queued;
  }
  const cutRevision = project => window.WorkflowCutEditor?.revision(project)||String(project?.cutRevisionId||'');
  const sameCut = (projectId, revision) => state.project?.id===projectId&&cutRevision(state.project)===revision;
  const canApplyCutResponse=(projectId,revision,incoming)=>sameCut(projectId,revision)&&incoming?.id===projectId&&cutRevision(incoming)===revision;
  let projectReadEpoch=0;
  function setStoryboardBusy(value,owner) {
    if(value){state.storyboardOwner=owner;state.storyboardBusy=true;}
    else{if(owner&&state.storyboardOwner!==owner)return;state.storyboardOwner=null;state.storyboardBusy=false;}
    $("useSource").disabled=Boolean(value);updateStoryboardButton();window.WorkflowCutEditor?.sync();syncTopScenes();
  }
  const descriptionDraftKey = (projectId, number, revision=cutRevision(state.project)) => `${projectId}/${revision}/${Number(number)}`;
  function currentPromptDraft(project, number) {
    const draft=project?.cutPromptDrafts?.[String(number)];
    if (!draft) return null;
    if (!window.WorkflowCutEditor.matchesRevision(project,draft))return null;
    if ('baseCutHash' in draft&&draft.baseCutHash!==window.WorkflowCutEditor.baseCutHash(project))return null;
    // Same-version expired drafts remain visible for review. A legacy draft
    // needs proof from current source or this cut's valid edit history.
    if(draft.cutRevisionId||draft.baseCutHash)return draft;
    const hashes=[window.WorkflowCutEditor.fingerprintSync(window.WorkflowCutEditor.effectiveSource(project,number)),...(window.WorkflowCutEditor.matchingOverride(project,number)?.history||[]).map(item=>item.sourceHash)];
    return hashes.includes(draft.sourceHash)?draft:null;
  }
  function currentEpisode(project, number) {
    const item=project?.episodes?.find(value=>Number(value.number)===Number(number));
    const cut=project?.scriptCuts?.find(value=>Number(value.number)===Number(number));
    if (!item||!cut) return item;
    if(!window.WorkflowCutEditor.matchesRevision(project,item))return null;
    const itemSource=String(item.sourceText||'').replace(/\r\n/g,'\n').trim();
    if (itemSource!==String(window.WorkflowCutEditor.effectiveSource(project,number)).replace(/\r\n/g,'\n').trim()&&itemSource!==String(cut.sourceText||'').replace(/\r\n/g,'\n').trim())return null;
    if(Number(item.durationSeconds||15)!==Number(cut.durationSeconds||15))return null;
    return item;
  }
  const currentEpisodes=project=>project?.scriptCuts?.length?project.scriptCuts.map(cut=>currentEpisode(project,cut.number)).filter(Boolean):project?.episodes||[];
  function storyboardFirstReady(project) {
    return project?.storyboardFirstVersion === 1 && Boolean(project.scriptCuts?.length)
      && project.scriptCuts.every(cut => {
        const item = currentEpisode(project, cut.number);
        return item && !item.storyboardSourceStale && (!stagedStoryboardProject(project) || item.storyboardProductionVersion === 1 && item.productionReady === true) && String(item.storyboard || '').trim()
          && String(item.sourceText || '').trim() === String(window.WorkflowCutEditor.effectiveSource(project, Number(cut.number))).trim();
      });
  }
  const stagedStoryboardProject = project => project?.storyboardProductionVersion === 1;
  function storyboardBatchCallCount(cardNumbers) {
    const numbers = [...new Set(cardNumbers.filter(Number.isInteger))].sort((a,b)=>a-b);
    let calls=0, runLength=0, previous=null;
    for (const number of numbers) {
      if (previous!==null && number!==previous+1) { calls+=Math.ceil(runLength/2); runLength=0; }
      runLength++; previous=number;
    }
    return calls+Math.ceil(runLength/2);
  }
  function storyboardBatchEstimate(cards, project = state.project) {
    const numbers = cards.map(value=>Number(typeof value === 'object' ? value.number : value));
    const count = numbers.length, staged = stagedStoryboardProject(project);
    const quote = storyboardRegenerationQuote();
    if (!staged) return $("visualTextModelQuote").textContent;
    const calls = storyboardBatchCallCount(numbers);
    return quote.ready ? `${quote.modelName} · 每次${quote.points.toFixed(2)}积分；每次最多2张卡，剩余${count}张预计${calls}次调用、${(calls * quote.points).toFixed(2)}积分。按实际调用次数结算，已完成卡不重复提交。` : quote.message;
  }
  function descriptionEditGuard(projectId, number, revision=cutRevision(state.project)) {
    if (state.project?.id !== projectId) throw new Error('已切换项目，未保存当前修改。');
    if (!sameCut(projectId,revision))throw new Error('切割版本已改变，旧版草稿已保留，未写入新版。');
    const item = currentEpisode(state.project,number);
    const attempt=window.WorkflowCutEditor.currentAttempt(state.project,number);
    if (state.storyboardBusy || state.pendingCut || ['queued','running'].includes(attempt?.state) || (item && pendingVideoEpisode(item))) {
      throw new Error('本集或剧本任务正在执行；文字草稿已保留，请任务结束后保存或调整引用。');
    }
  }
  function setupReferenceEditors() {
    document.querySelectorAll('.visual-episode-card').forEach(node => {
      if(node.dataset.cutPreview==='true')return;
      if (node.querySelector('.reference-mention-panel') || !window.ReferenceMentions) return;
      const number = Number(node.dataset.cutNumber);
      const item = currentEpisode(state.project,number);
      const cut = state.project.scriptCuts?.find(value => Number(value.number) === number);
      const section = node.querySelector('.visual-episode-storyboard'), pre=section?.querySelector('pre'), input=node.querySelector('.visual-video-prompt');
      if ((!item && !cut) || !section || !input) return;
      const projectId=state.project.id, revision=cutRevision(state.project), key=descriptionDraftKey(projectId, number,revision), panel=document.createElement('div');
      const source = window.WorkflowCutEditor?.effectiveSource(state.project, number) ?? cut?.sourceText ?? item?.sourceText ?? '';
      const persisted = currentPromptDraft(state.project,number);
      if (item && mentionDraftReferences.has(key)) {
        const picker=node.querySelector('.visual-reference-picker');
        if (picker && mentionDrafts.has(key)) picker.outerHTML=referencePicker({...item,referenceAssetIds:mentionDraftReferences.get(key),referenceSelectionManual:true});
        mentionDraftReferences.delete(key);
      }
      if (!item && !mentionDraftReferences.has(key)) mentionDraftReferences.set(key, [...(persisted?.referenceAssetIds || [])]);
      const selected=()=>item ? checkedReferenceIds(node) : mentionDraftReferences.get(key) || [];
      const assets=()=>availableReferenceAssets();
      const originalText=mentionDrafts.has(key)?mentionDrafts.get(key):ReferenceMentions.annotate(item ? item.videoPrompt||item.storyboard||'' : persisted?.prompt||'',assets().filter(asset=>selected().includes(asset.referenceId)),knownMentionAssets());
      const unifiedText=mentionDrafts.has(key)?originalText:projectStyleEditorText(originalText,item||persisted);
      const text=ReferenceMentions.synchronizeSelection(unifiedText,selected(),knownMentionAssets());
      const placeholder=section.querySelector('.visual-empty');
      if (pre) pre.replaceWith(panel); else if (placeholder) placeholder.replaceWith(panel); else section.querySelector('h4').after(panel);
      const legacy=input.closest('details'); if(legacy) legacy.hidden=true;
      input.disabled=false; input.value=text;
      const stale = document.createElement('p'); stale.className='episode-source-stale prompt-draft-stale'; stale.hidden=true; panel.before(stale);
      const checkStale = async () => {
        const hash=await window.WorkflowCutEditor.fingerprint(source);
        if (!node.isConnected || !sameCut(projectId,revision)) return;
        const dirtySource=mentionDraftSources.get(key);
        const expired=(dirtySource !== undefined && dirtySource !== source) || (!item && persisted?.sourceHash && persisted.sourceHash !== hash);
        stale.hidden=!expired;
        stale.textContent='左侧原内容已变化，这份描述词草稿已过期；已保留供核对，不会自动用于生成。请修改后按当前原文重新保存。';
      };
      checkStale().catch(()=>{});
      const selectionState=referenceSelectionStates.get(key)||{sequence:0,committedIds:[...selected()]};
      referenceSelectionStates.set(key,selectionState);
      const context={node,panel,input,projectId,revision,key,number,item,source,selected,selectionState,mounted:null};
      referenceEditorContexts.set(node,context);referenceEditorsByKey.set(key,context);
      const mounted=ReferenceMentions.mount(panel, {text,assets,allAssets:knownMentionAssets,boundAssets:knownMentionAssets,selected,media,confirm:studioConfirm,
        initialChange:false,
        hint:'分镜与画风在此统一编辑；下方勾选自动引用，取消勾选保留原文字；保存不调用模型、不扣费',
        changedLabel:'有未保存的手写草稿；切换卡片或模型返回不会覆盖，请点击保存描述词。',
        active:()=>sameCut(projectId,revision),
        change:value=>{input.value=value;mentionDrafts.set(key,value);if(!mentionDraftSources.has(key))mentionDraftSources.set(key,source);},
        select:async asset=>{
          descriptionEditGuard(projectId,number,revision);
          const ids=[...new Set([...selected(),asset.referenceId])];
          validateVideoReferences(ids,node.querySelector('.episode-video-model')?.value);
          if (!item) { mentionDraftReferences.set(key,ids); return; }
          let checkbox=[...node.querySelectorAll('.episode-reference')].find(value=>value.value===asset.referenceId);
          if(!checkbox) {
            const label=document.createElement('label');label.className='visual-reference-option';
            checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='episode-reference';checkbox.value=asset.referenceId;
            const image=document.createElement('img');image.src=media(asset.imageFile);image.alt=asset.name;
            const name=document.createElement('span');name.textContent=asset.name;label.append(checkbox,image,name);
            node.querySelector('.visual-reference-empty')?.remove();node.querySelector('.visual-reference-list').append(label);
          }
          const previous=checkbox.checked;checkbox.checked=true;
          try {await saveEpisodeReferences(node,{syncSelection:false});}catch(error){checkbox.checked=previous;throw error;}
        },
        save:async prompt=>{
          descriptionEditGuard(projectId,number,revision);
          await saveEpisodeReferences(node,{prompt,ids:[...selected()],savePrompt:true,syncSelection:false});
          if (node.isConnected&&sameCut(projectId,revision))stale.hidden=true;
        },
      });
      context.mounted=mounted;
      mounted.editor.dataset.placeholder=item ? '可以直接输入或粘贴视频描述词，保存不调用模型。' : '尚未补齐 AI 分镜，也可直接输入或粘贴描述词并保存草稿；视频生成仍需先补齐分镜。';
    });
  }
  function autoReferenceIds(item) { return window.ReferenceMatcher?.match(item,availableReferenceAssets()).map(asset=>asset.referenceId)||[]; }
  function episodeReferenceIds(item) { const saved = Array.isArray(item.referenceAssetIds) ? item.referenceAssetIds.filter(Boolean) : []; return [...new Set(item.referenceSelectionManual ? saved : [...saved, ...autoReferenceIds(item)])]; }
  function videoReferenceLimit(modelId = selectedModel("video")) { const model = String(modelId || "").toLowerCase(); return state.profile.modelCapabilities?.[model]?.referenceImageLimit ?? null; }
  function validateVideoReferences(ids, modelId = selectedModel("video")) { const limit = videoReferenceLimit(modelId); if (limit != null && ids.length > limit) throw new Error(`当前所选视频模型最多支持${limit}张参考图片，已选${ids.length}张，请减少后再提交。`); }
  const referencePickerOpen = new Map();
  function referencePickerKey(item) {
    return JSON.stringify([state.project?.id || '',cutRevision(state.project),item.id || item.number]);
  }
  function trackReferencePickerState(event) {
    const target=event.target;
    if(event.type==='toggle' && target?.matches?.('.visual-reference-picker[data-reference-key]') && target.isConnected) {
      referencePickerOpen.set(target.dataset.referenceKey,target.open);
    }
    if(event.type==='change' && target?.matches?.('.episode-reference')) {
      const picker=target.closest('.visual-reference-picker'),count=picker?.querySelector('.visual-reference-count');
      if(count)count.textContent=`已选 ${picker.querySelectorAll('.episode-reference:checked').length} 张 · 共 ${picker.querySelectorAll('.episode-reference').length} 张`;
    }
  }
  document.addEventListener('toggle',trackReferencePickerState,true);
  document.addEventListener('change',trackReferencePickerState,true);
  function referencePicker(item) {
    const assets=availableReferenceAssets(), selected=new Set(episodeReferenceIds(item));
    const model=episodeVideoSettings(item).model, limit=videoReferenceLimit(model);
    const options=assets.map(asset=>{
      const removable=asset.kind==='props'&&asset.source==='uploaded'&&String(asset.name||'').startsWith(`第${item.number}集外部参考图`);
      return `<label class="visual-reference-option"><input type="checkbox" class="episode-reference" value="${esc(asset.referenceId)}" ${selected.has(asset.referenceId)?'checked':''}><img loading="lazy" decoding="async" fetchpriority="low" src="${media(asset.imageFile)}" alt="${esc(asset.name)}"><span>${asset.kind==='people'?'人物':asset.kind==='scenes'?'场景':'物品'}·${esc(asset.name)}</span>${removable?`<button type="button" class="episode-reference-remove" data-reference-id="${esc(asset.referenceId)}" aria-label="删除${esc(asset.name)}">×</button>`:''}</label>`;
    }).join('');
    const referenceKey=referencePickerKey(item);
    return `<details class="visual-reference-picker" data-reference-key="${esc(referenceKey)}" ${referencePickerOpen.get(referenceKey)===true?'open':''}><summary class="visual-reference-summary"><b>本集参考图</b><span class="visual-reference-count">已选 ${selected.size} 张 · 共 ${assets.length} 张</span><span class="reference-expand-label">展开参考图</span><span class="reference-collapse-label">收起参考图</span></summary><div class="visual-reference-heading"><b>${limit==null?'数量按本集模型能力':`本集模型最多${limit}张`}；取消引用保留原文字</b><div class="visual-reference-actions"><button type="button" class="ghost-btn episode-reference-auto-fill">自动补齐匹配引用</button><button type="button" class="ghost-btn episode-reference-upload">＋ 上传外部参考图</button></div><input class="episode-reference-upload-input" type="file" accept="image/jpeg,image/png,image/webp,image/bmp" hidden></div><div class="visual-reference-list">${options||'<span class="visual-reference-empty">本项目暂无已生成的参考图，可上传外部图片</span>'}</div></details>`;
  }
  function adaptiveEpisodeDuration(item) {
    if (item?.durationMode !== 'adaptive' && item?.pacingPlan?.durationMode !== 'adaptive') return null;
    const value = Number(item.durationSeconds);
    const shotCard = item?.shotFirstVersion === 1 || (item?.storyboardFirstVersion === 1 && item?.directorArrangementVersion === 1
      && state.project?.scriptCuts?.some(cut=>cut.number===item.number && cut.shotFirstVersion===1));
    return Number.isFinite(value) && value > 0 && (Number.isInteger(value) || shotCard && Number.isInteger(value * 2)) ? value : null;
  }
  function adaptiveGenerationDuration(item) {
    const actual = adaptiveEpisodeDuration(item);
    return actual == null ? null : Math.ceil(actual);
  }
  function publishedVideoDurations(model) {
    const ability = videoCapability(model), info = ModelPresentation.videoDurationInfo(state.profile, model);
    const exact = Array.isArray(ability.supportedDurations) && ability.supportedDurations.length ? ability.supportedDurations.map(Number) : null;
    const values = exact || Array.from({length:Math.max(0,Math.min(3600,info.maximum-info.minimum+1))},(_,index)=>info.minimum+index);
    return [...new Set(values.filter(value=>Number.isInteger(value) && !ModelPresentation.videoDurationIssue(state.profile,model,value)))].sort((a,b)=>a-b);
  }
  function adaptiveVideoIssue(item, model, duration, resolution) {
    const actual = adaptiveEpisodeDuration(item);
    if (actual == null) return '';
    const output = adaptiveGenerationDuration(item), ability = videoCapability(model);
    if (Number(duration) !== output) return `本卡实际${actual}秒，生成时长已锁定；不能改为${duration}秒或拉长凑满。`;
    const durationIssue = ModelPresentation.videoDurationIssue(state.profile,model,output);
    if (durationIssue) return `本卡须精确生成${output}秒。${durationIssue} 请更换模型，不自动改为更长档位。`;
    if (actual !== output && !(ability.supportedDurations?.includes(output)
        || Number.isFinite(ability.minDurationSeconds) && Number.isFinite(ability.maxDurationSeconds))) return `所选模型未明确发布生成${output}秒的能力。`;
    const price = ModelPresentation.quote(state.profile,model,resolution,output,"economy",episodeVideoSettings(item).ratio);
    if (price?.billingMode === 'flat' && ![15,30].includes(output)) return `本卡实际${actual}秒，生成${output}秒只能使用按秒计费模型；请更换模型，不自动拉长。`;
    return '';
  }
  function adaptiveModelIssue(item, model) {
    const actual = adaptiveEpisodeDuration(item);
    if (actual == null) return '';
    const output = adaptiveGenerationDuration(item), ability = videoCapability(model);
    const durationIssue = ModelPresentation.videoDurationIssue(state.profile,model,output);
    if (durationIssue) return `不支持本卡生成${output}秒`;
    if (actual !== output && !(ability.supportedDurations?.includes(output)
        || Number.isFinite(ability.minDurationSeconds) && Number.isFinite(ability.maxDurationSeconds))) return `未发布生成${output}秒能力`;
    const prices = [...new Set((state.profile.videoPricing ?? state.profile.visualVideoPricing ?? []).map(row=>String(row.resolution).toLowerCase()))]
      .map(resolution=>ModelPresentation.quote(state.profile,model,resolution,output,"economy",episodeVideoSettings(item).ratio)).filter(Boolean);
    if (![15,30].includes(output) && prices.length && prices.every(row=>row.billingMode==='flat')) return '本卡仅可用按秒模型';
    return '';
  }
  function episodeCompatibleVideoChoices(item, ratio = episodeVideoSettings(item).ratio) {
    const duration = adaptiveGenerationDuration(item) ?? episodeVideoSettings(item).duration;
    const rows = state.profile.videoPricing ?? state.profile.visualVideoPricing ?? [];
    return ModelPresentation.catalog(state.profile, 'video', state.project?.settings || {}).flatMap(value => {
      if (ModelPresentation.videoDurationIssue(state.profile,value.id,duration)
          || !ModelPresentation.videoAspectRatios(state.profile,value.id).includes(ratio)) return [];
      const declared = (videoCapability(value.id).supportedResolutions || []).map(value=>String(value).toLowerCase());
      const resolutions = [...new Set(rows.map(row=>String(row.resolution).toLowerCase()))].filter(resolution=>!declared.length || declared.includes(resolution))
        .flatMap(resolution => {
          if (adaptiveVideoIssue(item,value.id,duration,resolution)) return [];
          const quote = ModelPresentation.quote(state.profile,value.id,resolution,duration,value.tier,ratio);
          return quote && Number.isFinite(quote.points) && quote.points > 0 ? [{resolution,quote}] : [];
        });
      return resolutions.length ? [{...value,resolutions}] : [];
    });
  }
  function episodeVideoSettings(item) {
    const global = state.project?.settings || {}, saved = item.videoSettings || {};
    const catalog = ModelPresentation.catalog(state.profile, "video", global);
    const fallbackModel = selectedModel("video") || catalog[0]?.id || "";
    const model = String(saved.videoModel || item.videoModel || global.videoModel || fallbackModel);
    const matched = catalog.find(value => value.id === model);
    return {
      model,
      tier: String(saved.videoTier || item.videoTier || global.videoTier || matched?.tier || selectedTier("video") || "economy"),
      resolution: String(saved.resolution || item.resolution || global.resolution || $("visualResolution").value || "480p").toLowerCase(),
      duration: adaptiveGenerationDuration(item) ?? Number(saved.duration || item.duration || item.durationSeconds || global.videoDuration || $("visualVideoDuration").value || 15),
      ratio: String(saved.ratio || item.ratio || global.ratio || $("visualVideoRatio").value || "9:16"),
    };
  }
  function episodeModelOptions(item, explicitRoute = null) {
    const settings = episodeVideoSettings(item), route = activeRoute234('video',explicitRoute || modelRoute234("video",settings.model,item.videoSettings?.videoRouteType || state.project?.settings?.videoRouteType)), catalog = ModelPresentation.routeModels(state.profile, "video", route, state.project?.settings || {});
    if(explicitRoute)settings.model="";
    const choices = episodeCompatibleVideoChoices(item), actual = adaptiveEpisodeDuration(item);
    const retired = settings.model && !catalog.some(value=>value.id===settings.model)
      ? `<option value="${esc(settings.model)}" data-tier="${esc(settings.tier)}" selected disabled>当前模型未发布（请重新选择）</option>` : '';
    return retired + (catalog.length ? catalog.map(value => {
      const issue=adaptiveModelIssue(item,value.id), compatible=choices.some(choice=>choice.id===value.id);
      const label=issue || (compatible && actual != null ? `支持本卡${adaptiveGenerationDuration(item)}秒` : '');
      const base=ModelPresentation.videoOptionLabel(state.profile,value)+(label?'（'+label+'）':''),capability=window.MacroArrangement?.tailFrameLabel242?.(videoCapability(value.id),{duration:settings.duration,resolution:settings.resolution,referenceAssetIds:episodeReferenceIds(item)})||'';
      return `<option value="${esc(value.id)}" data-tier="${esc(value.tier)}" data-base-label242="${esc(base)}" ${value.id === settings.model ? "selected" : ""} ${issue ? 'disabled' : ''}>${esc(base+(capability?' · '+capability:''))}</option>`;
    }).join("") : '<option value="">尚未配置模型</option>');
  }
  function episodeResolutionOptions(item) {
    const settings = episodeVideoSettings(item), ability = videoCapability(settings.model);
    const values = [...new Set((ability.supportedResolutions || []).map(value => String(value).toLowerCase()).filter(Boolean).length ? (ability.supportedResolutions || []).map(value => String(value).toLowerCase()) : ["480p", "720p", "1080p"])];
    return values.map(value => `<option value="${esc(value)}" ${value === settings.resolution ? "selected" : ""}>${esc(value.toUpperCase())}</option>`).join("");
  }
  function episodeDurationOptions(item) {
    const settings = episodeVideoSettings(item), actual = adaptiveEpisodeDuration(item);
    const values = actual != null ? [adaptiveGenerationDuration(item)] : [...new Set([...publishedVideoDurations(settings.model), settings.duration])];
    const available = [...new Set(values)].sort((a, b) => a - b);
    return available.map(value => `<option value="${value}" ${value === settings.duration ? "selected" : ""}>${value}秒</option>`).join("");
  }
  function episodeRatioOptions(item) {
    const current = episodeVideoSettings(item).ratio;
    const allowed = ModelPresentation.videoAspectRatios(state.profile,episodeVideoSettings(item).model);
    const values = [["9:16", "竖屏 9:16"], ["16:9", "横屏 16:9"], ["1:1", "方形 1:1"], ["21:9", "宽幅 21:9"]];
    if (current && !values.some(([value])=>value===current)) values.push([current,`${current}（原设定）`]);
    return values.map(([value, label]) => `<option value="${esc(value)}" ${value === current ? "selected" : ""} ${allowed.includes(value) ? '' : 'disabled'}>${esc(label)}</option>`).join("");
  }
  function chosenEpisodeDuration(item, node) { return adaptiveGenerationDuration(item) ?? configuredVideoDuration(node?.querySelector(".episode-video-duration"),episodeVideoSettings(item).duration || episodeDuration(item)); }
  function chosenEpisodeRatio(item, node) { return node?.querySelector(".episode-video-ratio")?.value || episodeVideoSettings(item).ratio; }
  function tailFrameFirst237(item,project=state.project){
    const episodes=project?.episodes||[],index=episodes.findIndex(row=>row.id===item?.id);
    if(index===0)return true;
    const scene=row=>{for(const key of ['segmentId','sceneId','sceneNumber','sourceSceneId','sceneGroupId'])if(row?.[key]!==undefined&&row[key]!==null&&String(row[key]))return key+':'+String(row[key]);return '';};
    return index>0&&scene(item)&&scene(episodes[index-1])&&scene(item)!==scene(episodes[index-1]);
  }
  function episodeTailState239(item,node=null,model=null,duration=null,referenceCount=null){
    const settings=episodeVideoSettings(item),box=node?.querySelector('.episode-tail-continuation'),selection={duration:duration??chosenEpisodeDuration(item,node),resolution:node?.querySelector('.episode-video-resolution')?.value||settings.resolution,referenceAssetIds:Array(referenceCount??(node?checkedReferenceIds(node).length:episodeReferenceIds(item).length)).fill('reference'),tailFrameContinuation:box?box.checked:item.videoSettings?.tailFrameContinuation===true};
    const ability=videoCapability(model||node?.querySelector('.episode-video-model')?.value||settings.model);
    const tail=window.MacroArrangement?.tailFrameState239?.(ability,selection)||{mode:'first-frame',enabled:false,issue:'当前模型线路的尾帧承接能力尚未确认，暂不可勾选。',notice:''};
    return {...tail,capabilityLabel242:window.MacroArrangement?.tailFrameLabel242?.(ability,selection)||'',usage242:window.MacroArrangement?.tailFrameUsage242?.(ability,selection,tailFrameFirst237(item)?1:2)};
  }
  function episodeTailHint239(item,tail){
    if(pendingVideoEpisode(item))return '原任务按已提交参数继续查询；尾帧续画开关仅用于新的生成。';
    const first=tailFrameFirst237(item)?'本场首卡按正常方式生成，不从其他场次取画面。 ':'';
    return first+(tail.capabilityLabel242?tail.capabilityLabel242+'。 ':'')+(tail.usage242?.text?tail.usage242.text+'。 ':'')+(tail.notice||tail.issue||(tail.mode==='first-frame'?'固定首帧承接：前卡尾帧直接作为本卡首帧；手选参考图保留。':'参考图承接：提示词要求以尾帧作为首帧；接口不锁定首帧，实际可能偏差，不能保证首画面完全一致。'));
  }
  function episodeTailMarkup239(item){
    const tail=episodeTailState239(item),resumed=pendingVideoEpisode(item);
    return `<label><input type="checkbox" class="episode-tail-continuation" data-tail-mode="${esc(tail.mode)}" data-tail-cancelled="${esc(tail.notice||'')}" ${resumed?item.videoSettings?.tailFrameContinuation===true?'checked':'':tail.enabled?'checked':''} ${resumed||tail.issue?'disabled':''}> 尾帧续画 · 自动适配</label>`;
  }
  function refreshEpisodeTail239(node,item){
    const box=node?.querySelector('.episode-tail-continuation');if(!box)return null;
    if(pendingVideoEpisode(item)||state.activeVideoJobs.get(videoJobKey(state.project?.id,item.id))?.active||node.dataset.generating){box.disabled=true;return null;}
    const tail=episodeTailState239(item,node);
    const selection={duration:chosenEpisodeDuration(item,node),resolution:node.querySelector('.episode-video-resolution')?.value||episodeVideoSettings(item).resolution,referenceAssetIds:checkedReferenceIds(node)};
    for(const option of node.querySelectorAll('.episode-video-model option[data-base-label242]')){
      const label=window.MacroArrangement?.tailFrameLabel242?.(videoCapability(option.value),selection);
      option.textContent=option.dataset.baseLabel242+(label?' · '+label:'');
    }
    if(tail.cancelled)box.dataset.tailCancelled=tail.notice;else if(!tail.issue)delete box.dataset.tailCancelled;
    box.checked=tail.enabled;box.disabled=!!tail.issue;box.dataset.tailMode=tail.mode;
    const hint=node.querySelector('.episode-tail-hint');if(hint)hint.textContent=episodeTailHint239(item,{...tail,notice:tail.notice||box.dataset.tailCancelled||''});
    return tail;
  }
  function tailFrameIssue237(item,node,model,duration,referenceCount){
    const enabled=node?.querySelector('.episode-tail-continuation')?.checked===true;
    if(!enabled||tailFrameFirst237(item))return '';
    return episodeTailState239(item,node,model,duration,referenceCount).issue;
  }
  function episodeVideoBlockReason(item, node) {
    if (window.WorkflowCutSubmission?.blocked(state.project)) return {kind:'cut',message:'本次切割尚未保存；请先重新校验原返回，或明确确认继续使用旧稿。'};
    if (node?.classList.contains('visual-episode-draft') || !String(item.storyboard || item.videoPrompt || '').trim())
      return {kind:'storyboard',message:'本集尚未补齐分镜；请先补齐或保存完整视频描述词。'};
    if (stagedStoryboardProject(state.project) && (item.storyboardProductionVersion !== 1 || item.productionReady !== true))
      return {kind:'storyboard',message:'本卡正式分镜尚未制作完成；请先按v2.1.132标准制作分镜，不需要重新切割。'};
    const model = node?.querySelector('.episode-video-model')?.value || episodeVideoSettings(item).model;
    if (!ModelPresentation.catalog(state.profile,'video',state.project?.settings || {}).some(value=>value.id===model))
      return {kind:'model',message:'当前视频模型已停止发布，请手动选择兼容模型；不会自动更换或扣费。'};
    const resolution = node?.querySelector('.episode-video-resolution')?.value || episodeVideoSettings(item).resolution;
    const duration = chosenEpisodeDuration(item,node), ratio = chosenEpisodeRatio(item,node);
    const issue = adaptiveVideoIssue(item,model,duration,resolution) || videoCapabilityIssue(model,duration,resolution,ratio) || tailFrameIssue237(item,node,model,duration,checkedReferenceIds(node).length);
    if (issue) return {kind:'model',message:issue};
    const tier = node?.querySelector('.episode-video-model')?.selectedOptions[0]?.dataset.tier || episodeVideoSettings(item).tier;
    const quote = ModelPresentation.quote(state.profile,model,resolution,duration,tier,ratio);
    if (!ModelPresentation.isLiveQuote(state.profile,'video',model) && (!quote || !Number.isFinite(quote.points) || quote.points <= 0))
      return {kind:'quote',message:`所选模型的${resolution.toUpperCase()} / ${duration}秒组合没有有效报价，请更换有报价的模型或分辨率。`};
    return null;
  }
  function refreshEpisodeVideoCompatibility(node,item) {
    refreshEpisodeTail239(node,item);
    const button=node.querySelector('.video-generate');
    if (!button) return;
    const resumed=pendingVideoEpisode(item), reason=resumed ? null : episodeVideoBlockReason(item,node);
    if (reason) button.dataset.creditReason=reason.message; else delete button.dataset.creditReason;
    let action=node.querySelector('.choose-compatible-video-model');
    if (!action) {
      action=document.createElement('button');action.type='button';action.className='secondary-btn choose-compatible-video-model';
      action.textContent='选择兼容模型';button.insertAdjacentElement('afterend',action);
      action.addEventListener('click',()=>openCompatibleVideoSettings(node));
    }
    const active=state.activeVideoJobs.get(videoJobKey(state.project?.id,item.id))?.active || node.dataset.generating;
    action.hidden=!reason || !['model','quote'].includes(reason.kind) || resumed || node.classList.contains('visual-episode-draft');
    action.disabled=Boolean(active);
    const settings=node.querySelector('.episode-generation-settings');
    if (!action.hidden && settings) settings.open=true;
    let hint=node.querySelector('.episode-video-compatibility');
    if (!hint) {hint=document.createElement('p');hint.className='episode-video-compatibility';hint.setAttribute('aria-live','polite');action.insertAdjacentElement('afterend',hint);}
    hint.hidden=!reason;
    if (!reason) {hint.textContent='';return;}
    const actual=adaptiveEpisodeDuration(item), choices=episodeCompatibleVideoChoices(item,chosenEpisodeRatio(item,node));
    hint.textContent=['model','quote'].includes(reason.kind)
      ? `分镜已齐。${reason.message} ${choices.length ? `下拉选项中已标注支持本卡${actual ?? chosenEpisodeDuration(item,node)}秒的模型，请自行选择；本卡时长和画面方向不会自动改变。` : '当前发布列表没有同时支持本卡秒数、原画面方向且已报价的模型，请检查模型列表，或明确调整分辨率/画面方向。'}`
      : reason.message;
  }
  function openCompatibleVideoSettings(node) {
    const item=state.project?.episodes?.find(value=>value.id===node?.dataset.episode);
    if (!item) return;
    if (state.activeVideoJobs.get(videoJobKey(state.project.id,item.id))?.active || node.dataset.generating)
      return toast('本集视频任务正在执行，请先等待原任务结束。',true);
    const settings=node.querySelector('.episode-generation-settings');if(settings)settings.open=true;
    const select=node.querySelector('.episode-video-model');
    select?.focus();settings?.scrollIntoView({behavior:'smooth',block:'nearest'});
    const choices=episodeCompatibleVideoChoices(item,chosenEpisodeRatio(item,node));
    toast(choices.length ? `请选择标有“支持本卡${chosenEpisodeDuration(item,node)}秒”的模型，再核对报价；此次操作不会生成视频或扣费。`
      : '当前列表暂无同时符合本卡秒数和画面方向且有报价的模型；不会自动换模型、改时长或发起生成。',!choices.length);
  }
  function syncEpisodeResolution(node) {
    const modelSelect = node.querySelector(".episode-video-model"), resolutionSelect = node.querySelector(".episode-video-resolution");
    if (!modelSelect || !resolutionSelect) return;
    const ability = videoCapability(modelSelect.value);
    const configured = (ability.supportedResolutions || []).map(value => String(value).toLowerCase()).filter(Boolean);
    const values = [...new Set(configured.length ? configured : ["480p", "720p", "1080p"])];
    const old = resolutionSelect.value;
    resolutionSelect.innerHTML = values.map(value => `<option value="${esc(value)}">${esc(value.toUpperCase())}</option>`).join("");
    resolutionSelect.value = values.includes(old) ? old : values[0];
    const durationSelect = node.querySelector(".episode-video-duration");
    if (durationSelect) {
      const item = state.project?.episodes?.find(value => value.id === node.dataset.episode);
      syncDurationControl(durationSelect,modelSelect.value,configuredVideoDuration(durationSelect,episodeVideoSettings(item || {}).duration));
      syncVideoRatioOptions(node.querySelector('.episode-video-ratio'),modelSelect.value);
    }
  }
  function videoHistoryMarkup(item, baseName) {
    const displayRecord = record => ({...record, modelName:ModelPresentation.recordName(state.profile, "video", record)});
    const history = Array.isArray(item.videoHistory) ? item.videoHistory.map(displayRecord) : [];
    const taskHistory = Array.isArray(item.videoTaskHistory) ? item.videoTaskHistory.map(displayRecord) : [];
    if (!history.length && !taskHistory.length) return "";
    const rows = history.slice().reverse().map((record, index) => {
      const file = String(record.file || ""), recordId = String(record.id || "");
      const name = `${baseName}-版本${history.length - index}.mp4`;
      const points = record.estimatedPoints != null ? ` · 本次使用${Number(record.estimatedPoints).toFixed(2)}积分` : " · 旧版本未记录积分";
      const detail = `${record.modelName || record.model || "未记录模型"} · ${String(record.resolution || "").toUpperCase()} · ${record.duration || "?"}秒${points} · ${(record.createdAt || "").replace("T", " ")}${record.taskId ? ` · 任务${String(record.taskId).slice(0, 10)}` : ""}`;
      return `<div class="visual-video-history-row">${episodeVideoPlayer(file,name,true)}<div><b>第${history.length - index}次生成</b><small>${esc(detail)}</small><div class="visual-result-actions"><button class="ghost-btn open-visual-preview" data-preview-type="video" data-file="${esc(file)}" data-name="${esc(name)}" data-title="${esc(baseName)} · 第${history.length - index}次生成">打开播放</button><a class="secondary-btn" href="${esc(downloadMedia(file, name))}">下载此版本</a><button class="ghost-btn clear-video-history" data-history-id="${esc(recordId)}">删除此版本</button></div></div></div>`;
    }).join("");
    const taskRows = taskHistory.slice().reverse().map(record => { const points = record.estimatedPoints == null ? "旧任务未记录积分" : `预计${Number(record.estimatedPoints).toFixed(2)}积分`; const label = record.status === "done" ? "已完成" : record.status === "failed" ? "失败" : record.status === "running" ? "进行中" : record.status === "detached" ? "已解除占用" : "已切换"; return `<div class="visual-video-task-history"><b>任务${esc(label)}</b><small>${esc(record.modelName || record.model || "未记录模型")} · ${esc(points)} · ${esc(record.message || "旧任务记录")} · ${esc(record.createdAt || "")}</small></div>`; }).join("");
    return `<details class="visual-video-history"><summary>生成历史（${history.length}个视频${taskHistory.length ? ` · ${taskHistory.length}个任务记录` : ""}）</summary><div class="visual-video-history-tools"><a class="secondary-btn" href="/api/visual/archive?projectId=${encodeURIComponent(state.project.id)}&kind=video-history&ids=${encodeURIComponent(item.id)}">下载本集全部版本</a><button class="danger-outline-btn clear-video-history-all" type="button">清除此集历史缓存</button></div><div class="visual-video-history-list">${rows}</div>${taskRows ? `<div class="visual-video-task-history-list">${taskRows}</div>` : ""}</details>`;
  }
  function episodeCard(item) {
    const cut = state.project?.scriptCuts?.find(value => Number(value.number) === Number(item.number));
    // An uncommitted cut preview has no identity in the current project yet.
    // Its same-number card must show the returned text, never the prior cut.
    const sourceText = item.status==='draft' ? item.sourceText||'' : cut?.sourceText || item.sourceText || "";
    const storyboard = displayStoryboard(item.storyboard);
    const baseName = `第${item.number}集${item.title ? `-${item.title}` : ""}`;
    const history = Array.isArray(item.videoHistory) ? item.videoHistory : [];
    const file = item.videoFile || item.firstFrameFile || "";
    const type = item.videoFile ? "video" : "image";
    const filename = item.videoFile ? `${baseName}.mp4` : `${baseName}-首帧.jpg`;
    const job = state.activeVideoJobs.get(videoJobKey(state.project?.id,item.id));
    const busy = videoAnimationPending(item,job);
    const output = (item.videoFile ? episodeVideoPlayer(item.videoFile,`${baseName}.mp4`) : item.firstFrameFile ? `<img loading="lazy" decoding="async" fetchpriority="low" class="open-visual-preview" data-preview-type="image" data-file="${esc(item.firstFrameFile)}" data-name="${esc(filename)}" data-title="${esc(baseName)}历史首帧（不参与视频生成）" src="${media(item.firstFrameFile)}" alt="第${item.number}集历史首帧（不参与视频生成）" title="点击放大">` : busy ? '' : "尚未生成视频（使用本集分镜与参考图）") + (busy ? videoAnimationMarkup(job) : '');
    const resultActions = file ? `<div class="visual-result-actions"><button class="ghost-btn open-visual-preview" data-preview-type="${type}" data-file="${esc(file)}" data-name="${esc(filename)}" data-title="${esc(baseName)}">${type === "video" ? "打开观看" : "查看历史首帧"}</button><a class="secondary-btn" href="${esc(downloadMedia(file, filename))}">下载当前版本</a></div>` : "";
    const resumable = pendingVideoEpisode(item);
    const status = item.videoRecoveryMessage || (resumable ? "正在自动接入原视频任务并等待成品…" : item.status === "video_failed" ? "生成失败，当前任务已停止" : item.status === "done" ? "视频已保存" : item.status === "frame_done" ? "历史首帧已保留；本次视频仅使用分镜与参考图" : "等待提交");
    const currentMeta = "";
    return `<article class="visual-episode-card" data-episode="${esc(item.id)}" data-cut-number="${item.number}"><div class="visual-episode-prompt"><label class="visual-select-item"><input type="checkbox" class="episode-select"> 选择第${item.number}集 · ${episodeDuration(item)}秒${item.durationSeconds ? "" : "（备用时长）"}</label><section class="visual-episode-script"><h4>左侧 · 第${item.number}段切割原文</h4>${sourceText ? `<pre>${esc(sourceText)}</pre>` : '<div class="visual-empty">旧项目未保存独立切割原文。</div>'}</section><details class="visual-video-prompt-details"><summary>调整视频输入（可选）</summary><textarea class="visual-video-prompt">${esc(item.videoPrompt || "")}</textarea></details></div><div class="visual-episode-output"><section class="visual-episode-storyboard"><h4>右侧 · 第${item.number}段补齐后的标准分镜</h4>${storyboard ? `<pre>${esc(storyboard)}</pre>` : '<div class="visual-empty">尚未补齐分镜。</div>'}${projectStyleMarkup()}</section><h4>第${item.number}集 · 生成结果</h4><div class="episode-local-settings"><label>本集线路<select class="episode-video-route">${routeOptions234("video",activeRoute234("video",modelRoute234("video",episodeVideoSettings(item).model,item.videoSettings?.videoRouteType || state.project?.settings?.videoRouteType)))}</select></label><label>本集模型<select class="episode-video-model">${episodeModelOptions(item)}</select></label><label>本集分辨率<select class="episode-video-resolution">${episodeResolutionOptions(item)}</select></label><label>本集生成时长<select class="episode-video-duration">${episodeDurationOptions(item)}</select></label><label>本集画面方向<select class="episode-video-ratio">${episodeRatioOptions(item)}</select></label>${episodeTailMarkup239(item)}</div><small class="episode-tail-hint" role="status">${esc(episodeTailHint239(item,episodeTailState239(item)))}</small><small class="episode-video-quote">正在读取本集模型报价…</small><div class="visual-output-box">${output}</div>${currentMeta}${resultActions}${videoHistoryMarkup(item, baseName)}<div class="visual-episode-actions"><button class="secondary-btn frame-generate hidden">${item.firstFrameFile ? "重做首帧" : "生成首帧（可选）"}</button><button class="primary-btn video-generate">${resumable ? "继续查询原任务" : item.videoFile ? "重新生成视频" : "生成视频"}</button>${resumable ? '<button class="danger-outline-btn video-reset" type="button">解除卡死</button>' : ""}</div><p class="visual-task-status">${status}</p></div>${referencePicker(item)}</article>`;
  }
  function renderCover(project) {
    const name = `${project.projectName || "本剧"}-封面`, file = project.coverFile || "";
    const all = availableReferenceAssets();
    let selected = Array.isArray(project.coverReferenceAssetIds) ? project.coverReferenceAssetIds : [...all.filter(x => x.kind === "people").slice(0,2), ...all.filter(x => x.kind === "scenes").slice(0,1)].slice(0,3).map(x => x.referenceId);
    selected = new Set(selected);
    const options = all.map(asset => `<label class="visual-reference-option"><input type="checkbox" class="cover-reference" value="${esc(asset.referenceId)}" ${selected.has(asset.referenceId) ? "checked" : ""}><img loading="lazy" decoding="async" fetchpriority="low" src="${media(asset.imageFile)}" alt="${esc(asset.name)}"><span>${asset.kind === "people" ? "人物" : asset.kind === "scenes" ? "场景" : "物品"}·${esc(asset.name)}</span></label>`).join("");
    const history = Array.isArray(project.coverHistory) ? project.coverHistory.slice().reverse() : [];
    const status = project.coverStatus === "failed" ? `上次生成失败：${project.coverError || "模型未返回结果"}；未扣除积分，可重新提交。` : file ? `当前封面：${project.coverModelName || project.coverModel || "未记录模型"} · ${project.coverResolution || "JPG"} · ${project.coverUpdatedAt || ""}${project.coverPoints == null ? "" : ` · 扣${Number(project.coverPoints).toFixed(2)}积分`}` : "生成时会读取剧本和所选参考图；成功才扣除积分";
    const historyRows = history.map((record, index) => { const recordName = `${name}-第${history.length - index}次.jpg`; const points = record.estimatedPoints == null ? "积分待后台返回" : `扣${Number(record.estimatedPoints).toFixed(2)}积分`; return `<div class="visual-cover-history-row"><img loading="lazy" decoding="async" fetchpriority="low" class="open-visual-preview" data-preview-type="image" data-file="${esc(record.file || "")}" data-name="${esc(recordName)}" data-title="${esc(recordName)}" src="${media(record.file || "")}" alt="${esc(recordName)}"><div><b>第${history.length - index}次生成 · ${esc(record.modelName || record.model || "未记录模型")}</b><small>${esc(String(record.resolution || "").toUpperCase())} · ${esc(record.size || "")} · ${esc(record.createdAt || "")} · ${points}</small><div class="visual-result-actions"><button class="ghost-btn open-visual-preview" data-preview-type="image" data-file="${esc(record.file || "")}" data-name="${esc(recordName)}" data-title="${esc(recordName)}">打开预览</button><a class="secondary-btn" href="${esc(downloadMedia(record.file || "", recordName))}">下载JPG</a></div></div></div>`; }).join("");
    $("visualCoverResult").innerHTML = `<div class="visual-cover-poster">${file ? `<img loading="lazy" decoding="async" fetchpriority="low" class="open-visual-preview" data-preview-type="image" data-file="${esc(file)}" data-name="${esc(name)}.jpg" data-title="${esc(name)}" src="${media(file)}" alt="${esc(name)}">` : '<div class="visual-empty">等待生成封面</div>'}</div><div class="visual-cover-details"><label><b>封面描述补充</b><textarea id="visualCoverPrompt" class="visual-cover-prompt" placeholder="例如：突出主角正脸、婚宴夜景、产品放在前景，整体催泪悬疑">${esc(project.coverPrompt || "")}</textarea><small>为加快生成，只提交约900字剧情主线摘要与下方选中的参考图，不上传整部剧本。</small></label><div class="visual-reference-picker"><b>封面引用图（自动推荐2个人物＋1个场景，可改选产品，数量按图片模型能力）</b><div class="visual-reference-list">${options || "请先生成或上传参考图"}</div></div>${file ? `<div class="visual-result-actions"><button class="ghost-btn open-visual-preview" data-preview-type="image" data-file="${esc(file)}" data-name="${esc(name)}.jpg" data-title="${esc(name)}">放大查看</button><a class="secondary-btn" href="${esc(downloadMedia(file, `${name}.jpg`))}">下载封面JPG</a></div>` : ""}<span class="visual-task-status">${esc(status)}</span>${historyRows ? `<details class="visual-cover-history" open><summary>封面生成历史（${history.length}次）</summary><div class="visual-cover-history-list">${historyRows}</div></details>` : ""}</div>`;
    $("generateVisualCover").textContent = ModelPresentation.pendingImageRecovery(project,'/api/visual/cover/generate')?'继续领取原海报':file ? "重新生成海报" : "一键生成海报";
  }
  function syncAssetHistoryVisibility(projectId=state.project?.id) {
    const box=$('visualAssetHistory'),button=$('toggleVisualAssetHistory');if(!box||!button)return;
    const expanded=assetHistoryExpanded.get(projectId)===true;
    box.hidden=!expanded;box.classList.toggle('hidden',!expanded);
    button.textContent=expanded?'收起记录':'显示记录';button.setAttribute('aria-expanded',String(expanded));
  }
  function renderAssetHistory(project) { const items = Array.isArray(project.assetTrash) ? project.assetTrash.slice().reverse() : []; const node = $("visualAssetHistory"); if (!node) return; node.innerHTML = items.length ? items.map(item => `<div class="visual-asset-history-item"><span class="visual-origin-badge">${item.deletedKind === "people" ? "人物" : item.deletedKind === "scenes" ? "场景" : "物品"}</span><b>${esc(item.name || "未命名素材")}</b><small>删除于 ${esc(item.deletedAt || "")}</small><button class="secondary-btn restore-asset" data-kind="${esc(item.deletedKind || "")}" data-asset-id="${esc(item.id || "")}">恢复</button></div>`).join("") : '<div class="visual-empty">暂无删除记录</div>'; syncAssetHistoryVisibility(project.id); }
  function displayStoryboard(value) {
    let result = String(value || "");
    result = result.replace(/【原剧本·逐字锁定】[\s\S]*?(?=\[出镜角色-物品-场景\][：:]|【镜头】|$)/, "");
    for (const heading of ["本集剧情任务", "承接上集状态", "声音", "尾钩", "视觉风格", "本集全局执行规则", "视频生成提示词"]) {
      result = result.replace(new RegExp(`【${heading}】[\\s\\S]*?(?=【[^\\n]+】|$)`, "g"), "");
    }
    result = result.replace(/^结束状态：[^\n]*\n?/gm, "");
    return result.replace(/\n{3,}/g, "\n\n").trim();
  }
  function projectStyleSpec(project = state.project) {
    const id = project?.style || project?.settings?.style || "live_action";
    return state.styles.find(item => item.id === id) || (project?.settings?.styleSpec?.id === id ? project.settings.styleSpec : null);
  }
  function projectStyleMarkup(project = state.project) {
    return ''; // Style now lives in the editable episode prompt, not a read-only card.
  }
  function projectStyleEditorText(text, record) {
    if(record?.videoPromptStyleEditable||record?.promptStyleEditable||/【(?:本项目视频生成风格|项目视觉风格)[^】]*】/.test(text))return text;
    const style=projectStyleSpec();
    if(!style?.prompt)return text;
    const block=`【本项目视频生成风格】${style.name}\n${style.prompt}${style.negative?`\n避免：${style.negative}`:''}`;
    return text.trim()?`${text.trim()}\n\n${block}`:block;
  }
  function episodeVideoPlayer(file, name, compact=false) {
    const poster = `/api/visual/video-preview?projectId=${encodeURIComponent(state.project?.id || '')}&file=${encodeURIComponent(file)}`;
    return `<div class="episode-video-player${compact?' compact':''}"><video controls controlslist="nodownload" preload="none" poster="${esc(poster)}" src="${esc(media(file))}"></video>${compact?'':`<a class="episode-player-download" href="${esc(downloadMedia(file,name))}" download="${esc(name)}" aria-label="下载当前视频">↓ 下载视频</a>`}</div>`;
  }
  function pendingEpisodeCard(cut) {
    const draft = {id:`draft-${cut.number}`,number:cut.number,durationSeconds:cut.durationSeconds,
      durationMode:cut.durationMode,maxSeconds:cut.maxSeconds,pacingPlan:cut.pacingPlan,
      sourceText:cut.sourceText,storyboard:"",videoPrompt:"",status:"draft"};
    const container = document.createElement("div");
    container.innerHTML = episodeCard(draft);
    const card = container.firstElementChild;
    card.classList.add("visual-episode-draft");
    card.querySelectorAll(".episode-select,.episode-local-settings input,.episode-local-settings select,.frame-generate,.video-generate,.episode-reference-upload,.episode-reference-remove").forEach(control => { control.disabled = true; });
    card.querySelector(".visual-episode-storyboard .visual-empty").textContent = "可直接输入并免费保存描述词草稿；尚未补齐 AI 分镜不影响编辑。";
    card.querySelector(".visual-output-box").textContent = "本集分镜补齐后，即可生成首帧或视频";
    card.querySelector(".visual-task-status").textContent = "尚未补齐分镜；仅首帧与视频生成暂不可用，描述词可直接编辑保存。";
    return card.outerHTML;
  }
  function renderEpisodeCards(project) {
    const episodes = project.episodes || [];
    const cuts = project.scriptCuts || [];
    $("visualEpisodes").innerHTML = cuts.length ? cuts.map(cut => {
      const episode = currentEpisode(project,cut.number);
      return episode ? episodeCard(episode) : pendingEpisodeCard(cut);
    }).join("") : episodes.length ? episodes.map(episodeCard).join("") : '<div class="visual-empty">尚未切割剧集。请先在第2步完成切割。</div>';
    document.querySelectorAll('.visual-episode-card:not(.visual-episode-draft)').forEach(node => {
      const item = episodes.find(row => row.id === node.dataset.episode);
      if (item) syncDurationControl(node.querySelector('.episode-video-duration'),node.querySelector('.episode-video-model').value,episodeVideoSettings(item).duration);
      node.querySelectorAll('.video-reset').forEach(button => {
        button.textContent = '解除并重新生成';
        button.title = '解除本机对旧任务的等待，并按当前设置创建新任务';
      });
    });
    updateStoryboardButton(project);
    syncVideoObservers(project);
  }
  function renderStoryboardPreview(preview) {
    const number = Number(preview?.number);
    if (!Number.isInteger(number) || number < 1 || !preview?.storyboard) return false;
    const row = [...$("visualEpisodes").querySelectorAll(".visual-episode-card")].find(item => Number(item.dataset.cutNumber) === number);
    const pane = row?.querySelector(".visual-episode-storyboard");
    if (!pane) return false;
    $("visualEpisodes")._renderSignature251=null;
    if (pane.querySelector('.reference-mention-panel')) {
      // A failed project-state read must never replace the editable pane with
      // a temporary AI preview and erase text being typed during polling.
      let badge=pane.querySelector('.visual-preview-badge');
      if (!badge) {badge=document.createElement('small');badge.className='visual-preview-badge';pane.querySelector('h4').after(badge);}
      badge.textContent='AI 分镜已返回临时预览，正在核对保存状态；手写草稿保留。';
      return true;
    }
    pane.innerHTML = `<h4>右侧 · 第${number}段补齐后的标准分镜</h4><small class="visual-preview-badge">已返回 · 全剧完成前为临时预览</small><pre>${esc(displayStoryboard(preview.storyboard))}</pre>${projectStyleMarkup()}`;
    return true;
  }
  function renderCutPreview(cuts) {
    if (!Array.isArray(cuts) || !cuts.length) return;
    $("visualEpisodes")._renderSignature251=null;
    $("visualEpisodes").innerHTML = cuts.map(pendingEpisodeCard).join("");
    $("visualEpisodes").querySelectorAll('.visual-episode-card').forEach(node=>{node.dataset.cutPreview='true';});
    $("visualEpisodes").querySelectorAll(".visual-task-status").forEach(node => {
      node.textContent = "切割原文已返回 · 临时预览，等待全剧校验";
    });
    $("visualEpisodeCount").textContent = `已返回${cuts.length}段原文 · 全剧切割中`;
  }
  async function syncCompletedEpisodeCards(previews, synced, completedEpisodes=0) {
    const incoming = (previews || []).filter(item => !synced.has(Number(item.number)));
    // Some progress receipts contain only a count, or a truncated preview
    // list. Committed cards must come from the manifest, not that preview list.
    if ((!incoming.length&&Number(completedEpisodes)<=synced.size) || !state.project?.id) return;
    const projectId = state.project.id, revision=cutRevision(state.project),readEpoch=++projectReadEpoch;
    const response = await fetch(`/api/visual/project?id=${encodeURIComponent(projectId)}`, {cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "已完成视频卡暂时无法读取");
    if (!sameCut(projectId,revision)||readEpoch!==projectReadEpoch) return;
    if (cutRevision(data.project)!==revision) {await reloadProject();return;}
    state.project = data.project;
    for (const saved of currentEpisodes(data.project)) {
      const number=Number(saved.number);
      if(synced.has(number)||!String(saved.storyboard||'').trim())continue;
      const card = [...$("visualEpisodes").querySelectorAll(".visual-episode-card")].find(item => Number(item.dataset.cutNumber) === number);
      if (!card) continue;
      card.outerHTML = episodeCard(saved);
      const replacement = document.querySelector(`.visual-episode-card[data-episode="${CSS.escape(saved.id)}"]`);
      if (replacement) syncDurationControl(replacement.querySelector('.episode-video-duration'),episodeVideoSettings(saved).model,episodeVideoSettings(saved).duration);
      synced.add(number);
    }
    syncVideoObservers(data.project);
    updateEstimate();
    setWorkflowStage(state.workflowStage,{force:true});
  }
  const assetDrafts = new Map(), assetDraftBaselines = new WeakMap();
  const assetDraftFields = {prompt:'.visual-asset-prompt',imageRouteType:'.asset-image-route',imageModel:'.asset-image-model',appearanceType:'.asset-appearance-type',eyeMask:'.asset-eye-mask input',selected:'.asset-select'};
  const assetDraftKey = (projectId,kind,id) => JSON.stringify([projectId,kind,id]);
  function enhanceAssetHistory(project) {
    document.getElementById('visualAlignmentWarning')?.remove();
    if(project.workflowAlignmentWarning){
      const warning=document.createElement('div');warning.id='visualAlignmentWarning';warning.className='visual-alignment-warning';warning.setAttribute('role','alert');warning.textContent=String(project.workflowAlignmentWarning);
      document.getElementById('visualStageStatus')?.before(warning);
    }
    const background=project.workflowAssetAnalysis?.backgroundDetails;
    document.getElementById('visualBackgroundDetails')?.remove();
    if(Array.isArray(background)&&background.length){
      const details=document.createElement('details');details.id='visualBackgroundDetails';details.className='visual-background-details';
      details.innerHTML=`<summary>场景细节（${background.length}项，未单独建立参考图）</summary><p>需要独立参考图的项目，可用上方“自定义人物 / 场景 / 物品”手动添加。</p>${background.map(row=>`<p><b>${esc(row.name||'场景细节')}</b> ${esc(row.description||row.evidence||row.reason||'')}</p>`).join('')}`;
      document.getElementById('visualAssetHistory')?.parentElement?.append(details);
    }
    for(const node of document.querySelectorAll('.visual-card')){
      const item=project.assets?.[node.dataset.kind]?.find(row=>row.id===node.dataset.id);if(!item)continue;
      syncAssetReset240(node,item,state.activeAssetJobs.get(`${node.dataset.kind}:${item.id}`));
      const busy=['running','needs_review'].includes(item.status)||state.activeAssetJobs.get(`${node.dataset.kind}:${item.id}`)?.active;
      const pending=['running','needs_review'].includes(item.status)&&!state.activeAssetJobs.get(`${node.dataset.kind}:${item.id}`)?.active;
      if(pending&&!node.querySelector('.asset-recovery-tools')){const tools=document.createElement('div');tools.className='asset-recovery-tools';tools.innerHTML=`<button type="button" class="secondary-btn asset-observe">${item.imageGeneration?.resultUrl&&item.imageGeneration?.billingStatus==='succeeded'?'重试保存原图片':'接回原图片（免费）'}</button>`;node.querySelector('.visual-card-body').append(tools);}
      const history=Array.isArray(item.imageHistory)?item.imageHistory:[];if(!history.length)continue;
      const historySignature=JSON.stringify([history,item.imageFile,busy]);
      const previousHistory=node.querySelector('.asset-image-history');
      if(previousHistory?._renderSignature251===historySignature)continue;
      previousHistory?.remove();
      const box=document.createElement('details');box.className='asset-image-history';
      box._renderSignature251=historySignature;
      box.innerHTML=`<summary>图片版本（${history.length}）</summary><div class="asset-image-history-list">${history.slice().reverse().map((row,index)=>{const file=row.imageFile||row.file||'',selected=file===item.imageFile,name=`${item.name}-历史${history.length-index}.jpg`,time=typeof row.createdAt==='number'?new Date(row.createdAt*1000).toLocaleString('zh-CN'):row.createdAt||'';return `<article class="asset-image-history-item">${file?`<img loading="lazy" decoding="async" fetchpriority="low" class="open-visual-preview" src="${esc(media(file))}" data-preview-type="image" data-file="${esc(file)}" data-name="${esc(name)}" data-title="${esc(item.name)}" alt="${esc(item.name)} 历史图">`:''}<small>${esc(row.modelName||row.imageModelName||row.source==='uploaded'&&'用户上传'||'历史图片')} · ${esc(time)}</small>${file?`<a class="secondary-btn" href="${esc(downloadMedia(file,name))}">下载</a><button type="button" class="ghost-btn asset-history-select" data-history-file="${esc(file)}" ${selected||busy?'disabled':''}>${selected?'当前选用':'使用此图（免费）'}</button>`:''}</article>`;}).join('')}</div>`;
      node.querySelector('.visual-card-body').append(box);
    }
  }
  function assetDraftValues(node) {
    const values={};
    for(const [key,selector] of Object.entries(assetDraftFields)){
      const field=node.querySelector(selector);
      if(field)values[key]=key==='eyeMask'||key==='selected'?Boolean(field.checked):String(field.value);
    }
    return values;
  }
  function captureAssetDrafts() {
    for(const node of document.querySelectorAll('.visual-card')){
      captureCharacterSpeech251(node);
      const projectId=node.dataset.projectId;
      if(!projectId)continue;
      const key=assetDraftKey(projectId,node.dataset.kind,node.dataset.id),values=assetDraftValues(node),baseline=assetDraftBaselines.get(node);
      if(!baseline)continue;
      const changed={};
      for(const field of Object.keys(values))if(field==='selected'||values[field]!==baseline[field])changed[field]=values[field];
      assetDrafts.set(key,changed);
    }
  }
  function restoreAssetDrafts(project) {
    for(const node of document.querySelectorAll('.visual-card')){
      // A retained card keeps its original saved baseline. Rebasing it on its
      // own unsaved controls would discard the draft on the next true redraw.
      if(assetDraftBaselines.has(node))continue;
      node.dataset.projectId=project.id;
      const key=assetDraftKey(project.id,node.dataset.kind,node.dataset.id),baseline=assetDraftValues(node),draft=assetDrafts.get(key) || {},remaining={};
      assetDraftBaselines.set(node,baseline);
      if(draft.imageRouteType || Object.hasOwn(draft,'imageModel')){
        const selected=Object.hasOwn(draft,'imageModel')?draft.imageModel:baseline.imageModel;
        const route=activeRoute234('image',modelRoute234('image',selected,draft.imageRouteType || baseline.imageRouteType));
        const model=node.querySelector('.asset-image-model'),routeSelect=node.querySelector('.asset-image-route');
        if(routeSelect)routeSelect.value=route;
        if(model)model.innerHTML=imageModelOptions(selected,route);
      }
      for(const [field,value] of Object.entries(draft)){
        const control=node.querySelector(assetDraftFields[field]);
        if(!control || (field!=='selected' && value===baseline[field]))continue;
        if(field==='selected'||field==='eyeMask')control.checked=value;
        else if(control.closest('.asset-speech-control249'))setSpeechValue249(control,value);
        else {
          // A removed model remains explicit; never silently fall back to a
          // different billable model when the catalog changes mid-edit.
          if(field==='imageModel' && value && ![...control.options].some(option=>option.value===value)){
            const option=document.createElement('option');option.value=value;option.textContent='原选模型已下架（请重新选择）';option.disabled=true;control.append(option);
          }
          control.value=value;
        }
        remaining[field]=value;
      }
      assetDrafts.set(key,remaining);
      const quote=node.querySelector('.asset-image-quote');
      if(quote)quote.textContent=imageModelQuoteText(node.querySelector('.asset-image-model')?.value);
    }
  }
  function sourceVisualSignature251(project){return JSON.stringify([project?.id,project?.scriptGenerationId,project?.assets,project?.assetTrash,project?.episodes,project?.scriptCuts,project?.macroArrangement,project?.settings,project?.coverFile,project?.coverHistory,project?.coverPrompt,project?.workflowAssetAnalysis,project?.workflowAlignmentWarning]);}
  function refreshCardModelCatalog234() {
    if(!state.project)return;
    for(const control of document.querySelectorAll('.asset-image-route')){
      const select=control.closest('.asset-local-model')?.querySelector('.asset-image-model,#coverImageModel');
      if(!select)continue;
      const route=activeRoute234('image',modelRoute234('image',select.value,control.value));
      control.innerHTML=routeOptions234('image',route);
      select.innerHTML=imageModelOptions(select.value,route);
      const quote=control.closest('.asset-local-model')?.querySelector('.asset-image-quote');
      if(quote)quote.textContent=imageModelQuoteText(select.value);
    }
    const episodes=new Map((state.project.episodes||[]).map(item=>[item.id,item]));
    for(const node of document.querySelectorAll('.visual-episode-card[data-episode]')){
      const item=episodes.get(node.dataset.episode),select=node.querySelector('.episode-video-model'),control=node.querySelector('.episode-video-route');
      if(!item||!select||!control)continue;
      const route=activeRoute234('video',modelRoute234('video',select.value,control.value));
      control.innerHTML=routeOptions234('video',route);
      select.innerHTML=episodeModelOptions({...item,videoSettings:{...item.videoSettings,videoModel:select.value,videoRouteType:route}});
    }
  }
  function setSectionMarkup251(node,signature,markup){
    if(node._renderSignature251===signature)return false;
    node.innerHTML=markup();node._renderSignature251=signature;return true;
  }
  function render(project,{sourceSaveOnly=false}={}) {
    // Only activateProject may adopt a project and bind its original/draft.
    // A late receipt must not claim an unbound editor or switch its provenance.
    if(!project?.id || state.sourceProjectId!==project.id)return;
    const generationChanged=state.project?.id===project.id&&state.project?.scriptGenerationId!==project.scriptGenerationId;
    if(sourceSaveOnly&&!generationChanged&&sourceVisualSignature251(state.project)===sourceVisualSignature251(project)){
      // A source receipt updates the source/preparation only. Retain all media
      // nodes, focus and independently edited asset/video drafts.
      projectReadEpoch++;state.project=project;
      if(state.workflowStage===1)setWorkflowStage(1,{force:true});else {syncTopScenes();renderScriptAlignment(project);}
      updateSourceSaveState();return;
    }
    const preparedView=state.project?.workflowPreparedScript,incomingPreparation=project.workflowPreparedScript;
    if(state.project?.id===project.id&&!generationChanged&&Number(preparedView?.metadataSeparationVersion)>=201&&Number(incomingPreparation?.version)<Number(preparedView.version)&&preparedView.originalSourceHash&&preparedView.originalSourceHash===incomingPreparation.originalSourceHash&&storedProjectSource(state.project)===storedProjectSource(project)){
      // Asset/settings replies can still carry the old stored preparation.
      // Keep the source-bound repaired view while adopting all new assets.
      project={...project,workflowPreparedScript:preparedView};
    }
    if(generationChanged){
      macroSnapshots.delete(project.id);state.macroViewingId='';macroInlineView?.destroy();macroInlineView=null;
      topSceneDirectory?.select(0,false);
    }
    captureAssetDrafts();
    assetCardNodes231.clear();
    projectReadEpoch++;state.project=project;localStorage.setItem('dramaVisualProjectId',project.id);
    for(const [id,kind] of [['visualPeople','people'],['visualScenes','scenes'],['visualProps','props']]){
      const signature=JSON.stringify([project.id,project.assets[kind],project.settings,kind==='people'?[...characterVariantSelection].filter(([key])=>key.startsWith(project.id+':')):null]);
      setSectionMarkup251($(id),signature,()=>kind==='people'?characterRoots(project).map(characterCard).join(''):(project.assets[kind]||[]).map(item=>card(item,kind)).join(''));
    }
    const historySignature=JSON.stringify([project.id,project.assetTrash]);
    if($('visualAssetHistory')._renderSignature251!==historySignature){renderAssetHistory(project);$('visualAssetHistory')._renderSignature251=historySignature;}
    const coverSignature=JSON.stringify([project.id,project.coverFile,project.coverHistory,project.coverPrompt,project.assets,project.settings]);
    if($('visualCoverResult')._renderSignature251!==coverSignature){renderCover(project);$('visualCoverResult')._renderSignature251=coverSignature;}
    const episodeSignature=JSON.stringify([project.id,project.scriptGenerationId,project.episodes,project.scriptCuts,project.assets,project.settings]);
    if($('visualEpisodes')._renderSignature251!==episodeSignature){renderEpisodeCards(project);$('visualEpisodes')._renderSignature251=episodeSignature;}
    $('visualPeopleCount').textContent=`${characterRoots(project).length}个`;
    $('visualSceneCount').textContent=`${project.assets.scenes.length}个`;
    $('visualPropCount').textContent=`${project.assets.props.length}个`;
    $('visualEpisodeCount').textContent=`已切割${project.scriptCuts?.length || project.episodes.length}段 · 已完成${currentEpisodes(project).length}张视频卡`;
    updateEstimate();restoreAssetDrafts(project);renderPointsUsage(state.pointsUsage || {});setWorkflowStage(state.workflowStage,{force:true});
    $('visualStudioControls').classList.remove('hidden');
    enhanceAssetHistory(project);
    window.CompactAssets205?.enhance(project);
    updateSourceSaveState();
  }
  function projectThumbnail233(item) {
    const file=String(item.thumbnailFile||''),id=String(item.id||''),relative=file.replace(/\\/g,'/');
    const available=/^[a-f0-9]{32}$/.test(id)&&relative&&!/^[\/]|[\x00-\x1f:]/.test(relative)&&!relative.split('/').includes('..')&&/\.(?:jpe?g|png|webp|gif|avif|bmp)$/i.test(relative);
    const url=available?'/api/visual/project-thumbnail?'+new URLSearchParams({projectId:id,file:relative,v:String(item.thumbnailRevision||''),fallback:'project'}).toString():'';
    const label=item.thumbnailKind==='cover'?'项目海报':item.thumbnailKind==='frame'?'视频画面':'资产预览';
    return `<figure class="visual-project-preview233" data-preview-state="${url?'loading':'empty'}">${url?`<img src="${esc(url)}" width="480" height="300" loading="lazy" decoding="async" fetchpriority="low" alt="${esc(item.projectName||'未命名项目')} · ${label}">`:''}<figcaption><svg viewBox="0 0 48 36" aria-hidden="true"><rect x="2" y="2" width="44" height="32" rx="4"></rect><circle cx="15" cy="12" r="4"></circle><path d="m4 29 12-10 8 6 8-12 12 16"></path></svg><span>${url?'预览图加载中…':'暂无预览图'}</span></figcaption></figure>`;
  }
  $('visualProjectList').addEventListener('load',event=>{
    const image=event.target;if(!image.matches?.('.visual-project-preview233 img'))return;
    image.closest('.visual-project-preview233').dataset.previewState='ready';
  },true);
  $('visualProjectList').addEventListener('error',event=>{
    const image=event.target;if(!image.matches?.('.visual-project-preview233 img'))return;
    const preview=image.closest('.visual-project-preview233');preview.dataset.previewState='error';
    preview.querySelector('figcaption span').textContent='预览暂不可用';image.hidden=true;
  },true);
  function projectCard(item) {
    const count=item.cardCount??item.episodeCount??0,progress=item.videoCount?`已生成 ${item.videoCount}/${count} 个视频`:item.imageCount?`已生成 ${item.imageCount} 张参考图`:'等待生成参考图';
    return `<article class="visual-project-card" data-project-id="${esc(item.id)}">${projectThumbnail233(item)}<div class="visual-project-info233"><span>${esc(item.style || 'live_action')}</span><b>${esc(item.projectName)}</b><small>${esc(item.updatedAt || item.createdAt || '')}</small></div><p>${item.macroSceneCount?`${item.macroSceneCount}场 · `:''}${count}张视频卡 · ${item.peopleCount}人 · ${item.sceneCount}景 · ${item.propCount}物</p><div class="visual-project-progress"><i style="width:${count?Math.round(item.videoCount/count*100):0}%"></i></div><footer><span>${progress}</span><div class="visual-project-actions"><button type="button" class="secondary-btn open-visual-project">继续制作</button><button type="button" class="primary-btn project-cover-action">${item.hasCover?'查看／重做海报':'一键生成海报'}</button><button type="button" class="ghost-btn edit-visual-project">编辑设置</button><button type="button" class="danger-outline-btn delete-visual-project">删除</button></div></footer></article>`;
  }
  function setProjectCenter(open) {
    if(open)for(const video of document.querySelectorAll('#macroInlineWorkspace video,#visualEpisodes video'))try{video.pause();}catch(_){}
    document.body.classList.toggle("visual-center-view", open);
    $("visualProjectCenter").classList.toggle("hidden", !open);
    $("visualProjectCoverEditor").classList.add("hidden");
    const heading = document.querySelector(".visual-studio-intro");
    heading.querySelector("h1").textContent = open ? "短剧项目中心" : "短剧工作流";
    heading.querySelector("p").textContent = open ? "管理项目、查看制作进度，随时继续创作。" : "引用当前分镜、历史剧本或自定义剧本，制作参考图与分镜视频。";
    if (open) loadProjects();
    if (window.parent !== window) window.parent.postMessage({type:"visual-center-state", open}, location.origin);
    window.scrollTo({top:0,behavior:"smooth"});
  }
  window.addEventListener("message", event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === "visual-center-view") setProjectCenter(Boolean(event.data.open));
  });
  $("returnToVisualWorkflow").addEventListener("click", () => setProjectCenter(false));
  $("newWorkflowProject").addEventListener("click", () => newProjectWizard().catch(error=>toast(error.message,true)));
  function renderProjectCards233(items, confirmedProjectList) {
    const list=$('visualProjectList'),markup=items.map(projectCard);
    const emptyMessage='还没有短剧项目，点击“新建项目”开始创作。';
    const emptyMarkup=confirmedProjectList
      ? `<div class="visual-empty visual-project-empty270"><img src="/static/nzai-wink270.webp" alt="" width="224" height="224" loading="lazy" decoding="async" fetchpriority="low"><div><strong>N仔</strong><p>${emptyMessage}</p></div></div>`
      : `<div class="visual-empty">${emptyMessage}</div>`;
    const signature=items.length?markup.join(''):emptyMarkup;
    if(list._projectMarkup233===signature)return;
    if(!items.length){list.innerHTML=emptyMarkup;list._projectMarkup233=signature;return;}
    const existing=new Map(Array.from(list.children).filter(node=>node.matches('.visual-project-card')).map(node=>[node.dataset.projectId,node])),kept=new Set();
    items.forEach((item,index)=>{
      let card=existing.get(String(item.id));
      if(!card||card._projectMarkup233!==markup[index]){
        const template=document.createElement('template');template.innerHTML=markup[index];const next=template.content.firstElementChild;
        // A count/name/progress update does not invalidate the same thumbnail.
        const oldPreview=card?.querySelector('.visual-project-preview233'),newPreview=next.querySelector('.visual-project-preview233');
        if(oldPreview&&oldPreview.querySelector('img')?.getAttribute('src')===newPreview.querySelector('img')?.getAttribute('src')){const image=oldPreview.querySelector('img'),nextImage=newPreview.querySelector('img');if(image&&nextImage)image.alt=nextImage.alt;newPreview.replaceWith(oldPreview);}
        if(card)card.replaceWith(next);card=next;card._projectMarkup233=markup[index];
      }
      kept.add(card);const at=list.children[index];if(at!==card)list.insertBefore(card,at||null);
    });
    for(const node of Array.from(list.children))if(!kept.has(node))node.remove();
    list._projectMarkup233=signature;
  }
  function renderProjects(confirmedProjectList) { const items = state.projects || []; const totalEpisodes = items.reduce((sum, item) => sum + (item.cardCount??item.episodeCount??0), 0); const active = items.filter(item => item.videoCount < (item.cardCount??item.episodeCount??0)).length; const stats=`<span><b>${items.length}</b> 个项目</span><span><b>${totalEpisodes}</b> 张视频卡</span><span><b>${active}</b> 个制作中</span>`;if($('visualProjectStats')._projectMarkup233!==stats){$('visualProjectStats').innerHTML=stats;$('visualProjectStats')._projectMarkup233=stats;}renderProjectCards233(items,confirmedProjectList); }
  async function loadProjects() { try { const response = await fetch("/api/visual/projects", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "无法读取短剧项目"); state.projects = data.projects || []; renderProjects(Array.isArray(data.projects)); } catch (error) { const list=$("visualProjectList");list._projectMarkup233=null;list.innerHTML = `<div class="visual-empty">${esc(error.message)}</div>`; } }
  async function readProject223(id) {
    const abort=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error('项目读取暂时超时，当前已打开的内容仍保留，请稍后重试。'));},20000);});
    const read=(async()=>{
      const response=await fetch(`/api/visual/project?id=${encodeURIComponent(id)}&view=workspace`,{cache:'no-store',signal:abort.signal});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'无法打开视觉项目');
      if(data.project?.id!==id)throw new Error('读取结果与所选项目不一致，未切换项目。');
      return data;
    })();
    try{return await Promise.race([read,timeout]);}finally{clearTimeout(timer);}
  }
  async function openProject(id) {
    if(!await confirmDiscardSource('打开其他项目'))return;
    const context=sourceEditorContext(),epoch=++sourceReadEpoch;
    try {
      await settingsSaveQueue.catch(() => {});
      const data = await readProject223(id);
      if(sourceReadEpoch!==epoch || context.sourceText!==String($('visualSource').value||''))return;
      try { activateProject(data.project); }
      catch (error) { toast('已读取项目，打开界面时出错：'+error.message,true); return; }
      $("visualSourceHint").textContent = `已打开项目：${data.project.projectName}`;
      setProjectCenter(false);
      $("visualWorkflowSteps").scrollIntoView({behavior:"smooth",block:"start"});
    } catch (error) { if(sourceReadEpoch===epoch&&context.sourceText===String($('visualSource').value||''))toast(error.message, true); }
  }
  async function openCoverEditor(id) {
    if(!await confirmDiscardSource('打开项目海报'))return;
    const context=sourceEditorContext(),epoch=++sourceReadEpoch;
    try {
      await settingsSaveQueue.catch(() => {});
      const response = await fetch(`/api/visual/project?id=${encodeURIComponent(id)}`, {cache:"no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法打开项目海报");
      if(sourceReadEpoch!==epoch || context.sourceText!==String($('visualSource').value||''))return;
      activateProject(data.project);
      $("visualCoverProjectName").textContent = `《${data.project.projectName}》· 海报制作`;
      $("visualProjectCoverEditor").classList.remove("hidden");
      $("visualProjectCoverEditor").scrollIntoView({behavior:"smooth",block:"start"});
    } catch (error) { toast(error.message, true); }
  }
  async function deleteProject(id) {
    const item=state.projects.find(project=>project.id===id);
    if(!item||!await studioConfirm(`确定删除视觉项目《${item.projectName}》吗？\n\n删除后从项目中心移除；没有待核对历史订单时，本机项目及素材会删除，无法恢复。如有待核对历史订单，将保留本地归档供核对，不代表取消上游或退款。正在执行的任务需结束后再删除。`))return;
    try{
      const data=await post('/api/visual/project/delete',{projectId:id});
      if(state.project?.id===id){
        sourceReadEpoch++;projectReadEpoch++;sourceBindingEpoch226++;clearTimeout(sourceAutosaveTimer);
        macroInlineView?.destroy();macroInlineView=null;macroSnapshots.delete(id);state.macroViewingId='';
        legacyCardsView231?.destroy();legacyCardsView231=null;
        sourceAutosavePending.delete(id);assetCardNodes231.clear();
        state.project=null;state.sourceProjectId='';state.sourceBaseline='';$('visualSource').value='';
        localStorage.removeItem('dramaVisualProjectId');$('visualStudioControls').classList.add('hidden');
        $('workflowSceneStart').hidden=true;$('macroInlineWorkspace').hidden=true;topSceneDirectory?.setData(null,{});
        $('visualSourceHint').textContent='当前项目已移除，可选择剧本重新新建。';
      }
      await loadProjects();toast(data.message||'视觉项目已从项目中心移除。');
    }catch(error){toast(error.message,true);}
  }
  async function reloadProject() {
    const projectId=state.project?.id,revision=cutRevision(state.project),readEpoch=++projectReadEpoch;
    if(!projectId)return;
    const response=await fetch(`/api/visual/project?id=${encodeURIComponent(projectId)}`,{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'读取视觉项目失败');
    // A newer read or render wins, even if this older HTTP response arrives last.
    if(readEpoch===projectReadEpoch&&sameCut(projectId,revision)&&data.project?.id===projectId)render(data.project);
    await loadProjects();
  }
  const assetReloads231=new Map();
  function reloadAssetProject231(projectId){
    if(state.project?.id!==projectId)return Promise.resolve();
    if(assetReloads231.has(projectId))return assetReloads231.get(projectId);
    // Many independent images can lose their read reply together on a weak
    // connection. One local read reconciles those owners; it never resubmits.
    const work=new Promise(resolve=>setTimeout(resolve,60)).then(()=>state.project?.id===projectId?reloadProject():undefined);
    assetReloads231.set(projectId,work);const clear=()=>{if(assetReloads231.get(projectId)===work)assetReloads231.delete(projectId);};work.then(clear,clear);return work;
  }
  // The host asset library reads only this small explicit context. A library
  // reply never activates a different project or initiates a model call.
  window.AssetLibraryVisual228 = {
    current:()=>({projectId:state.project?.id||'',projectName:state.project?.projectName||''}),
    refresh:async projectId=>{if(state.project?.id===projectId)await reloadProject();}
  };
  function installLocalAssetMatch228(){
    const toolbar=$('visualAssetPrimaryActions');if(!toolbar||$('matchLocalAssets228'))return;
    const button=document.createElement('button');button.id='matchLocalAssets228';button.type='button';button.className='secondary-btn';button.textContent='匹配本地资产';
    toolbar.insertBefore(button,toolbar.firstChild);
    let reviewLoad=null;
    const busyTargets=()=>[...(state.activeAssetJobs?.entries?.()||[])].filter(([_key,job])=>job?.active===true).map(([key])=>key);
    const loadReview=()=>{
      if(window.AssetMatch230)return Promise.resolve(window.AssetMatch230);
      if(reviewLoad)return reviewLoad;
      reviewLoad=new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src='/static/asset_match230.js';
        const fail=message=>{clearTimeout(timer);reviewLoad=null;script.remove();reject(Error(message));};
        const timer=setTimeout(()=>fail('匹配预览读取超时，请重试。'),10000);
        script.onload=()=>{clearTimeout(timer);if(window.AssetMatch230)resolve(window.AssetMatch230);else fail('匹配预览未能打开，请重试。');};
        script.onerror=()=>fail('匹配预览未能读取，请重试。');
        document.head.append(script);
      });
      return reviewLoad;
    };
    button.addEventListener('click',async()=>{
      const projectId=state.project?.id;if(!projectId)return toast('请先打开一个视觉项目。',true);
      if(state.assetRecognitionBusy)return toast('请先等待资产提取结束；已有图片任务不影响其他资产的匹配。',true);
      if(button.dataset.busy==='1')return;button.dataset.busy='1';button.disabled=true;
      const request=async(path,body)=>{const abort=new AbortController();let timer;const limit=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('本地资产匹配等待超时，请重新核对；没有自动重复提交。'));},30000);});try{return await Promise.race([(async()=>{const response=await fetch('/api/asset-library/'+path,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:abort.signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok||data.error)throw Error(data.error||'本地资产操作未完成');return data;})(),limit]);}finally{clearTimeout(timer);}};
      try{
        const queued=busyTargets(),data=await request('matches?projectId='+encodeURIComponent(projectId)+(queued.length?'&busyTargets='+encodeURIComponent(JSON.stringify(queued)):''));if(state.project?.id!==projectId)return;
        const total=Number(data.totalAssets||0),matched=Number(data.matchedAssets||0),remaining=Number(data.unmatchedAssets??Math.max(0,total-matched));
        const indexing=!!(data.libraryStatus&&(data.libraryStatus.active||data.libraryStatus.scanning||data.libraryStatus.indexing||Number(data.libraryStatus.pendingProjects)>0));
        if(!data.matchToken)throw Error('匹配结果缺少确认凭据，请重新匹配。');
        let decision=null;
        if(Array.isArray(data.targets)){
          const review=await loadReview();if(state.project?.id!==projectId)return;
          decision=await review.review(data,{projectId,projectName:state.project.projectName||'',isCurrent:()=>state.project?.id===projectId,busyTargets});
          if(!decision)return;
          const protectedKeys=new Set(busyTargets());
          if(decision.selections.some(row=>protectedKeys.has(row.targetKey)))throw Error('部分所选资产已进入图片任务，请重新匹配；其他资产不受影响。');
        }else{
          if(!matched)return toast(`本项目共 ${total} 项资产，暂未找到可直接继承的图片；${indexing?'历史图片还在后台整理，可稍后再次匹配；本次不会自动生成。':'可自行选择需要生成的资产。'}`);
          if(!await studioConfirm(`本项目共 ${total} 项资产，找到 ${matched} 项可复用图片。\n\n是否继承这些本地图片？\n剩余 ${remaining} 项由你自行选择生成，本次不会自动生成。${indexing?'\n\n历史图片还在后台整理，之后可再次匹配更多记录。':''}`,{title:'匹配本地资产'}))return;
        }
        if(state.project?.id!==projectId)return;
        const result=await request('inherit',{projectId,matchToken:data.matchToken,...(decision||{})});
        if(state.project?.id!==projectId)return;
        if(result.project?.id===projectId)render(result.project);else await reloadProject();
        toast(result.message||`已继承 ${Number(result.inheritedAssets??result.inheritedCount??result.appliedCount??matched)} 项本地图片。其余资产可自行选择生成。`);
      }catch(error){if(state.project?.id===projectId)toast(error.message,true);}
      finally{button.dataset.busy='0';button.disabled=false;}
    });
  }
  async function loadExistingProject() {
    const id=localStorage.getItem('dramaVisualProjectId');if(!id)return;
    if(state.project?.id===id&&state.sourceProjectId===id)return;
    const context=sourceEditorContext();
    try{
      const response=await fetch(`/api/visual/project?id=${encodeURIComponent(id)}&view=workspace`,{cache:'no-store'});
      if(!response.ok)return;const data=await response.json();
      if(data.project?.id===id && sameSourceEditor(context)){
        activateProject(data.project);renderScriptAlignment(data.project);
        $('visualSourceHint').textContent='已恢复上次视觉制作项目，可继续单独或批量生成。';
      }
    }catch(_){}
  }
  function episodeDuration(item) { const actual = Number(item.durationSeconds); return Number.isFinite(actual) && actual > 0 ? actual : Number($("visualVideoDuration").value); }
  function updateEstimate() {
    if (!state.project) return;
    enhanceProjectUI();
    const model = selectedModel("video"), resolution = $("visualResolution").value, tier = selectedTier("video");
    const quotes = currentEpisodes(state.project).map(item => { const local = episodeVideoSettings(item), node = document.querySelector(`.visual-episode-card[data-episode="${CSS.escape(item.id)}"]`), localModel = node?.querySelector(".episode-video-model")?.value || local.model, localResolution = node?.querySelector(".episode-video-resolution")?.value || local.resolution, localTier = node?.querySelector(".episode-video-model")?.selectedOptions[0]?.dataset.tier || local.tier, duration = chosenEpisodeDuration(item, node); return adaptiveVideoIssue(item,localModel,duration,localResolution) || videoCapabilityIssue(localModel, duration, localResolution) ? null : ModelPresentation.quote(state.profile, localModel, localResolution, duration, localTier,chosenEpisodeRatio(item,node)); });
    const seconds = currentEpisodes(state.project).reduce((sum, item) => sum + chosenEpisodeDuration(item, document.querySelector(`.visual-episode-card[data-episode="${CSS.escape(item.id)}"]`)), 0);
    const configured = configuredVideoDuration($("visualVideoDuration")), preview = ModelPresentation.quote(state.profile, model, resolution, configured, tier,$("visualVideoRatio").value);
    $("visualVideoQuote").textContent = (videoCapabilityIssue(model, configured, resolution) || (ModelPresentation.isLiveQuote(state.profile,'video',model)?'实时核价 · 生成前按本集实际输入取得报价并确认':preview ? `备用${configured}秒预计${preview.points}积分${preview.billingMode === 'flat' ? '/次' : ''} · ¥${preview.cost.toFixed(2)}` : "该模型/分辨率尚未配置计费标准")) + (ModelPresentation.activityWarning(state.profile,model,resolution) ? ` · ${ModelPresentation.activityWarning(state.profile,model,resolution)}` : '');
    document.querySelectorAll(".visual-episode-card").forEach(node => {
      const item = state.project.episodes.find(item => item.id === node.dataset.episode);
      if (!item) return;
      let badge = node.querySelector(".episode-video-quote");
      if (!badge) { badge = document.createElement("small"); badge.className = "episode-video-quote"; node.querySelector(".video-generate").insertAdjacentElement("afterend", badge); }
      // The quote belongs to the live controls in this episode card.  Do not
      // read the previously saved project/default model after the user changes
      // the dropdown, otherwise a mini selection can still show the full-model price.
      const modelSelect = node.querySelector(".episode-video-model");
      const resolutionSelect = node.querySelector(".episode-video-resolution");
      const local = episodeVideoSettings(item);
      const localModel = modelSelect?.value || local.model || model;
      const localResolution = resolutionSelect?.value || local.resolution || resolution;
      const localTier = modelSelect?.selectedOptions[0]?.dataset.tier || local.tier || tier;
      const localDuration = chosenEpisodeDuration(item, node), localRatio = chosenEpisodeRatio(item, node);
      const quote = ModelPresentation.quote(state.profile, localModel, localResolution, localDuration, localTier,localRatio);
      const issue = adaptiveVideoIssue(item,localModel,localDuration,localResolution) || videoCapabilityIssue(localModel, localDuration, localResolution,localRatio);
      const presentation = ModelPresentation.catalog(state.profile, "video", state.project?.settings || {}).find(value => value.id === localModel);
      const displayName = presentation?.name || localModel || "未选模型";
      badge.textContent = (issue || (ModelPresentation.isLiveQuote(state.profile,'video',localModel)?`${displayName} · ${localResolution.toUpperCase()} · 生成${localDuration}秒 · 实时核价，生成前确认`:quote ? `${displayName} · ${localResolution.toUpperCase()} · 生成${localDuration}秒 · ${window.AspectRatio?.label(localRatio)||localRatio} · 本集预计${quote.points}积分${quote.billingMode === 'flat' ? '/次' : ''} / ¥${quote.cost.toFixed(2)}` : `${displayName} · ${localResolution.toUpperCase()} · 生成${localDuration}秒 · ${window.AspectRatio?.label(localRatio)||localRatio} · 尚未配置计费标准`)) + (ModelPresentation.activityWarning(state.profile,localModel,localResolution) ? ` · ${ModelPresentation.activityWarning(state.profile,localModel,localResolution)}` : '');
      badge.dataset.model = localModel;
      badge.dataset.resolution = localResolution;
      refreshEpisodeVideoCompatibility(node,item);
    });
    const total = quotes.every(Boolean) ? `视频合计预计${Number(quotes.reduce((sum, quote) => sum + quote.points, 0).toFixed(2))}积分` : "部分组合尚未配置计费标准，暂不估算合计";
    const n = Object.values(state.project.assets).reduce((sum, list) => sum + list.length, 0);
    const image = ModelPresentation.imageQuote(state.profile, selectedModel("image"), $("visualImageResolution").value, n);
    const oneImage = ModelPresentation.imageQuote(state.profile, selectedModel("image"), $("visualImageResolution").value, 1);
    if ($("visualImageQuote")) $("visualImageQuote").textContent = ModelPresentation.isLiveQuote(state.profile,'image',selectedModel('image')) ? '实时核价 · 按本次提示词与引用取得报价后确认' : oneImage ? `⚡ 每生成1张扣${oneImage.points.toFixed(2)}积分 · ¥${oneImage.cost.toFixed(2)}` : "该模型/清晰度尚未配置计费标准";
    const imageName = ModelPresentation.catalog(state.profile, "image", state.project.settings).find(item => item.id === selectedModel("image"))?.name || "所选图片模型";
    const videoName = ModelPresentation.catalog(state.profile, "video", state.project.settings).find(item => item.id === model)?.name || "所选视频模型";
    const imageEstimate = image ? `参考资产图 ${imageName} / ${$("visualImageResolution").value} 预计${image.points}积分 / ¥${image.cost.toFixed(2)}` : "参考资产图尚未配置模型报价";
    $("visualEstimate").setAttribute("role", "status");
    $("visualEstimate").textContent = "";
    CreditGate.recalculate?.();
  }
  function renderScriptAlignment(project) {
    const panel=$('visualScriptAlignment');if(!panel)return;
    const record=project?.workflowScriptAlignment;
    panel.hidden=!record?.executionSource;if(panel.hidden)return;
    const normalize=value=>String(value??'').replace(/\r\n?/g,'\n').trim();
    const current=normalize($('visualSource').value)===normalize(record.originalSource);
    const summary=record.summary||{};
    $('visualScriptAlignmentSummary').textContent=current?`${summary.speakers||0}个说话人 · ${summary.utterances||0}段台词${summary.reviewCount?` · 待确认原稿第${(record.reviewLines||[]).join('、')}行`:''}`:'原稿已修改，下面仅为上次执行稿';
    $('visualScriptAlignmentText').value=record.executionSource;
  }
  $('visualSource').addEventListener('paste',()=>{const input=$('visualSource');if(!input.value.trim()||(input.selectionStart===0&&input.selectionEnd===input.value.length))markSourceReplacement();});
  $('visualSource').addEventListener('input',()=>{sourceReadEpoch++;if(!state.sourceProjectId)state.sourceUnassignedOwned269=true;if(state.project?.id)outlineReceipts206.delete(state.project.id);state.timelineModelApproval=null;renderScriptAlignment(state.project);sceneChoiceFinish?.('cancel');scheduleSourceAutosave();});
  $('visualSource').addEventListener('blur',()=>{if(sourceIsDirty())queueSourceAutosave();});
  window.addEventListener('pagehide',persistSourceDraft);
  window.addEventListener('beforeunload',event=>{persistSourceDraft();if(sourceIsDirty()){event.preventDefault();event.returnValue='';}});
  $('visualScriptAlignment')?.addEventListener('toggle',()=>renderScriptAlignment(state.project));
  function assetPartialMessage224(summary) {
    if(!summary||summary.version!==224)return '';
    const fields=['totalBatches','completedBatchCount','failedBatchCount','unsubmittedBatchCount'];
    if(fields.some(key=>!Number.isSafeInteger(summary[key])||summary[key]<0)||summary.totalBatches<1
      ||summary.completedBatchCount+summary.failedBatchCount+summary.unsubmittedBatchCount!==summary.totalBatches)return '';
    return `资产提取未全部完成：已保存${summary.completedBatchCount}/${summary.totalBatches}段，失败${summary.failedBatchCount}段，未发送${summary.unsubmittedBatchCount}段。已返回原结果与已有资产保留；再次提取会优先复用可确认的成功段，不会自动重新生成。`;
  }
  async function recognizeWorkflowAssets() {
    if(state.assetRecognitionBusy)return;
    const requestedProjectId=state.project?.id;
    if(state.project&& !await flushSourceAutosave())return;
    if(state.project?.id!==requestedProjectId)return;
    const structure = $("visualSource").value;
    if (!structure.trim()) return toast("请先引用或粘贴改写后的完整剧本。", true);
    if (state.sourceSaveBusy || state.storyboardBusy) return toast("已有剧本任务正在执行，请勿重复提交。", true);
    if (!state.project) { state.pendingSourceAction = "recognize"; return newProjectWizard(); }
    if(state.sourceProjectId!==state.project.id)return toast('原稿与当前项目不一致，请重新打开项目；未提交识别。',true);
    if (!state.recognitionPriceReady) return toast("当前识别模型尚未配置按次价格，请先选择已定价的模型。", true);
    const context=sourceEditorContext(),projectId=state.project.id;
    const recognitionPanel = $("visualRecognitionProgress");
    const recognitionSteps = [...recognitionPanel.querySelectorAll(".visual-recognition-steps span")];
    const recognitionButton = $("confirmSourceReference");
    const recognitionButtonText = recognitionButton.textContent;
    let partialSummary224 = null;
    const showRecognitionStep=(task={})=>{const phase=task.phase||'',progress=Number(task.progress||0);const index=phase==='assets_complete'?3:phase==='assets_parsing'?2:/^assets_(submitting|waiting|recovering)$/.test(phase)?1:phase==='assets_preparing'?0:progress>=100?3:progress>=85?2:progress>=10?1:0;recognitionSteps.forEach((step,i)=>step.classList.toggle('active',i===index));};
    state.assetRecognitionBusy = true;
    recognitionPanel.classList.remove("hidden");
    recognitionPanel.classList.remove("model-activity-container");
    window.ModelActivity?.set(recognitionPanel,{state:"",preserve:true});
    window.ModelActivity?.set($("visualStageStatus"),{state:"",message:""});
    window.ModelActivity?.set($("visualSourceHint"),{state:"",message:""});
    $("visualRecognitionPercent").textContent = "0%";
    $("visualRecognitionBar").style.width = "0%";
    $("visualRecognitionMessage").textContent = "任务正在提交，请保持页面开启。";
    recognitionButton.classList.remove("is-working");
    recognitionButton.textContent = "资产提取";
    window.ModelActivity?.set(recognitionButton,{state:"",preserve:true});
    recognitionButton.setAttribute("aria-busy", "true");
    requestAnimationFrame(() => recognitionPanel.scrollIntoView({behavior:"smooth",block:"center"}));
    showRecognitionStep();
    const recognitionTimer = null;
    try {
      state.storyboardBusy = true;
      $("useSource").disabled = true;
      $("confirmSourceReference").disabled = true;
      updateStoryboardButton();
      const payload = {projectId,sourceProjectId:context.sourceProjectId,sourceText:structure,regenerate:false,
        modelConfig:{provider:"server_gateway",model:$("visualRecognitionModel").value,operation:"rewrite",timeout:600}};
      let submitted = await post("/api/visual/assets/analyze", payload);
      if (submitted.alreadyRecognized) {
        const confirmation=submitted.originalRecoveryPending224
          ? '原任务尚无完整可复用结果。重新提取会发起独立的新调用并正常计费；旧调用、已返回原结果与已有资产继续保留。是否重新提取？'
          : '当前剧本已提取过资产。重新提取将按实际模型调用次数正常计费；仅更新人物、场景和物品，不改动原稿、分镜、视频卡或已有图片。是否继续？';
        if (!await studioConfirm(confirmation,{title:'确认重新提取资产',warning:true})) return;
        if(!sameSourceEditor(context))return toast('确认期间项目或原稿已变化，未再次提交。',true);
        submitted = await post("/api/visual/assets/analyze", {...payload,regenerate:true});
      }
      const data = await waitTask(submitted.taskId, task => { if(task.assetPartialSummary224)partialSummary224=task.assetPartialSummary224; if(state.project?.id!==projectId)return; const progress = Math.max(0, Math.min(100, Number(task.progress || 0))); const message = assetPartialMessage224(partialSummary224) || task.message || "正在按Skill提取人物、场景和物品…";showRecognitionStep(task); $("visualRecognitionPercent").textContent = /^assets_(waiting|recovering|submitting)$/.test(task.phase||'')?'等待模型返回':`${progress}%`; $("visualRecognitionBar").style.width = `${progress}%`; $("visualRecognitionMessage").textContent = message; });
      if(data.project?.id!==projectId)return;
      if(state.project?.id!==projectId || state.sourceProjectId!==projectId){void loadProjects();return;}
      if(!sameSourceEditor(context)){void loadProjects();return toast('资产原结果已保存；当前编辑中的剧本已变化，未覆盖编辑内容。',true);}
      render(data.project);
      setWorkflowStage(2, {scroll:true});
      window.ModelActivity?.set($("visualStageStatus"),{state:"success",message:`资产提取已完成：人物${characterRoots(data.project).length}、场景${data.assetCounts.scenes}、物品${data.assetCounts.props}。`});
      // The saved result owns this task's success. Project-center refresh is
      // independent: a slow or failed list read must not hide returned assets.
      void loadProjects();
    } catch (error) { if(state.project?.id===projectId){const message=assetPartialMessage224(error.assetPartialSummary224||partialSummary224)||`资产识别未完成：${error.message}`;window.ModelActivity?.set($("visualStageStatus"),{state:"error",message}); toast(message,true);} } finally { finishProjectWork(projectId,{assetRecognitionBusy:false,storyboardBusy:false});if(state.project?.id===projectId){ window.clearInterval(recognitionTimer); recognitionPanel.classList.add("hidden"); recognitionButton.classList.remove("is-working"); recognitionButton.removeAttribute("aria-busy"); recognitionButton.textContent = recognitionButtonText; window.ModelActivity?.set(recognitionButton,{state:"",preserve:true}); window.ModelActivity?.set($("visualSourceHint"),{state:"",preserve:true}); $("useSource").disabled=false; $("confirmSourceReference").disabled=false; updateStoryboardButton();} }
  }
  function createPlan() {
    return openMacroArrangement();
  }
  function syncCutModeDialog() {
    $("cutFixedSecondsField").classList.remove("hidden");
    $("cutFixedSeconds").disabled = false;
    const custom = document.querySelector('input[name="cutMode"]:checked')?.value === "custom";
    $("cutTargetDurationFields").classList.toggle("hidden", !custom);
    $("cutTargetDurationSection").classList.toggle("hidden", !custom);
    const preset = document.querySelector('input[name="cutTargetPreset"]:checked')?.value || "120";
    $("cutCustomDurationFields").classList.toggle("hidden", !custom || preset !== "custom");
    $("cutTargetMinutes").disabled = $("cutTargetSeconds").disabled = !custom || preset !== "custom";
    const choice = cutDurationChoice();
    $('confirmCutModeDialog').textContent=choice.scope==='all'?'开始逐集补齐整部剧':'开始补齐当前集';
    $("cutDurationSummary").textContent = choice.error || '';
    $("cutDurationSummary").hidden = !choice.error;
    $("cutDurationSummary").classList.toggle("hidden", !choice.error);
    $("confirmCutModeDialog").disabled = Boolean(choice.error) || state.storyboardBusy || !state.cutPriceReady;
  }
  function cutDurationChoice() {
    const scope=document.querySelector('input[name="storyboardScope"]:checked')?.value||'current';
    const mode = document.querySelector('input[name="cutMode"]:checked')?.value || "smart";
    const fixedSeconds = Number($("cutFixedSeconds").value || 15);
    if (!["smart", "custom"].includes(mode) || ![15, 30].includes(fixedSeconds)) return {error:"切割模式或视频分段时长无效。"};
    if (mode === "smart") return {scope,mode, fixedSeconds, requestedSeconds:0, durationMode:'adaptive'};
    const preset = document.querySelector('input[name="cutTargetPreset"]:checked')?.value || "120";
    const minuteText = $("cutTargetMinutes").value, secondText = $("cutTargetSeconds").value;
    const minutes = Number(minuteText), seconds = Number(secondText);
    if (preset === "custom" && (!String(minuteText).trim() || !String(secondText).trim()
        || !Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || seconds < 0 || seconds > 59)) return {error:"请填写有效的整数分钟与0至59秒。"};
    const requestedSeconds = preset === "custom" ? minutes * 60 + seconds : Number(preset);
    if (!Number.isInteger(requestedSeconds) || requestedSeconds < 1 || requestedSeconds > fixedSeconds * 200) return {error:`当前全剧目标时长应为1至${fixedSeconds * 200}秒。`};
    return {scope,mode, fixedSeconds, requestedSeconds, durationMode:'adaptive'};
  }
  function openCutModeDialog() {
    if (!$("visualSource").value.trim()) return toast("请先引用或粘贴完整剧本。", true);
    if (state.storyboardBusy) return toast("当前剧本任务尚未结束。", true);
    if (!state.project) { state.pendingSourceAction = "cut"; return newProjectWizard(); }
    if (!state.project.workflowAssetSourceHash) return toast("请先识别当前剧本的人物、场景和物品。", true);
    if (!state.cutPriceReady) return toast("后台尚未配置剧集切割模型和价格。", true);
    // Each new choice starts from the recommended mode; a manual choice is
    // retained for this submission and never rewrites saved cut history.
    document.querySelectorAll('input[name="cutMode"]').forEach(input => { input.checked = input.value === "smart"; });
    document.querySelectorAll('input[name="storyboardScope"]').forEach(input=>{input.checked=input.value==='current';});
    const scene=topSceneDirectory?.current();
    $('storyboardCurrentSceneLabel').textContent=scene?`第 ${scene.number} 集／场 · ${scene.title} · 本卡片下全部正文`:'第 1 集／场 · 本卡片下全部正文';
    syncCutModeDialog();
    showDialog("visualCutModeDialog");
  }
  async function executeEpisodeCut() {
    const choice = cutDurationChoice();
    if (choice.error) { syncCutModeDialog(); return toast(choice.error, true); }
    if (!state.cutPriceReady) return toast("后台尚未配置剧集切割模型和价格，未提交任务。", true);
    const {mode, fixedSeconds, requestedSeconds} = choice;
    const source = $("visualSource").value.trim();
    const projectId=state.project?.id, priorRevision=cutRevision(state.project),owner={};
    closeDialog("visualCutModeDialog");
    if (state.storyboardBusy) return toast("当前剧本任务尚未结束。", true);
    const hasUnsaved = window.WorkflowCutEditor?.hasDrafts(state.project)||[...mentionDrafts.keys()].some(key=>key.startsWith(`${projectId}/${priorRevision}/`));
    if (state.project?.scriptCuts?.length && !await studioConfirm(`重新切割会产生新的切割版本，旧切割稿、手动原文、描述词和原任务记录按历史保留；不会套用到新剧集。已有生成文件仍留在本机项目目录。${hasUnsaved?'\n当前有未保存输入，已在本机按旧版本保留；如需先保存，请取消后保存。':''}继续吗？`)) return;
    if (!await studioConfirm(`第一步：沿用当前编排规则，先安排完整剧本的剧情节拍与自然时长，组合成每卡不超过${fixedSeconds}秒的视频卡。${mode === "custom" ? `当前总时长目标为${requestedSeconds}秒，实际估时有差异时只提示，不拦截保存。` : "自动规划总时长。"}\n优先组合接近上限的完整剧情，不拖长动作凑时长；对白与剧情完整保留，前后人物状态自动衔接。\n${$("visualCutModelQuote").textContent}\n本次只提交编排切卡1次调用。保存切卡后，你再单独确认第二步：按v2.1.132标准制作分镜，每次最多2卡，按实际调用次数另外计费，提交前会显示次数和预计费用。不自动提交第二步，不自动付费返修。模型请求失败按后台退款结算。确定提交第一步吗？`)) return;
    if(!sameCut(projectId,priorRevision))return toast('项目或切割版本已变化，请重新确认切割，未提交模型。',true);
    syncSourcePresets();
    state.cutSubmissionError = null;
    state.pendingCut = true;
    let cutPreviewVersion = "";
    document.body.classList.add("visual-cut-running");
    $("visualCutProgress").classList.remove("hidden");
    $("visualCutProgress").classList.add("model-activity-container");window.ModelActivity?.set($("visualCutProgress"),{state:"pending",preserve:true});
    $("visualCutProgressPercent").textContent = "0%";
    $("visualCutProgressBar").style.width = "0%";
    $("visualCutProgressMessage").textContent = "任务正在提交…";
    setWorkflowStage(3, {scroll:true});
    setStoryboardBusy(true,owner); $("useSource").disabled = true; $("fillStoryboard").disabled = true;
    updateStoryboardButton();
    $("useSource").classList.add("is-working"); $("useSource").setAttribute("aria-busy", "true");
    $("useSource").textContent = "编排剧情与视频卡";window.ModelActivity?.set($("useSource"),{state:"pending",preserve:true});
    try {
      const submitted = await post("/api/visual/episode-cut", {projectId, cutRevisionId:priorRevision, structure:source, mode,
        fixedSeconds, requestedSeconds, durationMode:'adaptive', storyboardFirstVersion:1, directorArrangementVersion:1, storyboardProductionVersion:1,
        directorArrangementPromptVersion:3,
        modelConfig:{provider:"server_gateway",model:$("visualCutModel").value,operation:"rewrite",timeout:600}});
      const data = await waitTask(submitted.taskId, task => {
        if(!sameCut(projectId,priorRevision))return;
        const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
        $("visualCutProgressPercent").textContent = `${progress}%`;
        $("visualCutProgressBar").style.width = `${progress}%`;
        $("visualCutProgressMessage").textContent = task.message || "正在编排剧情节拍与自然估时…";
        const version = `${task.completedBatches || 0}:${task.previewCuts?.length || 0}`;
        if (task.previewCuts?.length && version !== cutPreviewVersion) {
          renderCutPreview(task.previewCuts); cutPreviewVersion = version;
        }
        const step = Math.min(3, Math.floor(progress / 25));
        $("visualCutProgress").querySelectorAll(".visual-cut-steps span").forEach((node, index) => { node.classList.toggle("done", index < step); node.classList.toggle("active", index === step); });
      });
      if(!sameCut(projectId,priorRevision))return;
      if (!data.workflowComplete) {
        if (data.project && cutRevision(data.project) === priorRevision) render(data.project);
        const message = window.WorkflowCutSubmission?.message(state.project) || `切割未完成，未替换项目。${(data.issues || []).join("；")} 过程文件：${data.processFile || "暂无"}。当前下方若有切割稿，仍是旧稿。`;
        state.cutSubmissionError = {projectId,revision:priorRevision,message};
        $('visualSourceHint').textContent = message; toast(message, !data.requiresDurationConfirmation); return;
      }
      // Read the latest manifest rather than rendering an historical task
      // snapshot that may have been superseded by another cut.
      await reloadProject();
      if(state.project?.id!==projectId)return;
      if (sameCut(projectId,priorRevision) && data.project?.cutSubmission?.state === 'completed'
          && data.project.cutSubmission.baseRevisionId === priorRevision
          && data.project.cutSubmission.resultRevisionId === cutRevision(data.project)) render(data.project);
      if(data.project&&cutRevision(state.project)!==cutRevision(data.project)){toast('切割任务已结束；项目已有更新版本，当前显示最新保存状态。');return;}
      const targetNote = requestedSeconds ? `当前剧本目标${requestedSeconds}秒，已按模型返回保存${data.totalDurationSeconds}秒；每卡不超过${fixedSeconds}秒。时长为文字估算。` : `已按模型返回的自然节奏保存，每卡不超过${fixedSeconds}秒。时长为文字估算。`;
      const completeNote = stagedStoryboardProject(state.project) ? `第一步已完成。核对切卡后点击“一键补齐分镜描述词”：${storyboardBatchEstimate(data.cuts)} 第二步不改切割原文和卡长；分镜合格的卡可生成视频。` : storyboardFirstReady(state.project) ? "完整分镜已同步保存，核对左侧原文与分镜后可直接生成视频，无需再次补齐分镜。" : "请核对左侧原文，再按需补齐标准分镜。";
      $("visualSourceHint").textContent = `全剧已编排${data.cuts.length}张视频卡，共${data.totalDurationSeconds}秒。${targetNote}${completeNote}实际扣费${Number(data.chargedPoints || 0).toFixed(2)}积分。`;
      setWorkflowStage(3, {scroll:true});
      await studioAlert(`剧情编排与切卡完成：已保存 ${data.cuts.length} 张，共 ${data.totalDurationSeconds} 秒。\n${targetNote}\n\n${completeNote}`);
    } catch (error) {
      if(sameCut(projectId,priorRevision)) {
        state.cutSubmissionError = {projectId,revision:priorRevision,message:`本次切割未确认成功：${error.message}。下方保留的旧稿不是本次新结果，请核对切割状态。`};
        $('visualSourceHint').textContent = state.cutSubmissionError.message; toast(error.message, true);
        try { await reloadProject(); } catch (_) { /* Keep the scoped visible error when the read also fails. */ }
      }
    }
    finally { if(state.project?.id!==projectId){finishProjectWork(projectId,{pendingCut:false,storyboardBusy:false,storyboardOwner:null});}else if(state.storyboardOwner===owner){state.pendingCut = false; document.body.classList.remove("visual-cut-running"); $("visualCutProgress").classList.add("hidden");setStoryboardBusy(false,owner); setWorkflowStage(state.project?.scriptCuts?.length ? 3 : 2, {scroll:false}); $("useSource").classList.remove("is-working"); $("useSource").removeAttribute("aria-busy"); window.ModelActivity?.set($("useSource"),{state:"",preserve:true}); $("useSource").textContent = "下一步：分镜"; updateStoryboardButton();} refreshPoints(); }
  }
  function storyboardResumeInfo(project = state.project) {
    const cuts = project?.scriptCuts || [], attempt = window.WorkflowCutEditor?.currentBatchAttempt(project,'cutStoryboardAttempt');
    const matching = cuts.filter(cut => {const item=currentEpisode(project,cut.number);return item&&!item.storyboardSourceStale&&(!stagedStoryboardProject(project)||item.storyboardProductionVersion===1&&item.productionReady===true)&&String(item.sourceText||'').trim()===String(window.WorkflowCutEditor.effectiveSource(project,Number(cut.number))).trim()&&String(item.storyboard||'').trim();});
    const completed = matching.length;
    const remaining = Math.max(0, cuts.length - completed);
    const doneNumbers = new Set(matching.map(cut=>Number(cut.number))), missingNumbers=cuts.filter(cut=>!doneNumbers.has(Number(cut.number))).map(cut=>Number(cut.number));
    // A first batch may fail before saving any card.  The checkpoint is still
    // resumable, so do not require `completed > 0` before showing the resume
    // action; otherwise the same safe continuation is presented as a fresh
    // submission and the user cannot tell that only the missing cards remain.
    const cachedRecheck=Boolean(attempt?.cachedRecheckAllowed);
    return {completed, remaining, missingNumbers, total:cuts.length, cachedRecheck, reconcile:Boolean(cachedRecheck || attempt?.reconcileAllowed && !attempt.resumeAllowed), resumable:Boolean(remaining && (attempt ? attempt.resumeAllowed : matching.length))};
  }
  function storyboardBatchAttempts(project, field) {
    const root = window.WorkflowCutEditor?.currentBatchAttempt(project,field);
    const pending = root ? [root] : [], seen = new Set(), result = [];
    while (pending.length) {
      const candidate = pending.shift();
      if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
      seen.add(candidate);
      const attempt = window.WorkflowCutEditor?.currentBatchAttempt(
        {...project,[field]:candidate},field);
      if (!attempt) continue;
      result.push(attempt);
      pending.push(...(Array.isArray(attempt.priorAttempts) ? attempt.priorAttempts : []));
    }
    return result;
  }
  function storyboardAttemptNumbers(attempt, project) {
    const pending = (attempt.modelCalls || []).filter(call => ['running','uncertain'].includes(call.status));
    const scoped = new Set(); let unknownScope = false;
    for (const call of pending) {
      if (!Array.isArray(call.episodeNumbers) || !call.episodeNumbers.length
        || call.episodeNumbers.some(number => !Number.isInteger(number) || number < 1)) { unknownScope = true; continue; }
      const accepted = new Set((call.acceptedEpisodes || []).filter(Number.isInteger));
      call.episodeNumbers.filter(number => !accepted.has(number)).forEach(number => scoped.add(number));
    }
    if (pending.length && !unknownScope) return scoped;
    for (const field of ['missingEpisodes','targetEpisodes']) {
      const numbers = attempt[field];
      if (Array.isArray(numbers) && numbers.length && numbers.every(number => Number.isInteger(number) && number > 0)) {
        numbers.forEach(number => scoped.add(number)); return scoped;
      }
    }
    // A historical receipt lacking any per-card proof remains conservative.
    if (pending.length || attempt.reconcileAllowed) (project?.scriptCuts || []).forEach(cut => scoped.add(Number(cut.number)));
    return scoped;
  }
  function storyboardBatchRecovery(project, number) {
    for (const field of ['cutStoryboardAttempt','storyboardRegenerationAttempt']) {
      const attempt = storyboardBatchAttempts(project,field).find(candidate =>
        (candidate.cachedRecheckAllowed || candidate.reconcileAllowed
          || (candidate.modelCalls || []).some(call => ['running','uncertain'].includes(call.status)))
        && storyboardAttemptNumbers(candidate,project).has(Number(number)));
      if (attempt) return {regenerate:field==='storyboardRegenerationAttempt',
        attemptRequestId:typeof attempt.requestId==='string' && attempt.requestId.trim() ? attempt.requestId : null};
    }
    return null;
  }
  function storyboardRegenerationInfo(project = state.project, episodeIds = null) {
    const eligible = currentEpisodes(project).filter(item => String(item.storyboard || '').trim());
    const requestedIds = episodeIds || (typeof document === 'undefined' ? [] : [...document.querySelectorAll('.visual-episode-card')]
      .filter(node => node.querySelector('.episode-select')?.checked).map(node => node.dataset.episode));
    const requested = eligible.filter(item => requestedIds.includes(item.id));
    // A paused task for other cards must not replace the user's new selection.
    // Retained same-cut receipts remain addressable after an independent call.
    const attempt = storyboardBatchAttempts(project,'storyboardRegenerationAttempt').find(candidate => {
      const recoverable = candidate.cachedRecheckAllowed || candidate.reconcileAllowed || candidate.resumeAllowed
        || (candidate.modelCalls || []).some(call => ['running','uncertain'].includes(call.status));
      const numbers = storyboardAttemptNumbers(candidate,project);
      return recoverable && ((episodeIds === null && !requestedIds.length && eligible.some(item => numbers.has(Number(item.number))))
        || requested.some(item => numbers.has(Number(item.number))));
    });
    const numbers = attempt ? storyboardAttemptNumbers(attempt,project) : new Set();
    const cachedRecheck = Boolean(attempt?.cachedRecheckAllowed);
    const reconcile = Boolean(cachedRecheck || attempt?.reconcileAllowed
      || attempt?.modelCalls?.some(call => ['running','uncertain'].includes(call.status)));
    const resume = !reconcile && Boolean(attempt?.resumeAllowed);
    const selected = reconcile || (resume && !requestedIds.length) ? eligible.filter(item => numbers.has(Number(item.number))) : requested;
    const attemptRequestId = typeof attempt?.requestId === 'string' && attempt.requestId.trim() ? attempt.requestId : null;
    return {eligible, selected, ids:selected.map(item => item.id), attempt, attemptRequestId, cachedRecheck, reconcile, resume};
  }
  function updateStoryboardButton(project = state.project) {
    window.WorkflowCutEditor?.sync();
    const currentSkill = project?.storyboardFirstVersion === 1 && project?.directorArrangementVersion === 1
      && project?.storyboardSettings?.directorArrangementPromptVersion === 3;
    const regenerateButton = $("regenerateSelectedStoryboard"), regeneration = storyboardRegenerationInfo(project);
    if (regenerateButton) {
      regenerateButton.disabled = !currentSkill || !project?.scriptCuts?.length || !regeneration.selected.length || regeneration.selected.some(pendingVideoEpisode) || Boolean(state.storyboardBusy) || Boolean(window.WorkflowCutSubmission?.blocked(project));
      regenerateButton.textContent = !currentSkill && project?.scriptCuts?.length ? "旧稿请先重新编排" : regeneration.cachedRecheck ? "重新检查原分镜（免费）" : regeneration.reconcile ? "核对重新生成任务" : regeneration.resume ? "继续重新生成剩余分镜" : "重新生成选中分镜";
    }
    if (typeof document !== "undefined") document.querySelectorAll('.regenerate-episode-storyboard').forEach(node => {
      const item = currentEpisode(project,Number(node.closest('.visual-episode-card')?.dataset.cutNumber));
      node.disabled = !currentSkill || !item || !String(item.storyboard || '').trim() || pendingVideoEpisode(item) || Boolean(state.storyboardBusy) || Boolean(window.WorkflowCutSubmission?.blocked(project));
    });
    const button = $("fillStoryboard");
    if (!button) return;
    button.classList.toggle('hidden', storyboardFirstReady(project));
    button.disabled = !currentSkill || !project?.scriptCuts?.length || Boolean(state.storyboardBusy) || Boolean(window.WorkflowCutSubmission?.blocked(project));
    if (state.storyboardBusy) return;
    if (!currentSkill && project?.scriptCuts?.length) { button.textContent = "旧稿请先重新编排"; return; }
    const info = storyboardResumeInfo(project);
    button.textContent = info.cachedRecheck ? "重新检查原分镜（免费）" : info.reconcile ? "核对原分镜任务" : "一键补齐分镜描述词";
    button.title = stagedStoryboardProject(project) ? storyboardBatchEstimate(info.missingNumbers,project) : '';
  }
  async function executeFillStoryboard() {
    if (state.storyboardBusy) return toast("当前剧本任务尚未结束。", true);
    if (state.project?.storyboardSettings?.directorArrangementPromptVersion !== 3) return toast("请先用新 Skill 重新编排整剧；旧稿与视频保留，不会扣费。", true);
    if (storyboardFirstReady(state.project)) return toast("完整分镜已保存，无需再次补齐；可直接生成视频，或按需重新生成选中分镜。");
    if (!state.project?.scriptCuts?.length) return toast("请先完成第一步：切割全剧。", true);
    const projectId = state.project.id, revision=cutRevision(state.project), resume = storyboardResumeInfo(state.project),owner={};
    if (!resume.reconcile && !state.storyboardPriceReady) return toast("后台尚未配置分镜模型和价格。", true);
    const confirmation = resume.cachedRecheck ? "仅重新检查已保存在本地的原分镜返回，不提交新模型、不新增积分扣费；原调用结算保留。确定免费检查吗？" : resume.reconcile ? "将查询上次分镜调用的原结果并核对保存状态；不会新建模型调用或重复扣费。确定核对吗？" : `第二步：${stagedStoryboardProject(state.project) ? '按v2.1.132完整规则和显示格式制作分镜，卡内时间轴保留0.1秒精度。' : '补齐分镜与运镜。'}保留已合格的分镜，只处理缺失${resume.remaining}张卡（已完成${resume.completed}/${resume.total}张）。不重新切卡，不改卡长、原文顺序或对白。\n${storyboardBatchEstimate(resume.missingNumbers)}\n按实际模型调用次数计费；不会自动另付费返修。模型请求失败按后台退款结算；模型正常返回但本地分镜检查未通过，仍按实际调用计费。每批合格结果立即保存，失败可继续剩余部分，已生成视频保留。确定提交第二步吗？`;
    if (!await studioConfirm(confirmation)||!sameCut(projectId,revision)||state.storyboardBusy) return;
    setStoryboardBusy(true,owner); $("useSource").disabled = true;
    window.WorkflowCutEditor?.sync();
    const button = $("fillStoryboard"); button.disabled = true; button.classList.add("is-working");
    button.setAttribute("aria-busy", "true"); if(!resume.cachedRecheck)window.ModelActivity?.set(button,{state:"pending",preserve:true}); button.textContent = resume.cachedRecheck ? "正在免费检查原分镜…" : resume.reconcile ? "正在核对原分镜任务…" : "正在提交分镜任务…";
    $("visualStageStatus").textContent = resume.cachedRecheck ? "正在本地重新检查原分镜返回，不调用模型、不新增扣费…" : resume.reconcile ? "正在查询原分镜任务，不新建调用或重复扣费…" : "已确认提交，正在连接分镜模型…";
    toast(resume.cachedRecheck ? "正在免费检查本地原分镜返回…" : resume.reconcile ? "正在核对上次分镜调用的原结果…" : "分镜任务已开始；已完成的分镜会保留，后续逐集补齐。");
    try {
      const previewed = new Set();
      const submitted = await post("/api/visual/cut-storyboard", resume.reconcile ? {projectId,cutRevisionId:revision,reconcile:true} : {projectId,cutRevisionId:revision, style:$("visualStyle").value,
        modelConfig:{provider:"server_gateway",model:$("visualTextModel").value,operation:"rewrite",timeout:600}});
      const data = submitted.taskId ? await waitTask(submitted.taskId, async task => {
        if (!sameCut(projectId,revision)) return;
        try { await syncCompletedEpisodeCards(task.previewEpisodes, previewed,task.completedEpisodes); }
        catch (_) { if(sameCut(projectId,revision))for (const preview of task.previewEpisodes || []) if (!previewed.has(Number(preview.number))) renderStoryboardPreview(preview); }
        if(!sameCut(projectId,revision))return;
        const finished = Math.max(resume.completed, previewed.size),returned=Number(task.completedEpisodes||0);
        button.textContent = `正在补齐 ${finished}/${resume.total}集…`;
        $("visualStageStatus").textContent = `${task.message || "正在补齐分镜…"}（${task.progress || 0}%）${finished ? ` · 已显示${finished}集，可在对应视频卡生成` : ""}${returned>finished?` · 模型已返回${returned}集，正在核对已保存视频卡`:''}`;
      }, {retryReads:true}) : submitted;
      if (!sameCut(projectId,revision)) return;
      await reloadProject();
      if(!sameCut(projectId,revision))return;
      if (data.reconciled) {
        const info = storyboardResumeInfo(state.project);
        const message = data.message || (data.resumeAllowed ? `原调用结果已核对，已保留${info.completed}集，可继续补齐剩余${info.remaining}集。` : "原调用尚未确认，请稍后再次核对；不会重新提交或扣费。");
        $("visualSourceHint").textContent = message; toast(message,false); return;
      }
      if (!data.workflowComplete) {
        const info = storyboardResumeInfo(state.project);
        const reason = data.error || (data.issues || []).join("；") || state.project?.cutStoryboardAttempt?.error || "本次未完整返回，请查看过程记录。";
        const message = `已显示并保留${info.completed}/${info.total}集分镜。${reason}${info.reconcile ? " 请先核对原任务结果。" : " 可继续补齐剩余分镜。"}`;
        $("visualSourceHint").textContent = `${message}${data.processFile ? ` 过程文件：${data.processFile}` : ""}`;
        toast(message,true); return;
      }
      await loadProjects();
      const completed=storyboardResumeInfo(state.project);
      if(completed.completed<completed.total){
        const message=`模型任务已结束，当前已显示${completed.completed}/${completed.total}集已保存视频卡。请刷新项目核对原结果；不会自动重新提交模型或重复扣费。`;
        $("visualSourceHint").textContent=message;toast(message,true);return;
      }
      $("visualSourceHint").textContent = `已补齐${completed.completed}段分镜，左侧原文与右侧制作指导可逐段对照。实际扣费${Number(data.chargedPoints || 0).toFixed(2)}积分。`;
      setWorkflowStage(3, {scroll:true});
      toast(data.reused ? "现有分镜已通过核对，本次未新建模型调用或扣费。" : "全剧分镜已补齐；各集视频卡已可制作。", false);
    } catch (error) { if (sameCut(projectId,revision)) { try { await reloadProject(); } catch (_) {} if(sameCut(projectId,revision)){ $("visualSourceHint").textContent = `分镜未完成，已完成部分会保留：${error.message}`; toast(error.message, true); } } }
    finally { if(state.project?.id!==projectId){finishProjectWork(projectId,{storyboardBusy:false,storyboardOwner:null});}else if(state.storyboardOwner===owner){setStoryboardBusy(false,owner); button.classList.remove("is-working"); button.removeAttribute("aria-busy"); window.ModelActivity?.set(button,{state:"",preserve:true}); updateStoryboardButton();} refreshPoints(); }
  }
  async function executeRegenerateStoryboard(episodeIds = null) {
    if (state.storyboardBusy) return toast("当前分镜任务尚未结束，请勿重复提交。", true);
    if (state.project?.storyboardSettings?.directorArrangementPromptVersion !== 3) return toast("请先用新 Skill 重新编排整剧；旧稿与视频保留，不会扣费。", true);
    const project = state.project, projectId = project?.id, revision=cutRevision(project),owner={};
    if (!project?.scriptCuts?.length) return toast("请先完成第一步：切割全剧。", true);
    const {cachedRecheck,reconcile,resume,ids,selected,attemptRequestId} = storyboardRegenerationInfo(project,episodeIds);
    if (!reconcile && !state.storyboardPriceReady) return toast("后台尚未配置分镜模型和价格。", true);
    if (!selected.length) return toast("请先勾选需要重新生成的分集。", true);
    if (selected.some(pendingVideoEpisode)) return toast("所选集的视频任务尚未结束，请等待完成。", true);
    const confirmation = cachedRecheck ? "仅重新检查已保存在本地的原分镜返回，不提交新模型、不新增积分扣费；原调用结算保留，旧分镜和视频不会被不合格结果替换。可能同时核对该原调用中的其他卡，不新增付费生成范围。确定免费检查吗？" : reconcile ? "只核对上次重新生成的原任务，不新建模型调用、不重复扣费；可能同时核对该原调用中的其他卡，不新增付费生成范围。确定核对吗？"
      : `将${resume ? '继续' : ''}按v2.1.132规则与格式重新生成第${selected.map(item => item.number).join('、')}集分镜与运镜，不改切割原文、卡长及编排顺序。\n${storyboardBatchEstimate(selected,{storyboardProductionVersion:1})}\n批量任务按实际模型调用次数重新计费；不会自动另付费返修。模型请求失败按后台退款结算；模型正常返回但本地分镜检查未通过，仍按实际调用计费。新分镜通过校验后才替换旧描述词（包括手动修改）；未通过保留旧分镜。参考图、已有视频及视频历史保留，已有视频不会自动重做。确定提交吗？`;
    if (!await studioConfirm(confirmation) || !sameCut(projectId,revision) || state.storyboardBusy) return;
    setStoryboardBusy(true,owner); $("useSource").disabled = true; updateStoryboardButton();
    $("visualStageStatus").textContent = cachedRecheck ? "正在本地重新检查原分镜返回，不调用模型、不新增扣费…" : reconcile ? "正在核对原重新生成任务…" : "正在重新生成分镜，旧分镜暂时保留…";
    const refreshResult = incoming => {
      if (!incoming || !sameCut(projectId,revision)||cutRevision(incoming)!==revision) return;
      // Keep hand-written, unsaved text under project/episode number even when
      // polling replaces a draft card with the newly generated AI episode.
      render(incoming);
    };
    try {
      const submitted = await post('/api/visual/cut-storyboard', {projectId,cutRevisionId:revision,regenerate:true,
        ...((reconcile || resume) && attemptRequestId ? {attemptRequestId} : {}),
        ...(reconcile ? {reconcile:true} : {episodeIds:ids,resumeRegeneration:resume,
          modelConfig:{provider:'server_gateway',model:$("visualTextModel").value,operation:'rewrite',timeout:600}})});
      const data = submitted.taskId ? await waitTask(submitted.taskId, task => {
        if (sameCut(projectId,revision)) $("visualStageStatus").textContent = `${task.message || '正在重新生成分镜…'}（${task.progress || 0}%）；原视频保留`;
      }, {retryReads:true}) : submitted;
      if (!sameCut(projectId,revision)) return;
      await reloadProject();
      if(!sameCut(projectId,revision))return;
      const message = data.reconciled ? data.message : data.workflowComplete
        ? `分镜重新生成完成，实际扣费${Number(data.chargedPoints || 0).toFixed(2)}积分；已有视频仍为原版本，可按需重新生成视频。`
        : `本次未全部完成：${data.error || (data.issues || []).join('；') || '请核对原任务'}。已通过校验的新分镜已保存，其余旧分镜保留。`;
      $("visualSourceHint").textContent = message; toast(message,!data.workflowComplete && !data.reconciled);
      await loadProjects();
    } catch (error) {
      if (sameCut(projectId,revision)) {
        try {
          const response = await fetch(`/api/visual/project?id=${encodeURIComponent(projectId)}`, {cache:'no-store'});
          if (response.ok) refreshResult((await response.json()).project);
        } catch (_) {}
        toast(`重新生成未完成，旧分镜和视频保留：${error.message}`,true);
      }
    } finally { if(state.project?.id!==projectId)finishProjectWork(projectId,{storyboardBusy:false,storyboardOwner:null});else setStoryboardBusy(false,owner); refreshPoints(); }
  }
  function showTaskProgress(button, statusNode, task, verb) { const running = !["done","error","cancelled"].includes(task.state); if (button) { button.dataset.busy=running?"1":"0"; window.ModelActivity?.set(button,{state:running?"pending":"",preserve:true}); } if(statusNode) { statusNode.classList.toggle("is-generating",running); window.ModelActivity?.task(statusNode,task,{success:verb+"成功"}); } }
  const assetResultFields230 = ['imageFile','status','generationId','requestId','source','currentImageOrigin','imageStyle','imageStyleName','size','ratio','layout','eyeMask','eyeMaskMode','resolvedAppearanceType','resolvedAppearanceLabel','imageGeneration','imageModel','imageModelName','tier','chargedPoints','imageStyleSpec','effectiveImagePrompt'];
  function showSavedAssetImage230(kind,item) {
    // Replace only the preview and result actions; keep the user's editor,
    // selection, expanded details and other cards in place.
    const node=currentAssetNode231(state.project?.id,kind,item.id);
    const preview=node?.querySelector('.visual-card-preview'),body=node?.querySelector('.visual-card-body');
    if(!preview||!body||!item.imageFile)return;
    const name=item.name||'参考图';
    let image=preview.querySelector('img');
    if(!image){image=document.createElement('img');preview.prepend(image);}
    preview.querySelector('.asset-preview-placeholder')?.remove();
    image.className='open-visual-preview';image.dataset.previewType='image';image.dataset.file=item.imageFile;image.dataset.name=`${name}.jpg`;image.dataset.title=name;image.alt=name;image.title='点击放大';if(image.getAttribute('src')!==media(item.imageFile))image.src=media(item.imageFile);
    let actions=[...body.querySelectorAll('.visual-result-actions')].find(value=>value.querySelector('.open-visual-preview[data-preview-type="image"]'));
    if(!actions){actions=document.createElement('div');actions.className='visual-result-actions';body.insertBefore(actions,body.querySelector(':scope > .visual-card-actions'));}
    actions.innerHTML=`<button class="ghost-btn open-visual-preview" data-preview-type="image" data-file="${esc(item.imageFile)}" data-name="${esc(name)}.jpg" data-title="${esc(name)}">放大查看</button><a class="secondary-btn" href="${esc(downloadMedia(item.imageFile,`${name}.jpg`))}">单独下载</a>`;
    let origin=body.querySelector('.visual-origin-badge');
    if(!origin){origin=document.createElement('span');origin.className='visual-origin-badge';body.querySelector(':scope > b')?.insertAdjacentElement('afterend',origin);}
    origin.textContent=item.source==='uploaded'?'当前使用：用户上传图':'当前使用：模型生成图';
    const upload=body.querySelector('.asset-upload');if(upload)upload.textContent='上传图片替换';
    let badge=body.querySelector('.visual-image-style-state');
    if(item.source==='uploaded')badge?.remove();
    else{
      if(!badge){badge=document.createElement('small');badge.className='visual-image-style-state';body.querySelector(':scope > b')?.insertAdjacentElement('afterend',badge);}
      const recorded=item.imageStyleName||item.imageStyleSpec?.name||state.styles.find(style=>style.id===item.imageStyle)?.name;
      badge.textContent=recorded?`此图片生成风格：${recorded}${item.imageStyle!==state.project.style?'（旧风格成品，重新生成后应用当前风格）':''}`:'此图片未记录生成风格；切换风格不改变已有图片。';
    }
  }
  const assetResultSync230=new Map();
  function queueAssetResultSync230(projectId,scriptId) {
    const existing=assetResultSync230.get(projectId);
    if(existing){existing.again=true;return;}
    const work={again:false};assetResultSync230.set(projectId,work);
    const run=async()=>{
      if(state.project?.id!==projectId||String(state.project.scriptGenerationId||'')!==scriptId){assetResultSync230.delete(projectId);return;}
      // One read after the active group settles replaces dozens of concurrent
      // full-project reads. Individual successful images are already visible.
      if([...state.activeAssetJobs.values()].some(job=>job?.active)){setTimeout(run,800);return;}
      work.again=false;
      const epoch=projectReadEpoch,base=new Map(['people','scenes','props'].flatMap(kind=>(state.project.assets?.[kind]||[]).map(item=>[`${kind}:${item.id}`,{file:item.imageFile,request:item.requestId,generation:item.generationId}])));
      try{
        const response=await fetch(`/api/visual/project?id=${encodeURIComponent(projectId)}&view=workspace`,{cache:'no-store'}),data=await response.json();
        if(!response.ok)throw Error(data.error||'读取视觉项目失败');
        if(epoch===projectReadEpoch&&state.project?.id===projectId&&String(state.project.scriptGenerationId||'')===scriptId&&data.project?.id===projectId&&String(data.project.scriptGenerationId||'')===scriptId){
          for(const kind of ['people','scenes','props'])for(const saved of data.project.assets?.[kind]||[]){
            const key=`${kind}:${saved.id}`,item=state.project.assets?.[kind]?.find(value=>value.id===saved.id),before=base.get(key);
            if(!item||!before||state.activeAssetJobs.get(key)?.active||item.imageFile!==before.file||item.requestId!==before.request||item.generationId!==before.generation||saved.status!=='done'||!saved.imageFile)continue;
            const changed=item.imageFile!==saved.imageFile;
            for(const field of [...assetResultFields230,'imageHistory'])if(Object.hasOwn(saved,field))item[field]=saved[field];
            if(changed)showSavedAssetImage230(kind,item);
          }
        }
        if(state.project?.id===projectId)await loadProjects();
      }catch(_){/* A background read cannot undo a saved successful image. */}
      assetResultSync230.delete(projectId);
      if(work.again)queueAssetResultSync230(projectId,scriptId);
    };
    setTimeout(run,500);
  }
  function freezeAssetRequest(node) {
    const project=state.project,kind=node.dataset.kind,assetId=node.dataset.id;
    if(!project?.id || (node.dataset.projectId && node.dataset.projectId!==project.id))throw Error('素材不属于当前项目，未提交生成。');
    const item=project.assets?.[kind]?.find(value=>value.id===assetId);
    if(!item)throw Error('素材已不存在，未提交生成。');
    const imageControl=node.querySelector('.asset-image-model'),imageModel=imageControl?imageControl.value:selectedModel('image');
    if(imageControl && (!imageControl.value || imageControl.selectedOptions[0]?.disabled))throw Error('当前图片线路没有可用模型，请重新选择；未提交生成。');
    const model=ModelPresentation.catalog(state.profile,'image',project.settings || {}).find(value=>value.id===imageModel);
    if(!model)throw Error('本项图片模型已下架或未配置，请重新选择；未提交生成。');
    const assetEyeMask=Boolean(node.querySelector('.asset-eye-mask input')?.checked);
    const style=projectStyleSpec(project),styleSnapshot=style?JSON.parse(JSON.stringify(style)):null;
    return Object.freeze(fixedMediaReceipt251('asset',{projectId:project.id,scriptGenerationId230:String(project.scriptGenerationId||''),kind,assetId,prompt:String(node.querySelector('.visual-asset-prompt')?.value || ''),
      imageModel,tier:model.tier || selectedTier('image'),imageResolution:ModelPresentation.imageResolutionForModel(state.profile,imageModel,$('visualImageResolution').value),
      size:assetSize(kind),ratio:assetRatio(kind),layout:assetPrompt(kind),assetEyeMask,
      eyeMask:kind==='people' && (Boolean($('visualEyeMask').checked)||assetEyeMask),eyeMaskMode:$('visualEyeMaskMode')?.value || 'white',
      appearanceType:node.querySelector('.asset-appearance-type')?.value || item.generationSettings?.appearanceType || 'auto',
      ...(styleSnapshot?{styleSnapshot}:{}),
    }));
  }
  async function assetGenerate(node, shouldRender = true, suppressEyePrompt = false, expectedToken = "", frozenRequest = null, frozenAsset = null) {
    const request=frozenRequest || freezeAssetRequest(node);
    const {kind,projectId,assetId}=request,jobKey=`${kind}:${assetId}`;
    if(state.project?.id!==projectId&&!frozenAsset)return {cancelled:true};
    const jobs=state.project?.id===projectId?state.activeAssetJobs:workFor(projectId).activeAssetJobs;
    const queuedJob = jobs.get(jobKey);
    if (expectedToken && (!queuedJob?.active || queuedJob.token !== expectedToken)) return {cancelled:true};
    const item = frozenAsset || state.project.assets[kind].find(value => value.id === assetId);
    if(!item)return {cancelled:true};
    if (!expectedToken && (queuedJob?.active || assetPreviewState(item,queuedJob).phase === "paused")) return {queued:true};
    const token = expectedToken || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const isCurrent = () => { const current = jobs.get(jobKey); return current?.active && current.token === token; };
    const previousFile = item.imageFile || "", eyeMask=request.eyeMask,scriptId=String(request.scriptGenerationId230??(state.project?.id===projectId?state.project.scriptGenerationId||'':''));
    if (eyeMask && !suppressEyePrompt && !await studioConfirm(`“${item.name}”当前已启用眼部遮挡。\n\n确认按所选遮挡样式生成吗？取消后不会提交，也不会扣费。`)) return;
    if(state.project?.id!==projectId&&!frozenAsset)return {cancelled:true};
    let taskId = "", generationId=queuedJob?.generationId||'', terminalFailure = false;
    const update = changes => updateAssetJob(node,{projectId,active:true,token,previousFile,taskId,generationId,phase:"waiting",...changes});
    update({phase:"submitting",message:"正在准备提交任务…"});
    try {
      const {scriptGenerationId230:_scriptIdentity,...generationRequest}=request;
      const data = await post("/api/visual/asset/generate", generationRequest);
      if (!data.taskId) { const error = new Error("提交回执尚未确认，请稍后刷新项目核对。请勿重复提交。"); error.assetPaused = true; throw error; }
      taskId = data.taskId;generationId=String(data.generationId||data.requestId||'');
      if(!isCurrent())return {detached:true,projectId,requestId:generationId};
      if (isCurrent()) update({message:"请稍候…"});
      const result = await waitTask(taskId, task => {
        terminalFailure = ["error","cancelled"].includes(task.state);
        if (!["queued","running","done","error","cancelled"].includes(task.state)) {
          const error = new Error(task.message || "原任务状态尚未确认，请稍后刷新项目核对。请勿重复提交。");
          error.assetPaused = true; throw error;
        }
        if (isCurrent() && !terminalFailure) update({phase:task.state === "queued" ? "queued" : Number(task.progress || 0) >= 72 ? "saving" : "waiting",message:task.message || "请稍候…"});
      },{shouldStop:()=>!isCurrent()});
      if(!isCurrent())return {detached:true,projectId,requestId:generationId};
      const saved = result.project?.id===projectId&&String(result.project.scriptGenerationId||'')===scriptId?result.project?.assets?.[kind]?.find(value => value.id === item.id):null;
      const owner=isCurrent()&&state.project?.id===projectId&&String(state.project.scriptGenerationId||'')===scriptId;
      const live=owner?state.project.assets?.[kind]?.find(value=>value.id===item.id):null;
      const replaced=live?.imageFile&&live.imageFile!==previousFile&&live.source==='uploaded';
      if(live?.generationId&&saved?.requestId&&live.generationId!==saved.requestId){update({active:false,phase:'done',message:'原任务图片已保存；当前资产已有更新任务。'});return result;}
      if(saved?.imageFile&&saved.status==='done'&&saved.imageFile!==previousFile&&live&&!replaced){
        // This task owns only its saved image fields, never a historical copy
        // of the project or the user's current prompt and settings.
        for(const field of assetResultFields230)if(Object.hasOwn(saved,field))live[field]=saved[field];
        delete live.error;projectReadEpoch++;
        showSavedAssetImage230(kind,live);
        update({active:false,phase:'done',message:'生成成功，图片已保存'});
        queueAssetResultSync230(projectId,scriptId);
        return result;
      }
      if(!owner){if(isCurrent())update({active:false,phase:'done',message:'图片已保存到原项目。'});return result;}
      if(replaced){update({active:false,phase:'done',message:'已使用上传图片；旧生成任务的结果已安全丢弃。'});return {...result,replaced:true};}
      if (!saved?.imageFile || saved.status !== "done" || saved.imageFile === previousFile) {
        if(state.project?.id===projectId)await reloadAssetProject231(projectId).catch(() => {});
        const latest = state.project?.id === projectId ? state.project.assets[kind]?.find(value => value.id === item.id) : null;
        if (!latest?.imageFile || latest.status !== "done" || latest.imageFile === previousFile) {
          const error = new Error("原任务已结束，但图片保存结果尚未确认。请刷新项目核对；请勿重复提交。");
          error.assetPaused = true; throw error;
        }
      }
      if (isCurrent()) update({active:false,phase:"done",message:"生成成功，图片已保存"});
      // Never fall back to the task's historical project snapshot after a failed read.
      if(state.project?.id===projectId)await reloadAssetProject231(projectId).catch(()=>{});
      return result;
    } catch (error) {
      if(!isCurrent())return {detached:true,projectId,requestId:generationId};
      if (state.project?.id === projectId) { try { await reloadAssetProject231(projectId); } catch (_) {} }
      const latest = state.project?.id === projectId ? state.project.assets[kind]?.find(value => value.id === item.id) : null;
      const replaced = latest?.source === "uploaded" && latest.imageFile && latest.imageFile !== previousFile;
      const paused = !replaced && Boolean(error.assetPaused || error.requestUncertain || (taskId && !terminalFailure && latest?.status !== "failed"));
      const message = replaced ? "已使用上传图片；旧生成任务的结果已安全丢弃。" : paused ? `已停止本机等待：${error.message} 原任务待核对，请勿重复提交。` : `生成失败：${error.message}`;
      if (isCurrent()) update({active:false,phase:replaced ? "done" : paused ? "paused" : "error",message,error:!replaced && !paused,paused});
      if (replaced) return {project:state.project,replaced:true};
      // The preview owns the reason; callers may summarize a batch, but must not duplicate this log in a toast.
      error.assetPreviewHandled = true;
      throw error;
    }
  }
  async function resetAssetStatus240(node,button){
    const project=state.project,projectId=project?.id,kind=node.dataset.kind,assetId=node.dataset.id;
    const item=project?.assets?.[kind]?.find(row=>row.id===assetId);if(!item)throw Error('当前资产已变化，请重新打开后重试。');
    const jobs=state.activeAssetJobs,key=`${kind}:${assetId}`,job=jobs.get(key),expectedGenerationId=assetResetExpected240(item,job),scriptId=String(project.scriptGenerationId||'');
    if(job?.active&&!expectedGenerationId)throw Error('正在确认原任务编号，请稍后重试。');
    if(!await studioConfirm('重置只解除本机等待，不取消上游任务、不退款。原订单、已有图片和历史记录都会保留，可免费核对原订单。\n\n重置后可更换模型；再次生成会建立新任务并按新任务计费。是否重置状态？'))return;
    button.disabled=true;
    try{
      const data=await post('/api/visual/asset/reset',{projectId,kind,assetId,expectedGenerationId});
      const saved=data.project?.assets?.[kind]?.find(row=>row.id===assetId);
      if(data.project?.id!==projectId||!saved)throw Error('重置回执身份不匹配，请刷新核对原任务；没有重新生成。');
      if(state.project?.id!==projectId||String(state.project.scriptGenerationId||'')!==scriptId)return;
      const current=state.project.assets?.[kind]?.find(row=>row.id===assetId),currentJob=jobs.get(key);
      if(!current||currentJob?.token!==job?.token||assetResetExpected240(current,currentJob)!==expectedGenerationId)return;
      // Invalidate the exact local observer before applying the receipt. Its
      // later progress/completion cannot re-lock or overwrite a new task.
      jobs.set(key,{...job,projectId,active:false,cancelled:true,paused:false,error:false,phase:'idle',message:'已解除本机等待；原订单可免费核对。'});
      for(const field of ['status','imageFile','imageHistory','imageGenerationHistory240','localImageReset240'])if(Object.hasOwn(saved,field))current[field]=saved[field];
      for(const field of ['generationId','imageGeneration','error']){if(Object.hasOwn(saved,field))current[field]=saved[field];else delete current[field];}
      projectReadEpoch++;node.querySelector('.asset-recovery-tools')?.remove();
      updateAssetJob(node,{...jobs.get(key)});syncAssetReset240(node,current,jobs.get(key));
      refreshPoints();toast(data.reset?.message||'已重置本机状态；原订单、图片及历史保留，未发起新生成。');
    }finally{if(button.isConnected)button.disabled=false;}
  }
  function checkedReferenceIds(node, selector = ".episode-reference") { return [...node.querySelectorAll(`${selector}:checked`)].map(input => input.value); }
  async function frameGenerate(node, shouldRender = true) {
    const projectId=state.project.id,revision=cutRevision(state.project),item=state.project.episodes.find(x=>x.id===node.dataset.episode);
    let restoring=!!ModelPresentation.pendingImageRecovery(state.project,'/api/visual/episode/frame',{episodeId:item?.id});
    if(!item||!restoring&&currentEpisode(state.project,item.number)?.id!==item.id)throw new Error('本集已不在当前切割版本中。');
    const button=node.querySelector('.frame-generate'),statusNode=node.querySelector('.visual-task-status'),original=button.textContent;
    const size=imageSizeForRatio(chosenEpisodeRatio(item,node)),referenceAssetIds=checkedReferenceIds(node);
    const live=()=>sameCut(projectId,revision)&&node.isConnected;
    node.querySelectorAll('.episode-reference').forEach(input=>{input.checked=referenceAssetIds.includes(input.value);});
    try {
      button.disabled=true;button.textContent='正在提交…';window.ModelActivity?.set(button,{state:"pending",preserve:true});window.ModelActivity?.set(statusNode,{state:"pending",preserve:true});
      statusNode.textContent=restoring?'正在核对并领取原首帧，不重新核价或生成…':`正在生成${$('visualImageResolution').value}首帧（${size} · 已自动引用${referenceAssetIds.length}张图）…`;
      const data=await post('/api/visual/episode/frame',{projectId,cutRevisionId:revision,episodeId:item.id,prompt:node.querySelector('.visual-video-prompt').value,promptStyleEditable:Boolean(projectStyleSpec()||item.videoPromptStyleEditable),tier:$('visualImageTier').value,size,referenceAssetIds});
      restoring=restoring||data.resumeOnly===true;
      if(!data.taskId)throw new Error('本机后端未返回任务编号。');
      if(live())statusNode.textContent=`首帧任务已提交：${data.taskId.slice(0,8)}… · ${size} · ${referenceAssetIds.length}张参考图`;
      const result=await waitTask(data.taskId,task=>{if(live())showTaskProgress(button,statusNode,task,'首帧生成');});
      if(!sameCut(projectId,revision))return result;
      if(live())statusNode.textContent=`首帧生成成功，${size} JPG已保存；可直接生成视频`;
      if(shouldRender)await reloadProject();
      if(sameCut(projectId,revision))toast(restoring?`第${item.number}集原首帧已领取，没有新增生成或扣费。`:`第${item.number}集首帧生成成功。`);
      return result;
    }catch(error){if(live())statusNode.textContent=restoring?`原首帧仍待核对：${error.message}；没有重新生成。`:`首帧失败：${error.message}`;throw error;}
    finally{if(live()){button.disabled=false;button.textContent=original;window.ModelActivity?.set(button,{state:"",preserve:true});}}
  }

  function videoJobKey(projectId, episodeId) { return JSON.stringify([projectId, episodeId]); }
  function videoAnimationPending(item, job) {
    // Presentation follows this card, never the batch/global activity count.
    // A reader stopping is not proof that a submitted video failed.
    if (job?.active && !job.cancelled) return true;
    if (job?.cancelled || job?.phase === 'done') return false;
    if (item?.status==='video_failed' && job?.taskId && item.localVideoTaskId===job.taskId) return false;
    return pendingVideoEpisode(item);
  }
  function videoAnimationMarkup(job) {
    const label = job?.phase === 'queued' ? '视频任务排队中' : job?.phase === 'submitting' ? '正在提交视频任务' : job?.phase === 'reconnecting' ? '正在查询原视频任务' : '视频正在生成';
    return `<div class="episode-video-loading" data-model-activity="pending" role="status" aria-live="polite"><i class="episode-video-loading-spinner" aria-hidden="true"></i><b class="episode-video-loading-title">${esc(label)}</b><small>成品显示或任务明确失败后停止</small></div>`;
  }
  function videoResultReady(item,job) {
    if (!item?.videoFile || pendingVideoEpisode(item)) return false;
    if (item.videoFile !== job.previousVideoFile) return true;
    // Recovery may attach after the file has already been written. Match a
    // terminal original task/history receipt instead of mistaking an old clip
    // for the new result or waiting forever for the pathname to change.
    if (job.taskId && item.localVideoTaskId===job.taskId && item.localVideoTaskState==='done') return true;
    return (item.videoHistory||[]).some(row=>row.file===item.videoFile && job.remoteTaskId && row.taskId===job.remoteTaskId);
  }
  function syncVideoAnimation(node,item,job) {
    if (!node) return false;
    const busy = videoAnimationPending(item,job), output=node.querySelector('.visual-output-box');
    let indicator=output?.querySelector('.episode-video-loading');
    if (busy && output && !indicator) {
      // Keep an earlier video/first frame visible during regeneration.
      if (!output.querySelector('video,img')) output.textContent='';
      output.insertAdjacentHTML('beforeend',videoAnimationMarkup(job));
      indicator=output.querySelector('.episode-video-loading');
    } else if (!busy && indicator) {
      indicator.remove();
      if (!output.querySelector('video,img')) output.textContent=item?.status==='video_failed' ? '视频生成失败，请查看下方详情' : '尚未生成视频（使用本集分镜与参考图）';
    }
    if (indicator) {
      const title=indicator.querySelector('.episode-video-loading-title');
      if (title) title.textContent=job?.phase==='queued' ? '视频任务排队中' : job?.phase==='submitting' ? '正在提交视频任务' : job?.phase==='reconnecting' ? '正在查询原视频任务' : '视频正在生成';
    }
    node.dataset.videoPending=busy ? '1' : '0';
    output?.setAttribute('aria-busy',String(busy));
    return busy;
  }
  function pendingVideoEpisode(item) {
    // A live local worker or uncertain submission receipt must remain exclusive:
    // an HTTP rejection alone is not proof that the provider created no task.
    if (item?.localVideoTaskId && ["queued","running"].includes(item.localVideoTaskState)) return true;
    const snapshot = item?.videoTaskSnapshot;
    if (snapshot?.requestId && ["submitting","unknown"].includes(snapshot.requestState)) return true;
    // Only the backend's reconciled terminal receipt can release a failed
    // submission. Preserve a real remote task even with a stale terminal flag.
    if (["rejected","refunded"].includes(snapshot?.requestState) && !item?.remoteTaskId) return false;
    return ["video_running","video_paused"].includes(item?.status);
  }
  function currentVideoCard(job) {
    if (state.project?.id !== job.projectId) return null;
    if(job.cutRevisionId&&!sameCut(job.projectId,job.cutRevisionId))return null;
    return [...document.querySelectorAll(".visual-episode-card")].find(node => node.dataset.episode === job.episodeId) || null;
  }
  function updateVideoJob(job, task = null) {
    if (state.activeVideoJobs.get(job.key) !== job) return;
    if (task) {
      job.progress = Math.max(job.progress || 0, Math.max(0, Math.min(100, Number(task.progress || 0))));
      job.message = task.state === "queued" ? "排队等待执行，尚未提交模型…" : task.message || "正在等待上游完成…";
      job.phase = task.state === "queued" ? "queued" : task.reconnecting ? "reconnecting" : "waiting";
    }
    const node = currentVideoCard(job);
    if (!node) return;
    const button = node.querySelector(".video-generate"), status = node.querySelector(".visual-task-status");
    const item = state.project?.episodes?.find(value => value.id === job.episodeId);
    const busy = syncVideoAnimation(node,item,job);
    if (button) {
      button.disabled = busy;
      button.dataset.busy = busy ? "1" : "0";
      button.textContent = busy ? job.phase === "queued" ? "排队中…" : job.phase === "submitting" ? "正在提交…" : job.phase === "reconnecting" || !job.active ? "自动查询原任务…" : `视频生成中 ${job.progress || 0}%` : pendingVideoEpisode(item) ? "继续查询原任务" : item?.videoFile ? "重新生成视频" : "生成视频";
    }
    if(button) window.ModelActivity?.set(button,{state:busy?"pending":"",preserve:true});
    if (status) { status.classList.toggle("is-generating",busy); window.ModelActivity?.set(status,{state:busy?"pending":job.error?"error":item?.videoFile?"success":"",message:busy?"":job.message||item?.error||""}); }
    node.querySelectorAll(".frame-generate,.episode-video-route,.episode-video-model,.episode-video-resolution,.episode-video-duration,.episode-video-ratio,.episode-tail-continuation,.episode-reference,.episode-reference-upload,.episode-reference-remove").forEach(control => control.disabled = busy);
    const durationControl = node.querySelector('.episode-video-duration');
    if (durationControl?.dataset.fixedDuration || durationControl?.dataset.adaptiveDuration) durationControl.disabled = true;
    node.querySelectorAll('.video-duration-adopt').forEach(control => control.disabled = busy);
    if(!busy&&item)refreshEpisodeTail239(node,item);
  }
  function createVideoJob(project, item, request = null, queued = false) {
    const key = videoJobKey(project.id, item.id);
    const existing = state.activeVideoJobs.get(key);
    if (existing?.active) return existing;
    const job = {key, projectId:project.id, cutRevisionId:cutRevision(project), episodeId:item.id, episodeNumber:item.number, remoteTaskId:item.remoteTaskId || "", active:true, cancelled:false, taskId:item.localVideoTaskId || "", request, progress:0, phase:queued ? "queued" : request ? "submitting" : "reconnecting", message:queued ? "排队中，尚未提交…" : request ? "正在提交本集视频…" : "正在自动查询原视频任务，不会新建任务或扣费…"};
    state.activeVideoJobs.set(key, job);
    job.previousVideoFile = item.videoFile || '';
    updateVideoJob(job);
    return job;
  }
  function videoRequestSnapshot(node, project, item) {
    const modelSelect = node.querySelector(".episode-video-model");
    const videoModel = modelSelect ? modelSelect.value : selectedModel("video");
    if(modelSelect && (!videoModel || modelSelect.selectedOptions[0]?.disabled))throw Error("当前视频线路没有可用模型，请重新选择；未提交生成。");
    const videoTier = modelSelect?.selectedOptions[0]?.dataset.tier || selectedTier("video");
    const referenceAssetIds = checkedReferenceIds(node);
    validateVideoReferences(referenceAssetIds, videoModel);
    const duration = chosenEpisodeDuration(item,node), resolution = node.querySelector('.episode-video-resolution')?.value || $('visualResolution').value;
    if (item?.durationMode === 'adaptive' || item?.pacingPlan?.durationMode === 'adaptive') {
      const adaptiveIssue = adaptiveVideoIssue(item,videoModel,duration,resolution);
      if (adaptiveIssue) throw new Error(adaptiveIssue);
    }
    const issue = videoCapabilityIssue(videoModel,duration,resolution);
    if (issue) throw new Error(issue);
    const quote = ModelPresentation.quote(state.profile,videoModel,resolution,duration,videoTier,chosenEpisodeRatio(item,node));
    if (!ModelPresentation.isLiveQuote(state.profile,'video',videoModel) && (!quote || !Number.isFinite(quote.points) || quote.points <= 0)) throw new Error('本集尚无有效价格，未提交生成。');
    const prompt = node.querySelector('.visual-video-prompt').value, ratio = chosenEpisodeRatio(item,node), ability = videoCapability(videoModel);
    const allowedRatios = ModelPresentation.videoAspectRatios?.(state.profile,videoModel) ?? (ability.supportedAspectRatios?.length ? ability.supportedAspectRatios : ['9:16','16:9','1:1']);
    if (!allowedRatios.includes(ratio)) throw new Error('所选模型不支持当前画面方向，请明确调整；不自动更换比例。');
    if (ability.maxPromptChars && Array.from(prompt).length > Number(ability.maxPromptChars)) throw new Error(`原视频描述词已超过所选模型${ability.maxPromptChars}个字符的上限，未提交。完整提交还包含人物、参考图及风格说明，以服务端提交前校验为准；请手动调整或选择其他模型，正文不会自动删减。`);
    refreshEpisodeTail239(node,item);
    const continuationIssue=tailFrameIssue237(item,node,videoModel,duration,referenceAssetIds.length);if(continuationIssue)throw new Error(continuationIssue);
    return Object.freeze(fixedMediaReceipt251('video',{projectId:project.id, cutRevisionId:cutRevision(project), episodeId:item.id, ...(node.querySelector('.episode-tail-continuation')?.checked?{tailFrameContinuation:true,tailFrameMode:episodeTailState239(item,node,videoModel,duration,referenceAssetIds.length).mode}:{}), prompt, promptStyleEditable:Boolean(projectStyleSpec(project)||item.videoPromptStyleEditable), videoModel, videoTier, tier:videoTier, duration, resolution, ratio, referenceAssetIds:Object.freeze(referenceAssetIds.slice()), inputMode:"references", resumeOnly:false}));
  }
  async function flushEpisodeReferenceSaves(node) {
    const context=referenceEditorContexts.get(node);
    if(!context)return;
    for(let pending=referenceSaveQueues.get(context.key);pending;pending=referenceSaveQueues.get(context.key)){
      await pending;
      if(referenceSaveQueues.get(context.key)===pending)break;
    }
    if(!sameCut(context.projectId,context.revision)||!node.isConnected)throw new Error('项目或视频卡已变化，请重新选择后生成。');
  }
  async function observeVideoJob(job) {
    const data = await post("/api/visual/episode/video/observe", {projectId:job.projectId,...(job.cutRevisionId?{cutRevisionId:job.cutRevisionId}:{}), episodeId:job.episodeId});
    if (data.taskId) job.taskId = data.taskId;
    return data;
  }
  async function reconnectVideoJob(job) {
    let failures = 0;
    for (;;) {
      if (job.cancelled) { const error = new Error("原视频任务已解除。"); error.videoDetached = true; throw error; }
      try { return await observeVideoJob(job); }
      catch (error) {
        if (error.httpStatus && ![408,429].includes(error.httpStatus) && error.httpStatus < 500) throw error;
        failures++;
        job.phase = "reconnecting"; job.message = "连接暂时中断，正在自动查询原任务；不会重新生成或扣费…"; updateVideoJob(job);
        await new Promise(resolve => setTimeout(resolve, Math.min(30000, 1500 * 2 ** Math.min(failures - 1, 5))));
      }
    }
  }
  function videoTaskResult240(job,result={},project=null){
    const safe={projectId:job.projectId,episodeId:job.episodeId};
    for(const key of ['duration','estimatedPoints','estimatedCost','videoModel','videoModelName','taskId','requestId','videoFile','complete','completed']){
      const value=result?.[key];if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')safe[key]=value;
    }
    const item=project?.episodes?.find(value=>value.id===job.episodeId);if(item?.videoFile)safe.videoFile=item.videoFile;
    return safe;
  }
  function patchVideoReceipt240(node,incoming,previous){
    const output=node.querySelector('.visual-episode-output');
    if(!output||!document.createElement)return false;
    const template=document.createElement('template');template.innerHTML=episodeCard(incoming);
    const fresh=template.content.querySelector('.visual-episode-output');if(!fresh)return false;
    const changedFile=previous?.videoFile!==incoming.videoFile||previous?.firstFrameFile!==incoming.firstFrameFile;
    // A media receipt is independent of the prompt/reference editor. Keep that
    // live DOM, its caret and unsaved text; only reconcile the result region.
    let anchor=output.querySelector(':scope > .visual-output-box');
    const nextBox=fresh.querySelector(':scope > .visual-output-box');
    if(anchor&&nextBox&&changedFile){anchor.replaceWith(nextBox);anchor=nextBox;}
    if(!anchor)return false;
    for(const selector of ['.visual-result-actions','.visual-video-history','.visual-episode-actions','.visual-task-status']){
      const old=output.querySelector(':scope > '+selector),next=fresh.querySelector(':scope > '+selector);
      if(next){if(old?.open)next.open=true;if(old)old.replaceWith(next);else anchor.after(next);anchor=next;}
      else old?.remove();
    }
    return true;
  }
  async function refreshVideoProject(job) {
    if(job.cancelled)return null;
    let incoming,replyRevision;
    if(!job.episodeStateUnavailable240){
      const query=new URLSearchParams({projectId:job.projectId,episodeId:job.episodeId});
      if(job.cutRevisionId)query.set('cutRevisionId',job.cutRevisionId);
      const response=await fetch('/api/visual/episode/state?'+query.toString(),{cache:'no-store'});
      if(response.status===404){job.episodeStateUnavailable240=true;}
      else{
        const data=await response.json();
        if(!response.ok){const error=new Error(data.error||'暂时无法读取本卡视频结果。');error.httpStatus=response.status;throw error;}
        if(data.projectId!==job.projectId||data.episode?.id!==job.episodeId){const error=new Error('视频状态身份不匹配，已保留当前卡片。');error.httpStatus=409;throw error;}
        incoming=data.episode;replyRevision=data.cutRevisionId;
      }
    }
    if(!incoming&&job.episodeStateUnavailable240){
      // Compatibility with an older local service: probe the scoped endpoint
      // only once per job, and retain the original full-read identity checks.
      const response=await fetch(`/api/visual/project?id=${encodeURIComponent(job.projectId)}`,{cache:'no-store'}),data=await response.json();
      if(!response.ok){const error=new Error(data.error||'暂时无法读取视频结果。');error.httpStatus=response.status;throw error;}
      if(data.project?.id!==job.projectId){const error=new Error('视频项目身份不匹配。');error.httpStatus=409;throw error;}
      incoming=data.project.episodes?.find(item=>item.id===job.episodeId);replyRevision=cutRevision(data.project);
    }
    if(!incoming)throw new Error('原视频对应的分集暂时无法读取，请稍后核对。');
    if(job.cutRevisionId&&replyRevision!==job.cutRevisionId){const error=new Error('视频状态对应旧切割版本，已保留当前卡片。');error.httpStatus=409;throw error;}
    if(job.cancelled)return null;
    if(state.project?.id===job.projectId&&(!job.cutRevisionId||sameCut(job.projectId,job.cutRevisionId))){
      const previous=state.project.episodes.find(item=>item.id===job.episodeId),recordChanged=JSON.stringify(previous)!==JSON.stringify(incoming);
      // Patch exactly this episode; another card's unsaved editor and reference
      // selection must not be replaced by a task's old whole-project snapshot.
      state.project={...state.project,episodes:state.project.episodes.map(item=>item.id===job.episodeId?incoming:item)};
      const node=currentVideoCard(job),selected=node?.querySelector('.episode-select')?.checked;
      const expanded=node?[...node.querySelectorAll('details[open]')].map(item=>item.className):[];
      if(node&&recordChanged){
        if(!patchVideoReceipt240(node,incoming,previous))node.outerHTML=episodeCard(incoming);
        updateEstimate();
        const replacement=currentVideoCard(job);
        if(replacement?.querySelector('.episode-select'))replacement.querySelector('.episode-select').checked=Boolean(selected);
        replacement?.querySelectorAll('details').forEach(item=>{if(expanded.includes(item.className))item.open=true;});
      }
      syncVideoObservers(state.project);
    }
    // A completion promise retains this scoped record, never the full project.
    return {id:job.projectId,episodes:[incoming]};
  }
  async function refreshCompletedVideoProject(job) {
    let failures = 0;
    for (;;) {
      if (job.cancelled) return null;
      try {
        const project = await refreshVideoProject(job);
        const item = project?.episodes?.find(value => value.id === job.episodeId);
        if (item?.status === 'video_failed' && !pendingVideoEpisode(item)) {
          const error=new Error(item.videoRecoveryMessage || '后台确认视频生成失败。');
          error.videoDefinitiveFailure=true; throw error;
        }
        // A done progress receipt is not yet a visible new video. Continue
        // the existing read-only sync until its media record actually arrives.
        if (videoResultReady(item,job)) return project;
        job.phase='waiting'; job.message='视频任务已完成，正在等待成品显示…'; updateVideoJob(job);
        await new Promise(resolve=>setTimeout(resolve,1500));
      }
      catch (error) {
        if (error.videoDefinitiveFailure) throw error;
        if (error.httpStatus && ![408,429].includes(error.httpStatus) && error.httpStatus < 500) throw error;
        failures++;
        job.phase = "reconnecting"; job.message = "视频已保存，正在自动同步最新成品和生成历史…"; updateVideoJob(job);
        await new Promise(resolve => setTimeout(resolve, Math.min(30000, 1500 * 2 ** Math.min(failures - 1, 5))));
      }
    }
  }
  function startVideoJob(job) {
    if (job.promise) return job.promise;
    job.promise = (async () => {
      try {
        let submitted;
        if(job.cutRevisionId&&state.project?.id===job.projectId&&!sameCut(job.projectId,job.cutRevisionId)){const error=new Error('切割版本已改变，旧版排队任务未提交，原记录保留。');error.videoDetached=true;throw error;}
        if (job.request) {
          job.phase = "submitting"; updateVideoJob(job);
          try {
            submitted = await post("/api/visual/episode/video", {...job.request, referenceAssetIds:[...job.request.referenceAssetIds]});
            if (!submitted.taskId) { const error = new Error("任务已提交，正在确认任务编号…"); error.requestUncertain = true; throw error; }
          } catch (error) {
            if (!error.requestUncertain) throw error;
            // A lost submission response must never be retried as a paid generation.
            job.phase = "reconnecting"; job.message = "正在确认已提交任务，只查询原任务，不会重复扣费…"; updateVideoJob(job);
            submitted = await reconnectVideoJob(job);
          }
        } else {
          submitted = job.taskId ? {taskId:job.taskId} : await reconnectVideoJob(job);
        }
        if (submitted.stopped) throw new Error(submitted.message || "原视频任务已停止。");
        let result;
        if (submitted.complete) result = videoTaskResult240(job,submitted.result||submitted);
        else {
          if (!submitted.taskId) throw new Error("没有可查询的原视频任务；未重新生成或扣费。");
          job.taskId = submitted.taskId;
          job.phase = "waiting"; job.message = "视频已提交，正在自动等待上游完成…"; updateVideoJob(job);
          result = videoTaskResult240(job,await waitTask(job.taskId, task => updateVideoJob(job, task), {retryReads:true, shouldStop:() => job.cancelled, onMissing:() => reconnectVideoJob(job)}));
        }
        if (job.cancelled) { const error = new Error("原视频任务已解除。"); error.videoDetached = true; throw error; }
        job.progress = 100; job.phase = "waiting"; job.message = "视频已保存，正在同步最新成品…"; updateVideoJob(job);
        // Fetch the latest project, rather than applying an earlier worker's full snapshot.
        const project = await refreshCompletedVideoProject(job); result = videoTaskResult240(job,result,project);
        if (job.cancelled) { const error = new Error("原视频任务已解除。"); error.videoDetached = true; throw error; }
        job.active = false; job.phase = "done"; job.message = "视频生成成功，已保存到本机"; updateVideoJob(job);
        if (state.project?.id === job.projectId) syncVideoObservers(state.project);
        if (!job.cancelled && state.project?.id === job.projectId) toast(`第${job.episodeNumber}集视频生成成功并已保存。`);
        return result;
      } catch (error) {
        job.active = false; job.error = !error.videoDetached; job.phase = "stopped"; job.message = error.videoDetached ? "原任务已解除，本机查询已停止。" : `任务已停止：${error.message}`; updateVideoJob(job);
        try { await refreshVideoProject(job); } catch (_) {}
        throw error;
      }
    })();
    return job.promise;
  }
  function syncVideoObservers(project) {
    if (!state.activeVideoJobs) state.activeVideoJobs = new Map();
    for (const item of project.episodes || []) {
      const key = videoJobKey(project.id,item.id), existing = state.activeVideoJobs.get(key);
      if (existing?.active) { updateVideoJob(existing); continue; }
      const node=[...document.querySelectorAll('.visual-episode-card')].find(node=>node.dataset.episode===item.id);
      syncVideoAnimation(node,item,existing);
      if (!pendingVideoEpisode(item)) continue;
      const sameTask = existing && (item.localVideoTaskId ? existing.taskId === item.localVideoTaskId : existing.remoteTaskId === (item.remoteTaskId || ""));
      if (sameTask && (existing.error || existing.phase === "done" || existing.cancelled)) { updateVideoJob(existing); continue; }
      const job = createVideoJob(project,item);
      startVideoJob(job).catch(error => { if (!error.videoDetached && state.project?.id === job.projectId) toast(`第${job.episodeNumber}集：${error.message}`,true); });
    }
  }
  // 视频只使用本集分镜与已勾选参考图；每个排队任务保存独立且固定的输入。
  async function videoGenerate(node, shouldRender = true, queuedJob = null) {
    if(!queuedJob)await flushEpisodeReferenceSaves(node);
    const project = state.project;
    const item = project?.episodes?.find(value => value.id === node.dataset.episode);
    if (!item && !queuedJob) throw new Error("本集已不在当前项目中。");
    const key = queuedJob?.key || videoJobKey(project.id,item.id), existing = state.activeVideoJobs.get(key);
    if (!queuedJob && existing?.active) return existing.promise || {queued:true};
    const request = queuedJob ? queuedJob.request : pendingVideoEpisode(item) ? null : videoRequestSnapshot(node,project,item);
    const warning = request && ModelPresentation.activityWarning(state.profile,request.videoModel,request.resolution);
    if (!queuedJob && warning && !await studioConfirm(`${warning}\n\n本集${request.duration}秒，按次生成一次。是否提交？`)) return;
    // Recheck after a confirmation yields; another click may have started this episode.
    if (!queuedJob && state.activeVideoJobs.get(key)?.active) return state.activeVideoJobs.get(key).promise;
    const job = queuedJob || createVideoJob(project,item,request);
    return startVideoJob(job);
  }

  async function applyGlobalVideoSettings() {
    if (!state.project) return;
    const projectId=state.project.id,revision=cutRevision(state.project);
    const button = $("applyGlobalVideoSettings");
    const duration = configuredVideoDuration($('visualVideoDuration')), model = selectedModel('video'), resolution = $('visualResolution').value;
    const issue = videoCapabilityIssue(model,duration,resolution,$('visualVideoRatio').value);
    if (issue) return toast(issue,true);
    const adaptive = state.project.episodes.filter(item=>adaptiveEpisodeDuration(item) != null);
    const lockedIssue = adaptive.map(item=>adaptiveVideoIssue(item,model,adaptiveEpisodeDuration(item),resolution) || videoCapabilityIssue(model,adaptiveEpisodeDuration(item),resolution)).find(Boolean);
    if (lockedIssue) return toast(lockedIssue,true);
    const warning = ModelPresentation.activityWarning(state.profile,model,resolution);
    if (!await studioConfirm(`确定把当前全局模型、分辨率、${adaptive.length ? '旧固定卡的时长' : '时长'}和画面方向同步到全部${state.project.episodes.length}集吗？${adaptive.length ? `\n其中${adaptive.length}张自然时长卡保留各自实际秒数，不改为全局${duration}秒。` : ''}\n\n已有视频和生成历史不会删除；原剧本及分镜不会自动裁切。之后点击某一集生成时会按该集当前设置执行。${warning ? '\n\n'+warning : ''}`)) return;
    try {
      button.disabled = true;
      if(!sameCut(projectId,revision))return;
      const data = await post("/api/visual/episode/settings/apply-all", { projectId,cutRevisionId:revision, settings: { videoRouteType: modelRoute234("video",model,$("visualVideoRouteType").value), videoModel: model, videoTier: selectedTier("video"), resolution, duration, ratio: $("visualVideoRatio").value } });
      if(canApplyCutResponse(projectId,revision,data.project)){render(data.project); toast(data.message || "已同步到全部分镜。");}
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }

  async function saveSingleEpisodeVideoSettings(node) {
    const projectId=state.project?.id,revision=cutRevision(state.project);
    const item = state.project?.episodes?.find(value => value.id === node?.dataset.episode);
    const modelSelect = node?.querySelector(".episode-video-model"), resolutionSelect = node?.querySelector(".episode-video-resolution");
    if (!item || !modelSelect || !resolutionSelect) return;
    const issue = adaptiveVideoIssue(item,modelSelect.value,chosenEpisodeDuration(item,node),resolutionSelect.value) || videoCapabilityIssue(modelSelect.value,chosenEpisodeDuration(item,node),resolutionSelect.value,chosenEpisodeRatio(item,node));
    if (issue) return toast(issue,true);
    refreshEpisodeTail239(node,item);
    const selected = modelSelect.selectedOptions[0];
    const data = await post("/api/visual/episode/settings", { projectId,cutRevisionId:revision, episodeId: item.id, settings: { videoRouteType: modelRoute234("video",modelSelect.value,node.querySelector(".episode-video-route")?.value), videoModel: modelSelect.value, videoTier: selected?.dataset.tier || "economy", resolution: resolutionSelect.value, duration: chosenEpisodeDuration(item, node), ratio: chosenEpisodeRatio(item, node), tailFrameContinuation: node.querySelector('.episode-tail-continuation')?.checked===true, tailFrameMode: node.querySelector('.episode-tail-continuation')?.dataset.tailMode||'first-frame' } });
    if(!canApplyCutResponse(projectId,revision,data.project))return;
    state.project = data.project;
    updateEstimate();
  }
  async function clearVideoHistory(node, historyId = "") {
    const projectId=state.project?.id,revision=cutRevision(state.project);
    const item = state.project?.episodes?.find(value => value.id === node.dataset.episode);
    if (!item) return;
    const text = historyId ? "确定删除这个生成版本吗？删除后无法恢复。" : "确定清除此集的全部视频生成历史吗？所有视频文件都会删除，无法恢复。";
    if (!await studioConfirm(text, {danger:true})) return;
    try {
      if(!sameCut(projectId,revision))return;
      const data = await post("/api/visual/video-history/clear", { projectId,cutRevisionId:revision, episodeId: item.id, historyId });
      if(canApplyCutResponse(projectId,revision,data.project)){render(data.project); toast(data.message || "视频历史已清理。");}
    } catch (error) { toast(error.message, true); }
  }

  async function resetVideoTask(node) {
    const projectId = state.project?.id,revision=cutRevision(state.project);
    const item = state.project?.episodes?.find(value => value.id === node.dataset.episode);
    if (!item) return;
    if (node.dataset.resetting === '1') return;
    node.dataset.resetting = '1';
    const resetButton = node.querySelector('.video-reset');
    if (resetButton) resetButton.disabled = true;
    const warning = "确定解除本机对旧任务的等待，并立即重新生成本集视频吗？\n\n旧任务会从当前卡片的等待状态中脱离，任务记录仍保留；软件无法保证取消已经提交到上游的任务，旧任务之后若完成仍可能保存到历史。新任务按当前模型报价正常计费。若旧请求的提交回执尚未核实，系统会阻止重提以避免重复提交。";
    if (!await studioConfirm(warning)) {
      delete node.dataset.resetting;
      if (resetButton?.isConnected) resetButton.disabled = false;
      return;
    }
    try {
      if(!sameCut(projectId,revision))return;
      const data = await post("/api/visual/episode/video/reset", { projectId,cutRevisionId:revision, episodeId: item.id });
      const job = state.activeVideoJobs.get(videoJobKey(projectId,item.id));
      if (job) { job.cancelled = true; job.active = false; updateVideoJob(job); }
      if (!canApplyCutResponse(projectId,revision,data.project)) return;
      render(data.project);
      const nextNode = document.querySelector(`.visual-episode-card[data-episode="${CSS.escape(item.id)}"]`);
      if (!nextNode) throw new Error('卡片已更新，请重新选择本集生成。');
      await videoGenerate(nextNode);
      toast("旧任务已解除，新视频任务已提交。");
    } catch (error) { toast(error.message, true); }
    finally {
      delete node.dataset.resetting;
      if (resetButton?.isConnected) resetButton.disabled = false;
    }
  }

  async function batchAssets(kind) {
    if (state.assetQueueKinds.has(kind)) return toast(`已有${{people:"人物",scenes:"场景",props:"物品"}[kind]}队列在执行；其他类别仍可独立提交。`, true);
    const selected = [...document.querySelectorAll(`.visual-card[data-kind="${kind}"]`)].filter(node => node.querySelector(".asset-select")?.checked);
    if (!selected.length) return toast("请先选择要生成的参考图。", true);
    const nodes = selected.filter(node => !node.querySelector(".asset-generate")?.disabled);
    const recoveries = selected.filter(node => node.querySelector(".asset-generate")?.disabled && node.querySelector('.asset-observe:not(:disabled)'))
      .map(node => ({kind, assetId:node.dataset.id, name:state.project?.assets?.[kind]?.find(item=>item.id===node.dataset.id)?.name||'素材'}));
    const busyCount = selected.length - nodes.length - recoveries.length;
    if (!nodes.length && !recoveries.length) return toast(`已选${selected.length}张参考图仍在处理或查询中；未重复提交。`, true);
    // Freeze every card before the first await. Earlier completions can
    // rebuild the DOM while later cards are still waiting for a worker.
    let requests=nodes.map(node=>freezeAssetRequest(node));const projectId=state.project.id;
    const jobs=state.activeAssetJobs,queueKinds=state.assetQueueKinds,items=nodes.map(node=>({...state.project.assets[kind].find(item=>item.id===node.dataset.id)}));
    if (kind === "people") {
      const masked = requests.filter(request=>request.eyeMask);
      if (masked.length && !await studioConfirm(`本批次有${masked.length}个人物启用了眼部遮挡。\n\n确认继续生成吗？取消后不会提交，也不会扣费。`)) return;
    }
    if(state.project?.id!==projectId || state.assetQueueKinds.has(kind))return;
    requests=await prepareBatchMedia236('asset',requests);
    if(state.project?.id!==projectId || state.assetQueueKinds.has(kind))return;
    state.assetQueueKinds.add(kind);
    state.assetQueuePending += nodes.length;
    nodes.forEach(node => { const token = `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`; node.dataset.queueToken = token; node.dataset.queued = "true"; updateAssetJob(node,{projectId,active:true,token,phase:"queued",message:"排队中，尚未提交…"}); });
    let done = 0, failed = 0, cursor = 0, rateLimited = 0, throttleUntil = 0;
    let recovered = 0, refunded = 0, recoveryPending = 0, recoveryFailed = 0, recoveryCursor = 0;
    try {
      // Recovery is a read/download of the selected ORIGINAL order. A selected
      // paused card must not disappear from the selection or silently create a
      // new bill. Freeze these identities before any returned project rerenders.
      if(recoveries.length)toast(`正在接回${recoveries.length}张原图片，不会重新生成或新增扣费。`);
      const recoveryWorker = async () => { for (;;) {
        const owned = recoveries[recoveryCursor++];
        if(!owned)return;
        const control=state.project?.id===projectId?[...document.querySelectorAll('.visual-card')].find(node=>node.dataset.projectId===projectId&&node.dataset.kind===kind&&node.dataset.id===owned.assetId)?.querySelector('.asset-observe'):null;
        if(control)control.disabled=true;
        try {
          const data = await post('/api/visual/asset/observe',{projectId,kind:owned.kind,assetId:owned.assetId});
          if (data.ok!==true || data.project?.id!==projectId) throw new Error('原图片返回的项目身份不一致，未采用。');
          const phase=data.recovery?.status;
          if (phase==='completed') recovered++;
          else if (phase==='refunded') refunded++;
          else recoveryPending++;
          const old=jobs.get(`${kind}:${owned.assetId}`);
          if(!old?.active)jobs.delete(`${kind}:${owned.assetId}`);
          // Independent original lookups can finish out of order. Do not
          // replace the whole current project with an older response snapshot;
          // the normal result refresh and final reload read current storage.
        } catch (error) {
          recoveryFailed++;
          if(state.project?.id===projectId)toast(`“${owned.name}”原图片未接回：${error.message}；未重新生成。`,true);
        } finally {
          if(control?.isConnected)control.disabled=false;
        }
      }};
      // 每张卡密固定最多10路图片并发。后台还会按卡密再次限流，
      // 防止同一卡密多开软件时合计超过10路；429仍在同一计费任务内退避重试。
      const worker = async () => {
        for (;;) {
          const index = cursor++;
          if (index >= nodes.length) return;
          const node = nodes[index];
          try {
            const queuedJob = jobs.get(`${kind}:${node.dataset.id}`);
            if (!queuedJob?.active || queuedJob.token !== node.dataset.queueToken) { failed++; continue; }
            const remaining = throttleUntil - Date.now();
            if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
            await assetGenerate(node, true, true, node.dataset.queueToken,requests[index],items[index]);
            done++;
          } catch (error) {
            failed++;
            if (/429|RateQuota|rate limit|请求过多|限流/i.test(String(error?.message || error))) {
              rateLimited++;
              throttleUntil = Math.max(throttleUntil, Date.now() + Math.min(30000, 8000 + rateLimited * 4000));
              toast(`图片平台限流，本项自动重试后仍未成功；队列已降速并继续其他素材。`, true);
            } else if (!error.assetPreviewHandled) {
              toast(`“${node.dataset.id || "素材"}”生成失败，队列继续处理其余项目：${error.message}`, true);
            }
          } finally {
            delete node.dataset.queued;
            node.querySelector(".asset-generate").disabled = Boolean(jobs.get(`${kind}:${node.dataset.id}`)?.paused);
            const owner=state.project?.id===projectId?state:workFor(projectId);owner.assetQueuePending=Math.max(0,owner.assetQueuePending-1);
          }
        }
      };
      await Promise.all([
        ...Array.from({ length: Math.min(10, nodes.length) }, () => worker()),
        ...Array.from({ length: Math.min(3, recoveries.length) }, () => recoveryWorker())
      ]);
    } finally {
      nodes.forEach(node => {
        if (node.dataset.queued) {
          delete node.dataset.queued;
          node.querySelector(".asset-generate").disabled = false;
          updateAssetJob(node,{projectId,token:node.dataset.queueToken,active:false,phase:"error",message:"已停止，未提交；须手动重新生成",error:true});
        }
      });
      queueKinds.delete(kind);
    }
    if (state.project?.id===projectId) {
      await reloadProject();
      const unsubmitted = Math.max(0, nodes.length - done - failed);
      const recoveryText=recoveries.length?`原图片接回${recovered}张${refunded?`，已退款${refunded}张（可再次点击生成）`:''}${recoveryPending?`，结果未明确${recoveryPending}张`:''}${recoveryFailed?`，接回失败${recoveryFailed}张`:''}；未对这些卡重新生成。`:'';
      const generatedText=nodes.length?`图片并发批次结束：成功${done}张，失败${failed}张${unsubmitted ? `，${unsubmitted}张未提交` : ""}。`:'';
      toast(`${generatedText}${recoveryText}${busyCount?`另有${busyCount}张仍在处理，未重复提交。`:''}`, failed > 0 || recoveryFailed > 0 || recoveryPending > 0);
    }
  }
  async function batchVideos() {
    const nodes = [...document.querySelectorAll(".visual-episode-card")].filter(x => x.querySelector(".episode-select")?.checked);
    if (!nodes.length) return toast("请选择要生成的分集。", true);
    const projectId=state.project.id, revision=cutRevision(state.project);
    await Promise.all(nodes.map(flushEpisodeReferenceSaves));
    if(!sameCut(projectId,revision))throw new Error('项目已变化，请重新选择要生成的分集。');
    const project = state.project;
    const runnable = nodes.filter(node => !node.querySelector(".video-generate").disabled && !state.activeVideoJobs.get(videoJobKey(project.id,node.dataset.episode))?.active);
    if (!runnable.length) return toast("所选视频已在自动等待中，无需重复提交。");
    // Finish reference saves before freezing each card's independent inputs.
    const inputs = runnable.map(node => {
      const item = project.episodes.find(value => value.id === node.dataset.episode);
      return {item,request:pendingVideoEpisode(item) ? null : videoRequestSnapshot(node,project,item)};
    });
    const prepared=await prepareBatchMedia236('video',inputs.map(value=>value.request));
    inputs.forEach((value,index)=>value.request=prepared[index]);
    const tailBatch237=inputs.some(({request})=>request?.tailFrameContinuation===true);
    if(tailBatch237){inputs.sort((a,b)=>project.episodes.findIndex(row=>row.id===a.item.id)-project.episodes.findIndex(row=>row.id===b.item.id));if(!await studioConfirm('尾帧续画已开启，本批将按卡片顺序等待前卡视频保存后继续；任一卡失败或待核对将暂停后续依赖，手选资产图保留。是否继续？'))return;}
    const activity = inputs.some(({request}) => request && ModelPresentation.activityWarning(state.profile,request.videoModel,request.resolution));
    if (activity && !await studioConfirm(`${ModelPresentation.ACTIVITY_VIDEO_WARNING}\n\n本批最多并发5集，每集按其模型计价，是否提交所选${inputs.length}集？`)) return;
    if (inputs.some(({item}) => state.activeVideoJobs.get(videoJobKey(project.id,item.id))?.active)) return toast('部分所选任务刚已提交，请刷新后选择其余分集，避免重复生成。');
    const jobs = inputs.map(({item,request}) => createVideoJob(project,item,request,true));
    // Batches may add different episodes while an earlier batch is waiting.
    // Per-episode jobs prevent duplicates; the local backend owns the shared
    // five-slot executor across batches and individual clicks.
    state.videoBatchPending = (state.videoBatchPending || 0) + 1;
    state.videoBatchRunning = true;
    let done = 0, failed = 0, cursor = 0;
    try {
      await saveCurrentProjectSettings(false);
      const worker = async () => {
        for (;;) {
          const index = cursor++;
          if (index >= jobs.length) return;
          const job = jobs[index];
          try {
            await startVideoJob(job); done++;
          } catch (error) { failed++; if (state.project?.id === project.id) toast(`第${job.episodeNumber}集失败，${tailBatch237?'后续尾帧依赖已暂停，原任务可继续查询':'正在继续其余已选分集'}：${error.message}`, true); if(tailBatch237)return; }
        }
      };
      await Promise.all(Array.from({length:tailBatch237?1:Math.min(5,jobs.length)},worker));
      if (state.project?.id === project.id) { await loadProjects(); toast(`本批视频完成：成功${done}集，失败${failed}集；其他已提交任务继续独立执行。`, failed > 0); }
    } finally {
      jobs.filter(job => job.phase === "queued").forEach(job => { job.active = false; job.message = "未提交；可重新点击生成视频。"; updateVideoJob(job); });
      state.videoBatchPending = Math.max(0,(state.videoBatchPending || 1) - 1);
      state.videoBatchRunning = state.videoBatchPending > 0;
    }
  }
  async function saveAssetPrompt(node) {
    const projectId=state.project.id,revision=cutRevision(state.project),kind=node.dataset.kind;
    const item=state.project.assets[kind].find(x=>x.id===node.dataset.id),button=node.querySelector('.save-asset-prompt'),statusNode=node.querySelector('.visual-task-status');
    const speechProfile = kind === "people" ? {
      language: node.querySelector(".asset-speech-language").value.trim(),
      accent: node.querySelector(".asset-speech-accent").value.trim(),
      timbre: node.querySelector(".asset-speech-timbre").value.trim(),
    } : undefined;
    if(speechProfile)captureCharacterSpeech251(node);
    const speechKey=speechProfile?speechOwnerKey251(item):'',speechRevision=characterSpeechDrafts251.get(speechKey)?.revision||0;
    if(speechKey&&characterSpeechSaves251.has(speechKey)){toast('同一人物的描述词与声音设定正在保存；后续编辑已保留，请稍后再保存。');return;}
    if(speechKey)characterSpeechSaves251.add(speechKey);
    try{button.disabled=true;const data=await post('/api/visual/asset/prompt',{projectId,kind,assetId:item.id,prompt:node.querySelector('.visual-asset-prompt').value,imageModel:node.querySelector('.asset-image-model')?.value||'',eyeMask:Boolean(node.querySelector('.asset-eye-mask input')?.checked),appearanceType:node.querySelector('.asset-appearance-type')?.value || item.generationSettings?.appearanceType || 'auto',speechProfile});
      if (canApplyCutResponse(projectId, revision, data.project)) {
        state.project = data.project;
        if (speechProfile) {
          const saved = data.project.assets.people.find(row => row.id === item.id);
          const draft=characterSpeechDrafts251.get(speechKey);
          if((draft?.revision||0)===speechRevision)characterSpeechDrafts251.delete(speechKey);
          const savedProfile = characterSpeech248(saved || item);
          // Voice belongs to the person, not the costume visible at submission.
          // A later costume switch receives the shared saved value; later typing wins.
          for(const currentNode of document.querySelectorAll('.visual-card[data-kind="people"]')){
            const visible=data.project.assets.people.find(row=>row.id===currentNode.dataset.id);
            if(!visible||speechOwnerKey251(visible)!==speechKey)continue;
            const summary=currentNode.querySelector('.asset-speech-summary');if(summary)summary.textContent=characterSpeechSummary248(savedProfile);
            if(characterSpeechDrafts251.has(speechKey)){
              const pendingStatus=currentNode.querySelector('.visual-task-status');
              if(pendingStatus)pendingStatus.textContent='上一版已保存；随后编辑的声音设定仍待保存。';
            }
            for(const [field,selector] of Object.entries(speechFields251)){
              const control=currentNode.querySelector(selector);if(control)setSpeechValue249(control,savedProfile[field]);
            }
          }
        }
        const laterSpeech=Boolean(speechKey&&characterSpeechDrafts251.has(speechKey));
        if (node.querySelector('.asset-preview-status')?.hidden && statusNode) statusNode.textContent = laterSpeech?'上一版已保存；随后编辑的声音设定仍待保存。':'描述词与设置已保存';
        toast(`${item.name}的描述词与设置已保存。${laterSpeech?'随后编辑的声音设定仍待保存。':''}`);
      }
    }finally{if(speechKey)characterSpeechSaves251.delete(speechKey);button.disabled=false;}
  }
  async function uploadAsset(node, file, input = null) {
    if (!file) return;
    const projectId=state.project.id,revision=cutRevision(state.project);
    const kind = node.dataset.kind;
    const item = state.project.assets[kind].find(x => x.id === node.dataset.id);
    const button = node.querySelector(".asset-upload");
    const originalButtonText = button?.textContent || "上传图片";
    if (!item) throw new Error("找不到需要替换的剧内素材。");
    if (file.size <= 0) throw new Error("这张图片内容为空，请重新选择。");
    if (file.size > 15 * 1024 * 1024) throw new Error("图片不能超过15MB。");
    if (file.type && !["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(file.type.toLowerCase())) throw new Error("仅支持JPG、PNG、WebP或BMP图片。");
    const controller = new AbortController();
    const started = Date.now();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const ticker = setInterval(() => {
      const elapsed = Math.max(1, Math.floor((Date.now() - started) / 1000));
      setAssetPreviewStatus(node,{phase:"uploading",busy:true,title:"正在上传图片",message:`已等待${elapsed}秒`,visible:true});
      if (button) button.textContent = `上传中 ${elapsed}秒`;
    }, 1000);
    try {
      if (button) { button.disabled = true; button.textContent = "上传中 0秒"; }
      setAssetPreviewStatus(node,{phase:"uploading",busy:true,title:"正在上传图片",message:"请稍候…",visible:true});
      const query = new URLSearchParams({ projectId, kind, assetId:item.id });
      const response = await fetch(`/api/visual/asset/upload?${query}`, {
        method:"POST",
        headers:{"Content-Type":file.type || "application/octet-stream"},
        body:file,
        signal:controller.signal,
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error("上传接口返回了无法识别的结果。"); }
      if (!response.ok) throw new Error(data.error || `上传失败（${response.status}）`);
      if (!data.project) throw new Error("图片已上传，但项目状态未返回，请刷新项目重试。");
      const pendingJob = state.activeAssetJobs.get(`${kind}:${item.id}`);
      if (pendingJob?.active) state.activeAssetJobs.set(`${kind}:${item.id}`,{active:false,token:pendingJob.token,message:"已改用上传图片；旧任务结果会被丢弃，可重新生成。"});
      else state.activeAssetJobs.delete(`${kind}:${item.id}`);
      if(canApplyCutResponse(projectId,revision,data.project)){render(data.project);toast(`${item.name}已替换为你上传的图片。`);}
    } catch (error) {
      const message = error?.name === "AbortError" ? "上传超过120秒未完成，已中止等待，请换一张较小图片后重试。" : (error?.message || "上传失败。");
      setAssetPreviewStatus(node,{phase:"error",busy:false,title:"图片上传失败",message,visible:true});
      const failure = new Error(message); failure.assetPreviewHandled = true; throw failure;
    } finally {
      clearTimeout(timeout);
      clearInterval(ticker);
      if (button) { button.disabled = false; button.textContent = originalButtonText; }
      if (input) input.value = "";
    }
  }
  async function uploadEpisodeReference(node, file, input = null) {
    if (!file) return;
    const projectId=state.project.id,revision=cutRevision(state.project);
    if (file.size <= 0) throw new Error("这张图片内容为空，请重新选择。");
    if (file.size > 15 * 1024 * 1024) throw new Error("图片不能超过15MB。");
    if (file.type && !["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(file.type.toLowerCase())) throw new Error("仅支持JPG、PNG、WebP或BMP图片。");
    const item = state.project.episodes.find(value => value.id === node.dataset.episode);
    if (!item) throw new Error("找不到当前视频卡。");
    const button = node.querySelector(".episode-reference-upload"), original = button?.textContent || "＋ 上传外部参考图";
    try {
      if (button) { button.disabled = true; button.textContent = "上传中…"; }
      const existing = createdExternalReferenceCount(item);
      const name = `第${item.number}集外部参考图${existing ? ` ${existing + 1}` : ""}`;
      const created = await post("/api/visual/asset/add", { projectId, kind:"props", name, description:"本集手动上传的外部参考图", prompt:"" });
      if(!sameCut(projectId,revision))return;
      const asset = (created.project?.assets?.props || []).find(value => value.name === name);
      if (!asset?.id) throw new Error("创建外部参考图素材失败。");
      const query = new URLSearchParams({ projectId, kind:"props", assetId:asset.id });
      const response = await fetch(`/api/visual/asset/upload?${query}`, { method:"POST", headers:{"Content-Type":file.type || "application/octet-stream"}, body:file });
      const raw = await response.text(); let uploaded = {};
      try { uploaded = raw ? JSON.parse(raw) : {}; } catch (_) { throw new Error("上传接口返回了无法识别的结果。"); }
      if (!response.ok || !uploaded.project) throw new Error(uploaded.error || `上传失败（${response.status}）`);
      const latest = uploaded.project.episodes?.find(value => value.id === item.id) || item;
      const current = episodeReferenceIds(latest).filter(value => value !== `props:${asset.id}`);
      if(!sameCut(projectId,revision))return;
      const saved = await post("/api/visual/episode/references", { projectId,cutRevisionId:revision, episodeId:item.id, referenceAssetIds:[...new Set([...current, `props:${asset.id}`])] });
      if(canApplyCutResponse(projectId,revision,saved.project)){render(saved.project);toast(`外部图片已添加到第${item.number}集参考图。`);}
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
      if (input) input.value = "";
    }
  }
  async function removeEpisodeReference(node, button) {
    const projectId=state.project?.id,revision=cutRevision(state.project);
    const referenceId = button?.dataset.referenceId || "";
    const [kind, assetId] = referenceId.split(":");
    const item = state.project?.episodes?.find(value => value.id === node.dataset.episode);
    const asset = (state.project?.assets?.[kind] || []).find(value => String(value.id) === assetId);
    if (!item || kind !== "props" || !asset || !String(asset.name || "").startsWith(`第${item.number}集外部参考图`)) return;
    if (!await studioConfirm(`确定删除“${asset.name}”吗？\n\n删除后会从本集参考图移除，也可以在项目素材记录中恢复。`)) return;
    button.disabled = true;
    try {
      if(!sameCut(projectId,revision))return;
      const data = await post("/api/visual/asset/delete", { projectId, kind, assetId });
      if(canApplyCutResponse(projectId,revision,data.project)){render(data.project);toast(`已删除${asset.name}。`);}
    } finally { button.disabled = false; }
  }
  function createdExternalReferenceCount(item) {
    const prefix = `第${item.number}集外部参考图`;
    return (state.project?.assets?.props || []).filter(value => String(value.name || "").startsWith(prefix)).length;
  }
  async function saveEpisodeReferences(node, options={}) {
    const context=referenceEditorContexts.get(node);
    if(!context)throw new Error('当前参考图编辑器尚未准备好，请刷新视频卡后重试。');
    const {projectId,revision,key,number,item,source,selectionState}=context;
    descriptionEditGuard(projectId,number,revision);
    const ids=[...new Set(options.ids||context.selected())];
    if(options.validateLimit!==false)validateVideoReferences(ids,node.querySelector('.episode-video-model')?.value);
    const prompt=options.prompt===undefined?context.input.value:options.prompt;
    const savePrompt=options.savePrompt===true;
    const sequence=++selectionState.sequence;
    const payload={projectId,cutRevisionId:revision,referenceAssetIds:ids};
    if(item)payload.episodeId=item.id;
    else payload.number=number;
    const sourceHash=item?null:window.WorkflowCutEditor.fingerprint(source);
    if(savePrompt){payload.prompt=prompt;payload.promptStyleEditable=Boolean(projectStyleSpec()||item?.videoPromptStyleEditable);if(options.referenceSync)payload.referenceSync=true;}
    const status=context.panel.querySelector('.mention-save-status');
    if(savePrompt&&status)status.textContent='正在同步保存引用与描述词…';
    return queueReferenceSave(key,async()=>{
      if(sourceHash)payload.sourceHash=await sourceHash;
      descriptionEditGuard(projectId,number,revision);
      const data=await post(savePrompt?(item?'/api/visual/episode/prompt':'/api/visual/cut/prompt-save'):'/api/visual/episode/references',payload);
      selectionState.committedIds=ids.slice();
      if(!sameCut(projectId,revision))return data;
      const live=referenceEditorsByKey.get(key), isLatest=selectionState.sequence===sequence;
      if(isLatest&&canApplyCutResponse(projectId,revision,data.project)){
        // Merge only this write's fields; a delayed response must not replace
        // another episode, a newer model result, or existing media/history.
        const current=currentEpisode(state.project,number), saved=currentEpisode(data.project,number);
        if(current&&saved){
          current.referenceAssetIds=ids.slice();current.referenceSelectionManual=true;
          if(savePrompt){current.videoPrompt=saved.videoPrompt??prompt;current.videoPromptStyleEditable=saved.videoPromptStyleEditable??payload.promptStyleEditable;}
        }else if(!item&&data.project.cutPromptDrafts?.[String(number)]){
          state.project.cutPromptDrafts={...(state.project.cutPromptDrafts||{}),[String(number)]:data.project.cutPromptDrafts[String(number)]};
        }
        if(savePrompt&&mentionDrafts.get(key)===prompt&&JSON.stringify(live?.selected()||[])===JSON.stringify(ids)){
          mentionDrafts.delete(key);mentionDraftSources.delete(key);mentionDraftReferences.delete(key);
        }
      }
      if(isLatest&&live?.node.isConnected){
        const dirty=mentionDrafts.has(key), message=savePrompt?(dirty?'引用已保存；有后续未保存文字，请点击保存描述词。':'引用与描述词已同步保存；未调用模型、未扣费。'):`已保存${ids.length}张本集参考图`;
        live.panel.querySelector('.mention-save-status').textContent=message;
        const taskStatus=live.node.querySelector('.visual-task-status');if(taskStatus)taskStatus.textContent=message;
      }
      return data;
    }).catch(error=>{
      if(sameCut(projectId,revision)&&selectionState.sequence===sequence){
        const live=referenceEditorsByKey.get(key);
        if(live?.node.isConnected){
          const committed=selectionState.committedIds.filter(id=>availableReferenceAssets().some(asset=>asset.referenceId===id));
          live.node.querySelectorAll('.episode-reference').forEach(input=>input.checked=committed.includes(input.value));
          const count=live.node.querySelector('.visual-reference-count');
          if(count)count.textContent=`已选 ${committed.length} 张 · 共 ${live.node.querySelectorAll('.episode-reference').length} 张`;
          mentionDraftReferences.set(key,committed);
          if(options.syncSelection!==false&&live.mounted.value()===prompt)live.mounted.syncSelection(committed,{includeUnmentioned:true});
          live.panel.querySelector('.mention-save-status').textContent=`保存失败：${error.message}；已保留文字草稿，引用恢复为最近已保存选择。`;
        }
      }
      throw error;
    });
  }
  async function handleEpisodeReferenceChange(checkbox) {
    const node=checkbox.closest('.visual-episode-card'), context=referenceEditorContexts.get(node);
    const previous=!checkbox.checked;let synchronized=false;
    try{
      if(!context)throw new Error('当前参考图编辑器尚未准备好。');
      descriptionEditGuard(context.projectId,context.number,context.revision);
      const ids=checkedReferenceIds(node);
      // Allow reducing an already-over-limit selection after changing models.
      if(checkbox.checked)validateVideoReferences(ids,node.querySelector('.episode-video-model')?.value);
      mentionDraftReferences.set(context.key,ids.slice());
      const prompt=context.mounted.syncSelection(ids,{includeUnmentioned:true});
      synchronized=true;
      await saveEpisodeReferences(node,{prompt,ids,savePrompt:true,validateLimit:false,referenceSync:true});
    }catch(error){
      if(!synchronized&&node?.isConnected)checkbox.checked=previous;
      throw error;
    }
  }
  async function fillEpisodeReferenceMatches(button) {
    const node=button.closest('.visual-episode-card'),context=referenceEditorContexts.get(node);
    if(!node||!context)throw new Error('当前参考图编辑器尚未准备好。');
    descriptionEditGuard(context.projectId,context.number,context.revision);
    const item={...(context.item||{}),sourceText:context.source,storyboard:context.item?.storyboard||node.querySelector('.visual-episode-storyboard pre')?.textContent||'',videoPrompt:context.input?.value||''};
    const matched=autoReferenceIds(item), selected=new Set(checkedReferenceIds(node));
    const candidates=matched.filter(id=>!selected.has(id));
    const limit=videoReferenceLimit(node.querySelector('.episode-video-model')?.value);
    const capacity=limit==null?candidates.length:Math.max(0,limit-selected.size);
    const added=candidates.slice(0,capacity);
    if(!added.length){toast(candidates.length?'本集参考图已达当前模型上限，未更改已选内容。':'没有发现新的匹配人物、场景或物品；可检查资产名称与分镜正文。',Boolean(candidates.length));return;}
    const original=button.textContent;
    button.disabled=true;button.textContent='正在补齐…';
    try{
      const ids=[...selected,...added];
      await saveEpisodeReferences(node,{ids,syncSelection:false});
      node.querySelectorAll('.episode-reference').forEach(input=>input.checked=ids.includes(input.value));
      const count=node.querySelector('.visual-reference-count');
      if(count)count.textContent=`已选 ${ids.length} 张 · 共 ${node.querySelectorAll('.episode-reference').length} 张`;
      const omitted=candidates.length-added.length;
      toast(`已自动补齐${added.length}张匹配参考图${omitted?`；另有${omitted}张因本集模型引用上限未加入`:''}。`);
    }finally{if(button.isConnected){button.disabled=false;button.textContent=original;}}
  }
  async function generateCover() {
    const projectId=state.project.id,revision=cutRevision(state.project),button=$('generateVisualCover');
    let restoring=!!ModelPresentation.pendingImageRecovery(state.project,'/api/visual/cover/generate');
    const referenceAssetIds=checkedReferenceIds($('visualCoverResult'),'.cover-reference'),size=imageSizeForRatio('9:16');
    try {
      button.disabled=true;button.dataset.busy='1';button.textContent='生成海报';window.ModelActivity?.set(button,{state:"pending",preserve:true});
      const data=await post('/api/visual/cover/generate',{projectId,cutRevisionId:revision,tier:$('visualImageTier').value,size,description:$('visualCoverPrompt')?.value||'',referenceAssetIds});
      restoring=restoring||data.resumeOnly===true;
      const result=await waitTask(data.taskId,task=>{
        if(!sameCut(projectId,revision))return;
        button.textContent=`海报生成中 ${Math.max(0,Math.min(100,Number(task.progress||0)))}%`;
        const status=$('visualCoverResult')?.querySelector('.visual-task-status');if(status)window.ModelActivity?.task(status,task,{success:"海报已生成"});
      });
      if(!sameCut(projectId,revision))return;
      await reloadProject();
      if(sameCut(projectId,revision))toast(restoring?'原海报已领取并保存为JPG，没有新增生成或扣费。':`本项目海报已生成并保存为JPG，本次扣除${result.estimatedPoints==null?'后台记录的':Number(result.estimatedPoints).toFixed(2)}积分。`);
    }catch(error){if(sameCut(projectId,revision)){await reloadProject().catch(()=>{});if(sameCut(projectId,revision))toast(restoring?`原海报仍待核对：${error.message}。原请求保留，没有重新生成。`:`海报生成失败：${error.message}。任务已停止，失败不会扣除积分。`,true);}}
    finally{if(state.project?.id===projectId){button.disabled=false;button.dataset.busy='0';window.ModelActivity?.set(button,{state:"",preserve:true});button.textContent=ModelPresentation.pendingImageRecovery(state.project,'/api/visual/cover/generate')?'继续领取原海报':state.project?.coverFile?'重新生成海报':'一键生成海报';}}
  }
  function positionEmbeddedPreview() { const modal = $("visualPreviewModal"); if (!document.body.classList.contains("workflow-embedded") || window.parent === window) { modal.classList.remove("embedded-position"); modal.style.removeProperty("top"); modal.style.removeProperty("height"); return; } try { const frame = window.parent.document.getElementById("workflowFrame"); const frameTop = frame?.getBoundingClientRect().top || 0; modal.classList.add("embedded-position"); modal.style.top = `${Math.max(0, -frameTop)}px`; modal.style.height = `${window.parent.innerHeight}px`; } catch (_) {} }
  function setPreviewExpanded(expanded) { state.previewExpanded = Boolean(expanded); $("visualPreviewModal").classList.toggle("large", state.previewExpanded); $("visualPreviewFullscreen").textContent = state.previewExpanded ? "适应窗口" : "大图模式"; }
  function openPreview(trigger) { const file = trigger.dataset.file; if (!file) return; const type = trigger.dataset.previewType || "image"; const title = trigger.dataset.title || "素材预览"; const name = trigger.dataset.name || (type === "video" ? "视频.mp4" : "图片.jpg"); state.previewOrigin = { trigger, localY:window.scrollY, parentY:window.parent !== window ? window.parent.scrollY : null }; $("visualPreviewTitle").textContent = title; $("visualPreviewDownload").href = downloadMedia(file, name); let voice260=$('visualPreviewVoice260');if(!voice260){voice260=document.createElement('a');voice260.id='visualPreviewVoice260';voice260.className='secondary-btn';voice260.target='_blank';voice260.rel='noopener';voice260.textContent='使用角色音色配音 · 单独报价';$('visualPreviewDownload').after(voice260);}voice260.hidden=type!=='video';if(type==='video')voice260.href='/static/video_voice.html?'+new URLSearchParams({scope:'visual',projectId:state.project.id,file}); $("visualPreviewContent").innerHTML = type === "video" ? `<video controls autoplay preload="metadata" src="${media(file)}"></video>` : `<img src="${media(file)}" alt="${esc(title)}">`; positionEmbeddedPreview(); setPreviewExpanded(false); $("visualPreviewModal").classList.remove("hidden"); document.body.classList.add("visual-preview-open"); }
  function closePreview() { const video = $("visualPreviewContent").querySelector("video"); if (video) video.pause(); const origin = state.previewOrigin; $("visualPreviewContent").innerHTML = ""; $("visualPreviewModal").classList.add("hidden"); document.body.classList.remove("visual-preview-open"); setPreviewExpanded(false); if (origin) requestAnimationFrame(() => { try { window.scrollTo({ top:origin.localY, behavior:"auto" }); if (origin.parentY != null && window.parent !== window) window.parent.scrollTo({ top:origin.parentY, behavior:"auto" }); origin.trigger?.focus?.({ preventScroll:true }); } catch (_) {} }); state.previewOrigin = null; }
  async function startArchive(kind, ids) { const query = new URLSearchParams({ projectId: state.project.id, kind, ids: ids.join(",") }); const name = `${state.project.projectName || '视觉素材'}-${kind}.zip`.replace(/[\\/:*?"<>|]/g, "_"); await saveDownload(`/api/visual/archive?${query.toString()}`, name); }
  function downloadAssets(kind, all) { const items = (state.project.assets[kind] || []).filter(item => item.imageFile); const selected = all ? items : items.filter(item => document.querySelector(`.visual-card[data-kind="${kind}"][data-id="${CSS.escape(item.id)}"] .asset-select`)?.checked); if (!selected.length) return toast(all ? "还没有可下载的生成图片。" : "请勾选已经生成图片的内容。", true); startArchive(kind, selected.map(item => item.id)).then(() => toast(`已准备下载${selected.length}张JPG图片。`)).catch(error => toast(`图片打包失败：${error.message || error}`, true)); toast(`正在打包下载${selected.length}张JPG图片…`); }
  function downloadVideos(all) { const items = (state.project.episodes || []).filter(item => item.videoFile); const selected = all ? items : items.filter(item => document.querySelector(`.visual-episode-card[data-episode="${CSS.escape(item.id)}"] .episode-select`)?.checked); if (!selected.length) return toast(all ? "还没有可下载的生成视频。" : "请勾选已经生成视频的分集。", true); startArchive("videos", selected.map(item => item.id)).then(() => toast(`已准备下载${selected.length}个视频。`)).catch(error => toast(`视频打包失败：${error.message || error}`, true)); toast(`正在打包下载${selected.length}个视频…`); }
  const wizardFields = { ImageRouteType:"imageRouteType", VideoRouteType:"videoRouteType", Style:"style", RoleLayout:"roleLayout", SceneLayout:"sceneLayout", ImageTier:"imageTier", ImageResolution:"imageResolution", VideoTier:"videoTier", Resolution:"resolution", Ratio:"ratio", VideoDuration:"videoDuration", EyeMaskMode:"eyeMaskMode" };
  function showDialog(id) {
    const node = $(id); node.classList.remove("hidden");
    if(document.body.classList.contains('workflow-embedded'))try{
      const frame=window.parent.document.getElementById('workflowFrame'),rect=frame?.getBoundingClientRect();
      if(rect&&Math.min(window.parent.innerHeight,rect.bottom)-Math.max(0,rect.top)<Math.min(320,rect.height,window.parent.innerHeight))
        frame.scrollIntoView({block:'start',behavior:'instant'});
    }catch(_){}
    positionDialog(node);
  }
  function positionDialog(node) {
    if (document.body.classList.contains("workflow-embedded")) {
      try {
        const frame=window.parent.document.getElementById('workflowFrame'),rect=frame?.getBoundingClientRect();
        if(!rect)return;
        // A short project list can make the iframe smaller than its host
        // viewport. Absolute overlays are clipped at both iframe edges.
        const header=window.parent.document.querySelector('.topbar'),headerRect=header?.getBoundingClientRect();
        const headerPosition=header&&window.parent.getComputedStyle(header).position;
        const headerBottom=headerRect&&['fixed','sticky'].includes(headerPosition)&&headerRect.top<=0?Math.max(0,headerRect.bottom):0;
        const visibleTop=Math.max(headerBottom,rect.top),visibleBottom=Math.min(window.parent.innerHeight,rect.bottom);
        const available=Math.max(0,visibleBottom-visibleTop);
        node.style.top=`${Math.max(0,visibleTop-rect.top)+window.scrollY}px`;node.style.height=`${available}px`;node.style.setProperty('--dialog-visible-height',`${available}px`);node.classList.add('embedded-dialog');
      }catch(_){}
    }
  }
  function closeDialog(id) { $(id).classList.add("hidden");if(id==='visualProjectWizard')wizardEpoch++; }
  const positionOpenDialogs=()=>document.querySelectorAll('.visual-dialog:not(.hidden)').forEach(positionDialog);
  window.addEventListener('resize',positionOpenDialogs);
  window.addEventListener('scroll',positionOpenDialogs,{passive:true});
  if(window.parent!==window)try{window.parent.addEventListener('resize',positionOpenDialogs);window.parent.addEventListener('scroll',positionOpenDialogs,{passive:true});}catch(_){}
  window.VisualDialogLayout={show:showDialog,close:closeDialog,position:positionDialog};

  let newProjectWizardOpening = false, wizardCreateRequestId = '';
  async function newProjectWizard() {
    if(newProjectWizardOpening)return;
    if(!$('visualProjectWizard').classList.contains('hidden'))return;
    if(!state.project&&!state.pendingSourceAction&&$('visualSource').value.trim())state.pendingSourceAction='handoff';
    newProjectWizardOpening=true;
    try {
      // Opening this local form does not switch projects or change any saved
      // source. Preserve the old draft without waiting for its autosave: a
      // stalled/failed save or an empty editor must not swallow this click.
      persistSourceDraft();
      if (!await studioConfirm("确定创建新项目吗？当前项目会保留，可以随时继续制作。")) { state.pendingSourceAction = null; return; }
      state.editingProjectId = null;
      wizardCreateRequestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), value=>value.toString(16).padStart(2,'0')).join('');
      wizardEpoch++;$('confirmProjectWizard').disabled=false;
      $("visualProjectWizardTitle").textContent = "创建新项目"; $("confirmProjectWizard").textContent = "确认创建（不扣积分）";
      const stamp = new Date().toLocaleString("sv-SE").replace(/[-: ]/g, "").slice(0, 12);
      $("wizardProjectName").value = state.currentSource?.projectName || `新短剧项目-${stamp}`; $("wizardProjectDescription").value = "";
      // New projects start from their own defaults rather than the last project's state.
      const defaults = { style:"live_action", roleLayout:"feature_three", sceneLayout:"concept", imageRouteType:"official", imageTier:"economy", imageResolution:"2K", videoRouteType:"official", videoTier:"economy", resolution:"480p", ratio:"9:16", videoDuration:15, eyeMaskMode:"white" };
      Object.entries(wizardFields).forEach(([suffix, key]) => $("wizard" + suffix).value = defaults[key]);
      $("wizardImageTier").value = ""; $("wizardVideoTier").value = "";
      $('wizardVideoDuration').dataset.configuredDuration = String(defaults.videoDuration);
      $("wizardEyeMask").checked = false;
      state.editingProjectCreationMode = null;
      refreshWizardModels(); syncStyleButtons(); showDialog("visualProjectWizard"); $("wizardProjectName").focus(); $("wizardProjectName").select();
    } finally { newProjectWizardOpening=false; }
  }
  async function editProject(id) {
    if(!await confirmDiscardSource('编辑项目设置'))return;
    const context=sourceEditorContext(),epoch=++sourceReadEpoch;
    try {
      await settingsSaveQueue.catch(()=>{});
      const response = await fetch(`/api/visual/project?id=${encodeURIComponent(id)}`, {cache:"no-store"}); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法读取项目设置");
      const project = data.project, value = project.settings || {};
      if(sourceReadEpoch!==epoch || context.sourceText!==String($('visualSource').value||''))return;
      activateProject(project,{stage:1});
      state.editingProjectId = id; state.pendingSourceAction = null;
      wizardEpoch++;$('confirmProjectWizard').disabled=false;
      $("visualProjectWizardTitle").textContent = "编辑项目设置"; $("confirmProjectWizard").textContent = "保存修改";
      $("wizardProjectName").value = project.projectName || ""; $("wizardProjectDescription").value = project.projectDescription || "";
      refreshWizardModels(value, true);
      Object.entries(wizardFields).forEach(([suffix,key]) => { if (['ImageTier','VideoTier','ImageRouteType','VideoRouteType'].includes(suffix)) return; const fallback = key === "style" ? project.style : undefined; if (value[key] != null || fallback != null) $("wizard"+suffix).value = String(value[key] ?? fallback); });
      ["image","video"].forEach(media => { const select=$("wizard"+(media==="image"?"Image":"Video")+"Tier"); if(value[`${media}Model`] && [...select.options].some(option=>option.value===value[`${media}Model`])) select.value=value[`${media}Model`]; });
      syncImageResolutionOptions($("wizardImageResolution"), $("wizardImageTier").value, value.imageResolution || $("wizardImageResolution").value);
      syncResolutionOptions($("wizardResolution"), $("wizardVideoTier").value, value.resolution);
      syncDurationControl($('wizardVideoDuration'),$('wizardVideoTier').value,Number(value.videoDuration || 15));
      syncVideoRatioOptions($('wizardRatio'),$('wizardVideoTier').value);
      $("wizardEyeMask").checked = Boolean(value.eyeMask);
      state.editingProjectCreationMode = value.creationMode || 'asset_first';
      refreshWizardPricing(); syncStyleButtons(); showDialog("visualProjectWizard"); $("wizardProjectName").focus();
    } catch(error) { toast(error.message,true); }
  }
  function refreshWizardModels(settings = {}, preferConfigured = false) {
    ["image", "video"].forEach(media => populateModelSelect("wizard" + (media === "image" ? "Image" : "Video") + "Tier", media, settings, preferConfigured));
    syncImageResolutionOptions($("wizardImageResolution"), $("wizardImageTier").value, $("wizardImageResolution").value);
    syncResolutionOptions($("wizardResolution"), $("wizardVideoTier").value, $("wizardResolution").value);
    syncDurationControl($('wizardVideoDuration'),$('wizardVideoTier').value);
    syncVideoRatioOptions($('wizardRatio'),$('wizardVideoTier').value);
    refreshWizardPricing();
  }
  function refreshWizardPricing() {
    if (!$('wizardImageQuote')) return;
    const unitText = value => Number(value.toPrecision(12)).toString();
    const chosen = {};
    const seconds172 = configuredVideoDuration($('wizardVideoDuration')), ratio172 = $('wizardRatio').value;
    for (const media of ['image','video']) {
      const select = $(media === 'image' ? 'wizardImageTier' : 'wizardVideoTier');
      const resolution = $(media === 'image' ? 'wizardImageResolution' : 'wizardResolution').value;
      for (const option of select.options) {
        if (!option.value) continue;
        const label = option.dataset.label || option.textContent;
        if(option.disabled){option.textContent=label;continue;}
        if(ModelPresentation.isLiveQuote(state.profile,media,option.value)){option.textContent=label+' · 实时核价';option.title=option.textContent;continue;}
        const range172=media==='video'?ModelPresentation.videoPriceRange172(state.profile,option.value,resolution):null;
        if(range172){option.textContent=label+' · '+range172.text;option.title=option.textContent;continue;}
        let price = ModelPresentation.publishedUnitPrice(state.profile,media,option.value,resolution,seconds172,ratio172);
        // Other models may support a different resolution; label that actual
        // published combination explicitly instead of guessing a price.
        if (!price && option.value !== select.value) {
          const rows = media === 'image' ? (state.profile.imagePricing ?? state.profile.visualImagePricing) :
            (state.profile.videoPricing ?? state.profile.visualVideoPricing);
          for (const row of Array.isArray(rows) ? rows : []) {
            price = ModelPresentation.publishedUnitPrice(state.profile,media,option.value,row?.resolution,seconds172,ratio172);
            if (price) break;
          }
        }
        const unit = media === 'image' ? '张' : price?.billingMode === 'flat' ? '次' : '秒';
        option.textContent = label + (price ? ` · ${price.resolution} · ${unitText(price.rate)}积分/${unit}` : ' · 当前清晰度未报价');
        option.title = option.textContent;
      }
      const price = select.selectedOptions[0]?.disabled ? null : ModelPresentation.publishedUnitPrice(state.profile,media,select.value,resolution,seconds172,ratio172);
      const seconds = configuredVideoDuration($('wizardVideoDuration'));
      const issue = media === 'video' ? videoCapabilityIssue(select.value,seconds,resolution,$('wizardRatio').value) : '';
      const value = $(media === 'image' ? 'wizardImageCost' : 'wizardVideoCost');
      const note = $(media === 'image' ? 'wizardImagePriceNote' : 'wizardVideoPriceNote');
      const caption = $(media === 'image' ? 'wizardImageCostLabel' : 'wizardVideoCostLabel');
      const live=ModelPresentation.isLiveQuote(state.profile,media,select.value);
      caption.textContent = media === 'image' ? '单张图片预计' : `单段视频预计（${seconds}秒）`;
      const points = !live && price && !issue ? ModelPresentation.publishedPriceEstimate(price,media === 'video' ? seconds : 1) : null;
      chosen[media] = points;
      value.textContent = live?'实时核价':points == null ? '待确认' : pointText(points);
      $(media === 'image' ? 'wizardImageQuote' : 'wizardVideoQuote').classList.toggle('unpriced',points == null);
      if (issue) note.textContent = issue;
      else if (!price) note.textContent = '后台未发布当前模型与清晰度的有效价格；生成前需确认。';
      else if (media === 'image') note.textContent = `${price.resolution} · ${unitText(price.rate)}积分/张`;
      else if(price.billingMode==='sku')note.textContent=`${price.resolution} · ${seconds}秒 · ${ratio172} · 每条${unitText(price.rate)}积分，周期内固定。`;
      else note.textContent = price.billingMode === 'flat' ?
        `${price.resolution} · ${unitText(price.rate)}积分/次，不按秒累乘。` :
        `${price.resolution} · ${unitText(price.rate)}积分/秒 × ${seconds}秒`;
      const warning = $('wizardVideoActivityWarning');
      if (media === 'video') {
        warning.textContent = ModelPresentation.activityWarning(state.profile,select.value,resolution);
        warning.hidden = !warning.textContent;
      }
    }
    const rawBalance = state.pointsUsage?.remainingPoints ?? state.pointsUsage?.points;
    const balance = rawBalance == null ? null : Number(rawBalance);
    const known = balance != null && Number.isFinite(balance);
    $('wizardPointsBalance').textContent = known ? `当前可用：${pointText(balance)}积分` : '当前可用积分：尚未读取';
    const insufficient = known && Object.values(chosen).some(value => value != null && value > balance);
    $('wizardPointsWarning').textContent = insufficient ? '余额不足以生成当前所选的单张图片或单段视频；仍可免费创建项目，生成前再充值或调整配置。' : '';
    $('wizardPointsWarning').hidden = !insufficient;
  }
  async function confirmProjectWizard() {
    if($('confirmProjectWizard').disabled)return;
    const name = $("wizardProjectName").value.trim(); if (!name) return toast("请填写项目名称。", true);
    const settings = { creationMode: state.editingProjectId ? state.editingProjectCreationMode || 'asset_first' : 'asset_first', continuity: false, eyeMask: $("wizardEyeMask").checked };
    Object.entries(wizardFields).forEach(([suffix, key]) => settings[key] = suffix === "VideoDuration" ? configuredVideoDuration($("wizard" + suffix)) : $("wizard" + suffix).value);
    settings.styleSpec = state.styles.find(item => item.id === settings.style);
    ["image", "video"].forEach(media => {
      const select = $("wizard" + (media === "image" ? "Image" : "Video") + "Tier");
      settings[`${media}Tier`] = select.selectedOptions[0]?.dataset.tier || "economy";
      settings[`${media}Model`] = select.value;
    });
    const durationIssue = videoCapabilityIssue(settings.videoModel,settings.videoDuration,settings.resolution,settings.ratio);
    if (durationIssue) return toast(durationIssue,true);
    const button = $("confirmProjectWizard");
    const epoch=wizardEpoch,context=sourceEditorContext(),pending=state.pendingSourceAction,editing=state.editingProjectId;
    const buttonLabel=button.textContent;
    try {
      button.disabled = true;
      button.textContent = editing ? '正在保存…' : '正在创建…';
      const draft=state.pendingSourceAction || (editing && state.sourceProjectId===editing) ? {sourceText:$('visualSource').value,source:state.currentSource} : null;
      const data = editing
        ? await post("/api/visual/settings", { projectId:editing, projectName:name, projectDescription:$("wizardProjectDescription").value.trim(), settings })
        : await post("/api/visual/project/create", { createRequestId:wizardCreateRequestId, projectName:name, projectDescription:$("wizardProjectDescription").value.trim(), style:settings.style, settings,
            outputModule227:state.pendingSourceAction&&['ecommerce','store','advertising'].includes(state.currentSource?.sourceType)?state.currentSource.sourceType:'workflow' });
      if(epoch!==wizardEpoch || !sameSourceEditor(context)) {await loadProjects();return;}
      state.pendingSourceAction = null;
      state.editingProjectId = null;
      state.editingProjectCreationMode = null;
      closeDialog("visualProjectWizard");
      try { activateProject(data.project,{stage:1,draft}); }
      catch (error) {
        setProjectCenter(true);
        toast('项目已保存。打开工作流时出错，请在项目中心点「继续制作」。'+error.message,true);
        return;
      }
      const savedName=data.project.projectName;
      $("visualSourceHint").textContent = editing ? `项目《${savedName}》的完整设置已保存。` : `项目《${savedName}》已创建。请先识别当前剧本资产，再编排完整分镜与视频卡。`;
      if (!editing) { setProjectCenter(false); $("visualSourceSection").scrollIntoView({behavior:"smooth", block:"start"}); $("visualSource").focus(); }
      void loadProjects();
      toast(editing ? "项目名称、风格、模型和生成设置已全部更新。" : (data.message || "项目已创建。"));
      if (pending === "recognize") await recognizeWorkflowAssets(); else if (pending === "cut") await openMacroArrangement(); else if (pending === "storyboard") await createPlan();
    } catch(error) {
      if(epoch===wizardEpoch)toast(!editing&&error.requestUncertain?'暂未收到创建结果。可在此再次确认，同一请求只保存一个项目。':error.message,true);
    } finally {
      if(epoch===wizardEpoch||$('visualProjectWizard').classList.contains('hidden')){button.disabled=false;button.textContent=buttonLabel;}
    }
  }
  let settingsSaveQueue = Promise.resolve();const pendingSettings231=new Map();
  async function saveCurrentProjectSettings(showToast = true) {
    if (!state.project) return;
    const projectId = state.project.id,revision=cutRevision(state.project);
    const settings = { ...projectSettings(), continuity: false };
    const key=showToast?null:JSON.stringify([projectId,revision,settings]);
    if(key&&pendingSettings231.has(key))return pendingSettings231.get(key);
    const saving = settingsSaveQueue.catch(() => {}).then(async () => {
      const data = await post("/api/visual/settings", {projectId, settings, applyToAllAssets:showToast});
      if (canApplyCutResponse(projectId,revision,data.project)) {
        state.project = data.project; syncStyleButtons(); syncAssetStyleBadges(); refreshReferenceLimits(); document.querySelectorAll(".visual-episode-storyboard .visual-project-style").forEach(node => { node.outerHTML = projectStyleMarkup(data.project); }); updateEstimate();
        // The inline cards have an independent catalog. Saving a new project
        // model must refresh its defaults without reloading the full script.
        const mediaRefresh232=macroInlineView?.refreshMediaDefaults232?.(data.project);
        mediaRefresh232?.catch(error=>{if(state.project?.id===projectId)toast('项目设置已保存，视频模型选项暂未刷新：'+error.message,true);});
      }
      if (showToast && state.project?.id === projectId) {
        document.querySelectorAll(".visual-card").forEach(node => {
          const select = node.querySelector(".asset-image-model");
          if (select) select.innerHTML = imageModelOptions(settings.imageModel);
          const route=node.querySelector(".asset-image-route");if(route)route.value=modelRoute234("image",settings.imageModel,settings.imageRouteType);
          const quote = node.querySelector(".asset-image-quote");
          if (quote) quote.textContent = imageModelQuoteText(settings.imageModel);
          const eye = node.querySelector(".asset-eye-mask input");
          if (eye) eye.checked = Boolean(settings.eyeMask);
        });
        toast("已应用到所有人物、场景、物品卡片；已有成品保留，后续生成使用新设置。");
      }
    });
    settingsSaveQueue = saving;
    if(key){pendingSettings231.set(key,saving);const clear=()=>{if(pendingSettings231.get(key)===saving)pendingSettings231.delete(key);};saving.then(clear,clear);}
    return saving;
  }
  const assetEditorOpen = new Set();
  function syncAssetStyleBadges() {
    if (!state.project) return;
    document.querySelectorAll('.visual-card').forEach(node => {
      const item = state.project.assets[node.dataset.kind]?.find(value => value.id === node.dataset.id);
      let badge = node.querySelector('.visual-image-style-state');
      if (!item?.imageFile || item.source === 'uploaded') { badge?.remove(); return; }
      if (!badge) { badge = document.createElement('small'); badge.className = 'visual-image-style-state'; node.querySelector('.visual-card-body > b')?.insertAdjacentElement('afterend', badge); }
      const recorded = item.imageStyleName || item.imageStyleSpec?.name || state.styles.find(style => style.id === item.imageStyle)?.name;
      badge.textContent = recorded ? `此图片生成风格：${recorded}${item.imageStyle !== state.project.style ? '（旧风格成品，重新生成后应用当前风格）' : ''}` : '此图片未记录生成风格；切换风格不改变已有图片。';
    });
  }
  function enhanceProjectUI() {
    document.querySelectorAll('.visual-section-actions .batch-assets').forEach(generate=>{
      const actions=generate.parentElement;
      if(actions.querySelector('.delete-selected-assets'))return;
      const button=document.createElement('button');
      button.type='button';button.className='danger-outline-btn delete-selected-assets';
      button.dataset.batchKind=generate.dataset.batchKind;button.textContent='删除选中';
      button.addEventListener('click',()=>deleteSelectedAssets(button));
      generate.insertAdjacentElement('afterend',button);
    });
    $("visualEpisodeCount").textContent = `已切割${state.project.scriptCuts?.length || state.project.episodes.length}段 · 已完成${currentEpisodes(state.project).length}张视频卡`;
    $("visualWorkflowSteps").querySelectorAll("button[data-workflow-stage]").forEach(button => {
      const number = Number(button.dataset.workflowStage);
      button.classList.toggle("completed", number === 1 ? Boolean(state.project.workflowAssetSourceHash) : number === 2 ? Boolean(hasMacroWorkspace() || state.project.scriptCuts?.length) : false);
    });
    for (const [id, kind, label] of [["visualPeople","people","人物"],["visualScenes","scenes","场景"],["visualProps","props","物品"]]) {
      if (!state.project.assets[kind]?.length) $(id).innerHTML = `<div class="visual-empty">暂无${label}，可点击“＋ 自定义${label}”补充漏识别的素材。</div>`;
    }
    document.querySelectorAll(".visual-card").forEach(node => {
      const summary = node.querySelector(".visual-card-body > span:last-of-type");
      const recognized = state.project.assets[node.dataset.kind]?.find(value => value.id === node.dataset.id) || {};
      if (recognized.assetStatus === "suspected" && !node.querySelector(".visual-asset-review-badge")) {
        const badge = document.createElement("span"); badge.className = "visual-origin-badge visual-asset-review-badge";
        badge.textContent = "待人工核对";
        node.querySelector(".visual-card-body > b")?.insertAdjacentElement("afterend", badge);
      }
      if (summary && !node.querySelector(".visual-asset-summary-label")) {
        const label = document.createElement("div"); label.className = "visual-asset-summary-label"; label.textContent = "识别资料 / 剧情用途";
        summary.insertAdjacentElement("beforebegin", label);
      }
      if (summary && !node.querySelector(".visual-asset-dossier")) {
        const item = state.project.assets[node.dataset.kind]?.find(value => value.id === node.dataset.id) || {};
        const details = document.createElement("details"); details.className = "visual-asset-dossier";
        const title = document.createElement("summary"); title.textContent = "展开完整识别档案与原文依据"; details.append(title);
        String(item.description || "").split("；").filter(Boolean).forEach(part => {
          const row = document.createElement("div"); row.className = "visual-asset-dossier-row";
          const split = part.indexOf("：");
          if (split > 0) { const label = document.createElement("b"); label.textContent = part.slice(0, split); row.append(label); }
          const value = document.createElement("span"); value.textContent = split > 0 ? part.slice(split + 1) : part; row.append(value);
          details.append(row);
        });
        const evidence = document.createElement("div"); evidence.className = "visual-asset-dossier-row";
        const evidenceLabel = document.createElement("b"); evidenceLabel.textContent = item.evidenceVerified ? "原文依据" : "依据待核对";
        const evidenceText = document.createElement("span"); evidenceText.textContent = item.evidence || "识别结果未附原文依据，请人工核对。";
        evidence.append(evidenceLabel, evidenceText); details.append(evidence);
        summary.insertAdjacentElement("afterend", details);
      }
      const prompt = node.querySelector(".visual-asset-prompt");
      if (node.dataset.kind === 'people' && !node.querySelector('.asset-appearance-control')) {
        const label = document.createElement('label'); label.className = 'asset-appearance-control field';
        const choices = {auto:'按原文自动判断',human:'人类',beast:'兽类／动物',monster:'非人怪物',humanoid:'人形异族／兽人',mecha:'机械生命／机甲',spirit:'灵体／意识形态'};
        const selected = recognized.generationSettings?.appearanceType || 'auto';
        label.innerHTML = `<span>物种与当前形态</span><select class="asset-appearance-type">${Object.entries(choices).map(([value, text]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${text}</option>`).join('')}</select><small>${recognized.resolvedAppearanceLabel ? `上次生成：${esc(recognized.resolvedAppearanceLabel)}。` : ''}不确定时可手动纠正；变身前后请分别建卡。选择本身不调用模型、不扣费。</small>`;
        prompt?.insertAdjacentElement('beforebegin', label);
      }
      if (node.dataset.kind === "people" && prompt && !node.querySelector(".asset-speech-profile")) {
        const profile = characterSpeech248(recognized);
        const summary = document.createElement("small");
        summary.className = "asset-speech-summary";
        summary.textContent = characterSpeechSummary248(profile);
        prompt.insertAdjacentElement("beforebegin", summary);
        const editor = document.createElement("fieldset");
        editor.className = "asset-speech-profile";
        editor.innerHTML = `<legend>角色声音设定</legend>
          ${speechControl249("language", "对白语言", "", 40)}
          ${speechControl249("accent", "口音／方言", "跟随语言默认", 40)}
          ${speechControl249("timbre", "声音音色", "按角色自然演绎", 80)}
          <small>同一人物的各个造型共用此设定。只影响后续生成时的对白表现，实际效果取决于视频模型。</small>`;
        const language = bindSpeechControl249(editor, "language", profile.language);
        const accent = bindSpeechControl249(editor, "accent", profile.accent);
        bindSpeechControl249(editor, "timbre", profile.timbre);
        language.addEventListener("change", () => {
          if (language.value.trim() && language.value.trim() !== "中文" && accent.value.trim() === "普通话") setSpeechValue249(accent, "");
          if (language.value.trim() === "中文" && !accent.value.trim()) setSpeechValue249(accent, "普通话");
        });
        prompt.insertAdjacentElement("beforebegin", editor);
      }
      if (prompt && !node.querySelector(".visual-asset-prompt-label")) {
        const label = document.createElement("div"); label.className = "visual-asset-prompt-label"; label.textContent = "参考图描述词（可修改）";
        prompt.insertAdjacentElement("beforebegin", label);
      }
      if (!node.querySelector(".delete-asset")) { const button = document.createElement("button"); button.className = "danger-outline-btn delete-asset"; button.textContent = "删除素材"; node.querySelector(".visual-result-actions").append(button); }
      if (!node.querySelector(".asset-local-model")) {
        const item = state.project.assets[node.dataset.kind]?.find(value => value.id === node.dataset.id) || {};
        const label = document.createElement("label"); label.className = "asset-local-model";
        const model = item.generationSettings?.imageModel || item.imageModel || selectedModel("image");
        label.innerHTML = `<span>本项图片线路</span><select class="asset-image-route">${routeOptions234("image",activeRoute234("image",modelRoute234("image",model,state.project.settings?.imageRouteType)))}</select><span>本项图片模型</span><select class="asset-image-model">${imageModelOptions(model)}</select><small class="asset-image-quote">${imageModelQuoteText(model)}</small>`;
        node.querySelector(".visual-asset-prompt")?.insertAdjacentElement("afterend", label);
      }
    });
    syncAssetStyleBadges();
    document.querySelectorAll(".visual-card").forEach(node => {
      if (node.querySelector('.asset-edit-toggle')) return;
      const item = state.project.assets[node.dataset.kind]?.find(value => value.id === node.dataset.id) || {};
      const body = node.querySelector('.visual-card-body');
      const actions = node.querySelector('.visual-card-actions');
      const key = `${node.dataset.kind}:${node.dataset.id}`;
      const editor = document.createElement('div');
      editor.className = 'asset-edit-panel';
      editor.id = `asset-editor-${node.dataset.kind}-${node.dataset.id}`;
      editor.hidden = !assetEditorOpen.has(key);
      const remove = node.querySelector('.delete-asset');
      const saveActions = node.querySelector('.save-asset-prompt')?.closest('.visual-result-actions');
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'ghost-btn asset-edit-toggle';
      toggle.setAttribute('aria-controls', editor.id);
      const syncEditor = () => {
        toggle.textContent = editor.hidden ? '编辑' : '收起';
        toggle.setAttribute('aria-expanded', String(!editor.hidden));
      };
      toggle.addEventListener('click', () => {
        editor.hidden = !editor.hidden;
        if (editor.hidden) assetEditorOpen.delete(key); else assetEditorOpen.add(key);
        syncEditor();
      });
      node.addEventListener('asset-details-closed',()=>{editor.hidden=true;assetEditorOpen.delete(key);syncEditor();});
      syncEditor();
      actions.append(toggle);
      if (!item?.imageFile && /[与和及、，,；;]|桌椅/.test(item?.name || '')) {
        const split = document.createElement('button'); split.type = 'button';
        split.className = 'ghost-btn'; split.textContent = '拆分'; split.title = '本地拆分合并卡，不调用模型、不扣费';
        split.addEventListener('click', async () => {
          if (!await studioConfirm(`将“${item.name}”拆成独立卡片？原卡会保留在项目记录中，不调用模型、不扣费。`)) return;
          split.disabled = true;
          try { const data = await post('/api/visual/asset/split', {projectId:state.project.id,kind:node.dataset.kind,assetId:node.dataset.id}); render(data.project); await loadProjects(); toast(data.message); }
          catch(error) { toast(error.message,true); split.disabled = false; }
        });
        actions.append(split);
      }
      if (remove) { remove.textContent = '删除'; remove.title = '删除此素材'; actions.append(remove); }
      for (const selector of ['.visual-asset-dossier','.visual-asset-prompt-label','.visual-asset-prompt','.asset-local-model','.asset-eye-mask','.asset-speech-profile']) {
        const field = node.querySelector(selector); if (field) editor.append(field);
      }
      if (saveActions) editor.append(saveActions);
      body.append(editor, actions);
      node.classList.add('asset-compact');
    });
    window.AssetCardDetails?.enhance(document,state.project.id);
    window.CompactAssets205?.enhance(state.project);
    document.querySelectorAll('.visual-episode-card').forEach(node => {
      if (node.querySelector('.episode-card-heading')) return;
      const heading = document.createElement('header'); heading.className = 'episode-card-heading';
      const title = document.createElement('b'); title.textContent = `第 ${node.dataset.cutNumber || ''} 集 · 视频卡`;
      const select = node.querySelector('.visual-select-item');
      heading.append(title); if (select) heading.append(select); node.prepend(heading);
      const sourceTitle = node.querySelector('.visual-episode-script h4');
      const storyboardTitle = node.querySelector('.visual-episode-storyboard h4');
      if (sourceTitle) {
        sourceTitle.textContent = '原内容';
        const mark = document.createElement('span');
        mark.className = 'source-locked-mark';
        mark.title = '切割原文为项目原始资料，此处只读；需要修改请回到项目剧本重新处理。';
        mark.setAttribute('aria-label', '原文已锁定');
        mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1"/></svg><span>原文锁定</span>';
        sourceTitle.append(mark);
      }
      if (storyboardTitle) storyboardTitle.textContent = '优化后的视频描述词';
      const output = node.querySelector('.visual-episode-output');
      if (!output || node.classList.contains('visual-episode-draft')) return;
      const settings = document.createElement('details'); settings.className = 'episode-generation-settings';
      const summary = document.createElement('summary'); summary.textContent = '本集生成设置 · 展开调整'; settings.append(summary);
      const local = output.querySelector('.episode-local-settings');
      if (local) local.before(settings);
      for (const selector of ['.episode-local-settings','.asset-local-model']) { const el=output.querySelector(selector); if(el)settings.append(el); }
      refreshEpisodeVideoCompatibility(node,state.project.episodes.find(item=>item.id===node.dataset.episode));
    });
    setupReferenceEditors();
    window.WorkflowCutEditor?.install({project:()=>state.project,post,render,toast,confirm:studioConfirm,
      busy:()=>Boolean(state.storyboardBusy),pendingVideo:pendingVideoEpisode,
      setBusy:setStoryboardBusy,
      quote:()=>$("visualTextModelQuote").textContent,
      regenerationQuote:storyboardRegenerationQuote,
      batchRecovery:number=>storyboardBatchRecovery(state.project,number),
      modelConfig:()=>({provider:'server_gateway',model:$("visualTextModel").value,operation:'rewrite',timeout:600}),
      waitTask,reload:reloadProject,refreshPoints,status:message=>{$("visualStageStatus").textContent=message;},
      hasDescriptionDraft:(projectId,number,revision)=>mentionDrafts.has(descriptionDraftKey(projectId,number,revision))});
    legacyCards231()?.enhance(state.project,{active:!hasMacroWorkspace(),scene:topSceneDirectory?.current()});
    const cover = $("visualCoverResult")?.querySelector(".visual-cover-details");
    if (cover && !cover.querySelector("#coverImageModel")) {
      const label = document.createElement("label"); label.className = "asset-local-model";
      label.innerHTML = `<span>封面图片线路</span><select class="asset-image-route">${routeOptions234("image",activeRoute234("image",modelRoute234("image",state.project.coverModel || selectedModel("image"),state.project.settings?.imageRouteType)))}</select><span>本剧封面图片模型</span><select id="coverImageModel">${imageModelOptions(state.project.coverModel || "")}</select><small class="asset-image-quote">${imageModelQuoteText(state.project.coverModel || selectedModel("image"))}</small>`;
      cover.prepend(label);
    }
    const coverPicker = cover?.querySelector(".visual-reference-picker");
    if (coverPicker && !coverPicker.querySelector(".cover-select-all")) {
      const button = document.createElement("button"); button.type = "button"; button.className = "ghost-btn cover-select-all"; button.textContent = "一键引用全部已生成图片";
      button.addEventListener("click", () => { coverPicker.querySelectorAll(".cover-reference").forEach(input => { input.checked = true; }); toast("已引用全部已生成的人物、场景和物品图片；提交时会按所选模型的参考图上限自动取用。"); });
      coverPicker.querySelector("b")?.insertAdjacentElement("afterend", button);
    }
    syncStyleButtons();
  }
  function openAssetDialog(kind) { if (!state.project) return toast("请先新建项目。",true); state.customAssetKind = kind; $("visualAssetDialogTitle").textContent = `自定义补充${{people:"人物",scenes:"场景",props:"物品"}[kind]}`; ["customAssetName","customAssetDescription","customAssetPrompt"].forEach(id => $(id).value = ""); showDialog("visualAssetDialog"); $("customAssetName").focus(); }
  async function addCustomAsset() {
    if (!$("customAssetName").value.trim()) return toast("请填写素材名称。", true);
    const projectId=state.project.id,revision=cutRevision(state.project);
    try { $("confirmAssetDialog").disabled = true; await saveCurrentProjectSettings(false);if(!sameCut(projectId,revision))return; const data = await post("/api/visual/asset/add", {projectId,kind:state.customAssetKind,name:$("customAssetName").value.trim(),description:$("customAssetDescription").value.trim(),prompt:$("customAssetPrompt").value.trim()}); if(canApplyCutResponse(projectId,revision,data.project)){render(data.project); closeDialog("visualAssetDialog"); await loadProjects(); toast(data.message);} }
    catch(error) { toast(error.message,true); } finally { $("confirmAssetDialog").disabled = false; }
  }
  async function deleteAsset(node) {
    const projectId=state.project.id,revision=cutRevision(state.project);
    if (state.activeAssetJobs.get(`${node.dataset.kind}:${node.dataset.id}`)?.active) return toast("这张素材仍有生成任务在执行，请等待任务停止后再删除。",true);
    const item = state.project.assets[node.dataset.kind].find(value => value.id === node.dataset.id);
    if (!await studioConfirm(`确定从当前项目删除“${item.name}”吗？本集与封面的勾选引用会同时移除。`, {danger:true})) return;
    try { if(!sameCut(projectId,revision))return;const data = await post("/api/visual/asset/delete", {projectId,kind:node.dataset.kind,assetId:node.dataset.id}); if(canApplyCutResponse(projectId,revision,data.project)){render(data.project); await loadProjects(); toast("已移除素材与关联引用。已有生成视频不受影响；图片文件仍保存在项目目录。");} } catch(error) { toast(error.message,true); }
  }
  async function deleteSelectedAssets(button) {
    if (!state.project?.id || button.disabled) return;
    const projectId=state.project.id,revision=cutRevision(state.project),kind=button.dataset.batchKind;
    const nodes=[...document.querySelectorAll(`.visual-card[data-kind="${kind}"]`)].filter(node=>node.querySelector('.asset-select')?.checked);
    if (!nodes.length) return toast('请先勾选要删除的资产。',true);
    if (nodes.some(node=>state.activeAssetJobs.get(`${kind}:${node.dataset.id}`)?.active)) return toast('所选资产中仍有生成任务，请取消勾选生成中的资产。',true);
    const assets=nodes.map(node=>({kind,assetId:node.dataset.id}));
    if (!await studioConfirm(`确定移除选中的 ${assets.length} 项资产？\n\n会移除当前引用，保留在删除记录中可恢复；图片文件和已有视频不会删除。`,{danger:true})) return;
    try {
      button.disabled=true;
      if(!sameCut(projectId,revision))return;
      const data=await post('/api/visual/assets/delete',{projectId,assets});
      if(canApplyCutResponse(projectId,revision,data.project)){render(data.project);await loadProjects();toast(`已移除 ${assets.length} 项资产，删除记录已保存，可随时恢复。`);}
    } catch(error){toast(error.message,true);} finally{button.disabled=false;}
  }
  async function restoreAsset(button) {
    if (!state.project?.id) return;
    const projectId=state.project.id,revision=cutRevision(state.project);
    try { button.disabled = true; const data = await post("/api/visual/asset/restore", {projectId, kind:button.dataset.kind, assetId:button.dataset.assetId}); if(canApplyCutResponse(projectId,revision,data.project)){render(data.project); toast(data.message || "素材已恢复。");} }
    catch (error) { toast(error.message, true); button.disabled = false; }
  }
  const styleSelects = ["sourceVisualStyle","visualStyle","wizardStyle"];
  function syncStyleOptions() {
    styleSelects.forEach(id => { const select = $(id); const selected = select.value; state.styles.forEach(item => { let option = [...select.options].find(value => value.value === item.id); if (!option) { option = document.createElement("option"); option.value = item.id; select.append(option); } option.textContent = item.name; }); if ([...select.options].some(value => value.value === selected)) select.value = selected; }); syncStyleButtons();
  }
  function stylePreview(item) {
    if (/^\/static\/(?:style-(?:era-montage|wuxia|industrial-scifi|ink-paper|clay-stopmotion|painterly-storybook|macro-commercial)\.jpg|style-thumbnails\/style_user_[a-f0-9]{16}\.jpg)$/.test(item?.previewAsset || '')) return `<span class="visual-style-preview"><img src="${esc(item.previewAsset)}" alt="${esc(item.name)}"><em>${esc(item.name)}</em></span>`;
    const name = esc(item?.name || "未命名风格");
    if (item?.previewImage?.startsWith("data:image/")) return `<span class="visual-style-preview"><img src="${esc(item.previewImage)}" alt="${name}"><em>${name}</em></span>`;
    if (item?.previewKind === 'typographic') return `<span class="visual-style-preview visual-style-name-preview" data-style-category="${visualStyleCategory(item)}"><strong>${name}</strong><small>名称示意 · 非效果图</small></span>`;
    const index = Math.max(0, Math.min(11, Number(item?.previewIndex || 0)));
    const local = index % 6;
    const sheet = index < 6 ? "/static/style-previews.png" : "/static/style-previews-2.png";
    return `<span class="visual-style-preview"><span class="visual-style-thumb" style="background-image:url('${sheet}');background-position:${local % 3 * 50}% ${local < 3 ? 12.5 : 87.5}%"></span><em>${name}</em></span>`;
  }
  function syncStyleButtons() {
    styleSelects.forEach(id => { const button = $(id + "Picker"); if (!button) return; const item = state.styles.find(value => value.id === $(id).value); button.innerHTML = `${stylePreview(item)}<span>${esc(item?.name || $(id).selectedOptions[0]?.textContent || "选择风格")}<small>点击选择画面风格</small></span><em>⌄</em>`; });
    const selected = state.styles.find(value => value.id === $("sourceVisualStyle").value);
    $("sourceVisualStyleDescription").textContent = selected?.prompt ? `当前风格描述词｜${selected.prompt}` : "请选择视频生成风格，查看当前风格描述词。";
  }
  function installStylePickers() {
    styleSelects.forEach(id => { const select = $(id); select.classList.add("style-native-select"); const button = document.createElement("button"); button.id = id + "Picker"; button.type = "button"; button.className = "visual-style-picker-button"; select.insertAdjacentElement("afterend", button); button.addEventListener("click", () => openStylePicker(id)); select.addEventListener("change",syncStyleButtons); }); syncStyleButtons();
    $('visualStyleSearch').addEventListener('input',renderStylePickerChoices);
    document.querySelectorAll('.visual-style-filter').forEach(button=>button.addEventListener('click',()=>{
      state.styleCategory=button.dataset.styleCategory;renderStylePickerChoices();
    }));
  }
  function visualStyleCategory(item) {
    if (['real','3d','2d'].includes(item?.category)) return item.category;
    const id = String(item?.id || '');
    if (/ink_paper|painterly_storybook/.test(id)) return '2d';
    if (/clay_stopmotion/.test(id)) return '3d';
    const index=Number(item?.previewIndex);
    return [4,8,9,10].includes(index) ? '3d' : [5,11].includes(index) ? '2d' : 'real';
  }
  function filteredVisualStyles(items, category, query) {
    const keyword=String(query||'').trim().toLocaleLowerCase();
    return items.filter(item=>(category==='custom' ? item.custom : category==='all' || visualStyleCategory(item)===category)
      && (!keyword || [item.name,...(Array.isArray(item.tags)?item.tags:[])].join(' ').toLocaleLowerCase().includes(keyword)));
  }
  function renderStylePickerChoices() {
    const target=state.styleTarget || 'sourceVisualStyle', category=state.styleCategory || 'all';
    const filtered=filteredVisualStyles(state.styles,category,$('visualStyleSearch').value);
    document.querySelectorAll('.visual-style-filter').forEach(button=>{
      const active=button.dataset.styleCategory===category;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
    });
    const labels={real:'真人', '3d':'3D', '2d':'2D'};
    const card = item => `<button type="button" class="visual-style-choice ${item.id === $(target).value ? "selected" : ""}" data-style-id="${esc(item.id)}" title="${esc(item.prompt || '')}">${stylePreview(item)}<b>${esc(item.name)}</b><small>${item.custom ? "自定义风格" : labels[visualStyleCategory(item)]+'预设'}${item.supplemental?' · 独立编写描述':''}</small></button>`;
    const presets = filtered.filter(item => !item.custom).map(card).join("");
    const customs = filtered.filter(item => item.custom).map(item => `<div class="visual-custom-style-card">${card(item)}<button type="button" class="delete-custom-style" data-style-id="${esc(item.id)}" aria-label="删除${esc(item.name)}">×</button></div>`).join("");
    $('visualStyleFilterCount').textContent=`显示${filtered.length}/${state.styles.length}种风格`;
    $("visualStyleChoices").innerHTML = `${presets?`<section class="visual-style-section"><h4>预设风格 <span>${filtered.filter(item=>!item.custom).length}种</span></h4><div class="visual-style-grid">${presets}</div></section>`:''}${!filtered.length?'<div class="visual-empty">没有匹配的风格，可更换分类或搜索词。</div>':''}<section class="visual-style-section custom"><h4>自定义风格 <span>已有内容保留，也可添加自己的描述和缩略图</span></h4><div class="visual-style-grid">${customs}<button type="button" class="visual-style-empty create-custom-style-inline"><i>＋</i><b>添加自定义风格</b><span>上传缩略图与填写描述词</span></button></div></section>`;
  }
  function openStylePicker(target) {
    state.styleTarget = target;
    state.styleCategory='all'; $('visualStyleSearch').value=''; renderStylePickerChoices();
    showDialog("visualStylePickerDialog");
  }
  function openCustomStyle(target) { state.styleTarget = target || state.styleTarget || "sourceVisualStyle"; $("customStyleName").value = ""; $("customStylePrompt").value = ""; $("customStyleNegative").value = ""; $("customStyleImage").value = ""; state.customStyleImage = ""; showDialog("visualStyleDialog"); $("customStyleName").focus(); }
  async function chooseStyle(id) {
    const target = state.styleTarget || "sourceVisualStyle"; $(target).value = id;
    if (target !== "wizardStyle") { $("sourceVisualStyle").value = id; $("visualStyle").value = id; }
    syncStyleButtons(); closeDialog("visualStylePickerDialog");
    if (target !== "wizardStyle" && state.project) { await saveCurrentProjectSettings(false); toast("已保存本项目风格，后续所有生成会按此风格提交。已有图片和视频需重新生成才会改变风格。"); }
  }
  async function createCustomStyle() {
    if (!$("customStyleName").value.trim() || !$("customStylePrompt").value.trim()) return toast("请填写风格名称和详细描述词。",true);
    try { $("confirmStyleDialog").disabled = true; const data = await post("/api/visual/style/create", {name:$("customStyleName").value.trim(),prompt:$("customStylePrompt").value.trim(),negative:$("customStyleNegative").value.trim(),previewImage:state.customStyleImage || "",previewIndex:Number($("customStylePreviewBase").value)}); state.styles = data.styles; syncStyleOptions(); closeDialog("visualStyleDialog"); await chooseStyle(data.style.id); toast("自定义风格已保存，可用于当前与后续项目。"); } catch(error) { toast(error.message,true); } finally { $("confirmStyleDialog").disabled = false; }
  }
  async function deleteCustomStyle(id) {
    const item = state.styles.find(style => style.id === id && style.custom);
    if (!item || !await studioConfirm(`删除自定义风格《${item.name}》？已有项目保存的风格描述和成品不受影响。`)) return;
    const data = await post("/api/visual/style/delete", {styleId:id});
    const selected = Object.fromEntries(styleSelects.map(target => [target,$(target).value]));
    state.styles = data.styles;
    styleSelects.forEach(target => { const stale = [...$(target).options].find(option => option.value === id); if (stale && selected[target] !== id) stale.remove(); });
    syncStyleOptions();
    styleSelects.forEach(target => { if (selected[target] !== id) $(target).value = selected[target]; });
    syncStyleButtons();
    openStylePicker(state.styleTarget || "sourceVisualStyle");
    toast("自定义风格已从风格库删除。已有项目的风格快照仍保留。");
  }
  async function loadStyles() { try { const response = await fetch("/api/visual/styles", {cache:"no-store"}); const data = await response.json(); if (data.styles?.length) state.styles = data.styles; syncStyleOptions(); } catch(error) { toast(`风格库读取失败：${error.message}`,true); } }
  $("newCustomStyleFromWizard")?.remove();
  const unusedRatio=$('visualRatio')?.closest('label');
  if(unusedRatio){const note=document.createElement('small');note.className='visual-image-ratio-note';note.textContent='参考图比例跟随人物 / 场景版式；物品为方形。';unusedRatio.replaceWith(note);}
  $("confirmProjectWizard").addEventListener("click",confirmProjectWizard);
  $("regenerateSelectedStoryboard").addEventListener("click", () => executeRegenerateStoryboard());
  for(const prefix of ['visual','wizard'])for(const media of ['image','video']){
    const kind=media==='image'?'Image':'Video',route=$(`${prefix}${kind}RouteType`),model=$(`${prefix}${kind}Tier`);
    route?.addEventListener('change',()=>{
      populateModelSelect(model.id,media,{},false,route.value);
      model.dispatchEvent(new Event('change',{bubbles:true}));
    });
  }
  $("wizardImageTier").addEventListener("change", () => { $("wizardImageRouteType").value=modelRoute234("image",$("wizardImageTier").value,$("wizardImageRouteType").value); syncImageResolutionOptions($("wizardImageResolution"), $("wizardImageTier").value, $("wizardImageResolution").value); refreshWizardPricing(); });
  $("wizardVideoTier").addEventListener("change", () => { $("wizardVideoRouteType").value=modelRoute234("video",$("wizardVideoTier").value,$("wizardVideoRouteType").value); syncResolutionOptions($("wizardResolution"), $("wizardVideoTier").value); syncDurationControl($('wizardVideoDuration'),$('wizardVideoTier').value); syncVideoRatioOptions($('wizardRatio'),$('wizardVideoTier').value); refreshWizardPricing(); });
  ['wizardImageResolution','wizardResolution','wizardVideoDuration','wizardRatio'].forEach(id => $(id).addEventListener('change',refreshWizardPricing));
  document.addEventListener('change', event => {
    if (event.target.matches('.episode-video-duration,#visualVideoDuration,#wizardVideoDuration')) event.target.dataset.configuredDuration = event.target.value;
    if (event.target.matches('.episode-select')) { updateStoryboardButton(); CreditGate.recalculate(); }
  },true);
  ["closeProjectWizard","cancelProjectWizard"].forEach(id => $(id).addEventListener("click", () => { state.pendingSourceAction = null; state.editingProjectId = null; closeDialog("visualProjectWizard"); }));
  ["closeAssetDialog","cancelAssetDialog"].forEach(id => $(id).addEventListener("click", () => closeDialog("visualAssetDialog")));
  ["closeStyleDialog","cancelStyleDialog"].forEach(id => $(id).addEventListener("click", () => closeDialog("visualStyleDialog")));
  $("closeStylePicker").addEventListener("click", () => closeDialog("visualStylePickerDialog"));
  $("confirmAssetDialog").addEventListener("click",addCustomAsset); $("confirmStyleDialog").addEventListener("click",createCustomStyle);
  $("saveProjectSettings").addEventListener("click", () => saveCurrentProjectSettings().catch(error => toast(error.message,true)));
  $("newCustomStyle").addEventListener("click", () => openCustomStyle("sourceVisualStyle")); $("newCustomStyleFromProject").addEventListener("click", () => openCustomStyle("visualStyle")); $("newCustomStyleFromPicker").addEventListener("click", () => openCustomStyle());
  $("customStyleImage").addEventListener("change", event => { const file = event.target.files[0]; if (!file) return; if (file.size > 2*1024*1024) return toast("风格预览图请小于2MB。",true); const reader = new FileReader(); reader.onload = () => state.customStyleImage = reader.result; reader.readAsDataURL(file); });
  document.addEventListener("click", event => { const deleteStyle = event.target.closest(".delete-custom-style"); if (deleteStyle) { event.preventDefault(); deleteCustomStyle(deleteStyle.dataset.styleId).catch(error => toast(error.message,true)); return; } const add = event.target.closest(".add-custom-asset"); if (add) openAssetDialog(add.dataset.kind); const remove = event.target.closest(".delete-asset"); if (remove) deleteAsset(remove.closest(".visual-card")); const restore = event.target.closest(".restore-asset"); if (restore) restoreAsset(restore); const style = event.target.closest(".visual-style-choice"); if (style) chooseStyle(style.dataset.styleId).catch(error => toast(error.message,true)); if (event.target.closest(".create-custom-style-inline")) openCustomStyle(); });
  ["visualStyle","visualRoleLayout","visualSceneLayout","visualImageTier","visualImageResolution","visualVideoTier","visualVideoDuration","visualResolution","visualVideoRatio","visualEyeMask"].forEach(id => $(id).addEventListener("change", () => { if (id === "visualStyle") $("sourceVisualStyle").value = $(id).value; if (id === "visualRoleLayout") $("sourceRoleLayout").value = $(id).value; if (id === "visualSceneLayout") $("sourceSceneLayout").value = $(id).value; if (["visualImageTier","visualVideoTier"].includes(id)) $(id.replace("Tier","RouteType")).value=modelRoute234(id==="visualImageTier"?"image":"video",$(id).value,$(id.replace("Tier","RouteType")).value); if (id === "visualImageTier") syncImageResolutionOptions($("visualImageResolution"), selectedModel("image"), $("visualImageResolution").value); if (id === "visualVideoTier") syncVideoCapabilities(); if (state.project) saveCurrentProjectSettings(false).catch(error => toast(error.message,true)); }));
  $("visualWorkflowSteps").addEventListener("click", event => { const button = event.target.closest("button[data-workflow-stage]"); if (button) setWorkflowStage(button.dataset.workflowStage, {scroll:true}); });
  $("useSource").addEventListener("click", event=>workflowAction(event.currentTarget,openMacroArrangement)); $('openMacroArrangement')?.addEventListener('click',event=>workflowAction(event.currentTarget,openMacroArrangement)); $("fillStoryboard").addEventListener("click", event => workflowAction(event.currentTarget, executeFillStoryboard)); $("confirmCutModeDialog").addEventListener("click", startMacroFromSettings); document.querySelectorAll('input[name="cutMode"], input[name="cutTargetPreset"], input[name="storyboardScope"]').forEach(node => node.addEventListener("change", syncCutModeDialog)); ["cutFixedSeconds","cutTargetMinutes","cutTargetSeconds"].forEach(id => $(id).addEventListener("input", syncCutModeDialog)); ["closeCutModeDialog","cancelCutModeDialog"].forEach(id => $(id).addEventListener("click", () => {state.timelineModelApproval=null;closeDialog("visualCutModeDialog");})); $("confirmSourceReference").addEventListener("click", event => workflowAction(event.currentTarget, recognizeWorkflowAssets)); $("visualRecognitionModel").addEventListener("change", event => { localStorage.setItem("drama-recognition-model", event.target.value); updateRecognitionQuote(); }); $("visualVideoDuration").addEventListener("change", updateEstimate); $("visualImageResolution").addEventListener("change", updateEstimate); $("visualResolution").addEventListener("change", updateEstimate);
  $("newVisualProject").addEventListener("click", () => { state.pendingSourceAction = null; newProjectWizard().catch(error=>toast(error.message,true)); });
  $("closeVisualCoverEditor").addEventListener("click", () => { $("visualProjectCoverEditor").classList.add("hidden"); $("visualProjectList").scrollIntoView({behavior:"smooth",block:"start"}); });
  $("visualProjectList").addEventListener("click", event => { const card = event.target.closest("[data-project-id]"); if (!card) return; const button = event.target.closest("button"); if (!button) return; event.preventDefault(); event.stopPropagation(); if (button.classList.contains("open-visual-project")) return openProject(card.dataset.projectId); if (button.classList.contains("project-cover-action")) return openCoverEditor(card.dataset.projectId); if (button.classList.contains("edit-visual-project")) return editProject(card.dataset.projectId); if (button.classList.contains("delete-visual-project")) return deleteProject(card.dataset.projectId); });
  const apiDefaults = { volcengine: "https://ark.cn-beijing.volces.com/api/v3", aliyun: "https://dashscope.aliyuncs.com/api/v1", custom: "" };
  [$("visualImageProvider"), $("visualVideoProvider")].filter(Boolean).forEach(select => select.addEventListener("change", () => { $(select.id === "visualImageProvider" ? "visualImageBaseUrl" : "visualVideoBaseUrl").value = apiDefaults[select.value] || ""; }));
  document.addEventListener("click", async event => {
    const resetAsset=event.target.closest('.asset-reset240');
    if(resetAsset&&!resetAsset.disabled){try{await resetAssetStatus240(resetAsset.closest('.visual-card'),resetAsset);}catch(error){toast(error.message,true);}return;}
    const recovery=event.target.closest('.asset-observe,.asset-history-select');
    if(recovery && !recovery.disabled){
      const node=recovery.closest('.visual-card'),projectId=state.project?.id,kind=node.dataset.kind,assetId=node.dataset.id;
      recovery.disabled=true;
      try{
        const selecting=recovery.classList.contains('asset-history-select');
        const data=await post(selecting?'/api/visual/asset/history/select':'/api/visual/asset/observe',{projectId,kind,assetId,...(selecting?{file:recovery.dataset.historyFile}:recovery.dataset.requestId?{requestId:recovery.dataset.requestId}:{})});
        if(data.project?.id && data.project.id!==projectId)throw Error('原图片返回的项目身份不一致，未采用。');
        if(state.project?.id===projectId){if(!state.activeAssetJobs.get(`${kind}:${assetId}`)?.active)state.activeAssetJobs.delete(`${kind}:${assetId}`);await reloadProject();if(state.project?.id===projectId)toast(selecting?'已选用历史图片，无需重新生成。':data.recovery?.message||'原任务状态已查询。');}
      }catch(error){if(state.project?.id===projectId)toast(error.message,true);}finally{if(recovery.isConnected)recovery.disabled=false;}return;
    }
    const downloadLink = event.target.closest('a[href^="/api/visual/download"],a[href^="/api/visual/archive"]');
    if (downloadLink) {
      event.preventDefault();
      try {
        const href = downloadLink.getAttribute("href");
        const parsed = new URL(href, window.location.origin);
        await saveDownload(href, parsed.searchParams.get("name") || downloadLink.getAttribute("download") || "");
      } catch (error) { toast(error.message, true); }
      return;
    }
    const preview = event.target.closest(".open-visual-preview");
    if (preview) { openPreview(preview); return; }
    const upload = event.target.closest(".asset-upload");
    if (upload) { upload.closest(".visual-card").querySelector(".visual-upload-input").click(); return; }
    const autoFill = event.target.closest(".episode-reference-auto-fill");
    if (autoFill) { try { await fillEpisodeReferenceMatches(autoFill); } catch (error) { toast(`自动补齐失败：${error.message}`,true); } return; }
    const episodeUpload = event.target.closest(".episode-reference-upload");
    if (episodeUpload) { episodeUpload.closest(".visual-episode-card").querySelector(".episode-reference-upload-input").click(); return; }
    const episodeRemove = event.target.closest(".episode-reference-remove");
    if (episodeRemove) { await removeEpisodeReference(episodeRemove.closest(".visual-episode-card"), episodeRemove); return; }
    const savePrompt = event.target.closest(".save-asset-prompt");
    const asset = event.target.closest(".asset-generate");
    const frame = event.target.closest(".frame-generate");
    const video = event.target.closest(".video-generate");
    const reset = event.target.closest(".video-reset");
    const episodeNode = (frame || video || reset)?.closest(".visual-episode-card");
    if (asset && state.activeAssetJobs.get(`${asset.closest(".visual-card")?.dataset.kind}:${asset.closest(".visual-card")?.dataset.id}`)?.active) return toast("这张素材已有任务在执行；其他人物、场景或物品可独立生成。", true);
    if (episodeNode && !reset && state.activeVideoJobs.get(videoJobKey(state.project?.id,episodeNode.dataset.episode))?.active) return toast("本集已提交，正在自动等待成品。", true);
    const episodeButtons = episodeNode ? [...episodeNode.querySelectorAll(".frame-generate,.video-generate")] : [];
    if (episodeNode?.dataset.generating && !reset) return;
    try {
      if (episodeNode && !reset) {
        episodeNode.dataset.generating = "true";
        episodeButtons.forEach(button => button.disabled = true);
      }
      if (savePrompt) await saveAssetPrompt(savePrompt.closest(".visual-card"));
      else if (asset) await assetGenerate(asset.closest(".visual-card"));
      else if (frame) await frameGenerate(episodeNode);
      else if (video) await videoGenerate(episodeNode);
      else if (reset) await resetVideoTask(episodeNode);
    } catch (error) { if (!error.assetPreviewHandled) toast(error.message, true); }
    finally {
      if (episodeNode) delete episodeNode.dataset.generating;
      episodeButtons.forEach(button => button.disabled = false);
    }
  });
  document.addEventListener("click", event => {
    const discover = event.target.closest(".discover-visual-models"); if (discover) discoverModels(discover.dataset.media);
    const selectAll = event.target.closest(".select-all-assets");
    if (selectAll) { const kind = selectAll.dataset.batchKind; document.querySelectorAll(`.visual-card[data-kind="${kind}"] .asset-select`).forEach(x => x.checked = true); window.CompactAssets205?.syncSelection(); toast("已全选，可生成或下载选中内容。"); }
    const invertAssets = event.target.closest(".invert-select-assets");
    if (invertAssets) { const kind = invertAssets.dataset.batchKind; document.querySelectorAll(`.visual-card[data-kind="${kind}"] .asset-select`).forEach(x => x.checked = !x.checked); window.CompactAssets205?.syncSelection(); toast("已反选当前素材。"); }
    if (event.target.closest(".select-all-videos")) { document.querySelectorAll(".episode-select").forEach(x => x.checked = true); updateStoryboardButton(); CreditGate.recalculate(); toast("已全选所有分集，可生成或下载选中视频。"); }
    if (event.target.closest(".invert-select-videos")) { document.querySelectorAll(".episode-select").forEach(x => x.checked = !x.checked); updateStoryboardButton(); CreditGate.recalculate(); toast("已反选当前分集。"); }
    if (event.target.closest("#applyGlobalVideoSettings")) applyGlobalVideoSettings();
    const clearOne = event.target.closest(".clear-video-history"); if (clearOne) clearVideoHistory(event.target.closest(".visual-episode-card"), clearOne.dataset.historyId);
    if (event.target.closest(".clear-video-history-all")) clearVideoHistory(event.target.closest(".visual-episode-card"));
    const selected = event.target.closest(".batch-assets"); const all = event.target.closest(".batch-assets-all");
    if (selected) batchAssets(selected.dataset.batchKind);
    if (all) { const kind = all.dataset.batchKind; document.querySelectorAll(`.visual-card[data-kind="${kind}"] .asset-select`).forEach(x => x.checked = true); batchAssets(kind); }
    if (event.target.closest(".batch-videos")) batchVideos();
    if (event.target.closest(".batch-videos-all")) { document.querySelectorAll(".episode-select").forEach(x => x.checked = true); batchVideos(); }
    const selectedAssets = event.target.closest(".download-selected-assets"); const allAssets = event.target.closest(".download-all-assets");
    if (selectedAssets) downloadAssets(selectedAssets.dataset.batchKind, false); if (allAssets) downloadAssets(allAssets.dataset.batchKind, true);
    if (event.target.closest(".download-selected-videos")) downloadVideos(false); if (event.target.closest(".download-all-videos")) downloadVideos(true);
  });
  document.addEventListener("change", async event => { try { if (event.target.matches(".visual-upload-input")) await uploadAsset(event.target.closest(".visual-card"), event.target.files?.[0], event.target); if (event.target.matches(".episode-reference-upload-input")) await uploadEpisodeReference(event.target.closest(".visual-episode-card"), event.target.files?.[0], event.target); if(event.target.matches(".episode-video-route")){const node=event.target.closest(".visual-episode-card"),item=state.project?.episodes?.find(row=>row.id===node?.dataset.episode),select=node?.querySelector(".episode-video-model");if(item&&select){select.innerHTML=episodeModelOptions(item,event.target.value);select.dispatchEvent(new Event("change",{bubbles:true}));}} if (event.target.matches(".episode-video-model")) { const node = event.target.closest(".visual-episode-card"); if(node.querySelector(".episode-video-route"))node.querySelector(".episode-video-route").value=modelRoute234("video",event.target.value,node.querySelector(".episode-video-route").value); syncEpisodeResolution(node); updateEstimate(); await saveSingleEpisodeVideoSettings(node); } if (event.target.matches(".episode-video-resolution,.episode-video-duration,.episode-video-ratio,.episode-tail-continuation")) { updateEstimate(); await saveSingleEpisodeVideoSettings(event.target.closest(".visual-episode-card")); } if (event.target.matches(".episode-reference")) { await handleEpisodeReferenceChange(event.target);updateEstimate(); } } catch (error) { if (!error.assetPreviewHandled) toast(error.message, true); } });
  document.addEventListener("change", event => {
    if(event.target.matches('.asset-image-route')){
      const label=event.target.closest('.asset-local-model'),select=label?.querySelector('.asset-image-model,#coverImageModel');
      if(select){select.innerHTML=imageModelOptions('',event.target.value);select.dispatchEvent(new Event('change',{bubbles:true}));}return;
    }
    if (!event.target.matches(".asset-image-model,#coverImageModel")) return;
    const route=event.target.closest('.asset-local-model')?.querySelector('.asset-image-route');if(route)route.value=modelRoute234('image',event.target.value,route.value);
const quote = event.target.closest(".asset-local-model")?.querySelector(".asset-image-quote"); if (quote) quote.textContent = imageModelQuoteText(event.target.value); });
  $("visualEyeMaskMode")?.addEventListener("change", async event => { if (!state.project?.id) return; try { state.project.settings = { ...(state.project.settings || {}), eyeMaskMode: event.target.value }; await post("/api/visual/settings", { projectId: state.project.id, settings: { eyeMaskMode: event.target.value } }); toast(`已保存眼部遮挡样式：${event.target.value === "mosaic" ? "条形马赛克纹理" : "白色矩形"}。`); } catch (error) { toast(`遮挡样式保存失败：${error.message}`, true); } });
  $("generateVisualCover").addEventListener("click", generateCover); $("visualPreviewClose").addEventListener("click", closePreview); $("visualPreviewModal").addEventListener("click", event => { if (event.target === $("visualPreviewModal")) closePreview(); }); $("visualPreviewFullscreen").addEventListener("click", () => setPreviewExpanded(!state.previewExpanded)); document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("visualPreviewModal").classList.contains("hidden")) { if (state.previewExpanded) setPreviewExpanded(false); else closePreview(); } });
  function refreshReferenceLimits() { document.querySelectorAll(".visual-episode-card").forEach(node => { const label = node.querySelector(".visual-reference-picker .visual-reference-heading > b"), model = node.querySelector(".episode-video-model")?.value, limit = videoReferenceLimit(model); if (label) label.textContent = `${limit == null ? "数量按本集模型能力" : `本集模型最多${limit}张`}；取消引用保留原文字`; }); }
  $("visualVideoTier").addEventListener("change", refreshReferenceLimits);
  $("syncVisualConfig")?.addEventListener("click", () => loadProfile(true, true));
  $("refreshVisualPoints")?.addEventListener("click", () => refreshPoints(true));
  $("refreshVisualUsage")?.addEventListener("click", () => refreshPoints(true));
  $('toggleVisualAssetHistory')?.addEventListener('click',()=>{const id=state.project?.id;assetHistoryExpanded.set(id,assetHistoryExpanded.get(id)!==true);syncAssetHistoryVisibility(id);});
  async function loadAppVersion() { try { const response = await fetch("/api/health", { cache:"no-store" }); const data = await response.json(); const version = `v${data.version || ""}`; if ($("visualAppVersion")) $("visualAppVersion").textContent = version; document.title = `短剧工作流 · ${data.appName || 'NanbudoTV·AI'} ${version}`; } catch (_) {} }
  const autoCreateFromScript = new URLSearchParams(location.search).get("autoCreate") === "1";
  CharacterPicker.install('.visual-card[data-kind="people"]', async (node,role) => {
    const projectId=state.project.id,revision=cutRevision(state.project);
    const data=await post('/api/visual/asset/bind-character',{projectId,assetId:node.dataset.id,characterId:role.character.id,cutRevisionId:revision});
    if(canApplyCutResponse(projectId,revision,data.project)){render(data.project);toast(`已绑定“${role.character.name}”的形象、语言口音与声音记录。视频结果可另行确认台词时间和费用后配音，未自动合成。`);}
  });
  CreditGate.register('.asset-generate,.frame-generate,#generateVisualCover', workflowImageCredit);
  CreditGate.register('.video-generate', workflowVideoCredit);
  CreditGate.register('.batch-assets,.batch-assets-all,.batch-videos,.batch-videos-all', workflowBatchCredit);
  CreditGate.register('#confirmSourceReference', () => workflowTextCredit('workflow-assets',$('visualRecognitionModel').value));
  CreditGate.register('#aiSceneDirectory', () => workflowTextCredit('workflow-cut',$('visualCutModel').value));
  CreditGate.register('#confirmCutModeDialog', () => workflowTextCredit('workflow-cut',$('visualCutModel').value));
  CreditGate.register('#fillStoryboard,#regenerateSelectedStoryboard,.regenerate-episode-storyboard', button => {
    // Receipt reconciliation is free and must remain available without funds.
    if (button.id === 'fillStoryboard' && storyboardResumeInfo().reconcile) return CreditGate.FREE;
    if (button.id !== 'fillStoryboard') {
      if(storyboardRegenerationInfo().reconcile) return CreditGate.FREE;
    }
    return workflowTextCredit('workflow-storyboard',$('visualTextModel').value);
  });
  CreditGate.register('.regenerate-local-storyboard', button => {
    const number=button.closest('.visual-episode-card')?.dataset.cutNumber;
    const attempt=window.WorkflowCutEditor.currentAttempt(state.project,Number(number));
    if(attempt?.reconcileAllowed || attempt?.taskId && ['queued','running'].includes(attempt.state))return CreditGate.FREE;
    if(storyboardBatchRecovery(state.project,Number(number)))return CreditGate.FREE;
    // The per-card editor computes this marker from SHA-256 of the saved
    // source. CreditGate quote functions are intentionally synchronous.
    if (button.dataset.cachedRecheck === '1') return CreditGate.FREE;
    return workflowTextCredit('workflow-storyboard',$('visualTextModel').value);
  });
  installLocalAssetMatch228(); installRoleLayoutOptions(); installLayoutPickers(); installStylePickers(); sourceFromStorage(); loadVisualTextModels(); loadFeatureAccess(); refreshPoints(); loadProjects(); loadAppVersion();
  Promise.all([loadProfile(true), loadStyles()]).then(async () => {
    if (autoCreateFromScript && $("visualSource").value.trim()) {
      // A handoff from a script always starts a new project. Restoring the
      // previously edited project here could overwrite the handed-off script
      // or suppress the creation wizard entirely.
      state.pendingSourceAction = "handoff";
      await newProjectWizard();
    } else {
      await loadExistingProject();
    }
  });
  const moduleVisible251=()=>!document.hidden&&(!window.frameElement||window.frameElement.getClientRects().length>0);
  setInterval(() => {if(moduleVisible251())loadProfile(true);}, 30000);
  window.addEventListener('focus',()=>{if(moduleVisible251())loadProfile(true);});
  setInterval(() => {if(moduleVisible251())refreshPoints();}, 30000);
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='nanbudo:module-active251'&&event.data.active){loadProfile(true);refreshPoints();}});
})();


/* Independent macro-scene development page. No writes to legacy cuts/media. */
(function (root, factory) {
  const presentation = typeof module === 'object' && module.exports ? require('./model_presentation.js') : root.ModelPresentation;
  const api = factory(presentation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.MacroArrangement = api; if (root.document?.getElementById('macroSource')) api.mount(root.document, root); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (presentation) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const pipelineReturnIdentity = snapshot => JSON.stringify([snapshot?.projectId || '',snapshot?.revisionId || '',snapshot?.sourceHash || '',snapshot?.taskId || '',snapshot?.active?.claimId || '',snapshot?.savedStoryboardReturnIdentity || null]);
  const projectIdValid = value => /^[a-f0-9]{32}$/.test(String(value || ''));
  const downloadModules227 = new Map();
  function rememberDownloadModule227(snapshot) {
    const id=String(snapshot?.projectId||''),module=snapshot?.outputModule227;
    if(projectIdValid(id)&&['workflow','ecommerce','store','advertising'].includes(module)){
      downloadModules227.delete(id);downloadModules227.set(id,module);
      if(downloadModules227.size>128)downloadModules227.delete(downloadModules227.keys().next().value);
    }
  }
  const seconds = value => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—';
  const ratioLabel = value => typeof globalThis.AspectRatio?.label === 'function' ? globalThis.AspectRatio.label(value) : ({'16:9':'横屏 16:9','9:16':'竖屏 9:16','1:1':'方形 1:1','4:3':'横屏 4:3','3:4':'竖屏 3:4','21:9':'超宽屏 21:9'}[value] || String(value || ''));
  const segments = snapshot => Array.isArray(snapshot?.plan?.segments) ? snapshot.plan.segments : [];
  const segmentId = item => String(item.segmentId || item.id || '');
  const savedCardActionsAvailable = snapshot => snapshot?.savedCardActionsAvailable===true;
  const isPlanAction = action => action === 'plan' || action === 'plan_resume';
  const statusNames = {planned:'待编排',idle:'待编排',pending:'待编排',waiting_cut:'后台待切卡',running:'正在编排',arranging:'正在编排',queued:'已排队',reserving:'正在准备本次调用',submitted:'模型处理中',returned:'原返回已保存，正在验收',arranged:'编排完成',ready:'完整分镜已保存',done:'完整分镜已保存',completed:'完整分镜已保存',failed:'本段失败，其他段保留',error:'本段失败，其他段保留',validation_failed:'返回验收未通过，原返回保留',not_submitted:'未提交，原数据保留',uncertain:'原调用结果待核对',needs_review:'原调用结果待核对'};
  statusNames.returned_unstructured='已返回，尚未转为视频卡';
  const terminalTextStatuses=new Set(['done','completed','arranged','ready','returned_unstructured','failed','error','validation_failed','not_submitted','failed_refunded','provider_failed','cancelled','canceled','interrupted','superseded','refunded','detached']);
  const reviewTextStatuses=new Set(['needs_review','uncertain']);
  const runningTextStatuses=new Set(['queued','running','reserving','submitted','observing','arranging','saving','returned']);
  const textStatus=row=>String(row?.state||row?.status||'').toLowerCase();
  const isTerminalTextTask=row=>terminalTextStatuses.has(textStatus(row));
  const textTaskInFlight=row=>{const status=textStatus(row);if(terminalTextStatuses.has(status)||reviewTextStatuses.has(status))return false;return runningTextStatuses.has(status)||!status&&!!(row?.taskId||row?.localTaskId);};
  const activePending = snapshot => !!snapshot?.active && Object.keys(snapshot.active).length>0&&!isTerminalTextTask(snapshot.active);
  const terminalLinkedTask=(snapshot,row)=>{
    const task=snapshot?.task,taskId=String(task?.id||task?.taskId||''),rowId=String(row?.taskId||row?.localTaskId||'');
    return !!taskId&&taskId===rowId&&isTerminalTextTask(task);
  };
  const savedTextTasks=snapshot=>{
    const stored=snapshot?.activeTasks&&typeof snapshot.activeTasks==='object'?Object.values(snapshot.activeTasks):[];
    const rows=stored.length?stored:activePending(snapshot)?[snapshot.active]:[];
    return rows.filter(row=>row&&typeof row==='object'&&!isTerminalTextTask(row)&&!terminalLinkedTask(snapshot,row));
  };
  const snapshotTextInFlight=snapshot=>{
    const tasks=savedTextTasks(snapshot);
    if(tasks.length)return tasks.some(textTaskInFlight);
    if(snapshot?.activeTasks&&typeof snapshot.activeTasks==='object')return false;
    if(snapshot?.active&&Object.keys(snapshot.active).length)return !terminalLinkedTask(snapshot,snapshot.active)&&textTaskInFlight(snapshot.active);
    if(snapshot?.task&&textTaskInFlight(snapshot.task))return true;
    return Object.values(snapshot?.segments||{}).some(textTaskInFlight);
  };
  function textScopes(view){
    const live=Object.values(view?.textTasks||{}),ids=new Set(live.map(row=>String(row.taskId||row.localTaskId||'')).filter(Boolean));
    // A polled task is newer than its saved claim. Do not keep showing a
    // historical "queued" claim after the actual worker has started.
    const savedRows=savedTextTasks(view?.snapshot),savedById=new Map(savedRows.map(row=>[
      String(row.taskId||row.localTaskId||''),row]).filter(([id])=>id));
    const currentLive=live.filter(row=>!isTerminalTextTask(row)).map(row=>{
      const id=String(row.taskId||row.localTaskId||''),saved=savedById.get(id);
      // The worker poll owns phase/progress, while the saved claim owns
      // incremental availability metadata. Keep both so returned scenes can
      // be worked on before the remaining cut batches finish.
      return saved?{...saved,...row,...Object.fromEntries(['cardNumbers','cardProgress','targetCardNumbers','completedCardNumbers','availableSegmentIds','availableCards228','activeRequestCount','requestConcurrencyLimit'].filter(key=>key in saved).map(key=>[key,saved[key]]))}:row;
    });
    const saved=savedRows.filter(row=>!ids.has(String(row.taskId||row.localTaskId||'')));
    const tasks=[...currentLive,...saved,...Object.values(view?.textUnknown||{})];
    if(!tasks.length&&(view?.activeTask||view?.submitUncertain))tasks.push({action:'plan'});
    return tasks;
  }
  const overlaps=(a,id,number)=>a.action==='plan'||!a.segmentId||!id||a.segmentId===id&&(!a.cardNumber||!number||Number(a.cardNumber)===Number(number));
  function planCardAvailable228(row,id,number){
    if(!id)return false;
    if(row.availableSegmentIds?.includes(id))return true;
    return Number.isInteger(Number(number))&&Number(number)>0&&Array.isArray(row.availableCards228?.[id])&&row.availableCards228[id].some(value=>Number(value)===Number(number));
  }
  function textScopeMatches(row,id,number){
    if(!overlaps(row,id,number))return false;
    if(isPlanAction(row.action)&&planCardAvailable228(row,id,number))return false;
    return !(row.action==='segment'&&row.segmentId===id&&number&&Array.isArray(row.cardNumbers)&&!row.cardNumbers.map(Number).includes(Number(number)));
  }
  function cardRecoveryState(view,id,number){
    const rows=textScopes(view).filter(row=>textScopeMatches(row,id,number)),seen=new Set();
    const pending=rows.filter(row=>reviewTextStatuses.has(textStatus(row))||row._local).filter(row=>{
      const key=row.claimId||JSON.stringify([row.segmentId,row.cardNumber,row.taskId]);
      if(seen.has(key))return false;seen.add(key);return true;
    });
    const running=rows.filter(textTaskInFlight);
    return {pending,running,uncertain:pending.length>0||!running.length&&directRegenerationBlocked(view,id,number)};
  }
  function operationBlocked(view,id,number){return !!view?.busy||Object.values(view?.operations||{}).some(row=>overlaps(row,id,number));}
  // An escape from a stuck reader must not wait for that same reader. Paid
  // submission, text and editing operations still retain their normal locks.
  function detachBlocked(view,id,number){return !!view?.busy||Object.values(view?.operations||{}).some(row=>row.kind!=='observe'&&overlaps(row,id,number));}
  const quoteBlocked=(view,id,number)=>!!view?.quote&&overlaps(view.quote,id,number);
  function cardTextWork(view,id,number){
    for(const row of [...Object.values(view?.operations||{}).filter(row=>row.kind==='text'),...textScopes(view)]){
      if(!textTaskInFlight(row)||!overlaps(row,id,number)||isPlanAction(row.action)&&planCardAvailable228(row,id,number))continue;
      // cardNumbers is the remaining scope of THIS invocation. A completed
      // sibling or an old card excluded by "missing only" is not generating.
      if(number&&Array.isArray(row.cardNumbers)&&!row.cardNumbers.map(Number).includes(Number(number)))continue;
      const progress=number&&row.cardProgress?.[String(number)];
      if(progress?.status==='completed')continue;
      if(progress?.status==='waiting')return {...row,phase:'waiting_card',message:'本卡尚未开始；已返回的卡片可先编辑或生成视频。',animate:false};
      if(progress?.status==='returned'||!row.cardProgress&&row.status==='returned')return {...row,phase:'returned_card',message:'模型正文已收到，正在校验与保存；不是重新调用模型。',animate:false};
      if(progress&&terminalTextStatuses.has(progress.status))return {...row,phase:'card_failed',message:'本卡未完成；原返回保留，未自动重提。',animate:false};
      return {...row,animate:true};
    }
  }
  function textWorkTitle(work){
    if(work?.phase==='waiting_card')return '等待补齐本卡分镜';
    if(work?.phase==='returned_card')return '分镜已返回，正在整理保存';
    if(work?.phase==='card_failed')return '本卡补齐未完成';
    if(work?.phase==='quote')return '正在核价与校验原文';
    if(work?.phase==='submitting')return '正在提交本卡任务';
    if(textStatus(work)==='queued')return '本地排队中（文本最多10项并发）';
    if(work?.phase==='config')return '正在核对模型与费用';
    if(work?.phase==='order')return '正在准备本次原订单';
    if(work?.phase==='model')return '正在连接模型，等待返回';
    if(work?.phase==='validating')return '模型已返回，正在验收';
    if(work?.phase==='settling')return '正在核对结算与保存结果';
    if(['submitted','arranging'].includes(textStatus(work)))return '原任务处理中';
    return '正在准备模型调用';
  }
  function textBlocked(view,id,number){return textScopes(view).some(task=>{
    if(task._local||!textTaskInFlight(task))return false;
    if(isPlanAction(task.action))return !planCardAvailable228(task,id,number);
    if(!task.segmentId||!id)return true;
    if(task.segmentId!==id)return false;
    if(!number)return true;
    return Array.isArray(task.cardNumbers)?task.cardNumbers.map(Number).includes(Number(number)):!task.cardNumber||Number(task.cardNumber)===Number(number);
  });}
  const anyTextActive=view=>textScopes(view).some(row=>!row._local&&textTaskInFlight(row));
  // History and failed transport receipts never lock a new manual action.
  // The server still checks actual workers before accepting a new claim.
  function scopedPlanTextBlocked(view){
    return !!view?.activeTask || snapshotTextInFlight(view?.snapshot) || anyTextActive(view);
  }
  const cardComplete=card=>!!card&&card.complete===true&&!card.storyboardStale&&!!cardPrompt(card);
  function validTextQuote(quote,action,id,number,snapshot,completionMode){
    if(!quote||typeof quote.quoteId!=='string'||!quote.quoteId||quote.action!==action||quote.segmentId!==undefined&&quote.segmentId!==(id||'')||quote.cardNumber!==undefined&&Number(quote.cardNumber)!==Number(number))return false;
    if(!Number.isInteger(quote.maxCalls)||quote.maxCalls<1||!Number.isFinite(quote.unitCredits)||quote.unitCredits<=0||!Number.isFinite(quote.totalCredits)||quote.totalCredits<=0||Math.abs(quote.totalCredits-quote.unitCredits*quote.maxCalls)>1e-8)return false;
    if(isPlanAction(action))return quote.actualCallBilling===true || quote.maxCalls<=2 || quote.shotFirst===true;
    if(number!==undefined)return quote.maxCalls===1;
    const segment=segments(snapshot).find(row=>segmentId(row)===id),cards=readSceneCards(snapshot,segment||{});
    const mode=completionMode || quote.completionMode || (quote.rerun?'all':'missing');
    if(!['missing','all'].includes(mode) || quote.completionMode!==undefined&&quote.completionMode!==mode)return false;
    const targets=cards.filter(card=>mode==='all'||!cardComplete(card)).map((card,index)=>card.number||index+1);
    if(cards.length&&completionMode!==undefined&&(quote.completionMode!==completionMode||!Array.isArray(quote.cardNumbers)||!Number.isInteger(quote.cardCount)))return false;
    if(quote.cardCount!==undefined&&quote.cardCount!==targets.length&&cards.length)return false;
    if(quote.cardNumbers!==undefined&&(!Array.isArray(quote.cardNumbers)||cards.length&&JSON.stringify(quote.cardNumbers)!==JSON.stringify(targets)))return false;
    // Legacy workspaces without a saved card plan still have their original
    // one-call scene contract. A planned scene must quote each missing card.
    return cards.length?quote.maxCalls===targets.length:quote.maxCalls===1;
  }
  function quoteSummary(quote,title){
    if(!quote||!Number.isInteger(quote.maxCalls)||quote.maxCalls<1||!Number.isFinite(quote.totalCredits)||quote.totalCredits<=0)throw Error('没有有效报价，未开放提交。');
    if(quote.pricingMode==='live_quote'){
      const expiry=Number(quote.expiresAt)*1000;if(!Number.isFinite(expiry)||expiry<=Date.now())throw Error('本次实时报价已过期，请重新核价并确认；未提交生成。');
      return [title||'确认生成本卡媒体',...(quote.modelName?['本次模型：'+quote.modelName]:[]),`实时核价 · 本次 ${quote.totalCredits} 积分`,`报价有效至 ${new Date(expiry).toLocaleTimeString('zh-CN',{hour12:false})}`,...(quote.upstreamEstimateOnly?['上游估价；本次确认积分固定。']:[]),'仅执行本次确认的卡片，不自动换价继续。确认生成？'].join('\n');
    }
    if(quote.shotFirst===true&&isPlanAction(quote.action))return [title||'镜头优先编排',
      quote.action==='plan_resume'?'仅提交所选范围内尚未验收的分段，已验收的分镜和视频继续保留。':
        quote.archivesStoryboard279?'本次将开启新的分镜版本。当前分镜、视频和原调用记录会归档。':
        '按所选场次生成镜头，随后按顺序组合视频卡。',
      `本次${quote.actualCallBilling?'预计':'最多'} ${quote.maxCalls} 次模型调用 · ${Number(quote.totalCredits.toFixed(6))} 积分${quote.actualCallBilling?'（按实际调用结算，非费用上限）':'上限'}`,
      '分段逐批返回，失败分段保留原记录，其他分段继续。不会自动重提。是否确认？'].join('\n');
    const scope=quote.action==='segment'&&!quote.cardNumber ? [
      `补齐范围：${quote.completionMode==='all'?'全部重新补齐（将更新已有分镜）':'只补齐空缺（保留已有分镜）'}`,
      `本次处理：${quote.cardCount??quote.maxCalls} 张视频卡${Array.isArray(quote.cardNumbers)?' · 卡号 '+quote.cardNumbers.join('、'):''}`,
      '不改变本卡原文、切卡和时长；已有视频保留在媒体历史中。'] : [];
    const fixedSceneScope=quote.action==='segment'&&!quote.cardNumber&&['missing','all'].includes(quote.completionMode)&&Array.isArray(quote.cardNumbers);
    if(quote.actualCallBilling===true&&!fixedSceneScope){
      if(!Number.isFinite(quote.unitCredits)||quote.unitCredits<=0)throw Error('没有有效按次价格，未开放提交。');
      return [title||'请确认下一步',...scope,...(quote.modelName?['本次模型：'+quote.modelName]:[]),
        `单价：${Number(quote.unitCredits.toFixed(6))} 积分/次`,
        '按实际模型调用次数结算；可能根据场次分批调用，不是一次付费包全部。',
        `当前基础估算：${quote.maxCalls} 次、${Number(quote.totalCredits.toFixed(6))} 积分；不是最终费用上限。`,
        quote.action==='plan'?'出错即停止，不自动收费重试；不会自动补齐分镜、生成图片或视频。是否继续？':'仅补齐已确认范围的分镜，不自动收费重试，不生成图片或视频。是否继续？'].join('\n');
    }
    const details=[title||'请确认下一步',...scope,...(quote.modelName?['本次模型：'+quote.modelName]:[]),'最大调用：'+quote.maxCalls+' 次','费用上限：'+String(Number(quote.totalCredits.toFixed(6)))+' 积分'];
    if(quote.action==='plan')details.push(quote.maxCalls===2?'先识别剧本与清理前置信息，再规划场次、分割剧情；最多2次模型调用。':'程序先识别剧本并读取已有场次标识，再调用模型分割剧情；最多1次模型调用。','剧情分割完成后停止，不会自动补齐分镜。');
    else if(quote.maxCalls>1)details.push(quote.completionMode==='all'?'逐卡重新补齐本场全部卡片；每张最多调用1次，已有分镜会更新。':'按“补齐本卡分镜”标准逐卡处理本场尚未完成的卡片；每张最多调用1次，已完成卡片跳过。','失败即停止，已完成卡片保留，不会自动收费重试。');
    else details.push('仅执行本次确认的工作，不会自动处理其他卡片或收费重试。');
    return details.join('\n');
  }
  const mediaKey = (id,number) => JSON.stringify([id,number]);
  const mediaRecord = (snapshot,id,number) => snapshot.media?.[id]?.[String(number)] || {};
  const mediaActive = (record,ignoreReview=false) => {
    if(!ignoreReview)return !!record?.active&&Object.keys(record.active).length>0;
    return [...Object.values(record?.activeTasks||{}),...(record?.active&&Object.keys(record.active).length?[record.active]:[])].some(row=>!['needs_review','uncertain','completed','refunded','not_submitted','failed','cancelled','detached'].includes(row.status));
  };
  function cardMediaBlocked(view,id,number){
    const snapshot=view?.snapshot||{},key=mediaKey(id,number),record=mediaRecord(snapshot,id,number);
    if(mediaActive(record,true))return true;
    const scope=view?.mediaRequests?.[key]||view?.mediaUnknown?.[key];
    // A background reader of an identified historical order does not own a
    // new invocation. A fresh lost submit remains blocked until identified.
    if(scope?.mode==='observe'&&scope.requestId&&[...Object.values(record.activeTasks||{}),record.active].some(row=>row?.requestId===scope.requestId&&['needs_review','uncertain'].includes(row.status)))return false;
    return !!view?.mediaTasks?.[key];
  }
  function mediaOutcome(record,scope) {
    if(!scope || typeof scope!=='object')return null;
    // A file from an older generation is not proof that a new request ended.
    // Prefer the original request ID; quote/local IDs only bridge a lost RPC
    // response until its exact saved attempt can identify the original.
    const matches=row=>scope.requestId?row.requestId===scope.requestId:
      scope.quoteId?row.quoteId===scope.quoteId:!!scope.localTaskId&&row.localTaskId===scope.localTaskId;
    const attempts=(record.attempts||[]).filter(row=>row&&matches(row));
    const history=(record.history||[]).find(row=>row&&
      (scope.requestId?row.requestId===scope.requestId:attempts.some(attempt=>attempt.requestId&&attempt.requestId===row.requestId))&&
      !!mediaUrl(scope.projectId,row.file,(row.kind||row.action)==='frame'?'frame':'video'));
    if(history)return {resolved:true,completed:true,requestId:history.requestId,file:history.file};
    const terminal=attempts.find(row=>['refunded','not_submitted','detached'].includes(row.status));
    return terminal?{resolved:true,completed:false,requestId:terminal.requestId,status:terminal.status}:null;
  }
  function mediaUrl(projectId,file,kind) {
    if(!projectIdValid(projectId) || typeof file!=='string' || !file || /^[\\/]|^[A-Za-z]:|[\x00-\x1f]/.test(file) || file.replace(/\\/g,'/').split('/').includes('..') || file.includes(':'))return '';
    if(kind==='video' && !/\.(mp4|webm|mov|m4v)$/i.test(file))return '';
    if(kind==='frame' && !/\.(jpe?g|png|webp|gif|avif)$/i.test(file))return '';
    return `/api/visual/media?projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(file)}`;
  }
  function downloadUrl(projectId,file,kind,name) {
    const url=mediaUrl(projectId,file,kind);return url?url.replace('/api/visual/media?','/api/visual/download?')+'&name='+encodeURIComponent(name):'';
  }
  function installDownloads(document,win) {
    document.addEventListener('click',async event=>{
      const link=event.target.closest('[data-macro-download]');if(!link)return;
      event.preventDefault();event.stopImmediatePropagation();if(link.dataset.saving==='1')return;
      const url=link.getAttribute('href'),name=link.getAttribute('download')||'视频.mp4';
      if(!url?.startsWith('/api/visual/download?'))return;
      const owner=new URLSearchParams(url.slice(url.indexOf('?')+1)).get('projectId');
      const outputModule=downloadModules227.get(owner)||'workflow';
      let status=link.parentElement.querySelector('.macro-download-status');
      if(!status){status=document.createElement('small');status.className='macro-download-status';status.setAttribute('role','status');link.after(status);}
      link.dataset.saving='1';status.textContent='';
      try{
        if(win.parent!==win&&typeof win.parent.saveLocalDownload==='function'){
          const saved=await win.parent.saveLocalDownload(url,name,outputModule);if(status.isConnected)status.textContent=saved===false?'已取消保存':'视频已保存。';
        }else{
          const api=win.pywebview?.api||win.parent?.pywebview?.api;
          if(api?.save_download){const result=await api.save_download(url,name,outputModule);if(result?.canceled){status.textContent='已取消保存';return;}if(!result?.ok)throw Error(result?.error||'保存失败');if(status.isConnected)status.textContent='已保存到：'+result.path;}
          else {const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();if(status.isConnected)status.textContent='下载已开始，请查看浏览器下载列表。';}
        }
      }catch(error){if(status.isConnected)status.textContent='下载失败：'+error.message;}
      finally{delete link.dataset.saving;}
    },true);
  }
  const mediaModels = (catalog,action) => (catalog?.models || []).filter(row=>row && row.media===(action==='frame'?'image':'video') && row.gatewayReady===true && row.enabled!==false && row.model);
  function modelRoute234(catalog,action,model,fallback='official') {
    const row=mediaModels(catalog,action).find(row=>row.model===model);
    if(['discount','official'].includes(row?.routeType))return row.routeType;
    const special=['seedance-2-0-special','seedance-2-0-manju-special','seedance-2-0-ecom-special','seedance-2-0-9tu-special','seedance-2-5-special','seedance-2-0-promo','seedance-2-5-promo'];
    if(row)return special.includes(String(model).toLowerCase())?'discount':'official';
    return ['discount','official'].includes(fallback)?fallback:'official';
  }
  const routeModels234=(catalog,action,route)=>mediaModels(catalog,action).filter(row=>modelRoute234(catalog,action,row.model)===route);
  function mediaRoutes277(catalog,action) {
    return presentation.availableRoutes({visualModels:mediaModels(catalog,action),visualCatalogPublished:true},
      action==='frame'?'image':'video');
  }
  const mediaPayload234=({routeType,tailFrameUnavailableReason,...choice})=>{
    if(choice.tailFrameContinuation!==true)delete choice.tailFrameMode;
    return choice;
  };
  function mediaResolutions(catalog,model,action) {
    const item=mediaModels(catalog,action).find(row=>row.model===model),rows=action==='frame'?catalog?.imagePricing:catalog?.videoPricing;
    const priced=(Array.isArray(rows)?rows:[]).filter(row=>String(row.model).toLowerCase()===String(model).toLowerCase() && Number(row.pricePerImage ?? row.pricePerGeneration ?? row.pointsPerSecond ?? row.pricePerSecond)>0).map(row=>String(row.resolution).toLowerCase());
    return [...new Set((item?.supportedResolutions?.length?item.supportedResolutions:priced).map(row=>String(row).toLowerCase()))].filter(row=>item?.pricingMode==='live_quote'||priced.includes(row));
  }
  function videoDurationOptions(item) {
    const minimum=Number(item?.minDurationSeconds||1),maximum=Number(item?.maxDurationSeconds||30);
    if(Array.isArray(item?.supportedDurations)&&item.supportedDurations.length)return [...new Set(item.supportedDurations.filter(value=>Number.isInteger(value)&&value>=minimum&&value<=maximum))].sort((a,b)=>a-b);
    if(Number.isFinite(item?.minDurationSeconds)&&Number.isFinite(item?.maxDurationSeconds)&&minimum>0&&maximum>=minimum&&maximum<=1800)return Array.from({length:Math.floor(maximum)-Math.ceil(minimum)+1},(_,index)=>Math.ceil(minimum)+index);
    return [];
  }
  function defaultMediaDraft(catalog,action,saved={},ratio='16:9',card=null) {
    const project=catalog?.projectMediaDefaults?.[action] || {},requestedRoute=saved.routeType||project.routeType,list=requestedRoute?routeModels234(catalog,action,requestedRoute):mediaModels(catalog,action),preferred=action==='frame'?list.find(row=>String(row.model).toLowerCase()==='image-2.5'&&mediaResolutions(catalog,row.model,action).length):null;
    // An explicit card/project choice stays selected even if retired. Only a
    // project without any saved model may use the old catalog default.
    const requested=String(Object.hasOwn(saved,'model')?saved.model:project.model || '').trim(),model=requested || preferred?.model || list[0]?.model || '',item=list.find(row=>row.model===model),resolutions=mediaResolutions(catalog,model,action),ratios=item?.supportedAspectRatios?.length?item.supportedAspectRatios:['16:9','9:16','1:1'];
    const savedResolution=String(saved.resolution || '').toLowerCase(),projectResolution=String(project.resolution || '').toLowerCase();
    const result={model,routeType:modelRoute234(catalog,action,model,saved.routeType||project.routeType),resolution:resolutions.includes(savedResolution)?savedResolution:resolutions.includes(projectResolution)?projectResolution:item?resolutions[0]||'':savedResolution||projectResolution,
      ratio:ratios.includes(saved.ratio)?saved.ratio:ratios.includes(project.ratio)?project.ratio:ratios.includes(ratio)?ratio:ratios[0]||'',referenceAssetIds:Array.isArray(saved.referenceAssetIds)?saved.referenceAssetIds.slice():[]};
    if(action==='video'){
      const actual=mediaGenerationDuration(card),desired=Number.isInteger(saved.duration)&&saved.duration>0?saved.duration:Number.isFinite(actual)&&actual>0?actual:project.duration,options=videoDurationOptions(item);
      if(Number.isInteger(desired)&&desired>0)result.duration=options.length&&!options.includes(desired)?options.reduce((best,value)=>Math.abs(value-desired)<Math.abs(best-desired)?value:best,options[0]):desired;
      const tail=tailFrameState239(item,{...result,tailFrameMode:saved.tailFrameMode,tailFrameContinuation:saved.tailFrameContinuation});
      result.tailFrameMode=tail.mode;
      if(tail.enabled)result.tailFrameContinuation=true;
      if(tail.cancelled)result.tailFrameUnavailableReason=tail.notice;
    }
    return result;
  }
  // Model asset IDs describe entities in the scene, not necessarily images.
  // User-saved and locally edited selections are exact; only initial model
  // suggestions are intersected with the current image catalog.
  function cardReferenceSelection(snapshot,id,number,card,view,action='video') {
    const local=view?.mediaDrafts?.[mediaKey(id,number)]?.[action];
    if(Array.isArray(local?.referenceAssetIds))return local.referenceAssetIds.slice();
    const saved=snapshot?.cardDrafts?.[id]?.[String(number)];
    if(Array.isArray(saved?.referenceAssetIds))return saved.referenceAssetIds.slice();
    const available=new Set((view?.catalog?.assets || []).filter(row=>row.imageReady).map(row=>row.id));
    return [...new Set(card?.referenceAssetIds || [])].filter(id=>available.has(id));
  }
  function mediaGenerationDuration(card) {
    const duration=card?.durationSeconds;
    return card?.shotFirstVersion===1 && Number.isFinite(duration) && duration>0 && Number.isInteger(duration*2) ? Math.ceil(duration) : duration;
  }
  function mediaIssue(catalog,action,selected,duration,card=null) {
    const item=mediaModels(catalog,action).find(row=>row.model===selected.model);
    if(!item || !mediaResolutions(catalog,selected.model,action).includes(selected.resolution))return '缺少已发布且有有效价格的模型规格，不能提交。';
    const ratios=item.supportedAspectRatios?.length?item.supportedAspectRatios:['16:9','9:16','1:1'];if(!ratios.includes(selected.ratio))return '该模型不支持当前画幅。';
    const actual=duration;duration=action==='video'&&Number.isInteger(selected.duration)?selected.duration:card?mediaGenerationDuration(card):duration;
    if(action==='video' && actual!==duration && !(item.supportedDurations?.includes(duration)||Number.isFinite(item.minDurationSeconds)&&Number.isFinite(item.maxDurationSeconds)))return `所选模型未明确发布生成${duration}秒的能力。`;
    if(action==='video' && (!Number.isInteger(duration) || duration<Number(item.minDurationSeconds||1) || duration>Number(item.maxDurationSeconds||30) || item.supportedDurations?.length && !item.supportedDurations.includes(duration)))return `所选模型不支持生成 ${duration} 秒，请选择支持的时长。`;
    const assets=new Map((catalog?.assets||[]).map(row=>[row.id,row]));
    const unavailable=selected.referenceAssetIds.filter(id=>!assets.get(id)?.imageReady);
    if(unavailable.length)return '参考图待处理：'+unavailable.map(id=>{const row=assets.get(id);return row?`“${row.name}”${row.imageIssue||'尚无可用图片'}`:`“${id}”已不在当前资产库`;}).join('；')+'。可展开本卡参考图取消该项，或先生成／补选图片。';
    if(!Number.isInteger(item.referenceImageLimit)||item.referenceImageLimit<0)return '所选模型未发布有效参考图能力，请更新模型配置。';
    if(selected.referenceAssetIds.length>item.referenceImageLimit)return item.referenceImageLimit===0?'所选模型不支持参考图，请取消引用或选择支持参考图的模型。':'参考图数量超出所选模型能力，未静默丢图。';
    return '';
  }
  function mediaQuoteNeedsConfirmation251(quote,displayedCredits,catalogPending=false){
    return quote?.pricingMode==='live_quote'||!!quote?.pricingNote172||catalogPending||!Number.isFinite(displayedCredits)||displayedCredits<=0||!Number.isFinite(quote?.totalCredits)||Math.abs(quote.totalCredits-displayedCredits)>1e-9;
  }
  function mediaCost(catalog,selection,duration) {
    if((catalog?.models||[]).some(row=>row.model===selection.model&&row.pricingMode==='live_quote'))return null;
    const quote=presentation?.quote(catalog||{},selection.model,selection.resolution,Number(duration),'economy',selection.ratio);
    return quote?.points>0?quote.points:null;
  }
  function tailFrameCapabilityIssue239(item,mode,selection={}){
    const count=Array.isArray(selection.referenceAssetIds)?selection.referenceAssetIds.length:0;
    if(mode==='reference'){
      if(item?.tailReferenceSupported!==true)return item?.tailReferenceSupportReason||'尾帧参考承接尚未确认支持，暂不可勾选。';
      if(item.supportedResolutions?.length&&!item.supportedResolutions.map(v=>String(v).toLowerCase()).includes(String(selection.resolution||'').toLowerCase()))return '当前清晰度不支持尾帧参考承接。';
      if(item.supportedDurations?.length&&!item.supportedDurations.includes(selection.duration)||Number.isFinite(item.minDurationSeconds)&&selection.duration<item.minDurationSeconds||Number.isFinite(item.maxDurationSeconds)&&selection.duration>item.maxDurationSeconds)return '当前时长不支持尾帧参考承接。';
      if(!Number.isInteger(item.tailReferenceImageLimit)||item.tailReferenceImageLimit<1||count+1>item.tailReferenceImageLimit)return '尾帧占1张参考图名额，与手选资产合计超出上限；未静默丢图。';
      if(Number.isInteger(item.tailReferenceMinImages)&&count+1<item.tailReferenceMinImages)return `当前模型尾帧参考承接至少需要${item.tailReferenceMinImages}张图片，请补选资产参考图。`;
      return '';
    }
    if(item?.firstFrameSupportStatus!=='supported'||item?.supportsFirstFrame!==true)return item?.firstFrameSupportReason||(item?.firstFrameSupportStatus==='unsupported'?'当前模型线路不支持首帧续画。':'当前模型线路的首帧能力尚未确认，暂不可勾选。');
    const rules=item.firstFrameSupportRules;
    if(Array.isArray(rules)){
      const matching=rules.filter(row=>row&&String(row.resolution||'').toLowerCase()===String(selection.resolution||'').toLowerCase()&&Array.isArray(row.durations)&&row.durations.includes(selection.duration));
      if(!matching.length)return '当前清晰度与时长组合尚未确认支持首帧续画。';
      const rule=matching.find(row=>(!Array.isArray(row.referenceImageCounts)||row.referenceImageCounts.includes(count+1))&&Number.isInteger(row.referenceImageLimit)&&row.referenceImageLimit>=count+1&&(!count||row.keepsAssetReferences===true));
      if(!rule)return '当前参考图数量的首帧组合尚未确认支持；未静默丢图。';
      return '';
    }
    if(!Array.isArray(item.firstFrameSupportedDurations)||!item.firstFrameSupportedDurations.includes(selection.duration))return '当前时长不支持首帧续画。';
    if(item.firstFrameSupportedResolutions?.length&&!item.firstFrameSupportedResolutions.map(v=>String(v).toLowerCase()).includes(String(selection.resolution||'').toLowerCase()))return '当前清晰度不支持首帧续画。';
    const limit=item.firstFrameReferenceImageLimit,keeps=item.firstFrameKeepsAssetReferences;
    if(!Number.isInteger(limit)||limit<1||count+1>limit)return '尾帧占1张参考图名额，与手选资产合计超出上限；未静默丢图。';
    if(count&&keeps!==true)return '当前模型线路不能同时使用首帧和资产参考图。';
    return '';
  }
  function tailFrameState239(item,selection={}){
    const nativeIssue=tailFrameCapabilityIssue239(item,'first-frame',selection),referenceIssue=tailFrameCapabilityIssue239(item,'reference',selection);
    // Keep the chosen model/route and all selected assets. Use native only
    // when verified for these exact inputs; otherwise use its ordinary images.
    const mode=!nativeIssue?'first-frame':!referenceIssue||item?.tailReferenceSupported===true?'reference':'first-frame';
    const issue=mode==='reference'?referenceIssue:nativeIssue,cancelled=selection.tailFrameContinuation===true&&!!issue;
    return {mode,issue,nativeIssue,referenceIssue,enabled:selection.tailFrameContinuation===true&&!issue,cancelled,notice:cancelled?'已取消原尾帧承接勾选：'+issue:''};
  }
  function tailFrameLabel242(item,selection={}){
    if(!tailFrameCapabilityIssue239(item,'first-frame',selection))return '原生首帧续画';
    if(item?.tailReferenceSupported===true)return '参考图承接 · 尾帧占1张参考图名额';
    return item?.firstFrameSupportStatus==='unsupported'?'当前线路不支持尾帧承接':'尾帧承接能力待确认';
  }
  function tailFrameUsage242(item,selection={},number=2){
    const selected=selection.referenceAssetIds?.length||0,tail=tailFrameState239(item,selection),count=tail.enabled&&Number(number)!==1?1:0;
    let maximum=item?.referenceImageLimit;
    if(count&&tail.mode==='reference')maximum=item?.tailReferenceImageLimit;
    if(count&&tail.mode==='first-frame'){
      const rule=item?.firstFrameSupportRules?.find(row=>row&&String(row.resolution||'').toLowerCase()===String(selection.resolution||'').toLowerCase()&&row.durations?.includes(selection.duration)&&(!row.referenceImageCounts||row.referenceImageCounts.includes(selected+1))&&(!selected||row.keepsAssetReferences===true)&&row.referenceImageLimit>=selected+1);
      maximum=rule?.referenceImageLimit??item?.firstFrameReferenceImageLimit;
    }
    return {selected,tail:count,total:selected+count,maximum,text:`已选资产 ${selected} 张 + 尾帧 ${count} 张 = 共 ${selected+count} 张${Number.isInteger(maximum)?' / 上限 '+maximum+' 张':''}${Number(number)===1?'（本场首卡不取尾帧）':''}`};
  }
  function tailFrameIssue237(item,selection,number){
    return selection.tailFrameContinuation===true&&number!==1?tailFrameCapabilityIssue239(item,selection.tailFrameMode||'first-frame',selection):'';
  }
  function updateWaitTimes(container=document) {
    for(const node of container.querySelectorAll('[data-video-start]')){
      const start=Number(node.dataset.videoStart),elapsed=Math.max(0,Math.floor((Date.now()-start)/1000));
      if(Number.isFinite(start)&&start>0)node.textContent=`${node.dataset.waitLabel||'已等待'} ${Math.floor(elapsed/60)}分${String(elapsed%60).padStart(2,'0')}秒`;
    }
  }
  function renderMedia(snapshot,segment,number,card,view) {
    const id=segmentId(segment),key=mediaKey(id,number),record=mediaRecord(snapshot,id,number),pending=cardMediaBlocked(view,id,number)||Object.values(view.operations||{}).some(row=>row.kind==='media'&&overlaps(row,id,number)),textPending=textBlocked(view,id,number);
    const saved=view.mediaDrafts?.[key] || {},attrs=`data-segment="${esc(id)}" data-card="${number}"`;
    const ratio=defaultMediaDraft(view.catalog,'video',saved.video,snapshot.settings?.ratio || '16:9').ratio;
    const match=/^(\d{1,2}):(\d{1,2})$/.exec(ratio),width=match?Number(match[1]):16,height=match?Number(match[2]):9;
    const previewStyle=width>0&&height>0?`--preview-ratio:${width}/${height};--preview-width:${360*width/height}px`:'';
    const controls=!view.catalog?'<p class="hint">正在读取视频模型设置；已保存的作品可先查看。</p>':(view.catalogRefreshPending251?'<p class="hint">价格目录待更新，暂显示上次可用配置；提交前会确认后台已发布售价。</p>':'')+['video'].map(action=>{
      const selection=defaultMediaDraft(view.catalog,action,{referenceAssetIds:cardReferenceSelection(snapshot,id,number,card,view,action),...saved[action]},snapshot.settings?.ratio || '16:9',card),routes=mediaRoutes277(view.catalog,action),activeRoute=routes.some(([id])=>id===selection.routeType)?selection.routeType:routes[0]?.[0]||'',list=routeModels234(view.catalog,action,activeRoute),item=list.find(row=>row.model===selection.model),resolutions=mediaResolutions(view.catalog,selection.model,action),ratios=item?.supportedAspectRatios?.length?item.supportedAspectRatios:['16:9','9:16','1:1'],issue=mediaIssue(view.catalog,action,selection,card.durationSeconds,card),disabled=operationBlocked(view,id,number)||quoteBlocked(view,id,number)||pending||textPending;
      const choices=(name,values,selected)=>{
        const missing=name==='model'&&selected&&!values.some(row=>row.model===selected),project=view.catalog?.projectMediaDefaults?.[action],label=project?.model===selected?project.modelName||'项目所选模型':'本卡所选模型';
        return `<select data-media-param="${name}" data-media-action="${action}" ${attrs} ${disabled?'disabled':''}>${missing?`<option value="${esc(selected)}" selected disabled>${esc(label)}（当前不可用，请重新选择）</option>`:''}${values.map(row=>`<option value="${esc(typeof row==='object'?row.model:row)}" ${(typeof row==='object'?row.model:row)===selected?'selected':''}>${esc(typeof row==='object'?(row.displayName||row.model)+(name==='model'&&action==='video'?' · '+tailFrameLabel242(row,selection):''):name==='duration'?row+' 秒':row)}</option>`).join('')}</select>`;
      };
      const duration=selection.duration??mediaGenerationDuration(card),fractional=!Number.isInteger(card.durationSeconds)&&duration===Math.ceil(card.durationSeconds),durationOptions=videoDurationOptions(item),cost=item?mediaCost(view.catalog,selection,duration):null,tailState=tailFrameState239(item,{...selection,duration}),tailIssue=tailFrameIssue237(item,{...selection,duration},number);
      const limit=Number(view.catalog.concurrency?.video?.limit);
      const routeOptions=routes.map(([id,label])=>
        `<option value="${id}" ${activeRoute===id?'selected':''}>${label}</option>`).join('')
        || '<option value="" disabled>暂无已发布线路</option>';
      return `<section class="media-block"><strong>视频 · 本卡 ${esc(card.durationSeconds)} 秒</strong><div class="media-choices"><label>线路<select data-media-param="routeType" data-media-action="${action}" ${attrs} ${disabled?'disabled':''}>${routeOptions}</select></label><label>模型${choices('model',list,selection.model)}</label><label>清晰度${choices('resolution',resolutions,selection.resolution)}</label><label>画幅${choices('ratio',ratios,selection.ratio)}</label><label>生成时长${choices('duration',durationOptions.length?durationOptions:[duration],duration)}</label></div><label class="media-meta"><input type="checkbox" data-media-param="tailFrameContinuation" data-media-action="video" ${attrs} ${tailState.enabled?'checked':''} ${disabled||tailState.issue?'disabled':''}> 尾帧续画 · 自动适配</label><small class="media-meta" data-tail-mode242>${esc(tailFrameLabel242(item,{...selection,duration}))}</small><small class="media-meta" data-tail-slots242>${esc(tailFrameUsage242(item,{...selection,duration},number).text)}</small><small class="media-meta" data-tail-capability role="status">${esc(selection.tailFrameUnavailableReason||tailState.issue|| (tailState.mode==='first-frame'?'固定首帧承接：前卡尾帧直接作为本卡首帧。':'参考图承接：提示词要求以尾帧作为首帧；接口不锁定首帧，实际可能偏差，不能保证首画面完全一致。'))}</small><small class="media-meta">${number===1?'本场首卡按正常方式生成，不从其他场次取画面。':tailState.enabled?'同场前卡完成后本地提取末帧；手选参考图保留，批量按卡顺序生成。'+(tailState.mode==='first-frame'&&item?.firstFrameRequiresImageRatio?' 画幅沿用前卡。':''):'默认关闭；开启后需同场前卡视频已完成。'}</small>${fractional?`<small class="media-meta">原镜头时长不变，末镜既有落幅保持${duration-card.durationSeconds}秒，不增加剧情。</small>`:''}${issue||tailIssue?`<p class="media-error">${esc(issue||tailIssue)}</p>`:''}<div class="media-generate-row"><button type="button" class="primary" data-media-quote="${action}" data-published-credits="${cost===null?'':cost}" ${attrs} ${disabled||issue||tailIssue?'disabled':''}>生成</button><span class="media-cost" aria-live="polite">${item?.pricingMode==='live_quote'?'实时核价 · 生成前确认本卡实际积分':cost===null?'暂无有效积分价格':`生成${esc(duration)}秒 · 预计 ${cost.toFixed(2)} 积分`}</span></div>${Number.isInteger(limit)&&limit>0?`<small class="media-meta" data-video-capacity>本机视频最多 ${limit} 路并发 · 超出排队 · 原任务查询独立</small>`:''}</section>`;
    }).join('');
    const task=view.mediaProgress?.[key]||{},start=view.mediaStarted?.[key]||Number(record.active?.createdAt)*1000;
    const observing=pending&&(!!view.mediaTasks?.[key]&&!['done','error','failed','paused','unknown'].includes(task.state)
      ||Object.values(view.operations||{}).some(row=>['media','observe'].includes(row.kind)&&overlaps(row,id,number)));
    const progress=Number.isFinite(task.progress)?Math.max(0,Math.min(100,task.progress)):null;
    const elapsed=Number.isFinite(start)?Math.max(0,Math.floor((Date.now()-start)/1000)):null;
    const queueLimit=Number(task.concurrencyLimit||task.concurrency?.limit),atLimit=task.state==='queued'&&(task.concurrency?.atLimit===true||String(task.message||'').includes('并发上限'));
    const missing=record.active?.lookupStatus==='not_found',waitLabel=task.state==='queued'?'原任务累计等待':'已等待';
    const queueStart=Number(task.createdAt)*1000;
    const wait=observing?`<div class="video-generation-overlay" role="status"><span class="video-generation-spinner" aria-label="生成中"></span><span ${atLimit?'data-media-queue-notice':''}>${atLimit?`已达到 ${queueLimit||20} 路并发上限，本卡排队中`:task.state==='queued'?'已排队，等待空闲生成位':'正在查询原视频任务'}${progress===null?'':` · ${Math.round(progress)}%`}</span>${progress===null?'':`<progress max="100" value="${progress}" aria-label="当前查询阶段"></progress>`}<small data-video-start="${Number.isFinite(start)?start:''}" data-wait-label="${waitLabel}">${elapsed!==null?`${waitLabel} ${Math.floor(elapsed/60)}分${String(elapsed%60).padStart(2,'0')}秒`:'等待原任务返回'}</small>${task.state==='queued'&&Number.isFinite(queueStart)&&queueStart>0?`<small data-video-start="${queueStart}" data-wait-label="本次本地排队"></small>`:''}</div>`:pending?`<div class="video-generation-overlay video-observation-paused" role="status"><strong>${missing?'未找到原订单，等待核对':record.active?.status==='needs_review'||['error','failed','paused'].includes(task.state)?'本机查询已暂停':'原任务已保留，等待接回'}</strong><small>${missing&&!record.active?.taskId?'本地没有上游任务编号，不能确认已完成；原记录保留，未重新生成。':'上游结果待核对；可查询原任务，或解除本机等待后重新核价。'}</small></div>`:'';
    const video=mediaUrl(snapshot.projectId,record.videoFile,'video'),poster=video?`/api/visual/video-preview?projectId=${encodeURIComponent(snapshot.projectId)}&file=${encodeURIComponent(record.videoFile)}`:'',output=`<div class="media-output">${video?`<figure><video controls controlslist="nodownload" preload="metadata" poster="${esc(poster)}" src="${esc(video)}" aria-label="本卡视频播放器"></video></figure>`:'<div class="video-preview-placeholder" aria-label="视频播放区域"><span aria-hidden="true">▷</span></div>'}${wait}</div>${video?`<div class="media-download-row"><a data-macro-download href="${esc(downloadUrl(snapshot.projectId,record.videoFile,'video',`场次-${id}-卡${number}.mp4`))}" download="场次-${esc(id)}-卡${number}.mp4">↓ 下载视频</a></div>`:''}`;
    const history=(record.history||[]).map((row,index)=>{const kind=row.action||row.kind,action=kind==='frame'?'frame':kind==='video'?'video':null,url=action?mediaUrl(snapshot.projectId,row.file,action):'',historyPoster=url&&action==='video'?`/api/visual/video-preview?projectId=${encodeURIComponent(snapshot.projectId)}&file=${encodeURIComponent(row.file)}`:'',name=`场次-${id}-卡${number}-版本${index+1}.${action==='frame'?'jpg':'mp4'}`,meta=`${row.modelName||'模型未记录'} · ${row.durationSeconds??row.duration??'—'}秒 · ${row.resolution||''} · ${ratioLabel(row.ratio)} · ${row.createdAt||''} · 实扣 ${row.chargedPoints??'待核对'} 积分`;return `<article><p class="media-meta">${esc(meta)}</p>${url?(action==='frame'?`<img loading="lazy" src="${esc(url)}" alt="历史首帧">`:`<video controls controlslist="nodownload" preload="none" poster="${esc(historyPoster)}" src="${esc(url)}" aria-label="历史视频播放器"></video>`):'<p>没有可显示的真实媒体文件。</p>'}${url?`<div class="media-download-row"><a data-macro-download href="${esc(downloadUrl(snapshot.projectId,row.file,action,name))}" download="${esc(name)}">下载此版本</a></div>`:''}</article>`;}).join('');
    const requestId=String(record.active?.requestId||''),detach=pending&&requestId?`<button type="button" class="secondary media-detach-button" data-media-detach data-request-id="${esc(requestId)}" ${attrs} ${view.busy?'disabled':''} title="只解除本机等待，不会取消或退款上游任务">解除卡死</button>`:'';
    return `<section class="media-panel" style="${previewStyle}" ${attrs}><h4>视频</h4>${output}${pending?`<div class="media-task-actions"><button type="button" class="secondary" data-media-observe ${attrs} ${view.busy?'disabled':''}>查询原任务</button>${detach}</div>`:''}${record.active?.error&&!observing?`<p class="media-error">${esc(record.active.error)}</p>`:''}${controls}${history?`<details class="media-history"><summary>本卡媒体历史（${record.history.length}）</summary>${history}</details>`:''}</section>`;
  }
  function renderReferences(snapshot,segment,number,card,view,complete) {
    const id=segmentId(segment),action='video',key=mediaKey(id,number),ready=(view?.catalog?.assets || []).filter(row=>row.imageReady),record=mediaRecord(snapshot,id,number);
    const selection=defaultMediaDraft(view?.catalog,action,{referenceAssetIds:cardReferenceSelection(snapshot,id,number,card,view,action),...view?.mediaDrafts?.[key]?.video},snapshot.settings?.ratio || '16:9');
    const catalogAssets=new Map((view?.catalog?.assets || []).map(row=>[row.id,row]));
    const assets=[...ready,...selection.referenceAssetIds.filter(id=>!ready.some(row=>row.id===id)).map(id=>catalogAssets.get(id)||{id,name:id,kind:'',imageReady:false})];
    const model=mediaModels(view?.catalog,action).find(row=>row.model===selection.model),usage=tailFrameUsage242(model,selection,number),maximum=Number.isInteger(usage.maximum)?usage.maximum:null;
    const disabled=!complete || quoteBlocked(view,id,number) || operationBlocked(view,id,number) || textBlocked(view,id,number) || cardMediaBlocked(view,id,number) || !snapshot.repeatableActions&&!savedCardActionsAvailable(snapshot)&&snapshot.sourceEpochMatches===false;
    const attrs=`data-segment="${esc(id)}" data-card="${number}"`;
    return `<details class="media-reference-picker card-reference-section" data-reference-key="${esc(JSON.stringify([id,number,action]))}"><summary><strong>本卡参考图</strong><span class="reference-count">共 ${assets.length} 张 · 已选 ${selection.referenceAssetIds.length} 张${usage.tail?' + 尾帧 1 张 = 共 '+usage.total+' 张':''}${maximum===null?'':' · 本卡模型最多 '+maximum+' 张'}</span><span class="reference-expand-label">展开参考图</span><span class="reference-collapse-label">收起参考图</span></summary><div class="reference-controls"><button type="button" data-macro-upload ${attrs} ${disabled?'disabled':''}>上传外部参考图</button><input type="file" data-macro-reference-file ${attrs} accept="image/png,image/jpeg,image/webp" hidden><small class="reference-upload-status" role="status"></small></div><div class="media-references">${assets.map(row=>`<label><input type="checkbox" data-media-param="reference" data-media-action="video" value="${esc(row.id)}" ${attrs} ${selection.referenceAssetIds.includes(row.id)?'checked':''} ${disabled?'disabled':''}>${row.imageFile?`<img src="${esc(mediaUrl(snapshot.projectId,row.imageFile,'frame'))}" alt="" loading="lazy">`:''}<span class="reference-name" title="${esc(row.name)}">${esc(row.externalReference?'外部':{people:'人物',scenes:'场景',props:'物品'}[row.kind] || row.kind)}·${esc(row.name)}${row.imageReady?'':'（无可用图片，可取消）'}</span>${row.externalReference?`<button type="button" class="reference-delete" data-reference-delete="${esc(row.id)}" ${attrs} aria-label="删除外部参考图 ${esc(row.name)}" ${disabled?'disabled':''}>×</button>`:''}</label>`).join('') || '<span class="media-meta">当前项目暂无已生成参考图。</span>'}</div></details>`;
  }
  function readCards(result) {
    if (!result || typeof result !== 'object') return [];
    if (Array.isArray(result.cards)) return result.cards;
    if (Array.isArray(result.episodes) && result.episodes.length) return result.episodes.map(episode => {
      const cut = (result.cuts || []).find(row => row.number === episode.number) || {};
      return {...cut,...episode,shots:episode.shots || episode.directorGuide?.shots || []};
    });
    return Array.isArray(result.cuts) ? result.cuts : [];
  }
  const sceneCardCache=new WeakMap();
  function readSceneCards(snapshot, segment) {
    const id=segmentId(segment), result=snapshot?.segments?.[id]?.result;
    const cache=sceneCardCache.get(snapshot)?.get(id),edits=snapshot.sourceEdits?.[id],regenerations=snapshot.cardRegenerations?.[id],adoptions=snapshot.skillAdoptions?.[id];
    if(cache&&cache.segment===segment&&cache.result===result&&cache.edits===edits&&cache.regenerations===regenerations&&cache.adoptions===adoptions)return cache.cards;
    const complete = readCards(result), cards=complete.length?complete:Array.isArray(segment?.cardPlans)?segment.cardPlans:[];
    const rendered=cards.map((card,index)=>{
      const number=card.number || index+1, edit=snapshot.sourceEdits?.[id]?.[String(number)];
      const originalSourceText=card.sourceText;
      const currentSourceText=edit?.sourceText ?? originalSourceText;
      const sceneStart=Number.isInteger(segment?.sourceStart)?segment.sourceStart:card.sourceStart;
      const heading=number===1?(snapshot?.plan?.scenePlan?.provenance?.headings || []).find(row=>row.sourceStart===sceneStart):null;
      let sourcePrefix='';
      if(typeof heading?.originalHeading==='string' && originalSourceText?.startsWith(heading.originalHeading)){
        let end=heading.originalHeading.length;
        while(end<originalSourceText.length && (originalSourceText[end]==='\r'||originalSourceText[end]==='\n'))end++;
        sourcePrefix=originalSourceText.slice(0,end);
        if(!currentSourceText.startsWith(sourcePrefix))sourcePrefix='';
      }
      const regeneration=snapshot.cardRegenerations?.[id]?.[String(number)]?.result;
      const updated=regeneration ? readCards(regeneration)[0] : null;
      // Server returns an exact digest to compare, without estimating cards.
      const matches=!!regeneration && (!edit ? regeneration.sourceEditRevision===0 : regeneration.sourceEditRevision===edit.revision);
      const storyboardStale=!!edit&&!matches;
      const adopted=adoptions?.[String(number)],adoptionCurrent=typeof adopted?.prompt==='string'&&!!adopted.prompt.trim()&&(!adopted.sourceText||adopted.sourceText===currentSourceText);
      return {...card,...(updated || {}),number,originalSourceText,
        sourceText:currentSourceText,sourcePrefix,displayText:sourcePrefix?currentSourceText.slice(sourcePrefix.length):currentSourceText,storyboardStale,
        complete:!storyboardStale && (!!updated || result?.complete===true || result?.progressive228===true&&card.complete===true),
        regenerationHash:regeneration?.rawResponseHash || '',previewOnly:!updated&&!complete.length,
        ...(adoptionCurrent?{storyboard:adopted.prompt,shots:[],directorGuide:null,skillAdoptionId:adopted.id||adopted.comparisonId,storyboardStale:false,complete:true,previewOnly:false,referenceAssetIds:adopted.referenceAssetIds??updated?.referenceAssetIds??card.referenceAssetIds}: {})};
    });
    if(!sceneCardCache.has(snapshot))sceneCardCache.set(snapshot,new Map());
    sceneCardCache.get(snapshot).set(id,{segment,result,edits,regenerations,adoptions,cards:rendered});
    return rendered;
  }
  function cardIdentity228(snapshot,id,number){
    const scene=segments(snapshot).find(row=>segmentId(row)===id),card=readSceneCards(snapshot,scene||{}).find((row,index)=>Number(row.number||index+1)===Number(number));
    if(typeof card?.cardHash228!=='string'||!card.cardHash228)return '';
    return JSON.stringify([snapshot.projectId||'',snapshot.revisionId||'',id,Number(number),card.cardHash228,card.regenerationHash||'']);
  }
  function cardPrompt(card) {
    if (typeof card.storyboard==='string' && card.storyboard.includes('【镜头】') && card.storyboard.includes('【画面】')) return card.storyboard;
    const shots = Array.isArray(card.shots) ? card.shots : card.directorGuide?.shots || [];
    if (!shots.length) return String(card.storyboard || '');
    let cursor = 0;
    const lines = shots.map((shot,index) => {
      const start = Number.isFinite(shot.start) ? shot.start : cursor;
      const end = Number.isFinite(shot.end) ? shot.end : start + Number(shot.durationSeconds || 0); cursor = end;
      const camera = [shot.framing,shot.angle,shot.movement,shot.focalLength || shot.lens,shot.depthOfField,shot.speed,shot.camera].filter(Boolean).join('，');
      let text = `镜头${index+1} · ${seconds(end-start)}s：`;
      if (camera) text += `【镜头】${camera}。`;
      if (shot.focusStart) text += `起幅：${shot.focusStart}。`;
      if (shot.focusEnd) text += `落点：${shot.focusEnd}。`;
      if (shot.action) text += `【画面】${shot.action}`;
      if (shot.lighting) text += `光线：${shot.lighting}。`;
      if (shot.performance) text += `【表演】${shot.performance}`;
      if (shot.sound) text += `【声音】${shot.sound}`;
      for (const line of (shot.dialogue || [])) {
        text += `【台词】${line.speaker || '原稿未明确说话人'}${line.delivery ? '（'+line.delivery+'）' : ''}${line.voiceover === true || line.offscreen === true ? '（画外声）' : ''}说：「${line.text}」`;
      }
      return text;
    });
    const landing = card.landing || card.endingState || card.continuity?.landing || card.continuity?.endState || card.directorGuide?.landing || card.directorGuide?.endingState || card.directorGuide?.continuity?.landing;
    if (landing) lines.push('落幅：'+landing);
    return lines.join('\n\n');
  }
  function renderStyle(presentation) {
    if (!presentation || !presentation.name && !presentation.rules) return '';
    const thumbnail = typeof presentation.thumbnailUrl === 'string' && (/^\/(?!\/)/.test(presentation.thumbnailUrl) || /^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(presentation.thumbnailUrl)) ? presentation.thumbnailUrl : '';
    const local=Math.max(0,Math.min(11,Number(presentation.previewIndex)||0))%6;
    const sprite=presentation.thumbnailSprite===true && ['/static/style-previews.png','/static/style-previews-2.png'].includes(thumbnail);
    const preview=sprite ? `<span class="style-sprite-thumbnail" role="img" aria-label="${esc(presentation.name || '当前画面风格')}缩略图" style="background-image:url('${thumbnail}');background-position:${local%3*50}% ${local<3?12.5:87.5}%"></span>` : thumbnail ? `<img src="${esc(thumbnail)}" alt="${esc(presentation.name || '当前画面风格')}缩略图" loading="lazy">` : '<span class="style-thumbnail-placeholder" title="未设置风格缩略图" aria-hidden="true">▧</span>';
    return `<details class="card-style"><summary>${preview}<span>画面风格：${esc(presentation.name || '项目自定义风格')}</span><span class="style-expand-label">查看规则</span></summary><div class="card-style-rules">${esc(presentation.rules || '当前项目没有保存风格规则。')}${presentation.negative ? '<p>避免：'+esc(presentation.negative)+'</p>' : ''}</div></details>`;
  }
  function renderShot(shot, index, cursor) {
    const start = Number.isFinite(shot.start) ? shot.start : cursor;
    const end = Number.isFinite(shot.end) ? shot.end : start + Number(shot.durationSeconds || 0);
    const dialogue = Array.isArray(shot.dialogue) ? shot.dialogue : [];
    let html = `<div class="shot"><div class="shot-time">镜头 ${index + 1} · ${seconds(start)}—${seconds(end)} 秒</div>`;
    for (const [key,label] of [['framing','景别'],['movement','运镜'],['action','画面'],['camera','镜头调度'],['performance','表演'],['sound','声音']]) {
      if (shot[key]) html += `<p>${label}：${esc(shot[key])}</p>`;
    }
    html += dialogue.length ? dialogue.map(line => `<div class="dialogue"><span class="voice">${esc(line.speaker || '原稿未明确说话人')} · ${line.voiceover === true ? '画外声／录音等原声源' : line.voiceover === false ? '现场声' : '声源未明确'}${line.offscreen === true ? ' · 本镜未出镜' : ''}</span><p>${esc(line.text)}</p>${line.delivery ? `<p>${esc(line.delivery)}</p>` : ''}</div>`).join('') : '<p class="voice">本镜无对白</p>';
    return {html:html + '</div>',end};
  }
  // Compare rendered templates rather than live HTML: rich editors and ratio
  // pickers own additional DOM. A progress poll must not replace that DOM,
  // otherwise selection, internal scroll positions and playback are lost.
  const mediaNodes231=new WeakMap();
  const playerKey231=node=>node?.tagName==='VIDEO'&&node.getAttribute('aria-label')==='本卡视频播放器'&&node.getAttribute('src')?JSON.stringify([node.getAttribute('src'),node.getAttribute('poster')||'']):'';
  function releasePlayer231(node){try{node.pause();node.removeAttribute('src');node.removeAttribute('poster');node.load();}catch(_){}}
  function clearMediaCache231(container){const cache=mediaNodes231.get(container);if(cache)for(const node of cache.values())releasePlayer231(node);mediaNodes231.delete(container);}
  function reconcileCards(container, html) {
    // Minimal controller simulations have no DOM. The production path always
    // uses native document/createElement and the stable keyed reconciliation.
    if(!container.ownerDocument?.createElement){if(container.innerHTML!==html)container.innerHTML=html;return;}
    // Keep a small, bounded set of native players when moving between cards.
    // Recreating the same element discards decoded metadata and buffered video.
    const cache=mediaNodes231.get(container)||new Map();mediaNodes231.set(container,cache);
    const previousPlayers=Array.from(container.querySelectorAll?.('video[aria-label="本卡视频播放器"]')||[]);
    for(const node of previousPlayers){const token=playerKey231(node);if(token)cache.set(token,node);}
    const template=container.ownerDocument.createElement('template');template.innerHTML=html;
    const signature=node=>node.nodeType===1?node.outerHTML:node.textContent;
    const key=node=>node.nodeType!==1?'#'+node.nodeType:node.tagName+'|'+['class','data-segment','data-card','data-inline-action','data-media-param','data-media-quote','data-reference-key','data-reference-delete','value'].map(name=>node._macroAttributes?node._macroAttributes[name]||'':node.getAttribute(name)||'').join('|');
    function remember(node){node._macroTemplate=signature(node);node._macroAttributes=node.nodeType===1?Object.fromEntries(Array.from(node.attributes,item=>[item.name,item.value])):{};node._macroChildren=Array.from(node.childNodes);for(const child of node._macroChildren)remember(child);return node;}
    function patch(old,next){
      const nextSignature=signature(next);if(old._macroTemplate===nextSignature)return;
      if(old.nodeType!==1){if(old.textContent!==next.textContent)old.textContent=next.textContent;old._macroTemplate=nextSignature;return;}
      const previous=old._macroAttributes||{},attributes=Object.fromEntries(Array.from(next.attributes,item=>[item.name,item.value]));
      for(const name of Object.keys(previous))if(!(name in attributes)&&name!=='open')old.removeAttribute(name);
      for(const [name,value]of Object.entries(attributes))if(previous[name]!==value&&old.getAttribute(name)!==value)old.setAttribute(name,value);
      old._macroAttributes=attributes;
      if(old.tagName==='INPUT'&&previous.checked!==attributes.checked)old.checked='checked'in attributes;
      if(old.tagName==='OPTION'&&previous.selected!==attributes.selected)old.selected='selected'in attributes;
      if(next.childNodes.length===1&&next.firstChild.nodeType===3&&old._macroChildren?.some(node=>node.parentNode!==old)){
        // Components can update small labels via textContent, which replaces
        // the label's text node. Reconcile that current leaf, not its detached
        // original text node; never use this path for rich editable children.
        if(old.textContent!==next.textContent)old.textContent=next.textContent;
        old._macroChildren=Array.from(old.childNodes);for(const node of old._macroChildren)remember(node);
      }else children(old,next);old._macroTemplate=nextSignature;
    }
    function children(parent,next){
      const before=parent._macroChildren||Array.from(parent.childNodes),used=new Set(),after=[];
      for(const wanted of Array.from(next.childNodes)){
        let live=before.find(node=>!used.has(node)&&key(node)===key(wanted));
        if(live){used.add(live);patch(live,wanted);}
        else{live=remember(wanted.cloneNode(true));const nextLive=before.find(node=>!used.has(node)&&node.parentNode===parent);parent.insertBefore(live,nextLive||null);}
        after.push(live);
      }
      for(const old of before)if(!used.has(old)&&!after.includes(old)&&old.parentNode===parent)old.remove();
      // Only reorder template children which still belong to this parent.
      let anchor=null;for(let i=after.length-1;i>=0;i--){const node=after[i];if(node.parentNode!==parent)continue;if(anchor&&node.nextSibling!==anchor&&after.includes(node.nextSibling))parent.insertBefore(node,anchor);anchor=node;}
      parent._macroChildren=after;
    }
    children(container,template.content);
    for(const [token,node]of cache)if(playerKey231(node)!==token)cache.delete(token);
    for(const node of previousPlayers)if(!container.contains(node))try{node.pause();}catch(_){}
    for(const next of Array.from(container.querySelectorAll?.('video[aria-label="本卡视频播放器"]')||[])){
      const token=playerKey231(next);if(!token)continue;
      const saved=cache.get(token);let live=next;
      if(saved&&saved!==next&&!saved.isConnected){
        patch(saved,next);const parent=next.parentNode;next.replaceWith(saved);
        if(parent?._macroChildren)parent._macroChildren=parent._macroChildren.map(node=>node===next?saved:node);
        live=saved;
      }
      cache.delete(token);cache.set(token,live);
    }
    for(const [token,node]of cache){if(cache.size<=6)break;if(container.contains(node))continue;releasePlayer231(node);cache.delete(token);}
  }
  function returnedContent(row){const value=row?.returnedContent;return value&&typeof value==='object'&&typeof value.rawResponse==='string'?value:null;}
  function sceneIssueMessage(snapshot,id){
    const issue=snapshot?.sceneIssues223?.[id];
    const planned=snapshot?.plan?.segments?.find(row=>segmentId(row)===id);
    const hasCards=readCards(snapshot?.segments?.[id]?.result).length||planned?.cardPlans?.length;
    const result=snapshot?.segments?.[id]?.result,unfinishedPrefix=result?.progressive228===true&&result.complete!==true;
    if(unfinishedPrefix&&typeof issue?.message==='string')return issue.code==='pending_return'?'本场还有未返回的分镜；已形成的视频卡可以继续使用，其余内容待继续。':'已形成的视频卡仍保留。'+issue.message;
    return !hasCards&&typeof issue?.message==='string'?issue.message:'';
  }
  function sceneStatusNotice(snapshot,id,message){
    if(!snapshot?.shotFirst||snapshot.sourceEpochMatches===false||!id||id==='all')return '';
    const previousPartial=String(snapshot.lastError||'').includes('部分场次未完成')
        &&String(message||'').startsWith('上次未完成：');
    const record=snapshot.segments?.[id],state=snapshot.sceneProgress278?.[id]?.state;
    if(previousPartial&&record?.status==='completed'&&record.result?.complete&&record.result.cards?.length)
      return '本集分镜已完成，可直接编辑或生成视频。';
    if(!previousPartial&&(snapshot.lastError||message))return '';
    if(state==='unsubmitted')return '本场尚未提交补齐分镜。';
    if(state==='waiting_submission')return '本场尚未发出分镜请求。';
    return '';
  }
  function renderStoryboardChecks(warnings=[],details=[]){
    const unique=rows=>[...new Map(rows.map(row=>[JSON.stringify(row),row])).values()];
    warnings=unique(warnings);details=unique(details);
    const labels={framing:'景别与构图',angle:'拍摄角度',movement:'运镜',lighting:'光线',performance:'表演',sound:'声音',continuity:'衔接',endingState:'结束状态',boundary:'镜头切点',delivery:'对白表演'};
    const groups=new Map();
    for(const row of details){const missing=row.code==='OPTIONAL_DETAIL_UNAVAILABLE',message=row.message||(missing?`${labels[row.field]||row.field||'拍摄说明'}尚未完整提供，可编辑补充。`:String(row.field||row));const key=[row.code||'',message].join(':');if(!groups.has(key))groups.set(key,{message,count:0,missing});groups.get(key).count++;}
    const missing=[...groups.values()].some(row=>row.missing);
    const unresolved=details.some(row=>row.code==='ASSET_REFERENCE_UNRESOLVED');
    const detailHeading=unresolved?'分镜核对提示 · 有资产引用待补选':missing?'分镜核对提示 · 有拍摄说明待补充':'分镜核对提示 · 对白、时长或切点待核对';
    return (warnings.length?`<details class="storyboard-audit"><summary>分镜检查提示 · ${warnings.length} 项对白待核对（不拦截返回内容）</summary>${warnings.map(row=>`<p>${esc(row.message||row)}</p>${row.sourceText?`<p><b>原文：</b>${esc(row.sourceText)}</p>`:''}${row.returnedText?`<p><b>返回：</b>${esc(row.returnedText)}</p>`:''}`).join('')}</details>`:'')+(groups.size?`<details class="storyboard-detail-notice"><summary>${detailHeading}</summary><p>${missing?'模型返回的部分拍摄字段不完整，已保留原分镜，未自动编造。':'以下为模型返回内容的核对提醒，可在分镜框内编辑。'}</p>${[...groups.values()].map(row=>`<p>${esc(row.message)}${row.count>1?`（${row.count}处）`:''}</p>`).join('')}</details>`:'');
  }
  function sceneVideoPlan230(view,id){
    const snapshot=view.snapshot||{},scene=segments(snapshot).find(row=>segmentId(row)===id);
    if(!scene)throw Error('请先选择当前场次，不能批量生成其他场次。');
    const cards=readSceneCards(snapshot,scene),ready=[],skipped=[];
    for(const [index,card]of cards.entries()){
      const number=Number(card.number||index+1),record=mediaRecord(snapshot,id,number);
      let reason='';
      if(!cardComplete(card))reason='分镜未就绪';
      else if(record.videoFile||(record.history||[]).some(row=>(row.action||row.kind)==='video'&&row.file))reason='已有视频';
      else if(view.mediaUnknown?.[mediaKey(id,number)]||[...Object.values(record.activeTasks||{}),record.active].some(row=>row&&Object.keys(row).length&&!['completed','refunded','not_submitted','failed','cancelled','detached'].includes(row.status)))reason='原任务执行中或待核对';
      else if(cardMediaBlocked(view,id,number)||operationBlocked(view,id,number)||textBlocked(view,id,number))reason='原任务执行中或待核对';
      else{const choice=defaultMediaDraft(view.catalog,'video',{referenceAssetIds:cardReferenceSelection(snapshot,id,number,card,view),...view.mediaDrafts?.[mediaKey(id,number)]?.video},snapshot.settings?.ratio||'16:9',card);reason=mediaIssue(view.catalog,'video',choice,card.durationSeconds,card);}
      if(reason)skipped.push({cardNumber:number,reason});else ready.push(number);
    }
    return {segmentId:id,title:scene.title||'当前场次',cardNumbers:ready,skipped,totalCards:cards.length,
      sceneComplete:!(snapshot.plan?.pendingSceneIds||[]).includes(id)};
  }
  function renderReturnedContent(value,prior=false){
    if(!value||typeof value.rawResponse!=='string')return '';
    const preview=typeof value.previewStoryboard==='string'?value.previewStoryboard:'';
    return `<section class="storyboard-return" data-returned-content role="status"><h4>已返回，尚未转为视频卡</h4><p>${preview?'以下是模型分镜的只读预览，不是已保存的视频生成输入。':'模型原文已保留在下方，本次返回尚未形成可生成视频的分镜卡。'}${prior?' 下方保留上次已保存的分镜与视频，本次返回未替换它们。':''} 不会自动重新调用或继续收费。</p>${value.billingState==='unknown'?'<p>旧订单仍待核对；本次只读取已保存内容，没有新增扣费。</p>':''}${value.validationError?`<details class="storyboard-audit"><summary>分镜检查提示（不拦截返回内容）</summary><p>${esc(value.validationError)}</p></details>`:''}${renderStoryboardChecks(Array.isArray(value.speechValidationWarnings)?value.speechValidationWarnings:[],Array.isArray(value.detailDiagnostics)?value.detailDiagnostics:[])}${preview?`<div data-returned-preview><h5>可读分镜预览 · 只读</h5><pre style="max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">${esc(preview)}</pre></div>`:''}<details ${preview?'':'open'}><summary>查看模型原返回（仅本地读取，未新增调用）</summary><pre style="max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">${esc(value.rawResponse)}</pre></details></section>`;
  }
  function renderCards(snapshot, filter, view) {
    rememberDownloadModule227(snapshot);
    const chosen = segments(snapshot).filter(segment => filter === 'all' || segmentId(segment) === filter);
    const html = [];
    for (const [sceneIndex,segment] of segments(snapshot).entries()) {
      if (!chosen.includes(segment)) continue;
      const record = snapshot.segments?.[segmentId(segment)] || {};
      const result = record.result;
      const cards = readSceneCards(snapshot,segment);
      const externalReturn=view?.pipelineReturn;
      const ownedReturn=externalReturn&&(!externalReturn._snapshotIdentity||externalReturn._snapshotIdentity===pipelineReturnIdentity(snapshot))&&(externalReturn.scope||[]).some(row=>row.sceneId===segmentId(segment))?externalReturn:null;
      const sceneReturn=ownedReturn||returnedContent(record);
      // Raw returns remain in saved history. Keep the video-card body focused
      // on the editable execution prompt, rather than a second return panel.
      if (!cards.length && segment.sourceText) {
        const running=snapshotTextInFlight(snapshot)||Object.values(view?.textTasks||{}).some(textTaskInFlight);
        if(sceneReturn){
          const id=segmentId(segment),hash=sceneReturn.rawResponseHash||'',slot=sceneReturn.sceneEditors?.[id]||{},saved=slot.savedDraft||{},key=JSON.stringify([id,hash]);
          const text=view?.returnEdits?.[key]??saved.text??slot.text??sceneReturn.previewStoryboard??sceneReturn.rawResponse??'';
          const emptyReturn=slot.emptyShots===true&&!String(text).trim();
          html.push(`<article class="video-card scene-return-editor" data-segment="${esc(id)}"><div class="card-heading"><h3>第 ${sceneIndex+1} 集 · 分镜内容</h3><span>${emptyReturn?'未生成镜头':'已返回 · 可编辑'}</span></div><div class="shot-list"><div class="storyboard-editor-toolbar"><strong>分镜内容</strong><button type="button" data-return-save data-segment="${esc(id)}" data-return-hash="${esc(hash)}" data-draft-revision="${Number(saved.revision||0)}" ${hash?'':'disabled'}>保存</button></div><textarea class="storyboard-return-editor" data-return-editor data-segment="${esc(id)}" data-return-hash="${esc(hash)}" data-reference-key="${esc(hash)}" aria-label="本集分镜内容" placeholder="${emptyReturn?'本次模型未生成任何镜头。原返回已保留，可重新补齐本场分镜。':''}" style="width:100%;min-height:360px;resize:vertical;box-sizing:border-box">${esc(text)}</textarea><small>${emptyReturn?'本次没有可组卡的镜头，原返回仍可在历史中查看。':'本集返回尚未完成自动组卡，编辑内容可单独保存。'}</small></div></article>`);
          continue;
        }
        html.push(`<article class="video-card scene-source-preview" data-segment="${esc(segmentId(segment))}"><div class="card-heading"><h3>第 ${sceneIndex+1} 场</h3><span>${sceneReturn?'模型已返回，尚未转为视频卡':snapshot.shotFirst?'本场镜头尚未返回，卡数未确定':'历史场次尚未保存逐卡切割，卡数未确定'}</span></div><details class="card-source-panel" data-source-panel data-source-key="${esc(JSON.stringify([segmentId(segment),'scene']))}"><summary><span class="source-expand-label">查看原文</span><span class="source-collapse-label">收起原文</span></summary><div class="card-source">${esc(segment.sourceText)}</div></details><p class="empty">${sceneReturn?'完整原返回已保留，可通过“查看最近原返回”读取。':snapshot.shotFirst?(running?'后台编排中；其他已返回场次可先操作。':'尚未生成本集分镜，可补齐当前集或整部剧。'):'待补齐本场次分镜；原文已保留，不用空白卡冒充切割结果。'}</p></article>`);
      }
      for (const [index,card] of cards.entries()) {
        const number = card.number || index+1;
        // The inline workspace opts into one selected card. Other consumers
        // retain their existing full-card list unless they pass this map.
        const selectedNumber=view?.activeCardNumbers?.[segmentId(segment)];
        if(selectedNumber!==undefined&&Number(number)!==Number(selectedNumber))continue;
        const prompt = cardPrompt(card), complete = card.complete!==false && !card.storyboardStale && (card.complete===true || result?.complete === true) && !!prompt;
        const navigation=selectedNumber!==undefined&&view?.cardNavigation;
        const panelAttrs=navigation?` id="${esc(navigation.panelId(segmentId(segment),number))}" role="tabpanel" aria-labelledby="${esc(navigation.tabId(segmentId(segment),number))}"`:'';
        const draft = snapshot.cardDrafts?.[segmentId(segment)]?.[String(number)];
        const id=segmentId(segment), work=cardTextWork(view,id,number), blocked=quoteBlocked(view,id,number) || operationBlocked(view,id,number) || textBlocked(view,id,number) || cardMediaBlocked(view,id,number) || !snapshot.repeatableActions&&!savedCardActionsAvailable(snapshot)&&snapshot.sourceEpochMatches===false;
        const regenerateUncertain=directRegenerationBlocked(view,id,number);
        const recovery=cardRecoveryState(view,id,number),checking=recovery.uncertain||recovery.running.length>0;
        const regenerate=`<button type="button" class="primary card-regenerate-button" data-card-regenerate data-segment="${esc(id)}" data-card="${number}" ${blocked||regenerateUncertain?'disabled':''}>重新生成</button>`
          +(checking?`<button type="button" class="secondary card-recovery-button" data-card-recover data-segment="${esc(id)}" data-card="${number}" ${operationBlocked(view,id,number)?'disabled':''} title="只查询本卡关联的原任务和旧订单，不重新调用模型、不新增扣费">${recovery.uncertain?'核对旧单'+(recovery.pending.length?'（'+recovery.pending.length+'）':''):'查询状态'}</button>`:'');
        const cardError=snapshot.cardRegenerations?.[id]?.[String(number)]?.error;
        const errorHTML=cardError ? `<div class="card-regeneration-error" role="alert">${typeof globalThis.ModelActivity?.markup==='function'?globalThis.ModelActivity.markup('error',String(cardError)):'<span>本卡补齐未完成：'+esc(cardError)+'</span>'}</div>` : '';
        const warnings=Array.isArray(card.speechValidationWarnings)?card.speechValidationWarnings:[];
        const details=Array.isArray(card.detailDiagnostics)?card.detailDiagnostics:[];
        const warningHTML=renderStoryboardChecks(warnings,details);
        const returnHTML=''; // 完整原返回保留在场次记录中，原记录不删除。
        const pendingHTML='<p class="card-recovery-note">重新生成将发起新调用并正常计费；旧单独立保留。</p>'+(work?`<div class="card-text-wait" role="status" aria-live="polite" data-card-text-pending data-card-text-phase="${esc(work.phase||'preparing')}">${work.animate===false?'':'<i class="video-generation-spinner" aria-hidden="true"></i>'}<div><strong>${esc(textWorkTitle(work))}</strong><small>${esc(work.message||'本卡独立处理中，其他卡片可继续操作。')}${complete?' · 下方暂保留上次已保存的分镜，本次新结果尚未替换。':''}</small></div></div>`:'');
        html.push(`<article class="video-card" data-segment="${esc(id)}" data-card="${number}"${panelAttrs}><div class="card-heading"><h3>${navigation?'视频卡 '+number:'第 '+(sceneIndex+1)+' 场 · 卡 '+number} · ${esc(card.durationSeconds)} 秒</h3><span>${card.storyboardStale?'原文已修改，待重新补齐本卡分镜':complete ? '分镜已保存' : '待补齐分镜'}</span></div>${typeof card.sourceText==='string' ? `<details class="card-source-panel" data-source-panel data-source-key="${esc(JSON.stringify([id,number]))}"><summary><span class="source-expand-label">查看原文</span><span class="source-collapse-label">收起原文</span><span class="source-dirty-label" data-source-dirty hidden>有未保存修改</span></summary><section data-source-editor data-segment="${esc(id)}" data-card="${number}"><h4>本卡原文</h4><div class="card-source">${esc(card.sourceText)}</div></section></details>` : ''}<section class="shot-list">${errorHTML}${warningHTML}${returnHTML}${renderStyle(snapshot.stylePresentation)}${pendingHTML}<div class="storyboard-panel-head"><h4>视频描述词</h4>${regenerate}</div>${complete ? `<div class="macro-card-editor" data-prompt-editor data-segment="${esc(id)}" data-card="${number}"><div class="plain-storyboard" tabindex="0">${esc(draft?.prompt ?? prompt)}</div></div>` : '<div class="storyboard-pending empty">待补齐本卡分镜</div>'}</section>${view && complete ? renderMedia(snapshot,segment,number,card,view) : '<section class="media-panel"><div class="video-preview-placeholder" aria-label="视频播放区域"><span aria-hidden="true">▷</span></div></section>'}${renderReferences(snapshot,segment,number,card,view,complete)}</article>`);
      }
    }
    return html.join('') || '<p class="empty">当前场次尚未保存原文切割结果。</p>';
  }
  function directRegenerationBlocked(view,id,number){
    return textScopes(view).some(row=>!row._local&&textTaskInFlight(row)&&textScopeMatches(row,id,number));
  }
  function regroupReady(view){
    const snapshot=view?.snapshot,plan=snapshot?.plan;
    return !!snapshot?.shotFirst&&Array.isArray(plan?.segments)&&plan.segments.length>0&&plan.segments.every(row=>row.complete===true)&&!plan.partial&&!plan.pendingSceneIds?.length&&!snapshot.canResume&&!operationBlocked(view)&&!view?.quote&&!anyTextActive(view)&&!snapshotTextInFlight(snapshot)&&!Object.keys(view?.mediaTasks||{}).length&&!Object.values(snapshot.media||{}).some(cards=>Object.values(cards).some(record=>mediaActive(record,true)));
  }
  function createController(options) {
    const projectId = String(options.projectId || '');
    const initialSnapshot=options.initialSnapshot&&options.initialSnapshot.projectId===projectId?options.initialSnapshot:null;
    const draft = {source:'',policy:{mode:'smart',maxSeconds:15,requestedSeconds:0},settings:{}};
    const view = {projectId,snapshot:{},filter:'all',quote:null,busy:false,operations:{},activeTask:'',textTasks:{},textUnknown:{},submitUncertain:false,message:'',error:false,loaded:false,catalog:null,mediaDrafts:{},mediaTasks:{},mediaRequests:{},mediaUnknown:{},mediaProgress:{},mediaStarted:{},storyboardReturns:{}};
    if(initialSnapshot){view.snapshot=initialSnapshot;view.cachedSnapshot=true;view.message='先显示本项目已保存分镜，正在读取最新状态。';}
    let stateLoadPromise=null;
    const terminalTextReceipts=new Map();
    let foregroundLoads=0;
    const quotes=new Map(),regroupPreviews=new Map(),sceneBatches230=new Map();let operationId=0;
    view.sceneVideoBatches230={};
    const mediaReconnectAttempts = new Set(), detachedReceipts = new Map();
    view.returnEdits={};
    let epoch = 0, loadEpoch = 0, catalogEpoch232 = 0, mediaPriceEpoch156 = 0, pipelineReadEpoch = 0, disposed = false, submittedAction = null;
    // The snapshot is read-only to views and is replaced on accepted responses.
    // Never JSON-copy megabytes of receipts once per mounted card or poll tick.
    const emit = () => { if (!disposed && options.onChange) options.onChange({...view},draft); };
    const begin=(action,id,number,kind='text',phase='preparing')=>{if((kind==='detach'?detachBlocked:operationBlocked)(view,id,number))throw Error('本卡正在提交，请勿重复点击。');const token=String(++operationId);view.operations[token]={action,segmentId:id,cardNumber:number,kind,state:'running',phase};return token;};
    const end=token=>{delete view.operations[token];emit();};
    function mergeCardState(incoming,id,number){
      if(incoming.plan?.planHash!==view.snapshot.plan?.planHash)throw Error('项目编排版本已变化，请刷新核对；未覆盖新编排。');
      const next={...view.snapshot};
      for(const field of ['cardDrafts','sourceEdits','cardRegenerations','media']){
        const row=incoming[field]?.[id]?.[String(number)];
        if(row!==undefined)next[field]={...next[field],[id]:{...next[field]?.[id],[String(number)]:row}};
      }
      view.snapshot=next;
    }
    const message = (text,isError=false) => {view.message=text;view.error=isError;emit();};
    const api = (url,body) => options.request(url,body === undefined ? {method:'GET'} : {method:'POST',body});
    const identity = (action,id,number) => JSON.stringify(isPlanAction(action)?{epoch,action,draft}:{epoch,action,id,number,plan:number?cardIdentity228(view.snapshot,id,number)||view.snapshot.plan?.planHash:view.snapshot.plan?.planHash,edit:number?view.snapshot.sourceEdits?.[id]?.[String(number)]:view.snapshot.sourceEdits?.[id],settings:view.snapshot.currentSettings??draft.settings});
    const anyActive = () => anyTextActive(view) || ['queued','running'].includes(view.snapshot.task?.state);
    const repeatable = () => view.snapshot.repeatableActions===true;
    const savedCardActions = () => savedCardActionsAvailable(view.snapshot);
    const scopeActive=(id,number)=>textBlocked(view,id,number);
    const mediaScopeActive=(id,number)=>Object.entries(view.snapshot.media||{}).some(([sid,cards])=>(!id||sid===id)&&Object.keys(cards||{}).some(n=>(!number||Number(n)===Number(number))&&cardMediaBlocked(view,sid,Number(n))))||Object.keys({...view.mediaTasks,...view.mediaUnknown}).some(token=>{const [sid,n]=JSON.parse(token);return (!id||sid===id&&(!number||Number(n)===Number(number)))&&cardMediaBlocked(view,sid,Number(n));});
    const syncTextAlias=()=>{view.activeTask=Object.keys(view.textTasks)[0]||'';view.submitUncertain=Object.values(view.textUnknown).some(task=>task.action==='plan'||!task.segmentId);};
    const scopeReceipt=(snapshot,scope)=>JSON.stringify(isPlanAction(scope.action)?{plan:snapshot.plan,lastError:snapshot.lastError}:scope.cardNumber?snapshot.cardRegenerations?.[scope.segmentId]?.[String(scope.cardNumber)]||null:snapshot.segments?.[scope.segmentId]||null);
    const sameScope=(a,b)=>isPlanAction(a.action)||isPlanAction(b.action)?a.action===b.action:a.segmentId===b.segmentId&&Number(a.cardNumber||0)===Number(b.cardNumber||0);
    const localUnknown=scope=>({...scope,_local:true,_baseline:scopeReceipt(view.snapshot,scope),
      _knownClaimIds:savedTextTasks(view.snapshot).filter(row=>sameScope(row,scope)).map(row=>row.claimId).filter(Boolean)});
    const ownedCard=(id,number)=>{const row=segments(view.snapshot).find(row=>segmentId(row)===id);if(!row || !Number.isInteger(number)||number<1)throw Error('本卡不存在。');const card=readSceneCards(view.snapshot,row)[number-1];if(!card?.complete || card.storyboardStale || !card.storyboard&&!card.shots?.length&&!card.directorGuide?.shots?.length)throw Error('本卡分镜未完成或原文已修改，请先补齐本卡。');return card;};
    const mediaSelection=(id,number,action)=>{const card=readSceneCards(view.snapshot,segments(view.snapshot).find(row=>segmentId(row)===id)||{})[number-1];return defaultMediaDraft(view.catalog,action,{referenceAssetIds:cardReferenceSelection(view.snapshot,id,number,card,view,action),...view.mediaDrafts[mediaKey(id,number)]?.[action]},view.snapshot.settings?.ratio || '16:9',card);};
    const mediaIdentity=(id,number,action)=>{const card=cardIdentity228(view.snapshot,id,number);return JSON.stringify({epoch,mediaPriceEpoch156,id,number,action,selection:mediaSelection(id,number,action),...(card?{card}:{planHash:view.snapshot.plan?.planHash,resultHash:view.snapshot.segments?.[id]?.result?.rawResponseHash}),draft:view.snapshot.cardDrafts?.[id]?.[String(number)] || null});};
    const mediaBlocked=(id,number)=>cardMediaBlocked(view,id,number);
    const mediaHasOriginal=(id,number)=>mediaActive(mediaRecord(view.snapshot,id,number)) || !!view.mediaTasks[mediaKey(id,number)] || !!view.mediaUnknown[mediaKey(id,number)];
    const mediaSlot=key=>{const [id,number]=JSON.parse(key);return mediaRecord(view.snapshot,id,number);};
    const ownsMedia=(key,scope)=>!disposed&&view.mediaRequests[key]===scope;
    function withDetachedReceipts(snapshot) {
      if(!detachedReceipts.size)return snapshot;
      const media={...snapshot.media};
      for(const [key,receipts]of detachedReceipts){
        const [id,number]=JSON.parse(key),record=mediaRecord(snapshot,id,number),tasks={...(record.activeTasks||{})};
        const attempts=[...(record.attempts||[])];let active=record.active;
        for(const [requestId,receipt]of receipts){
          delete tasks[requestId];
          if(!attempts.some(row=>row.requestId===requestId&&row.status==='detached'))attempts.push(receipt);
        }
        if(active&&receipts.has(active.requestId))active=Object.values(tasks).at(-1)||{};
        media[id]={...media[id],[String(number)]:{...record,activeTasks:tasks,attempts,...(active!==undefined?{active}:{})}};
      }
      // A saved exact detach applies only to that request. A concurrent
      // sibling's completed movie and a newer request on this card are kept.
      return {...snapshot,media};
    }
    function clearResolvedMedia(key,scope) {
      const outcome=mediaOutcome(mediaSlot(key),scope);if(!outcome)return null;
      // A late response may belong to an observer the user has already replaced.
      if(view.mediaRequests[key]&&view.mediaRequests[key]!==scope)return outcome;
      if(!scope.localTaskId||view.mediaTasks[key]===scope.localTaskId)delete view.mediaTasks[key];
      if(!view.mediaUnknown[key]||view.mediaUnknown[key]===scope||mediaOutcome(mediaSlot(key),view.mediaUnknown[key]))delete view.mediaUnknown[key];
      delete view.mediaRequests[key];delete view.mediaProgress[key];delete view.mediaStarted[key];
      return outcome;
    }
    function reconcileMedia() {
      const keys=new Set([...Object.keys(view.mediaRequests),...Object.keys(view.mediaUnknown)]);
      for(const key of keys){const scope=view.mediaRequests[key]||view.mediaUnknown[key];clearResolvedMedia(key,scope);}
    }
    function trackMedia(key,extra={}) {
      const active=mediaSlot(key).active||{},previous=view.mediaRequests[key]||view.mediaUnknown[key];
      const scope={projectId,...(extra.mode==='observe'?(active.requestId?{requestId:active.requestId}:previous&&typeof previous==='object'?previous:{}):{}),...extra};
      view.mediaRequests[key]=scope;return scope;
    }
    function adoptMedia(key,scope,response) {
      if(!ownsMedia(key,scope))return;
      if(scope.requestId&&response.requestId&&scope.requestId!==response.requestId)throw Error('查询返回不属于本卡原请求，请刷新核对。');
      if(response.requestId)scope.requestId=response.requestId;
      if(!response.completed&&response.taskId)scope.localTaskId=response.taskId;
      if(clearResolvedMedia(key,scope))return;
      view.mediaRequests[key]=scope;
      if(!response.completed&&response.taskId){view.mediaTasks[key]=response.taskId;view.mediaProgress[key]={state:'queued',...(response.concurrency?{concurrency:response.concurrency}:{}),message:response.message||''};delete view.mediaUnknown[key];}
    }
    async function reconcileMediaFailure(key,scope) {
      if(!ownsMedia(key,scope))return {stale:true};
      // Completion and an HTTP error can cross. Re-read local persisted proof,
      // never regenerate, detach or infer completion from an old video alone.
      try{await load({background:true});}catch(_){/* retain the exact uncertainty */}
      if(!ownsMedia(key,scope)){const outcome=mediaOutcome(mediaSlot(key),scope);return outcome?.completed?outcome:{stale:true};}
      const outcome=clearResolvedMedia(key,scope);if(outcome)return outcome;
      if(!view.mediaRequests[key]||view.mediaRequests[key]===scope){view.mediaRequests[key]=scope;view.mediaUnknown[key]=scope;}
      return null;
    }
    function assertProject() {if (!projectIdValid(projectId)) throw Error('请从已有项目打开本页，并在地址中提供有效 projectId；不会自动创建项目。');}
    function cancelQuote() {if(view.quote){quotes.delete(view.quote.quoteId);view.message='已取消，本次未提交生成任务。';}view.quote=null;emit();}
    function load(settings={}) {
      // Foreground navigation and background progress reads share one original
      // GET. A later hung reader cannot invalidate an earlier good response.
      if(stateLoadPromise)return stateLoadPromise;
      const work=loadFresh(settings);stateLoadPromise=work;
      const clear=()=>{if(stateLoadPromise===work)stateLoadPromise=null;};
      work.then(clear,clear);return work;
    }
    async function loadFresh(settings={}) {
      assertProject(); const serial=++loadEpoch,foreground=settings.background!==true,existingText=new Set(Object.keys(view.textTasks));if(foreground){foregroundLoads++;view.busy=true;emit();}
      try {
        let incoming=await api(`/api/visual/macro/state?projectId=${encodeURIComponent(projectId)}`);
        if (serial !== loadEpoch || disposed) return;
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) || incoming.projectId !== projectId) throw Error('项目状态返回不完整或身份不匹配，已保存分镜仍保留，请重新加载。');
        rememberDownloadModule227(incoming);
        incoming=withDetachedReceipts(incoming);
        view.snapshot=incoming;view.loaded=true;view.cachedSnapshot=false;view.projectReadError='';
        for(const [id,cards] of Object.entries(incoming.media || {}))for(const [number,record] of Object.entries(cards || {})){
          const key=mediaKey(id,Number(number)),active=record.active || {};
          if(mediaActive(record)&&Number.isFinite(active.createdAt))view.mediaStarted[key]=active.createdAt*1000;
          // IDs are adopted only from this controller's submit/observe RPCs,
          // never from a previous process. A transient missing saved claim is
          // not terminal proof: keep its live watcher until its exact receipt
          // or its polled terminal state arrives.
        }
        reconcileMedia();
        if (typeof incoming.source === 'string') draft.source=incoming.source;
        if (incoming.policy && typeof incoming.policy === 'object') draft.policy=clone(incoming.policy);
        if (incoming.settings && typeof incoming.settings === 'object') draft.settings=clone(incoming.settings);
        if (view.filter !== 'all' && !segments(incoming).some(row=>segmentId(row)===view.filter)) view.filter='all';
        const task=incoming.task, active=incoming.active || {},wasUncertain=view.submitUncertain;
        const incomingTasks={},incomingUnknown={},savedTasks=savedTextTasks(incoming),previousUnknown=view.textUnknown;
        for(const row of savedTextTasks(incoming)){
          const taskId=String(row.taskId||row.localTaskId||'');
          if(['needs_review','uncertain'].includes(row.status)){incomingUnknown[row.claimId||JSON.stringify([row.segmentId,row.cardNumber])]=clone(row);continue;}
          if(taskId){const live=view.textTasks[taskId];incomingTasks[taskId]={...clone(row),...(live?{state:live.state,phase:live.phase,message:live.message,progress:live.progress}:{})};}
        }
        for(const [key,row]of Object.entries(previousUnknown))if(row._local&&!savedTasks.some(saved=>sameScope(saved,row)&&
          (row.claimId?saved.claimId===row.claimId:!(row._knownClaimIds||[]).includes(saved.claimId)))&&scopeReceipt(incoming,row)===row._baseline)incomingUnknown[key]=row;
        const unresolvedActive=['needs_review','uncertain'].includes(String(active.status||''));
        if(!Object.keys(incomingTasks).length&&!isTerminalTextTask(active)&&!unresolvedActive&&task&&['queued','running'].includes(task.state)){const taskId=String(task.id||task.taskId||'');if(taskId)incomingTasks[taskId]={...active,taskId,action:active.action||submittedAction?.action||'plan',segmentId:active.segmentId||submittedAction?.segmentId,cardNumber:active.cardNumber||submittedAction?.cardNumber};}
        for(const [taskId,row]of Object.entries(view.textTasks))if(terminalTextReceipts.has(taskId)||!existingText.has(taskId))incomingTasks[taskId]=row;
        view.textTasks=incomingTasks;view.textUnknown=incomingUnknown;view.activeTask=Object.keys(incomingTasks)[0]||'';
        const submittedRecord=submittedAction?.cardNumber ? incoming.cardRegenerations?.[submittedAction.segmentId]?.[String(submittedAction.cardNumber)] : submittedAction?.segmentId ? incoming.segments?.[submittedAction.segmentId] : null;
        const definitive=!!view.activeTask || ['done','error','failed'].includes(task?.state) || (submittedAction?.action==='plan' && segments(incoming).length>0) || (submittedRecord && ['ready','done','completed','arranged','failed','error','validation_failed','not_submitted'].includes(submittedRecord.status));
        view.submitUncertain=!!(incoming.uncertain || active.status==='needs_review'&&!active.segmentId || task?.state==='uncertain' || wasUncertain && !definitive);
        if(view.quote){const quote=view.quote,valid=quote.kind==='media'?quote.token===mediaIdentity(quote.segmentId,quote.cardNumber,quote.action):quote.token===identity(quote.action,quote.segmentId,quote.cardNumber);if(!valid)view.quote=null;}
const progressiveCards=segments(incoming).reduce((sum,scene)=>sum+(incoming.segments?.[segmentId(scene)]?.result?.progressive228===true?readSceneCards(incoming,scene).filter(cardComplete).length:0),0);
view.message=incoming.shotFirst ? `${progressiveCards?`已形成 ${progressiveCards} 张视频卡；这些卡可先编辑或生成视频。`:''}已完成 ${incoming.completedSceneCount||0}/${incoming.totalSceneCount||0} 场分镜。${snapshotTextInFlight(incoming)?'后续分镜继续处理中，已形成的卡片保持不变。':incoming.canResume?'其余场次可点击“继续未完成编排”。':'已完成场次可直接生成视频，无需再补整遍分镜。'}` : segments(incoming).length ? '已读取剧情场次与已保存分镜。切换场次不调用模型，补齐分镜按报价付费。' : '原稿已读取。请设置整场分镜，按场生成镜头并顺序组卡；补齐分镜按实际调用计费。';view.error=false;
      if(!incoming.completedSceneCount&&Object.values(incoming.savedStoryboardReturns||{}).some(row=>Object.values(row.sceneEditors||{}).some(slot=>slot.emptyShots===true))){view.message='本次尚未生成可用镜头，原返回已保留。可重新补齐当前场次；没有自动重提。';view.error=true;}
        if(incoming.lastError){view.message=`上次未完成：${String(incoming.lastError)}\n原稿及原返回保留。可对同一稿重新免费核价，确认后才发起新的调用；不会自动重试。`;view.error=true;}
        if(view.submitUncertain){view.message='上次调用记录已保留，不影响再次操作；手动生成会发起新的调用。';view.error=false;}
      } catch(error) {
        const failure=Object.assign(new Error(error?.message||String(error)),{projectStateRead:true});
        if(serial===loadEpoch&&!disposed)view.projectReadError=failure.message;
        throw failure;
      }
      finally {if(foreground){foregroundLoads--;view.busy=foregroundLoads>0;}if(serial===loadEpoch||foreground)emit();}
    }
    function updateDraft(patch) {
      if(!view.loaded)throw Error('请先完成项目读取。');
      if (!repeatable()&&(view.snapshot.sourceLocked || segments(view.snapshot).length || anyActive())) throw Error('已有大段工作区、计划或调用，原稿和设置已锁定；本页不覆盖已保存原稿。');
      if ('source' in patch) draft.source=String(patch.source);
      if (patch.policy) draft.policy=clone(patch.policy);
      epoch++;view.quote=null;emit();
    }
    function selectSegment(id) { if(id!=='all' && !segments(view.snapshot).some(row=>segmentId(row)===id)) throw Error('找不到这个场次。');view.filter=id;emit(); }
    async function quote(action,id,number,extra={}) {
      const scopedPlanStart=action==='plan'&&extra.restart===true&&['current','all'].includes(extra.scope);
      assertProject();if(!view.loaded)throw Error('请先读取项目。');if(operationBlocked(view,id,number) || (action==='plan_resume'?anyActive():action==='plan'?(scopedPlanStart?scopedPlanTextBlocked(view):anyActive())||mediaScopeActive():scopeActive(id,number)||mediaScopeActive(id,number)))throw Error('本次任务正在执行，完成后可再次点击；其他功能可继续使用。');
      if(!['plan','plan_resume','segment'].includes(action))throw Error('报价动作无效。');
      if(extra.directSubmit&&(action!=='segment'||!Number.isInteger(number)||number<1))throw Error('只有本卡重新生成可以直接提交。');
      if(extra.directSubmit&&directRegenerationBlocked(view,id,number))throw Error('本卡新任务仍在执行或本次提交回执未确认，请勿重复点击；旧待核单独立保留。');
      if(action==='plan' && segments(view.snapshot).length&&!extra.restart)throw Error('已有大段计划；重新识别必须由用户明确开始并确认。');
      if(action==='segment' && !segments(view.snapshot).some(row=>segmentId(row)===id))throw Error('请先选择已有场次。');
      const completionMode=action==='segment'&&number===undefined?(extra.completionMode??'missing'):undefined;
      if(completionMode!==undefined&&!['missing','all'].includes(completionMode))throw Error('补齐范围无效，未调用模型。');
      if(action==='segment'&&number===undefined){const row=segments(view.snapshot).find(row=>segmentId(row)===id),cards=readSceneCards(view.snapshot,row);if(cards.length&&cards.every(cardComplete)&&(completionMode==='missing'||!repeatable()&&!view.snapshot.shotFirst))throw Error('本场已有保存分镜：所有视频卡均已完成；如需重做，请选择“全部重新补齐”。未调用模型、未扣费。');}
      if(!draft.source.trim())throw Error('原稿为空。');
      const token=identity(action,id,number),op=begin(action,id,number,'text','quote');message('正在核对输入与本次费用；尚未调用模型、未扣费。');
      try {
        const policy=clone(extra.restart&&extra.policy?extra.policy:draft.policy);
        const arrangementMode=extra.arrangementMode??policy.arrangementMode??'legacy';
        if(action==='plan' && Object.prototype.hasOwnProperty.call(policy,'arrangementMode')){
          if(Object.prototype.hasOwnProperty.call(policy,'version')||policy.arrangementMode!=='shot_first')throw Error('大段编排参数包含未知字段。');
          if(extra.arrangementMode!==undefined&&extra.arrangementMode!==policy.arrangementMode)throw Error('编排方式参数冲突，未提交模型、未扣费。');
          // This is a workflow routing option, not part of the card-duration contract.
          delete policy.arrangementMode;
        }
        const response=await api('/api/visual/macro/quote',{projectId,source:action==='plan'&&(repeatable()||extra.scope)?view.snapshot.currentSource??draft.source:draft.source,policy,settings:clone(repeatable()||action==='plan'&&extra.scope||action==='segment'&&savedCardActions()?view.snapshot.currentSettings??draft.settings:draft.settings),action,...(extra.directSubmit?{directSubmit:true}:{}),...(action==='plan'?{arrangementMode,...(extra.scope?{scope:extra.scope,...(extra.scope==='current'?{segmentId:extra.segmentId,sceneNumber:extra.sceneNumber}:{})}:{})}:{}),...(extra.restart?{restart:true}:{}),...(id ? {segmentId:id} : {}),...(number!==undefined?{cardNumber:number}:{}),...(completionMode?{completionMode}:{})});
        if(disposed || token!==identity(action,id,number)){message('原稿或设置已变化，旧报价已作废，请重新免费核价。');return null;}
        const quotedAction=action==='plan'&&extra.scope&&response?.action==='plan_resume'?'plan_resume':action;
        if(!validTextQuote(response,quotedAction,id,number,view.snapshot,completionMode))throw Error('报价字段不完整、补齐范围或卡片不匹配、调用次数或费用不一致，未开放提交。');
        const prepared={...response,...(completionMode?{completionMode}:{}),kind:'text',segmentId:id||'',cardNumber:number,restart:!!extra.restart,scopedPlanStart,directSubmit:extra.directSubmit===true,token:quotedAction===action?token:identity(quotedAction,id,number)};
        quotes.set(prepared.quoteId,prepared);
        // Direct regeneration owns its returned quote; never expose it to the
        // shared modal, or overwrite another card/action's open confirmation.
        if(!extra.directSubmit)view.quote=prepared;
        message(extra.directSubmit?'本卡费用已核对，正在提交重新生成。':'报价已就绪；确认后付费调用模型，取消不调用、不扣费。');return clone(prepared);
      } catch(error){message(error.message,true);throw error;}finally{end(op);}
    }
    async function confirmQuote(quoted) {
      const pending=quoted||view.quote;
      if(pending?.directSubmit&&directRegenerationBlocked(view,pending.segmentId,pending.cardNumber))throw Error('本卡新任务仍在执行或本次提交回执未确认，请勿重复点击；旧待核单独立保留。');
      const planBlocked=pending?.scopedPlanStart?scopedPlanTextBlocked(view):anyActive();
      if(!pending || !quotes.has(pending.quoteId) || operationBlocked(view,pending.segmentId,pending.cardNumber) || pending.kind==='media' || (pending.action==='plan_resume'?planBlocked:pending.action==='plan'?planBlocked||mediaScopeActive():scopeActive(pending.segmentId,pending.cardNumber)||mediaScopeActive(pending.segmentId,pending.cardNumber)) || pending.token!==identity(pending.action,pending.segmentId,pending.cardNumber))throw Error('报价已失效或对应范围已有调用，请重新检查当前状态。');
      quotes.delete(pending.quoteId);if(view.quote?.quoteId===pending.quoteId)view.quote=null;const op=begin(pending.action,pending.segmentId,pending.cardNumber,'text','submitting');submittedAction={action:pending.action,segmentId:pending.segmentId,cardNumber:pending.cardNumber};message('正在提交已确认的这一项模型工作，不会自动提交下一段。');
      try {
        const response=await api('/api/visual/macro/submit',{projectId,quoteId:pending.quoteId,confirmed:true});
        if(typeof response.taskId!=='string' || !response.taskId)throw Error('未收到任务编号。');
        view.textTasks[response.taskId]={taskId:response.taskId,state:'queued',action:pending.action,shotFirst:pending.shotFirst===true,segmentId:pending.segmentId,cardNumber:pending.cardNumber,maxCalls:pending.maxCalls,...(Array.isArray(pending.cardNumbers)?{cardNumbers:clone(pending.cardNumbers)}:{})};syncTextAlias();message('本地任务已创建；空闲执行位会立即开始核价与提交，其他卡片可独立操作。');return response.taskId;
      } catch(error){view.textUnknown[JSON.stringify([pending.segmentId,pending.cardNumber])]=localUnknown({action:pending.action,segmentId:pending.segmentId,cardNumber:pending.cardNumber});syncTextAlias();message(`本次提交未确认：${error.message}\n原记录独立保留，按钮已恢复；再次点击会发起新调用，不会自动重试。`,true);throw error;}
      finally{end(op);}
    }
    async function pollOnce(taskId=view.activeTask) {
      if(!taskId)return {done:true};
      const receipt=terminalTextReceipts.get(taskId);
      const scope=receipt?.scope||view.textTasks[taskId]||{action:'plan'};
      const task=receipt?.task||await api(`/api/tasks/${encodeURIComponent(taskId)}`);
      if(disposed)return {done:true};
      if(task.state==='done' || task.state==='error' || task.state==='failed') {
        const failed=task.state!=='done';
        terminalTextReceipts.set(taskId,{task,scope});
        if(!view.textTasks[taskId]){view.textTasks[taskId]=scope;syncTextAlias();}
        // An earlier read could have captured the snapshot before the task finished.
        if(stateLoadPromise)await stateLoadPromise.catch(()=>{});
        if(disposed)return {done:true};
        await load({background:true});
        if(disposed)return {done:true};
        terminalTextReceipts.delete(taskId);
        delete view.textTasks[taskId];syncTextAlias();
        const returned=task.returnedUnstructured===true||task.result?.returnedUnstructured===true||task.result?.workflowComplete===false&&task.result?.returnedContent||returnedContent(scope.cardNumber?view.snapshot.cardRegenerations?.[scope.segmentId]?.[String(scope.cardNumber)]:view.snapshot.segments?.[scope.segmentId]);
        message(failed ? `本次未完成：${task.error || task.message || '请查看本段保存的错误信息'}。原返回及其他场次保留，未自动重试。` : returned?'模型已返回，尚未转为视频卡；原内容已保留，可通过“查看最近原返回”读取。':'本次结果已保存。切换场次查看，不会自动继续收费。',failed);
        return {done:true,failed};
      }
      if(!['queued','running'].includes(task.state)) {delete view.textTasks[taskId];view.textUnknown[taskId]=localUnknown(scope);syncTextAlias();message('原调用记录已保留，可再次手动生成；不会自动重新调用。',true);return {done:true,uncertain:true}; }
      const tracked={...scope,state:task.state,status:task.state,phase:String(task.phase||''),message:String(task.message||'')};
      if(Number.isFinite(task.progress))tracked.progress=Math.max(0,Math.min(100,task.progress));else delete tracked.progress;
      view.textTasks[taskId]=tracked;
      if(scope.maxCalls>1||isPlanAction(scope.action)||scope.action==='segment')await load({background:true});
      message(`${task.message || '正在处理当前段'}${Number.isFinite(task.progress) ? ` · ${Math.max(0,Math.min(100,task.progress))}%` : ''}。本页不会自动重试或追加收费。`);
      return {done:false};
    }
    async function recover(claimId) {
      const candidates=savedTextTasks(view.snapshot);
      const active=(claimId?candidates.find(row=>row.claimId===claimId):candidates.find(row=>row.claimId&&['needs_review','uncertain'].includes(row.status))||view.snapshot.active)||{};assertProject();if(view.busy || !active.claimId)throw Error('没有可核对的原调用。');
      view.busy=true;view.quote=null;message('正在免费核对原返回与旧订单，不重新生成、不创建新的模型调用。');
      try{const response=await api('/api/visual/macro/recover',{projectId,claimId:active.claimId});await load({background:true});const recovery=response.recovery || {},outcome=recovery.outcome||recovery.status,pending=['pending','missing','needs_review'].includes(outcome),verified=recovery.billingVerified===true,terminal=['completed','failed_no_charge','failed_refunded'].includes(outcome)||outcome==='succeeded'&&verified||outcome==='failed'&&verified&&recovery.chargedPoints===0;if(pending||!terminal)view.textUnknown[active.claimId]=localUnknown(active);else for(const [key,row]of Object.entries(view.textUnknown))if(row.claimId===active.claimId||!row.claimId&&sameScope(row,active))delete view.textUnknown[key];syncTextAlias();message(recovery.message || (pending||!terminal?'原返回或旧订单尚未核清，原单独立保留；可稍后再次免费核对，不会自动重提。':'已免费核对原调用及原订单；当前结果已刷新，不会自动重新提交。'),pending||!terminal);return response;}
      catch(error){view.textUnknown[active.claimId]=localUnknown(active);syncTextAlias();message(`原调用核对中断：${error.message}。仍保留原调用，不会重新生成。`,true);throw error;}finally{view.busy=false;emit();}
    }
    async function checkCardTask(id,number){
      assertProject();
      if(!segments(view.snapshot).some(row=>segmentId(row)===id)||number!==undefined&&(!Number.isInteger(number)||number<1))throw Error('请选择有效场次或视频卡。');
      if(operationBlocked(view,id,number))throw Error('本卡正在核对，请勿重复点击。');
      const op=begin('segment',id,number,'observe'),responses=[],errors=[];
      try{
        await load({background:true});
        // Freeze only this click's owned pending receipts. A newer saved card
        // does not settle older orders, and another scene is never inspected.
        const claims=savedTextTasks(view.snapshot).filter(row=>row.claimId&&reviewTextStatuses.has(textStatus(row))&&textScopeMatches(row,id,number)).map(row=>row.claimId);
        for(const claimId of new Set(claims)){
          if(disposed)break;
          const current=savedTextTasks(view.snapshot).find(row=>row.claimId===claimId);
          if(!current||!reviewTextStatuses.has(textStatus(current))||!textScopeMatches(current,id,number))continue;
          try{responses.push(await recover(claimId));}catch(error){errors.push(error.message);}
        }
        // The state endpoint refreshes running claims. Existing watchers keep
        // polling their own tasks; a saved old local task ID is not a reason
        // to create a replacement task or infer that the original is done.
        if(disposed)return {stale:true};
        await load({background:true});
        const state=cardRecoveryState(view,id,number),pending=state.uncertain||state.running.length>0;
        message(state.uncertain?`${number===undefined?'本场':'本卡'}仍有${state.pending.length?state.pending.length+'笔':''}原调用未核清，旧单独立保留；重新生成属于新的付费调用。本次核对没有新建模型调用或新增扣费。${errors.length?' 查询说明：'+errors.join('；'):''}`
          :state.running.length?'原任务仍在执行，已刷新当前状态；没有重新提交或新增扣费。'
          :'对应原调用已核对结束，已刷新真实状态；如需重新生成，请再点击生成按钮，未自动提交。',state.uncertain||errors.length>0);
        return {recoveries:responses,pending,errors};
      }finally{end(op);}
    }
    async function readStoryboardReturn(id,number){
      assertProject();
      if(!segments(view.snapshot).some(row=>segmentId(row)===id)||!Number.isInteger(number)||number<1)throw Error('本卡不存在。');
      const op=begin('segment',id,number,'observe');
      message('正在读取本卡已保存的模型原返回；不调用模型、不新增扣费。');
      try{
        const response=await api('/api/visual/macro/recheck-return',{projectId,segmentId:id,cardNumber:number});
        if(response.projectId!==projectId||response.segmentId!==id||response.cardNumber!==number||response.noModelCall!==true||response.noNewCharge!==true||typeof response.rawResponse!=='string')throw Error('原返回身份不匹配，未覆盖本卡分镜。');
        if(disposed)return {stale:true};
        view.storyboardReturns[mediaKey(id,number)]={rawResponse:response.rawResponse,message:String(response.message||'已读取模型原返回。'),previewOnly:response.previewOnly===true,
          previewStoryboard:typeof response.previewStoryboard==='string'?response.previewStoryboard:'',validationError:String(response.validationError||''),billingState:String(response.billingState||''),
          speechValidationWarnings:Array.isArray(response.speechValidationWarnings)?clone(response.speechValidationWarnings):[],detailDiagnostics:Array.isArray(response.detailDiagnostics)?clone(response.detailDiagnostics):[]};
        await load({background:true});
        message(response.message||'已读取原返回，未新增调用或扣费。',response.rechecked!==true&&response.previewOnly!==true);return response;
      }catch(error){message(error.message,true);throw error;}finally{end(op);}
    }
    async function readPipelineReturn(settings={}){
      assertProject();
      const ticket=++pipelineReadEpoch,identity=pipelineReturnIdentity(view.snapshot);
      const response=await api(`/api/visual/macro/pipeline-return?projectId=${encodeURIComponent(projectId)}${settings.segmentId?'&segmentId='+encodeURIComponent(settings.segmentId):''}`);
      if(disposed||ticket!==pipelineReadEpoch||identity!==pipelineReturnIdentity(view.snapshot))return {stale:true};
      if(response.projectId!==projectId||response.localOnly!==true||response.noModelCall!==true||response.noNewCharge!==true)throw Error('原返回身份不一致，未读取。');
      // Automatic previews must belong to the selected scene; the latest saved
      // stage can still be a different scene's response after partial progress.
      const id=String(settings.segmentId||'');
      if(id&&!(response.scope||[]).some(row=>String(row.sceneId||'')===id))return {unavailableForScene:true};
      view.pipelineReturn={...clone(response),_snapshotIdentity:identity,_segmentId:id};emit();return response;
    }
    function updateReturnedDraft(id,hash,text){view.returnEdits[JSON.stringify([id,hash])]=String(text);}
    async function saveReturnedDraft(id,hash,text,expectedRevision){
      assertProject();
      const revisionId=view.snapshot.revisionId;
      const response=await api('/api/visual/macro/return-draft',{projectId,revisionId,segmentId:id,rawResponseHash:hash,text:String(text),expectedRevision});
      if(disposed||revisionId!==view.snapshot.revisionId)return {stale:true};
      if(response.draft?.rawResponseHash!==hash||response.draft?.segmentId!==id)throw Error('分镜草稿返回的场次不匹配。');
      if(view.pipelineReturn?.rawResponseHash===hash){view.pipelineReturn.sceneEditors??={};view.pipelineReturn.sceneEditors[id]??={};view.pipelineReturn.sceneEditors[id].savedDraft=clone(response.draft);}
      updateReturnedDraft(id,hash,text);message('分镜内容已保存。');return response;
    }
    async function previewRegroup(id,maxSeconds){
      assertProject();
      if(!view.loaded||!regroupReady(view))throw Error('请等待全部场次分镜和当前任务完成后，再免费重新组卡。');
      if(!segments(view.snapshot).some(row=>segmentId(row)===id)||![15,30].includes(maxSeconds))throw Error('请选择本场及15秒或30秒上限。');
      const revision=view.snapshot.revisionId,op=begin('segment',id,undefined,'regroup');
      message('正在预览本地组卡；不调用模型、不扣费。');
      try{
        const response=await api('/api/visual/macro/regroup/preview',{projectId,segmentId:id,maxSeconds});
        if(disposed||view.snapshot.revisionId!==revision)return null;
        if(typeof response.previewId!=='string'||!response.previewId||response.revisionId!==revision||response.segmentId!==id||response.maxSeconds!==maxSeconds||response.noModelCall!==true||response.noNewCharge!==true||!Number.isInteger(response.beforeCardCount)||!Number.isInteger(response.afterCardCount)||response.afterCardCount<1||!Array.isArray(response.cardDurations)||response.cardDurations.length!==response.afterCardCount||response.cardDurations.some(seconds=>!Number.isFinite(seconds)||seconds<=0||seconds>maxSeconds))throw Error('组卡预览返回不匹配，未应用任何修改。');
        regroupPreviews.set(response.previewId,clone(response));message('组卡预览已就绪，确认后才应用。');return clone(response);
      }catch(error){message(error.message,true);throw error;}finally{end(op);}
    }
    async function applyRegroup(preview){
      assertProject();const saved=regroupPreviews.get(preview?.previewId);
      if(disposed||!saved||saved.revisionId!==view.snapshot.revisionId||!regroupReady(view))throw Error('组卡预览已失效或当前有任务，请刷新后重新预览。');
      regroupPreviews.delete(saved.previewId);const op=begin('segment',saved.segmentId,undefined,'regroup');message('正在应用本地组卡，旧卡与媒体将保留在旧版本。');
      try{
        const response=await api('/api/visual/macro/regroup/apply',{projectId,previewId:saved.previewId,expectedRevision:saved.revisionId});
        if(disposed)return null;
        if(response.ok!==true||response.noModelCall!==true||response.noNewCharge!==true||response.archivedRevisionId!==saved.revisionId||response.segmentId!==saved.segmentId||typeof response.revisionId!=='string'||!response.revisionId)throw Error('组卡结果尚待核对，请刷新查看；不会自动重复应用。');
        quotes.clear();view.quote=null;epoch++;
        for(const key of Object.keys(view.mediaDrafts)){if(JSON.parse(key)[0]===saved.segmentId)delete view.mediaDrafts[key];}
        for(const key of Object.keys(view.storyboardReturns)){if(JSON.parse(key)[0]===saved.segmentId)delete view.storyboardReturns[key];}
        message(response.message||'已免费重新组卡。');return response;
      }catch(error){message(error.message,true);throw error;}finally{end(op);}
    }
    function invalidateCatalog232(){catalogEpoch232++;view.catalog=null;view.quote=null;emit();}
    function invalidateMediaPrices156(){
      mediaPriceEpoch156++;catalogEpoch232++;view.catalogRefreshPending251=true;
      if(view.quote?.kind==='media')view.quote=null;
      for(const [id,quote] of quotes)if(quote.kind==='media')quotes.delete(id);
      for(const batch of [...sceneBatches230.values()])if(['quoting','ready'].includes(batch.state))cancelSceneVideoBatch230(batch.batchId);
      emit();
    }
    async function loadCatalog() {
      assertProject();const ticket=++catalogEpoch232,response=await api(`/api/visual/macro/media/catalog?projectId=${encodeURIComponent(projectId)}`);
      if(disposed||ticket!==catalogEpoch232)return {stale:true};if(!Array.isArray(response.models))throw Error('媒体模型目录格式无效，未开放生成。');view.catalog=clone(response);view.catalogRefreshPending251=false;emit();return clone(response);
    }
    async function saveCardDraft(id,number,prompt,referenceAssetIds,expectedRevision) {
      assertProject();ownedCard(id,number);
      if(operationBlocked(view,id,number) || scopeActive(id,number) || mediaBlocked(id,number) || !repeatable()&&!savedCardActions()&&view.snapshot.sourceEpochMatches===false)throw Error('原任务或原稿待核对，暂不能保存新描述词。');
      const body={projectId,segmentId:id,cardNumber:number,prompt:String(prompt),referenceAssetIds:[...referenceAssetIds]};
      if(expectedRevision!==undefined)body.expectedRevision=expectedRevision;
      const op=begin('segment',id,number,'edit');emit();
      try {
        const response=await api('/api/visual/macro/card/draft',body);
        if(!response.draft || typeof response.draft.prompt!=='string' || !Number.isInteger(response.draft.revision))throw Error('描述词保存未返回有效版本，请刷新核对后再生成。');
        if(response.state?.projectId && response.state.projectId!==projectId)throw Error('描述词返回项目不匹配。');
        if(response.state)mergeCardState(response.state,id,number);
        else {view.snapshot={...view.snapshot,cardDrafts:{...view.snapshot.cardDrafts,[id]:{...view.snapshot.cardDrafts?.[id],[String(number)]:clone(response.draft)}}};}
        // Saving text/references does not mean the user chose the currently
        // resolved model or capabilities. Keep only actual local overrides.
        const key=mediaKey(id,number);view.mediaDrafts[key]??={};view.mediaDrafts[key].video={...view.mediaDrafts[key].video,referenceAssetIds:response.draft.referenceAssetIds || []};
        message('描述词与引用已保存。');return clone(response.draft);
      }catch(error){message(error.message,true);throw error;}finally{end(op);}
    }
    async function saveCardSource(id,number,sourceText,expectedRevision) {
      assertProject();
      if(operationBlocked(view,id,number) || scopeActive(id,number) || mediaBlocked(id,number) || !repeatable()&&!savedCardActions()&&view.snapshot.sourceEpochMatches===false)throw Error('本卡任务未结束或原稿待核对，不能修改原文。');
      const op=begin('segment',id,number,'edit');emit();
      try {
        const response=await api('/api/visual/macro/card/source',{projectId,segmentId:id,cardNumber:number,sourceText,expectedRevision});
        if(response.state?.projectId!==projectId || !Number.isInteger(response.sourceEdit?.revision))throw Error('原文保存返回无效，请刷新核对。');
        mergeCardState(response.state,id,number);message('原文已保存，待补齐本卡分镜。');return clone(response.sourceEdit);
      }catch(error){message(error.message,true);throw error;}finally{end(op);}
    }
    async function uploadReference(id,number,file) {
      assertProject();
      if(operationBlocked(view,id,number)||scopeActive(id,number)||mediaBlocked(id,number)||!repeatable()&&!savedCardActions()&&view.snapshot.sourceEpochMatches===false)throw Error('本卡任务未结束，不能上传新引用。');
      if(!file||file.size>10*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请上传10MB以内的PNG/JPEG/WebP。');
      const op=begin('segment',id,number,'edit');emit();
      try{
        const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败。'));reader.readAsDataURL(file);});
        const response=await api('/api/visual/macro/card/reference',{projectId,segmentId:id,cardNumber:number,name:file.name,dataUrl});
        if(response.state?.projectId!==projectId||!response.asset?.id)throw Error('参考图保存返回无效，请刷新核对。');
        mergeCardState(response.state,id,number);
        if(view.catalog)view.catalog.assets=[...(view.catalog.assets||[]).filter(a=>a.id!==response.asset.id),clone(response.asset)];
        message('外部参考图已保存，未调用模型。');return clone(response);
      }catch(error){message(error.message,true);throw error;}finally{end(op);}
    }
    async function deleteReference(id,number,assetId) {
      assertProject();
      if(view.busy||anyActive()||Object.keys(view.mediaTasks).length)throw Error('有任务仍在使用参考图，请完成后移除。');
      if(!view.catalog?.assets?.some(row=>row.id===assetId&&row.externalReference))throw Error('仅可移除上传的外部参考图。');
      view.busy=true;view.quote=null;emit();
      try{
        const response=await api('/api/visual/macro/card/reference/delete',{projectId,segmentId:id,cardNumber:number,assetId});
        if(response.state?.projectId!==projectId||response.removed?.assetId!==assetId)throw Error('移除结果待核对，请刷新。');
        view.snapshot=clone(response.state);view.catalog.assets=view.catalog.assets.filter(row=>row.id!==assetId);
        for(const draft of Object.values(view.mediaDrafts))for(const choice of Object.values(draft))if(choice.referenceAssetIds)choice.referenceAssetIds=choice.referenceAssetIds.filter(value=>value!==assetId);
        epoch++;message('外部参考图已移除；原文件保留，未调用模型。');return clone(response);
      }catch(error){message(error.message,true);throw error;}finally{view.busy=false;emit();}
    }
    function updateMediaDraft(id,number,action,patch) {
      const card=ownedCard(id,number);if(!['frame','video'].includes(action)||operationBlocked(view,id,number)||scopeActive(id,number)||mediaBlocked(id,number))throw Error('原任务待核对或媒体参数已锁定，不能修改后重复提交。');
      // Only a real control change is an override. Reference-only updates,
      // including automatic annotation, must continue to inherit the project.
      const keys=new Set(['model','routeType','resolution','ratio','duration','referenceAssetIds','tailFrameContinuation','tailFrameMode']);
      const explicit=Object.fromEntries(Object.entries(clone(patch)||{}).filter(([name])=>keys.has(name)));
      if(Object.hasOwn(explicit,'tailFrameContinuation')&&(action!=='video'||typeof explicit.tailFrameContinuation!=='boolean'))throw Error('尾帧续画必须是视频任务的明确勾选状态。');
      if(Object.hasOwn(explicit,'tailFrameMode')&&(action!=='video'||!['first-frame','reference'].includes(explicit.tailFrameMode)))throw Error('尾帧承接方式无效。');
      if(Object.hasOwn(explicit,'routeType')){
        if(!['discount','official'].includes(explicit.routeType))throw Error('请选择特价或官方线路。');
        const available=routeModels234(view.catalog,action,explicit.routeType).filter(row=>mediaResolutions(view.catalog,row.model,action).length);
        explicit.model=available[0]?.model||'';explicit.resolution='';
      }else if(Object.hasOwn(explicit,'model'))explicit.routeType=modelRoute234(view.catalog,action,explicit.model);
      const key=mediaKey(id,number),saved={...view.mediaDrafts[key]?.[action],...explicit};
      if(action==='video'){
        const candidate=defaultMediaDraft(view.catalog,action,{referenceAssetIds:cardReferenceSelection(view.snapshot,id,number,card,view,action),...saved},view.snapshot.settings?.ratio||'16:9',card),item=mediaModels(view.catalog,action).find(row=>row.model===candidate.model),tail=tailFrameState239(item,{...candidate,tailFrameContinuation:saved.tailFrameContinuation});
        if(explicit.tailFrameContinuation===true&&tail.issue)throw Error(tail.issue);
        saved.tailFrameMode=tail.mode;
        if(tail.cancelled){saved.tailFrameContinuation=false;message(tail.notice,true);}
      }
      view.mediaDrafts[key]={...(view.mediaDrafts[key] || {}),[action]:saved};view.quote=null;emit();
    }
    async function quoteMedia(id,number,action,extra={}) {
      if(!view.loaded)throw Error('正在读取本项目最新状态，暂未提交媒体请求。');
      assertProject();if(disposed)throw Error('项目已关闭，未提交生成。');
      if(extra.directSubmit&&action!=='video')throw Error('只有视频生成可以直接提交。');
      const directSubmit=extra.directSubmit===true,card=ownedCard(id,number);if(operationBlocked(view,id,number)||scopeActive(id,number)||mediaBlocked(id,number))throw Error('本卡任务正在执行，完成后可再次生成。');if(!['frame','video'].includes(action))throw Error('媒体动作无效。');
      const selected=mediaSelection(id,number,action),duration=action==='video'?(selected.duration??mediaGenerationDuration(card)):card.durationSeconds,issue=mediaIssue(view.catalog,action,selected,card.durationSeconds,card)||tailFrameIssue237(mediaModels(view.catalog,action).find(row=>row.model===selected.model),{...selected,duration},number);if(issue)throw Error(issue);
      const token=mediaIdentity(id,number,action),op=begin('segment',id,number,'media');message('正在读取所选生成时长、型号能力和精确费用，尚未提交生成。');
      try{
        const response=await api('/api/visual/macro/media/quote',{projectId,segmentId:id,cardNumber:number,action,...mediaPayload234(selected)});
        if(disposed||token!==mediaIdentity(id,number,action))throw Error('本卡设置或项目已变化，媒体报价已作废。');
        if(!response.quoteId||response.action!==action||response.maxCalls!==1||!Number.isFinite(response.totalCredits)||response.totalCredits<=0||response.segmentId!==undefined&&response.segmentId!==id||response.cardNumber!==undefined&&response.cardNumber!==number||action==='video'&&(response.duration??response.durationSeconds)!==undefined&&(response.duration??response.durationSeconds)!==duration)throw Error('媒体报价身份、所选生成时长或费用无效，未开放提交。');
        if(directSubmit&&(response.segmentId!==id||response.cardNumber!==number||(response.duration??response.durationSeconds)!==duration||response.resolution!==selected.resolution||response.ratio!==selected.ratio))throw Error('视频报价与当前卡片或生成设置不一致，未提交；请刷新核对。');
        const prepared={...response,notice:[response.notice,response.pricingNote172].filter(Boolean).join(' '),kind:'media',segmentId:id,cardNumber:number,durationSeconds:duration,directSubmit,token};quotes.set(prepared.quoteId,prepared);
        // The Generate click is approval for this video only. Keep the server
        // quote contract without briefly opening or replacing another modal.
        if(!directSubmit)view.quote=prepared;
        message(directSubmit?'视频费用已核对，正在提交本卡视频。':'媒体免费核价完成；确认后提交本次媒体，不会隐式生成首帧。');return clone(prepared);
      }catch(error){message(error.message,true);throw error;}finally{end(op);}
    }
    async function confirmMediaQuote(quoted) {
      const pending=quoted||view.quote;if(disposed||!pending||!quotes.has(pending.quoteId)||pending.kind!=='media'||operationBlocked(view,pending.segmentId,pending.cardNumber)||scopeActive(pending.segmentId,pending.cardNumber)||mediaBlocked(pending.segmentId,pending.cardNumber)||pending.token!==mediaIdentity(pending.segmentId,pending.cardNumber,pending.action))throw Error('本次生成设置已变化或任务正在执行，请重新点击生成。');
      const key=mediaKey(pending.segmentId,pending.cardNumber);view.mediaStarted[key]=Date.now();delete view.mediaProgress[key];quotes.delete(pending.quoteId);if(view.quote?.quoteId===pending.quoteId)view.quote=null;const op=begin('segment',pending.segmentId,pending.cardNumber,'media'),scope=trackMedia(key,{mode:'submit',quoteId:pending.quoteId});message('正在提交已确认的本卡媒体请求，不自动提交其他卡。');
      try{const response=await api('/api/visual/macro/media/submit',{projectId,quoteId:pending.quoteId,confirmed:true});if(!response.taskId)throw Error('媒体提交未返回任务号，请免费核对原任务，勿重新生成。');adoptMedia(key,scope,response);message(response.message||'本卡媒体任务已提交，等待真实结果；不会自动重新生成。');return response.taskId;}
      catch(error){const outcome=await reconcileMediaFailure(key,scope);if(outcome?.completed){message('本卡原视频已保存，已解除旧等待；没有重新生成或新增扣费。');return outcome;}message(`媒体提交结果待核对：${error.message}。可免费查询原任务，不会自动重提。`,true);throw error;}finally{end(op);}
    }
    async function cancelSceneVideoBatch230(batchId){
      const batch=sceneBatches230.get(batchId);if(!batch||batch.state==='submitting'||batch.state==='done')return;
      sceneBatches230.delete(batchId);batch.state='cancelled';
      const ids=batch.quotes.map(row=>row.quoteId);for(const id of ids)quotes.delete(id);
      view.sceneVideoBatches230[batch.segmentId]={state:'cancelled',submitted:0,total:ids.length};emit();
      if(ids.length)try{await api('/api/visual/macro/media/cancel-quotes',{projectId,quoteIds:ids});}catch(_){/* Free quotes expire; never submit them here. */}
    }
    async function quoteSceneVideos230(id,beforeQuote){
      assertProject();if(!view.loaded||!view.catalog)throw Error('请等待本项目与视频模型设置读取完成。');
      if([...sceneBatches230.values()].some(row=>row.segmentId===id&&['quoting','ready','submitting'].includes(row.state)))throw Error('本场批量视频正在核价或提交，请等待原操作。');
      const plan=sceneVideoPlan230(view,id),batchId=String(++operationId)+':'+Date.now(),batch={...plan,batchId,quotes:[],state:'quoting'};
      sceneBatches230.set(batchId,batch);
      view.sceneVideoBatches230[id]={state:'quoting',batchId,submitted:0,total:plan.cardNumbers.length};emit();
      try{
        if(!plan.cardNumbers.length)throw Error('本场没有可提交的新视频；已有视频、进行中和未就绪卡片均已跳过。');
        const captured=[];
        for(const number of plan.cardNumbers){
          if(disposed)throw Error('项目已关闭，未提交余下视频。');
          if(beforeQuote)await beforeQuote(number);
          const card=ownedCard(id,number),selected=mediaSelection(id,number,'video'),issue=mediaIssue(view.catalog,'video',selected,card.durationSeconds,card)||tailFrameIssue237(mediaModels(view.catalog,'video').find(row=>row.model===selected.model),selected,number);
          if(issue)throw Error(issue);
          captured.push({number,selected,token:mediaIdentity(id,number,'video'),duration:selected.duration??mediaGenerationDuration(card)});
        }
        batch.tailFrameContinuation=captured.some(row=>row.selected.tailFrameContinuation===true);
        batch.captured=captured;
        // These are existing published fixed prices. Future tails do not exist
        // until predecessors finish; no placeholder images or paid calls here.
        const response=await api('/api/visual/macro/media/scene-quote',{projectId,segmentId:id,choices:captured.map(row=>{const choice=mediaPayload234(row.selected);if(batch.tailFrameContinuation){delete choice.tailFrameContinuation;delete choice.tailFrameMode;}return {cardNumber:row.number,...choice};})});
        const rows=response?.quotes||[];
        if(sceneBatches230.get(batchId)!==batch||batch.state!=='quoting'){
          const quoteIds=rows.filter(row=>typeof row?.quoteId==='string').map(row=>row.quoteId);
          if(quoteIds.length)try{await api('/api/visual/macro/media/cancel-quotes',{projectId,quoteIds});}catch(_){}
          throw Error('本场批量操作已取消，未提交生成。');
        }
        batch.quotes=rows.filter(row=>row?.quoteId).map(row=>({...row,kind:'media',segmentId:id,directSubmit:true}));
        if(disposed||response.projectId!==projectId||response.segmentId!==id||rows.length!==captured.length||new Set(rows.map(row=>row.quoteId)).size!==rows.length)throw Error('本场报价身份或数量变化，未提交生成。');
        batch.quotes=captured.map(capture=>{
          const row=rows.find(item=>item.cardNumber===capture.number);
          if(!row||!row.quoteId||row.action!=='video'||row.segmentId!==id||row.maxCalls!==1||!Number.isFinite(row.totalCredits)||row.totalCredits<=0||(row.duration??row.durationSeconds)!==capture.duration||row.resolution!==capture.selected.resolution||row.ratio!==capture.selected.ratio||capture.token!==mediaIdentity(id,capture.number,'video'))throw Error('本卡设置、生成时长或报价已变化，未提交生成。');
          return {...row,kind:'media',durationSeconds:capture.duration,directSubmit:true,token:capture.token};
        });
        for(const row of batch.quotes)quotes.set(row.quoteId,row);
        batch.state='ready';batch.totalCredits=Math.round(batch.quotes.reduce((sum,row)=>sum+row.totalCredits,0)*100)/100;
        view.sceneVideoBatches230[id]={state:'ready',submitted:0,total:batch.quotes.length};emit();
        return clone({...batch,quotes:batch.quotes.map(row=>({quoteId:row.quoteId,cardNumber:row.cardNumber,modelName:row.modelName,totalCredits:row.totalCredits,durationSeconds:row.durationSeconds}))});
      }catch(error){await cancelSceneVideoBatch230(batchId);throw error;}
    }
    async function confirmSceneVideos230(batchId){
      const batch=sceneBatches230.get(batchId);
      if(!batch||batch.state!=='ready'||disposed)throw Error('本场批量确认已失效或已提交，未重复生成。');
      batch.state='submitting';let cursor=0;const submitted=[],failed=[];
      const publish=()=>{view.sceneVideoBatches230[batch.segmentId]={state:'submitting',submitted:submitted.length,failed:failed.length,total:batch.quotes.length};emit();};publish();
      const worker=async()=>{while(cursor<batch.quotes.length){const quote=batch.quotes[cursor++];try{const taskId=await confirmMediaQuote(quote);submitted.push({cardNumber:quote.cardNumber,taskId});}catch(error){failed.push({cardNumber:quote.cardNumber,message:error.message});}publish();}};
      if(batch.tailFrameContinuation){
        // Confirmation covers fixed published amounts, not fabricated future
        // frames. Prepare each real tail only after its predecessor is saved.
        const initialIds=batch.quotes.map(row=>row.quoteId);for(const id of initialIds)quotes.delete(id);
        try{await api('/api/visual/macro/media/cancel-quotes',{projectId,quoteIds:initialIds});}catch(_){}
        for(const approved of batch.quotes){
          let fresh;
          try{
            const captured=batch.captured.find(row=>row.number===approved.cardNumber);
            if(disposed||!captured||captured.token!==mediaIdentity(batch.segmentId,approved.cardNumber,'video'))throw Error('当前项目、卡片或设置已变化，余下视频未提交。');
            fresh=await quoteMedia(batch.segmentId,approved.cardNumber,'video',{directSubmit:true});
            if(fresh.totalCredits!==approved.totalCredits||fresh.durationSeconds!==approved.durationSeconds||fresh.resolution!==approved.resolution||fresh.ratio!==approved.ratio)throw Error('已发布费用或规格发生变化，余下视频需重新确认。');
            const taskId=await confirmMediaQuote(fresh),key=mediaKey(batch.segmentId,approved.cardNumber),owned=view.mediaRequests[key];
            submitted.push({cardNumber:approved.cardNumber,taskId});publish();
            if(taskId?.completed===true)continue;
            for(;;){
              if(disposed)throw Error('已停止本场后续提交；原视频任务继续保留，可回项目查询。');
              const polled=await pollMediaOnce(key),completed=mediaOutcome(mediaSlot(key),owned);
              if(completed?.completed)break;
              if(polled.done)throw Error('本卡视频未确认保存，后续尾帧依赖已暂停；请先接回原任务。');
              await new Promise(resolve=>setTimeout(resolve,1200));
            }
          }catch(error){
            if(fresh&&quotes.has(fresh.quoteId)){quotes.delete(fresh.quoteId);try{await api('/api/visual/macro/media/cancel-quotes',{projectId,quoteIds:[fresh.quoteId]});}catch(_){}}
            failed.push({cardNumber:approved.cardNumber,message:error.message});publish();break;
          }
        }
      }else await Promise.all(Array.from({length:Math.min(3,batch.quotes.length)},worker));
      const unused=batch.quotes.filter(row=>quotes.has(row.quoteId)).map(row=>row.quoteId);
      for(const id of unused)quotes.delete(id);
      if(unused.length)try{await api('/api/visual/macro/media/cancel-quotes',{projectId,quoteIds:unused});}catch(_){}
      batch.state='done';view.sceneVideoBatches230[batch.segmentId]={state:'done',submitted:submitted.length,failed:failed.length,total:batch.quotes.length};
      message(`本场批量视频已提交 ${submitted.length}/${batch.quotes.length} 张${failed.length?batch.tailFrameContinuation?'，尾帧依赖已暂停，余下卡片未自动提交，请先核对当前原任务':`，${failed.length}张未提交或待核对，未自动重试`:''}；其他场次未提交。`,failed.length>0);
      return {segmentId:batch.segmentId,submitted,failed,skipped:clone(batch.skipped),totalCredits:batch.totalCredits};
    }
    async function observeMedia(id,number) {
      ownedCard(id,number);if(operationBlocked(view,id,number))throw Error('本卡正在处理上一项操作。');const key=mediaKey(id,number);if(!mediaHasOriginal(id,number))throw Error('没有可免费查询的原媒体任务。');const op=begin('segment',id,number,'observe'),scope=trackMedia(key,{mode:'observe'});
      try{const resolved=clearResolvedMedia(key,scope);if(resolved?.completed){message('本卡原视频已保存，已解除旧等待；没有重新生成或新增扣费。');return resolved;}const response=await api('/api/visual/macro/media/observe',{projectId,segmentId:id,cardNumber:number,...(scope.requestId?{requestId:scope.requestId}:{})});if(!ownsMedia(key,scope))return {stale:true};adoptMedia(key,scope,response);await load({background:true});const outcome=mediaOutcome(mediaSlot(key),scope);if(!ownsMedia(key,scope)&&!outcome?.completed)return {stale:true};message(response.message || (response.completed||outcome?.completed?'本卡原视频已保存，已解除旧等待。':'已免费查询原媒体任务，不创建新生成、不新增扣费。'));return response;}
      catch(error){const outcome=await reconcileMediaFailure(key,scope);if(outcome?.stale)return outcome;if(outcome?.completed){message('本卡原视频已保存，已解除旧等待；没有重新生成或新增扣费。');return outcome;}message(`查询原媒体任务失败：${error.message}。仍保留原请求，不会重新生成。`,true);throw error;}finally{end(op);}
    }
    async function detachMedia(id,number,requestId) {
      ownedCard(id,number);if(detachBlocked(view,id,number))throw Error('本卡正在提交或保存，请等待该操作完成后解除。');const active=mediaRecord(view.snapshot,id,number).active||{};if(!requestId||active.requestId!==requestId)throw Error('本卡原任务已变化，请先刷新状态；没有解除其他请求。');
      const key=mediaKey(id,number),previous=view.mediaRequests[key],op=begin('segment',id,number,'detach'),scope=trackMedia(key,{mode:'detach',requestId});message('正在解除本机等待；不会取消上游任务或退费。');
      try{
        const response=await api('/api/visual/macro/media/detach',{projectId,segmentId:id,cardNumber:number,requestId});
        if(!ownsMedia(key,scope)&&mediaOutcome(mediaSlot(key),scope)?.status!=='detached')return {stale:true};
        if(response.ok!==true||response.requestId&&response.requestId!==requestId)throw Error('解除回执身份不匹配，请刷新核对原请求。');
        const detached=response.detached&&response.detached.requestId===requestId?response.detached:{requestId,status:'detached'};
        const receipts=detachedReceipts.get(key)||new Map();receipts.set(requestId,detached);detachedReceipts.set(key,receipts);
        view.snapshot=withDetachedReceipts(view.snapshot);
        delete view.mediaTasks[key];delete view.mediaRequests[key];delete view.mediaUnknown[key];delete view.mediaProgress[key];delete view.mediaStarted[key];
        for(const [token,row]of Object.entries(view.operations))if(row.kind==='observe'&&overlaps(row,id,number))delete view.operations[token];
        // The exact durable receipt releases this card immediately. Do not
        // invalidate a whole-project read: it may be delivering a sibling's
        // finished video. Old reads are filtered only for this request above.
        message(response.message||'本卡已解除本机等待；原任务记录保留。');return response;
      }
      catch(error){
        if(!ownsMedia(key,scope))return {stale:true};
        // A lost HTTP response is not proof that the local detach failed.
        // Inspect the exact durable receipt once; never repeat the mutation
        // or submit a replacement generation from this recovery path.
        try{await load({background:true});}catch(_){/* preserve unresolved identity */}
        const outcome=mediaOutcome(mediaSlot(key),scope);
        if(outcome?.status==='detached'||outcome?.completed){
          if(outcome.status==='detached'){
            const receipt=(mediaSlot(key).attempts||[]).find(row=>row.requestId===requestId&&row.status==='detached');
            const receipts=detachedReceipts.get(key)||new Map();receipts.set(requestId,receipt);detachedReceipts.set(key,receipts);
          }
          for(const [token,row]of Object.entries(view.operations))if(row.kind==='observe'&&overlaps(row,id,number))delete view.operations[token];
          message(outcome.completed?'本卡原视频已保存，旧等待已结束；没有重新生成或新增扣费。':'已核实原解除回执，本卡本机等待已解除；原订单记录保留。');
          return {ok:true,recovered:true,requestId,...outcome};
        }
        if(ownsMedia(key,scope)){if(previous)view.mediaRequests[key]=previous;else delete view.mediaRequests[key];message(`解除任务失败：${error.message}。原请求仍保留。`,true);}throw error;
      }finally{end(op);}
    }
    async function reconnectMedia(settings={}) {
      const pending=[];
      for(const [id,cards] of Object.entries(view.snapshot.media || {}))for(const [number,record] of Object.entries(cards || {})){
        if(!mediaActive(record))continue;
        const active=record.active || {},key=mediaKey(id,Number(number));
        // Another card may have been detached while a previous reader was
        // awaiting I/O. Never replay the captured old snapshot's next entry.
        const currentRecord=mediaSlot(key),current=currentRecord.active||{};
        const originalIdentity=row=>String(row.requestId||row.orderId||row.taskId||row.createdAt||'legacy');
        if(!mediaActive(currentRecord)||originalIdentity(current)!==originalIdentity(active))continue;
        const identity=String(active.requestId || active.orderId || active.createdAt || 'legacy');
        const attempt=`${key}:${identity}`;
        if(view.mediaTasks[key]||operationBlocked(view,id,Number(number)))continue;
        if(mediaReconnectAttempts.has(attempt)&&settings.retryPaused!==true)continue;
        mediaReconnectAttempts.add(attempt);
        try{pending.push(await observeMedia(id,Number(number)));}
        catch(error){mediaReconnectAttempts.delete(attempt);pending.push({segmentId:id,cardNumber:Number(number),error:String(error?.message || error)});}
      }
      return pending;
    }
    async function pollMediaOnce(key) {
      const taskId=view.mediaTasks[key],scope=view.mediaRequests[key];if(!taskId)return {done:true};let task;
      try{task=await api(`/api/tasks/${encodeURIComponent(taskId)}`);}catch(error){if(disposed||view.mediaTasks[key]!==taskId||view.mediaRequests[key]!==scope)return {done:!view.mediaTasks[key],stale:true};throw error;}
      if(disposed||view.mediaTasks[key]!==taskId||view.mediaRequests[key]!==scope)return {done:!view.mediaTasks[key],stale:true};
      view.mediaProgress[key]={...view.mediaProgress[key],state:task.state,message:task.message||'',createdAt:task.createdAt,concurrencyLimit:task.concurrencyLimit,...(Number.isFinite(task.progress)?{progress:task.progress}:{})};
      if(['done','error','failed'].includes(task.state)){delete view.mediaTasks[key];await load({background:true});const saved=mediaOutcome(mediaSlot(key),scope);if(!ownsMedia(key,scope)&&!saved?.completed)return {done:!view.mediaTasks[key],stale:true};const outcome=clearResolvedMedia(key,scope);message(outcome?.completed?'本卡原视频已保存，已解除旧等待；没有重新生成或新增扣费。':task.state==='done'?'媒体任务返回，已刷新真实文件与历史；没有视频文件时不视为成片完成。':`媒体任务未完成：${task.error||task.message||'请免费核对原任务'}。不会自动重新生成。`,!outcome?.completed&&task.state!=='done');return {done:true};}
      if(!['queued','running'].includes(task.state)){view.mediaUnknown[key]=scope||{projectId,localTaskId:taskId};delete view.mediaTasks[key];await load({background:true});const saved=mediaOutcome(mediaSlot(key),scope);if(!ownsMedia(key,scope)&&!saved?.completed)return {done:!view.mediaTasks[key],stale:true};if(clearResolvedMedia(key,scope)?.completed){message('本卡原视频已保存，已解除旧等待；没有重新生成或新增扣费。');return {done:true};}message('原媒体任务结果未明确，只可免费核对，不会新建收费调用。',true);return {done:true};}message(`${task.message||'正在等待本卡媒体返回'}。不自动重试生成。`);return {done:false};
    }
    function exported() {
      return {kind:'macro-arrangement-development-preview',projectId,version:view.snapshot.version,sourceHash:view.snapshot.sourceHash,segments:segments(view.snapshot).filter(row=>view.filter==='all'||segmentId(row)===view.filter).map(row=>({segment:row,record:view.snapshot.segments?.[segmentId(row)] || {}}))};
    }
    return {load,updateDraft,quote,confirmQuote,cancelQuote,selectSegment,pollOnce,recover,checkCardTask,readStoryboardReturn,readPipelineReturn,updateReturnedDraft,saveReturnedDraft,previewRegroup,applyRegroup,loadCatalog,invalidateCatalog232,invalidateMediaPrices156,saveCardDraft,saveCardSource,uploadReference,deleteReference,updateMediaDraft,quoteMedia,confirmMediaQuote,quoteSceneVideos230,confirmSceneVideos230,cancelSceneVideoBatch230,observeMedia,detachMedia,reconnectMedia,pollMediaOnce,exported,getState:()=>clone(view),peekState:()=>view,getDraft:()=>clone(draft),dispose:()=>{disposed=true;epoch++;loadEpoch++;}};
  }
  function mount(document,win) {
    const $=id=>document.getElementById(id);
    if(win.parent!==win && new URLSearchParams(win.location.search).get('embedded')==='1') {
      const back=$('macroBack'); if(back)back.href='/static/visual.html?embedded=1';
      const report=()=>{const main=document.querySelector('main'),box=main?.getBoundingClientRect();const height=Math.ceil(Math.max((main?.offsetTop||0)+(main?.scrollHeight||0),(box?.bottom||0)+(win.scrollY||0)))+24;win.parent.postMessage({type:'workflow-height',height},win.location.origin);};
      new win.ResizeObserver(report).observe(document.querySelector('main'));win.addEventListener('load',report);
    }
    const projectId=new URLSearchParams(win.location.search).get('projectId') || '';
    let controller,editors,watching=false,sourceInitialized=false;
    const referenceOpen = new Map(),sourceOpen=new Map(),fillModes=new Map(),regenerating=new Map();
    const regeneratingScope=(id,number)=>[...regenerating.values()].some(row=>row.segmentId===id&&(!number||row.cardNumber===number));
    const showError=error=>{if(win.ModelActivity)win.ModelActivity.set($('macroStatus'),{state:'error',message:error.message || String(error)});else $('macroStatus').textContent=error.message || String(error);$('macroStatus').classList.add('error');};
    const request=async(url,options)=>{const response=await win.fetch(url,{method:options.method,credentials:'same-origin',cache:'no-store',...(options.body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(options.body)} : {})});let data;try{data=await response.json();}catch(_){throw Error('接口未返回可识别数据，请刷新状态核对。');}const terminalTask=url.startsWith('/api/tasks/')&&['error','failed'].includes(data.state);if(!response.ok || data.error && !data.projectId&&!terminalTask)throw Error(data.error || `接口返回 ${response.status}`);return data;};
    const draftFromInputs=()=>({source:$('macroSource').value,policy:{mode:$('macroMode').value,maxSeconds:Number($('macroMaxSeconds').value),requestedSeconds:$('macroMode').value==='custom' ? Number($('macroTarget').value) : 0,arrangementMode:'shot_first'}});
    function render(view,draft) {
      view={...view,operations:{...view.operations,...Object.fromEntries(regenerating)}};
      const notice=sceneStatusNotice(view.snapshot,view.filter,view.message);
      if(notice)view={...view,message:notice,error:false};
      const sceneIssue=!anyTextActive(view)&&!snapshotTextInFlight(view.snapshot)&&view.filter!=='all'?sceneIssueMessage(view.snapshot,view.filter):'';
      if(sceneIssue)view={...view,message:sceneIssue,error:true};
      editors?.capture();
      if(!sourceInitialized || $('macroSource').value!==draft.source){$('macroSource').value=draft.source;sourceInitialized=true;}
      $('macroMode').value=draft.policy.mode || 'smart';$('macroMaxSeconds').value=String(draft.policy.maxSeconds || 15);if(draft.policy.requestedSeconds)$('macroTarget').value=String(draft.policy.requestedSeconds);
      $('macroTargetField').hidden=draft.policy.mode!=='custom';
      const planned=segments(view.snapshot),active=anyTextActive(view) || ['queued','running'].includes(view.snapshot.task?.state),locked=!!view.snapshot.sourceLocked || planned.length>0 || active;
      $('macroSource').readOnly=locked || !view.loaded;for(const id of ['macroMode','macroMaxSeconds','macroTarget'])$(id).disabled=locked || !view.loaded;
      $('sourceLockNote').textContent=locked ? '已有大段工作区／任务，原稿与设置已锁定' : '没有计划时可编辑；变更会使旧报价失效';
      $('macroRefresh').disabled=view.busy || !projectIdValid(projectId);$('macroPlanQuote').disabled=!view.loaded || planned.length>0 || active || view.busy;
      if($('macroResume')){$('macroResume').hidden=!view.snapshot.canResume;$('macroResume').disabled=view.busy||active;}
      $('macroStatus').hidden=Object.keys(view.mediaTasks||{}).length>0&&!active&&!view.busy&&!view.error;
      if(win.ModelActivity)win.ModelActivity.set($('macroStatus'),{state:view.error?'error':view.busy||active||Object.keys(view.mediaTasks||{}).length?'pending':'success',message:view.message || '已读取项目'});else $('macroStatus').textContent=view.busy||active?'':view.message || '已读取项目';$('macroStatus').classList.toggle('error',view.error);
      $('macroSegmentFilter').innerHTML='<option value="all">全部场次</option>'+planned.map((row,index)=>`<option value="${esc(segmentId(row))}">第 ${index+1} 场：${esc(row.title)}</option>`).join('');$('macroSegmentFilter').value=view.filter;
      const visible=planned.filter(row=>view.filter==='all'||segmentId(row)===view.filter);
      const count=visible.reduce((sum,row)=>sum+readSceneCards(view.snapshot,row).length,0);
      $('macroSummary').textContent=view.snapshot.shotFirst?`已完成 ${view.snapshot.completedSceneCount||0}/${planned.length} 场分镜 · 当前显示 ${visible.length} 场、${count} 张卡。已完成场次可直接生成视频。`:`共 ${planned.length} 个剧情大段${view.snapshot.plan?.batchCompositionVersion===2?` · 已切分 ${view.snapshot.plan.completedSceneIds?.length||0}/${planned.length} 场，后台批次 ${view.snapshot.plan.completedBatchCount}/${view.snapshot.plan.totalBatchCount}`:''} · 当前显示 ${visible.length} 场、${count} 张卡。每场约十卡仅供规划，不是固定卡数或时长。`;
      $('macroSegments').innerHTML=visible.map(row=>{
        const id=segmentId(row),index=planned.indexOf(row),record=view.snapshot.segments?.[id] || {},cards=readSceneCards(view.snapshot,row),waitingCut=(view.snapshot.plan?.pendingSceneIds||[]).includes(id),status=waitingCut?'waiting_cut':view.snapshot.active?.segmentId===id?view.snapshot.active.status:record.status||'planned',missing=cards.filter(card=>!cardComplete(card)).length,mode=fillModes.get(id)||'missing';
        const pendingLabel=view.snapshot.shotFirst?(active?'后台编排中，镜头尚未返回':'镜头尚未返回，请继续未完成编排'):(waitingCut?'等待后台切卡':'历史场次尚未切卡，卡数未确定');
        return `<article class="segment"><h3>第 ${index+1} 场 · ${esc(row.title)}</h3><p class="purpose">${esc(row.purpose)}</p><p class="meta">原文单元 ${esc(row.sourceStart)}—${esc(row.sourceEnd)} · ${cards.length ? `${cards.length} 张卡` : pendingLabel}</p><p class="state">${esc(!cards.length&&view.snapshot.shotFirst?pendingLabel:statusNames[status] || status)}</p>${record.error ? `<p class="segment-error">${esc(record.error)}</p>` : ''}<div class="actions"><label class="scene-fill-mode">补齐范围<select data-scene-fill-mode data-segment="${esc(id)}" aria-label="补齐分镜范围" ${!cards.length?'disabled':''}><option value="missing" ${mode==='missing'?'selected':''}>只补齐空缺${cards.length?'（'+missing+'张）':''}</option><option value="all" ${mode==='all'?'selected':''}>全部重新补齐${cards.length?'（'+cards.length+'张）':''}</option></select></label><button class="primary scene-fill-button" type="button" data-quote-segment="${esc(id)}" ${!cards.length||view.busy || operationBlocked(view,id)||textBlocked(view,id)||cards.length&&!missing&&(mode==='missing'||!view.snapshot.repeatableActions&&!view.snapshot.shotFirst) ? 'disabled' : ''}>${cards.length?'补齐本场次分镜':pendingLabel}</button></div></article>`;
      }).join('') || '<p class="empty">尚未识别剧情大段。免费检查通过并确认后才调用模型。</p>';
      $('macroCards').querySelectorAll('details[data-reference-key]').forEach(node=>referenceOpen.set(node.dataset.referenceKey,node.open));
      $('macroCards').querySelectorAll('details[data-source-key]').forEach(node=>sourceOpen.set(node.dataset.sourceKey,node.open));
      reconcileCards($('macroCards'),renderCards(view.snapshot,view.filter,view));
      $('macroCards').querySelectorAll('details[data-reference-key]').forEach(node=>node.open=referenceOpen.get(node.dataset.referenceKey)===true);
      $('macroCards').querySelectorAll('details[data-source-key]').forEach(node=>node.open=sourceOpen.get(node.dataset.sourceKey)===true);
      editors?.mount();win.AspectRatio?.enhance($('macroCards'));for(const node of $('macroCards').querySelectorAll('[data-model-pending]'))win.ModelActivity?.set(node,{state:'pending'});
      $('macroExport').disabled=count===0;
      const canRecover=!!view.snapshot.active?.claimId && ['needs_review','reserving','submitted','returned'].includes(view.snapshot.active.status);
      $('macroRecover').hidden=!canRecover;$('macroRecoveryNote').hidden=!canRecover;$('macroRecover').disabled=view.busy;
      const dialog=$('macroQuoteDialog');
      if(view.quote){const quote=view.quote;$('macroQuoteContent').textContent=quoteSummary(quote,quote.kind==='media'?'生成本卡视频':quote.action==='plan'?'识别剧本、规划场次与剧情分割':quote.cardNumber?'补齐本卡分镜':'补齐本场次分镜');$('macroQuoteContent').style.whiteSpace='pre-line';$('macroQuoteConfirm').disabled=view.busy;if(!dialog.open)dialog.showModal();}
      else if(dialog.open)dialog.close();
    }
    controller=createController({projectId,request,onChange:render});
    editors=win.MacroCardEditors?.create({root:$('macroCards'),controller:()=>controller,locked:regeneratingScope,confirm:async message=>win.confirm(message)});
    async function regenerateCard(button,id,number){
      if(regeneratingScope(id,number))return;
      const token='regenerate:'+mediaKey(id,number);
      regenerating.set(token,{action:'segment',segmentId:id,cardNumber:number,kind:'text',state:'running',phase:'preparing'});
      button.disabled=true;
      const wait=document.createElement('div');wait.className='card-text-wait';wait.setAttribute('role','status');
      wait.innerHTML='<i class="video-generation-spinner" aria-hidden="true"></i><strong>正在准备本卡任务…</strong>';
      button.closest('.video-card')?.querySelector('.shot-list')?.prepend(wait);
      try{
        // Paint the clicked card before saving or validating a large project.
        await new Promise(resolve=>win.requestAnimationFrame(()=>win.setTimeout(resolve,0)));
        render(controller.peekState(),controller.getDraft());
        await editors?.saveSource(id,number);
        const quoted=await controller.quote('segment',id,number,{directSubmit:true});
        if(quoted){await controller.confirmQuote(quoted);watch().catch(showError);}
      }finally{regenerating.delete(token);wait.remove();render(controller.peekState(),controller.getDraft());}
    }
    async function generateMedia(button,id,number){
      if(regeneratingScope(id,number))return;
      const action=button.dataset.mediaQuote,directSubmit=action==='video',token='media:'+mediaKey(id,number),displayedCredits=Number(button.dataset.publishedCredits),catalogPending=controller.peekState().catalogRefreshPending251===true;
      // Acquire the local scope before the first await, including draft save.
      regenerating.set(token,{action:'segment',segmentId:id,cardNumber:number,kind:'media',state:'running',phase:'preparing'});button.disabled=true;
      try{
        await new Promise(resolve=>win.requestAnimationFrame(()=>win.setTimeout(resolve,0)));
        render(controller.peekState(),controller.getDraft());editors?.capture();
        if(editors?.sourceDraft(id,number)?.dirty)throw Error('本卡原文有未保存修改，请先保存原文并补齐本卡分镜。');
        editors?.assertReferencesReady233?.(id,number);
        await editors?.save(id,number);
        const quoted=await controller.quoteMedia(id,number,action,{directSubmit});
        if(directSubmit&&quoted){if(mediaQuoteNeedsConfirmation251(quoted,displayedCredits,catalogPending)&&!await (win.studioConfirm?win.studioConfirm(quoteSummary(quoted,'生成本卡视频')):Promise.resolve(win.confirm(quoteSummary(quoted,'生成本卡视频'))))){controller.cancelQuote();return;}await controller.confirmMediaQuote(quoted);watch().catch(showError);}
      }finally{regenerating.delete(token);render(controller.peekState(),controller.getDraft());}
    }
    async function watch(){if(watching)return;watching=true;try{for(;;){const current=controller.peekState();if(!current.activeTask&&!Object.keys(current.mediaTasks).length)break;for(const taskId of Object.keys(current.textTasks||{}))await controller.pollOnce(taskId);for(const key of Object.keys(current.mediaTasks))await controller.pollMediaOnce(key);const after=controller.peekState();if(!after.activeTask&&!Object.keys(after.mediaTasks).length)break;await new Promise(resolve=>win.setTimeout(resolve,1200));}}catch(error){showError(Error(`读取进度暂时中断：${error.message} 不会重新提交；可刷新核对原任务。`));}finally{watching=false;}}
    const load=async()=>{await controller.load();try{await controller.loadCatalog();}catch(error){showError(Error(`媒体目录不可用：${error.message}。文本结果仍保留，未提交媒体。`));}const reconnect=await controller.reconnectMedia();for(const item of reconnect)if(item.error)showError(Error(`场景${item.segmentId}卡${item.cardNumber}的原视频暂未接回：${item.error}。原订单和作品记录仍保留；可刷新后再次查询，不会重新生成。`));await watch();};
    $('macroRefresh').addEventListener('click',()=>load().catch(showError));
    for(const id of ['macroSource','macroMode','macroMaxSeconds','macroTarget'])$(id).addEventListener(id==='macroSource' ? 'input':'change',()=>{try{controller.updateDraft(draftFromInputs());}catch(error){showError(error);}});
    $('macroPlanQuote').addEventListener('click',()=>controller.quote('plan',undefined,undefined,{arrangementMode:'shot_first'}).catch(showError));
    $('macroResume')?.addEventListener('click',()=>controller.quote('plan_resume').catch(showError));
    $('macroSegments').addEventListener('click',event=>{const button=event.target.closest('[data-quote-segment]');if(button && !button.disabled&&!regeneratingScope(button.dataset.quoteSegment))controller.quote('segment',button.dataset.quoteSegment,undefined,{completionMode:fillModes.get(button.dataset.quoteSegment)||'missing'}).catch(showError);});
    $('macroSegments').addEventListener('change',event=>{const input=event.target.closest('[data-scene-fill-mode]');if(input&&['missing','all'].includes(input.value)){fillModes.set(input.dataset.segment,input.value);controller.cancelQuote();}});
    $('macroSegmentFilter').addEventListener('change',()=>{try{controller.selectSegment($('macroSegmentFilter').value);}catch(error){showError(error);}});
    $('macroQuoteCancel').addEventListener('click',()=>controller.cancelQuote());
    $('macroQuoteDialog').addEventListener('cancel',event=>{event.preventDefault();controller.cancelQuote();});
    $('macroQuoteConfirm').addEventListener('click',()=>{const run=controller.getState().quote?.kind==='media'?controller.confirmMediaQuote():controller.confirmQuote();run.then(watch).catch(showError);});
    $('macroRecover').addEventListener('click',()=>controller.recover().then(watch).catch(showError));
    $('macroCards').addEventListener('click',event=>{
      const button=event.target.closest('[data-card-regenerate],[data-card-recover],[data-storyboard-return],[data-media-quote],[data-media-observe],[data-media-detach]');if(!button||button.disabled)return;
      const id=button.dataset.segment,number=Number(button.dataset.card);
      if(regeneratingScope(id,number))return;
      if(button.hasAttribute('data-card-recover'))controller.checkCardTask(id,number).then(watch).catch(showError);
      else if(button.hasAttribute('data-storyboard-return'))controller.readStoryboardReturn(id,number).catch(showError);
      else if(button.hasAttribute('data-card-regenerate'))regenerateCard(button,id,number).catch(showError);
      else if(button.hasAttribute('data-media-observe'))controller.observeMedia(id,number).then(watch).catch(showError);
      else if(button.hasAttribute('data-media-detach')){const warning='确定解除本机对这张卡原视频任务的等待吗？\n\n原任务记录会保留，但软件不能保证取消上游任务或退款；原任务之后可能仍产生费用。解除后可重新核价并确认新任务，新的生成会按实际报价收费。';if(win.confirm(warning))controller.detachMedia(id,number,button.dataset.requestId).catch(showError);}
      else generateMedia(button,id,number).catch(showError);
    });
    $('macroCards').addEventListener('change',event=>{const control=event.target.closest('[data-media-param]');if(!control)return;const id=control.dataset.segment,number=Number(control.dataset.card),action=control.dataset.mediaAction,param=control.dataset.mediaParam;let patch;if(param==='reference'){const selected=editors?.get(id,number)?.referenceAssetIds || controller.getState().mediaDrafts[mediaKey(id,number)]?.[action]?.referenceAssetIds || [],refs=new Set(selected);if(control.checked)refs.add(control.value);else refs.delete(control.value);patch={referenceAssetIds:[...refs]};editors?.synchronizeReferences(id,number,patch.referenceAssetIds);}else patch={[param]:param==='tailFrameContinuation'?control.checked:param==='duration'?Number(control.value):control.value};try{controller.updateMediaDraft(id,number,action,patch);}catch(error){showError(error);}});
    $('macroExport').addEventListener('click',()=>{const url=win.URL.createObjectURL(new win.Blob([JSON.stringify(controller.exported(),null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=`剧情大段分镜预览-${projectId}.json`;anchor.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);});
    win.addEventListener('pagehide',()=>controller.dispose(),{once:true});render(controller.getState(),controller.getDraft());if(projectIdValid(projectId))load().catch(showError);else showError(Error('请从已有项目打开本页，地址须含 projectId。没有发起任何模型请求。'));
    return controller;
  }
  if(typeof document!=='undefined'){setInterval(()=>updateWaitTimes(document),1000);installDownloads(document,globalThis);}
  return {mediaQuoteNeedsConfirmation251,tailFrameLabel242,tailFrameUsage242,tailFrameCapabilityIssue239,tailFrameState239,clearMediaCache231,sceneVideoPlan230,renderStoryboardChecks,createController,pipelineReturnIdentity,sceneIssueMessage,sceneStatusNotice,renderCards,reconcileCards,readCards,readSceneCards,cardPrompt,cardComplete,cardIdentity228,validTextQuote,quoteSummary,renderStyle,escapeHTML:esc,projectIdValid,mediaUrl,mediaIssue,mediaCost,modelRoute234,routeModels234,mediaPayload234,updateWaitTimes,defaultMediaDraft,videoDurationOptions,cardReferenceSelection,mediaKey,operationBlocked,quoteBlocked,directRegenerationBlocked,cardRecoveryState,regroupReady,cardTextWork,textWorkTitle,textBlocked,anyTextActive,scopedPlanTextBlocked,savedTextTasks,isTerminalTextTask,textTaskInFlight,snapshotTextInFlight,savedCardActionsAvailable,cardMediaBlocked,mount};
});

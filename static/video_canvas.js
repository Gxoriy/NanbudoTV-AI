'use strict';
(() => {
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const G=CanvasGraph,labels={prompt:'创意提示词',person:'人物形象',scene:'场景',prop:'产品 / 道具',reference:'视频参考',generator:'视频生成',image_generator:'图片生成 / 编辑'};
  const WIRE_DETACH_DISTANCE=40;
  let wireGripZoom=-1;
  let doc=null,config={},styles=[],selected='',runNodeId='',pending='',selectedEdge=-1,zoom=1,pan={x:20,y:20},drag=null,linkDrag=null,wireDrag=null,rewire=null,linkMenu=null,suppressClick=false,layoutLocked=false,renderPending=false;
  let points=null,quote=null,dirty=false,pollTimer=null,pollFlight=null,quoteEpoch=0,revision=0,saveFlight=null,undoStack=[],redoStack=[];
  let disconnectFlight257=null,disconnectEpoch257=0;
  const nodeRuns=new Map(),textRuns=new Map(),nodeRevisions=new Map();
  const workingPhases=new Set(['submitting','queued','running','checking','finishing']);
  let textPollCursor=0,textPollTimer=null,textPollFlight=null,mediaFallbackCursor=0;
  let navigationBusy259=false;
  let listRead261=0,removedRead261=0,lifecycleFrozen261=false;
  let locationFile='',studio=null,assistant254=null,director254=null,directorPending254=null,gallery=null,tail283=null;
  let catalogFlight251=null,catalogAttempt251=-Infinity,catalogError251='',catalogPaintPending251=false,catalogQuotePending251=false,canvasOpenEpoch251=0,quoteReadEpoch251=0,canvasModuleActive251=true;
  const catalogSignature251=value=>JSON.stringify([value.visualConfigRevision,value.visualModels,value.visualImagePricing,value.visualVideoPricing,value.visualVideoSkuPricing172,value.breakdownModels]);
  function catalogStatus251(text,error=false){
    let status=$('canvasCatalogStatus251');if(!status){status=document.createElement('p');status.id='canvasCatalogStatus251';status.className='muted';status.setAttribute('role','status');$('quote').insertAdjacentElement('afterend',status);}
    status.textContent=text;status.dataset.error=String(error);
  }
  function paintCatalog251(){
    if(!catalogPaintPending251||!doc)return;
    const fields=$('fields'),active=document.activeElement;
    if(locked()||drag||linkDrag||wireDrag||studio?.dragging()||fields.contains(active)&&active?.matches('input,select,textarea,[contenteditable], [contenteditable] *'))return;
    catalogPaintPending251=false;const n=node(selected);
    // Patch only catalog controls. Do not remount rich text, media, or selection.
    if(n&&G.processors.has(n.kind)){
      const replace=(control,values,current)=>{if(!control)return;control.innerHTML=values.map(item=>'<option value="'+esc(item.value)+'">'+esc(item.label)+'</option>').join('');if(!values.some(item=>item.value===current))control.insertAdjacentHTML('beforeend','<option value="'+esc(current)+'">'+(current?'原设定（当前不可用）':'请选择已发布配置')+'</option>');control.value=current;};
      replace(fields.querySelector('[data-setting="model"]'),models(n).map(m=>({value:m.model,label:n.kind==='generator'?ModelPresentation.videoOptionLabel(config,m):m.displayName||'已发布图片模型'})),n.settings.model||'');
      replace(fields.querySelector('[data-setting="resolution"]'),prices(n.settings.model,n).map(p=>({value:p.resolution,label:p.resolution.toUpperCase()})),n.settings.resolution||'');
      if(n.kind==='generator'){
        fields.querySelectorAll('.canvas-duration-warning251,#useFixedDuration').forEach(item=>item.remove());
        const duration=fields.querySelector('[data-setting="duration"]');if(duration)duration.closest('label').outerHTML=durationFields(n);
        const ability=models(n).find(item=>item.model===n.settings.model)||{},ratios=ability.supportedAspectRatios||[];
        for(const option of fields.querySelector('[data-setting="ratio"]')?.options||[]){option.textContent=option.textContent.replace('（不支持）','');option.disabled=Boolean(ratios.length&&!ratios.includes(option.value)||option.value==='21:9'&&!ratios.includes('21:9')||!['9:16','16:9','1:1','21:9'].includes(option.value));if(option.disabled)option.textContent+='（不支持）';}
        fields.querySelectorAll('.canvas-capability-warning,.canvas-activity-warning').forEach(item=>item.remove());
        const issue=videoInputIssue(n),warning=ModelPresentation.activityWarning(config,n.settings.model,n.settings.resolution);
        if(issue&&!durationIssue(n))fields.insertAdjacentHTML('beforeend','<p class="muted canvas-capability-warning" role="status">'+esc(issue)+'</p>');
        if(warning)fields.insertAdjacentHTML('beforeend','<p class="muted canvas-activity-warning" role="note">'+esc(warning)+'</p>');
      }
    }
    document.querySelectorAll('.node[data-id] .node-settings-summary').forEach(summary=>{const item=node(summary.closest('[data-id]').dataset.id);if(item)summary.textContent='生成设置：'+(models(item).find(m=>m.model===item.settings?.model)?.displayName||'原模型（当前不可用）')+' · '+(item.kind==='generator'?(item.settings?.duration||15)+'秒':item.settings?.resolution?.toUpperCase()||'未选清晰度');});
    controls();
  }
  function refreshCanvasCatalog251(force=false){
    if(catalogFlight251)return catalogFlight251;
    if(!force&&Date.now()-catalogAttempt251<30000)return Promise.resolve({ok:!catalogError251,throttled:true});
    catalogAttempt251=Date.now();
    const work=(async()=>{try{
      const response=await fetch('/api/client/config?refresh=1',{cache:'no-store',signal:AbortSignal.timeout(15000)}),next=await response.json();
      if(!response.ok||next.ok===false||next.configError)throw Error(next.configError||next.error||'后台配置暂不可用');
      if(!Array.isArray(next.visualModels))throw Error('后台模型目录格式无效');
      const changed=catalogSignature251(config)!==catalogSignature251(next);config=next;catalogError251='';
      if(changed){
        // Repricing can replace an accepted quote, but cannot bypass input validation.
        catalogQuotePending251=Boolean(quote)||catalogQuotePending251;
        quote=null;quoteEpoch++;catalogPaintPending251=true;
        if(catalogQuotePending251&&doc&&!locked())$('quote').textContent='模型或价格已更新，请点击生成核对本次最新费用。';
        paintCatalog251();controls();
      }
      catalogStatus251('已同步后台模型与价格。');return {ok:true,changed};
    }catch(error){catalogError251=error.message;catalogStatus251('模型与价格同步暂未完成，'+(Array.isArray(config.visualModels)?'继续显示上次可用目录':'暂无可用目录')+'；稍后重新进入或聚焦重试：'+error.message,true);return {ok:false,error:error.message};}})();
    catalogFlight251=work;const clear=()=>{if(catalogFlight251===work)catalogFlight251=null;};work.then(clear,clear);return work;
  }
  function catalogOnEntry251(){if(document.visibilityState!=='hidden'&&canvasModuleActive251)refreshCanvasCatalog251();}
  const id=()=>crypto.randomUUID().replaceAll('-',''),node=nid=>doc?.graph.nodes.find(n=>n.id===nid),processor=()=>node(runNodeId);
  const globalLocked=()=>lifecycleFrozen261||navigationBusy259;
  const locked=()=>globalLocked()||!!doc?.generation;
  const persistedRun=nid=>doc?.nodeGenerations?.[nid]||(doc?.generation?.nodeId===nid?doc.generation:null);
  const generationPreflights=new Set();
  const checkingSelected281=()=>generationPreflights.has(JSON.stringify([canvasOpenEpoch251,doc?.id,runNodeId]));
  const ownsInputs=(run)=>workingPhases.has(run.phase)||run.phase==='unknown';
  const activeMediaNodes=()=>[...new Set([...Object.keys(doc?.nodeGenerations||{}),...[...nodeRuns].filter(([,run])=>ownsInputs(run)).map(([nid])=>nid)])];
  const reaches=(source,target)=>!!source&&!!target&&G.descendants(doc?.graph.edges||[],[source]).has(target);
  const inputLocked=nid=>locked()||activeMediaNodes().some(active=>reaches(nid,active));
  const runLocked=nid=>locked()||activeMediaNodes().some(active=>reaches(nid,active)||reaches(active,nid));
  const locallyRunning=()=>[...nodeRuns.values(),...textRuns.values()].some(run=>workingPhases.has(run.phase));
  const promptRevision=nid=>canvasOpenEpoch251+':'+(node(nid)?.kind==='generator'?revision:nodeRevisions.get(nid)||0);
  function generationInput(nid){
    const inputs=doc.graph.nodes.filter(item=>reaches(item.id,nid));
    const ids=new Set(inputs.map(item=>item.id));
    return JSON.stringify([inputs.map(item=>[item.id,item.kind,item.text,item.file,item.settings,item.speechProfile,
      item.id===nid?null:doc.nodeOutputs?.[item.id]]),doc.graph.edges.filter(edge=>ids.has(edge.target))]);
  }
  const media=file=>'/api/canvas/media?'+new URLSearchParams({id:doc.id,file});
  const message=(text,error=false)=>{window.ModelActivity?ModelActivity.text($('status'),text,error):$('status').textContent=text;};
  async function api(path,body){const response=await fetch(path,{cache:'no-store',...(body===undefined?{signal:AbortSignal.timeout(20000)}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'操作未完成'),{status:response.status});return data;}
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(error){message(error.message,true);}};
  const snapshot=()=>JSON.parse(JSON.stringify(doc.graph));
  function checkpoint(){undoStack.push(snapshot());if(undoStack.length>60)undoStack.shift();redoStack=[];}
  function invalidateQuote(){quote=null;quoteEpoch++;catalogQuotePending251=false;}
  function changed(affected=[],layoutOnly=false){dirty=true;revision++;if(!layoutOnly)invalidateQuote();$('saveCanvas').textContent='保存画布 · 未保存';for(const nid of affected)nodeRevisions.set(nid,(nodeRevisions.get(nid)||0)+1);for(const nid of G.descendants(doc.graph.edges,affected))if(doc.nodeOutputs?.[nid])doc.nodeOutputs[nid].stale=true;controls();assistant254?.sync();}
  function models(n=processor()){return (config.visualModels||[]).filter(m=>m.media===(n?.kind==='image_generator'?'image':'video')&&m.enabled&&m.gatewayReady&&!m.supportsPreciseEdit);}
  function prices(model,n=processor()){const item=models(n).find(row=>row.model===model);return item?.pricingMode==='live_quote'?(item.supportedResolutions||[]).map(resolution=>({model,resolution})):((n?.kind==='image_generator'?config.visualImagePricing:config.visualVideoPricing)||[]).filter(p=>p.model===model);}
  function settings(n,adoptFixed=false){
    if(!n||!G.processors.has(n.kind))return;n.settings=n.settings||{};
    const s=n.settings,available=models(n),defaults=config.breakdownModels||{},kind=n.kind==='image_generator'?'image':'video';
    if(!s.model)s.model=doc?.modelDefaults?.[kind]||available.find(m=>m.model===defaults[kind+'Model'])?.model||available[0]?.model||'';
    const rows=prices(s.model,n);if(!s.resolution||adoptFixed&&!rows.some(r=>r.resolution===s.resolution))s.resolution=rows[0]?.resolution||'';
    const missingDuration=s.duration===undefined||s.duration===null||s.duration==='';
    if(missingDuration)s.duration=15;s.ratio=s.ratio||'9:16';
    const fixed=n.kind==='generator'?ModelPresentation.videoDurationInfo(config,s.model).fixed:null;
    if(fixed&&(adoptFixed||missingDuration))s.duration=fixed;
  }
  function durationIssue(n=processor()){return n?.kind==='generator'?ModelPresentation.videoDurationIssue(config,n.settings?.model,Number(n.settings?.duration)):'';}
  function videoInputIssue(n=processor()){
    if(n?.kind!=='generator')return '';
    const tailIssue=tail283?.issue(n)||window.CanvasTail283?.issue(doc,n);if(tailIssue)return tailIssue;
    const ability=(config.visualModels||[]).find(item=>item.media==='video'&&item.model===n.settings.model)||{},ratios=ability.supportedAspectRatios||[];
    return durationIssue(n)||((ratios.length&&!ratios.includes(n.settings.ratio)||n.settings.ratio==='21:9'&&!ratios.includes('21:9'))?'该模型不支持当前画幅；原设定'+n.settings.ratio+'已保留，请调整画幅或更换模型。':'')||(ability.maxPromptChars&&Array.from(String(n.text||'')).length>ability.maxPromptChars?'当前节点提示词超过模型'+ability.maxPromptChars+'个字符的上限，未提交。完整提交还包含连接输入及风格说明，以后台提交前校验为准；请手动调整或选择其他模型，文本不会自动裁剪。':'');
  }
  function durationFields(n){
    const info=ModelPresentation.videoDurationInfo(config,n.settings.model),issue=durationIssue(n);
    if(info.fixed)return '<label><span>固定生成时长</span><select data-setting="duration" data-fixed-duration="true" disabled><option value="'+info.fixed+'">'+info.fixed+'秒（固定）</option></select></label>'+(issue?'<p class="muted canvas-duration-warning251">原设定'+esc(n.settings.duration)+'秒，与当前模型固定'+info.fixed+'秒冲突；请明确调整生成时长或更换模型。</p><button id="useFixedDuration" type="button">使用模型固定'+info.fixed+'秒</button>':'');
    return '<label><span>时长（秒）</span><input type="number" min="'+info.minimum+'" max="'+info.maximum+'" data-setting="duration" value="'+esc(n.settings.duration)+'"></label>'+(issue?'<p class="muted canvas-duration-warning251">'+esc(issue)+'；原设定已保留，请调整时长或更换模型。</p>':'');
  }
  function controls(){const block=locked(),runBlock=runLocked(runNodeId),selectedBlock=inputLocked(selected),cost=Number(quote?.quote?.estimatedPoints),creditValid=Number.isFinite(points)&&points>=0,costValid=Number.isFinite(cost)&&cost>0;
    paintGenerationActivity257();
    const checking=checkingSelected281();
    $('generate').disabled=checking||runBlock||!processor()||!!videoInputIssue()||!costValid&&!catalogQuotePending251||!creditValid||costValid&&points<cost;
    $('generate').setAttribute('aria-busy',String(checking));
    const ownRun=nodeRuns.get(runNodeId),legacy=doc?.generation;
    $('generate').textContent=checking?'正在核对本节点…':runBlock?(legacy||ownsInputs(ownRun||{})?'原任务处理中':'依赖节点原任务处理中'):!creditValid?'积分未确认 · 暂不可生成':costValid&&points<cost?'积分不足 · 请充值':catalogQuotePending251&&!costValid?'核对新价格并生成当前节点':'确认积分并生成当前节点';
    $('recharge').hidden=!costValid||!creditValid||points>=cost;
    $('observe').hidden=globalLocked()||(!persistedRun(runNodeId)&&!legacy&&ownRun?.phase!=='unknown')||workingPhases.has(ownRun?.phase);
    for(const eid of ['saveCanvas','canvasName'])$(eid).disabled=block||navigationBusy259;
    for(const eid of ['newCanvas','documents','removedCanvases'])$(eid).disabled=navigationBusy259;
    $('deleteCanvas').disabled=!doc||lifecycleFrozen261||locallyRunning()||navigationBusy259;
    document.querySelectorAll('[data-restore-canvas]').forEach(button=>button.disabled=navigationBusy259);
    document.querySelectorAll('[data-add]').forEach(el=>el.disabled=block);
    document.querySelectorAll('#fields input,#fields textarea,#fields select,#fields button').forEach(el=>el.disabled=selectedBlock||el.dataset.fixedDuration==='true');
    const disconnectButton=$('disconnectEdge');
    if(disconnectButton)disconnectButton.disabled=!canDisconnect(doc?.graph.edges[selectedEdge]);
    document.querySelectorAll('#fields .reference-mention-editor').forEach(el=>{el.contentEditable=String(!selectedBlock);el.setAttribute('aria-disabled',String(selectedBlock));});
    document.querySelectorAll('[data-result-action]').forEach(button=>{const action=button.dataset.resultAction;if(['save','rename','delete'].includes(action)){const file=button.closest('[data-result]')?.dataset.result,row=doc?.results?.find(r=>r.file===file);button.disabled=block||action==='save'&&!!row?.saved;}});
    $('undo').disabled=block||!undoStack.length;$('redo').disabled=block||!redoStack.length;$('duplicateNode').disabled=block||!node(selected);
    $('balance').textContent=creditValid?'可用积分 '+points.toFixed(2):'积分暂未确认，请检查网络；免费编辑仍可使用';
    $('runTitle').textContent=processor()?'运行：'+processor().name:'请选择生成节点';
    paintRunProgress();
  }
  function transform(){studio?.schedule();$('world').style.transform='translate('+pan.x+'px,'+pan.y+'px) scale('+zoom+')';$('zoomBadge').textContent=Math.round(zoom*100)+'%';if(wireGripZoom!==zoom)drawWires();$('wires').style.setProperty('--wire-hit-width',(22/zoom)+'px');$('wires').querySelectorAll('.wire-grip').forEach(grip=>grip.setAttribute('transform','translate('+grip.dataset.x+','+grip.dataset.y+') scale('+(1/zoom)+')'));}
  function wirePath(a,b){const dx=Math.max(90,Math.abs(b.x-a.x)*.5);return 'M'+a.x+','+a.y+' C'+(a.x+dx)+','+a.y+' '+(b.x-dx)+','+b.y+' '+b.x+','+b.y;}
  function endpoints(e){const a=node(e.source),b=node(e.target);return [{x:a.x+280,y:a.y+32},{x:b.x,y:b.y+32}];}
  function updateWireFlowVisibility() {
    const paused=!canvasModuleActive251||document.hidden||Boolean(gallery?.visible());
    $('wires').toggleAttribute('data-flow-paused',paused);
    $('viewport').toggleAttribute('data-generation-paused',paused);
  }
  function wireGripPoint(a,b,boxes){
    const dx=Math.max(90,Math.abs(b.x-a.x)*.5),margin=12/zoom;
    const at=t=>{const u=1-t;return {x:u*u*u*a.x+3*u*u*t*(a.x+dx)+3*u*t*t*(b.x-dx)+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*b.y};};
    const clear=p=>boxes.every(r=>p.x<r.x-margin||p.x>r.x+r.width+margin||p.y<r.y-margin||p.y>r.y+r.height+margin);
    // Prefer the middle, but keep the entire screen-sized grip off node cards.
    for(let i=0;i<19;i++){const t=.5+(i%2?1:-1)*Math.ceil(i/2)*.05,p=at(t);if(clear(p))return p;}
    // A narrow exposed gap may fall between every coarse sample. Only then
    // split at card boundaries and test the open intervals, avoiding a dense
    // scan on every wire redraw. X can turn twice on a backwards connection;
    // Y is monotone because both control points share their endpoint's Y.
    const cuts=[0,1],turns=[0,1],q=3*dx-(b.x-a.x),disc=.25-dx/(2*q);
    if(disc>0){const root=Math.sqrt(disc);turns.splice(1,0,.5-root,.5+root);}
    const crossing=(axis,value,parts)=>{for(let i=1;i<parts.length;i++){
      let lo=parts[i-1],hi=parts[i];const start=at(lo)[axis],end=at(hi)[axis];
      if(start===end||value<Math.min(start,end)||value>Math.max(start,end))continue;
      for(let j=0;j<28;j++){const mid=(lo+hi)/2;if((at(mid)[axis]<value)===(start<end))lo=mid;else hi=mid;}
      cuts.push((lo+hi)/2);
    }};
    for(const r of boxes){crossing('x',r.x-margin,turns);crossing('x',r.x+r.width+margin,turns);crossing('y',r.y-margin,[0,1]);crossing('y',r.y+r.height+margin,[0,1]);}
    cuts.sort((x,y)=>x-y);let nearest=null,best=Infinity;
    for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2,p=at(t);if(clear(p)&&Math.abs(t-.5)<best){nearest=p;best=Math.abs(t-.5);}}
    if(nearest)return nearest;
    return at(.5);
  }
  function drawWires(){if(!doc)return;wireGripZoom=zoom;
    // Keep the dash phase across redraws without running a per-frame JS loop.
    $('wires').style.setProperty('--wire-flow-delay', -(performance.now() % 1440) + 'ms');
    const boxes=Array.from($('nodes').querySelectorAll('.node')).map(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top),width:el.offsetWidth,height:el.offsetHeight}));$('wires').innerHTML=doc.graph.edges.map((e,i)=>{
      const [a,b]=endpoints(e),path=wirePath(a,b),{x,y}=wireGripPoint(a,b,boxes),name=esc(node(e.source).name)+'连接到'+esc(node(e.target).name),tip='按住连线向旁边拉，松手断开；撤销可恢复。';
      return '<g class="wire-group '+(i===selectedEdge?'selected':'')+'" data-edge="'+i+'">'+
        '<path class="wire-hit" data-edge="'+i+'" d="'+path+'" tabindex="0" role="button" aria-label="'+name+'，'+tip+'"><title>'+tip+'</title></path>'+
        '<path class="wire-line '+(i===selectedEdge?'selected':'')+'" data-edge="'+i+'" data-source="'+e.source+'" d="'+path+'"/>'+
        '<g class="wire-flow" aria-hidden="true"><path class="wire-flow-trail" d="'+path+'"/><path class="wire-flow-head" d="'+path+'"/></g>'+
        '<g class="wire-grip" data-edge="'+i+'" data-x="'+x+'" data-y="'+y+'" transform="translate('+x+','+y+') scale('+(1/zoom)+')" tabindex="0" role="button" aria-label="扯动以断开：'+name+'"><title>'+tip+'</title><circle r="10"/></g></g>';
    }).join('');
    // The broad line hit zones sit behind node cards. Only selected rewire
    // endpoints get a separate foreground layer, so headers remain clickable.
    const selectedWire=doc.graph.edges[selectedEdge];$('wireEndpoints').innerHTML=selectedWire?endpoints(selectedWire).map((p,i)=>'<circle class="wire-handle" data-end="'+(i?'target':'source')+'" data-edge="'+selectedEdge+'" cx="'+p.x+'" cy="'+p.y+'" r="9"/>').join(''):'';
    if(linkDrag) drawLinkPreview();
  }
  function drawLinkPreview(){
    const source=linkDrag.source?node(linkDrag.source):null;
    const target=linkDrag.target?node(linkDrag.target):null;
    const start=source?{x:source.x+280,y:source.y+32}:linkDrag.at;
    const end=target?{x:target.x,y:target.y+32}:linkDrag.at;
    const wires=$('wires');
    let preview=wires.querySelector('.wire-preview');
    if(!preview){
      preview=document.createElementNS('http://www.w3.org/2000/svg','path');
      preview.setAttribute('class','wire-preview');
      wires.append(preview);
    }
    preview.setAttribute('d',wirePath(start,end));
  }
  function showMedia(file,type,alt){return type==='video'?'<video controls controlslist="nodownload" playsinline preload="metadata" src="'+media(file)+'"></video>':'<img loading="lazy" decoding="async" src="'+media(file)+'" alt="'+esc(alt)+'">';}
  function resultOwner(row){
    const processors=doc.graph.nodes.filter(n=>G.processors.has(n.kind));
    if(row.nodeId)return processors.find(n=>n.id===row.nodeId)?.id||'';
    if(processors.length===1&&(row.media||'video')===G.output(processors[0]))return processors[0].id;
    return '';
  }
  function resultActions(row){return '<div class="result-actions"><button data-result-action="save" '+(row.saved?'disabled':'')+'>收藏到作品库</button><button data-result-action="view">放大查看</button><button data-result-action="download">另存到电脑</button><button data-result-action="location">文件位置</button><button data-result-action="rename">重命名</button><button data-result-action="delete">移除</button></div>';}
  function resultInfo(row){
    const stamp=Number(row.finishedAt)>0?new Date(Number(row.finishedAt)*1000).toLocaleString('zh-CN',{hour12:false}):'';
    return '<b class="result-name">'+esc(row.name||'生成结果')+'</b><small class="result-library-state">'+(row.saved?'已收藏到作品库':'未收藏')+'</small><p class="result-tag">'+[row.modelName,row.media==='image'?'图片':row.duration?row.duration+'秒':'视频',row.resolution,window.AspectRatio?.label(row.ratio)||row.ratio,stamp].filter(Boolean).map(esc).join(' · ')+'</p>';
  }
  function inlineResults(n,rows){
    const current=rows.at(-1);if(!current)return '';
    const output=doc.nodeOutputs?.[n.id],older=rows.slice(0,-1).reverse();
    return '<section class="node-result result" data-result="'+esc(current.file)+'"><small class="result-current-label">当前结果'+(output?.stale?' · 输入已变更，旧结果仅供查看':'')+'</small>'+showMedia(current.file,current.media||'video',current.name||'生成结果')+resultInfo(current)+resultActions(current)+'</section>'+
      (older.length?'<details class="node-result-history"><summary>历史版本（'+older.length+'）</summary>'+older.map(row=>'<section class="result-version" data-result="'+esc(row.file)+'">'+resultInfo(row)+resultActions(row)+'</section>').join('')+'</details>':'');
  }
  function renderResultArchive(){
    const rows=(doc?.results||[]).filter(r=>!r.deleted).slice().reverse();
    $('canvasResultsRows').innerHTML=rows.length?rows.map(row=>{const owner=node(resultOwner(row));return '<section class="result-version" data-result="'+esc(row.file)+'"><p class="result-owner">'+(owner?'所属生成卡：'+esc(owner.name):row.nodeId?'原生成卡已删除，结果保留':'旧版结果，所属节点无法确认')+'</p>'+resultInfo(row)+resultActions(row)+'</section>';}).join(''):'<p>当前画布暂无结果。生成后可直接在生成卡上查看与操作。</p>';
    controls();
  }
  const generationLabels257={
    submitting:'正在提交生成',queued:'等待生成',running:'正在生成',
    finishing:'正在读取生成结果',checking:'正在查询原生成任务',
    unknown:'原生成任务待核对',failed:'生成未完成 · 请查看任务提示'
  };
  function setGenerationActivity257(nodeId,phase,details={}){
    if(!nodeId)return;
    if(phase)nodeRuns.set(nodeId,{...nodeRuns.get(nodeId),...details,phase});
    else nodeRuns.delete(nodeId);
  }
  function paintGenerationActivity257(){
    for(const card of $('nodes').children){
      const nid=card.dataset.id,writing=textRuns.get(nid);
      const activity=nodeRuns.get(nid)||writing||(persistedRun(nid)?{phase:'unknown'}:null);
      let status=card.querySelector('.canvas-node-activity257');
      if(!activity){card.removeAttribute('data-generation-phase');status?.remove();continue;}
      if(!status){
        status=document.createElement('div');
        status.className='canvas-node-activity257';
        status.setAttribute('role','status');
        status.innerHTML='<span></span><i aria-hidden="true"></i>';
        (card.querySelector('.node-state')||card.querySelector('.body')?.lastElementChild)?.after(status);
      }
      if(card.dataset.generationPhase!==activity.phase)card.dataset.generationPhase=activity.phase;
      const label=writing?({submitting:'正在提交文字协作',queued:'文字协作排队中',running:'正在整理文字建议',checking:'正在查询原文字调用',unknown:'原文字调用待核对',failed:'文字协作未完成',returned:'文字建议已返回'}[activity.phase]||'文字协作处理中'):generationLabels257[activity.phase];
      const text=label+(activity.phase==='running'&&Number.isFinite(activity.progress)?' · '+Math.round(activity.progress)+'%':'');
      if(status.firstElementChild.textContent!==text)status.firstElementChild.textContent=text;
      status.toggleAttribute('data-animated',workingPhases.has(activity.phase));
    }
  }
  function paintRunProgress(){
    const progress=$('progress'),run=nodeRuns.get(runNodeId);
    const count=media=>[...nodeRuns.values()].filter(row=>row.media===media&&workingPhases.has(row.phase)).length;
    const texts=[...textRuns.values()].filter(row=>workingPhases.has(row.phase)).length;
    const activity=locallyRunning();
    const summary=activity?' · 视频 '+count('video')+' / 图片 '+count('image')+' / 文字 '+texts:'';
    progress.classList.toggle('working',activity);
    const text=(run?.message||generationLabels257[run?.phase]||'')+summary;
    if(progress.textContent!==text)progress.textContent=text;
  }
  function reconcileNodes254(markups){
    const container=$('nodes'),existing=new Map(Array.from(container.children).map(el=>[el.dataset.id,el]));
    for(const markup of markups){
      const template=document.createElement('template');template.innerHTML=markup;const next=template.content.firstElementChild,key=next.dataset.id,current=existing.get(key),expected=next.innerHTML;
      if(!current){next.classList.add('just-added254');container.append(next);next._content254=next.innerHTML;continue;}
      existing.delete(key);current.className=next.className;current.style.cssText=next.style.cssText;
      if(current._content254===expected)continue;
      // Preserve media elements, including playback and decoded frames, across
      // selection, catalogue refresh and non-media content updates.
      const retained=new Map();for(const element of current.querySelectorAll('video[src],img[src]')){const id=element.tagName+':'+element.getAttribute('src');if(!retained.has(id))retained.set(id,[]);retained.get(id).push(element);}
      for(const element of next.querySelectorAll('video[src],img[src]')){const reuse=retained.get(element.tagName+':'+element.getAttribute('src'))?.shift();if(reuse)element.replaceWith(reuse);}
      current.replaceChildren(...Array.from(next.childNodes));current._content254=expected;
    }
    for(const removed of existing.values()){for(const video of removed.querySelectorAll('video'))video.pause();removed.remove();}
  }
  function render(){
    if(drag||linkDrag||wireDrag||studio?.dragging()){renderPending=true;return;}renderPending=false;
    const markups254=doc.graph.nodes.map(n=>{const out=doc.nodeOutputs?.[n.id],isProcessor=G.processors.has(n.kind),rows=isProcessor?(doc.results||[]).filter(r=>!r.deleted&&resultOwner(r)===n.id):[],received=G.received(doc.graph.nodes,doc.graph.edges,n.id,doc.nodeOutputs),first=received.find(item=>item.file),file=isProcessor?out?.file:n.file||first?.file,type=isProcessor?out?.media:n.file?G.output(n):first?.media;
      const preview=file?showMedia(file,type,n.name):n.kind==='prompt'?'<p>'+esc(ReferenceMentions.parts(n.text).map(part=>part.id?mentionAssets(n.id,true).find(asset=>asset.referenceId===part.id)?.name||'【引用失效】':part.text).join('').slice(0,190)||'填写创意、镜头或图片描述')+'</p>':'<div class="placeholder">'+(isProcessor?(n.kind==='image_generator'?'▧ 文字生图 / 图片编辑':'▶ 视频生成'):'上传'+(n.kind==='reference'?'参考视频':'参考图片'))+'</div>';
      const receipt=received.length?'<span class="received-state '+(received.some(item=>item.blocked)?'stale':'')+'">'+(received.some(item=>item.blocked)?'接收中 · 上游结果未就绪':'已接收 '+received.filter(item=>item.file).length+' 份素材 / '+received.filter(item=>item.text).length+' 段文字')+(isProcessor?'':' · 汇合传递')+'</span>':'';
      return '<article class="node '+((studio?studio.isSelected(n.id):n.id===selected)?'selected ':'')+(n.id===runNodeId?'run-target':'')+'" data-id="'+n.id+'" style="left:'+n.x+'px;top:'+n.y+'px"><header title="按住标题拖动节点"><span>'+esc(n.name)+'</span><small>'+labels[n.kind]+'</small><span class="drag-grip" aria-hidden="true">⠿</span></header><div class="body">'+(isProcessor&&rows.length?inlineResults(n,rows):preview)+receipt+(isProcessor?'<p class="node-settings-summary">生成设置：'+esc(models(n).find(m=>m.model===n.settings?.model)?.displayName||'尚无已发布模型')+' · '+(n.kind==='generator'?esc(n.settings?.duration||15)+'秒':esc(n.settings?.resolution?.toUpperCase()||'未选清晰度'))+'</p><span class="node-state '+(out?.stale?'stale':'')+'">'+(out?(out.stale?'输入已改变 · 旧结果不可传入下一步':'结果就绪 · 可连接下一步'):'尚未生成')+'</span><button class="node-run" data-run="'+n.id+'">'+(n.kind==='image_generator'?'选择图片生成节点':'选择视频生成节点')+'</button>':'')+'</div><button class="port in" aria-label="连入'+esc(n.name)+'"></button><button class="port out '+(pending===n.id?'pending':'')+'" aria-label="'+esc(n.name)+'输出连线"></button></article>';
    });
    reconcileNodes254(markups254);
    for(const el of $('nodes').children){if(!el.querySelector('.canvas-node-tools254')){const tools=document.createElement('div');tools.className='canvas-node-tools254';tools.innerHTML='<button data-node-action254="edit">编辑</button>'+(node(el.dataset.id)?.kind==='prompt'?'<button data-node-action254="assistant">✧ 协作 AI</button>':'');el.querySelector('.body').append(tools);}}
    if($('canvasResultsDialog').open)renderResultArchive();
    $('viewport').classList.toggle('layout-locked',layoutLocked);drawWires();transform();controls();studio?.render();assistant254?.sync();
  }
  function stylePreview(style){
    if(/^\/static\/style-(?:era-montage|wuxia|industrial-scifi|ink-paper|clay-stopmotion|painterly-storybook|macro-commercial)\.jpg$/.test(style.previewAsset||''))return '<img src="'+esc(style.previewAsset)+'" alt="'+esc(style.name)+'">';
    if(style.previewImage)return '<img src="'+esc(style.previewImage)+'" alt="'+esc(style.name)+'">';
    const index=Number(style.previewIndex);
    if(style.previewIndex===undefined||style.previewIndex===null||style.previewIndex===''||!Number.isInteger(index)||index<0||index>11)return '<span class="canvas-style-preview-empty">暂无风格示例图</span>';
    const local=index%6,sheet=index<6?'/static/style-previews.png':'/static/style-previews-2.png';
    // Both sheets have 3 columns and 2 rows. Keep one complete tile visible:
    // (1672 / 3) / (941 / 2) for the first sheet, square tiles for the second.
    const aspect=index<6?'3344 / 2823':'1 / 1';
    return '<span class="canvas-style-thumb" role="img" aria-label="'+esc(style.name)+'" style="background-image:url(\''+sheet+'\');background-position:'+(local%3*50)+'% '+(local<3?0:100)+'%;--canvas-style-aspect:'+aspect+'"></span>';
  }
  function canvasStyleChoices(n){
    const snapshot=n.settings?.styleSnapshot;
    return [{id:'none',name:'不指定 · 按提示词描述'},...styles,
      ...(snapshot&&snapshot.id===n.settings?.styleId&&!styles.some(style=>style.id===snapshot.id)?[snapshot]:[]),
      {id:'custom',name:'自定义 · 自己描述'}];
  }
  function styleFields(n){const sid=n.settings?.styleId||'none',choices=canvasStyleChoices(n),style=styles.find(s=>s.id===sid)||n.settings?.styleSnapshot;
    const preview=style?'<div class="canvas-style-preview">'+stylePreview(style)+'<b>'+esc(style.name)+'</b></div>':'';
    const label=choices.find(choice=>choice.id===sid)?.name||choices[0].name;
    return '<div class="canvas-style-field"><span id="canvasStyleLabel257">画面生成风格</span><button type="button" data-canvas-style-open aria-haspopup="dialog" aria-labelledby="canvasStyleLabel257 canvasStyleValue257"><span id="canvasStyleValue257">'+esc(label)+'</span><span aria-hidden="true">▾</span></button><select hidden data-setting="styleId">'+choices.map(s=>'<option value="'+esc(s.id)+'" '+(sid===s.id?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></div>'+preview+(sid==='custom'?'<label><span>自定义画面风格（必填）</span><textarea data-setting="customStyle" maxlength="3000" placeholder="例如：柔和自然光、低饱和暖色、真实生活摄影…">'+esc(n.settings.customStyle)+'</textarea></label><label><span>避免的风格（可选）</span><textarea data-setting="customNegative" maxlength="1500" placeholder="例如：不要动漫感、不要塑料皮肤…">'+esc(n.settings.customNegative)+'</textarea></label>':'')+'<p class="muted">只影响当前节点的实际生成要求，改变风格后旧结果标记过期；不承诺模型能完全复现。</p>';
  }
  function openCanvasStylePicker(trigger){
    const n=node(selected);
    if(!n||inputLocked(n.id))return;
    const canvasId=doc.id,styleId=n.settings.styleId||'none';
    const choices=canvasStyleChoices(n),byId=new Map(choices.map(style=>[style.id,style]));
    const picker=document.createElement('dialog');
    picker.className='canvas-style-picker';
    picker.setAttribute('aria-labelledby','canvasStyleTitle257');
    picker.innerHTML='<header><h2 id="canvasStyleTitle257">画面生成风格</h2><button type="button" data-canvas-style-close aria-label="关闭风格选择">×</button></header>'+
      '<div class="canvas-style-picker-body"><div class="canvas-style-options" aria-label="可选风格">'+choices.map(style=>
        '<button type="button" data-canvas-style-choice="'+esc(style.id)+'" aria-pressed="'+(style.id===styleId)+'">'+esc(style.name)+'</button>').join('')+
      '</div><div class="canvas-style-picker-preview"><div class="canvas-style-preview" data-canvas-style-preview></div><p>悬停或用方向键预览，点击或按回车应用。</p></div></div>';
    const options=Array.from(picker.querySelectorAll('[data-canvas-style-choice]'));
    const preview=picker.querySelector('[data-canvas-style-preview]');
    let previewId;
    function show(option){
      const id=option?.dataset.canvasStyleChoice;
      const style=byId.get(id);
      if(!style||id===previewId)return;
      previewId=id;
      preview.innerHTML=(id==='none'||id==='custom'?'<span class="canvas-style-preview-empty">按文字描述生成</span>':stylePreview(style))+'<b>'+esc(style.name)+'</b>';
    }
    picker.addEventListener('pointerover',event=>show(event.target.closest('[data-canvas-style-choice]')));
    picker.addEventListener('focusin',event=>show(event.target.closest('[data-canvas-style-choice]')));
    picker.addEventListener('keydown',event=>{
      const index=options.indexOf(event.target);
      if(index<0||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,index+(event.key==='ArrowDown'?1:-1)));
      options[next].focus();
    });
    picker.addEventListener('click',event=>{
      const option=event.target.closest('[data-canvas-style-choice]');
      if(!option){
        if(event.target===picker||event.target.closest('[data-canvas-style-close]'))picker.close();
        return;
      }
      picker.close();
      if(inputLocked(n.id)||doc.id!==canvasId||selected!==n.id||option.dataset.canvasStyleChoice===styleId)return;
      const select=$('fields').querySelector('[data-setting="styleId"]');
      if(!select||!Array.from(select.options).some(item=>item.value===option.dataset.canvasStyleChoice))return;
      select.value=option.dataset.canvasStyleChoice;
      select.dispatchEvent(new Event('input',{bubbles:true}));
      select.dispatchEvent(new Event('change',{bubbles:true}));
    });
    picker.addEventListener('close',()=>{
      picker.remove();
      if(trigger.isConnected)trigger.focus({preventScroll:true});
      else if(doc?.id===canvasId&&selected===n.id)$('fields').querySelector('[data-canvas-style-open]')?.focus({preventScroll:true});
    },{once:true});
    document.body.append(picker);
    picker.showModal();
    const current=options.find(option=>option.dataset.canvasStyleChoice===styleId)||options[0];
    current.focus();
    show(current);
  }
  function ratioOptions(n){
    const values=['9:16','16:9','1:1',...(n.kind==='generator'?['21:9']:[])];
    if(n.settings.ratio&&!values.includes(n.settings.ratio))values.push(n.settings.ratio);
    return values.map(r=>'<option value="'+esc(r)+'" '+(r===n.settings.ratio?'selected':'')+'>'+esc(r)+'</option>').join('');
  }
  function canvasAssetSource(asset, target) {
    const existing = doc.graph.nodes.find(item => item.id !== target?.id && item.file === asset.file &&
      item.kind === asset.kind && !item.text?.trim() && !doc.graph.edges.some(edge => edge.target === item.id));
    if (existing) return existing;
    if (doc.graph.nodes.length >= 80 || doc.uploads?.[asset.file]?.media !== 'image') return null;
    // A reclassified asset can be added with its new type without changing its prior node.
    const kindOffset = {person: 1, scene: 2, prop: 3}[asset.kind];
    const sourceId = node(asset.id) ? (parseInt(asset.id[0], 16) ^ kindOffset).toString(16) + asset.id.slice(1) : asset.id;
    if (node(sourceId)) return null;
    const position = target ? {x: target.x - 310, y: target.y + 30} : studio?.insertionPoint();
    const coordinate = value => Math.max(-100000, Math.min(100000, value));
    return {id: sourceId, kind: asset.kind, name: asset.name, text: '', file: asset.file,
      x: coordinate(position?.x ?? 140), y: coordinate(position?.y ?? 100)};
  }
  function canvasAssetState() {
    return {id: doc?.id, name: doc?.name, version: canvasOpenEpoch251, readonly: locked()};
  }
  function syncCanvasAssets(canvasId, result) {
    if (doc?.id !== canvasId || result.updatedAt < Math.max(doc.updatedAt || 0, doc.canvasAssetUpdatedAt || 0)) return;
    doc.projectAssets = [...result.assets].reverse().map(({id, kind, name, file, createdAt}) => ({id, kind, name, file, createdAt}));
    doc.canvasAssetUpdatedAt = result.updatedAt;
    for (const asset of result.assets) doc.uploads[asset.file] ||= {name: asset.name, media: 'image'};
  }
  async function addCanvasProjectAsset(context, asset) {
    if (doc?.id !== context.id || canvasOpenEpoch251 !== context.version || canvasAssetState().readonly) {
      throw new Error('画布已切换或暂不可编辑，请重新打开项目资产。');
    }
    const source = canvasAssetSource(asset);
    if (!source) throw new Error('无法加入此资产，请检查画布节点数量。');
    if (!node(source.id)) {
      checkpoint();
      doc.graph.nodes.push(source);
      changed([source.id]);
      render();
      await save();
    }
    if (doc?.id !== context.id || canvasOpenEpoch251 !== context.version) return;
    select(source.id);
    message('已在画布中定位“' + source.name + '”。可连线或输入 @ 引用。');
  }
  function mentionAssets(nid,connectedOnly=false){
    const assets=G.received(doc.graph.nodes,doc.graph.edges,nid,doc.nodeOutputs).filter(item=>item.file&&!item.blocked&&node(item.id)).map(item=>({
      referenceId:'canvas:'+item.id+':'+item.file,name:node(item.id).name,kind:node(item.id).kind,kindLabel:labels[node(item.id).kind],
      imageFile:item.file,media:item.media,nodeId:item.id
    }));
    if(connectedOnly)return assets;
    for(const source of doc.graph.nodes){
      if(source.id===nid)continue;const output=doc.nodeOutputs?.[source.id],isProcessor=G.processors.has(source.kind);
      const file=isProcessor?(!output?.stale&&output?.file):source.file;if(!file)continue;
      const referenceId='canvas:'+source.id+':'+file;if(doc.graph.edges.length>=160||assets.some(asset=>asset.referenceId===referenceId)||G.reason(doc.graph.nodes,doc.graph.edges,source.id,nid))continue;
      // A material with a pending upstream dependency is not itself a ready source.
      if(!isProcessor&&G.received(doc.graph.nodes,doc.graph.edges,source.id,doc.nodeOutputs).some(item=>item.blocked))continue;
      assets.push({referenceId,name:source.name,kind:source.kind,kindLabel:labels[source.kind]+' · 选择后自动连线',
        imageFile:file,media:isProcessor?output.media:G.output(source),nodeId:source.id,connectNeeded:true});
    }
    if (doc.graph.edges.length >= 160) return assets;
    const knownReferences = new Set(assets.map(asset => asset.referenceId));
    for (const asset of doc.projectAssets || []) {
      if (asset.removedAt) continue;
      const source = canvasAssetSource(asset, node(nid));
      if (!source) continue;
      const referenceId='canvas:' + source.id + ':' + asset.file;
      if (knownReferences.has(referenceId)) continue;
      if (node(source.id) && G.reason(doc.graph.nodes, doc.graph.edges, source.id, nid)) continue;
      assets.push({referenceId, name: asset.name, kind: asset.kind,
        kindLabel: '项目资产 · ' + labels[asset.kind], imageFile: asset.file, media: 'image',
        nodeId: source.id, connectNeeded: true, libraryAssetId: asset.id});
      knownReferences.add(referenceId);
    }
    return assets;
  }
  function mountMentions(n){
    const field=$('fields').querySelector('textarea[data-field="text"]');if(!field)return;
    const panel=document.createElement('div');panel.id='canvasMentionEditor';
    // Rich chips contain buttons: do not nest them inside a <label>, whose
    // implicit activation would click the hidden workflow auto-label control.
    const wrapper=document.createElement('section'),heading=document.createElement('p');wrapper.className='canvas-text-field';heading.textContent=field.parentElement.querySelector('span')?.textContent||'提示词与素材引用';field.parentElement.replaceWith(wrapper);wrapper.append(heading,panel);
    if(n.kind==='generator'){const regenerate=document.createElement('button');regenerate.type='button';regenerate.className='canvas-regenerate283';regenerate.textContent='重新生成分镜提示词';regenerate.disabled=inputLocked(n.id);regenerate.onclick=safe(async()=>{if(selected!==n.id||inputLocked(n.id))return;studio?.hideInspector();await assistant254?.open({action:'storyboard_regenerate'});});heading.append(regenerate);}
    const canvasId=doc.id,active=()=>doc?.id===canvasId&&selected===n.id&&node(n.id)===n&&panel.isConnected;
    const assertActive=()=>{if(!active())throw new Error('编辑节点已切换，已取消旧素材选择。');};
    const editor=ReferenceMentions.mount(panel,{
      text:n.text,assets:()=>mentionAssets(n.id),boundAssets:()=>mentionAssets(n.id,true),
      media:file=>/^asset-[a-f0-9]{32}\.jpg$/.test(file)?media(file).replace('/media?', '/cover?'):media(file),
      auto:false,initialChange:false,locked:()=>inputLocked(n.id),active,
      hint:'输入 @ 选择本画布素材或项目资产，选择后可自动加入并连线（免费）。点击标签换绑，×只取消文字绑定。',
      editorLabel:'画布提示词与指定素材引用',saveLabel:'保存文字与素材引用',
      emptyLabel:'当前没有可用素材。可在“项目资产”上传人物、场景或物品图片，或先在画布准备素材。',
      change:text=>{if(!active()||inputLocked(n.id)||n.text===text)return;checkpoint();n.text=text;changed([n.id]);$('quote').textContent='文字或引用已修改；保存后核对本次实际输入与积分。';},
      select:async asset=>{
        assertActive();
        if(inputLocked(n.id))throw new Error('原任务处理中，暂不能修改引用。');
        const current=mentionAssets(n.id).find(item=>item.referenceId===asset.referenceId);
        if(!current)throw new Error('该素材已失效，请重新连线或生成后选择。');
        if(!current.connectNeeded)return;
        const libraryAsset=current.libraryAssetId && doc.projectAssets.find(item=>item.id===current.libraryAssetId && !item.removedAt);
        const newSource=libraryAsset && !node(current.nodeId) ? canvasAssetSource(libraryAsset,n) : null;
        const nodes=newSource ? [...doc.graph.nodes,newSource] : doc.graph.nodes;
        const reason=G.reason(nodes,doc.graph.edges,current.nodeId,n.id);
        if(reason)throw new Error(reason);
        checkpoint();
        if(newSource)doc.graph.nodes.push(newSource);
        doc.graph.edges.push({source:current.nodeId,target:n.id});
        changed([n.id]);
        await save();
        assertActive();
        if(inputLocked(n.id)||!mentionAssets(n.id,true).some(item=>item.referenceId===asset.referenceId))throw new Error('素材或任务状态已改变，请重新选择。');
        render();
        message('已把“'+current.name+'”连入“'+n.name+'”；素材引用与连接均不扣积分。');
      },
      save:async()=>{assertActive();await save();assertActive();await refreshQuote();assertActive();render();}
    });
    editor.editor.dataset.field='text';
    editor.editor.addEventListener('blur',()=>{setTimeout(()=>{if(active()&&!panel.contains(document.activeElement)&&!locked())safe(async()=>{render();await refreshQuote();})().catch(()=>{});},0);});
  }
  const voiceLanguages=['中文','英语','日语','韩语','俄语','德语','法语','西班牙语','葡萄牙语','意大利语','泰语','越南语','马来语','印度尼西亚语','阿拉伯语','印地语','土耳其语','荷兰语','波兰语','乌克兰语'];
  const voiceAccents={中文:['普通话','川普','东北口音普通话','天津口音普通话','广东口音普通话','台湾口音普通话','四川话','粤语','天津话','东北话','北京话','上海话','闽南语','客家话','潮汕话','长沙话','武汉话','重庆话','陕西话'],英语:['自然口音','美式英语','英式英语','澳式英语','加拿大英语','印度英语'],日语:['自然口音','关西口音'],葡萄牙语:['自然口音','巴西葡萄牙语','欧洲葡萄牙语']};
  const accentsFor=language=>Object.hasOwn(voiceAccents,language)?voiceAccents[language]:['自然口音'];
  const voiceUploadPending=new Set();
  function speechVideoTargets(graph,source){
    const seen=new Set([source]),pending=[source],targets=[];
    while(pending.length){const current=pending.pop();for(const edge of graph.edges){
      if(edge.source!==current||seen.has(edge.target))continue;
      seen.add(edge.target);
      const target=graph.nodes.find(item=>item.id===edge.target);
      if(target?.kind==='generator')targets.push(target.id);
      else if(target&&!G.processors.has(target.kind))pending.push(target.id);
    }}
    return targets;
  }
  function mountCharacterSpeech(n){
    const uploadButton=$('chooseUpload');if(n.kind!=='person'||!uploadButton)return;
    const section=document.createElement('section');section.className='receive-summary canvas-character-speech';
    uploadButton.insertAdjacentElement('afterend',section);
    const profile={language:'中文',accent:'普通话',timbre:'',...n.speechProfile};
    const sample=doc.uploads[n.voiceSampleFile],canvasId=doc.id,owner=canvasOpenEpoch251;
    const active=()=>doc?.id===canvasId&&owner===canvasOpenEpoch251&&node(n.id)===n&&!lifecycleFrozen261;
    const uploadKey=canvasId+':'+n.id;
    section.innerHTML=`<b>角色声音设定</b>
      <label><span>对白语言</span><select data-speech="language"></select></label>
      <label hidden><span>自定义对白语言</span><input data-speech-custom="language" maxlength="40"></label>
      <label><span>口音 / 方言</span><select data-speech="accent"></select></label>
      <label hidden><span>自定义口音 / 方言</span><input data-speech-custom="accent" maxlength="40"></label>
      <label><span>音色描述（选填）</span><input data-speech-timbre maxlength="80" placeholder="例如：温和、低沉、语速偏慢" value="${esc(profile.timbre)}"></label>
      <p>语言、口音和音色描述会随关联角色送入视频生成。效果取决于所选模型。</p>
      <b>自定义声音样本</b>
      ${sample?.media==='audio'?`<p>${esc(sample.name)} · ${esc(sample.duration)} 秒</p><audio controls preload="none" src="${esc(media(n.voiceSampleFile))}" style="max-width:100%"></audio><button type="button" data-remove-voice>解除样本绑定</button>`:''}
      <input type="file" data-voice-upload accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" hidden>
      <button type="button" data-choose-voice>${sample?'更换声音样本':'上传声音样本'}</button>
      <p>WAV、MP3、M4A，2–120 秒，最大 16 MB。样本仅保存到本机并供试听。</p>`;
    function saveProfile(patch){
      if(!active()||inputLocked(n.id))return;
      const next={...profile,...patch};if(Object.keys(next).every(key=>next[key]===profile[key]))return;
      checkpoint();Object.assign(profile,next);n.speechProfile={...profile};
      changed(speechVideoTargets(doc.graph,n.id));
    }
    function bindPreset(field,options){
      const picker=section.querySelector(`[data-speech="${field}"]`),input=section.querySelector(`[data-speech-custom="${field}"]`);
      picker.replaceChildren(...options.map(value=>new Option(value,value)),new Option('自定义…',''));
      const preset=options.includes(profile[field]);picker.value=preset?profile[field]:'';
      input.value=preset?'':profile[field];input.closest('label').hidden=preset;
      function apply(value){
        if(!value)return;
        if(field==='language'&&value!==profile.language){
          const accents=accentsFor(value);
          saveProfile({language:value,accent:accents[0]});bindPreset('accent',accents);
        }else saveProfile({[field]:value});
      }
      picker.onchange=()=>{input.closest('label').hidden=Boolean(picker.value);if(picker.value)apply(picker.value);else input.focus();};
      input.onchange=()=>{if(input.value.trim())apply(input.value.trim());else input.value=profile[field];};
    }
    bindPreset('language',voiceLanguages);bindPreset('accent',accentsFor(profile.language));
    section.querySelector('[data-speech-timbre]').oninput=event=>saveProfile({timbre:event.target.value.trim()});
    section.addEventListener('change',event=>{event.stopPropagation();if(!event.target.matches('[data-voice-upload]'))safe(async()=>{await save();await refreshQuote();})();});
    const picker=section.querySelector('[data-voice-upload]');
    section.querySelector('[data-choose-voice]').onclick=()=>{if(active()&&!inputLocked(n.id)&&!voiceUploadPending.has(uploadKey))picker.click();};
    picker.onchange=safe(async()=>{
      const file=picker.files[0];picker.value='';
      if(!file||!active()||inputLocked(n.id)||voiceUploadPending.has(uploadKey))return;
      if(file.size>16*1024*1024)throw new Error('音色样本最多 16 MB。');
      voiceUploadPending.add(uploadKey);
      try{
        if(!await studioConfirm('请确认你拥有这段声音的使用权，并同意将它保存在本机画布中用于试听。',{title:'确认声音授权'})||!active()||inputLocked(n.id))return;
        message('正在保存本地声音样本…');
        const response=await fetch('/api/canvas/upload',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-Canvas-Id':canvasId,'X-Filename':encodeURIComponent(file.name),'X-Media-Type':'audio','X-Rights-Confirmed':'1'},body:file});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'声音样本保存失败。');
        if(!active())return;doc.uploads[result.file]=result;
        if(inputLocked(n.id)){message('样本已保存在本机。请在当前任务结束后绑定声音。');return;}
        checkpoint();n.voiceSampleFile=result.file;changed([],true);await save();
        if(active()&&selected===n.id)inspect();message('声音样本已保存，可在角色设置中试听。');
      }finally{voiceUploadPending.delete(uploadKey);}
    });
    const remove=section.querySelector('[data-remove-voice]');
    if(remove)remove.onclick=safe(async()=>{
      if(!active()||inputLocked(n.id)||voiceUploadPending.has(uploadKey))return;
      checkpoint();delete n.voiceSampleFile;changed([],true);await save();
      if(active()&&selected===n.id)inspect();message('样本绑定已解除，可撤销恢复。');
    });
  }
  function inspect(){
    studio?.inspect();
    if(selectedEdge>=0){const e=doc.graph.edges[selectedEdge];if(e){$('fields').innerHTML='<h3>已选连接</h3><p>'+esc(node(e.source).name)+' → '+esc(node(e.target).name)+'</p><p class="muted">按住连线向旁边拉；出现“松手断开”后松手即可取消连接。短点击只选中，轻微移动不删除。两端金色圆点可改接；Esc取消。原素材与作品仍保留，可撤销恢复。</p><button id="rewireSource">改接来源</button><button id="rewireTarget">改接目标</button><button id="disconnectEdge">断开连接</button>';controls();return;}}
    const n=node(selected);if(!n){$('fields').innerHTML='<p class="muted">选择素材、生成节点或连线查看设置。</p>';controls();return;}
    const targets=doc.graph.nodes.filter(t=>t.id!==n.id);
    $('fields').innerHTML='<label><span>节点名称</span><input data-field="name" maxlength="80" value="'+esc(n.name)+'"></label>'+(G.processors.has(n.kind)?'<label><span>已发布的'+(n.kind==='image_generator'?'图片':'视频')+'模型</span><select data-setting="model">'+(models(n).map(m=>'<option value="'+esc(m.model)+'" '+(m.model===n.settings.model?'selected':'')+'>'+esc(m.displayName||'已发布模型')+'</option>').join('')||'<option value="">后台尚未发布</option>')+'</select></label><label><span>清晰度（已发布价格）</span><select data-setting="resolution">'+prices(n.settings.model,n).map(p=>'<option value="'+esc(p.resolution)+'" '+(p.resolution===n.settings.resolution?'selected':'')+'>'+esc(p.resolution.toUpperCase())+'</option>').join('')+'</select></label>'+(n.kind==='generator'?'<label><span>时长（秒）</span><input type="number" min="1" max="30" data-setting="duration" value="'+n.settings.duration+'"></label>':'')+'<label><span>画面方向</span><select data-setting="ratio">'+ratioOptions(n)+'</select></label>'+styleFields(n)+'<label><span>本节点提示词 / 编辑要求</span><textarea data-field="text" placeholder="连入图片时填写要修改什么；没有图片时填写要生成什么">'+esc(n.text)+'</textarea></label><p class="muted">'+doc.graph.edges.filter(e=>e.target===n.id).length+' 个直接输入；只读取连入的素材，不跳过上游结果。</p>':'<label><span>'+(n.kind==='prompt'?'创意、镜头、对白或图片描述':'素材描述 / 使用要求')+'</span><textarea data-field="text" placeholder="填写本次创作要求">'+esc(n.text)+'</textarea></label>'+(n.kind!=='prompt'?'<button id="chooseUpload">'+(n.file?'重新上传素材':'上传素材')+'</button>':''))+'<label><span>连接到下一步</span><select id="connectTarget">'+(targets.map(t=>'<option value="'+t.id+'" '+(t.id===runNodeId?'selected':'')+'>'+esc(t.name)+' · '+labels[t.kind]+'</option>').join('')||'<option value="">先添加生成节点</option>')+'</select></label><button id="connectNode">连接到所选节点</button><button id="removeNode">删除节点</button>';
    if(n.kind==='generator'){
      $('fields').querySelector('[data-setting="duration"]').closest('label').outerHTML=durationFields(n);
      const modelSelect=$('fields').querySelector('[data-setting="model"]');
      for(const option of modelSelect.options){const item=models(n).find(m=>m.model===option.value);if(item)option.textContent=ModelPresentation.videoOptionLabel(config,item);}
      const ability=models(n).find(item=>item.model===n.settings.model)||{},ratios=ability.supportedAspectRatios||[];
      for(const option of $('fields').querySelector('[data-setting="ratio"]').options){option.disabled=ratios.length&&!ratios.includes(option.value)||option.value==='21:9'&&(n.kind!=='generator'||!ratios.includes('21:9'))||!['9:16','16:9','1:1','21:9'].includes(option.value);if(option.disabled)option.textContent+='（不支持）';}
      const inputIssue=videoInputIssue(n);if(inputIssue&&!durationIssue(n))$('fields').insertAdjacentHTML('beforeend','<p class="muted canvas-capability-warning" role="status">'+esc(inputIssue)+'</p>');
      if(n.settings.model&&!models(n).some(m=>m.model===n.settings.model)){const option=document.createElement('option');option.value=n.settings.model;option.textContent='原模型（当前不可用）';option.selected=true;modelSelect.append(option);}
      const warning=ModelPresentation.activityWarning(config,n.settings.model,n.settings.resolution);
      if(warning)$('fields').insertAdjacentHTML('beforeend','<p class="muted canvas-activity-warning" role="note">'+esc(warning)+'</p>');
    }
    const received=G.received(doc.graph.nodes,doc.graph.edges,n.id,doc.nodeOutputs);
    $('fields').insertAdjacentHTML('afterbegin','<section class="receive-summary"><b>接收与发送</b><p>'+doc.graph.edges.filter(e=>e.target===n.id).length+' 条输入线 · '+doc.graph.edges.filter(e=>e.source===n.id).length+' 条输出线</p><p>'+ (G.processors.has(n.kind)?'生成节点接收文字与支持的素材；只发送本节点真实生成结果。':'素材节点会汇合连入内容与自身内容并传到下游，不自动识图、改图或生成。')+'</p>'+(received.length?'<p>接收：'+received.map(item=>esc(node(item.id)?.name||'上游')+'（'+(item.blocked?'结果待就绪':item.file?(item.media==='video'?'视频':'图片'):'文字')+'）').join('、')+'</p>':'<p>尚无上游输入，可上传 / 填写内容，也可从其他节点连入。</p>')+'</section>');
    mountCharacterSpeech(n);mountMentions(n);tail283?.mount(n,$('fields'));controls();
  }
  function select(nid,deferQuote=false,keepSelection=false){if(!keepSelection)studio?.resetSelection(nid);studio?.showInspector();const hadSelectedEdge=selectedEdge>=0;selected=nid;selectedEdge=-1;tail283?.sync();if(hadSelectedEdge)drawWires();if(G.processors.has(node(nid)?.kind)&&runNodeId!==nid){runNodeId=nid;invalidateQuote();if(!deferQuote)safe(refreshQuote)();}renderSelection();inspect();assistant254?.sync();}
  function renderSelection(){document.querySelectorAll('.node[data-id]').forEach(el=>{el.classList.toggle('selected',(studio?studio.isSelected(el.dataset.id):el.dataset.id===selected));el.classList.toggle('run-target',el.dataset.id===runNodeId);});document.querySelectorAll('.out').forEach(el=>el.classList.toggle('pending',el.closest('[data-id]').dataset.id===pending));controls();studio?.renderSelection();}
  async function save(){if(saveFlight){await saveFlight;return save();}if(!doc||lifecycleFrozen261||doc.generation||!dirty)return;const version=revision,canvasId=doc.id,owner=canvasOpenEpoch251,payload={canvasId,name:$('canvasName').value,graph:snapshot()};saveFlight=api('/api/canvas/save',payload);
    try{const response=await saveFlight;if(doc?.id!==canvasId||owner!==canvasOpenEpoch251||lifecycleFrozen261)return;if(revision===version){dirty=false;$('saveCanvas').textContent='保存画布';}mergeRunDocument(response.document);}finally{saveFlight=null;}if(dirty)await save();
  }
  async function refreshQuote(){
    quote=null;controls();if(!doc||lifecycleFrozen261||doc.generation)return;
    // Free editing must persist even with no generator, unavailable models or
    // invalid generation settings. Quoting must never gate saving the graph.
    const saveOwner=canvasOpenEpoch251,saveCanvasId=doc.id;await save();
    if(saveOwner!==canvasOpenEpoch251||doc?.id!==saveCanvasId)return;
    if(!processor()){$('quote').textContent='添加或选择生成节点后可核对积分；画布内容已保存。';return;}
    if(runLocked(runNodeId)){$('quote').textContent='当前节点或上下游原任务仍在处理。可选择其他独立节点。';return;}
    const read=++quoteReadEpoch251,owner=canvasOpenEpoch251,canvasId=doc.id,nid=runNodeId,edit=revision;
    const current=()=>read===quoteReadEpoch251&&owner===canvasOpenEpoch251&&doc?.id===canvasId&&runNodeId===nid&&revision===edit&&!runLocked(nid);
    // Published metadata only; refresh before validating formerly cached capabilities.
    // Catalog focus/entry refresh itself never calls a provider or creates a quote.
    await refreshCanvasCatalog251();if(!current())return;
    const epoch=++quoteEpoch,issue=videoInputIssue();if(issue){$('quote').textContent=issue+'；原设定已保留，请调整设定或更换模型，未提交生成。';controls();return;}
    await save();if(!current()||epoch!==quoteEpoch)return;
    try {
      const result=await api('/api/canvas/quote',{canvasId,nodeId:nid});
      if(!current()||epoch!==quoteEpoch)return;
      const cost=Number(result.quote?.estimatedPoints);
      if(!Number.isFinite(cost)||cost<=0)throw new Error('后台未提供有效积分价格，暂不能生成。');
      ModelPresentation.quoteReceiptFields(result.quote);
      quote=result;catalogQuotePending251=false;
      const warning=result.media==='image'?'':ModelPresentation.activityWarning(config,result.model,result.resolution);
      $('quote').textContent=result.modelName+' · '+(result.media==='image'?result.resolution.toUpperCase():result.duration+'秒')+' · '+ModelPresentation.quoteText(result.quote)+(warning?' · '+warning:'');
    }catch(error){
      if(current()&&epoch===quoteEpoch){
        if(error.status===400)catalogQuotePending251=false;
        $('quote').textContent=error.message;
      }
    }
    controls();
  }
  async function refreshPoints(){try{const data=await api('/api/visual/points'),value=Number(data.points);points=data.ok!==false&&data.points!==null&&data.points!==undefined&&Number.isFinite(value)&&value>=0?value:null;}catch(_){points=null;}controls();}
  function projectStamp261(row){const stamp=Number(row.deletedAt||row.updatedAt||row.createdAt),date=new Date(stamp>1e12?stamp:stamp*1000);return Number.isFinite(stamp)&&!Number.isNaN(date.getTime())?date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'时间未记录';}
  function projectLabel261(row,duplicates){
    const source=row.origin==='store_visit'?'探店':row.origin==='ecommerce259'?(row.mode==='image'?'电商图片':'电商视频'):'';
    const name=String(row.name||'未命名项目')+(source?' · '+source:'');
    return name+(duplicates.has(row.name)?' · '+projectStamp261(row)+' · '+String(row.id).slice(-6):'');
  }
  async function list(){const ticket=++listRead261,owner=canvasOpenEpoch251,canvasId=doc?.id,rows=(await api('/api/canvas/list')).canvases;if(ticket!==listRead261||owner!==canvasOpenEpoch251||canvasId!==doc?.id)return;const active=rows.filter(row=>!row.deleted),names=new Map();for(const row of active)names.set(row.name,(names.get(row.name)||0)+1);const duplicates=new Set([...names].filter(([,count])=>count>1).map(([name])=>name));$('documents').innerHTML=active.map(row=>'<option value="'+esc(row.id)+'" title="'+esc(projectStamp261(row)+' · '+row.id)+'">'+esc(projectLabel261(row,duplicates))+'</option>').join('');$('documents').value=doc?.id||'';}
  function syncSavedRuns(value){
    const runs={...value.nodeGenerations};
    if(value.generation?.nodeId)runs[value.generation.nodeId]={...value.generation,taskId:value.taskId};
    for(const [nid,attempt] of Object.entries(runs)){
      const previous=nodeRuns.get(nid);
      if(!previous||attempt.taskId&&attempt.taskId!==previous.taskId)
        setGenerationActivity257(nid,attempt.taskId?'checking':'unknown',{taskId:attempt.taskId,media:attempt.media,message:attempt.error});
    }
  }
  function mergeRunDocument(fresh){
    const previous=doc;
    if(Number.isFinite(fresh.updatedAt)&&Number.isFinite(previous.updatedAt)&&fresh.updatedAt<previous.updatedAt)return;
    const outputs={...fresh.nodeOutputs};
    if(dirty)for(const [nid,output] of Object.entries(previous.nodeOutputs||{})){
      if(output.stale&&outputs[nid])outputs[nid]={...outputs[nid],stale:true};
    }
    const newerAssets=previous.canvasAssetUpdatedAt>fresh.updatedAt ?
      {projectAssets:previous.projectAssets,canvasAssetUpdatedAt:previous.canvasAssetUpdatedAt} : {};
    doc={...fresh,...newerAssets,graph:previous.graph,uploads:{...previous.uploads,...fresh.uploads},nodeOutputs:outputs};
    syncSavedRuns(fresh);
  }
  function refreshRunView(){
    render();
    const focused=document.activeElement;
    if(!$('fields').contains(focused)||!focused?.matches('input,textarea,select,[contenteditable], [contenteditable] *'))inspect();
  }
  function receiveTextReceipt(record){
    if(doc?.id!==record.canvasId)return;
    const previous=textRuns.get(record.nodeId);
    const phase=({submitting:'submitting',queued:'queued',reserving:'running',calling:'running',pending:'running',
      returned:'returned',failed:'failed',invalid:'failed'})[record.status]||'unknown';
    if(previous?.receiptId===record.receiptId&&['returned','failed'].includes(previous.phase)&&workingPhases.has(phase))return;
    const same=previous?.receiptId===record.receiptId;
    textRuns.set(record.nodeId,{receiptId:record.receiptId,taskId:record.taskId||(same?previous.taskId:null),phase});
    controls();scheduleWriting(1800);
  }
  const shouldPoll=()=>doc&&!lifecycleFrozen261&&canvasModuleActive251&&!document.hidden;
  async function readRunTask(taskId){
    try{const row=await api('/api/tasks/'+encodeURIComponent(taskId));return row.task||row;}
    catch(error){return {state:'attention',error:error.message};}
  }
  function scheduleWriting(delay=0){
    const pending=shouldPoll()&&[...textRuns.values()].some(run=>run.taskId&&workingPhases.has(run.phase));
    if(!pending){clearTimeout(textPollTimer);textPollTimer=null;return;}
    if(textPollTimer!==null&&delay>0)return;
    clearTimeout(textPollTimer);
    textPollTimer=setTimeout(()=>{textPollTimer=null;safe(pollWriting)();},delay);
  }
  async function pollWriting(){
    if(textPollFlight)return textPollFlight;
    const canvasId=doc?.id,owner=canvasOpenEpoch251;
    const current=()=>doc?.id===canvasId&&canvasOpenEpoch251===owner;
    const writing=[...textRuns].filter(([,run])=>run.taskId&&workingPhases.has(run.phase));
    if(!writing.length)return;
    const cursor=textPollCursor%writing.length;
    const tracked=[...writing.slice(cursor),...writing.slice(0,cursor)].slice(0,5);
    textPollCursor=cursor+tracked.length;
    const work=(async()=>{
      const statuses=await Promise.all(tracked.map(([,run])=>readRunTask(run.taskId)));
      if(!current())return;
      for(const [index,[nid,run]] of tracked.entries()){
        const latest=textRuns.get(nid);
        if(latest?.taskId!==run.taskId||!workingPhases.has(latest.phase))continue;
        const task=statuses[index];
        const phase=task.state==='done'?(task.result?.applicable===false?'failed':'returned'):
          task.state==='queued'?'queued':task.state==='running'?'running':'unknown';
        textRuns.set(nid,{...latest,phase,progress:task.progress});
      }
      controls();
    })();
    textPollFlight=work;
    try{await work;}finally{
      if(textPollFlight===work)textPollFlight=null;
      if(current())scheduleWriting(1800);
    }
  }
  function scheduleRuns(delay=0){
    clearTimeout(pollTimer);
    if(shouldPoll()&&[...nodeRuns.values()].some(run=>run.taskId&&workingPhases.has(run.phase)))
      pollTimer=setTimeout(()=>safe(pollRuns)(),delay);
  }
  async function open(document,initialize=false){
    clearTimeout(pollTimer);clearTimeout(textPollTimer);pollFlight=null;textPollFlight=null;nodeRuns.clear();textRuns.clear();nodeRevisions.clear();
    listRead261++;removedRead261++;const owner=++canvasOpenEpoch251;invalidateQuote();studio?.resetDocument();doc=document;dirty=false;lifecycleFrozen261=!!document.deleted;
    syncSavedRuns(doc);
    runNodeId=doc.generation?.nodeId||doc.graph.nodes.find(n=>G.processors.has(n.kind))?.id||'';
    selected=runNodeId;studio?.resetSelection(selected);selectedEdge=-1;pending='';undoStack=[];redoStack=[];
    const active=activeMediaNodes(),canInitialize=!doc.generation&&!lifecycleFrozen261;
    for(const n of doc.graph.nodes)if(canInitialize&&!active.some(nid=>reaches(n.id,nid)))settings(n,initialize);
    dirty=canInitialize&&!active.length;pan={x:20,y:Math.max(20,window.document.querySelector('.studio-topbar').getBoundingClientRect().bottom+20)};zoom=.8;
    $('canvasName').value=doc.name+(lifecycleFrozen261?'（已删除）':'');render();inspect();
    for(const receipt of assistant254?.records(doc.id)||[])receiveTextReceipt(receipt);
    scheduleRuns();scheduleWriting();await refreshCanvasCatalog251();if(owner!==canvasOpenEpoch251)return;
    await Promise.allSettled([list(),refreshPoints()]);if(owner!==canvasOpenEpoch251)return;
    if(lifecycleFrozen261){$('quote').textContent='此项目已删除；请从“已删除项目”恢复后继续编辑或查询。';controls();return;}
    if(doc.generation){$('quote').textContent='原生成请求已保留，请继续查询。';controls();return;}
    await refreshQuote();
  }
  async function pollRuns(){
    if(pollFlight)return pollFlight;
    const canvasId=doc?.id,owner=canvasOpenEpoch251;
    const current=()=>doc?.id===canvasId&&canvasOpenEpoch251===owner;
    const tracked=[...nodeRuns].filter(([,run])=>run.taskId&&workingPhases.has(run.phase));
    if(!tracked.length)return;
    const work=(async()=>{
      const query=new URLSearchParams({id:canvasId});
      tracked.forEach(([,run])=>query.append('taskId',run.taskId));
      const status=await api('/api/canvas/run-status?'+query).catch(()=>null);
      if(!current())return;
      if(status?.nodeGenerations){
        doc.nodeGenerations=status.nodeGenerations;
        doc.generation=status.generation;
        doc.taskId=status.taskId;
        syncSavedRuns(doc);
      }
      const missing=tracked.filter(([,run])=>!status?.tasks?.[run.taskId]);
      const cursor=missing.length?mediaFallbackCursor%missing.length:0;
      const fallback=new Set([...missing.slice(cursor),...missing.slice(0,cursor)].slice(0,8).map(([,run])=>run.taskId));
      mediaFallbackCursor=cursor+fallback.size;
      const tasks=await Promise.all(tracked.map(async([,run])=>{
        if(status?.tasks?.[run.taskId])return status.tasks[run.taskId];
        return fallback.has(run.taskId)?readRunTask(run.taskId):null;
      }));
      if(!current())return;
      const terminal=[];
      for(const [index,[nid,run]] of tracked.entries()){
        if(nodeRuns.get(nid)?.taskId!==run.taskId)continue;
        const task=tasks[index];if(!task)continue;
        const running=['queued','running'].includes(task.state);
        if(running)setGenerationActivity257(nid,task.state,{message:task.message,progress:task.progress});
        else if(['done','error'].includes(task.state)){
          setGenerationActivity257(nid,'finishing',{message:task.message});terminal.push([nid,run,task]);
        }else setGenerationActivity257(nid,'unknown',{message:task.error||task.message||'请继续查询原任务。'});
      }
      controls();
      if(!terminal.length)return;
      try{
        if(disconnectFlight257)await disconnectFlight257.catch(()=>{});
        const updated=(await api('/api/canvas/document?id='+encodeURIComponent(canvasId))).document;
        if(!current())return;
        mergeRunDocument(updated);
        for(const [nid,run,task] of terminal){
          if(nodeRuns.get(nid)?.taskId!==run.taskId)continue;
          if(persistedRun(nid))setGenerationActivity257(nid,'unknown',{message:task.error||'请继续查询原任务。'});
          else if(task.state==='done')setGenerationActivity257(nid,'');
          else setGenerationActivity257(nid,'failed',{message:task.error||'生成未完成。'});
        }
        refreshRunView();
        refreshPoints();
        if(current()&&terminal.some(([nid])=>reaches(nid,runNodeId))&&!runLocked(runNodeId))safe(refreshQuote)();
      }catch(error){
        if(!current())return;
        for(const [nid,run] of terminal)if(nodeRuns.get(nid)?.taskId===run.taskId)setGenerationActivity257(nid,'unknown',{message:error.message});
        controls();
      }
    })();
    pollFlight=work;
    try{await work;}finally{
      if(pollFlight===work)pollFlight=null;
      if(current())scheduleRuns(1800);
    }
  }
  async function generate(){
    if($('generate').disabled)return;
    const owner=canvasOpenEpoch251,canvasId=doc?.id,nid=runNodeId;
    const current=()=>doc?.id===canvasId&&canvasOpenEpoch251===owner;
    const selectedRun=()=>current()&&nid===runNodeId;
    const flight=JSON.stringify([owner,canvasId,nid]);
    generationPreflights.add(flight);controls();
    try{
      await Promise.all([refreshQuote(),refreshPoints()]);
      if(!selectedRun()||!quote||runLocked(nid)||!Number.isFinite(points)||points<Number(quote.quote.estimatedPoints))return;
      const receipt=quote.quote,reviewedTail=quote.tailQuoteHash283,review={input:generationInput(nid),quoteEpoch};
      const unchanged=()=>current()&&generationInput(nid)===review.input;
      const media=processor().kind==='generator'?'video':'image';
      const warning=media==='video'?ModelPresentation.activityWarning(config,quote.model,quote.resolution):'';
      if(!await studioConfirm('运行“'+processor().name+'”，'+ModelPresentation.quoteText(receipt)+'。'+(warning?'\n\n'+warning:'')+'\n\n确认开始？'))return;
      if(!selectedRun()||quoteEpoch!==review.quoteEpoch||!unchanged()){message('确认期间输入、引用或运行节点已改变，请重新核对并确认。');return;}
      if(runLocked(nid))return;
      const clientRunId=id();
      setGenerationActivity257(nid,'submitting',{media,taskId:null,message:'正在提交当前节点…'});
      generationPreflights.delete(flight);controls();
      try{
        await save();
        if(!unchanged())throw Object.assign(new Error('生成输入已改变，请重新确认。'),{status:400});
        const accepted=await api('/api/canvas/generate',{canvasId,nodeId:nid,parallelNodes:true,clientRunId,billingConfirmed:true,...ModelPresentation.quoteReceiptFields(receipt),...(reviewedTail?{expectedTailQuote283:reviewedTail}:{})});
        if(!current())return;
        if(accepted.done){
          setGenerationActivity257(nid,'checking',{media,message:'结果已返回，正在同步本节点…'});controls();
          const fresh=(await api('/api/canvas/document?id='+encodeURIComponent(canvasId))).document;
          if(current()){mergeRunDocument(fresh);setGenerationActivity257(nid,'');refreshRunView();}
          return;
        }
        if(!accepted.taskId)throw new Error('提交回执尚未确认，请查询原任务。');
        setGenerationActivity257(nid,'queued',{taskId:accepted.taskId,message:'节点任务已提交。'});
        scheduleRuns();
      }catch(error){
        if(!current())return;
        try{
          const fresh=(await api('/api/canvas/document?id='+encodeURIComponent(canvasId))).document;
          if(!current())return;
          mergeRunDocument(fresh);
        }catch(_){}
        const original=persistedRun(nid);
        if(original?.taskId){setGenerationActivity257(nid,'checking',{taskId:original.taskId,message:original.error});scheduleRuns();}
        else setGenerationActivity257(nid,error.status>=400&&error.status<500?'failed':'unknown',{message:error.message});
        throw error;
      }finally{if(current())controls();}
    }finally{if(generationPreflights.delete(flight)&&current())controls();}
  }
  async function connect(source,target,replacing=-1){if(locked())return;const old=doc.graph.edges[replacing];if(inputLocked(target)||old&&inputLocked(old.target)){message('这条连接参与当前生成，请在原任务结束后调整。',true);return;}const error=G.reason(doc.graph.nodes,doc.graph.edges,source,target,replacing);if(error){message(error);return;}checkpoint();if(replacing>=0)doc.graph.edges.splice(replacing,1,{source,target});else doc.graph.edges.push({source,target});pending='';rewire=null;selectedEdge=-1;changed([target,...(old?[old.target]:[])]);render();
    inspect();await save();await refreshQuote();message('连线已保存，运行节点会读取此输入；连接本身不扣积分。');}
  function add(kind,position){if(doc.graph.nodes.length>=80)throw new Error('画布最多80个节点。');checkpoint();const count=doc.graph.nodes.length,n={id:id(),kind,name:labels[kind],text:'',x:position?.x??(140-pan.x)/zoom+count*16,y:position?.y??(70-pan.y)/zoom+count*24};if(kind==='person')n.speechProfile={language:'中文',accent:'普通话',timbre:''};settings(n,true);doc.graph.nodes.push(n);selected=n.id;studio?.resetSelection(selected);studio?.showInspector();selectedEdge=-1;if(G.processors.has(kind))runNodeId=n.id;changed([n.id]);render();inspect();return n;}
  async function upload(file,nid,roleName=''){if(!file)return false;if(inputLocked(nid))throw new Error('该素材参与当前生成，请在原任务结束后更换。');const n=node(nid);if(!n||G.processors.has(n.kind)||n.kind==='prompt')throw new Error('请先选择图片或视频素材节点。');const canvasId=doc.id,owner=canvasOpenEpoch251;await save();if(doc?.id!==canvasId||owner!==canvasOpenEpoch251)return false;if(!node(nid))throw new Error('上传目标已删除，请重新选择素材节点。');if(inputLocked(nid))throw new Error('该素材参与当前生成，请在原任务结束后更换。');message('正在上传素材（免费）…');const response=await fetch('/api/canvas/upload',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-Canvas-Id':canvasId,'X-Filename':encodeURIComponent(file.name),'X-Media-Type':n.kind==='reference'?'video':'image'},body:file}),result=await response.json();if(!response.ok)throw new Error(result.error);if(doc?.id!==canvasId||owner!==canvasOpenEpoch251||lifecycleFrozen261)return false;doc.uploads[result.file]=result;const target=node(nid);if(!target){message('上传目标已删除，文件已保留在当前画布，不会绑定到其他节点；本次不扣积分。');return false;}if(inputLocked(nid)){message('文件已上传并保留，原任务仍使用之前的素材。');return false;}checkpoint();target.file=result.file;if(roleName)target.name=roleName;changed([nid]);render();inspect();await refreshQuote();message('素材已上传，拖动输出端连到所需生成节点。');return true;}
  CharacterPicker.install('.node[data-id]',async(el,role)=>{
    if(locked())throw new Error('请等待原任务结束再选角色。');
    const canvasId=doc.id,owner=canvasOpenEpoch251,nodeId=el.dataset.id;
    if(!await upload(role.file,nodeId,role.character.name))return;
    const target=node(nodeId);
    if(doc?.id!==canvasId||owner!==canvasOpenEpoch251||target?.kind!=='person')return;
    checkpoint();
    target.speechProfile={language:'中文',accent:'普通话',timbre:'',...role.character.speechProfile};
    delete target.voiceSampleFile;
    changed(speechVideoTargets(doc.graph,nodeId));inspect();await save();await refreshQuote();
    message('已导入角色形象与对白设定。');
  },el=>node(el.dataset.id)?.kind==='person');
  async function handleResultAction(event){
    const button=event.target.closest('[data-result-action]'),result=button?.closest('[data-result]');
    if(!result)return false;
    if(button.disabled)return true;
    const file=result.dataset.result,action=button.dataset.resultAction,canvasId=doc.id,row=doc.results.find(r=>r.file===file&&!r.deleted);
    if(!row)throw new Error('该结果已移除，请刷新后重试。');
      if(action==='view'){document.querySelectorAll('video').forEach(v=>v.pause());$('viewerMedia').innerHTML=showMedia(file,row.media||'video','图片结果');$('viewer').showModal();return;}
      if(action==='location'){await showLocation(file);return;}
      if(action==='download'){const url=media(file)+'&download=1',name=(row.name||'画布结果').replace(/[\\/:*?"<>|]/g,'_')+(row.media==='image'?'.jpg':'.mp4');if(window.parent!==window&&typeof parent.saveLocalDownload==='function'){if(await parent.saveLocalDownload(url,name)===false){message('已取消另存；原结果仍保留。');return;}}else if(window.pywebview?.api?.save_download){const saved=await window.pywebview.api.save_download(url,name,'canvas');if(saved.canceled){message('已取消另存；原结果仍保留。');return;}if(!saved.ok)throw new Error(saved.error);message('已另存到：'+saved.path);return;}else{const a=document.createElement('a');a.href=url;a.download=name;a.click();}message('已请求另存；请查看保存对话框或浏览器下载记录。');return;}
      if(locked()||action==='delete'&&inputLocked(row.nodeId))throw new Error('该结果参与原任务，请在任务结束后修改。');if(action==='delete'&&!await studioConfirm('移除这个结果？仅隐藏本版本；本机文件、原素材和其他版本仍保留，不会重新生成或扣费。'))return true;const name=action==='rename'?await studioPrompt('作品名称',row.name):'';if(action==='rename'&&name===null)return true;
      if(doc.id!==canvasId||locked()||!doc.results.some(r=>r.file===file&&!r.deleted))throw new Error('画布或结果状态已改变，未执行修改，请重新选择。');
      await save();if(doc.id!==canvasId||locked())throw new Error('画布或任务状态已改变，未执行修改。');
      const response=await api('/api/canvas/result',{canvasId,file,action,name});if(doc.id!==canvasId)return true;
      mergeRunDocument(response.document);render();inspect();await refreshQuote();
      if(action==='save'){await showLocation(file);message('已收藏到程序内作品库；顶部“已保存作品”可查看。这不是另存到桌面。');}
      else if(action==='delete')message('已移除此版本的显示记录；本机文件、原素材和其他版本保留，可通过文件位置恢复文件。');
      return true;
  }
  $('nodes').addEventListener('click',safe(async event=>{
    if(suppressClick){suppressClick=false;return;}
    if(event.target.closest('[data-result-action]')){await handleResultAction(event);return;}
    const el=event.target.closest('[data-id]');if(!el)return;const nid=el.dataset.id,port=event.target.closest('.port');
    if(port&&rewire){if(rewire.target&&port.classList.contains('out')||rewire.source&&port.classList.contains('in')){await connect(rewire.source||nid,rewire.target||nid,rewire.replacing);return;}}
    if(port?.classList.contains('out')){if(locked())return;pending=nid;message('拖动或点击任意节点的输入端。素材节点汇合传递；生成节点处理输入。');}
    else if(port?.classList.contains('in')&&pending){await connect(pending,nid);return;}if(!port&&event.shiftKey&&studio){studio.toggleSelection(nid);return;}select(nid);
  }));
  $('fields').addEventListener('input',event=>{
    const n=node(selected);if(!n||inputLocked(n.id))return;
    const el=event.target;if(el.isContentEditable||!el.dataset.field&&!el.dataset.setting)return;
    checkpoint();if(el.dataset.field)n[el.dataset.field]=el.value;
    if(el.dataset.setting)n.settings[el.dataset.setting]=el.dataset.setting==='duration'?Number(el.value):el.value;
    const affected=n.kind==='person'&&n.speechProfile?speechVideoTargets(doc.graph,n.id):[];
    changed(el.dataset.field==='name'?affected:[n.id]);
  });
  $('fields').addEventListener('click',event=>{
    const trigger=event.target.closest('[data-canvas-style-open]');
    if(trigger)openCanvasStylePicker(trigger);
  });
  $('fields').addEventListener('change',safe(async event=>{const n=node(selected);if(!n||inputLocked(n.id))return;if(event.target.dataset.setting==='styleId'){delete n.settings.styleSnapshot;const style=styles.find(s=>s.id===n.settings.styleId);if(style)n.settings.styleSnapshot={id:style.id,name:style.name,prompt:style.prompt,negative:style.negative||''};changed([n.id]);inspect();}if(event.target.dataset.setting==='model'){settings(n,true);inspect();}render();await refreshQuote();}));
  function canDisconnect(edge){
    if(!edge||disconnectFlight257||globalLocked())return false;
    if(!doc?.generation)return !inputLocked(edge.target);
    const owner=doc?.generation?.nodeId;
    return Boolean(owner&&G.processors.has(node(owner)?.kind)&&!G.descendants(doc.graph.edges,[edge.target]).has(owner));
  }
  async function disconnect(){
    const edge=doc?.graph.edges[selectedEdge];
    if(!edge||disconnectFlight257)return;
    if(!canDisconnect(edge)){message('这条连接可能参与当前生成，请在任务结束后断开。');return;}
    if(locked()){
      const canvasId=doc.id,owner=canvasOpenEpoch251;
      disconnectEpoch257++;
      const flight=api('/api/canvas/disconnect',{canvasId,source:edge.source,target:edge.target}).then(({document:updated})=>{
        if(doc.id!==canvasId||owner!==canvasOpenEpoch251)return;
        checkpoint();
        // Keep ownership of the original task until its status poll reconciles it.
        doc={...updated,generation:doc.generation,taskId:doc.taskId};
        selectedEdge=-1;revision++;invalidateQuote();
        render();inspect();
        message('无关连接已断开，当前生成继续。任务结束后可以撤销。');
      });
      disconnectFlight257=flight;controls();
      try{await flight;}finally{if(disconnectFlight257===flight)disconnectFlight257=null;controls();}
      return;
    }
    checkpoint();doc.graph.edges.splice(selectedEdge,1);selectedEdge=-1;changed([edge.target]);render();inspect();await save();await refreshQuote();
    message('连接已断开，可点“撤销”恢复；原素材和历史结果仍保留，不扣积分。');
  }
  $('fields').addEventListener('click',safe(async event=>{const key=event.target.id;if(key==='disconnectEdge')return disconnect();if(inputLocked(selected))return;
    if(key==='useFixedDuration'){const n=node(selected),fixed=ModelPresentation.videoDurationInfo(config,n.settings.model).fixed;if(!fixed)return;checkpoint();n.settings.duration=fixed;changed([n.id]);render();inspect();await refreshQuote();message('已明确调整为固定'+fixed+'秒；请核对原文本是否适合此时长，文本、素材和历史结果均保留。');return;}
    if(key==='rewireSource'||key==='rewireTarget'){const e=doc.graph.edges[selectedEdge];if(!e)return;rewire=key==='rewireTarget'?{source:e.source,replacing:selectedEdge}:{target:e.target,replacing:selectedEdge};pending='';message('点击新端口或拖动线上的金色圆点改接；Esc取消。');return;}
    if(key==='chooseUpload'){$('upload').accept=node(selected).kind==='reference'?'video/*':'image/*';$('upload').click();}
    if(key==='connectNode')await connect(selected,$('connectTarget').value);
    if(key==='removeNode'&&studio){await studio.removeSelection();return;}if(key==='removeNode'){checkpoint();const nid=selected;doc.graph.nodes=doc.graph.nodes.filter(n=>n.id!==nid);const affected=doc.graph.edges.filter(e=>e.source===nid).map(e=>e.target);doc.graph.edges=doc.graph.edges.filter(e=>e.source!==nid&&e.target!==nid);if(runNodeId===nid)runNodeId=doc.graph.nodes.find(n=>G.processors.has(n.kind))?.id||'';selected='';selectedEdge=-1;changed(affected);render();inspect();await refreshQuote();}
  }));
  $('upload').onchange=safe(async()=>{try{await upload($('upload').files[0],selected);}finally{$('upload').value='';}});
  document.querySelectorAll('[data-add]').forEach(button=>button.onclick=safe(async()=>{if(locked())return;add(button.dataset.add,studio?.insertionPoint());studio?.closePanels();await refreshQuote();message('节点已添加。运行当前节点才扣积分。');}));
  $('wires').addEventListener('click',event=>{if(suppressClick){suppressClick=false;return;}const edge=event.target.closest('[data-edge]');if(!edge)return;selectedEdge=Number(edge.dataset.edge);selected='';pending='';drawWires();renderSelection();inspect();});
  $('wires').addEventListener('keydown',safe(async event=>{const edge=event.target.closest('[data-edge]');if(['Enter',' '].includes(event.key)&&edge){event.preventDefault();selectedEdge=Number(edge.dataset.edge);selected='';drawWires();renderSelection();inspect();}if(['Delete','Backspace'].includes(event.key)){event.preventDefault();await disconnect();}}));
  const worldPoint=event=>{const r=$('viewport').getBoundingClientRect();return {x:(event.clientX-r.left-pan.x)/zoom,y:(event.clientY-r.top-pan.y)/zoom};};
  function closeLink(){linkDrag=null;rewire=null;linkMenu=null;pending='';$('linkMenu').hidden=true;drawWires();renderSelection();}
  function wireHint(event,distance=0){const hint=$('wireDragHint'),r=$('viewport').getBoundingClientRect(),ready=distance>=WIRE_DETACH_DISTANCE;hint.hidden=false;hint.classList.toggle('detach-ready',ready);hint.style.setProperty('--pull-progress',Math.min(1,distance/WIRE_DETACH_DISTANCE));$('wireDragText').textContent=ready?'松手断开 · 撤销可恢复':'按住往旁边拉 · Esc取消';hint.style.left=Math.max(8,Math.min(r.width-hint.offsetWidth-8,event.clientX-r.left+18))+'px';hint.style.top=Math.max(8,Math.min(r.height-hint.offsetHeight-8,event.clientY-r.top+18))+'px';}
  function clearWireHint(){$('wireDragHint').hidden=true;$('viewport').classList.remove('wire-pulling');}
  $('viewport').onpointerdown=event=>{if(event.button!==0||drag||linkDrag||wireDrag||studio?.dragging()||event.target.closest('#minimap,#selectionToolbar'))return;const handle=event.target.closest('.wire-handle'),wire=event.target.closest('.wire-line,.wire-hit,.wire-grip');
    // The wider hit zone must never steal an existing node's input/output port.
    const port=event.target.closest('.port')||(!handle&&wire?document.elementsFromPoint(event.clientX,event.clientY).find(el=>el.matches('.port')):null);
    if((port||handle)&&!locked()){event.preventDefault();$('linkMenu').hidden=true;const nid=port?.closest('[data-id]')?.dataset.id;if(handle){const e=doc.graph.edges[Number(handle.dataset.edge)];linkDrag={source:handle.dataset.end==='target'?e.source:null,target:handle.dataset.end==='source'?e.target:null,replacing:Number(handle.dataset.edge),at:worldPoint(event)};}else linkDrag={source:port.classList.contains('out')?nid:null,target:port.classList.contains('in')?nid:null,replacing:-1,at:worldPoint(event)};Object.assign(linkDrag,{sx:event.clientX,sy:event.clientY,moved:false,pointerId:event.pointerId});$('viewport').setPointerCapture(event.pointerId);return;}
    if(wire&&canDisconnect(doc?.graph.edges[Number(wire.dataset.edge)])){event.preventDefault();$('linkMenu').hidden=true;wireDrag={index:Number(wire.dataset.edge),sx:event.clientX,sy:event.clientY,moved:false,detach:false,pointerId:event.pointerId};wire.closest('.wire-group')?.classList.add('dragging');$('viewport').classList.add('wire-pulling');$('viewport').setPointerCapture(event.pointerId);wireHint(event);return;}
    if(event.target.closest('button,input,select,textarea,video,a,.wire-line,.wire-hit,.wire-grip'))return;const header=event.target.closest('.node[data-id]>header');if(header&&locked())return;const n=header?node(header.parentElement.dataset.id):null,previousRun=runNodeId;if(event.target.closest('.node')&&!header)return;if(n){select(n.id,!layoutLocked);if(layoutLocked){message('布局已锁定，标题点击只选择节点；解锁后才能移动。');return;}}
    event.preventDefault();drag={sx:event.clientX,sy:event.clientY,nodeId:n?.id,origin:n?{x:n.x,y:n.y}:{...pan},before:n?snapshot():null,moved:false,needsQuote:runNodeId!==previousRun,pointerId:event.pointerId};$('viewport').setPointerCapture(event.pointerId);
  };
  $('viewport').onpointermove=event=>{const gesture=linkDrag||wireDrag||drag;if(!gesture||gesture.pointerId!==event.pointerId)return;
    if(linkDrag){linkDrag.at=worldPoint(event);linkDrag.moved=linkDrag.moved||Math.hypot(event.clientX-linkDrag.sx,event.clientY-linkDrag.sy)>8;drawLinkPreview();return;}
    if(wireDrag){const dx=event.clientX-wireDrag.sx,dy=event.clientY-wireDrag.sy,distance=Math.hypot(dx,dy);wireDrag.moved=wireDrag.moved||distance>8;wireDrag.detach=distance>=WIRE_DETACH_DISTANCE;const group=$('wires').querySelector('.wire-group[data-edge="'+wireDrag.index+'"]'),path=group?.querySelector('.wire-line');if(group&&wireDrag.moved){group.setAttribute('transform','translate('+dx/zoom+','+dy/zoom+')');path?.classList.toggle('detach-preview',wireDrag.detach);wireHint(event,distance);message(wireDrag.detach?'松手断开此连接；撤销可恢复，不扣积分。':'继续拉开连接线，出现“松手断开”后松手；Esc取消。');}return;}
    const dx=event.clientX-drag.sx,dy=event.clientY-drag.sy;if(!drag.moved&&Math.hypot(dx,dy)<8)return;drag.moved=true;if(drag.nodeId){const n=node(drag.nodeId);if(!n)return;n.x=drag.origin.x+dx/zoom;n.y=drag.origin.y+dy/zoom;const el=document.querySelector('.node[data-id="'+n.id+'"]');if(el){el.style.left=n.x+'px';el.style.top=n.y+'px';}drawWires();}else{pan={x:drag.origin.x+dx,y:drag.origin.y+dy};transform();}
  };
  $('viewport').onpointerup=safe(async event=>{
    const gesture=linkDrag||wireDrag||drag;if(!gesture||gesture.pointerId!==event.pointerId)return;
    const link=linkDrag,wire=wireDrag,movement=drag;linkDrag=null;wireDrag=null;drag=null;clearWireHint();
    if($('viewport').hasPointerCapture(event.pointerId))$('viewport').releasePointerCapture(event.pointerId);
    if(wire){selectedEdge=wire.index;selected='';pending='';drawWires();renderSelection();inspect();suppressClick=true;setTimeout(()=>{suppressClick=false;},100);wire.detach=Math.hypot(event.clientX-wire.sx,event.clientY-wire.sy)>=WIRE_DETACH_DISTANCE;if(wire.detach)await disconnect();else message(wire.moved?'未达到断开距离，连接保留。':'已选中连接；按住连接线向旁边拉开即可断开。');if(renderPending)render();return;}
    if(link){drawWires();if(!link.moved){suppressClick=true;setTimeout(()=>{suppressClick=false;},100);if(link.replacing<0&&link.source){pending=link.source;select(link.source);message('已选择输出端，点击任意节点左侧输入端连接。');}else if(link.replacing<0&&link.target&&pending)await connect(pending,link.target);if(renderPending)render();return;}suppressClick=true;setTimeout(()=>{suppressClick=false;},100);const target=document.elementsFromPoint(event.clientX,event.clientY).find(el=>el.closest('.node[data-id]'))||document.elementFromPoint(event.clientX,event.clientY),nid=target?.closest('.node[data-id]')?.dataset.id;
      if(nid){await connect(link.source||nid,link.target||nid,link.replacing);return;}
      if(link.source&&target?.closest('#viewport')){linkMenu={...link,position:worldPoint(event)};$('linkMenu').style.left=Math.min(innerWidth-240,Math.max(0,event.clientX))+'px';$('linkMenu').style.top=Math.min(innerHeight-210,Math.max(0,event.clientY))+'px';const probe={id:'new-image-step',kind:'image_generator'};$('linkMenu').querySelector('[data-next="image_generator"]').disabled=!!G.reason([...doc.graph.nodes,probe],doc.graph.edges,link.source,probe.id);$('linkMenu').hidden=false;message('选择下一步；素材节点只汇合传递，生成节点处理输入。');}else message('连接取消，原连线保留。');if(renderPending)render();return;
    }
    if(movement?.nodeId&&movement.moved){undoStack.push(movement.before);if(undoStack.length>60)undoStack.shift();redoStack=[];changed([],true);suppressClick=true;setTimeout(()=>{suppressClick=false;},100);}
    if(renderPending)render();if(movement?.nodeId&&movement.moved)await save();if(movement?.needsQuote)await refreshQuote();
  });
  function cancelGesture(){const movement=drag,wasWire=!!wireDrag,gesture=linkDrag||wireDrag||drag;drag=null;wireDrag=null;linkDrag=null;clearWireHint();if(movement?.moved){if(movement.nodeId){const n=node(movement.nodeId);if(n){n.x=movement.origin.x;n.y=movement.origin.y;}}else pan={...movement.origin};}if(gesture&&$('viewport').hasPointerCapture(gesture.pointerId))$('viewport').releasePointerCapture(gesture.pointerId);closeLink();render();if(wasWire)message('已取消扯线，连接保留。');}
  $('viewport').onpointercancel=cancelGesture;$('viewport').onlostpointercapture=()=>{if(drag||linkDrag||wireDrag)cancelGesture();};window.addEventListener('blur',()=>{if(drag||linkDrag||wireDrag)cancelGesture();});
  $('linkMenu').onclick=safe(async event=>{if(event.target.id==='cancelLink'){closeLink();return;}if(!event.target.dataset.next||!linkMenu||locked())return;const link=linkMenu,probe={id:'new-canvas-step',kind:event.target.dataset.next};const reason=G.reason([...doc.graph.nodes,probe],doc.graph.edges,link.source,probe.id,link.replacing);if(reason)throw new Error(reason);const next=add(probe.kind,link.position);$('linkMenu').hidden=true;linkMenu=null;await connect(link.source,next.id,link.replacing);});
  $('viewport').addEventListener('wheel',event=>{if(event.target.closest('video,#minimap'))return;event.preventDefault();if(drag||linkDrag||wireDrag||studio?.dragging())return;const r=$('viewport').getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top,next=Math.min(2,Math.max(.25,zoom*Math.exp(-event.deltaY*.001)));pan={x:x-(x-pan.x)*next/zoom,y:y-(y-pan.y)*next/zoom};zoom=next;transform();},{passive:false});
  $('fit').onclick=()=>{const nodes=Array.from($('nodes').querySelectorAll('.node[data-id]'));if(!nodes.length)return;const maxX=Math.max(...nodes.map(n=>parseFloat(n.style.left)+n.offsetWidth)),minX=Math.min(...nodes.map(n=>parseFloat(n.style.left))),minY=Math.min(...nodes.map(n=>parseFloat(n.style.top))),maxY=Math.max(...nodes.map(n=>parseFloat(n.style.top)+n.offsetHeight)),top=window.document.querySelector('.studio-topbar').getBoundingClientRect().bottom+20,bottom=document.querySelector('.tools').getBoundingClientRect().top-20;zoom=Math.min(1,Math.max(.25,Math.min(($('viewport').clientWidth-70)/Math.max(1,maxX-minX),Math.max(80,bottom-top)/Math.max(1,maxY-minY))));pan={x:30-minX*zoom,y:top-minY*zoom};transform();};$('resetView').onclick=()=>{zoom=1;pan={x:20,y:Math.max(20,window.document.querySelector('.studio-topbar').getBoundingClientRect().bottom+20)};transform();};
  // Layout and grouping do not change generation inputs. Ordered incoming edges
  // do: invalidate changed nodes and their dependants, then let save() restore
  // the server's authoritative result signatures.
  function semanticChanges(before,after){
    const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
    const signatures=graph=>new Map(graph.nodes.map(n=>[n.id,JSON.stringify(canonical({kind:n.kind,text:n.text||'',file:n.file||'',settings:n.settings||{},inputs:graph.edges.filter(e=>e.target===n.id).map(e=>e.source)}))]));
    const old=signatures(before),next=signatures(after);
    const affected=new Set([...old.keys(),...next.keys()].filter(nid=>old.get(nid)!==next.get(nid)));
    const profiles=graph=>new Map(graph.nodes.filter(n=>n.kind==='person'&&n.speechProfile)
      .map(n=>[n.id,JSON.stringify(canonical({name:n.name,speech:n.speechProfile}))]));
    const oldProfiles=profiles(before),newProfiles=profiles(after);
    for(const nid of new Set([...oldProfiles.keys(),...newProfiles.keys()])){
      if(oldProfiles.get(nid)===newProfiles.get(nid))continue;
      for(const target of [...speechVideoTargets(before,nid),...speechVideoTargets(after,nid)])affected.add(target);
    }
    return [...affected];
  }
  async function historyStep(undo){if(locked()||studio?.dragging())return;const from=undo?undoStack:redoStack,to=undo?redoStack:undoStack;if(!from.length)return;const before=snapshot(),next=from.at(-1),affected=semanticChanges(before,next);if(affected.some(inputLocked)){message('该操作会改变当前生成的输入，请在原任务结束后重试。');return;}from.pop();to.push(before);doc.graph=next;if(!node(runNodeId))runNodeId=doc.graph.nodes.find(n=>G.processors.has(n.kind))?.id||'';if(!node(selected))selected=runNodeId;studio?.resetSelection(selected);selectedEdge=-1;changed(affected,!affected.length);render();inspect();if(affected.length)await refreshQuote();else await save();render();message(undo?'已撤销；未触发生成或收费。':'已重做；未触发生成或收费。');}
  $('undo').onclick=safe(()=>historyStep(true));$('redo').onclick=safe(()=>historyStep(false));
  $('duplicateNode').onclick=safe(async()=>{if(studio)return studio.duplicate();const old=node(selected);if(!old||locked())return;if(doc.graph.nodes.length>=80)throw new Error('画布最多80个节点。');checkpoint();const n={...JSON.parse(JSON.stringify(old)),id:id(),name:old.name+' · 副本',x:old.x+60,y:old.y+80};doc.graph.nodes.push(n);selected=n.id;selectedEdge=-1;changed([n.id]);render();inspect();await refreshQuote();});
  $('layoutLock').onclick=()=>{layoutLocked=!layoutLocked;$('layoutLock').textContent=layoutLocked?'🔒':'♧';$('layoutLock').title=layoutLocked?'解锁布局':'锁定布局';$('layoutLock').setAttribute('aria-pressed',String(layoutLocked));$('viewport').classList.toggle('layout-locked',layoutLocked);message(layoutLocked?'节点位置已锁定；仍可选择、编辑与连接。':'布局已解锁，按住标题超过8像素后移动节点。');};
  document.addEventListener('keydown',safe(async event=>{if(gallery?.visible())return;if(event.key==='Escape'&&(drag||linkDrag||wireDrag)){event.preventDefault();cancelGesture();return;}if(event.target.closest('input,textarea,select,dialog,[contenteditable]'))return;if(event.key==='Escape'){closeLink();return;}if(drag||linkDrag||wireDrag)return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();await historyStep(!event.shiftKey);}if(event.key==='Delete'&&selectedEdge>=0){event.preventDefault();await disconnect();}}));
  $('canvasName').oninput=()=>changed();$('saveCanvas').onclick=safe(async()=>{await save();await list();await refreshPoints();await refreshQuote();render();message('画布已保存，素材与结果记录保留在本机。');});$('generate').onclick=safe(generate);
  $('recharge').onclick=()=>{if(window.parent!==window)parent.document.getElementById('topRechargePoints')?.click();else message('请返回软件顶部充值积分，充值后保存画布以更新余额。');};
  $('observe').onclick=safe(async()=>{
    const canvasId=doc.id,nodeId=doc.generation?.nodeId||runNodeId,owner=canvasOpenEpoch251;
    const current=()=>owner===canvasOpenEpoch251&&doc?.id===canvasId;
    if(!nodeId||workingPhases.has(nodeRuns.get(nodeId)?.phase))return;
    setGenerationActivity257(nodeId,'checking',{taskId:null,message:'正在查询原任务…'});controls();
    try{
      const result=await api('/api/canvas/observe',{canvasId,nodeId,parallelNodes:true});
      if(current()){setGenerationActivity257(nodeId,'checking',{taskId:result.taskId});scheduleRuns();controls();}
    }catch(error){
      if(current()){setGenerationActivity257(nodeId,'unknown',{message:error.message});controls();throw error;}
    }
  });
  async function navigate259(load,initialize=false){
    if(navigationBusy259)return;
    navigationBusy259=true;canvasOpenEpoch251++;listRead261++;removedRead261++;quoteEpoch++;clearTimeout(pollTimer);clearTimeout(textPollTimer);controls();
    const overlay=$('canvasBoot254');
    if(gallery.visible()){overlay.hidden=false;bootStep254('读取画布与已保存的素材',15);}
    try{
      await saveBeforeLeaving();
      const next=await load();
      if(next===null){gallery.show(true);updateWireFlowVisibility();return;}
      if(!next?.id)throw new Error('画布内容不完整，请重试。');
      if(next.deleted)throw new Error('项目已删除，请从“已删除项目”恢复。');
      bootStep254('恢复节点、连线与已有结果',65);
      await open(next,initialize);
      localStorage.setItem('dramaVideoCanvas',next.id);
      gallery.hide();updateWireFlowVisibility();
      if(!overlay.hidden)$('canvasName').focus({preventScroll:true});
    }finally{
      overlay.hidden=true;
      navigationBusy259=false;controls();scheduleRuns();scheduleWriting();if(doc&&!lifecycleFrozen261&&!doc.generation)await safe(refreshQuote)();
    }
  }
  async function saveBeforeLeaving(){
    if(!dirty)return;
    await save();
    if(dirty)throw new Error('当前画布还有未保存的修改，请先保存后再切换。');
  }
  const createDialog=$('newCanvasProjectDialog'),createForm=$('newCanvasProjectForm'),createName=$('newCanvasProjectName');
  const createImage=$('newCanvasImageModel'),createVideo=$('newCanvasVideoModel'),createStatus=$('newCanvasProjectStatus');
  const createSubmit=$('submitNewCanvasProject'),createCancel=$('cancelNewCanvasProject');
  let createBusy=false,pendingCreateRequest=null,pendingCreatedCanvas=null;
  function renderCreateModels(){
    for(const [field,kind] of [[createImage,'image_generator'],[createVideo,'generator']]){
      const value=field.value,choices=models({kind});
      field.replaceChildren(new Option('跟随系统默认',''),...choices.map(model=>new Option(model.displayName||model.model,model.model)));
      if(value&&!choices.some(model=>model.model===value))field.add(new Option('已选模型暂不可用',value));
      field.value=value;
    }
  }
  function updateCreateForm(){
    for(const field of [createName,createImage,createVideo])field.disabled=createBusy||Boolean(pendingCreateRequest);
    createSubmit.disabled=createBusy;
    createCancel.disabled=createBusy;
    createSubmit.textContent=createBusy?'正在打开画布…':pendingCreatedCanvas?'重新打开画布':pendingCreateRequest?'重试创建':'创建并进入';
  }
  function showNewCanvasProject(){
    if(createDialog.open||navigationBusy259)return;
    if(!pendingCreateRequest){createForm.reset();createStatus.textContent='';renderCreateModels();}
    updateCreateForm();
    createDialog.showModal();
    refreshCanvasCatalog251().then(result=>{
      if(!createDialog.open||createBusy||pendingCreateRequest)return;
      renderCreateModels();
      if(!result.ok&&!models({kind:'generator'}).length&&!models({kind:'image_generator'}).length)createStatus.textContent='模型目录暂不可用，仍可跟随系统默认。';
    });
    return createName;
  }
  createCancel.onclick=()=>createDialog.close();
  createDialog.addEventListener('cancel',event=>{if(createBusy)event.preventDefault();});
  createForm.onsubmit=async event=>{
    event.preventDefault();
    if(createBusy||navigationBusy259)return;
    const name=createName.value.trim(),modelDefaults={image:createImage.value,video:createVideo.value};
    if(!pendingCreateRequest&&!name){createStatus.textContent='请输入项目名称。';createName.focus();return;}
    createBusy=true;createStatus.textContent='';updateCreateForm();
    try{
      await navigate259(async()=>{
        if(!pendingCreatedCanvas){
          pendingCreateRequest ||= {name,modelDefaults,createRequestId:id()};
          try {
            pendingCreatedCanvas=(await api('/api/canvas/create',pendingCreateRequest)).document;
          } catch(error) {
            if(error.status>=400&&error.status<500)pendingCreateRequest=null;
            throw error;
          }
        }
        return pendingCreatedCanvas;
      },true);
      pendingCreateRequest=null;pendingCreatedCanvas=null;
      createDialog.close();$('canvasName').focus({preventScroll:true});
    }catch(error){
      const message=pendingCreatedCanvas?'项目已保存，打开失败。可重新打开。':pendingCreateRequest?'未收到创建结果，可用同一请求重试。':'创建失败。';
      createStatus.textContent=message+error.message;
    }finally{createBusy=false;updateCreateForm();}
  };
  $('newCanvas').onclick=showNewCanvasProject;
  $('showCanvasGallery').onclick=safe(async()=>{
    if(navigationBusy259)return;
    navigationBusy259=true;controls();
    try{
      await saveBeforeLeaving();
      cancelGesture();studio?.closePanels();$('canvasContextMenu').hidden=true;
      document.querySelectorAll('main video, main audio').forEach(media=>media.pause());
      gallery.show(true);updateWireFlowVisibility();
    }finally{navigationBusy259=false;controls();scheduleRuns();scheduleWriting();}
  });
  async function removeCanvasProject(canvasId){
    await api('/api/canvas/delete',{canvasId});
    listRead261++;removedRead261++;
    $('documents').querySelector('option[value="'+canvasId+'"]')?.remove();
    if(localStorage.getItem('dramaVideoCanvas')===canvasId)localStorage.removeItem('dramaVideoCanvas');
    if(doc?.id!==canvasId)return;
    canvasOpenEpoch251++;quoteEpoch++;dirty=false;lifecycleFrozen261=true;clearTimeout(pollTimer);
    doc={...doc,deleted:true};$('canvasName').value=doc.name+'（已删除）';controls();
  }
  $('deleteCanvas').onclick=safe(async()=>{
    if(!doc||lifecycleFrozen261||locallyRunning()||navigationBusy259)return;
    const canvasId=doc.id,owner=canvasOpenEpoch251,name=$('canvasName').value.trim()||doc.name;
    if(!await studioConfirm('删除项目“'+name+'”？项目将从当前列表隐藏，本机素材、历史结果和原订单完整保留，可从“已删除项目”恢复；不会取消上游或退款。',{title:'删除项目'}))return;
    if(doc?.id!==canvasId||owner!==canvasOpenEpoch251||locallyRunning()||navigationBusy259)return;
    await navigate259(async()=>{
      await removeCanvasProject(canvasId);
      gallery.removeProject(canvasId);
      return null;
    });
  });
  async function showRemovedCanvases(){
    const owner=canvasOpenEpoch251,canvasId=doc?.id,ticket=++removedRead261;
    const rows=(await api('/api/canvas/list?includeDeleted=1')).canvases.filter(row=>row.deleted);
    if(ticket!==removedRead261||owner!==canvasOpenEpoch251||canvasId!==doc?.id)return;
    $('removedCanvasRows').innerHTML=rows.length?rows.map(row=>'<section class="saved-work"><div><b>'+esc(row.name)+'</b><small class="muted">'+esc(projectStamp261(row)+' · '+String(row.id).slice(-6))+'</small></div><button data-restore-canvas="'+esc(row.id)+'">恢复项目</button></section>').join(''):'<p>暂无已删除项目。</p>';
    if(!$('removedCanvasesDialog').open)$('removedCanvasesDialog').showModal();
  }
  $('removedCanvases').onclick=safe(showRemovedCanvases);
  $('closeRemovedCanvases').onclick=()=>$('removedCanvasesDialog').close();
  $('removedCanvasRows').onclick=safe(async event=>{
    const button=event.target.closest('[data-restore-canvas]');if(!button)return;
    const canvasId=button.dataset.restoreCanvas;
    await navigate259(async()=>{const response=await api('/api/canvas/restore',{canvasId});return response.document;});
    $('removedCanvasesDialog').close();message('项目已恢复；未决任务仍使用原订单继续查询。');
  });
  async function showLocation(file){const data=await api('/api/canvas/location?'+new URLSearchParams({id:doc.id,file}));locationFile=file;$('resultLocationText').textContent=(data.inLibrary?'已收藏到作品库。':'当前未收藏；结果文件已保存在本机。')+'\n实际文件：'+data.path+'\n如需放到桌面或其他目录，请使用“另存到电脑”。';$('resultLocationDialog').showModal();}
  $('closeResultLocation').onclick=()=>$('resultLocationDialog').close();
  $('revealResult').onclick=safe(async()=>{await api('/api/canvas/reveal',{canvasId:doc.id,file:locationFile});message('已打开结果所在文件夹。');});
  $('closeSavedWorks').onclick=()=>$('savedWorksDialog').close();
  $('resultArchive').onclick=()=>{renderResultArchive();$('canvasResultsDialog').showModal();};
  $('closeCanvasResults').onclick=()=>$('canvasResultsDialog').close();
  $('canvasResultsRows').onclick=safe(handleResultAction);
  $('savedWorks').onclick=safe(async()=>{const data=await api('/api/canvas/saved');$('savedWorksRows').innerHTML=data.works.length?data.works.map(row=>'<section class="saved-work"><b>'+esc(row.name)+'</b><p>画布：'+esc(row.canvasName)+'</p><p class="saved-work-path">'+esc(row.path)+'</p><button data-open-work="'+esc(row.canvasId)+'">打开所属画布</button><a href="/api/canvas/media?'+esc(new URLSearchParams({id:row.canvasId,file:row.file,download:'1'}))+'" download>下载文件</a></section>').join(''):'<p>暂无收藏。在生成卡上点击“收藏到作品库”后会显示在这里。</p>';$('savedWorksDialog').showModal();});
  $('savedWorksRows').onclick=safe(async event=>{const button=event.target.closest('[data-open-work]');if(!button)return;await navigate259(async()=>{const restored=(await api('/api/canvas/restore',{canvasId:button.dataset.openWork})).document;return restored;});$('savedWorksDialog').close();message('已打开作品所属画布；结果文件未移动。');});
  $('documents').onchange=safe(async()=>{const canvasId=$('documents').value;await navigate259(async()=>(await api('/api/canvas/document?id='+canvasId)).document);});
  $('fullscreen').onclick=safe(async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();});
  $('closeViewer').onclick=()=>$('viewer').close();$('viewer').onclose=()=>{$('viewerMedia').querySelector('video')?.pause();$('viewerMedia').innerHTML='';};
  window.addEventListener('pagehide',()=>{clearTimeout(pollTimer);clearTimeout(textPollTimer);document.querySelectorAll('video').forEach(v=>v.pause());});window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  window.addEventListener('focus',catalogOnEntry251);
  const catalogTimer277=setInterval(catalogOnEntry251,30000);
  window.addEventListener('pagehide',()=>clearInterval(catalogTimer277),{once:true});
  document.addEventListener('visibilitychange',()=>{
    updateWireFlowVisibility();
    catalogOnEntry251();
    if(!document.hidden){scheduleRuns();scheduleWriting();}
    else{clearTimeout(pollTimer);clearTimeout(textPollTimer);}
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent)return;
    if(event.data?.type==='canvas-show-projects'){
      if(!gallery.visible())$('showCanvasGallery').click();
      return;
    }
    if(event.data?.type==='canvas-open-document259'&&/^[a-f0-9]{32}$/.test(event.data.canvasId||'')){
      if(doc?.id!==event.data.canvasId||gallery.visible()){
        gallery.openDocument(event.data.canvasId);
      }
      return;
    }
    if(event.data?.type!=='nanbudo:module-active251')return;
    canvasModuleActive251=!!event.data.active;
    updateWireFlowVisibility();
    if(canvasModuleActive251){catalogOnEntry251();scheduleRuns();scheduleWriting();}
    else{clearTimeout(pollTimer);clearTimeout(textPollTimer);}
  });
  $('fields').addEventListener('focusout',()=>setTimeout(paintCatalog251,0));
  document.addEventListener('pointerup',()=>{if(catalogPaintPending251)setTimeout(paintCatalog251,0);});
  studio=CanvasStudio252.create({
    state:()=>({doc,selected,selectedEdge,zoom,pan,locked:locked(),layoutLocked,gesture:!!(drag||linkDrag||wireDrag),runNodeId}),
    id,labels,esc,snapshot,checkpoint,message,save,refreshQuote,render,inspect,renderSelection,drawWires,
    select:(nid,defer=false)=>select(nid,defer,true),
    setPrimary:nid=>{selected=nid;selectedEdge=-1;},
    setEdge:index=>{selectedEdge=index;selected='';pending='';drawWires();renderSelection();inspect();},
    setViewport:(nextPan,nextZoom=zoom)=>{pan=nextPan;zoom=nextZoom;transform();},
    suppress:()=>{suppressClick=true;setTimeout(()=>{suppressClick=false;},150);},
    commitLayout:before=>{undoStack.push(before);if(undoStack.length>60)undoStack.shift();redoStack=[];changed([],true);},
    changed,add,disconnect,canDisconnect:index=>canDisconnect(doc?.graph.edges[index]),canRemove:nodes=>!nodes.some(inputLocked),historyStep,
    repairRun:()=>{if(!node(runNodeId))runNodeId=doc.graph.nodes.find(n=>G.processors.has(n.kind))?.id||'';},
    settleRender:()=>{if(renderPending)render();},
    resultAction:handleResultAction,
    openAssistant:()=>{studio?.hideInspector();return assistant254?.open();},openDirector:()=>director254?.open()
  });
  tail283=window.CanvasTail283?.create({state:()=>({doc,selected}),locked:inputLocked,media,notify:message,
    previewChanged:controls,preview:async n=>{const canvasId=doc.id,sourceFile=n.settings.tailSourceFile;await save();if(doc?.id!==canvasId||node(n.id)!==n||n.settings.tailSourceFile!==sourceFile)return '';return '/api/canvas/tail-preview?'+new URLSearchParams({canvasId,nodeId:n.id,sourceFile});},
    commit:safe(async(n,patch)=>{if(!doc?.graph.nodes.includes(n)||inputLocked(n.id))return;checkpoint();Object.assign(n.settings,patch);changed([n.id]);render();inspect();await refreshQuote();})});
  assistant254=window.CanvasAssistant254?.create({
    host:document.body,state:()=>({canvasId:doc?.id||'',nodeId:selected,nodeKind:node(selected)?.kind,text:node(selected)?.text||'',revision:promptRevision(selected),locked:globalLocked()}),
    request:api,notify:message,prepare:()=>save(),onReceipt:receiveTextReceipt,
    canApply:mode=>!locked()&&(mode==='new'?node(selected)?.kind==='prompt':!inputLocked(selected)),
    apply:async result=>{
      const source=node(result.nodeId);
      if(locked()||result.mode!=='new'&&inputLocked(result.nodeId)||doc?.id!==result.canvasId||selected!==result.nodeId||!source||source.text!==result.sourceText||promptRevision(result.nodeId)!==result.sourceRevision)throw new Error('画布、原文或原任务状态已改变。建议仍保留在协作记录中，可在输入解锁后应用。');
      const text=String(result.text||'');if(!text.trim())throw new Error('建议内容为空。');
      const combined=result.finalText??(result.mode==='append'?[source.text,text].filter(Boolean).join('\n\n'):text);
      if(Array.from(combined).length>10000)throw new Error('应用后会超过文字节点10000字上限；建议已保留，请缩短后再应用。');
      if(!['replace','append','new'].includes(result.mode))throw new Error('应用方式无效。');
      if(result.mode==='new'){const inputs=doc.graph.edges.filter(edge=>edge.target===source.id);if(doc.graph.edges.length+inputs.length>160)throw new Error('保留素材引用需要复制原卡的输入连线，但会超过160条上限；请改用替换或减少连线。');const target=add('prompt',{x:source.x+340,y:source.y+40});target.name=(source.name+' · AI建议').slice(0,80);target.text=text;doc.graph.edges.push(...inputs.map(edge=>({source:edge.source,target:target.id})));changed([target.id]);}
      else{checkpoint();source.text=combined;changed([source.id]);}
      const appliedCanvas=doc.id,appliedNode=selected,appliedRevision=revision;render();inspect();await save();if(doc?.id===appliedCanvas&&selected===appliedNode&&revision===appliedRevision){await refreshQuote();if(doc?.id===appliedCanvas&&selected===appliedNode)message('建议已应用并保存，可用撤销恢复；没有自动生成图片或视频。');}
    }
  });
  director254=window.CanvasDirector254?.create({
    state:()=>({doc,selected,locked:locked()}),notify:message,
    insert:async(file,prompt,directorState)=>{
      if(!doc||locked())throw new Error('请先打开可编辑画布。');const owner=doc.id;
      const signature=JSON.stringify([prompt,directorState]);
      let target=directorPending254?.canvasId===owner&&directorPending254.signature===signature?node(directorPending254.nodeId):null;
      if(!target){target=add('scene',studio?.insertionPoint());target.name='导演构图 · 机位参考';target.text=String(prompt||'').slice(0,10000);target.director254=directorState;changed([target.id]);directorPending254={canvasId:owner,nodeId:target.id,signature};}
      try{const uploaded=target.file?true:await upload(file,target.id);if(!uploaded||doc?.id!==owner)throw new Error('画布已切换，未向其他画布插入构图。');await save();directorPending254=null;message('构图已保存为场景参考图，机位说明随节点传递；连到生成节点后再确认积分。');}
      catch(error){if(doc?.id===owner&&node(target.id))throw new Error(error.message+'；未完成的参考卡已保留，重试会继续这张卡。');throw error;}
    }
  });
  const canvasAssetButton=$('openCanvasProjectAssets');
  const canvasAssetLibrary=window.CanvasProjectAssets?.create({state:canvasAssetState,request:api,insert:addCanvasProjectAsset,
    sync:syncCanvasAssets,confirm:studioConfirm,escape:esc});
  if(canvasAssetButton)canvasAssetButton.onclick=safe(async()=>{
    if(!canvasAssetLibrary)throw new Error('项目资产组件尚未加载，请重新打开画布。');
    await canvasAssetLibrary.open(canvasAssetButton);
  });
  $('openCanvasAssistant254').onclick=safe(async()=>{if(!doc||node(selected)?.kind!=='prompt')throw new Error('先选择一张创意提示词卡，再打开文字协作。');if(!assistant254)throw new Error('协作组件尚未加载，请重新打开画布。');studio?.hideInspector();await assistant254.open();});
  $('openCanvasDirector254').onclick=safe(async()=>{if(!doc||locked())throw new Error('请先打开可编辑画布。');if(!director254)throw new Error('导演台组件尚未加载，请重新打开画布。');await director254.open();});
  $('nodes').addEventListener('click',event=>{const button=event.target.closest('[data-node-action254]');if(!button)return;event.stopImmediatePropagation();event.preventDefault();const nid=button.closest('.node').dataset.id;select(nid);if(button.dataset.nodeAction254==='assistant'){studio?.hideInspector();safe(()=>assistant254?.open())();}},true);
  function bootStep254(text,progress){$('canvasBootDetail254').textContent=text;$('canvasBootProgress254').style.width=progress+'%';}
  gallery=CanvasProjectGallery.create({
    root:$('canvasGallery'),
    list:async()=>(await api('/api/canvas/list')).canvases,
    open:canvasId=>navigate259(async()=>(await api('/api/canvas/document?id='+encodeURIComponent(canvasId))).document),
    createProject:showNewCanvasProject,remove:removeCanvasProject,confirm:studioConfirm,
    showRemoved:showRemovedCanvases,formatDate:projectStamp261,escape:esc,
    notify:message
  });
  api('/api/canvas/styles').then(value=>{styles=value.styles||[];if(doc)paintCatalog251();}).catch(()=>{});
  refreshCanvasCatalog251(true);
  window.addEventListener('pagehide',()=>{assistant254?.destroy();director254?.destroy();tail283?.destroy();});
  gallery.show();
  updateWireFlowVisibility();
})();

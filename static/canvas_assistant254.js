'use strict';
// The controller is independent from its panel so async ownership can be tested
// without a browser or a real model. The host owns graph edits and undo history.
(function(global){
  const MAX=10000,limit=value=>Array.from(String(value)).length;
  const sameSource=(a,b)=>!!a&&!!b&&a.canvasId===b.canvasId&&a.nodeId===b.nodeId&&a.text===b.text&&String(a.revision??'')===String(b.revision??'');
  const snapshot=value=>({canvasId:value?.canvasId||'',nodeId:value?.nodeId||'',nodeKind:value?.nodeKind||'prompt',text:typeof value?.text==='string'?value.text:'',revision:value?.revision??''});
  const frozen=value=>JSON.parse(JSON.stringify(value));
  const receipts=()=>global.crypto.randomUUID().replaceAll('-','');
  function createController(bridge){
    let serial=0,owner=null,intent=null;
    const localReceipts=new Map();
    const ownerKey=source=>source.canvasId+':'+source.nodeId;
    const isUnresolved=record=>['submitting','pending','queued','reserving','calling','unknown','not_called'].includes(record?.status);
    function rememberReceipt(source,record,fresh=false){
      const key=ownerKey(source),previous=localReceipts.get(key);
      if(previous&&previous.receiptId!==record.receiptId&&!fresh)return;
      const saved={...(source.action?{action:source.action}:{}),...record,canvasId:source.canvasId,nodeId:source.nodeId};
      localReceipts.set(key,saved);
      bridge.onReceipt?.(saved);
    }
    const view={visible:false,phase:'idle',action:'',models:[],model:'',instruction:'',quote:null,receipt:null,result:null,history:[],message:'',error:false,applying:false};
    const state=()=>snapshot(bridge.state()),emit=()=>bridge.onChange?.(getState());
    const getState=()=>({...view,models:view.models.slice(),history:view.history.slice(),owner:owner?{...owner}:null,canApply:!!view.result?.applicable&&(view.action!=='storyboard_regenerate'||view.result.contextCurrent===true)&&view.result.canvasId===owner?.canvasId&&view.result.nodeId===owner?.nodeId&&(view.receipt?.sourceText===undefined||view.receipt.sourceText===owner?.text)&&sameSource(owner,state())&&!bridge.state()?.locked&&!view.applying});
    const current=(ticket,origin)=>ticket===serial&&view.visible&&sameSource(origin,state());
    function warn(message){view.message=message;view.error=true;emit();}
    function requireOwner(){if(!owner||!sameSource(owner,state()))throw Error('文字或选择已变化，请重新打开助手；原建议保留在原节点记录中。');if(bridge.state()?.locked)throw Error('当前画布正在执行任务，请稍后再操作。');}
    function clearQuote(){view.quote=null;intent=null;if(!['submitting','pending'].includes(view.phase))view.phase='idle';}
    function setModel(model){if(['submitting','pending'].includes(view.phase))return;view.model=String(model);clearQuote();emit();}
    function setInstruction(text){if(['submitting','pending'].includes(view.phase))return;view.instruction=String(text);clearQuote();emit();}
    async function open(options={}){
      const source=state();if(!source.canvasId||!source.nodeId)throw Error('请先选择一个文字节点。');if(bridge.state()?.locked)throw Error('当前画布正在执行任务，请稍后打开文字助手。');
      const action=options.action==='storyboard_regenerate'?'storyboard_regenerate':'';
      source.action=action;
      if(action&&source.nodeKind!=='generator')throw Error('请先选择一张视频生成卡。');
      if(limit(source.text)>MAX)throw Error('当前文字超过10000字，未截断原文。');
      const ticket=++serial;owner=source;intent=null;
      Object.assign(view,{visible:true,phase:'loading',action,quote:null,receipt:null,result:null,history:[],message:'正在读取已发布文本模型与原调用记录…',error:false,applying:false});
      if(action)view.instruction='根据当前视频卡的内容与素材引用，重新生成可执行的分镜提示词，保留原有事件、对白与指定素材。';emit();
      try{
        const [catalog,history]=await Promise.all([bridge.request('/api/canvas/assistant/catalog',{canvasId:owner.canvasId}),bridge.request('/api/canvas/assistant/history',{canvasId:owner.canvasId,nodeId:owner.nodeId})]);
        if(!current(ticket,source))return;
        view.models=Array.isArray(catalog.models)?catalog.models:[];view.history=Array.isArray(history.records)?history.records.filter(row=>action?row.action===action:row.action!=='storyboard_regenerate'):[];
        if(!view.models.some(row=>row.model===view.model))view.model=view.models[0]?.model||'';
        const local=localReceipts.get(ownerKey(source)),latest=view.history[0];
        const pending=isUnresolved(local)?local:isUnresolved(latest)?latest:null;
        if(pending){
          rememberReceipt(source,pending,true);
          adopt(pending);
          return;
        }
        if(local?.result&&(!latest||latest.receiptId===local.receiptId)){adopt(local);return;}
        view.phase='idle';view.message=view.models.length?(action?'重新生成当前视频卡的分镜提示词。先核价，确认后调用一次；审核并应用后才替换提示词，不会自动生成视频。':'只处理当前文字节点。先核价，确认后才调用模型；建议不会自动写入。'):'后台尚未发布可用的AI小调用模型与价格。';view.error=!view.models.length;emit();
      }catch(error){if(current(ticket,source)){view.phase='error';warn(error.message);}throw error;}
    }
    function close(){serial++;view.visible=false;view.applying=false;emit();}
    function sync(){if(view.visible&&owner&&!sameSource(owner,state())){close();bridge.notify?.('文字或选择已变化，助手已收起；原调用仍保留，可在原节点查询。');}else if(view.visible)emit();}
    async function quote(){
      requireOwner();if(['loading','quoting','submitting','pending'].includes(view.phase))return;
      if(isUnresolved(localReceipts.get(ownerKey(owner))))throw Error('此文字节点有原调用待核对，请先查询原记录。');
      if(!view.instruction.trim()||limit(view.instruction)>2000)throw Error('请填写不超过2000字的修改意图。');
      if(!view.models.some(row=>row.model===view.model))throw Error('请选择已发布的AI小调用模型。');
      const source={...owner},ticket=++serial,request={canvasId:source.canvasId,nodeId:source.nodeId,sourceText:source.text,revision:source.revision,instruction:view.instruction,model:view.model,...(view.action?{action:view.action}:{})};
      view.phase='quoting';view.quote=null;view.result=null;view.error=false;view.message='正在免费核对本次费用…';emit();
      try{
        if(bridge.prepare)await bridge.prepare();
        if(!current(ticket,source))return;
        const result=await bridge.request('/api/canvas/assistant/quote',request);
        if(!current(ticket,source))return;
        if(result.canvasId!==source.canvasId||result.nodeId!==source.nodeId||result.model!==request.model||!result.quoteId||!result.sourceHash||result.callCount!==1||!Number.isFinite(result.estimatedPoints)||result.estimatedPoints<=0)throw Error('本次报价身份或金额无效，未开放提交。');
        if(view.action&&result.action!==view.action)throw Error('分镜提示词报价类型不一致，请更新后重试。');
        intent=request;view.quote=result;view.receipt=null;view.phase='quoted';view.message='请核对下方费用，点击确认后才会进行本次调用。';emit();return result;
      }catch(error){if(current(ticket,source)){view.phase='error';warn(error.message);}throw error;}
    }
    function adopt(record){
      if(view.action&&record.action!==view.action)throw Error('原调用类型与当前分镜操作不一致，未应用。');
      if(record.result&&(record.result.canvasId!==owner.canvasId||record.result.nodeId!==owner.nodeId))throw Error('原结果所属节点不一致，未应用。');
      view.receipt=record;
      if(record.createdAt){view.history=[record,...view.history.filter(row=>row.receiptId!==record.receiptId)].slice(0,30);}
      if(record.sourceText!==undefined&&record.sourceText!==owner.text){view.result=record.result||null;view.phase='review';warn('原调用基于另一版文字，结果保留供查看；当前节点未被覆盖。');return;}
      view.result=record.result||null;
      const pending=['submitting','pending','queued','reserving','calling'].includes(record.status);
      view.phase=pending?'pending':view.result?'review':['failed','invalid'].includes(record.status)?'error':'unknown';
      const cost=record.settlement?.chargedPoints??view.result?.chargedPoints;
      view.message=view.result?(view.result.validationError||'建议已返回，尚未写入节点。')+(Number.isFinite(cost)?' 本次实际结算 '+cost+' 积分。':' 费用以原调用回执为准。'):record.message||record.error||'原调用记录已保留，可继续查询；不会重新提交。';
      view.error=!!record.error||!!view.result?.validationError||['unknown','missing','not_called','failed'].includes(record.status);emit();
    }
    async function submit(){
      requireOwner();if(view.phase!=='quoted'||!view.quote||!intent)throw Error('请先免费核价并确认本次费用。');
      if(view.instruction!==intent.instruction||view.model!==intent.model)throw Error('修改意图或模型已变化，请重新核价。');
      if(view.quote.expiresAt*1000<=Date.now())throw Error('报价已过期，请重新核价。');
      const source={...owner},ticket=++serial,q=frozen(view.quote),receiptId=receipts();
      const body={canvasId:source.canvasId,nodeId:source.nodeId,receiptId,quoteId:q.quoteId,sourceHash:q.sourceHash,billingConfirmed:true,expectedCredits:q.estimatedPoints,expectedPoints:q.estimatedPoints};
      view.receipt={receiptId,canvasId:source.canvasId,nodeId:source.nodeId,status:'submitting'};view.phase='submitting';view.quote=null;view.message='正在提交这一次已确认的调用…';view.error=false;rememberReceipt(source,view.receipt,true);emit();
      try{
        const record=await bridge.request('/api/canvas/assistant/start',body);
        if(record.receiptId!==receiptId||record.canvasId!==source.canvasId||record.nodeId!==source.nodeId)throw Error('提交回执身份不一致，请查询原记录；未自动重试。');
        rememberReceipt(source,record);
        if(current(ticket,source)||view.visible&&sameSource(owner,source)&&view.receipt?.receiptId===receiptId)adopt(record);
        return record;
      }catch(error){
        const rejected=error.status>=400&&error.status<500;
        rememberReceipt(source,{receiptId,status:rejected?'failed':'unknown',error:error.message});
        if(current(ticket,source)){if(rejected){view.receipt=null;view.phase='error';}else view.phase='unknown';warn(error.message+' 原请求不会自动重提。');}
        throw error;
      }
    }
    async function observe(receiptId=view.receipt?.receiptId){
      if(!owner||!receiptId)throw Error('请先选择一个原调用记录。');
      const source={...owner},ticket=++serial;
      const record=await bridge.request('/api/canvas/assistant/observe',{canvasId:source.canvasId,receiptId});
      if(record.receiptId!==receiptId||record.canvasId!==source.canvasId||record.nodeId&&record.nodeId!==source.nodeId)throw Error('原调用不属于当前节点。');
      rememberReceipt(source,record);
      if(!current(ticket,source))return record;
      if(record.sourceText!==undefined&&record.sourceText!==source.text){view.result=record.result||null;view.receipt=record;view.phase='review';warn('当前节点文字已变化，原建议仅供查看；可复制后自行整理。');return record;}
      adopt(record);return record;
    }
    async function applyResult(mode){
      requireOwner();if(view.applying||!['replace','append','new'].includes(mode))return;
      if(view.action==='storyboard_regenerate'){
        if(mode!=='replace')throw Error('请审核后替换当前视频卡的分镜提示词，避免重复对白和素材引用。');
        const applyOwner=owner,receiptId=view.receipt?.receiptId;
        view.applying=true;emit();
        try{const verified=await observe(receiptId);if(!view.visible||owner!==applyOwner||view.receipt?.receiptId!==receiptId)throw Error('当前审核已关闭或切换，未应用建议。');requireOwner();if(verified.result?.contextCurrent!==true)throw Error('原稿、素材或画风已变化，原建议仅供查看，请重新生成分镜提示词。');view.result=verified.result;view.receipt=verified;}
        finally{view.applying=false;emit();}
      }
      const text=view.result?.text;
      if(!view.result?.applicable||typeof text!=='string'||!text.trim()||limit(text)>MAX)throw Error('此返回尚不能应用，请核对完整原文。');
      if(view.receipt?.sourceText!==undefined&&view.receipt.sourceText!==owner.text)throw Error('当前节点已不是原调用输入，未覆盖文字。');
      const finalText=mode==='append'?(owner.text?owner.text+'\n\n':'')+text:text;
      if(limit(finalText)>MAX)throw Error('应用后超过10000字，已保留完整建议；未截断或覆盖原文。');
      const source={...owner},ticket=serial;view.applying=true;emit();
      try{
        const applied=await bridge.apply({mode,canvasId:source.canvasId,nodeId:source.nodeId,sourceText:source.text,sourceRevision:source.revision,text,finalText,receiptId:view.receipt.receiptId});
        if(applied===false)throw Error('当前节点已变化，未应用建议；原返回保留。');
        // The host can close this session while saving the edited graph. A later
        // open belongs to another interaction and must not be closed or reset.
        if(ticket===serial){close();bridge.notify?.('建议已应用，可用画布撤销恢复原文。');}
      }finally{if(ticket===serial){view.applying=false;emit();}}
    }
    const records=canvasId=>[...localReceipts.values()].filter(record=>record.canvasId===canvasId);
    return {open,close,sync,quote,submit,observe,applyResult,setModel,setInstruction,getState,records,destroy:close};
  }
  function create(bridge){
    const root=document.createElement('section');root.className='canvas-assistant254';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-label','AI协作写作');
    root.innerHTML='<header><div><b>AI 协作写作</b><small>当前文字节点 · 结果由你决定是否应用</small></div><button type="button" data-action="close" aria-label="关闭文字助手">×</button></header><div class="assistant-body254"><label>创作模型<select data-field="model" aria-label="已发布文本模型"></select></label><label>修改意图<textarea data-field="instruction" maxlength="2000" rows="3" placeholder="例如：增强人物冲突，保留原有事件与素材引用。"></textarea></label><div class="assistant-actions254"><button type="button" data-action="quote">免费核对费用</button><button type="button" data-action="submit" class="primary" hidden></button></div><p data-view="message" role="status"></p><button type="button" data-action="observe" hidden>查询原调用（不重新生成）</button><section data-view="result" hidden><b>建议预览</b><textarea data-view="text" readonly rows="8" aria-label="模型建议原文"></textarea><div class="assistant-actions254"><button type="button" data-action="copy">复制建议</button><button type="button" data-action="replace">替换当前文字</button><button type="button" data-action="append">追加到当前文字</button><button type="button" data-action="new">新建文字节点</button></div></section><details><summary>本节点原调用记录</summary><div data-view="history"></div></details></div>';
    (bridge.host||document.body).append(root);
    const $=query=>root.querySelector(query),model=$('[data-field="model"]'),instruction=$('[data-field="instruction"]');
    let timer=null,destroyed=false;
    const message=error=>{const box=$('[data-view="message"]');box.textContent=error.message||String(error);box.dataset.error='true';};
    function schedule(view){clearTimeout(timer);timer=null;if(view.visible&&view.phase==='pending'&&!document.hidden)timer=setTimeout(()=>run(()=>controller.observe()),1800);}
    function render(view){
      if(destroyed)return;root.hidden=!view.visible;if(!view.visible){clearTimeout(timer);return;}
      const storyboard=view.action==='storyboard_regenerate';root.setAttribute('aria-label',storyboard?'重新生成分镜提示词':'AI协作写作');root.querySelector('header b').textContent=storyboard?'重新生成分镜提示词':'AI 协作写作';root.querySelector('header small').textContent=storyboard?'当前视频卡 · 审核后应用提示词':'当前文字节点 · 结果由你决定是否应用';$('[data-action="new"]').hidden=storyboard;$('[data-action="append"]').hidden=storyboard;$('[data-action="replace"]').textContent=storyboard?'应用到当前视频卡':'替换当前文字';
      const entries=view.models.map(row=>[row.model,row.displayName]);
      if(model.dataset.items!==JSON.stringify(entries)){model.replaceChildren(...entries.map(([value,name])=>{const option=document.createElement('option');option.value=value;option.textContent=name;return option;}));model.dataset.items=JSON.stringify(entries);}
      model.value=view.model;if(document.activeElement!==instruction)instruction.value=view.instruction;
      const busy=view.applying||['loading','quoting','submitting','pending'].includes(view.phase);model.disabled=instruction.disabled=busy;
      $('[data-action="quote"]').disabled=busy||!view.models.length;
      const submit=$('[data-action="submit"]');submit.hidden=view.phase!=='quoted';submit.disabled=busy;submit.textContent=view.quote?'确认 '+view.quote.estimatedPoints+' 积分，调用一次':'确认调用';
      const info=$('[data-view="message"]');info.textContent=view.message;info.dataset.error=String(view.error);
      $('[data-action="observe"]').hidden=!view.receipt?.receiptId;$('[data-action="observe"]').disabled=view.applying||view.phase==='submitting';
      $('[data-view="result"]').hidden=!view.result;$('[data-view="text"]').value=view.result?.text||'';
      for(const mode of ['replace','append','new'])$('[data-action="'+mode+'"]').disabled=!view.canApply||bridge.canApply?.(mode)===false;
      const history=$('[data-view="history"]');history.replaceChildren(...view.history.map(row=>{const button=document.createElement('button');button.type='button';button.disabled=view.applying;button.dataset.receipt=row.receiptId;button.textContent=new Date(row.createdAt*1000).toLocaleString()+' · '+row.modelName+' · '+({returned:'已返回',invalid:'待核对正文',failed:'已结束',pending:'处理中',queued:'排队中',calling:'处理中',unknown:'待核对',not_called:'未调用模型'}[row.status]||'待核对');return button;}));
      schedule(view);
    }
    const controller=createController({...bridge,onChange:render});
    async function run(action){const source=snapshot(bridge.state());try{return await action();}catch(error){if(!destroyed&&sameSource(source,snapshot(bridge.state())))message(error);}}
    model.addEventListener('change',()=>controller.setModel(model.value));instruction.addEventListener('input',()=>controller.setInstruction(instruction.value));
    root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.receipt){run(()=>controller.observe(button.dataset.receipt));return;}const action=button.dataset.action;if(action==='close'){controller.close();return;}if(action==='quote')run(()=>controller.quote());else if(action==='submit')run(()=>controller.submit());else if(action==='observe')run(()=>controller.observe());else if(['replace','append','new'].includes(action))run(()=>controller.applyResult(action));else if(action==='copy')run(async()=>{await navigator.clipboard.writeText(controller.getState().result?.text||'');bridge.notify?.('建议已复制。');});});
    const visibility=()=>{if(!document.hidden)schedule(controller.getState());else clearTimeout(timer);};document.addEventListener('visibilitychange',visibility);
    return {open:options=>run(()=>controller.open(options)),close:controller.close,sync:controller.sync,getState:controller.getState,records:controller.records,destroy:()=>{destroyed=true;clearTimeout(timer);controller.destroy();root.remove();document.removeEventListener('visibilitychange',visibility);}};
  }
  const api={create,createController,sameSource};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.CanvasAssistant254=api;
})(typeof globalThis!=='undefined'?globalThis:window);

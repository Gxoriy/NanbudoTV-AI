/* Host-page appearance, storage, and ecommerce image defaults. */
(() => {
  'use strict';
  const trigger=document.getElementById('openStorageSettings');
  if(!trigger)return;
  const features=[['rewrite','剧本改写'],['original','一键原创'],['workflow','短剧工作流'],['breakdown','爆款拆解'],['canvas','视频画布'],['prompt_reverse','提示词反推'],['characters','数字人'],['ecommerce','AI电商宣传片'],['store','AI探店宣传片'],['advertising','AI广告宣传片']];
  const labels=Object.fromEntries(features),endpoint='/api/local-storage/settings';
  const dialog=document.createElement('dialog');
  dialog.id='localStorageSettings227';dialog.setAttribute('aria-labelledby','localStorageSettingsTitle227');
  dialog.innerHTML=`<section class="storage-settings-shell"><header class="storage-settings-head"><div><h2 id="localStorageSettingsTitle227">设置 · 外观与存储</h2><p>为各个功能设置成果目录，生成成功后按项目自动整理。</p></div><button type="button" class="ghost-btn storage-settings-close" data-storage-close aria-label="关闭设置">×</button></header><div class="storage-settings-body"><section data-theme-picker228></section><p class="storage-settings-note">设置目录后，新成果会自动保存。项目按名称建文件夹，图片按人物、场景、物品归类，视频按集数和视频卡整理。重新生成保留版本，旧文件继续保留。目录留空时沿用当前保存方式。</p><p class="storage-settings-native-note" data-storage-native-note hidden>当前在浏览器中，请手动填写完整文件夹路径；桌面客户端可直接选择或打开文件夹。</p><div data-storage-rows></div><section class="storage-settings-errors" data-storage-errors hidden aria-label="成果保存提醒"></section></div><div class="storage-settings-discard" data-storage-discard hidden role="alert"><span>还有未保存的目录修改，是否放弃？</span><div><button type="button" class="ghost-btn" data-storage-continue>继续修改</button><button type="button" class="secondary-btn" data-storage-abandon>放弃修改</button></div></div><footer class="storage-settings-footer"><p class="storage-settings-status" data-storage-status role="status" aria-live="polite"></p><div class="storage-settings-actions"><button type="button" class="ghost-btn" data-storage-retry hidden>重新读取</button><button type="button" class="ghost-btn" data-storage-close>取消</button><button type="button" class="primary-btn" data-storage-save>保存设置</button></div></footer></section>`;
  document.body.append(dialog);
  window.NanbudoThemes228?.mount(dialog.querySelector('[data-theme-picker228]'));
  const $=selector=>dialog.querySelector(selector),inputs=new Map(),rowButtons=new Map();
  let baseline={},loaded=false,busy='',epoch=0,noticeEpoch=0,abortRead=null,polling=false,lastErrorSignature='';
  const cachePanel269=document.createElement('section');cachePanel269.className='storage-cache269';
  cachePanel269.innerHTML=`<h3>本地空间与缓存清理</h3>
    <p>统计本机成果与素材，按类别清理可重建的缓存和可移除的临时文件。</p>
    <button type="button" class="secondary-btn" data-cache-inspect269>扫描本地空间</button>
    <section class="storage-inventory279" data-cache-inventory279 hidden aria-label="本机成果与素材">
      <h4>本机成果与素材 <small>保留</small></h4>
      <dl data-cache-generated279></dl>
      <details data-cache-extra279 hidden><summary>下载与导入文件</summary><div data-cache-extra-groups279></div></details>
    </section>
    <fieldset class="storage-cleanup279" data-cache-options279 hidden>
      <legend>可清理的缓存与临时文件</legend>
      <label class="storage-cleanup-all279" data-cache-select-row279><input type="checkbox" data-cache-all279>全选可清理项</label>
      <div data-cache-categories279></div>
    </fieldset>
    <p data-cache-status269 role="status" aria-live="polite"></p>
    <ul class="storage-cleanup-result279" data-cache-result279 hidden></ul>
    <div data-cache-confirmation269 hidden>
      <span data-cache-selected279></span>
      <button type="button" class="secondary-btn" data-cache-clear269>确认清理所选</button>
      <button type="button" class="ghost-btn" data-cache-cancel269>取消选择</button>
    </div>`;
  $('[data-storage-rows]').before(cachePanel269);
  let cacheReview269=null;
  const imagePanel=document.createElement('section');imagePanel.className='storage-cache269';
  imagePanel.innerHTML=`<h3>电商图片默认设置</h3>
    <p>统一设置 AI 电商板块出图使用的模型和清晰度。</p>
    <div class="storage-settings-path" style="flex-wrap:wrap">
      <label class="field" style="flex:2 1 240px;min-width:0">默认图片模型<select data-image-default-model></select></label>
      <label class="field" style="flex:1 1 110px;min-width:0">默认清晰度<select data-image-default-resolution></select></label>
    </div>
    <p class="storage-settings-status" data-image-default-status role="status" aria-live="polite"></p>
    <button type="button" class="secondary-btn" data-image-default-save>保存图片默认设置</button>
    <button type="button" class="ghost-btn" data-image-default-retry hidden>重新读取模型</button>`;
  cachePanel269.before(imagePanel);
  const imageModel=$('[data-image-default-model]'),imageResolution=$('[data-image-default-resolution]');
  const imageSave=$('[data-image-default-save]'),imageRetry=$('[data-image-default-retry]');
  const imagePreferenceUrl='/api/ecommerce/preferences?media=image';
  const imageCatalogUrl='/api/ecommerce/workbench/catalog';
  const sharedImageResolutions=['1k','2k'];
  let imageBaseline=null,imageModels=[],imageRead=null,imageSaving=false;
  for(const [id,label]of features){
    const row=document.createElement('div');row.className='storage-settings-row';row.dataset.storageFeature=id;
    const title=document.createElement('label');title.htmlFor='storagePath227-'+id;title.textContent=label;
    const controls=document.createElement('div');controls.className='storage-settings-path';
    const input=document.createElement('input');input.id=title.htmlFor;input.type='text';input.autocomplete='off';input.spellcheck=false;input.placeholder='未设置，沿用当前保存方式';input.dataset.storagePath=id;
    const choose=document.createElement('button');choose.type='button';choose.className='secondary-btn';choose.textContent='选择文件夹';choose.dataset.storageChoose=id;
    const open=document.createElement('button');open.type='button';open.className='ghost-btn';open.textContent='打开';open.title='打开已保存的目录';open.dataset.storageOpen=id;
    controls.append(input,choose,open);row.append(title,controls);$('[data-storage-rows]').append(row);inputs.set(id,input);rowButtons.set(id,{choose,open});
    input.addEventListener('input',()=>{hideDiscard();status('目录尚未保存。');updateControls();});
    choose.addEventListener('click',()=>selectFolder(id));open.addEventListener('click',()=>openFolder(id));
  }
  const native=()=>window.pywebview?.api||null;
  const draft=()=>Object.fromEntries([...inputs].map(([id,input])=>[id,input.value.trim()]));
  const dirty=()=>loaded&&features.some(([id])=>draft()[id]!==baseline[id]);
  const imageDirty=()=>imageBaseline&&[imageModel.value,imageResolution.value].some((value,index)=>value!==imageBaseline.selection[index]);
  const imageNeedsSave=()=>imageBaseline&&(!imageBaseline.settings.model||imageDirty());
  function status(message,error=false,success=false){const node=$('[data-storage-status]');node.textContent=message;node.classList.toggle('error',error);node.classList.toggle('success',success);}
  function hideDiscard(){$('[data-storage-discard]').hidden=true;}
  function updateControls(){
    const blocked=!!busy;
    for(const [id,input]of inputs){input.disabled=blocked||!loaded;const buttons=rowButtons.get(id);buttons.choose.disabled=blocked||!loaded||!native()?.choose_storage_directory;const unsaved=input.value.trim()!==baseline[id];buttons.open.disabled=blocked||!loaded||!baseline[id]||unsaved||!native()?.open_storage_directory;buttons.open.title=unsaved?'保存设置后可打开此目录':'打开已保存的目录';}
    $('[data-storage-native-note]').hidden=!!native()?.choose_storage_directory;
    $('[data-storage-save]').disabled=blocked||!loaded;
    $('[data-storage-retry]').disabled=blocked;
    const retry=$('[data-storage-retry-results]');if(retry)retry.disabled=blocked;
    $('[data-cache-inspect269]').disabled=blocked;
    $('[data-cache-options279]').disabled=blocked||!cacheReview269||cacheReview269.busy;
    updateCacheSelection279();
    dialog.querySelectorAll('[data-storage-close]').forEach(button=>button.disabled=imageSaving||['save','native','retry','cache'].includes(busy));
    imageModel.disabled=imageSaving||!imageBaseline||!imageModels.length;
    imageResolution.disabled=imageModel.disabled||!selectedImageModel();
    imageSave.disabled=imageResolution.disabled||!imageResolution.value||!imageNeedsSave();
    imageRetry.disabled=!!imageRead||imageSaving;
  }
  function apply(data){
    if(!Array.isArray(data?.features)||features.some(([id])=>data.features.filter(row=>row?.id===id&&typeof row.path==='string').length!==1))throw Error('目录设置返回不完整，请重新读取。');
    baseline=Object.fromEntries(features.map(([id])=>[id,data.features.find(row=>row.id===id).path]));
    for(const [id,input]of inputs)input.value=baseline[id];
    loaded=true;updateErrorNotice(data.errors);hideDiscard();
  }
  function renderErrors(errors){
    const node=$('[data-storage-errors]');node.replaceChildren();
    const rows=Array.isArray(errors)?errors.filter(row=>row&&typeof row.message==='string'&&row.message):[];
    node.hidden=!rows.length;if(!rows.length)return;
    const title=document.createElement('p');title.textContent='最近的成果保存提醒';const list=document.createElement('ul');
    for(const row of rows){const item=document.createElement('li');item.textContent=[labels[row.feature]||'成果保存',row.projectName,row.message].filter(Boolean).join(' · ');list.append(item);}
    const note=document.createElement('small');note.textContent='已生成的成果仍保留在项目中。请检查保存目录后重试保存，重试不会重新生成或扣费。';
    const retry=document.createElement('button');retry.type='button';retry.className='secondary-btn';retry.textContent='重试保存';retry.dataset.storageRetryResults='';retry.disabled=!!busy;retry.addEventListener('click',retryResults);
    node.append(title,list,note,retry);
  }
  function updateErrorNotice(errors){
    const rows=Array.isArray(errors)?errors.filter(row=>row&&typeof row.message==='string'&&row.message):[];
    const signature=JSON.stringify(rows.map(row=>JSON.stringify([row.feature,row.projectName,row.message])).sort());
    trigger.textContent=rows.length?'设置 · 保存异常':'设置';trigger.classList.toggle('storage-settings-alert',!!rows.length);
    trigger.title=rows.length?'部分成果尚未保存到设置的目录，点击查看并重试保存':'外观、成果存储和电商图片默认设置';
    if(rows.length&&signature!==lastErrorSignature&&typeof window.toast==='function')window.toast('部分成果未保存到指定目录，原成果仍在项目中。请打开“设置”查看并重试保存。',true);
    lastErrorSignature=signature;
    if(dialog.open)renderErrors(rows);
  }
  async function request(method,body,signal,url=endpoint,messages={}){
    const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});
    let timer,timedOut=false;
    const timeoutMessage=method==='POST'?(messages.writeTimeout||'保存设置等待超时，请重新打开设置核对；没有自动重复提交。'):(messages.readTimeout||'读取设置等待超时，请重试。');
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;abort.abort();reject(Error(timeoutMessage));},messages.timeout||(method==='POST'?30000:15000));});
    const transport=(async()=>{const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',signal:abort.signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch(_){throw Error(messages.invalid||'设置暂时无法读取，请重试。');}if(!response.ok||data?.error)throw Error(data?.error||messages.invalid||'设置操作未完成，请重试。');return data;})();
    try{return await Promise.race([transport,deadline]);}catch(error){if(timedOut)throw Error(timeoutMessage);throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  function selectedImageModel(){return imageModels.find(row=>row.model===imageModel.value);}
  function imageStatus(message,error=false,success=false){const node=$('[data-image-default-status]');node.textContent=message;node.classList.toggle('error',error);node.classList.toggle('success',success);}
  function imageOptions(select,rows,value,placeholder){
    const options=rows.map(([id,label])=>new Option(label,id));
    if(!rows.some(([id])=>id===value)){const empty=new Option(placeholder,'');empty.disabled=true;options.unshift(empty);value='';}
    select.replaceChildren(...options);select.value=value;
  }
  function availableImageModels(catalog){
    if(!Array.isArray(catalog.imageModels)||!Array.isArray(catalog.imagePricing))throw Error('已发布的图片模型返回不完整，请重新读取。');
    return catalog.imageModels.filter(row=>row?.media==='image'&&row.model&&row.enabled!==false&&row.gatewayReady!==false&&row.referenceImageLimit>0).map(row=>{
      const supported=Array.isArray(row.supportedResolutions)?row.supportedResolutions:[];
      const resolutions=sharedImageResolutions.filter(value=>(!supported.length||supported.includes(value))&&
        (row.pricingMode==='live_quote'&&supported.includes(value)||catalog.imagePricing.some(price=>
          price?.model===row.model&&price.resolution===value&&Number.isFinite(Number(price.pricePerImage))&&Number(price.pricePerImage)>0)));
      return {...row,resolutions};
    }).filter(row=>row.resolutions.length);
  }
  function showImageResolutions(value,placeholder='请选择清晰度'){
    imageOptions(imageResolution,(selectedImageModel()?.resolutions||[]).map(item=>[item,item.toUpperCase()]),value,placeholder);
  }
  function imageSelectionChanged(){
    hideDiscard();
    imageStatus(imageNeedsSave()?'图片默认设置尚未保存。':'已读取保存的图片默认设置。');
    updateControls();
  }
  async function loadImagePreferences(){
    imageRead?.abort();const reader=new AbortController();imageRead=reader;
    imageBaseline=null;imageModels=[];imageRetry.hidden=true;
    imageOptions(imageModel,[],'','正在读取…');showImageResolutions('');
    imageStatus('正在读取电商图片设置和已发布模型…');updateControls();
    try{
      const [data,catalog]=await Promise.all([
        request('GET',null,reader.signal,imagePreferenceUrl),
        request('POST',{},reader.signal,imageCatalogUrl,{writeTimeout:'已发布模型列表读取超时，请重试。'}),
      ]);
      if(imageRead!==reader||!dialog.open)return;
      if(data.media!=='image'||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings))throw Error('电商图片设置返回不完整，请重新读取。');
      imageModels=availableImageModels(catalog);
      const settings=data.settings,hasSaved=!!settings.model;
      const active=hasSaved?imageModels.find(row=>row.model===settings.model&&
        (settings.route==='all'||ModelPresentation.routeForModel({visualModels:imageModels},'image',row.model)===settings.route)):imageModels[0];
      imageOptions(imageModel,imageModels.map(row=>[row.model,row.displayName||'已发布图片模型']),active?.model,
        imageModels.length?'原默认模型已下架或不可用，请重新选择':'暂无可用图片模型');
      showImageResolutions(hasSaved?settings.resolution:active?.resolutions[0],hasSaved?'原清晰度不可用，请重新选择':'请选择清晰度');
      // An unavailable choice is left blank so re-selecting it is always an explicit change.
      imageBaseline={settings,selection:[imageModel.value,imageResolution.value]};
      if(!imageModels.length){imageStatus('暂无可用的电商出图模型，请检查后台发布状态。',true);imageRetry.hidden=false;}
      else if(hasSaved&&(!imageModel.value||!imageResolution.value))imageStatus('原默认模型、线路或清晰度当前不可用，请重新选择并保存。',true);
      else imageStatus(hasSaved?'已读取保存的图片默认设置。':'尚未保存图片默认设置，可使用当前选项或更改后保存。');
    }catch(error){if(imageRead===reader&&dialog.open){imageStatus(error.message,true);imageRetry.hidden=false;}}
    finally{reader.abort();if(imageRead===reader){imageRead=null;updateControls();}}
  }
  async function saveImagePreferences(){
    const model=selectedImageModel(),resolution=imageResolution.value;
    if(imageSaving||!model?.resolutions.includes(resolution)||!imageNeedsSave())return;
    const original=imageBaseline.settings;
    const modelRoute=ModelPresentation.routeForModel({visualModels:imageModels},'image',model.model);
    const settings={model:model.model,resolution,route:original.route===modelRoute?original.route:'all',ratio:original.ratio||'1:1'};
    imageSaving=true;hideDiscard();imageStatus('正在保存图片默认设置…');updateControls();
    try{
      const data=await request('POST',{media:'image',settings},null,'/api/ecommerce/save-preferences');
      if(data.media!=='image'||Object.keys(settings).some(key=>data.settings?.[key]!==settings[key]))throw Error('保存结果尚未确认，请重新打开设置核对。');
      imageBaseline={settings:data.settings,selection:[settings.model,settings.resolution]};
      imageStatus('图片默认设置已保存。',false,true);
      document.dispatchEvent(new CustomEvent('ecommerce:image-preferences-changed',{detail:{settings:data.settings}}));
    }catch(error){imageStatus(error.message,true);}
    finally{imageSaving=false;updateControls();}
  }
  const cacheMessages269={readTimeout:'本地空间扫描等待超时，请稍后重试。',writeTimeout:'清理结果尚未返回，请重新扫描本地空间核对。',invalid:'本地空间信息不完整，请重新扫描。',timeout:60000};
  const mediaKinds279=[['images','图片','张'],['videos','视频','个'],['audio','音频','个'],['other','其他文件','个']];
  const cacheNumber279=new Intl.NumberFormat('zh-CN');
  const cacheCount279=value=>Number.isSafeInteger(value)&&value>=0;
  const cacheSizeValid279=row=>cacheCount279(row?.files)&&cacheCount279(row?.bytes);
  function cacheSize269(bytes){
    const units=['B','KB','MB','GB','TB'];
    let size=bytes,unit=0;
    while(size>=1024&&unit<units.length-1){size/=1024;unit++;}
    return (unit?size.toFixed(size<10?2:1):cacheNumber279.format(bytes))+' '+units[unit];
  }
  function cacheStatus269(message,error=false){const node=$('[data-cache-status269]');node.textContent=message;node.classList.toggle('error',error);}
  function cacheItem279(row,unit='个'){
    return cacheNumber279.format(row.files)+' '+unit+' · '+cacheSize269(row.bytes);
  }
  function selectedCacheRows279(){
    const checked=new Set([...cachePanel269.querySelectorAll('[data-cache-category279]:checked')].map(input=>input.value));
    return cacheReview269?.categories.filter(row=>row.files&&checked.has(row.id))||[];
  }
  function updateCacheSelection279(){
    const selected=selectedCacheRows279(),eligible=cacheReview269?.categories.filter(row=>row.files).length||0;
    const all=$('[data-cache-all279]');
    all.checked=eligible>0&&selected.length===eligible;all.indeterminate=selected.length>0&&selected.length<eligible;
    $('[data-cache-select-row279]').hidden=!eligible;
    $('[data-cache-confirmation269]').hidden=!selected.length;
    $('[data-cache-clear269]').disabled=!!busy||!selected.length||!!cacheReview269?.busy;
    $('[data-cache-cancel269]').disabled=!!busy;
    $('[data-cache-selected279]').textContent=selected.length?'已选 '+cacheItem279(selected.reduce((sum,row)=>({
      files:sum.files+row.files,bytes:sum.bytes+row.bytes
    }),{files:0,bytes:0}))+'，确认后清理。':'';
  }
  function drawCacheInventory279(data){
    const generated=$('[data-cache-generated279]'),categories=$('[data-cache-categories279]');
    const extra=$('[data-cache-extra279]'),extraGroups=$('[data-cache-extra-groups279]');
    generated.replaceChildren();categories.replaceChildren();extraGroups.replaceChildren();extra.open=false;
    function drawMedia(list,media){
      for(const [key,title,unit]of mediaKinds279){
        const row=media[key],item=document.createElement('div'),name=document.createElement('dt'),stats=document.createElement('dd');
        name.textContent=title;stats.textContent=cacheItem279(row,unit);stats.title=cacheNumber279.format(row.bytes)+' 字节';
        item.append(name,stats);list.append(item);
      }
    }
    drawMedia(generated,data.generated);
    for(const [key,title]of [['downloads','软件下载目录'],['sources','本机导入文件']]){
      if(!data[key]||!mediaKinds279.some(([kind])=>data[key][kind].files))continue;
      const section=document.createElement('section'),heading=document.createElement('h5'),list=document.createElement('dl');
      heading.textContent=title;drawMedia(list,data[key]);section.append(heading,list);extraGroups.append(section);
    }
    extra.hidden=!extraGroups.childElementCount;
    for(const row of data.categories){
      const label=document.createElement('label'),input=document.createElement('input'),title=document.createElement('span'),stats=document.createElement('span'),detail=document.createElement('small');
      input.type='checkbox';input.value=row.id;input.dataset.cacheCategory279='';input.disabled=!row.files;
      title.textContent=row.label;stats.textContent=cacheItem279(row);stats.title=cacheNumber279.format(row.bytes)+' 字节';
      const byKind=mediaKinds279.filter(([key])=>row.media?.[key]?.files).map(([key,name,unit])=>name+' '+cacheNumber279.format(row.media[key].files)+' '+unit);
      if(row.retainedFiles)byKind.push('暂保留 '+cacheItem279({files:row.retainedFiles,bytes:row.retainedBytes}));
      detail.textContent=byKind.join(' · ');detail.hidden=!byKind.length;
      label.append(input,title,stats,detail);categories.append(label);
    }
    $('[data-cache-inventory279]').hidden=false;
    $('[data-cache-options279]').hidden=!data.categories.length;
  }
  function hideCacheReview279(clearInventory=false){
    cacheReview269=null;
    $('[data-cache-options279]').hidden=true;
    $('[data-cache-categories279]').replaceChildren();
    if(clearInventory)$('[data-cache-inventory279]').hidden=true;
    updateCacheSelection279();
  }
  async function inspectCache269(){
    if(busy)return;const ticket=epoch;busy='cache';
    hideCacheReview279(true);$('[data-cache-result279]').hidden=true;cacheStatus269('正在扫描本机成果、素材、缓存和临时文件…');updateControls();
    try{
      const data=await request('GET',null,null,'/api/local-cache',cacheMessages269);
      if(ticket!==epoch||!dialog.open)return;
      if(!data||typeof data.scanId!=='string'||!data.scanId||typeof data.busy!=='boolean'
          ||!mediaKinds279.every(([key])=>cacheSizeValid279(data.generated?.[key]))
          ||['downloads','sources'].some(group=>data[group]&&!mediaKinds279.every(([key])=>cacheSizeValid279(data[group]?.[key])))
          ||!Array.isArray(data.categories)||!data.categories.every(row=>cacheSizeValid279(row)&&typeof row.id==='string'&&row.id&&typeof row.label==='string'&&row.label)
          ||new Set(data.categories.map(row=>row.id)).size!==data.categories.length
          ||!cacheCount279(data.skippedFiles)||!cacheCount279(data.failedFiles))throw Error(cacheMessages269.invalid);
      cacheReview269=data;drawCacheInventory279(data);
      const message=data.busy?'当前有任务运行，完成后请重新扫描再清理。':
        data.categories.some(row=>row.files)?'请选择要清理的类别。':'目前没有可清理的缓存或临时文件。';
      const details=[data.skippedFiles&&'已跳过 '+cacheNumber279.format(data.skippedFiles)+' 项',data.failedFiles&&'有 '+cacheNumber279.format(data.failedFiles)+' 项无法读取'].filter(Boolean);
      cacheStatus269(message+(details.length?details.join('，')+'。':''));
    }catch(error){if(ticket===epoch&&dialog.open)cacheStatus269(error.message,true);}
    finally{if(ticket===epoch){busy='';updateControls();}}
  }
  async function clearCache269(){
    const selected=selectedCacheRows279();
    if(busy||!selected.length||!cacheReview269||cacheReview269.busy)return;
    const ticket=epoch,scanId=cacheReview269.scanId,categoryNames=new Map(selected.map(row=>[row.id,row.label]));
    busy='cache';cacheStatus269('正在清理所选文件…');updateControls();
    try{
      const data=await request('POST',{categories:[...categoryNames.keys()],confirmed:true,scanId},null,'/api/local-cache',cacheMessages269);
      if(ticket!==epoch||!dialog.open)return;
      const counts=['deletedFiles','deletedBytes','skippedFiles','failedFiles'];
      if(!data||!counts.every(key=>cacheCount279(data[key]))||!Array.isArray(data.categories)
          ||!data.categories.every(row=>categoryNames.has(row?.id)&&counts.every(key=>cacheCount279(row[key]))))throw Error(cacheMessages269.invalid);
      function resultText(row){
        return '已清理 '+cacheNumber279.format(row.deletedFiles)+' 个文件，释放 '+cacheSize269(row.deletedBytes)+
          (row.skippedFiles?'，跳过 '+cacheNumber279.format(row.skippedFiles)+' 项':'')+
          (row.failedFiles?'，有 '+cacheNumber279.format(row.failedFiles)+' 项清理失败':'')+'。';
      }
      const details=$('[data-cache-result279]');
      details.replaceChildren();
      for(const row of data.categories){
        const item=document.createElement('li');item.textContent=categoryNames.get(row.id)+' · '+resultText(row);details.append(item);
      }
      details.hidden=!details.childElementCount;
      cacheStatus269(resultText(data));
    }catch(error){if(ticket===epoch&&dialog.open)cacheStatus269(error.message,true);}
    finally{if(ticket===epoch){busy='';hideCacheReview279();updateControls();$('[data-cache-inspect269]').focus({preventScroll:true});}}
  }
  async function load(){
    abortRead?.abort();const abort=new AbortController();abortRead=abort;
    const ticket=++epoch;noticeEpoch++;busy='load';loaded=false;baseline={};hideDiscard();$('[data-storage-retry]').hidden=true;$('[data-storage-errors]').hidden=true;status('正在读取目录设置…');updateControls();
    hideCacheReview279(true);$('[data-cache-result279]').hidden=true;cacheStatus269('');
    try{const data=await request('GET',null,abort.signal);if(ticket!==epoch||!dialog.open)return;apply(data);status('可分别选择目录；更换目录只影响之后生成的成果。');}
    catch(error){if(ticket===epoch&&dialog.open){status(error.message,true);$('[data-storage-retry]').hidden=false;}}
    finally{if(ticket===epoch){busy='';abortRead=null;updateControls();}}
  }
  function close(){if(imageSaving||['save','native','retry','cache'].includes(busy))return;if(dirty()||imageDirty()){$('[data-storage-discard] span').textContent=imageDirty()?'还有未保存的设置修改，是否放弃？':'还有未保存的目录修改，是否放弃？';$('[data-storage-discard]').hidden=false;$('[data-storage-continue]').focus();return;}finishClose();}
  function finishClose(){epoch++;abortRead?.abort();abortRead=null;imageRead?.abort();imageRead=null;busy='';dialog.close();trigger.focus({preventScroll:true});}
  async function selectFolder(id){
    const api=native();if(busy||!loaded||!api?.choose_storage_directory)return;
    const ticket=epoch;busy='native';hideDiscard();status('请选择保存成果的文件夹…');updateControls();
    try{const result=await api.choose_storage_directory(inputs.get(id).value.trim());if(ticket!==epoch||!dialog.open)return;if(result?.canceled){status('已取消选择，目录保持不变。');return;}if(!result?.ok||typeof result.path!=='string')throw Error(result?.error||'文件夹选择未完成。');inputs.get(id).value=result.path;status('目录已选择，点击“保存设置”后生效。');}
    catch(error){if(ticket===epoch)status(error.message||'文件夹选择未完成。',true);}
    finally{if(ticket===epoch){busy='';updateControls();}}
  }
  async function openFolder(id){
    const api=native();if(busy||!loaded||!baseline[id]||!api?.open_storage_directory)return;
    const ticket=epoch;busy='native';updateControls();
    try{const result=await api.open_storage_directory(id);if(ticket!==epoch||!dialog.open)return;if(!result?.ok)throw Error(result?.error||'无法打开已保存的目录。');status('已打开'+labels[id]+'的保存目录。');}
    catch(error){if(ticket===epoch)status(error.message||'目录暂时无法打开。',true);}
    finally{if(ticket===epoch){busy='';updateControls();}}
  }
  async function save(){
    if(busy||!loaded)return;
    const ticket=epoch,paths=draft();noticeEpoch++;busy='save';hideDiscard();status('正在保存目录设置…');updateControls();
    try{const data=await request('POST',{paths});if(ticket!==epoch||!dialog.open)return;apply(data);status('设置已保存，之后生成的成果会自动归档。',false,true);}
    catch(error){if(ticket===epoch&&dialog.open)status(error.message,true);}
    finally{if(ticket===epoch){busy='';updateControls();}}
  }
  async function retryResults(){
    if(busy)return;const ticket=epoch;noticeEpoch++;busy='retry';hideDiscard();status('正在重新保存已有成果…');updateControls();
    try{const data=await request('POST',{},null,'/api/local-storage/retry');if(ticket!==epoch||!dialog.open)return;updateErrorNotice(data.errors);status(Array.isArray(data.errors)&&data.errors.length?'已重试保存，请查看上方仍需处理的项目。':'已重试保存，请稍后查看成果目录。',false,true);}
    catch(error){if(ticket===epoch&&dialog.open)status(error.message,true);}
    finally{if(ticket===epoch){busy='';updateControls();}}
  }
  async function pollErrors(){
    if(document.hidden||polling||busy)return;polling=true;const ticket=noticeEpoch;
    try{const data=await request('GET');if(ticket!==noticeEpoch||busy)return;updateErrorNotice(data.errors);if(dialog.open)updateControls();}catch(_){/* Direct reads expose errors; background checks stay quiet. */}
    finally{polling=false;}
  }
  trigger.addEventListener('click',()=>{if(dialog.open){dialog.focus();return;}dialog.showModal();load();loadImagePreferences();});
  dialog.querySelectorAll('[data-storage-close]').forEach(button=>button.addEventListener('click',close));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  $('[data-storage-abandon]').addEventListener('click',finishClose);
  $('[data-storage-continue]').addEventListener('click',()=>{hideDiscard();(imageDirty()?imageModel:[...inputs.values()][0]).focus();});
  $('[data-storage-save]').addEventListener('click',save);$('[data-storage-retry]').addEventListener('click',load);
  imageModel.addEventListener('change',()=>{const options=selectedImageModel()?.resolutions||[];showImageResolutions(options.includes(imageResolution.value)?imageResolution.value:options[0]);imageSelectionChanged();});
  imageResolution.addEventListener('change',imageSelectionChanged);
  imageSave.addEventListener('click',saveImagePreferences);imageRetry.addEventListener('click',loadImagePreferences);
  $('[data-cache-inspect269]').addEventListener('click',inspectCache269);$('[data-cache-clear269]').addEventListener('click',clearCache269);
  $('[data-cache-options279]').addEventListener('change',event=>{
    if(event.target.matches('[data-cache-all279]')){
      for(const input of cachePanel269.querySelectorAll('[data-cache-category279]:not(:disabled)'))input.checked=event.target.checked;
    }
    updateCacheSelection279();
  });
  $('[data-cache-cancel269]').addEventListener('click',()=>{
    for(const input of cachePanel269.querySelectorAll('[data-cache-category279]'))input.checked=false;
    updateCacheSelection279();cacheStatus269('已取消选择。');
    $('[data-cache-all279]').focus({preventScroll:true});
  });
  window.addEventListener('pywebviewready',updateControls);
  updateControls();
  pollErrors();setInterval(pollErrors,30000);
})();

'use strict';
(() => {
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=v=>JSON.parse(JSON.stringify(v)), uid=()=>crypto.randomUUID().replaceAll('-','');
  let mode='video',doc=null,catalog={},chosen='',working=false,analysisPending=false,navigation=0,epoch=0,revision=0,saveTimer=null,saveFlight=null,pollTimer=null,requesting=false;
  let batch260=null,batchRevision260=-1,batchPoll260=null,batchRead260=0,batchReadFlight260=null;
  let selectedImages260=new Set(),knownImages260=new Set(),activeImage260='',imageView260='compare',detailsOpen260=false;
  let uploadJobs260=[],uploadFlight260=null,overrideDirty260=false,batchQuote260=null,uniformDirty260=false,retryUploadItem260='';
  let paidActionFlight260=null;
  let lifecycleBusy261=false,listRead261=0,projectRows261=[];
  let selectedResults265=new Set(),deletionBusy265=false;
  const unsavedModeDrafts = new Map();
  const entryMode = new URLSearchParams(location.search).get('entry') === 'showcase';
  const showcase = entryMode ? window.createCommerceShowcase?.($('commerceLanding')) : null;
  let workspaceReady = false;
  let entryPending = false;
  let entryTicket = 0;
  let lastEntry = '';
  const deletedIds261=new Set(),lifecycleKey261='ecommerce-project-lifecycle261';
  const marketDefaults260={CN:['zh-Hans','普通话','简体中文'],HK:['yue-Hant','粤语','繁体中文'],TW:['zh-Hant','台湾普通话','繁体中文'],US:['en','美式英语','英语'],RU:['ru','俄语','俄文'],JP:['ja','日语','日文'],KR:['ko','韩语','韩文'],GB:['en','英式英语','英语'],FR:['fr','法语','法文'],DE:['de','德语','德文']};
  const languageDefaults260={'zh-Hans':['普通话','简体中文'],'zh-Hant':['普通话','繁体中文'],'yue-Hant':['粤语','繁体中文'],en:['英语','英语'],ru:['俄语','俄文'],ja:['日语','日文'],ko:['韩语','韩文'],fr:['法语','法文'],de:['德语','德文'],es:['西班牙语','西班牙文'],pt:['葡萄牙语','葡萄牙文'],ar:['阿拉伯语','阿拉伯文'],th:['泰语','泰文'],vi:['越南语','越南文'],ms:['马来语','马来文'],id:['印度尼西亚语','印度尼西亚文'],fil:['菲律宾语','菲律宾文'],hi:['印地语','印地文'],it:['意大利语','意大利文'],nl:['荷兰语','荷兰文']};
  const videoFields260=['presenter','personFile','presenterDirection','speech','sceneFiles','versionCount'];
  const imageFields260=['background','targetLanguage','replacementText'];
  const imageMarkets263={CN:['中国大陆','zh-Hans'],HK:['中国香港','zh-Hant'],TW:['中国台湾','zh-Hant'],JP:['日本','ja'],MY:['马来西亚','ms'],TH:['泰国','th'],US:['美国','en'],SG:['新加坡','en'],GB:['英国','en'],AU:['澳大利亚','en'],RU:['俄罗斯','ru'],custom:['自定义地区','zh-Hans']};
  const imageProfileControls263={imageMarket:'imageMarket263',customImageMarket:'customImageMarket263',headline:'headline263',sellingPoints:'sellingPoints263',layoutStyle:'layoutStyle263',detailInsets:'detailInsets263'};
  const itemProfileControls263={imageMarket:'itemMarket263',customImageMarket:'itemCustomMarket263',headline:'itemHeadline263',sellingPoints:'itemSellingPoints263',layoutStyle:'itemLayoutStyle263',detailInsets:'itemDetailInsets263'};
  const imageDefaults263=()=>({imageDesignVersion:265,designMode:'redraw',imageMarket:'CN',customImageMarket:'',headline:'',sellingPoints:'',layoutStyle:'auto',detailInsets:false});
  let imageDesignStates264=new Map(),imageDesignRead264=0,imagePlanDirty264=false,imagePlanEditorKey264='';
  const localeDefaults260=()=>({schemaVersion:260,targetMarket:'CN',customMarket:'',outputLanguage:'zh-Hans',customLanguage:'',voiceAccent:'普通话',textScript:'简体中文',speechPolicy:'translate'});
  const voiceModes288={showcase:{minDuration:8,maxDuration:15},voiceover:{minDuration:15,maxDuration:30}};
  let videoLocaleActive260=true,videoVoiceMode288='showcase';
  let videoAccentEdited288=false,videoLanguageEdited288=false;
  let videoHelp288=null,videoHelpTimer288=null;
  const legacyVideoProjects288=new Set();
  const defaultVideoPlatforms288=[
    ['general','通用电商'],['taobao','淘宝 / 天猫'],['jd','京东'],['pinduoduo','拼多多'],
    ['douyin','抖音电商'],['kuaishou','快手电商'],['wechat','微信视频号 / 微信小店'],
    ['xiaohongshu','小红书'],['amazon','Amazon'],['tiktok-shop','TikTok Shop'],['shopee','Shopee'],
    ['lazada','Lazada'],['ebay','eBay'],['rakuten','Rakuten'],['coupang','Coupang'],['etsy','Etsy'],
    ['mercado-libre','Mercado Libre'],['independent','独立站'],['custom','自定义平台'],
  ].map(([id,name])=>({id,name}));
  const emptyForm=(forMode=mode,locale=true)=>({productFiles:[],description:'',...(forMode==='video'?{presenter:false,personFile:'',presenterDirection:'',speech:'',sceneFiles:[],versionCount:3,...(locale?{...localeDefaults260(),videoVoiceMode:'showcase',salesPlatform:'general'}:{})}:{background:'',textMode:'keep',targetLanguage:'zh-Hans',replacementText:'',...(locale?imageDefaults263():{})})});
  const state=()=>doc?.ecommerce259, busy=()=>working||analysisPending||!!doc?.generation;
  const directVideo288=()=>mode==='video'&&Object.hasOwn(voiceModes288,videoVoiceMode288);
  const productCount288=()=>state()?.form?.productFiles?.length||0;
  const videoProductLimit288=()=>directVideo288()?catalog.limits?.videoProductImages||5:catalog.limits?.productImages||8;
  const videoProfile288=()=>({visualModels:catalog.models,visualCatalogPublished:true,videoRouteGroups:catalog.videoRouteGroups,videoPricing:catalog.videoPricing||[],videoSkuPricing172:catalog.videoSkuPricing172});
  const media=(file,download=false)=>'/api/ecommerce/media?'+new URLSearchParams({id:doc.id,file,...(download?{download:'1'}:{})});
  const status=(text,error=false)=>ModelActivity.text($('status'),text,error);
  async function api(action,body){const response=await fetch('/api/ecommerce/'+action,{cache:'no-store',...(body===undefined?{signal:AbortSignal.timeout(20000)}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)})});const value=await response.json();if(!response.ok||value.ok===false)throw Error(value.error||'本次操作未完成');return value;}
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(error){status(error.message,true);}};
  const owner260=(id,owner)=>doc?.id===id&&epoch===owner;
  // Use the existing ecommerce archive destination, shared with local settings.
  // Changing it never changes the canonical canvas media or submits generation.
  let outputPath268='',outputLoaded268=false,outputBusy268=false,outputErrors268=[];
  function outputNative268(){try{return window.pywebview?.api||window.parent.pywebview?.api;}catch(_){return null;}}
  function paintOutputStorage268(){
    $('outputDirectoryPath268').textContent=outputLoaded268?(outputPath268?'自动保存到：'+outputPath268:'未指定目录，可设置自动保存位置。'):'目录暂未读取，可点“设置保存目录”重试。';
    $('openOutputDirectory268').disabled=outputBusy268||!outputLoaded268||!outputPath268||!outputNative268()?.open_storage_directory;
    $('outputDirectoryErrors268').textContent=outputErrors268.length?'部分电商成果尚未保存到指定目录：'+outputErrors268.map(row=>[row.projectName,row.message].filter(Boolean).join(' · ')).join('；')+'。原成果仍在项目中，可检查目录后重试保存。':'';
    $('retryOutputDirectory268').hidden=!outputErrors268.length;
    $('retryOutputDirectory268').disabled=outputBusy268;
    $('configureOutputDirectory268').disabled=outputBusy268;
    $('outputDirectoryInput268').disabled=outputBusy268||!outputLoaded268;
    $('chooseOutputDirectory268').disabled=outputBusy268||!outputLoaded268||!outputNative268()?.choose_storage_directory;
    $('saveOutputDirectory268').disabled=outputBusy268||!outputLoaded268;
    $('closeOutputDirectory268').disabled=outputBusy268;
    $('outputDirectoryNativeNote268').hidden=!!outputNative268()?.choose_storage_directory;
  }
  async function outputStorageRequest268(body,retry=false){
    const response=await fetch('/api/local-storage/'+(retry?'retry':'settings'),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(20000),...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    const value=await response.json();if(!response.ok||value.ok===false||value.error)throw Error(value.error||'目录操作未完成，请重新读取后核对。');
    const rows=Array.isArray(value.features)?value.features.filter(row=>row.id==='ecommerce'&&typeof row.path==='string'):[];
    if(rows.length!==1)throw Error('电商保存目录返回不完整，请重新读取。');
    outputPath268=rows[0].path;outputLoaded268=true;
    outputErrors268=(Array.isArray(value.errors)?value.errors:[]).filter(row=>row.feature==='ecommerce'||!row.feature);
    paintOutputStorage268();return value;
  }
  async function refreshOutputStorage268(){
    if(outputBusy268||document.hidden||$('outputDirectoryDialog268').open)return;
    outputBusy268=true;try{await outputStorageRequest268();}catch(_){/* The explicit settings action reports failures. */}finally{outputBusy268=false;paintOutputStorage268();}
  }
  async function configureOutputStorage268(){
    if(outputBusy268)return;const dialog=$('outputDirectoryDialog268');dialog.showModal();
    outputBusy268=true;outputLoaded268=false;$('outputDirectoryStatus268').textContent='正在读取保存目录…';paintOutputStorage268();
    try{await outputStorageRequest268();$('outputDirectoryInput268').value=outputPath268;$('outputDirectoryStatus268').textContent='保存后，新完成的电商成果会按项目自动归档。';}
    catch(error){$('outputDirectoryStatus268').textContent=error.message;}
    finally{outputBusy268=false;paintOutputStorage268();}
  }
  async function chooseOutputStorage268(){
    const native=outputNative268();if(outputBusy268||!outputLoaded268||!native?.choose_storage_directory)return;
    outputBusy268=true;paintOutputStorage268();
    try{const selected=await native.choose_storage_directory($('outputDirectoryInput268').value.trim());
      if(selected?.canceled){$('outputDirectoryStatus268').textContent='已取消选择，保存目录未改变。';return;}
      if(!selected?.ok||typeof selected.path!=='string')throw Error(selected?.error||'选择文件夹未完成。');
      $('outputDirectoryInput268').value=selected.path;$('outputDirectoryStatus268').textContent='目录已选择，点击“保存目录”后生效。';
    }catch(error){$('outputDirectoryStatus268').textContent=error.message;}
    finally{outputBusy268=false;paintOutputStorage268();}
  }
  async function saveOutputStorage268(){
    if(outputBusy268||!outputLoaded268)return;outputBusy268=true;paintOutputStorage268();
    try{await outputStorageRequest268({paths:{ecommerce:$('outputDirectoryInput268').value.trim()}});
      $('outputDirectoryInput268').value=outputPath268;$('outputDirectoryStatus268').textContent=outputPath268?'保存目录已生效。新完成的成果将自动复制到此目录，项目中的原文件保留。':'已取消额外自动保存，项目中的原文件保留，可继续手动下载。';
    }catch(error){$('outputDirectoryStatus268').textContent=error.name==='TimeoutError'?'保存等待超时，请关闭后重新读取目录核对；没有自动重复提交。':error.message;}
    finally{outputBusy268=false;paintOutputStorage268();}
  }
  async function openOutputStorage268(){
    if(outputBusy268||!outputLoaded268||!outputPath268||!outputNative268()?.open_storage_directory)return;
    outputBusy268=true;paintOutputStorage268();
    try{const value=await outputNative268().open_storage_directory('ecommerce');if(!value?.ok)throw Error(value?.error||'打开目录未完成。');}
    catch(error){status(error.message,true);}finally{outputBusy268=false;paintOutputStorage268();}
  }
  async function retryOutputStorage268(){
    if(outputBusy268)return;outputBusy268=true;paintOutputStorage268();
    try{await outputStorageRequest268({},true);status('已安排重新保存已有成果，不会重新生成或扣费。');}
    catch(error){status(error.message,true);}finally{outputBusy268=false;paintOutputStorage268();}
  }
  function projectLabel261(row){
    const raw=row.updatedAt||row.createdAt||row.deletedAt;
    const stamp=typeof raw==='number'?new Date(raw<1e12?raw*1000:raw):new Date(raw||'');
    const date=Number.isFinite(stamp.getTime())?stamp.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'';
    return (row.name||'未命名项目')+' · '+(date?date+' · ':'')+String(row.id||'').slice(0,8);
  }
  function renderDeletedProjects261(){
    const rows=projectRows261.filter(row=>row.mode===mode&&(row.deleted||deletedIds261.has(row.id)));
    $('deletedProjectsTitle261').textContent='已删除的'+(mode==='image'?'图片':'视频')+'项目';
    setOptions($('deletedProjectsList261'),rows.map(row=>({value:row.id,label:projectLabel261(row)})),$('deletedProjectsList261').value);
    $('deletedProjectsHint261').textContent=rows.length?'已有素材、结果和原订单仍保留。恢复不会重新生成或再次收费。':'当前类型暂无已删除项目。图片和视频项目分别管理。';
    $('restoreProject261').disabled=lifecycleBusy261||!rows.length;
  }
  function clearProject261(id){
    resetVideoHelp288();
    ++navigation;++epoch;++listRead261;clearTimeout(saveTimer);clearTimeout(pollTimer);clearTimeout(batchPoll260);batchRead260++;batchReadFlight260=null;
    if(localStorage.getItem('ecommerce259-'+mode)===id)localStorage.removeItem('ecommerce259-'+mode);
    doc=null;catalog={};chosen='';working=false;analysisPending=false;batch260=null;batchRevision260=-1;selectedImages260=new Set();knownImages260=new Set();selectedResults265=new Set();deletionBusy265=false;activeImage260='';overrideDirty260=false;detailsOpen260=false;uploadJobs260=[];uniformDirty260=false;
    resetImagePlans264();
    $('projectName').value='';$('generationStatus').textContent='';$('generationProgress').hidden=true;$('uploadStatus260').hidden=true;$('uploadFailures260').hidden=true;
    applyForm260(emptyForm());syncMode();photos();renderVersions();results();renderModels(false);lock();
  }
  function publishLifecycle261(action,id,mediaMode){localStorage.setItem(lifecycleKey261,JSON.stringify({action,canvasId:id,mode:mediaMode,stamp:Date.now()}));}
  async function deleteProject261(){
    if(!doc||lifecycleBusy261||paidActionActive260())return;
    const id=doc.id,owner=epoch,mediaMode=mode,name=doc.name||'未命名项目';
    if(!await confirm('删除项目“'+name+'”？','此项目将移到“已删除项目”。已有素材、结果和原订单会保留；删除不会取消上游任务或更改账单。\n可稍后恢复。'))return;
    if(!owner260(id,owner)||mediaMode!==mode)return;
    lifecycleBusy261=true;lock();
    try{
      await api('delete',{canvasId:id,mode:mediaMode});deletedIds261.add(id);++listRead261;publishLifecycle261('delete',id,mediaMode);
      if(doc?.id===id)clearProject261(id);
      await list();status('项目“'+name+'”已删除。可在“已删除项目”中恢复，原订单和文件均保留。');
    }finally{lifecycleBusy261=false;renderDeletedProjects261();lock();}
  }
  async function showDeletedProjects261(){
    if(lifecycleBusy261||paidActionActive260())return;
    const owner=epoch,mediaMode=mode;await list();if(owner!==epoch||mediaMode!==mode)return;
    renderDeletedProjects261();$('deletedProjectsDialog261').showModal();
  }
  async function restoreProject261(){
    const id=$('deletedProjectsList261').value,owner=epoch,mediaMode=mode;
    if(!id||lifecycleBusy261)return;
    lifecycleBusy261=true;renderDeletedProjects261();lock();
    try{
      await api('restore',{canvasId:id,mode:mediaMode});deletedIds261.delete(id);++listRead261;publishLifecycle261('restore',id,mediaMode);
      $('deletedProjectsDialog261').close();await list();
      if(owner===epoch&&mode===mediaMode)await navigate(()=>api('document?id='+encodeURIComponent(id)));
      status('项目已恢复。原素材、结果和原订单保留；需要生成时仍会重新核对费用。');
    }finally{lifecycleBusy261=false;renderDeletedProjects261();lock();}
  }
  const paidActionActive260=()=>paidActionFlight260?.navigation===navigation;
  async function runPaidAction260(action){
    if(paidActionActive260())return;
    const flight={navigation};paidActionFlight260=flight;lock();
    ModelActivity.set($('status'),{state:'pending',message:'正在准备当前任务并核对费用…'});
    try{await action();}
    finally{if(paidActionFlight260===flight){paidActionFlight260=null;lock();}}
  }
  const batchMode260=()=>mode==='image'&&!!batch260;
  const sharedImageDefaults260=window.EcommerceImageDefaults;
  sharedImageDefaults260.subscribe(()=>{
    if(mode!=='image')return;
    renderModels();
    if(detailsOpen260)renderItemRatio260({ratio:$('itemRatio260').value});
    if(doc)void loadCatalog(true).catch(error=>status(error.message,true));
  });
  function imageDefaults260(){
    const value=sharedImageDefaults260.resolve(catalog);
    if(!value.error&&!['1k','2k'].includes(value.resolution))return {error:'主图重绘支持 1K 和 2K，请在设置中调整默认图片清晰度。'};
    const ratios=value.model?.supportedAspectRatios;
    if(ratios?.length&&!ratios.some(ratio=>['9:16','16:9','1:1'].includes(ratio)))return {error:'默认图片模型没有主图重绘支持的画幅，请在设置中更换模型。'};
    return value;
  }
  const pendingStates260=new Set(['queued','dispatching','running','unknown','uploading']);
  const eligibleImage260=item=>!['succeeded','unknown','queued','dispatching','running','uploading','upload_failed'].includes(item.status);
  const batchPending260=()=>batchMode260()&&(batch260.items||[]).some(item=>pendingStates260.has(item.status)||item.canReconcile);
  const mediaFor260=(id,file,download=false)=>'/api/ecommerce/media?'+new URLSearchParams({id,file,...(download?{download:'1'}:{})});
  const imageSettings260=()=>({ratio:$('ratio').value});
  function markUniformDirty260(value){uniformDirty260=value;if(batchMode260())localStorage.setItem('ecommerce260-unapplied-'+doc.id,value?'1':'0');}
  function readImageProfile263(item=false){
    const controls=item?itemProfileControls263:imageProfileControls263;
    const result={imageDesignVersion:265,designMode:'redraw',textMode:'keep'};
    for(const [key,id] of Object.entries(controls))result[key]=key==='detailInsets'?$(id).checked:$(id).value;
    if(result.imageMarket!=='custom')result.customImageMarket='';
    return result;
  }
  function applyImageProfile263(raw={},item=false){
    const controls=item?itemProfileControls263:imageProfileControls263,values={...imageDefaults263(),...raw};
    for(const [key,id] of Object.entries(controls)){if(key==='detailInsets')$(id).checked=!!values[key];else $(id).value=values[key]??'';}
  }
  function imageDesignSummary263(value={}){
    const market=value.imageMarket==='custom'?value.customImageMarket:imageMarkets263[value.imageMarket||'CN']?.[0];
    const language=[...$('targetLanguage').options].find(row=>row.value===value.targetLanguage)?.textContent||value.targetLanguage;
    return ['主图重绘 · 直接出图',market,language,value.detailInsets?'含产品细节小窗':''].filter(Boolean).join(' · ');
  }
  function syncImageProfile263(item=false){
    const controls=item?itemProfileControls263:imageProfileControls263;
    $(item?'itemCustomMarketField263':'customImageMarketField263').hidden=$(controls.imageMarket).value!=='custom';
    $(item?'itemDesignSummary263':'imageDesignSummary263').textContent=imageDesignSummary263({...readImageProfile263(item),targetLanguage:$(item?'itemLanguage260':'targetLanguage').value});
  }
  const imageForm260=()=>({...Object.fromEntries(['background','targetLanguage','replacementText','description'].map(key=>[key,$(key).value])),...readImageProfile263()});
  function imageItems260(){
    if(batchMode260())return (batch260.items||[]).filter(item=>!item.deleted);
    if(mode!=='image'||!doc)return [];
    const outputs=(doc.results||[]).filter(row=>!row.deleted&&row.media==='image');
    return (state()?.form?.productFiles||[]).map(file=>({id:'single:'+file,name:doc.uploads?.[file]?.name||file,file,childCanvasId:doc.id,status:doc.generation?'unknown':outputs.length?'succeeded':'ready',results:outputs,resultFile:outputs.at(-1)?.file}));
  }
  function syncImageSelection260(){
    const items=imageItems260(),ids=new Set(items.map(item=>item.id));
    selectedImages260=new Set([...selectedImages260].filter(id=>ids.has(id)));
    for(const item of items)if(!knownImages260.has(item.id)){knownImages260.add(item.id);selectedImages260.add(item.id);}
    knownImages260=new Set([...knownImages260].filter(id=>ids.has(id)));
    if(!ids.has(activeImage260))activeImage260=items[0]?.id||'';
  }
  function applyBatch260(response,id=doc?.id,owner=epoch){
    if(!owner260(id,owner)||mode!=='image')return false;
    const next=response.batch||response.document?.ecommerce259?.batch260;
    if(!next)return false;
    const sequence=Number(next.revision)||0;
    if(sequence<batchRevision260)return false;
    batchRevision260=sequence;batch260=next;
    if(response.document?.id===id)doc=response.document;
    syncImageSelection260();results();renderBatchStatus260();lock();return true;
  }
  function imageStatus260(item){
    if(item.canReconcile)return '原任务待核对 · 先查询或解除等待';
    const labels={uploading:'上传中',upload_failed:'上传失败 · 可重试原上传',ready:'待处理',draft:'待处理',queued:'排队中',dispatching:'处理中 · 核对原单',running:'处理中',succeeded:'已完成',failed:'失败 · 可重新核价',unknown:'原单待核对',needs_quote:'需重新核价',canceled:'已暂停'};
    return labels[item.status]||item.status||'待处理';
  }
  function imageResult260(item){
    const rows=(item.results||[]).filter(row=>!row.deleted);
    return rows.find(row=>row.file===item.resultFile)||rows.at(-1)||(item.resultFile?{file:item.resultFile,media:'image'}:null);
  }
  function renderImageGrid260(){
    syncImageSelection260();const items=imageItems260();
    $('productThumbs').innerHTML=items.map(item=>{
      const result=imageResult260(item),src=item.file&&item.childCanvasId?mediaFor260(item.childCanvasId,item.file):'',done=!!result;
      const deleteButton=batchMode260()?'<button type="button" class="subtle danger261" data-delete-image265="'+esc(item.id)+'">删除素材</button>':'<button type="button" class="subtle danger261" data-remove-file="'+esc(item.file)+'" data-role="productFiles">移除素材</button>';
      return '<article class="thumb image-task-card '+(selectedImages260.has(item.id)?'is-selected':'')+'" data-item-id="'+esc(item.id)+'"><div class="image-card-heading"><input type="checkbox" data-image-select="'+esc(item.id)+'" aria-label="选择 '+esc(item.name)+'" '+(selectedImages260.has(item.id)?'checked':'')+'><span class="item-status" data-state="'+esc(item.status)+'">'+esc(imageStatus260(item))+'</span></div><button type="button" class="image-card-open" data-image-open="'+esc(item.id)+'" aria-label="查看 '+esc(item.name)+'">'+(src||done?'<img loading="lazy" src="'+esc(done?mediaFor260(item.childCanvasId,result.file):src)+'" alt="'+esc(item.name)+'">':'<span class="upload-placeholder260">'+esc(imageStatus260(item))+'</span>')+'</button><div class="image-card-footer"><strong>'+esc(item.name)+'</strong><small class="image-profile-summary263">'+esc(imageDesignSummary263(effectiveImage260(item).form))+'</small><small>'+esc(item.error||item.override?.form?.background||batch260?.shared?.form?.background||'使用统一处理要求')+'</small>'+(['dispatching','running','queued'].includes(item.status)?'<div class="item-progress is-indeterminate" role="progressbar" aria-label="'+esc(imageStatus260(item))+'"><span></span></div>':'')+'<div class="card-actions"><button type="button" class="subtle" data-image-open="'+esc(item.id)+'">独立设置</button>'+(done?'<button type="button" data-item-download="'+esc(item.id)+'">下载结果</button>':'')+deleteButton+(item.status==='upload_failed'?'<button type="button" data-upload-retry="'+esc(item.id)+'">选择原文件并重试</button>':'')+(item.status==='unknown'||item.canReconcile?'<button type="button" data-item-reconcile="'+esc(item.id)+'">'+(item.canReconcile?'查询 / 解除原任务等待':'查询原单')+'</button>':'')+'</div></div></article>';
    }).join('')||'<div class="empty"><h3>让一整组主图，整齐出片。</h3><p>最多 100 张图片，每张独立处理与保存。</p></div>';
    $('productCount260').textContent=items.length+' / 100';
    $('selectedImagesCount260').textContent='已选 '+selectedImages260.size+' 张';
    $('selectAllImages260').checked=!!items.length&&selectedImages260.size===items.length;
    $('selectAllImages260').indeterminate=selectedImages260.size>0&&selectedImages260.size<items.length;
    renderImageInspector260(!overrideDirty260);
  }
  function effectiveImage260(item){const base=emptyForm('image',false);delete base.productFiles;return {form:batchMode260()?{...base,...(batch260?.shared?.form||{}),...(item.override?.form||{})}:{...base,...(state()?.form||{})},settings:{ratio:item.override?.settings?.ratio||batch260?.shared?.settings?.ratio||$('ratio').value}};}
  function renderImageInspector260(reset=false){
    const item=imageItems260().find(row=>row.id===activeImage260);
    $('imageInspector260').hidden=mode!=='image'||!item||!detailsOpen260;
    if(!item){$('imagePlanEditor264').hidden=true;return;}
    $('activeImageName260').textContent=item.name;$('activeImageStatus260').textContent=imageStatus260(item)+(item.error?' · '+item.error:'');
    const result=imageResult260(item);
    const markup='<figure class="compare-original260">'+(item.file&&item.childCanvasId?'<img src="'+esc(mediaFor260(item.childCanvasId,item.file))+'" alt="'+esc(item.name)+'原图">':'<p class="empty">原图尚未上传完成，请选择原文件重试。</p>')+'<figcaption>原图</figcaption></figure><figure class="compare-result260">'+(result?'<img src="'+esc(mediaFor260(item.childCanvasId,result.file))+'" alt="'+esc(item.name)+'生成结果">':'<p class="empty">本图尚无生成结果</p>')+'<figcaption>独立生成结果</figcaption></figure>';
    $('imageCompare260').innerHTML=markup;$('imageCompare260').dataset.view=imageView260;
    $('largeImageCompare260').innerHTML=markup;$('largeImageCompare260').dataset.view=imageView260;
    document.querySelectorAll('[data-image-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.imageView===imageView260)));
    $('downloadItem260').disabled=!result;
    $('itemOverrideDetails260').querySelectorAll('input,select,textarea').forEach(control=>control.disabled=working||pendingStates260.has(item.status)||!batchMode260());
    if(reset){const value=effectiveImage260(item);$('itemBackground260').value=value.form.background||'';$('itemLanguage260').value=value.form.targetLanguage||'zh-Hans';$('itemReplacement260').value=value.form.replacementText||'';applyImageProfile263(value.form,true);renderItemRatio260(value.settings);}
    syncImageProfile263(true);
    renderImagePlanEditor264();
    $('saveItemOverride260').disabled=working||pendingStates260.has(item.status)||item.canReconcile||!batchMode260();
  }
  function renderItemRatio260(saved={}){
    const ratio=saved.ratio||$('itemRatio260').value||$('ratio').value;
    setOptions($('itemRatio260'),imageRatios260().map(value=>({value,label:value})),ratio);
    preserveImageRatio260($('itemRatio260'),ratio);
  }
  const planStatusLabels264={ready:'方案已就绪',stale:'历史方案 · 设置已变化',pending:'原方案任务处理中',unknown:'原方案状态待核对',missing:'尚无设计方案',invalid:'方案不完整，请检查原返回',failed:'原方案任务未完成',not_called:'原方案调用未发出'};
  function planItems264(){return imageItems260().filter(item=>!batchMode260()||selectedImages260.has(item.id));}
  function generationItems264(){return planItems264().filter(item=>!batchMode260()||!['succeeded','unknown','queued','dispatching','running','uploading','upload_failed'].includes(item.status));}
  function planRow264(item){
    if(batchMode260())return imageDesignStates264.get(item.id)||{itemId:item.id,childCanvasId:item.childCanvasId,plan:null,status:'missing'};
    const cached=imageDesignStates264.get(item.id),plan=state()?.imagePlan264||null;
    const receiptId=state()?.analysisReceiptId;
    const status=receiptId&&(!plan||receiptId!==plan.receiptId)?'unknown':state()?.imagePlanStatus264||(plan?'stale':'missing');
    return cached||{itemId:item.id,childCanvasId:doc?.id,plan,status};
  }
  function renderImagePlanEditor264(){
    const item=imageItems260().find(row=>row.id===activeImage260),row=item&&planRow264(item),result=row?.plan;
    $('imagePlanEditor264').hidden=mode!=='image'||!detailsOpen260||!result?.plan;
    if(!item||!result?.plan)return;
    const key=doc.id+':'+item.id+':'+result.receiptId;
    const evidenceChanged=key!==imagePlanEditorKey264;
    if(evidenceChanged){imagePlanEditorKey264=key;imagePlanDirty264=false;}
    $('imagePlanSummary264').textContent=result.summary||'';
    $('imagePlanObservations264').textContent=(result.observations||[]).join('；');
    const evidenceLabels265={product:'商品文字',promotion:'促销文字',platform:'平台界面',unclear:'尚不清楚'};
    $('imagePlanSourceText265').innerHTML=(result.sourceText||[]).map(row=>'<p><b>'+esc(evidenceLabels265[row.category]||'原图文字')+'</b><span>'+esc(row.text)+'</span></p>').join('');
    const unknown=result.uncertainties||[];
    $('imagePlanUncertainties264').textContent=unknown.join('；');
    $('imagePlanUnknown264').hidden=!unknown.length;
    if(evidenceChanged){$('imagePlanEvidence264').open=false;$('imagePlanUnknown264').open=!!unknown.length;}
    if(!imagePlanDirty264){
      $('imagePlanHeadline264').value=result.plan.headline||'';
      $('imagePlanSellingPoints264').value=(result.plan.sellingPoints||[]).join('\n');
      $('imagePlanBackground264').value=result.plan.background||'';
      $('imagePlanLayout264').value=result.plan.layoutNotes||'';
    }
    $('imagePlanEditorState264').textContent=(planStatusLabels264[row.status]||row.status)+(imagePlanDirty264?' · 修改尚未保存':'');
    const locked=busy()||paidActionActive260()||row.status!=='ready';
    $('imagePlanEditor264').querySelectorAll('input,textarea,button').forEach(control=>control.disabled=locked);
    $('discardImagePlan264').disabled=busy()||paidActionActive260()||!imagePlanDirty264;
  }
  function renderImagePlans264(){
    const image=mode==='image';
    const historical=image?imageItems260().map(item=>({item,row:planRow264(item)})).filter(({row})=>row.plan||row.receipt||['pending','unknown'].includes(row.status)):[];
    $('imagePlanPanel264').hidden=!historical.length;
    $('imageGenerationPlanHint264').hidden=!image;
    $('refreshImagePlans264').disabled=working||paidActionActive260()||!doc;
    $('imagePlanList264').innerHTML=historical.map(({item,row})=>'<button type="button" class="image-plan-row264" data-open-plan264="'+esc(item.id)+'"><span><b>'+esc(item.name)+'</b><small>'+esc(row.plan?.plan?.headline||'历史文案方案')+'</small></span><em data-plan-state="'+esc(row.status)+'">'+esc(planStatusLabels264[row.status]||row.status)+'</em></button>').join('');
    if(image)$('imageGenerationPlanHint264').textContent='本次可生成 '+generationItems264().length+' 张主图。只核对图片生成费用。'+(uniformDirty260?' 统一要求尚未应用。':'');
    renderImagePlanEditor264();
  }
  function resetImagePlans264(){imageDesignStates264=new Map();imageDesignRead264++;imagePlanDirty264=false;imagePlanEditorKey264='';$('imagePlanStatus264').textContent='';}
  async function refreshImageDesignStates264(){
    if(mode!=='image'||!doc)return;
    const id=doc.id,owner=epoch,ticket=++imageDesignRead264;
    if(batchMode260()){
      const value=await api('batch/design-state',{canvasId:id});
      if(!owner260(id,owner)||ticket!==imageDesignRead264)return;
      imageDesignStates264=new Map((value.designs||[]).map(row=>[row.itemId,row]));
    }else{
      const value=await api('document?id='+encodeURIComponent(id));
      if(!owner260(id,owner)||ticket!==imageDesignRead264)return;
      const unresolved=[...imageDesignStates264.values()].find(row=>['pending','unknown'].includes(row.status));
      doc=value.document;imageDesignStates264=new Map();
      if(unresolved)imageDesignStates264.set(unresolved.itemId,unresolved);
    }
    renderImagePlans264();
  }
  async function observeImagePlan264(childId,id,owner,{repeat=false,itemId=''}={}){
    const deadline=Date.now()+120000;
    do{
      if(!owner260(id,owner)||mode!=='image')return;
      const response=await api('observe',{canvasId:childId});
      if(!owner260(id,owner)||mode!=='image')return;
      const receipt=response.receipt||{};let child=response.document;
      if(!['pending','unknown'].includes(receipt.status)){
        const fresh=await api('document?id='+encodeURIComponent(childId));
        if(!owner260(id,owner)||mode!=='image')return;child=fresh.document;
      }
      const plan=child?.ecommerce259?.imagePlan264||null;
      if(!batchMode260()&&child?.id===id)doc=child;
      const status=receipt.status==='pending'?'pending':receipt.status==='unknown'?'unknown':child?.ecommerce259?.imagePlanStatus264||(plan?'stale':receipt.status==='returned'?'invalid':receipt.status||'missing');
      const key=itemId||imageItems260()[0]?.id;
      if(key)imageDesignStates264.set(key,{itemId:key,childCanvasId:childId,plan,status,receipt});
      renderImagePlans264();
      if(status!=='pending'||!repeat||Date.now()>=deadline)return;
      await new Promise(resolve=>setTimeout(resolve,1200));
    }while(owner260(id,owner));
  }
  async function queryImagePlans264(){
    if(mode!=='image'||!doc||working)return;
    const id=doc.id,owner=epoch;working=true;lock();
    try{
      if(batchMode260()){
        await refreshImageDesignStates264();
        const rows=[...imageDesignStates264.values()].filter(row=>['pending','unknown'].includes(row.status)||['pending','unknown'].includes(row.receipt?.status));
        let cursor=0;
        await Promise.all(Array.from({length:Math.min(2,rows.length)},async()=>{while(owner260(id,owner)&&cursor<rows.length){const row=rows[cursor++];await observeImagePlan264(row.childCanvasId,id,owner,{itemId:row.itemId});}}));
        if(owner260(id,owner))await refreshImageDesignStates264();
      }else await observeImagePlan264(id,id,owner);
      if(owner260(id,owner))$('imagePlanStatus264').textContent='已查询已有方案任务；没有重新生成、没有新增模型调用。';
    }finally{if(owner260(id,owner)){working=false;lock();}}
  }
  async function saveImagePlan264(){
    const item=imageItems260().find(row=>row.id===activeImage260),row=item&&planRow264(item);
    if(!item||row?.status!=='ready'||!row.plan?.receiptId||working)return;
    const plan={headline:$('imagePlanHeadline264').value.trim(),sellingPoints:$('imagePlanSellingPoints264').value.split('\n').map(value=>value.trim()).filter(Boolean),background:$('imagePlanBackground264').value.trim(),layoutNotes:$('imagePlanLayout264').value.trim()};
    if(!plan.headline||!plan.background||!plan.layoutNotes||plan.sellingPoints.length<1||plan.sellingPoints.length>4||plan.sellingPoints.some(value=>value.length>240))throw Error('请保留标题、背景、版式与 1–4 条卖点；每条卖点不超过240字。');
    const id=doc.id,owner=epoch;working=true;lock();
    try{
      const response=await api('save',{canvasId:item.childCanvasId,imagePlanEdits264:{receiptId:row.plan.receiptId,plan}});
      if(!owner260(id,owner))return;
      if(!batchMode260())doc=response.document;
      imagePlanDirty264=false;imageDesignStates264.delete(item.id);await refreshImageDesignStates264();
      $('imagePlanStatus264').textContent='方案修改已保存；没有新增模型调用，生成图片时另行确认费用。';
    }finally{if(owner260(id,owner)){working=false;lock();}}
  }
  function renderBatchStatus260(){
    const active=batchMode260(),items=imageItems260();
    $('batchSummary260').hidden=!active;$('batchActions260').hidden=!active;$('batchApplyControls260').hidden=!active;
    $('concurrencyField260').hidden=mode!=='image';
    if(!active)return;
    const count=status=>items.filter(item=>item.status===status||(status==='running'&&item.status==='dispatching')).length;
    $('batchSummary260').innerHTML='<b>'+items.length+'</b> 张 · 完成 <b>'+count('succeeded')+'</b> · 处理中 <b>'+count('running')+'</b> · 排队 <b>'+count('queued')+'</b><br>失败 '+count('failed')+' · 原单待核对 '+count('unknown')+(batch260.paused?' · 已暂停未提交图片':'');
    $('pauseBatch260').textContent=batch260.paused?'继续未提交队列':'暂停未提交图片';
    $('pauseBatch260').disabled=working||!batch260.activeRunId;
    $('observeBatch260').disabled=working;
    $('reconcileBatch260').disabled=working||!items.some(item=>item.status==='unknown'||item.canReconcile);
    $('reconcileBatch260').textContent=items.some(item=>item.canReconcile)?'查询 / 解除原任务等待':'查询未决原订单';
    if(batch260.activeRunId&&batchPending260())$('batchConcurrency260').value=String(batch260.concurrency||3);
  }
  async function observeBatch260(repeat=true){
    if(!batchMode260()||batchReadFlight260)return;
    const id=doc.id,owner=epoch,ticket=++batchRead260;
    clearTimeout(batchPoll260);
    const read=api('batch/observe',{canvasId:id});batchReadFlight260=read;
    try{const response=await read;if(ticket!==batchRead260||!owner260(id,owner))return;applyBatch260(response,id,owner);if(repeat&&(batch260.items||[]).some(item=>['dispatching','running','queued'].includes(item.status)))batchPoll260=setTimeout(()=>safe(()=>observeBatch260(true))(),1500);}
    catch(error){if(!owner260(id,owner))return;if(owner260(id,owner)){$('generationStatus').textContent='批次查询中断，原任务均保留；可刷新原批次状态或查询未决原订单，不会重新提交。';$('batchActions260').hidden=false;}throw error;}
    finally{if(batchReadFlight260===read)batchReadFlight260=null;}
  }
  async function ensureBatch260(){
    await ensureDocument();if(mode!=='image')throw Error('批量主图仅适用于图片创作。');
    if(batchMode260())return batch260;
    const id=doc.id,owner=epoch;await save();if(!owner260(id,owner)||mode!=='image')return null;
    const response=await api('batch/create',{canvasId:id});
    if(!owner260(id,owner))return null;
    applyBatch260(response,id,owner);
    const shared={form:imageForm260(),settings:imageSettings260()};
    if(!shared.settings.ratio)delete shared.settings;
    const initialized=await api('batch/settings',{canvasId:id,shared});
    if(!owner260(id,owner)||mode!=='image')return null;
    applyBatch260(initialized,id,owner);
    return batch260;
  }
  function renderCharacterBinding260(){
    const binding=state()?.characterBinding260||state()?.form?.characterBinding260;
    $('characterBinding260').hidden=mode!=='video'||!binding;
    if(!binding){$('characterBinding260').replaceChildren();return;}
    const framing={'full-body':'原图：全身','upper-body':'原图：半身，未补画腿部',unknown:'原图构图未标注'}[binding.imageFraming]||'按原图完整显示';
    const speech=binding.speechProfile||{};
    const voice=binding.voiceSource==='recording'?'录音样本，未克隆':binding.synthesisReady?'绑定音色 · 配音时使用':'声音尚未就绪，请在配音时另选音色';
    $('characterBinding260').innerHTML='<strong>'+esc(binding.characterName||binding.imageName||'已选数字人')+'</strong><small>'+esc(framing)+'</small><span class="bind-voice-tag">'+esc(voice)+(binding.voiceName?' · '+esc(binding.voiceName):'')+'</span><small>'+esc([speech.language,speech.accent].filter(Boolean).join(' · '))+'</small>';
  }
  async function chooseCharacter260(){
    await ensureDocument();if(mode!=='video'||busy())return;
    await save();const id=doc.id,owner=epoch;
    const role=await CharacterPicker.pick();
    if(!role||!owner260(id,owner)||mode!=='video')return;
    working=true;lock();
    try{const result=await api('bind-character',{canvasId:id,characterId:role.character.id});if(!owner260(id,owner))return;doc=result.document;$('presenter').checked=true;syncMode();photos();status('主播形象已绑定。绑定音色仅在独立配音时使用，配音前另行确认费用。');}
    finally{if(owner260(id,owner)){working=false;lock();}}
  }
  async function uploadBatch260(jobs){
    if(uploadFlight260&&owner260(uploadFlight260.id,uploadFlight260.epoch))throw Error('正在上传当前批次，请等候上传完成。');
    const initialized=await ensureBatch260();if(!initialized)return;
    const id=doc.id,owner=epoch;
    const flight={id,epoch:owner};uploadJobs260=jobs;uploadFlight260=flight;working=true;lock();
    let next=0,completed=0;
    const pending=jobs.filter(job=>job.state!=='done');
    const worker=async()=>{
      while(next<pending.length&&owner260(id,owner)){
        const job=pending[next++];job.state='uploading';
        try{
          if(!job.file.size||job.file.size>12*1024*1024)throw Error('单张图片需大于0且不超过12MB。');
          const response=await fetch('/api/ecommerce/batch/upload',{method:'POST',headers:{'X-Canvas-Id':id,'X-Upload-Id':job.id,'X-Filename':encodeURIComponent(job.file.name),'Content-Type':job.file.type||'application/octet-stream'},body:job.file,signal:AbortSignal.timeout(45000)});
          const value=await response.json();if(!response.ok||value.ok===false)throw Error(value.error||'上传失败');
          job.state='done';job.error='';applyBatch260(value,id,owner);
        }catch(error){job.state='failed';job.error=error.message;}
        completed++;
        if(owner260(id,owner)){$('uploadStatus260').hidden=false;$('uploadStatus260').textContent='已处理 '+completed+' / '+pending.length+' 张上传 · 同时最多 2 张';renderUploadFailures260();}
      }
    };
    try{await Promise.all([worker(),worker()]);if(owner260(id,owner)){await observeBatch260(false);status(jobs.some(job=>job.state==='failed')?'部分图片上传未完成，成功图片已保留；可重试失败上传。':'产品图片已分别保存，可统一处理或逐图设置。');}}
    finally{if(uploadFlight260===flight)uploadFlight260=null;if(owner260(id,owner)){working=false;lock();}}
  }
  function renderUploadFailures260(){
    const failed=uploadJobs260.filter(job=>job.state==='failed');
    $('uploadFailures260').hidden=!failed.length;
    $('uploadFailures260').innerHTML=failed.map(job=>'<p>'+esc(job.file.name)+'：'+esc(job.error)+'</p>').join('')+(failed.length?'<button type="button" id="retryUploads260">重试失败上传</button>':'');
  }
  async function applyImageSettings260(all=false){
    if(!batchMode260()||working||batchPending260())return;
    const id=doc.id,owner=epoch;
    const ids=(all?batch260.items.map(item=>item.id):[...selectedImages260]);
    if(!ids.length)throw Error('请先选中需要处理的图片。');
    const override={form:imageForm260(),settings:imageSettings260()};
    if(!override.settings.ratio||$('ratio').selectedOptions[0]?.disabled)throw Error('请先选择当前可用的图片画幅。');
    await save();if(!owner260(id,owner))return;working=true;lock();
    try{for(let index=0;index<ids.length;index++){if(!owner260(id,owner))return;const value=await api('batch/settings',{canvasId:id,itemId:ids[index],override});applyBatch260(value,id,owner);$('generationStatus').textContent='已保存 '+(index+1)+' / '+ids.length+' 张图片的独立要求；未生成、未扣费。';}overrideDirty260=false;markUniformDirty260(false);status('已应用到 '+ids.length+' 张图片；每张仍可独立调整。');}
    finally{if(owner260(id,owner)){try{await refreshImageDesignStates264();}finally{if(owner260(id,owner)){working=false;lock();renderImageInspector260(true);}}}}
  }
  async function saveItemOverride260(){
    if(!batchMode260()||working)return;
    const item=imageItems260().find(row=>row.id===activeImage260);if(!item||pendingStates260.has(item.status)||item.canReconcile)return;
    const id=doc.id,owner=epoch;
    const override={form:{...effectiveImage260(item).form,background:$('itemBackground260').value,targetLanguage:$('itemLanguage260').value,replacementText:$('itemReplacement260').value,...readImageProfile263(true)},settings:{ratio:$('itemRatio260').value}};
    if(!override.settings.ratio||$('itemRatio260').selectedOptions[0]?.disabled)throw Error('请为此图选择当前可用的画幅。');
    working=true;lock();
    try{const value=await api('batch/settings',{canvasId:id,itemId:item.id,override});if(!owner260(id,owner))return;overrideDirty260=false;applyBatch260(value,id,owner);status('只保存了“'+item.name+'”的独立设置，其他图片保持原样。');}
    finally{if(owner260(id,owner)){try{await refreshImageDesignStates264();}finally{if(owner260(id,owner)){working=false;lock();}}}}
  }
  async function generateBatch260(){
    if(!batchMode260()||working)return;
    if(batchPending260())throw Error('本批次仍有原任务待处理或核对，请继续查询原单。');
    if(overrideDirty260)throw Error('当前图片的独立设置尚未保存，请先保存这一张的设置，再核对总价。');
    if(uniformDirty260)throw Error('统一要求或模型参数已修改，请先点击“应用到选中图片”或“应用到全部”，再核对总价。');
    if(imagePlanDirty264)throw Error('请先保存本图的方案修改，再核对图片费用。');
    await save();const id=doc.id,owner=epoch,rev=revision;
    const imageDefaults=await refreshImageDefaults260();if(!imageDefaults||!owner260(id,owner))return;
    const itemIds=imageItems260().filter(item=>selectedImages260.has(item.id)&&eligibleImage260(item)).map(item=>item.id);
    if(!itemIds.length)throw Error('请选中尚未提交或需要重新核价的图片。');
    const selectedSnapshot=JSON.stringify([...selectedImages260].sort()),concurrency=Number($('batchConcurrency260').value);
    if(!Number.isInteger(concurrency)||concurrency<1||concurrency>5)throw Error('并发数量请选择1至5，默认3。');
    working=true;lock();
    try{
      const response=await api('batch/quote',{canvasId:id,itemIds,redrawOnly268:true,useImageDefaults:true,
        imageDefaults:{model:imageDefaults.model.model,resolution:imageDefaults.resolution,route:imageDefaults.route}});if(!owner260(id,owner))return;
      applyBatch260(response,id,owner);const quote=response.quote,total=Number(quote?.estimatedPoints);
      if(!quote?.quoteId||!Number.isFinite(total)||total<=0||!Array.isArray(quote.items)||quote.items.length!==itemIds.length||new Set(quote.items.map(row=>row.itemId)).size!==itemIds.length||quote.items.some(row=>!itemIds.includes(row.itemId)||!Number.isFinite(Number(row.estimatedPoints))||Number(row.estimatedPoints)<=0)||Math.abs(quote.items.reduce((sum,row)=>sum+Number(row.estimatedPoints),0)-total)>0.000001)throw Error('批次报价不完整，请刷新后重新核价；未提交生成。');
      batchQuote260=quote;
      $('batchQuoteRows260').hidden=false;$('batchQuoteRows260').innerHTML=quote.items.map(row=>'<div><span>'+esc(imageItems260().find(item=>item.id===row.itemId)?.name||row.itemId)+' · '+esc(row.modelName||'已发布图片模型')+'<small>'+esc(imageDesignSummary263(effectiveImage260(imageItems260().find(item=>item.id===row.itemId)).form))+'</small></span><b>'+esc(row.estimatedPoints)+' 积分</b></div>').join('');
      const accepted=await confirm('确认处理 '+quote.items.length+' 张主图','本批次预计总计 '+total+' 积分 · '+imageDefaults.resolution.toUpperCase()+'。\n每张独立提交、保存与结算，最多同时 '+concurrency+' 张。\n暂停只影响未提交图片；已提交任务仍按原订单查询。',true);
      if(!accepted)return;
      if(!owner260(id,owner)||rev!==revision||selectedSnapshot!==JSON.stringify([...selectedImages260].sort())||concurrency!==Number($('batchConcurrency260').value))throw Error('确认期间项目、选中图片或参数已改变，请重新核价；未提交生成。');
      const result=await api('batch/start',{canvasId:id,quoteId:quote.quoteId,runId:uid(),billingConfirmed:true,expectedPoints:total,concurrency});
      if(!owner260(id,owner))return;applyBatch260(result,id,owner);status('批次已按确认金额启动；只提交这次选中的图片。');await observeBatch260(true);
    }catch(error){if(owner260(id,owner)){try{await observeBatch260(false);}catch(_){}throw error;}}
    finally{if(owner260(id,owner)){working=false;lock();}$('batchQuoteRows260').hidden=true;batchQuote260=null;}
  }
  async function saveDownload260(url,name){
    let desktop;try{desktop=window.pywebview?.api||window.parent.pywebview?.api;}catch(_){}
    if(desktop?.save_download){const saved=await desktop.save_download(url,name,'ecommerce');if(saved?.canceled)return false;if(!saved?.ok)throw Error(saved?.error||'下载未完成');return saved.path||true;}
    const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();return true;
  }
  async function downloadItem260(itemId=activeImage260){
    const item=imageItems260().find(row=>row.id===itemId),result=item&&imageResult260(item);
    if(!item||!result)throw Error('此图还没有已保存的生成结果。');
    await saveDownload260(mediaFor260(item.childCanvasId,result.file,true),(item.name||'电商主图').replace(/\.[^.]+$/,'')+'-结果.jpg');
  }
  async function downloadBatch260(all=false){
    if(!batchMode260()){const rows=(doc?.results||[]).filter(row=>!row.deleted);if(rows.length===1)return saveDownload260(media(rows[0].file,true),(rows[0].name||doc.name)+(rows[0].media==='video'?'.mp4':'.jpg'));throw Error('请从每个结果点击下载；批量主图可一次导出ZIP。');}
    const id=doc.id,owner=epoch,itemIds=imageItems260().filter(item=>selectedImages260.has(item.id)&&imageResult260(item)).map(item=>item.id);
    const visible=galleryRows265().filter(row=>row.media==='image');
    if(all&&!visible.length||!all&&!itemIds.length)throw Error('请先选中已有生成结果的图片。');
    const result=await api('batch/export',{canvasId:id,...(all?{results:visible.map(row=>({canvasId:row.canvasId,file:row.file}))}:{itemIds})});if(!owner260(id,owner))return;
    if(!result.url||!result.name||!Number.isInteger(result.count)||result.count<1)throw Error('本次归档未返回有效下载文件，请重试。');
    const url=new URL(result.url,location.origin);if(url.origin!==location.origin||url.pathname!=='/api/ecommerce/batch/archive')throw Error('归档下载地址无效。');
    await saveDownload260(url.pathname+url.search,result.name);
  }
  function lock(){
    const block=busy()||paidActionActive260()||deletionBusy265,batchLocked=batchPending260();
    document.querySelectorAll('.input-column input,.input-column textarea,.input-column select,#projectName,#saveProject,#analyze,#generate,.settings select,.idea textarea,.idea input,#imageOptions input,#imageOptions textarea,#imageOptions select,#videoMarketPanel260 input,#videoMarketPanel260 select').forEach(el=>el.disabled=block||batchLocked);
    document.querySelectorAll('[data-remove-file]').forEach(el=>el.disabled=block||batchLocked);
    const imageSettings=mode==='image'?imageDefaults260():null;
    const invalid=imageSettings ? Boolean(imageSettings.error||!$('ratio').value||$('ratio').selectedOptions[0]?.disabled) :
      !modelRows().some(m=>m.model===$('model').value)||['model','resolution','ratio','duration'].some(id=>!$(id).value||$(id).selectedOptions[0]?.disabled);
    const selected=imageItems260().filter(item=>selectedImages260.has(item.id));
    const count=batchMode260()?selected.filter(eligibleImage260).length:Number(Boolean($('products').files.length||state()?.form?.productFiles?.length));
    const direct=directVideo288();
    const pricing=direct?videoPrice288():null;
    const hasProducts=productCount288()>0&&productCount288()<=videoProductLimit288();
    $('generate').disabled=block||batchLocked||invalid||(mode==='video'?(direct?!hasProducts||!pricing||!!videoHelp288:!chosen):!count);
    $('generate').textContent=batchMode260()?'核对总价并生成 '+count+' 张':'核对费用并生成';
    if(imageSettings){
      $('preferencesHint260').textContent=sharedImageDefaults260.fee(catalog,imageSettings,count);
      $('preferencesHint260').toggleAttribute('data-error',Boolean(imageSettings.error));
    }
    $('savePreferences260').disabled=block||batchLocked;$('applyPreferences260').disabled=block||batchLocked;
    $('observeVideo').hidden=!doc?.generation||working||batchMode260();$('openCanvas').hidden=!doc?.graph?.nodes?.length;
    $('analyze').disabled=block||!catalog.analysis;$('newProject').disabled=requesting||lifecycleBusy261;
    $('deleteProject261').disabled=lifecycleBusy261||paidActionActive260()||!doc;$('deletedProjects261').disabled=lifecycleBusy261||paidActionActive260();$('projects').disabled=lifecycleBusy261;
    document.querySelectorAll('[data-mode]').forEach(button=>button.disabled=lifecycleBusy261);
    $('chooseCharacter260').disabled=block||batchLocked;
    for(const button of document.querySelectorAll('[data-video-voice288],#legacyVideoMode288'))button.disabled=block||batchLocked;
    $('products').disabled=block||batchLocked||(direct&&productCount288()>=videoProductLimit288());
    if(direct)paintVideoFee288(pricing,invalid);
    if(mode==='video')$('duration').disabled=block||batchLocked||$('duration').options.length<2;
    paintVideoHelp288(block||batchLocked);
    for(const id of ['applySelected260','applyAll260'])$(id).disabled=block||batchLocked||!batchMode260();
    $('selectAllImages260').disabled=working;
    document.querySelectorAll('[data-image-select]').forEach(control=>control.disabled=false);
    const deletable=item=>!['running','unknown','uploading'].includes(item.status)&&!item.canReconcile;
    $('deleteSelectedImages265').disabled=deletionBusy265||paidActionActive260()||!selected.length||selected.some(item=>!deletable(item));
    document.querySelectorAll('[data-delete-image265]').forEach(button=>button.disabled=deletionBusy265||paidActionActive260()||!deletable(imageItems260().find(item=>item.id===button.dataset.deleteImage265)||{}));
    document.querySelectorAll('[data-delete-result265]').forEach(button=>button.disabled=deletionBusy265||paidActionActive260());
    renderResultSelection265();
    $('saveItemOverride260').disabled=block||!batchMode260()||pendingStates260.has(imageItems260().find(item=>item.id===activeImage260)?.status)||!!imageItems260().find(item=>item.id===activeImage260)?.canReconcile;
    $('itemOverrideDetails260').querySelectorAll('input,select,textarea').forEach(control=>control.disabled=$('saveItemOverride260').disabled);
    renderBatchStatus260();
    renderImagePlans264();
  }
  function form(redraw=false){
    const saved=state()?.form||{},base=emptyForm(mode,false);
    for(const key of ['productFiles',...(mode==='video'?videoFields260:imageFields260)])if(Object.hasOwn(saved,key))base[key]=clone(saved[key]);
    base.description=$('description').value;
    if(mode==='image'){
      for(const key of imageFields260)base[key]=$(key).value;
      if(redraw||!doc||saved.designMode==='redraw'){
        Object.assign(base,readImageProfile263());
      }else{
        base.textMode=saved.textMode||'keep';
        if([263,264,265].includes(saved.imageDesignVersion)){
          Object.assign(base,readImageProfile263(),{imageDesignVersion:saved.imageDesignVersion,designMode:saved.designMode,textMode:base.textMode});
        }
      }
    }else{
      for(const key of ['presenterDirection','speech'])base[key]=$(key).value;
      if(videoHelp288?.lastShown===base.speech)base.speech=videoHelp288.original;
      base.presenter=$('presenter').checked;base.versionCount=Number($('versionCount').value);
      if(videoLocaleActive260)Object.assign(base,{schemaVersion:260,targetMarket:$('videoMarket260').value,customMarket:$('videoMarket260').value==='custom'?$('customMarket260').value:'',outputLanguage:$('videoLanguage260').value,customLanguage:$('videoLanguage260').value==='custom'?$('customLanguage260').value:'',voiceAccent:$('voiceAccent260').value,textScript:$('textScript260').value,speechPolicy:$('speechPolicy260').value});
      if(directVideo288())Object.assign(base,{
        videoVoiceMode:videoVoiceMode288,
        salesPlatform:$('salesPlatform288').value||'general',
        customSalesPlatform:$('salesPlatform288').value==='custom'?$('customSalesPlatform288').value:'',
      });
    }
    return base;
  }
  function applyForm260(raw={}){
    const next=emptyForm(mode,false);
    for(const key of ['productFiles','description',...(mode==='video'?videoFields260:imageFields260)])if(Object.hasOwn(raw,key))next[key]=clone(raw[key]);
    for(const key of ['description','presenterDirection','speech','background','targetLanguage','replacementText'])$(key).value=Object.hasOwn(next,key)?next[key]:key==='targetLanguage'?'zh-Hans':'';
    applyImageProfile263(mode==='image'?raw:{});
    $('presenter').checked=!!next.presenter;$('versionCount').value=next.versionCount||3;
    videoVoiceMode288=mode==='video'&&Object.hasOwn(voiceModes288,raw.videoVoiceMode)?raw.videoVoiceMode:'';
    if(mode==='video'&&doc&&!videoVoiceMode288)legacyVideoProjects288.add(doc.id);
    videoLocaleActive260=mode==='video'&&(raw.schemaVersion===260||directVideo288());
    const locale=videoLocaleActive260?{...localeDefaults260(),...raw}:{};
    paintLocale288(locale.targetMarket||'',locale.outputLanguage||'',raw.salesPlatform||'general');
    for(const [id,key] of [['customMarket260','customMarket'],['customLanguage260','customLanguage'],['voiceAccent260','voiceAccent'],['textScript260','textScript']])$(id).value=locale[key]||'';
    $('customSalesPlatform288').value=raw.customSalesPlatform||'';
    $('speechPolicy260').value=locale.speechPolicy||'translate';
    videoLanguageEdited288=!!locale.outputLanguage&&locale.outputLanguage!==marketLanguage288(locale.targetMarket);
    videoAccentEdited288=!!locale.voiceAccent&&locale.voiceAccent!==(marketDefaults260[locale.targetMarket]?.[1]||languageDefaults260[locale.outputLanguage]?.[0]);
    paintAccent288();
  }
  function enableVideoLocale260(){
    if(mode!=='video')return;
    videoLocaleActive260=true;
    if(!$('videoMarket260').value)$('videoMarket260').value='CN';
    if(!$('videoLanguage260').value)$('videoLanguage260').value='zh-Hans';
    if(!$('voiceAccent260').value)$('voiceAccent260').value='普通话';
    if(!$('textScript260').value)$('textScript260').value='简体中文';
  }
  async function savePreferences260(){
    if(mode!=='video')return;
    const requestedMode=mode,owner=epoch;
    const settings={model:$('model').value,route:$('route').value,resolution:$('resolution').value,ratio:$('ratio').value,...(mode==='video'?{duration:Number($('duration').value)}:{})};
    if(!modelRows().some(row=>row.model===settings.model)||!settings.resolution)throw Error('请先选择当前可用的模型和输出参数。');
    await api('save-preferences',{media:requestedMode,settings});
    if(owner===epoch&&mode===requestedMode)$('preferencesHint260').textContent=(requestedMode==='video'?'视频':'图片')+'常用设置已保存，新建项目后可点击使用。';
  }
  async function applyPreferences260(){
    if(mode!=='video')return;
    const requestedMode=mode,owner=epoch,revisionBefore=revision;
    const saved=await api('preferences?media='+encodeURIComponent(requestedMode));
    if(owner!==epoch||mode!==requestedMode||revisionBefore!==revision)return;
    const settings=saved.settings||{};
    if(!settings.model)throw Error('还没有保存'+(mode==='video'?'视频':'图片')+'常用设置。');
    renderModels(false, restoredVideoRoute(settings));
    const modelAvailable=modelRows().some(row=>row.model===settings.model);
    if(!modelAvailable){
      const option=document.createElement('option');option.value=settings.model;option.textContent='常用模型当前不可用，请重新选择';option.disabled=true;$('model').append(option);$('model').value=settings.model;
      $('resolution').innerHTML='';$('preferencesHint260').textContent='常用模型已下架或当前线路不匹配，记录仍保留；请手动选择模型。';lock();return;
    }
    $('model').value=settings.model;renderSpecs(false);
    const invalid=[];
    for(const key of ['resolution','ratio',...(mode==='video'?['duration']:[])]){
      if(key==='duration'&&directVideo288())renderVideoDurations288(settings.duration);
      if(settings[key]==null)continue;
      if(![...$(key).options].some(option=>option.value===String(settings[key])&&!option.disabled)){
        const option=document.createElement('option');option.value=String(settings[key]);option.textContent=String(settings[key])+' · 当前不支持，请重选';option.disabled=true;$(key).append(option);invalid.push(key);
      }
      $(key).value=String(settings[key]);
    }
    $('preferencesHint260').textContent=invalid.length?'常用设置中的部分参数当前不支持，请重选后生成。':'已应用'+(mode==='video'?'视频':'图片')+'常用设置；本次生成前仍会核对费用。';
    if(batchMode260())markUniformDirty260(true);lock();
  }
  function collectVersions(){return (state()?.versions||[]).map(row=>{const card=$('ideas').querySelector('[data-version="'+row.id+'"]');if(!card)return row;const result={...row};card.querySelectorAll('[data-field]').forEach(el=>result[el.dataset.field]=el.value);return result;});}
  async function save(redraw=false){if(!doc||busy())return;if(saveFlight){await saveFlight;return save(redraw);}clearTimeout(saveTimer);const owner=epoch,canvasId=doc.id,rev=revision,payload={canvasId,name:$('projectName').value||doc.name,form:form(redraw),versions:collectVersions()};saveFlight=api('save',payload);try{const response=await saveFlight;if(owner!==epoch||doc?.id!==canvasId)return;doc=response.document;if(mode==='image'&&!batchMode260()&&state()?.imagePlan264)await refreshImageDesignStates264();if(owner===epoch&&doc?.id===canvasId)lock();if(owner===epoch&&doc?.id===canvasId&&rev===revision)status('项目已保存。');}finally{saveFlight=null;}if(owner===epoch&&rev!==revision&&!busy())await save();}
  function changed(uniform=true){if(videoHelp288)resetVideoHelp288('输入已变更，原帮写仍可查询。');revision++;if(mode==='image'&&!batchMode260()&&uniform&&state()?.imagePlan264){imageDesignStates264=new Map();state().imagePlanStatus264='stale';}if(batchMode260()&&uniform)markUniformDirty260(true);clearTimeout(saveTimer);status('有修改，正在保存…');if(doc)saveTimer=setTimeout(()=>safe(save)(),700);}
  async function confirm(title,text,batch=false){$('confirmTitle').textContent=title;$('confirmText').textContent=text;if(!batch)$('batchQuoteRows260').hidden=true;const dialog=$('confirmDialog');dialog.returnValue='';dialog.showModal();return await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='ok'),{once:true}));}
  function photos(){
    for(const [container,key] of [['productThumbs','productFiles'],['personThumbs','personFile'],['sceneThumbs','sceneFiles']]){
      if(container==='productThumbs'&&mode==='image'){renderImageGrid260();continue;}
      const value=state()?.form?.[key],files=Array.isArray(value)?value:value?[value]:[];
      $(container).innerHTML=files.map(file=>'<div class="thumb"><img src="'+esc(media(file))+'" alt="'+esc(doc.uploads[file]?.name||'参考图')+'"><small>'+esc(doc.uploads[file]?.name||'参考图')+'</small><button type="button" data-remove-file="'+esc(file)+'" data-role="'+key+'" aria-label="移除这张参考图">×</button></div>').join('');
    }
    if(mode==='video')$('productCount260').textContent=productCount288()+' / '+videoProductLimit288();
    renderCharacterBinding260();
  }
  function renderVersions(){const versions=state()?.versions||[];if(!versions.some(row=>row.id===chosen))chosen=versions[0]?.id||'';$('ideas').innerHTML=versions.length?versions.map((v,i)=>'<article class="idea '+(v.id===chosen?'selected':'')+'" data-version="'+esc(v.id)+'"><div class="idea-head"><input type="radio" name="idea" value="'+esc(v.id)+'" '+(v.id===chosen?'checked':'')+' aria-label="选择创意 '+(i+1)+'"><b>'+esc(v.title||'创意 '+(i+1))+'</b><span class="muted">0'+(i+1)+'</span></div><p class="idea-preview">'+esc(v.concept)+'</p><details><summary>编辑这一版的文案与镜头</summary>'+[['title','标题',100],['concept','创意方向',2000],['visualPlan','镜头与画面',4000],['prompt','完整视频描述词',8000],['voiceover','角色口播',2000]].map(([key,label,max])=>'<label class="field">'+label+'<textarea data-field="'+key+'" maxlength="'+max+'" rows="'+(key==='prompt'?6:2)+'">'+esc(v[key]||'')+'</textarea></label>').join('')+'</details></article>').join(''):'<div class="empty"><span>✦</span><h3>好创意，从看懂产品开始</h3><p>上传产品图后点击“生成创意”，这里会显示不同创意方向。</p></div>';const summary=state()?.summary;$('analysisSummary').hidden=!summary;$('analysisSummary').textContent=summary||'';if(summary&&state()?.uncertainties?.length){const details=document.createElement('details'),title=document.createElement('summary'),p=document.createElement('p');title.textContent='这些产品信息还不能确认';p.textContent=state().uncertainties.join('；');details.append(title,p);$('analysisSummary').append(details);}$('selectionHint').textContent=mode==='image'?'选中图片，核对各图报价与总价，再确认开始。':chosen?'已选：'+(versions.find(v=>v.id===chosen)?.title||'创意版本'):'先生成并选中一个创意版本。';}
  function galleryRows265(){
    if(batchMode260()&&Array.isArray(batch260.results265))return batch260.results265.filter(row=>!row.deleted);
    const rows=(doc?.results||[]).filter(row=>!row.deleted).map(row=>({...row,canvasId:doc.id}));
    if(batchMode260())for(const item of batch260.items||[])for(const row of item.results||[])if(row.file&&!row.deleted)rows.push({...row,canvasId:item.childCanvasId,media:'image',name:row.name||item.name});
    return rows;
  }
  const resultKey265=row=>JSON.stringify([row.canvasId,row.file]);
  function renderResultSelection265(){
    const rows=galleryRows265().filter(row=>row.media==='image'),keys=new Set(rows.map(resultKey265));
    selectedResults265=new Set([...selectedResults265].filter(key=>keys.has(key)));
    $('resultSelection265').hidden=mode!=='image'||!rows.length;
    $('selectAllResults265').checked=!!rows.length&&selectedResults265.size===rows.length;
    $('selectAllResults265').indeterminate=selectedResults265.size>0&&selectedResults265.size<rows.length;
    $('selectedResultsCount265').textContent='已选 '+selectedResults265.size+' 个结果';
    $('deleteSelectedResults265').disabled=deletionBusy265||paidActionActive260()||!selectedResults265.size;
  }
  async function deleteImages265(ids){
    if(mode!=='image'||!doc||deletionBusy265||paidActionActive260())return;
    if(imagePlanDirty264||overrideDirty260)throw Error('当前图片有未保存的设置或方案，请先保存或撤销后再删除。');
    if(!ids.length)throw Error('请先选中要删除的素材。');
    if(ids.length>100)throw Error('一次最多删除 100 张素材，请缩小本次选择。');
    const id=doc.id,owner=epoch;
    if(!await confirm('删除 '+ids.length+' 张素材？','只移除素材卡片；已生成的成品仍在“创作结果”。\n原文件和收费原单保留，尚未提交的排队项将取消。'))return;
    if(!owner260(id,owner)||mode!=='image')return;
    await save();if(!owner260(id,owner))return;
    const wasBatch=batchMode260(),files=new Set(imageItems260().filter(item=>ids.includes(item.id)).map(item=>item.file));
    if(!wasBatch){await ensureBatch260();if(!owner260(id,owner))return;ids=imageItems260().filter(item=>files.has(item.file)).map(item=>item.id);}
    const expectedRevision=batchRevision260;deletionBusy265=true;lock();
    try{
      const response=await api('batch/delete-items',{canvasId:id,itemIds:ids,expectedRevision});
      if(!owner260(id,owner))return;
      revision++;batchQuote260=null;applyBatch260(response,id,owner);
      for(const itemId of ids){selectedImages260.delete(itemId);knownImages260.delete(itemId);imageDesignStates264.delete(itemId);}
      if(ids.includes(activeImage260)){activeImage260='';detailsOpen260=false;}
      photos();results();status('已删除 '+response.deletedCount+' 张素材。已有成品和原订单保留；未提交项不会再生成。');
    }catch(error){if(owner260(id,owner))try{await observeBatch260(false);}catch(_){}throw error;}
    finally{if(owner260(id,owner)){deletionBusy265=false;lock();}}
  }
  async function deleteResults265(keys){
    if(mode!=='image'||!doc||deletionBusy265||paidActionActive260())return;
    const selected=galleryRows265().filter(row=>row.media==='image'&&keys.includes(resultKey265(row)));
    if(!selected.length)throw Error('请先选中要删除的生成结果。');
    if(selected.length>100)throw Error('一次最多删除 100 个结果，请缩小本次选择。');
    if(imagePlanDirty264)throw Error('请先保存或撤销当前方案修改。');
    const id=doc.id,owner=epoch;
    if(!await confirm('删除 '+selected.length+' 个生成结果？','只移除这些成品结果；原图素材、其他版本和收费原单保留。\n删除不会重新生成，也不会再次收费。'))return;
    if(!owner260(id,owner)||mode!=='image')return;
    await save();if(!owner260(id,owner))return;
    if(!batchMode260()){await ensureBatch260();if(!owner260(id,owner))return;}
    const expectedRevision=batchRevision260;deletionBusy265=true;lock();
    try{
      const response=await api('batch/delete-results',{canvasId:id,results:selected.map(row=>({canvasId:row.canvasId,file:row.file})),expectedRevision});
      if(!owner260(id,owner))return;
      revision++;batchQuote260=null;for(const key of keys)selectedResults265.delete(key);
      applyBatch260(response,id,owner);status('已删除 '+response.deletedCount+' 个结果，原图素材与其他版本保留。'+(response.warnings||[]).join(' '));
    }catch(error){if(owner260(id,owner))try{await observeBatch260(false);}catch(_){}throw error;}
    finally{if(owner260(id,owner)){deletionBusy265=false;lock();}}
  }
  const resultDateFormat268 = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'
  });

  function resultTimestamp268(row){
    for(const raw of [row.finishedAt,row.createdAt]){
      const value=typeof raw==='string'?raw.trim():raw;
      if(typeof value==='number'||typeof value==='string'&&/^\d{9,13}(?:\.\d+)?$/.test(value)){
        const epoch=Number(value);
        if(!Number.isFinite(epoch)||epoch<=0)continue;
        const stamp=new Date(epoch<1e12?epoch*1000:epoch).getTime();
        if(Number.isFinite(stamp))return stamp;
      }else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?/.test(value)){
        const wallClock=/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
        const stamp=Date.parse(wallClock?value.replace(' ','T')+'+08:00':value);
        if(Number.isFinite(stamp))return stamp;
      }
    }
    return null;
  }

  function groupImageResults268(rows){
    const dates=new Map();
    const entries=rows.slice().reverse().map(row=>({row,stamp:resultTimestamp268(row)}));
    entries.sort((left,right)=>(right.stamp??-Infinity)-(left.stamp??-Infinity));
    for(const {row,stamp} of entries){
      const parts=stamp===null?null:resultDateFormat268.formatToParts(stamp);
      const year=parts?.find(part=>part.type==='year')?.value;
      const month=parts?.find(part=>part.type==='month')?.value;
      const day=parts?.find(part=>part.type==='day')?.value;
      const key=parts?`${year}-${month}-${day}`:'unknown';
      if(!dates.has(key))dates.set(key,{key,year,label:parts?`${Number(month)}.${Number(day)}`:'未记录日期',count:0,batches:new Map()});
      const date=dates.get(key);
      const runId=typeof row.runId==='string'?row.runId.trim():'';
      if(!date.batches.has(runId))date.batches.set(runId,[]);
      date.batches.get(runId).push(row);
      date.count++;
    }
    return [...dates.values()];
  }

  function renderImageResultGroups268(rows,openDays,renderCard){
    return groupImageResults268(rows).map(date=>{
      const heading=date.year?`<time datetime="${date.key}">${date.label} <small>${date.year}年</small></time>`:date.label;
      let batchNumber=0;
      const batches=[...date.batches].map(([runId,items])=>{
        const grid='<div class="results">'+items.map(renderCard).join('')+'</div>';
        if(!runId&&date.batches.size===1)return grid;
        const label=runId?'生成批次 '+(++batchNumber):'无批次记录';
        return `<section class="result-batch268"><h3>${label} · ${items.length} 张</h3>${grid}</section>`;
      }).join('');
      return `<details class="result-day268" data-result-date268="${date.key}"${openDays.has(date.key)?' open':''}><summary>${heading}<span class="result-group-count268">${date.count} 张</span></summary><div class="result-day-content268">${batches}</div></details>`;
    }).join('');
  }

  function results(){
    if(mode==='image')renderImageGrid260();
    const rows=galleryRows265();renderResultSelection265();
    const gallery=$('results');
    const binding=state()?.characterBinding260||state()?.form?.characterBinding260;
    const renderCard=row=>{
      const url=mediaFor260(row.canvasId,row.file),voice='/static/video_voice.html?'+new URLSearchParams({scope:'canvas',projectId:row.canvasId,file:row.file});
      const selection=row.media==='image'?'<label class="check result-check265"><input type="checkbox" data-result-select265="'+esc(resultKey265(row))+'" '+(selectedResults265.has(resultKey265(row))?'checked':'')+'>选择结果</label>':'';
      return '<article class="result" data-result-file="'+esc(row.file)+'" data-result-owner265="'+esc(row.canvasId)+'">'+selection+(row.media==='image'?'<img loading="lazy" src="'+esc(url)+'" alt="生成的电商主图">':'<video controls playsinline preload="metadata" src="'+esc(url)+'"></video>')+'<p>'+esc(row.name||'电商生成结果')+'</p><a href="'+esc(mediaFor260(row.canvasId,row.file,true))+'" download>下载到本地</a>'+(row.media==='image'?'<button type="button" class="subtle danger261" data-delete-result265="'+esc(resultKey265(row))+'">删除结果</button>':'')+(row.media==='video'?'<a class="ecommerce-voice-link260" href="'+esc(voice)+'" target="_blank" rel="noopener">'+(binding?.synthesisReady?'配音 / 使用绑定音色':'配音 / 选择音色')+'</a><small>填写并核对台词、时段与音色，配音费用另行确认。</small>':'')+'<small>历史结果独立保留</small></article>';
    };
    const projectId=mode==='image'?doc?.id||'':'';
    const openDays=new Set(projectId&&gallery.dataset.resultProject268===projectId
      ? [...gallery.querySelectorAll('details[open][data-result-date268]')].map(group=>group.dataset.resultDate268)
      : []);
    gallery.dataset.resultProject268=projectId;
    gallery.innerHTML=!rows.length?'<p class="muted">完成后的图片与视频会分别保留在当前项目。</p>'
      : mode==='image'?renderImageResultGroups268(rows,openDays,renderCard):rows.slice().reverse().map(renderCard).join('');
  }
  async function switchMode265(next,initial=false){
    if(!['image','video'].includes(next)||(next===mode&&workspaceReady))return;
    if(imagePlanDirty264||overrideDirty260)throw Error('当前图片有未保存的方案或设置，请先保存或撤销后再切换板块。');
    if(working||requesting||lifecycleBusy261||paidActionActive260()||uploadFlight260||deletionBusy265){
      throw Error('当前工作台正在处理操作，请稍后再切换创作类型。');
    }
    resetVideoHelp288();
    const ticket=++navigation;
    if(next===mode){
      if(initial&&!doc){applyForm260(emptyForm());syncMode();}
      await loadWorkspaceMode(ticket,initial);
      return;
    }
    await save();
    if(ticket!==navigation)return;
    if(!doc&&(revision||$('projectName').value)){
      unsavedModeDrafts.set(mode,{form:form(),name:$('projectName').value,revision});
    }
    workspaceReady=false;
    epoch++;
    clearTimeout(pollTimer);clearTimeout(batchPoll260);batchRead260++;batchReadFlight260=null;
    doc=null;catalog={};chosen='';working=false;analysisPending=false;batch260=null;batchRevision260=-1;selectedImages260=new Set();knownImages260=new Set();selectedResults265=new Set();activeImage260='';overrideDirty260=false;detailsOpen260=false;deletionBusy265=false;
    resetImagePlans264();mode=next;$('projectName').value='';applyForm260(emptyForm());syncMode();photos();renderVersions();results();
    revision=0;
    await loadWorkspaceMode(ticket,initial);
  }
  async function loadWorkspaceMode(ticket,initial=false){
    const rows=await list();if(ticket!==navigation)return;
    const draft=unsavedModeDrafts.get(mode);
    if(draft){
      $('projectName').value=draft.name;
      applyForm260(draft.form);
      revision=draft.revision;
      unsavedModeDrafts.delete(mode);
      syncMode();
      renderModels(false);
      status('已恢复此工作台的草稿。');
    }else{
      const remembered=localStorage.getItem('ecommerce259-'+mode);
      const target=rows.find(row=>row.mode===mode&&row.id===remembered)||rows.find(row=>row.mode===mode);
      if(target){
        const loaded=await api('document?id='+target.id);
        if(ticket!==navigation)return;
        await open(loaded.document);
      }else{
        renderModels(false);
        if(initial&&mode==='video')$('analyze').disabled=false;
        status(mode==='video'?'上传商品图后，选择视频类型与时长。':'先上传产品图，然后开始主图重绘。');
      }
    }
    if(ticket===navigation)workspaceReady=true;
  }
  function syncMode(){
    const video=mode==='video',direct=directVideo288(),voiceover=videoVoiceMode288==='voiceover';
    document.body.classList.toggle('is-image260',!video);
    for(const id of ['route','model','resolution'])$(id).closest('label').hidden=!video;
    for(const id of ['itemModel260','itemResolution260'])$(id).closest('label').hidden=true;
    $('savePreferences260').closest('.preferences-actions').hidden=!video;
    $('videoMarketPanel260').hidden=!video;$('customMarketField260').hidden=!video||$('videoMarket260').value!=='custom';$('customLanguageField260').hidden=!video||$('videoLanguage260').value!=='custom';
    document.querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.mode===mode)));
    for(const id of ['videoModes288','durationField','scenePanel260'])$(id).hidden=!video;
    $('legacyVideoMode288').hidden=!video||!(legacyVideoProjects288.has(doc?.id)||state()?.versions?.length);
    $('legacyVideoMode288').setAttribute('aria-pressed',String(video&&!direct));
    for(const button of document.querySelectorAll('[data-video-voice288]'))button.setAttribute('aria-pressed',String(videoVoiceMode288===button.dataset.videoVoice288));
    $('ideasPanel').hidden=!video||direct;
    $('videoOptions').hidden=!video||direct&&!voiceover;
    $('personPanel260').hidden=!video||direct&&!voiceover;
    $('videoOptionsTitle288').textContent=direct?'口播稿':'给创意一点方向';
    $('legacyVideoTip288').hidden=direct;
    $('legacyVersionCount288').hidden=direct;
    $('legacyVideoAnalysis288').hidden=direct;
    $('videoSpeechPanel288').hidden=direct?!voiceover:!$('presenter').checked;
    $('speechLabel288').textContent=direct?'补充卖点 / 口播稿':'希望说的口播（选填）';
    $('speech').placeholder=direct?'可填商品卖点或直接编辑口播稿。只上传图片也可以用 AI 帮写。':'填入后作为口播要求；可选择翻译或逐字保留。';
    $('videoPlatformOptions288').hidden=!direct;
    $('customPlatformField288').hidden=$('salesPlatform288').value!=='custom';
    $('voiceLanguageOptions288').hidden=direct&&!voiceover;
    $('textScriptField288').hidden=direct;
    $('accentPresetField288').hidden=!direct;
    $('videoLanguageLabel288').textContent=direct?'口播语言':'输出语言';
    $('videoMarketHeading288').textContent=direct&&!voiceover?'销售市场':'市场与语言';
    $('videoLocaleHint260').textContent=direct?(voiceover?'方言和口音会写入生成要求，实际发音取决于所选模型。':'生成要求保留商品包装文字，避免添加字幕与屏幕文案。'):'地区带出默认语言后仍可修改。已有创意不会自动改写。';
    $('speechPolicy260').querySelector('[value="translate"]').textContent=direct?'整理卖点，按所选语言口播':'翻译到输出语言，保留原意';
    $('speechPolicy260').querySelector('[value="verbatim"]').textContent=direct?'按稿口播':'保留已填写原文，不翻译';
    $('imageOptions').hidden=video;$('imageSelectionBar260').hidden=video;$('concurrencyField260').hidden=video;
    if($('concurrencyField260').parentElement!==$('imageSelectionBar260'))$('imageSelectionBar260').append($('concurrencyField260'));
    const ratioField=$('ratio').closest('label');
    const videoSettings=$('imageGenerationBody268').querySelector('.settings');
    const outputSettings=video?videoSettings:$('imageOutputSettings276');
    if(ratioField.parentElement!==outputSettings){
      if(video)videoSettings.insertBefore(ratioField,$('durationField'));
      else outputSettings.append(ratioField);
    }
    const toggle=$('toggleImageGeneration268');
    toggle.hidden=video;
    $('imageGenerationBody268').hidden=!video&&toggle.getAttribute('aria-expanded')!=='true';
    $('generationStep').textContent=direct?'':video?'04':'03';$('generationStep').hidden=direct;
    $('generationTitle').textContent=direct?'生成视频':video?'把选中的创意拍出来':'批量主图生成';
    $('workspaceTitle260').textContent=video?'电商视频':'让一整组主图，整齐出片。';
    $('workspaceSubtitle260').textContent=video?(direct?'用同一商品的参考图制作产品展示或口播视频。':'产品、主播和环境分别管理，先看创意，再决定生成哪一版。'):'最多100张图片，每张独立处理；统一要求可应用后再逐图微调。';
    $('projectCount260').textContent=video?'视频创作':'批量主图工厂 · 最多100张';
    $('productsTitle260').textContent=video?'产品图':'主图素材';
    if(!video)$('selectionHint').textContent='选中图片，核对各图报价与总价，再确认开始。';
    $('productHint').textContent=video?'上传 1–'+videoProductLimit288()+' 张同一商品的不同角度、包装或使用参考图。':'最多100张，支持一次多选上传；每张拥有独立设置和结果。';
    $('products').multiple=true;$('presenterOptions').hidden=!$('presenter').checked;
    syncImageProfile263();
    renderBatchStatus260();renderImageInspector260(false);
  }
  function setOptions(el,rows,current){el.innerHTML=rows.map(r=>'<option value="'+esc(r.value)+'">'+esc(r.label)+'</option>').join('');if(rows.some(r=>String(r.value)===String(current)))el.value=current;}
  const fallbackLocale288={
    markets:[...$('videoMarket260').options].map(({value:id,textContent:name})=>({id,name})),
    languages:[...$('videoLanguage260').options].map(({value:id,textContent:name})=>({id,name})),
    accents:[
      {id:'普通话',name:'普通话'},
      {id:'粤语',name:'粤语'},
      {id:'闽南语',name:'闽南语'},
      {id:'川普',name:'川普（川渝普通话）'},
    ],
  };
  function paintLocale288(market=$('videoMarket260').value,language=$('videoLanguage260').value,platform=$('salesPlatform288').value){
    const locale=catalog.videoLocale||{};
    for(const [id,rows,current] of [
      ['videoMarket260',locale.markets||fallbackLocale288.markets,market],
      ['videoLanguage260',locale.languages||fallbackLocale288.languages,language],
    ]){
      const options=[...rows];
      if(!options.some(row=>row.id===''))options.unshift({id:'',name:'未设置 · 沿用旧项目'});
      if(current&&!options.some(row=>row.id===current))options.push({id:current,name:current});
      setOptions($(id),options.map(row=>({value:row.id,label:row.name})),current);
    }
    const recommended=new Set(locale.markets?.find(row=>row.id===market)?.recommendedPlatforms||[]);
    const platforms=[...(locale.platforms||defaultVideoPlatforms288)];
    if(platform&&!platforms.some(row=>row.id===platform))platforms.push({id:platform,name:platform});
    setOptions($('salesPlatform288'),platforms.map(row=>({value:row.id,label:row.name+(recommended.has(row.id)?' · 常用':'')})),platform||'general');
    paintAccent288();
  }
  function marketLanguage288(market){
    return catalog.videoLocale?.markets?.find(row=>row.id===market)?.recommendedLanguage||marketDefaults260[market]?.[0]||'';
  }
  function paintAccent288(){
    const accents=catalog.videoLocale?.accents||fallbackLocale288.accents;
    setOptions($('voiceAccentPreset288'),[{value:'',label:'请选择'},...accents.map(row=>({value:row.id,label:row.name}))],$('voiceAccent260').value);
  }
  function applySpeechLanguage288(language,market){
    const locale=marketDefaults260[market];
    const accent=(locale?.[0]===language?locale.slice(1):languageDefaults260[language]);
    if(!accent)return;
    if(!directVideo288()||!videoAccentEdited288)$('voiceAccent260').value=accent[0];
    $('textScript260').value=accent[1];
  }
  function selectVideoMode288(value){
    if(mode!=='video'||busy()||videoVoiceMode288===value)return;
    videoVoiceMode288=value;
    if(directVideo288())enableVideoLocale260();
    paintLocale288();
    syncMode();
    photos();
    renderVersions();
    changed();
    renderSpecs();
  }
  function imageRatios260(){
    const ratios=['9:16','16:9','1:1'],supported=imageDefaults260().model?.supportedAspectRatios;
    return supported?.length?ratios.filter(value=>supported.includes(value)):ratios;
  }
  function preserveImageRatio260(control,value){
    if(!value||[...control.options].some(option=>option.value===value))return;
    const option=new Option(value+' · 当前不支持',value);option.disabled=true;control.add(option);control.value=value;
  }
  function modelRows(){return (catalog.models||[]).filter(m=>m.media===mode&&($('route').value==='all'||ModelPresentation.routeForModel(videoProfile288(),mode,m.model)===$('route').value));}
  function restoredVideoRoute(settings) {
    const saved = settings.route || 'all';
    if (saved === 'all' || !Array.isArray(catalog.videoRouteGroups)) return saved;
    return ModelPresentation.routeForModel(videoProfile288(),'video',settings.model,saved);
  }
  function retainUnavailableModel(model){
    if(!model||[...$('model').options].some(option=>option.value===model))return;
    const option=new Option('原选模型当前不可用，请重新选择',model);
    option.disabled=true;$('model').add(option);$('model').value=model;
  }
  function restoreSettings(){
    const key=mode==='image'?'image':directVideo288()?'direct-video-288':chosen;
    const binding=state()?.bindings?.[key];
    const settings=batchMode260()?batch260.shared?.settings:doc?.graph?.nodes?.find(n=>n.id===binding?.nodeId)?.settings;
    if(mode==='image'){
      if(settings?.ratio){preserveImageRatio260($('ratio'),settings.ratio);$('ratio').value=settings.ratio;}
      lock();return;
    }
    if(!settings?.model)return;
    renderModels(false, restoredVideoRoute(settings));
    retainUnavailableModel(settings.model);
    $('model').value=settings.model;renderSpecs(false);
    for(const key of ['resolution','ratio'])if([...$(key).options].some(o=>o.value===String(settings[key])))$(key).value=settings[key];
    renderVideoDurations288(settings.duration);
    lock();
  }
  function renderModels(preserve=true, requestedRoute=$('route').value){
    if(mode==='image'){
      const ratio=preserve?$('ratio').value:'';
      setOptions($('ratio'),imageRatios260().map(value=>({value,label:value})),ratio);
      preserveImageRatio260($('ratio'),ratio);
      lock();return;
    }
    $('preferencesHint260').removeAttribute('data-error');
    $('preferencesHint260').textContent='视频的模型、线路和输出参数可保存为常用设置。';
    const current=preserve?$('model').value:'';
    const routes=ModelPresentation.availableRoutes(videoProfile288(),mode);
    if (current && selectedVideoModel288()) requestedRoute=restoredVideoRoute({route:requestedRoute,model:current});
    setOptions($('route'),[{value:'all',label:routes.length?'全部线路':'暂无已发布线路'},...routes.map(([value,label])=>({value,label}))],requestedRoute);
    const rows=modelRows();setOptions($('model'),rows.map(m=>({value:m.model,label:m.displayName})),current);
    retainUnavailableModel(current);
    renderSpecs(preserve);$('analysisModel').textContent=catalog.analysis?'产品分析：'+catalog.analysis.modelName+' · 一次 '+catalog.analysis.estimatedPoints+' 积分':catalog.analysisError||'后台尚未配置可用的产品分析模型与价格。';lock();
  }
  function selectedVideoModel288(){
    return (catalog.models||[]).find(row=>row.model===$('model').value&&row.media==='video');
  }
  function videoPrice288(duration=Number($('duration').value)){
    if(!duration||!$('model').value||!$('resolution').value||!$('ratio').value)return null;
    const profile=videoProfile288();
    if(ModelPresentation.isLiveQuote(profile,'video',$('model').value))return {live:true};
    const quote=ModelPresentation.quote(profile,$('model').value,$('resolution').value,duration,'economy',$('ratio').value);
    return Number(quote?.points)>0?quote:null;
  }
  function paintVideoFee288(price,invalid){
    const fields=form();
    const model=selectedVideoModel288();
    const references=productCount288()+fields.sceneFiles.length+Number(videoVoiceMode288==='voiceover'&&fields.presenter&&!!fields.personFile);
    let note='';
    if(!productCount288())note='请选择同一商品的参考图。';
    else if(productCount288()>videoProductLimit288())note='此类型最多使用 '+videoProductLimit288()+' 张商品图，请移除多余图片后继续。';
    else if(!model||invalid)note='当前模型没有此类型可用的规格，请更换模型、分辨率或画幅。';
    else if(references>model.referenceImageLimit)note='当前模型最多接收 '+model.referenceImageLimit+' 张参考图，请减少参考图或更换模型。';
    else if(price)note=model.displayName+' · '+$('duration').value+' 秒 · '+(price.live?'提交前实时核价':'预计 '+price.points+' 积分');
    $('selectionHint').textContent=note;
    if(references>model?.referenceImageLimit)$('generate').disabled=true;
  }
  function renderVideoDurations288(preferred=$('duration').value){
    if(mode!=='video')return;
    const model=selectedVideoModel288();
    const info=ModelPresentation.videoDurationInfo(videoProfile288(),model?.model);
    const bounds=voiceModes288[videoVoiceMode288];
    const durations=!model?[]:directVideo288()
      ?info.durations.filter(value=>value>=bounds.minDuration&&value<=bounds.maxDuration&&videoPrice288(value))
      :info.fixed?[info.fixed]:model.supportedDurations?.length?info.durations
      :[5,10,15,20,30].filter(value=>value>=info.minimum&&value<=info.maximum);
    const selected=durations.includes(Number(preferred))?Number(preferred):15;
    setOptions($('duration'),durations.map(value=>({value,label:value+' 秒'+(info.fixed?'（固定）':'')})),selected);
  }
  function renderSpecs(preserve=true){
    const model=(catalog.models||[]).find(row=>row.model===$('model').value);
    const currentDuration=preserve?$('duration').value:'';
    const prices=(mode==='video'?catalog.videoPricing:catalog.imagePricing)||[];
    const resolutions=[...new Set(prices.filter(row=>row.model===model?.model).map(row=>row.resolution).concat(model?.supportedResolutions||[]).filter(value=>value&&(mode==='video'||['1k','2k'].includes(value))))];
    setOptions($('resolution'),resolutions.map(value=>({value,label:value.toUpperCase()})),preserve?$('resolution').value:'');
    const ratios=model?.supportedAspectRatios?.length?model.supportedAspectRatios:['9:16','16:9','1:1'];
    setOptions($('ratio'),ratios.map(value=>({value,label:({'9:16':'竖屏 9:16','16:9':'横屏 16:9','1:1':'方图 1:1'})[value]||value})),preserve?$('ratio').value:'');
    renderVideoDurations288(currentDuration);
    lock();
  }
  async function list(){
    const owner=epoch,requestedMode=mode,ticket=++listRead261;
    const value=await api('list?includeDeleted=1'),rows=value.projects||[];
    if(owner!==epoch||mode!==requestedMode||ticket!==listRead261)return [];
    projectRows261=rows;
    for(const row of rows){
      if(row.deleted)deletedIds261.add(row.id);
      else deletedIds261.delete(row.id);
    }
    const active=rows.filter(row=>!row.deleted);
    setOptions($('projects'),[{value:'',label:'开始一个新项目'},...active.filter(row=>row.mode===mode).map(row=>({value:row.id,label:projectLabel261(row)}))],doc?.id);
    renderDeletedProjects261();return active;
  }
  let catalogRead=0;
  async function loadCatalog(preserve=false){
    if(!doc)return;
    const owner=epoch,id=doc.id,read=++catalogRead;
    const [value]=await Promise.all([api('catalog',{canvasId:id}),mode==='image'?sharedImageDefaults260.load():null]);
    if(owner!==epoch||doc?.id!==id||read!==catalogRead)return;
    if(value.catalogError)throw Error('后台模型目录同步失败，请稍后重试。');
    catalog=value;paintLocale288();renderModels(preserve);syncMode();photos();
    if(!preserve)restoreSettings();
    else if(detailsOpen260)renderItemRatio260({ratio:$('itemRatio260').value});
  }
  async function refreshImageDefaults260(){
    const owner=epoch,id=doc?.id;
    await sharedImageDefaults260.load();
    if(!owner260(id,owner)||mode!=='image')return null;
    renderModels();
    const value=imageDefaults260();
    if(value.error)throw Error(value.error);
    return value;
  }
  async function open(value){
    if(value.deleted||deletedIds261.has(value.id))throw Error('此项目已删除，请从“已删除项目”中恢复后再打开。');
    resetVideoHelp288();
    clearTimeout(pollTimer);clearTimeout(saveTimer);clearTimeout(batchPoll260);batchRead260++;batchReadFlight260=null;
    epoch++;revision=0;doc=value;mode=state().mode;chosen='';working=false;analysisPending=false;
    resetImagePlans264();
    batch260=mode==='image'?clone(state().batch260||null):null;batchRevision260=Number(batch260?.revision)||-1;
    $('batchConcurrency260').value=String(batch260?.concurrency||3);
    selectedImages260=new Set();knownImages260=new Set();selectedResults265=new Set();deletionBusy265=false;activeImage260='';overrideDirty260=false;detailsOpen260=false;uploadJobs260=[];
    $('uploadStatus260').hidden=true;$('uploadFailures260').hidden=true;
    $('projectName').value=doc.name;applyForm260(state().form);
    uniformDirty260=batchMode260()&&localStorage.getItem('ecommerce260-unapplied-'+doc.id)==='1';
    syncMode();photos();renderVersions();results();lock();const owner=epoch;
    localStorage.setItem('ecommerce259-'+mode,doc.id);await list();if(owner!==epoch)return;await loadCatalog();if(owner!==epoch)return;
    if(batchMode260()){await observeBatch260(true);if(owner===epoch)status('已恢复批量主图项目，每张图片的设置、进度与原订单分别保留。');}
    else if(doc?.generation){$('generationStatus').textContent='原生成任务已保存，点击继续查询，不会重复生成。';}
    else if(mode==='video'&&state()?.analysisReceiptId)await readAnalysis(true);
    if(owner===epoch&&mode==='image')await refreshImageDesignStates264();
  }
  async function ensureDocument(){if(doc)return doc;if(requesting)throw Error('正在新建项目，请稍候。');const paidFlight=paidActionActive260()?paidActionFlight260:null;requesting=true;lock();const owner=epoch,ticket=++navigation,requestedMode=mode;if(paidFlight)paidFlight.navigation=ticket;try{const draft=form(),name=$('projectName').value;const response=await api('create',{name:name||'我的电商'+(mode==='video'?'视频':'主图'),mode});if(owner!==epoch||ticket!==navigation||mode!==requestedMode)throw Error('已切换项目，刚才新建的项目已保留在列表中。');await open(response.document);if(ticket!==navigation||doc?.id!==response.document.id)throw Error('已切换项目，新建项目已保留。');applyForm260(draft);syncMode();await save();return doc;}finally{requesting=false;lock();}}
  async function upload(files,role){
    if(!files.length)return;const requestedMode=mode;await ensureDocument();if(mode!==requestedMode)return;if(busy()||batchPending260())throw Error('原任务尚在处理中，请完成或查询原任务后再更换素材。');
    const existing=mode==='image'?imageItems260().length:(state()?.form?.productFiles||[]).length;
    if(role==='product'&&existing+files.length>(mode==='image'?100:videoProductLimit288()))throw Error(mode==='image'?'一个批次最多100张主图，请减少选择或新建项目。':'此类型最多 '+videoProductLimit288()+' 张商品图，请减少选择。');
    if(videoHelp288)resetVideoHelp288('素材已变更，原帮写仍可查询。');
    if(mode==='image'&&role==='product'&&(batchMode260()||existing+files.length>1)){await uploadBatch260(files.map(file=>({id:uid(),file,state:'ready',error:''})));return;}
    await save();const owner=epoch,id=doc.id;working=true;lock();let presenterChanged=false;
    try{for(const file of files){if(file.size>12*1024*1024)throw Error('单张图片最多12MB，请压缩后再上传。');status('正在上传 '+file.name+'…');const response=await fetch('/api/ecommerce/upload',{method:'POST',headers:{'X-Canvas-Id':id,'X-Filename':encodeURIComponent(file.name),'X-Image-Role':role,'Content-Type':file.type||'application/octet-stream'},body:file,signal:AbortSignal.timeout(45000)}),value=await response.json();if(!response.ok)throw Error(value.error||'图片上传失败');if(!owner260(id,owner))return;doc=value.document;if(role==='person'&&mode==='video'){$('presenter').checked=true;state().form.presenter=true;presenterChanged=true;syncMode();}photos();}status('产品素材已保存。');}
    finally{if(owner260(id,owner)){working=false;lock();}}
    if(presenterChanged&&owner260(id,owner))await save();
  }
  async function readAnalysisRequest(repeat=true){if(!doc)return;const owner=epoch,id=doc.id;const response=await api('observe',{canvasId:id});if(epoch!==owner||doc?.id!==id)return;doc=response.document;const receipt=response.receipt;if(!receipt){analysisPending=false;$('observeAnalysis').hidden=true;lock();return;}const pending=receipt.status==='pending';analysisPending=['pending','unknown','not_called'].includes(receipt.status);working=pending;lock();$('observeAnalysis').hidden=pending||!['unknown','missing','not_called'].includes(receipt.status);if(pending){ModelActivity.set($('status'),{state:'pending',message:receipt.message||'正在分析产品图并准备创意…'});if(repeat)pollTimer=setTimeout(()=>safe(()=>readAnalysis(true))(),1800);}else{renderVersions();results();status(receipt.status==='returned'?'创意已返回。可以展开编辑，再选一版生成视频。':receipt.error||receipt.result?.validationError||'原调用已返回，请核对结果。',receipt.status!=='returned');}}
  async function readAnalysis(repeat=true){
    const owner=epoch,id=doc?.id;
    try{await readAnalysisRequest(repeat);}catch(error){
      if(owner===epoch&&doc?.id===id){working=false;analysisPending=true;$('observeAnalysis').hidden=false;lock();}
      throw error;
    }
  }
  async function navigate(loader){
    if(imagePlanDirty264)throw Error('本图方案有未保存的修改，请先保存或撤销后再切换项目。');
    resetVideoHelp288();
    const ticket=++navigation;++epoch;clearTimeout(pollTimer);clearTimeout(saveTimer);clearTimeout(batchPoll260);batchRead260++;
    await save();if(ticket!==navigation)return;
    working=true;lock();
    try{const value=await loader();if(ticket===navigation)await open(value.document||value);}
    finally{if(ticket===navigation){working=false;lock();}}
  }
  const helpKey288=id=>'ecommerce-video-help-receipt-'+id;
  function savedVideoHelp288(){
    if(!doc)return null;
    try{return JSON.parse(localStorage.getItem(helpKey288(doc.id))||'null');}
    catch(_){return null;}
  }
  function markVideoHelp288(message='',error=false){
    const statusLine=$('videoHelpStatus288');
    if(statusLine.textContent!==message)statusLine.textContent=message;
    statusLine.toggleAttribute('data-error',error);
  }
  function paintVideoHelp288(blocked){
    const show=directVideo288()&&videoVoiceMode288==='voiceover';
    const button=$('videoHelp288'),observe=$('observeVideoHelp288');
    const saved=savedVideoHelp288();
    button.hidden=!show;
    button.disabled=blocked||!!videoHelp288||!!saved||productCount288()<1||productCount288()>videoProductLimit288()||!$('duration').value||!catalog.analysis;
    observe.hidden=!show||!saved||!!videoHelp288;
    observe.disabled=blocked;
    $('speech').readOnly=!!videoHelp288;
  }
  function resetVideoHelp288(message='',error=false){
    clearTimeout(videoHelpTimer288);
    if(videoHelp288&&$('speech').value===videoHelp288.lastShown)$('speech').value=videoHelp288.original;
    videoHelp288=null;
    $('speech').readOnly=false;
    markVideoHelp288(message,error);
  }
  const ownsVideoHelp288=session=>videoHelp288===session&&owner260(session.projectId,session.epoch)&&session.revision===revision&&videoVoiceMode288==='voiceover';
  async function observeVideoHelp288(session,localOnly=true){
    try{
      const value=await api('video-help-observe',{projectId:session.projectId,receiptId:session.receiptId,localOnly});
      if(!ownsVideoHelp288(session))return;
      if(session.duration!==Number($('duration').value)){
        resetVideoHelp288('当前时长已变更。切回 '+session.duration+' 秒可查询原帮写。',true);
        lock();return;
      }
      const result=value.receipt||value;
      if(result.status==='pending'){
        if(typeof result.draftText==='string'&&result.draftText.length<=2000&&result.draftText!==session.lastShown&&result.canApplyToCurrentInputs===true){
          session.lastShown=result.draftText;
          $('speech').value=session.lastShown;
          $('speech').scrollTop=$('speech').scrollHeight;
        }
        markVideoHelp288(session.lastShown===session.original?'正在识别商品并准备口播…':'正在写入口播稿…');
        videoHelpTimer288=setTimeout(()=>observeVideoHelp288(session),400);
        return;
      }
      if(result.status==='returned'&&result.result?.applicable&&result.canApplyToCurrentInputs===true&&typeof result.result.text==='string'&&result.result.text.trim()&&result.result.text.length<=2000){
        resetVideoHelp288();
        localStorage.removeItem(helpKey288(session.projectId));
        $('speech').value=result.result.text;
        $('speechPolicy260').value='verbatim';
        changed();
        markVideoHelp288(result.result.reviewNote||'口播稿已填入，可以继续编辑。');
        lock();
        await save().catch(error=>{
          if(owner260(session.projectId,session.epoch))markVideoHelp288('口播稿已填入，保存失败。'+error.message,true);
        });
        return;
      }
      if(!['unknown','not_called','pending'].includes(result.status))localStorage.removeItem(helpKey288(session.projectId));
      const message=result.status==='returned'?'素材或补充内容已变化，已保留当前输入。':
        [result.error||'原帮写尚无可用正文，已保留原稿。',result.result?.reviewNote].filter(Boolean).join(' ');
      resetVideoHelp288(message,true);
      lock();
    }catch(error){
      if(!ownsVideoHelp288(session))return;
      resetVideoHelp288('查询暂时中断，原帮写记录可继续查询。',true);
      lock();
    }
  }
  function beginVideoHelp288(record,id,owner){
    const original=$('speech').value;
    videoHelp288={...record,projectId:id,epoch:owner,revision,original,lastShown:original};
    markVideoHelp288('正在识别商品并准备口播…');
    lock();
    return videoHelp288;
  }
  async function requestVideoHelp288(){
    if(videoVoiceMode288!=='voiceover'||videoHelp288||savedVideoHelp288())return;
    await ensureDocument();
    await save();
    const owner=epoch,id=doc.id,rev=revision,duration=Number($('duration').value);
    const quote=await api('video-help-quote',{projectId:id,duration});
    if(!owner260(id,owner))return;
    const price=Number(quote.estimatedPoints);
    if(!Number.isFinite(price)||price<=0||!quote.quoteId||!quote.inputHash)throw Error('当前帮写报价不可用，请稍后再试。');
    const accepted=await confirm('AI 帮写口播稿',quote.modelName+' · '+duration+' 秒\n本次 '+price+' 积分。');
    if(!accepted||!owner260(id,owner))return;
    if(revision!==rev||duration!==Number($('duration').value)||videoVoiceMode288!=='voiceover')throw Error('内容已变化，请重新核对帮写。');
    const record={receiptId:uid(),duration};
    localStorage.setItem(helpKey288(id),JSON.stringify(record));
    const session=beginVideoHelp288(record,id,owner);
    try{
      await api('video-help-start',{projectId:id,quoteId:quote.quoteId,inputHash:quote.inputHash,receiptId:record.receiptId,expectedPoints:price,billingConfirmed:true});
    }catch(error){
      if(!ownsVideoHelp288(session))return;
      resetVideoHelp288('提交状态待核对。'+error.message,true);
      lock();return;
    }
    if(ownsVideoHelp288(session))await observeVideoHelp288(session);
  }
  async function resumeVideoHelp288(){
    const record=savedVideoHelp288();
    if(!record||videoHelp288||videoVoiceMode288!=='voiceover')return;
    if(record.duration!==Number($('duration').value)){
      markVideoHelp288('请先将时长切回 '+record.duration+' 秒，再查询原帮写。',true);
      return;
    }
    const id=doc.id,owner=epoch;
    await save();
    if(!owner260(id,owner))return;
    const session=beginVideoHelp288(record,id,owner);
    await observeVideoHelp288(session,false);
  }
  async function analyze(){await ensureDocument();await save();const owner=epoch,id=doc.id,rev=revision;working=true;lock();try{const quote=await api('analyze-quote',{canvasId:id,form:form()});if(epoch!==owner||id!==doc?.id)return;const accepted=await confirm('分析产品图，生成 '+$('versionCount').value+' 版创意',quote.modelName+'\n本次一次产品分析：'+quote.estimatedPoints+' 积分。\n仅返回创意，不会自动生成图片或视频。');if(!accepted)return;if(rev!==revision||owner!==epoch)throw Error('确认期间内容已变化，请重新核对；未调用模型。');await api('analyze-start',{canvasId:id,quoteId:quote.quoteId,inputHash:quote.inputHash,receiptId:uid(),billingConfirmed:true,expectedCredits:quote.estimatedPoints});await readAnalysis(true);}catch(error){if(epoch===owner){$('observeAnalysis').hidden=false;throw error;}}finally{if(epoch===owner){working=false;lock();}}}
  async function pollGeneration(taskId,id,owner){
    if(!owner260(id,owner))return;
    try{
      const response=await fetch('/api/tasks/'+encodeURIComponent(taskId),{cache:'no-store',signal:AbortSignal.timeout(20000)});
      const body=await response.json();
      if(!response.ok)throw Error(body.error||'查询原任务失败');
      if(!owner260(id,owner))return;
      const task=body.task||body;
      const progress=$('generationProgress'),indicator=$('generationStatus');
      progress.hidden=false;progress.value=Number(task.progress)||0;
      if(['queued','running'].includes(task.state)){
        ModelActivity.task(indicator,task);
        working=true;lock();
        pollTimer=setTimeout(()=>safe(()=>pollGeneration(taskId,id,owner))(),1800);
        return;
      }
      const done=task.state==='done';
      const failure=task.error||'本次任务未完成，原记录保留。';
      const syncing=done?'生成结果已返回，正在同步到项目…':failure;
      ModelActivity.set(indicator,{state:done?'pending':'error',message:syncing});
      ModelActivity.set($('status'),{state:done?'pending':'error',message:syncing});
      const updated=await api('document?id='+encodeURIComponent(id));
      if(!owner260(id,owner))return;
      doc=updated.document;working=false;results();lock();progress.hidden=true;
      ModelActivity.task(indicator,task,{success:'生成结果已保存。'});
      status(done?'生成结果已保存，可以预览或下载。':failure,!done);
    }catch(error){
      if(owner260(id,owner)){
        working=false;lock();$('observeVideo').hidden=false;
        $('generationStatus').textContent='查询暂时中断，原任务已保留。请继续查询，不会自动重发。';
        throw error;
      }
    }
  }
  async function generate(){
    await ensureDocument();
    const image=mode==='image',direct=directVideo288();
    if(image&&imagePlanDirty264)throw Error('请先保存本图方案的修改。');
    await save(image);if(busy())throw Error('请先继续查询原任务。');
    const owner=epoch,id=doc.id,rev=revision;
    const shared=image?await refreshImageDefaults260():null;
    if(!owner260(id,owner)||(image&&!shared))return;
    if(image&&(!$('ratio').value||$('ratio').selectedOptions[0]?.disabled))throw Error('请选择默认模型支持的图片画幅。');
    const currentSettings=()=>({model:image?shared.model.model:$('model').value,
      resolution:image?shared.resolution:$('resolution').value,ratio:$('ratio').value,
      ...(image?{}:{duration:Number($('duration').value)})});
    working=true;lock();
    try{
      const settings=currentSettings();
      const defaults=image?{useImageDefaults:true,imageDefaults:{model:shared.model.model,resolution:shared.resolution,route:shared.route}}:{};
      const prepared=await api('prepare',{canvasId:id,...(direct?{}:{versionId:chosen}),settings,...defaults});if(!owner260(id,owner))return;
      doc=prepared.document;
      const plan=await api('quote',{canvasId:id,nodeId:prepared.nodeId});if(!owner260(id,owner))return;
      const receipt=plan.quote;ModelPresentation.quoteReceiptFields(receipt);
      const label=image?'电商主图':direct?(videoVoiceMode288==='voiceover'?'卖点介绍视频':'产品展示视频'):'当前创意视频';
      const accepted=await confirm('确认生成'+label,plan.modelName+'\n'+
        (image?plan.resolution+' · ':plan.duration+'秒 · ')+ModelPresentation.quoteText(receipt));
      if(!accepted)return;
      if(!owner260(id,owner)||rev!==revision||JSON.stringify(settings)!==JSON.stringify(currentSettings()))throw Error('确认期间内容已变化，请重新核对；未提交模型。');
      const result=await api('generate',{canvasId:id,nodeId:prepared.nodeId,billingConfirmed:true,...ModelPresentation.quoteReceiptFields(receipt)});
      if(!owner260(id,owner))return;
      await pollGeneration(result.taskId,id,owner);
    }catch(error){
      if(owner===epoch){
        try{const fetched=await api('document?id='+id);if(owner260(id,owner))doc=fetched.document;}catch(_){}
        if(owner===epoch)status(error.message,true);
        throw error;
      }
    }finally{if(owner===epoch){working=false;lock();}}
  }
  $('products').onchange=safe(async e=>{try{await upload([...e.target.files],'product');}finally{e.target.value='';}});$('person').onchange=safe(async e=>{try{await upload([...e.target.files],'person');}finally{e.target.value='';}});$('scenes').onchange=safe(async e=>{try{await upload([...e.target.files],'scene');}finally{e.target.value='';}});
  $('imageMarket263').addEventListener('input',()=>{
    if(mode!=='image')return;
    const value=$('imageMarket263').value;
    if(value!=='custom'&&imageMarkets263[value])$('targetLanguage').value=imageMarkets263[value][1];
  });
  $('itemMarket263').addEventListener('input',()=>{
    if(mode!=='image')return;
    const value=$('itemMarket263').value;
    if(value!=='custom'&&imageMarkets263[value])$('itemLanguage260').value=imageMarkets263[value][1];
  });
  document.querySelectorAll('.input-column input:not([type=file]):not([data-image-select]),.input-column textarea,.input-column select,#imageOptions input,#imageOptions textarea,#imageOptions select,#projectName').forEach(el=>el.addEventListener('input',event=>{if(['selectAllImages260','selectAllResults265','ratio','batchConcurrency260'].includes(event.target.id)||event.target.matches('[data-result-select265]'))return;syncMode();changed(event.target.id!=='projectName');if(directVideo288())lock();}));
  document.querySelectorAll('.thumbs').forEach(el=>el.onclick=safe(async event=>{const button=event.target.closest('[data-remove-file]');if(!button||busy())return;await save();const key=button.dataset.role,file=button.dataset.removeFile;if(key==='personFile')state().form[key]='';else state().form[key]=state().form[key].filter(f=>f!==file);revision++;photos();await save();}));
  $('ideas').onchange=e=>{const radio=e.target.closest('input[type=radio]');if(!radio)return;chosen=radio.value;$('ideas').querySelectorAll('.idea').forEach(el=>el.classList.toggle('selected',el.dataset.version===chosen));$('selectionHint').textContent='已选：'+(state().versions.find(v=>v.id===chosen)?.title||'创意');lock();};$('ideas').oninput=e=>{if(e.target.matches('textarea'))changed();};
  $('videoMarket260').onchange=()=>{
    const market=$('videoMarket260').value;
    if(mode!=='video'||!market)return;
    enableVideoLocale260();
    const language=marketLanguage288(market);
    if(language&&(!directVideo288()||!videoLanguageEdited288)){
      $('videoLanguage260').value=language;
      applySpeechLanguage288(language,market);
    }
    paintLocale288();syncMode();changed();lock();
  };
  $('videoLanguage260').onchange=()=>{
    if(mode!=='video'||!$('videoLanguage260').value)return;
    enableVideoLocale260();videoLanguageEdited288=true;
    applySpeechLanguage288($('videoLanguage260').value,$('videoMarket260').value);
    paintAccent288();syncMode();changed();lock();
  };
  $('voiceAccentPreset288').onchange=()=>{
    if(!$('voiceAccentPreset288').value)return;
    $('voiceAccent260').value=$('voiceAccentPreset288').value;
    videoAccentEdited288=true;enableVideoLocale260();changed();lock();
  };
  for(const id of ['customMarket260','customLanguage260','voiceAccent260','textScript260','speechPolicy260','salesPlatform288','customSalesPlatform288'])$(id).addEventListener('input',()=>{
    if(mode!=='video')return;
    if(id==='voiceAccent260'){videoAccentEdited288=true;paintAccent288();}
    enableVideoLocale260();syncMode();changed();lock();
  });
  for(const button of document.querySelectorAll('[data-video-voice288]'))button.onclick=()=>selectVideoMode288(button.dataset.videoVoice288);
  $('legacyVideoMode288').onclick=()=>selectVideoMode288('');
  $('videoHelp288').onclick=safe(()=>runPaidAction260(requestVideoHelp288));
  $('observeVideoHelp288').onclick=safe(()=>runPaidAction260(resumeVideoHelp288));
  $('savePreferences260').onclick=safe(savePreferences260);$('applyPreferences260').onclick=safe(applyPreferences260);$('route').onchange=()=>renderModels(false);$('model').onchange=()=>renderSpecs(false);$('saveProject').onclick=safe(async()=>{await ensureDocument();await save();await list();});$('refreshProjects').onclick=safe(async()=>{await list();await loadCatalog();if(batchMode260())await observeBatch260(false);});$('analyze').onclick=safe(()=>runPaidAction260(analyze));$('generate').onclick=safe(()=>runPaidAction260(async()=>{if(batchMode260())await generateBatch260();else await generate();}));$('observeAnalysis').onclick=safe(()=>readAnalysis(true));$('observeVideo').onclick=safe(async()=>{if(!doc)return;const id=doc.id,owner=epoch;working=true;lock();try{const result=await api('reconcile',{canvasId:id});if(owner===epoch)await pollGeneration(result.taskId,id,owner);}finally{if(owner===epoch){working=false;lock();}}});
  $('projects').onchange=safe(async()=>{const id=$('projects').value;if(!id)return;await navigate(()=>api('document?id='+encodeURIComponent(id)));});
  $('newProject').onclick=safe(async()=>{if(requesting)return;requesting=true;lock();const requestedMode=mode;try{await navigate(()=>api('create',{name:'我的电商'+(requestedMode==='video'?'视频':'主图'),mode:requestedMode}));status('新项目已创建，原项目保留。');}finally{requesting=false;lock();}});
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=safe(()=>switchMode265(button.dataset.mode)));
  $('toggleImageGeneration268').onclick=event=>{
    const button=event.currentTarget,expanded=button.getAttribute('aria-expanded')!=='true';
    button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'收起':'展开';
    $('imageGenerationBody268').hidden=!expanded;
  };
  $('chooseCharacter260').onclick=safe(chooseCharacter260);
  $('deleteProject261').onclick=safe(deleteProject261);$('deletedProjects261').onclick=safe(showDeletedProjects261);$('restoreProject261').onclick=safe(restoreProject261);
  $('selectAllImages260').onchange=()=>{selectedImages260=$('selectAllImages260').checked?new Set(imageItems260().map(item=>item.id)):new Set();revision++;photos();lock();};
  $('productThumbs').addEventListener('change',event=>{const box=event.target.closest('[data-image-select]');if(!box)return;if(box.checked)selectedImages260.add(box.dataset.imageSelect);else selectedImages260.delete(box.dataset.imageSelect);revision++;renderImageGrid260();lock();});
  $('productThumbs').addEventListener('click',safe(async event=>{
    const remove=event.target.closest('[data-delete-image265]');if(remove){await deleteImages265([remove.dataset.deleteImage265]);return;}
    const openButton=event.target.closest('[data-image-open]'),download=event.target.closest('[data-item-download]'),reconcile=event.target.closest('[data-item-reconcile]'),retry=event.target.closest('[data-upload-retry]');
    if(openButton){if(imagePlanDirty264&&activeImage260!==openButton.dataset.imageOpen)throw Error('请先保存或撤销当前方案修改，再查看其他图片。');activeImage260=openButton.dataset.imageOpen;detailsOpen260=true;overrideDirty260=false;renderImageInspector260(true);$('imageInspector260').scrollIntoView({block:'nearest',behavior:'smooth'});}
    if(download)await downloadItem260(download.dataset.itemDownload);
    if(reconcile&&batchMode260()){const id=doc.id,owner=epoch;applyBatch260(await api('batch/reconcile',{canvasId:id,itemIds:[reconcile.dataset.itemReconcile]}),id,owner);await observeBatch260(true);}
    if(retry&&batchMode260()&&!working){retryUploadItem260=retry.dataset.uploadRetry;$('retryOriginalUpload260').click();}
  }));
  $('deleteSelectedImages265').onclick=safe(()=>deleteImages265([...selectedImages260]));
  $('deleteSelectedResults265').onclick=safe(()=>deleteResults265([...selectedResults265]));
  $('selectAllResults265').onchange=()=>{selectedResults265=$('selectAllResults265').checked?new Set(galleryRows265().filter(row=>row.media==='image').map(resultKey265)):new Set();results();lock();};
  $('results').addEventListener('change',event=>{const box=event.target.closest('[data-result-select265]');if(!box)return;if(box.checked)selectedResults265.add(box.dataset.resultSelect265);else selectedResults265.delete(box.dataset.resultSelect265);renderResultSelection265();});
  $('showImageDetails260').onclick=()=>{detailsOpen260=true;renderImageInspector260(true);$('imageInspector260').scrollIntoView({block:'nearest',behavior:'smooth'});};
  $('closeImageDetails260').onclick=()=>{detailsOpen260=false;renderImageInspector260(false);};
  document.querySelectorAll('[data-image-view]').forEach(button=>button.onclick=()=>{imageView260=button.dataset.imageView;renderImageInspector260(false);});
  const openImageComparison260=()=>{const dialog=$('imageComparisonDialog260');if(dialog.open)return;$('imageCompare260').focus();dialog.showModal();};
  $('imageCompare260').onclick=openImageComparison260;
  $('imageCompare260').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openImageComparison260();}};
  $('closeImageComparison260').onclick=()=>$('imageComparisonDialog260').close();
  $('itemOverrideDetails260').addEventListener('input',()=>{overrideDirty260=true;revision++;batchQuote260=null;syncImageProfile263(true);});
  $('itemOverrideDetails260').addEventListener('change',()=>{overrideDirty260=true;revision++;batchQuote260=null;syncImageProfile263(true);});
  $('refreshImagePlans264').onclick=safe(queryImagePlans264);
  $('imagePlanList264').onclick=event=>{const button=event.target.closest('[data-open-plan264]');if(!button)return;if(imagePlanDirty264&&activeImage260!==button.dataset.openPlan264){status('请先保存或撤销当前方案修改，再查看其他图片。',true);return;}activeImage260=button.dataset.openPlan264;detailsOpen260=true;overrideDirty260=false;renderImageInspector260(true);$('imageInspector260').scrollIntoView({block:'nearest',behavior:'smooth'});};
  $('imagePlanEditor264').addEventListener('input',()=>{imagePlanDirty264=true;revision++;renderImagePlanEditor264();});
  $('saveImagePlan264').onclick=safe(saveImagePlan264);
  $('discardImagePlan264').onclick=()=>{imagePlanDirty264=false;renderImagePlanEditor264();lock();};
  $('saveItemOverride260').onclick=safe(saveItemOverride260);
  $('applySelected260').onclick=safe(()=>applyImageSettings260(false));$('applyAll260').onclick=safe(()=>applyImageSettings260(true));
  $('downloadItem260').onclick=safe(()=>downloadItem260());$('downloadBatch260').onclick=safe(()=>downloadBatch260(false));$('downloadAllResults260').onclick=safe(()=>downloadBatch260(true));
  $('observeBatch260').onclick=safe(()=>observeBatch260(true));
  $('pauseBatch260').onclick=safe(async()=>{if(!batchMode260()||working)return;const id=doc.id,owner=epoch;working=true;lock();try{applyBatch260(await api('batch/pause',{canvasId:id,paused:!batch260.paused}),id,owner);status(batch260.paused?'未提交图片已暂停；已提交任务继续按原单查询。':'继续处理原批次尚未提交的图片，不重发已提交订单。');await observeBatch260(true);}finally{if(owner260(id,owner)){working=false;lock();}}});
  $('reconcileBatch260').onclick=safe(async()=>{if(!batchMode260()||working)return;const id=doc.id,owner=epoch;working=true;lock();try{const itemIds=batch260.items.filter(item=>item.status==='unknown'||item.canReconcile).map(item=>item.id);applyBatch260(await api('batch/reconcile',{canvasId:id,itemIds}),id,owner);await observeBatch260(true);}finally{if(owner260(id,owner)){working=false;lock();}}});
  $('uploadFailures260').onclick=safe(async event=>{if(event.target.id==='retryUploads260')await uploadBatch260(uploadJobs260);});
  $('retryOriginalUpload260').onchange=safe(async event=>{const file=event.target.files[0],itemId=retryUploadItem260;event.target.value='';retryUploadItem260='';if(!file||!batchMode260()||!batch260.items.some(item=>item.id===itemId&&item.status==='upload_failed'))return;await uploadBatch260([{id:itemId,file,state:'ready',error:''}]);});
  document.querySelectorAll('.settings select,#batchConcurrency260').forEach(control=>control.addEventListener('input',()=>{
    if(videoHelp288)resetVideoHelp288('输出设置已变更，原帮写仍可查询。');
    revision++;batchQuote260=null;
    if(batchMode260()&&control.id!=='batchConcurrency260')markUniformDirty260(true);
    if(directVideo288()){
      if(['resolution','ratio'].includes(control.id))renderVideoDurations288();
      lock();
    }
  }));
  $('openCanvas').onclick=safe(async()=>{if(!doc)return;await save();localStorage.setItem('dramaVideoCanvas',doc.id);if(parent!==window)parent.postMessage({type:'ecommerce-open-canvas259',canvasId:doc.id},location.origin);else location.href='/static/video_canvas.html';});
  $('results').addEventListener('click',safe(async event=>{
    const remove=event.target.closest('[data-delete-result265]');if(remove){await deleteResults265([remove.dataset.deleteResult265]);return;}
    const anchor=event.target.closest('a[download]');if(!anchor)return;
    let desktop;try{desktop=window.pywebview?.api||window.parent.pywebview?.api;}catch(_){}
    if(!desktop?.save_download)return;
    event.preventDefault();const url=new URL(anchor.href),name=(doc.name||'电商作品')+(url.searchParams.get('file')?.endsWith('.mp4')?'.mp4':'.jpg');
    const result=await desktop.save_download(url.pathname+url.search,name,'ecommerce');
    if(result.ok)status('已保存到 '+result.path);else if(!result.canceled)throw Error(result.error||'下载未完成');
  }));
  window.addEventListener('pagehide',()=>{resetVideoHelp288();clearTimeout(saveTimer);clearTimeout(pollTimer);clearTimeout(batchPoll260);document.querySelectorAll('video').forEach(el=>el.pause());});
  window.addEventListener('storage',event=>{if(event.key!==lifecycleKey261||!event.newValue)return;try{const change=JSON.parse(event.newValue);if(!change.canvasId||!['delete','restore'].includes(change.action))return;if(change.action==='delete'){deletedIds261.add(change.canvasId);if(doc?.id===change.canvasId){clearProject261(change.canvasId);status('此项目已在另一窗口删除，可在“已删除项目”中恢复。');}}else deletedIds261.delete(change.canvasId);++listRead261;safe(list)();}catch(_){}});
  function showCommerceLanding(restoreFocus=false){
    entryTicket++;
    resetVideoHelp288();lock();
    $('commerceWorkspace').querySelectorAll('video').forEach(video=>video.pause());
    imageWorkbench?.deactivate();
    $('commerceWorkspace').hidden=true;
    $('commerceBack').hidden=true;
    $('commerceTabs').hidden=true;
    $('commerceLanding').hidden=false;
    showcase?.setActive(true);
    if(restoreFocus&&lastEntry){
      document.querySelector('[data-commerce-entry="'+lastEntry+'"]')?.focus({preventScroll:true});
    }
  }
  function showCommerceWorkspace(){
    showcase?.setActive(false);
    $('commerceLanding').hidden=true;
    $('commerceWorkspace').hidden=false;
    $('commerceBack').hidden=!entryMode;
    $('commerceTabs').hidden=entryMode;
    if(entryMode&&mode==='image')imageWorkbench?.activate();
    else imageWorkbench?.deactivate();
  }
  async function enterCommerce(next){
    if(entryPending)return;
    const ticket=entryTicket;
    const statusLine=$('commerceEntryStatus');
    const cards=document.querySelectorAll('[data-commerce-entry]');
    entryPending=true;
    cards.forEach(card=>card.disabled=true);
    statusLine.hidden=false;
    statusLine.removeAttribute('data-error');
    statusLine.textContent='正在打开'+(next==='image'?'图片':'视频')+'创作…';
    try{
      await switchMode265(next,!lastEntry);
      if(ticket!==entryTicket)return;
      lastEntry=next;
      showCommerceWorkspace();
      $(next==='image'?'ecwHeading':'workspaceTitle260').focus({preventScroll:true});
      window.scrollTo(0,0);
    }catch(error){
      statusLine.dataset.error='';
      statusLine.textContent=error.message||'工作台暂时未能打开，请重试。';
      return;
    }finally{
      entryPending=false;
      cards.forEach(card=>card.disabled=false);
      if(!statusLine.hasAttribute('data-error'))statusLine.hidden=true;
    }
  }
  $('configureOutputDirectory268').onclick=configureOutputStorage268;
  $('chooseOutputDirectory268').onclick=chooseOutputStorage268;
  $('saveOutputDirectory268').onclick=saveOutputStorage268;
  $('openOutputDirectory268').onclick=openOutputStorage268;
  $('retryOutputDirectory268').onclick=retryOutputStorage268;
  $('closeOutputDirectory268').onclick=()=>{if(!outputBusy268)$('outputDirectoryDialog268').close();};
  $('outputDirectoryDialog268').addEventListener('cancel',event=>{if(outputBusy268)event.preventDefault();});
  window.addEventListener('pywebviewready',paintOutputStorage268);
  window.addEventListener('focus',refreshOutputStorage268);
  let catalogPollFlight=null;
  function syncOpenCommerceCatalog(){
    if(catalogPollFlight||!workspaceReady||!doc||document.hidden||$('commerceWorkspace').hidden||
      window.frameElement&&!window.frameElement.getClientRects().length||busy()||paidActionActive260())return;
    catalogPollFlight=loadCatalog(true).catch(error=>status(error.message,true)).finally(()=>{catalogPollFlight=null;});
  }
  window.addEventListener('focus',syncOpenCommerceCatalog);
  document.addEventListener('visibilitychange',syncOpenCommerceCatalog);
  const commerceCatalogTimer=setInterval(syncOpenCommerceCatalog,30000);
  window.addEventListener('pagehide',()=>clearInterval(commerceCatalogTimer));
  const outputStoragePoll268=setInterval(refreshOutputStorage268,30000);
  window.addEventListener('pagehide',()=>clearInterval(outputStoragePoll268));
  refreshOutputStorage268();
  const imageWorkbench=window.createEcommerceImageWorkbench?.($('ecommerceImageWorkbench'),$('commerceWorkspace'));
  if(entryMode){
    document.querySelectorAll('[data-commerce-entry]').forEach(card=>{
      card.onclick=()=>enterCommerce(card.dataset.commerceEntry);
    });
    $('commerceBack').onclick=()=>showCommerceLanding(true);
    window.addEventListener('message',event=>{
      if(parent===window||event.source!==parent||event.origin!==location.origin)return;
      if(event.data?.type==='ecommerce-showcase-open')showCommerceLanding();
      else if(event.data?.type==='ecommerce-showcase-hide'){
        entryTicket++;
        resetVideoHelp288();lock();
        showcase?.setActive(false);
        imageWorkbench?.deactivate();
      }
    });
    showCommerceLanding();
  }else{
    showCommerceWorkspace();
    switchMode265('video',true).catch(error=>status(error.message,true));
  }
})();

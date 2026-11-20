/* Local work never quotes, uploads, or submits a cloud job. Old receipts remain source-owned. */
(()=>{'use strict';
const $=id=>document.getElementById(id),fields=['X','Y','Width','Height'],regions=window.SubtitleRegion244;
let record=null,capabilities=null,busy=false,polling=false,pollTimer=null,quoteDraft='',drag=null,detectionStamp=0,quoteStamp244='',newDraftOwner244='';
let confirming245=false,capabilityPromise245=null,cloudDraft245=null,localDraft245=null,selectedMode245='local-repair';
const active=new Set(['preparing','detecting','uploading','quoting','submitting','processing','needs_review','paused','downloading','local_processing','local_preparing']);
const settledWait245=new Set(['needs_review','paused']);
const mode245=()=>$('processingMode').value,cloud245=()=>mode245()==='cloud',strip245=()=>mode245()==='local-strip';
const localJob245=()=>record?.processingMode==='local'&&!record?.requestId;
const working245=()=>!!record&&active.has(record.phase)&&!settledWait245.has(record.phase);
const params=file=>'/api/subtitle/media?'+new URLSearchParams({id:record.id,file});
const draft=()=>({region:Object.fromEntries(fields.map(k=>[k[0].toLowerCase()+k.slice(1),$('region'+k).value.trim()===''?NaN:Number($('region'+k).value)])),quality:$('quality').value});
const frozenRegion244=()=>cloud245()&&!!record?.requestId&&newDraftOwner244!==record.id+':'+record.requestId;
const schemaReady244=()=>capabilities?.configured===true&&capabilities?.regionSchema===regions.SCHEMA;
const receiptRegion244=()=>record?.attempts?.find(row=>row.requestId===record.requestId)?.draft?.region||record.region;
const regionText244=r=>`左${r.x}%、上${r.y}%、宽${r.width}%、高${r.height}%`;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function api(path,body){const response=await fetch('/api/subtitle/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok||value.error)throw Error(value.error||'操作未完成');return value;}
function paintRegion(){const r=draft().region;if(!regions.canonical(r)&&!frozenRegion244())return;Object.assign($('selection').style,{left:r.x+'%',top:r.y+'%',width:r.width+'%',height:r.height+'%'});}
function validRegion(){return regions.canonical(draft().region);}
function cost245(points){return Number(points)===0?'免费':('预计 '+points+' 积分');} function localPrice245(){return strip245()?'只移除可单独关闭的内嵌字幕轨；不会擦除已经烧进画面的文字。不上传、不核价、不扣积分。':'本地处理不上传视频、不核价、不扣积分。在选区内逐帧识别并修补浅色字幕笔画，可能有模糊或涂抹痕迹；结果另存，原视频保留。';}
function changed(normalize=true){
  quoteDraft='';$('price').textContent=cloud245()?'区域或画质已调整，请重新获取费用。':localPrice245();
  if(normalize&&!frozenRegion244())try{const raw=draft().region,r=applyRegion(raw,false);$('regionNotice244').textContent=JSON.stringify(raw)===JSON.stringify(r)?'当前整数选区：'+regionText244(r):'选区已向外对齐到整数网格：'+regionText244(r)+'。请检查预览。';}catch(error){$('regionNotice244').textContent=error.message+' 预览保留上次有效选区。';}
  paintRegion();controls();
}
function confirmProcessing(message){
  if(confirming245)return Promise.resolve(false);
  confirming245=true;controls();$('confirmText').textContent=message;
  return new Promise(resolve=>{const dialog=$('confirm');dialog.returnValue='cancel';dialog.addEventListener('close',()=>{confirming245=false;controls();resolve(dialog.returnValue==='yes');},{once:true});dialog.showModal();});
}
function controls(){
  const selected=!!record,waiting=selected&&active.has(record.phase),working=working245(),frozen=frozenRegion244(),cloud=cloud245(),locked=busy||confirming245;
  $('quote').hidden=!cloud;$('submit').hidden=!cloud;$('localStart245').hidden=cloud;$('cloudQuality245').hidden=!cloud;$('capability').hidden=!cloud;
  $('quote').disabled=!cloud||!selected||locked||waiting||frozen||!schemaReady244()||!validRegion();
  $('submit').disabled=!cloud||!selected||locked||waiting||frozen||!schemaReady244()||record.phase!=='quoted'||!regions.quoted(record.quote)||quoteDraft!==JSON.stringify(draft());
  $('localStart245').disabled=cloud||!selected||locked||working||(!strip245()&&!validRegion());
  $('localStart245').textContent=strip245()?'移除独立字幕轨 · 免费':'开始本地免费修补';
  $('detect').disabled=!selected||locked||working||strip245()||frozen||!!record?.requestId&&active.has(record.phase);
  $('newDraft244').hidden=!cloud||!selected||!record.requestId||waiting;$('newDraft244').disabled=locked;
  $('stop').disabled=!selected||!working||['needs_review','paused'].includes(record.phase);
  $('stop').textContent=localJob245()||!cloud245()&&!record?.requestId?'取消本地处理':'停止本地等待';
  $('stopNotice245').textContent=localJob245()||!record?.requestId?'本地处理可取消；取消后不会覆盖原视频或已经保存的结果。':'停止等待不会取消上游任务或退款。恢复只核对原任务，不重新生成；再次云端处理须单独确认费用。';
  $('resume').hidden=!selected||!record.requestId||!['needs_review','paused'].includes(record.phase);$('resume').disabled=locked;
  $('download').disabled=!record?.resultFile;$('importExisting').disabled=locked||!$('existing').value;$('importLocal').disabled=locked;
  $('processingMode').disabled=locked||working;
  $('selection').hidden=!selected||strip245();
  fields.forEach(k=>$('region'+k).disabled=!selected||locked||working||frozen||strip245());$('quality').disabled=!cloud||!selected||locked||waiting||frozen;
}
function applyRegion(value,preserve=frozenRegion244()){const r=preserve?value:regions.outward(value);for(const k of fields)$('region'+k).value=r[k[0].toLowerCase()+k.slice(1)];paintRegion();return r;}
function paintMode245(){
  $('modeNotice245').textContent=cloud245()?'云端精修会上传视频。读取配置和确认费用后，只有你明确确认开始才提交付费修复；本地模式不会调用此服务。':strip245()?'适合播放器里可以单独关闭的内嵌字幕轨，复制保留视频和声音；不会擦除烧在画面里的字幕。无需上传、不调用云端模型、不扣积分。':'本地修补在选区内逐帧识别并修补浅色字幕笔画，不调用云端模型、不扣积分；可能留下模糊或涂抹痕迹，不能还原被字幕遮住的真实内容。';
  $('regionHelp245').textContent=cloud245()?'拖动选框或右下角调整大小。检查不要圈入需要保留的招牌、手机或文件文字；当前按一个固定区域处理全片。':strip245()?'移除独立字幕轨不使用选区；原选框保留，切回修补时仍可调整。':'拖动选框或右下角调整大小。选框用于限定字幕识别范围，请尽量贴近字幕，避开人物、招牌、手机或文件。当前按一个固定区域处理全片。';
  if(!cloud245())$('price').textContent=localPrice245();
  controls();
}
function resultText245(row,history=false){return [row.resultWarning||row.warning,row.processingMode==='local'||(localJob245()&&!history)?'本地处理，未扣积分。':row.chargedPoints==null?'已保存结果，请核对该原订单费用。':`该${history?'历史':''}结果结算 ${row.chargedPoints} 积分。`,'请播放检查处理区域、时长及声音。'].filter(Boolean).join(' ');}
function render(value,replace=false){
  const previous=record;record=value;const replaced=replace||previous?.id!==record.id;
  $('title').textContent='1 · '+record.name;
  $('sourceInfo').textContent=`${record.metadata.width} × ${record.metadata.height} · ${record.metadata.duration.toFixed(2)} 秒 · ${(record.size/1048576).toFixed(1)} MB${record.metadata.hasAudio?' · 含音轨':' · 无音轨'}`;
  if(replaced){
    cloudDraft245=null;localDraft245=null;newDraftOwner244='';
    if(record.processingMode==='local')$('processingMode').value=record.localMode==='strip'?'local-strip':'local-repair';
    else if(record.requestId){$('processingMode').value='cloud';ensureCapabilities245().catch(error=>status(error.message,true));}
    selectedMode245=mode245();
    $('source').src=params(record.sourceFile);const ratio=record.metadata.width/record.metadata.height;Object.assign($('stage').style,{aspectRatio:String(ratio),width:`min(100%,${Math.min(800,520*ratio)}px)`});
    applyRegion(frozenRegion244()?receiptRegion244():record.region);$('quality').value=record.quality||'standard';quoteDraft='';quoteStamp244='';detectionStamp=0;
    $('regionNotice244').textContent=frozenRegion244()?'原任务沿用已提交选区；接回或回看时不会修改原区域。':regions.canonical(record.region)?'当前整数选区：'+regionText244(draft().region):'旧选区已向外对齐到整数网格，请检查预览；旧确认价不会直接用于新处理。';
    $('price').textContent=cloud245()?'请检查整数选区预览并获取本次费用。':localPrice245();
  }
  if(record.detection){$('detection').textContent=record.detection.message;if(record.detection.region&&record.phase==='ready'&&!frozenRegion244()&&!strip245()&&record.updatedAt!==detectionStamp){applyRegion(record.detection.region,false);quoteDraft='';detectionStamp=record.updatedAt;$('regionNotice244').textContent='字幕候选已向外对齐到整数网格：'+regionText244(draft().region)+'。请检查选框。';}}
  if(cloud245()&&record.phase==='quoted'&&record.quote)showQuote245();
  $('progress').value=Math.max(0,Math.min(100,Number(record.progress)||0));status([record.message,record.error].filter(Boolean).join('\n'),!!record.error);
  if(record.resultFile){const url=params(record.resultFile);if($('result').dataset.file!==record.resultFile){$('result').src=url;$('result').dataset.file=record.resultFile;}$('resultInfo').textContent=resultText245(record);}
  else if(replaced){$('result').removeAttribute('src');delete $('result').dataset.file;}
  $('history').replaceChildren();for(const row of record.history||[]){const button=document.createElement('button');button.textContent=(row.processingMode==='local'?'本地结果':'查看历史结果')+' · '+new Date(row.createdAt*1000).toLocaleString();button.onclick=()=>{$('result').src=params(row.file);$('result').dataset.file=row.file;$('resultInfo').textContent=resultText245(row,true);};$('history').append(button);}
  paintMode245();if(active.has(record.phase)&&!settledWait245.has(record.phase))schedule();
}
function showQuote245(){
  if(regions.quoted(record.quote)){const r=regions.outward(record.quote.effectiveRegion),stamp=JSON.stringify([record.id,record.quote.quoteId,r,record.quality]);if(stamp!==quoteStamp244){applyRegion(r,false);$('quality').value=record.quality;$('regionNotice244').textContent='后台确认的整数选区：'+regionText244(r)+'。请检查此预览后再确认处理。';quoteStamp244=stamp;}quoteDraft=JSON.stringify({region:r,quality:record.quality});$('price').textContent=`${record.quote.modelName||'去字幕处理'} · ${record.quote.duration||record.metadata.duration}秒 · 本次${cost245(record.quote.estimatedPoints)} · ${regionText244(r)}。确认后才提交。`;}
  else{quoteDraft='';$('price').textContent='旧确认价没有有效的整数选区，请检查预览并重新获取费用。';$('regionNotice244').textContent='旧选区／确认价不会静默换区提交；请重新获取费用并明确确认。';}
}
function schedule(){clearTimeout(pollTimer);pollTimer=setTimeout(poll,1200);}
async function poll(){if(polling||!record)return;polling=true;const id=record.id;try{const value=await api('record?id='+id);if(record?.id===id)render(value.record);}catch(error){status('状态读取暂时失败，任务不会重新提交：'+error.message,true);schedule();}finally{polling=false;}}
async function library(){const data=await api('list');$('records').replaceChildren(new Option('选择历史记录…',''));for(const row of data.records||[])$('records').append(new Option(row.name+' · '+(row.processingMode==='local'?'本地 · ':'')+row.phase,row.id));if(record)$('records').value=record.id;}
async function run(action,body={}){if(!record||busy)return;const owner=record.id;busy=true;controls();try{const data=await api(action,{id:owner,...body});if(data.record&&record?.id===owner){const replaced=data.record.id!==owner;render(data.record,replaced);if(replaced)await library();}else if(data.message&&record?.id===owner)status(data.message);schedule();}catch(error){if(record?.id===owner)status(error.message,true);}finally{busy=false;controls();}}
async function imported(value){render(value,true);await library();if(!strip245())await run('detect');}
$('importLocal').onclick=async()=>{const bridge=window.parent?.pywebview?.api||window.pywebview?.api;if(bridge?.choose_subtitle_video242){busy=true;controls();try{const value=await bridge.choose_subtitle_video242();if(value.canceled)return;if(!value.ok)throw Error(value.error||'视频导入失败');busy=false;await imported(value.record);}catch(error){status(error.message,true);}finally{busy=false;controls();}}else $('localFile').click();};
$('localFile').onchange=async()=>{const file=$('localFile').files[0];if(!file)return;if(file.size>50*1048576){status('首版支持不超过50MB的原片，不会自动压缩。',true);return;}busy=true;controls();try{status('正在导入视频…');const response=await fetch('/api/subtitle/upload',{method:'POST',headers:{'X-Filename':encodeURIComponent(file.name),'Content-Type':file.type||'application/octet-stream'},body:file});const value=await response.json();if(!response.ok||value.error)throw Error(value.error||'导入失败');busy=false;await imported(value.record);}catch(error){status(error.message,true);}finally{busy=false;controls();$('localFile').value='';}};
$('records').onchange=async()=>{if(!$('records').value)return;try{const data=await api('record?id='+$('records').value);render(data.record,true);}catch(error){status(error.message,true);}};
async function refreshCapabilities244(){const data=await api('capabilities');capabilities=data;$('capability').textContent=!data.configured?(data.message||'后台尚未发布可用的去字幕模型和价格，请联系管理员配置。'):data.regionSchema!==regions.SCHEMA?'后台需更新至1.3.66才能确认整数字幕选区；本地处理、字幕定位、原单接回和导出仍可使用。':`${data.modelName||'云端去字幕服务'} · 按当前整数选区确认费用。`;controls();return data;}
async function ensureCapabilities245(refresh=false){
  if(!refresh&&capabilities)return capabilities;
  if(capabilityPromise245)return capabilityPromise245;
  $('capability').textContent='正在读取云端精修服务配置…';
  capabilityPromise245=refreshCapabilities244().catch(error=>{capabilities={configured:false};$('capability').textContent='当前无法读取云端精修配置；本地模式仍可使用：'+error.message;controls();throw error;}).finally(()=>{capabilityPromise245=null;});return capabilityPromise245;
}
$('processingMode').onchange=async()=>{
  const prior=selectedMode245;selectedMode245=mode245();
  if(record){
    // Mode-specific drafts stay in the UI; switching never writes a cloud receipt.
    if(prior==='cloud')cloudDraft245={...draft(),quoteDraft,quoteStamp:quoteStamp244,newDraftOwner:newDraftOwner244};else localDraft245=draft().region;
    if(cloud245()){
      if(cloudDraft245){newDraftOwner244=cloudDraft245.newDraftOwner;applyRegion(cloudDraft245.region,frozenRegion244());$('quality').value=cloudDraft245.quality;quoteDraft=cloudDraft245.quoteDraft;quoteStamp244=cloudDraft245.quoteStamp;$('price').textContent=quoteDraft&&record.quote?`${record.quote.modelName||'云端精修'} · 本次${cost245(record.quote.estimatedPoints)}。确认后才提交。`:'请检查整数选区预览并获取本次费用。';}
      else if(record.requestId){newDraftOwner244='';applyRegion(receiptRegion244(),true);$('quality').value=record.quality||'standard';quoteDraft='';quoteStamp244='';}
      else if(record.phase==='quoted'&&record.quote){quoteStamp244='';showQuote245();}
      else{$('price').textContent='请检查整数选区预览并获取本次费用。';quoteDraft='';}
      $('regionNotice244').textContent=frozenRegion244()?'原任务沿用已提交选区；切换本地模式不会修改原区域。':'当前整数选区：'+regionText244(draft().region);
    }else{
      applyRegion(localDraft245||draft().region,false);quoteDraft='';$('regionNotice244').textContent=strip245()?'独立字幕轨处理不使用选区，原选框保留。':'当前整数选区：'+regionText244(draft().region)+'。本地处理另建记录，不改原云端订单。';
    }
  }
  paintMode245();if(cloud245())try{await ensureCapabilities245();}catch(error){status(error.message,true);}
};
$('refresh').onclick=()=>Promise.all([library(),...(cloud245()?[ensureCapabilities245(true)]:[])]).catch(error=>status(error.message,true));
$('detect').onclick=()=>run('detect');
$('quote').onclick=()=>{if(!cloud245())return;try{applyRegion(draft().region,false);if(schemaReady244())run('quote',draft());}catch(error){status(error.message,true);}};
$('submit').onclick=async()=>{if(!cloud245()||busy||!schemaReady244()||!regions.quoted(record?.quote)||quoteDraft!==JSON.stringify(draft()))return;const original=record.id,quote=record.quote.quoteId,confirmedDraft=JSON.stringify(draft());const yes=await confirmProcessing(`本次云端去字幕预计 ${record.quote.estimatedPoints} 积分。选区：${regionText244(draft().region)}。只处理此区域，原片保留。确定开始？`);if(yes&&cloud245()&&record?.id===original&&record.quote?.quoteId===quote&&confirmedDraft===JSON.stringify(draft())&&schemaReady244())run('submit',{...draft(),quoteId:quote,confirmed:true});};
$('localStart245').onclick=async()=>{
  if(!record||cloud245()||busy||working245())return;
  try{
    const selected=mode245();if(!strip245())applyRegion(draft().region,false);
    const owner=record.id,area={...draft().region},snapshot=JSON.stringify(area),mode=strip245()?'strip':'repair';
    const message=mode==='strip'?'仅移除视频里的独立字幕轨，不会擦除烧进画面的文字。本地处理，不上传、不扣积分；原片保留，另存新视频。开始处理？':`本地免费修补选区：${regionText244(area)}。仅修补识别到的浅色字幕笔画，可能留下模糊或涂抹痕迹，不能还原真实背景。不上传、不扣积分，原片保留。开始处理？`;
    const yes=await confirmProcessing(message);
    if(yes&&record?.id===owner&&mode245()===selected&&(!strip245()?JSON.stringify(draft().region)===snapshot:true)&&!working245())await run('local-start',{mode,...(mode==='repair'?{region:area}:{}),confirmed:true});
  }catch(error){status(error.message,true);}
};
$('resume').onclick=()=>run('resume');$('stop').onclick=()=>run(localJob245()?'local-stop':'stop');$('quality').onchange=()=>changed(false);for(const k of fields)$('region'+k).oninput=()=>changed(true);
$('newDraft244').onclick=()=>{if(!record||busy||active.has(record.phase)||!cloud245())return;try{const next=regions.outward(draft().region);newDraftOwner244=record.id+':'+record.requestId;applyRegion(next,false);quoteDraft='';quoteStamp244='';$('regionNotice244').textContent='已建立新的整数选区草稿：'+regionText244(draft().region)+'。原单记录保留，请检查预览并重新获取费用。';$('price').textContent='新选区尚未确认费用，旧确认价不会用于本次处理。';controls();}catch(error){status('原任务选区保持不变：'+error.message,true);}};
$('download').onclick=async()=>{if(!record?.resultFile)return;const url=params($('result').dataset.file||record.resultFile)+'&download=1';const bridge=window.parent?.pywebview?.api||window.pywebview?.api;try{if(bridge?.save_download){const value=await bridge.save_download(url,record.name.replace(/\.[^.]+$/,'')+'-去字幕.mp4','workflow');if(value?.error)throw Error(value.error);}else{const a=document.createElement('a');a.href=url;a.download='去字幕视频.mp4';a.click();}}catch(error){status(error.message,true);}};
$('projects').onchange=async()=>{try{const data=await api('existing?projectId='+encodeURIComponent($('projects').value));$('existing').replaceChildren(new Option('选择已生成视频…',''));for(const row of data.videos||[])$('existing').append(new Option(row.name,row.file));}catch(error){status(error.message,true);}controls();};$('existing').onchange=controls;
$('importExisting').onclick=async()=>{busy=true;controls();try{const data=await api('import-existing',{projectId:$('projects').value,file:$('existing').value});busy=false;await imported(data.record);}catch(error){status(error.message,true);}finally{busy=false;controls();}};
$('selection').onpointerdown=event=>{if(!record||busy||confirming245||working245()||strip245()||frozenRegion244()||!validRegion())return;event.preventDefault();drag={x:event.clientX,y:event.clientY,resize:event.target.id==='resize',region:{...draft().region}};$('selection').setPointerCapture(event.pointerId);};
$('selection').onpointermove=event=>{if(!drag)return;const size=$('stage').getBoundingClientRect(),dx=(event.clientX-drag.x)/size.width*100,dy=(event.clientY-drag.y)/size.height*100,r=drag.resize?regions.resize(drag.region,dx,dy):regions.move(drag.region,dx,dy);applyRegion(r,false);changed(false);$('regionNotice244').textContent='当前整数选区：'+regionText244(r);};$('selection').onpointerup=$('selection').onpointercancel=()=>{drag=null;};
Promise.allSettled([library(),api('projects').then(data=>{for(const row of data.projects||[])$('projects').append(new Option(row.projectName,row.id));})]).then(values=>{for(const value of values)if(value.status==='rejected')status(value.reason.message,true);});
paintMode245();window.SubtitleRemoval242={draft,render,validRegion,paintRegion};
})();

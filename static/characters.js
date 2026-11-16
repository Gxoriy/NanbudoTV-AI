(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const media = (kind,id) => '/api/characters/media?' + new URLSearchParams({kind,id});
  const voiceType=voice=>voice.source==='system'?'系统音色':voice.source==='clone'?'已克隆音色':'录音样本';
  const voiceAvailability=voice=>voice.synthesisReady?'可合成新台词':voice.source==='system'?'已收藏 · 合成服务待配置':'录音样本 · 不是合成音色';
  const hasVoiceSample=voice=>!!voice.file||voice.hasSample===true;
  let library={images:[],voices:[],characters:[]},tab='characters',editing='',busy=false;
  let models=[],generationBusy=false,pollTimer=null,pollingId='',started=0;
  let micStream=null,recorder=null,micPending=false,micRecording=false,micStopping=false,recordingRequest=0,recordingDiscard=false;
  let recordedBlob=null,recordedUrl='',recordedDuration=0,recordChunks=[],recordingStarted=0,recordingTimer=null,recordingLimit=null,recordSaveBusy=false;
  let audioContext=null,analyser=null,waveFrame=null,mobileSession=null,mobileTimer=null,mobileBusy=false,mobileReadBusy=false,mobileOperation=0;
  let mobileAddressIndex=0,mobileDiagnosticBusy=false;
  let libraryReloadOperation=0;
  let voiceSaveCloseReady=false;
  const voiceSaveHandoffs=new WeakSet();
  const MOBILE_LIBRARY_RETRIES=4;
  $('characterName').closest('label').insertAdjacentHTML('afterend','<div class="pair"><label>对白语言<input id="characterLanguage260" maxlength="40" list="characterLanguages260" value="中文"><datalist id="characterLanguages260"><option>中文</option><option>英语</option><option>日语</option><option>俄语</option><option>德语</option><option>法语</option><option>粤语</option></datalist></label><label>口音 / 方言<input id="characterAccent260" maxlength="40" value="普通话" placeholder="普通话、川普、美式英语等"></label></div><div class="pair"><label>声音表达<input id="characterTimbre260" maxlength="80" placeholder="例如：温和、沉稳；这不是克隆音色"></label><label>原图构图（按实际图片标注）<select id="characterFraming260"><option value="unknown">未标注 / 不确定</option><option value="upper-body">原图为半身</option><option value="full-body">原图完整全身（头脚齐全）</option></select></label></div><small>全身预览按原图完整显示；标注不会替半身照片补出腿。真实音色仍需选择系统或授权克隆音色。</small>');
  function metadata260(row={}){const profile=row.speechProfile||{};$('characterLanguage260').value=profile.language||'中文';$('characterAccent260').value=profile.accent??'普通话';$('characterTimbre260').value=profile.timbre||'';$('characterFraming260').value=row.imageFraming||'unknown';}
  const fullBody260=document.createElement('button');fullBody260.id='generateFullBody260';fullBody260.type='button';fullBody260.textContent='准备全身形象 · 生成前另行确认费用';$('generationPanel').querySelector('.image-examples').append(fullBody260);
  fullBody260.onclick=()=>{const image=library.images.find(row=>row.id===$('imageSelect').value);$('imageName').value=$('imageName').value||image?.name||'全身数字人';const text=$('imageDescription').value.trim(),rule=' 单人完整全身形象，头顶、双手、双腿与鞋脚完整入镜，人物四周留出空间，不裁切身体；保持所选人物身份和服装设计。';if(text.length+rule.length>4000){status('形象描述过长，请精简后再添加全身要求。',true);return;}$('imageDescription').value=text+rule;$('useImageReference').checked=!!image;$('generationPanel').hidden=false;generationControls();status('已准备全身要求。请核对模型和费用，再点击确认价格并生成；没有自动调用模型。');$('generationPanel').scrollIntoView({block:'start'});};
  const status = (text,error=false) => {window.ModelActivity?ModelActivity.text($('status'),text,error):$('status').textContent=text;};
  function notifyCharacterLibrary(){try{localStorage.setItem('dramaCharacterLibraryRevision',Date.now()+':'+Math.random());}catch(_){}if(window.parent!==window)window.parent.postMessage({type:'character-library-changed'},location.origin);}
  const safe = fn => async (...args) => {try {await fn(...args);} catch(error) {status(error.message,true);}};
  async function api(path,body,headers){const response=await fetch(path,{cache:'no-store',...(body===undefined?{}:{method:'POST',headers:headers || {'Content-Type':'application/json'},body:headers?body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw new Error(data.error || '操作未完成');return data;}
  function preview(){const image=library.images.find(row=>row.id===$('imageSelect').value),voice=library.voices.find(row=>row.id===$('voiceSelect').value);
    $('portrait').innerHTML=image?`<img src="${media('images',image.id)}" alt="${esc(image.name)}">`:`<div class="portrait-placeholder"><svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><circle cx="40" cy="40" r="36" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="29" r="11" stroke="currentColor" stroke-width="2"/><path d="M20 60c2-14 10-20 20-20s18 6 20 20" stroke="currentColor" stroke-width="2"/></svg><b>${library.images.length?'请选择人物形象':'先创建你的第一位数字人'}</b><p>${library.images.length?'从右侧选择已有形象，或创建新的形象。':'这里目前没有人物照片。生成或上传后，真实形象会显示在这里。'}</p><button class="gold" data-empty-action="generate">✦ AI创建形象</button><button data-empty-action="upload">＋ 上传自己的照片</button><small>这是创建入口，不是已生成的人物。</small></div>`;
    $('voicePreview').innerHTML=voice?`<span class="voice-type">${voiceType(voice)}</span> <b>${esc(voice.name)}</b>${hasVoiceSample(voice)?` · ${(Number(voice.duration)||0).toFixed(1)}秒样音<br><audio controls preload="none" src="${media('voices',voice.id)}"></audio>`:voice.synthesisReady?'<p>可用于合成新台词；请在“音色大厅 / 克隆”中生成试听或配音。</p>':voice.source==='system'?'<p>已免费收藏，可以搭配形象保存角色卡。合成新台词需管理员配置声音服务；不影响收藏与组合。</p>':'<p>此记录没有可播放的录音样本。</p>'}`:`<div class="voice-empty"><b>${library.voices.length?'选择一种声音，或稍后再绑定':'还没有声音，先选一种或录制你自己的'}</b><p>可以先保存只有形象的角色卡，之后自由搭配声音。</p><div class="actions"><button class="gold" data-empty-action="voices">♫ 去音色大厅选择</button><button data-empty-action="record">● 录制我的音色</button></div></div>`;
    $('characterStepImage').classList.toggle('complete',!!image);$('characterStepVoice').classList.toggle('complete',!!voice);
    $('combine').disabled=busy || !image;
    $('uploadImage').disabled=busy;$('uploadVoice').disabled=busy;
    recordingControls();
    generationControls();
  }
  function render(){const image=$('imageSelect').value,voice=$('voiceSelect').value;
    $('imageSelect').innerHTML=`<option value="">${library.images.length?'选择人物形象（已有'+library.images.length+'个）':'尚无形象，请先生成或上传'}</option>`+library.images.map(row=>`<option value="${row.id}">${esc(row.name)}</option>`).join('');
    $('voiceSelect').innerHTML=`<option value="">${library.voices.length?'暂不绑定声音':'尚无声音，请去大厅选择或录制'}</option>`+library.voices.map(row=>`<option value="${row.id}">${esc(row.name)} · ${voiceType(row)}</option>`).join('');
    $('imageSelect').disabled=!library.images.length;$('voiceSelect').disabled=!library.voices.length;
    if(library.images.some(row=>row.id===image))$('imageSelect').value=image;
    if(library.voices.some(row=>row.id===voice))$('voiceSelect').value=voice;
    $('voiceService').textContent='真实声音合成、音色大厅与授权克隆，请打开顶部“音色大厅 / 克隆”。上传或录制的样本可试听与组合，但上传本身不是音色克隆。';
    document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
    const query=$('search').value.trim().toLowerCase(),rows=library[tab].filter(row=>row.name.toLowerCase().includes(query));
    $('assets').innerHTML=rows.map(row=>{const image=tab==='characters'?library.images.find(i=>i.id===row.imageId):tab==='images'?row:null;
      const voice=tab==='characters'?library.voices.find(i=>i.id===row.voiceId):tab==='voices'?row:null;
      return `<article class="card" data-id="${row.id}"><input class="select" type="checkbox" aria-label="选择${esc(row.name)}">${image?`<img src="${media('images',image.id)}" alt="${esc(row.name)}" data-view="${image.id}">`:'<div class="voice-icon">♫</div>'}<div class="info"><h3>${esc(row.name)}</h3><small>${tab==='characters'?`${image?'形象已绑定':'形象已移除'} · ${voice?'已搭配'+voiceType(voice):'未绑定声音'}`:tab==='images'?'形象素材 · 可用于视频人物参考':`${voiceType(row)} · ${voiceAvailability(row)}`}</small>${voice&&hasVoiceSample(voice)?`<audio controls preload="none" src="${media('voices',voice.id)}"></audio>`:''}<small>${new Date(row.createdAt*1000).toLocaleString('zh-CN')}</small><div class="actions"><button data-action="use">${tab==='characters'?'编辑组合':'用于组合'}</button><button data-action="rename">重命名</button><button data-action="remove">移除</button>${tab==='characters'&&row.available?'<span class="badge">画布 / 元素替换 / 工作流可选形象</span>':''}</div></div></article>`;
    }).join('') || `<div class="empty">${query?'没有匹配的记录。':tab==='characters'?'选取形象和声音，在上方保存第一张角色卡。':tab==='images'?'上传清晰人物照片，缩略图会显示在这里。':'上传获授权的声音录音，即可播放试听、命名和搭配。'}</div>`;
    preview();
  }
  async function reload(current=()=>true,observeGeneration=true){
    const operation=++libraryReloadOperation,isCurrent=typeof current==='function'?current:()=>true;let next;
    try{next=await api('/api/characters/library');}catch(error){if(operation!==libraryReloadOperation||!isCurrent())return false;throw error;}
    if(operation!==libraryReloadOperation||!isCurrent())return false;
    library=next;render();if(library.generation){$('generationPanel').hidden=false;started=library.generation.createdAt;if(observeGeneration&&library.taskId&&pollingId!==library.taskId){pollingId=library.taskId;await pollImage(library.taskId);}}return true;
  }
  function imageCost(){return models.find(row=>row.model===$('imageModel').value)?.resolutions.find(row=>row.resolution===$('imageResolution').value)?.points ?? null;}
  const liveImage236=()=>models.find(row=>row.model===$('imageModel').value)?.pricingMode==='live_quote';
  function quoteFields236(q){
    const points=Number(q?.estimatedPoints);if(!Number.isFinite(points)||points<=0)throw Error('未取得有效报价，未提交生成。');
    if(q.pricingMode!=='live_quote')return {expectedPoints:points,expectedCredits:points};
    const expiry=typeof q.expiresAt==='number'?q.expiresAt*(q.expiresAt<1e12?1000:1):Date.parse(q.expiresAt);
    if(!q.priceQuoteId||!q.priceInputsHash||!Number.isFinite(expiry)||expiry<=Date.now())throw Error('实时报价已失效，请重新核价并确认；未提交生成。');
    return {priceQuoteId:q.priceQuoteId,priceInputsHash:q.priceInputsHash,expectedPoints:points,expectedCredits:points,billingConfirmed:true};
  }
  const quoteText236=q=>q.pricingMode==='live_quote'?`实时核价 · 本次 ${q.estimatedPoints} 积分 · 报价有效至 ${new Date(typeof q.expiresAt==='number'?q.expiresAt*(q.expiresAt<1e12?1000:1):q.expiresAt).toLocaleTimeString('zh-CN',{hour12:false})}${q.upstreamEstimateOnly?'\n上游估价；本次确认积分固定。':''}`:`本次 ${q.estimatedPoints} 积分`;
  const imageDescriptionText=()=>$('imageDescription').value.trim()||$('imageName').value.trim();
  function generationControls(){const pending=!!library.generation,name=$('imageName').value.trim(),details=$('imageDescription').value.trim();
    $('generateImage').disabled=generationBusy||pending||!name||imageDescriptionText().length<4||!liveImage236()&&!imageCost();
    $('generateImage').textContent=generationBusy||pending?'生成形象':!name&&!details?'先填写形象名称与描述':!name?'先填写形象名称':imageDescriptionText().length<4?'名称或描述至少填写4个字':details?'确认价格并生成形象':'按名称描述生成形象';
    $('imageInputHint').textContent=name&&!details?`未填写详细描述时，将按名称“${name}”生成；建议补充外貌、服装与风格。不会自动猜测更多人设。`:'请填写形象名称或简短人设；详细描述可选。快捷标签只是描述示例，仍需真实调用图片模型才会生成形象。';
    $('observeImage').hidden=!pending;$('observeImage').disabled=generationBusy;
    $('imageProgress').classList.toggle('working',generationBusy);
    window.ModelActivity?.set($('generateImage'),{state:generationBusy||pending?'pending':'',preserve:true});
    $('imagePrice').textContent=liveImage236()?'实时核价 · 按本次描述和参考人物取得报价后确认':imageCost()?`每张 ${imageCost()} 积分 · ${$('imageResolution').value.toUpperCase()}`:'尚未发布可用图片模型及价格';
    CreditGate.recalculate();
  }
  function modelChanged(){const selected=models.find(row=>row.model===$('imageModel').value),resolution=$('imageResolution').value;
    $('imageResolution').innerHTML=(selected?.resolutions||[]).map(row=>`<option value="${row.resolution}">${row.resolution.toUpperCase()}</option>`).join('');
    if(selected?.resolutions.some(row=>row.resolution===resolution))$('imageResolution').value=resolution;
    generationControls();
  }
  async function loadModels(){const current=$('imageModel').value;models=(await api('/api/characters/image-models')).models;
    $('imageModel').innerHTML=models.map(row=>`<option value="${esc(row.model)}">${esc(row.displayName||'已发布图片模型')}</option>`).join('');
    if(models.some(row=>row.model===current))$('imageModel').value=current;modelChanged();
  }
  async function pollImage(taskId){clearTimeout(pollTimer);pollTimer=null;generationBusy=true;generationControls();
    try{const response=await api('/api/tasks/'+taskId),task=response.task||response;
      started=Number(task.startedAt||task.createdAt)||started;
      window.ModelActivity?.task($('imageProgress'),task,{success:'形象已生成'});
      if(['queued','running'].includes(task.state)){pollTimer=setTimeout(()=>pollImage(taskId),1800);return;}
      generationBusy=false;library=await api('/api/characters/library');render();await CreditGate.refresh();
      if(task.state==='done'&&task.result?.imageId){tab='images';render();$('imageSelect').value=task.result.imageId;preview();status('形象已生成，可放大验收并保存角色卡。');}
    }catch(error){generationBusy=false;library=await api('/api/characters/library').catch(()=>library);window.ModelActivity?.text($('imageProgress'),error.message+'；原请求保留，可查询原任务。',true);generationControls();}
  }
  $('openGeneration').onclick=safe(async()=>{$('generationPanel').hidden=false;await loadModels();});$('closeGeneration').onclick=()=>{$('generationPanel').hidden=true;};
  $('imageModel').onchange=modelChanged;$('imageResolution').onchange=generationControls;
  $('imageName').oninput=generationControls;$('imageDescription').oninput=generationControls;
  $('generateImage').onclick=safe(async()=>{if(generationBusy||library.generation)return;generationBusy=true;generationControls();
    try{const payload={name:$('imageName').value,description:imageDescriptionText(),model:$('imageModel').value,resolution:$('imageResolution').value,referenceId:$('useImageReference').checked?$('imageSelect').value:'',rightsConfirmed:true};
      if($('useImageReference').checked&&!payload.referenceId)throw new Error('请先在下方选择一张人物形象。');
      const view=JSON.stringify(payload),current=()=>JSON.stringify({name:$('imageName').value,description:imageDescriptionText(),model:$('imageModel').value,resolution:$('imageResolution').value,referenceId:$('useImageReference').checked?$('imageSelect').value:'',rightsConfirmed:true});
      const plan=await api('/api/characters/quote',payload);quoteFields236(plan.quote);await CreditGate.ensure(plan.quote.estimatedPoints);
      if(view!==current())throw Error('核价期间输入、模型或参考人物已改变，请重新核价。');
      $('imagePrice').textContent=quoteText236(plan.quote);
      if(!await studioConfirm(`使用“${plan.modelName}”生成形象，${plan.resolution.toUpperCase()}，${quoteText236(plan.quote)}。请确认拥有描述及参考人物的授权；确认开始？`))return;
      if(view!==current())throw Error('确认期间输入、模型或参考人物已改变；未提交生成。');
      window.ModelActivity?.set($('imageProgress'),{state:'pending',message:''});
      const result=await api('/api/characters/generate',{...payload,billingConfirmed:true,...quoteFields236(plan.quote)});
      library=await api('/api/characters/library');pollingId=result.taskId;started=Date.now()/1000;await pollImage(result.taskId);
    }finally{if(!pollTimer){generationBusy=false;generationControls();}}
  });
  $('observeImage').onclick=safe(async()=>{if(generationBusy)return;generationBusy=true;generationControls();try{const result=await api('/api/characters/observe',{});pollingId=result.taskId;await pollImage(result.taskId);}finally{if(!pollTimer){generationBusy=false;generationControls();}}});
  async function upload(kind,file){if(!file)return;const limit=(kind==='images'?12:16)*1024*1024;if(file.size>limit)throw new Error('文件太大，请先压缩或裁剪。');
    if(!await studioConfirm(kind==='voices'?'确认你拥有这段录音及人物声音的使用授权？导入后可试听和组合，不会自动克隆声音或扣费。':'确认拥有这张形象的使用权及肖像授权？导入与管理不扣积分。'))return;
    busy=true;preview();try{const data=await api('/api/characters/upload',file,{'X-Asset-Kind':kind,'X-Asset-Name':encodeURIComponent(file.name.replace(/\.[^.]+$/,'')),'X-Rights-Confirmed':'1','Content-Type':'application/octet-stream'});library=data.library;render();$(kind==='images'?'imageSelect':'voiceSelect').value=data.asset.id;preview();status('素材已导入本机，可试听或保存组合。');return data;}finally{busy=false;preview();}
  }
  const recordingClock=seconds=>{const value=Math.max(0,Math.floor(seconds));return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');};
  function recordingControls(){
    $('startRecording').disabled=busy||micPending||micRecording||micStopping||recordSaveBusy;
    $('stopRecording').disabled=!micRecording;
    $('discardRecording').disabled=!recordedBlob&&!micRecording&&!micPending;
    $('saveRecording').disabled=busy||recordSaveBusy||micPending||micRecording||micStopping||!recordedBlob||recordedDuration<2;
    $('createRecordingCode').disabled=mobileBusy||!!(mobileSession?.state==='waiting'&&mobileSession.expiresAt>Date.now()/1000&&mobileSession.lanReady!==false);
    $('refreshRecordingCode').disabled=mobileBusy||!mobileSession||mobileSession.state==='received'||mobileSession.inFlight;
    $('diagnosePhoneConnection').disabled=mobileBusy||mobileDiagnosticBusy||!mobileSession;
    $('copyPhoneLink').disabled=mobileBusy||!phoneOptions().length||mobileSession?.state!=='waiting'||mobileSession.expiresAt<=Date.now()/1000;
    $('phoneAddressSelect').disabled=mobileBusy||phoneOptions().length<2||mobileSession?.state!=='waiting';
    $('startRecording').textContent=micPending?'正在请求麦克风…':recordedBlob?'● 重新录制':'● 开始录音';
    $('computerRecording').querySelector('.mic-stage').classList.toggle('recording',micRecording);
  }
  function wave(){
    const canvas=$('recordingWave'),context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.strokeStyle=micRecording?'#ffd077':'#707c80';context.lineWidth=2;context.beginPath();
    const values=new Uint8Array(analyser?.fftSize||64);if(analyser)analyser.getByteTimeDomainData(values);else values.fill(128);
    for(let index=0;index<values.length;index++){const x=index*canvas.width/(values.length-1),y=canvas.height/2+(values[index]-128)/128*canvas.height*.45;index?context.lineTo(x,y):context.moveTo(x,y);}
    context.stroke();if(micRecording)waveFrame=requestAnimationFrame(wave);
  }
  function releaseMicrophone(){
    clearInterval(recordingTimer);clearTimeout(recordingLimit);recordingTimer=recordingLimit=null;
    if(waveFrame)cancelAnimationFrame(waveFrame);waveFrame=null;
    micStream?.getTracks().forEach(track=>track.stop());micStream=null;
    if(audioContext)audioContext.close().catch(()=>{});audioContext=analyser=null;
  }
  function clearRecordedSample(){
    $('recordingPreview').pause();$('recordingPreview').removeAttribute('src');$('recordingPreview').hidden=true;
    if(recordedUrl)URL.revokeObjectURL(recordedUrl);recordedUrl='';recordedBlob=null;recordedDuration=0;
  }
  function stopRecording(discard=false){
    recordingDiscard=discard;recordingRequest++;
    if(recorder?.state==='recording'){micStopping=true;recordedDuration=Math.min(30,(Date.now()-recordingStarted)/1000);recorder.stop();}
    micPending=false;micRecording=false;releaseMicrophone();
    if(discard){clearRecordedSample();$('recordingPhase').textContent='准备录音';$('recordingHint').textContent='未保存的录音已放弃；点击开始重新录制。';$('recordingClock').textContent='00:00 / 00:30';}
    wave();recordingControls();
  }
  async function startRecording(){
    if(busy||micPending||micRecording||micStopping||recordSaveBusy)return;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('recordingHint').textContent='此环境不能使用浏览器麦克风，请使用音频上传或手机扫码录音。';return;}
    micPending=true;const request=++recordingRequest;recordingControls();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(request!==recordingRequest||$('recordingPanel').hidden||$('computerRecording').hidden){stream.getTracks().forEach(track=>track.stop());return;}
      micStream=stream;clearRecordedSample();recordChunks=[];recordingDiscard=false;
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
      const current=new MediaRecorder(stream,mime?{mimeType:mime}:{});recorder=current;
      current.ondataavailable=event=>{if(event.data.size){recordChunks.push(event.data);if(recordChunks.reduce((size,chunk)=>size+chunk.size,0)>16*1024*1024){stopRecording(true);$('recordingHint').textContent='录音数据超过16MB，已停止并放弃，请重新录制较短样本。';}}};
      current.onstop=()=>{
        if(micRecording)recordedDuration=Math.min(30,(Date.now()-recordingStarted)/1000);
        releaseMicrophone();micRecording=micStopping=false;$('recordingClock').textContent=recordingClock(recordedDuration)+' / 00:30';
        if(!recordingDiscard&&recordChunks.length){recordedBlob=new Blob(recordChunks,{type:current.mimeType||'audio/webm'});recordedUrl=URL.createObjectURL(recordedBlob);$('recordingPreview').src=recordedUrl;$('recordingPreview').hidden=false;$('recordingPhase').textContent='录音已准备';$('recordingHint').textContent=recordedDuration<2?'录音少于2秒，请重新录制；建议10–30秒。':'先试听，再点击保存；保存前会确认使用授权，不会自动克隆或扣费。';}
        recordChunks=[];if(recorder===current)recorder=null;wave();recordingControls();
      };
      current.onerror=()=>{stopRecording(true);$('recordingHint').textContent='录音中断，请检查麦克风设备，或改为上传音频。';};
      current.start(250);micRecording=true;recordingStarted=Date.now();recordedDuration=0;
      $('recordingPhase').textContent='正在录音';$('recordingHint').textContent='请自然说话，30秒后自动停止。声音只在本机缓存，保存后才进入样本库。';$('recordingClock').textContent='00:00 / 00:30';
      recordingTimer=setInterval(()=>{$('recordingClock').textContent=recordingClock(Math.min(30,(Date.now()-recordingStarted)/1000))+' / 00:30';},250);
      recordingLimit=setTimeout(()=>stopRecording(),30000);
      try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audioContext=new Audio();audioContext.resume().catch(()=>{});analyser=audioContext.createAnalyser();analyser.fftSize=256;audioContext.createMediaStreamSource(stream).connect(analyser);}}catch{audioContext?.close().catch(()=>{});audioContext=analyser=null;}
      wave();
    }catch(error){releaseMicrophone();$('recordingPhase').textContent='麦克风未就绪';$('recordingHint').textContent=error.name==='NotAllowedError'?'麦克风权限未允许。请在系统或浏览器设置中允许权限，也可以使用上传 / 手机录音。':error.name==='NotFoundError'?'没有找到麦克风。请连接设备，或使用上传 / 手机录音。':'无法开始录音，请检查设备与权限，或改为上传音频。';}
    finally{if(request===recordingRequest)micPending=false;recordingControls();}
  }
  function mobileRemaining(){if(!mobileSession)return;const left=Math.max(0,mobileSession.expiresAt-Date.now()/1000);$('phoneRecordingClock').textContent=mobileSession.state==='waiting'?'接收码剩余 '+recordingClock(left):mobileSession.state==='received'?'录音已收到':'接收码已过期';recordingControls();}
  function mobileNeedsPolling(){return mobileSession&&(mobileSession.state==='waiting'||mobileSession.state==='received'&&mobileSession.assetId&&!mobileSession.assetImported&&(mobileSession.libraryRefreshAttempts||0)<MOBILE_LIBRARY_RETRIES);}
  async function pollMobile(){
    clearTimeout(mobileTimer);mobileTimer=null;
    if(!mobileNeedsPolling()||mobileBusy||$('recordingPanel').hidden||$('phoneRecording').hidden)return;
    if(mobileReadBusy){mobileTimer=setTimeout(pollMobile,2000);return;}
    mobileReadBusy=true;const operation=mobileOperation,id=mobileSession.id;
    try{let receipt=mobileSession;
      if(mobileSession.state==='waiting'){const data=await api('/api/characters/recording-session?'+new URLSearchParams({id}));receipt=data.session||data;}
      if(operation!==mobileOperation||mobileSession?.id!==id)return;
      mobileSession={...mobileSession,...receipt};mobileRemaining();
      if(receipt.state==='received'){
        mobileSession.libraryRefreshAttempts=(mobileSession.libraryRefreshAttempts||0)+1;
        await reload(()=>operation===mobileOperation&&mobileSession?.id===id&&!$('recordingPanel').hidden&&!$('phoneRecording').hidden);if(operation!==mobileOperation||mobileSession?.id!==id)return;
        if(!library.voices.some(voice=>voice.id===receipt.assetId))throw new Error('录音已收到，样本记录暂未刷新，请点击更新记录。');
        mobileSession.assetImported=true;tab='voices';render();$('voiceSelect').value=receipt.assetId;preview();$('phoneCode').textContent='录音已收到 ✓';$('phoneRecordingLinks').textContent='';$('phoneRecordingStatus').textContent='声音已自动导入并选中，可在下方试听、命名或搭配角色。接收码已失效。';status('手机录音已自动回到电脑；已选中这条音色样本，不会自动克隆或扣费。');
      }else if(receipt.state==='expired'){$('phoneCode').textContent='接收码已过期';$('phoneRecordingLinks').textContent='';$('phoneRecordingStatus').textContent='请重新生成接收码。不会自动扣费或重发录音。';}
      else $('phoneRecordingStatus').textContent=receipt.inFlight?'正在接收录音，请勿重复发送…':receipt.phoneConnected?'手机已连接，请在手机上发送录音；电脑会自动接收。':'等待手机发送录音。发送后这里会自动显示，并选中声音样本。';
    }catch(error){if(operation===mobileOperation)$('phoneRecordingStatus').textContent=mobileSession?.state==='received'?`录音已经收到，正在恢复样本显示（${mobileSession.libraryRefreshAttempts||0}/${MOBILE_LIBRARY_RETRIES}）。不会重传、克隆或扣费。${mobileNeedsPolling()?'':' 请点击更新记录，或重新打开录音面板。'}`:error.message+'；不会自动上传或调用付费模型。';}
    finally{mobileReadBusy=false;if(operation===mobileOperation&&mobileNeedsPolling()&&!$('recordingPanel').hidden&&!$('phoneRecording').hidden)mobileTimer=setTimeout(pollMobile,2000);}
  }
  function recordingTab(phone){
    if(phone)stopRecording(true);$('computerRecording').hidden=phone;$('phoneRecording').hidden=!phone;
    $('recordComputer').classList.toggle('active',!phone);$('recordPhone').classList.toggle('active',phone);$('recordComputer').setAttribute('aria-pressed',String(!phone));$('recordPhone').setAttribute('aria-pressed',String(phone));
    mobileOperation++;clearTimeout(mobileTimer);mobileTimer=null;if(phone){if(mobileSession?.state==='received'&&!mobileSession.assetImported)mobileSession.libraryRefreshAttempts=0;pollMobile();}
  }
  $('openRecording').onclick=()=>{$('recordingPanel').hidden=false;wave();if(!$('phoneRecording').hidden){if(mobileSession?.state==='received'&&!mobileSession.assetImported)mobileSession.libraryRefreshAttempts=0;pollMobile();}};
  $('closeRecording').onclick=()=>{stopRecording(true);mobileOperation++;clearTimeout(mobileTimer);mobileTimer=null;$('recordingPanel').hidden=true;};
  $('recordComputer').onclick=()=>recordingTab(false);$('recordPhone').onclick=()=>recordingTab(true);
  $('startRecording').onclick=safe(startRecording);$('stopRecording').onclick=()=>stopRecording();$('discardRecording').onclick=()=>stopRecording(true);
  $('saveRecording').onclick=safe(async()=>{if(recordSaveBusy||!recordedBlob||micPending||micRecording||recordedDuration<2)return;recordSaveBusy=true;recordingControls();try{
    const mime=recordedBlob.type,extension=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm',name=$('recordingName').value.trim()||'现场录音样本';
    const data=await upload('voices',new File([recordedBlob],name+'.'+extension,{type:mime}));
    if(data){tab='voices';render();$('voiceSelect').value=data.asset.id;preview();clearRecordedSample();$('recordingPhase').textContent='录音已保存';$('recordingHint').textContent='声音已保存并选中，可在音色样本库试听和搭配角色。';status('现场录音已保存到音色样本库；可以试听和组合，不等于已克隆音色。');}
  }finally{recordSaveBusy=false;recordingControls();}});
  function phoneOptions(){if(!mobileSession||mobileSession.state!=='waiting'||mobileSession.lanReady===false)return [];return mobileSession.qrOptions?.length?mobileSession.qrOptions:(mobileSession.urls||[]).map((url,index)=>({url,label:url,qrData:index===0?mobileSession.qrData:''}));}
  function renderPhoneCode(){
    const options=phoneOptions();mobileAddressIndex=Math.min(mobileAddressIndex,Math.max(0,options.length-1));
    $('phoneAddressSelect').innerHTML=options.map((row,index)=>`<option value="${index}">${esc(row.label||row.address||new URL(row.url).hostname)}${row.preferred?' · 推荐':''}</option>`).join('');$('phoneAddressSelect').value=String(mobileAddressIndex);
    $('phoneCode').textContent='';$('phoneRecordingLinks').textContent='';const row=options[mobileAddressIndex];
    if(!row)$('phoneCode').textContent='未检测到局域网地址，请连接家庭 / 办公网络，或导入手机录音。';
    else if(row.qrData?.startsWith('data:image/svg+xml;base64,')){const image=document.createElement('img');image.src=row.qrData;image.alt='手机音色录音接收二维码';$('phoneCode').append(image);}
    else $('phoneCode').textContent='二维码组件不可用，请复制下方链接到手机浏览器。';
    if(row){const link=document.createElement('a');link.href=row.url;link.textContent=row.url;link.target='_blank';link.rel='noopener noreferrer';link.title='仅供同一局域网手机打开，含临时接收凭证，请勿分享';$('phoneRecordingLinks').append(link);}
    recordingControls();
  }
  async function createPhoneCode(refresh=false){if(mobileBusy)return;mobileBusy=true;const operation=++mobileOperation;clearTimeout(mobileTimer);mobileTimer=null;recordingControls();try{
    if(refresh&&mobileSession?.state==='waiting'){
      const previous=mobileSession;await api('/api/characters/recording-session/cancel',{id:previous.id});
      if(mobileSession?.id===previous.id){mobileSession={...previous,state:'expired',qrOptions:[],urls:[],qrData:''};$('phoneCode').textContent='旧接收码已失效';$('phoneRecordingLinks').textContent='';$('phoneAddressSelect').innerHTML='';mobileRemaining();}
    }
    if(operation!==mobileOperation||$('recordingPanel').hidden||$('phoneRecording').hidden)return;
    const data=await api('/api/characters/recording-session',{}),next=data.session||data;
    if(operation!==mobileOperation||$('recordingPanel').hidden||$('phoneRecording').hidden){if(next?.id)api('/api/characters/recording-session/cancel',{id:next.id}).catch(()=>{});return;}
    mobileSession=next;
    mobileAddressIndex=0;$('phoneConnectionDiagnosis').hidden=true;renderPhoneCode();
    $('phoneRecordingStatus').textContent=mobileSession.message||'用手机扫码；录音仅在本机接收，发送后会自动进入音色样本库。';mobileRemaining();
  }catch(error){if(operation===mobileOperation)throw error;}
  finally{mobileBusy=false;recordingControls();if(operation===mobileOperation&&!$('recordingPanel').hidden&&!$('phoneRecording').hidden)pollMobile();}}
  $('createRecordingCode').onclick=safe(()=>!$('createRecordingCode').disabled&&createPhoneCode());
  $('refreshRecordingCode').onclick=safe(()=>!$('refreshRecordingCode').disabled&&createPhoneCode(true));
  $('phoneAddressSelect').onchange=()=>{mobileAddressIndex=Number($('phoneAddressSelect').value)||0;renderPhoneCode();};
  $('copyPhoneLink').onclick=safe(async()=>{const url=phoneOptions()[mobileAddressIndex]?.url;if(!url)return;try{await navigator.clipboard.writeText(url);$('phoneRecordingStatus').textContent='手机链接已复制。请仅发送给你自己的手机，并在系统浏览器打开。';}catch{await studioPrompt('复制此链接发给自己的手机，在系统浏览器打开；勿公开分享。',url);}});
  $('manualPhoneImport').onclick=()=>{status('用手机录音机录制10–30秒，通过微信文件 / USB传到电脑，再选择音频导入；无需扫码、麦克风或积分。');$('voiceFile').click();};
  $('diagnosePhoneConnection').onclick=safe(async()=>{if(mobileDiagnosticBusy||!mobileSession)return;mobileDiagnosticBusy=true;const id=mobileSession.id;recordingControls();try{
    $('phoneConnectionDiagnosis').hidden=false;$('phoneConnectionDiagnosis').textContent='正在检查电脑接收服务、局域网地址和当前程序的防火墙规则…约需15秒，只检查，不修改设置。';
    const data=await api('/api/characters/recording-diagnostics?'+new URLSearchParams({id}));if(mobileSession?.id!==id)return;
    mobileSession.phoneConnected=data.phoneConnected;$('phoneConnectionDiagnosis').hidden=false;
    const lines=[data.localAccessOk?'本机接收服务正常，但本机自检不代表手机一定能连接。':'本机接收服务未通过检测，请重新生成接收码。',data.phoneConnected?'手机已连接到接收页面。':'尚未检测到手机打开页面。',data.addressChanged?'电脑地址已变化，请重新生成接收码。':'',...(data.advice||[])];
    $('phoneConnectionDiagnosis').textContent=lines.filter(Boolean).join('\n');
  }finally{mobileDiagnosticBusy=false;recordingControls();}});
  $('openVoiceStudio').onclick=()=>{stopRecording(true);const frame=document.createElement('iframe');frame.src='/static/voice_studio.html';frame.title='音色大厅、授权克隆与配音';$('voiceStudioFrame').replaceChildren(frame);$('voiceStudioDialog').showModal();};
  $('closeVoiceStudio').onclick=()=>$('voiceStudioDialog').close();
  $('openCharacterHall').onclick=()=>{stopRecording(true);const frame=document.createElement('iframe');frame.src='/static/character_hall.html';frame.title='数字人大厅';$('characterHallFrame').replaceChildren(frame);$('characterHallDialog').showModal();};
  $('closeCharacterHall').onclick=()=>$('characterHallDialog').close();
  $('characterHallDialog').addEventListener('close',()=>{$('characterHallFrame').replaceChildren();});
  window.addEventListener('message',event=>{const frame=$('characterHallFrame').querySelector('iframe');if(event.origin!==location.origin||!frame||event.source!==frame.contentWindow)return;if(event.data?.type==='character-hall-close'){$('characterHallDialog').close();return;}if(event.data?.type!=='character-hall-imported')return;safe(async()=>{await reload();const image=library.images.find(row=>row.id===event.data.imageId);if(!image)throw new Error('大厅素材已保存，请更新角色库后选取。');const role=library.characters.find(row=>row.id===event.data.characterId);tab=role?'characters':'images';render();$('imageSelect').value=image.id;if(role){editing=role.id;$('characterName').value=role.name;$('voiceSelect').value=role.voiceId||'';}preview();notifyCharacterLibrary();$('characterHallDialog').close();status(role?'大厅人物已保存为角色卡，可在画布、工作流或元素替换中选择。':'大厅形象已保存并选中，搭配声音后点击保存角色卡即可复用。');})();});
  $('voiceStudioDialog').addEventListener('close',()=>{$('voiceStudioFrame').replaceChildren();if(!voiceSaveCloseReady)safe(reload)();voiceSaveCloseReady=false;});
  window.addEventListener('message',event=>{
    const frame=$('voiceStudioFrame').querySelector('iframe');
    if(event.origin!==location.origin||!frame||event.source!==frame.contentWindow)return;
    if(event.data?.type==='character-studio-close'){$('voiceStudioDialog').close();return;}
    if(event.data?.type==='character-voice-saved'){
      const id=event.data.voiceId;if(voiceSaveHandoffs.has(frame)||!/^[a-f0-9]{32}$/.test(id||''))return;
      voiceSaveHandoffs.add(frame);
      (async()=>{try{
        // No credit or provider request belongs to a free local save. Bound
        // refresh retries only handle an overlapping local-library read.
        let loaded=false;for(let attempt=0;attempt<3&&!loaded;attempt++)loaded=await reload(()=>$('voiceStudioFrame').querySelector('iframe')===frame,false);
        if($('voiceStudioFrame').querySelector('iframe')!==frame)return;
        if(!loaded||!library.voices.some(voice=>voice.id===id))throw new Error('音色已保存，但角色库尚未更新。请返回角色库点击更新记录，再选取这条声音。');
        tab='voices';render();$('voiceSelect').value=id;preview();
        status('音色已免费保存并选中。再选择人物形象，点击“保存角色卡”即可；没有合成或扣积分。');
        notifyCharacterLibrary();voiceSaveCloseReady=true;$('voiceStudioDialog').close();
      }catch(error){status(error.message);if($('voiceStudioFrame').querySelector('iframe')===frame)frame.contentWindow.postMessage({type:'character-voice-save-error',message:error.message},location.origin);}
      finally{voiceSaveHandoffs.delete(frame);}})();return;
    }
    if(event.data?.type!=='character-credits-update')return;
    safe(async()=>{await reload();if(event.data.voiceId&&library.voices.some(voice=>voice.id===event.data.voiceId)){tab='voices';render();$('voiceSelect').value=event.data.voiceId;preview();}await CreditGate.refresh();if(window.parent!==window)window.parent.postMessage(event.data,location.origin);})();
  });
  window.addEventListener('pagehide',()=>{stopRecording(true);mobileOperation++;clearTimeout(mobileTimer);clearTimeout(pollTimer);});
  $('uploadImage').onclick=()=>$('imageFile').click();$('uploadVoice').onclick=()=>$('voiceFile').click();
  $('imageFile').onchange=safe(async event=>{try{await upload('images',event.target.files[0]);}finally{event.target.value='';}});
  $('voiceFile').onchange=safe(async event=>{try{await upload('voices',event.target.files[0]);}finally{event.target.value='';}});
  $('imageSelect').onchange=()=>{$('characterFraming260').value='unknown';preview();};$('voiceSelect').onchange=preview;$('search').oninput=render;$('reload').onclick=safe(reload);
  $('combine').onclick=safe(async()=>{if(busy)return;busy=true;preview();try{const data=await api('/api/characters/combine',{id:editing,name:$('characterName').value,imageId:$('imageSelect').value,voiceId:$('voiceSelect').value,speechProfile:{language:$('characterLanguage260').value,accent:$('characterAccent260').value,timbre:$('characterTimbre260').value},imageFraming:$('characterFraming260').value});library=data.library;editing='';tab='characters';render();notifyCharacterLibrary();status('角色卡已保存。电商、探店、短剧可共用形象、语言口音与声音绑定；固定音色配音需独立确认台词时间与费用，录音样本需先授权克隆。');}finally{busy=false;preview();}});
  $('resetCombination').onclick=()=>{editing='';$('characterName').value='';$('imageSelect').value='';$('voiceSelect').value='';metadata260();preview();};
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;render();});
  $('selectAll').onclick=()=>{const checks=[...document.querySelectorAll('.select')],checked=!checks.every(check=>check.checked);checks.forEach(check=>check.checked=checked);};
  async function manage(ids,action,name){library=await api('/api/characters/manage',{kind:tab,ids,action,name});render();notifyCharacterLibrary();status(action==='remove'?'记录已移除，本机原文件保留。已被角色卡引用的素材移除后，该卡不再可用。':'名称已更新。');}
  $('removeSelected').onclick=safe(async()=>{const ids=[...document.querySelectorAll('.select:checked')].map(check=>check.closest('.card').dataset.id);if(!ids.length)throw new Error('请先勾选要移除的记录。');if(await studioConfirm(`移除选中的${ids.length}条记录？只隐藏记录，不删除原文件。`))await manage(ids,'remove');});
  $('assets').onclick=safe(async event=>{const view=event.target.dataset.view;if(view){$('viewerMedia').innerHTML=`<img src="${media('images',view)}" alt="人物形象">`;$('viewer').showModal();return;}
    const action=event.target.dataset.action,card=event.target.closest('.card');if(!action||!card)return;const row=library[tab].find(row=>row.id===card.dataset.id);
    if(action==='use'){if(tab==='characters'){editing=row.id;$('characterName').value=row.name;$('imageSelect').value=row.imageId;$('voiceSelect').value=row.voiceId;metadata260(row);}else{$(tab==='images'?'imageSelect':'voiceSelect').value=row.id;if(tab==='images')$('characterFraming260').value='unknown';}preview();window.scrollTo({top:0,behavior:'smooth'});}
    if(action==='rename'){const name=await studioPrompt('新的名称',row.name);if(name!==null)await manage([row.id],'rename',name);}
    if(action==='remove'&&await studioConfirm('移除此记录？本机文件保留。'))await manage([row.id],'remove');
  });
  $('closeViewer').onclick=()=>$('viewer').close();
  $('portrait').addEventListener('click',event=>{const image=event.target.closest('img');if(image){$('viewerMedia').innerHTML='<img src="'+image.src+'" alt="完整原图；不裁切头脚">';$('viewer').showModal();}});
  document.querySelectorAll('[data-image-example]').forEach(button=>button.onclick=()=>{$('imageDescription').value=button.dataset.imageExample;generationControls();});
  for(const id of ['portrait','voicePreview'])$(id).addEventListener('click',event=>{const action=event.target.closest('[data-empty-action]')?.dataset.emptyAction;if(action==='generate')$('openGeneration').click();if(action==='upload')$('imageFile').click();if(action==='voices')$('openVoiceStudio').click();if(action==='record')$('openRecording').click();});
  document.addEventListener('play',event=>document.querySelectorAll('audio').forEach(audio=>{if(audio!==event.target)audio.pause();}),true);
  CreditGate.register('#generateImage',()=>liveImage236()?CreditGate.QUOTE:imageCost());
  safe(async()=>{await reload();await loadModels();})();
})();

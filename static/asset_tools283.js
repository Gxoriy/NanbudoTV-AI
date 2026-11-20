/* Local asset identity merging and image reuse; never model generation. */
(function () {
  'use strict';
  const labels={people:'人物',scenes:'场景',props:'物品'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token=()=>crypto.randomUUID().replaceAll('-','');
  function create({project,request,refresh,media,notify,beforeMerge,isBusy}) {
    const dialog=document.createElement('dialog');dialog.id='assetToolsDialog283';dialog.className='asset-tools-dialog283';
    dialog.setAttribute('aria-labelledby','assetToolsTitle283');document.body.append(dialog);
    let session=null,version=0,previewTimer=null,previewSerial=0,applying=false;
    function position(opening=false){
      if(!dialog.open&&!opening||window.parent===window)return;
      try{
        const frame=window.frameElement;if(!frame)return;
        let rect=frame.getBoundingClientRect();
        if(opening&&Math.min(window.parent.innerHeight,rect.bottom)-Math.max(0,rect.top)<220){frame.scrollIntoView({block:'start',behavior:'instant'});rect=frame.getBoundingClientRect();}
        const header=window.parent.document.querySelector('.topbar'),headerRect=header?.getBoundingClientRect(),fixed=header&&['fixed','sticky'].includes(window.parent.getComputedStyle(header).position);
        const top=Math.max(rect.top,0,fixed&&headerRect.top<=0?headerRect.bottom:0),bottom=Math.min(window.parent.innerHeight,rect.bottom),available=Math.max(180,bottom-top-24);
        dialog.style.setProperty('--asset-dialog-height283',available+'px');
        const height=dialog.open?Math.min(dialog.getBoundingClientRect().height,available):available;
        dialog.style.top=Math.max(12,top-rect.top+12+(available-height)/2)+'px';dialog.style.bottom='auto';dialog.style.margin='0 auto';
      }catch(_){/* Foreign embeds retain the native dialog layout. */}
    }
    window.addEventListener('resize',()=>position());
    if(window.parent!==window)try{window.parent.addEventListener('resize',()=>position());window.parent.addEventListener('scroll',()=>position(),{passive:true});}catch(_){}
    new ResizeObserver(()=>position()).observe(dialog);
    function current(owned){return session===owned&&project()?.id===owned?.projectId;}
    function status(message,error=false){const node=dialog.querySelector('[data-asset-tools-status]');if(node){node.textContent=message;node.classList.toggle('asset-tools-error283',error);}}
    function close(){if(applying)return;clearTimeout(previewTimer);previewSerial++;version++;session=null;if(dialog.open)dialog.close();}
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',()=>{if(!applying){session=null;previewSerial++;}});
    function shell(title,body,action){dialog.innerHTML='<form><header><h2 id="assetToolsTitle283">'+esc(title)+'</h2><button type="button" class="ghost-btn" data-asset-tools-cancel aria-label="关闭">×</button></header><div class="asset-tools-body283">'+body+'<p data-asset-tools-status role="status" aria-live="polite"></p></div><footer><span>本地处理 · 不扣积分</span><button type="button" class="ghost-btn" data-asset-tools-cancel>取消</button><button type="submit" class="primary-btn" data-asset-tools-confirm disabled>'+esc(action)+'</button></footer></form>';position(true);dialog.showModal();position();}
    function lock(value){applying=value;for(const control of dialog.querySelectorAll('input,select,button'))control.disabled=value;dialog.setAttribute('aria-busy',String(value));syncSelection();if(!value){const confirm=dialog.querySelector('[data-asset-tools-confirm]');if(confirm)confirm.disabled=!session||(session.mode==='merge'?!session.preview:!dialog.querySelector('input[name="projectImage283"]:checked'));}}
    function mergeInput(){const owned=session;return {projectId:owned.projectId,kind:owned.kind,assetIds:owned.rows.map(row=>row.id),keepId:dialog.querySelector('[name="keepId"]').value,name:dialog.querySelector('[name="name"]').value.trim(),imageAssetId:dialog.querySelector('input[name="mergeImage283"]:checked')?.value||null};}
    async function preview(){
      const owned=session;if(!owned||owned.mode!=='merge'||applying)return;
      owned.preview=null;dialog.querySelector('[data-asset-tools-confirm]').disabled=true;
      const input=mergeInput(),serial=++previewSerial;if(!input.name)return status('请填写合并后的名称。',true);
      status('正在核对整剧引用…');
      try{
        const data=await request('/api/visual/assets/merge/preview',input);
        if(!current(owned)||serial!==previewSerial)return;
        if(!data.planHash||data.projectId!==owned.projectId||data.kind!==input.kind||data.keepId!==input.keepId)throw Error('合并预览与所选资产不一致，请重新核对。');
        owned.preview={...input,planHash:data.planHash};
        const names=Array.isArray(data.aliases)?data.aliases:owned.rows.flatMap(row=>[row.name,...(row.aliases||[])]);
        dialog.querySelector('[data-merge-aliases]').textContent=[...new Set(names.filter(Boolean))].join('、')||'无';
        const episodes=data.affectedEpisodeCount??data.affectedEpisodes?.length;
        const references=data.affectedReferenceCount;
        dialog.querySelector('[data-merge-impact]').textContent=(project()?.seriesProjectId?'将统一当前整剧内的资产引用':'将统一本项目内的资产引用')+(Number.isInteger(episodes)?'，涉及 '+episodes+' 集':'')+(Number.isInteger(references)?'、'+references+' 处引用':'')+'。已有成品和旧记录保留。';
        status('已核对，确认后合并为一个'+labels[owned.kind]+'。');dialog.querySelector('[data-asset-tools-confirm]').disabled=false;
      }catch(error){if(current(owned)&&serial===previewSerial)status(error.message,true);}
    }
    function imageChoice(row,name,value,checked,projectId){return '<label class="asset-image-choice283"><input type="radio" name="'+name+'" value="'+esc(value)+'" '+(checked?'checked':'')+'>'+(row?'<img loading="lazy" src="'+esc(media(row.imageFile,projectId))+'" alt="'+esc(row.name)+'"><span>'+esc(row.name)+'</span>':'<span class="asset-no-image283">无图</span><span>不保留参考图</span>')+'</label>';}
    async function merge(kind){
      if(applying)return;const value=project();if(!value?.id)return;
      const selected=new Set([...document.querySelectorAll('.visual-card[data-kind="'+kind+'"] .asset-select:checked')].map(input=>input.closest('.visual-card').dataset.id));
      const rows=(value.assets?.[kind]||[]).filter(row=>selected.has(row.id));if(rows.length<2)return;
      if(rows.some(row=>isBusy(kind,row.id)))return notify('所选资产仍有任务正在处理，请完成后再合并。',true);
      if(!await beforeMerge(kind,rows.map(row=>row.id))||project()?.id!==value.id)return;
      close();const first=rows[0],imageRow=rows.find(row=>row.imageFile);session={mode:'merge',projectId:value.id,kind,rows,requestId:token(),preview:null,version:++version};
      shell('合并选中的'+labels[kind],'<p>将 '+rows.length+' 项合并为一个资产。原名称保留为别名，后续识别和引用统一到保留资产。</p><div class="asset-merge-fields283"><label>保留主资产<select name="keepId">'+rows.map(row=>'<option value="'+esc(row.id)+'">'+esc(row.name)+'</option>').join('')+'</select></label><label>合并后的名称<input name="name" maxlength="80" value="'+esc(first.name)+'" required></label></div><h3>保留哪张参考图</h3><div class="asset-image-grid283">'+rows.filter(row=>row.imageFile).map(row=>imageChoice(row,'mergeImage283',row.id,row.id===imageRow?.id,value.id)).join('')+imageChoice(null,'mergeImage283','',!imageRow,value.id)+'</div><div class="asset-merge-review283"><b>保留的别名</b><p data-merge-aliases></p><p data-merge-impact>正在核对引用范围…</p></div><button type="button" class="ghost-btn" data-asset-tools-preview>重新核对</button>','确认合并');
      void preview();
    }
    function useImage(node){
      if(applying)return;const value=project(),kind=node.dataset.kind,id=node.dataset.id,target=value?.assets?.[kind]?.find(row=>row.id===id);if(!target)return;
      if(isBusy(kind,id))return notify('这项资产仍有任务正在处理，请完成后再更换参考图。',true);
      close();const rows=Object.keys(labels).flatMap(sourceKind=>(value.assets?.[sourceKind]||[]).filter(row=>row.imageFile&&(sourceKind!==kind||row.id!==id)).map(row=>({...row,kind:sourceKind})));
      session={mode:'image',projectId:value.id,kind,assetId:id,target,rows,requestId:token(),version:++version};
      shell('使用项目图片', '<p>为“'+esc(target.name)+'”选择已有图片。这里只复用图片，资产名称、描述词和引用身份保留。</p>'+(rows.length?'<div class="asset-image-grid283">'+rows.map(row=>imageChoice(row,'projectImage283',row.kind+':'+row.id,false,value.id)).join('')+'</div>':'<p class="asset-tools-empty283">当前项目还没有其他可用图片。先为其他资产上传或生成图片，再来选择。</p>'),'使用所选图片');
    }
    dialog.addEventListener('input',event=>{if(session?.mode==='merge'&&event.target.name==='name'){session.preview=null;session.requestId=token();dialog.querySelector('[data-asset-tools-confirm]').disabled=true;clearTimeout(previewTimer);previewSerial++;previewTimer=setTimeout(preview,300);}});
    dialog.addEventListener('change',event=>{
      if(!session||applying)return;
      if(session.mode==='merge'){
        if(event.target.name==='keepId'){const row=session.rows.find(row=>row.id===event.target.value);dialog.querySelector('[name="name"]').value=row.name;}
        session.requestId=token();clearTimeout(previewTimer);void preview();
      }else lock(false);
    });
    dialog.addEventListener('click',event=>{if(event.target.closest('[data-asset-tools-cancel]'))close();if(event.target.closest('[data-asset-tools-preview]'))void preview();});
    dialog.addEventListener('submit',async event=>{
      event.preventDefault();const owned=session;if(!owned||applying||!current(owned))return;
      let input,url;
      if(owned.mode==='merge'){
        if(!owned.preview)return;
        if(!await beforeMerge(owned.kind,owned.rows.map(row=>row.id))||applying||!current(owned))return;
        input={...owned.preview,requestId:owned.requestId};url='/api/visual/assets/merge/apply';
      }else{
        const id=dialog.querySelector('input[name="projectImage283"]:checked')?.value;
        const source=owned.rows.find(row=>row.kind+':'+row.id===id);if(!source)return;
        input={projectId:owned.projectId,kind:owned.kind,assetId:owned.assetId,sourceKind:source.kind,sourceAssetId:source.id,expectedImageFile:owned.target.imageFile||'',sourceImageFile:source.imageFile,requestId:owned.requestId};url='/api/visual/asset/use-project-image';
      }
      lock(true);status(owned.mode==='merge'?'正在合并资产与引用…':'正在使用所选图片…');
      try{
        const data=await request(url,input);if(!current(owned))return;
        if(data.project?.id!==owned.projectId)throw Error('操作返回与当前项目不一致，请刷新核对。');
        try{await refresh(owned.projectId);}catch(error){if(current(owned)){lock(false);close();notify('操作已保存，界面刷新暂未完成，请重新打开项目查看。'+error.message,true);}return;}
        if(!current(owned))return;
        lock(false);close();notify(owned.mode==='merge'?'已合并为一个资产，原名称作为别名保留。':'已使用项目图片，描述词和资产身份保留。');
      }catch(error){if(current(owned))status(error.message,true);}
      finally{if(session===owned)lock(false);else applying=false;}
    });
    function syncSelection(){for(const button of document.querySelectorAll('.merge-assets283'))button.disabled=applying||document.querySelectorAll('.visual-card[data-kind="'+button.dataset.batchKind+'"] .asset-select:checked').length<2;}
    function enhance(value){
      if(session&&value?.id!==session.projectId){applying=false;close();}
      for(const generate of document.querySelectorAll('.visual-section-actions .batch-assets')){
        const actions=generate.closest('.visual-section-actions');if(actions.querySelector('.merge-assets283'))continue;
        const button=document.createElement('button');button.type='button';button.className='secondary-btn merge-assets283';button.dataset.batchKind=generate.dataset.batchKind;button.textContent='合并选中';button.title='勾选两个或更多同类资产，合并为一个';generate.before(button);
      }
      for(const node of document.querySelectorAll('.visual-card')){
        if(node.querySelector('.asset-use-project-image283'))continue;
        const target=node.querySelector('.asset-edit-panel .visual-result-actions');if(!target)continue;
        const button=document.createElement('button');button.type='button';button.className='ghost-btn asset-use-project-image283';button.textContent='使用项目图片';target.append(button);
      }
      syncSelection();
    }
    document.addEventListener('click',event=>{
      const button=event.target.closest('.merge-assets283,.asset-use-project-image283');
      if(button&&!button.disabled){if(button.classList.contains('merge-assets283'))void merge(button.dataset.batchKind).catch(error=>notify(error.message,true));else useImage(button.closest('.visual-card'));}
      if(event.target.closest('.select-all-assets,.invert-select-assets,.compact-asset-select-all205'))queueMicrotask(syncSelection);
    });
    document.addEventListener('change',event=>{if(event.target.matches('.asset-select,.compact-asset-select-all205'))syncSelection();});
    return {enhance,syncSelection};
  }
  window.AssetTools283={create};
})();

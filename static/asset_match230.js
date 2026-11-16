/* Explicit local image review. This component never generates or inherits. */
(() => {
  'use strict';
  if (window.AssetMatch230) return;
  const labels={people:'人物',scenes:'场景',props:'物品'},states={recommended:'推荐',review:'备选待确认',existing:'已有图片',busy:'原任务保护',unmatched:'暂无候选'};
  const safeImage=value=>typeof value==='string'&&value.startsWith('/api/asset-library/image?')?value:'';
  const list=value=>Array.isArray(value)?value:[];
  const identity=row=>String(row.versionId||row.id||'');
  function surface(){try{if(window.parent!==window&&window.parent.document.body)return window.parent.document;}catch(_){}return document;}
  function element(doc,name,className,text){const node=doc.createElement(name);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function review(data,options={}){
    const doc=surface(),host=doc.defaultView;host.__assetMatchReview230Cancel?.();
    if(!doc.getElementById('assetMatchStyle230')){const link=element(doc,'link');link.id='assetMatchStyle230';link.rel='stylesheet';link.href='/static/asset_match230.css';doc.head.append(link);}
    const dialog=element(doc,'dialog','am230');dialog.id='assetMatchReview230';dialog.setAttribute('aria-labelledby','assetMatchTitle230');
    dialog.innerHTML='<header class="am230-head"><div><h2 id="assetMatchTitle230">查看本地资产匹配</h2><p data-am-project></p></div><button type="button" class="ghost-btn" data-am-cancel aria-label="关闭匹配预览">×</button></header><section class="am230-summary" data-am-summary></section><p class="am230-index" data-am-index hidden></p><section class="am230-tools"><label>查看<select data-am-filter><option value="all">全部资产</option><option value="recommended">推荐</option><option value="review">备选待确认</option><option value="unmatched">暂无候选</option><option value="existing">已有图片</option><option value="busy">原任务保护</option></select></label><button type="button" class="ghost-btn" data-am-recommended>仅勾选推荐</button><button type="button" class="ghost-btn" data-am-clear>全部取消</button><button type="button" class="ghost-btn" data-am-library>打开资产库</button></section><main class="am230-body"><p class="am230-note">推荐已默认勾选。备选可展开看图、比较来源和差异后选择；本页不会自动生成任何图片。</p><div data-am-rows></div><nav class="am230-pages"><button type="button" class="ghost-btn" data-am-prev>上一页</button><span data-am-page></span><button type="button" class="ghost-btn" data-am-next>下一页</button></nav></main><footer class="am230-foot"><label class="am230-ack" data-am-ack-label hidden><input type="checkbox" data-am-ack>已查看所选图片，确认接受标出的外观、年龄或画风差异。</label><p data-am-status role="status" aria-live="polite"></p><div><button type="button" class="ghost-btn" data-am-cancel>取消</button><button type="button" class="primary-btn" data-am-apply>继承所选图片</button></div></footer><section class="am230-preview" data-am-preview hidden><button type="button" class="ghost-btn" data-am-preview-close>关闭大图</button><p data-am-preview-title></p><img alt="候选图片大图" data-am-preview-image></section>';
    doc.body.append(dialog);
    const $=selector=>dialog.querySelector(selector),rows=list(data.targets).map((row,index)=>({...row,_index:index,candidates:list(row.candidates)}));
    const selections=new Map(),expanded=new Set();let page=1,filter='all',acknowledged=false,settled=false,timer;
    const size=10,protectedRow=row=>['existing','busy'].includes(row.status),candidateFor=(row,id)=>row.candidates.find(candidate=>identity(candidate)===id&&candidate.eligible!==false);
    const selectedCandidate=row=>candidateFor(row,selections.get(row.targetKey));
    const needsReview=row=>{const selected=selectedCandidate(row);return !!selected&&(selected.requiresReview===true||identity(selected)!==row.recommendedVersionId);};
    $('[data-am-project]').textContent=options.projectName?'当前项目：'+options.projectName:'请确认每项资产对应的图片版本';
    const indexing=data.libraryStatus&&(data.libraryStatus.active||data.libraryStatus.scanning||Number(data.libraryStatus.pendingProjects)>0);
    const errors=list(data.libraryStatus?.errors);
    if(indexing||errors.length){$('[data-am-index]').hidden=false;$('[data-am-index]').textContent=indexing?'历史图片正在后台整理，本次可先选择已找到的图片，稍后可重新匹配。':'部分历史图片尚未整理成功，可在资产库查看保存提醒后再匹配。';}
    const counts={total:Number(data.totalAssets??rows.length),recommended:Number(data.recommendedAssets??data.matchedAssets??0),review:Number(data.reviewAssets??0),existing:Number(data.alreadyHasImageAssets??0),busy:Number(data.busyAssets??0),unmatched:Number(data.noCandidateAssets??0)};
    for(const [key,label]of [['total','总资产'],['recommended','推荐'],['review','备选'],['existing','已有图片'],['busy','任务保护'],['unmatched','暂无候选']]){
      const item=element(doc,'span','am230-count'),number=element(doc,'strong','',String(counts[key]));number.dataset.amCount=key;item.append(number,element(doc,'small','',label));$('[data-am-summary]').append(item);
    }
    function chooseDefaults(){selections.clear();for(const row of rows)if(!protectedRow(row)&&candidateFor(row,row.recommendedVersionId))selections.set(row.targetKey,row.recommendedVersionId);acknowledged=false;}
    chooseDefaults();
    function selectedRows(){return rows.filter(row=>selections.has(row.targetKey));}
    function updateFooter(){
      const chosen=selectedRows(),reviewCount=chosen.filter(needsReview).length;
      $('[data-am-status]').textContent=`已选择 ${chosen.length} 项图片${reviewCount?'，其中 '+reviewCount+' 项需要确认差异':''}。未选择的项目保留，不会自动生成。`;
      $('[data-am-ack-label]').hidden=!reviewCount;$('[data-am-ack]').checked=acknowledged;
      $('[data-am-apply]').disabled=!chosen.length||reviewCount>0&&!acknowledged;
    }
    function preview(row,candidate){const image=safeImage(candidate.imageUrl||candidate.thumbnailUrl);if(!image)return;$('[data-am-preview-title]').textContent=(row.name||'目标资产')+' ← '+(candidate.sourceName||candidate.name||'历史资产')+' · '+(candidate.sourceProjectName||'历史项目');$('[data-am-preview-image]').src=image;$('[data-am-preview]').hidden=false;$('[data-am-preview-close]').focus();}
    function render(){
      for(const status of ['recommended','review','existing','busy','unmatched'])$('[data-am-count="'+status+'"]').textContent=String(rows.filter(row=>row.status===status).length);
      const body=$('.am230-body'),scroll=body.scrollTop,filtered=rows.filter(row=>filter==='all'||row.status===filter),pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.min(page,pages);
      const container=$('[data-am-rows]');container.replaceChildren();
      for(const row of filtered.slice((page-1)*size,page*size)){
        const article=element(doc,'article','am230-target');article.dataset.amTarget=row.targetKey;
        const head=element(doc,'div','am230-target-head'),selected=selectedCandidate(row),check=element(doc,'input');check.type='checkbox';check.checked=!!selected;check.disabled=protectedRow(row)||!row.candidates.some(candidate=>candidate.eligible!==false);check.setAttribute('aria-label','继承 '+row.name);
        check.addEventListener('change',()=>{if(!check.checked){selections.delete(row.targetKey);acknowledged=false;render();}else if(candidateFor(row,row.recommendedVersionId)){selections.set(row.targetKey,row.recommendedVersionId);acknowledged=false;render();}else{expanded.add(row.targetKey);render();[...dialog.querySelectorAll('[data-am-target]')].find(node=>node.dataset.amTarget===row.targetKey)?.querySelector('input[type=radio]')?.focus();}});
        const thumbnail=element(doc,'button','am230-selected-thumb');thumbnail.type='button';thumbnail.title='查看当前所选图片';
        if(selected){const img=element(doc,'img');img.src=safeImage(selected.thumbnailUrl||selected.imageUrl);img.alt=selected.sourceName||selected.name||'所选图片';img.loading='lazy';thumbnail.append(img);thumbnail.onclick=()=>preview(row,selected);}else{thumbnail.textContent=protectedRow(row)?'保留':'待选择';thumbnail.disabled=true;}
        const copy=element(doc,'div','am230-target-copy');copy.append(element(doc,'strong','',(labels[row.kind]||'资产')+' · '+(row.name||'未命名')),element(doc,'span','am230-state am230-state-'+row.status,states[row.status]||'待确认'),element(doc,'p','',row.reason||''));
        if(row.description)copy.append(element(doc,'small','',row.description));
        head.append(check,thumbnail,copy);article.append(head);
        if(row.candidates.length&&!protectedRow(row)){
          const toggle=element(doc,'button','ghost-btn am230-expand',expanded.has(row.targetKey)?'收起图片候选':'展开 '+row.candidates.length+' 张图片候选');toggle.type='button';toggle.setAttribute('aria-expanded',String(expanded.has(row.targetKey)));toggle.onclick=()=>{expanded.has(row.targetKey)?expanded.delete(row.targetKey):expanded.add(row.targetKey);render();};article.append(toggle);
          if(expanded.has(row.targetKey)){
            const grid=element(doc,'div','am230-candidates');
            for(const candidate of row.candidates){
              const vid=identity(candidate),card=element(doc,'label','am230-candidate');card.classList.toggle('selected',selections.get(row.targetKey)===vid);
              const radio=element(doc,'input');radio.type='radio';radio.name='am230-target-'+row._index;radio.value=vid;radio.checked=selections.get(row.targetKey)===vid;radio.disabled=candidate.eligible===false;radio.setAttribute('aria-label','选择 '+(candidate.sourceName||candidate.name||'历史图片'));
              radio.onchange=()=>{selections.set(row.targetKey,vid);acknowledged=false;render();};
              const image=element(doc,'img');image.src=safeImage(candidate.thumbnailUrl||candidate.imageUrl);image.alt=candidate.sourceName||candidate.name||'候选图片';image.loading='lazy';
              const title=element(doc,'strong','',(candidate.sourceName||candidate.name||'历史资产')+(candidate.recommended?' · 推荐':''));
              card.append(radio,image,title,element(doc,'small','',candidate.sourceProjectName||'历史项目'));
              if(Number.isFinite(candidate.score))card.append(element(doc,'small','','相似度 '+Math.round(candidate.score*100)+'% · 仅供辅助判断'));
              if(candidate.versionNumber)card.append(element(doc,'small','','第 '+candidate.versionNumber+' 版'));
              const details=[candidate.reason,...list(candidate.differences),...list(candidate.hardConflicts)].filter(Boolean);card.append(element(doc,'p',candidate.requiresReview?'am230-difference':'', [...new Set(details)].join('；')||'请查看图片确认是否适用。'));
              const large=element(doc,'button','ghost-btn','放大查看');large.type='button';large.onclick=event=>{event.preventDefault();preview(row,candidate);};card.append(large);grid.append(card);
            }
            article.append(grid);
          }
        }
        container.append(article);
      }
      if(!filtered.length)container.append(element(doc,'p','am230-empty','此分类下暂无资产。'));
      $('[data-am-page]').textContent=page+' / '+pages+' 页';$('[data-am-prev]').disabled=page<=1;$('[data-am-next]').disabled=page>=pages;body.scrollTop=scroll;updateFooter();
    }
    return new Promise(resolve=>{
      function finish(value){if(settled)return;settled=true;clearInterval(timer);if(host.__assetMatchReview230Cancel===cancel)delete host.__assetMatchReview230Cancel;dialog.remove();resolve(value);}
      const cancel=()=>finish(null);host.__assetMatchReview230Cancel=cancel;
      dialog.querySelectorAll('[data-am-cancel]').forEach(button=>button.onclick=cancel);dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
      $('[data-am-filter]').onchange=event=>{filter=event.target.value;page=1;render();$('.am230-body').scrollTop=0;};
      $('[data-am-prev]').onclick=()=>{page--;render();$('.am230-body').scrollTop=0;};$('[data-am-next]').onclick=()=>{page++;render();$('.am230-body').scrollTop=0;};
      $('[data-am-recommended]').onclick=()=>{chooseDefaults();render();};$('[data-am-clear]').onclick=()=>{selections.clear();acknowledged=false;render();};
      $('[data-am-ack]').onchange=event=>{acknowledged=event.target.checked;updateFooter();};
      $('[data-am-preview-close]').onclick=()=>{$('[data-am-preview]').hidden=true;};
      $('[data-am-library]').onclick=()=>{cancel();host.setTimeout(()=>doc.getElementById('openAssetLibrary228')?.click(),0);};
      $('[data-am-apply]').onclick=()=>{if(!options.isCurrent||options.isCurrent())finish({selections:[...selections].map(([targetKey,versionId])=>({targetKey,versionId})),reviewAcknowledged:acknowledged});else cancel();};
      timer=host.setInterval(()=>{
        if(options.isCurrent&&!options.isCurrent()){cancel();return;}
        const busy=new Set(options.busyTargets?.()||[]);let changed=false;
        for(const row of rows)if(busy.has(row.targetKey)&&row.status!=='busy'){row.status='busy';row.reason='此项已进入原图片任务，本次不覆盖；其他资产仍可继承。';selections.delete(row.targetKey);changed=true;}
        if(changed){acknowledged=false;render();}
      },300);
      render();try{dialog.showModal();}catch(_){cancel();}
    });
  }
  window.AssetMatch230={review};
})();

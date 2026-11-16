/* The independent scene directory is free navigation, not a generation stage. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.WorkflowSceneDirectory=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sourceKeys231=new Map();let sourceKeySize231=0;
  const sourceKey231=value=>{
    const source=String(value??'');if(sourceKeys231.has(source))return sourceKeys231.get(source);
    const key=source.replace(/\r\n?/g,'\n').replace(/\s+/g,'');
    if(source.length<=1000000){while(sourceKeys231.size&&(sourceKeys231.size>=256||sourceKeySize231+source.length>2000000)){const oldest=sourceKeys231.keys().next().value;sourceKeys231.delete(oldest);sourceKeySize231-=oldest.length;}sourceKeys231.set(source,key);sourceKeySize231+=source.length;}
    return key;
  };
  const titleKey231=value=>String(value??'').normalize('NFKC').replace(/^\s*第\s*[\d一二三四五六七八九十百零〇]+\s*[集场章回]\s*[·.、:：\-—]?\s*/,'').replace(/[\s·.、:：\-—]/g,'').toLocaleLowerCase();
  const sceneId231=row=>String(row?.segmentId||row?.id||'');
  function savedVideoCount231(snapshot,id,cards){
    return cards.filter((card,i)=>{const slot=snapshot?.media?.[id]?.[String(card.number||i+1)]||{};return !!(slot.videoFile||card.videoFile||(slot.history||[]).some(row=>(row.kind||row.action)==='video'&&row.file));}).length;
  }
  function storyboardState279(snapshot,id,scene,record,cardCount,videos,oldCards,oldVideos){
    const state=snapshot?.sceneProgress278?.[id]?.state,result=record.result;
    const partial=result?.complete===false||state==='partial'||state==='needs_attention'
      ||state==='in_progress'||state==='waiting_submission'||state==='unsubmitted';
    const complete=cardCount&&!partial&&(!snapshot?.shotFirst||result?.complete===true||scene?.complete===true||state==='complete');
    if(complete)return {phase:'done',status:videos?`视频 ${videos}/${cardCount} 完成`:'分镜已完成'};
    const videoNote=videos?` · 已有 ${videos} 个视频`:'';
    const scopedIssue=snapshot?.sceneIssues223?.[id];
    if(state==='needs_attention'||(!state&&(/failed|validation|needs_review|uncertain/.test(record.status||'')||record.status==='returned_unstructured'))){
      const status=scopedIssue?.code==='receipt_pending'?'原调用待核对':'分镜待处理';
      return {phase:'attention',status:(cardCount?'部分分镜 · ':'')+status+videoNote};
    }
    if(state==='in_progress'||(!state&&/running|submitted|queued/.test(record.status||'')))
      return {phase:'working',status:(cardCount?'部分分镜 · ':'')+'分镜处理中'+videoNote};
    if(state==='waiting_submission')return {phase:'idle',status:'等待提交分镜'};
    if(cardCount)return {phase:'partial',status:'部分分镜已可用'+videoNote};
    if(oldCards)return {phase:'done',status:oldVideos?`原版本视频 ${oldVideos}/${oldCards} 完成`:'原版本分镜已保存'};
    return {phase:'idle',status:state==='partial'?'分镜待补齐':state==='unsubmitted'?'尚未提交分镜':'待补齐分镜'};
  }
  function sceneRows(project,snapshot,shared){
    const prepared=project?.workflowPreparedScript;
    const planned=Array.isArray(snapshot?.plan?.segments)?snapshot.plan.segments:[];
    const directory=Array.isArray(prepared?.sceneDirectory)?prepared.sceneDirectory:[];
    const pendingPaidSource=project?.workflowOutlineMode207==='paid_only'&&!directory.length&&(prepared?.sceneMode==='paid_outline_pending'||snapshot?.sourceEpochMatches===false);
    const usePlan=!pendingPaidSource&&planned.length&&(!directory.length||snapshot.sourceEpochMatches!==false&&snapshot.directorySourceMatches!==false);
    const bySource=new Map(),byId=new Map(),byTitle=new Map();
    const add=(map,key,row)=>{if(!key)return;const rows=map.get(key)||[];rows.push(row);map.set(key,rows);};
    if(!usePlan)for(const row of planned){add(bySource,sourceKey231(row.sourceText),row);add(byId,sceneId231(row),row);add(byTitle,titleKey231(row.title),row);}
    return (usePlan?planned:directory).map((row,index)=>{
      const id=String(row.segmentId||row.id||`scene-${index+1}`),sourceText=String(row.sourceText??directory[index]?.sourceText??'');
      let linked=usePlan?row:null,historical=null;
      if(!linked){
        const source=sourceKey231(sourceText),identities=byId.get(String(row.macroId||row.segmentId||row.id||''))||[],sameSource=bySource.get(source)||[];
        const reliableId=!!(row.macroId||row.segmentId||/^[a-f\d]{32,64}$/i.test(String(row.id||'')));
        if(source&&sameSource.length===1)linked=sameSource[0];
        else if(reliableId&&identities.length===1&&(!source||!sourceKey231(identities[0].sourceText)||source===sourceKey231(identities[0].sourceText)))linked=identities[0];
        else{const names=byTitle.get(titleKey231(row.title))||[];if(names.length===1)historical=names[0];}
      }
      const linkedId=sceneId231(linked),record=snapshot?.segments?.[linkedId||id]||{};
      const displayed=linked?(shared?.readSceneCards?.(snapshot,linked)||[]):[];
      // Shot-first plans may include planned cards before the accepted results
      // arrive. Count only the cards that are actually available for use.
      const cards=snapshot?.shotFirst?displayed.filter(card=>shared?.cardComplete?.(card)??(card.complete===true)):displayed;
      const shots=cards.reduce((n,card)=>n+(Array.isArray(card.shots)?card.shots.length:0),0);
      const videos=savedVideoCount231(snapshot,linkedId,cards),oldId=sceneId231(historical),oldCards=historical?(shared?.readSceneCards?.(snapshot,historical)||[]):[],oldVideos=savedVideoCount231(snapshot,oldId,oldCards);
      return {id,number:index+1,title:String(row.title||`第${index+1}场`),outline:String(row.purpose||row.synopsis||directory[index]?.purpose||directory[index]?.synopsis||''),sourceText,cardCount:cards.length,shotCount:shots,
        historicalCardCount:oldCards.length,historicalShotCount:oldCards.reduce((n,card)=>n+(Array.isArray(card.shots)?card.shots.length:0),0),
        ...storyboardState279(snapshot,linkedId,linked,record,cards.length,videos,oldCards.length,oldVideos),
        macroId:linked?linkedId:null};
    });
  }
  function create(options){
    const host=options.root,win=host.ownerDocument.defaultView;
    const selections=new Map(),viewStates=new Map(),remembered231=new Map();let project=null,snapshot=null,items=[],selected=0,last='',destroyed=false,frame=0,bandWidth=0,locked=false,lockedScroll=0,expanded=false,mobileOpen=false,query='';
    function restore(id){try{return Number(win.localStorage.getItem('workflowScene194:'+id))||0;}catch(_){return 0;}}
    function rememberValue231(key,value){if(remembered231.get(key)===value)return;try{win.localStorage.setItem(key,value);remembered231.set(key,value);}catch(_){}}
    function remember(){if(!project?.id)return;selections.set(project.id,selected);viewStates.set(project.id,{expanded,mobileOpen,query});rememberValue231('workflowScene194:'+project.id,String(selected));rememberValue231('workflowSceneSidebar206:'+project.id,JSON.stringify({expanded,query}));}
    function restoreView(id){let value=viewStates.get(id);if(!value)try{value=JSON.parse(win.localStorage.getItem('workflowSceneSidebar206:'+id)||'null');}catch(_){}return value||{};}
    function available(){const text=query.trim().toLocaleLowerCase();return items.map((row,index)=>({row,index})).filter(({row,index})=>!text||`${index+1} ${row.title}`.toLocaleLowerCase().includes(text));}
    function band(){return host.querySelector('.workflow-scene-band');}
    function updateArrows(){
      const strip=band();if(!strip)return;
      const max=Math.max(0,strip.scrollHeight-strip.clientHeight);
      host.querySelector('[data-scene195-slide="-1"]').disabled=locked||strip.scrollTop<=1||!items.length;
      host.querySelector('[data-scene195-slide="1"]').disabled=locked||strip.scrollTop>=max-1||!items.length;
    }
    // Move only the vertical list. scrollIntoView would also move the page
    // while the user is editing a card farther down the workflow.
    function revealSelected(){
      const strip=band(),active=host.querySelector(`[data-scene194-index="${selected}"]`);
      if(!strip?.clientHeight||!active||active.hidden)return;
      const area=strip.getBoundingClientRect(),tile=active.getBoundingClientRect();
      if(tile.top<area.top+1||tile.bottom>area.bottom-1){
        const top=strip.scrollTop+tile.top-area.top-(strip.clientHeight-tile.height)/2;
        strip.scrollTop=Math.max(0,Math.min(strip.scrollHeight-strip.clientHeight,top));
      }
      if(locked)lockedScroll=strip.scrollTop;
      updateArrows();
    }
    function scheduleReveal(){
      if(frame)win.cancelAnimationFrame(frame);
      frame=win.requestAnimationFrame(()=>{frame=0;if(!destroyed)revealSelected();});
    }
    function updateSelection(){
      host.dataset.navigationLocked=locked?'1':'0';
      host.setAttribute('aria-busy',String(locked));
      host.title=locked?'分镜补齐中，任务结束后可切换场次。':'';
      host.dataset.sidebarExpanded=expanded?'1':'0';host.dataset.mobileOpen=mobileOpen?'1':'0';
      const toggle=host.querySelector('[data-scene206-expand]');toggle.textContent=expanded?'收起':'展开';toggle.setAttribute('aria-expanded',String(expanded));
      const mobile=host.querySelector('[data-scene206-mobile]');mobile.setAttribute('aria-expanded',String(mobileOpen));mobile.querySelector('span').textContent=items.length?`场次目录 · 第 ${selected+1} / ${items.length} 场`:'场次目录';
      const input=host.querySelector('[data-scene206-search]');input.disabled=locked;if(input.value!==query)input.value=query;
      band()?.setAttribute('aria-disabled',String(locked));
      host.querySelectorAll('[data-scene194-index]').forEach(button=>{const index=Number(button.dataset.scene194Index),row=items[index];button.setAttribute('aria-pressed',String(index===selected));button.disabled=locked;const working=locked&&index===selected,phase=working?'working':row.phase;const dot=button.querySelector('.workflow-scene-dot206'),status=button.querySelector('em');dot.dataset.state=phase;status.dataset.state=phase;status.textContent=working?(row.cardCount&&row.phase!=='done'?'部分分镜 · 分镜处理中':'分镜处理中'):row.status;});
      const range=host.querySelector('.workflow-scene-range');
      if(range)range.textContent=query?`匹配 ${available().length} / ${items.length} 场`:items.length?`${selected+1} / ${items.length} 场`:'待识别场次';
      updateArrows();
    }
    function paint(reveal=false,resetScroll=false){
      if(destroyed)return;
      host.hidden=!project?.id;
      if(!project?.id)return;
      if(!band())host.innerHTML=`<button type="button" class="workflow-scene-mobile206" data-scene206-mobile aria-expanded="false" aria-controls="workflowSceneDesktop206"><span>场次目录</span><span aria-hidden="true">⌄</span></button><div id="workflowSceneDesktop206" class="workflow-scene-desktop206"><div class="workflow-scene-head"><div><strong>场次目录</strong><small class="workflow-scene-project206"></small></div><button type="button" class="workflow-scene-expand206" data-scene206-expand aria-expanded="false" aria-controls="workflowSceneStrip195">展开</button></div><input class="workflow-scene-search206" data-scene206-search type="search" aria-label="搜索场次标题或序号" placeholder="搜索标题 / 序号" autocomplete="off"><nav id="workflowSceneStrip195" class="workflow-scene-band" aria-label="场次纵向导航"></nav><div class="workflow-scene-tools"><button type="button" class="ghost-btn" data-scene195-slide="-1" aria-label="向上滚动场次" aria-controls="workflowSceneStrip195">↑</button><span class="workflow-scene-range" aria-live="polite"></span><button type="button" class="ghost-btn" data-scene195-slide="1" aria-label="向下滚动场次" aria-controls="workflowSceneStrip195">↓</button></div></div>`;
      const projectSummary=host.querySelector('.workflow-scene-project206');
      projectSummary.textContent=`共 ${items.length} 场`;projectSummary.title=project.projectName||'当前短剧项目';
      // The source text remains available for scene selection, but is never
      // rendered in this sidebar. Serializing an entire long script on each
      // progress receipt only adds main-thread work, not a visible change.
      const signature=JSON.stringify([project.id,items.map(({id,number,title,outline,cardCount,shotCount,historicalCardCount,historicalShotCount,status,phase,macroId})=>({id,number,title,outline,cardCount,shotCount,historicalCardCount,historicalShotCount,status,phase,macroId}))]);
      if(signature!==last){const scroll=resetScroll?0:band()?.scrollTop||0;last=signature;
        const nodes=new Map([...band().querySelectorAll('[data-scene194-index]')].map(node=>[Number(node.dataset.scene194Index),node]));
        const valid=new Set();items.forEach((row,i)=>{let node=nodes.get(i);if(!node){node=host.ownerDocument.createElement('button');node.type='button';node.className='workflow-scene-item';node.dataset.scene194Index=i;band().append(node);}valid.add(node);const count=row.cardCount?`${row.shotCount?row.shotCount+'镜头 · ':''}${row.cardCount}卡`:(row.historicalCardCount?'已存'+row.historicalCardCount+'卡（原版本）':'镜头待生成');node.title=row.title+' · '+count+' · '+row.status;node.setAttribute('aria-label',`第 ${i+1} 场：${row.title}；${count}；${row.status}`);node.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span><i class="workflow-scene-dot206" data-state="${row.phase}" aria-hidden="true"></i><div><strong>${esc(row.title)}</strong><small class="workflow-scene-outline206" ${row.outline?'':'hidden'}>${esc(row.outline)}</small><div class="workflow-scene-meta"><small>${esc(count)}</small><em data-state="${row.phase}">${esc(row.status)}</em></div></div>`;});
        for(const node of band().querySelectorAll('[data-scene194-index]'))if(!valid.has(node))node.remove();
        let empty=band().querySelector('.workflow-scene-empty');if(!empty){empty=host.ownerDocument.createElement('p');empty.className='workflow-scene-empty';band().append(empty);}band().scrollTop=scroll;
      }
      const matching=new Set(available().map(({index})=>index));host.querySelectorAll('[data-scene194-index]').forEach(node=>node.hidden=!matching.has(Number(node.dataset.scene194Index)));
      const empty=band().querySelector('.workflow-scene-empty');empty.hidden=matching.size>0;empty.textContent=items.length?'没有匹配的场次':'导入剧本后显示场次目录';
      updateSelection();if(reveal)scheduleReveal();
    }
    function select(index,notify=true){
      if(locked||!items.length)return;
      const previous=selected;selected=Math.max(0,Math.min(items.length-1,Math.floor(Number(index)||0)));if(previous!==selected&&!available().some(row=>row.index===selected))query='';mobileOpen=false;remember();paint(true);
      if(notify)options.onSelect?.(items[selected],selected);
    }
    function setData(nextProject,nextSnapshot,navigation={}){
      const changed=project?.id!==nextProject?.id,previous=selected,wasLocked=locked;
      project=nextProject;snapshot=nextSnapshot||{};items=sceneRows(project,snapshot,options.shared);
      if(changed){selected=selections.get(project?.id)??restore(project?.id);const view=restoreView(project?.id);expanded=!!view.expanded;mobileOpen=!!view.mobileOpen;query=typeof view.query==='string'?view.query:'';}
      locked=!!navigation.locked;
      const executing=locked&&navigation.sceneId?items.findIndex(row=>row.id===navigation.sceneId||row.macroId===navigation.sceneId):-1;
      if(executing>=0)selected=executing;
      else if(navigation.resetSelection&&!locked){selected=0;if(!available().some(row=>row.index===0))query='';}
      if(locked&&(!wasLocked||changed)){if(executing>=0&&!available().some(row=>row.index===selected))query='';lockedScroll=changed?0:band()?.scrollTop||0;}
      selected=Math.max(0,Math.min(Math.max(items.length-1,0),selected));paint(changed||previous!==selected||!last,changed);
      remember();
      return items[selected]||null;
    }
    function click(event){const b=event.target.closest('button');if(!b||!host.contains(b)||b.disabled)return;
      if(b.dataset.scene206Expand!==undefined){expanded=!expanded;remember();paint(true);}
      else if(b.dataset.scene206Mobile!==undefined){mobileOpen=!mobileOpen;remember();paint(true);}
      else if(b.dataset.scene194Index!==undefined)select(Number(b.dataset.scene194Index));
      else if(b.dataset.scene195Slide){const strip=band();strip?.scrollBy({top:Number(b.dataset.scene195Slide)*Math.max(180,strip.clientHeight*.8),behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
    }
    function wheel(event){
      const strip=band();if(!strip||!strip.contains(event.target))return;
      if(locked){event.preventDefault();return;}
      if(Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?strip.clientHeight:1),max=strip.scrollHeight-strip.clientHeight;
      if((delta>0&&strip.scrollTop<max-1)||(delta<0&&strip.scrollTop>1)){event.preventDefault();strip.scrollTop=Math.max(0,Math.min(max,strip.scrollTop+delta));updateArrows();}
    }
    function keydown(event){
      const button=event.target.closest('[data-scene194-index]');if(!button||!host.contains(button))return;
      if(locked){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown',' ','Enter'].includes(event.key))event.preventDefault();return;}
      const matches=available().map(row=>row.index),position=matches.indexOf(Number(button.dataset.scene194Index)),next=['ArrowLeft','ArrowUp'].includes(event.key)?matches[Math.max(0,position-1)]:['ArrowRight','ArrowDown'].includes(event.key)?matches[Math.min(matches.length-1,position+1)]:event.key==='Home'?matches[0]:event.key==='End'?matches.at(-1):null;
      if(next===null)return;event.preventDefault();select(next);host.querySelector(`[data-scene194-index="${selected}"]`)?.focus({preventScroll:true});
    }
    function scroll(event){if(event.target===band()){if(locked&&Math.abs(event.target.scrollTop-lockedScroll)>1)event.target.scrollTop=lockedScroll;updateArrows();}}
    function input(event){if(!event.target.matches('[data-scene206-search]'))return;if(locked){event.target.value=query;return;}query=event.target.value;remember();paint();band().scrollTop=0;updateArrows();}
    const resize=typeof win.ResizeObserver==='function'?new win.ResizeObserver(()=>{const width=band()?.clientWidth||0;if(width&&width!==bandWidth){bandWidth=width;scheduleReveal();}}):null;
    resize?.observe(host);
    host.addEventListener('click',click);host.addEventListener('input',input);host.addEventListener('keydown',keydown);host.addEventListener('wheel',wheel,{passive:false});host.addEventListener('scroll',scroll,true);
    return {setData,select,current:()=>items[selected]||null,index:()=>selected,isLocked:()=>locked,
      destroy(){destroyed=true;if(frame)win.cancelAnimationFrame(frame);resize?.disconnect();host.removeEventListener('click',click);host.removeEventListener('input',input);host.removeEventListener('keydown',keydown);host.removeEventListener('wheel',wheel);host.removeEventListener('scroll',scroll,true);host.replaceChildren();}};
  }
  return {create,sceneRows};
});

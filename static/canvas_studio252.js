/* Local canvas interaction. Graph editing calls the existing canvas save pipeline;
   no generation, pricing, account or provider APIs are introduced here. */
(function(root){
  'use strict';
  function create(b){
    const $=id=>document.getElementById(id),viewport=$('viewport'),clone=value=>JSON.parse(JSON.stringify(value));
    let selection=new Set(),clipboard=null,pasteCount=0,gesture=null,frame=0,space=false,selectionModifier=false,inspectorClosed=false,inspectorCollapsed=false,contextPoint=null,minimapMap=null,geometryFrame254=0;
    function scheduleGeometry254(){if(geometryFrame254)return;geometryFrame254=requestAnimationFrame(()=>{geometryFrame254=0;b.drawWires();drawGroups();schedule();});}
    const state=()=>b.state(),graph=()=>state().doc?.graph,find=nid=>graph()?.nodes.find(n=>n.id===nid);
    const selectedNodes=()=>graph()?.nodes.filter(n=>selection.has(n.id))||[];
    const worldPoint=e=>{const s=state(),r=viewport.getBoundingClientRect();return{x:(e.clientX-r.left-s.pan.x)/s.zoom,y:(e.clientY-r.top-s.pan.y)/s.zoom};};
    const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){b.message(e.message,true);}};
    const ignoreKeys=event=>event.target.closest('input,textarea,select,dialog,[contenteditable="true"]');
    function resetSelection(nid){selection=new Set(nid?[nid]:[]);inspectorClosed=false;}
    function resetDocument(){cancel();selection.clear();clipboard=null;pasteCount=0;contextPoint=null;space=false;selectionModifier=false;inspectorClosed=false;inspectorCollapsed=false;closePanels();$('canvasContextMenu').hidden=true;}
    function cleanSelection(){for(const nid of selection)if(!find(nid))selection.delete(nid);if(state().selectedEdge>=0)selection.clear();}
    function choose(ids,primary){const next=new Set(ids.filter(nid=>!!find(nid))),nid=primary&&next.has(primary)?primary:[...next].at(-1)||'';if(nid===state().selected&&next.size===selection.size&&[...next].every(id=>selection.has(id)))return;selection=next;b.setPrimary(nid);inspectorClosed=false;if(selection.size===1)b.select(nid);else{b.renderSelection();b.inspect();}}
    function toggleSelection(nid){const ids=new Set(selection);ids.has(nid)?ids.delete(nid):ids.add(nid);choose([...ids],ids.has(nid)?nid:undefined);}
    function nodeBounds(n){const el=$('nodes').querySelector('[data-id="'+n.id+'"]');return{x:n.x,y:n.y,w:el?.offsetWidth||280,h:el?.offsetHeight||220};}
    function bounds(nodes){if(!nodes.length)return null;const boxes=nodes.map(nodeBounds),x=Math.min(...boxes.map(r=>r.x)),y=Math.min(...boxes.map(r=>r.y));return{x,y,w:Math.max(...boxes.map(r=>r.x+r.w))-x,h:Math.max(...boxes.map(r=>r.y+r.h))-y};}
    function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;positionInspector();drawMinimap();});}
    function positionInspector(){
      const s=state(),panel=$('inspector'),one=selection.size===1&&find(s.selected),edge=s.selectedEdge>=0;
      panel.hidden=inspectorClosed||selectionModifier||gesture?.kind==='marquee'||(!one&&!edge);if(panel.hidden)return;
      $('inspectorTitle').textContent=one?one.name+' · 设置':'连接设置';
      $('inspectorBody').hidden=inspectorCollapsed;$('inspectorToggle').textContent=inspectorCollapsed?'展开':'收起';$('inspectorToggle').setAttribute('aria-expanded',String(!inspectorCollapsed));
      panel.classList.toggle('is-collapsed',inspectorCollapsed);panel.querySelector('.run').hidden=!one||!CanvasGraph.processors.has(one.kind);
      const r=viewport.getBoundingClientRect(),el=one?$('nodes').querySelector('[data-id="'+one.id+'"]'):null,box=el?.getBoundingClientRect();
      const topbar=document.querySelector('.studio-topbar').getBoundingClientRect(),toolBounds=document.querySelector('.tools').getBoundingClientRect(),bottomReserve=Math.max(44,innerHeight-toolBounds.top+10),minTop=Math.max(r.top+12,topbar.bottom+10),available=Math.max(80,innerHeight-minTop-bottomReserve);panel.style.maxHeight=available+'px';
      const width=Math.min(440,innerWidth-24);panel.style.width=width+'px';
      let left=box?box.right+18:r.left+r.width/2+24,top=box?box.top:r.top+90;
      if(left+width>innerWidth-12){left=box?box.left-width-18:innerWidth-width-12;}
      if(left<12){left=box?box.left:12;top=box?box.bottom+14:top;}
      panel.style.left=Math.max(12,Math.min(innerWidth-width-12,left))+'px';
      panel.style.top=Math.max(minTop,Math.min(innerHeight-Math.min(panel.offsetHeight,available)-bottomReserve,top))+'px';
    }
    function inspect(){schedule();}
    function renderSelection(){
      cleanSelection();const count=selection.size;
      $('selectionToolbar').hidden=count<2;$('selectionCount').textContent='已选 '+count+' 项';
      $('selectionToolbar').querySelectorAll('button').forEach(btn=>btn.disabled=state().locked);
      $('duplicateNode').disabled=state().locked||!count;
      $('groups').querySelectorAll('.canvas-group').forEach(el=>{const g=(graph()?.groups||[]).find(g=>g.id===el.dataset.group);el.classList.toggle('selected',!!g&&g.nodeIds.every(nid=>selection.has(nid)));});
      schedule();
    }
    function drawGroups(){
      const groups=graph()?.groups||[];
      $('groups').innerHTML=groups.map(group=>{const members=group.nodeIds.map(find).filter(Boolean),r=bounds(members);if(!r)return '';return '<section class="canvas-group" data-group="'+b.esc(group.id)+'" style="left:'+(r.x-24)+'px;top:'+(r.y-52)+'px;width:'+(r.w+48)+'px;height:'+(r.h+76)+'px"><header tabindex="0" aria-label="分组 '+b.esc(group.name)+'"><span>'+b.esc(group.name)+'</span><small>'+members.length+' 个节点 · 拖动标题移动分组</small></header></section>';}).join('');
    }
    function renderSearch(){
      const text=$('nodeSearch').value.trim().toLowerCase(),rows=(graph()?.nodes||[]).filter(n=>!text||[n.name,b.labels[n.kind],n.text||''].join(' ').toLowerCase().includes(text));
      $('nodeSearchResults').innerHTML=rows.length?rows.map(n=>'<button data-locate="'+n.id+'"><b>'+b.esc(n.name)+'</b><small>'+b.esc(b.labels[n.kind])+'</small></button>').join(''):'<p class="muted">没有找到节点，试试缩短关键词。</p>';
    }
    function render(){cleanSelection();drawGroups();renderSearch();renderSelection();}
    function drawMinimap(){
      if($('minimap').hidden||!graph())return;const all=graph().nodes,r=bounds(all),svg=$('minimap').querySelector('svg');if(!r){svg.innerHTML='';minimapMap=null;return;}
      const s=state(),view={x:-s.pan.x/s.zoom,y:-s.pan.y/s.zoom,w:viewport.clientWidth/s.zoom,h:viewport.clientHeight/s.zoom};
      const extent={x:Math.min(r.x-50,view.x),y:Math.min(r.y-50,view.y)},w=Math.max(r.x+r.w+50,view.x+view.w)-extent.x,h=Math.max(r.y+r.h+50,view.y+view.h)-extent.y,scale=Math.min(210/w,120/h);
      const ox=(220-w*scale)/2,oy=(130-h*scale)/2;minimapMap={...extent,scale,ox,oy};
      svg.innerHTML=all.map(n=>{const nr=nodeBounds(n);return '<rect class="map-node '+(selection.has(n.id)?'selected':'')+'" x="'+(ox+(nr.x-extent.x)*scale)+'" y="'+(oy+(nr.y-extent.y)*scale)+'" width="'+Math.max(2,nr.w*scale)+'" height="'+Math.max(2,nr.h*scale)+'" rx="1"/>';}).join('')+'<rect class="map-viewport" x="'+(ox+(view.x-extent.x)*scale)+'" y="'+(oy+(view.y-extent.y)*scale)+'" width="'+view.w*scale+'" height="'+view.h*scale+'"/>';
    }
    function closePanels(){for(const key of ['addPanel','navigatorPanel'])$(key).hidden=true;for(const key of ['toggleAdd','toggleNavigator'])$(key).setAttribute('aria-expanded','false');}
    function insertionPoint(){return contextPoint||{x:(viewport.clientWidth*.35-state().pan.x)/state().zoom,y:(viewport.clientHeight*.35-state().pan.y)/state().zoom};}
    function copy(){
      if(!graph()||!selection.size)return;cleanSelection();const ids=new Set(selection);
      clipboard={canvasId:state().doc.id,nodes:clone(selectedNodes()),edges:clone(graph().edges.filter(e=>ids.has(e.source)&&ids.has(e.target))),groups:clone((graph().groups||[]).filter(g=>g.nodeIds.every(nid=>ids.has(nid))))};pasteCount=0;
      b.message('已复制 '+ids.size+' 个节点及其内部连线；Ctrl+V 粘贴到当前画布。');
    }
    async function paste(at){
      if(state().locked)return;if(!clipboard||clipboard.canvasId!==state().doc.id){b.message('先复制当前画布中的节点。');return;}
      if(graph().nodes.length+clipboard.nodes.length>80)throw new Error('画布最多80个节点，请减少本次复制数量。');
      if(graph().edges.length+clipboard.edges.length>160)throw new Error('画布连线最多160条，请减少本次复制数量。');
      const map=new Map(clipboard.nodes.map(n=>[n.id,b.id()])),minX=Math.min(...clipboard.nodes.map(n=>n.x)),minY=Math.min(...clipboard.nodes.map(n=>n.y));pasteCount++;
      const dx=at?at.x-minX:60*pasteCount,dy=at?at.y-minY:70*pasteCount;
      const copies=clipboard.nodes.map(old=>{const n=clone(old);n.id=map.get(old.id);n.name=(old.name+' · 副本').slice(0,80);n.x+=dx;n.y+=dy;
        n.text=String(n.text||'').replace(/@\{canvas:([^:{}\s]+):([^{}\s]+)\}/g,(token,source,file)=>map.has(source)?'@{canvas:'+map.get(source)+':'+file+'}':find(source)?.name||'原素材');return n;});
      b.checkpoint();graph().nodes.push(...copies);graph().edges.push(...clipboard.edges.map(e=>({source:map.get(e.source),target:map.get(e.target)})));
      if(clipboard.groups.length){graph().groups=graph().groups||[];graph().groups.push(...clipboard.groups.map(g=>({id:b.id(),name:(g.name+' · 副本').slice(0,80),nodeIds:g.nodeIds.map(nid=>map.get(nid))})));}
      b.changed(copies.map(n=>n.id));choose(copies.map(n=>n.id),copies.at(-1)?.id);b.render();b.inspect();await b.save();
      b.message('已创建 '+copies.length+' 个副本，内部连线与素材引用已同步。原订单和生成结果不复制，也不会自动生成。');
    }
    async function duplicate(){if(state().locked||!selection.size)return;copy();await paste();}
    async function removeSelection(){
      if(state().locked||!selection.size)return;if(b.canRemove&&!b.canRemove([...selection])){b.message('所选节点参与当前生成，请在原任务结束后删除。');return;}const ids=new Set(selection),affected=graph().edges.filter(e=>ids.has(e.source)&&!ids.has(e.target)).map(e=>e.target);b.checkpoint();
      graph().nodes=graph().nodes.filter(n=>!ids.has(n.id));graph().edges=graph().edges.filter(e=>!ids.has(e.source)&&!ids.has(e.target));
      if(graph().groups)graph().groups=graph().groups.map(g=>({...g,nodeIds:g.nodeIds.filter(nid=>!ids.has(nid))})).filter(g=>g.nodeIds.length);
      choose([]);b.repairRun();b.changed(affected);b.render();b.inspect();await b.save();await b.refreshQuote();b.message('已删除 '+ids.size+' 个节点，可撤销恢复；本机素材和历史作品保留。');
    }
    async function groupSelection(){
      if(state().locked||selection.size<2)return;const canvasId=state().doc.id,ids=[...selection],name=await studioPrompt('给这组节点起个名字','创作分组');if(name===null||state().doc.id!==canvasId||state().locked)return;
      if(ids.some(nid=>!find(nid)))throw new Error('节点已改变，请重新选择。');b.checkpoint();graph().groups=(graph().groups||[]).map(g=>({...g,nodeIds:g.nodeIds.filter(nid=>!ids.includes(nid))})).filter(g=>g.nodeIds.length);
      graph().groups.push({id:b.id(),name:(name.trim()||'创作分组').slice(0,80),nodeIds:ids});b.changed([],true);render();await b.save();b.message('分组已保存。拖分组标题可一起移动；分组不影响生成输入。');
    }
    async function ungroup(){if(state().locked)return;const groups=graph()?.groups||[],targets=groups.filter(g=>g.nodeIds.some(nid=>selection.has(nid)));if(!targets.length){b.message('所选节点还没有分组。');return;}b.checkpoint();graph().groups=groups.filter(g=>!targets.includes(g));b.changed([],true);render();await b.save();b.message('已解散分组，节点和连接都保留。');}
    async function renameGroup(groupId){const current=(graph()?.groups||[]).find(g=>g.id===groupId);if(!current||state().locked)return;const canvasId=state().doc.id,name=await studioPrompt('分组名称',current.name);if(name===null||state().doc.id!==canvasId||state().locked)return;const group=(graph().groups||[]).find(g=>g.id===groupId);if(!group)return;b.checkpoint();group.name=(name.trim()||'创作分组').slice(0,80);b.changed([],true);render();await b.save();}
    async function arrange(mode){
      if(state().locked||state().layoutLocked)return;const rows=selectedNodes();if(rows.length<2)return;const before=b.snapshot(),r=bounds(rows);
      if(mode==='align-left')rows.forEach(n=>{n.x=r.x;});
      else{const sorted=rows.slice().sort((a,c)=>a.y-c.y||a.x-c.x),columns=Math.ceil(Math.sqrt(rows.length));let y=r.y;for(let i=0;i<sorted.length;i+=columns){const chunk=sorted.slice(i,i+columns);chunk.forEach((n,j)=>{n.x=r.x+j*340;n.y=y;});y+=Math.max(...chunk.map(n=>nodeBounds(n).h))+80;}}
      b.commitLayout(before);b.render();await b.save();b.message('已整理所选节点位置，连线与生成内容未改变。');
    }
    function locate(nid){const n=find(nid);if(!n)return;const r=nodeBounds(n),s=state();b.setViewport({x:viewport.clientWidth*.42-(r.x+r.w/2)*s.zoom,y:viewport.clientHeight*.4-(r.y+Math.min(r.h,300)/2)*s.zoom});selection=new Set([nid]);b.select(nid);closePanels();}
    const menuButton=(action,label,disabled=false)=>'<button role="menuitem" data-studio-action="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
    function showContext(event){
      if(!graph()||event.target.closest('input,textarea,[contenteditable],video,dialog')||state().gesture||gesture)return;
      event.preventDefault();closePanels();contextPoint=worldPoint(event);const el=event.target.closest('.node[data-id]'),wire=event.target.closest('[data-edge]'),group=event.target.closest('[data-group]'),block=state().locked;let html='';
      if(el){const nid=el.dataset.id;if(!selection.has(nid)){selection=new Set([nid]);b.select(nid);}html='<b>'+b.esc(selection.size>1?'已选 '+selection.size+' 个节点':find(nid).name)+'</b>'+menuButton('settings','编辑节点设置',selection.size!==1)+menuButton('copy','复制 Ctrl+C',block)+menuButton('duplicate','创建副本 Ctrl+D',block)+menuButton('group','组成一组',block||selection.size<2)+menuButton('ungroup','解散所在分组',block)+menuButton('align-left','左对齐',block||selection.size<2||state().layoutLocked)+menuButton('arrange','网格排列',block||selection.size<2||state().layoutLocked);
        const result=selection.size===1&&el.querySelector('[data-result]');if(result){html+='<hr>'+menuButton('view-result','放大查看结果')+menuButton('download-result','另存结果到电脑')+menuButton('save-result','收藏结果到作品库',block);}html+='<hr>'+menuButton('delete','删除所选节点',block);
      }else if(wire){const index=Number(wire.dataset.edge);b.setEdge(index);html='<b>连接操作</b>'+menuButton('rewire-source','改接来源',block)+menuButton('rewire-target','改接目标',block)+menuButton('disconnect','断开连接',!b.canDisconnect(index));
      }else if(group){const g=(graph().groups||[]).find(g=>g.id===group.dataset.group);if(g)choose(g.nodeIds);$('canvasContextMenu').dataset.group=group.dataset.group;html='<b>分组</b>'+menuButton('rename-group','重命名分组',block)+menuButton('duplicate','复制整个分组',block)+menuButton('ungroup','解散分组',block)+menuButton('arrange','排列组内节点',block||state().layoutLocked)+menuButton('delete','删除组内节点',block);
      }else{html='<b>在这里添加节点</b>'+Object.entries(b.labels).map(([kind,label])=>menuButton('add:'+kind,label,block)).join('')+'<hr>'+menuButton('paste','粘贴 Ctrl+V',block||!clipboard)+menuButton('select-all','全选节点')+menuButton('fit','显示全部节点');}
      if(el&&selection.size===1&&find(el.dataset.id)?.kind==='prompt'&&b.openAssistant)html+='<hr>'+menuButton('assistant','协作 AI · 改写这段文字',block);
      if(b.openDirector)html+='<hr>'+menuButton('director','打开导演台 · 本地构图',block);
      const menu=$('canvasContextMenu');menu.innerHTML=html;menu.hidden=false;menu.style.left=Math.min(innerWidth-menu.offsetWidth-10,Math.max(10,event.clientX))+'px';menu.style.top=Math.min(innerHeight-menu.offsetHeight-10,Math.max(10,event.clientY))+'px';
    }
    async function action(key){
      const at=contextPoint;$('canvasContextMenu').hidden=true;
      if(key==='assistant')return b.openAssistant?.();if(key==='director')return b.openDirector?.();
      if(key==='copy')return copy();if(key==='paste')return paste(at);if(key==='duplicate')return duplicate();if(key==='delete')return removeSelection();if(key==='group')return groupSelection();if(key==='ungroup')return ungroup();if(['arrange','align-left'].includes(key))return arrange(key);
      if(key==='rename-group')return renameGroup($('canvasContextMenu').dataset.group);
      if(key==='settings'){inspectorClosed=false;inspectorCollapsed=false;b.inspect();return;}
      if(key==='select-all'){choose(graph().nodes.map(n=>n.id));return;}if(key==='fit'){$('fit').click();return;}
      if(key.startsWith('add:')){if(state().locked)return;b.add(key.slice(4),at);await b.refreshQuote();return;}
      if(key==='disconnect')return b.disconnect();if(key==='rewire-source'||key==='rewire-target'){$(key==='rewire-source'?'rewireSource':'rewireTarget')?.click();return;}
      if(key.endsWith('-result')){const el=$('nodes').querySelector('[data-id="'+state().selected+'"]'),action=key.split('-')[0],button=el?.querySelector('[data-result-action="'+(action==='view'?'view':action==='download'?'download':'save')+'"]');if(button)button.click();}
    }
    function capture(event){
      if(event.button!==0||!graph()||state().gesture||gesture||event.target.closest('button,input,select,textarea,video,a,.port,.wire-line,.wire-hit,.wire-grip,.wire-handle,#minimap,#selectionToolbar'))return;
      if(space){event.preventDefault();event.stopImmediatePropagation();gesture={kind:'pan',pointerId:event.pointerId,sx:event.clientX,sy:event.clientY,originPan:{...state().pan},moved:false};viewport.setPointerCapture(event.pointerId);return;}
      const header=event.target.closest('.node[data-id]>header'),groupHeader=event.target.closest('.canvas-group>header');
      if(header||groupHeader){
        if(state().locked)return;event.preventDefault();event.stopImmediatePropagation();const previousRun=state().runNodeId,g=groupHeader&&(graph().groups||[]).find(g=>g.id===groupHeader.parentElement.dataset.group),nid=header?.parentElement.dataset.id;
        if(g)choose(g.nodeIds);else if(event.shiftKey){toggleSelection(nid);b.suppress();if(!selection.has(nid))return;}else if(!selection.has(nid)){selection=new Set([nid]);b.select(nid,true);}else b.select(nid,true);
        if(state().layoutLocked){b.message('布局已锁定；解锁后可拖动所选节点。');return;}
        gesture={kind:'nodes',pointerId:event.pointerId,sx:event.clientX,sy:event.clientY,before:b.snapshot(),origins:selectedNodes().map(n=>({id:n.id,x:n.x,y:n.y})),moved:false,needsQuote:state().runNodeId!==previousRun};viewport.setPointerCapture(event.pointerId);return;
      }
      if(event.target.closest('.node,.canvas-group,#selectionToolbar,#minimap'))return;
      const selectMode=$('interactionMode').value==='select',marquee=!space&&(event.ctrlKey||event.metaKey||selectMode);
      if(marquee){event.preventDefault();event.stopImmediatePropagation();const p=worldPoint(event);gesture={kind:'marquee',pointerId:event.pointerId,sx:event.clientX,sy:event.clientY,start:p,beforeSelection:event.shiftKey?[...selection]:[],moved:false};viewport.setPointerCapture(event.pointerId);$('marquee').hidden=false;updateMarquee(event);}
    }
    function updateMarquee(event){const r=viewport.getBoundingClientRect(),x=Math.min(gesture.sx,event.clientX)-r.left,y=Math.min(gesture.sy,event.clientY)-r.top,w=Math.abs(event.clientX-gesture.sx),h=Math.abs(event.clientY-gesture.sy);Object.assign($('marquee').style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});const p=worldPoint(event),left=Math.min(p.x,gesture.start.x),top=Math.min(p.y,gesture.start.y),right=Math.max(p.x,gesture.start.x),bottom=Math.max(p.y,gesture.start.y),hits=graph().nodes.filter(n=>{const nr=nodeBounds(n);return nr.x<right&&nr.x+nr.w>left&&nr.y<bottom&&nr.y+nr.h>top;});choose([...new Set([...gesture.beforeSelection,...hits.map(n=>n.id)])]);}
    function move(event){if(!gesture||event.pointerId!==gesture.pointerId)return;event.stopImmediatePropagation();const dx=event.clientX-gesture.sx,dy=event.clientY-gesture.sy;if(Math.hypot(dx,dy)<5&&!gesture.moved)return;gesture.moved=true;
      if(gesture.kind==='pan'){b.setViewport({x:gesture.originPan.x+dx,y:gesture.originPan.y+dy});return;}
      if(gesture.kind==='marquee'){updateMarquee(event);return;}const zoom=state().zoom;for(const origin of gesture.origins){const n=find(origin.id);if(!n)continue;n.x=origin.x+dx/zoom;n.y=origin.y+dy/zoom;const el=$('nodes').querySelector('[data-id="'+n.id+'"]');if(el){el.style.left=n.x+'px';el.style.top=n.y+'px';}}scheduleGeometry254();
    }
    async function end(event){if(!gesture||event.pointerId!==gesture.pointerId)return;event.stopImmediatePropagation();const last=gesture;gesture=null;$('marquee').hidden=true;if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);b.suppress();if(last.kind==='nodes'&&last.moved){b.commitLayout(last.before);await b.save();}else if(last.kind==='marquee'&&!last.moved)choose([]);b.settleRender();render();if(last.needsQuote)await b.refreshQuote();}
    function cancel(){if(!gesture)return;const last=gesture;gesture=null;$('marquee').hidden=true;if(last.kind==='nodes'){for(const origin of last.origins){const n=find(origin.id);if(n){n.x=origin.x;n.y=origin.y;}}}else if(last.kind==='pan')b.setViewport(last.originPan);else choose(last.beforeSelection);if(viewport.hasPointerCapture(last.pointerId))viewport.releasePointerCapture(last.pointerId);b.render();}
    viewport.addEventListener('pointerdown',capture,true);viewport.addEventListener('pointermove',move,true);viewport.addEventListener('pointerup',safe(end),true);viewport.addEventListener('pointercancel',cancel,true);viewport.addEventListener('lostpointercapture',()=>{if(gesture)cancel();},true);
    viewport.addEventListener('contextmenu',showContext);
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('#canvasContextMenu'))$('canvasContextMenu').hidden=true;if(!event.target.closest('#addPanel,#toggleAdd,#navigatorPanel,#toggleNavigator'))closePanels();});
    $('canvasContextMenu').onclick=safe(event=>{const button=event.target.closest('[data-studio-action]');if(button&&!button.disabled)return action(button.dataset.studioAction);});
    $('selectionToolbar').onclick=safe(event=>{const button=event.target.closest('[data-studio-action]');if(button&&!button.disabled)return action(button.dataset.studioAction);});
    $('toggleAdd').onclick=()=>{const show=$('addPanel').hidden;closePanels();$('addPanel').hidden=!show;$('toggleAdd').setAttribute('aria-expanded',String(show));contextPoint=null;};
    $('toggleNavigator').onclick=()=>{const show=$('navigatorPanel').hidden;closePanels();$('navigatorPanel').hidden=!show;$('toggleNavigator').setAttribute('aria-expanded',String(show));if(show){renderSearch();$('nodeSearch').focus();}};
    $('nodeSearch').oninput=renderSearch;$('nodeSearchResults').onclick=event=>{const button=event.target.closest('[data-locate]');if(button)locate(button.dataset.locate);};
    $('toggleMinimap').onclick=()=>{$('minimap').hidden=!$('minimap').hidden;$('toggleMinimap').setAttribute('aria-pressed',String(!$('minimap').hidden));drawMinimap();};
    $('minimap').querySelector('svg').onclick=event=>{if(!minimapMap)return;const r=event.currentTarget.getBoundingClientRect(),p=minimapMap,x=((event.clientX-r.left)*220/r.width-p.ox)/p.scale+p.x,y=((event.clientY-r.top)*130/r.height-p.oy)/p.scale+p.y;b.setViewport({x:viewport.clientWidth/2-x*state().zoom,y:viewport.clientHeight/2-y*state().zoom});};
    $('inspectorClose').onclick=()=>{inspectorClosed=true;positionInspector();};$('inspectorToggle').onclick=()=>{inspectorCollapsed=!inspectorCollapsed;positionInspector();};
    $('shortcutsHelp').onclick=()=>$('shortcutsDialog').showModal();$('closeShortcuts').onclick=()=>$('shortcutsDialog').close();
    $('groups').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){const group=(graph()?.groups||[]).find(g=>g.id===event.target.closest('[data-group]')?.dataset.group);if(group){event.preventDefault();choose(group.nodeIds);}}});
    document.addEventListener('keydown',safe(async event=>{
      if(document.body.classList.contains('canvas-gallery-active'))return;
      if(event.key==='Escape'){if(gesture){event.preventDefault();event.stopImmediatePropagation();cancel();return;}$('canvasContextMenu').hidden=true;closePanels();}
      if(ignoreKeys(event)||!graph()||document.querySelector('dialog[open]'))return;
      if(event.key==='Shift'){selectionModifier=true;positionInspector();}
      if(event.code==='Space'){space=true;event.preventDefault();viewport.classList.add('space-pan');}
      if(gesture||state().gesture)return;const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
      if(mod&&['c','v','d','a','y'].includes(key)){event.preventDefault();event.stopImmediatePropagation();if(key==='c')copy();if(key==='v')await paste();if(key==='d')await duplicate();if(key==='a')choose(graph().nodes.map(n=>n.id));if(key==='y')await b.historyStep(false);}
      if(['Delete','Backspace'].includes(event.key)&&selection.size){event.preventDefault();event.stopImmediatePropagation();await removeSelection();}
    }),true);
    document.addEventListener('keyup',event=>{if(event.key==='Shift'){selectionModifier=false;schedule();}if(event.code==='Space'){space=false;viewport.classList.remove('space-pan');}});
    window.addEventListener('blur',()=>{space=false;selectionModifier=false;viewport.classList.remove('space-pan');cancel();schedule();});window.addEventListener('resize',schedule);
    new ResizeObserver(schedule).observe($('inspector'));
    return{resetDocument,resetSelection,toggleSelection,isSelected:nid=>selection.has(nid),render,renderSelection,inspect,schedule,dragging:()=>!!gesture,showInspector:()=>{inspectorClosed=false;},hideInspector:()=>{inspectorClosed=true;positionInspector();},insertionPoint,closePanels,duplicate,removeSelection};
  }
  root.CanvasStudio252={create};
})(window);

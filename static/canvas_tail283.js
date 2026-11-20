'use strict';
(function(global){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function candidates(doc,targetId){
    const rows=[];
    const dependencies=[...(doc?.graph?.edges||[]),...(doc?.graph?.nodes||[]).filter(n=>n.settings?.tailFrameContinuation&&n.settings.tailSourceNodeId).map(n=>({source:n.settings.tailSourceNodeId,target:n.id}))],downstream=new Set([targetId]);
    for(let changed=true;changed;){changed=false;for(const edge of dependencies)if(downstream.has(edge.source)&&!downstream.has(edge.target)){downstream.add(edge.target);changed=true;}}
    for(const source of doc?.graph?.nodes||[]){
      if(downstream.has(source.id)||source.kind!=='generator')continue;
      const versions=(doc.results||[]).filter(row=>row.nodeId===source.id&&(row.media||'video')==='video'&&row.file);
      const output=doc.nodeOutputs?.[source.id];
      versions.forEach((row,index)=>{if(!row.deleted)rows.push({...row,nodeId:source.id,nodeName:source.name||'视频生成',version:index+1,current:row.file===output?.file});});
    }
    return rows;
  }
  function issue(doc,target){
    if(target?.kind!=='generator'||target.settings?.tailFrameContinuation!==true)return '';
    const s=target.settings;
    if(!s.tailSourceNodeId||!s.tailSourceFile)return '请先选择尾帧续画要衔接的视频与版本。';
    if(!candidates(doc,target.id).some(row=>row.nodeId===s.tailSourceNodeId&&row.file===s.tailSourceFile))return '所选衔接视频已移除或不可用，请重新选择。';
    return '';
  }
  function create(bridge){
    const dialog=document.createElement('dialog');dialog.id='canvasTailDialog283';dialog.className='canvas-tail-dialog283';document.body.append(dialog);
    let owner=null;const previewErrors=new Map();
    const previewKey=n=>[bridge.state().doc?.id,n.id,n.settings.tailSourceNodeId,n.settings.tailSourceFile].join(':');
    const current=()=>owner&&bridge.state().doc?.id===owner.canvasId&&bridge.state().selected===owner.nodeId&&bridge.state().doc.graph.nodes.includes(owner.node);
    const close=()=>{dialog.close();owner=null;};
    const preview=row=>row.tailFrameFile?'<img src="'+esc(bridge.media(row.tailFrameFile))+'" alt="所选视频尾帧">':'<video muted playsinline preload="metadata" src="'+esc(bridge.media(row.file))+'#t=0.1" aria-label="所选视频版本预览"></video>';
    const title=row=>esc(row.nodeName)+' · 第 '+row.version+' 版'+(row.current?' · 当前版本':'');
    function open(n){
      if(bridge.locked(n.id))return;const state=bridge.state(),rows=candidates(state.doc,n.id);
      owner={canvasId:state.doc.id,nodeId:n.id,node:n};
      dialog.innerHTML='<form method="dialog"><header><div><b>选择衔接视频</b><p>明确选择本画布的视频版本，使用它的尾帧继续画面。</p></div><button value="cancel" aria-label="关闭衔接视频选择">×</button></header><div class="canvas-tail-options283">'+(rows.length?rows.map((row,i)=>'<label><input type="radio" name="tailChoice283" value="'+i+'" '+(row.nodeId===n.settings.tailSourceNodeId&&row.file===n.settings.tailSourceFile?'checked':'')+'><span>'+preview(row)+'<b>'+title(row)+'</b><small>'+esc(row.name||row.modelName||'已生成视频')+'</small></span></label>').join(''):'<p>本画布还没有其他已生成的视频。先生成一张视频卡，再回到这里选择。</p>')+'</div><p class="muted">选择只绑定此视频版本；来源卡之后重新生成不会自动更换。不会按卡片位置或连线替你指定来源。</p><footer><button value="cancel">取消</button><button type="button" data-tail-confirm283 '+(!rows.some(row=>row.nodeId===n.settings.tailSourceNodeId&&row.file===n.settings.tailSourceFile)?'disabled':'')+'>使用所选视频</button></footer></form>';
      dialog.onchange=()=>{dialog.querySelector('[data-tail-confirm283]').disabled=!dialog.querySelector('[name="tailChoice283"]:checked');};
      dialog.querySelector('[data-tail-confirm283]').onclick=async()=>{
        if(!current()||bridge.locked(n.id)){close();return;}
        const row=rows[Number(dialog.querySelector('[name="tailChoice283"]:checked')?.value)];
        if(!row||!candidates(bridge.state().doc,n.id).some(item=>item.nodeId===row.nodeId&&item.file===row.file)){close();bridge.notify('所选视频已变化，请重新选择。',true);return;}
        previewErrors.clear();close();await bridge.commit(n,{tailFrameContinuation:true,tailSourceNodeId:row.nodeId,tailSourceFile:row.file});
      };
      dialog.showModal();
    }
    dialog.addEventListener('close',()=>{owner=null;});
    function sync(){if(owner&&!current())close();}
    function mount(n,fields){
      sync();if(n.kind!=='generator')return;
      fields.querySelector('.canvas-tail-fields283')?.remove();
      const section=document.createElement('section');section.className='canvas-tail-fields283';const enabled=n.settings?.tailFrameContinuation===true;
      const row=candidates(bridge.state().doc,n.id).find(item=>item.nodeId===n.settings.tailSourceNodeId&&item.file===n.settings.tailSourceFile),problem=issue(bridge.state().doc,n)||previewErrors.get(previewKey(n))||'';
      section.innerHTML='<label class="canvas-tail-toggle283"><input type="checkbox" data-tail-enabled283 '+(enabled?'checked':'')+'><span>尾帧续画</span></label>'+(enabled?'<div class="canvas-tail-selection283">'+(row?preview(row)+'<p>'+title(row)+'</p>':'')+(problem?'<p class="canvas-tail-issue283" role="status">'+esc(problem)+'</p>':'<small>已绑定此版本的尾帧，来源重新生成不会自动更换。</small>')+'<div><button type="button" data-tail-choose283>'+(row?'更换衔接视频':'选择衔接视频')+'</button><button type="button" data-tail-clear283>取消衔接</button></div></div>':'');
      const anchor=fields.querySelector('[data-setting="ratio"]')?.closest('label');if(anchor)anchor.after(section);else fields.append(section);
      const active=()=>bridge.state().selected===n.id&&bridge.state().doc.graph.nodes.includes(n)&&!bridge.locked(n.id);
      section.querySelector('[data-tail-enabled283]').onchange=async event=>{event.stopPropagation();if(!active())return;await bridge.commit(n,{tailFrameContinuation:event.target.checked,tailSourceNodeId:'',tailSourceFile:''});};
      section.querySelector('[data-tail-choose283]')?.addEventListener('click',()=>{if(active())open(n);});
      section.querySelector('[data-tail-clear283]')?.addEventListener('click',async()=>{if(active())await bridge.commit(n,{tailFrameContinuation:false,tailSourceNodeId:'',tailSourceFile:''});});
      for(const control of section.querySelectorAll('button,input'))control.disabled=bridge.locked(n.id);
      if(enabled&&row&&bridge.preview){const key=previewKey(n);Promise.resolve(bridge.preview(n)).then(url=>{
        if(!url||!section.isConnected||!active()||key!==previewKey(n))return;
        const image=new Image();image.alt='所选视频最后一帧';
        image.onload=()=>{if(!section.isConnected||!active()||key!==previewKey(n))return;previewErrors.delete(key);section.querySelector('.canvas-tail-selection283>video,.canvas-tail-selection283>img')?.replaceWith(image);section.querySelector('.canvas-tail-issue283')?.remove();bridge.previewChanged?.();};
        image.onerror=()=>{if(!section.isConnected||!active()||key!==previewKey(n))return;const message='所选视频尾帧读取失败，请更换衔接视频后重试。';previewErrors.set(key,message);let warning=section.querySelector('.canvas-tail-issue283');if(!warning){warning=document.createElement('p');warning.className='canvas-tail-issue283';warning.setAttribute('role','status');section.querySelector('.canvas-tail-selection283').append(warning);}warning.textContent=message;bridge.previewChanged?.();};image.src=url;
      }).catch(()=>{});}
    }
    return {mount,sync,issue:n=>issue(bridge.state().doc,n)||(n?.settings?.tailFrameContinuation?previewErrors.get(previewKey(n))||'':''),destroy:()=>{close();dialog.remove();}};
  }
  const api={create,candidates,issue};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.CanvasTail283=api;
})(typeof globalThis!=='undefined'?globalThis:window);

'use strict';
window.CanvasProjectGallery = (() => {
  function create({root, list, open, createProject, remove, confirm, showRemoved, formatDate, escape, notify}) {
    const search=root.querySelector('[type="search"]'), grid=root.querySelector('[data-project-grid]');
    const status=root.querySelector('[data-project-status]');
    const createButton=root.querySelector('[data-gallery-create]');
    const selectAll=root.querySelector('[data-gallery-select-all]');
    const selectedCount=root.querySelector('[data-gallery-selected-count]');
    const deleteSelected=root.querySelector('[data-gallery-delete-selected]');
    const toolbarActions=root.querySelectorAll('[data-gallery-action]');
    const selected=new Set(), failures=new Map();
    let projects=[], rows=[], loading=false, busy=false, error='', feedback='', requestId=0;

    function updateControls() {
      const count=selected.size;
      search.disabled=busy;
      createButton.disabled=busy;
      toolbarActions.forEach(button=>button.disabled=busy);
      selectAll.disabled=busy||loading||!rows.length;
      selectAll.checked=rows.length>0&&count===rows.length;
      selectAll.indeterminate=count>0&&count<rows.length;
      selectedCount.textContent=`已选 ${count} 个`;
      deleteSelected.disabled=busy||loading||!count;
      grid.querySelectorAll('[data-gallery-project]').forEach(card=>{
        const checked=selected.has(card.dataset.galleryProject);
        card.classList.toggle('is-selected',checked);
        const checkbox=card.querySelector('[data-gallery-select]');
        checkbox.checked=checked;
        checkbox.disabled=busy||loading;
        card.querySelector('[data-gallery-delete]').disabled=busy||loading;
        card.querySelector('[data-project-id]').disabled=busy;
      });
    }

    function updateStatus() {
      const count=`${rows.length} 个项目${search.value.trim()?` · 共 ${projects.length} 个`:''}`;
      status.textContent=error||feedback||(loading?'正在读取已保存的画布…':count);
      status.classList.toggle('is-error',Boolean(error));
    }

    function render() {
      const term=search.value.trim().toLocaleLowerCase();
      rows=projects.filter(row=>String(row.name||'').toLocaleLowerCase().includes(term));
      const visibleIds=new Set(rows.map(row=>row.id));
      for(const id of selected)if(!visibleIds.has(id))selected.delete(id);
      if(!rows.length){
        const hint=loading?'正在读取项目':term?'没有找到匹配的项目':error?'暂时无法读取项目':'还没有画布项目';
        grid.innerHTML=`<div class="canvas-gallery-empty"><span aria-hidden="true">◇</span><strong>${hint}</strong><p>${term?'换个名称再搜一次。':error?'点击刷新重试。':loading?'请稍候。':'点击“新建画布”开始创作。'}</p></div>`;
      } else {
        grid.innerHTML=rows.map(row=>{
          const id=escape(row.id), title=escape(row.name||'未命名画布');
          const failure=failures.get(row.id);
          const cover=typeof row.coverUrl==='string'&&row.coverUrl.startsWith('/api/canvas/cover?')?row.coverUrl:'';
          return `<article class="canvas-gallery-card" data-gallery-project="${id}">
            <button type="button" class="canvas-gallery-project" data-project-id="${id}">
              <span class="canvas-gallery-cover"><span class="canvas-gallery-mark" aria-hidden="true">N·TV</span>${cover?`<img src="${escape(cover)}" alt="" loading="lazy" decoding="async">`:''}</span>
              <span class="canvas-gallery-meta"><strong title="${title}">${title}</strong><small>${escape(formatDate(row))}</small><span class="canvas-gallery-arrow" aria-hidden="true">→</span></span>
            </button>
            <div class="canvas-gallery-card-actions">
              <label class="canvas-gallery-check"><input type="checkbox" data-gallery-select="${id}" aria-label="选择项目：${title}"> 选择</label>
              <button type="button" data-gallery-delete="${id}" aria-label="删除项目：${title}">删除</button>
            </div>
            ${failure?`<p class="canvas-gallery-delete-error">${escape(failure)}</p>`:''}
          </article>`;
        }).join('');
      }
      updateControls();
      updateStatus();
    }

    async function refresh() {
      const ticket=++requestId;
      error='';feedback='';loading=true;
      if(projects.length){updateControls();updateStatus();}else render();
      try {
        const result=await list();
        if(ticket===requestId)projects=result.filter(row=>!row.deleted&&/^[a-f0-9]{32}$/.test(row.id));
      } catch (failure) {
        if(ticket===requestId)error='读取项目失败。'+failure.message;
      } finally {
        if(ticket===requestId){loading=false;render();}
      }
    }

    async function perform(work, label) {
      if(busy)return;
      const focus=document.activeElement;
      busy=true;error='';feedback='';updateControls();updateStatus();
      let replacementFocus;
      try {replacementFocus=await work();}
      catch (failure) {
        error=label+'失败。'+failure.message;
        if(root.hidden)notify(error,true);
      }
      finally {
        busy=false;updateControls();updateStatus();
        const target=replacementFocus instanceof HTMLElement?replacementFocus:focus;
        if(!root.hidden&&target?.isConnected&&!target.disabled)target.focus();
      }
    }

    function removeProject(id) {
      // A list response started before the deletion must not restore the card.
      requestId++;loading=false;
      projects=projects.filter(row=>row.id!==id);
      selected.delete(id);failures.delete(id);
      if(!busy&&!root.hidden)render();
    }

    function deleteProjects(ids) {
      if(busy||loading||!ids.length)return;
      const requested=new Set(ids);
      const targets=rows.filter(row=>requested.has(row.id));
      if(!targets.length)return;
      return perform(async()=>{
        const total=targets.length;
        const scope=total===1?`项目“${targets[0].name||'未命名画布'}”`:`选中的 ${total} 个项目`;
        if(!await confirm(`确定将${scope}移入“已删除项目”？可随时恢复，素材、生成结果和原订单都会保留。`,{title:total===1?'删除项目':'批量删除项目'}))return;
        let removed=0;
        for(const [index, row] of targets.entries()){
          feedback=`正在删除项目 ${index+1}/${total}…`;updateStatus();
          try {
            await remove(row.id);
            removeProject(row.id);
            removed++;
          } catch (failure) {
            failures.set(row.id,failure.message||'删除未确认，请刷新列表后再试。');
          }
        }
        const pending=total-removed;
        feedback=removed?`已将 ${removed} 个项目移入“已删除项目”，可在其中恢复。`:'';
        if(pending)error=`${removed?`已删除 ${removed} 个，`:''}${pending} 个项目未确认删除，请查看卡片提示。`;
        render();
        const failed=targets.find(row=>failures.has(row.id));
        return (failed&&grid.querySelector(`[data-gallery-delete="${failed.id}"]`))||search;
      },'删除项目');
    }

    createButton.onclick=()=>perform(createProject,'新建画布');
    grid.onclick=event=>{
      const removeButton=event.target.closest('[data-gallery-delete]');
      if(removeButton)return deleteProjects([removeButton.dataset.galleryDelete]);
      const openButton=event.target.closest('[data-project-id]');
      if(openButton)return openDocument(openButton.dataset.projectId);
    };
    grid.onchange=event=>{
      const checkbox=event.target.closest('[data-gallery-select]');
      if(!checkbox||busy||loading)return;
      if(checkbox.checked)selected.add(checkbox.dataset.gallerySelect);
      else selected.delete(checkbox.dataset.gallerySelect);
      updateControls();
    };
    selectAll.onchange=()=>{
      if(busy||loading)return;
      selected.clear();
      if(selectAll.checked)rows.forEach(row=>selected.add(row.id));
      updateControls();
    };
    deleteSelected.onclick=()=>deleteProjects([...selected]);
    function openDocument(canvasId){return perform(()=>open(canvasId),'打开画布');}
    grid.addEventListener('error',event=>{
      if(event.target.tagName==='IMG')event.target.remove();
    },true);
    search.oninput=()=>{feedback='';error='';render();};
    root.querySelector('[data-gallery-action="refresh"]').onclick=refresh;
    root.querySelector('[data-gallery-action="removed"]').onclick=()=>perform(showRemoved,'读取已删除项目');

    return {
      visible:()=>!root.hidden,
      openDocument,
      removeProject,
      show(focus=false){
        root.hidden=false;document.body.classList.add('canvas-gallery-active');
        refresh();
        if(focus)root.querySelector('h1').focus();
      },
      hide(){root.hidden=true;document.body.classList.remove('canvas-gallery-active');}
    };
  }
  return {create};
})();

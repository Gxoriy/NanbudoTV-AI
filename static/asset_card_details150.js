/* Local fold only: existing nodes/listeners/settings are moved, never rebuilt. */
(function(root){
  'use strict';
  const opened=new Set();
  function enhance(container,projectId){
    for(const card of container.querySelectorAll('.visual-card[data-id][data-kind]')){
      const body=card.querySelector('.visual-card-body'),actions=card.querySelector('.visual-card-actions'),preview=card.querySelector('.visual-card-preview');
      if(!body||!actions||!card.querySelector('.asset-edit-toggle'))continue;
      const key=JSON.stringify([projectId,card.dataset.kind,card.dataset.id]);
      let details=body.querySelector(':scope > details.asset-card-details');
      if(!details){
        details=body.ownerDocument.createElement('details');details.className='asset-card-details';details.dataset.assetDetailKey=key;
        const summary=body.ownerDocument.createElement('summary');summary.innerHTML='<span class="asset-detail-expand">展开详情</span><span class="asset-detail-collapse">收起详情</span>';
        details.append(summary);details.open=opened.has(key);
        details.id='asset-details-'+[projectId,card.dataset.kind,card.dataset.id].join('-');
        details.addEventListener('toggle',()=>{if(!details.isConnected)return;if(details.open)opened.add(key);else {opened.delete(key);card.dispatchEvent(new CustomEvent('asset-details-closed'));}});
        body.insertBefore(details,actions);
        const extras=body.ownerDocument.createElement('div');extras.className='asset-extra-actions';details.append(extras);
        actions.addEventListener('click',event=>{if(event.target.closest('.asset-edit-toggle'))details.open=true;},true);
        actions.addEventListener('click',event=>{if(event.target.closest('.asset-edit-toggle')&&details.querySelector('.asset-edit-panel')?.hidden)details.open=false;});
      }
      const extra=details.querySelector('.asset-extra-actions');
      for(const node of Array.from(body.children)){
        if(node===details||node===actions||node.matches('.visual-select-item,b,.asset-variant-control198,.asset-speech-summary'))continue;
        details.insertBefore(node,extra);
      }
      for(const node of Array.from(actions.children)){
        if(!node.matches('.asset-generate,.asset-edit-toggle,.delete-asset'))extra.append(node);
      }
      const selection=card.querySelector('.visual-select-item');
      if(selection&&preview){
        selection.classList.add('asset-image-selection');
        selection.setAttribute('aria-label','选择'+(body.querySelector(':scope>b')?.textContent||'资产'));
        selection.querySelector('input')?.setAttribute('aria-label',selection.getAttribute('aria-label'));
        for(const node of Array.from(selection.childNodes))if(node.nodeType===3)node.remove();
        preview.append(selection);
        if(!selection.dataset.overlayBound){selection.dataset.overlayBound='1';selection.addEventListener('click',event=>event.stopPropagation());}
      }
      body.append(actions);
    }
  }
  root.AssetCardDetails=Object.freeze({enhance});
})(window);

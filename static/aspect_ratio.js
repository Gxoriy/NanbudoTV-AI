/* Collapsible ratio choices. Original select values, capabilities and events stay authoritative. */
(function (root) {
  'use strict';
  const entries = new Map();
  let nextId = 0;
  const ratioPattern = /(?:^|[^\d])(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)(?:$|[^\d])/;
  const ratioValuePattern = /^\s*\d+(?:\.\d+)?\s*[:：]\s*\d+(?:\.\d+)?\s*$/;
  const legacyRatioFields = new Set(['orientation', 'sourceRoleLayout', 'sourceSceneLayout',
    'visualRoleLayout', 'visualSceneLayout', 'wizardRoleLayout', 'wizardSceneLayout']);
  function info(option) {
    const match = String(option.value).match(ratioPattern) || String(option.textContent).match(ratioPattern);
    if (!match) return null;
    const width=Number(match[1]),height=Number(match[2]); if (!(width>0&&height>0)) return null;
    const ratio=match[1]+':'+match[2],name=width===height?'方形':width/height>=2?'宽银幕':width>height?'横屏':'竖屏';
    const original=String(option.textContent).replace(ratioPattern,' ').replace(/[·\s]+$/,'').trim();
    return {width,height,ratio,name,context:!String(option.value).match(ratioPattern)&&original&&!/^(横屏|竖屏|方形|宽银幕)/.test(original)?original:''};
  }
  function label(ratio) { const value=info({value:ratio,textContent:ratio}); return value ? value.name+' '+value.ratio : String(ratio||''); }
  function markup(ratio) { const value=info({value:ratio,textContent:ratio}); if(!value)return ''; const scale=Math.min(24/value.width,18/value.height); return '<i class="aspect-ratio-inline-shape" aria-hidden="true" style="width:'+(value.width*scale)+'px;height:'+(value.height*scale)+'px"></i> '+label(ratio); }
  function eligible(select) {
    const options=Array.from(select.options).filter(o=>o.value);
    // Project labels contain update times such as 06:57. Only actual ratio
    // values, or the existing explicitly identified layout fields, qualify.
    return options.length>0 && options.every(o=>
      (ratioValuePattern.test(String(o.value)) || legacyRatioFields.has(select.id)) && info(o));
  }
  function disabled(select) { return select.matches(':disabled'); }
  function optionDisabled(option) { return option.disabled || !!option.closest('optgroup:disabled'); }
  function optionHidden(option) { return option.hidden || !!option.closest('optgroup[hidden]'); }
  function signature(select) { return JSON.stringify([select.value,disabled(select),Array.from(select.options,o=>[o.value,o.textContent,optionDisabled(o),optionHidden(o)])]); }
  function fieldLabel(select) {
    const labelNode=select.labels?.[0] || select.closest('label');
    const text=labelNode && Array.from(labelNode.childNodes).filter(node=>node.nodeType===3).map(node=>node.textContent).join(' ').trim();
    return select.getAttribute('aria-label') || text || '画幅';
  }
  function available(entry) { return Array.from(entry.panel.querySelectorAll('button:not(:disabled)')); }
  function setOpen(entry, open, focus=false) {
    open=!!open && !entry.trigger.disabled;
    if(open)for(const other of entries.values())if(other!==entry)setOpen(other,false);
    entry.open=open;entry.panel.hidden=!open;entry.trigger.setAttribute('aria-expanded',String(open));
    entry.box.classList.toggle('is-open',open);
    if(open&&focus)(available(entry).find(button=>button.dataset.value===entry.select.value)||available(entry)[0])?.focus();
    else if(!open&&focus&&entry.trigger.isConnected)entry.trigger.focus();
  }
  function choose(entry, value) {
    const select=entry.select;
    const option=Array.from(select.options).find(item=>item.value===value);
    if(!select.isConnected||disabled(select)||!option||optionDisabled(option)||optionHidden(option))return;
    select.value=value;
    select.dispatchEvent(new Event('input',{bubbles:true}));
    select.dispatchEvent(new Event('change',{bubbles:true}));
    refresh(select);
    const current=entries.get(select);if(current)setOpen(current,false,true);
  }
  function remove(select, entry) {
    entry.box.remove();select.classList.remove('aspect-ratio-native');
    if(entry.tabindex===null)select.removeAttribute('tabindex');else select.setAttribute('tabindex',entry.tabindex);
    if(entry.aria===null)select.removeAttribute('aria-hidden');else select.setAttribute('aria-hidden',entry.aria);
    select.removeEventListener('change',entry.onchange);entries.delete(select);
  }
  function refresh(select) {
    if(!select||!select.isConnected||select._layoutPickerSync)return;
    let entry=entries.get(select);
    if(select.dataset.layoutPickerInstalled||!eligible(select)){if(entry)remove(select,entry);return;}
    if(!entry){
      const box=document.createElement('span');box.className='aspect-ratio-picker';
      const trigger=document.createElement('button');trigger.type='button';trigger.className='aspect-ratio-trigger';
      const panel=document.createElement('span');panel.className='aspect-ratio-options';panel.id='aspect-ratio-options-'+(++nextId);panel.hidden=true;
      panel.setAttribute('role','radiogroup');panel.setAttribute('aria-label',fieldLabel(select));
      trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',panel.id);
      box.append(trigger,panel);select.after(box);select.classList.add('aspect-ratio-native');
      entry={select,box,trigger,panel,open:false,signature:'',tabindex:select.getAttribute('tabindex'),aria:select.getAttribute('aria-hidden')};entries.set(select,entry);
      select.tabIndex=-1;select.setAttribute('aria-hidden','true');
      entry.onchange=()=>refresh(select);select.addEventListener('change',entry.onchange);
      trigger.addEventListener('click',event=>{event.preventDefault();setOpen(entry,!entry.open, !entry.open);});
      box.addEventListener('keydown',event=>{
        if(event.key==='Escape'){if(entry.open){event.preventDefault();event.stopPropagation();setOpen(entry,false,true);}return;}
        const buttons=available(entry);if(!buttons.length)return;
        let current=buttons.findIndex(button=>button===document.activeElement);
        if(current<0)current=buttons.findIndex(button=>button.dataset.value===select.value);
        let index;
        if(['ArrowRight','ArrowDown'].includes(event.key))index=(current+1)%buttons.length;
        else if(['ArrowLeft','ArrowUp'].includes(event.key))index=(current+buttons.length-1)%buttons.length;
        else if(event.key==='Home')index=0;
        else if(event.key==='End')index=buttons.length-1;
        else return;
        event.preventDefault();choose(entry,buttons[index].dataset.value);
      });
    }
    const current=signature(select);if(entry.signature===current)return;entry.signature=current;
    const focusedValue=entry.panel.contains(document.activeElement)?document.activeElement.dataset.value:null;
    const focusWasInside=entry.panel.contains(document.activeElement);
    entry.panel.replaceChildren();entry.box.setAttribute('aria-disabled',String(disabled(select)));
    const selected=select.selectedOptions[0],selectedInfo=selected&&info(selected);
    const summary=selectedInfo?selectedInfo.name+' '+selectedInfo.ratio:(selected?.textContent||'请选择画幅');
    entry.trigger.textContent=summary;entry.trigger.title=(selectedInfo?.context?selectedInfo.context+' · ':'')+summary;
    entry.trigger.setAttribute('aria-label',fieldLabel(select)+'：'+entry.trigger.title);
    const options=Array.from(select.options).filter(option=>!optionHidden(option)&&(!optionDisabled(option)||option.selected));
    let selectedButton=null;const buttons=[];
    for(const option of options){
      const ratio=info(option);if(!ratio)continue;
      const button=document.createElement('button');button.type='button';button.className='aspect-ratio-tile';button.dataset.value=option.value;
      button.disabled=disabled(select)||optionDisabled(option);button.setAttribute('role','radio');button.setAttribute('aria-checked',String(option.selected));button.tabIndex=-1;
      const shape=document.createElement('i');shape.className='aspect-ratio-shape';shape.setAttribute('aria-hidden','true');
      const scale=Math.min(28/ratio.width,24/ratio.height);shape.style.width=(ratio.width*scale)+'px';shape.style.height=(ratio.height*scale)+'px';
      const text=document.createElement('span');text.textContent=ratio.name+' '+ratio.ratio;button.append(shape,text);
      if(ratio.context){const context=document.createElement('small');context.textContent=ratio.context;button.append(context);}
      button.title=(ratio.context?ratio.context+' · ':'')+text.textContent+(optionDisabled(option)?'（当前模型不支持，原设定保留）':'');button.setAttribute('aria-label',button.title);
      button.addEventListener('click',event=>{event.preventDefault();choose(entry,button.dataset.value);});
      entry.panel.append(button);buttons.push(button);if(option.selected)selectedButton=button;
    }
    (selectedButton&&!selectedButton.disabled?selectedButton:buttons.find(button=>!button.disabled))?.setAttribute('tabindex','0');
    entry.trigger.disabled=disabled(select)||!buttons.some(button=>!button.disabled);
    setOpen(entry,entry.open);
    if(focusWasInside){const button=buttons.find(item=>item.dataset.value===focusedValue&&!item.disabled);if(entry.open&&button)button.focus();else entry.trigger.focus();}
  }
  function enhance(container=document) {
    container.querySelectorAll('select').forEach(refresh);
    for(const [select,entry]of entries)if(!select.isConnected)remove(select,entry);
  }
  root.AspectRatio=Object.freeze({enhance,refresh,info,label,markup});
  function start(){
    let scheduled=false;
    const observer=new MutationObserver(records=>{
      if(!records.some(record=>{const target=record.target instanceof Element?record.target:record.target.parentElement;return target&&!target.closest('.aspect-ratio-picker');}))return;
      if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;enhance();});
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','selected','hidden','value','label']});
    document.addEventListener('pointerdown',event=>{for(const entry of entries.values())if(entry.open&&!entry.box.contains(event.target))setOpen(entry,false);});
    document.addEventListener('focusin',event=>{for(const entry of entries.values())if(entry.open&&!entry.box.contains(event.target))setOpen(entry,false);});
    enhance();setInterval(()=>{for(const select of entries.keys())refresh(select);},500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);

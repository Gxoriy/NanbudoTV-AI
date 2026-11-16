(function (root) {
  'use strict';
  const tokenPattern = /@\{((?:people|scenes|props|canvas):[^{}\s]+)\}/g;
  const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = id => `@{${id}}`;
  const selectionLinePrefix = '【参考图绑定｜仅约束外观，不新增剧情】';
  const manualSelectionLinePrefix = '【手动参考图绑定｜仅约束外观，不新增剧情】';
  const validReferenceId = id => /^(?:people|scenes|props|canvas):[^{}\s]+$/.test(String(id));
  const referenceMatcher = () => root.ReferenceMatcher || (typeof module!=='undefined' && module.exports ? require('./reference_matcher.js') : null);
  function referenceNames(asset) {
    const matcher=referenceMatcher();
    return matcher?.names ? matcher.names(asset) : [asset.name,...(Array.isArray(asset.aliases)?asset.aliases:[])];
  }
  function parts(text) {
    const result = []; let position = 0;
    for (const match of String(text).matchAll(tokenPattern)) {
      if (match.index > position) result.push({text:text.slice(position,match.index)});
      result.push({id:match[1]}); position = match.index+match[0].length;
    }
    if (position < text.length) result.push({text:text.slice(position)});
    return result;
  }
  function annotate(text, assets, allAssets = assets, resolvedNames=null) {
    text=String(text);
    const selected = new Set(assets.map(asset=>asset.referenceId));
    const owners = new Map();
    for (const asset of allAssets) {
      if (!validReferenceId(asset.referenceId)) continue;
      for (const name of new Set(referenceNames(asset))) {
        if (typeof name!=='string' || !name.trim()) continue;
        if (!owners.has(name)) owners.set(name,new Set());
        owners.get(name).add(asset.referenceId);
      }
    }
    // Ambiguous and unselected long names still consume a whole match. This
    // prevents a shorter selected name from stealing part of another asset.
    const allNames=[...owners.keys()].sort((a,b)=>b.length-a.length);
    if (!allNames.length) return text;
    const byName = new Map(allNames.filter(name=>owners.get(name).size===1).map(name=>[name,[...owners.get(name)][0]]).filter(([,id])=>selected.has(id)));
    if(resolvedNames)for(const [name,value]of resolvedNames){const id=typeof value==='string'?value:value?.id;if(owners.get(name)?.has(id)&&selected.has(id))byName.set(name,id);}
    const names = allNames.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
    const speakerNames=[...new Set(allAssets.filter(asset=>asset.kind==='people'||String(asset.referenceId||'').startsWith('people:')).flatMap(referenceNames).filter(name=>typeof name==='string'&&name.trim()))].sort((a,b)=>b.length-a.length);
    const speakerPattern=speakerNames.length?new RegExp('^(?:'+speakerNames.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?:[（(][^）)\\n]*[）)])?\\s*[：:]'):null;
    // Existing mentions and quoted dialogue are opaque. Plain dialogue after
    // a named speaker's colon is also preserved character-for-character.
    const matcher=referenceMatcher(),protection=matcher?.referenceProtection?.(text,allAssets);
    const opaque=protection?protection.ranges.map(range=>[range.start,range.end]):[];
    if(!protection){
    for (const match of text.matchAll(/@\{(?:people|scenes|props|canvas):[^{}\s]+\}|“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"(?:\\.|[^"\\])*"/g)) opaque.push([match.index,match.index+match[0].length]);
    let lineOffset=0;
    for (const line of text.split('\n')) {
      const trimmed=line.trimStart();
      // An asset description such as “道具名：人物接过道具” is not speech.
      // Only a known person (or its existing people token) starts plain dialogue.
      const speaker=speakerPattern?.test(trimmed) || /^@\{people:[^{}\s]+\}(?:[（(][^）)\n]*[）)])?\s*[：:]/.test(trimmed);
      const dialogue = /^\s*\[[^\]\n]*(?:台词|对白|旁白|画外音)[^\]\n]*\]\s*[：:]/.test(line);
      if (speaker || dialogue) {
        const start=dialogue ? line.indexOf(']')+1 : (trimmed.startsWith('@{') ? line.indexOf('}')+1 : 0);
        const colon=start+line.slice(start).search(/[：:]/);
        opaque.push([lineOffset+colon,lineOffset+line.length]);
      }
      lineOffset+=line.length+1;
    }
    }
    const decorated=matcher?.partialQuotedNames?.(text,allAssets,protection)||[];
    const replacements=decorated.filter(hit=>hit.referenceIds.length===1&&selected.has(hit.referenceIds[0])).map(hit=>({...hit,text:token(hit.referenceIds[0])}));
    for(const hit of text.matchAll(new RegExp(names,'g'))){
      const start=hit.index,end=start+hit[0].length;
      if(decorated.some(span=>start<span.end&&end>span.start)||opaque.some(([from,to])=>start<to&&end>from))continue;
      if(byName.has(hit[0]))replacements.push({start,end,text:token(byName.get(hit[0]))});
    }
    replacements.sort((a,b)=>a.start-b.start);
    let result='',position=0;for(const hit of replacements){result+=text.slice(position,hit.start)+hit.text;position=hit.end;}
    return result+text.slice(position);
  }
  function synchronizeSelection(text, selectedIds, allAssets, options={}) {
    text=String(text);
    const selected=new Set(Array.from(selectedIds||[]).filter(validReferenceId));
    const byId=new Map((allAssets||[]).filter(asset=>validReferenceId(asset.referenceId)).map(asset=>[asset.referenceId,asset]));
    const carried=[],manual=new Set(options.manualReferenceIds||[]);
    const bodyLines=text.split('\n').filter(line=>{
      const prefix=line.startsWith(selectionLinePrefix)?selectionLinePrefix:line.startsWith(manualSelectionLinePrefix)?manualSelectionLinePrefix:null;
      if (!prefix) return true;
      const tail=line.slice(prefix.length);
      // Manage only this reserved, token-only line. A prose line that happens
      // to begin with the label is still ordinary user content.
      if (tail.replace(tokenPattern,'').trim()) return true;
      for (const match of tail.matchAll(tokenPattern)) {
        if (selected.has(match[1]) || !byId.has(match[1])) carried.push(match[1]);
        if(prefix===manualSelectionLinePrefix)manual.add(match[1]);
      }
      return false;
    });
    const unbound=bodyLines.join('\n').replace(tokenPattern,(match,id)=>{
      if (selected.has(id)) return match;
      const name=byId.get(id)?.name;
      // Invalid references retain their literal token: no guessed label and
      // no silent deletion of a user's text.
      return typeof name==='string' && name.trim() ? name : match;
    });
    const selectedAssets=[...selected].map(id=>byId.get(id)).filter(Boolean);
    const body=annotate(unbound,selectedAssets,allAssets||[]);
    const mentioned=new Set([...body.matchAll(tokenPattern)].map(match=>match[1]));
    if (options.includeUnmentioned) carried.push(...selectedAssets.map(asset=>asset.referenceId));
    const bindings=[...new Set(carried)].filter(id=>!mentioned.has(id));
    if (!bindings.length) return body;
    const automatic=bindings.filter(id=>!manual.has(id)),explicit=bindings.filter(id=>manual.has(id));
    return body+(body && !body.endsWith('\n') ? '\n' : '')+
      [automatic.length?selectionLinePrefix+automatic.map(token).join(' '):'',explicit.length?manualSelectionLinePrefix+explicit.map(token).join(' '):''].filter(Boolean).join('\n');
  }
  function separateManagedBindings(text) {
    // This generated token-only line records a selection; it is not evidence
    // that those characters or objects occur in the current video card.
    const bindings=[];
    const body=String(text).split('\n').filter(line=>{
      if(!line.startsWith(selectionLinePrefix))return true;
      const tail=line.slice(selectionLinePrefix.length);
      if(tail.replace(tokenPattern,'').trim())return true;
      bindings.push(...[...tail.matchAll(tokenPattern)].map(match=>match[1]));
      return false;
    }).join('\n');
    return {body,bindings:[...new Set(bindings)]};
  }
  function plain(text, assets) {
    const names = new Map(assets.map(asset=>[asset.referenceId,asset.name]));
    return parts(text).map(part=>part.id ? names.get(part.id)||token(part.id) : part.text).join('');
  }
  function serialize(element) {
    function walk(node) {
      if (node.nodeType === 3) return node.nodeValue;
      if (node.dataset?.referenceId) return token(node.dataset.referenceId);
      if (node.nodeName === 'BR') return '\n';
      const value = Array.from(node.childNodes||[]).map(walk).join('');
      return ['DIV','P'].includes(node.nodeName) && node.nextSibling ? value+'\n' : value;
    }
    return Array.from(element.childNodes).map(walk).join('');
  }
  function mount(container, options) {
    const assets = () => options.assets();
    container.classList.add('reference-mention-panel');
    container.innerHTML = '<div class="mention-toolbar"><small>'+escape(options.hint||'可编辑 · 输入 @ 引用人物、场景或道具；点击标签可换绑，×仅取消绑定')+'</small><button type="button" class="ghost-btn mention-auto"'+(options.auto===false?' hidden':'')+'>自动标注</button><button type="button" class="secondary-btn mention-save">'+escape(options.saveLabel||'保存描述词')+'</button></div><div class="reference-mention-editor" contenteditable="true" role="textbox" aria-label="'+escape(options.editorLabel||'视频描述词与参考图引用')+'" aria-multiline="true"></div><div class="reference-mention-menu" role="listbox" hidden></div><small class="mention-save-status" role="status"></small>';
    const editor=container.querySelector('.reference-mention-editor'), menu=container.querySelector('.reference-mention-menu'), status=container.querySelector('.mention-save-status');
    let savedRange=null, replacement=null, composing=false;
    const active=()=>container.isConnected&&editor.isConnected&&(options.active?.()??true);
    function thumbnail(asset) {
      const image=document.createElement(asset.media==='video'?'video':'img');image.src=options.media(asset.imageFile);image.setAttribute('aria-hidden','true');
      if(asset.media==='video'){image.muted=true;image.preload='metadata';image.playsInline=true;}else image.alt='';
      return image;
    }
    function chip(id) {
      const resolve=()=> (options.boundAssets?.()||assets()).find(value=>value.referenceId===id);
      const asset=resolve();
      const span=document.createElement('span'); span.className='reference-mention-chip'+(asset?'':' missing'); span.contentEditable='false'; span.dataset.referenceId=id;
      span.setAttribute('role','button'); span.tabIndex=0; span.title=asset?'点击更换参考图':'引用已失效，请重新选择';
      if (asset) span.append(thumbnail(asset));
      const label=document.createElement('span'); label.textContent=asset?.name||'失效引用';label.title=label.textContent; span.append(label);
      const remove=document.createElement('button'); remove.type='button'; remove.textContent='×'; remove.setAttribute('aria-label','取消'+(asset?.name||'失效引用')+'绑定');
      remove.addEventListener('click',event=>{event.stopPropagation();if(!active()||options.locked?.())return;span.replaceWith(document.createTextNode(resolve()?.name||token(id))); changed();}); span.append(remove);
      // A saved editor can mount before its asynchronous image catalogue.
      // Refresh chip labels/images in place, without touching text, selection,
      // scroll position or serialization of the user's stable reference ID.
      span._refreshReferenceAsset=()=>{
        const current=resolve();
        span.classList.toggle('missing',!current);
        span.title=current?'点击更换参考图':'引用已失效，请重新选择';
        label.textContent=current?.name||'失效引用';label.title=label.textContent;
        remove.setAttribute('aria-label','取消'+(current?.name||'失效引用')+'绑定');
        const old=span.querySelector('img,video'),file=String(current?.imageFile||'');
        if(!file){old?.remove();return;}
        const src=options.media(file),tag=current.media==='video'?'VIDEO':'IMG';
        if(old&&old.tagName===tag&&old.getAttribute('src')===src)return;
        const next=thumbnail(current);if(old)old.replaceWith(next);else span.insertBefore(next,label);
      };
      span.addEventListener('click',()=>{if(options.locked?.())return;replacement=span;showMenu('');});
      span.addEventListener('keydown',event=>{if(event.key==='Enter'&&!options.locked?.()){event.preventDefault();replacement=span;showMenu('');}});
      return span;
    }
    function paint(text) { editor.replaceChildren(...parts(String(text)).map(part=>part.id?chip(part.id):document.createTextNode(part.text))); }
    function syncSelection(selectedIds=options.selected?.()||[], syncOptions={}) {
      const before=serialize(editor);
      if (!active() || options.locked?.()) return before;
      const after=synchronizeSelection(before,selectedIds,options.allAssets?.()||options.boundAssets?.()||assets(),syncOptions);
      if (after===before) return after;
      const scrollTop=editor.scrollTop,scrollLeft=editor.scrollLeft;
      // Read the live editor, never options.text: selection changes must not
      // restore an older saved value over an unsaved handwritten draft.
      paint(after); changed();
      editor.scrollTop=scrollTop;editor.scrollLeft=scrollLeft;
      return after;
    }
    function changed() { menu.hidden=true; options.change(serialize(editor)); status.textContent=options.changedLabel||'有未保存修改；生成时使用当前描述词。'; }
    function showMenu(query) {
      if(options.locked?.()){menu.hidden=true;return;}
      const matches=assets().filter(asset=>!query || asset.name.toLowerCase().includes(query.toLowerCase()));
      menu.replaceChildren(); menu.hidden=false;
      if (!matches.length) { menu.textContent=options.emptyLabel||'没有匹配的已生成参考图'; return; }
      for (const asset of matches) {
        const button=document.createElement('button'); button.type='button'; button.setAttribute('role','option');
        button.dataset.referenceId=asset.referenceId;
        const img=thumbnail(asset);
        const label=document.createElement('span'); label.textContent=asset.name;
        const kind=document.createElement('small'); kind.textContent=asset.kindLabel||{people:'人物',scenes:'场景',props:'物品'}[asset.kind]; button.append(img,label,kind);
        button.addEventListener('mousedown',event=>event.preventDefault());
        button.addEventListener('click',async()=>{
          if(!active()||options.locked?.())return;
          const selectionText=serialize(editor),selectionRange=savedRange?.cloneRange(),selectionReplacement=replacement;
          button.disabled=true;
          try {
            await options.select(asset,{replaceId:selectionReplacement?.dataset.referenceId||null});
            // Selection may add and save a wire. Never insert into a detached
            // editor, a different canvas/node, or text edited during that await.
            if(!active())return;
            if(options.locked?.()||serialize(editor)!==selectionText)throw new Error('文字或任务状态已改变，请重新选择素材。');
            const inserted=chip(asset.referenceId);
            if (selectionReplacement?.isConnected&&editor.contains(selectionReplacement)) selectionReplacement.replaceWith(inserted);
            else if (selectionRange&&editor.contains(selectionRange.commonAncestorContainer)) { selectionRange.deleteContents(); selectionRange.insertNode(inserted); selectionRange.setStartAfter(inserted); selectionRange.collapse(true); const selection=window.getSelection();selection.removeAllRanges();selection.addRange(selectionRange); }
            else return;
            replacement=null; editor.focus(); changed();
          } catch(error) {if(active()){status.textContent=error.message;button.disabled=options.locked?.()||false;}}
        }); menu.append(button);
      }
    }
    function detectAt() {
      if (composing) return;
      const selection=window.getSelection();
      if(!selection?.rangeCount || !editor.contains(selection.anchorNode) || selection.anchorNode.nodeType!==3) {menu.hidden=true;return;}
      const node=selection.anchorNode, offset=selection.anchorOffset;
      const match=node.nodeValue.slice(0,offset).match(/@([^@\n{}]{0,30})$/);
      if (!match) {menu.hidden=true;return;}
      savedRange=document.createRange();savedRange.setStart(node,offset-match[0].length);savedRange.setEnd(node,offset);replacement=null;showMenu(match[1]);
    }
    editor.addEventListener('input',()=>{changed();detectAt();});
    editor.addEventListener('compositionstart',()=>{composing=true;});
    editor.addEventListener('compositionend',()=>{composing=false;changed();detectAt();});
    editor.addEventListener('keydown',event=>{if(event.key==='Escape') menu.hidden=true;});
    function insertText(text) {
      const selection=window.getSelection();if(!selection?.rangeCount) return;
      const range=selection.getRangeAt(0);if(!editor.contains(range.commonAncestorContainer)) return;
      range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);changed();detectAt();
    }
    editor.addEventListener('beforeinput',event=>{if(event.inputType==='insertParagraph'){event.preventDefault();insertText('\n');}});
    editor.addEventListener('paste',event=>{event.preventDefault();insertText(event.clipboardData.getData('text/plain'));});
    container.querySelector('.mention-auto').addEventListener('click',async()=>{
      if(options.auto===false||!active()||options.locked?.())return;
      try {
        if(options.autoAnnotate){
          const result=options.autoAnnotate(serialize(editor));
          paint(result.text);changed();status.textContent=result.message||'自动标注已完成，保存后生效。';
        } else if(await options.confirm('将按本集已选参考图重新标注，保留正文和台词；会重置手动绑定。是否继续？')){
          if(!active()||options.locked?.())return;
          paint(annotate(plain(serialize(editor),assets()),assets().filter(asset=>options.selected().includes(asset.referenceId)),options.allAssets?.()||assets()));changed();
        }
      }catch(error){if(active())status.textContent=error.message;}
    });
    const save=container.querySelector('.mention-save');
    save.addEventListener('click',async()=>{if(!active())return;save.disabled=true;const submitted=serialize(editor);try{await options.save(submitted);if(active())status.textContent=serialize(editor)===submitted?'描述词与引用已保存；未调用模型、未扣费。':'原提交已保存；有后续未保存文字，请再次保存。';}catch(error){if(active())status.textContent=error.message;}finally{if(active())save.disabled=options.locked?.()||false;}});
    paint(options.text);if(options.initialChange!==false)options.change(serialize(editor));
    return {value:()=>serialize(editor),refresh:()=>paint(serialize(editor)),refreshAssets:()=>{
      for(const chip of editor.querySelectorAll('.reference-mention-chip'))chip._refreshReferenceAsset?.();
    },syncSelection,editor};
  }
  const api={parts,annotate,plain,synchronizeSelection,separateManagedBindings,serialize,mount,escape};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.ReferenceMentions=api;
})(typeof window!=='undefined'?window:globalThis);

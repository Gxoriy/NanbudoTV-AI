/* Local appearance only: no service, model, layout or media changes. */
(() => {
  'use strict';
  if (window.NanbudoThemes228) return;
  const key='nanbudotv.theme228',motionKey='nanbudotv.themeMotion228',root=document.documentElement;
  root.dataset.themeEmbedded251=window.parent!==window?'true':'false';
  let moduleActive251=true;
  const syncVisibility251=()=>{root.dataset.themeHidden251=document.hidden||!moduleActive251?'true':'false';};
  document.addEventListener('visibilitychange',syncVisibility251);syncVisibility251();
  const themes=[
    ['blackgold','黑金电影','金光掠影 · 经典黑金','#202224','#2b2d31','#202327','#f1eee7','#adb4b5','#55565a','#ffd16b','#c29a43','#74cabb','#7ac297','#e49a9e','10px'],
    ['pencil','手绘纸本','铅笔线条 · 暖纸光影','#f3eddf','#fffaf0','#fffdf8','#3b342d','#71685c','#c5b7a2','#925733','#be8a5b','#456b63','#34664f','#a53c3c','7px 12px 6px 11px'],
    ['ink','国风水墨','远山墨竹 · 轻风流云','#e7e9e1','#f4f5ed','#fafbf5','#263b36','#556d62','#abb8aa','#386c61','#739987','#456b81','#376545','#a04848','4px'],
    ['rain','雨窗玻璃','透亮雨滴 · 雨幕流动','#162c3a','#263e4c','#142b39','#e9f3f9','#b1cbd9','#547383','#84d4ee','#b3e5f1','#8ad9d2','#8dd4af','#f3a9b5','16px'],
    ['line','极简线条','几何留白 · 线条游走','#f6f7fa','#ffffff','#fafbfc','#1e2c3d','#596775','#b6c0cc','#2859ad','#5988c8','#357c88','#316b4e','#a6374a','3px'],
    ['sticker','彩色贴纸','跳色贴画 · 轻盈浮动','#fff0da','#fff8eb','#fffcf6','#432f43','#755875','#bc8c9c','#ad3677','#d58a25','#337b79','#356f50','#ac3846','18px 9px 18px 9px'],
    ['pixel','复古像素','方格像素 · 跃动星点','#18243a','#25344e','#142035','#f6edc9','#c1c5b2','#687d99','#d6e476','#7bd2bc','#a4c8fa','#8bd3a0','#f3a1a1','0px'],
    ['aurora','极光弥散','渐变光带 · 柔光呼吸','#162136','#202d48','#101b2f','#edf2ff','#b4c4e8','#4a5b7e','#b3a3ff','#5dded0','#7ee4dd','#89d9ba','#f4a4bb','20px'],
    ['celadon','青瓷水波','青瓷雅色 · 微波涟漪','#e7f1eb','#f5fcf7','#fafffc','#27463d','#587267','#a3bdb1','#32735e','#86b49a','#426c8e','#346c4d','#a34548','14px'],
    ['neon','星空霓虹','星轨灯光 · 微光闪烁','#171a2c','#25263e','#101322','#edf0ff','#babee0','#5e6289','#c1a2ff','#74deef','#63d7db','#86dcb4','#f2a0b7','10px']
  ].map(row=>Object.fromEntries(['id','name','description','bg','surface','input','text','muted','border','accent','accent2','cyan','success','danger','radius'].map((name,i)=>[name,row[i]])));
  const byId=new Map(themes.map(t=>[t.id,t]));let current='blackgold',motion=true;
  const read=(name,fallback)=>{try{return localStorage.getItem(name)??fallback;}catch(_){return fallback;}};
  const write=(name,value)=>{try{localStorage.setItem(name,value);return true;}catch(_){return false;}};
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(',');
  const light=t=>['pencil','ink','line','sticker','celadon'].includes(t.id);
  function apply(id,{persist=false,broadcast=false}={}){
    const t=byId.get(id)||themes[0];current=t.id;
    root.dataset.theme228=current;root.dataset.themeMotion228=motion?'on':'off';root.dataset.themeLight228=light(t)?'true':'false';
    for(const field of ['bg','surface','input','text','muted','border','accent','accent2','cyan','success','danger']){
      root.style.setProperty('--theme-'+field,t[field]);root.style.setProperty('--theme-'+field+'-rgb',rgb(t[field]));
    }
    root.style.setProperty('--theme-button-text',light(t)?'#fffdf8':(t.id==='pixel'?'#18243a':'#162432'));
    root.style.setProperty('--theme-button-fill',`linear-gradient(115deg,${t.accent},${light(t)?t.accent:t.accent2})`);
    root.style.setProperty('--theme-radius',t.radius);root.style.setProperty('--theme-shadow-rgb',light(t)?'100,87,68':'0,0,0');
    root.style.setProperty('--theme-texture',`url("/static/themes228/${t.id}.svg")`);
    root.style.setProperty('--theme-animation',`theme228-${t.id}`);
    root.style.setProperty('--theme-background',`radial-gradient(ellipse at 8% 0%,rgba(${rgb(t.accent)},${light(t)?'.07':'.12'}),transparent 48%),radial-gradient(ellipse at 95% 85%,rgba(${rgb(t.cyan)},${light(t)?'.07':'.10'}),transparent 50%),${t.bg}`);
    const saved=!persist||write(key,current);
    document.dispatchEvent(new CustomEvent('ntvthemechange228',{detail:{id:current,motion}}));
    if(broadcast)broadcastTheme();
    return saved;
  }
  function broadcastTheme(){
    const data={type:'nanbudotv-theme228',id:current,motion};
    document.querySelectorAll('iframe').forEach(frame=>{try{frame.contentWindow.postMessage(data,location.origin);}catch(_){}});
    if(window.parent!==window)try{window.parent.postMessage(data,location.origin);}catch(_){}
  }
  function setMotion(value,{persist=true,broadcast=true}={}){
    motion=value!==false;if(persist)write(motionKey,motion?'on':'off');apply(current,{broadcast});
  }
  window.addEventListener('storage',event=>{
    if(event.key===key)apply(event.newValue);
    if(event.key===motionKey)setMotion(event.newValue!=='off',{persist:false,broadcast:false});
  });
  window.addEventListener('message',event=>{
    if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='nanbudo:module-active251'){
      moduleActive251=event.data.active!==false;syncVisibility251();return;
    }
    if(event.origin!==location.origin||event.data?.type!=='nanbudotv-theme228'||!byId.has(event.data.id))return;
    const trusted=event.source===window.parent||[...document.querySelectorAll('iframe')].some(frame=>frame.contentWindow===event.source);
    if(!trusted)return;motion=event.data.motion!==false;apply(event.data.id);
  });
  function mount(container){
    if(!container||container.dataset.themeMounted228)return;container.dataset.themeMounted228='true';
    container.classList.add('theme-picker228');
    container.innerHTML='<div class="theme-picker-heading228"><div><h3>外观皮肤</h3><p>点击立即应用并保存在本机，创作排版保持不变。</p></div><label class="theme-motion228"><input type="checkbox" data-theme-motion-toggle228>背景动画</label></div><div class="theme-grid228" role="group" aria-label="选择外观皮肤"></div><p class="theme-status228" role="status" aria-live="polite"></p>';
    const grid=container.querySelector('.theme-grid228');
    for(const t of themes){
      const button=document.createElement('button');button.type='button';button.className='theme-choice228';button.dataset.themeChoice228=t.id;
      button.setAttribute('aria-label',t.name+'，'+t.description);
      button.style.setProperty('--preview-bg',t.bg);button.style.setProperty('--preview-surface',t.surface);button.style.setProperty('--preview-accent',t.accent);button.style.setProperty('--preview-text',t.text);button.style.setProperty('--preview-radius',t.radius);button.style.setProperty('--preview-texture',`url("/static/themes228/${t.id}.svg")`);
      button.innerHTML='<span class="theme-preview228" aria-hidden="true"><i></i><b></b><em></em></span><strong></strong><small></small><span class="theme-choice-check228" aria-hidden="true">✓</span>';
      button.querySelector('strong').textContent=t.name;button.querySelector('small').textContent=t.description;
      button.addEventListener('click',()=>{const saved=apply(t.id,{persist:true,broadcast:true});container.querySelector('.theme-status228').textContent=saved?'已应用“'+t.name+'”，外观已保存。':'已应用“'+t.name+'”；本机外观设置暂时无法保存，重开软件后可能需要重新选择。';});grid.append(button);
    }
    const toggle=container.querySelector('[data-theme-motion-toggle228]');toggle.addEventListener('change',()=>setMotion(toggle.checked));
    const sync=()=>{for(const button of grid.children)button.setAttribute('aria-pressed',String(button.dataset.themeChoice228===current));toggle.checked=motion;};
    document.addEventListener('ntvthemechange228',sync);sync();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)container.querySelector('.theme-status228').textContent='系统已开启减少动态效果，背景动画会自动静止。';
  }
  window.NanbudoThemes228={themes,current:()=>current,apply:id=>apply(id,{persist:true,broadcast:true}),setMotion,mount};
  motion=read(motionKey,'on')!=='off';apply(read(key,'blackgold'));

  // The established screens contain several generations of literal palettes.
  // Re-map visual declarations only; preserve every selector, media condition,
  // dimension, position and font. New components can use --theme-* directly.
  const visual=/^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|accent-color|caret-color|text-decoration-color)$/;
  const colorPattern=/#(?:[a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})\b|rgba?\([^)]*\)|\b(?:white|black)\b/gi;
  function colorValue(value){
    if(value==='white')return[255,255,255,1];if(value==='black')return[0,0,0,1];
    if(value[0]==='#'){let h=value.slice(1);if(h.length<5)h=[...h].map(c=>c+c).join('');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length===8?parseInt(h.slice(6,8),16)/255:1];}
    const values=value.slice(value.indexOf('(')+1,-1).split(/[, /]+/).filter(Boolean).map(Number);return values.length>=3?values.slice(0,3).concat(values[3]??1):null;
  }
  function tokenFor(values,property){
    const[r,g,b]=values,max=Math.max(r,g,b),min=Math.min(r,g,b),s=max?1-min/max:0,l=(max+min)/510;
    const ink=/^(color|fill|stroke|accent-color|caret-color|text-decoration-color)$/.test(property);
    if(/shadow/.test(property))return'shadow';
    const red=r>g*1.28&&r>b*1.2, gold=r>b*1.28&&g>b*1.18, green=g>r*1.12&&g>b*1.05,cyan=g>r*1.1&&b>r*1.1;
    if(ink){if(s>.24){if(red)return'danger';if(gold)return'accent';if(green)return'success';if(cyan)return'cyan';if(b>r*1.2)return'cyan';}return l>.72||l<.2?'text':'muted';}
    if(/border|outline/.test(property))return s>.45&&(gold||cyan||green)?(gold?'accent':green?'success':'cyan'):'border';
    if(s>.5&&l>.4)return gold?'accent':red?'danger':green?'success':cyan?'cyan':'accent2';
    return l<.12?'input':'surface';
  }
  function mapped(value,property){
    if(!value||value.includes('url('))return value;
    return value.replace(colorPattern,color=>{const parts=colorValue(color.toLowerCase());if(!parts||parts.some(n=>!Number.isFinite(n)))return color;const token=tokenFor(parts,property);return parts[3]===1?`rgb(var(--theme-${token}-rgb))`:`rgba(var(--theme-${token}-rgb),${Math.max(0,Math.min(1,parts[3]))})`;});
  }
  const prefix='html[data-theme228]:not([data-theme228="blackgold"])';
  function selectors(value){let level=0,quoted='',part='',out=[];for(const c of value){if(quoted){part+=c;if(c===quoted)quoted='';continue;}if(c==='"'||c==="'")quoted=c;if(c==='('||c==='[')level++;if(c===')'||c===']')level--;if(c===','&&!level){out.push(part);part='';}else part+=c;}if(part)out.push(part);return out.map(v=>v.trim().replace(/^(:root|html)(?=[\s.#[:]|$)/,prefix)).map(v=>v.startsWith(prefix)?v:prefix+' '+v).join(',');}
  function declarations(style){let result='';for(const property of style){if(!visual.test(property))continue;const value=style.getPropertyValue(property),replacement=mapped(value,property);if(replacement!==value)result+=property+':'+replacement+'!important;';}return result;}
  function rules(list){let output='';for(const rule of list){if(rule.selectorText&&rule.style){const body=declarations(rule.style);if(body)output+=selectors(rule.selectorText)+'{'+body+'}\n';}else if(rule.cssRules&&(rule.type===CSSRule.MEDIA_RULE||rule.type===CSSRule.SUPPORTS_RULE)){output+=rule.cssText.slice(0,rule.cssText.indexOf('{')+1)+rules(rule.cssRules)+'}\n';}}return output;}
  let styleNode=null,timer=0,inlineSequence=0,stylesheetCss251='',sheetsDirty251=true;const inlineRules=new Map();
  function rebuild(){timer=0;
    if(sheetsDirty251){stylesheetCss251='';for(const sheet of document.styleSheets){if(sheet.ownerNode===styleNode||(sheet.href||sheet.ownerNode?.dataset?.bundledUi)?.includes('/themes228.css'))continue;try{stylesheetCss251+=rules(sheet.cssRules);}catch(_){}}sheetsDirty251=false;}
    let css=stylesheetCss251;const liveIds=new Set();
    for(const node of document.querySelectorAll('[style],[data-theme-inline228]')){const body=declarations(node.style);if(!body){if(node.dataset.themeInline228)inlineRules.delete(node.dataset.themeInline228);continue;}if(!node.dataset.themeInline228)node.dataset.themeInline228=String(++inlineSequence);liveIds.add(node.dataset.themeInline228);inlineRules.set(node.dataset.themeInline228,body);}
    for(const id of inlineRules.keys())if(!liveIds.has(id))inlineRules.delete(id);
    for(const[id,body]of inlineRules)css+=prefix+' [data-theme-inline228="'+id+'"]{'+body+'}\n';
    if(!styleNode){styleNode=document.createElement('style');styleNode.dataset.themeRemap228='true';document.head.append(styleNode);}if(styleNode.textContent!==css)styleNode.textContent=css;
  }
  const schedule=()=>{if(!timer)timer=setTimeout(rebuild,80);};
  function relevant(record){
    if(record.target===styleNode||record.target.parentNode===styleNode)return false;
    if(record.type==='attributes')return record.target!==root&&declarations(record.target.style)!==(inlineRules.get(record.target.dataset.themeInline228)||'');
    if(record.target.tagName==='STYLE'){sheetsDirty251=true;return true;}
    const changed=[...record.addedNodes,...record.removedNodes].filter(node=>node.nodeType===1&&node!==styleNode);
    if(changed.some(node=>node.matches('style,link[rel="stylesheet"]')||node.querySelector('style,link[rel="stylesheet"]'))){sheetsDirty251=true;return true;}
    if([...record.removedNodes].some(node=>node.nodeType===1&&(node.hasAttribute('data-theme-inline228')||node.querySelector('[data-theme-inline228]'))))return true;
    return [...record.addedNodes].some(node=>node.nodeType===1&&node!==styleNode&&(
      node.matches('style,link[rel="stylesheet"]')||node.querySelector('style,link[rel="stylesheet"]')
      ||node.hasAttribute('style')&&declarations(node.style)
      ||[...node.querySelectorAll('[style]')].some(child=>declarations(child.style))));
  }
  const start=()=>{rebuild();const observer=new MutationObserver(records=>{let changed=false;for(const record of records)if(relevant(record))changed=true;if(changed)schedule();});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});document.addEventListener('load',event=>{if(event.target?.tagName==='LINK'){sheetsDirty251=true;schedule();}},true);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

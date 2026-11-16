(() => {
  "use strict";

  const KIND_PRIORITY = { people: 0, scenes: 1, props: 2 };
  const LABEL_PREFIX = /^(?:(?:人物资产|人物素材|场景资产|场景素材|物品资产|物品素材|人物|角色|場景|场景|地点|地點|物品|道具)\s*[:：|｜·•・-]?\s*)+/u;
  const LABEL_SUFFIX = /\s*(?:\(人物\)|（人物）|\(角色\)|（角色）|\(场景\)|（场景）|\(物品\)|（物品）)$/u;

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(LABEL_PREFIX, "")
      .replace(LABEL_SUFFIX, "")
      .replace(/[\s\p{P}\p{S}]+/gu, "")
      .trim();
  }

  function values(input) {
    if (input == null) return [];
    if (Array.isArray(input)) return input.flatMap(values);
    if (typeof input === "object") {
      return [input.name, input.alias, input.title, input.id, input.assetId].filter(Boolean).flatMap(values);
    }
    return String(input).split(/[\/／、,，;；|｜]+/u).map(value => value.trim()).filter(Boolean);
  }

  function candidates(asset) {
    const raw = names(asset);
    const normalizedNames = new Set();
    for (const value of raw.flatMap(values)) {
      const cleaned = normalize(value);
      if (cleaned) normalizedNames.add(cleaned);
    }
    return [...normalizedNames];
  }

  function names(asset) {
    // Exact names, explicit aliases and bounded structural short names only.
    // Arbitrary two-character suffixes
    // turn camera words such as “放大” into prop bindings for “放大镜”.
    const result = new Set();
    const person=asset?.kind==='people'||String(asset?.referenceId||asset?.id||'').startsWith('people:');
    const rawName=String(asset?.name||''),variantName=person&&/^(.{2,30})[（(]([^（）()]{1,60})[）)]$/u.exec(rawName);
    const explicitBase=person&&asset?.characterName;
    const safeBase=variantName&&/(?:造型|形态|装扮|时期|服装|老年|中年|青年|少年|童年|幼年|成年|古装|现代|正装|常服|礼服|战损|受伤|伪装|变身)/u.test(variantName[2])?variantName[1]:'';
    for (const value of [asset?.name,explicitBase,safeBase,...values(asset?.aliases)].filter(Boolean)) {
      const original = String(value).trim();
      const plain = original.normalize('NFKC').replace(LABEL_PREFIX, '').replace(LABEL_SUFFIX, '').trim();
      if (original) result.add(original);
      if (plain) result.add(plain);
      if(person&&/^[\p{Script=Han}\s]{2,30}$/u.test(plain))result.add(plain.replace(/\s+/g,''));
      // A named system's visual panel may be described by its structural
      // short name. Do not shorten people, ordinary holographic props, form
      // suffixes, or arbitrary two-character tails. Ownership is still checked
      // across the full catalogue before any inferred name can bind.
      const prop=asset?.kind==='props'||String(asset?.referenceId||asset?.id||'').startsWith('props:');
      if(prop&&/系统(?:全息|悬浮|虚拟|半透明|透明){0,3}面板$/u.test(plain))result.add('系统面板');
      // Explicit color/function variants of a named system retain their
      // distinguishing words. “蓝色面板” must not become its gold variant.
      const systemPanel=prop&&/系统((?:蓝色|金色|红色|绿色|黄色|紫色|黑色|白色)(?:全息|悬浮|虚拟|半透明|透明){0,3}(?:成就|任务|谋生|提示|战斗)?面板)$/u.exec(plain);
      if(systemPanel){result.add(systemPanel[1]);result.add('系统'+systemPanel[1]);result.add('系统面板');}
      // Keep a complete facility + sub-area, never a generic “区/房间” tail.
      // Different restaurants with the same short name remain ambiguous.
      const scene=asset?.kind==='scenes'||String(asset?.referenceId||asset?.id||'').startsWith('scenes:');
      const diningArea=scene&&/((?:餐馆|餐厅|饭馆|食堂|咖啡馆)(?:用餐区|就餐区|用餐大厅|就餐大厅))$/u.exec(plain);
      if(diningArea)result.add(diningArea[1]);
    }
    return [...result];
  }

  const validId233=asset=>/^(?:people|scenes|props|canvas):[^{}\s]+$/.test(String(asset?.referenceId||''));
  // Small, explicit visual categories distinguish variants of the SAME named
  // entity. Scene location or shared art-style templates are not costume cues.
  const visualTraits233={
    costume:{ancient:/蟒袍|龙袍|朝服|官袍|古装|长袍|广袖|襦裙|凤冠|铠甲|盔甲/u,
      suit:/西装|西服|领带|衬衫|正装/u,casual:/T恤|t恤|卫衣|运动裤|牛仔裤|休闲装/u},
    age:{elder:/老年|老人|老太|老者|白发|银发|皱纹|花甲|古稀/u,
      child:/幼年|童年|儿童|孩童|小孩|幼童|小学生/u,young:/青年|少年|年轻/u,middle:/中年/u},
    color:{blue:/蓝色|蓝光/u,gold:/金色|金光/u,red:/红色|红光/u},
    function:{achievement:/成就/u,task:/任务面板/u}
  };
  function traits233(text,kind){const output={};for(const [category,options]of Object.entries(visualTraits233)){
    if(kind!=='people'&&['costume','age'].includes(category)||kind==='people'&&['color','function'].includes(category))continue;
    output[category]=Object.entries(options).filter(([,pattern])=>pattern.test(text)).map(([key])=>key);
  }return output;}
  function visualDescription233(asset){
    // Frozen public descriptions begin with the asset setting, followed by
    // plot use. The latter may mention a future outfit, not this image's form.
    return [asset.variant,asset.form,asset.ageStage,asset.age,asset.gender,asset.costume,asset.appearance,
      String(asset.description||'').split(/[；;](?:剧情作用|独立资产原因)|剧情作用[：:]/u)[0],asset.name].filter(Boolean).join(' ');
  }
  function automaticChoice237(rows,name,evidence,context,options){
    // Only rows already owning this exact name/alias participate. Similar
    // descriptions never import an unrelated person from the wider script.
    const label=normalize(name),selected=new Set(options.selectedIds||[]);
    const vocabulary=text=>new Set((String(text).match(/[\p{Script=Han}]{2,}/gu)||[]).flatMap(word=>{
      const tokens=[];for(let size=2;size<=Math.min(4,word.length);size++)for(let at=0;at+size<=word.length;at++)tokens.push(word.slice(at,at+size));return tokens;
    }).filter(word=>!/(?:画面|镜头|人物|背景|清晰|站在|保持|机位|正常|动作|光线|运镜|构图|设定|风格|原文|表情|系统)/u.test(word)));
    const words=vocabulary(evidence),ranked=rows.map(asset=>{
      const kind=asset.kind||'',visual=traits233(visualDescription233(asset),kind),full=normalize(asset.name);
      let conflict=false,score=0;const basis=[];
      for(const [category,values]of Object.entries(context))if(values.length===1){
        const found=visual[category]||[];
        if(found.includes(values[0])){score+=28;basis.push(category==='costume'?'服装':category==='age'?'年龄':category==='color'?'颜色':'用途');}
        else if(found.length){conflict=true;score-=80;}
      }
      // A complete distinguishing prop/scene name outranks a broad alias.
      // Character names do not by themselves choose the parent's costume.
      if(full===label){score+=kind==='people'?18:70;basis.push('完整名称');}
      else if(full.endsWith(label)){score+=kind==='people'?12:62;basis.push('名称后缀');}
      else if(full.includes(label)){score+=kind==='people'?10:42;basis.push('名称');}
      const description=visualDescription233(asset),overlap=[...vocabulary(description)].filter(word=>words.has(word));
      score+=Math.min(30,overlap.reduce((sum,word)=>sum+(word.length===4?3:word.length===3?2:1),0));
      if(overlap.length)basis.push('局部设定');
      const appearances=(asset.appearsIn||[]).map(value=>/^第?0*(\d+)\s*[集话]/u.exec(String(value).trim())?.[1]).filter(Boolean).map(Number);
      if(options.episodeNumber&&appearances.length){if(appearances.includes(options.episodeNumber)){score+=20;basis.push('当前集');}else score-=15;}
      if(selected.has(asset.referenceId)){score+=5;basis.push('本卡选择');}
      const ready=asset.imageReady!==false&&!!asset.imageFile;
      return {asset,score,conflict,ready,basis};
    });
    // When a particular matching identity has no file, do not substitute a
    // different person. For otherwise equivalent same-name versions, prefer
    // an available image so the user need not repair an avoidable dead choice.
    const candidates=ranked.some(row=>!row.conflict)?ranked.filter(row=>!row.conflict):ranked;
    candidates.sort((a,b)=>b.score-a.score||Number(b.ready)-Number(a.ready)
      ||String(a.asset.referenceId).localeCompare(String(b.asset.referenceId),'en'));
    const best=candidates[0];
    return best?{asset:best.asset,reason:best.basis.length?'按当前分镜'+[...new Set(best.basis)].join('、')+'自动选用':'同名版本按可用图片与稳定资产身份自动选用',
      confidence:candidates[1]&&best.score===candidates[1].score?'default':'context'}:null;
  }
  function resolve(item,assets,options={}){
    if(!item||!Array.isArray(assets))return {assets:[],unresolved:[],missing:[]};
    const raw=String(item.videoPrompt??item.storyboard??item.sourceText??''),catalog=assets.filter(validId233),byId=new Map(catalog.map(a=>[a.referenceId,a]));
    const opaque=referenceProtection(raw,catalog).ranges;
    const source=raw.split('').map((char,index)=>opaque.some(range=>index>=range.start&&index<range.end)?' ':char).join('');
    const explicit=new Set((options.explicitIds||[]).filter(id=>byId.has(id))),owners=new Map();
    for(const asset of catalog)for(const label of names(asset).filter(n=>n.length>=2)){if(!owners.has(label))owners.set(label,[]);const rows=owners.get(label);if(!rows.some(a=>a.referenceId===asset.referenceId))rows.push(asset);}
    const labels=[...owners.keys()].sort((a,b)=>b.length-a.length),hits=[];
    if(labels.length)for(const hit of source.matchAll(new RegExp(labels.map(escapePattern).join('|'),'gu')))hits.push({name:hit[0],start:hit.index,end:hit.index+hit[0].length});
    const selected=new Map(),resolutions=new Map(),unresolved=[],missing=[],automatic=[],processed=new Set();
    const ready=asset=>asset.imageReady!==false&&!!asset.imageFile;
    // An unambiguous full name anywhere in this card is useful evidence for
    // subsequent shortened mentions, but a missing file never picks its rival.
    const anchored=new Set(explicit);
    for(const hit of hits){const rows=owners.get(hit.name);if(rows.length===1)anchored.add(rows[0].referenceId);}
    for(const hit of hits){
      // Unresolved and missing mentions need deduplication too. Repeated
      // occurrences previously created the same expanded chooser four times.
      if(processed.has(hit.name))continue;processed.add(hit.name);
      const rows=owners.get(hit.name),primary=rows.filter(a=>normalize(a.name)===normalize(hit.name));
      const manual=rows.filter(a=>explicit.has(a.referenceId));
      let chosen=manual.length===1?manual[0]:rows.length===1?rows[0]:null,reason=chosen?(manual.length===1?'本卡已手动选择此版本':'名称精确对应'):'';
      if(!chosen){const anchors=rows.filter(a=>anchored.has(a.referenceId));if(anchors.length===1){chosen=anchors[0];reason='本卡已明确对应同一资产';}}
      const rowIds=new Set(rows.map(a=>a.referenceId));
      const entityHits=hits.filter(other=>owners.get(other.name)?.some(a=>rowIds.has(a.referenceId)));
      const localEvidence=entityHits.map(mention=>{
        const lineStart=source.lastIndexOf('\n',mention.start-1)+1,lineEnd=source.indexOf('\n',mention.end);
        let start=Math.max(lineStart,mention.start-60),end=Math.min(lineEnd<0?source.length:lineEnd,mention.end+200);
        for(const other of hits){if(other===mention||!owners.get(other.name)?.some(a=>a.kind==='people')||owners.get(other.name)?.some(a=>rowIds.has(a.referenceId)))continue;
          if(other.end<=mention.start&&other.end>start)start=other.end;
          if(other.start>=mention.end&&other.start<end)end=other.start;
        }
        return source.slice(start,end);
      }).join('\n');
      const context=traits233(localEvidence,rows[0]?.kind||'');
      if(!chosen&&options.episodeNumber){
        const appearances=asset=>(asset.appearsIn||[]).map(value=>/^第?0*(\d+)\s*[集话]/u.exec(String(value).trim())?.[1]).filter(Boolean).map(Number);
        const scoped=rows.filter(asset=>appearances(asset).includes(options.episodeNumber));
        if(scoped.length===1&&rows.every(asset=>appearances(asset).length)){
          const visual=traits233(visualDescription233(scoped[0]),scoped[0].kind);
          const conflict=Object.entries(context).some(([category,values])=>values.length===1&&visual[category]?.length&&!visual[category].includes(values[0]));
          if(!conflict){chosen=scoped[0];reason='当前集与资产明确出场范围一致';}
        }
      }
      if(!chosen){
        const kind=rows[0]?.kind||'';
        const ranked=rows.map(asset=>{
          const visual=traits233(visualDescription233(asset),kind);let score=0,conflict=false;const evidence=[];
          for(const [category,values]of Object.entries(context))if(values.length===1){
            const found=visual[category]||[];
            if(found.includes(values[0])){score+=category==='costume'||category==='age'?4:3;evidence.push(category==='costume'?'服装':category==='age'?'年龄':category==='color'?'颜色':'面板功能');}
            else if(found.length)conflict=true;
          }
          return {asset,score,conflict,evidence};
        }).sort((a,b)=>b.score-a.score);
        const candidates=ranked.filter(row=>!row.conflict),best=candidates[0];
        if(best?.score>=3&&(!candidates[1]||best.score>candidates[1].score)&&ranked.filter(row=>row!==best).every(row=>row.conflict||row.score===0)){
          chosen=best.asset;reason='当前画面'+best.evidence.join('、')+'与资产设定一致';
        }
      }
      // A character's unsuffixed parent name is not a selection of its base
      // costume. Explicit full prop names can outrank another prop's alias,
      // after variant/costume and in-card anchors have had their say.
      if(!chosen&&rows[0]?.kind!=='people'&&primary.length===1){chosen=primary[0];reason='物品或场景完整名称精确对应';}
      if(!chosen&&options.automatic===true){
        const inferred=automaticChoice237(rows,hit.name,localEvidence,context,options);
        if(inferred){chosen=inferred.asset;reason=inferred.reason;automatic.push({name:hit.name,id:chosen.referenceId,reason,confidence:inferred.confidence});}
      }
      if(chosen){resolutions.set(hit.name,{id:chosen.referenceId,reason});if(ready(chosen))selected.set(chosen.referenceId,chosen);else missing.push({name:hit.name,candidates:[chosen],reason:'对应资产没有可用图片'});}
      else unresolved.push({name:hit.name,kind:rows[0]?.kind||'',candidates:rows,reason:'同名或别名对应多个造型，请选择本卡使用的图片'});
    }
    const uniqueIssues=items=>[...new Map(items.map(issue=>[JSON.stringify([issue.kind||'',issue.reason,
      issue.candidates.map(asset=>asset.referenceId).sort()]),issue])).values()];
    return {assets:[...selected.values()],unresolved:uniqueIssues(unresolved),missing:uniqueIssues(missing),resolutions,automatic};
  }

  const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quotePairs = new Map([['“','”'],['‘','’'],['「','」'],['『','』'],['"','"'],["'","'"]]);
  function referenceProtection(text, assets) {
    text=String(text);
    const ranges=[],quotes=[],tokens=[...text.matchAll(/@\{(?:people|scenes|props|canvas):[^{}\s]+\}/g)];
    for(const match of tokens)ranges.push({start:match.index,end:match.index+match[0].length,kind:'token'});
    const stack=[];let tokenIndex=0;
    for(let i=0;i<text.length;i++){
      if(tokens[tokenIndex]?.index===i){i+=tokens[tokenIndex++][0].length-1;continue;}
      const char=text[i];
      if(char==='"'||char==="'"){
        let backslashes=0;for(let j=i-1;j>=0&&text[j]==='\\';j--)backslashes++;
        if(backslashes%2)continue;
      }
      if(stack.length&&char===stack[stack.length-1].close){
        const pair=stack.pop();
        if(!stack.length){const range={start:pair.start,end:i+1,kind:'quote',balanced:true,nested:pair.nested};quotes.push(range);ranges.push(range);}
      }else if(quotePairs.has(char)){
        if(stack.length)stack[0].nested=true;
        stack.push({start:i,close:quotePairs.get(char),nested:false});
      }
    }
    // An unfinished outer quote is still speech, never a name decoration.
    if(stack.length)ranges.push({start:stack[0].start,end:text.length,kind:'quote',balanced:false});
    const speakers=[...new Set(assets.filter(asset=>asset.kind==='people'||String(asset.referenceId||'').startsWith('people:')).flatMap(names))].filter(Boolean).sort((a,b)=>b.length-a.length);
    const speakerPattern=speakers.length?new RegExp('^(?:'+speakers.map(escapePattern).join('|')+')(?:[（(][^）)\\n]*[）)])?\\s*[：:]'):null;
    let lineOffset=0;
    for(const line of text.split('\n')){
      const trimmed=line.trimStart(),speaker=speakerPattern?.test(trimmed)||/^@\{people:[^{}\s]+\}(?:[（(][^）)\n]*[）)])?\s*[：:]/.test(trimmed);
      if(speaker){const start=trimmed.startsWith('@{')?line.indexOf('}')+1:0,colon=start+line.slice(start).search(/[：:]/);ranges.push({start:lineOffset+colon,end:lineOffset+line.length,kind:'speech'});}
      // Both legacy [人物台词] and current 【台词】 labels protect the entire
      // remaining line. A later visual label must not reopen spoken content.
      const label=/\[[^\]\n]*(?:台词|对白|旁白|画外音)[^\]\n]*\]|【[^】\n]*(?:台词|对白|旁白|画外音)[^】\n]*】/.exec(line);
      if(label)ranges.push({start:lineOffset+label.index+label[0].length,end:lineOffset+line.length,kind:'speech'});
      lineOffset+=line.length+1;
    }
    return {ranges,quotes};
  }

  function partialQuotedNames(text, assets, protection=referenceProtection(text,assets)) {
    text=String(text);
    const owners=new Map();
    for(const asset of assets)for(const name of names(asset)){
      if(!/^(?:people|scenes|props|canvas):[^{}\s]+$/.test(String(asset.referenceId)))continue;
      if(name.length<2||/[“”‘’「」『』"'\n]/u.test(name))continue;
      if(!owners.has(name))owners.set(name,new Set());owners.get(name).add(asset.referenceId);
    }
    const matches=[];
    for(const quote of protection.quotes){
      if(!quote.balanced||quote.nested)continue;
      const inner=text.slice(quote.start+1,quote.end-1);
      if(!inner||inner.includes('\n'))continue;
      for(const [name,ids]of owners){
        // Only a proper part of an exact known name may have decoration.
        // A wholly quoted name, nested quotation or split punctuation stays
        // opaque. No global stripping and no guessed generic suffix binding.
        if(inner.length>=name.length)continue;
        for(let at=name.indexOf(inner);at!==-1;at=name.indexOf(inner,at+1)){
          const prefix=name.slice(0,at),suffix=name.slice(at+inner.length),start=quote.start-prefix.length,end=quote.end+suffix.length;
          if(start<0||end>text.length||text.slice(start,quote.start)!==prefix||text.slice(quote.end,end)!==suffix)continue;
          if(protection.ranges.some(range=>range!==quote&&start<range.end&&end>range.start))continue;
          matches.push({start,end,name,referenceIds:[...ids]});
        }
      }
    }
    // Consume the whole longest candidate even when ambiguous/unselected,
    // so a shorter asset cannot steal its unquoted suffix.
    matches.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
    const result=[];for(const match of matches)if(!result.length||match.start>=result[result.length-1].end)result.push(match);
    return result;
  }

  function nameHits(item, assets) {
    // Normalize names independently. Keep punctuation in prose as a boundary:
    // “周。舟” must never become the character “周舟”.
    const rawSource = [
      item.title,
      item.sourceText,
      item.storyboard,
      item.videoPrompt,
      item.description,
    ].filter(Boolean).join("\n");
    const quoted=partialQuotedNames(rawSource,assets);
    let plain='',position=0;
    for(const hit of quoted){plain+=rawSource.slice(position,hit.start)+'\u0000';position=hit.end;}
    const source=(plain+rawSource.slice(position)).normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '\u0000');
    const owners = new Map();
    for (const asset of assets) for (const name of candidates(asset)) {
      if (!owners.has(name)) owners.set(name, new Set());
      owners.get(name).add(asset.referenceId);
    }
    // Consume the longest known name first: “林晚父亲” must not also bind
    // “林晚”. Ambiguous long names stay unresolved, never fall back to a child.
    const lengths = [...owners.keys()].filter(name=>name.length>=2).sort((a,b)=>b.length-a.length);
    const present = new Set(), ambiguous = new Set();
    if (lengths.length) {
      const expression = new RegExp(lengths.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'), 'gu');
      for (const hit of source.matchAll(expression)) if (owners.get(hit[0]).size===1) present.add(hit[0]); else ambiguous.add(hit[0]);
    }
    for(const hit of quoted){const name=normalize(hit.name);if(owners.get(name)?.size===1)present.add(name);else if(owners.has(name))ambiguous.add(name);}
    return {owners,present,ambiguous};
  }

  function ambiguities(item,assets){return !item||!Array.isArray(assets)?[]:[...nameHits(item,assets).ambiguous];}

  function match(item, assets) {
    if (!item || !Array.isArray(assets)) return [];
    const {owners,present}=nameHits(item,assets),matched=[];
    for (const asset of assets) {
      if (!asset?.referenceId || !asset?.imageFile) continue;
      const names = candidates(asset);
      if (!names.length) continue;
      const idValues = new Set(values(item[asset.kind]).map(normalize).filter(Boolean));
      const assetIds = new Set([asset.id, asset.referenceId].filter(Boolean).map(normalize));
      let score = 0;
      for (const name of names) {
        if (idValues.has(name) && owners.get(name)?.size === 1) score = Math.max(score, 120);
        // Ignore one-character substring matches; they create too many false
        // positives in Chinese text. Explicit, exact field matches still win.
        else if (present.has(name)) score = Math.max(score, 80 + Math.min(name.length, 20));
      }
      if ([...assetIds].some(id => idValues.has(id))) score = Math.max(score, 125);
      if (score) matched.push({ asset, score, order: matched.length });
    }
    return matched
      .sort((left, right) => (KIND_PRIORITY[left.asset.kind] ?? 9) - (KIND_PRIORITY[right.asset.kind] ?? 9)
        || right.score - left.score || left.order - right.order)
      .map(row => row.asset);
  }

  const api = { normalize, match, names, ambiguities, referenceProtection, partialQuotedNames, resolve, visualDescription233 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ReferenceMatcher = api;
})();

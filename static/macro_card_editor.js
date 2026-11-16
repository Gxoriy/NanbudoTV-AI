/* Macro-card drafts use their own source-bound API; paid model receipts stay immutable. */
(function (root) {
  'use strict';
  function create(options) {
    const host=options.root, win=host.ownerDocument.defaultView, shared=win.MacroArrangement, mentions=win.ReferenceMentions;
    const drafts=new Map(), mounted=new Map(), sources=new Map(), sourceMounted=new Map(), referenceSyncs=new Map();
    // The editor presents successive shots without empty spacer paragraphs.
    // Only the editable copy is compacted; model receipts/source stay intact.
    const compactPrompt=text=>String(text??'').replace(/(\r?\n)(?:[ \t\u00a0]*\r?\n)+/g,'$1');
    const key=(id,number)=>JSON.stringify([id,Number(number)]);
    const controller=()=>options.controller();
    const state=()=>controller()?.peekState?.() || controller()?.getState() || {};
    const assets=()=> (state().catalog?.assets || []).filter(asset=>asset.imageReady).map(asset=>({...asset,referenceId:asset.id}));
    const knownAssets=()=> (state().catalog?.assets || []).map(asset=>({...asset,referenceId:asset.id}));
    const locked=(id,number)=> {const view=state();return shared.quoteBlocked(view,id,number) || shared.operationBlocked(view,id,number) || shared.textBlocked(view,id,number) || shared.cardMediaBlocked(view,id,number) || !view.snapshot?.repeatableActions&&!shared.savedCardActionsAvailable(view.snapshot)&&view.snapshot?.sourceEpochMatches===false || options.locked?.(id,number);};
    function sourceValue(editor,value) {const prefix=editor.sourcePrefix || '';return prefix&&!value.startsWith(prefix)?prefix+value:value;}
    function capture() {for(const [id,editor] of mounted){const draft=drafts.get(id);if(draft)draft.prompt=editor.value();}for(const [id,editor] of sourceMounted){const source=sources.get(id);if(source)source.sourceText=sourceValue(editor,editor.value);}}
    function readCard(id,number) {const snapshot=state().snapshot || {},segment=(snapshot.plan?.segments || []).find(row=>(row.id || row.segmentId)===id);return shared.readSceneCards(snapshot,segment || {}).find((row,index)=>(row.number || index+1)===Number(number));}
    function resultIdentity(id,number) {const snapshot=state().snapshot || {},adopted=snapshot.skillAdoptions?.[id]?.[String(number)];return adopted?.id||adopted?.comparisonId||snapshot.cardRegenerations?.[id]?.[String(number)]?.result?.rawResponseHash || shared.cardIdentity228?.(snapshot,id,number) || snapshot.segments?.[id]?.result?.rawResponseHash || '';}
    function referenceMatchAssets(all) {
      return all.map(asset=>({...asset,aliases:win.ReferenceMatcher?.names(asset) || asset.aliases || []}));
    }
    function autoReferences(text,id,number,manualIds=[],fromModel=false) {
      const all=assets(),known=(state().catalog?.assets||[]).map(asset=>({...asset,referenceId:asset.id})),matching=referenceMatchAssets(known);
      const separated=mentions.separateManagedBindings(text),ready=new Set(all.map(asset=>asset.id)),byId=new Map(known.map(asset=>[asset.id,asset]));
      // An untouched model token is only a suggestion. A known asset without
      // a file becomes its literal name; saved/manual tokens stay explicit and
      // require the user to repair the missing selection before generation.
      const body=fromModel?mentions.parts(separated.body).map(part=>part.id&&byId.has(part.id)&&!ready.has(part.id)?byId.get(part.id).name:part.id?'@{'+part.id+'}':part.text).join(''):separated.body;
      // Only the editable storyboard is visual evidence. A card's original
      // excerpt can contain whole-episode cast lists and authoring metadata.
      // Explicit in-body @ choices stay authoritative, including missing files
      // which must be repaired rather than replaced with a different person.
      const explicit=mentions.parts(body).filter(part=>part.id).map(part=>part.id),plain=mentions.plain(body,known);
      const available=matching.filter(asset=>ready.has(asset.id));
      // Names mentioned only in spoken words are not visible characters or
      // props. The annotator already preserves that speech byte-for-byte.
      const protection=win.ReferenceMatcher?.referenceProtection?.(plain,matching),ranges=protection?.ranges||[];
      const evidence=plain.split('').map((char,index)=>ranges.some(row=>index>=row.start&&index<row.end)?' ':char).join('');
      const segment=(state().snapshot?.plan?.segments||[]).find(row=>(row.id||row.segmentId)===id),episode=/第\s*0*(\d+)\s*集/u.exec(String(segment?.title||''));
      const resolved=win.ReferenceMatcher?.resolve?.({videoPrompt:evidence},matching,{automatic:true,explicitIds:[...explicit,...manualIds],episodeNumber:episode?Number(episode[1]):null});
      const annotated=mentions.annotate(body,available,matching,resolved?.resolutions);
      const inferred=[...new Set([...mentions.parts(annotated).filter(part=>part.id).map(part=>part.id),...(resolved?.assets||[]).map(asset=>asset.id)])];
      const ambiguous=[...new Set(resolved?.unresolved?.map(row=>row.name)||win.ReferenceMatcher?.ambiguities?.({videoPrompt:evidence},matching)||[])],ambiguityNote=ambiguous.length?`；${ambiguous.slice(0,4).map(name=>'“'+name+'”').join('、')}尚无可用的对应图片。`:'';
      const automaticNote=resolved?.automatic?.length?`；已自动选定 ${new Set(resolved.automatic.map(row=>row.id)).size} 项同名版本，可点击引用标签更换。`:'';
      const view=state(),savedRefs=view.snapshot?.cardDrafts?.[id]?.[String(number)]?.referenceAssetIds || [],selection=shared.defaultMediaDraft(view.catalog,'video',{referenceAssetIds:savedRefs,...view.mediaDrafts?.[shared.mediaKey(id,number)]?.video},view.snapshot?.settings?.ratio || '16:9');
      const model=view.catalog?.models?.find(row=>row.media==='video'&&row.model===selection.model);
      const limit=Number.isInteger(model?.referenceImageLimit)?Math.max(0,model.referenceImageLimit):Infinity;
      const selected=[...new Set([...explicit,...inferred,...manualIds])];
      const synchronized=mentions.synchronizeSelection(annotated,selected,matching,{includeUnmentioned:true,manualReferenceIds:manualIds});
      const missing=resolved?.missing?.map(row=>row.name)||known.filter(asset=>!ready.has(asset.id)&&win.ReferenceMatcher?.match({videoPrompt:evidence},[{...asset,imageFile:'unavailable'}]).length).map(asset=>asset.name);
      const missingNote=missing.length?`；“${[...new Set(missing)].slice(0,4).join('”、“')}”暂无可用图片，未用其他资产替代。`:'';
      const removed=separated.bindings.filter(value=>!selected.includes(value)).length,removedNote=removed?`；已移除 ${removed} 项未在本卡分镜出现的旧自动绑定。`:'';
      return {text:synchronized,ids:selected,referenceIssues:resolved?[...resolved.unresolved,...resolved.missing]:[],
        message:(!all.length?'暂无可引用的参考图，请先生成或上传。':!selected.length?'本卡未找到可用的对应参考图。':selected.length>limit?`已保留并标注 ${selected.length} 张参考图；当前模型最多支持 ${limit} 张，请调整引用或切换模型后再生成。`:`已按本卡分镜标注 ${selected.length} 张参考图，保存后生效。`)+automaticNote+ambiguityNote+missingNote+removedNote};
    }
    function assertReferencesReady233(id,number){
      capture();const draft=get(id,number);if(!draft)return;
      const report=autoReferences(draft.prompt,id,number,draft.manualReferenceIds||[]),selected=new Set(draft.referenceAssetIds),catalog=state().catalog?.assets||[];
      const invalid=draft.referenceAssetIds.filter(id=>!catalog.some(asset=>asset.id===id&&asset.imageReady!==false&&asset.imageFile));
      if(invalid.length)throw Error(`已勾选的参考图不可用：${invalid.map(id=>catalog.find(asset=>asset.id===id)?.name||id).join('、')}。请取消该项，或先生成／上传对应图片；尚未提交或扣费。`);
      const uncovered=report.ids.filter(value=>!selected.has(value)).map(value=>catalog.find(asset=>asset.id===value)).filter(Boolean);
      const issues=[...(report.referenceIssues||[]),...uncovered.map(asset=>({name:asset.name,candidates:[asset],reason:'已识别本卡中的对象，但对应图片尚未加入当前引用'}))];
      draft.referenceIssues=issues;
      const container=mounted.get(key(id,number))?.editor.closest('[data-prompt-editor]');if(container)renderReferenceChoices(container,draft,id,number);
      if(issues.length)draft.referenceMessage=`可选参考图提示：${[...new Set(issues.map(row=>row.name))].slice(0,6).join('、')}未加入当前引用。将按当前勾选生成，未勾选对象保留文字描述。`;
      return {ready:true,warnings:issues};
    }
    function get(id,number) {
      const token=key(id,number),identity=resultIdentity(id,number),old=drafts.get(token);
      if(old && old.identity===identity){initialize(old,id,number);return old;}
      if(old?.dirty&&old.manual){old.conflict=true;return old;}
      const snapshot=state().snapshot || {},card=readCard(id,number);
      if(!card)return null;
      const saved=snapshot.cardDrafts?.[id]?.[String(number)],draft={prompt:compactPrompt(saved?.prompt ?? shared.cardPrompt(card)),referenceAssetIds:[...(saved?.referenceAssetIds ?? card.referenceAssetIds ?? [])],revision:saved?.revision ?? 0,identity,dirty:false,initialized:!!saved,automaticReferences:!saved};drafts.set(token,draft);initialize(draft,id,number);return draft;
    }
    function initialize(draft,id,number){
      const catalog=state().catalog;
      if(!draft.automaticReferences||draft.manual||draft.referenceCatalog===catalog?.assets||locked(id,number)||!mentions||!catalog)return;
      draft.initialized=true;draft.referenceCatalog=catalog.assets;
      // Derive only this card's names, never carry a model-supplied whole-scene
      // list into every card or use its generated binding line as evidence.
      // Saved user drafts (including a deliberately empty selection) are
      // initialized in get() and never enter this automatic path.
      const result=autoReferences(draft.prompt,id,number,draft.manualReferenceIds||[],true);
      draft.prompt=result.text;draft.referenceAssetIds=result.ids;draft.referenceIssues=result.referenceIssues;draft.referenceMessage=result.message;draft.dirty=true;
    }
    function syncChecks(id,number,draft) {
      // Chips, checkboxes, capability checks and the submitted payload share
      // this exact local selection. Queue after mount to avoid re-entrant draw.
      const target=controller(),token=key(id,number),references=[...draft.referenceAssetIds];
      referenceSyncs.set(token,references);
      Promise.resolve().then(()=>{
        if(referenceSyncs.get(token)!==references)return;
        referenceSyncs.delete(token);
        if(controller()!==target||drafts.get(token)!==draft||locked(id,number))return;
        const view=state(),card=readCard(id,number),current=shared.cardReferenceSelection(view.snapshot,id,number,card,view);
        if(JSON.stringify(current)!==JSON.stringify(references))target.updateMediaDraft(id,number,'video',{referenceAssetIds:references});
      }).catch(error=>options.onError?.(error));

      for(const node of host.querySelectorAll('[data-media-param="reference"]'))if(node.dataset.segment===id && Number(node.dataset.card)===number)node.checked=draft.referenceAssetIds.includes(node.value);
      for(const card of host.querySelectorAll('.video-card'))if(card.dataset.segment===id && Number(card.dataset.card)===number){
        const view=state(),selection=shared.defaultMediaDraft(view.catalog,'video',{...view.mediaDrafts?.[shared.mediaKey(id,number)]?.video,referenceAssetIds:draft.referenceAssetIds},view.snapshot?.settings?.ratio||'16:9',readCard(id,number)),model=view.catalog?.models?.find(row=>row.media==='video'&&row.model===selection.model),usage=shared.tailFrameUsage242?.(model,selection,number);
        const summary=card.querySelector('.media-reference-picker summary'),count=summary?.querySelector('.reference-count');if(count)count.textContent=count.textContent.replace(/已选 \d+ 张(?: \+ 尾帧 \d+ 张 = 共 \d+ 张)?/,`已选 ${draft.referenceAssetIds.length} 张${usage?.tail?' + 尾帧 1 张 = 共 '+usage.total+' 张':''}`).replace(/本卡模型最多 \d+ 张/,`本卡模型最多 ${usage?.maximum??model?.referenceImageLimit??'—'} 张`);else if(summary?.firstChild)summary.firstChild.textContent=`本卡参考图 · 已选 ${draft.referenceAssetIds.length} 张`;
        const slots=card.querySelector('[data-tail-slots242]');if(slots&&usage)slots.textContent=usage.text;
      }
    }
    async function save(id,number) {
      capture();const draft=get(id,number);if(!draft)throw Error('本卡描述词尚未就绪。');
      if(draft.conflict)throw Error('本卡已有新的分镜结果，旧手写草稿仍保留；请先点击“使用新分镜”再编辑保存。');
      const saved=state().snapshot?.cardDrafts?.[id]?.[String(number)];
      if(!draft.dirty && saved?.assetScopeVersion===2 && saved.prompt===draft.prompt && JSON.stringify(saved.referenceAssetIds)===JSON.stringify(draft.referenceAssetIds))return saved;
      const submitted=draft.prompt,refs=[...draft.referenceAssetIds];
      const result=await controller().saveCardDraft(id,number,submitted,refs,draft.revision);
      draft.revision=result.revision;draft.automaticReferences=false;
      if(draft.prompt===submitted && JSON.stringify(draft.referenceAssetIds)===JSON.stringify(refs))draft.dirty=false;
      const live=mounted.get(key(id,number))?.editor.closest('[data-prompt-editor]')?.querySelector('.mention-save-status');
      if(live){if(win.ModelActivity)win.ModelActivity.set(live,{state:'success',message:'描述词与引用已保存。'});else live.textContent='描述词与引用已保存。';}
      return result;
    }
    function reset(id,number){
      capture();if(locked(id,number))return;
      const token=key(id,number),card=readCard(id,number);if(!card)return;
      const saved=state().snapshot?.cardDrafts?.[id]?.[String(number)];
      drafts.set(token,{prompt:compactPrompt(saved?.prompt??shared.cardPrompt(card)),referenceAssetIds:[...(saved?.referenceAssetIds??shared.cardReferenceSelection(state().snapshot,id,number,card,{catalog:state().catalog}))],revision:saved?.revision??0,identity:resultIdentity(id,number),dirty:false,manual:false,initialized:true,automaticReferences:false});
      mounted.delete(token);mount();
      const status=host.querySelector(`[data-prompt-editor][data-segment="${id}"][data-card="${number}"] .mention-save-status`);
      if(status)status.textContent='已撤销本卡未保存修改；未调用模型、未扣费。';
    }
    function mount() {
      for(const [token,editor]of mounted)if(!editor.editor.isConnected)mounted.delete(token);
      for(const [token,editor]of sourceMounted)if(!editor.isConnected)sourceMounted.delete(token);
      mountSources();
      if(!mentions?.mount)return;
      const snapshot=state().snapshot || {};
      for(const container of host.querySelectorAll('[data-prompt-editor]')) {
        const id=container.dataset.segment,number=Number(container.dataset.card),token=key(id,number),draft=get(id,number),saved=snapshot.cardDrafts?.[id]?.[String(number)];if(!draft)continue;
        if(saved && !draft.dirty){draft.prompt=compactPrompt(saved.prompt);draft.referenceAssetIds=[...saved.referenceAssetIds];draft.revision=saved.revision;}
        const existing=mounted.get(token);
        if(existing&&container.contains(existing.editor)&&existing.draft===draft&&existing.value()===draft.prompt){
          if(existing.assetCatalog!==state().catalog?.assets){existing.refreshAssets?.();existing.assetCatalog=state().catalog?.assets;}
          existing.editor.contentEditable=locked(id,number)?'false':'true';
          for(const button of container.querySelectorAll('.mention-toolbar button'))button.disabled=locked(id,number);
          const status=container.querySelector('.mention-save-status');
          if(draft.conflict&&!status.querySelector('.use-new-storyboard'))showConflict(status,draft,token,id,number);
          syncChecks(id,number,draft);renderReferenceChoices(container,draft,id,number);continue;
        }
        const editor=mentions.mount(container,{text:draft.prompt,initialChange:false,auto:true,
          hint:'整张视频卡统一编辑 · 输入 @ 引用参考图',editorLabel:'本卡完整分镜内容（包含全部镜头，可自定义编辑）',saveLabel:'保存',changedLabel:'有未保存修改，生成时将先保存。',
          assets,allAssets:knownAssets,boundAssets:knownAssets,selected:()=>draft.referenceAssetIds,
          autoAnnotate:text=>{const result=autoReferences(text,id,number,draft.manualReferenceIds||[]);draft.referenceAssetIds=result.ids;draft.referenceIssues=result.referenceIssues;draft.referenceMessage=result.message;draft.dirty=true;syncChecks(id,number,draft);Promise.resolve().then(()=>renderReferenceChoices(container,draft,id,number));return result;},
          media:file=>shared.mediaUrl(snapshot.projectId,file,'frame'),locked:()=>locked(id,number),
          active:()=>container.isConnected && options.active?.()!==false,
          change:text=>{draft.prompt=text;draft.dirty=true;draft.manual=true;},
          select:async(asset,selection={})=>{if(locked(id,number))throw Error('当前任务未结束，暂不能修改引用。');if(selection.replaceId&&selection.replaceId!==asset.id){draft.referenceAssetIds=draft.referenceAssetIds.filter(value=>value!==selection.replaceId);draft.manualReferenceIds=(draft.manualReferenceIds||[]).filter(value=>value!==selection.replaceId);}if(!draft.referenceAssetIds.includes(asset.id))draft.referenceAssetIds.push(asset.id);draft.manualReferenceIds=[...new Set([...(draft.manualReferenceIds||[]),asset.id])];draft.dirty=true;syncChecks(id,number,draft);},
          save:()=>save(id,number),confirm:message=>options.confirm?.(message) ?? Promise.resolve(false)});
        const undo=host.ownerDocument.createElement('button');undo.type='button';undo.className='mention-reset';undo.textContent='撤销未保存';undo.addEventListener('click',()=>reset(id,number));
        const toolbar=container.querySelector('.mention-toolbar');toolbar.insertBefore(undo,toolbar.querySelector('.mention-save'));
        editor.editor.contentEditable=locked(id,number)?'false':'true';
        for(const button of container.querySelectorAll('.mention-toolbar button'))button.disabled=locked(id,number);
        if(draft.conflict)showConflict(container.querySelector('.mention-save-status'),draft,token,id,number);
        else if(saved && !draft.dirty)container.querySelector('.mention-save-status').textContent='描述词与引用已保存。';
        else if(draft.referenceMessage)container.querySelector('.mention-save-status').textContent=draft.referenceMessage;
        editor.draft=draft;editor.assetCatalog=state().catalog?.assets;mounted.set(token,editor);syncChecks(id,number,draft);renderReferenceChoices(container,draft,id,number);
      }
    }
    function renderReferenceChoices(container,draft,id,number){
      if(!container.isConnected)return;
      const issues=draft.referenceIssues||[],catalog=state().catalog?.assets||[],signature=JSON.stringify([issues.map(row=>[row.name,row.reason,row.candidates?.map(a=>a.id)]),draft.referenceAssetIds,locked(id,number)]);
      let box=container.querySelector('.reference-resolution233');
      if(box?._referenceSignature233===signature&&box?._referenceCatalog233===catalog)return;
      if(!box){box=host.ownerDocument.createElement('section');box.className='reference-resolution233';container.append(box);}
      box._referenceSignature233=signature;box._referenceCatalog233=catalog;box.replaceChildren();
      const doc=host.ownerDocument;
      const addChoice=(list,asset,issue)=>{
        const button=doc.createElement('button');button.type='button';button.className='reference-choice233';button.dataset.referenceChoice233=asset.id;button.setAttribute('aria-pressed',String(draft.referenceAssetIds.includes(asset.id)));
        button.disabled=locked(id,number)||asset.imageReady===false||!asset.imageFile;
        if(asset.imageFile){const image=doc.createElement('img');image.src='/api/visual/project-thumbnail?'+new URLSearchParams({projectId:state().snapshot?.projectId||'',file:asset.imageFile}).toString();image.alt='';image.width=85;image.height=76;image.loading='lazy';image.decoding='async';button.append(image);}
        const label=doc.createElement('span'),title=doc.createElement('strong'),note=doc.createElement('small');title.textContent=asset.variant?`${asset.name} · ${asset.variant}`:asset.name;
        note.textContent=asset.imageReady===false||!asset.imageFile?'暂无可用图片':String(asset.description||asset.costume||asset.form||'点击引用此图；保存后生效').slice(0,200);
        label.append(title,note);button.append(label);list.append(button);
        button.addEventListener('click',()=>{
          if(locked(id,number)||drafts.get(key(id,number))!==draft||!container.isConnected)return;
          const editor=mounted.get(key(id,number));if(!editor)return;capture();
          const old=new Set((issue?.candidates||[]).map(a=>a.id));
          const selected=[...draft.referenceAssetIds.filter(value=>!old.has(value)),asset.id];
          draft.manualReferenceIds=[...new Set([...(draft.manualReferenceIds||[]).filter(value=>!old.has(value)),asset.id])];
          draft.referenceAssetIds=[...new Set(selected)];draft.referenceIssues=(draft.referenceIssues||[]).filter(row=>row!==issue);draft.dirty=true;draft.manual=true;
          editor.syncSelection(draft.referenceAssetIds,{includeUnmentioned:true,manualReferenceIds:draft.manualReferenceIds});draft.prompt=editor.value();syncChecks(id,number,draft);
          const status=container.querySelector('.mention-save-status');if(status)status.textContent=`已选择“${title.textContent}”，请保存后生成。`;
          renderReferenceChoices(container,draft,id,number);
        });
      };
      const seenIssues=new Set();for(const issue of issues){
        const signature=JSON.stringify([issue.name,issue.reason,(issue.candidates||[]).map(asset=>asset.id).sort()]);if(seenIssues.has(signature))continue;seenIssues.add(signature);
        const details=doc.createElement('details');details.open=false;
        const title=doc.createElement('summary');title.textContent=`“${issue.name}”图片尚未就绪`;
        const hint=doc.createElement('p');hint.textContent=issue.reason;const list=doc.createElement('div');list.className='reference-choices233';
        for(const asset of issue.candidates||[])addChoice(list,asset,issue);
        details.append(title,hint,list);box.append(details);
      }
      // Unknown names in an older catalog cannot be inferred safely. Provide
      // a local searchable image picker instead of only an opaque @ hint.
      const browse=doc.createElement('details');browse.className='reference-browse233';browse.open=false;
      const summary=doc.createElement('summary');summary.textContent='更换或补充参考图（可选）';
      const input=doc.createElement('input');input.type='search';input.placeholder='搜索人物、造型、场景或物品';input.setAttribute('aria-label','搜索本卡参考图');
      const list=doc.createElement('div');list.className='reference-choices233';const hint=doc.createElement('small');
      const draw=()=>{list.replaceChildren();const query=input.value.trim().toLowerCase(),rows=catalog.filter(asset=>asset.imageReady!==false&&asset.imageFile&&(!query||[asset.name,asset.characterName,asset.variant,...(asset.aliases||[]),asset.description].join(' ').toLowerCase().includes(query)));for(const asset of rows.slice(0,24))addChoice(list,asset,null);hint.textContent=rows.length>24?`共 ${rows.length} 张，当前显示前24张，可输入名称缩小范围。`:rows.length?'点击准确图片加入引用，保存后生效。':'没有可用图片，请先生成或上传对应资产。';};
      let drawn=false;const show=()=>{if(browse.open&&!drawn){drawn=true;draw();}};input.addEventListener('input',draw);browse.addEventListener('toggle',show);
      browse.append(summary,input,list,hint);box.append(browse);show();
    }
    function showConflict(status,draft,token,id,number){status.textContent='已有新分镜，当前保留未保存的旧草稿。';const replace=host.ownerDocument.createElement('button');replace.type='button';replace.textContent='使用新分镜';replace.className='use-new-storyboard';replace.disabled=locked(id,number);replace.addEventListener('click',()=>{drafts.delete(token);mount();});status.append(replace);}
    function sourceDraft(id,number) {
      const token=key(id,number),card=readCard(id,number);if(!card)return null;
      const saved=state().snapshot?.sourceEdits?.[id]?.[String(number)],old=sources.get(token),revision=saved?.revision || 0;
      if(old && (old.revision===revision || old.dirty))return old;
      const source={sourceText:card.sourceText || '',revision,dirty:false};sources.set(token,source);return source;
    }
    async function saveSource(id,number) {
      capture();const source=sourceDraft(id,number);if(!source)throw Error('本卡原文尚未就绪。');
      if(!source.dirty)return state().snapshot?.sourceEdits?.[id]?.[String(number)] || null;
      if(!controller().saveCardSource)throw Error('原文保存接口尚未就绪，未调用模型。');
      const submitted=source.sourceText,result=await controller().saveCardSource(id,number,submitted,source.revision);
      source.revision=result.revision;if(source.sourceText===submitted)source.dirty=false;
      markSourceDirty(sourceMounted.get(key(id,number))?.closest('[data-source-editor]'),source.dirty);
      const status=sourceMounted.get(key(id,number))?.closest('[data-source-editor]')?.querySelector('.source-save-status');
      if(status){if(win.ModelActivity)win.ModelActivity.set(status,{state:'success',message:'原文已保存；补齐本卡分镜后可生成。'});else status.textContent='原文已保存；补齐本卡分镜后可生成。';}return result;
    }
    function markSourceDirty(container,dirty){const marker=container?.closest('[data-source-panel]')?.querySelector('[data-source-dirty]');if(marker)marker.hidden=!dirty;}
    function mountSources() {
      for(const container of host.querySelectorAll('[data-source-editor]')) {
        const id=container.dataset.segment,number=Number(container.dataset.card),token=key(id,number),source=sourceDraft(id,number),card=readCard(id,number);if(!source)continue;
        markSourceDirty(container,source.dirty);
        const existing=sourceMounted.get(token);
        if(existing&&container.contains(existing)&&existing.sourceDraft===source){
          existing.sourcePrefix=card.sourcePrefix || '';
          const displayText=source.dirty
            ? existing.sourcePrefix&&source.sourceText.startsWith(existing.sourcePrefix)
              ? source.sourceText.slice(existing.sourcePrefix.length) : source.sourceText
            : card.displayText ?? source.sourceText;
          if(existing.value!==displayText)existing.value=displayText;
          existing.readOnly=locked(id,number);const save=container.querySelector('.source-save');if(save)save.disabled=locked(id,number);
          let original=container.querySelector('.original-card-source');
          if(card.originalSourceText!==undefined&&card.originalSourceText!==card.sourceText){if(!original){const details=host.ownerDocument.createElement('details'),summary=host.ownerDocument.createElement('summary');summary.textContent='查看切割时原文';original=host.ownerDocument.createElement('div');original.className='original-card-source';details.append(summary,original);container.append(details);}original.textContent=card.originalSourceText;}
          continue;
        }
        container.replaceChildren();const heading=host.ownerDocument.createElement('div');heading.className='source-editor-toolbar';const title=host.ownerDocument.createElement('h4');title.textContent='本卡原文';const save=host.ownerDocument.createElement('button');save.type='button';save.textContent='保存原文';save.className='source-save';save.disabled=locked(id,number);heading.append(title,save);
        const editor=host.ownerDocument.createElement('textarea');editor.className='card-source card-source-editor';editor.setAttribute('aria-label','本卡原文');editor.sourcePrefix=card.sourcePrefix || '';editor.value=source.dirty?(editor.sourcePrefix&&source.sourceText.startsWith(editor.sourcePrefix)?source.sourceText.slice(editor.sourcePrefix.length):source.sourceText):card.displayText ?? source.sourceText;editor.readOnly=locked(id,number);editor.spellcheck=false;
        const status=host.ownerDocument.createElement('small');status.className='source-save-status';status.setAttribute('role','status');status.textContent=source.dirty?'有未保存的原文修改；不会自动调用模型。':source.revision?'原文修改已保存。':'';
        editor.addEventListener('input',()=>{source.sourceText=sourceValue(editor,editor.value);source.dirty=true;markSourceDirty(container,true);status.textContent='有未保存的原文修改；不会自动调用模型。';});
        save.addEventListener('click',async()=>{save.disabled=true;try{await saveSource(id,number);}catch(error){const live=sourceMounted.get(token)?.closest('[data-source-editor]')?.querySelector('.source-save-status') || status;if(win.ModelActivity)win.ModelActivity.set(live,{state:'error',message:error.message});else live.textContent=error.message;}finally{if(save.isConnected)save.disabled=locked(id,number);}});
        container.append(heading,editor,status);
        if(card.originalSourceText!==undefined && card.originalSourceText!==card.sourceText){const original=host.ownerDocument.createElement('details'),summary=host.ownerDocument.createElement('summary'),text=host.ownerDocument.createElement('div');summary.textContent='查看切割时原文';text.className='original-card-source';text.textContent=card.originalSourceText;original.append(summary,text);container.append(original);}
        editor.sourceDraft=source;sourceMounted.set(token,editor);
      }
    }
    function synchronizeReferences(id,number,referenceAssetIds) {
      capture();const draft=get(id,number);if(!draft)return;
      const before=new Set(draft.referenceAssetIds),selected=new Set(referenceAssetIds);
      draft.manualReferenceIds=[...new Set([...(draft.manualReferenceIds||[]).filter(value=>selected.has(value)),...referenceAssetIds.filter(value=>!before.has(value))])];
      draft.referenceAssetIds=[...referenceAssetIds];draft.dirty=true;draft.manual=true;draft.initialized=true;draft.automaticReferences=false;
      const editor=mounted.get(key(id,number));
      if(editor){editor.syncSelection(referenceAssetIds,{includeUnmentioned:true,manualReferenceIds:draft.manualReferenceIds});draft.prompt=editor.value();}
      else if(mentions?.synchronizeSelection)draft.prompt=mentions.synchronizeSelection(draft.prompt,referenceAssetIds,knownAssets(),{includeUnmentioned:true,manualReferenceIds:draft.manualReferenceIds});
      syncChecks(id,number,draft);
    }
    function uploadStatus(id,number,message,error=false) {
      const node=Array.from(host.querySelectorAll('.card-reference-section')).find(el=>{const input=el.querySelector('[data-macro-reference-file]');return input?.dataset.segment===id && Number(input?.dataset.card)===number;})?.querySelector('.reference-upload-status');
      if(!node)return;if(win.ModelActivity)win.ModelActivity.set(node,{state:error?'error':'success',message});else node.textContent=message;
    }
    host.addEventListener('click',async event=>{
      const button=event.target.closest('[data-reference-delete]');
      if(!button||!host.contains(button)||button.disabled||options.active?.()===false)return;
      event.preventDefault();event.stopPropagation();
      const id=button.dataset.segment,number=Number(button.dataset.card),aid=button.dataset.referenceDelete;
      try{
        if(locked(id,number))throw Error('本卡任务未结束，暂不能移除参考图。');
        if(!await options.confirm?.('删除这张外部参考图？将取消各卡对它的引用，原文件保留。'))return;
        capture();const removedAsset=assets().find(asset=>asset.id===aid);
        const response=await controller().deleteReference(id,number,aid);
        for(const [token,draft] of drafts){
          const [sid,card]=JSON.parse(token),saved=state().snapshot?.cardDrafts?.[sid]?.[String(card)];
          if(draft.referenceAssetIds.includes(aid)||draft.prompt.includes('@{'+aid+'}')){
            draft.prompt=draft.prompt.split('@{'+aid+'}').join(removedAsset?.name||response.removed.name);
            draft.referenceAssetIds=draft.referenceAssetIds.filter(value=>value!==aid);draft.dirty=true;
          }
          if(saved)draft.revision=saved.revision;
        }
        mount();uploadStatus(id,number,'外部参考图已移除，原文件已保留。');
      }catch(error){uploadStatus(id,number,error.message,true);}
    });
    host.addEventListener('click',event=>{const button=event.target.closest('[data-macro-upload]');if(options.active?.()===false||!button||!host.contains(button)||button.disabled||locked(button.dataset.segment,Number(button.dataset.card)))return;const input=button.closest('.reference-controls').querySelector('[data-macro-reference-file]');if(input)input.click();});
    host.addEventListener('change',async event=>{const input=event.target.closest('[data-macro-reference-file]');if(options.active?.()===false||!input||!host.contains(input))return;const file=input.files?.[0],id=input.dataset.segment,number=Number(input.dataset.card);if(!file)return;input.value='';
      try{if(locked(id,number))throw Error('任务执行中，暂不能上传参考图。');if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>10*1024*1024)throw Error('请选择不超过10MB的PNG、JPG或WebP图片。');capture();if(!controller().uploadReference)throw Error('参考图上传接口尚未就绪。');const response=await controller().uploadReference(id,number,file),assetId=response.asset?.referenceId || response.asset?.id;if(typeof assetId!=='string'||!/^(people|scenes|props):/.test(assetId))throw Error('上传结果未返回有效参考图身份，请刷新核对。');const draft=get(id,number);if(draft){const refs=[...new Set([...draft.referenceAssetIds,assetId])];synchronizeReferences(id,number,refs);}uploadStatus(id,number,'参考图已上传，未调用模型。');}
      catch(error){uploadStatus(id,number,error.message,true);}
    });
    function unsavedScene(id){capture();return {sourceCards:[...sources].filter(([token,row])=>JSON.parse(token)[0]===id&&row.dirty).map(([token])=>JSON.parse(token)[1]),storyboardCards:[...drafts].filter(([token,row])=>JSON.parse(token)[0]===id&&row.dirty&&row.manual).map(([token])=>JSON.parse(token)[1])};}
    function clearScene(id){for(const map of [drafts,mounted,sources,sourceMounted])for(const token of map.keys())if(JSON.parse(token)[0]===id)map.delete(token);}
    return {capture,mount,save,saveSource,sourceDraft,synchronizeReferences,get,assertReferencesReady233,unsavedScene,clearScene,clear:()=>{drafts.clear();mounted.clear();sources.clear();sourceMounted.clear();}};
  }
  root.MacroCardEditors={create};
})(typeof window!=='undefined'?window:globalThis);

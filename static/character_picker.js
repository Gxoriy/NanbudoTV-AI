/* Reuse real local character images. A recording is never silently sent as TTS. */
window.CharacterPicker = (() => {
  let dialog,viewer;
  const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const media=(kind,id)=>'/api/characters/media?'+new URLSearchParams({kind,id});
  const hasVoiceSample=voice=>!!voice.file||voice.hasSample===true;
  const framing=row=>({'full-body':'已标注：完整全身原图','upper-body':'已标注：原图为半身',unknown:'原图构图未标注'})[row.imageFraming||'unknown']||'原图构图未标注';
  function dialogDocument() {
    // The workflow iframe grows to the full script/card height. A modal
    // centered in that iframe can sit entirely outside the visible window.
    try {
      if (window.parent !== window && window.parent.location.origin === location.origin)
        return window.parent.document;
    } catch (_) { /* Cross-origin embeds keep the local dialog. */ }
    return document;
  }
  async function pick() {
    const response=await fetch('/api/characters/library',{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'角色库读取失败');
    const rows=(data.characters||[]).filter(row=>row.available);
    if(!rows.length)throw new Error('角色库暂无可用角色卡，请先在“数字人”中上传形象并保存角色卡。');
    if(dialog?.open)throw new Error('请先完成当前形象选择或取消。');
    if(!dialog){const owner=dialogDocument();dialog=owner.createElement('dialog');dialog.className='character-picker-dialog';dialog.style.cssText='background:#282c2f;color:#edf0f2;border:1px solid #806c40;border-radius:14px;width:min(900px,90vw);max-height:80dvh;overflow:auto;padding:22px';owner.body.append(dialog);}
    dialog.innerHTML='<h2 style="margin-top:0">选用共用数字人</h2><p style="color:#d5ba83">带入形象、已保存的声音绑定与语言口音；不自动传入声音文件。固定音色请在视频结果中逐段确认台词、时间及配音费用；选择角色不会自动合成。原图半身不会凭空补成全身。</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px">'+rows.map(row=>{
      const voice=(data.voices||[]).find(v=>v.id===row.voiceId);
      const profile=row.speechProfile||{};
      return `<article style="background:#202426;border:1px solid #4a5157;border-radius:10px;padding:12px"><button type="button" data-preview-id="${row.imageId}" aria-label="放大查看${esc(row.name)}原图" style="width:100%;border:0;background:#191d20;padding:0"><img style="display:block;width:100%;height:250px;object-fit:contain" src="${media('images',row.imageId)}" alt="${esc(row.name)}"></button><small>${framing(row)} · 点击原图放大</small><p>${esc(row.name)}</p><small>${esc([profile.language||'中文',profile.accent||'普通话',profile.timbre].filter(Boolean).join(' · '))}</small>${voice?`<small>已搭配：${esc(voice.name)} · ${voice.source==='recording'?'录音样本，尚非克隆':voice.synthesisReady?'可独立确认配音':'合成服务待开通'}</small>${hasVoiceSample(voice)?`<audio style="width:100%;height:36px" controls preload="none" src="${media('voices',voice.id)}"></audio>`:'<p style="font-size:12px;color:#b9c1c6">尚无试听样音，请到音色大厅生成试听。</p>'}`:'<small>未绑定声音</small>'}<button type="button" data-role="${row.id}" style="background:#ffd077;color:#292318;border:0;border-radius:6px;padding:10px;width:100%;margin-top:12px">使用此角色</button></article>`;
    }).join('')+'</div><button id="cancelRole" style="margin-top:18px;padding:10px 22px">取消</button>';
    // Closing during iframe navigation dispatches close asynchronously. Keep
    // this element stable even after pagehide clears the shared reference.
    const box=dialog;
    const row=await new Promise(resolve=>{box.onclick=event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.previewId){const owner=dialogDocument();if(!viewer){viewer=owner.createElement('dialog');viewer.style.cssText='background:#202426;color:#edf0f2;max-width:94vw;max-height:94dvh;border:1px solid #806c40;border-radius:12px;padding:16px';owner.body.append(viewer);}viewer.innerHTML='<button type="button" style="padding:10px">返回角色选择</button><img style="display:block;object-fit:contain;max-width:86vw;max-height:80dvh;margin-top:10px" src="'+media('images',button.dataset.previewId)+'" alt="数字人原图">';viewer.querySelector('button').onclick=()=>viewer.close();viewer.showModal();return;}if(button.dataset.role){resolve(rows.find(row=>row.id===button.dataset.role));box.close();}else if(button.id==='cancelRole')box.close();};box.onclose=()=>{box.querySelectorAll('audio').forEach(a=>a.pause());resolve(null);};box.showModal();});
    if(!row)return null;
    const picture=await fetch(media('images',row.imageId));if(!picture.ok)throw new Error('形象已移除或读取失败，请重新选择。');
    return {character:row,voice:(data.voices||[]).find(voice=>voice.id===row.voiceId)||null,file:new File([await picture.blob()],row.name+'.jpg',{type:'image/jpeg'})};
  }
  function install(selector, handler, eligible = () => true) {
    const scan=()=>document.querySelectorAll(selector).forEach(node=>{
      if(!eligible(node)||node.querySelector('.pick-character'))return;
      const button=document.createElement('button');button.type='button';button.className='pick-character';button.textContent='角色库 · 选形象';
      button.style.cssText='margin:8px 0;border:1px solid #806c40;border-radius:6px;padding:8px;background:#363127;color:#ffd077';
      button.onclick=async event=>{event.stopPropagation();button.disabled=true;try{const role=await pick();if(role)await handler(node,role);}catch(error){await studioAlert(error.message);}finally{button.disabled=false;}};
      (node.querySelector('.asset-extra-actions')||node.querySelector('.visual-card-actions')||node.querySelector('.info')||node.querySelector('details')||node).append(button);
    });
    new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan();
  }
  window.addEventListener('pagehide',()=>{if(viewer?.open)viewer.close();viewer?.remove();viewer=null;if(dialog?.open)dialog.close();dialog?.remove();dialog=null;});
  return {pick,install};
})();

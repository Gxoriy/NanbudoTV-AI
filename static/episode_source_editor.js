/* Explicit, per-card source edits; never overwrite the confirmed full script. */
window.WorkflowCutEditor = (() => {
  const drafts = new Map();
  const regenerationStates = new Map();
  const normalized = text => String(text ?? '').replace(/\r\n/g,'\n').trim();
  // Rendering needs a synchronous SHA-256 to reject legacy overrides before
  // any old source reaches the DOM. No request is made by this fingerprint.
  function fingerprintSync(text) {
    const bytes=new TextEncoder().encode(normalized(text));
    const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;
    const view=new DataView(padded.buffer);view.setUint32(padded.length-8,Math.floor(bytes.length*8/4294967296));view.setUint32(padded.length-4,bytes.length*8>>>0);
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const rotr=(value,count)=>(value>>>count)|(value<<(32-count)),w=new Int32Array(64);
    for(let offset=0;offset<padded.length;offset+=64){
      for(let i=0;i<16;i++)w[i]=view.getInt32(offset+i*4);
      for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))|0;}
      let [a,b,c,d,e,f,g,j]=h;
      for(let i=0;i<64;i++){const t1=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
      [a,b,c,d,e,f,g,j].forEach((value,i)=>{h[i]=(h[i]+value)|0});
    }
    return h.map(value=>(value>>>0).toString(16).padStart(8,'0')).join('');
  }
  const sortedJson=value=>Array.isArray(value)?'['+value.map(sortedJson).join(', ')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+': '+sortedJson(value[key])).join(', ')+'}':JSON.stringify(value);
  const baseCutHash=project=>fingerprintSync(sortedJson(project?.scriptCuts||[]));
  const revision=project=>String(project?.cutRevisionId||'').trim()||'legacy:'+fingerprintSync(sortedJson({cutSourceHash:project?.cutSourceHash||'',scriptCuts:project?.scriptCuts||[]}));
  const namespace=project=>`${project?.id||''}/${revision(project)}/`;
  const matchesRevision=(project,record)=>record?.cutRevisionId?record.cutRevisionId===revision(project):!String(project?.cutRevisionId||'')||String(project.cutRevisionId).startsWith('legacy:');
  function matchingOverride(project,number) {
    const cuts=(project?.scriptCuts||[]).filter(value=>String(value.number)===String(number)),cut=cuts.length===1?cuts[0]:null;
    const record=project?.cutSourceOverrides?.[String(number)];
    if(!cut||!record||typeof record.sourceText!=='string'||!record.sourceText.trim())return null;
    if(!matchesRevision(project,record))return null;
    if('baseCutHash' in record&&record.baseCutHash!==baseCutHash(project))return null;
    if('cutSourceHash' in record&&record.cutSourceHash!==project.cutSourceHash)return null;
    const hasText='originalSourceText' in record,hasHash='originalSourceHash' in record;
    if(!hasText&&!hasHash)return null;
    if(hasText&&normalized(record.originalSourceText)!==normalized(cut.sourceText))return null;
    if(hasHash&&record.originalSourceHash!==fingerprintSync(cut.sourceText))return null;
    if('sourceHash' in record&&record.sourceHash!==fingerprintSync(record.sourceText))return null;
    if('number' in record&&record.number!==Number(number))return null;
    if('durationSeconds' in record&&record.durationSeconds!==cut.durationSeconds)return null;
    return record;
  }
  const effectiveSource=(project,number)=>matchingOverride(project,number)?.sourceText??project?.scriptCuts?.find(cut=>Number(cut.number)===Number(number))?.sourceText??'';
  function currentAttempt(project,number) {
    const attempt=project?.cutStoryboardOneAttempts?.[String(number)];
    if(!attempt||!normalized(effectiveSource(project,number))||attempt.sourceHash!==fingerprintSync(effectiveSource(project,number)))return null;
    if(!matchesRevision(project,attempt))return null;
    if(attempt.cutHash!==baseCutHash(project))return null;
    if(attempt.number!=null&&Number(attempt.number)!==Number(number))return null;
    // Raw legacy records without an entire-cut identity cannot safely attach
    // to a reused episode number after another cut.
    if(!attempt.cutRevisionId&&!attempt.cutHash)return null;
    return attempt;
  }
  function currentBatchAttempt(project,field) {
    const attempt=project?.[field];
    if(!attempt)return null;
    if(!matchesRevision(project,attempt))return null;
    const cuts=(project.scriptCuts||[]).map(cut=>{const override=matchingOverride(project,Number(cut.number));return override?{...cut,sourceText:normalized(override.sourceText)}:{...cut};});
    if(attempt.cutHash!==fingerprintSync(sortedJson(cuts)))return null;
    if(!project.cutSourceHash||attempt.sourceHash!==project.cutSourceHash)return null;
    return attempt;
  }
  async function fingerprint(text) {
    const bytes = new TextEncoder().encode(String(text).replace(/\r\n/g, '\n').trim());
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const canRecheckCachedResult = (attempt, sourceHash) => Boolean(attempt?.sourceHash === sourceHash &&
    attempt?.modelCalls?.some(call => call.status === 'validation_failed' && !call.localRechecked && typeof call.response === 'string' && call.response.trim()));
  function install(context) {
    const project = context.project();
    if (!project?.scriptCuts?.length) return;
    document.querySelectorAll('.visual-episode-card').forEach(card => {
      if(card.dataset.cutPreview==='true')return;
      const number = Number(card.dataset.cutNumber);
      const source = card.querySelector('.visual-episode-script');
      const heading = source?.querySelector('h4'), original = source?.querySelector('pre');
      const rightHeading = card.querySelector('.visual-episode-storyboard h4');
      if (!heading || !original || !rightHeading || source.dataset.editableInstalled) return;
      source.dataset.editableInstalled = 'true';
      const projectId = project.id, cutRevision=revision(project), key = namespace(project)+number, saved = effectiveSource(project, number);
      let savedHash = '';
      original.textContent = saved;
      heading.querySelector('.source-locked-mark')?.remove();
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'source-locked-mark source-lock-toggle';
      toggle.textContent = '解锁编辑'; toggle.title = '打开后可调整本集原内容；原始剧本和切割稿另行保留';
      toggle.setAttribute('aria-label', `解锁第${number}集原内容`); heading.append(toggle);
      const editor = document.createElement('textarea'); editor.className = 'episode-source-editor';
      editor.setAttribute('aria-label', `第${number}集原内容编辑`); editor.value = drafts.get(key) ?? saved;
      editor.maxLength = 20000; editor.hidden = true; editor.readOnly = true; original.after(editor);
      const tools = document.createElement('div'); tools.className = 'episode-source-tools'; tools.hidden = true;
      const save = document.createElement('button'); save.type = 'button'; save.className = 'secondary-btn source-save-lock'; save.textContent = '保存并锁定';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ghost-btn source-cancel-edit'; cancel.textContent = '取消修改';
      tools.append(save, cancel); editor.after(tools);
      const note = document.createElement('small'); note.className = 'episode-source-status'; note.setAttribute('role', 'status'); tools.after(note);
      // A render can happen while the user is typing (for example, a polling
      // update). Restore that draft in the editable state instead of hiding it
      // behind a newly locked card.
      let unlocked = drafts.has(key);
      const live = () => context.project()?.id === projectId && revision(context.project())===cutRevision && card.isConnected;
      const hasPendingVideo = () => context.project()?.episodes?.some(item => Number(item.number) === number && normalized(item.sourceText)===normalized(saved) && (!item.cutRevisionId||item.cutRevisionId===cutRevision) && context.pendingVideo(item));
      const lockedByTask = () => context.busy() || hasPendingVideo();
      const paintLock = () => {
        editor.hidden = !unlocked; editor.readOnly = !unlocked; original.hidden = unlocked; tools.hidden = !unlocked;
        toggle.textContent = unlocked ? '锁定原文' : '解锁编辑'; toggle.setAttribute('aria-pressed', String(unlocked));
        note.textContent = unlocked ? '只修改本集；保存后再重新生成右侧分镜。原始全剧与切割稿保留。'
          : matchingOverride(project,number) ? '已手动调整本集；原始切割稿仍保留。' : '';
      };
      toggle.onclick = async () => {
        if (lockedByTask()) return context.toast('本集视频或剧本任务正在执行，请等待结束后修改。', true);
        if (unlocked && editor.value !== saved && !await context.confirm('未保存的本集修改将取消，确定重新锁定吗？')) return;
        if (!live()) return;
        unlocked = !unlocked;
        if (!unlocked) { editor.value = saved; drafts.delete(key); }
        paintLock(); sync(); if (unlocked) editor.focus();
      };
      editor.oninput = () => drafts.set(key, editor.value);
      cancel.onclick = () => { editor.value = saved; drafts.delete(key); unlocked = false; paintLock(); };
      save.onclick = async () => {
        if (lockedByTask()) return context.toast('任务仍在执行，未保存修改。', true);
        if (!editor.value.trim()) return context.toast('本集原内容不能为空。', true);
        const captured=editor.value;
        save.disabled = true;
        try {
          const data = await context.post('/api/visual/cut/source-save', {projectId, number,cutRevisionId:cutRevision,
            sourceText: captured, expectedSourceHash: await fingerprint(saved)});
          if (live()&&data.project&&revision(data.project)===cutRevision) {
            if(drafts.get(key)===captured)drafts.delete(key);
            context.render(data.project); context.toast('本集内容已保存并锁定；旧分镜、参考图和视频保留。');
          }
        } catch (error) { if (live()) { note.textContent = error.message; context.toast(error.message, true); } }
        finally { if (live()) save.disabled = false; }
      };
      const regenerate = document.createElement('button'); regenerate.type = 'button';
      regenerate.className = 'ghost-btn regenerate-local-storyboard';
      regenerate.title = '调用后台指定模型，只根据左侧本集已保存内容生成，不改其他集'; rightHeading.append(regenerate);
      const priceNote = document.createElement('small'); priceNote.className = 'storyboard-regeneration-quote';
      rightHeading.after(priceNote);
      const regenerationStatus = document.createElement('div'); regenerationStatus.className = 'storyboard-regeneration-status';
      regenerationStatus.setAttribute('role', 'status'); regenerationStatus.hidden = true; priceNote.after(regenerationStatus);
      const receipt = () => currentAttempt(context.project(),number);
      const waitingReceipt = attempt => Boolean(attempt?.taskId && ['queued', 'running'].includes(attempt.state));
      const quote = () => context.regenerationQuote?.() || {ready:false,message:'后台分镜模型和价格尚未确认，暂不能 AI 重新生成'};
      const paintRegeneration = () => {
        const attempt = receipt(), pricing = quote();
        const savedBilling = attempt && ['done','failed'].includes(attempt.state) && attempt.chargedPoints != null
          ? {active:false,error:attempt.state === 'failed',message:`${attempt.state === 'failed' ? `本集生成未通过：${attempt.error || '请检查原任务'}；旧分镜和视频保留。 ` : '本集原调用已完成。 '}${billingSummary(attempt)}`} : null;
        const progress = regenerationStates.get(key) || savedBilling;
        const cached = canRecheckCachedResult(attempt,savedHash);
        regenerate.dataset.cachedRecheck = cached ? '1' : '0';
        const active = Boolean(progress?.active), ownRecovery = Boolean(cached || attempt?.reconcileAllowed || waitingReceipt(attempt));
        const batchRecovery = !ownRecovery && context.batchRecovery?.(number);
        const recovering = Boolean(ownRecovery || batchRecovery);
        regenerate.textContent = active ? progress.recovering ? '正在查询原任务…' : 'AI 模型调用中…'
          : cached ? '重新检查原结果（免费）' : attempt?.reconcileAllowed ? '核对原任务（免费）' : waitingReceipt(attempt) ? '继续查询原任务（免费）' : batchRecovery ? '核对原分镜任务（免费）' : '重新生成';
        regenerate.className = 'ghost-btn regenerate-local-storyboard' + (active ? ' is-working' : '');
        regenerate.setAttribute('aria-busy', String(active));
        regenerate.disabled = lockedByTask() || (!recovering && !pricing.ready);
        priceNote.textContent = cached ? '仅重新校验已返回正文，不调用模型；本次免费，原调用积分结算保留'
          : recovering ? '仅查询原任务，不新建模型调用、不重复扣费'
          : pricing.ready ? `${pricing.modelName} · 预计${Number(pricing.points).toFixed(2)}积分/次 · 本集1次模型调用`
          : pricing.message;
        if (progress) {
          regenerationStatus.hidden = false;
          regenerationStatus.textContent = progress.message;
          regenerationStatus.className = 'storyboard-regeneration-status' + (active ? ' is-working' : progress.error ? ' is-error' : '');
          regenerationStatus.setAttribute('aria-busy', String(active));
        }
      };
      const billingSummary = data => {
        const points = data?.chargedPoints;
        const calls = data?.actualModelCallCount ?? data?.modelCallCount;
        const validPoints = points !== undefined && points !== null && points !== '' && Number.isFinite(Number(points)) && Number(points) >= 0;
        const validCalls = calls !== undefined && calls !== null && calls !== '' && Number.isInteger(Number(calls)) && Number(calls) >= 0;
        if (data?.reconciled) return `本次仅核对原任务，未新建模型调用${validPoints ? `；本次核对扣费${Number(points).toFixed(2)}积分（不代表原调用免费）` : '；本次核对结算以任务记录为准'}`;
        return `${data?.modelName ? `模型：${data.modelName} · ` : ''}${validCalls ? `实际模型调用${Number(calls)}次` : '实际模型调用次数待后台确认'}；${validPoints ? `实际扣费${Number(points).toFixed(2)}积分` : '实际积分结算待后台确认，请核对任务记录'}`;
      };
      regenerate.onclick = async () => {
        if (lockedByTask()) return context.toast('当前任务尚未结束，请勿重复提交。', true);
        if (unlocked || drafts.has(key)) return context.toast('请先保存并锁定左侧内容，再重新生成。', true);
        const sourceHash = await fingerprint(saved);
        if (!live() || lockedByTask()) return;
        const attempt = receipt(), cached = canRecheckCachedResult(attempt,sourceHash), reconcile = Boolean(cached || attempt?.reconcileAllowed), pending = waitingReceipt(attempt);
        const batchRecovery = !(reconcile || pending) && context.batchRecovery?.(number);
        const recovering = Boolean(reconcile || pending || batchRecovery);
        const pricing = quote();
        if (!recovering && !pricing.ready) return context.toast(pricing.message, true);
        const unsavedDescription = context.hasDescriptionDraft?.(projectId,number,cutRevision);
        const draftNotice = unsavedDescription ? '\n你有未保存的手写描述词，已在本机保留，不会被本次 AI 返回覆盖。若想先保存草稿，请取消后点击保存描述词。' : '';
        const prompt = cached ? `只重新检查第${number}集已返回的原正文，不调用模型、不新增积分扣费；原调用结算仍保留。${draftNotice}`
          : batchRecovery ? `免费核对第${number}集所属的原批量分镜任务，不提交新模型、不重复扣费；可能同时核对同一原调用中的其他卡，不新增付费生成范围。${draftNotice}`
          : recovering ? `免费查询第${number}集原调用，不生成新任务、不重复扣费。${draftNotice}`
          : `只按第${number}集左侧已保存原内容重新生成分镜。不会读取其他集剧情，也不会重做其他集。\n调用模型：${pricing.modelName}\n本次1次模型调用，预计${Number(pricing.points).toFixed(2)}积分；按实际调用次数结算。\n不会自动付费返修。模型请求失败按后台结算；模型正常返回但未通过本地分镜检查，仍按实际调用计费。新分镜通过检查后才替换旧分镜，原视频与历史保留。确定提交吗？`;
        if (!await context.confirm(prompt + (!recovering ? draftNotice : '')) || !live() || lockedByTask()) return;
        const progress = {active:true,recovering,error:false,message:recovering ? `正在查询第${number}集原任务，不新建调用或扣费…` : `正在调用${pricing.modelName}，只处理第${number}集左侧已保存原文；预计${Number(pricing.points).toFixed(2)}积分，本次1次模型调用…`};
        regenerationStates.set(key, progress); paintRegeneration();
        const operationToken={projectId,cutRevision,number};
        context.setBusy(true,operationToken);
        try {
          const submitted = batchRecovery ? await context.post('/api/visual/cut-storyboard', {projectId,cutRevisionId:cutRevision,reconcile:true,
            ...(batchRecovery.regenerate ? {regenerate:true} : {}),
            ...(batchRecovery.attemptRequestId ? {attemptRequestId:batchRecovery.attemptRequestId} : {})})
            : pending && !reconcile ? {taskId:attempt.taskId} : await context.post('/api/visual/cut/storyboard-one', {projectId, number,cutRevisionId:cutRevision,
            sourceHash, ...(reconcile ? {reconcile: true} : {modelConfig: context.modelConfig()})});
          const data = submitted.taskId ? await context.waitTask(submitted.taskId, task => {
            if (context.project()?.id === projectId&&revision(context.project())===cutRevision) {
              progress.message = `第${number}集：${task.message || (recovering ? '正在查询原任务' : `正在调用${pricing.modelName}补齐分镜`)}（${task.progress || 0}%）`;
              sync(); context.status(progress.message);
            }
          }, {retryReads: true}) : submitted;
          if (context.project()?.id !== projectId||revision(context.project())!==cutRevision) return;
          const failed = data.workflowComplete === false;
          const result = data.message || data.error || data.issues?.join('；') || (data.workflowComplete ? `第${number}集分镜已更新；其他集和原视频保留。` : '原结果尚未确认，请稍后免费核对原任务。');
          const message = `${result}${failed ? '；本集旧分镜和原视频保留。' : ''} ${billingSummary(data)}`;
          Object.assign(progress,{active:false,error:failed,message});
          // Do not discard a hand-written draft when the model returns. The
          // user can save it explicitly; model output remains in project data.
          // Task results contain a historical snapshot. Read the current
          // manifest so a late receipt can never restore an earlier cut.
          await context.reload();
          if(context.project()?.id!==projectId||revision(context.project())!==cutRevision)return;
          sync(); context.status(message); context.toast(message, failed);
        } catch (error) {
          if (context.project()?.id === projectId&&revision(context.project())===cutRevision) {
            Object.assign(progress,{active:false,error:true,message:`AI 重新生成未完成：${error.message}；旧分镜和原视频保留。未取得完整结算信息，请核对原任务记录；不会自动付费返修。`});
            try { await context.reload(); } catch (_) {}
            sync(); context.status(progress.message); context.toast(progress.message, true);
          }
        } finally { progress.active=false;context.setBusy(false,operationToken);if(context.project()?.id===projectId&&revision(context.project())===cutRevision)sync();context.refreshPoints(); }
      };
      const item = project.episodes?.find(value => Number(value.number) === number);
      if (item?.storyboard && String(item.sourceText || '') !== saved) {
        const stale = document.createElement('p'); stale.className = 'episode-source-stale';
        stale.textContent = '左侧内容已调整，右侧仍是旧分镜；请重新生成或明确保存手动修改的描述词。已有视频保持原样。'; rightHeading.after(stale);
      }
      // Keep the lock control clickable even while a task is running so the
      // user receives an explicit explanation instead of a permanently grey
      // button. Actual edits and saves remain blocked until the task ends.
      const sync = () => { const busy = lockedByTask(); toggle.disabled = false; save.disabled = busy; cancel.disabled = busy; editor.disabled = busy; paintRegeneration(); };
      card._syncSourceEditor = sync; paintLock(); sync();
      fingerprint(saved).then(hash => {savedHash=hash;if(live())paintRegeneration();}).catch(()=>{});
    });
  }
  function sync() { document.querySelectorAll('.visual-episode-card').forEach(card => card._syncSourceEditor?.()); }
  const hasDrafts=project=>[...drafts.keys()].some(key=>key.startsWith(namespace(project)));
  return {install, sync, effectiveSource, fingerprint, fingerprintSync, baseCutHash, revision, namespace, matchesRevision, matchingOverride, currentAttempt, currentBatchAttempt, hasDrafts, canRecheckCachedResult};
})();

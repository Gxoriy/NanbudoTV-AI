/* App-owned dialogs keep confirmations centered and consistent with the studio. */
(() => {
  let dialog, cancelCurrent;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'studio-dialog';
    dialog.innerHTML = '<form method="dialog"><div class="studio-dialog-heading"><span class="studio-dialog-icon" aria-hidden="true">?</span><h2></h2></div><p class="studio-dialog-message"></p><label class="studio-dialog-input hidden"><span>请输入内容</span><input type="text"></label><div class="studio-dialog-actions"><button type="button" class="ghost-btn studio-dialog-cancel">取消</button><button type="submit" class="primary-btn studio-dialog-confirm">确认</button></div></form>';
    document.body.append(dialog);
    return dialog;
  }
  function ask(message, kind, initial = '', options = {}) {
    // Center confirmations in the app viewport, not a tall workflow iframe.
    if (window.parent !== window) {
      try {
        const parentAsk = window.parent[kind === 'prompt' ? 'studioPrompt' : kind === 'alert' ? 'studioAlert' : 'studioConfirm'];
        if (typeof parentAsk === 'function') return parentAsk(message, kind === 'confirm' ? options : initial);
      } catch (_) { /* Cross-origin embeds use their own dialog. */ }
    }
    const box = ensureDialog();
    // Replacing a dialog must settle its own promise immediately. Waiting for
    // the queued native close event after reopening the same element strands
    // the previous caller's confirmation lock indefinitely.
    if (cancelCurrent) cancelCurrent();
    if (box.open) box.close();
    const title = box.querySelector('h2');
    const icon = box.querySelector('.studio-dialog-icon');
    const copy = box.querySelector('.studio-dialog-message');
    const inputLabel = box.querySelector('.studio-dialog-input');
    const input = inputLabel.querySelector('input');
    const cancel = box.querySelector('.studio-dialog-cancel');
    const accept = box.querySelector('.studio-dialog-confirm');
    const destructive = /删除|清空|无法撤销|不可恢复/.test(message);
    title.textContent = options.title || (kind === 'prompt' ? '填写信息' : kind === 'alert' ? '操作提示' : destructive ? '请确认操作' : '请确认下一步');
    icon.textContent = kind === 'prompt' ? '✎' : kind === 'alert' ? 'i' : destructive ? '!' : '?';
    box.classList.toggle('danger', destructive);
    copy.textContent = String(message || '');
    copy.hidden = !String(message || '').trim();
    inputLabel.classList.toggle('hidden', kind !== 'prompt');
    input.value = String(initial ?? '');
    cancel.classList.toggle('hidden', kind === 'alert');
    accept.textContent = kind === 'alert' ? '知道了' : destructive ? '确认操作' : '确认';
    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (settled) return; settled = true; if(cancelCurrent===cancelThis)cancelCurrent=null;box.removeEventListener('cancel', onCancel); box.removeEventListener('close', onClose); cancel.removeEventListener('click', onCancelClick); box.querySelector('form').removeEventListener('submit', onSubmit); if (box.open) box.close(); box.style.removeProperty('top'); box.style.removeProperty('bottom'); box.style.removeProperty('margin'); resolve(value); };
      const cancelThis=()=>finish(kind==='prompt'?null:false);
      const onCancel = event => { event.preventDefault(); finish(kind === 'prompt' ? null : false); };
      // A queued close event from the previous confirmation must not cancel
      // the next confirmation, which can open in the same promise chain.
      const onClose = () => { if (!box.open) finish(kind === 'prompt' ? null : false); };
      const onCancelClick = () => finish(kind === 'prompt' ? null : false);
      const onSubmit = event => { event.preventDefault(); finish(kind === 'prompt' ? input.value : true); };
      box.addEventListener('cancel', onCancel);
      box.addEventListener('close', onClose);
      cancel.addEventListener('click', onCancelClick);
      box.querySelector('form').addEventListener('submit', onSubmit);
      cancelCurrent=cancelThis;
      try { box.showModal(); } catch (_) { cancelThis(); return; }
      // The workflow runs in a tall iframe. Centering against that iframe can
      // place the dialog far below the parent window's visible viewport.
      if (window.parent !== window && document.body.classList.contains('workflow-embedded')) {
        try {
          const frame = window.parent.document.getElementById('workflowFrame');
          const frameTop = frame.getBoundingClientRect().top;
          const height = box.getBoundingClientRect().height;
          const desiredTop = (window.parent.innerHeight - height) / 2 - frameTop;
          box.style.top = `${Math.max(16, Math.min(window.innerHeight - height - 16, desiredTop))}px`;
          box.style.bottom = 'auto';
          box.style.margin = '0 auto';
        } catch (_) { /* Standalone dialog remains centered normally. */ }
      }
      (kind === 'prompt' ? input : accept).focus({preventScroll:true});
    });
  }
  window.studioConfirm = (message, options = {}) => ask(message, 'confirm', '', options);
  window.studioPrompt = (message, initial = '') => ask(message, 'prompt', initial);
  window.studioAlert = async message => { await ask(message, 'alert'); };
})();

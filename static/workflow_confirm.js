/* Scoped async confirmation; the host window owns the modal, not the iframe. */
(() => {
  'use strict';
  const sourceDocument = document;
  let host = window;
  try { if (window.top.document && window.top.location.origin === location.origin) host = window.top; } catch (_) { /* Standalone/cross-origin embedding. */ }
  const doc = host.document;
  const styleId = 'workflow-confirm-style';
  const css = `
    #workflowConfirmDialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;width:440px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 40px);overflow:auto;padding:28px;border:1px solid #74603d;border-radius:16px;background:#242725;color:#f1efea;box-shadow:0 24px 90px #0009;font:14px/1.65 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;color-scheme:dark;text-align:left}
    #workflowConfirmDialog:not([open]){display:none}
    #workflowConfirmDialog::backdrop{background:#070909b8;backdrop-filter:blur(3px)}
    #workflowConfirmDialog h2{margin:0;font:600 19px/1.65 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;overflow-wrap:anywhere;color:#f4eedf;letter-spacing:0}
    #workflowConfirmDialog p{margin:10px 0 0;color:#d8bc83;font-size:13px;line-height:1.7}
    #workflowConfirmDialog p[hidden]{display:none}
    #workflowConfirmDialog .workflow-confirm-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:26px}
    #workflowConfirmDialog button{box-sizing:border-box;min-width:88px;min-height:40px;width:auto;margin:0;padding:8px 20px;border:1px solid #5a5b51;border-radius:8px;background:#303330;color:#e3e4dc;font:500 14px/1.5 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;cursor:pointer;box-shadow:none}
    #workflowConfirmDialog button:hover{border-color:#b79655;background:#3c3c33}
    #workflowConfirmDialog button:focus-visible{outline:2px solid #e8bf6a;outline-offset:3px}
    #workflowConfirmDialog #workflowConfirmAccept{background:linear-gradient(110deg,#e4b65d,#f2d292);border-color:transparent;color:#29251c;font-weight:700}
    #workflowConfirmDialog #workflowConfirmAccept:hover{background:#f4d592}
  `;
  function confirm({question, cost = ''}) {
    // Never queue another paid confirmation behind the user's current choice.
    if (doc.getElementById('workflowConfirmDialog')) return Promise.resolve(false);
    if (!doc.getElementById(styleId)) {
      const style = doc.createElement('style'); style.id = styleId; style.textContent = css; doc.head.append(style);
    }
    const dialog = doc.createElement('dialog'); dialog.id = 'workflowConfirmDialog';
    dialog.setAttribute('aria-labelledby', 'workflowConfirmQuestion');
    const title = doc.createElement('h2'); title.id = 'workflowConfirmQuestion'; title.textContent = question;
    const detail = doc.createElement('p'); detail.id = 'workflowConfirmCost'; detail.textContent = cost; detail.hidden = !cost;
    if (cost) dialog.setAttribute('aria-describedby', detail.id);
    const actions = doc.createElement('div'); actions.className = 'workflow-confirm-actions';
    const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.id = 'workflowConfirmCancel'; cancel.textContent = '取消';
    const accept = doc.createElement('button'); accept.type = 'button'; accept.id = 'workflowConfirmAccept'; accept.textContent = '确认';
    actions.append(cancel, accept); dialog.append(title, detail, actions); doc.body.append(dialog);
    const focused = sourceDocument.activeElement;
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return; settled = true;
        window.removeEventListener('pagehide', unloaded);
        if (dialog.open) dialog.close(); dialog.remove();
        if (focused?.isConnected) focused.focus({preventScroll:true});
        resolve(value);
      };
      const unloaded = () => finish(false);
      cancel.addEventListener('click', () => finish(false));
      accept.addEventListener('click', () => finish(true));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      dialog.addEventListener('close', () => finish(false));
      let backdropDown = false;
      const outside = event => { const r = dialog.getBoundingClientRect(); return event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom); };
      dialog.addEventListener('pointerdown', event => { backdropDown = outside(event); });
      dialog.addEventListener('click', event => { if (backdropDown && outside(event)) finish(false); backdropDown = false; });
      window.addEventListener('pagehide', unloaded, {once:true});
      try { dialog.showModal(); cancel.focus({preventScroll:true}); } catch (_) { finish(false); }
    });
  }
  window.WorkflowConfirm = {open:confirm};
})();

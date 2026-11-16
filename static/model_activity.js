/* Presentation only. Never starts, retries, cancels or changes a model request. */
(function (root) {
  'use strict';
  const pendingStates = new Set(['pending','queued','running','submitting','waiting','saving','reconnecting']);
  const attribute231=(node,key,value)=>{if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
  const remove231=(node,key)=>{if(node.hasAttribute(key))node.removeAttribute(key);};
  function normalized(state) { return pendingStates.has(state) ? 'pending' : ['done','success','succeeded'].includes(state) ? 'success' : ['error','failed','failure','canceled','cancelled'].includes(state) ? 'error' : ''; }
  function set(node, options = {}) {
    if (!node) return;
    const state = normalized(options.state);
    if (options.message !== undefined && !options.preserve) {
      const value = String(options.message || '');
      if (node.textContent !== value) node.textContent = value;
    }
    if (node.dataset.modelActivity !== state) node.dataset.modelActivity = state;
    if (state) {
      attribute231(node,'role','status');attribute231(node,'aria-live','polite');
      attribute231(node,'aria-busy',String(state==='pending'));
      if(state==='pending')attribute231(node,'aria-label','正在处理');
      else remove231(node,'aria-label');
    } else { remove231(node,'aria-busy');remove231(node,'aria-label'); }
  }
  function text(node, message, error = false) {
    const value = String(message || '');
    const state = error ? 'error' : /(?:失败|出错|异常|查询中断|无法读取|未完成|请求超时)/.test(value) ? 'error' : /(?:成功|已完成|已生成|已保存|已就绪|识别完成|结果已返回)/.test(value) ? 'success' : '';
    set(node, {state, message:value});
  }
  function task(node, receipt = {}, options = {}) {
    const state = normalized(receipt.state || receipt.status || 'running');
    set(node, {state, message:state === 'error' ? receipt.error || receipt.message || '处理失败，请查看原任务。' : state === 'success' ? options.success || receipt.message || '处理成功' : receipt.message || '', preserve:options.preserve});
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function markup(state, message = '') {
    state = normalized(state);
    return '<span data-model-activity="'+state+'" role="status" aria-live="polite" aria-busy="'+(state==='pending')+'"'+(state==='pending'?' aria-label="正在处理"':'')+'>'+escape(message)+'</span>';
  }
  root.ModelActivity = Object.freeze({set, text, task, markup});
  // Existing job renderers keep their detailed diagnostic text in the DOM and
  // receipts. Explicit busy classes suppress only that live presentation.
  function decorate() {
    document.querySelectorAll('.visual-task-status.is-generating,[data-visual-task-status].active,.episode-video-loading,.asset-preview-status[data-state="queued"],.asset-preview-status[data-state="submitting"],.asset-preview-status[data-state="waiting"],.asset-preview-status[data-state="saving"],.inline-ai-loading,.pending-row [data-pending-model]').forEach(node => set(node, {state:'pending',preserve:true}));
    document.querySelectorAll('.visual-task-status:not(.is-generating)[data-model-activity="pending"],[data-visual-task-status]:not(.active)[data-model-activity="pending"]').forEach(node => text(node,node.textContent,node.classList.contains('error')));
  }
  function start() {
    let scheduled = false;
    const observer = new MutationObserver(() => { if (scheduled) return; scheduled=true; queueMicrotask(() => {scheduled=false;decorate();}); });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']}); decorate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})(window);

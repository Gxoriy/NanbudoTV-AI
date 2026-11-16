/* Shared presentation guard; the server remains authoritative for every charge. */
(() => {
  'use strict';
  let balance = null, pending = null;
  const rules = [], entries = new Map();
  const FREE = Symbol('free-receipt-query');
  const QUOTE = Symbol('quote-before-charge');
  const nativeDisabled = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'disabled');
  const disabled231=(button,value)=>{if(nativeDisabled.get.call(button)!==value)nativeDisabled.set.call(button,value);};
  const hidden231=(node,value)=>{if(node.hidden!==value)node.hidden=value;};
  const attribute231=(node,name,value)=>{if(node.getAttribute(name)!==value)node.setAttribute(name,value);};
  const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const amount = value => Number(value).toFixed(2);
  const style = document.createElement('style');
  style.textContent = '[data-credit-blocked="1"]{opacity:.55!important;cursor:not-allowed!important}.credit-hint{display:inline-flex;align-items:center;gap:6px;color:#ffd077;font-size:13px;line-height:1.5;margin:5px 8px 5px 0}.credit-hint button{background:transparent;color:#ffd077;border:1px solid #816b3c;border-radius:6px;padding:3px 7px;font:inherit}.credit-hint[hidden]{display:none}';
  document.head.append(style);
  function recharge() {
    const target = window.parent === window ? window : window.parent;
    target.postMessage({type:'open-credit-recharge'}, window.location.origin);
  }
  function evaluate(entry) {
    for (const record of observer.takeRecords()) if (record.type === 'attributes') {
      const other = entries.get(record.target);
      if (other) other.baseDisabled = nativeDisabled.get.call(other.button);
    }
    let cost;
    try { cost = entry.quote(entry.button); } catch (_) { cost = null; }
    if (cost === FREE || cost === QUOTE) {
      disabled231(entry.button, entry.baseDisabled); observer.takeRecords();
      if(entry.button.dataset.creditBlocked!=='0')entry.button.dataset.creditBlocked = '0';if(entry.button.hasAttribute('aria-description'))entry.button.removeAttribute('aria-description');hidden231(entry.hint,true);return;
    }
    const missing = !valid(cost) || cost === 0;
    const insufficient = balance !== null && !missing && balance + 1e-9 < cost;
    const locked = missing || balance === null || insufficient;
    const message = missing ? (entry.button.dataset.creditReason || '尚无有效价格，暂不可用') : balance === null ? '正在核对积分，暂不可用' : insufficient ? `积分不足：需 ${amount(cost)}，余额 ${amount(balance)}` : '';
    disabled231(entry.button, entry.baseDisabled || locked);
    observer.takeRecords(); // Only our synchronous attribute write is discarded.
    if(entry.button.dataset.creditBlocked!==(locked?'1':'0'))entry.button.dataset.creditBlocked = locked ? '1' : '0';
    attribute231(entry.button,'aria-description',message);
    hidden231(entry.hint,!locked);
    if (entry.text.textContent !== message) entry.text.textContent = message;
    hidden231(entry.recharge,!insufficient);
  }
  function enroll(button, quote) {
    if (entries.has(button)) return;
    const hint = document.createElement('span'); hint.className = 'credit-hint';
    const text = document.createElement('span');
    const action = document.createElement('button'); action.type = 'button'; action.textContent = '充值积分';
    action.addEventListener('click', recharge); hint.append(text, action);
    const details = button.closest('.visual-card')?.querySelector('.asset-extra-actions');
    if(details)details.append(hint);else button.after(hint);
    const entry = {button, quote, hint, text, recharge:action, baseDisabled:button.disabled};
    entries.set(button, entry);
    // Existing renderers keep their normal busy/permission state even when the
    // credit guard already disabled the button. Restoring funds never unlocks it.
    Object.defineProperty(button, 'disabled', {configurable:true,
      get() {return nativeDisabled.get.call(this);},
      set(value) {entry.baseDisabled = Boolean(value); evaluate(entry);}
    });
    evaluate(entry);
  }
  function scan() {
    for (const [button, entry] of entries) if (!button.isConnected) {entry.hint.remove(); entries.delete(button);}
    for (const rule of rules) document.querySelectorAll(rule.selector).forEach(button => enroll(button, rule.quote));
    entries.forEach(evaluate);
  }
  const observer = new MutationObserver(records => {
    let changed=false;
    for (const record of records) if (record.type === 'attributes') {
      const entry = entries.get(record.target);
      if (entry) entry.baseDisabled = nativeDisabled.get.call(entry.button);
      changed=true;
    }
    // Progress text/images do not add a billable button or change its quote.
    // Price, balance, selection and disabled transitions still run the exact
    // same scan/evaluate path, without a page-wide scan for every timer tick.
    if(!changed)changed=records.some(record=>record.type==='childList'&&(record.target instanceof Element&&record.target.closest('select')||[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.matches('button,input,select,textarea,option,optgroup')||node.querySelector('button,input,select,textarea,option,optgroup')))));
    if(changed)scan();
  });
  observer.observe(document.body, {subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
  async function refresh() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetch('/api/visual/points', {cache:'no-store'});
        const data = await response.json();
        if (!response.ok || data.ok !== true || !valid(data.points)) throw new Error('无法确认最新积分，请检查授权或网络后重试。');
        balance = data.points; scan(); return balance;
      } catch (error) {balance = null; scan(); throw error;}
      finally {pending = null;}
    })();
    return pending;
  }
  async function ensure(cost) {
    if (!valid(cost) || cost <= 0) throw new Error('没有有效积分价格，未提交任务。请更新后台模型列表。');
    const current = await refresh();
    if (current + 1e-9 < cost) throw new Error(`积分不足：本次需 ${amount(cost)} 积分，余额 ${amount(current)}。请充值积分后再使用，任务未提交。`);
  }
  window.CreditGate = {
    FREE, QUOTE,
    register(selector, quote) {rules.push({selector, quote}); scan();},
    refresh, ensure, recalculate:scan,
    setBalance(value) {balance = valid(value) ? value : null; scan();},
    invalidate() {balance = null; scan(); refresh().catch(() => {});}
  };
  document.addEventListener('change', scan);
  window.addEventListener('focus', () => refresh().catch(() => {}));
  setInterval(() => {if (!document.hidden) refresh().catch(() => {});}, 60000);
  refresh().catch(() => {});
})();

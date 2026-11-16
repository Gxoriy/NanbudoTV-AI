(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install245(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function programPath245(value, win) {
    try {
      var url = new URL(String(value || ''), win.location.href);
      var own = new URL(win.location.href);
      return url.origin === own.origin && url.pathname.indexOf('/static/') === 0 &&
        /\.(?:css|js|mjs)$/i.test(url.pathname) ? url.pathname : '';
    } catch (_) { return ''; }
  }

  function resourcePath245(target, win) {
    var tag = String(target && target.tagName || '').toUpperCase();
    if (tag === 'SCRIPT') return programPath245(target.src, win);
    if (tag === 'LINK' && /(?:^|\s)stylesheet(?:\s|$)/i.test(String(target.rel || ''))) {
      return programPath245(target.href, win);
    }
    return '';
  }

  function reloadURL245(value, nonce) {
    var url = new URL(value);
    url.searchParams.set('_ui_reload245', String(nonce));
    return url.href;
  }

  function stylesheetProblems245(win) {
    var links = win.document.querySelectorAll('link[rel~="stylesheet"]');
    return Array.prototype.filter.call(links, function (link) {
      if (link.disabled || !resourcePath245(link, win)) return false;
      if (link.media && win.matchMedia && !win.matchMedia(link.media).matches) return false;
      return !link.sheet;
    }).map(function (link) { return resourcePath245(link, win); });
  }

  function install245(win, options) {
    if (win.__nanbudoResourceHealth245) return win.__nanbudoResourceHealth245;
    options = options || {};
    var doc = win.document, failed = new Set(), bar = null, detail = null;
    var dismissed = false, timer = null, started = false;
    var grace = options.graceMs === undefined ? 15000 : options.graceMs;
    var nonce = options.nonce || function () { return Date.now().toString(36); };

    function hide() {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      bar = null;
      detail = null;
    }

    function reload() {
      // This is deliberately a user action.  Never refresh a creative editor
      // automatically or clear its local storage to repair a loading problem.
      if (typeof win.confirm === 'function' && !win.confirm(
        '即将重新加载当前界面。请先保存当前输入；未保存的输入可能丢失。确认已保存后继续吗？')) return false;
      if (typeof win.CustomEvent === 'function' && typeof win.dispatchEvent === 'function') {
        var before = new win.CustomEvent('nanbudotv:before-ui-reload245', {cancelable: true});
        if (!win.dispatchEvent(before)) return false;
      }
      win.location.assign(reloadURL245(win.location.href, nonce()));
      return true;
    }

    function mount() {
      if (!failed.size) { hide(); return; }
      if (!doc.body || dismissed) return;
      if (!bar) {
        bar = doc.createElement('div');
        bar.id = 'resource-health245';
        bar.setAttribute('role', 'alert');
        bar.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;' +
          'box-sizing:border-box;padding:14px 16px;border:1px solid #ac7136;border-radius:10px;' +
          'background:#fff4e2;color:#3d2a1b;box-shadow:0 5px 24px #0005;' +
          'font:14px/1.5 "Microsoft YaHei UI","Microsoft YaHei","SimHei",sans-serif;' +
          'text-align:left;display:block;';
        var title = doc.createElement('strong');
        title.textContent = '界面文件没有完整加载';
        title.style.cssText = 'display:block;font-weight:700;font-size:16px;color:#3d2a1b;';
        bar.appendChild(title);
        var message = doc.createElement('div');
        message.textContent = '这可能导致文字、皮肤或按钮异常。请先保存能保存的内容，再重新加载当前页面。';
        bar.appendChild(message);
        detail = doc.createElement('div');
        detail.style.cssText = 'display:block;font-size:12px;color:#6f5134;margin-top:4px;word-break:break-all;';
        bar.appendChild(detail);
        var retry = doc.createElement('button');
        retry.type = 'button';
        retry.textContent = '重新加载界面';
        retry.style.cssText = 'display:inline-block;margin:10px 8px 0 0;padding:7px 12px;' +
          'border:1px solid #855325;border-radius:5px;background:#855325;color:white;' +
          'font:inherit;cursor:pointer;';
        retry.addEventListener('click', reload);
        bar.appendChild(retry);
        var close = doc.createElement('button');
        close.type = 'button';
        close.textContent = '暂时关闭';
        close.style.cssText = 'display:inline-block;margin-top:10px;padding:7px 12px;' +
          'border:1px solid #a2815f;border-radius:5px;background:#fff4e2;color:#3d2a1b;' +
          'font:inherit;cursor:pointer;';
        close.addEventListener('click', function () { dismissed = true; hide(); });
        bar.appendChild(close);
        doc.body.appendChild(bar);
      }
      detail.textContent = '未完整加载：' + Array.from(failed).slice(0, 4).map(function (path) {
        return path.split('/').pop();
      }).join('、') + (failed.size > 4 ? '等 ' + failed.size + ' 项' : '');
    }

    function accept(event) {
      var path = resourcePath245(event && event.target, win);
      if (!path) return;
      failed.add(path);
      mount();
    }

    function loaded(event) {
      var path = resourcePath245(event && event.target, win);
      if (path && failed.delete(path)) mount();
    }

    function checkStyles() {
      stylesheetProblems245(win).forEach(function (path) { failed.add(path); });
      mount();
    }

    function ready() {
      if (started) return;
      started = true;
      mount();
      timer = win.setTimeout(checkStyles, grace);
    }

    function dispose() {
      win.removeEventListener('error', accept, true);
      win.removeEventListener('load', loaded, true);
      doc.removeEventListener('DOMContentLoaded', ready);
      if (timer !== null) win.clearTimeout(timer);
      hide();
    }

    var controller = {accept245: accept, checkStyles245: checkStyles, reload245: reload,
      dispose245: dispose, failures245: function () { return Array.from(failed); }};
    win.__nanbudoResourceHealth245 = controller;
    win.addEventListener('error', accept, true);
    win.addEventListener('load', loaded, true);
    var early = win.__nanbudoResourceHealthEarly245 || [];
    Array.prototype.forEach.call(early, function (target) { accept({target: target}); });
    if (win.__nanbudoResourceHealthEarlyListener245) {
      win.removeEventListener('error', win.__nanbudoResourceHealthEarlyListener245, true);
    }
    early.length = 0;
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready, {once: true});
    else ready();
    return controller;
  }

  return {install245: install245, programPath245: programPath245,
    reloadURL245: reloadURL245, stylesheetProblems245: stylesheetProblems245};
});

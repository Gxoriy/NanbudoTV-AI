const $ = id => document.getElementById(id);
const state = { mode: "bound", status: {}, config: {}, updateFile: "", updateBusy: false,
  updateCanApplyOnline: false, updateApplying: false };

async function api(url, body) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "操作失败，请稍后重试。");
  return data;
}

function message(text, bad = false) {
  const box = $("loginMessage");
  box.textContent = text;
  box.className = `message${bad ? " bad" : ""}`;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("#loginMode button").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  const input = $("cardKey");
  if (mode === "bound") {
    input.readOnly = true;
    input.value = state.status.cardMask || "尚未绑定授权卡密";
    $("licenseHint").textContent = state.status.message || "使用本机已保存的授权登录";
    $("toggleMode").textContent = "更换卡密";
  } else {
    input.readOnly = false;
    input.value = "";
    input.placeholder = "DW-XXXX-XXXX-XXXX-XXXX-XXXX";
    $("licenseHint").textContent = "新卡密仅替换授权凭证，不会删除本机项目";
    $("toggleMode").textContent = state.status.hasStoredLicense ? "使用原卡" : "复制设备码";
    setTimeout(() => input.focus(), 0);
  }
}

function announcements(config) {
  const values = Array.isArray(config?.announcements) && config.announcements.length
    ? config.announcements
    : [{ title: "软件公告", text: config?.announcement || "暂无最新公告。", mediaUrl: config?.announcementMediaUrl || "", mediaType: config?.announcementMediaType || "" }];
  const list = $("announcementList");
  list.replaceChildren();
  values.forEach((item, index) => {
    const article = document.createElement("article");
    const title = document.createElement("b");
    title.textContent = String(item?.title || `公告${index + 1}`);
    const copy = document.createElement("p");
    copy.textContent = String(item?.text || "").trim() || "暂无内容";
    article.append(title, copy);
    const mediaUrl = String(item?.mediaUrl || "").trim();
    if (mediaUrl) {
      const isVideo = String(item?.mediaType || "").startsWith("video/");
      const media = document.createElement(isVideo ? "video" : "img");
      media.src = mediaUrl;
      if (isVideo) { media.controls = true; media.muted = true; media.preload = "metadata"; }
      else media.alt = `${title.textContent}配图`;
      article.append(media);
    }
    list.append(article);
  });
  // The left side is intentionally media-ready. Published announcement media
  // can later become a drama still, product campaign or rotating showcase.
  const featured = config?.loginHero;
  const hero = $("heroMedia");
  if (featured) {
    const isVideo = String(featured.mediaType || "").startsWith("video/");
    const media = document.createElement(isVideo ? "video" : "img");
    media.src = String(featured.mediaUrl);
    if (isVideo) { media.autoplay = true; media.loop = true; media.muted = true; media.playsInline = true; }
    else media.alt = String(featured.title || "精选内容");
    hero.replaceChildren(media);
    hero.classList.remove("hidden");
  } else {
    hero.classList.add("hidden");
  }
}

function showOnlineUpdateNotice292(config) {
  const notice = typeof config?.onlineUpdateNotice === "string" ? config.onlineUpdateNotice.trim() : "";
  if (!notice || state.onlineUpdateNoticeShown292) return;
  try { if (sessionStorage.getItem("ntv-online-update-notice292") === "1") return; } catch (_) { /* Page-local fallback. */ }
  const detail = $("updateDetail");
  if (!detail) return;
  const info = document.createElement("small");
  info.id = "onlineUpdateNotice292";
  info.setAttribute("role", "status");
  info.style.marginTop = "8px";
  info.textContent = notice;
  detail.insertAdjacentElement("afterend", info);
  state.onlineUpdateNoticeShown292 = true;
  try { sessionStorage.setItem("ntv-online-update-notice292", "1"); } catch (_) { /* Keep the in-page guard. */ }
}

function renderConfig(config, checked = false) {
  state.config = config || {};
  if (!state.updateBusy && !state.updateApplying) {
    $("updateButton").textContent = state.updateFile
      ? (state.updateCanApplyOnline === true ? "安装更新并重启" : "打开安装包位置")
      : "下载更新并重启";
  }
  const current = String(config?.currentVersion || "--");
  $("brandVersion").textContent = `v${current}`;
  announcements(config || {});
  showOnlineUpdateNotice292(config);
  const available = Boolean(config?.updateAvailable && config?.downloadUrl && config?.sha256);
  const icon = $("updateIcon");
  if (!checked) {
    icon.className = "state-icon pending";
    icon.textContent = "↻";
    $("updateTitle").textContent = "等待登录检测";
    $("updateDetail").textContent = `当前 v${current} · 登录时自动同步最新版与公告`;
    return;
  }
  if (config?.configError && !available) {
    icon.className = "state-icon error";
    icon.textContent = "!";
    $("updateTitle").textContent = "更新服务暂时不可用";
    $("updateDetail").textContent = "未能确认最新版本；授权有效时仍可进入软件。";
    return;
  }
  if (available) {
    icon.className = "state-icon update";
    icon.textContent = "↑";
    $("updateTitle").textContent = `发现新版本 v${config.latestVersion}`;
    $("updateDetail").textContent = String(config.updateNotes || `当前 v${current}，可在登录页直接完成更新。`);
    $("updateActions").classList.remove("hidden");
    $("enterApp").classList.toggle("hidden", Boolean(config.mandatory));
  } else {
    icon.className = "state-icon";
    icon.textContent = "✓";
    $("updateTitle").textContent = "已是最新版本";
    $("updateDetail").textContent = `当前 v${current} · 更新检测已完成`;
    $("updateActions").classList.add("hidden");
  }
}

async function load() {
  try {
    const data = await api("/api/session/status");
    state.status = data.license || {};
    renderConfig(data.clientConfig || {}, false);
    setMode(state.status.hasStoredLicense ? "bound" : "new");
    if (!state.status.licensed && state.status.hasStoredLicense) {
      message(`${state.status.message || "当前卡密不可用。"} 如已续费原卡，请直接点击登录重新同步；也可切换输入新卡密。`, true);
    }
  } catch (error) {
    message(error.message, true);
    setMode("new");
  }
}

async function login() {
  const button = $("loginButton");
  const key = state.mode === "new" ? $("cardKey").value.trim() : "";
  if (state.mode === "new" && !key) return message("请输入授权卡密。", true);
  try {
    button.disabled = true;
    button.textContent = "正在验证授权并检测更新…";
    const data = await api("/api/session/login", { key });
    state.status = data.license || {};
    message(data.message || "登录成功。", false);
    renderConfig(data.clientConfig || {}, true);
    const hasUpdate = Boolean(data.clientConfig?.updateAvailable && data.clientConfig?.downloadUrl && data.clientConfig?.sha256);
    if (!hasUpdate) setTimeout(() => location.href = "/", 650);
    else button.classList.add("hidden");
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "登录并检测更新 →";
  }
}

async function pollUpdate(taskId) {
  $("updateProgress").classList.remove("hidden");
  while (true) {
    const task = await api(`/api/tasks/${taskId}`);
    const value = Math.max(0, Math.min(100, Number(task.progress || 0)));
    $("updateProgressText").textContent = task.message || "正在准备新版本…";
    $("updateProgressPercent").textContent = `${value}%`;
    $("updateProgressBar").style.width = `${value}%`;
    if (task.state === "done") return task.result || {};
    if (task.state === "error") throw new Error(task.error || "新版下载失败，请稍后重试。");
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

async function updateSoftware(event) {
  if (state.updateBusy || state.updateApplying) return;
  const button = $("updateButton");
  // Carry this explicit click only through its own verified download. A
  // config refresh, synthetic event or later page load never starts an install.
  const downloadAndRestart = !state.updateFile && event?.type === "click" && event.isTrusted === true
    && ["下载更新并重启", "重试下载并重启"].includes(button.textContent);
  state.updateBusy = true;
  button.disabled = true;
  try {
    if (!state.updateFile) {
      button.textContent = "正在下载更新…";
      const started = await api("/api/update/download", {});
      const result = await pollUpdate(started.taskId);
      if (typeof result.fileName !== "string" || !result.fileName.trim()) {
        throw new Error("没有收到已校验的安装包记录，请继续下载或重试。");
      }
      state.updateFile = result.fileName;
      state.updateCanApplyOnline = result.canApplyOnline === true;
      button.textContent = state.updateCanApplyOnline ? "安装更新并重启" : "打开安装包位置";
      const ready = state.updateCanApplyOnline
        ? (downloadAndRestart ? "新版已下载并通过完整性校验，正在启动更新并重启。"
          : "新版已下载并通过完整性校验。点击“安装更新并重启”即可安装，软件将自动重新打开。")
        : "新版已下载并通过完整性校验。此安装包需手动安装，请点击“打开安装包位置”。";
      $("updateProgressText").textContent = ready;
      message(ready);
      if (!downloadAndRestart || state.updateCanApplyOnline !== true) return;
    }
    if (state.updateCanApplyOnline === true) {
      button.textContent = "正在启动更新…";
      const result = await api("/api/update/apply-online", { fileName: state.updateFile });
      if (result.ok !== true) throw new Error(result.error || result.message || "未能启动更新，请稍后重试。");
      state.updateApplying = true;
      button.textContent = "正在安装并重启…";
      $("enterApp").disabled = true;
      $("updateProgress").classList.remove("hidden");
      $("updateProgressText").textContent = result.message || "更新已启动，安装完成后软件会自动重新打开。";
      message($("updateProgressText").textContent);
      return;
    }
    button.textContent = "正在打开安装包位置…";
    const result = await api("/api/update/reveal", { fileName: state.updateFile });
    $("updateProgressText").textContent = result.message || "已打开安装包位置，请手动完成安装。";
    $("updateProgressPercent").textContent = "100%";
    $("updateProgressBar").style.width = "100%";
    button.textContent = "打开安装包位置";
  } catch (error) {
    message(error.message, true);
    $("updateProgress").classList.remove("hidden");
    $("updateProgressText").textContent = error.message;
    button.textContent = state.updateFile
      ? (state.updateCanApplyOnline === true ? "安装更新并重启" : "打开安装包位置")
      : "重试下载并重启";
  } finally {
    state.updateBusy = false;
    button.disabled = state.updateApplying;
  }
}

document.querySelectorAll("#loginMode button").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("toggleMode").addEventListener("click", async () => {
  if (!state.status.hasStoredLicense && state.mode === "new") {
    try { await navigator.clipboard.writeText(state.status.deviceCode || ""); message("本机设备码已复制，可发给销售方。"); } catch (_) { message(`本机设备码：${state.status.deviceCode || "未读取"}`); }
    return;
  }
  setMode(state.mode === "bound" ? "new" : "bound");
});
$("loginButton").addEventListener("click", login);
$("cardKey").addEventListener("keydown", event => { if (event.key === "Enter") login(); });
$("updateButton").addEventListener("click", updateSoftware);
$("enterApp").addEventListener("click", () => location.href = "/");
load();

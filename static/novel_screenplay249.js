(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const api = "/api/novel-projects250";
  const fields = ["format", "style", "similarity", "mustKeep"];
  const labels = {read:"分批阅读", outline:"生成大纲", screenplay:"生成剧本"};
  const maxChars = 600000;
  let project = null;
  let busy = false;
  let timer = 0;
  let activeTask = "";
  let pauseRequested = false;
  let sourceDirty = false;
  let settingsDirty = false;
  let outlineDirty = false;
  let nextStage = "read";
  let sourceLength = 0;
  let sourceHasText = false;
  let renderedEpisodes = "";
  let renderedChapters = "";
  let outlineWorking = [];
  const done = stage => ["done","completed","succeeded"].includes(stage?.status);
  const failed = stage => ["failed","error","interrupted","paused","unknown"].includes(stage?.status);
  const pending = stage => ["running","queued","pending","starting"].includes(stage?.status);
  const taskFinished = task => ["done","failed","error","completed","succeeded","cancelled","canceled"].includes(task?.state || task?.status);
  const formatInt = n => Number(n || 0).toLocaleString("en-US");
  const textLength = value => {
    let count = 0;
    for (const char of value) count++;
    return count;
  };
  const getSettings = () => Object.fromEntries(fields.map(id => [id, $(id).value]));
  const isDirty = () => sourceDirty || settingsDirty || outlineDirty;
  function status(message, error = false) {
    $("status").textContent = message;
    $("status").classList.toggle("error", error);
  }
  async function request(path, body) {
    const response = await fetch(path, {
      ...(body === undefined ? {} : {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}),
      signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || data.message || "项目请求失败，请稍后重试。");
    return data;
  }
  const url = (route, id, extra = {}) => api + "/" + route + "?" + new URLSearchParams({id, ...extra});
  function updateCounter() {
    const value = $("sourceText").value;
    sourceLength = textLength(value);
    sourceHasText = Boolean(value.trim());
    $("sourceCount").textContent = "已导入 " + formatInt(sourceLength) + " / 600,000 字 · 每个项目最多 60 万字";
    $("sourceCount").classList.toggle("error", sourceLength > maxChars);
  }
  function renderList(projects) {
    const items = [new Option("选择已保存项目…", "")];
    for (const item of projects) items.push(new Option(item.name, item.id));
    $("projectList").replaceChildren(...items);
    $("projectList").value = project?.id || "";
  }
  async function refreshList() {
    const data = await request(api);
    renderList(data.projects || []);
    return data.projects || [];
  }
  function approved() {
    return Boolean(project?.approvedOutline?.length || project?.outlineApproved || project?.approved || project?.stages?.outline?.approved ||
      project?.stages?.outline?.status === "approved" || done(project?.stages?.screenplay));
  }
  function renderEpisodes() {
    const episodes = approved() ? project.approvedOutline || project.episodes || [] : project.episodes || [];
    const encoded = JSON.stringify(episodes);
    if (encoded === renderedEpisodes) return;
    renderedEpisodes = encoded;
    outlineWorking = episodes.map(episode => ({...episode,batchIds:[...(episode.batchIds || [])]}));
    drawOutline();
  }
  function outlineRows() {
    return [...$("outline").children].map((entry,index) => ({
      ...outlineWorking[index],
      title:entry.querySelector('[data-episode-field="title"]').value.trim(),
      summary:entry.querySelector('[data-episode-field="summary"]').value.trim()
    }));
  }
  function drawOutline() {
    const list = $("outline");
    const items = document.createDocumentFragment();
    for (const [index, episode] of outlineWorking.entries()) {
      const entry = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = "第 " + (index + 1) + " 集";
      entry.append(legend);
      for (const [key,label] of [["title","标题"],["summary","梗概"]]) {
        const wrapper = document.createElement("label");
        wrapper.className = "novel-field";
        const title = document.createElement("span");
        title.textContent = label;
        const input = document.createElement(key === "title" ? "input" : "textarea");
        input.dataset.episodeField = key;
        input.value = episode[key] || "";
        if (key === "summary") input.rows = 3;
        wrapper.append(title,input);
        entry.append(wrapper);
      }
      if (episode.batchIds.length) {
        const actions = document.createElement("div");
        actions.className = "actions";
        const source = document.createElement("span");
        source.className = "muted";
        source.textContent = "阅读批次 " + episode.batchIds.join("、");
        actions.append(source);
        if (!approved()) {
          const previous = outlineWorking[index - 1];
          const next = outlineWorking[index + 1];
          const [first,last = first] = episode.batchIds;
          if ((!previous || previous.batchIds.at(-1) <= first) && (!next || last <= next.batchIds[0])) {
            const split = document.createElement("button");
            split.type = "button";
            split.dataset.outlineEdit = "split";
            split.dataset.index = index;
            split.textContent = "拆分本集";
            actions.append(split);
          }
          if (next?.batchIds.length && new Set([...episode.batchIds,...next.batchIds]).size <= 2) {
            const merge = document.createElement("button");
            merge.type = "button";
            merge.dataset.outlineEdit = "merge";
            merge.dataset.index = index;
            merge.textContent = "与下一集合并";
            actions.append(merge);
          }
        }
        entry.append(actions);
      }
      items.append(entry);
    }
    list.replaceChildren(items);
  }
  function renderChapters(chapters) {
    const encoded = JSON.stringify(chapters);
    if (encoded === renderedChapters) return;
    renderedChapters = encoded;
    $("chaptersPanel").hidden = !chapters.length;
    $("chapterCount").textContent = "已识别 " + formatInt(chapters.length) + " 个章节" +
      (chapters.length > 300 ? " · 预览前 300 个章节" : "");
    const items = document.createDocumentFragment();
    for (const chapter of chapters.slice(0, 300)) {
      const item = document.createElement("li");
      item.textContent = chapter.title + " · " + formatInt(chapter.end - chapter.start) + " 字";
      items.append(item);
    }
    $("chapters").replaceChildren(items);
  }
  function applyProject(next, full = false) {
    project = next;
    $("projectWorkspace").hidden = !next;
    if (!next) return;
    if (full) {
      sourceDirty = settingsDirty = outlineDirty = false;
      activeTask = next.activeTaskId || "";
      pauseRequested = false;
      renderedEpisodes = "";
      renderedChapters = "";
      $("sourceText").value = next.source || "";
      const defaults = {format:"真人短剧", style:"贴近原著", similarity:"适度改编", mustKeep:""};
      for (const id of fields) $(id).value = next.settings?.[id] || defaults[id];
      updateCounter();
    }
    if (!outlineDirty) renderEpisodes();
    renderChapters(next.chapters || []);
    const script = next.script || "";
    if ($("screenplay").value !== script) $("screenplay").value = script;
    syncControls();
  }
  function syncControls() {
    $("projectList").disabled = busy;
    $("projectName").disabled = busy;
    $("createProject").querySelector("button").disabled = busy;
    if (!project) return;
    const stages = project.stages || {};
    nextStage = !done(stages.read) ? "read" : !(done(stages.outline) || approved()) ? "outline" :
      !approved() ? "review" : !done(stages.screenplay) ? "screenplay" : "";
    const running = Boolean(activeTask || Object.values(stages).some(pending));
    const selected = nextStage && stages[nextStage];
    const unknown = selected?.status === "unknown";
    for (const item of $("stages").children) {
      if (item.dataset.stage === nextStage) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
    $("saveHint").textContent = sourceDirty || settingsDirty ? "原文或设置有未保存的修改" :
      project.generationStarted ? "项目已开始处理，原文已锁定。" : "原文与设置已保存";
    $("saveProject").disabled = busy || running || (!sourceDirty && !settingsDirty) || sourceLength > maxChars;
    for (const id of ["sourceFile","sourceText"]) $(id).disabled = busy || running || project.generationStarted;
    for (const id of fields) $(id).disabled = busy || running || project.generationStarted;
    $("runNext").hidden = !labels[nextStage] || failed(selected) || unknown;
    $("runNext").textContent = nextStage === "read" ? "开始分批阅读" : labels[nextStage] || "";
    $("retryStep").hidden = !labels[nextStage] || !failed(selected);
    $("retryStep").textContent = unknown ? "查询原任务并继续" :
      ["paused","interrupted"].includes(selected?.status) ? "继续当前步骤" : "重试当前步骤";
    if (!running) pauseRequested = false;
    $("pauseStep").hidden = !running;
    $("pauseStep").disabled = busy || pauseRequested;
    $("pauseStep").textContent = pauseRequested ? "等待当前调用完成后暂停" : "暂停在本次调用完成后";
    $("runNext").disabled = $("retryStep").disabled = busy || running || !sourceHasText || sourceDirty || settingsDirty;
    $("checkProgress").disabled = busy;
    const details = selected?.message || selected?.error || (unknown ? "原任务结果待核对，可查询后继续。" : "");
    const counts = selected?.total ? "（" + selected.completed + " / " + selected.total + "）" : "";
    const stageTitle = nextStage === "review" ? "等待确认大纲" : labels[nextStage];
    $("progressText").textContent = stageTitle ? stageTitle + counts + (details ? " · " + details : "") : "剧本已完成，可以复制或下载。";
    $("outlinePanel").hidden = !(project.approvedOutline?.length || project.episodes?.length);
    $("approveOutline").hidden = approved();
    $("approveOutline").disabled = busy || running || sourceDirty || settingsDirty || !done(stages.outline);
    for (const input of $("outline").querySelectorAll("[data-episode-field],[data-outline-edit]")) input.disabled = busy || running || approved();
    $("resultPanel").hidden = !project.script;
    const complete = done(stages.screenplay);
    $("resultTitle").textContent = complete ? "剧本成稿" : "已生成的阶段稿";
    $("resultHint").textContent = complete ? "" : "可预览或导出已生成的内容，后续集完成后会补入项目。";
  }
  async function refreshProject(fromPoll = false) {
    if (!project) return;
    const id = project.id;
    const data = await request(url("project",id,{includeSource:"0"}));
    if (project?.id === id && (!fromPoll || !busy)) {
      if (!Object.values(data.project.stages || {}).some(pending)) activeTask = "";
      else if (data.project.activeTaskId) activeTask = data.project.activeTaskId;
      applyProject({...project,...data.project});
    }
  }
  function stopPoll() { clearTimeout(timer); timer = 0; }
  function poll() {
    stopPoll();
    if (!activeTask && !Object.values(project?.stages || {}).some(pending)) return;
    timer = setTimeout(async () => {
      if (busy) { poll(); return; }
      const id = project.id;
      const taskId = activeTask;
      try {
        if (taskId) {
          const task = await request("/api/tasks/" + encodeURIComponent(taskId)).catch(() => null);
          if (project?.id !== id || busy) return;
          if (!task || taskFinished(task)) activeTask = "";
        }
        if (project?.id === id && !busy) await refreshProject(true);
      } catch (error) {
        if (project?.id === id) status("暂时未能刷新进度，可手动刷新。" + error.message, true);
      } finally {
        if (project?.id === id) poll();
      }
    }, 2400);
  }
  async function action(callback) {
    if (busy) return;
    busy = true;
    syncControls();
    try { await callback(); } catch (error) { status(error.message || "操作失败，请重试。", true); }
    finally { busy = false; syncControls(); poll(); }
  }
  function confirmAction(message) {
    const dialog = $("confirmDialog");
    dialog.returnValue = "";
    $("confirmText").textContent = message;
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), {once:true}));
  }
  function acceptSwitch() {
    return !isDirty() || window.confirm("当前项目有未保存的修改。切换项目会丢弃这些修改，确定继续？");
  }
  async function openProject(id) {
    if (!id) return;
    const data = await request(url("project",id));
    activeTask = "";
    stopPoll();
    applyProject(data.project,true);
    $("quote").textContent = "";
    status("已打开项目「" + project.name + "」。");
  }
  $("projectList").addEventListener("change", event => {
    const id = event.target.value;
    event.target.value = project?.id || "";
    if (id && acceptSwitch()) action(async () => { await openProject(id); $("projectList").value = id; });
  });
  $("createProject").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("projectName").value.trim();
    if (!name || !acceptSwitch()) return;
    action(async () => {
      const data = await request(api + "/create",{name});
      activeTask = "";
      stopPoll();
      applyProject(data.project,true);
      $("projectName").value = "";
      $("quote").textContent = "";
      await refreshList();
      status("已创建项目「" + project.name + "」。");
    });
  });
  $("sourceText").addEventListener("input", () => {
    sourceDirty = true;
    updateCounter();
    syncControls();
  });
  for (const id of fields) $(id).addEventListener("input", () => { settingsDirty = true; syncControls(); });
  $("outline").addEventListener("input", () => { outlineDirty = true; });
  $("outline").addEventListener("click", event => {
    const button = event.target.closest("[data-outline-edit]");
    if (!button || button.disabled || approved()) return;
    const index = Number(button.dataset.index);
    const rows = outlineRows();
    const row = rows[index];
    if (button.dataset.outlineEdit === "split") {
      const [first,last = first] = row.batchIds;
      rows.splice(index,1,
        {...row,title:row.title ? row.title + "（上）" : "",batchIds:[first]},
        {...row,title:row.title ? row.title + "（下）" : "",batchIds:[last]});
    } else {
      const next = rows[index + 1];
      rows.splice(index,2,{
        ...row,
        title:[row.title,next.title].filter(Boolean).join(" / "),
        summary:[row.summary,next.summary].filter(Boolean).join("\n"),
        batchIds:[...new Set([...row.batchIds,...next.batchIds])]
      });
    }
    outlineWorking = rows;
    outlineDirty = true;
    drawOutline();
    syncControls();
    const overlong = textLength(rows[index]?.title || '') > 100 || textLength(rows[index]?.summary || '') > 650;
    if (overlong) status("合并内容已保留：请把该集标题整理到100字以内、梗概整理到650字以内，再确认大纲。", true);
    $("outline").children[index]?.querySelector("input").focus();
  });
  $("sourceFile").addEventListener("change", event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    action(async () => {
      if (file.size > maxChars * 4 + 3) throw new Error("文件过大，请将小说拆成较小的 TXT。");
      const bytes = await file.arrayBuffer();
      let text;
      try { text = new TextDecoder("utf-8",{fatal:true}).decode(bytes); }
      catch (_) {
        try { text = new TextDecoder("gb18030",{fatal:true}).decode(bytes); }
        catch (_) { throw new Error("无法识别 TXT 编码，请另存为 UTF-8 后重试。"); }
      }
      if (!text.trim()) throw new Error("这份 TXT 没有正文。");
      const source = $("sourceText");
      const joined = source.value ? source.value + "\n\n" + text : text;
      if (textLength(joined) > maxChars) throw new Error("追加后超过每个项目 60 万字上限，原文已保留。");
      source.value = joined;
      sourceDirty = true;
      updateCounter();
      status("已追加 TXT，点击「保存原文与设置」写入项目。");
    });
  });
  $("saveProject").addEventListener("click", () => action(async () => {
    if (sourceDirty) {
      const source = $("sourceText").value;
      const data = await request(api + "/source",{id:project.id, text:source, mode:"replace"});
      sourceDirty = false;
      outlineDirty = false;
      applyProject({...project,...data.project,source:data.project.source ?? source});
      if (data.project.source !== undefined) $("sourceText").value = data.project.source;
      updateCounter();
    }
    if (settingsDirty) {
      const data = await request(api + "/settings",{id:project.id,settings:getSettings()});
      settingsDirty = false;
      applyProject({...project,...data.project});
    }
    $("quote").textContent = "";
    status("原文与设置已保存。");
  }));
  $("pauseStep").addEventListener("click", () => action(async () => {
    await request(api + "/pause",{id:project.id});
    pauseRequested = true;
    status("已请求暂停，将在当前调用结束后停止提交下一项。");
  }));
  $("checkProgress").addEventListener("click", () => action(async () => {
    await refreshProject();
    status("已刷新进度。");
  }));
  function runNext() {
    action(async () => {
      const id = project.id;
      const stage = nextStage;
      const quote = await request(url("quote",id,{stage}));
      const message = labels[stage] + " · " + (quote.displayName || "原任务核对") + " · " +
        formatInt(quote.calls) + " 次模型调用 · 预计 " + quote.points + " 积分";
      $("quote").textContent = message;
      const confirmation = Number(quote.calls) ? "确认发送本步骤所需的小说内容与改编设置？" : "确认查询原任务并继续？";
      if (!await confirmAction(message + "。" + confirmation)) return;
      const data = await request(api + "/start",{id,stage,quoteKey:quote.quoteKey});
      activeTask = data.taskId || "";
      if (data.project) applyProject(data.project);
      else await refreshProject();
      status("已提交「" + labels[stage] + "」。");
    });
  }
  $("runNext").addEventListener("click",runNext);
  $("retryStep").addEventListener("click",runNext);
  $("approveOutline").addEventListener("click", () => action(async () => {
    const episodes = outlineRows().map(({title,summary,batchIds}) => ({title,summary,batchIds}));
    if (episodes.some(episode => !episode.title || !episode.summary)) throw new Error("请填写每集标题和梗概。");
    const invalid = episodes.findIndex(episode => textLength(episode.title) > 100 || textLength(episode.summary) > 650);
    if (invalid >= 0) throw new Error("第" + (invalid + 1) + "集标题最多100字、梗概最多650字，请整理后确认；当前编辑已保留。");
    if (!await confirmAction("确认后将按此大纲生成剧本。现在确认这份大纲？")) return;
    const data = await request(api + "/approve",{id:project.id,episodes});
    outlineDirty = false;
    renderedEpisodes = "";
    applyProject({...project,...data.project});
    status("大纲已确认。");
  }));
  $("copyScreenplay").addEventListener("click", () => action(async () => {
    try { await navigator.clipboard.writeText($("screenplay").value); }
    catch (_) { $("screenplay").select(); if (!document.execCommand("copy")) throw new Error("复制失败，请手动复制剧本。"); }
    status("已复制剧本。");
  }));
  $("downloadScreenplay").addEventListener("click", () => {
    const blob = new Blob(["\ufeff",$("screenplay").value],{type:"text/plain;charset=utf-8"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = (project.name || "小说改编") + (done(project.stages?.screenplay) ? "-剧本.txt" : "-阶段稿.txt");
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href),1000);
  });
  window.addEventListener("beforeunload", event => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  action(async () => {
    const projects = await refreshList();
    if (projects.length) {
      await openProject(projects[0].id);
      $("projectList").value = project.id;
    } else status("创建一个项目即可导入小说原文。");
  });
})();

(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const source = byId("sourceText");
  const requirements = byId("requirements");
  const result = byId("screenplay");
  const start = byId("start");
  const resume = byId("resume");
  const quoteBox = byId("quote");
  const status = byId("status");
  const pendingKey = "nanbudo-novel-screenplay-task249";
  let quote = null;
  let busy = false;
  let pending = "";
  let receiptId = "";
  try { receiptId = localStorage.getItem(pendingKey) || ""; } catch (_) {}

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }
  function updateControls() {
    byId("sourceCount").textContent = `已输入 ${source.value.trim().length.toLocaleString("zh-CN")} 字`;
    start.disabled = busy || Boolean(pending || receiptId) || !quote || !source.value.trim();
    resume.hidden = busy || !(pending || receiptId);
    byId("copyScreenplay").disabled = !result.value.trim();
    byId("downloadScreenplay").disabled = !result.value.trim();
  }
  function rememberReceipt(value) {
    receiptId = value;
    if (!value) pending = "";
    try {
      if (value) localStorage.setItem(pendingKey, value);
      else localStorage.removeItem(pendingKey);
    } catch (_) {}
  }
  function showResult(data) {
    if (!data?.screenplay?.trim()) throw new Error("任务结束，但没有取得剧本正文。");
    result.value = data.screenplay;
    const continuity = typeof data.continuity === "string" ? data.continuity.trim() : "";
    byId("continuity").value = continuity;
    byId("continuityPanel").hidden = !continuity;
    rememberReceipt("");
    byId("resultStatus").textContent = "剧本已返回，可编辑、复制或下载。";
    showStatus("生成完成。");
  }
  async function recoverReceipt() {
    const data = await request("/api/writing/auxiliary/recover", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({receiptId}), signal: AbortSignal.timeout(25000),
    });
    if (data.auxReceiptId !== receiptId) throw new Error("原任务回执不一致，请在任务进度核对。");
    if (data.status === "succeeded") { showResult(data.result); return; }
    if (data.status === "pending" && data.taskId) {
      pending = data.taskId;
      await pollTask();
      return;
    }
    if (["missing", "expired", "failed", "invalid"].includes(data.status)) {
      rememberReceipt("");
      throw new Error(data.error || "原任务记录不可用，请先核对任务进度。");
    }
    throw new Error(data.error || "原任务结果仍待确认，可以继续查询。");
  }
  async function request(url, options) {
    const response = await fetch(url, {cache: "no-store", ...options});
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `请求失败（HTTP ${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  async function loadQuote() {
    const refresh = byId("refreshQuote");
    if (refresh.disabled) return;
    refresh.disabled = true;
    quote = null;
    updateControls();
    quoteBox.textContent = "正在读取模型和积分…";
    try {
      quote = await request("/api/novel-screenplay/quote");
      quoteBox.textContent = `模型 ${quote.displayName} · ${quote.points} 积分／次`;
      updateControls();
    } catch (error) {
      quote = null;
      quoteBox.textContent = error.message || "暂时无法读取报价。";
    } finally { refresh.disabled = false; updateControls(); }
  }
  async function pollTask() {
    let failures = 0;
    while (pending) {
      let task;
      try {
        task = await request(`/api/tasks/${encodeURIComponent(pending)}`, {signal: AbortSignal.timeout(10000)});
        failures = 0;
      } catch (error) {
        if (error.status === 404) {
          pending = "";
          throw new Error("实时任务记录不可用，请继续查询原任务回执。");
        }
        if (++failures >= 4) throw new Error("暂时无法读取任务状态，可继续查询原任务。");
      }
      if (task?.state === "done") {
        showResult(task.result);
        return;
      }
      if (task?.state === "error") {
        pending = "";
        throw new Error(task.error || "剧本生成失败，请查看任务进度。");
      }
      if (task) showStatus(task.message || "正在生成剧本，切换功能后仍可返回查看。");
      await new Promise(resolve => setTimeout(resolve, 1400));
    }
  }
  async function resumeTask() {
    if (busy || !(pending || receiptId)) return;
    busy = true;
    showStatus("正在查询原任务…");
    updateControls();
    try { if (pending) await pollTask(); else await recoverReceipt(); }
    catch (error) { showStatus(error.message, true); }
    finally { busy = false; updateControls(); }
  }
  function confirmGeneration(message) {
    const dialog = byId("confirmDialog");
    byId("confirmText").textContent = message;
    dialog.returnValue = "";
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), {once: true}));
  }
  byId("sourceFile").addEventListener("change", async event => {
    const fileInput = event.currentTarget;
    const file = fileInput.files[0];
    if (!file) return;
    const previous = source.value;
    try {
      const maxChars = quote?.maxSourceChars || 12000;
      if (!/\.txt$/i.test(file.name) || file.size > maxChars * 4 + 3) throw new Error("请选择大小合适的 TXT 文件，长篇可按章节分开导入。");
      const raw = await file.arrayBuffer();
      let text;
      try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); }
      catch (_) { text = new TextDecoder("gb18030", {fatal: true}).decode(raw); }
      text = text.trim();
      if (!text || text.includes("\0")) throw new Error("文件没有可读取的正文，请导出为 UTF-8 TXT。");
      if (text.length > maxChars) throw new Error(`本次正文最多 ${maxChars} 字，请按章节分开导入。`);
      if (source.value !== previous || (previous.trim() && !window.confirm("用所选 TXT 替换输入区里的正文？"))) return;
      source.value = text;
      showStatus(`已导入 ${file.name}。`);
      updateControls();
    } catch (error) { showStatus(error.message || "读取 TXT 失败，请另存为 UTF-8 后重试。", true); }
    finally { fileInput.value = ""; }
  });
  byId("adaptForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || pending || receiptId || !quote || !source.value.trim()) return;
    const expectedQuote = quote;
    const payload = {
      sourceText: source.value, requirements: requirements.value.trim(),
      style: byId("style").value, episodeSeconds: Number(byId("episodeSeconds").value),
      episodeCount: Number(byId("episodeCount").value), priorContext: byId("priorContext").value.trim(),
      quoteKey: expectedQuote.quoteKey,
    };
    if (payload.sourceText.length > quote.maxSourceChars || payload.requirements.length > quote.maxRequirementsChars) {
      showStatus("输入超过本次长度上限，请分章节处理。", true);
      return;
    }
    busy = true;
    updateControls();
    try {
      if (!await confirmGeneration(`将用 ${expectedQuote.displayName} 改编为${payload.style}，预计消耗 ${expectedQuote.points} 积分。模型成功返回后即使格式校验未通过也可能扣积分。确认发送正文和改编要求？`)) return;
      if (quote !== expectedQuote) throw new Error("报价已刷新，请重新确认后提交。");
      payload.auxReceiptId = crypto.randomUUID().replace(/-/g, "");
      rememberReceipt(payload.auxReceiptId);
      showStatus("正在提交改编任务…");
      const data = await request("/api/novel-screenplay/start", {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
      });
      if (data.auxReceiptId !== receiptId) throw new Error("没有取得一致的任务回执，请继续查询原任务。");
      pending = data.taskId || "";
      if (pending) await pollTask();
      else await recoverReceipt();
    } catch (error) { showStatus(error.message || "无法确认提交结果，请查看任务进度。", true); }
    finally { busy = false; updateControls(); }
  });
  byId("copyScreenplay").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(result.value);
      byId("resultStatus").textContent = "已复制剧本。";
    } catch (_) {
      result.focus();
      result.select();
      byId("resultStatus").textContent = "已选中剧本文字，可按 Ctrl+C 复制。";
    }
  });
  byId("downloadScreenplay").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob(["\ufeff", result.value], {type: "text/plain;charset=utf-8"}));
    const download = document.createElement("a");
    download.href = url;
    download.download = "小说改编剧本.txt";
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  byId("useContinuity").addEventListener("click", () => {
    const priorContext = byId("priorContext");
    const continuity = byId("continuity").value.trim();
    if (!continuity) return;
    if (continuity.length > priorContext.maxLength) {
      byId("resultStatus").textContent = "续写摘要超过前情长度上限，请先精简摘要。";
      return;
    }
    if (priorContext.value.trim() && priorContext.value.trim() !== continuity &&
        !window.confirm("用这段摘要替换现有前情？")) return;
    priorContext.value = continuity;
    byId("resultStatus").textContent = "续写摘要已填入下一批前情。";
  });
  byId("refreshQuote").addEventListener("click", loadQuote);
  resume.addEventListener("click", resumeTask);
  source.addEventListener("input", updateControls);
  result.addEventListener("input", updateControls);
  updateControls();
  loadQuote();
  if (receiptId) resumeTask();
})();

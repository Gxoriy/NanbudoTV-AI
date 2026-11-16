(() => {
  const $ = id => document.getElementById(id);
  const source = $("alignmentSource"), result = $("alignmentResult"), model = $("alignmentModel");
  let quote = null, modelRows = [], taskId = "", pollTimer = 0;
  const MAX_CHARS = 750000;
  function setStatus(message, kind = "") {
    const node = $("alignmentStatus"); node.textContent = message;
    node.classList.toggle("script-align-status-error", kind === "error");
    node.classList.toggle("script-align-status-success", kind === "success");
  }
  function duration() { return Number(document.querySelector('input[name="alignmentDuration"]:checked')?.value || 15); }
  function updateCount() {
    $("alignmentCharCount").textContent = `${source.value.length.toLocaleString()} 字`;
    if (source.value.length > MAX_CHARS) setStatus("剧本超过单次长度上限，请分批处理；未提交模型。", "error");
    quote = null;
    updateReady();
  }
  function updateReady() {
    const selected = modelRows.find(row => row.model === model.value);
    $("alignmentRun").disabled = Boolean(taskId) || !source.value.trim() || source.value.length > MAX_CHARS || !selected || !(Number(selected.price) > 0);
  }
  async function api(path, payload) {
    const response = await fetch(path, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }
  async function loadModels() {
    try {
      const response = await fetch("/api/client/config?refresh=1", {cache:"no-store"});
      const config = await response.json();
      if (!response.ok) throw new Error(config.error || "后台模型配置读取失败。");
      const prices = Array.isArray(config.textModelPricing) ? config.textModelPricing : [];
      const models = (Array.isArray(config.visualModels) ? config.visualModels : []).filter(item => item?.media === "text" && item.enabled !== false);
      modelRows = models.map(item => {
        const row = prices.find(price => String(price.model || "").toLowerCase() === String(item.model || "").toLowerCase() && String(price.resolution || price.operation || "").toLowerCase() === "refine");
        return {model:item.model, name:item.displayName || item.model, price:Number(row?.pricePerGeneration || 0)};
      }).filter(item => item.model && item.price > 0);
      model.replaceChildren();
      if (modelRows.length) {
        for (const item of modelRows) {
          const option=document.createElement("option"); option.value=item.model;
          option.textContent=`${item.name} · ${item.price.toFixed(2)}积分/次`; model.append(option);
        }
      } else {
        const option=document.createElement("option"); option.value="";
        option.textContent="后台未配置可用模型或AI小调用价格"; model.append(option);
      }
      const preferred = models.find(item => item.default === true)?.model || modelRows[0]?.model || "";
      if (modelRows.some(item => item.model === preferred)) model.value = preferred;
      const selected = modelRows.find(item => item.model === model.value);
      $("alignmentModelPrice").textContent = selected ? `每次成功调用约 ${selected.price.toFixed(2)} 积分；长稿分批后按实际调用结算。` : "后台需要发布文本模型及AI小调用价格后才能使用。";
      setStatus(selected ? "模型和价格已同步。点击后会先核对预计调用量，再由你确认是否提交。" : "当前没有已发布且配置价格的模型。", selected ? "success" : "error");
      updateReady();
    } catch (error) { setStatus(error.message, "error"); updateReady(); }
  }
  function showProgress(task) {
    const wrap = $("alignmentProgressWrap"); wrap.hidden = false;
    const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
    $("alignmentProgressMessage").textContent = task.message || "正在处理…";
    $("alignmentProgressPercent").textContent = `${progress}%`;
    $("alignmentProgressBar").style.width = `${progress}%`;
    const partial = task.preview?.formattedText;
    if (typeof partial === "string" && partial && result.value !== partial) result.value = partial;
    $("alignmentCopy").disabled = !result.value;
    $("alignmentDownload").disabled = !result.value;
  }
  async function poll() {
    if (!taskId) return;
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {cache:"no-store"});
      const task = await response.json();
      if (!response.ok) throw new Error(task.error || "任务查询失败；请核对任务状态，不要重复提交。");
      showProgress(task);
      if (["queued","running"].includes(task.state)) { pollTimer = setTimeout(poll, 1800); return; }
      const completed = task.state === "done";
      if (completed) {
        const text = task.result?.formattedText;
        if (typeof text === "string") result.value = text;
        setStatus(`剧本对齐完成：${Number(task.result?.completedChunks || 0)}段模型调用；实际结算 ${Number(task.result?.chargedPoints || 0).toFixed(2)} 积分。`, "success");
      } else {
        setStatus(`任务未完成：${task.error || task.message || "请检查原任务状态。"}${result.value ? "；已返回片段保留在结果框中。" : ""}`, "error");
      }
      taskId = ""; updateReady();
      $("alignmentCopy").disabled = !result.value; $("alignmentDownload").disabled = !result.value;
    } catch (error) {
      setStatus(`${error.message}；保留当前结果，不会自动重新提交。`, "error");
      taskId = ""; updateReady();
    }
  }
  async function begin() {
    if (!source.value.trim() || !model.value || taskId) return;
    $("alignmentRun").disabled = true; setStatus("正在核对原稿分段与预计积分…");
    try {
      quote = await api("/api/script-alignment/quote", {sourceText:source.value, sliceSeconds:duration(), model:model.value});
      const description = `模型：${quote.modelName}\n切片规格：${quote.sliceSeconds}秒一段\n预计分批：${quote.estimatedCalls}次模型调用\n每次预计：${Number(quote.pointsPerCall).toFixed(2)}积分\n预计合计：${Number(quote.estimatedPoints).toFixed(2)}积分\n\n费用按实际成功模型调用结算。是否继续？`;
      $("alignmentQuoteText").textContent = description;
      const dialog = $("alignmentConfirmDialog");
      const answer = await new Promise(resolve => {
        const confirm = $("alignmentConfirmQuote"), cancel = $("alignmentCancelQuote");
        const cleanup = value => { confirm.removeEventListener("click", yes); cancel.removeEventListener("click", no); if (dialog.open) dialog.close(); resolve(value); };
        const yes = event => { event.preventDefault(); cleanup(true); };
        const no = event => { event.preventDefault(); cleanup(false); };
        confirm.addEventListener("click", yes, {once:true}); cancel.addEventListener("click", no, {once:true}); dialog.showModal();
      });
      if (!answer) { setStatus("已取消，未调用模型、未扣费。"); return; }
      setStatus("已确认，正在提交原任务…");
      const started = await api("/api/script-alignment/submit", {quoteId:quote.quoteId, sourceText:source.value, sliceSeconds:duration(), modelConfig:{model:model.value,operation:"refine",temperature:0.2,maxTokens:32000,timeout:600}});
      taskId = started.taskId; result.value = ""; $("alignmentProgressWrap").hidden = false;
      setStatus("已提交；正在等待模型逐段返回。请勿重复提交。", "success"); updateReady(); poll();
    } catch (error) { setStatus(error.message, "error"); }
    finally { updateReady(); }
  }
  $("alignmentChooseFile").addEventListener("click", () => $("alignmentFile").click());
  $("alignmentFile").addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setStatus("TXT/Markdown文件最多5MB。", "error"); event.target.value = ""; return; }
    try { source.value = await file.text(); updateCount(); setStatus(`已导入“${file.name}”；请核对内容后选择切片规格。`, "success"); }
    catch (error) { setStatus(`文件读取失败：${error.message}`, "error"); }
  });
  source.addEventListener("input", updateCount);
  document.querySelectorAll('input[name="alignmentDuration"]').forEach(input => input.addEventListener("change", () => { quote = null; }));
  model.addEventListener("change", () => { quote = null; const selected = modelRows.find(item => item.model === model.value); $("alignmentModelPrice").textContent = selected ? `每次成功调用约 ${selected.price.toFixed(2)} 积分；长稿分批后按实际调用结算。` : "请选择可用文本模型。"; updateReady(); });
  $("alignmentRun").addEventListener("click", begin);
  $("alignmentCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(result.value); setStatus("结果已复制。", "success"); } catch (_) { result.focus(); result.select(); document.execCommand("copy"); setStatus("已尝试复制结果。", "success"); } });
  $("alignmentDownload").addEventListener("click", () => { const blob = new Blob([result.value], {type:"text/plain;charset=utf-8"}); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `对齐后剧本_${duration()}秒切片.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); });
  loadModels(); updateCount();
})();

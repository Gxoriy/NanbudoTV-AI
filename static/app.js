const $ = (id) => document.getElementById(id);
const PRODUCT_NAME = "NanbudoTV·AI";
const state = { videoId: "", videoName: "", activeResult: "structure", result: null, busy: false, generationMode: "", provider: "qwen", profiles: {}, textModels: [], textPricing: [], asrReady: false, speechBusy: false, licenseNotice: "", licenseExitTimer: null, watchRecording: false, watchFinishing: false, watchPoll: null, watchRecognition: null, linkMedia: null, hallMedia: null, hallWorks: [], hallAllWorks: [], hallPage: 1, hallRenderTypes: [], hallRenderMessage: "", hallRenderProgress: null, hallContextWork: null, hallPreviewCache: {}, hallEpisodeCache: {}, hallEpisodes: [], hallEpisodeIndex: 0, hallCurrentWork: null, hallHoverTimer: null, hallPrewarmId: 0, hallLoadingTypes: {}, hallView: "channel", hallFavorites: [], hallDownloads: [], historyRecords: [], historySelection: new Set(), historyRetention: -1, workMode: "rewrite", rewriteFormat: "ultra_commerce", originalType: "emotional_commerce", rewriteProductEnabled: false, originalProductEnabled: true, sourceAnalysis: null, sourceAnalysisSignature: "", assetConfirmationKey: "", confirmedAssetText: "", rewriteProposals: [], selectedProposalId: "", proposalTextSnapshot: "", proposalSkipped: false, proposalDecisionMade: false, savedRewriteConfig: null, savedRewriteConfigText: "", rewriteConfigConfirmed: false, rewriteConfigKey: "", rewriteCallPending: false, rewriteProjectId: "", rewriteProjects: [], clientConfig: null, clientUpdateFile: "", clientUpdateBusy: false, features: ["rewrite", "original", "workflow"], visualProject: null, visualProfile: null, visualTasks: {}, marketingMode: "remix", marketingVideoId: "", marketingReferenceName: "", marketingReferenceAnalysis: "", marketingReferenceDuration: 0, marketingPreviewObjectUrl: "", storePersonaId: "preset-owner-female", storeFiles: {persona:[], scenes:[], products:[], voice:null} };

state.sourceScriptKey = "";
state.clientUpdateCanApplyOnline = false;
state.clientUpdateApplying = false;
state.textButtonBindings = {};
state.creationTasks = {rewrite: null, original: null};
state.creationBusy = {rewrite: false, original: false};

const builtinPlotTypes = [
  "家庭伦理/亲情救赎", "认亲现场", "拆迁款争夺", "婆媳矛盾", "姑嫂冲突", "重男轻女", "养老争端", "遗产争夺", "家庭偏心", "子女不孝",
  "隔代亲情", "失散重逢", "母爱催泪", "父爱无声", "二婚家庭", "黄昏恋", "育儿冲突", "身份反转", "豪门认亲", "赘婿逆袭",
  "平民高手", "隐藏富豪", "农村逆袭", "小人物翻身", "职场霸凌", "校园霸凌", "商战逆袭", "职场揭秘", "网红塌房", "闺蜜背叛",
  "婚姻背叛", "误会离婚", "破镜重圆", "替嫁真爱", "兄弟反目", "姐妹和解", "重生复仇", "穿越逆袭", "时空循环", "末日求生",
  "悬疑破案", "家族秘密", "诈骗揭秘", "老年防骗", "儿童拐骗反诈", "彩礼纠纷", "房产争夺", "医患人情", "邻里温情", "师徒传承"
];

const hallBuiltinPlotTypes = {
  emotional_commerce: [
    "家庭亲情带货", "中老年健康生活", "母女和解", "父子亲情", "婆媳互助", "隔代陪伴", "养老关怀", "老年防骗", "农村生活好物", "邻里温情",
    "节日送礼", "居家清洁", "厨房好物", "健康饮食", "日常穿戴", "睡眠关怀", "关节养护场景", "家庭团圆", "空巢老人", "返乡尽孝",
    "夫妻扶持", "兄弟姐妹和解", "小人物善意", "传统手艺", "生活省钱", "品质升级", "情感礼物", "家庭应急", "孝心误会", "温情反转"
  ],
  live_action_ai: [
    "身份反转", "豪门认亲", "赘婿逆袭", "隐藏富豪", "重生复仇", "穿越逆袭", "替嫁真爱", "先婚后爱", "破镜重圆", "婚姻背叛",
    "职场逆袭", "商战博弈", "校园成长", "悬疑破案", "家族秘密", "真假千金", "闪婚甜宠", "都市奇遇", "古装权谋", "宅斗逆袭",
    "年代创业", "农村逆袭", "医者仁心", "律师博弈", "战神归来", "高手下山", "失散重逢", "复仇打脸", "时空循环", "末日求生"
  ],
  ai_comic: [
    "东方玄幻", "修仙升级", "系统觉醒", "末世重生", "异能都市", "国风神话", "武道争锋", "宗门逆袭", "灵宠养成", "无限流闯关",
    "赛博未来", "星际战争", "克苏鲁悬疑", "诡异复苏", "规则怪谈", "全民转职", "领主争霸", "召唤流", "签到变强", "反派自救",
    "穿书改命", "古代经营", "兽世冒险", "魔法学院", "热血竞技", "机甲战斗", "山海经异兽", "神明复苏", "多世界穿梭", "高燃复仇"
  ]
};

function hallPlotTypes(type = state.originalType) {
  return hallBuiltinPlotTypes[type] || builtinPlotTypes;
}

const hallModeNames = {
  emotional_commerce: "情感带货大厅",
  live_action_ai: "真人 AI 短剧大厅",
  ai_comic: "AI 漫剧大厅"
};

const HALL_FAVORITES_KEY = "drama-hall-favorites-v1";

function loadHallFavorites() {
  try {
    const values = JSON.parse(localStorage.getItem(HALL_FAVORITES_KEY) || "[]");
    state.hallFavorites = Array.isArray(values) ? values.filter(item => item?.url) : [];
  } catch (_) { state.hallFavorites = []; }
  if ($("hallFavoriteCount")) $("hallFavoriteCount").textContent = `${state.hallFavorites.length}部`;
}

function isHallFavorite(work) {
  return Boolean(work?.url && state.hallFavorites.some(item => item.url === work.url));
}

function saveHallFavorites() {
  localStorage.setItem(HALL_FAVORITES_KEY, JSON.stringify(state.hallFavorites));
  if ($("hallFavoriteCount")) $("hallFavoriteCount").textContent = `${state.hallFavorites.length}部`;
}

function toggleHallFavorite(work) {
  if (!work?.url) return;
  const index = state.hallFavorites.findIndex(item => item.url === work.url);
  if (index >= 0) {
    state.hallFavorites.splice(index, 1);
    toast("已移出收藏。 ");
  } else {
    state.hallFavorites.unshift({ ...work, favoriteType: state.originalType, favoritedAt: new Date().toISOString() });
    toast("已收藏到本地“我的收藏”。");
  }
  saveHallFavorites();
  if (state.hallView === "favorites") showHallFavorites();
  else document.querySelectorAll(".reference-work").forEach((card, cardIndex) => {
    const button = card.querySelector('[data-work-action="favorite"]');
    if (button) button.textContent = isHallFavorite(state.hallWorks[cardIndex]) ? "★ 已收藏" : "☆ 收藏";
  });
}

state.marketingStrengths = {ecommerce:55, store:75, advertising:35};
const STORE_INDUSTRIES = ["餐饮美食","咖啡茶饮","烘焙甜品","酒店民宿","旅游景区","休闲游玩","亲子乐园","母婴用品","运动健身","美容美发","美甲美睫","服装服饰","鞋包配饰","珠宝首饰","家居家装","数码家电","汽车服务","摄影写真","婚庆服务","宠物服务","教育培训","医疗健康","养生保健","家政服务","房产家居","商场零售","便利商超","鲜花绿植","文化艺术","夜生活娱乐","本地生活服务"];
state.featureStatus = {};
state.licensePoints = 0;
state.featureAccessError = false;
state.workflowUnlockBusy = false;
state.licenseValid = false;
state.cardExpiresAt = 0;

const providerPresets = {
  qwen: { name: "千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3.6-flash", protocol: "chat_completions" },
  doubao: { name: "豆包", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seed-2-0-lite-260215", protocol: "responses" },
  custom: { name: "其他模型", baseUrl: "", model: "", protocol: "chat_completions" }
};

function toast(message, error = false) {
  const node = $("toast");
  node.textContent = message;
  node.className = `toast show${error ? " error" : ""}`;
  window.ModelActivity?.text(node,message,error);
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.className = "toast", 4200);
}

const TASK_KIND_LABELS = {
  canvas_assistant: "画布协作写作",
  generate: "剧本生成", source_analyze: "原剧识别", rewrite_proposals: "三案提案", quality_optimize: "成稿质检优化",
  original_recommend: "原创智能补全", original_field_optimize: "原创单项优化", visual_plan: "标准分镜识别",
  visual_normalize: "外部剧本整理", visual_workflow_scenes: "智能分集", visual_asset: "参考图生成", visual_frame: "分集首帧生成",
  visual_video: "分集视频生成", visual_cover: "短剧封面生成", marketing_analyze: "参考片分析",
  marketing_generate: "宣传片生成", transcribe: "视频对白识别", series_transcribe: "批量对白识别",
  series_download: "剧集下载", client_update: "客户端下载", visual_episode_cut: "剧集切割",
  visual_asset_recognition: "剧中资产识别", visual_cut_storyboard: "分镜补齐", visual_storyboard_regeneration: "分镜重新生成", repair_episode: "单集修订",
  visual_storyboard: "分镜生成", visual_storyboard_one: "单集分镜重新生成", breakdown_analyze: "爆款拆解", breakdown_generation: "拆解复刻/元素替换", prompt_reverse: "提示词反推"
};
state.taskStates = new Map();
state.taskSnapshotInitialized = false;
state.serverTaskSnapshot = [];
state.storyTaskProjects = new Map();

// The new workflow keeps RH receipts separately from /api/tasks. Merge only
// its text tasks here; image/video tasks already belong to the native queue.
const STORY_TASK_MESSAGE = "nanbudo:story-workflow-tasks";
const STORY_TASK_STALE_MS = 90000;
const STORY_TASK_NAMES = {import:"剧本导入",extract:"资产提取",storyboard:"分镜提取",rebuild:"单场重建"};
function storyTaskStamp(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric / 1000 : Math.max(0,numeric);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : 0;
}
function storyTaskError(value) {
  const message = typeof value === "object" && value ? value.message : value;
  return /\bDRAMA_BALANCE_INSUFFICIENT\b/.test(String(message || "")) ? "RH 通道余额不足，请联系管理员充值后重试。" : String(message || "").slice(0,1000);
}
function receiveStoryTaskSnapshot(event) {
  const frame = $("storyWorkflowFrame"), data = event.data;
  if (event.origin !== location.origin || event.source !== frame?.contentWindow || data?.type !== STORY_TASK_MESSAGE || !Array.isArray(data.projects)) return;
  for (const project of data.projects.slice(0,1000)) {
    if (!project || typeof project.id !== "string" || !project.id || project.id.length > 255) continue;
    const previous = state.storyTaskProjects.get(project.id), records = new Map();
    const name = String(project.name || "工作流新").slice(0,255);
    const base = (id,operation,stamp) => ({id:"rh:"+project.id+":"+id,kind:"rh_workflow",projectId:project.id,taskLabel:name+" · "+(STORY_TASK_NAMES[operation] || "RH 任务"),createdAt:storyTaskStamp(stamp),progress:null});
    const requestIds = new Set();
    for (const task of (Array.isArray(project.tasks) ? project.tasks : []).slice(0,3000)) {
      if (!task || typeof task.taskId !== "string" || !task.taskId || task.taskId.length > 255) continue;
      const status = String(task.status || "UNKNOWN").toUpperCase();
      const mapped = {QUEUED:["queued","RH 排队中"],RUNNING:["running","RH 处理中"],SUBMITTING:["running","正在提交"],SUCCEEDED:["done","已完成"],FAILED:["error","失败"],CANCELED:["canceled","已取消"],CANCELLED:["canceled","已取消"]}[status] || ["attention","状态待核对"];
      const item = {...base("task:"+task.taskId,task.operation,task.createdAt || task.startedAt),state:mapped[0],stateLabel:mapped[1],finishedAt:storyTaskStamp(task.finishedAt),message:storyTaskError(task.error) || (mapped[0] === "attention" ? "请查询原任务；不会自动重新提交。" : mapped[1])};
      if (mapped[0] === "error") item.error = item.message;
      records.set(item.id,item);
      if (task.requestId) requestIds.add(String(task.requestId));
    }
    const submissions = (Array.isArray(project.submitting) ? project.submitting : []).slice(0,1000);
    for (const receipt of (Array.isArray(project.pendingRequests) ? project.pendingRequests : []).slice(0,1000)) {
      const id = receipt?.request_id || receipt?.requestId;
      if (typeof id !== "string" || !id || id.length > 255 || requestIds.has(id)) continue;
      const item = {...base("request:"+id,receipt.action || receipt.operation,receipt.created),state:"attention",stateLabel:"提交结果待核对",message:"请核对原提交；不会自动重新提交。"};
      records.set(item.id,item);
    }
    for (const submission of submissions) {
      const id = submission?.requestId;
      if (typeof id !== "string" || !id || id.length > 255 || requestIds.has(id)) continue;
      const item = {...base("request:"+id,submission.operation,submission.startedAt),state:"running",stateLabel:"正在提交",message:"正在发送请求，等待提交回执。"};
      // A definitive receipt always wins over the transient send animation.
      if (!records.has(item.id)) records.set(item.id,item);
    }
    if (previous) records.forEach(item => {
      const old = previous.records.get(item.id);
      if (["queued","running"].includes(old?.state) && ["done","error"].includes(item.state)) notifyTaskFinished(item);
    });
    state.storyTaskProjects.set(project.id,{records,receivedAt:Date.now()});
  }
  renderCombinedTaskManager();
}
function renderCombinedTaskManager() {
  const storyTasks = [];
  for (const project of state.storyTaskProjects.values()) {
    const stale = Date.now() - project.receivedAt > STORY_TASK_STALE_MS;
    for (const item of project.records.values()) storyTasks.push(stale && ["queued","running"].includes(item.state) ? {...item,state:"attention",stateLabel:"状态待刷新",message:"工作流状态暂未更新，请打开工作流查询原任务。"} : item);
  }
  renderTaskManager([...state.serverTaskSnapshot,...storyTasks]);
}
window.addEventListener("message",receiveStoryTaskSnapshot);
document.addEventListener("click",event => {
  const button = event.target.closest("button[data-story-task-project]");
  if (!button || !$("taskManagerList")?.contains(button)) return;
  setWorkMode("workflow-new");
  $("storyWorkflowFrame")?.contentWindow?.postMessage({type:"nanbudo:story-workflow-open",projectId:button.dataset.storyTaskProject},location.origin);
  toggleTaskManager(false);
});

function taskTime(seconds) {
  const value = Math.max(0, Math.round(seconds || 0));
  if (value < 60) return `${value}秒`;
  return `${Math.floor(value / 60)}分${String(value % 60).padStart(2, "0")}秒`;
}

function taskTiming(item) {
  if (item.kind === "rh_workflow") {
    const stamp = Number(item.createdAt || 0);
    return stamp ? new Date(stamp * 1000).toLocaleString("zh-CN", {hour12:false}) : "";
  }
  const now = Date.now() / 1000;
  const started = Number(item.startedAt || item.createdAt || now);
  const elapsed = Math.max(0, now - started);
  const stamp = Number(item.startedAt || item.createdAt || 0);
  const dateText = stamp ? new Date(stamp * 1000).toLocaleString("zh-CN", {hour12:false}) : "时间未知";
  if (item.state === "queued") return `${dateText} · 等待执行`;
  if (item.state === "attention") {
    const finished = Number(item.finishedAt);
    return `${dateText}${Number.isFinite(finished) && finished >= started ? ` · 用时${taskTime(finished-started)}` : ""} · 原任务待核对，未重新生成`;
  }
  if (item.state === "done" || item.state === "error") {
    const phases = item.videoTimingMs || {};
    const elapsedPhases = [
      ["本地准备", phases.beforeGateway],
      ["网关接单", phases.gatewayRoundTrip],
      ["提交后等待", phases.untilDownload],
      ["下载", phases.download],
    ].filter(([, time]) => Number.isFinite(time)).map(([label, time]) => label + taskTime(time / 1000));
    return [dateText, `用时${taskTime((item.finishedAt || now) - started)}`, ...elapsedPhases].join(" · ");
  }
  // Stage percentages do not measure token throughput or upstream ETA.
  // In particular, a long wait at 5% must not become a fabricated 112 min.
  const modelTask = /^(generate|source_analyze|rewrite_proposals|quality_optimize|original_|visual_|marketing_|breakdown_)/.test(String(item.kind || ""));
  return `${dateText} · 已用${taskTime(elapsed)}${modelTask ? " · 等待模型返回，暂无法估计剩余时间" : ""}`;
}

function taskDisplayLabel(item) {
  const label=taskOperationLabel(item);
  return item.projectName && item.kind!=="rh_workflow" ? `${item.projectName} · ${label}` : label;
}
function taskOperationLabel(item) {
  if (item.taskLabel) return String(item.taskLabel);
  const kind = String(item.kind || "");
  if (kind === "generate") {
    if (item.creationMode === "original") return "一键原创剧本";
    if (item.creationMode === "rewrite") return "一键改写剧本";
  }
  return ({visual_macro_arrangement:'剧本编排 / 单卡分镜',visual_macro_media:'视频生成',visual_macro_media_observe:'查询原视频任务'})[kind] || TASK_KIND_LABELS[kind] || "后台任务";
}

function taskPoints(item) {
  if (item.kind === "rh_workflow") return "积分以原任务结算记录为准";
  const actual = item.chargedPoints;
  const estimate = item.estimatedPoints;
  if (actual !== undefined && actual !== null && Number.isFinite(Number(actual))) {
    const count = Number(item.billedCallCount);
    const price = Number(item.callPrice);
    const failure = Number(item.failedCallCount || 0) ? ` · 失败${item.failedCallCount}次未收费` : '';
    return Number.isFinite(count) && Number.isFinite(price) ? `${count}次 × ${pointsText(price)} = ${pointsText(actual)}积分${failure}` : `实际结算：${pointsText(actual)}积分`;
  }
  if (estimate !== undefined && estimate !== null && Number.isFinite(Number(estimate))) return `预计积分：${pointsText(estimate)}`;
  return item.state === "error" ? "积分：待核对结算记录" : "积分：待实际调用结算";
}

function notifyTaskFinished(item) {
  const label = taskDisplayLabel(item);
  const paused = /^visual_macro_media/.test(String(item.kind||''))&&/查询等待已暂停|软件正在关闭/.test(String(item.error||item.message||''));
  const failed = item.state === "error"&&!paused;
  const compared = item.state==='done'&&item.comparisonOnly===true&&item.comparisonComplete===true;
  const adoption=compared&&item.adoption,adopted=adoption?.applied?.length>0;
  const emptyComparison=item.state==='done'&&item.comparisonOnly===true&&item.emptyResponse===true;
  const incomplete = !failed && item.workflowComplete === false && !compared && !emptyComparison;
  const message = paused ? `${label}的本机查询已暂停，原任务保留；可继续查询或解除本机等待。` : failed ? `${label}失败：${item.error || item.message || "请查看任务详情"}` : emptyComparison ? '新分镜上游返回为空；原记录已保留，未自动重试或替换旧分镜。' : adoption ? adopted ? (adoption.pending?.length?'新分镜部分已填入视频卡；其余可在新旧对比免费分配，旧稿与视频保留。':'新分镜已填入对应视频卡；旧稿可在新旧对比复用，已有视频未重做。') : '新分镜已返回，可在新旧对比免费采用；旧稿与视频保留。' : compared ? '新分镜已返回，对比已完成；旧分镜和视频保持不变。' : incomplete ? `${label}已返回结果，但仍有未完成项，请查看检查结果。` : `${label}已经完成。`;
  toast(message, failed);
  if (window.Notification?.permission === "granted") {
    try { new Notification(`${PRODUCT_NAME} · ${paused ? "查询已暂停" : failed ? "任务失败" : emptyComparison ? "上游返回为空" : compared ? "对比完成" : incomplete ? "结果已返回" : "任务完成"}`, { body: message }); } catch (_) {}
  }
}

let taskManagerMarkup251 = '';
let taskManagerRefresh251 = null;
function renderTaskManager(tasks) {
  const active = tasks.filter(item => ["queued", "running"].includes(item.state));
  const attention = tasks.filter(item => item.state === "attention");
  const recent = tasks.filter(item => ["done", "error", "canceled"].includes(item.state)).sort((a,b)=>Number(b.finishedAt || b.createdAt || 0)-Number(a.finishedAt || a.createdAt || 0)).slice(0, 12);
  $("taskManagerCount").textContent = String(active.length);
  $("taskManagerToggle").classList.toggle("active", active.length > 0);
  $("taskManagerSummary").textContent = (active.length ? `${active.length}个任务正在进行，完成后会提醒` : "当前没有进行中的任务")+(attention.length ? ` · ${attention.length}项待核对` : "");
  const visible = [...active, ...attention, ...recent];
  // Keep counts and completion notifications alive while the panel is closed.
  // Its hidden rows need neither rebuilding nor restarting their animations.
  if ($("taskManagerPanel").classList.contains?.("hidden")) return;
  const markup = visible.length ? visible.map(item => {
    if (item.kind === "rh_workflow") {
      const animated = ["queued","running"].includes(item.state);
      const animation = animated ? window.ModelActivity?.markup(item.state,"") || "" : "";
      const detail = item.error || item.message !== item.stateLabel && item.message;
      return `<article class="task-manager-item ${escapeHtml(item.state)}" data-rh-task="${escapeHtml(item.id)}"><div class="task-manager-item-head"><b>${escapeHtml(taskDisplayLabel(item))}</b><span>${animation}${escapeHtml(item.stateLabel)}</span></div>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}<div class="task-manager-item-meta"><span>${escapeHtml(taskTiming(item))}</span><span>${escapeHtml(taskPoints(item))}</span></div><button type="button" class="ghost-btn" data-story-task-project="${escapeHtml(item.projectId)}">查看任务</button></article>`;
    }
    const progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
    const paused=/^visual_macro_media/.test(String(item.kind||''))&&/查询等待已暂停|软件正在关闭/.test(String(item.error||item.message||'')),displayState=paused?'paused':item.state;
    const adoption=item.state==='done'&&item.comparisonOnly===true&&item.comparisonComplete===true&&item.adoption;
    const stateLabel = paused ? "查询已暂停" : item.state === "attention" ? "原任务待核对" : item.state==='done'&&item.comparisonOnly===true&&item.emptyResponse===true ? "上游返回为空" : adoption ? adoption.applied?.length ? adoption.pending?.length ? "部分已填入视频卡" : "已填入视频卡" : "已返回可采用" : item.state==='done'&&item.comparisonOnly===true&&item.comparisonComplete===true ? "新分镜已返回 / 对比已完成" : item.workflowComplete === false ? "已返回待检查" : item.state === "done" ? "已完成" : item.state === "error" ? "失败" : item.state === "queued" ? "排队中" : `${progress}%`;
    return `<article class="task-manager-item ${escapeHtml(displayState || "")}"><div class="task-manager-item-head"><b>${escapeHtml(taskDisplayLabel(item))}</b><span>${window.ModelActivity?.markup(displayState,stateLabel)||stateLabel}</span></div><p>${window.ModelActivity?.markup(displayState,item.error || item.message || "正在处理…")||escapeHtml(item.error || item.message || "正在处理…")}</p><div class="task-manager-item-meta"><span>${escapeHtml(taskTiming(item))}</span><span>${escapeHtml(taskPoints(item))}</span></div></article>`;
  }).join("") : '<div class="task-manager-empty">当前没有任务。开始改写、识别、图片或视频生成后，会在这里统一显示进度。</div>';
  if (markup !== taskManagerMarkup251) { $("taskManagerList").innerHTML = markup; taskManagerMarkup251 = markup; }
}

async function refreshTaskManager() {
  if (taskManagerRefresh251) return taskManagerRefresh251;
  const work = readTaskManager251();
  taskManagerRefresh251 = work;
  const clear = () => { if (taskManagerRefresh251 === work) taskManagerRefresh251 = null; };
  work.then(clear, clear);
  return work;
}
async function readTaskManager251() {
  try {
    const response = await fetch("/api/tasks", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) { renderCombinedTaskManager(); return; }
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    if (state.taskSnapshotInitialized) {
      tasks.forEach(item => {
        const previous = state.taskStates.get(item.id);
        if (["queued", "running"].includes(previous) && ["done", "error"].includes(item.state)) notifyTaskFinished(item);
      });
    }
    state.taskStates = new Map(tasks.map(item => [item.id, item.state]));
    state.taskSnapshotInitialized = true;
    state.serverTaskSnapshot = tasks;
    renderCombinedTaskManager();
  } catch (_) { renderCombinedTaskManager(); }
}

function toggleTaskManager(show = null) {
  const panel = $("taskManagerPanel");
  const open = show === null ? panel.classList.contains("hidden") : Boolean(show);
  panel.classList.toggle("hidden", !open);
  $("taskManagerToggle").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    renderCombinedTaskManager();
    refreshTaskManager();
    if (window.Notification?.permission === "default") window.Notification.requestPermission().catch(() => {});
  }
}

function desktopApi() {
  return window.pywebview?.api || window.parent?.pywebview?.api || null;
}

function suggestedDownloadName(url, fallback = "下载文件") {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.searchParams.get("name") || parsed.searchParams.get("file")?.split(/[\\/]/).pop() || fallback;
  } catch (_) { return fallback; }
}

async function saveLocalDownload(url, suggestedName = "", feature = state.workMode) {
  const api = desktopApi();
  if (api?.save_download) {
    const result = await api.save_download(url, suggestedName || suggestedDownloadName(url), feature);
    if (result?.canceled) return false;
    if (!result?.ok) throw new Error(result?.error || "保存失败。");
    toast(`已保存到：${result.path}`);
    return true;
  }
  const link = document.createElement("a");
  link.href = url; link.download = suggestedName || suggestedDownloadName(url); link.click();
  return true;
}

function fmtSize(bytes) {
  if (!bytes) return "0 MB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function refreshCacheUsage() {
  try {
    const response = await fetch("/api/storage/status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取缓存占用");
    $("cacheUsage").textContent = `视频缓存 ${fmtSize(data.uploadBytes)} · ${data.uploadFileCount || 0} 个文件 · 剧本记录 ${data.historyCount || 0} 条`;
    $("cacheLocation").textContent = `位置：${data.storagePath || "安装目录/data/uploads"}`;
  } catch (error) {
    $("cacheUsage").textContent = "暂时无法读取";
    $("cacheLocation").textContent = "请在桌面版软件中查看本地占用。";
  }
}

async function clearVideoCache() {
  if (state.busy) return toast("当前任务正在运行，请完成后再清理。", true);
  const scope = $("clearScope").value;
  const prompts = {
    uploads: "确定只清理视频缓存吗？已生成剧本和历史记录会保留。",
    history: "确定删除全部本地剧本历史吗？对应的分镜版、简版和任务记录都会删除，视频缓存会保留。",
    all: "确定同时删除视频缓存和全部本地剧本历史吗？此操作不会删除模型和API配置。"
  };
  if (!await studioConfirm(prompts[scope])) return;
  try {
    const data = await postJson("/api/storage/clear", { scope });
    if (["uploads", "all"].includes(scope)) {
      state.videoId = "";
      invalidateSourceAnalysis("原视频缓存已清理。");
      state.videoName = "";
      $("videoMeta").textContent = "已清除视频缓存";
      $("transcribeBtn").disabled = true;
    }
    if (["history", "all"].includes(scope)) await loadHistory();
    toast(`已删除 ${data.deletedFiles || 0} 个本地文件，释放 ${fmtSize(data.deletedBytes || 0)}。`);
    await refreshCacheUsage();
  } catch (error) { toast(error.message, true); }
}

function formatHistoryTime(value) {
  if (!value) return "时间未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function historyRetentionLabel(days) {
  return ({ "-1": "永久保存", "7": "保存7天", "3": "保存3天", "1": "保存1天", "0": "不保存" })[String(days)] || "永久保存";
}

function updateHistoryPolicyHint() {
  const days = Number(state.historyRetention);
  $("historyPolicyHint").textContent = days === 0
    ? "新结果只在当前运行期间可查看和下载，退出软件后自动清除。"
    : `${historyRetentionLabel(days)}，超出时间的剧本记录会自动清除。`;
}

function filteredHistoryRecords() {
  const keyword = $("historySearch").value.trim().toLowerCase();
  return state.historyRecords.filter(record => `${record.projectName} ${record.createdAt}`.toLowerCase().includes(keyword));
}

function updateHistorySelectionControls(records = filteredHistoryRecords()) {
  const visibleIds = records.map(record => record.id);
  const selectedVisible = visibleIds.filter(id => state.historySelection.has(id)).length;
  const selectAll = $("historySelectAll");
  selectAll.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  selectAll.disabled = visibleIds.length === 0;
  $("historySelectionSummary").textContent = `已选择 ${state.historySelection.size} 条`;
  $("deleteSelectedHistory").disabled = state.historySelection.size === 0;
  $("deleteAllHistory").disabled = state.historyRecords.length === 0;
}

function renderHistory() {
  const keyword = $("historySearch").value.trim().toLowerCase();
  const validIds = new Set(state.historyRecords.map(record => record.id));
  for (const id of state.historySelection) if (!validIds.has(id)) state.historySelection.delete(id);
  const records = filteredHistoryRecords();
  const retention = historyRetentionLabel(state.historyRetention);
  $("historySummary").textContent = keyword ? `找到 ${records.length} 条 / 共 ${state.historyRecords.length} 条` : `共 ${records.length} 条 · ${retention}`;
  $("historyEmpty").classList.toggle("hidden", records.length > 0);
  $("historyEmpty").textContent = Number(state.historyRetention) === 0
    ? "已选择不保存历史。当前生成结果仍可查看和下载，退出后自动清除。"
    : "还没有生成记录，完成第一次改写后会自动出现在这里。";
  const visibleCount = Math.max(8, Number(state.historyVisibleCount) || 8);
  const visibleRecords = records.slice(0, visibleCount);
  $("historyList").innerHTML = visibleRecords.map(record => {
    const ok = Boolean(record.validation?.ok);
    const score = record.qualityScore?.overall;
    const duration = record.durationSeconds ? `${Math.round(record.durationSeconds / 60 * 10) / 10}分钟` : "时长未记录";
    const encodedId = encodeURIComponent(record.id);
    const selected = state.historySelection.has(record.id);
    return `<div class="history-item${selected ? " selected" : ""}">
      <label class="history-select" title="选择这条记录"><input class="history-select-input" type="checkbox" data-history-id="${encodedId}" aria-label="选择${escapeHtml(record.projectName)}" ${selected ? "checked" : ""}></label>
      <div class="history-item-main"><b>${escapeHtml(record.projectName)}</b><span>${escapeHtml(formatHistoryTime(record.createdAt))} · 每集${record.episodeSeconds || 15}秒 · ${duration}</span></div>
      <span class="history-quality${ok ? "" : " warning"}">${score !== undefined ? `${score}分 · ` : ""}${ok ? "校验通过" : "有优化提醒"}</span>
      <div class="history-item-actions">
        <button class="secondary-btn history-open" data-history-id="${encodedId}" data-history-version="structure">打开成稿</button>
        <button class="ghost-btn history-video" data-history-id="${encodedId}">生成视频</button>
        <button class="ghost-btn history-rename" data-history-id="${encodedId}">重命名</button>
        <button class="history-delete" data-history-id="${encodedId}">删除</button>
      </div>
    </div>`;
  }).join("");
  $("historyShowMore").classList.toggle("hidden", visibleRecords.length >= records.length);
  $("historyShowMore").textContent = `展开更多记录（已显示 ${visibleRecords.length} / ${records.length}）`;
  updateHistorySelectionControls(records);
}

const rewriteProjectSelection = new Set();
const deletedRewriteProjects251 = new Set();
const rewriteProjectRevisions251 = new Map(), rewriteSaveQueues251 = new Map(), rewriteUnsavedDrafts251 = new Map();
let rewriteProjectListEpoch251 = 0;
let rewriteProjectDeleting = false;
let rewriteProjectRenaming = false;
function renderRewriteProjectHistory() {
  const list = $("rewriteProjectHistoryList");
  if (!list) return;
  list.innerHTML = state.rewriteProjects.length ? state.rewriteProjects.map(item => `<article class="rewrite-project-history-item">
    <label><input type="checkbox" data-select-rewrite-project="${escapeHtml(item.id)}" ${rewriteProjectSelection.has(item.id) ? "checked" : ""} aria-label="选择${escapeHtml(item.projectName || '未命名改写项目')}"></label><div><b>${escapeHtml(item.projectName || "未命名改写项目")}</b><span>${escapeHtml(formatHistoryTime(item.updatedAt))} · ${item.proposalCount || 0}套提案 · ${item.versionCount || 0}个成稿版本${item.selectedProposalId ? ` · 选中${escapeHtml(item.selectedProposalId)}案` : ""}</span></div>
    <div class="rewrite-project-actions"><button class="secondary-btn" type="button" data-open-rewrite-project="${escapeHtml(item.id)}">打开项目</button><button class="ghost-btn" type="button" data-rename-rewrite-project="${escapeHtml(item.id)}" ${rewriteProjectRenaming ? "disabled" : ""}>重命名</button><button class="ghost-btn" type="button" data-copy-rewrite-project="${escapeHtml(item.id)}">复制</button><button class="ghost-btn" type="button" data-export-rewrite-project="${escapeHtml(item.id)}">导出TXT</button><button class="danger-outline-btn" type="button" data-delete-rewrite-project="${escapeHtml(item.id)}" ${rewriteProjectDeleting ? "disabled" : ""}>删除</button></div>
  </article>`).join("") : '<div class="proposal-empty">暂无改写项目。完成原剧识别后会保存在本机。</div>';
  const count = rewriteProjectSelection.size;
  $("rewriteProjectSelectionCount").textContent = `已选${count}项`;
  $("deleteRewriteProjects").disabled = !count || rewriteProjectDeleting || state.busy;
  $("rewriteProjectSelectAll").checked = !!state.rewriteProjects.length && count === state.rewriteProjects.length;
  $("rewriteProjectSelectAll").indeterminate = count > 0 && count < state.rewriteProjects.length;
}

async function deleteSelectedRewriteProjects() {
  const ids = [...rewriteProjectSelection];
  if (!ids.length || rewriteProjectDeleting) return;
  if (state.busy) return toast("请等待当前任务结束后再删除项目。", true);
  if (!await studioConfirm(`确定删除选中的${ids.length}个改写项目及其A/B/C方案？此操作不可撤销。已生成的独立成稿和工作流项目会保留。`)) return;
  rewriteProjectDeleting = true;
  clearTimeout(rewriteProjectSaveTimer);
  renderRewriteProjectHistory();
  try {
    await postJson("/api/rewrite-projects/delete", { ids });
    ids.forEach(id => deletedRewriteProjects251.add(id));
    if (ids.includes(state.rewriteProjectId)) { state.rewriteProjectId = ""; state.archiveIdentity227 = null; }
    rewriteProjectSelection.clear();
    await loadRewriteProjects();
    toast("选中的改写项目已删除，独立成稿和工作流项目已保留。");
  } catch (error) { toast(error.message, true); }
  finally { rewriteProjectDeleting = false; renderRewriteProjectHistory(); }
}

async function deleteRewriteProject(projectId) {
  if (!projectId || rewriteProjectDeleting) return;
  if (state.busy) return toast("请等待当前任务结束后再删除项目。", true);
  const project = state.rewriteProjects.find(item => item.id === projectId);
  if (!project || !await studioConfirm(`确定删除改写项目《${project.projectName || "未命名改写项目"}》及其A/B/C方案吗？此操作不可撤销；已生成的独立成稿和工作流项目会保留。`)) return;
  rewriteProjectDeleting = true;
  clearTimeout(rewriteProjectSaveTimer);
  renderRewriteProjectHistory();
  try {
    await postJson("/api/rewrite-projects/delete", { ids: [projectId] });
    deletedRewriteProjects251.add(projectId);
    if (state.rewriteProjectId === projectId) { state.rewriteProjectId = ""; state.archiveIdentity227 = null; }
    rewriteProjectSelection.delete(projectId);
    await loadRewriteProjects();
    toast("改写项目已删除；独立成稿和工作流项目已保留。");
  } catch (error) { toast(error.message, true); }
  finally { rewriteProjectDeleting = false; renderRewriteProjectHistory(); }
}

async function loadRewriteProjects() {
  const epoch = ++rewriteProjectListEpoch251;
  try {
    const response = await fetch("/api/rewrite-projects", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取改写项目");
    if (epoch !== rewriteProjectListEpoch251) return;
    state.rewriteProjects = (data.projects || []).filter(item => !deletedRewriteProjects251.has(item.id));
    const existingIds = new Set(state.rewriteProjects.map(item => item.id));
    for (const id of rewriteProjectSelection) if (!existingIds.has(id)) rewriteProjectSelection.delete(id);
    renderRewriteProjectHistory();
  } catch (error) {
    if (epoch !== rewriteProjectListEpoch251) return;
    if ($("rewriteProjectHistoryList")) $("rewriteProjectHistoryList").textContent = error.message;
  }
}

async function renameRewriteProject(projectId) {
  if (rewriteProjectRenaming) return;
  const project = state.rewriteProjects.find(item => item.id === projectId);
  if (!project) return toast("找不到这个改写项目。", true);
  const proposed = await studioPrompt("请输入改写项目名称（最多100个字符）", project.projectName || "未命名改写项目");
  if (proposed === null) return;
  const name = proposed.trim();
  if (!name) return toast("项目名称不能为空。", true);
  if (name.length > 100) return toast("项目名称不能超过100个字符。", true);
  clearTimeout(rewriteProjectSaveTimer);
  rewriteProjectRenaming = true;
  renderRewriteProjectHistory();
  try {
    const data = await postJson("/api/rewrite-projects/rename", { id: projectId, projectName: name });
    if (data.project) rewriteProjectRevisions251.set(projectId, Number(data.project.revision || 0));
    if (state.rewriteProjectId === projectId && $("projectName")) $("projectName").value = name;
    state.rewriteProjects = data.projects || state.rewriteProjects.map(item => item.id === projectId ? { ...item, projectName: name } : item);
    renderRewriteProjectHistory();
    toast("改写项目名称已保存。");
  } catch (error) { toast(error.message, true); }
  finally { rewriteProjectRenaming = false; renderRewriteProjectHistory(); }
}

function captureRewriteProjectContext() {
  return JSON.parse(JSON.stringify({projectId:state.rewriteProjectId, projectName:$('projectName').value,
    outputProjectId227:rewriteArchiveIdentity227(),
    sourceText:$('sourceText').value, videoId:state.videoId, sourceAnalysis:state.sourceAnalysis,
    rewriteProposals:state.rewriteProposals, selectedProposalId:state.selectedProposalId,
    settings:settings(), sourceSignature:currentSourceSignature()}));
}

function rewriteArchiveIdentity227() {
  const projectId=state.rewriteProjectId||'';
  if(state.archiveIdentity227?.projectId===projectId&&state.archiveIdentity227.id)return state.archiveIdentity227.id;
  // Content signatures identify the source used by a call, not a separate
  // writing project. Keep one independent draft identity until it is saved.
  state.archiveIdentity227={projectId,id:projectId||('draft-'+newCreationSubmissionId())};
  return state.archiveIdentity227.id;
}

async function saveCurrentRewriteProject(recordId = "", context = null) {
  if (!recordId && (rewriteProjectDeleting || rewriteProjectRenaming)) return null;
  if ((!context && (state.workMode !== "rewrite" || !state.sourceScriptKey)) || Number(state.historyRetention) === 0) return null;
  const {sourceSignature, ...snapshot} = context || captureRewriteProjectContext();
  if (deletedRewriteProjects251.has(snapshot.projectId)) return null;
  if (recordId) return writeRewriteProject251({...snapshot,recordId,archiveOnly:true},sourceSignature);
  const key=snapshot.projectId || snapshot.outputProjectId227 || 'unassigned';
  let queue=rewriteSaveQueues251.get(key);
  if(!queue){queue={projectId:snapshot.projectId||'',pending:null,running:false};rewriteSaveQueues251.set(key,queue);}
  rewriteUnsavedDrafts251.set(key,snapshot);
  return new Promise((resolve,reject)=>{
    const waiters=[...(queue.pending?.waiters||[]),{resolve,reject}];
    queue.pending={snapshot,sourceSignature,waiters};
    if(!queue.running)drainRewriteSaves251(key,queue);
  });
}
async function drainRewriteSaves251(key,queue){
  queue.running=true;
  try{
    while(queue.pending){
      const job=queue.pending;queue.pending=null;
      const projectId=queue.projectId || job.snapshot.projectId;
      const payload={...job.snapshot,projectId,recordId:'',archiveOnly:false};
      if(rewriteProjectRevisions251.has(projectId))payload.expectedRevision=rewriteProjectRevisions251.get(projectId);
      try{
        const project=await writeRewriteProject251(payload,job.sourceSignature,job.snapshot.projectId);
        if(project){queue.projectId=project.id;if(rewriteUnsavedDrafts251.get(key)===job.snapshot)rewriteUnsavedDrafts251.delete(key);}
        job.waiters.forEach(waiter=>waiter.resolve(project));
      }catch(error){
        job.waiters.forEach(waiter=>waiter.reject(error));
        // A lost receipt or external revision change is not permission to
        // overwrite again. Keep the latest draft in memory and stop this queue.
        queue.pending?.waiters.forEach(waiter=>waiter.reject(error));queue.pending=null;break;
      }
    }
  }finally{if(rewriteSaveQueues251.get(key)===queue)rewriteSaveQueues251.delete(key);}
}
async function writeRewriteProject251(payload,sourceSignature,originalProjectId=payload.projectId){
  if(deletedRewriteProjects251.has(payload.projectId))return null;
  let data;
  try { data = await postJson("/api/rewrite-projects/save", payload); }
  catch (error) { if (error.code === 'PROJECT_DELETED') { deletedRewriteProjects251.add(payload.projectId); return null; } throw error; }
  if (deletedRewriteProjects251.has(payload.projectId)) return null;
  if(data.project&&!payload.archiveOnly)rewriteProjectRevisions251.set(data.project.id,Number(data.project.revision||0));
  // An autosave can finish after the reader has opened a different project.
  if (!payload.archiveOnly && state.workMode === "rewrite" && state.rewriteProjectId === originalProjectId && currentSourceSignature() === sourceSignature) {
    state.rewriteProjectId = data.project?.id || state.rewriteProjectId;
    state.archiveIdentity227={projectId:state.rewriteProjectId,id:data.project?.outputProjectId227||state.rewriteProjectId};
  }
  loadRewriteProjects();
  return data.project;
}

let rewriteProjectSaveTimer = null;
function queueRewriteProjectSave() {
  if (Number(state.historyRetention) === 0 || !state.sourceScriptKey) return;
  clearTimeout(rewriteProjectSaveTimer);
  rewriteProjectSaveTimer = setTimeout(() => saveCurrentRewriteProject().catch(error => toast(`改写项目暂未保存：${error.message}`, true)), 900);
}

function syncProductSettingsVisibility() {
  const toggle = $("productEnabled");
  if (!toggle) return;
  const enabled = Boolean(toggle.checked);
  $("productFields")?.classList.toggle("hidden", !enabled);
  document.querySelectorAll("[data-product-setting]").forEach(node => node.classList.toggle("hidden", !enabled));
  $("commerceOptions")?.classList.toggle("hidden", !enabled || (state.workMode === "original" && state.originalType !== "emotional_commerce"));
  if ($("commerceOptionsTitle")) $("commerceOptionsTitle").textContent = enabled ? "带货、合规与反转强度" : "剧情强度与合规";
  toggle.closest(".product-switch")?.setAttribute("aria-expanded", enabled ? "true" : "false");
  if (state.workMode === "original") state.originalProductEnabled = enabled;
  else state.rewriteProductEnabled = enabled;
}

function applyRewriteSettings(saved) {
  if (!saved || typeof saved !== "object") return;
  const ids = ["projectName", "episodeSeconds", "intensity", "storyStyle", "rewriteEra", "peopleMode", "peopleCount", "peopleNameMode", "sceneMode", "sceneCount", "sceneNameMode", "propMode", "propCount", "propNameMode", "productName", "productFacts", "productPrice", "promotionStyle", "pressureLevel", "reversalLevel", "reversalCount", "extraRequirements"];
  ids.forEach(id => { if ($(id) && saved[id] !== undefined && saved[id] !== null) $(id).value = String(saved[id]); });
  setTargetOption("platform", "customPlatform", saved.platform);
  setTargetOption("audience", "customAudience", saved.audience);
  setTargetOption("storyStyle", "customStoryStyle", saved.storyStyle);
  setTargetOption("rewriteEra", "customRewriteEra", saved.rewriteEra);
  if ($("sceneMode") && saved.sceneMode === "replace") $("sceneMode").value = "keep";
  [["productEnabled", "productEnabled"], ["priceEnabled", "priceEnabled"], ["ctaEnabled", "ctaEnabled"], ["strictCompliance", "strictCompliance"]].forEach(([id, key]) => { if ($(id) && saved[key] !== undefined) $(id).checked = Boolean(saved[key]); });
  $("productEnabled").checked = saved.productEnabled === true;
  if (saved.durationSeconds) $("durationMinutes").value = String(Math.round(Number(saved.durationSeconds) / 60 * 100) / 100);
  if (saved.assetCaps) {
    for (const [kind,prefix] of [["people","people"],["scenes","scene"],["props","prop"]]) {
      $(prefix + "Mode").value = saved.assetCaps[kind] === undefined ? "keep" : "custom";
      $(prefix + "Count").value = saved.assetCaps[kind] ?? "";
      updateCountInput(prefix + "Mode",prefix + "Count");
    }
  }
  if (saved.similarity !== undefined) { $("similarity").value = String(saved.similarity); $("similarityValue").textContent = `${saved.similarity}%`; }
  if (saved.productCoverage !== undefined) { $("productCoverage").value = String(saved.productCoverage); $("productCoverageValue").textContent = `${saved.productCoverage}%`; }
  if (Array.isArray(saved.productPlacement)) {
    const selected = new Set(saved.productPlacement.map(value => String(value).trim().toLowerCase()));
    document.querySelectorAll('input[name="productPlacement"]').forEach(input => { input.checked = selected.has(input.value); });
  }
  updateRewriteDurationControls();
  updateDuration();
  updateRewriteCustomFields();
  syncProductSettingsVisibility();
  updateDuration();
}

let creationNavigationEpoch = 0;
async function openRewriteProject(projectId, navigationEpoch = ++creationNavigationEpoch) {
  clearTimeout(rewriteProjectSaveTimer);
  const sourceAtRequest = currentSourceSignature();
  try {
    const response = await fetch(`/api/rewrite-projects/item?id=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法打开改写项目");
    if (navigationEpoch !== creationNavigationEpoch || currentSourceSignature() !== sourceAtRequest) return false;
    const project = data.project;
    rewriteProjectRevisions251.set(project.id, Number(project.revision || 0));
    setWorkMode("rewrite", false, true);
    restoreCreationConfig(state.creationConfigDefaults);
    invalidateDownstream();
    state.rewriteProjectId = project.id;
    state.archiveIdentity227={projectId:project.id,id:project.outputProjectId227||project.id};
    state.creationResults.rewrite = null;
    state.sourceAnalysis = null;
    state.sourceScriptKey = "";
    state.videoId = project.videoAvailable ? (project.videoId || "") : "";
    state.videoName = "";
    $("sourceText").value = project.sourceText || "";
    $("sourceMode").value = state.videoId && $("sourceText").value ? "both" : state.videoId ? "video" : "text";
    updateSourceCount();
    setSourceInputTab(project.sourceText ? "text" : state.videoId ? "video" : "text");
    applyRewriteSettings(project.settings || {});
    if ($("sourceText").value.trim()) {
      state.sourceScriptKey = currentSourceSignature();
      $("sourceScriptStatus").textContent = `已保存原剧本（${$("sourceText").value.replace(/\s/g, "").length.toLocaleString()}字）。可以直接生成三套提案，或跳过提案。`;
      refreshSourceProfile();
      $("proposalDecision").classList.remove("hidden");
      $("proposalEmpty").classList.add("hidden");
      $("generateProposalsBtn").classList.remove("hidden");
    } else invalidateSourceAnalysis();
    state.selectedProposalId = project.selectedProposalId || "";
    renderRewriteProposals(project.rewriteProposals || []);
    renderRewriteProjectVersions(project.versions || []);
    $("sourceAnalysisCard").scrollIntoView({ behavior: "smooth", block: "start" });
    if (project.videoId && !project.videoAvailable) toast("项目已打开，但原视频缓存已不在；可使用已保存的剧本文本继续改写。", true);
    else toast("改写项目已打开，可继续编辑A/B/C方案或开始另一案改写。");
    return true;
  } catch (error) { toast(error.message, true); }
}

function renderRewriteProjectVersions(versions) {
  const container = $("rewriteProjectVersions");
  if (!container) return;
  const items = Array.isArray(versions) ? versions : [];
  container.classList.toggle("hidden", !items.length);
  container.innerHTML = items.length ? `<h4>本项目已生成的成稿 <small>${items.length}个版本，不会覆盖；也可在成品记录中打开</small></h4>${items.map((item, index) => `<div><span>${index + 1}. ${escapeHtml(item.proposalId || "未标记")}案 · ${escapeHtml(formatHistoryTime(item.createdAt))}</span><button class="secondary-btn" type="button" data-open-rewrite-version="${encodeURIComponent(item.recordId || "")}" data-history-version="structure">打开成稿</button></div>`).join("")}` : "";
}

async function fetchRewriteProject(projectId) {
  const response = await fetch(`/api/rewrite-projects/item?id=${encodeURIComponent(projectId)}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "无法打开改写项目");
  return data.project;
}

function rewriteProjectExportText(project) {
  const lines = [
    `# ${project.projectName || "改写项目"}`,
    `创建时间：${project.createdAt || ""}`,
    `最后更新：${project.updatedAt || ""}`,
    "",
    "## 原剧本与改写资料",
  ];
  Object.entries(project.sourceAnalysis || {}).forEach(([key, value]) => lines.push(`${key}：${analysisText(value)}`));
  lines.push("", "## 原剧本 / 识别对白", project.sourceText || "未保存文字素材", "");
  (project.rewriteProposals || []).forEach(proposal => {
    lines.push(`## ${proposal.id || ""}案：${proposal.title || "未命名"} · ${proposal.score || 0}分`);
    Object.entries(proposal).filter(([key]) => key !== "id" && key !== "title").forEach(([key, value]) => lines.push(`${key}：${analysisText(value)}`));
    lines.push("");
  });
  lines.push("## 已生成版本", ...(project.versions || []).map(item => `${item.createdAt || ""} · ${item.proposalId || "未标记"}案 · ${item.recordId || ""}`));
  return lines.join("\n");
}

async function copyOrExportRewriteProject(projectId, download = false) {
  try {
    const project = await fetchRewriteProject(projectId);
    const content = rewriteProjectExportText(project);
    if (download) {
      const fileName = `${(project.projectName || "改写项目").replace(/[\\/:*?"<>|]/g, "_")}_ABC方案.txt`;
      const api = desktopApi();
      if (api?.save_text) {
        const result = await api.save_text(fileName, content, state.workMode);
        if (result?.canceled) return;
        if (!result?.ok) throw new Error(result?.error || "保存失败。");
        toast(`已保存到：${result.path}`);
        return;
      }
      const blob = new Blob(["\ufeff", content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("改写项目档案和A/B/C方案已导出为TXT。");
    } else {
      await navigator.clipboard.writeText(content);
      toast("改写项目档案和A/B/C方案已复制。");
    }
  } catch (error) { toast(error.message, true); }
}

async function loadHistory() {
  try {
    const response = await fetch("/api/history", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取本地历史");
    state.historyRecords = data.records || [];
    state.historySelection.clear();
    state.historyRetention = Number(data.retentionDays ?? -1);
    $("historyRetention").value = String(state.historyRetention);
    updateHistoryPolicyHint();
    $("historySummary").title = data.storagePath || "";
    renderHistory();
    if ($("visualHistorySelect")) {
      $("visualHistorySelect").innerHTML = '<option value="">选择历史记录…</option>' + state.historyRecords.map(record => `<option value="${encodeURIComponent(record.id)}">${escapeHtml(record.projectName || "未命名项目")} · ${escapeHtml(formatHistoryTime(record.createdAt))}</option>`).join("");
    }
  } catch (error) {
    $("historySummary").textContent = "暂无记录或本地服务未连接";
  }
}

async function deleteHistoryRecords(recordIds, description) {
  if (state.busy) return toast("当前任务正在运行，请完成后再删除历史记录。", true);
  const ids = [...new Set(recordIds)].filter(Boolean);
  if (!ids.length) return toast("请先选择需要删除的记录。", true);
  if (!await studioConfirm(`确定删除${description}吗？对应的分镜版、简版和任务记录都会一起删除，此操作无法撤销。`)) return;
  try {
    const data = await postJson("/api/history/delete", { ids });
    state.historyRecords = data.records || [];
    ids.forEach(id => state.historySelection.delete(id));
    renderHistory();
    await refreshCacheUsage();
    const failed = data.failedFiles ? `，${data.failedFiles}个文件删除失败` : "";
    toast(`已删除 ${data.deletedRecords || 0} 条历史记录${failed}。`, Boolean(data.failedFiles));
  } catch (error) {
    toast(error.message, true);
  }
}

function deleteSelectedHistory() {
  const count = state.historySelection.size;
  return deleteHistoryRecords([...state.historySelection], `选中的 ${count} 条历史记录`);
}

async function deleteAllHistory() {
  if (state.busy) return toast("当前任务正在运行，请完成后再删除历史记录。", true);
  if (!state.historyRecords.length) return toast("当前没有可删除的历史记录。");
  if (!await studioConfirm("确定删除全部本地历史记录吗？对应的分镜版、简版和任务记录都会一起删除，此操作无法撤销。")) return;
  try {
    const data = await postJson("/api/history/delete", { all: true });
    state.historyRecords = data.records || [];
    state.historySelection.clear();
    renderHistory();
    await refreshCacheUsage();
    const failed = data.failedFiles ? `，${data.failedFiles}个文件删除失败` : "";
    toast(`已删除全部历史，共 ${data.deletedRecords || 0} 条${failed}。`, Boolean(data.failedFiles));
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveHistoryPolicy() {
  if (state.busy) return toast("当前任务正在运行，请完成后再修改。", true);
  const days = Number($("historyRetention").value);
  if (days === state.historyRetention) return toast("当前已经是这个保留设置。");
  let message = "";
  if (days === 0) {
    message = "选择“不保存”会立即删除现有本地剧本历史。以后的生成结果只在当次运行期间保留，确定继续吗？";
  } else if (days > 0 && (state.historyRetention === -1 || days < state.historyRetention)) {
    message = `保存后，超过${days}天的本地剧本记录会立即删除，确定继续吗？`;
  }
  if (message && !await studioConfirm(message)) {
    $("historyRetention").value = String(state.historyRetention);
    return;
  }
  try {
    const data = await postJson("/api/history/policy", { retentionDays: days });
    state.historyRetention = Number(data.retentionDays);
    state.historyRecords = data.records || [];
    $("historyRetention").value = String(state.historyRetention);
    updateHistoryPolicyHint();
    renderHistory();
    await refreshCacheUsage();
    const removed = data.deletedFiles ? `，已自动清理 ${data.deletedFiles} 个过期文件` : "";
    toast(`已设为${historyRetentionLabel(days)}${removed}。`);
  } catch (error) {
    $("historyRetention").value = String(state.historyRetention);
    toast(error.message, true);
  }
}

async function openHistory(recordId, version = "structure") {
  const navigationEpoch = ++creationNavigationEpoch;
  const sourceAtRequest = currentSourceSignature();
  try {
    const response = await fetch(`/api/history/item?id=${encodeURIComponent(decodeURIComponent(recordId))}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法打开本地历史");
    if (navigationEpoch !== creationNavigationEpoch || currentSourceSignature() !== sourceAtRequest) return;
    if (data.record?.rewriteProjectId) {
      try { await openRewriteProject(data.record.rewriteProjectId, navigationEpoch); } catch (_) { /* 旧成稿仍可独立查看 */ }
    }
    if (navigationEpoch !== creationNavigationEpoch) return;
    renderResult(data.record, true);
    showResult("structure");
    $("generateCard").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { toast(error.message, true); }
}

async function renameHistory(recordId) {
  const record = state.historyRecords.find(item => item.id === decodeURIComponent(recordId));
  if (!record) return;
  const name = await studioPrompt("请输入剧本名称", record.projectName || "未命名短剧");
  if (!name?.trim()) return;
  try {
    const data = await postJson("/api/history/rename", {recordId: decodeURIComponent(recordId), projectName: name.trim()});
    state.historyRecords = data.records || state.historyRecords; renderHistory();
    toast("剧本名称已保存；工作流历史列表会同步显示新名称。 ");
  } catch (error) { toast(error.message, true); }
}

async function sendHistoryToWorkflow(recordId) {
  try {
    const response = await fetch(`/api/history/item?id=${encodeURIComponent(decodeURIComponent(recordId))}`, {cache:"no-store"});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "无法读取剧本记录");
    const record = data.record || {};
    // 先把用户刚选中的历史成稿设为当前结果，避免 setWorkMode("workflow")
    // 又用页面里上一份结果覆盖 localStorage，导致工作流引用旧剧本。
    state.result = record;
    if ($("projectName") && record.projectName) $("projectName").value = record.projectName;
    localStorage.setItem("dramaVisualSource", JSON.stringify({structure:record.structure || "", projectName:record.projectName || "未命名短剧", sourceType:"internal", recordId:record.id, savedAt:new Date().toISOString()}));
    $("workflowFrame").src = `/static/visual.html?embedded=1&autoCreate=1&source=${Date.now()}`;
    setWorkMode("workflow");
    toast(`《${record.projectName || "未命名短剧"}》已引用到工作流，请先识别剧中资产，再单独补齐分镜。`);
  } catch (error) { toast(error.message, true); }
}

function renderLicenseNotice(runtime) {
  if (!runtime || runtime.phase === "active" || runtime.phase === "activation") return;
  if (runtime.phase === "finishing_task") {
    if (state.licenseNotice !== "finishing_task") {
      state.licenseNotice = "finishing_task";
      toast("卡密已到期，当前任务完成后软件将自动退出。", true);
    }
    return;
  }
  if (runtime.phase === "exit_countdown") {
    if (state.licenseNotice !== "exit_countdown") {
      state.licenseNotice = "exit_countdown";
      toast(`卡密已到期，软件将在约${runtime.remainingSeconds}秒后退出。`, true);
    }
    return;
  }
  if (runtime.exitRequired) {
    document.body.innerHTML = '<main class="closed-screen"><div class="brand-mark"><img src="/static/nanbuduo-ai-icon.png" alt=""></div><h1>授权已到期，软件已退出</h1><p>请联系销售方续期后重新激活。</p></main>';
    postJson("/api/shutdown", {}).catch(() => {});
  }
}

async function pollRuntimeLicense() {
  try {
    const response = await fetch("/api/runtime/status", { cache: "no-store" });
    const data = await response.json();
    renderLicenseNotice(data);
  } catch (_) { /* local server shutdown is handled by the desktop shell */ }
}

function pendingOnlineUpdateNotice292(config) {
  const notice = typeof config?.onlineUpdateNotice === "string" ? config.onlineUpdateNotice.trim() : "";
  if (!notice || state.onlineUpdateNoticeShown292) return "";
  try { if (sessionStorage.getItem("ntv-online-update-notice292") === "1") return ""; } catch (_) { /* Page-local fallback. */ }
  return notice;
}

function renderClientConfig(config) {
  state.clientConfig = config || {};
  renderTextModelSelector(config || {});
  const notes = String(config?.updateNotes || "").trim();
  const announcements = Array.isArray(config?.announcements) && config.announcements.length
    ? config.announcements
    : [{ slot: 1, title: "公告1", text: config?.announcement || "", mediaUrl: config?.announcementMediaUrl || "", mediaType: config?.announcementMediaType || "" }];
  const hasUpdate = Boolean(config?.updateAvailable && config?.downloadUrl && config?.sha256);
  const onlineNotice = pendingOnlineUpdateNotice292(config);
  const panel = $("clientNotice");
  const hasPublishedContent = Boolean(onlineNotice || hasUpdate || announcements.some(item => String(item?.text || "").trim() || String(item?.mediaUrl || "").trim()));
  const announcementSignature = announcements.map(item => `${item?.title || ""}:${item?.text || ""}:${item?.mediaUrl || ""}`).join("|");
  const dismissedKey = `drama-client-notice-${config?.latestVersion || "announcement"}-${announcementSignature.slice(0, 300)}`;
  const announceButton = $("openClientNotice");
  announceButton?.classList.toggle("hidden", !hasPublishedContent);
  if (!hasPublishedContent || (!onlineNotice && !config?.mandatory && (sessionStorage.getItem(dismissedKey) === "1" || localStorage.getItem(dismissedKey) === "1"))) {
    panel.classList.add("hidden");
    $("clientNoticeBackdrop")?.classList.add("hidden");
    return;
  }
  panel.dataset.dismissedKey = dismissedKey;
  panel.classList.remove("hidden");
  $("clientNoticeBackdrop")?.classList.remove("hidden");
  $("clientNoticeRemember").checked = false;
  panel.classList.toggle("mandatory", Boolean(config?.mandatory && hasUpdate));
  $("clientNoticeTitle").textContent = hasUpdate ? "公告 / 广告位 · 发现可用的新版本" : "公告 / 广告位";
  const list = $("clientAnnouncementList");
  list.replaceChildren();
  announcements.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "client-announcement-card";
    const title = document.createElement("b");
    title.textContent = String(item?.title || `公告${index + 1}`);
    const copy = document.createElement("p");
    copy.textContent = String(item?.text || "").trim() || "暂无内容";
    card.append(title, copy);
    const mediaUrl = String(item?.mediaUrl || "").trim();
    if (mediaUrl) {
      const media = document.createElement(String(item?.mediaType || "").startsWith("video/") ? "video" : "img");
      media.src = mediaUrl;
      if (media.tagName === "VIDEO") {
        media.controls = true;
        media.muted = true;
        media.preload = "metadata";
        media.setAttribute("playsinline", "");
      } else {
        media.alt = `${title.textContent}图片`;
      }
      card.append(media);
    }
    list.append(card);
  });
  if (onlineNotice) {
    const card = document.createElement("article");
    card.id = "onlineUpdateNotice292";
    card.className = "client-announcement-card";
    const title = document.createElement("b");
    title.textContent = "在线更新说明";
    const copy = document.createElement("p");
    copy.textContent = onlineNotice;
    card.append(title, copy);
    list.append(card);
    state.onlineUpdateNoticeShown292 = true;
    try { sessionStorage.setItem("ntv-online-update-notice292", "1"); } catch (_) { /* Keep the in-page guard. */ }
  }
  $("clientVersionBadge").classList.toggle("hidden", !hasUpdate);
  $("clientVersionBadge").textContent = hasUpdate ? `当前 ${config.currentVersion} → 新版 ${config.latestVersion}` : "";
  $("clientUpdateNotes").classList.toggle("hidden", !notes);
  $("clientUpdateNotes").textContent = notes;
  $("clientUpdateBtn").classList.toggle("hidden", !hasUpdate);
  if (!state.clientUpdateBusy && !state.clientUpdateApplying) {
    $("clientUpdateBtn").textContent = clientUpdateActionLabel292(config);
  }
  $("dismissClientNotice").classList.toggle("hidden", !hasPublishedContent || Boolean(config?.mandatory && hasUpdate));
  $("clientNoticeRememberWrap").classList.toggle("hidden", Boolean(config?.mandatory && hasUpdate));
}

const textCatalogSignature = config => JSON.stringify([(config?.visualModels || []).filter(row => row?.media === 'text'),
  config?.textModelPricing, config?.textButtonBindings]);
async function loadClientConfig({modelsOnly=false}={}) {
  try {
    const response = await fetch("/api/client/config?refresh=1", { cache: "no-store" });
    const config = await response.json();
    if (!response.ok || config.configError) return;
    if (!modelsOnly) renderClientConfig(config);
    else if (textCatalogSignature(state.clientConfig) !== textCatalogSignature(config)) {
      state.clientConfig = {...state.clientConfig, visualModels:config.visualModels,
        textModelPricing:config.textModelPricing, textButtonBindings:config.textButtonBindings};
      renderTextModelSelector(config);
    }
  } catch (_) { /* 公告服务离线时不影响本地创作 */ }
}

async function pollClientUpdate(taskId) {
  $("clientUpdateProgress").classList.remove("hidden");
  while (true) {
    const response = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
    const task = await response.json();
    if (!response.ok) throw new Error(task.error || "暂时无法读取下载进度；再次点击可继续当前下载。");
    const value = Math.max(0, Math.min(100, Number(task.progress || 0)));
    $("clientUpdateMessage").textContent = task.message || "正在准备新版本…";
    $("clientUpdatePercent").textContent = `${value}%`;
    $("clientUpdateBar").style.width = `${value}%`;
    if (task.state === "done") return task.result || {};
    if (task.state === "error") throw new Error(task.error || "新版下载失败，请稍后重试。");
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

function clientUpdateActionLabel292(config = state.clientConfig) {
  if (state.clientUpdateFile) return state.clientUpdateCanApplyOnline === true ? "安装更新并重启" : "打开安装包位置";
  return config?.mandatory ? "下载更新包" : "下载新版本";
}

async function handleClientUpdate() {
  if (state.clientUpdateBusy || state.clientUpdateApplying) return;
  state.clientUpdateBusy = true;
  const button = $("clientUpdateBtn");
  button.disabled = true;
  try {
    if (state.clientUpdateFile) {
      if (state.clientUpdateCanApplyOnline === true) {
        if (!await studioConfirm("请确认当前编辑已保存。应用更新后软件将重启。")) return;
        button.textContent = "正在启动更新…";
        const result = await postJson("/api/update/apply-online", { fileName: state.clientUpdateFile });
        if (result.ok !== true) throw new Error(result.error || result.message || "未能启动更新，请稍后重试。");
        state.clientUpdateApplying = true;
        button.textContent = "正在安装并重启…";
        $("clientUpdateProgress").classList.remove("hidden");
        $("clientUpdateMessage").textContent = result.message || "更新已启动，安装完成后软件会自动重新打开。";
        toast($("clientUpdateMessage").textContent);
      } else {
        if (!await studioConfirm("更新包已通过完整性校验。现在打开安装包所在文件夹吗？请手动检查并双击安装包。")) return;
        button.textContent = "正在打开安装包位置…";
        const result = await postJson("/api/update/reveal", { fileName: state.clientUpdateFile });
        $("clientUpdateProgress").classList.remove("hidden");
        $("clientUpdateMessage").textContent = result.message || "已打开安装包位置，请手动完成安装。";
        $("clientUpdatePercent").textContent = "100%";
        $("clientUpdateBar").style.width = "100%";
      }
      return;
    }
    button.textContent = "正在下载…";
    const started = await postJson("/api/update/download", {});
    const result = await pollClientUpdate(started.taskId);
    if (typeof result.fileName !== "string" || !result.fileName.trim()) {
      throw new Error("没有收到已校验的安装包记录，请继续下载或重试。");
    }
    state.clientUpdateFile = result.fileName;
    state.clientUpdateCanApplyOnline = result.canApplyOnline === true;
    const ready = state.clientUpdateCanApplyOnline
      ? "新版已下载并通过完整性校验。点击“安装更新并重启”即可安装，软件将自动重新打开。"
      : "新版已下载并通过完整性校验。此安装包需手动安装，请点击“打开安装包位置”。";
    $("clientUpdateMessage").textContent = ready;
    toast(ready);
  } catch (error) {
    button.textContent = state.clientUpdateFile ? clientUpdateActionLabel292() : "继续下载 / 重试";
    $("clientUpdateProgress").classList.remove("hidden");
    $("clientUpdateMessage").textContent = error.message;
    toast(error.message, true);
  } finally {
    state.clientUpdateBusy = false;
    button.disabled = Boolean(state.clientUpdateApplying);
    if (state.clientUpdateFile && !state.clientUpdateApplying) button.textContent = clientUpdateActionLabel292();
  }
}

async function analyzeMediaLink() {
  const rawLink = $("mediaLink").value.trim();
  if (!rawLink) return toast("请先粘贴分享文案或视频链接。", true);
  if (!$("rightsConfirmed").checked) return toast("请先确认你拥有版权或已获得授权。", true);
  $("analyzeLink").disabled = true;
  state.watchRecognition = null;
  state.linkMedia = null;
  $("linkPreview").pause();
  $("linkPreview").removeAttribute("src");
  $("linkPreview").removeAttribute("poster");
  $("linkPreview").load();
  $("linkPreview").classList.add("hidden");
  $("playerPlaceholder").classList.remove("hidden");
  $("linkPreviewBox").classList.add("hidden");
  $("saveLinkedVideo").disabled = true;
  $("importLinkedVideo").disabled = true;
  for (const button of [$("saveLinkedVideo"), $("importLinkedVideo")]) {
    button.dataset.url = "";
    button.dataset.mediaToken = "";
  }
  setWatchCapability("waiting", "正在分析链接", "正在判断链接类型和是否支持导入。", false);
  $("linkStatus").textContent = "正在分析链接…";
  try {
    const data = await postJson("/api/link/analyze", { url: rawLink, rightsConfirmed: true });
    const usableUrl = data.resolvedUrl || data.normalizedUrl || "";
    if (data.normalizedUrl) $("mediaLink").value = data.normalizedUrl;
    state.linkMedia = { ...data, usableUrl };
    $("linkStatus").textContent = data.message || `${data.platformName || "链接"}分析完成。`;
    $("linkPreviewBox").classList.toggle("hidden", !data.previewUrl);
    $("saveLinkedVideo").disabled = !data.downloadable;
    $("importLinkedVideo").disabled = !data.downloadable;
    $("saveLinkedVideo").dataset.url = data.downloadable ? usableUrl : "";
    $("importLinkedVideo").dataset.url = data.downloadable ? usableUrl : "";
    $("saveLinkedVideo").dataset.mediaToken = data.mediaToken || "";
    $("importLinkedVideo").dataset.mediaToken = data.mediaToken || "";
    const durationText = data.durationSeconds ? ` · ${watchClock(Math.round(data.durationSeconds))}` : "";
    $("linkMeta").textContent = data.playable ? `真实视频流已就绪${durationText}` : "当前链接无法播放";
    if (data.previewUrl) {
      $("linkPreview").src = data.previewUrl;
      $("linkPreview").poster = data.coverUrl || "";
      $("linkPreview").classList.remove("hidden");
      $("playerPlaceholder").classList.add("hidden");
      $("embeddedPlatform").textContent = `${data.platformName || "授权视频"} · 已解析`;
      $("linkPreview").load();
    }
  } catch (error) {
    $("linkStatus").textContent = error.message;
    $("linkPreviewBox").classList.add("hidden");
    $("saveLinkedVideo").disabled = true;
    $("importLinkedVideo").disabled = true;
    $("linkPreview").classList.add("hidden");
    $("playerPlaceholder").classList.remove("hidden");
    $("embeddedPlatform").textContent = "解析失败";
    setWatchCapability("error", "该链接暂不支持", error.message, false);
    toast(error.message, true);
  } finally { $("analyzeLink").disabled = false; }
}

function watchClock(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function setWatchCapability(kind, title, message, enabled = false) {
  const box = $("watchCapability");
  if (!box) return;
  box.className = `watch-capability ${kind}`;
  $("watchCapabilityIcon").textContent = ["ready", "success"].includes(kind) ? "✓" : kind === "error" ? "!" : kind === "working" ? "…" : "○";
  $("watchCapabilityTitle").textContent = title;
  $("watchStatus").textContent = message;
  $("oneClickWatchImport").disabled = !enabled;
}

function setWatchUi(recording) {
  state.watchRecording = recording;
  if ($("openWatchBrowser")) $("openWatchBrowser").disabled = recording || state.watchFinishing;
  if ($("oneClickWatchImport")) $("oneClickWatchImport").disabled = state.watchFinishing || !$("openWatchBrowser")?.dataset.opened || Boolean(state.watchRecognition);
  $("generateBtn").disabled = recording || state.watchFinishing || state.busy;
  $("clearCache").disabled = recording || state.watchFinishing;
}

async function openWatchBrowser() {
  const url = $("openWatchBrowser").dataset.url || $("mediaLink").value.trim();
  if (!url) return toast("请先分析分享链接。", true);
  if (!$("rightsConfirmed").checked) return toast("请先确认你拥有版权或已获得授权。", true);
  $("openWatchBrowser").disabled = true;
  $("watchStatus").textContent = "正在加载到右侧内置播放器…";
  try {
    if (state.linkMedia?.previewUrl) {
      $("watchVideo").src = state.linkMedia.previewUrl;
      $("watchVideo").poster = state.linkMedia.coverUrl || "";
      $("watchVideo").classList.remove("hidden");
      $("watchFrame").classList.add("hidden");
      $("embeddedPlatform").textContent = `${state.linkMedia.platformName || "授权视频"} · 真实视频流`;
      $("watchVideo").load();
    } else {
      const data = await postJson("/api/watch/open", { url, rightsConfirmed: true });
      $("watchFrame").src = data.url;
      $("watchFrame").classList.remove("hidden");
      $("watchVideo").classList.add("hidden");
      $("embeddedPlatform").textContent = data.platformName || "已加载视频页面";
    }
    $("playerPlaceholder").classList.add("hidden");
    $("openWatchBrowser").dataset.opened = "1";
    $("oneClickWatchImport").dataset.mode = state.linkMedia?.mediaToken ? "direct" : "watch";
    $("oneClickWatchImport").textContent = "一键改写导入";
    setWatchCapability("ready", "目前支持一键改写", state.linkMedia?.mediaToken
      ? "右侧视频已可真实播放。点击后将检查30分钟限制并导入顶部视频。"
      : "已加载播放页面。请暂停到视频开头，点击后立即播放，结束后会自动识别。", true);
  } catch (error) {
    setWatchCapability("error", "加载失败", error.message, false);
    setWatchUi(false);
    toast(error.message, true);
  } finally {
    if (!state.watchRecording) $("openWatchBrowser").disabled = false;
  }
}

async function startWatchCapture() {
  if (state.busy || state.watchRecording) return toast("当前已有任务运行。", true);
  if (!state.asrReady) return toast("请先下载语音识别组件，再使用在线播放识别。", true);
  const playerNode = $("watchVideo").classList.contains("hidden") ? $("watchFrame") : $("watchVideo");
  const playerRect = playerNode.getBoundingClientRect();
  const borderX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const titleOffset = Math.max(0, window.outerHeight - window.innerHeight - borderX);
  const captureRect = {
    left: window.screenX + borderX + playerRect.left,
    top: window.screenY + titleOffset + playerRect.top,
    width: playerRect.width,
    height: playerRect.height
  };
  try {
    state.watchRecognition = null;
    const data = await postJson("/api/watch/start", {
      rightsConfirmed: true,
      captureRect
    });
    setWatchCapability("working", "正在自动识别", `已开始读取右侧播放内容 · ${watchClock(data.elapsedSeconds)}。现在请播放视频，播放结束后会自动导入。`, false);
    setWatchUi(true);
    $("oneClickWatchImport").disabled = false;
    $("oneClickWatchImport").dataset.action = "finish";
    $("oneClickWatchImport").textContent = "视频播完，完成导入";
    clearInterval(state.watchPoll);
    state.watchPoll = setInterval(pollWatchCapture, 1000);
  } catch (error) {
    setWatchCapability("error", "无法开始识别", error.message, true);
    setWatchUi(false);
    toast(error.message, true);
  }
}

async function pollWatchCapture() {
  try {
    const response = await fetch("/api/watch/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取采集状态");
    $("watchStatus").textContent = `正在自动识别 · ${watchClock(data.elapsedSeconds)} / 30:00 · 已采集 ${data.frameCount || 0} 个画面。会尝试自动结束，也可在视频播完时点击“完成导入”。`;
    if (data.error) {
      clearInterval(state.watchPoll);
      setWatchCapability("error", "识别失败", data.error, true);
      setWatchUi(false);
      toast(data.error, true);
    } else if (data.autoStopped && !data.recording && !state.watchFinishing) {
      clearInterval(state.watchPoll);
      finishWatchCapture(data.stopReason || "auto");
    }
  } catch (_) { /* 下一次轮询继续 */ }
}

async function finishWatchCapture(stopReason = "auto") {
  if (state.watchFinishing) return;
  state.watchFinishing = true;
  clearInterval(state.watchPoll);
  setWatchCapability("working", "正在整理识别素材", stopReason === "limit" ? "已达到30分钟上限，正在终止处理…" : "检测到视频播放结束，正在整理对白和画面…", false);
  try {
    const data = await postJson("/api/watch/stop", {});
    state.videoId = data.videoId;
    invalidateSourceAnalysis("已导入新的分享链接视频。");
    state.videoName = data.name;
    syncSourceMode();
    setSourceInputTab("link");
    $("videoMeta").classList.remove("hidden");
    $("videoMeta").textContent = `已导入链接视频：在线播放素材 · ${watchClock(data.durationSeconds)} · ${data.frameCount || 0} 个画面 · ${fmtSize(data.size)}`;
    $("transcribeBtn").disabled = false;
    await refreshCacheUsage();
    setWatchCapability("working", "视频已导入，正在识别", `${data.message}${data.warning ? ` ${data.warning}` : ""} 正在识别对白…`, false);
    const recognition = await transcribe();
    if (!recognition) {
      setWatchCapability("error", "视频已导入，但识别未完成", "你可以回到顶部重新点击“识别视频对白”。", false);
      return;
    }
    state.watchRecognition = recognition;
    const segments = recognition.meta?.segment_count || 0;
    const seconds = Math.round(recognition.meta?.duration || data.durationSeconds || 0);
    setWatchCapability("success", "视频识别成功，已导入顶部视频", `对白 ${segments} 段、约 ${seconds} 秒，画面 ${data.frameCount || 0} 张。现在设置参数，再点击“开始改写”。`, false);
    if ($("oneClickWatchImport")) $("oneClickWatchImport").textContent = "已导入顶部视频";
    $("oneClickWatchImport").dataset.action = "done";
    $("sourceCard").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setWatchCapability("error", error.message.includes("超出30分钟") ? "超出范围，无法处理" : "识别没有完成", error.message, true);
    setWatchUi(false);
    toast(error.message, true);
  } finally {
    state.watchFinishing = false;
    setWatchUi(false);
  }
}

async function importLinkedVideoAndRewrite() {
  const url = $("importLinkedVideo").dataset.url;
  const mediaToken = $("importLinkedVideo").dataset.mediaToken;
  if (!url && !mediaToken) return toast("当前链接无法直接读取视频，请使用平台官方导出。", true);
  if (state.busy) return toast("当前已有任务运行，请完成后再导入。", true);
  $("importLinkedVideo").disabled = true;
  $("saveLinkedVideo").disabled = true;
  $("linkStatus").textContent = "正在导入链接视频，请不要关闭软件…";
  setWatchCapability("working", "正在检查并导入视频", "正在读取视频时长；超过30分钟将直接停止且不识别。", false);
  try {
    const data = await postJson("/api/link/import", { url, mediaToken, rightsConfirmed: true });
    state.videoId = data.videoId;
    invalidateSourceAnalysis("已导入新的分享链接视频。");
    state.videoName = data.name;
    syncSourceMode();
    $("videoMeta").classList.remove("hidden");
    const durationText = data.durationSeconds ? ` · ${watchClock(Math.round(data.durationSeconds))}` : "";
    $("videoMeta").textContent = `链接视频已导入：${data.name}${durationText} · ${fmtSize(data.size)}`;
    $("linkStatus").textContent = "视频已导入顶部，正在自动识别对白…";
    await checkSpeechStatus(false);
    await refreshCacheUsage();
    if (!state.asrReady) {
      setWatchCapability("error", "视频已导入，但暂时无法识别", "请先在顶部下载语音识别组件，再点击“识别视频对白”。", false);
      $("sourceCard").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("视频已导入，请先下载语音识别组件。", true);
      return;
    }
    const recognition = await transcribe();
    if (!recognition) return;
    state.watchRecognition = recognition;
    const segments = recognition.meta?.segment_count || 0;
    const seconds = Math.round(recognition.meta?.duration || data.durationSeconds || 0);
    setWatchCapability("success", "视频识别成功，已导入顶部视频", `对白 ${segments} 段、约 ${seconds} 秒。现在设置参数，再点击“开始改写”。`, false);
    if ($("oneClickWatchImport")) $("oneClickWatchImport").textContent = "已导入顶部视频";
    $("sourceCard").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("linkStatus").textContent = error.message;
    setWatchCapability("error", error.message.includes("超出30分钟") ? "超出范围，无法处理" : "导入没有完成", error.message, true);
    toast(error.message, true);
  } finally {
    $("importLinkedVideo").disabled = false;
    $("saveLinkedVideo").disabled = false;
  }
}

async function saveLinkedVideo() {
  const url = $("saveLinkedVideo").dataset.url;
  const mediaToken = $("saveLinkedVideo").dataset.mediaToken;
  if (!url && !mediaToken) return toast("当前链接不是可直接保存的授权媒体直链。", true);
  $("saveLinkedVideo").disabled = true;
  $("linkStatus").textContent = "正在保存到安装目录…";
  try {
    const data = await postJson("/api/link/download", { url, mediaToken, rightsConfirmed: true });
    $("linkStatus").textContent = `保存完成：${data.fileName}`;
    refreshCacheUsage();
    toast("视频已保存到安装目录的 data/outputs 文件夹。");
  } catch (error) { toast(error.message, true); }
  finally { $("saveLinkedVideo").disabled = false; }
}

async function postJson(url, payload) {
  let acceptedMediaView236=null;
  const recoveringImage236=ModelPresentation.pendingImageRecovery(state.visualProject,url,payload);
  if(recoveringImage236)payload={projectId:payload.projectId||state.visualProject.id,...(url.endsWith('/frame')?{episodeId:payload.episodeId}:{}),resumeOnly:true};
  const mediaActions236={'/api/visual/asset/generate':'asset','/api/visual/cover/generate':'cover','/api/visual/episode/frame':'frame','/api/visual/episode/video':'video'};
  if(mediaActions236[url]&&!payload.resumeOnly){
    const media=mediaActions236[url]==='video'?'video':'image',tier=payload.tier||'economy',model=payload[media+'Model']||state.visualProfile?.[media+'Model'+ModelPresentation.suffix(tier)]||'';
    if(ModelPresentation.isLiveQuote(state.visualProfile||{},media,model)||(media==='video'&&payload.tailFrameContinuation===true&&ModelPresentation.videoPriceRange172(state.visualProfile||{},model,payload.resolution))){
      const view236=()=>JSON.stringify([state.visualProject?.id,[...document.querySelectorAll('#visualCard input,#visualCard select,#visualCard textarea')].map(node=>[node.id,node.value,node.checked])]),before236=view236();
      const plan=await postJson('/api/visual/live-quote',{action:mediaActions236[url],...payload,[media+'Model']:model});
      ModelPresentation.quoteReceiptFields(plan.quote);await CreditGate.ensure(Number(plan.quote.estimatedPoints));
      if(before236!==view236())throw Error('核价期间输入、模型或引用已改变，请重新核价。');
      if(!await studioConfirm(ModelPresentation.quoteText(plan.quote)+'\n\n确认按本次报价生成？'))throw Error('已取消生成，未提交模型。');
      if(before236!==view236())throw Error('确认期间输入、模型或引用已改变；未提交生成。');
      acceptedMediaView236=()=>before236===view236();
      payload={...payload,[media+'Model']:model,billingConfirmed:true,...ModelPresentation.quoteReceiptFields(plan.quote)};
    }else{
      const points=payload.expectedCredits??payload.expectedPoints??mainRequestCreditCost(url,payload);
      const published172=media==='video'?ModelPresentation.quote(state.visualProfile||{},model,payload.resolution||$('visualResolution').value,Number(payload.duration||$('visualVideoDuration').value),tier,payload.ratio||$('visualRatio').value):null;
      payload={...payload,[media+'Model']:model,...(media==='image'?{imageResolution:payload.imageResolution||state.visualProfile?.imageResolution||'2k'}:{}),...ModelPresentation.quoteReceiptFields({...published172,estimatedPoints:points}),billingConfirmed:true};
    }
  }
  try {
    const cost = mediaActions236[url]&&!payload.resumeOnly&&payload.expectedCredits!==undefined?payload.expectedCredits:mainRequestCreditCost(url, payload);
    if (cost !== undefined && cost !== CreditGate.QUOTE) await CreditGate.ensure(cost);
    if(acceptedMediaView236&&!acceptedMediaView236())throw Error('提交前输入、模型或引用已改变，请重新核价并确认；未提交生成。');
  } catch (error) {
    if (payload.auxReceiptId) error.auxNotSubmitted220 = true;
    throw error;
  }
  const activityId = ({"/api/source/analyze":"sourceAnalysisProgress","/api/source/refine":"sourceAnalysisProgress","/api/source/proposals":"proposalProgress","/api/source/proposal-refine":"proposalProgress","/api/original/recommend":"recommendProgress","/api/original/field-optimize":"recommendProgress","/api/rewrite/generate":"taskProgress","/api/original/generate":"taskProgress","/api/rewrite/resume":"taskProgress","/api/quality/optimize":"taskProgress","/api/quality/repair-episode":"taskProgress","/api/marketing/analyze":"marketingStatus","/api/marketing/generate":"marketingStatus","/api/visual/plan":"visualSourceStatus"})[url];
  const activity = activityId ? $(activityId) : null;
  if(activity) { activity.classList.remove("hidden"); activity.classList.add("model-activity-container"); window.ModelActivity?.set(activity,{state:"pending",preserve:true}); }
  let responseStatus = 0;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    responseStatus = response.status;
    const data = await response.json();
    if (!response.ok) {const error=new Error(ModelPresentation.quoteFailureMessage(data.code||data.errorCode,data.error || `请求失败 ${response.status}`));error.code=data.code||data.errorCode;error.httpStatus=response.status;error.status=response.status;throw error;}
    if(activity&&!data.taskId) window.ModelActivity?.set(activity,{state:"success",preserve:true});
    return data;
  } catch(error) {
    if (payload.auxReceiptId) error.auxHttpStatus220 = responseStatus;
    if (payload.submissionId && (!responseStatus || responseStatus >= 500 || responseStatus < 400)) error.submissionUncertain = true;
    if(activity) window.ModelActivity?.set(activity,{state:"error",preserve:true}); throw error;
  }
}

const writingAuxUrls220 = new Set(['/api/original/recommend','/api/original/field-optimize',
  '/api/source/analyze','/api/source/proposals','/api/source/refine','/api/source/proposal-refine']);

function writingAuxEntries220() {
  if (state.writingAuxEntries220) return state.writingAuxEntries220;
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem('drama-writing-aux220') || '{}'); } catch (_) { saved = {}; }
  const entries = {};
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [key, item] of Object.entries(saved)) {
    if (/^[a-f0-9]{64}$/.test(key) && item && /^[a-f0-9]{32}$/.test(item.receiptId || '') && writingAuxUrls220.has(item.url)) entries[key] = {receiptId:item.receiptId,url:item.url};
  }
  return state.writingAuxEntries220 = entries;
}

function persistWritingAux220() {
  const saved = Object.fromEntries(Object.entries(writingAuxEntries220()).map(([key, item]) =>
    [key,{receiptId:item.receiptId,url:item.url}]));
  try { sessionStorage.setItem('drama-writing-aux220', JSON.stringify(saved)); } catch (_) { /* Keep original receipt in memory. */ }
}

function refreshWritingAuxButton220(button) {
  if (!button?.isConnected || button.disabled || !button.dataset.auxBaseLabel220) return;
  const entry = writingAuxEntries220()[button.dataset.auxKey220];
  const pending = entry && entry.owner && ownsWritingAction220(entry.owner);
  button.textContent = button.dataset.auxBaseLabel220 + (pending ? ' · 查询原结果' : '');
  button.title = pending ? '再次点击只查询上次原结果，不会重新生成或扣费。' : '';
}

function pendingWritingAuxButton220(button, url) {
  const entry = button && writingAuxEntries220()[button.dataset.auxKey220];
  return entry?.url === url && entry.owner && ownsWritingAction220(entry.owner) ? entry : null;
}

function writingAuxArea220(url) {
  return $(url.startsWith('/api/original/') ? 'recommendProgress' : url.includes('proposal') ? 'proposalProgress' : 'sourceAnalysisProgress');
}

function showWritingAuxRaw220(entry, data) {
  if (!entry.owner || !ownsWritingAction220(entry.owner)) return;
  const area = writingAuxArea220(entry.url);
  if (!area) return;
  const raw = String(data.rawText || '') || (Array.isArray(data.rawParts) ? data.rawParts.map(part => `第${part.batch ?? '?'}段原返回：\n${String(part.raw || '')}`).join('\n\n') : '');
  if (!raw) return;
  area.querySelector('[data-writing-aux-raw220]')?.remove();
  const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
  details.dataset.writingAuxRaw220 = entry.receiptId;
  summary.textContent = '查看原返回（只读；未重新调用）'; pre.textContent = raw;
  pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto';
  details.append(summary,pre); area.appendChild(details); area.classList.remove('hidden');
}

async function recoverWritingAux220(entry) {
  const data = await postJson('/api/writing/auxiliary/recover', {receiptId:entry.receiptId});
  if (data.auxReceiptId && data.auxReceiptId !== entry.receiptId) throw new Error('原结果编号不一致，未应用返回，也未重新生成。');
  if (data.status === 'succeeded' && data.result && typeof data.result === 'object') return data.result;
  showWritingAuxRaw220(entry,data);
  if (['missing','expired'].includes(data.status)) {
    delete writingAuxEntries220()[entry.key]; persistWritingAux220();
    throw new Error('原本机记录不存在或已清理，无法确认旧调用；本次没有重发。再次点击将发起新的收费调用。');
  }
  if (['failed','invalid'].includes(data.status)) {
    state.writingAuxReturned220 = {...(state.writingAuxReturned220 || {}), [entry.receiptId]:data};
    delete writingAuxEntries220()[entry.key]; persistWritingAux220();
    throw new Error(data.status === 'invalid' ? '原返回已保存，但格式不能直接应用；没有重发或新增扣费。再次点击将发起新的收费调用。' : '原调用已明确失败；没有重发。再次点击将发起新的调用。');
  }
  throw new Error('上次调用结果仍待确认；原编号已保留，再次点击只查询原结果，不重新生成或重复扣费。');
}

async function submitWritingAux220(url, payload, button) {
  if (!writingAuxUrls220.has(url)) throw new Error('不是写作辅助功能，未提交。');
  const pending = pendingWritingAuxButton220(button,url);
  if (pending) {
    try { return {auxReceiptId:pending.receiptId,recoveredResult220:await recoverWritingAux220(pending),auxEntry220:pending}; }
    finally { setTimeout(()=>refreshWritingAuxButton220(button),0); }
  }
  const owner = captureWritingActionOwner220();
  const archiveOwner227={feature:owner.mode==='original'?'original':'rewrite',
    projectId:owner.mode==='rewrite'?rewriteArchiveIdentity227():'',
    projectName:payload.settings?.projectName||$('projectName')?.value||''};
  const identityPayload = ['/api/source/refine','/api/source/proposal-refine'].includes(url) ? {...payload,instruction:undefined} : payload;
  const bytes = new TextEncoder().encode(JSON.stringify([url,identityPayload,{mode:owner.mode,projectId:owner.projectId,sourceSignature:owner.sourceSignature}]));
  const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const entries = writingAuxEntries220();
  let entry = entries[key];
  const existed = Boolean(entry);
  if (!entry) {
    entry = entries[key] = {receiptId:newCreationSubmissionId().replace(/-/g,''),url};
    writingAuxArea220(url)?.querySelector('[data-writing-aux-raw220]')?.remove();
  }
  Object.assign(entry,{key,owner,button});
  if (button) {
    button.dataset.auxBaseLabel220 ||= button.textContent.replace(/ · 查询原结果$/, '');
    button.dataset.auxKey220 = key;
  }
  persistWritingAux220(); // Persist before submission; never retry POST after transport loss.
  try {
    if (existed) return {auxReceiptId:entry.receiptId,recoveredResult220:await recoverWritingAux220(entry),auxEntry220:entry};
    let data;
    try { data = await postJson(url,{...payload,auxReceiptId:entry.receiptId,outputContext227:archiveOwner227}); }
    catch (error) {
      if (error.auxNotSubmitted220 || [400,401,403,404,409,422].includes(error.auxHttpStatus220)) { delete entries[key];persistWritingAux220();throw error; }
      return {auxReceiptId:entry.receiptId,recoveredResult220:await recoverWritingAux220(entry),auxEntry220:entry};
    }
    if (data.auxReceiptId && data.auxReceiptId !== entry.receiptId) throw new Error('提交回执编号不一致，已保留原编号，未重新生成。');
    if (!data.taskId) return {auxReceiptId:entry.receiptId,recoveredResult220:await recoverWritingAux220(entry),auxEntry220:entry};
    return {...data,auxEntry220:entry};
  } finally { setTimeout(()=>refreshWritingAuxButton220(button),0); }
}

async function pollWritingAux220(data, onDone, target) {
  const entry = data.auxEntry220;
  try {
    let result = data.recoveredResult220;
    if (!result) {
      try { await pollTask(data.taskId,value => { result = value; },target,"",true); }
      catch (error) { if (!entry) throw error; result = await recoverWritingAux220(entry); }
    }
    await onDone(result);
    if (entry?.owner && ownsWritingAction220(entry.owner) && (['unknown','pending'].includes(result?.billingStatus) || result?.chargedPoints === null)) toast('原调用结果已返回；费用待后台结算确认，不按免费完成处理。');
    if (entry) { delete writingAuxEntries220()[entry.key];persistWritingAux220(); }
  } finally { setTimeout(()=>refreshWritingAuxButton220(entry?.button),0); }
}

function currentSourceSignature() {
  const text = $("sourceText")?.value || "";
  let hash = 2166136261;
  const input = `${state.videoId}|${text}`;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return `${state.videoId}|${text.length}|${hash >>> 0}`;
}

function guideToRewriteSection(sectionId, attention = false) {
  const section = $(sectionId);
  if (!section) return;
  document.querySelectorAll(".rewrite-step-attention").forEach(item => item.classList.remove("rewrite-step-attention"));
  if (attention) section.classList.add("rewrite-step-attention");
  requestAnimationFrame(() => section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }));
}

document.querySelectorAll("#rewriteProposalSection, #rewriteCard, #generateCard").forEach(section => {
  section.addEventListener("pointerdown", () => section.classList.remove("rewrite-step-attention"));
  section.addEventListener("focusin", () => section.classList.remove("rewrite-step-attention"));
});

async function refreshSourceProfile() {
  const source = $("sourceText").value.trim();
  const signature = currentSourceSignature();
  const hint = $("sourceTypeHint");
  if (!source || !hint) return;
  state.sourceProfile = null;
  hint.textContent = "正在本地识别输入类型…不调用收费模型。";
  try {
    const data = await postJson("/api/source/profile", { sourceText: source });
    if (currentSourceSignature() !== signature || state.sourceScriptKey !== signature) return;
    state.sourceProfile = data.sourceProfile;
    const profile = data.sourceProfile;
    if (!profile) throw new Error("输入类型未返回");
    hint.textContent = `输入类型：${profile.label}。处理方式：${profile.method} ${profile.confidence === "high" ? "" : "这是格式判断，模型还会逐部分核对。"}（本地识别，不扣积分）`;
  } catch (_) {
    if (currentSourceSignature() === signature && state.sourceScriptKey === signature) hint.textContent = "类型预览暂不可用；提交改写时会在本地重新判断类型，不影响原剧本保存。";
  }
}

function saveSourceScript() {
  const source = $("sourceText").value.trim();
  if (!source) return toast(state.videoId ? "请先用上方视频对白识别功能得到文字稿，再检查并保存原剧本。" : "请先粘贴或导入原剧本。", true);
  state.sourceScriptKey = currentSourceSignature();
  state.sourceAnalysis = null;
  state.proposalDecisionMade = false;
  $("sourceScriptStatus").textContent = `已保存原剧本（${source.replace(/\s/g, "").length.toLocaleString()}字）。提案和最终改写都会直接读取这份原剧本；本步骤未调用模型。`;
  refreshSourceProfile();
  $("proposalDecision").classList.remove("hidden");
  $("proposalEmpty").classList.add("hidden");
  $("generateProposalsBtn").classList.remove("hidden");
  queueRewriteProjectSave();
  guideToRewriteSection("rewriteProposalSection", true);
  toast("原剧本已保存。可以生成三套换皮提案，也可以跳过。未扣识别积分。");
}

function sourceAssetReferenceText(analysis = state.sourceAnalysis) {
  const bios = new Map((Array.isArray(analysis?.characterBios) ? analysis.characterBios : []).map(item => [String(item?.name || "").trim(), item]));
  const rows = (key, label) => (Array.isArray(analysis?.[key]) ? analysis[key] : []).map(item => {
    const effective = key === "characters" ? { ...(bios.get(String(item?.name || "").trim()) || {}), ...(item || {}) } : item;
    const fields = [["name", "名称"], ["bio", "人物小传"], ["identity", "身份"], ["relation", "关系"], ["traits", "特征"], ["goal", "目标"], ["storyFunction", "剧情作用"], ["time", "时间"], ["features", "场景特征"], ["whyAppears", "出现原因"], ["description", "说明"], ["owner", "归属"], ["role", "物品作用"], ["state", "状态"], ["evidence", "原文依据"]];
    const details = fields.map(([field, title]) => [title, effective?.[field]]).filter(([, value]) => value != null && String(value).trim());
    return `- ${label}：${details.map(([title, value]) => `${title}：${analysisText(value)}`).join("；")}`;
  });
  return [
    `原剧名称：${analysis?.title || "未命名"}`, `原剧类型：${analysis?.genre || "未明确"}`,
    `核心冲突：${analysis?.coreConflict || "未明确"}`, `剧情概述：${analysis?.summary || "未提供"}`,
    `故事主线与结局：${analysisText(analysis?.mainLine || "未提供")}`,
    `起承转合（原作机制，不要求照搬台词或商品宣传）：\n${analysisText(analysis?.storyOutline || "未提供")}`,
    `关键因果节点：\n${analysisText(analysis?.keyBeats || [])}`,
    `关系和信息转折：\n${analysisText(analysis?.turningPoints || [])}`,
    `连续性风险：\n${analysisText(analysis?.continuityRisks || [])}`,
    `人物（${rows("characters", "人物").length}项）：`, ...rows("characters", "人物"),
    `场景（${rows("scenes", "场景").length}项）：`, ...rows("scenes", "场景"),
    `关键物品（${rows("props", "物品").length}项）：`, ...rows("props", "物品")
  ].join("\n");
}

function chineseSnapshot(value, labels) {
  if (!value || typeof value !== "object") return analysisText(value);
  const render = item => item && typeof item === "object" ? Object.entries(item).map(([key, val]) => `${labels[key] || "补充信息"}：${Array.isArray(val) ? val.join("、") : val}`).join("；") : String(item ?? "");
  return Object.entries(value).map(([key, val]) => `${labels[key] || "补充信息"}：${Array.isArray(val) ? val.map(render).join("\n") : render(val)}`).join("\n");
}

function proposalReferenceText(proposal) {
  const labels = { id:"方案编号", title:"方案名称", tagline:"核心创意", score:"方案评分", newBackground:"新背景", newStory:"新故事", assetPlan:"资产替换方案", relationships:"人物关系", newElements:"新增元素", hookDesign:"开场钩子设计", famousSceneDesign:"名场面设计", informationGap:"信息差设计", differentiation:"与其他方案的差异", routeSummary:"正式改写方向", direction:"改写方向", scoreBreakdown:"评分构成", scoreReason:"评分依据", risks:"风险与注意事项", similarityStrategy:"保留与改动策略" };
  return chineseSnapshot(proposal, labels);
}

function rewriteConfigReferenceText(value) {
  const labels = { platform:"目标平台", audience:"目标观众", durationSeconds:"剧本转视频预计总时长（秒，仅供体量参考）", durationSemantics:"时长说明", similarity:"与原作结构和剧情走向相似度", intensity:"剧情强度", storyStyle:"故事风格", rewriteEra:"改写后的年代/世界", peopleMode:"人物数量设定", peopleCount:"人物数量上限", peopleNameMode:"人物命名方式", sceneMode:"场景数量设定", sceneCount:"场景数量上限", sceneNameMode:"场景命名方式", propMode:"关键物品数量设定", propCount:"关键物品数量上限", propNameMode:"关键物品命名方式", productEnabled:"是否带货", productName:"商品名称", productFacts:"商品已确认事实", productPrice:"商品价格", priceEnabled:"是否播报价格", productCoverage:"产品剧情覆盖度", productPlacement:"选品初选位置", promotionStyle:"宣传表达强度", pressureLevel:"冲突压力", reversalLevel:"反转强度", reversalCount:"反转次数参考", ctaEnabled:"是否引导下单", strictCompliance:"是否严格遵循设定", extraRequirements:"其他剧情要求" };
  const values = { increase: "增加", decrease: "减少", front: "前段", middle: "中段", back: "后段" };
  const quantityModes = { keep: "由剧情需求决定，不限制为原剧数量", custom: "设置数量上限" };
  const fieldValues = {
    peopleMode: quantityModes, sceneMode: quantityModes, propMode: quantityModes,
    peopleNameMode: { rewrite: "改写全部人物名称", keep: "保留原人物名称" },
    sceneNameMode: { rewrite: "改写全部场景名称", keep: "保留原场景名称" },
    propNameMode: { rewrite: "改写全部物品名称", keep: "保留原物品名称" }
  };
  const countModes = { peopleCount: "peopleMode", sceneCount: "sceneMode", propCount: "propMode" };
  const snapshot = normalizeRewriteSnapshot(value);
  const mapped = Object.entries(snapshot).filter(([key, val]) => labels[key] && val !== null && val !== "" && (!Array.isArray(val) || val.length) &&
    (!countModes[key] || ["custom", "increase", "decrease"].includes(snapshot[countModes[key]])))
    .map(([key, val]) => [labels[key], typeof val === "boolean" ? (val ? "是" : "否") : Array.isArray(val) ? val.map(item => values[String(item)] || item).join("、") : fieldValues[key]?.[String(val)] || values[String(val)] || val]);
  return mapped.map(([key, val]) => `${key}：${val}`).join("\n");
}

function normalizeRewriteSnapshot(value) {
  const keys = ["platform", "audience", "durationSeconds", "similarity", "intensity", "storyStyle", "rewriteEra",
    "peopleMode", "peopleCount", "peopleNameMode", "sceneMode", "sceneCount", "sceneNameMode", "propMode", "propCount", "propNameMode",
    "productEnabled", "productName", "productFacts", "productPrice", "priceEnabled", "productCoverage", "productPlacement", "promotionStyle",
    "pressureLevel", "reversalLevel", "reversalCount", "ctaEnabled", "strictCompliance", "extraRequirements"];
  const snapshot = Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  if (!snapshot.productEnabled) {
    for (const key of ["productEnabled", "productName", "productFacts", "productPrice", "priceEnabled", "productCoverage", "productPlacement", "promotionStyle", "ctaEnabled"]) delete snapshot[key];
  }
  snapshot.durationSemantics = "剧本转视频预计总时长，仅作为故事体量参考，模型输出可能有偏差";
  return snapshot;
}

function rewriteConfigSnapshot() { return normalizeRewriteSnapshot(settings()); }

function invalidateDownstream(reason = "资料已变化，请重新确认当前版本。") {
  state.sourceScriptKey = "";
  state.assetConfirmationKey = "";
  state.confirmedAssetText = "";
  state.proposalTextSnapshot = "";
  state.proposalSkipped = false;
  state.proposalDecisionMade = false;
  state.savedRewriteConfig = null;
  state.savedRewriteConfigText = "";
  state.rewriteConfigConfirmed = false;
  state.rewriteConfigKey = "";
  state.selectedProposalId = "";
  state.rewriteProposals = [];
  state.rewriteCallPending = false;
  $("rewriteCallConfirm")?.classList.add("hidden");
  if ($("assetConfirmationStatus")) $("assetConfirmationStatus").textContent = reason;
  if ($("confirmSourceAssetsBtn")) $("confirmSourceAssetsBtn").disabled = !state.sourceAnalysis;
  $("proposalDecision")?.classList.add("hidden");
  $("proposalChoiceActions")?.classList.add("hidden");
  $("generateProposalsBtn")?.classList.add("hidden");
  $("proposalGrid")?.classList.add("hidden");
  if ($("proposalEmpty")) { $("proposalEmpty").textContent = "原剧本已变化，请重新保存后再继续。"; $("proposalEmpty").classList.remove("hidden"); }
  if ($("rewriteConfigStatus")) $("rewriteConfigStatus").textContent = "配置或上游资料已变化，请重新保存并确认。";
}

function invalidateRewriteConfig(reason = "改写配置已变化，请重新保存并确认。") {
  state.savedRewriteConfig = null;
  state.savedRewriteConfigText = "";
  state.rewriteConfigConfirmed = false;
  state.rewriteConfigKey = "";
  state.rewriteCallPending = false;
  $("rewriteCallConfirm")?.classList.add("hidden");
  if ($("rewriteConfigStatus")) $("rewriteConfigStatus").textContent = reason;
}

function invalidateProposalChoice(reason = "提案内容已变化，请重新选择或跳过。") {
  state.selectedProposalId = "";
  state.proposalTextSnapshot = "";
  state.proposalSkipped = false;
  state.proposalDecisionMade = false;
  invalidateRewriteConfig("提案内容已变化，请重新确认提案后再保存改写配置。");
  if ($("proposalEmpty")) { $("proposalEmpty").textContent = reason; $("proposalEmpty").classList.remove("hidden"); }
}

function invalidateSourceAnalysis(message = "") {
  if (!state.sourceAnalysis && !state.rewriteProposals.length && !state.assetConfirmationKey && !state.sourceScriptKey) {
    if (!state.rewriteProjectId) state.archiveIdentity227 = null;
    return;
  }
  invalidateDownstream("原剧本已变化，请重新保存。");
  state.sourceAnalysis = null;
  state.sourceAnalysisSignature = "";
  state.rewriteProposals = [];
  state.selectedProposalId = "";
  state.rewriteProjectId = "";
  state.archiveIdentity227 = null;
  $("sourceAnalysisResult")?.classList.add("hidden");
  $("sourceAnalysisEmpty")?.classList.remove("hidden");
  if ($("sourceAnalysisEmpty")) $("sourceAnalysisEmpty").innerHTML = `<b>原素材已变更，需要重新识别</b><span>${escapeHtml(message || "重新识别后，三套提案才会使用最新原作。")}</span>`;
  $("proposalGrid")?.classList.add("hidden");
  $("proposalDecision")?.classList.add("hidden");
  $("proposalEmpty")?.classList.remove("hidden");
  if ($("proposalEmpty")) $("proposalEmpty").textContent = "原剧本已变更，请重新保存后再生成提案。";
  if ($("sourceScriptStatus")) $("sourceScriptStatus").textContent = message || "原剧本已变化，请重新保存。";
  state.sourceProfile = null;
  if ($("sourceTypeHint")) $("sourceTypeHint").textContent = "原剧本已变化，重新保存后会再次识别输入类型。";
}

function analysisText(value) {
  const fieldNames = { position:"位置", content:"钩子内容", mechanism:"钩子作用", beat:"剧情节点", function:"节点功能", scene:"场景", emotion:"情绪", visual:"画面", reuse:"复用价值", name:"名称", identity:"身份", relation:"关系", traits:"特征", goal:"目标", storyFunction:"剧情作用", evidence:"原文依据" };
  if (Array.isArray(value)) return value.map((item, index) => typeof item === "object" ? `${index + 1}. ${Object.entries(item).map(([key, val]) => `${fieldNames[key] || "补充说明"}：${Array.isArray(val) ? val.join("、") : val}`).join("；")}` : `${index + 1}. ${item}`).join("\n");
  if (value && typeof value === "object") return Object.entries(value).map(([key, val]) => `${key}：${Array.isArray(val) ? val.join("、") : val}`).join("\n");
  return String(value ?? "");
}

const analysisEditorFields = [
  ["summary", "剧情总结"], ["storyOutline", "故事大纲"], ["mainLine", "故事主线"],
  ["whyItWorks", "为什么有吸引力"], ["hooks", "剧本钩子"], ["hitDiagnosis", "爆点诊断"],
  ["characterBios", "人物小传"], ["keyBeats", "关键剧情点"], ["turningPoints", "转折点"],
  ["famousScenes", "名场面素材"], ["informationGapDesign", "信息差设计"], ["formulaFramework", "套路框架"],
  ["assetSummary", "全剧内容资产总结"],
];

function prepareAssetGroups(analysis) {
  const types = ["characters", "scenes", "props"];
  const groups = analysis.assetGroups && typeof analysis.assetGroups === "object" ? analysis.assetGroups : {};
  groups.confirmed = groups.confirmed && typeof groups.confirmed === "object" ? groups.confirmed : {};
  groups.suspected = groups.suspected && typeof groups.suspected === "object" ? groups.suspected : {};
  for (const type of types) {
    if (!Array.isArray(groups.confirmed[type]) || !Array.isArray(groups.suspected[type])) {
      const legacy = Array.isArray(analysis[type]) ? analysis[type] : [];
      groups.confirmed[type] = legacy.filter(item => item?.evidenceVerified !== false);
      groups.suspected[type] = legacy.filter(item => item?.evidenceVerified === false);
    }
    groups.confirmed[type].forEach(item => { if (item && typeof item === "object") item.assetStatus = "confirmed"; });
    groups.suspected[type].forEach(item => { if (item && typeof item === "object") item.assetStatus = "suspected"; });
    // Keep the old top-level fields as the confirmed-only compatibility view.
    analysis[type] = groups.confirmed[type];
  }
  analysis.assetGroups = groups;
  analysis.confirmedAssets = groups.confirmed;
  analysis.suspectedAssets = groups.suspected;
  analysis.unconfirmedAssets = types.flatMap(type => groups.suspected[type]);
  analysis.assetCounts = { people: groups.confirmed.characters.length, scenes: groups.confirmed.scenes.length, props: groups.confirmed.props.length };
  analysis.suspectedCounts = { people: groups.suspected.characters.length, scenes: groups.suspected.scenes.length, props: groups.suspected.props.length };
  return groups;
}

function suspectedAssetCount(analysis = state.sourceAnalysis) {
  const groups = analysis?.assetGroups;
  return ["characters", "scenes", "props"].reduce((total, type) => total + (Array.isArray(groups?.suspected?.[type]) ? groups.suspected[type].length : 0), 0);
}

function updateAssetConfirmationUi() {
  const count = suspectedAssetCount();
  const button = $("confirmSourceAssetsBtn");
  if (button) button.disabled = !state.sourceAnalysis || count > 0;
  const status = $("assetConfirmationStatus");
  if (!status || !state.sourceAnalysis) return;
  const confirmed = state.sourceAnalysis.assetCounts || {};
  if (count) {
    status.textContent = `还有${count}项疑似资产未处理。可以先删除不要的，再一键确认剩余资产；处理完后才能保存下一步。`;
  } else {
    status.textContent = `已整理确认清单：人物${confirmed.people ?? (state.sourceAnalysis.characters?.length || 0)}项、场景${confirmed.scenes ?? (state.sourceAnalysis.scenes?.length || 0)}项、物品${confirmed.props ?? (state.sourceAnalysis.props?.length || 0)}项，可以保存并进入下一步。`;
  }
}

function assetCards(analysis, type, groupName) {
  const labels = { characters: "人物", scenes: "场景", props: "关键物品" };
  const fieldLabels = { name: "名称", bio: "人物小传", identity: "身份/职业", relation: "人物关系", traits: "特征", goal: "目标", storyFunction: "剧情功能", time: "时间", features: "固定环境", whyAppears: "为何出现", owner: "归属/持有人", role: "剧情作用", state: "状态变化", evidence: "原文依据" };
  const editableKeys = ["name", "bio", "identity", "relation", "traits", "goal", "storyFunction", "time", "features", "whyAppears", "owner", "role", "state", "evidence"];
  const rows = Array.isArray(analysis?.assetGroups?.[groupName]?.[type]) ? analysis.assetGroups[groupName][type] : [];
  const suspected = groupName === "suspected";
  return `<section class="analysis-asset-group ${suspected ? "analysis-asset-suspected" : "analysis-asset-confirmed"}"><h4>${labels[type]} <em>${rows.length}</em><small>${suspected ? "请逐项确认或删除" : "已进入后续改写资料"}</small></h4><div>${rows.map((item, index) => `<article><details><summary><b>${escapeHtml(item?.name || `${labels[type]}${index + 1}`)}</b>${suspected ? `<span class="asset-status-badge">待处理</span>` : ""}</summary><div class="analysis-asset-fields">${editableKeys.filter(key => item?.[key] != null && String(item[key]).trim()).map(key => `<label><span>${escapeHtml(fieldLabels[key] || key)}</span><textarea data-analysis-asset="${type}" data-analysis-asset-group="${groupName}" data-analysis-asset-index="${index}" data-analysis-asset-key="${key}">${escapeHtml(analysisText(item[key]))}</textarea></label>`).join("")}</div><div class="analysis-asset-actions">${suspected ? `<button type="button" class="asset-confirm-btn" data-asset-action="confirm" data-asset-type="${type}" data-asset-group="${groupName}" data-asset-index="${index}">纳入已确认</button>` : ""}<button type="button" class="asset-delete-btn" data-asset-action="delete" data-asset-type="${type}" data-asset-group="${groupName}" data-asset-index="${index}">删除资产</button></div></details></article>`).join("") || `<span>暂无${labels[type]}</span>`}</div></section>`;
}

function renderAssetGroups(analysis) {
  prepareAssetGroups(analysis);
  const labels = { characters: "人物", scenes: "场景", props: "关键物品" };
  const renderBucket = (groupName, title, note) => `<div class="analysis-asset-bucket ${groupName}"><div class="analysis-asset-bucket-head"><b>${title}</b><div class="analysis-asset-bucket-controls"><span>${note}</span>${groupName === "suspected" && suspectedAssetCount(analysis) > 0 ? `<button type="button" class="asset-confirm-btn asset-confirm-all-btn" data-asset-action="confirm-all">一键确认剩余资产</button>` : ""}</div></div><div class="analysis-asset-columns">${Object.keys(labels).map(type => assetCards(analysis, type, groupName)).join("")}</div></div>`;
  return renderBucket("confirmed", "已确认资产", "会进入提案和最终改写") + renderBucket("suspected", "疑似资产", "先删除不要的，再确认剩余资产");
}

function renderSourceAnalysis(result) {
  const analysis = result?.analysis || result || {};
  invalidateDownstream("请检查并修正人物、场景、物品清单后，点击人工确认。");
  state.sourceAnalysis = analysis;
  state.sourceAnalysisSignature = currentSourceSignature();
  $("sourceAnalysisEmpty").classList.add("hidden");
  $("sourceAnalysisResult").classList.remove("hidden");
  const overview = [
    ["title", "原剧名称"], ["genre", "原剧类型"], ["positioning", "题材定位"], ["era", "原剧年代"],
    ["targetAudience", "对标人群"], ["durationLabel", "原剧时长"], ["commerceType", "商业属性"],
    ["product", "带货产品/服务"], ["productRole", "产品在剧情中的作用"], ["coreConflict", "核心冲突"],
    ["confidence", "识别信心"],
  ];
  $("sourceAnalysisOverview").innerHTML = overview.map(([field, label]) => `<label><span>${label}</span><input data-analysis-overview="${field}" value="${escapeHtml(analysisText(analysis[field]) || "")}" placeholder="未识别"></label>`).join("") + `<div class="analysis-commerce-result"><b>原剧类型识别</b><span>${analysis.isCommerce ? "带货/交易内容" : "非带货内容"}</span><small>${escapeHtml(analysis.commerceType || "依据原剧资产识别结果")}</small></div>`;
  $("sourceAnalysisEditors").innerHTML = analysisEditorFields.map(([field, label]) => `<label class="analysis-editor"><span><b>${label}</b><button type="button" data-analysis-ai="${field}">AI优化</button></span><textarea data-analysis-field="${field}">${escapeHtml(analysisText(analysis[field]))}</textarea>${stageModelControlMarkup(`source-refine-${field}`, "refine", "优化模型")}</label>`).join("");
  $("sourceAnalysisAssets").innerHTML = renderAssetGroups(analysis);
  const suspected = suspectedAssetCount(analysis);
  // The asset step intentionally exposes only confirmed/suspected asset cards.
  // Story diagnosis, warnings and model-generated analysis are not shown here.
  $("sourceAnalysisWarnings").classList.add("hidden");
  $("sourceAnalysisWarnings").innerHTML = "";
  $("sourceAnalysisState").textContent = `已整理 · 已确认${analysis.characters?.length || 0}人/${analysis.scenes?.length || 0}场景/${analysis.props?.length || 0}物品 · 疑似${suspected}项`;
  updateAssetConfirmationUi();
  $("generateProposalsBtn")?.classList.add("hidden");
  $("analyzeSourceBtn").textContent = "重新识别原剧";
  renderStageModelSelectors();
  if (result?.transcript && !$("sourceText").value.trim()) {
    $("sourceText").value = result.transcript;
    updateSourceCount();
    state.sourceAnalysisSignature = currentSourceSignature();
  }
  queueRewriteProjectSave();
}

async function analyzeSource() {
  if (state.workMode !== 'rewrite' || $("analyzeSourceBtn").disabled) return;
  const owner = captureWritingActionOwner220(), originalAnalysis = state.sourceAnalysis;
  if (!state.videoId && !$("sourceText").value.trim()) return toast("请先上传原视频、导入分享链接或粘贴原剧本。", true);
  if (state.sourceAnalysis && state.sourceAnalysisSignature === currentSourceSignature() && !await studioConfirm("原素材未改变，已有识别结果可继续编辑使用。确定重新付费识别吗？新结果不会直接覆盖当前内容，将先请你确认。")) return;
  if (!ownsWritingAction220(owner) || state.sourceAnalysis !== originalAnalysis) return toast("原稿或项目已变化，本次没有提交识别。", true);
  // 识别从第一步就走后台发布的顶级文本模型，纯对白也不再静默绕过AI。
  const modelProblem = stageModelProblem("source-analyze", "rewrite", "原剧识别");
  if (modelProblem) return toast(modelProblem, true);
  $("analyzeSourceBtn").disabled = true;
  try {
    const data = await submitWritingAux220("/api/source/analyze", {
      videoId: state.videoId, sourceText: $("sourceText").value, modelSize: $("whisperModel").value,
      visualAnalysis: $("visualAnalysis").checked, maxFrames: 12, modelConfig: modelConfig("source-analyze", "rewrite"),
    }, $("analyzeSourceBtn"));
    await pollWritingAux220(data, async result => {
      if (!ownsWritingAction220(owner) || state.sourceAnalysis !== originalAnalysis) return toast("原剧识别已返回到原任务；当前项目或原稿已变化，未覆盖正在编辑的资产。");
      if (state.sourceAnalysis) {
        const describe = value => ["characters", "scenes", "props"].map(key => `${({characters:"人物",scenes:"场景",props:"物品"})[key]}：${(value[key] || []).map(row => row.name).join("、") || "无"}`).join("\n");
        if (!await studioConfirm(`原记录：\n${describe(state.sourceAnalysis)}\n\n新识别：\n${describe(result.analysis || {})}\n\n使用新结果替换当前可编辑记录？取消将保留当前记录。`)) return;
      }
      if (!ownsWritingAction220(owner) || state.sourceAnalysis !== originalAnalysis) return toast("原剧识别已返回；确认期间项目或原稿已变化，未覆盖正在编辑的资产。");
      renderSourceAnalysis(result);
      $("sourceAnalysisProgress").classList.add("hidden");
      state.rewriteProposals = [];
      state.selectedProposalId = "";
      $("proposalGrid").classList.add("hidden");
      $("proposalEmpty").classList.remove("hidden");
      $("proposalEmpty").textContent = "原剧已识别。请确认拆解内容，调整改写参数后生成三套提案。";
      queueRewriteProjectSave();
      toast("后台顶级模型已完成原剧内容资产识别，现在可以编辑确认。");
    }, "sourceAnalysis");
  } catch (error) { toast(error.message, true); }
  finally { $("analyzeSourceBtn").disabled = false; }
}

function proposalField(value) { return escapeHtml(analysisText(value) || "未填写").replace(/\n/g, "<br>"); }

function beginInlineAiWait(button, verb = "优化中") {
  if (!button) return () => {};
  const writingAux = button.matches('[data-field-ai],[data-analysis-ai],[data-ai-refine-proposal]');
  const original = writingAux ? (button.dataset.auxBaseLabel220 || button.textContent.replace(/ · 查询原结果$/, '')) : button.textContent;
  if (writingAux) button.dataset.auxBaseLabel220 ||= original;
  const started = Date.now();
  button.disabled = true;
  button.classList.add("inline-ai-loading");
  window.ModelActivity?.set(button,{state:"pending",preserve:true});
  const render = () => {
    if (!button.isConnected) return;
    const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
    button.textContent = `${verb} · ${seconds}秒`;
  };
  render();
  const timer = setInterval(render, 1000);
  return success => {
    clearInterval(timer);
    if (!button.isConnected) return;
    button.classList.remove("inline-ai-loading");
    window.ModelActivity?.set(button,{state:success?"success":"",preserve:true});
    button.disabled = false;
    if (!success) { button.textContent = original; return; }
    button.classList.add("inline-ai-done");
    button.textContent = "✓ 已完成";
    setTimeout(() => {
      if (!button.isConnected || (writingAux && button.disabled)) return;
      button.classList.remove("inline-ai-done");
      window.ModelActivity?.set(button,{state:"",preserve:true});
      button.textContent = original;
    }, 1200);
  };
}

function renderRewriteProposals(proposals) {
  state.rewriteProposals = Array.isArray(proposals) ? proposals : [];
  // Rendering saved/current state is not an active task. Never leak the last
  // task's 100% progress into a project that has no proposal result.
  $("proposalProgress").classList.add("hidden");
  $("proposalProgressMessage").textContent = "等待生成三套差异化方案…";
  $("proposalProgressPercent").textContent = "0%";
  $("proposalProgressBar").style.width = "0%";
  if (!state.rewriteProposals.some(item => item.id === state.selectedProposalId)) state.selectedProposalId = "";
  $("proposalEmpty").classList.toggle("hidden", state.rewriteProposals.length > 0);
  $("proposalGrid").classList.toggle("hidden", state.rewriteProposals.length === 0);
  $("proposalChoiceActions")?.classList.toggle("hidden", state.rewriteProposals.length === 0);
  $("proposalGrid").innerHTML = state.rewriteProposals.map(proposal => `<article class="proposal-card${proposal.id === state.selectedProposalId ? " selected" : ""}" data-proposal-id="${escapeHtml(proposal.id)}">
    <div class="proposal-card-head"><span>方案 ${escapeHtml(proposal.id)}</span><em>差异化路线</em><strong class="proposal-score ${Number(proposal.score) >= 85 ? "score-high" : Number(proposal.score) >= 75 ? "score-good" : "score-moderate"}">${Number.isFinite(Number(proposal.score)) ? `${Math.max(0, Math.min(100, Math.round(Number(proposal.score))))}分` : "待评分"}</strong></div>
    <h4>${escapeHtml(proposal.title || "未命名方案")}</h4><p class="proposal-tagline">${escapeHtml(proposal.tagline || "")}</p>
    <details open><summary>新背景与故事</summary><p><b>背景：</b>${proposalField(proposal.newBackground)}</p><p><b>新故事：</b>${proposalField(proposal.newStory)}</p></details>
    <details><summary>资产与人物关系</summary><p><b>资产：</b>${proposalField(proposal.assetPlan)}</p><p><b>关系：</b>${proposalField(proposal.relationships)}</p><p><b>新元素：</b>${proposalField(proposal.newElements)}</p></details>
    <details><summary>钩子、名场面与信息差</summary><p>${proposalField(proposal.hookDesign)}</p><p>${proposalField(proposal.famousSceneDesign)}</p><p>${proposalField(proposal.informationGap)}</p></details>
    <details><summary>差异与执行提醒</summary><p><b>路线差异：</b>${proposalField(proposal.differentiation)}</p><p><b>正式改写方向：</b>${proposalField(proposal.routeSummary || proposal.direction)}</p><p><b>方案评分依据：</b>${proposalField(proposal.scoreBreakdown || proposal.scoreReason || "模型未提供评分依据")}</p><p><b>风险：</b>${proposalField(proposal.risks)}</p></details>
    <details><summary>二次编辑该方案</summary><div class="proposal-edit-fields">
      ${[["newBackground", "新背景"], ["assetPlan", "新资产"], ["relationships", "新人物关系"], ["newStory", "新故事"], ["similarityStrategy", "保留与改动"]].map(([field, label]) => `<label><span>${label}</span><textarea data-edit-proposal="${escapeHtml(proposal.id)}" data-edit-proposal-field="${field}">${escapeHtml(analysisText(proposal[field]))}</textarea></label>`).join("")}
    </div><div class="proposal-ai-tools">${stageModelControlMarkup(`proposal-refine-${proposal.id}`, "refine", "优化模型")}<button type="button" class="ghost-btn" data-ai-refine-proposal="${escapeHtml(proposal.id)}">AI 一键优化本方案</button><small>也可以只手动修改；点击 AI 优化按后台 AI 小调用价格计费（当前应为0.10积分），失败也会返回提示。</small></div></details>
    <button type="button" class="${proposal.id === state.selectedProposalId ? "primary-btn" : "secondary-btn"}" data-select-proposal="${escapeHtml(proposal.id)}">${proposal.id === state.selectedProposalId ? "已选中此方案" : "选择此方案改写"}</button>
  </article>`).join("");
  renderStageModelSelectors();
  queueRewriteProjectSave();
}

async function generateRewriteProposals() {
  if (state.proposalBusy) return toast("提案任务正在执行，请勿重复提交。", true);
  state.proposalBusy = true;
  try { return await generateRewriteProposalsOnce(); }
  finally { state.proposalBusy = false; }
}

async function generateRewriteProposalsOnce() {
  const owner = captureWritingActionOwner220();
  if (!state.sourceScriptKey || state.sourceScriptKey !== currentSourceSignature()) return toast("请先保存当前原剧本。", true);
  const modelProblem = stageModelProblem("rewrite-proposals", "rewrite", "三套方案生成");
  if (modelProblem) return toast(modelProblem, true);
  const unresolved = localStorage.getItem("drama-proposal-unresolved");
  if (unresolved) {
    try {
      const receipt = await postJson("/api/source/proposals/recover", {callId: unresolved});
      if (receipt.status === "pending") return toast("上次调用仍在处理中，请查询原结果，不要重复生成。", true);
      if (receipt.status === "succeeded" && receipt.sourceScriptKey === currentSourceSignature()) return recoverRewriteProposals();
      if (receipt.status === "invalid" && !await studioConfirm(`${receipt.error || "上次返回的提案不完整"}。重新生成是新的收费调用，是否继续？`)) return;
      localStorage.removeItem("drama-proposal-unresolved");
    } catch (error) { return toast(`上次调用尚未核对：${error.message}，暂不重复提交。`, true); }
  }
  if (state.rewriteProposals.length && !await studioConfirm("重新生成提案会再次调用模型并按上方报价计费，旧提案选择和后续确认将失效。继续吗？")) return;
  if (!ownsWritingAction220(owner)) return toast("原稿或项目已变化，本次没有提交提案。", true);
  $("generateProposalsBtn").disabled = true;
  state.proposalBusy = true;
  const requestedSource = currentSourceSignature(), requestedProject = state.rewriteProjectId;
  try {
    const data = await submitWritingAux220("/api/source/proposals", { sourceText: $("sourceText").value, sourceScriptKey: state.sourceScriptKey, settings: rewriteConfigSnapshot(), modelConfig: modelConfig("rewrite-proposals", "rewrite") }, $("generateProposalsBtn"));
    if (data.callId) {
      localStorage.setItem("drama-proposal-receipt", data.callId);
      localStorage.setItem("drama-proposal-unresolved", data.callId);
    }
    await pollWritingAux220(data, result => {
      localStorage.removeItem("drama-proposal-unresolved");
      if (state.workMode !== 'rewrite' || currentSourceSignature() !== requestedSource || state.rewriteProjectId !== requestedProject) return toast("提案已返回到原任务；当前剧本已变化，未替换正在编辑的提案。");
      $("proposalDecision")?.classList.add("hidden");
      state.proposalTextSnapshot = "";
      state.proposalSkipped = false;
      state.proposalDecisionMade = false;
      state.savedRewriteConfig = null;
      state.rewriteConfigConfirmed = false;
      state.selectedProposalId = "";
      renderRewriteProposals(result.proposals || []);
      $("proposalProgress").classList.add("hidden");
      $("proposalEmpty").textContent = "请从下方选择一套提案；也可以跳过提案，直接进入改写配置。";
      guideToRewriteSection("rewriteProposalSection", true);
      toast("提案已生成。选择一套、重新生成或跳过都可以；不选择提案不会阻止继续。一次生成按一次调用计费。" );
    }, "proposal");
  } catch (error) { toast(error.message, true); }
  finally { state.proposalBusy = false; $("generateProposalsBtn").disabled = false; }
}

async function recoverRewriteProposals() {
  const callId = localStorage.getItem("drama-proposal-receipt");
  if (!callId) return toast("尚无已保存的提案调用编号；旧版本的任务无法凭空恢复。", true);
  const button = $("recoverProposalsBtn");
  button.disabled = true;
  try {
    const data = await postJson("/api/source/proposals/recover", {callId});
    if (data.sourceScriptKey !== currentSourceSignature()) throw new Error("上次提案属于另一份原剧本，请恢复对应原剧本后再查询。" );
    if (data.status !== "succeeded") throw new Error(data.status === "pending" ? "原调用仍在处理中，请稍后查询；不要重复生成。" : data.error || "原调用没有可恢复结果，请核对任务记录。" );
    state.selectedProposalId = "";
    state.proposalTextSnapshot = "";
    state.proposalSkipped = false;
    state.proposalDecisionMade = false;
    state.savedRewriteConfig = null;
    state.rewriteConfigConfirmed = false;
    renderRewriteProposals(data.result.proposals);
    localStorage.removeItem("drama-proposal-unresolved");
    $("proposalProgress").classList.add("hidden");
    toast("已取回原提案，没有重新调用生成模型。" );
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
}

function confirmSourceAssets() {
  if (!state.sourceAnalysis || state.sourceAnalysisSignature !== currentSourceSignature()) return toast("原素材已变化，请重新识别。", true);
  if (suspectedAssetCount() > 0) return toast("请先逐项处理疑似资产：纳入已确认或删除。", true);
  prepareAssetGroups(state.sourceAnalysis);
  state.confirmedAssetText = sourceAssetReferenceText();
  state.assetConfirmationKey = `${state.sourceAnalysisSignature}|${JSON.stringify(state.sourceAnalysis)}`;
  state.proposalDecisionMade = false;
  $("assetConfirmationStatus").textContent = `已保存确认资产清单：人物${state.sourceAnalysis.characters?.length || 0}项、场景${state.sourceAnalysis.scenes?.length || 0}项、物品${state.sourceAnalysis.props?.length || 0}项。后续资料变化后需重新确认。`;
  $("generateProposalsBtn")?.classList.remove("hidden");
  $("proposalDecision").classList.remove("hidden");
  $("proposalEmpty").classList.add("hidden");
  guideToRewriteSection("rewriteProposalSection", true);
}

function skipRewriteProposal() {
  if (!state.sourceScriptKey || state.sourceScriptKey !== currentSourceSignature()) return toast("请先保存当前原剧本。", true);
  state.proposalSkipped = true;
  state.proposalDecisionMade = true;
  $("proposalDecision")?.classList.add("hidden");
  state.selectedProposalId = "";
  state.proposalTextSnapshot = "";
  state.savedRewriteConfig = null;
  state.rewriteConfigConfirmed = false;
  $("proposalChoiceActions")?.classList.add("hidden");
  $("proposalEmpty").textContent = "已选择跳过提案；正式改写将直接使用原剧本和保存后的改写配置。";
  $("proposalEmpty").classList.remove("hidden");
  guideToRewriteSection("rewriteCard", true);
  toast("已跳过提案，可继续填写改写配置。没有调用模型或扣积分。" );
}

async function saveRewriteConfig() {
  if (!state.sourceScriptKey || state.sourceScriptKey !== currentSourceSignature()) return toast("请先保存当前原剧本。", true);
  if (!state.proposalDecisionMade) return toast("请先选择生成提案或明确跳过提案。", true);
  const value = rewriteConfigSnapshot();
  if ($("platform").value === "__custom__" && !$("customPlatform").value.trim()) return toast("请填写自定义目标平台。", true);
  if ($("audience").value === "__custom__" && !$("customAudience").value.trim()) return toast("请填写自定义目标观众。", true);
  if ($("storyStyle").value === "__custom__" && !$("customStoryStyle").value.trim()) return toast("请填写自定义故事风格。", true);
  if ($("rewriteEra").value === "__custom__" && !$("customRewriteEra").value.trim()) return toast("请填写自定义年代/世界。", true);
  const durationProblem = rewriteDurationProblem(value.durationSeconds);
  if (durationProblem) return toast(durationProblem, true);
  if (!value.platform || !value.audience || !Number(value.durationSeconds) || !value.storyStyle || !value.rewriteEra || !value.intensity) return toast("目标平台、目标观众、预计总时长、故事风格、年代和剧情强度均需填写。", true);
  if (value.productEnabled && (!String(value.productName || "").trim() || !String(value.productFacts || "").trim() || !String(value.productPrice || "").trim())) return toast("已开启带货，请填写商品名称、已确认事实和商品价格。", true);
  if (value.productEnabled && !(value.productPlacement || []).length) return toast("已开启带货，请至少选择一个商品出现位置。", true);
  if (value.productEnabled && (!Number.isFinite(Number(value.productCoverage)) || Number(value.productCoverage) < 5 || Number(value.productCoverage) > 100)) return toast("已开启带货，请设置5%至100%的产品剧情覆盖度。", true);
  if (value.productEnabled && !String(value.promotionStyle || "").trim()) return toast("已开启带货，请选择宣传表达强度。", true);
  for (const prefix of ["people", "scene", "prop"]) {
    if (!value[`${prefix}Mode`]) return toast("人物、场景和物品都需要选择设定方式；“由剧情决定”也算已填写。", true);
    if (value[`${prefix}Mode`] === "custom") {
      const count = value[`${prefix}Count`];
      const max = prefix === "people" ? 30 : prefix === "scene" ? 40 : 60;
      if (!Number.isInteger(count) || count < (prefix === "prop" ? 0 : 1) || count > max) return toast("人物、场景、物品的数量上限请填写有效整数。", true);
    }
  }
  state.savedRewriteConfig = value;
  state.savedRewriteConfigText = JSON.stringify(value, null, 2);
  state.rewriteConfigKey = JSON.stringify(value);
  state.rewriteConfigConfirmed = false;
  $("rewriteConfigStatus").textContent = "已保存当前配置。请确认是否将这份配置用于正式改写；确认前不调用模型。";
  if (await studioConfirm("当前改写配置已保存。是否确认使用这份配置参与改写？选择“取消/否”不会调用模型，可继续修改后重新保存。")) {
    state.rewriteConfigConfirmed = true;
    $("rewriteConfigStatus").textContent = "已确认使用当前配置。若再修改任一配置，需要重新保存确认。";
    guideToRewriteSection("generateCard", true);
    toast("改写配置已确认。最终改写仍需在下方再次确认后才调用模型。" );
  } else {
    toast("配置已保存但未确认使用；可以继续修改并重新保存。没有调用模型或扣积分。" );
  }
}

function captureWritingActionOwner220() {
  return {mode:state.workMode, projectId:state.rewriteProjectId,
    sourceSignature:currentSourceSignature(), navigationEpoch:creationNavigationEpoch};
}

function ownsWritingAction220(owner) {
  return ownsWritingContext220(owner) && creationNavigationEpoch === owner.navigationEpoch;
}

function ownsWritingContext220(owner) {
  return state.workMode === owner.mode && state.rewriteProjectId === owner.projectId && currentSourceSignature() === owner.sourceSignature;
}

async function refineAnalysisField(field) {
  if (state.workMode !== 'rewrite') return;
  if (!state.sourceAnalysis) return;
  if (!state.assetConfirmationKey) return toast("请先人工确认当前原剧资产，再使用AI优化。", true);
  const editor = document.querySelector(`[data-analysis-field="${field}"]`);
  if (!editor) return;
  const modelProblem = stageModelProblem(`source-refine-${field}`, "refine", "该项AI优化");
  if (modelProblem) return toast(modelProblem, true);
  const owner = captureWritingActionOwner220(), analysis = state.sourceAnalysis, initialValue = editor.value;
  const pending = state.sourceRefinePending220 || (state.sourceRefinePending220 = new Set());
  const key = JSON.stringify([owner.projectId, owner.sourceSignature, field]);
  if (pending.has(key)) return toast("这一项正在优化，请勿重复提交。", true);
  pending.add(key);
  let succeeded = false, finishWait = () => {};
  try {
    const sourceAnalysis = JSON.parse(JSON.stringify(analysis));
    const model = modelConfig(`source-refine-${field}`, "refine");
    const instruction = pendingWritingAuxButton220(document.querySelector(`[data-analysis-ai="${field}"]`),'/api/source/refine') ? '' : await studioPrompt("请输入这一项的AI优化要求：", "补充关键依据，表达更清晰、专业、可执行，不虚构原作事实");
    if (instruction === null) return;
    if (!ownsWritingAction220(owner) || state.sourceAnalysis !== analysis || editor.value !== initialValue) return toast("原稿或编辑内容已变化，本次没有提交优化。", true);
    finishWait = beginInlineAiWait(document.querySelector(`[data-analysis-ai="${field}"]`), "AI优化中");
    const data = await submitWritingAux220("/api/source/refine", { field, current: initialValue, instruction, sourceAnalysis, modelConfig: model }, document.querySelector(`[data-analysis-ai="${field}"]`));
    await pollWritingAux220(data, result => {
      if (!ownsWritingAction220(owner) || state.sourceAnalysis !== analysis || !editor.isConnected || editor.value !== initialValue) return toast("优化结果已返回；当前项目或编辑内容已变化，未覆盖正在编辑的内容。");
      editor.value = result.text || editor.value;
      state.sourceAnalysis[field] = editor.value;
      invalidateDownstream("原剧拆解经AI优化后已变化，请人工重新确认资产。");
      queueRewriteProjectSave();
      $("sourceAnalysisProgress").classList.add("hidden");
      toast("该项拆解已完成AI优化。");
    }, "sourceAnalysis");
    succeeded = true;
  } catch (error) { toast(error.message, true); }
  finally { pending.delete(key); finishWait(succeeded); }
}

async function refineRewriteProposal(proposalId) {
  if (state.workMode !== 'rewrite') return;
  if (!state.sourceScriptKey || state.sourceScriptKey !== currentSourceSignature()) return toast("原剧本已变化，请先重新保存。", true);
  const proposal = state.rewriteProposals.find(item => item.id === proposalId);
  if (!proposal) return;
  const stage = `proposal-refine-${proposalId}`;
  const modelProblem = stageModelProblem(stage, "refine", "本方案AI优化");
  if (modelProblem) return toast(modelProblem, true);
  const owner = captureWritingActionOwner220();
  const pending = state.proposalRefinePending220 || (state.proposalRefinePending220 = new Set());
  const key = JSON.stringify([owner.projectId, owner.sourceSignature, proposalId]);
  if (pending.has(key)) return toast("这套方案正在优化，请勿重复提交。", true);
  pending.add(key);
  let succeeded = false, finishWait = () => {};
  try {
    const proposalText = JSON.stringify(proposal), proposalSnapshot = JSON.parse(proposalText);
    const sourceText = $("sourceText").value, sourceScriptKey = state.sourceScriptKey;
    const config = settings(), model = modelConfig(stage, "refine");
    const instruction = pendingWritingAuxButton220(document.querySelector(`[data-ai-refine-proposal="${proposalId}"]`),'/api/source/proposal-refine') ? '' : await studioPrompt("希望 AI 怎样优化这个方案？", "让方案更有冲突、悬念和可拍性，同时严格遵守当前是否带货开关并降低重复风险");
    if (instruction === null) return;
    if (!ownsWritingAction220(owner) || JSON.stringify(state.rewriteProposals.find(item => item.id === proposalId)) !== proposalText) return toast("原稿或方案已变化，本次没有提交优化。", true);
    finishWait = beginInlineAiWait(document.querySelector(`[data-ai-refine-proposal="${proposalId}"]`), "AI优化中");
    const data = await submitWritingAux220("/api/source/proposal-refine", { proposal:proposalSnapshot, instruction, sourceText, sourceScriptKey, settings:config, modelConfig:model }, document.querySelector(`[data-ai-refine-proposal="${proposalId}"]`));
    await pollWritingAux220(data, result => {
      const index = state.rewriteProposals.findIndex(item => item.id === proposalId);
      if (!ownsWritingAction220(owner) || index < 0 || JSON.stringify(state.rewriteProposals[index]) !== proposalText) return toast("方案优化已返回；当前项目或方案已变化，未覆盖正在编辑的内容。");
      state.rewriteProposals[index] = { ...proposalSnapshot, ...(result.proposal || {}), id: proposalId };
      invalidateProposalChoice("提案经AI优化后已变化，请重新选择或跳过。");
      renderRewriteProposals(state.rewriteProposals);
      toast(`${proposalId}案已完成 AI 优化，仍可继续手动调整。`);
    }, "proposal");
    succeeded = true;
  } catch (error) { toast(error.message, true); }
  finally { pending.delete(key); finishWait(succeeded); }
}

function updateSourceCount() {
  $("sourceCount").textContent = `${$("sourceText").value.replace(/\s/g, "").length.toLocaleString()} 字`;
  syncSourceMode();
}

function syncSourceMode() {
  const hasText = Boolean($("sourceText").value.trim());
  const hasVideo = Boolean(state.videoId);
  $("sourceMode").value = hasText && hasVideo ? "both" : hasVideo ? "video" : hasText ? "text" : "auto";
  if ($("sourceReadySummary")) $("sourceReadySummary").textContent = hasText || hasVideo
    ? `本次待保存：${[hasText ? `剧本文字 ${$("sourceText").value.replace(/\s/g, "").length.toLocaleString()} 字` : "", hasVideo ? `视频 ${state.videoName || "已上传"}` : ""].filter(Boolean).join(" ＋ ")}。切换上方入口不会清除已准备的资料。`
    : "尚未准备原剧本。先粘贴剧本；若上传视频，请先转成对白文字。";
}

function setSourceInputTab(mode) {
  const selected = ["text", "video", "link"].includes(mode) ? mode : "text";
  state.sourceInputTab = selected;
  document.querySelectorAll("[data-source-input]").forEach(button => {
    const active = button.dataset.sourceInput === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("videoDrop").classList.toggle("hidden", selected !== "video");
  $("videoDrop").classList.toggle("source-pane-active", selected === "video");
  document.querySelector("#sourceCard .text-source")?.classList.toggle("hidden", selected !== "text");
  $("linkCard").classList.toggle("hidden", state.workMode === "original" || selected !== "link");
  document.querySelector("#sourceCard .speech-box")?.classList.toggle("hidden", selected === "text" || (selected === "link" && !state.videoId));
  syncSourceMode();
}

function rewriteDurationProblem(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 15) return "剧本转视频预计总时长至少0.25分钟，请填写有效数字。";
  return "";
}

function updateDuration() {
  if (state.workMode === "original") {
    const unit = $("originalEpisodeUnit").value;
    const raw = Math.max(1, Number($("originalEpisodeValue").value) || 15);
    const episodeSeconds = Math.max(1, Math.min(1800, Math.round(raw * (unit === "minutes" ? 60 : 1))));
    const episodeCount = Math.max(1, Math.min(200, Math.round(Number($("originalEpisodeCount").value) || 1)));
    $("originalEpisodeCount").value = episodeCount;
    const total = episodeSeconds * episodeCount;
    const episodeLabel = unit === "minutes" ? `${raw}分钟` : `${episodeSeconds}秒`;
    const totalLabel = total >= 3600
      ? `${Math.floor(total / 3600)}小时${Math.floor(total % 3600 / 60)}分${String(total % 60).padStart(2, "0")}秒`
      : `${Math.floor(total / 60)}分${String(total % 60).padStart(2, "0")}秒`;
    $("originalDurationSummary").textContent = `${episodeCount}集 × ${episodeLabel} · ${totalLabel}（体量参考，不自动切集）`;
    $("episodeBadge").textContent = `${episodeCount}集 × ${episodeLabel} · ${totalLabel}`;
    localStorage.setItem("drama-original-duration", JSON.stringify({ raw, unit, episodeCount }));
    return total;
  }
  const episodeSeconds = 15;
  $("episodeSeconds").value = episodeSeconds;
  const minutes = Number($("durationMinutes").value);
  const longForm = minutes > 15 || $("sourceText").value.length > 24000;
  $("durationMinutes").removeAttribute("max");
  const seconds = Math.round(minutes * 60);
  if ($("rewriteProcessHint")) $("rewriteProcessHint").textContent = longForm
    ? "根据总时长或原稿长度自动分批生成，最终合并为一份完整剧本。索引、规划、正文和检查按实际调用计费；时长越长，调用次数、耗时与费用通常越多。预计总时长仅为体量参考，不保证成片时长。"
    : "当前体量使用一次模型调用输出完整剧本。总时长超过15分钟或原稿超过24000字时自动分批；不改变故事风格和年代设定。剧中资产单独识别、单独计费。";
  $("episodeBadge").textContent = `预计约${minutes}分钟 · 输出可能有偏差`;
  localStorage.setItem("drama-episode-seconds", String(episodeSeconds));
  return seconds;
}

function updateRewriteDurationControls() {
  const original = state.workMode === "original";
  $("durationMinutesField")?.classList.toggle("hidden", original);
  $("episodeSecondsField")?.classList.add("hidden");
  $("assetCapHint")?.classList.toggle("hidden", original);
  for (const id of ["peopleMode", "sceneMode", "propMode"]) {
    const select = $(id);
    if (!select.dataset.originalOptions) select.dataset.originalOptions = select.innerHTML;
    if (!original) {
      const old = select.value;
      select.innerHTML = '<option value="keep">由剧情决定</option><option value="custom">设置数量上限</option>';
      select.value = old === "custom" ? "custom" : "keep";
    } else {
      const old = select.value;
      select.innerHTML = select.dataset.originalOptions;
      select.value = old;
    }
  }
  if ($("episodeSeconds")) { $("episodeSeconds").value = 15; $("episodeSeconds").readOnly = true; }
  if ($("episodeSecondsLabel")) $("episodeSecondsLabel").textContent = "单个分镜片段时长（秒）";
  if ($("episodeSecondsHint")) $("episodeSecondsHint").textContent = "每段固定15秒；镜头按情节拆分，时间精度0.1秒，不限定镜头数量。";
}

function updateRewriteCustomFields() {
  $("customPlatformField")?.classList.toggle("hidden", $("platform")?.value !== "__custom__");
  $("customAudienceField")?.classList.toggle("hidden", $("audience")?.value !== "__custom__");
  $("customStoryStyleField")?.classList.toggle("hidden", $("storyStyle")?.value !== "__custom__");
  $("customRewriteEraField")?.classList.toggle("hidden", $("rewriteEra")?.value !== "__custom__");
}

function setTargetOption(selectId, customId, value) {
  if (value === undefined || value === null || !String(value).trim()) return;
  const select = $(selectId);
  const label = String(value).trim();
  if ([...select.options].some(option => option.value === label)) select.value = label;
  else { select.value = "__custom__"; $(customId).value = label; }
  updateRewriteCustomFields();
  if (selectId === "platform") window.syncPlatformPicker?.();
}

function selectedRewriteStyle(selectId, customId, fallback) {
  return $(selectId)?.value === "__custom__" ? ($(customId)?.value.trim() || fallback) : ($(selectId)?.value || fallback);
}

function setOriginalType(type) {
  state.originalType = ["emotional_commerce", "live_action_ai", "ai_comic"].includes(type) ? type : "emotional_commerce";
  state.hallView = "channel";
  state.hallPage = 1;
  document.querySelectorAll(".original-type").forEach(button => button.classList.toggle("active", button.dataset.originalType === state.originalType));
  document.querySelectorAll(".hall-channel").forEach(button => button.classList.toggle("active", button.dataset.hallType === state.originalType));
  $("hallFavoritesTab")?.classList.remove("active");
  $("hallDownloadsTab")?.classList.remove("active");
  const commerce = state.originalType === "emotional_commerce";
  $("commerceOptions").classList.toggle("hidden", !commerce);
  syncProductSettingsVisibility();
  const styles = { emotional_commerce: "真人生活流、克制催泪、竖屏近景", live_action_ai: "真人写实电影感、可拍可生成", ai_comic: "高识别角色、动态国风/现代漫剧" };
  if (!$("originalVisualStyle").value.trim()) $("originalVisualStyle").placeholder = styles[state.originalType];
  localStorage.setItem("drama-original-type", state.originalType);
  closeHallPlayer();
  if (!$('trendHall').classList.contains('original-trend-paused')) loadDailyHall(state.originalType, state.workMode === "original");
}

function captureCreationConfig() {
  return [...document.querySelectorAll('#rewriteCard input[id],#rewriteCard input[name="productPlacement"],#rewriteCard select[id],#rewriteCard textarea[id],#projectName')]
    .filter(node => node.type !== 'file')
    .map(node => ({id:node.id, name:node.name || '', value:node.value, checked:node.checked}));
}

function restoreCreationConfig(items) {
  (Array.isArray(items) ? items : []).forEach(item => {
    if (!item || typeof item !== 'object') return;
    const node = item.id ? $(item.id) : item.name === 'productPlacement' ? [...document.querySelectorAll('#rewriteCard input[name="productPlacement"]')].find(input => input.value === item.value) : null;
    if (!node || (!node.closest('#rewriteCard') && node.id !== 'projectName')) return;
    node.value = item.value;
    if (typeof item.checked === 'boolean') node.checked = item.checked;
  });
}

function setCreationLayout() {
  // Both creation modes always use balanced columns, ignoring legacy choices.
  document.body.dataset.creationLayout = 'dual';
  $('creationLayoutSwitch')?.remove();
  for (const mode of ['original', 'rewrite']) {
    localStorage.removeItem(`drama-layout-${mode}`);
    localStorage.removeItem(`drama-layout-choice-${mode}`);
  }
}

let imageWatermarkReturn = {mode: "rewrite", projectCenter: false};
function setWorkMode(mode, projectCenter = false, preserveCreationNavigation = false) {
  if (mode === "image-watermark" && state.workMode !== mode) {
    imageWatermarkReturn = {mode: state.workMode, projectCenter: $("workflowFrame").dataset.projectCenter === "1"};
  }
  if (!preserveCreationNavigation && mode !== state.workMode) creationNavigationEpoch += 1;
  // Retired entries may remain in saved preferences or old navigation links.
  // Resume the original workflow without loading their embedded pages.
  if (mode === 'workflow-new' || mode === 'script-align') mode = 'workflow';
  if (!state.creationConfigDefaults) {
    state.creationConfigDefaults = captureCreationConfig();
    try { state.creationConfigs = JSON.parse(localStorage.getItem('drama-creation-configs-v1') || '{}'); } catch (_) { state.creationConfigs = {}; }
    if (!state.creationConfigs || typeof state.creationConfigs !== 'object' || Array.isArray(state.creationConfigs)) state.creationConfigs = {};
    state.creationResults = {};
  }
  if (["ecommerce", "store", "advertising"].includes(mode) &&
      (!state.licenseValid || !state.features.includes(mode) || state.featureStatus[mode]?.state === "disabled")) mode = "rewrite";
  document.body.classList.toggle("visual-project-center-mode", mode === "workflow" && projectCenter);
  $("workflowFrame").dataset.projectCenter = projectCenter ? "1" : "0";
  $("workflowFrame").contentWindow?.postMessage({type:"visual-center-view",open:projectCenter}, location.origin);
  const previousMode = state.workMode;
  if (mode !== previousMode) saveMarketingSession262(previousMode);
  if (mode !== previousMode && ['original','rewrite'].includes(previousMode)) {
    state.creationConfigs[previousMode] = captureCreationConfig();
    try { localStorage.setItem('drama-creation-configs-v1', JSON.stringify(state.creationConfigs)); } catch (_) { /* Keep current settings in memory if local storage is full. */ }
    if (state.result?.settings?.creationMode === previousMode) state.creationResults[previousMode] = state.result;
  }
  state.workMode = ["original", "workflow", "breakdown", "canvas", "prompt-reverse", "characters", "subtitle-removal", "image-watermark", "novel-screenplay", "ecommerce", "store", "advertising"].includes(mode) ? mode : "rewrite";
  if (state.workMode !== previousMode) restoreMarketingSession262(state.workMode);
  window.WorkbenchTutorials?.setSection(state.workMode);
  setCreationLayout();
  const original = state.workMode === "original";
  const workflow = state.workMode === "workflow";
  const scriptAlignment = state.workMode === "script-align";
  const storyWorkflow = state.workMode === "workflow-new";
  $("storyWorkflowCard").classList.toggle("hidden", !storyWorkflow);
  if (storyWorkflow && !$("storyWorkflowFrame").getAttribute("src")) $("storyWorkflowFrame").src = "/static/story_workflow.html";
  const future = ["store", "advertising"].includes(state.workMode);
  const ecommerce259 = state.workMode === 'ecommerce';
  $('ecommerceCard259').classList.toggle('hidden', !ecommerce259);
  const ecommerceFrame = $('ecommerceFrame259');
  if (ecommerce259 && !ecommerceFrame.hasAttribute('src')) {
    ecommerceFrame.src = '/static/ecommerce259.html?entry=showcase';
  } else if (ecommerceFrame.hasAttribute('src')) {
    ecommerceFrame.contentWindow?.postMessage({
      type: ecommerce259 ? 'ecommerce-showcase-open' : 'ecommerce-showcase-hide',
    }, location.origin);
  }
  const breakdown = state.workMode === "breakdown";
  const canvas = state.workMode === "canvas";
  const promptReverse = state.workMode === "prompt-reverse";
  const subtitleRemoval = state.workMode === 'subtitle-removal';
  $('subtitleRemovalCard').classList.toggle('hidden', !subtitleRemoval);
  if (subtitleRemoval && !$('subtitleRemovalFrame').getAttribute('src')) $('subtitleRemovalFrame').src = '/static/subtitle_removal242.html';
  const imageWatermark = state.workMode === "image-watermark";
  $("imageWatermarkCard").classList.toggle("hidden", !imageWatermark);
  if (imageWatermark && !$("imageWatermarkFrame").hasAttribute("src")) $("imageWatermarkFrame").src = "/static/image_watermark247.html";
  const novelScreenplay = state.workMode === "novel-screenplay";
  $("novelScreenplayCard").classList.toggle("hidden", !novelScreenplay);
  if (novelScreenplay && !$("novelScreenplayFrame").hasAttribute("src")) $("novelScreenplayFrame").src = "/static/novel_screenplay249.html";
  $("promptReverseCard").classList.toggle("hidden", !promptReverse);
  if (promptReverse && !$("promptReverseFrame").getAttribute("src")) $("promptReverseFrame").src = "/static/prompt_reverse.html";
  const characters = state.workMode === 'characters';
  $("charactersCard").classList.toggle('hidden', !characters);
  if (characters && !$("charactersFrame").getAttribute('src')) $("charactersFrame").src = '/static/characters.html';
  document.body.classList.toggle('characters-mode', characters);
  document.body.classList.toggle('canvas-mode', canvas);
  $("canvasCard").classList.toggle('hidden', !canvas);
  if (canvas && !$("canvasFrame").getAttribute('src')) $("canvasFrame").src = '/static/video_canvas.html';
  document.body.classList.toggle("breakdown-mode", breakdown);
  document.body.classList.toggle("workflow-mode", workflow || storyWorkflow || scriptAlignment || breakdown || canvas || promptReverse || characters || subtitleRemoval || imageWatermark || novelScreenplay || ecommerce259);
  $("moduleTutorial")?.classList.toggle("hidden", scriptAlignment || storyWorkflow);
  $("breakdownCard").classList.toggle("hidden", !breakdown);
  if (breakdown && !$("breakdownFrame").getAttribute("src")) $("breakdownFrame").src = "/static/breakdown.html";
  document.body.classList.toggle("future-mode", future);
  $("workflowCard").classList.toggle("hidden", !workflow);
  $("scriptAlignmentCard").classList.toggle("hidden", !scriptAlignment);
  if (scriptAlignment && !$("scriptAlignmentFrame").getAttribute("src")) $("scriptAlignmentFrame").src = "/static/script_alignment.html";
  $("futureCard").classList.toggle("hidden", !future);
  if (future) {
    if (state.workMode === "store") initializeStoreBuilder();
    $("marketingStrength").value = state.marketingStrengths[state.workMode];
    $("marketingStrengthValue").textContent = `${$("marketingStrength").value}%`;
    const strategies = {ecommerce:"建议中度参考：沿用成交节奏与镜头类型，商品、话术和场景全部换成自己的。",store:"建议较强参考：沿用探店路线和体验顺序，门店信息、人物和画面全部换成自己的。",advertising:"建议轻度参考：只吸收情绪与镜头语言，品牌概念和视觉符号重新设计。"};
    $("marketingReferenceStrategy").textContent = strategies[state.workMode];
    document.querySelectorAll(".marketing-specialist").forEach(panel => panel.classList.toggle("hidden", panel.dataset.specialist !== state.workMode));
    const modules = {
      ecommerce: ["AI电商宣传片", "把真实商品资料转成强卖点、可拍摄、可生成的成交型镜头脚本。"],
      store: ["AI探店宣传片", "把门店路线、环境、服务、招牌项目和到店理由组织成完整探店分镜。"],
      advertising: ["AI广告宣传片", "围绕品牌主张、视觉符号和产品优势，生成风格统一的商业广告分镜。"],
    };
    const [title, description] = modules[state.workMode];
    $("futureModuleTitle").textContent = title;
    $("futureModuleDescription").textContent = description;
    const fields = {
      ecommerce: ["商品/品牌名称 *", "核心卖点与真实依据 *", "产品图、包装、使用场景、必须出现的信息"],
      store: ["门店名称 *", "招牌项目、环境、服务与到店理由 *", "门头、路线、环境、服务流程、菜品/项目素材"],
      advertising: ["品牌/产品名称 *", "品牌主张、产品优势与真实证据 *", "Logo、品牌色、产品、人物和必须出现的视觉元素"],
    }[state.workMode];
    $("marketingSubjectLabel").textContent = fields[0];
    $("marketingSellingLabel").textContent = fields[1];
    $("marketingMaterials").placeholder = fields[2];
    if (state.workMode === "store") {
      $("generateMarketingPlan").textContent = state.marketingMode === "original" ? "生成原创探店分镜" : "一键拆解并复刻探店视频";
      $("marketingStatus").textContent = state.marketingMode === "original" ? "填写门店、形象、音色和套餐资料，AI会先写探店脚本与视频提示词。" : "上传有权使用的参考片，拆解完成后替换为自己的门店素材。";
    }
  }
  if (workflow) {
    if (state.result?.structure) {
      let existing = {};
      try { existing = JSON.parse(localStorage.getItem("dramaVisualSource") || "{}"); } catch (_) {}
      // 历史记录/“一键做剧”已经写入了明确来源时，不允许旧页面结果覆盖它。
      if (!existing.structure || !existing.sourceType || existing.structure === state.result.structure) {
        localStorage.setItem("dramaVisualSource", JSON.stringify({ structure: state.result.structure, projectName: $("projectName").value || "未命名短剧", sourceType: "internal", resultKind: state.result.resultKind, assets: state.result.assets, scriptVersion: state.result.scriptVersion, durationSeconds: state.result.settings?.durationSeconds, savedAt: new Date().toISOString() }));
      }
    }
    if (!$("workflowFrame").getAttribute("src")) $("workflowFrame").src = "/static/visual.html?embedded=1";
  }
  if (original && previousMode !== "original") {
    state.rewriteProductEnabled = $("productEnabled").checked;
    $("productEnabled").checked = state.originalProductEnabled;
  }
  if (!original && previousMode === "original") {
    state.originalProductEnabled = $("productEnabled").checked;
    $("productEnabled").checked = state.rewriteProductEnabled;
  }
  document.querySelectorAll(".work-mode-tab").forEach(button => button.classList.toggle("active", button.dataset.workMode === state.workMode));
  $("originalCard").classList.toggle("hidden", !original);
  $("sourceCard").classList.toggle("hidden", original);
  $("linkCard").classList.toggle("hidden", original || state.sourceInputTab !== "link");
  $("sourceAnalysisCard")?.classList.toggle("hidden", original);
  if (!original) setSourceInputTab(state.sourceInputTab || "text");
  $("rewriteProposalSection")?.classList.toggle("hidden", original);
  updateRewriteDurationControls();
  $("similarityField").classList.toggle("hidden", original);
  $("firstStepLink").dataset.target = original ? "originalCard" : "sourceCard";
  $("firstStepTitle").textContent = original ? "原创设定" : "导入素材";
  $("firstStepHint").textContent = original ? "类型与故事" : "视频或文案";
  document.querySelector('.step-link[data-target="rewriteCard"] b').textContent = original ? "创作配置" : "改写配置";
  document.querySelector('.step-link[data-target="rewriteCard"] small').textContent = original ? "资产与商业" : "时长与资产";
  $("rewriteTitle").textContent = original ? "原创资产与商业配置" : "改写配置";
  $("rewriteDescription").textContent = original ? "人物、场景、物品和产品参数将成为原创剧本的硬约束。" : "按原剧本、平台、观众、剧情强度和剧本转视频预计总时长生成改写剧本。";
  $("generateTitle").textContent = original ? "生成完整原创短剧" : "生成改写剧本";
  $("generateDescription").textContent = original ? "按已确认设定生成普通原创剧本，包含场次、动作、对白与结局；长篇分批创作后合并为一份完整版本。分镜请在后续工作流制作。" : "按设定一次调用生成完整故事；成稿资产可在工作流中单独识别。";
  $("generationSpeed")?.closest("label")?.classList.add("hidden");
  $("rewriteProcessHint")?.classList.toggle("hidden", original);
  $("generateBtnLabel").textContent = original ? "开始原创" : "开始改写";
  $("emptyResult").querySelector("p").textContent = original ? "完成原创设定后点击“开始原创”。" : "完成前面配置后点击“开始改写”。";
  const transcriptTab = document.querySelector('[data-result="transcript"]');
  transcriptTab?.classList.toggle("hidden", original);
  if (original && state.activeResult === "transcript") showResult("structure");
  if (original) setOriginalType(state.originalType);
  else $("commerceOptions").classList.remove("hidden");
  syncProductSettingsVisibility();
  localStorage.setItem("drama-work-mode", state.workMode);
  window.requestAnimationFrame?.(()=>document.querySelectorAll('iframe').forEach(frame=>{
    try{frame.contentWindow?.postMessage({type:'nanbudo:module-active251',active:frame.getClientRects().length>0},location.origin);}catch(_){}
  }));
  const finalModel = stageModelSelect("final-generate");
  if (finalModel) finalModel.dataset.modelOperation = original ? "original" : "rewrite";
  $("rewriteConfigActions")?.classList.toggle("hidden", original);
  if (['original','rewrite'].includes(state.workMode) && (previousMode !== state.workMode || !state.creationConfigLoaded)) {
    restoreCreationConfig(state.creationConfigs[state.workMode] || state.creationConfigDefaults);
    state.creationConfigLoaded = true;
    updateRewriteCustomFields();
    [['peopleMode','peopleCount'],['sceneMode','sceneCount'],['propMode','propCount']].forEach(([modeId,countId]) => updateCountInput(modeId,countId));
    window.syncPlatformPicker?.();
    syncProductSettingsVisibility();
    const ownResult = state.creationResults[state.workMode];
    state.result = ownResult || null;
    // Each creation mode owns its result slot. Never leave the other mode's
    // manuscript visible while switching tabs or while its task is running.
    if (ownResult) renderResult(ownResult, true);
    else {
      $("resultArea").classList.add("hidden");
      $("emptyResult").classList.remove("hidden");
      $("scriptEditorPanel")?.classList.add("hidden");
      $("rewriteBillingSummary").textContent = "";
      $("acceptContinuation")?.classList.add("hidden");
      $("resumeLongRewrite")?.classList.add("hidden");
    }
  }
  syncCreationTaskView();
  updateDuration();
  updateFeatureLockUI();
  updateTextModelEstimate();
  renderStageModelSelectors();
}

function updateFeatureLockUI() {
  const feature = state.workMode;
  const controlled = ["rewrite", "original", "workflow", "ecommerce", "store", "advertising"].includes(feature);
  const locked = controlled && !state.features.includes(feature);
  const future = ["ecommerce", "store", "advertising"].includes(feature);
  const card = $("futureCard");
  if (future && card) {
    let banner = card.querySelector(".feature-lock-banner");
    if (locked && !banner) { banner = document.createElement("div"); banner.className = "feature-lock-banner"; card.prepend(banner); }
    if (banner) { banner.textContent = state.featureStatus[feature]?.state === "disabled" ? "管理员暂时禁用了这个功能，请联系管理员。" : "未解锁 · 内测修改中，暂不支持自助解锁；当前仅可浏览功能说明。"; banner.classList.toggle("hidden", !locked); }
    card.querySelectorAll("button,input,textarea,select").forEach(node => { if (!node.closest(".feature-lock-banner") && !node.classList.contains("marketing-mode")) node.disabled = locked; });
  }
  document.querySelectorAll(".work-mode-tab").forEach(button => {
    const mode = button.dataset.workMode;
    const beta = ["ecommerce", "store", "advertising"].includes(mode);
    const accessMode = ({ "workflow-new": "workflow", "image-watermark": "subtitle-removal", "novel-screenplay": "rewrite" })[mode] || mode;
    const unavailable = !state.licenseValid || !state.features.includes(accessMode) || state.featureStatus[accessMode]?.state === "disabled";
    button.classList.toggle("feature-locked", unavailable);
    if (beta) {
      button.disabled = unavailable;
      button.setAttribute("aria-disabled", String(unavailable));
      button.title = unavailable ? "内测中 · 后台未解锁，暂不开放" : "内测中 · 已获后台授权";
    }
  });
  if (future && locked) { setWorkMode("rewrite"); return; }
  if (["rewrite", "original"].includes(feature)) {
    const running = Boolean(state.creationBusy[feature] || state.creationTasks[feature]);
    $("generateBtn").disabled = locked || running;
    $("generateBtn").title = locked ? "此功能已被管理员关闭，请联系管理员。" : running ? "本板块正在生成，另一个板块可以独立提交" : "";
  }
  document.querySelectorAll("[data-feature-status]").forEach(node => {
    const feature = node.dataset.featureStatus;
    const info = state.featureStatus[feature] || {};
    const active = info.state === "active" || state.features.includes(feature);
    const disabled = info.state === "disabled";
    node.textContent = disabled ? "功能暂被禁用" : active ? "已解锁 · 内测授权" : "未解锁 · 暂不支持自助解锁";
    node.classList.toggle("active", active);
    node.classList.toggle("disabled", disabled);
  });
}

function workflowRemainingText(expiresAt) {
  const seconds = Math.max(0, Number(expiresAt || 0) - Date.now() / 1000);
  if (seconds <= 0) return "已到期";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days) return `剩余 ${days}天${hours ? `${hours}小时` : ""}`;
  if (hours) return `剩余 ${hours}小时`;
  return `剩余 ${Math.max(1, Math.ceil(seconds / 60))}分钟`;
}

function renderCardTimeRemainingTop() {
  const node = $("cardTimeRemainingTop");
  if (!node) return;
  const value = node.querySelector("b");
  const expiresAt = Number(state.cardExpiresAt || 0);
  node.classList.toggle("expired", state.licenseValid && expiresAt > 0 && expiresAt < Date.now() / 1000);
  value.textContent = state.featureAccessError ? "读取失败" : !state.licenseValid ? "未激活" : !expiresAt ? "有效期未知" : expiresAt >= 4102444800 ? "长期有效" : workflowRemainingText(expiresAt).replace(/^剩余\s*/, "");
  node.title = state.licenseValid && expiresAt > 0 && expiresAt < 4102444800 ? `卡密有效期至 ${new Date(expiresAt * 1000).toLocaleString("zh-CN")}` : `卡密状态：${value.textContent}`;
}

function renderBasicAccess() {
  document.querySelectorAll("[data-basic-feature]").forEach(node => {
    const active = !state.featureAccessError && state.licenseValid && state.features.includes(node.dataset.basicFeature);
    node.classList.toggle("active", active);
    node.classList.toggle("disabled", !active);
    node.classList.toggle("checking", false);
    if (state.featureAccessError) node.textContent = "授权异常";
    else if (!active) node.textContent = "未激活";
    else if (state.cardExpiresAt >= 4102444800) node.textContent = "长期有效";
    else node.textContent = workflowRemainingText(state.cardExpiresAt).replace(/^剩余\s*/, "");
  });
}

function renderWorkflowAccess() {
  const button = $("workflowAccessAction");
  if (!button) return;
  const expiry = $("workflowIconExpiry");
  const stateLabel = button.querySelector(".workflow-access-state");
  const info = state.featureStatus.workflow || {};
  button.className = "work-mode-tab workflow-mode-entry";
  button.disabled = state.workflowUnlockBusy;
  const message = value => { if (stateLabel) stateLabel.textContent = value; };
  const badge = value => { if (expiry) { expiry.textContent = value; expiry.className = "module-access-status"; } };
  if (state.workflowUnlockBusy) { badge("正在解锁"); message("项目化生成参考图与分镜视频 · 正在解锁"); button.dataset.action = "busy"; return; }
  if (state.featureAccessError) { badge("授权异常"); message("项目化生成参考图与分镜视频 · 点击卡片重试"); button.dataset.action = "retry"; return; }
  if (!state.licenseValid) { badge("未激活"); message("项目化生成参考图与分镜视频 · 请先激活卡密"); button.classList.add("disabled"); button.disabled = true; button.dataset.action = "unlicensed"; return; }
  if (info.state === "disabled") { badge("已关闭"); message("项目化生成参考图与分镜视频 · 功能暂被禁用"); button.classList.add("disabled"); button.disabled = true; button.dataset.action = "disabled"; return; }
  if (info.state === "active" || state.features.includes("workflow")) {
    badge(info.source === "subscription" && info.expiresAt
      ? workflowRemainingText(info.expiresAt).replace(/^剩余\s*/, "")
      : state.cardExpiresAt >= 4102444800 ? "长期有效" : workflowRemainingText(state.cardExpiresAt).replace(/^剩余\s*/, ""));
    message("项目化生成参考图与分镜视频 · 点击进入");
    button.classList.add("active"); button.dataset.action = "open"; return;
  }
  badge("未解锁");
  message("项目化生成参考图与分镜视频 · 未解锁");
  button.classList.add("disabled");
  button.disabled = true;
  button.dataset.action = "locked";
}

async function loadFeatureAccess() {
  try {
    const response = await fetch("/api/license/status", {cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "授权读取失败");
    state.licenseValid = Boolean(data.licensed);
    state.features = state.licenseValid && Array.isArray(data.features) ? data.features : [];
    state.featureStatus = state.licenseValid && data.featureStatus && typeof data.featureStatus === "object" ? data.featureStatus : {};
    state.licensePoints = state.licenseValid ? Number(data.points || 0) : 0;
    state.cardExpiresAt = Number(data.expiresAt || 0);
    state.featureAccessError = false;
  } catch (_) { state.featureAccessError = true; state.licenseValid = false; state.features = []; }
  updateFeatureLockUI();
  renderBasicAccess();
  renderWorkflowAccess();
  renderCardTimeRemainingTop();
}

async function handleWorkflowAccessAction() {
  const button = $("workflowAccessAction");
  if (button.dataset.action === "open") { setWorkMode("workflow"); return; }
  if (button.dataset.action === "retry") { await loadFeatureAccess(); return; }
  if (button.dataset.action === "locked") toast("短剧工作流属于卡密套餐；若被单独关闭，请联系管理员恢复权限。", true);
}


function initializeStoreBuilder() {
  if (!$("storeIndustry")) return;
  if ($("storeIndustry").dataset.ready !== "1") {
    $("storeIndustry").innerHTML = STORE_INDUSTRIES.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("") + '<option value="__custom__">其他 / 自定义行业</option>';
    $("storeIndustry").dataset.ready = "1";
  }
  window.StoreVisit?.enter();
  syncStoreBuilderVisibility();
  updateStoreMaterialSummary();
}

function syncStoreBuilderVisibility() {
  if (!$("storeIndustry")) return;
  $("storeCustomIndustryField").classList.toggle("hidden", $("storeIndustry").value !== "__custom__");
  $("storePackagePanel").classList.toggle("hidden", !$("storeExplainPackage262").checked && !$("storeSpeakPrice262").checked);
  $("storeVoiceFileField")?.classList.toggle("hidden", $("storeVoice").value !== "custom");
}

function marketingDurationSeconds() {
  const value = $("marketingDuration").value;
  const duration = value === "custom" ? Number($("marketingCustomDuration").value) : Number(value);
  return Math.max(15, Math.min(600, Math.round(duration || 30)));
}

function fileNames(files) { return [...(files || [])].map(file => file.name).filter(Boolean); }

function updateStoreMaterialSummary() {
  if (!$("storeMaterialSummary")) return;
  const card = selectedStorePersona();
  const persona = card?.id ? `角色卡：${card.name}` : "请先在数字人保存并选择角色卡";
  const voice = card?.voiceName ? `绑定声音：${card.voiceName}（本次不自动合成）` : "未绑定声音";
  const counts = StoreVisit.materialCounts();
  $("storeMaterialSummary").textContent = `${persona} · 门店场景${counts.scenes}张 · 产品/套餐${counts.products}张 · ${voice}`;
}

function selectedStorePersona() {
  return window.StoreVisit?.selected() || {id:"",name:"",voiceId:"",source:"character_library"};
}

function storeDetailsPayload() {
  const industry = $("storeIndustry").value === "__custom__" ? $("storeCustomIndustry").value.trim() : $("storeIndustry").value;
  const packageValue = prefix => ({
    name:$(prefix + "PackageName").value.trim(), originalPrice:$(prefix + "OriginalPrice").value.trim(),
    groupPrice:$(prefix + "GroupPrice").value.trim(), contents:$(prefix + "PackageContents").value.trim(), rules:$(prefix + "PackageRules").value.trim(),
  });
  return {
    industry, videoType:$("storeVideoType").value, creativeBrief:$("storeCreativeBrief").value.trim(),
    presentation262:{explainPackage:$("storeExplainPackage262").checked,speakPrice:$("storeSpeakPrice262").checked,includeAddress:$("storeIncludeAddress262").checked},
    route:$("storeRoute").value.trim(), experience:$("storeExperience").value.trim(), action:$("storeAction").value.trim(),
    persona:selectedStorePersona(), personaDirection:$("storePersonaDirection").value.trim(),
    voice:{id:selectedStorePersona().voiceId || "", source:selectedStorePersona().voiceSource || "", automaticSynthesis:false},
    packages:{primary:packageValue("storePrimary"), secondary:packageValue("storeSecondary")},
    assets:{personaFiles:fileNames(state.storeFiles.persona), sceneFiles:fileNames(state.storeFiles.scenes), productFiles:fileNames(state.storeFiles.products)},
  };
}


let marketingModeRevision262 = 0, marketingReferenceRevision262 = 0;
const marketingSessions262 = new Map();
let marketingDefaults262 = null;
const marketingStateKeys262 = ['marketingMode','marketingVideoId','marketingReferenceName','marketingReferenceAnalysis','marketingReferenceDuration','marketingPreviewObjectUrl'];
function captureMarketingSession262() {
  const fields = [...$('futureCard').querySelectorAll('input[id^="marketing"],select[id^="marketing"],textarea[id^="marketing"]')];
  return {
    fields: Object.fromEntries(fields.filter(field=>field.type!=='file').map(field=>[field.id,{value:field.value,checked:field.checked}])),
    referenceFiles: [...$('marketingVideoInput').files],
    referenceState: {text:$('marketingReferenceState').textContent,className:$('marketingReferenceState').className},
    preview: $('marketingPreview').getAttribute('src') || '',
    state: Object.fromEntries(marketingStateKeys262.map(key=>[key,state[key]])),
  };
}
function saveMarketingSession262(mode) {
  if (!['store','advertising'].includes(mode)) return;
  marketingSessions262.set(mode,captureMarketingSession262());
  state.marketingStrengths[mode]=Number($('marketingStrength').value)||70;
  ++marketingModeRevision262;
  ++marketingReferenceRevision262;
}
function restoreMarketingSession262(mode) {
  if (!['store','advertising'].includes(mode)) return;
  if (!marketingDefaults262) marketingDefaults262=captureMarketingSession262();
  const session=marketingSessions262.get(mode)||marketingDefaults262;
  for(const [id,value] of Object.entries(session.fields)) {
    $(id).value=value.value;
    if(typeof value.checked==='boolean')$(id).checked=value.checked;
  }
  Object.assign(state,session.state);
  const transfer=new DataTransfer();
  session.referenceFiles.forEach(file=>transfer.items.add(file));
  $('marketingVideoInput').files=transfer.files;
  const video=$('marketingPreview');
  if(session.preview)video.src=session.preview;
  else video.removeAttribute('src');
  video.classList.toggle('hidden',!session.preview);video.load();
  $('marketingReferenceState').textContent=session.referenceState.text;
  $('marketingReferenceState').className=session.referenceState.className;
  $('analyzeMarketingReference').disabled=!state.marketingVideoId;
  $('sendMarketingToWorkflow').disabled=!$('marketingResult').value.trim();
  $('marketingCustomDurationField').classList.toggle('hidden',$('marketingDuration').value!=='custom');
  setMarketingMode(state.marketingMode);
}
function marketingOwner(trackForm = true) {
  const mode = state.workMode;
  const owner = mode === 'store' ? StoreVisit.planningOwner() : null;
  const revision = mode === 'store' ? StoreVisit.planningRevision() : null;
  const modeRevision = marketingModeRevision262;
  const referenceRevision = marketingReferenceRevision262;
  return () => state.workMode === mode && referenceRevision === marketingReferenceRevision262 && (!trackForm || modeRevision === marketingModeRevision262) && (mode !== 'store' || owner !== null && owner === StoreVisit.planningOwner() && (!trackForm || revision === StoreVisit.planningRevision()));
}

function resetStorePlanning() {
  if (state.workMode !== 'store') {
    const session=marketingSessions262.get('store');
    if(session) {
      for(const id of ['marketingResult','marketingReferenceAnalysis','marketingShareLink'])if(session.fields[id])session.fields[id].value='';
      if(session.fields.marketingRightsConfirmed)session.fields.marketingRightsConfirmed.checked=false;
      if(session.state.marketingPreviewObjectUrl)URL.revokeObjectURL(session.state.marketingPreviewObjectUrl);
      Object.assign(session.state,{marketingVideoId:'',marketingReferenceName:'',marketingReferenceAnalysis:'',marketingReferenceDuration:0,marketingPreviewObjectUrl:''});
      session.preview='';session.referenceFiles=[];
      session.referenceState={text:'未导入参考片',className:'status-pill'};
    }
    return;
  }
  ++marketingModeRevision262;
  ++marketingReferenceRevision262;
  state.marketingVideoId = '';
  state.marketingReferenceName = '';
  state.marketingReferenceAnalysis = '';
  state.marketingReferenceDuration = 0;
  if (state.marketingPreviewObjectUrl) URL.revokeObjectURL(state.marketingPreviewObjectUrl);
  state.marketingPreviewObjectUrl = '';
  const video = $('marketingPreview');
  video.removeAttribute('src');
  video.classList.add('hidden');
  video.load();
  $('marketingVideoInput').value = '';
  $('marketingShareLink').value = '';
  $('marketingReferenceAnalysis').value = '';
  $('marketingRightsConfirmed').checked = false;
  $('marketingUploadProgress').classList.add('hidden');
  $('marketingReferenceState').className = 'status-pill';
  $('marketingReferenceState').textContent = '未导入参考片';
  $('analyzeMarketingReference').disabled = true;
  $('marketingResult').value = '';
  $('sendMarketingToWorkflow').disabled = true;
}

async function waitMarketingTask(taskId, ownsView = () => true) {
  while (true) {
    if (!ownsView()) return null;
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const task = await response.json();
    if (!ownsView()) return null;
    if (!response.ok) throw new Error(task.error || "无法读取任务状态。");
    if (ownsView()) window.ModelActivity?.task($("marketingStatus"),task,{success:"处理成功"});
    if (task.state === "done") return task.result || {};
    if (task.state === "error") throw new Error(task.error || "生成失败，请重试。");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

function setMarketingMode(mode) {
  if (state.marketingMode !== (mode === 'original' ? 'original' : 'remix')) ++marketingModeRevision262;
  state.marketingMode = mode === "original" ? "original" : "remix";
  document.querySelectorAll(".marketing-mode").forEach(button => button.classList.toggle("active", button.dataset.marketingMode === state.marketingMode));
  $("marketingReferencePanel").classList.toggle("hidden", state.marketingMode === "original");
  $("marketingStrengthField").classList.toggle("hidden", state.marketingMode === "original");
  $("marketingReferenceStrategy").classList.toggle("hidden", state.marketingMode === "original");
  $("generateMarketingPlan").textContent = state.workMode === "store"
    ? (state.marketingMode === "original" ? "生成原创探店分镜" : "一键拆解并复刻探店视频")
    : (state.marketingMode === "original" ? "生成原创商业片分镜" : "一键拆解并重创");
  $("marketingPace").querySelector('option[value="follow"]').disabled = state.marketingMode === "original";
  if (state.marketingMode === "original" && $("marketingPace").value === "follow") $("marketingPace").value = "balanced";
  $("marketingStatus").textContent = state.workMode === "store"
    ? (state.marketingMode === "original" ? "填写门店、形象、音色和套餐资料，AI会先写探店脚本与视频提示词。" : "导入参考片并填写自己的门店资料，可按相似度复刻为原创探店视频。")
    : (state.marketingMode === "original" ? "填写你的真实项目资料，AI将从零创作镜头脚本。" : "导入参考片并填写自己的真实资料，可一键完成原创重构。");
}

function setMarketingReference(data, previewUrl = "") {
  state.marketingVideoId = data.videoId || "";
  state.marketingReferenceName = data.originalName || data.name || "参考视频";
  state.marketingReferenceAnalysis = "";
  $("marketingReferenceAnalysis").value = "";
  $("analyzeMarketingReference").disabled = !state.marketingVideoId;
  const badge = $("marketingReferenceState");
  badge.className = "status-pill ready";
  badge.textContent = `已导入·${state.marketingReferenceName}`;
  if (state.marketingPreviewObjectUrl) URL.revokeObjectURL(state.marketingPreviewObjectUrl);
  state.marketingPreviewObjectUrl = previewUrl.startsWith("blob:") ? previewUrl : "";
  const video = $("marketingPreview");
  if (previewUrl) {
    video.src = previewUrl;
    video.classList.remove("hidden");
    video.load();
  }
}

function uploadMarketingVideo(file) {
  if (!file) return;
  if (!$("marketingRightsConfirmed").checked) {
    $("marketingVideoInput").value = "";
    return toast("请先确认拥有该素材的使用权或授权。", true);
  }
  ++marketingReferenceRevision262;
  const ownsView = marketingOwner(false);
  if (!ownsView()) return;
  const progress = $("marketingUploadProgress");
  progress.classList.remove("hidden");
  progress.querySelector("i").style.width = "0%";
  $("marketingReferenceState").className = "status-pill checking";
  $("marketingReferenceState").textContent = "正在上传";
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload");
  xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
  xhr.setRequestHeader("Content-Type", "application/octet-stream");
  xhr.upload.onprogress = event => {
    if (ownsView() && event.lengthComputable) progress.querySelector("i").style.width = `${event.loaded / event.total * 100}%`;
  };
  xhr.onload = async () => {
    if (!ownsView()) return;
    try {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400) throw new Error(data.error || "上传失败。");
      progress.querySelector("i").style.width = "100%";
      setMarketingReference(data, URL.createObjectURL(file));
      $("marketingStatus").textContent = "参考片已导入，正在拆解拍摄与转化方法…";
      await analyzeMarketingReference();
    } catch (error) {
      $("marketingReferenceState").className = "status-pill error";
      $("marketingReferenceState").textContent = "导入失败";
      toast(error.message, true);
    }
  };
  xhr.onerror = () => { if (ownsView()) toast("参考片上传失败，请确认本地软件仍在运行。", true); };
  xhr.send(file);
}

async function importMarketingLink() {
  const raw = $("marketingShareLink").value.trim();
  if (!raw) return toast("请粘贴分享文案或视频链接。", true);
  if (!$("marketingRightsConfirmed").checked) return toast("请先确认拥有该素材的使用权或授权。", true);
  ++marketingReferenceRevision262;
  const ownsView = marketingOwner(false);
  if (!ownsView()) return;
  const button = $("importMarketingLink");
  button.disabled = true;
  $("marketingReferenceState").className = "status-pill checking";
  $("marketingReferenceState").textContent = "正在解析";
  try {
    const analyzed = await postJson("/api/link/analyze", { url: raw, rightsConfirmed: true });
    if (!ownsView()) return;
    const imported = await postJson("/api/link/import", { url: analyzed.resolvedUrl || analyzed.normalizedUrl || raw, mediaToken: analyzed.mediaToken || "", rightsConfirmed: true });
    if (!ownsView()) return;
    setMarketingReference({ ...imported, originalName: analyzed.title || imported.name }, analyzed.previewUrl || "");
    $("marketingStatus").textContent = "链接视频已导入，正在拆解拍摄与转化方法…";
    await analyzeMarketingReference();
  } catch (error) {
    if (!ownsView()) return;
    $("marketingReferenceState").className = "status-pill error";
    $("marketingReferenceState").textContent = "解析失败";
    $("marketingStatus").textContent = error.message;
    toast(error.message, true);
  } finally { button.disabled = false; }
}

async function analyzeMarketingReference() {
  const ownsView = marketingOwner(false);
  if (!ownsView()) return;
  if (!state.marketingVideoId) return toast("请先导入参考视频。", true);
  if (state.busy) return toast("已有任务正在处理，请稍后。", true);
  state.busy = true;
  $("analyzeMarketingReference").disabled = true;
  $("marketingReferenceState").className = "status-pill checking";
  $("marketingReferenceState").textContent = "AI拆解中";
  try {
    const data = await postJson("/api/marketing/analyze", { videoId: state.marketingVideoId, mode: state.workMode, rightsConfirmed: $("marketingRightsConfirmed").checked, modelConfig: modelConfig() });
    const result = await waitMarketingTask(data.taskId, ownsView);
    if (!ownsView()) return;
    state.marketingReferenceAnalysis = result.analysis || "";
    state.marketingReferenceDuration = Number(result.frameMeta?.duration || 0);
    $("marketingReferenceAnalysis").value = state.marketingReferenceAnalysis;
    $("marketingReferenceState").className = "status-pill ready";
    $("marketingReferenceState").textContent = "拆解完成";
    $("marketingStatus").textContent = "参考片方法已拆解，填好你的项目资料后即可一键重创。";
    toast("参考片拆解完成。");
    return state.marketingReferenceAnalysis;
  } catch (error) {
    if (!ownsView()) return;
    $("marketingReferenceState").className = "status-pill error";
    $("marketingReferenceState").textContent = "拆解失败";
    $("marketingStatus").textContent = error.message;
    toast(error.message, true);
    return "";
  } finally {
    state.busy = false;
    $("analyzeMarketingReference").disabled = !state.marketingVideoId;
  }
}

async function generateMarketingPlan() {
  const ownsView = marketingOwner();
  if (!ownsView()) return;
  const projectName = $("marketingProjectName").value.trim();
  const subject = $("marketingSubject").value.trim();
  const sellingPoints = $("marketingSellingPoints").value.trim();
    const moduleDetails = {
    ecommerce: {scenario:$("ecommerceScenario").value.trim(), proof:$("ecommerceProof").value.trim(), action:$("ecommerceAction").value.trim()},
    store: {route:$("storeRoute").value.trim(), experience:$("storeExperience").value.trim(), action:$("storeAction").value.trim()},
    advertising: {claim:$("advertisingClaim").value.trim(), motif:$("advertisingMotif").value.trim(), ending:$("advertisingEnding").value.trim()},
  }[state.workMode] || {};
  const storeDetails = state.workMode === "store" ? storeDetailsPayload() : null;
  if (!projectName || !subject || !sellingPoints && state.workMode !== 'store') return toast("请先填写项目名称、主体名称和核心卖点。", true);
  if (state.workMode === "store") {
    if (!storeDetails.industry) return toast("请选择或填写所属行业。", true);
    if (!storeDetails.persona.id) return toast("请在数字人保存角色卡，然后在角色卡大厅选择人物。", true);
    if (storeDetails.presentation262.explainPackage && (!storeDetails.packages.primary.name || !storeDetails.packages.primary.contents)) return toast("详细介绍套餐请填写套餐名称和内容。", true);
  }
  if (state.busy) return toast("已有任务正在处理，请稍后。", true);
  if (state.marketingMode === "remix" && !state.marketingVideoId && (state.workMode !== 'store' || !$("marketingReferenceAnalysis").value.trim())) return toast("爆款拆解重创需要先上传视频或导入分享链接。", true);
  if (state.marketingMode === "remix" && !$("marketingReferenceAnalysis").value.trim()) {
    if (!state.marketingVideoId) return toast("爆款拆解重创需要先上传视频或导入分享链接。", true);
    const analysis = await analyzeMarketingReference();
    if (!analysis || !ownsView()) return;
  }
  const button = $("generateMarketingPlan");
  state.busy = true;
  button.disabled = true;
  $("sendMarketingToWorkflow").disabled = true;
  $("marketingStatus").textContent = "正在提交商业分镜任务…";
  try {
    const materialPayload = state.workMode === 'store' ? await StoreVisit.planningAssets() : {};
    if (!ownsView()) return;
    const data = await postJson("/api/marketing/generate", {
      ...materialPayload,
      mode: state.workMode,
      creationMode: state.marketingMode,
      projectName,
      subject,
      platform: $("marketingPlatform").value,
      duration: marketingDurationSeconds(),
      tone: $("marketingTone").value,
      audience: $("marketingAudience").value.trim(),
      sellingPoints,
      materials: $("marketingMaterials").value.trim(),
      moduleDetails,
      storeDetails,
      cta: $("marketingCta").value.trim(),
      referenceName: state.marketingReferenceName,
      referenceAnalysis: $("marketingReferenceAnalysis").value.trim(),
      referenceStrength: Number($("marketingStrength").value) || 70,
      pace: $("marketingPace").value,
      referenceDuration: state.marketingReferenceDuration,
      modelConfig: modelConfig(),
    });
    const result = await waitMarketingTask(data.taskId, ownsView);
    if (!ownsView()) return;
    $("marketingResult").value = result.structure || "";
    $("sendMarketingToWorkflow").disabled = !$("marketingResult").value.trim();
    $("marketingStatus").textContent = state.marketingMode === "remix" ? "已完成方法借鉴与原创重构，可修改后送入工作流。" : "原创时间轴分镜已生成，可修改后送入工作流。";
    $("marketingResult").scrollIntoView({ behavior: "smooth", block: "center" });
    toast("商业镜头脚本已生成。");
  } catch (error) {
    if (!ownsView()) return;
    $("marketingStatus").textContent = error.message;
    toast(error.message, true);
  } finally {
    state.busy = false;
    button.disabled = false;
  }
}

function sendMarketingToWorkflow() {
  if (!marketingOwner()()) return;
  const structure = $("marketingResult").value.trim();
  if (!structure) return toast("请先生成或粘贴商业镜头脚本。", true);
  localStorage.setItem("dramaVisualSource", JSON.stringify({
    structure,
    projectName: $("marketingProjectName").value.trim() || $("futureModuleTitle").textContent,
    sourceType: state.workMode,
    targetDuration: marketingDurationSeconds(),
    storeDetails: state.workMode === "store" ? storeDetailsPayload() : null,
    savedAt: new Date().toISOString(),
  }));
  $("workflowFrame").src = `/static/visual.html?embedded=1&source=${Date.now()}`;
  setWorkMode("workflow");
  toast("分镜已送入工作流，请新建项目后识别分镜。");
}

function selectedPlotType() {
  return $("originalPlotType").value === "__custom__" ? $("customPlotType").value.trim() : $("originalPlotType").value.trim();
}

function hallDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function hallCacheKey(type = state.originalType) {
  return `drama-daily-hall-v6-${hallDateKey()}-${type}`;
}

function pruneOldHallCaches() {
  const todayPrefix = `drama-daily-hall-v6-${hallDateKey()}-`;
  const obsolete = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    if (key.startsWith("drama-daily-hall-") && !key.startsWith(todayPrefix)) obsolete.push(key);
  }
  obsolete.forEach(key => localStorage.removeItem(key));
}

function currentHallWorkCount() {
  return Math.max(10, Math.min(50, Math.round(Number($("dailyWorkCount")?.value) || 10)));
}

function syncHallWorkCount() {
  const count = currentHallWorkCount();
  $("dailyWorkCount").value = String(count);
  localStorage.setItem("drama-daily-work-count", String(count));
  document.querySelectorAll("[data-hall-count]").forEach(node => { node.textContent = `每日${count}部`; });
  return count;
}

function loadDailyHall(type = state.originalType, autoUpdate = false) {
  pruneOldHallCaches();
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(hallCacheKey(type)) || "null"); } catch (_) { cached = null; }
  if (cached?.hotTypes?.length) {
    const works = cached.referenceWorks || [];
    if (works.length) prewarmHallWorks(cached.hotTypes, works, cached.message || "今日联网推荐已缓存。", type);
    else renderTrendHall(cached.hotTypes, [], cached.message || (type === "emotional_commerce" ? "情感带货可观看大厅正在筹备中。" : "正在自动补充今日榜单。"));
    if (works.length || type === "emotional_commerce") return true;
  }
  const workCount = currentHallWorkCount();
  renderTrendHall(hallPlotTypes(type), [], type === "emotional_commerce" ? "情感带货可观看大厅正在筹备中；题材库可正常使用。" : `正在获取并预热今日${workCount}部榜单剧目…`, { loading: type !== "emotional_commerce", total: workCount, ready: 0 });
  if (autoUpdate && type !== "emotional_commerce" && !state.hallLoadingTypes[type] && !state.busy) {
    setTimeout(() => requestHallRank(type), 180);
  }
  return false;
}

async function requestHallRank(type = state.originalType, force = false) {
  if (type === "emotional_commerce" || state.hallLoadingTypes[type]) return;
  state.hallLoadingTypes[type] = true;
  const workCount = currentHallWorkCount();
  if (state.originalType === type && state.hallView === "channel") {
    renderTrendHall(hallPlotTypes(type), [], `正在直接读取红果榜单并高速预热${workCount}部作品…`, { loading: true, total: workCount, ready: 0 });
  }
  try {
    const data = await postJson("/api/hall/rank", { originalType: type, workCount, force });
    const cached = { hotTypes: hallPlotTypes(type), referenceWorks: data.referenceWorks || [], requestedWorkCount: workCount, refreshedAt: new Date().toISOString(), message: data.message || "今日榜单已更新。" };
    localStorage.setItem(hallCacheKey(type), JSON.stringify(cached));
    if (state.originalType === type && state.hallView === "channel") {
      if (cached.referenceWorks.length) await prewarmHallWorks(cached.hotTypes, cached.referenceWorks, cached.message, type);
      else renderTrendHall(cached.hotTypes, [], "对应榜单暂时没有取得作品，请稍后刷新重试。");
    }
  } catch (error) {
    if (state.originalType === type && state.hallView === "channel") renderTrendHall(hallPlotTypes(type), [], `榜单暂时连接失败：${error.message}`);
  } finally {
    delete state.hallLoadingTypes[type];
    $("refreshHotTypes").disabled = false;
  }
}

function setPlotType(value) {
  const plotType = String(value || "").trim();
  if (!plotType) return;
  const select = $("originalPlotType");
  const exists = [...select.options].some(option => option.value === plotType);
  if (!exists) {
    const option = document.createElement("option");
    option.value = plotType;
    option.textContent = `今日推荐 · ${plotType}`;
    select.insertBefore(option, select.querySelector('option[value="__custom__"]'));
  }
  select.value = plotType;
  $("customPlotTypeField").classList.add("hidden");
  $("customPlotType").value = "";
}

function renderTrendHall(types = hallPlotTypes(), works = [], message = "内置精选题材，无需联网即可直接选择。", progress = null) {
  state.hallRenderTypes = types;
  state.hallRenderMessage = message;
  state.hallRenderProgress = progress;
  const count = Math.max(20, Math.min(50, Number($("hotTypeCount").value) || 30));
  const favoritesView = state.hallView === "favorites";
  const workCount = favoritesView ? state.hallFavorites.length : currentHallWorkCount();
  const visibleTypes = [...new Set(types.filter(Boolean))].slice(0, count);
  state.hallAllWorks = works.filter(item => item?.playableCandidate && item?.url).slice(0, workCount);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(state.hallAllWorks.length / pageSize));
  state.hallPage = Math.max(1, Math.min(pageCount, state.hallPage || 1));
  const pageStart = (state.hallPage - 1) * pageSize;
  state.hallWorks = state.hallAllWorks.slice(pageStart, pageStart + pageSize);
  const hallName = favoritesView ? "我的收藏" : (hallModeNames[state.originalType] || "短剧推荐大厅");
  const total = Number(progress?.total ?? workCount);
  const countText = progress?.loading ? `${state.hallAllWorks.length}/${total} 部已就绪` : `${state.hallAllWorks.length}${workCount ? `/${workCount}` : ""} 部`;
  const emptyText = favoritesView
    ? `<b>暂时没有收藏</b><span>在任意推荐剧目上点击“收藏”，或右键选择收藏后，就能在这里再次观看。</span>`
    : state.originalType === "emotional_commerce"
      ? `<b>情感带货可观看大厅正在筹备中</b><span>本版先不混入普通真人短剧；上方题材库和情感带货原创功能可以正常使用。</span>`
      : `<b>今日榜单暂时没有可直接播放的作品</b><span>软件会自动重新获取对应榜单，也可以点击“刷新今日推荐”立即重试。</span>`;
  const skeletons = progress?.loading ? `<div class="hall-prewarm-status"><b>高速预热中：${state.hallAllWorks.length}/${total}</b><span>缓存完成一部就显示一部，已出现的作品可立即播放。</span></div><div class="hall-poster-grid">${Array.from({ length: Math.min(4, Math.max(1, total - state.hallAllWorks.length)) }, () => `<div class="hall-poster-skeleton"><i></i><b></b><span></span></div>`).join("")}</div>` : "";
  const cards = state.hallWorks.length ? `<div class="reference-list hall-poster-grid">${state.hallWorks.map((item, index) => `<article class="reference-work hall-poster-card playable" data-work-index="${index}"><div class="work-poster"><div class="poster-fallback">剧</div>${item.coverUrl ? `<img src="${escapeHtml(item.coverUrl)}" alt="${escapeHtml(item.title)}封面" loading="lazy">` : ""}<video muted loop playsinline preload="none"></video><span class="poster-rank">${String(pageStart + index + 1).padStart(2, "0")}</span><span class="poster-preview-hint">悬停预览</span></div><div class="work-info"><div class="work-tags"><i>${escapeHtml(item.sourceLabel || item.plotType || "今日推荐")}</i><em>已缓存·可播放</em></div><h4 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h4><p>${escapeHtml(item.summary || "公开热播剧目")}</p></div><div class="work-actions"><button type="button" class="primary-btn" data-work-action="play">▶ 播放</button><button type="button" class="ghost-btn favorite-btn" data-work-action="favorite">${isHallFavorite(item) ? "★ 已收藏" : "☆ 收藏"}</button></div></article>`).join("")}</div>` : "";
  const pager = state.hallAllWorks.length > pageSize ? `<div class="hall-pagination"><button type="button" data-hall-page="${state.hallPage - 1}" ${state.hallPage <= 1 ? "disabled" : ""}>上一页</button><span>第 ${state.hallPage} / ${pageCount} 页</span><button type="button" data-hall-page="${state.hallPage + 1}" ${state.hallPage >= pageCount ? "disabled" : ""}>下一页</button></div>` : "";
  $("trendResults").innerHTML = `<div class="trend-head"><div><b>${hallName} · ${countText}</b><span>${escapeHtml(message)}</span></div>${favoritesView && state.hallFavorites.length ? `<button type="button" id="clearHallFavorites" class="ghost-btn danger">清空全部收藏</button>` : ""}</div>
    ${favoritesView ? "" : `<div class="hall-section-label topic"><b>① 热门题材参考库</b><span>题材只用于选择改写方向或生成原创剧本，不是具体剧目。</span></div><div class="trend-card-grid">${visibleTypes.map((item, index) => `<button type="button" class="trend-card" data-plot="${escapeHtml(item)}"><span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(item)}</b><small>选作原创题材</small></button>`).join("")}</div>`}
    <div class="hall-section-label works"><b>${favoritesView ? "收藏剧目" : `② ${hallName} · 今日可观看推荐`}</b><span>作品显示前已完成缓存；点击播放，右键可选集、整剧下载或导入改写。</span></div>
    ${cards}${pager}${skeletons}${!cards && !skeletons ? `<div class="hall-empty-works">${emptyText}</div>` : ""}`;
}

async function prewarmHallWorks(types, works, message, type = state.originalType, view = "channel") {
  const candidates = works.filter(item => item?.playableCandidate && item?.url).slice(0, view === "favorites" ? 200 : currentHallWorkCount()).map((item, index) => ({ ...item, _hallOrder: index }));
  const runId = ++state.hallPrewarmId;
  const ready = [];
  let failed = 0;
  let next = 0;
  const active = () => runId === state.hallPrewarmId && state.hallView === view && (view === "favorites" || state.originalType === type);
  if (active()) renderTrendHall(types, [], `正在高速缓存可播放内容；完成一部显示一部。`, { loading: true, total: candidates.length, ready: 0 });
  const worker = async () => {
    while (next < candidates.length) {
      const work = candidates[next++];
      try {
        await resolveHallWork(work);
        ready.push(work);
        ready.sort((a, b) => a._hallOrder - b._hallOrder);
      } catch (_) { failed += 1; }
      if (active()) renderTrendHall(types, ready, `高速预热中；成功${ready.length}部${failed ? `，跳过${failed}部暂不可用作品` : ""}。`, { loading: ready.length + failed < candidates.length, total: candidates.length, ready: ready.length });
    }
  };
  const concurrency = Math.min(candidates.length, (navigator.hardwareConcurrency || 4) >= 8 ? 4 : 3);
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (active()) renderTrendHall(types, ready, ready.length ? `${message} 已提前缓存，可直接观看。` : "榜单已取得，但视频平台连接暂时不可用；请稍后刷新重试。");
  return ready;
}

function showHallFavorites() {
  state.hallView = "favorites";
  state.hallPage = 1;
  document.querySelectorAll(".hall-channel").forEach(button => button.classList.toggle("active", button.id === "hallFavoritesTab"));
  closeHallPlayer();
  if (!state.hallFavorites.length) {
    ++state.hallPrewarmId;
    renderTrendHall([], [], "收藏只保存在这台电脑，不会上传服务器。");
    return;
  }
  prewarmHallWorks([], state.hallFavorites, "本地收藏已加载。", state.originalType, "favorites");
}

function downloadStateText(record) {
  if (record.state === "downloading") return `下载中 ${record.downloadedCount || 0}/${record.episodeCount || 0}集`;
  if (record.state === "partial") return `部分完成 ${record.downloadedCount || 0}/${record.episodeCount || 0}集`;
  if (record.state === "failed") return "下载失败，可重新下载";
  return `已完成 ${record.downloadedCount || 0}集`;
}

function renderHallDownloads() {
  const records = state.hallDownloads || [];
  $("hallDownloadCount").textContent = `${records.length}部`;
  const cards = records.map((record, index) => `<article class="downloaded-series-card hall-download-card" data-download-index="${index}">
    <div class="work-poster"><div class="poster-fallback">剧</div>${record.coverUrl ? `<img src="${escapeHtml(record.coverUrl)}" alt="${escapeHtml(record.title)}本地封面" loading="lazy">` : ""}<span class="download-local-badge">本地</span></div>
    <div class="work-info"><div class="work-tags"><i>我的下载</i><em>${escapeHtml(downloadStateText(record))}</em></div><h4 title="${escapeHtml(record.title)}">${escapeHtml(record.title)}</h4><p>${record.downloadedCount || 0}/${record.episodeCount || 0}集 · ${fmtSize(record.size || 0)} · ${escapeHtml(formatHistoryTime(record.updatedAt || record.createdAt))}</p></div>
    <div class="work-actions"><button type="button" class="primary-btn" data-download-action="play" ${record.downloadedCount ? "" : "disabled"}>▶ 本地播放</button><span>断网可看</span></div>
  </article>`).join("");
  $("trendResults").innerHTML = `<div class="trend-head"><div><b>我的下载 · ${records.length}部</b><span>整部剧保存在这台电脑，可按封面查找、选集并直接播放。</span></div><button type="button" id="refreshHallDownloads" class="ghost-btn">刷新记录</button></div>
    ${cards ? `<div class="hall-download-grid">${cards}</div>` : `<div class="hall-empty-works"><b>还没有下载记录</b><span>在推荐剧目上点击右键，选择“下载整部剧”，下载后会自动显示在这里。</span></div>`}`;
}

async function loadHallDownloads(render = true) {
  try {
    const response = await fetch("/api/hall/downloads", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取本地下载记录");
    state.hallDownloads = data.records || [];
    $("hallDownloadCount").textContent = `${state.hallDownloads.length}部`;
    if (render && state.hallView === "downloads") renderHallDownloads();
  } catch (error) {
    if (render && state.hallView === "downloads") $("trendResults").innerHTML = `<div class="hall-empty-works"><b>下载记录读取失败</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function showHallDownloads() {
  state.hallView = "downloads";
  state.hallPage = 1;
  ++state.hallPrewarmId;
  document.querySelectorAll(".hall-channel").forEach(button => button.classList.toggle("active", button.id === "hallDownloadsTab"));
  closeHallPlayer();
  $("trendResults").innerHTML = `<div class="hall-prewarm-status"><b>正在读取本地下载记录…</b><span>已下载的视频不会连接外网。</span></div>`;
  loadHallDownloads(true);
}

async function playDownloadedSeries(record) {
  const episodes = Array.isArray(record?.episodes) ? record.episodes : [];
  if (!episodes.length) return toast("这部剧还没有下载完成的集数。", true);
  state.hallCurrentWork = { ...record, _localDownload: true };
  state.hallEpisodes = episodes;
  state.hallEpisodeIndex = 0;
  updateHallEpisodeControls();
  await playHallEpisode(0);
}

async function resolveHallWork(work) {
  const url = work?.url || "";
  if (!url) throw new Error("该作品没有有效播放地址。");
  const cached = state.hallPreviewCache[url];
  if (cached) return await cached;
  const pending = postJson("/api/link/analyze", { url, rightsConfirmed: true });
  state.hallPreviewCache[url] = pending;
  try {
    const data = await pending;
    if (!data.previewUrl || !data.playable) throw new Error(data.message || "该作品暂时无法在软件内播放。");
    state.hallPreviewCache[url] = data;
    return data;
  } catch (error) {
    delete state.hallPreviewCache[url];
    throw error;
  }
}

function stopHallCardPreview(card) {
  if (!card) return;
  const video = card.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  card.classList.remove("previewing", "preview-loading");
}

function scheduleHallCardPreview(card) {
  clearTimeout(state.hallHoverTimer);
  const work = state.hallWorks[Number(card?.dataset.workIndex)];
  if (!card || !work) return;
  state.hallHoverTimer = setTimeout(async () => {
    card.classList.add("preview-loading");
    try {
      const data = await resolveHallWork(work);
      if (!card.matches(":hover") || !document.body.contains(card)) return stopHallCardPreview(card);
      const video = card.querySelector("video");
      video.src = data.previewUrl;
      video.poster = data.coverUrl || work.coverUrl || "";
      card.classList.remove("preview-loading");
      card.classList.add("previewing");
      video.load();
      video.play().catch(() => {});
    } catch (error) {
      card.classList.remove("preview-loading");
      card.classList.add("preview-unavailable");
      const hint = card.querySelector(".poster-preview-hint");
      if (hint) hint.textContent = "点击重试";
    }
  }, 260);
}

function applyHallWorkForCreation(work) {
  if (!work) return;
  setPlotType(work.plotType && work.plotType !== "短剧趋势" ? work.plotType : "身份反转");
  if (!$("originalTheme").value.trim()) $("originalTheme").value = `参考“${work.title}”体现的受众兴趣，围绕${work.plotType || "高热题材"}重新创作一部人物、事件、台词和结局完全不同的原创短剧。`;
  if (!$("originalDirection").value.trim()) $("originalDirection").value = `只借鉴高层情绪机制与冲突节奏：${work.hook || work.summary || "强钩子、连续升级与反转"}。不得复制原剧人物名、台词、具体场景和情节顺序。`;
  if (!$("openingHook").value.trim() && work.hook) $("openingHook").value = work.hook;
  $("recommendStatus").classList.remove("hidden");
  $("recommendStatus").innerHTML = `<b>已采用今日剧目作为创作方向</b><span>已自动提取题材与情绪机制，并锁定为完全原创。正在用当前模型补齐其余设定…</span>`;
  requestOriginalRecommendation("settings");
}

function closeHallPlayer() {
  state.hallMedia = null;
  state.hallCurrentWork = null;
  state.hallEpisodes = [];
  state.hallEpisodeIndex = 0;
  $("hallVideo").pause();
  $("hallVideo").removeAttribute("src");
  $("hallVideo").load();
  $("hallVideo").classList.add("hidden");
  $("hallPlayerPlaceholder").classList.remove("hidden");
  $("closeHallPlayer").classList.add("hidden");
  $("hallEpisodeControls").classList.add("hidden");
  $("hallEpisodeSelect").innerHTML = "";
  $("hallPlayerTitle").textContent = "从“今日可观看推荐”选择作品";
  $("hallPlayerStatus").textContent = "公开内容仅用于选题研究；改写或商用前请确认你拥有相应权利。";
}

function updateHallEpisodeControls() {
  const episodes = state.hallEpisodes || [];
  $("hallEpisodeControls").classList.toggle("hidden", !episodes.length);
  $("hallEpisodeSelect").innerHTML = episodes.map((item, index) => `<option value="${index}">第${Number(item.episode) || index + 1}集</option>`).join("");
  $("hallEpisodeSelect").value = String(state.hallEpisodeIndex);
  $("hallPrevEpisode").disabled = state.hallEpisodeIndex <= 0;
  $("hallNextEpisode").disabled = state.hallEpisodeIndex >= episodes.length - 1;
}

async function loadHallEpisodes(work) {
  const key = work?.detailUrl || work?.url || "";
  if (!key) return [];
  if (state.hallEpisodeCache[key]) return await state.hallEpisodeCache[key];
  const pending = postJson("/api/hall/episodes", { firstUrl: work.url, detailUrl: work.detailUrl || "", rightsConfirmed: true })
    .then(data => data.episodes || [{ episode: 1, url: work.url }])
    .catch(() => [{ episode: 1, url: work.url }]);
  state.hallEpisodeCache[key] = pending;
  const episodes = await pending;
  state.hallEpisodeCache[key] = episodes;
  return episodes;
}

async function playHallEpisode(index) {
  const work = state.hallCurrentWork;
  if (!work || !state.hallEpisodes.length) return;
  const targetIndex = Math.max(0, Math.min(state.hallEpisodes.length - 1, Number(index) || 0));
  const episode = state.hallEpisodes[targetIndex];
  state.hallEpisodeIndex = targetIndex;
  updateHallEpisodeControls();
  $("hallPlayerTitle").textContent = `${work.title || "推荐短剧"} · 第${episode.episode || targetIndex + 1}集`;
  $("hallPlayerStatus").textContent = "正在准备本集视频；缓存成功后会立即播放。";
  try {
    const data = work._localDownload
      ? { previewUrl: episode.streamUrl, coverUrl: work.coverUrl || "", playable: true }
      : await resolveHallWork({ ...work, url: episode.url });
    if (state.hallCurrentWork !== work || state.hallEpisodeIndex !== targetIndex) return;
    state.hallMedia = data;
    $("hallVideo").src = data.previewUrl;
    $("hallVideo").poster = data.coverUrl || work.coverUrl || "";
    $("hallVideo").classList.remove("hidden");
    $("hallPlayerPlaceholder").classList.add("hidden");
    $("closeHallPlayer").classList.remove("hidden");
    $("hallPlayerStatus").textContent = `第${episode.episode || targetIndex + 1}集已就绪 · 共${state.hallEpisodes.length}集`;
    $("hallVideo").load();
    $("hallVideo").play().catch(() => {});
    const nextEpisode = state.hallEpisodes[targetIndex + 1];
    if (nextEpisode && !work._localDownload) resolveHallWork({ ...work, url: nextEpisode.url }).catch(() => {});
  } catch (error) {
    $("hallPlayerStatus").textContent = `本集暂时无法播放：${error.message}`;
    toast("本集连接暂时中断，请稍后再试。", true);
  }
}

async function playHallWork(work) {
  const url = work?.url || "";
  if (!url || !work?.playableCandidate) {
    return toast("这条是公开趋势资料，不是平台视频；可用于选题参考，但不能直接播放。", true);
  }
  state.hallCurrentWork = work;
  state.hallEpisodes = [{ episode: 1, url: work.url }];
  state.hallEpisodeIndex = 0;
  updateHallEpisodeControls();
  try {
    await playHallEpisode(0);
    const episodes = await loadHallEpisodes(work);
    if (state.hallCurrentWork !== work) return;
    state.hallEpisodes = episodes.length ? episodes : state.hallEpisodes;
    updateHallEpisodeControls();
    $("hallPlayerStatus").textContent = `当前第1集 · 共${state.hallEpisodes.length}集；下一集正在后台预热。`;
    const nextEpisode = state.hallEpisodes[1];
    if (nextEpisode) resolveHallWork({ ...work, url: nextEpisode.url }).catch(() => {});
  } catch (error) {
    closeHallPlayer();
    $("hallPlayerStatus").textContent = `暂时无法播放：${error.message}`;
    toast(error.message, true);
  }
}

async function downloadHallSeries(work) {
  if (!work?.url || state.busy) return;
  const episodes = await loadHallEpisodes(work);
  if (!await studioConfirm(`即将下载《${work.title || "该短剧"}》共${episodes.length}集到软件安装目录。请确认你拥有整部剧的下载授权，并预留足够空间。是否继续？`)) return;
  try {
    const data = await postJson("/api/hall/series/download", { title: work.title, episodes, work: { url: work.url, detailUrl: work.detailUrl || "", coverUrl: work.coverUrl || "" }, rightsConfirmed: true });
    loadHallDownloads(false);
    await pollTask(data.taskId, result => {
      $("taskProgress").classList.add("hidden");
      toast(`整剧下载完成：成功${result.completed}集${result.failed ? `，失败${result.failed}集` : ""}。`);
      refreshCacheUsage();
      showHallDownloads();
    }, "main");
  } catch (error) { toast(error.message, true); }
}

async function rewriteHallSeries(work) {
  if (!work?.url || state.busy) return;
  const episodes = await loadHallEpisodes(work);
  if (!await studioConfirm(`即将读取《${work.title || "该短剧"}》共${episodes.length}集的对白并导入改写。集数越多耗时越长；请确认你拥有内容读取和改写授权。是否继续？`)) return;
  try {
    const data = await postJson("/api/hall/series/transcribe", { title: work.title, episodes, modelSize: $("whisperModel").value, rightsConfirmed: true });
    await pollTask(data.taskId, result => {
      $("taskProgress").classList.add("hidden");
      setWorkMode("rewrite");
      invalidateSourceAnalysis("视频对白已重新识别。");
      $("sourceText").value = result.transcript || "";
      $("sourceMode").value = "text";
      updateSourceCount();
      setSourceInputTab("text");
      $("sourceCard").scrollIntoView({ behavior: "smooth", block: "start" });
      toast(`整剧内容已导入：成功读取${result.completed}集${result.failed ? `，失败${result.failed}集` : ""}。`);
    }, "main");
  } catch (error) { toast(error.message, true); }
}

function updateCountInput(selectId, inputId) {
  $(inputId).classList.toggle("visible", ["increase", "decrease", "custom"].includes($(selectId).value));
}

function providerConfig() {
  return { apiKey: $("apiKey").value.trim(), baseUrl: $("baseUrl").value.trim(), model: $("modelName").value.trim(), protocol: $("protocol").value };
}

function stageModelSelect(stage = "") {
  return stage ? [...document.querySelectorAll("[data-text-model-stage]")].find(node => node.dataset.textModelStage === stage) : null;
}

const FIXED_TEXT_MODEL = "qwen3.8-flash";

function buttonBindingForStage(stage) {
  const buttonId = stage === "final-generate" ? (state.workMode === "original" ? "original-final" : "rewrite-final") : stage;
  return state.textButtonBindings?.[buttonId] || null;
}

function selectedTextModel(stage = "") {
  const available = state.textModels || [];
  const binding = buttonBindingForStage(stage);
  if (binding) return available.find(item => item.model === binding.model)?.model || "";
  if (stage === "original-recommend") return available.find(item => String(item.model || "").toLowerCase() === "gt-6-sol")?.model || "";
  if (stage === "original-trends") return "";
  if (stage === "source-analyze") {
    const selected = stageModelSelect(stage)?.value || localStorage.getItem("drama-recognition-model");
    const recognized = available.find(item => item.model === selected);
    if (recognized) return recognized.model;
  }
  const fixed = available.find(item => item.default === true) || available.find(item => String(item.model || "").toLowerCase() === FIXED_TEXT_MODEL) || available.find(item => String(item.model || "").toLowerCase().startsWith("qwen3.8")) || available[0];
  return fixed?.model || "";
}

function modelConfig(stage = "", operation = "") {
  const model = selectedTextModel(stage);
  return { provider: "server_gateway", model, operation: operation || (state.workMode === "original" ? "original" : state.workMode), temperature: 0.72, maxTokens: 32000, timeout: 600 };
}

function stageModelProblem(stage, operation, label = "本次功能") {
  const model = selectedTextModel(stage);
  if (!model) return `当前写作服务暂不可用，请联系管理员。`;
  if (textModelQuote(model, operation, stage) == null) return `当前写作服务尚未配置${operation === "original" ? "原创" : operation === "refine" ? "AI小调用" : "改写"}积分价格，请联系管理员。`;
  return "";
}

function textOperation() {
  return state.workMode === "original" ? "original" : state.workMode === "rewrite" ? "rewrite" : state.workMode;
}

function textModelQuote(modelId, operation = textOperation(), stage = "") {
  const binding = buttonBindingForStage(stage);
  if (binding) {
    const price = Number(binding.price);
    return String(binding.model).toLowerCase() === String(modelId || "").toLowerCase() && Number.isFinite(price) && price > 0 ? price : null;
  }
  const row = state.textPricing.find(item => String(item.model || "").toLowerCase() === String(modelId || "").toLowerCase() && String(item.resolution || item.operation || "").toLowerCase() === operation);
  const price = row ? Number(row.pricePerGeneration || 0) : null;
  return Number.isFinite(price) && price > 0 ? price : null;
}

function mainRequestCreditCost(url, body = {}) {
  if (url === '/api/visual/plan') {
    if (!body.modelConfig || !Object.keys(body.modelConfig).length) return undefined;
    const binding = buttonBindingForStage('workflow-storyboard');
    return textModelQuote(binding?.model || body.modelConfig.model, 'rewrite', 'workflow-storyboard');
  }
  if (['/api/visual/asset/generate','/api/visual/cover/generate','/api/visual/episode/frame','/api/visual/episode/video'].includes(url)) {
    if (body.resumeOnly) return undefined;
    if(ModelPresentation.pendingImageRecovery(state.visualProject,url,body))return CreditGate.FREE;
    const video = url.endsWith('/video'), tier = body.tier || 'economy';
    const model = body[video ? 'videoModel' : 'imageModel'] || state.visualProfile?.[`${video ? 'video' : 'image'}Model${ModelPresentation.suffix(tier)}`] || '';
    if(ModelPresentation.isLiveQuote(state.visualProfile||{},video?'video':'image',model))return body.expectedCredits ?? CreditGate.QUOTE;
    const quote = video ? ModelPresentation.quote(state.visualProfile || {},model,body.resolution || $('visualResolution').value,Number(body.duration || $('visualVideoDuration').value),tier,body.ratio || $('visualRatio').value)
      : ModelPresentation.imageQuote(state.visualProfile || {},model,body.imageResolution || state.visualProfile?.imageResolution || '2k',1);
    return quote?.points ?? null;
  }
  let stage = ({'/api/source/analyze':'source-analyze','/api/source/proposals':'rewrite-proposals',
    '/api/source/refine':`source-refine-${body.field}`,'/api/source/proposal-refine':`proposal-refine-${body.proposal?.id}`,
    '/api/original/recommend':body.action === 'hot_types' ? 'original-trends' : 'original-recommend',
    '/api/original/field-optimize':'original-recommend','/api/rewrite/generate':'final-generate',
    '/api/original/generate':'final-generate','/api/rewrite/resume':'final-generate',
    '/api/quality/optimize':'quality-optimize','/api/quality/repair-episode':'episode-repair',
    '/api/marketing/analyze':'','/api/marketing/generate':'','/api/visual/normalize':'workflow-storyboard'})[url];
  if (stage === undefined) return undefined;
  const config = body.modelConfig || modelConfig(stage);
  const binding = buttonBindingForStage(stage);
  const operation = url.startsWith('/api/marketing/') ? 'original' : url === '/api/visual/normalize' ? 'rewrite' : config.operation || textOperation();
  return textModelQuote(binding?.model || config.model, operation, stage);
}

function mainButtonCreditCost(button) {
  if (button.dataset.visualAction) {
    const action = button.dataset.visualAction;
    return mainRequestCreditCost(action === 'video' ? '/api/visual/episode/video' : action === 'frame' ? '/api/visual/episode/frame' : '/api/visual/asset/generate',
      {projectId:state.visualProject?.id,episodeId:button.closest('[data-visual-episode]')?.dataset.visualEpisode,tier:$(action === 'video' ? 'visualVideoTier' : 'visualImageTier').value});
  }
  const stages = {analyzeSourceBtn:'source-analyze',generateProposalsBtn:'rewrite-proposals',proposalNeedBtn:'rewrite-proposals',
    proposalRegenerateBtn:'rewrite-proposals',recommendOriginal:'original-recommend',refreshOriginalSettings:'original-recommend',
    refreshHotTypes:'original-trends',generateBtn:'final-generate',confirmRewriteCallBtn:'final-generate',resumeLongRewrite:'final-generate',
    generateMarketingPlan:'',analyzeMarketingReference:'',normalizeVisualSource:'workflow-storyboard'};
  let stage = stages[button.id];
  if (button.dataset.analysisAi) stage = `source-refine-${button.dataset.analysisAi}`;
  if (button.dataset.aiRefineProposal) stage = `proposal-refine-${button.dataset.aiRefineProposal}`;
  if (button.dataset.fieldAi) stage = 'original-recommend';
  if (button.dataset.qualityOptimize) stage = 'quality-optimize';
  if (button.dataset.repairEpisode) stage = 'episode-repair';
  const operation = ['generateMarketingPlan','analyzeMarketingReference'].includes(button.id) ? 'original' : ['source-analyze','rewrite-proposals','workflow-storyboard'].includes(stage) ? 'rewrite' : stage === 'final-generate' ? textOperation() : stage ? 'refine' : textOperation();
  return textModelQuote(selectedTextModel(stage), operation, stage);
}

function updateTextModelEstimate() {
  const select = $("textModelSelect");
  if (!select) return;
  const modelId = selectedTextModel("final-generate");
  const model = state.textModels.find(item => item.model === modelId);
  const operation = textOperation();
  const price = textModelQuote(modelId, operation, "final-generate");
  const binding = buttonBindingForStage("final-generate");
  if ($("textModelEstimate")) $("textModelEstimate").textContent = !model
    ? "后台尚未发布文本模型，请联系管理员配置。"
    : price == null ? `当前模型尚未发布${operation === "original" ? "一键原创" : "一键改写"}价格，不能提交。`
    : `${operation === "original" ? "一键原创" : "一键改写"} · 模型单次调用 ${pointsText(price)} 积分，不是整部剧总价。长篇沿用规划、正文和检查等多次调用，按实际调用结算，暂不预估总额；模型已返回的内容即使需修改也会计费，未返回或状态不明以原调用结算为准。`;
}

function stageModelControlMarkup(stage, operation, label = "本次模型") {
  return `<div class="stage-model-control compact text-model-fixed"><span>${stage === 'final-generate' ? '模型单次调用积分' : '本次预计积分'}</span><select data-text-model-stage="${escapeHtml(stage)}" data-model-operation="${escapeHtml(operation)}" aria-hidden="true" tabindex="-1"><option value="">正在同步后台模型…</option></select><small class="stage-model-quote">正在读取积分…</small></div>`;
}

function updateStageModelQuote(select) {
  if (!select) return;
  const operation = select.dataset.modelOperation || textOperation();
  const model = state.textModels.find(item => item.model === select.value);
  const price = textModelQuote(select.value, operation, select.dataset.textModelStage || "");
  const binding = buttonBindingForStage(select.dataset.textModelStage || "");
  const quote = select.closest(".stage-model-control")?.querySelector(".stage-model-quote");
  if (!quote) return;
  const operationLabel = operation === "original" ? "原创" : operation === "refine" ? "AI小调用/优化" : "改写";
  quote.textContent = !model ? "后台暂未发布可用模型"
    : price == null ? `尚未配置${operationLabel}价格`
    : select.dataset.textModelStage === 'final-generate' ? `模型单次调用 ${pointsText(price)} 积分，不是整部剧总价；长篇按实际调用结算，暂不预估总额`
    : `每次模型调用 ${pointsText(price)} 积分 · 按实际调用次数结算，预计调用次数仅供参考`;
  quote.classList.toggle("unavailable", !model || price == null);
}

function renderStageModelSelectors() {
  const defaultModel = selectedTextModel();
  document.querySelectorAll("[data-text-model-stage]").forEach(select => {
    const stage = select.dataset.textModelStage || "default";
    const binding = buttonBindingForStage(stage);
    const fixedOriginal = stage === "original-recommend" || stage === "original-trends";
    const previous = binding?.model || (fixedOriginal ? selectedTextModel(stage) : stage === "source-analyze" ? (localStorage.getItem("drama-recognition-model") || defaultModel) : defaultModel);
    select.innerHTML = state.textModels.length
      ? state.textModels.map(item => `<option value="${escapeHtml(item.model)}">${escapeHtml(item.displayName || item.model)}</option>`).join("")
      : '<option value="">后台暂未发布文本模型</option>';
    select.value = state.textModels.some(item => item.model === previous) ? previous : "";
    select.disabled = Boolean(binding) || fixedOriginal;
    if (fixedOriginal) { select.hidden = true; select.setAttribute("aria-hidden", "true"); select.tabIndex = -1; }
    if (select.value) localStorage.setItem(`drama-text-model-${stage}`, select.value);
    updateStageModelQuote(select);
  });
}

function renderTextModelSelector(config = {}) {
  state.textModels = (Array.isArray(config.visualModels) ? config.visualModels : []).filter(item => item?.media === "text" && item.enabled !== false && item.gatewayReady !== false);
  state.textPricing = Array.isArray(config.textModelPricing) ? config.textModelPricing : [];
  state.textButtonBindings = config.textButtonBindings && typeof config.textButtonBindings === "object" ? config.textButtonBindings : {};
  const select = $("textModelSelect");
  if (!select) return;
  const previous = buttonBindingForStage("final-generate")?.model || state.textModels.find(item => String(item.model || "").toLowerCase() === FIXED_TEXT_MODEL)?.model
    || state.textModels.find(item => String(item.model || "").toLowerCase().startsWith("qwen3.8"))?.model || "";
  select.innerHTML = state.textModels.length
    ? state.textModels.map(item => `<option value="${escapeHtml(item.model)}">${escapeHtml(item.displayName || item.model)}</option>`).join("")
    : '<option value="">后台尚未发布文本模型</option>';
  if (state.textModels.some(item => item.model === previous)) select.value = previous;
  else select.value = "";
  if (select.value) localStorage.setItem("drama-text-model", select.value);
  updateTextModelEstimate();
  renderStageModelSelectors();
  CreditGate.recalculate();
}

function renderProviderStatus() {
  const profile = state.profiles[state.provider] || {};
  const box = $("providerStatus");
  const preset = providerPresets[state.provider];
  const tabLabels = { qwen: "千问 · 百炼", doubao: "豆包 · 方舟", custom: "其他兼容接口" };
  document.querySelectorAll(".provider-tab").forEach(button => {
    button.textContent = `${tabLabels[button.dataset.provider]}${state.profiles[button.dataset.provider]?.saved ? " · 已保存" : ""}`;
  });
  box.className = `provider-status ${profile.saved ? "saved" : "unsaved"}`;
  box.querySelector("b").textContent = profile.saved ? `${preset.name}配置已保存` : `${preset.name}尚未保存`;
  box.querySelector("span").textContent = profile.saved
    ? `已安全保存 ${profile.apiKeyMasked}，可以直接检测连接或开始改写。`
    : "填写 API Key 后点击“保存当前平台配置”。";
  $("savedKeyHint").textContent = profile.saved ? `已保存：${profile.apiKeyMasked}；留空可继续使用已保存的 Key。` : "";
  $("apiKey").placeholder = profile.saved ? "已保存，若不更换可留空" : "粘贴该平台的 API Key";
}

function applyProvider(name) {
  if (!providerPresets[name]) name = "qwen";
  state.provider = name;
  document.querySelectorAll(".provider-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.provider === name));
  const profile = state.profiles[name] || {};
  const preset = providerPresets[name];
  $("apiKey").value = "";
  $("baseUrl").value = profile.baseUrl || preset.baseUrl;
  $("modelName").value = profile.model || preset.model;
  $("protocol").value = profile.protocol || preset.protocol;
  $("baseUrl").readOnly = name !== "custom";
  $("customProtocolField").classList.toggle("hidden", name !== "custom");
  $("modelFieldLabel").textContent = name === "doubao" ? "模型名称 / 推理接入点 ID" : "模型名称（通常不用改）";
  $("apiKeyLabel").textContent = name === "qwen" ? "百炼 API Key" : name === "doubao" ? "火山方舟 API Key（不是 AccessKey ID/Secret）" : "API Key";
  localStorage.setItem("drama-provider", name);
  renderProviderStatus();
}

async function loadProfiles() {
  try {
    const response = await fetch("/api/model-profiles");
    const data = await response.json();
    state.profiles = data.profiles || {};
  } catch (_) { state.profiles = {}; }
  applyProvider(localStorage.getItem("drama-provider") || "qwen");
  if (state.workMode === "original") loadDailyHall(state.originalType, true);
}

async function saveModel() {
  const config = providerConfig();
  const existing = state.profiles[state.provider]?.saved;
  if (!config.apiKey && !existing) return toast("请先填写当前平台的 API Key。", true);
  if (!config.baseUrl || !config.model) return toast("请填写模型名称和接口地址。", true);
  try {
    $("saveModel").disabled = true;
    const data = await postJson("/api/model-profiles/save", { provider: state.provider, config });
    state.profiles[state.provider] = data.profile;
    $("apiKey").value = "";
    renderProviderStatus();
    toast(`${providerPresets[state.provider].name}配置已保存，重启软件后仍可使用。`);
  } catch (error) { toast(error.message, true); }
  finally { $("saveModel").disabled = false; }
}

async function testModel() {
  const config = providerConfig();
  if (!config.apiKey && !state.profiles[state.provider]?.saved) return toast("请先填写并保存当前平台的 API Key。", true);
  try {
    $("modelTest").disabled = true;
    toast(`正在检测${providerPresets[state.provider].name}连接…`);
    const data = await postJson("/api/model-profiles/test", { provider: state.provider, config });
    toast(`${providerPresets[state.provider].name}连接成功，可以开始改写。`);
    const box = $("providerStatus");
    box.className = "provider-status connected";
    box.querySelector("b").textContent = `${providerPresets[state.provider].name}连接成功`;
    box.querySelector("span").textContent = data.message || "接口已正常响应。";
  } catch (error) {
    toast(`连接失败：${error.message}`, true);
    const box = $("providerStatus");
    box.className = "provider-status failed";
    box.querySelector("b").textContent = `${providerPresets[state.provider].name}连接失败`;
    box.querySelector("span").textContent = error.message;
  } finally { $("modelTest").disabled = false; }
}

function originalCreationSettings() {
  const value = settings();
  const common = new Set(['creationMode','projectName','platform','audience','durationSeconds','episodeSeconds',
    'intensity','storyStyle','peopleMode','peopleCount','peopleNameMode','sceneMode','sceneCount','sceneNameMode','propMode','propCount','propNameMode',
    'productEnabled','productName','productFacts','productPrice','priceEnabled','productCoverage','productPlacement',
    'promotionStyle','pressureLevel','reversalLevel','reversalCount','ctaEnabled','strictCompliance','extraRequirements',
    'protagonistGender','protagonistAge','familySituation','siblings','storyEra','storyDate','openingHook',
    'protagonistGoal','mainObstacle','emotionalCore','worldRules','dialogueStyle','productionScale','mustHave','avoidElements']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => key.startsWith('original') || common.has(key)));
}

function settings() {
  const original = state.workMode === "original";
  const originalUnit = $("originalEpisodeUnit").value;
  const originalEpisodeSeconds = Math.max(1, Math.min(1800, Math.round((Number($("originalEpisodeValue").value) || 15) * (originalUnit === "minutes" ? 60 : 1))));
  const episodeSeconds = original ? originalEpisodeSeconds : 15;
  const value = {
    creationMode: state.workMode, originalType: state.originalType, originalPlotType: selectedPlotType(),
    originalTheme: $("originalTheme").value, protagonistGender: $("protagonistGender").value,
    protagonistAge: $("protagonistAge").value, familySituation: $("familySituation").value,
    siblings: $("siblings").value, storyEra: $("storyEra").value, storyDate: $("storyDate").value,
    originalCharacters: $("originalCharacters").value, originalDirection: $("originalDirection").value,
    originalEnding: $("originalEnding").value, originalVisualStyle: $("originalVisualStyle").value,
    openingHook: $("openingHook").value, protagonistGoal: $("protagonistGoal").value,
    mainObstacle: $("mainObstacle").value, emotionalCore: $("emotionalCore").value,
    worldRules: $("worldRules").value, dialogueStyle: $("dialogueStyle").value,
    productionScale: $("productionScale").value, mustHave: $("mustHave").value, avoidElements: $("avoidElements").value,
    originalEpisodeCount: Math.max(1, Math.min(200, Math.round(Number($("originalEpisodeCount").value) || 1))),
    projectName: $("projectName").value, sourceMode: $("sourceMode").value, platform: selectedRewriteStyle("platform", "customPlatform", "微信视频号"),
    audience: selectedRewriteStyle("audience", "customAudience", "中老年人群"), durationSeconds: updateDuration(), similarity: Number($("similarity").value),
    episodeSeconds,
    intensity: $("intensity").value,
    storyStyle: selectedRewriteStyle("storyStyle", "customStoryStyle", "情感催泪·亲情与人情冷暖"),
    rewriteEra: selectedRewriteStyle("rewriteEra", "customRewriteEra", "保持原作年代"),
    peopleMode: $("peopleMode").value, peopleNameMode: $("peopleNameMode").value,
    peopleCount: $("peopleCount").value === "" ? null : Number($("peopleCount").value), sceneMode: $("sceneMode").value || "keep", sceneCount: $("sceneCount").value === "" ? null : Number($("sceneCount").value),
    propMode: $("propMode").value, propCount: $("propCount").value === "" ? null : Number($("propCount").value), sceneNameMode: $("sceneNameMode").value, propNameMode: $("propNameMode").value,
    renameAll: $("peopleNameMode").value === "rewrite", productEnabled: $("productEnabled").checked, productName: $("productName").value,
    productFacts: $("productFacts").value, priceEnabled: $("priceEnabled").checked, productPrice: $("productPrice").value,
    productCoverage: Number($("productCoverage").value), productPlacement: [...document.querySelectorAll('input[name="productPlacement"]:checked')].map(input => input.value), promotionStyle: $("promotionStyle").value,
    pressureLevel: $("pressureLevel")?.value || $("intensity")?.value || "5档·高压冲突", reversalLevel: $("reversalLevel")?.value || "强反转打脸",
    reversalCount: Number($("reversalCount")?.value || 3), ctaEnabled: $("ctaEnabled")?.checked !== false,
    strictCompliance: $("strictCompliance")?.checked !== false, speedMode: $("generationSpeed").value,
    extraRequirements: $("extraRequirements").value, whisperModel: $("whisperModel").value,
    visualAnalysis: $("visualAnalysis").checked, transcriptCorrection: $("transcriptCorrection").checked,
    maxFrames: $("generationSpeed").value === "fast" ? 8 : 18
  };
  return original ? value : { ...normalizeRewriteSnapshot(value), creationMode:"rewrite", projectName:value.projectName,
    sourceMode:value.sourceMode, whisperModel:value.whisperModel, visualAnalysis:value.visualAnalysis,
    transcriptCorrection:value.transcriptCorrection, maxFrames:value.maxFrames };
}

function applyOriginalRecommendation(data, expectedValues = null) {
  const recommendation = data.recommendation || {};
  const fieldMap = {
    originalTheme: "originalTheme", protagonistGender: "protagonistGender",
    protagonistAge: "protagonistAge", familySituation: "familySituation", siblings: "siblings", storyEra: "storyEra",
    storyDate: "storyDate", originalCharacters: "originalCharacters", originalDirection: "originalDirection",
    originalEnding: "originalEnding", originalVisualStyle: "originalVisualStyle", openingHook: "openingHook",
    protagonistGoal: "protagonistGoal", mainObstacle: "mainObstacle", emotionalCore: "emotionalCore",
    worldRules: "worldRules", dialogueStyle: "dialogueStyle", mustHave: "mustHave", avoidElements: "avoidElements",
    productCoverage: "productCoverage", promotionStyle: "promotionStyle", pressureLevel: "pressureLevel",
    reversalLevel: "reversalLevel", reversalCount: "reversalCount"
  };
  if (recommendation.originalPlotType && (!selectedPlotType() || data.replaceExisting) && (!expectedValues || selectedPlotType() === expectedValues.originalPlotType)) setPlotType(recommendation.originalPlotType);
  for (const [key, id] of Object.entries(fieldMap)) {
    if (recommendation[key] === undefined || recommendation[key] === null || recommendation[key] === "") continue;
    const node = $(id);
    if (!node) continue;
    if (expectedValues && node.value !== expectedValues[id]) continue;
    if (!String(node.value).trim() || data.replaceExisting) node.value = recommendation[key];
  }
  $("productCoverageValue").textContent = `${$("productCoverage").value}%`;
  // Completion is reflected directly in the fields. Keep only a compact
  // one-line state label; the old multi-line explanatory banner made the
  // original hall look like an extra result panel.
  $("recommendStatus").classList.remove("hidden");
  $("recommendStatus").textContent = "设定补全完成，已写入当前字段。";
}

async function requestOriginalRecommendation(action, automatic = false, replaceExisting = false) {
  if (state.busy) {
    if (!automatic) toast("已有任务正在处理，请完成后再补全设定，避免重复提交。", true);
    return;
  }
  const modelStage = action === "hot_types" ? "original-trends" : "original-recommend";
  const modelProblem = stageModelProblem(modelStage, "refine", action === "hot_types" ? "今日推荐" : "原创设定补全");
  if (modelProblem) return toast(modelProblem, true);
  const button = action === "hot_types" ? $("refreshHotTypes") : (replaceExisting ? $("refreshOriginalSettings") : $("recommendOriginal"));
  const requestedHallType = state.originalType;
  const requestedMode = state.workMode;
  const requestedOwner = captureWritingActionOwner220();
  const expectedValues = Object.fromEntries([...document.querySelectorAll('#originalCard input[id],#originalCard textarea[id],#originalCard select[id],#rewriteCard input[id],#rewriteCard select[id]')].map(node => [node.id, node.value]));
  expectedValues.originalPlotType = selectedPlotType();
  if (action === "hot_types" && state.hallLoadingTypes[requestedHallType]) {
    if (!automatic) toast("当前已有模型任务正在运行，请等它完成后再提交本次调用，避免重复扣费。", true);
    return;
  }
  if (action === "hot_types") state.hallLoadingTypes[requestedHallType] = true;
  state.busy = true;
  const blockedButtons = action === "settings" ? [$("recommendOriginal"), $("refreshOriginalSettings"), $("generateBtn")] : [button];
  const oldDisabled = blockedButtons.map(node => node.disabled);
  blockedButtons.forEach(node => { node.disabled = true; });
  button.disabled = true;
  $("recommendStatus").classList.remove("hidden");
  const requestedWorkCount = currentHallWorkCount();
   $("recommendStatus").textContent = action === "hot_types" ? `正在联网搜集并筛选今日最新${requestedWorkCount}部公开剧目…` : (replaceExisting ? "正在以核心主题为主轴，联网重新分析并优化整套原创设定…" : "正在以核心主题为主轴，参考公开趋势并由当前模型补齐整套设定…");
  try {
     const payloadSettings = { ...originalCreationSettings(), count: Math.max(20, Math.min(50, Number($("hotTypeCount").value) || 30)), workCount: requestedWorkCount, replaceExisting };
     const data = await submitWritingAux220("/api/original/recommend", { action, settings: payloadSettings, modelConfig: modelConfig(modelStage, "refine") }, button);
    await pollWritingAux220(data, result => {
       if (action === "settings") {
         if (!ownsWritingContext220(requestedOwner) || state.workMode !== requestedMode || state.originalType !== requestedHallType) return toast("设定结果已返回；当前板块或类型已切换，未覆盖正在编辑的内容。");
         return applyOriginalRecommendation({ ...result, replaceExisting }, expectedValues);
       }
      const list = result.hotTypes || [];
      const works = result.referenceWorks || [];
      const cached = { hotTypes: list, referenceWorks: works, requestedWorkCount, refreshedAt: new Date().toISOString(), message: result.message || "今日联网推荐已更新。" };
      localStorage.setItem(hallCacheKey(requestedHallType), JSON.stringify(cached));
      if (state.originalType === requestedHallType && state.hallView === "channel") {
        if (works.length) prewarmHallWorks(list, works, cached.message, requestedHallType);
        else renderTrendHall(list, [], cached.message);
      }
      $("recommendStatus").innerHTML = `<b>今日推荐已更新：${works.length}/${requestedWorkCount}部</b><span>${escapeHtml(result.sourceNote || result.message || "")}</span>`;
    }, "recommend");
  } catch (error) {
    if (!automatic) toast(error.message, true);
    else $("recommendStatus").innerHTML = `<b>今日大厅暂未联网更新</b><span>${escapeHtml(error.message)}。仍可直接使用内置50种题材。</span>`;
    if (action === "settings") $("recommendStatus").textContent = `设定补全未完成：${error.message}。未生成剧本正文。`;
  } finally {
    state.busy = false;
    blockedButtons.forEach((node, index) => { node.disabled = oldDisabled[index]; });
    if (action === "hot_types") delete state.hallLoadingTypes[requestedHallType];
    if (!$("recommendProgress").querySelector('[data-writing-aux-raw220]')) $("recommendProgress").classList.add("hidden");
  }
}

const originalFieldIds = ["originalTheme", "protagonistGender", "protagonistAge", "familySituation", "siblings", "storyEra", "storyDate", "originalCharacters", "originalDirection", "originalEnding", "originalVisualStyle", "openingHook", "protagonistGoal", "mainObstacle", "emotionalCore", "worldRules", "dialogueStyle", "mustHave", "avoidElements"];

function installOriginalFieldActions() {
  originalFieldIds.forEach(id => {
    const node = $(id);
    const label = node?.closest("label.field");
    const title = label?.querySelector(":scope > span");
    if (!node || !title || title.querySelector("[data-field-ai]")) return;
    const actions = document.createElement("span");
    actions.className = "field-ai-actions";
    actions.innerHTML = `<button type="button" class="field-ai-btn" data-field-ai="${escapeHtml(id)}">AI更新</button>`;
    title.appendChild(actions);
  });
  renderStageModelSelectors();
}

async function requestOriginalFieldUpdate(field) {
  if (!originalFieldIds.includes(field)) return toast("该项不支持 AI 更新。", true);
  if (state.busy) return toast("已有任务正在处理，请完成后再更新设定。", true);
  const button = document.querySelector(`[data-field-ai="${field}"]`);
  const modelProblem = stageModelProblem("original-recommend", "refine", "该项AI更新");
  if (modelProblem) return toast(modelProblem, true);
  const finishWait = beginInlineAiWait(button, "AI更新中");
  const initialValue = $(field).value;
  const requestedMode = state.workMode, requestedType = state.originalType;
  const requestedOwner = captureWritingActionOwner220();
  state.busy = true;
  let succeeded = false;
  try {
    toast("已提交单项 AI 更新，正在读取参考并重新生成。");
    const data = await submitWritingAux220("/api/original/field-optimize", { field, settings: originalCreationSettings(), modelConfig: modelConfig("original-recommend", "refine") }, button);
    await pollWritingAux220(data, result => {
      if (!ownsWritingContext220(requestedOwner) || state.workMode !== requestedMode || state.originalType !== requestedType || $(field).value !== initialValue) return toast("该项结果已返回；保留你后来修改的内容，没有自动覆盖。");
      if (result.field && result.field !== field) throw new Error("返回字段与本次更新不一致，原内容已保留。");
      const node = $(field);
      if (node) node.value = result.value || node.value;
      toast(`${node?.previousElementSibling?.textContent || "该项"}已由模型联网更新，可以继续修改其他项。`);
    }, "recommend");
    succeeded = true;
  } catch (error) { toast(error.message, true); }
  finally { state.busy = false; if (!$("recommendProgress").querySelector('[data-writing-aux-raw220]')) $("recommendProgress").classList.add("hidden"); finishWait(succeeded); }
}

function setSpeechState(kind, message) {
  const pill = $("speechStatus");
  pill.className = `status-pill ${kind}`;
  pill.textContent = kind === "ready" ? "组件可用" : kind === "recognized" ? "对白已识别" : kind === "checking" ? "正在检测…" : "需要下载";
  $("speechHint").textContent = message;
  $("downloadSpeechBtn").classList.toggle("hidden", !["missing", "error"].includes(kind));
  $("transcribeBtn").disabled = !state.asrReady || !state.videoId || state.speechBusy;
}

async function checkSpeechStatus(showToast = false) {
  state.asrReady = false;
  setSpeechState("checking", "正在检查这台电脑是否已经安装语音识别组件。");
  try {
    const response = await fetch(`/api/asr/status?model=${encodeURIComponent($("whisperModel").value)}`);
    const data = await response.json();
    state.asrReady = Boolean(data.ready);
    setSpeechState(data.ready ? "ready" : "missing", data.message);
    if (showToast) toast(data.message, !data.ready);
  } catch (_) { setSpeechState("error", "检测失败，请确认本地软件仍在运行，然后刷新页面重试。"); }
}

function syncCreationTaskView() {
  const area = $("taskProgress");
  const task = state.creationTasks[state.workMode];
  if (!area) return;
  // The generation panel is shared by both tabs; always mark its owner.
  area.dataset.ownerMode = state.workMode;
  area.setAttribute("aria-label", `${state.workMode === "original" ? "一键原创" : "一键改写"}进度`);
  area.classList.toggle("hidden", !task);
  if (['original','rewrite'].includes(state.workMode)) updateFeatureLockUI();
  if (!task) { window.ModelActivity?.set(area,{state:'',preserve:true}); return; }
  $("progressMessage").textContent = task.message;
  area.classList.add("model-activity-container");
  window.ModelActivity?.set(area,{state:"pending",preserve:true});
  $("progressPercent").textContent = `${task.progress}%`;
  $("progressBar").style.width = `${task.progress}%`;
  if (!task.preview || !ownsCreationResult251(task.owner)) return;
  $("emptyResult").classList.add("hidden");
  $("resultArea").classList.remove("hidden");
  const preview = $("structureResult");
  if (preview.textContent !== task.preview) preview.textContent = task.preview;
  document.querySelector('[data-result="structure"]').textContent = state.workMode === 'original' ? '原创剧本' : '改写剧本';
  // A preview is not a delivered result. Hide all result actions until the
  // owning task returns, including links left over from an earlier draft.
  $("resultArea").querySelector('.result-actions')?.classList.add('hidden');
  $("scriptEditorPanel")?.classList.add('hidden');
  $("editScript")?.classList.add('hidden');
  // Progress polling is not navigation. Once this task's preview has first
  // appeared, keep the reader's selected result tab and existing text node.
  if (!task.previewPresented) { task.previewPresented = true; showResult("structure"); }
  $("createVisualPlan").disabled = true;
  $("createVisualPlanTop").disabled = true;
}

const creationPendingKey = 'drama-creation-pending-v218';
function creationConfigSignature251(config) {
  const text = JSON.stringify(config || {}); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}
function creationOwner251(mode, archiveContext = null) {
  return mode === 'rewrite' ? {mode,projectId:archiveContext?.projectId ?? state.rewriteProjectId,sourceSignature:archiveContext?.sourceSignature ?? currentSourceSignature()} :
    {mode,configSignature:creationConfigSignature251(state.workMode === mode ? captureCreationConfig() : state.creationConfigs?.[mode])};
}
function ownsCreationResult251(owner) {
  if (!owner || !['rewrite','original'].includes(owner.mode)) return false;
  if (owner.mode === 'rewrite') return !deletedRewriteProjects251.has(owner.projectId) && owner.projectId === state.rewriteProjectId && owner.sourceSignature === currentSourceSignature();
  return owner.configSignature === creationConfigSignature251(state.workMode === owner.mode ? captureCreationConfig() : state.creationConfigs?.[owner.mode]);
}
function newCreationSubmissionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2,'0')).join('');
}
function persistCreationTasks() {
  try {
    const pending = Object.entries(state.creationTasks).filter(([,task]) => task?.submissionId).map(([mode, task]) => ({mode, submissionId: task.submissionId, taskId: task.taskId || null, owner:task.owner || null}));
    const encoded=JSON.stringify(pending);
    try { localStorage.setItem(creationPendingKey, encoded); } catch (_) {}
    try { sessionStorage.setItem(creationPendingKey, encoded); } catch (_) {}
  } catch (_) { /* Storage availability does not decide whether a request ran. */ }
}

async function recoverCreationSubmission(owner, mode) {
  while (state.creationTasks[mode] === owner) {
    try {
      const response = await fetch(`/api/creation/submission?submissionId=${encodeURIComponent(owner.submissionId)}`, {signal: AbortSignal.timeout(15000), cache:'no-store'});
      const receipt = await response.json();
      if (response.ok && receipt.taskId) {
        owner.taskId = receipt.taskId;
        persistCreationTasks();
        return receipt.taskId;
      }
    } catch (_) { /* Only read the original submission; never create a second one. */ }
    owner.message = '提交回执暂未确认，正在恢复原任务状态；不会重复提交或扣费。';
    syncCreationTaskView();
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

function resumePendingCreationTasks() {
  let saved,raw=null;
  try { raw=sessionStorage.getItem(creationPendingKey); } catch (_) {}
  if(!raw)try { raw=localStorage.getItem(creationPendingKey); } catch (_) {}
  try { saved=JSON.parse(raw||'[]'); } catch (_) { return; }
  if (!Array.isArray(saved)) return;
  for (const item of saved) {
    if (!['rewrite','original'].includes(item.mode) || !/^[A-Za-z0-9_-]{8,128}$/.test(item.submissionId || '') || state.creationTasks[item.mode]) continue;
    const owner = {...item, message:'正在恢复原生成任务…', progress:0, preview:''};
    state.creationTasks[item.mode] = owner;
    state.creationBusy[item.mode] = true;
    (async () => {
      // The server can reconstruct a completed task from its saved receipt
      // after a restart; an old in-memory task ID alone cannot do that.
      const taskId = await recoverCreationSubmission(owner, item.mode);
      if (!taskId) return;
      await pollTask(taskId, result => {
        result = {...result, settings:{...(result.settings || {}), creationMode:item.mode}};
        const sameOwner = ownsCreationResult251(item.owner);
        if (sameOwner) state.creationResults[item.mode] = result;
        if (sameOwner && state.workMode === item.mode) renderResult(result, true);
        else {
          if (item.owner?.mode === 'rewrite' && item.owner.projectId && result.metaFile) saveCurrentRewriteProject(result.metaFile, {projectId:item.owner.projectId,sourceSignature:item.owner.sourceSignature}).catch(error => toast(error.message,true));
          loadHistory();
          toast(`${item.mode === 'original' ? '原创' : '改写'}原任务已恢复并保存在历史记录；当前编辑稿未被替换。`);
        }
      }, 'main', item.mode);
    })().catch(error => toast(error.message, true));
  }
  syncCreationTaskView();
}

async function pollTask(taskId, onDone, target = "main", ownerMode = "", auxiliaryReceipt220 = false) {
  const mode = target === "main" && ["rewrite","original"].includes(ownerMode || state.workMode) ? (ownerMode || state.workMode) : "";
  const writingQuery = ['rewrite','original'].includes(ownerMode) || ['sourceAnalysis','proposal','recommend'].includes(target);
  if (!mode) state.busy = true;
  if (mode) state.creationTasks[mode] = {...(state.creationTasks[mode] || {}), taskId, message: '正在准备…', progress: 0, preview: ''};
  if (mode) persistCreationTasks();
  const startedAt = Date.now();
  let lastProgress = -1, lastProgressAt = Date.now();
  let lastPreview = "";
  const targets = {
    speech: ["speechProgress", "speechProgressMessage", "speechProgressPercent", "speechProgressBar"],
    sourceAnalysis: ["sourceAnalysisProgress", "sourceAnalysisProgressMessage", "sourceAnalysisProgressPercent", "sourceAnalysisProgressBar"],
    proposal: ["proposalProgress", "proposalProgressMessage", "proposalProgressPercent", "proposalProgressBar"],
    recommend: ["recommendProgress", "recommendProgressMessage", "recommendProgressPercent", "recommendProgressBar"],
    main: ["taskProgress", "progressMessage", "progressPercent", "progressBar"],
  };
  const ids = targets[target] || targets.main;
  const area = $(ids[0]);
  const message = $(ids[1]);
  const percent = $(ids[2]);
  const bar = $(ids[3]);
  if (!mode) area.classList.remove("hidden");
  else syncCreationTaskView();
  area.dataset.state = "running";
  const isModelTask = target !== "speech";
  if (isModelTask) { area.classList.add("model-activity-container"); window.ModelActivity?.set(area,{state:"pending",preserve:true}); }
  try {
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let task;
    let queryStatus = 0;
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {signal: controller.signal});
      queryStatus = response.status;
      if (!response.ok) throw new Error(response.status === 404 ? "原任务不存在或软件已重启，请核对原结果；不要重复提交收费生成。" : `任务查询失败（${response.status}），请核对原任务。`);
      task = await response.json();
      if (!["queued", "running", "done", "error"].includes(task.state)) throw new Error("任务状态无效，请核对原任务。" );
    } catch (error) {
      if (auxiliaryReceipt220) throw error;
      if (!writingQuery) throw error;
      const owner = mode && state.creationTasks[mode];
      if (queryStatus === 404 && owner?.submissionId) {
        try {
          const response = await fetch(`/api/creation/submission?submissionId=${encodeURIComponent(owner.submissionId)}`, {signal:AbortSignal.timeout(15000),cache:'no-store'});
          const receipt = await response.json();
          if (response.ok && receipt.taskId) { taskId=receipt.taskId; owner.taskId=taskId; persistCreationTasks(); }
        } catch (_) { /* Restart recovery is a read, never a repeated generation. */ }
      }
      const reconnect = "原任务状态暂时未能读取，正在重新连接；不会重新提交生成。";
      if (mode) { state.creationTasks[mode].message = reconnect; syncCreationTaskView(); }
      else { message.textContent = reconnect; percent.textContent = "连接中"; }
      await new Promise(resolve => setTimeout(resolve, 3000));
      continue;
    } finally { clearTimeout(timer); }
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const elapsedText = elapsedSeconds < 60 ? `${elapsedSeconds}秒` : `${Math.floor(elapsedSeconds / 60)}分${String(elapsedSeconds % 60).padStart(2, "0")}秒`;
    const actualProgress = Number.isFinite(Number(task.progress)) ? Math.max(0, Math.min(100, Number(task.progress))) : 0;
    if (actualProgress !== lastProgress) { lastProgress = actualProgress; lastProgressAt = Date.now(); }
    // Writing queries retain the actual server stage. Other consumers keep
    // their pre-218 progress presentation and failure handling.
    const displayProgress = !writingQuery && task.state === 'running' && actualProgress >= 52 && actualProgress < 76
      ? Math.min(74, actualProgress + Math.floor(elapsedSeconds / 18))
      : actualProgress;
    const unchangedSeconds = Math.floor((Date.now() - lastProgressAt) / 1000);
    const diagnostic = unchangedSeconds >= 300
      ? ` · 该阶段${Math.floor(unchangedSeconds / 60)}分钟未返回新进度；百分比仅为阶段标记，不是正文完成比例。请勿重复生成，结算以原调用记录为准`
      : unchangedSeconds >= 120
        ? " · 长文本模型尚未返回，请勿重复提交"
        : "";
    const activeHint = task.state === "running" ? ` · 已等待${elapsedText}${diagnostic}` : "";
    const progressMessage = `${task.message || "正在处理…"}${activeHint}`;
    if (mode) {
      const ownedTask = state.creationTasks[mode];
      ownedTask.message = progressMessage;
      ownedTask.progress = displayProgress;
    } else {
      message.textContent = progressMessage;
      percent.textContent = `${displayProgress}%`;
      bar.style.width = `${displayProgress}%`;
    }
    const previewText = target === "main" ? String(task.preview?.structure || "") : "";
    if (mode && previewText) state.creationTasks[mode].preview = previewText;
    if (!mode && previewText && previewText !== lastPreview) {
      lastPreview = previewText;
      $("emptyResult")?.classList.add("hidden");
      $("resultArea")?.classList.remove("hidden");
      if ($("structureResult")) $("structureResult").textContent = previewText;
      showResult("structure");
      if ($("createVisualPlan")) $("createVisualPlan").disabled = true;
      if ($("createVisualPlanTop")) $("createVisualPlanTop").disabled = true;
      const done = Number(task.preview?.completedChunks || 0);
      const total = Number(task.preview?.totalChunks || 0);
      if (done && total) message.textContent = `${task.message || "正在处理…"} · 已实时显示${done}/${total}段终稿${activeHint}`;
    }
    if (mode) syncCreationTaskView();
    if (task.state === "done") {
      area.dataset.state = "done";
      if (isModelTask) window.ModelActivity?.set(area,{state:"success",preserve:true});
      if (mode) { state.creationTasks[mode] = null; syncCreationTaskView(); }
      if (mode) persistCreationTasks();
      if (!mode) state.busy = false;
      if (mode) state.creationBusy[mode] = false;
      await onDone(task.result);
      return;
    }
    if (task.state === "error") {
      if (mode) { state.creationTasks[mode] = null; syncCreationTaskView(); }
      if (mode) persistCreationTasks();
      if (!mode) state.busy = false;
      if (mode) state.creationBusy[mode] = false;
      // Preview chunks are not a delivered result.  If the complete task
      // fails, remove the partial manuscript so it cannot be mistaken for a
      // saved/qualified script.
      if (!mode && lastPreview) $("resultArea")?.classList.add("hidden");
      if (mode && state.workMode === mode) {
        const previous = state.creationResults[mode];
        if (previous) renderResult(previous, true);
        else { $("resultArea").classList.add("hidden"); $("emptyResult").classList.remove("hidden"); }
      }
      throw new Error(task.error || "处理失败，请重试。");
    }
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  } catch (error) {
    area.dataset.state = "error";
    if (isModelTask) { area.classList.remove("hidden"); window.ModelActivity?.set(area,{state:"error",preserve:true}); window.ModelActivity?.text(message,error.message,true); }
    if (!mode) {
      message.textContent = error.name === "AbortError" ? "任务查询超时，生成可能仍在后台运行；请核对原任务，不要重复提交。" : error.message;
      percent.textContent = "未完成";
      bar.style.width = "0%";
    }
    throw error;
  } finally {
    if (!mode) state.busy = false;
    if (mode) {
      state.creationTasks[mode] = null;
      state.creationBusy[mode] = false;
      persistCreationTasks();
      syncCreationTaskView();
    }
  }
}

async function downloadSpeechModel() {
  if (state.speechBusy) return;
  state.speechBusy = true;
  $("downloadSpeechBtn").disabled = true;
  $("whisperModel").disabled = true;
  setSpeechState("checking", "正在从国内服务下载语音组件，请保持软件和网络开启。中断后可以继续下载。");
  try {
    const data = await postJson("/api/asr/download", { modelSize: $("whisperModel").value });
    await pollTask(data.taskId, result => {
      state.asrReady = Boolean(result.ready);
      $("speechProgress").classList.add("hidden");
      setSpeechState("ready", "语音识别组件已安装，可以直接识别视频对白；无需重启。若状态未更新，刷新页面即可。");
      toast("语音组件安装完成，现在可以识别视频对白。");
    }, "speech");
  } catch (error) {
    state.asrReady = false;
    setSpeechState("error", error.message);
    toast(error.message, true);
  } finally {
    state.speechBusy = false;
    $("downloadSpeechBtn").disabled = false;
    $("whisperModel").disabled = false;
    $("transcribeBtn").disabled = !state.asrReady || !state.videoId;
  }
}

function uploadVideo(file) {
  if (!file) return;
  $("videoMeta").textContent = `准备上传：${file.name} · ${fmtSize(file.size)}`;
  $("videoMeta").classList.remove("hidden");
  $("uploadProgress").classList.remove("hidden");
  $("uploadProgress").querySelector("i").style.width = "0%";
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload");
  xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
  xhr.setRequestHeader("Content-Type", "application/octet-stream");
  xhr.upload.onprogress = event => { if (event.lengthComputable) $("uploadProgress").querySelector("i").style.width = `${event.loaded / event.total * 100}%`; };
  xhr.onload = async () => {
    try {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status >= 400) throw new Error(data.error || "上传失败");
      state.videoId = data.videoId;
      invalidateSourceAnalysis("已选择新的原视频。");
      state.videoName = data.originalName;
      syncSourceMode();
      $("videoMeta").textContent = `视频已上传：${data.originalName} · ${watchClock(Math.round(data.durationSeconds || 0))} · ${fmtSize(data.size)}`;
      $("uploadProgress").querySelector("i").style.width = "100%";
      await checkSpeechStatus(false);
      if (state.asrReady) {
        setSpeechState("ready", "视频已上传，语音组件可用。点击“识别视频对白”即可查看识别结果。");
        toast("视频上传完成，可以识别对白。");
      } else {
        setSpeechState("missing", "视频已上传，但语音组件尚未安装。请先点击“下载语音组件”。");
        toast("视频已上传，请先下载语音组件。", true);
      }
    } catch (error) { toast(error.message, true); }
  };
  xhr.onerror = () => toast("视频上传失败，请确认本地软件仍在运行。", true);
  xhr.send(file);
}

async function transcribe() {
  if (!state.videoId) { toast("请先上传视频。", true); return null; }
  if (!state.asrReady) { toast("请先下载语音识别组件。", true); return null; }
  state.speechBusy = true;
  $("transcribeBtn").disabled = true;
  let completedResult = null;
  try {
    const data = await postJson("/api/transcribe", {
      videoId: state.videoId,
      modelSize: $("whisperModel").value,
      provider: state.provider,
      autoCorrect: $("transcriptCorrection").checked
    });
    await pollTask(data.taskId, result => {
      completedResult = result;
      invalidateSourceAnalysis("视频对白已重新识别。");
      $("sourceText").value = result.transcript;
      updateSourceCount();
      if (["video", "auto"].includes($("sourceMode").value)) $("sourceMode").value = "both";
      setSourceInputTab("text");
      $("speechProgress").classList.add("hidden");
      const corrected = result.meta.auto_corrected ? "，并已自动修正明显错别字" : "";
      const warning = result.warning ? ` ${result.warning}` : "";
      setSpeechState("recognized", `对白识别成功，共 ${result.meta.segment_count || 0} 段、约 ${Math.round(result.meta.duration || 0)} 秒${corrected}。结果已填入右侧文案框，可直接查看和修改。${warning}`);
      toast(`视频对白识别成功，共${result.meta.segment_count || 0}段${corrected}。`, Boolean(result.warning));
    }, "speech");
    return completedResult;
  } catch (error) {
    setSpeechState("ready", `识别没有完成：${error.message}`);
    toast(error.message, true);
    return null;
  } finally {
    state.speechBusy = false;
    $("transcribeBtn").disabled = !state.asrReady || !state.videoId;
  }
}

function validateBeforeGenerate() {
  if ($("platform").value === "__custom__" && !$("customPlatform").value.trim()) return "请填写自定义目标平台。";
  if ($("audience").value === "__custom__" && !$("customAudience").value.trim()) return "请填写自定义目标观众。";
  const assetRules = [
    ["peopleMode", "peopleCount", "人物", 1, 30],
    ["sceneMode", "sceneCount", "场景", 1, 40],
    ["propMode", "propCount", "关键物品", 0, 60],
  ];
  for (const [modeId, countId, label, minimum, maximum] of assetRules) {
    if (!["increase", "decrease", "custom"].includes($(modeId).value)) continue;
    const raw = $(countId).value;
    const value = Number(raw);
    if (raw === "" || !Number.isInteger(value) || value < minimum || value > maximum) return `${label}目标数量必须填写${minimum}至${maximum}之间的整数。`;
  }
  if (state.workMode === "original") {
    if (!$("originalTheme").value.trim() && !selectedPlotType()) return "请至少选择剧情类型，也可以直接从今日大厅一键参考创作。";
    if ($("productEnabled").checked && state.originalType === "emotional_commerce" && !$("productName").value.trim()) return "情感带货剧本需要填写剧中产品名称。";
    if ($("productEnabled").checked && state.originalType === "emotional_commerce" && !$("productFacts").value.trim()) return "请填写已确认的产品功效、规格或卖点事实，防止模型虚构。";
    if (!selectedTextModel("final-generate")) return "后台尚未发布可用的剧本大模型，请联系管理员。";
    if (textModelQuote(selectedTextModel("final-generate"), "original", "final-generate") == null) return "当前模型没有配置一键原创的按次价格，请选择其他模型或联系管理员。";
    if ($("productEnabled").checked && $("priceEnabled").checked && !$("productPrice").value.trim()) return "已启用价格播报，请填写产品价格。";
    return "";
  }
  const mode = $("sourceMode").value;
  const hasVideo = Boolean(state.videoId);
  const hasText = Boolean($("sourceText").value.trim());
  if (mode === "video" && !hasVideo) return "已选择“仅视频”，请先上传视频。";
  if (["text", "storyboard"].includes(mode) && !hasText) return "当前模式需要粘贴或导入文案。";
  if (mode === "both" && (!hasVideo || !hasText)) return "已选择“视频+文案”，请同时提供视频和文案。";
  if (mode === "auto" && !hasVideo && !hasText) return "请上传视频或提供文案，至少选择一种。";
  if (hasVideo && !hasText && !state.asrReady) return "纯视频改写需要语音组件，请先在第一步下载安装。";
  if (!state.sourceScriptKey || state.sourceScriptKey !== currentSourceSignature() || !hasText) return "请先保存当前原剧本。";
  if (!state.proposalDecisionMade) return "请先选择生成提案或明确跳过提案。";
  if (!state.proposalSkipped && (!state.proposalTextSnapshot || !state.selectedProposalId)) return "请确认选用一套提案，或明确跳过提案。";
  if (!state.savedRewriteConfig || !state.rewriteConfigConfirmed || state.rewriteConfigKey !== JSON.stringify(rewriteConfigSnapshot())) return "当前改写配置尚未按最新版本保存并确认。";
  if (!selectedTextModel("final-generate")) return "后台尚未发布可用的剧本大模型，请联系管理员。";
  if (textModelQuote(selectedTextModel("final-generate"), "rewrite", "final-generate") == null) return "当前模型没有配置一键改写的按次价格，请选择其他模型或联系管理员。";
  if ($("productEnabled").checked && !$("productName").value.trim()) return "已启用产品植入，请填写产品名称。";
  if ($("productEnabled").checked && !document.querySelector('input[name="productPlacement"]:checked')) return "已启用产品植入，请至少选择一个产品出现位置。";
  if ($("productEnabled").checked && (!Number.isFinite(Number($("productCoverage").value)) || Number($("productCoverage").value) < 5 || Number($("productCoverage").value) > 100)) return "已启用带货，请设置5%至100%的产品剧情覆盖度。";
  if ($("productEnabled").checked && !$("promotionStyle").value.trim()) return "已启用带货，请选择宣传表达强度。";
  if ($("productEnabled").checked && (!$("productFacts").value.trim() || !$("productPrice").value.trim())) return "已启用带货，请填写商品已确认事实和商品价格。";
  if ($("productEnabled").checked && $("priceEnabled").checked && !$("productPrice").value.trim()) return "已启用价格播报，请填写产品价格。";
  return "";
}

async function generate() {
  const mode = ["rewrite", "original"].includes(state.workMode) ? state.workMode : "";
  if (mode && (state.creationBusy[mode] || state.creationTasks[mode])) return toast(`${mode === "original" ? "原创" : "改写"}任务正在执行，请勿重复提交。`, true);
  if (!mode && state.busy) return toast("当前任务正在执行，请勿重复提交。", true);
  const problem = validateBeforeGenerate();
  if (problem) return toast(problem, true);
  if (state.workMode === "rewrite") {
    const selectedProposal = state.rewriteProposals.find(item => item.id === state.selectedProposalId) || null;
    const selected = state.proposalSkipped ? "" : selectedProposal ? proposalReferenceText(selectedProposal) : state.proposalTextSnapshot;
    const materials = [
      ["原剧本全文", $("sourceText").value.trim()],
      ...(selected ? [["已选换皮提案", selected]] : []),
      ["已保存改写配置", rewriteConfigReferenceText(state.savedRewriteConfig)]
    ];
    $("rewriteCallMaterials").innerHTML = materials.map(([title, value]) => `<details open><summary>${escapeHtml(title)}</summary><pre>${escapeHtml(value)}</pre></details>`).join("");
    $("rewriteCallConfirm").classList.remove("hidden");
    $("rewriteCallConfirm").scrollIntoView({ behavior: "smooth", block: "center" });
    state.rewriteCallPending = true;
    return;
  }
  return submitFinalGeneration(false);
}

async function submitFinalGeneration(rewriteConfirmed = false) {
  const mode = ["rewrite", "original"].includes(state.workMode) ? state.workMode : "";
  if (mode && (state.creationBusy[mode] || state.creationTasks[mode])) return toast(`${mode === "original" ? "原创" : "改写"}任务正在执行，请勿重复提交。`, true);
  if (!mode && state.busy) return toast("当前任务正在执行，请勿重复提交。", true);
  if (state.workMode === "rewrite") {
    const problem = validateBeforeGenerate();
    if (problem) return toast(problem, true);
    if (!rewriteConfirmed || !state.rewriteCallPending) return toast("请先查看资料并确认是否开始改写。", true);
  }
  $("emptyResult").classList.add("hidden");
  $("resultArea").classList.add("hidden");
  let taskMode = "";
  try {
    state.generatingScript = true;
    const selectedProposal = state.rewriteProposals.find(item => item.id === state.selectedProposalId) || null;
    const isRewrite = state.workMode === "rewrite";
    const archiveContext = isRewrite ? captureRewriteProjectContext() : null;
    if (isRewrite && selectedProposal) state.proposalTextSnapshot = proposalReferenceText(selectedProposal);
    taskMode = isRewrite ? 'rewrite' : 'original';
    state.generationMode = taskMode;
    state.creationBusy[taskMode] = true;
    const submissionId = newCreationSubmissionId();
    const submissionOwner = {submissionId,taskId:null,owner:creationOwner251(taskMode,archiveContext),message:'正在提交模型任务，请勿重复点击…',progress:1,preview:''};
    state.creationTasks[taskMode] = submissionOwner;
    persistCreationTasks();
    syncCreationTaskView();
    const finalSettings = isRewrite ? { ...normalizeRewriteSnapshot(state.savedRewriteConfig), creationMode: "rewrite", sourceMode: "text", projectName: selectedProposal?.title || "改写剧本" } : originalCreationSettings();
    const payload = isRewrite ? {
      submissionId,
      videoId: isRewrite ? "" : state.videoId,
      sourceText: $("sourceText").value,
      rewriteProjectId: isRewrite ? state.rewriteProjectId : "",
      sourceScriptKey: isRewrite ? state.sourceScriptKey : "",
      ...(!state.proposalSkipped && state.proposalTextSnapshot ? {proposalTextSnapshot:state.proposalTextSnapshot} : {}),
      proposalSkipped: isRewrite ? state.proposalSkipped : false,
      rewriteConfigText: isRewrite ? state.savedRewriteConfigText : "",
      rewriteConfigKey: isRewrite ? state.rewriteConfigKey : "",
      rewriteCallConfirmed: isRewrite && rewriteConfirmed,
      settings: finalSettings,
      modelConfig: modelConfig("final-generate", isRewrite ? "rewrite" : "original")
    } : {submissionId,settings:finalSettings, modelConfig:modelConfig("final-generate", "original")};
    payload.outputContext227={feature:taskMode,projectId:archiveContext?.outputProjectId227||'',
      projectName:archiveContext?.projectName||finalSettings.projectName||''};
    let data;
    try { data = await postJson(isRewrite ? "/api/rewrite/generate" : "/api/original/generate", payload); }
    catch (error) {
      if (!error.submissionUncertain) throw error;
      data = {taskId:await recoverCreationSubmission(submissionOwner, taskMode)};
    }
    if (!data.taskId) data.taskId = await recoverCreationSubmission(submissionOwner, taskMode);
    if (isRewrite) {
      state.rewriteCallPending = false;
      $("rewriteCallConfirm")?.classList.add("hidden");
    }
    await pollTask(data.taskId, result => {
      result = {...result, settings: {...(result.settings || {}), creationMode: taskMode}};
      const sameDraft = ownsCreationResult251(submissionOwner.owner);
      if (sameDraft) state.creationResults[taskMode] = result;
      if (state.workMode === taskMode && sameDraft) renderResult(result, false, archiveContext);
      else if (archiveContext && result.metaFile) {
        saveCurrentRewriteProject(result.metaFile, archiveContext).catch(error => toast(`成稿已保存，但项目归档失败：${error.message}`, true));
        toast('改写任务已返回到原项目；当前打开的剧本未被覆盖。'); loadHistory();
      }
      else { toast(`${taskMode === 'original' ? '原创' : '改写'}任务已返回，请回到对应板块查看。`); loadHistory(); }
    }, 'main', taskMode);
  } catch (error) { toast(error.message, true); } finally {
    if (taskMode) state.creationTasks[taskMode] = null;
    if (state.generationMode === taskMode) state.generationMode = '';
    if (taskMode) state.creationBusy[taskMode] = false;
    persistCreationTasks();
    state.generatingScript = Object.values(state.creationBusy).some(Boolean);
    syncCreationTaskView();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[ch]);
}

function pointsText(value) {
  return Number(value || 0).toFixed(2);
}

function pointsDate(value) {
  const timestamp = Number(value || 0);
  return timestamp ? new Date(timestamp * 1000).toLocaleString("zh-CN", { hour12: false }) : "";
}

function pointsMediaLabel(media) {
  return ({ video: "视频生成", image: "图片生成", text: "剧本创作", workflow: "短剧工作流" })[media] || "功能扣费";
}

function renderGlobalPointsUsage(usage) {
  state.pointsUsage = usage || null;
  const balance = Number(usage?.remainingPoints ?? usage?.points ?? 0);
  CreditGate.setBalance(balance);
  if ($("myPointsTopBalance")) $("myPointsTopBalance").textContent = pointsText(balance);
  [
    ["globalPointsTotal", usage?.points],
    ["globalPointsUsed", usage?.usedPoints],
    ["globalPointsRemaining", balance],
    ["globalPointsCredited", usage?.creditedPoints]
  ].forEach(([id, value]) => { if ($(id)) $(id).textContent = pointsText(value); });
  if ($("globalPointsNote")) {
    $("globalPointsNote").textContent = balance > 0
      ? `当前可用 ${pointsText(balance)} 积分。失败、取消或已退款的任务不会计入已使用和实际到账。`
      : "当前没有可用积分，请联系运营后台充值或调整后再使用付费功能。";
  }
  const records = Array.isArray(usage?.records) ? usage.records : [];
  if ($("globalPointsRecords")) {
    $("globalPointsRecords").innerHTML = records.length
      ? records.map(item => `<div class="visual-points-record"><span>${escapeHtml(pointsDate(item.created_at))}<small>${escapeHtml(item.admin_name || "系统")}</small></span><b class="${Number(item.deltaPoints) >= 0 ? "positive" : "negative"}">${Number(item.deltaPoints) >= 0 ? "+" : ""}${pointsText(item.deltaPoints)}</b><em>${escapeHtml(item.reason || "积分变动")}${item.balanceAfter == null ? "" : ` · 余额${pointsText(item.balanceAfter)}`}</em></div>`).join("")
      : '<span class="visual-empty">暂无积分变动记录</span>';
  }
  const orders = Array.isArray(usage?.orders) ? usage.orders : [];
  if ($("globalBillingRecords")) {
    $("globalBillingRecords").innerHTML = orders.length
      ? orders.map(item => {
          const unit = item.media === "video" ? "秒" : item.media === "image" ? "张" : "次";
          const detail = [item.model, item.resolution, item.quantity == null || item.quantity === "" ? "" : `${item.quantity}${unit}`, item.status].filter(Boolean).map(escapeHtml).join(" · ");
          return `<div class="visual-points-record"><span>${escapeHtml(pointsDate(item.created_at))}<small>${escapeHtml(pointsMediaLabel(item.media))}</small></span><b class="negative">-${pointsText(item.costPoints)}</b><em>${detail || "已完成扣费"}</em></div>`;
        }).join("")
      : '<span class="visual-empty">还没有成功完成的功能扣费记录</span>';
  }
}

async function loadGlobalPointsUsage(notify = false) {
  try {
    const response = await fetch("/api/visual/usage", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.message || "积分读取失败");
    renderGlobalPointsUsage(data.usage || {});
    if (notify) toast("积分余额和使用记录已刷新。");
  } catch (error) {
    if ($("myPointsTopBalance")) $("myPointsTopBalance").textContent = "--";
    if ($("globalPointsNote")) $("globalPointsNote").textContent = error.message || "积分读取失败";
    if (notify) toast(error.message || "积分读取失败", true);
  }
}

function openPointsCenter() {
  $("pointsCenterModal")?.classList.remove("hidden");
  document.body.classList.add("points-center-open");
  loadGlobalPointsUsage(false);
}

function closePointsCenter() {
  $("pointsCenterModal")?.classList.add("hidden");
  document.body.classList.remove("points-center-open");
}

function renderValidation(report, warnings = [], qualityScore = {}) {
  const scorePercent = value => Math.max(0, Math.min(100, Number(value) || 0));
  if (report.kind === "script-assets") {
    const assets = report.assets || {};
    const problems = [...new Set([...(report.hardIssues || []), ...(report.warnings || []), ...warnings])];
    const metrics = report.metrics || {};
    const minutes=value=>Number(value||0)/60;
    const volumeHtml = Number(metrics.estimatedDurationSeconds) > 0
      ? `<p>设定总时长：${escapeHtml(String(minutes(metrics.requestedDurationSeconds)))}分钟；本地粗估：${escapeHtml(String(minutes(metrics.estimatedDurationSeconds).toFixed(2)))}分钟（参考区间${escapeHtml(String(minutes(metrics.durationEstimateLowSeconds).toFixed(2)))}—${escapeHtml(String(minutes(metrics.durationEstimateHighSeconds).toFixed(2)))}分钟）。净对白：${escapeHtml(String(metrics.dialogueCharacters || 0))}字；动作描述：${escapeHtml(String(metrics.actionCharacters || 0))}字。估时非实测，不会自动裁稿或额外收费返修。</p>`
      : Number(metrics.requestedDurationSeconds) > 0 ? `<p>设定总时长：${escapeHtml(String(minutes(metrics.requestedDurationSeconds)))}分钟；原历史记录未保存新版对白、动作估时。正文已保留。</p>`
      : "";
    const assetHtml = report.assetRecognitionRequired ? '<p>本次只生成剧本，尚未识别成稿中的剧中资产；这里的空清单不代表人物、场景或物品数量为零。请在工作流中点击“识别剧中资产”。</p>' :
      [["people","人物"],["scenes","场景"],["props","关键物品"]].map(([key,label]) => `<h4>${label}（${(assets[key] || []).length}）</h4><ul>${(assets[key] || []).map(row => `<li><b>${escapeHtml(row.name)}</b> ${escapeHtml(row.identity || row.description || "")} ${escapeHtml(row.relation || "")}<br><small>依据：${escapeHtml(row.evidence || "待确认")}</small></li>`).join("") || '<li>暂无已确认记录</li>'}</ul>`).join("");
    const profileHtml = report.sourceProfile ? `<p>输入类型：${escapeHtml(report.sourceProfile.label)}。处理方式：${escapeHtml(report.sourceProfile.method)}（本地格式识别，不增加收费模型调用）</p>` : "";
    $("validationResult").innerHTML = `<h3>${report.creationMode === "original" ? "原创" : "改写"}剧本交付检查</h3><p>预计时长用于故事体量核对，不代表成片精确秒数。</p>` + profileHtml + volumeHtml + assetHtml +
      ((assets.uncertain || []).length ? `<h4>待确认资产</h4><ul>${assets.uncertain.map(row => `<li>${escapeHtml(row.name || "未命名")}：${escapeHtml(row.reason || "证据待确认")}</li>`).join("")}</ul>` : "") +
      (problems.length ? `<h4>交付提示</h4><ul>${problems.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : "");
    return;
  }
  const hard = report.hard_issues || [];
  const soft = [...(report.warnings || []), ...warnings];
  const ok = report.ok;
   const scoreHtml = qualityScore.overall !== undefined ? `<section class="score-card"><div class="score-total"><strong>${escapeHtml(qualityScore.overall)}</strong><span>综合评分 · ${escapeHtml(qualityScore.grade || "")}</span></div><div class="score-grid">${Object.entries(qualityScore.dimensions || {}).map(([name, value]) => `<div><span>${escapeHtml(name)}</span><b>${escapeHtml(value)}</b><i><em style="width:${scorePercent(value)}%"></em></i></div>`).join("")}</div><small>${escapeHtml(qualityScore.method || "")}</small>${qualityScore.suggestions?.length ? `<h4>优先优化建议</h4><ol>${qualityScore.suggestions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : ""}<div class="quality-optimize-tools">${stageModelControlMarkup("quality-optimize", "refine", "优化模型")}<span>可手动修改，也可选择模型使用积分优化并重新质检：</span><button type="button" class="primary-btn" data-quality-optimize="all">一键修改全部需要优化的内容</button><button type="button" class="secondary-btn" data-quality-optimize="dialogue">对白饱和度</button><button type="button" class="secondary-btn" data-quality-optimize="hook">前3秒钩子</button><button type="button" class="secondary-btn" data-quality-optimize="conflict">冲突与反转</button><button type="button" class="secondary-btn" data-quality-optimize="continuity">人物/场景连续性</button><button type="button" class="secondary-btn" data-quality-optimize="compliance">合规与成交</button></div></section>` : "";
  const assets = report.metrics?.assets || {};
  const assetLabels = { people: "人物", scenes: "场景", props: "关键物品" };
  const assetHtml = Object.entries(assets).map(([key, item]) => `<span class="quality-badge ${item.ok ? "ok" : "bad"}">${escapeHtml(assetLabels[key] || key)} ${item.target === null || item.target === undefined ? `识别${escapeHtml(item.actual)}` : `目标${escapeHtml(item.target)} / 实际${escapeHtml(item.actual)}`}</span>`).join("");
  const audit = report.metrics?.parameterAudit;
  const similarityBadge = audit?.similarityTarget === null || audit?.similarityTarget === undefined
    ? '<span class="quality-badge ok">原创模式·不审计相似度</span>'
    : `<span class="quality-badge ${Math.abs((audit.similarityScore || 0) - (audit.similarityTarget || 0)) <= 5 ? "ok" : "bad"}">相似度 目标${escapeHtml(audit.similarityTarget)}% / 实际约${escapeHtml(audit.similarityScore)}%</span>`;
  const auditHtml = audit && !audit.skipped ? `<section class="score-card"><h4>用户设定执行质检</h4><div class="validation-summary">${similarityBadge}<span class="quality-badge ${audit.renameAllPassed ? "ok" : "bad"}">全部改名 ${audit.renameAllPassed ? "通过" : "未通过"}</span><span class="quality-badge ${audit.customNameMappingPassed !== false ? "ok" : "bad"}">自定义角色映射</span><span class="quality-badge ${audit.genderRolePassed !== false ? "ok" : "bad"}">性别与角色身份</span><span class="quality-badge ${audit.dialogueAttributionPassed && Number(audit.dialogueAttributionScore || 0) >= 90 ? "ok" : "bad"}">台词归属 ${escapeHtml(audit.dialogueAttributionScore || 0)}分</span><span class="quality-badge ${audit.sceneDialogueConsistencyPassed ? "ok" : "bad"}">场景·动作·台词</span><span class="quality-badge ${audit.intensityPassed ? "ok" : "bad"}">剧情强度</span><span class="quality-badge ${audit.stylePassed ? "ok" : "bad"}">故事风格</span><span class="quality-badge ${audit.platformPassed ? "ok" : "bad"}">目标平台</span><span class="quality-badge ${audit.audiencePassed ? "ok" : "bad"}">目标观众</span></div><div class="score-grid">${[["流畅性",audit.coherence],["完整性",audit.completeness],["统一性",audit.continuity],["吸引力",audit.attraction],["带货转化",audit.commerceConversion]].map(([name,value]) => `<div><span>${name}</span><b>${escapeHtml(value || 0)}</b><i><em style="width:${scorePercent(value)}%"></em></i></div>`).join("")}</div><small>${audit.researchUsed ? "平台与受众：已结合本次公开联网搜索资料复核" : "平台与受众：公开搜索不可用，本次明确按模型已有知识复核"}</small></section>` : "";
  const changeHtml = audit && (audit.retainedElements?.length || audit.changedElements?.length || audit.finalAssetSummary) ? `<section class="score-card"><h4>本次改写说明</h4>${audit.retainedElements?.length ? `<b>保留了什么</b><ul>${audit.retainedElements.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}${audit.changedElements?.length ? `<b>改写了什么</b><ul>${audit.changedElements.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}${audit.finalAssetSummary ? `<b>成稿故事资产</b><p>${escapeHtml(audit.finalAssetSummary)}</p>` : ""}</section>` : "";
  const episodeIssue = issue => {
    const numbers = [...String(issue).matchAll(/第\s*(\d+)\s*集/g)].map(match => Number(match[1]));
    return numbers.length === 1 && numbers[0] > 0 ? numbers[0] : 0;
  };
  const repairable = hard.some(issue => episodeIssue(issue));
  const repairControl = repairable ? `<div class="episode-repair-tools">${stageModelControlMarkup("episode-repair", "refine", "逐集修正模型")}<small>点击后修订指定集并复核全剧，使用同一计费单，按显示的小调用价格结算；生成内容正常扣费，约束不通过也保留返回结果。</small></div>` : "";
  $("validationResult").innerHTML = `${scoreHtml}${auditHtml}${changeHtml}<div class="validation-summary"><span class="quality-badge ${ok ? "ok" : "bad"}">${ok ? "全部硬约束校验通过" : "仍有硬约束未通过"}</span><span>目标 ${escapeHtml(report.expected_segments)} 集 · 实际 ${escapeHtml(report.actual_segments)} 集 · 对白 ${escapeHtml(report.metrics?.totalDialogueChars || 0)} 字</span>${assetHtml}</div>${hard.length ? `<b>必须修正</b>${repairControl}<ul class="issue-list error">${hard.map(issue => { const episode = episodeIssue(issue); return `<li><span>${escapeHtml(issue)}</span>${episode ? `<button type="button" class="secondary-btn episode-repair-btn" data-repair-episode="${episode}">修改第${episode}集</button>` : ""}</li>`; }).join("")}</ul>` : ""}${soft.length ? `<b>优化提醒</b><ul class="issue-list warning">${soft.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}${!hard.length && !soft.length ? "<p>集数、时间轴、对白容量、资产数量和全部用户设定均通过检查。</p>" : ""}`;
  if ((hard.length || soft.length) && qualityScore.overall === undefined) {
    $("validationResult").insertAdjacentHTML("afterbegin", `<div class="quality-optimize-tools">${stageModelControlMarkup("quality-optimize", "refine", "修订积分")}<button type="button" class="primary-btn" data-quality-optimize="all">一键修改全部需要优化的内容</button><small>顺序修改并复核全剧，保留原版本；同一计费单结算，有问题也返回。</small></div>`);
  }
  if (report.metrics?.rewriteWorkflow || report.metrics?.storyAudit) {
    const badge = $("validationResult").querySelector(".validation-summary > .quality-badge");
    const pending = report.metrics.semanticPending || 0;
    if (badge) {
      badge.textContent = !ok ? "本地规则仍有错误" : pending ? "本地规则通过 · 剧情仍待确认" : report.metrics.semanticComplete ? "本地规则通过 · 复核未发现问题" : "本地规则通过 · 剧情复核未完成";
      badge.classList.toggle("bad", !ok || pending > 0 || !report.metrics.semanticComplete);
      badge.classList.toggle("ok", Boolean(ok && !pending && report.metrics.semanticComplete));
    }
    const passed = $("validationResult").querySelector("p");
    if (passed?.textContent.includes("全部用户设定均通过")) passed.textContent = "本地结构检查完成；模型复核是辅助意见，不代表内容绝对无误，请预览后使用。";
  }
  renderStageModelSelectors();
}

async function runStandaloneScriptScore() {
  const input = $("standaloneScoreInput");
  const button = $("standaloneScoreBtn");
  const resultBox = $("standaloneScoreResult");
  const script = String(input?.value || "").trim();
  if (!script) return toast("请粘贴需要评分的剧本，或先填入当前成稿。", true);
  button.disabled = true;
  button.textContent = "本机分析中…";
  try {
    const data = await postJson("/api/quality/score", { script, dialogueRange: $("standaloneDialogueRange")?.value || "50-80" });
    const score = data.score || {};
    const dimensions = Object.entries(score.dimensions || {}).map(([name, value]) => `<div><span>${escapeHtml(name)}</span><b>${Number(value) || 0}</b><i><em style="width:${Math.max(0,Math.min(100,Number(value)||0))}%"></em></i></div>`).join("");
    const suggestions = (score.suggestions || []).map(item => `<li>${escapeHtml(item)}</li>`).join("");
    resultBox.innerHTML = `<div class="score-card"><div class="score-total"><strong>${Number(score.overall) || 0}</strong><span>本机规则参考分 · ${escapeHtml(score.grade || "")}</span></div><div class="score-grid">${dimensions}</div><small>${escapeHtml(score.method || "")}</small>${suggestions ? `<h4>优先改进方向</h4><ol>${suggestions}</ol>` : ""}</div>`;
    resultBox.classList.remove("hidden");
    toast("独立评分完成；该结果仅为本机规则参考分。");
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = "开始独立评分"; }
}

async function optimizeCurrentResult(direction, button = null) {
  if (!state.result?.structure || state.busy) return;
  const operation = "refine";
  const modelProblem = stageModelProblem("quality-optimize", operation, "成稿AI优化");
  if (modelProblem) return toast(modelProblem, true);
  const currentSettings = { ...state.result?.settings, ...settings(), sourceAnalysis: state.result?.sourceAnalysis || state.sourceAnalysis || {} };
  const minimum = currentSettings.dialogueMinChars || state.result.validation?.metrics?.dialogueMinTarget || 50;
  const maximum = currentSettings.dialogueMaxChars || state.result.validation?.metrics?.dialogueMaxTarget || 80;
  const finishWait = beginInlineAiWait(button, "优化中");
  let succeeded = false;
  try {
    const data = await postJson("/api/quality/optimize", {
      structure: state.result.structure,
      settings: currentSettings,
      modelConfig: modelConfig("quality-optimize", operation),
      direction,
      dialogueMinChars: minimum,
      dialogueMaxChars: maximum,
      sourceText: state.result.transcript || $("sourceText").value || "",
      currentValidation: state.result.validation || {},
      currentQualityScore: state.result.qualityScore || {},
      structureFile: state.result.structureFile,
      dialogueFile: state.result.dialogueFile,
      metaFile: state.result.metaFile,
    });
    await pollTask(data.taskId, result => {
      renderResult({ ...state.result, ...result });
      toast(result.validation?.ok ? "修订与检查完成，已保存新版本。" : "已保存返回内容，仍有问题需要查看。", !result.validation?.ok);
    }, "main");
    succeeded = true;
  } catch (error) { toast(error.message, true); }
  finally { finishWait(succeeded); }
}

async function repairCurrentEpisode(episode, button = null) {
  if (!state.result?.structure || state.busy || !Number.isInteger(episode) || episode < 1) return;
  const modelProblem = stageModelProblem("episode-repair", "refine", "逐集修正");
  if (modelProblem) return toast(modelProblem, true);
  const finishWait = beginInlineAiWait(button, `第${episode}集修正中`);
  let succeeded = false;
  try {
    const currentSettings = state.result.settings || settings();
    const data = await postJson("/api/quality/repair-episode", {
      structure: state.result.structure,
      episodeNumber: episode,
      settings: currentSettings,
      sourceAnalysis: state.result.sourceAnalysis || state.sourceAnalysis || {},
      modelConfig: modelConfig("episode-repair", "refine"),
      currentValidation: state.result.validation || {},
      repairStandards: { hardIssues: (state.result.validation?.hard_issues || []).filter(issue => String(issue).includes(`第${episode}集`)), settings: currentSettings, dialogueRange: [currentSettings.dialogueMinChars, currentSettings.dialogueMaxChars], episodeSeconds: currentSettings.episodeSeconds },
      metaFile: state.result.metaFile,
    });
    await pollTask(data.taskId, result => {
      renderResult({ ...state.result, ...result });
      toast(result.repairedEpisode === episode ? `第${episode}集修订结果已保存，请查看检查结果。` : `第${episode}集未成功替换，原稿保留；可下载创作过程查看返回内容。`, !result.validation?.ok);
    }, "main");
    succeeded = true;
  } catch (error) { toast(error.message, true); }
  finally { finishWait(succeeded); }
}

function renderResult(result, fromHistory = false, archiveContext = null) {
  // A restored or mode-switched result must replace the empty placeholder.
  // Generation already hides it before submitting, but history restoration
  // and switching between original/rewrite can call renderResult directly.
  $("emptyResult")?.classList.add("hidden");
  $("resultArea")?.classList.remove("hidden");
  const resultMode = result.settings?.creationMode;
  if (['original','rewrite'].includes(resultMode)) {
    if (fromHistory && ['original','rewrite'].includes(state.workMode) && state.workMode !== resultMode) setWorkMode(resultMode, false, true);
    if (state.creationResults) state.creationResults[resultMode] = result;
    if (state.workMode !== resultMode) return;
  }
  state.result = result;
  const resultModeBanner = $("resultModeBanner");
  if (resultModeBanner) {
    const isOriginal = resultMode === "original";
    resultModeBanner.className = `result-mode-banner ${isOriginal ? "original" : "rewrite"}`;
    resultModeBanner.textContent = isOriginal
      ? "当前显示：一键原创独立成稿 · 独立原创链路 · 不读取改写原稿或改写结果"
      : "当前显示：剧本改写独立成稿 · 独立改写链路 · 不读取一键原创结果";
  }
  $("resumeLongRewrite")?.classList.toggle("hidden", !result.resumeAllowed);
  if ($('resumeLongRewrite')) $('resumeLongRewrite').textContent = resultMode === 'original' ? '继续未完成的长篇原创' : '继续未完成的长篇改写';
  const needsReconcile = ['rewrite','original'].includes(resultMode || state.workMode) && (result.reconcileAllowed === true || (result.workflowComplete === false && result.resumeRewriteFile && result.resumeAllowed === false && /超时|结果不明|连接中断/.test((result.workflowErrors || []).join(' '))));
  $("reconcileLongRewrite")?.classList.toggle("hidden", !needsReconcile);
  if ($("longRewriteProgress")) {
    $("longRewriteProgress").textContent = result.longProgressMessage || (needsReconcile ? `已保存${result.completedBatches}/${result.totalBatches}批；请先核对超时调用，核对不会扣费。` : '');
    $("longRewriteProgress").classList.toggle('hidden', !$("longRewriteProgress").textContent);
  }
  if ($("rewriteBillingSummary")) {
    const calls = result.modelCalls || [];
    const actualCount = result.modelCallCount ?? calls.length;
    const billedCount = result.billedCallCount ?? calls.filter(c => c.status === "returned").length;
    const breakdown = result.callPrice != null ? ` · ${billedCount}次 × ${pointsText(result.callPrice)}积分/次` : '';
    const total = result.chargedPoints == null || result.billingStatus === 'unknown' ? '待结算' : `${pointsText(result.chargedPoints)}积分`;
    $("rewriteBillingSummary").textContent = actualCount ? `实际调用${actualCount}次 · 成功结算${billedCount}次${breakdown} · 合计${total}${result.totalBatches ? ` · 正文${result.completedBatches}/${result.totalBatches}批` : ''}（详情可下载创作过程）` : "";
  }
  const scriptOnly = result.resultKind === "script";
  const canAcceptContinuation = scriptOnly && result.workflowComplete === false &&
    Boolean(String(result.structure || "").trim()) && /【待续正文】\s*$/.test(String(result.structure || "").trim());
  const acceptContinuation = $("acceptContinuation");
  if (acceptContinuation) {
    acceptContinuation.classList.toggle("hidden", !canAcceptContinuation);
    acceptContinuation.disabled = !canAcceptContinuation;
  }
  $("editScript").classList.toggle("hidden", !scriptOnly);
  $("scriptEditorPanel").classList.add("hidden");
  const hasStoryboard = (scriptOnly || result.hasStoryboard !== false) && Boolean(result.structure) && !/^\s*(?:\{|# 未完成的创作资料|# 分镜生成未完成)/.test(result.structure);
  document.querySelector('[data-result="structure"]').textContent = scriptOnly ? (result.settings?.creationMode === "original" ? "原创剧本" : "改写剧本") : "完整剧本";
  const validationTab = document.querySelector('[data-result="validation"]');
  const hideAssetTab = scriptOnly && ["original", "rewrite"].includes(resultMode);
  validationTab?.classList.toggle("hidden", hideAssetTab);
  const deliveryIssues = $("scriptDeliveryIssues");
  if (deliveryIssues) {
    const issues = [...new Set([...(result.workflowErrors || []), ...(result.validation?.hardIssues || [])])];
    deliveryIssues.classList.toggle("hidden", !hideAssetTab || !issues.length);
    deliveryIssues.querySelector('ul').innerHTML = issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('');
  }
  if (validationTab) validationTab.textContent = scriptOnly ? "剧本资产" : "执行约束检查";
  document.querySelector('[data-result="transcript"]')?.classList.toggle("hidden", scriptOnly);
  $("downloadStructure").textContent = "下载剧本TXT";
  if (result.projectName && $("projectName")) $("projectName").value = result.projectName;
  if ($("visualSourceInput") && hasStoryboard) {
    $("visualSourceInput").value = result.structure;
    $("visualSourceStatus").textContent = scriptOnly ? "剧本已就绪，请在工作流识别资产、切割并制作分镜。" : fromHistory ? "已载入历史分镜，可直接用于视觉制作" : "当前分镜已就绪，可直接用于视觉制作";
  }
  $("taskProgress").classList.add("hidden");
  $("resultArea").classList.remove("hidden");
  $("resultArea").querySelector('.result-actions')?.classList.remove('hidden');
  $("structureResult").textContent = result.structure || "";
  $("transcriptResult").textContent = result.transcript || "";
  const processLink = $("downloadProcess");
  if (processLink) {
    processLink.classList.toggle("hidden", !result.processFile);
    processLink.href = result.processFile ? `/api/download?file=${encodeURIComponent(result.processFile)}` : "#";
  }
  renderValidation(result.validation || {}, result.warnings || [], result.qualityScore || {});
  $("createVisualPlan").disabled = !hasStoryboard;
  $("createVisualPlanTop").disabled = !hasStoryboard;
  $("openVisualStudio").disabled = false;
  $("createVisualPlan").title = result.validation?.ok === true ? "" : "当前分镜还有质检问题，但仍可先进入视觉页查看和编辑。";
  $("downloadStructure").href = `/api/download?file=${encodeURIComponent(result.structureFile || result.scriptFile || "")}`;
  showResult(hideAssetTab ? "structure" : result.workflowComplete === false && !result.structure ? "validation" : scriptOnly ? "structure" : result.workflowComplete === false ? "validation" : "structure");
  if (!fromHistory) {
    const noSave = Number(state.historyRetention) === 0;
    const message = result.workflowComplete === false ? "实际结果已保留，有待检查项，请查看检查结果和创作过程" : noSave
      ? "生成完成，当前结果未加入本地历史"
      : (result.validation?.ok ? "生成完成，已自动保存到本地历史" : "实际内容已保存，请查看交付提示");
    toast(message, !result.validation?.ok);
    loadHistory();
    if (archiveContext && result.metaFile && !noSave) {
      saveCurrentRewriteProject(result.metaFile, archiveContext)
        .then(project => { if (project && state.rewriteProjectId === project.id && currentSourceSignature() === archiveContext.sourceSignature) renderRewriteProjectVersions(project.versions || []); })
        .catch(error => toast(`成稿已保存，但项目归档失败：${error.message}`, true));
    }
  } else {
    toast("已打开本地历史记录。");
  }
}

function acceptIncompleteRewrite() {
  const result = state.result;
  if (!result || result.resultKind !== "script" || result.workflowComplete !== false || !String(result.structure || "").trim()) return;
  result.workflowComplete = true;
  result.manualContinuationAccepted = true;
  result.warnings = [...(result.warnings || []), "已手动接受当前未完成稿；本次不调用模型、不重复扣费，后续操作将基于当前返回内容继续。"];
  const button = $("acceptContinuation");
  if (button) { button.classList.add("hidden"); button.disabled = true; }
  const hasStoryboard = Boolean(result.structure) && !/^\s*(?:\{|# 未完成的创作资料|# 分镜生成未完成)/.test(result.structure);
  $("createVisualPlan").disabled = !hasStoryboard;
  $("createVisualPlanTop").disabled = !hasStoryboard;
  showResult("structure");
  toast("已接受当前稿，可继续后续工作流；未再次调用模型，也未重复扣费。", false);
}

function openVisualStudio() {
  setWorkMode("workflow");
  document.querySelector(".work-mode-tabs").scrollIntoView({ behavior: "smooth", block: "start" });
}

window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || event.source !== $("workflowFrame").contentWindow) return;
  if (event.data?.type === "visual-center-state") {
    $("workflowFrame").dataset.projectCenter = event.data.open ? "1" : "0";
    document.body.classList.toggle("visual-project-center-mode", state.workMode === "workflow" && Boolean(event.data.open));
  }
  if (event.data?.type === "workflow-save-download") {
    const url = String(event.data.url || "");
    if (/^\/api\/download\?/.test(url)) saveLocalDownload(url).catch(error => toast(error.message, true));
  }
  if (event.data?.type === "workflow-feature-updated") loadFeatureAccess();
  if (event.data?.type === "points-usage-updated") renderGlobalPointsUsage(event.data.usage || {});
  if (event.data?.type === "workflow-height" && Number.isFinite(event.data.height)) {
    // Size the embedded workflow to its actual document height.  Keeping a
    // viewport-sized minimum leaves a large blank tail after the last episode
    // when a project has fewer cards than the window can display.
    const height = Math.max(320, Math.min(100000, Number(event.data.height)));
    const nextHeight = `${height}px`;
    if ($("workflowFrame").style.height !== nextHeight) $("workflowFrame").style.height = nextHeight;
  }
});

const visualProfileFields = [
  "imageModelEconomy", "imageModelStandard", "imageModelPremium",
  "videoModelEconomy", "videoModelStandard", "videoModelPremium",
  "imageNameEconomy", "imageNameStandard", "imageNamePremium",
  "videoNameEconomy", "videoNameStandard", "videoNamePremium",
  "imageEffectEconomy", "imageEffectStandard", "imageEffectPremium",
  "videoEffectEconomy", "videoEffectStandard", "videoEffectPremium",
  "imagePriceEconomy", "imagePriceStandard", "imagePricePremium",
  "videoPriceEconomy", "videoPriceStandard", "videoPricePremium"
];
const visualApiFields = ["imageProvider", "imageBaseUrl", "imageApiKey", "videoProvider", "videoBaseUrl", "videoApiKey"];

function updateVisualTierLabels(profile) {
  const tiers = [["economy", "Economy"], ["standard", "Standard"], ["premium", "Premium"]];
  [["visualImageTier", "image"], ["visualVideoTier", "video"]].forEach(([selectId, media]) => {
    tiers.forEach(([value, suffix]) => {
      const option = $(selectId)?.querySelector(`option[value="${value}"]`);
      if (option) {
        const item = ModelPresentation.catalog(profile || {}, media).find(item => item.tier === value);
        option.textContent = item ? item.name : "尚未配置模型";
        option.hidden = !item;
      }
    });
  });
}

function visualMediaUrl(file) {
  if (!state.visualProject?.id || !file) return "";
  return `/api/visual/media?projectId=${encodeURIComponent(state.visualProject.id)}&file=${encodeURIComponent(file)}`;
}

async function loadVisualProfile(refresh = false, notify = false) {
  try {
    const response = await fetch(`/api/visual/profile${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取视觉模型配置");
    if (JSON.stringify(state.visualProfile || {}) === JSON.stringify(data.profile || {})) { if (notify) toast('后台模型与计费配置已同步。'); return; }
    state.visualProfile = data.profile || {};
    if ($("visualBackendSyncStatus")) $("visualBackendSyncStatus").textContent = `后台模型与计费配置已同步${state.visualProfile.visualConfigRevision ? `（版本 ${state.visualProfile.visualConfigRevision}）` : ""}；新生成任务将使用当前配置。`;
    const legacyProvider = state.visualProfile.provider || "volcengine";
    const legacyBaseUrl = state.visualProfile.baseUrl || "https://ark.cn-beijing.volces.com/api/v3";
    $("visualImageProvider").value = state.visualProfile.imageProvider || legacyProvider;
    $("visualVideoProvider").value = state.visualProfile.videoProvider || legacyProvider;
    $("visualImageBaseUrl").value = state.visualProfile.imageBaseUrl || legacyBaseUrl;
    $("visualVideoBaseUrl").value = state.visualProfile.videoBaseUrl || legacyBaseUrl;
    $("visualImageApiKey").placeholder = state.visualProfile.imageApiKeyMasked ? `已保存 ${state.visualProfile.imageApiKeyMasked}，留空保留` : "填写图片 API Key";
    $("visualVideoApiKey").placeholder = state.visualProfile.videoApiKeyMasked ? `已保存 ${state.visualProfile.videoApiKeyMasked}，留空保留` : "填写视频 API Key";
    visualProfileFields.forEach(id => {
      if (state.visualProfile[id] !== undefined && state.visualProfile[id] !== null) $(id).value = state.visualProfile[id];
    });
    $("visualProfileStatus").textContent = state.visualProfile.saved
      ? `已保存：图片 ${state.visualProfile.imageApiKeyMasked || "未配置"}；视频 ${state.visualProfile.videoApiKeyMasked || "未配置"}`
      : "尚未保存视觉模型配置；框架可预览，真实生成前需要填写";
    updateVisualTierLabels(state.visualProfile);
    updateVisualEstimate();
    if (notify) toast("后台模型与计费配置已同步。", false);
  } catch (error) {
    $("visualProfileStatus").textContent = error.message;
    if (notify) toast(error.message, true);
  }
}

function visualProfilePayload() {
  const profile = {
    provider: $("visualImageProvider").value,
    baseUrl: $("visualImageBaseUrl").value.trim(),
    apiKey: "",
    imageProvider: $("visualImageProvider").value,
    imageBaseUrl: $("visualImageBaseUrl").value.trim(),
    imageApiKey: $("visualImageApiKey").value.trim(),
    videoProvider: $("visualVideoProvider").value,
    videoBaseUrl: $("visualVideoBaseUrl").value.trim(),
    videoApiKey: $("visualVideoApiKey").value.trim(),
    pointsPerCny: 1,
  };
  visualProfileFields.forEach(id => {
    profile[id] = id.includes("Price") ? Math.max(0, Number($(id).value) || 0) : $(id).value.trim();
  });
  return profile;
}

async function saveVisualProfile() {
  try {
    $("saveVisualProfile").disabled = true;
    const data = await postJson("/api/visual/profile/save", { profile: visualProfilePayload() });
    state.visualProfile = data.profile;
    $("visualImageApiKey").value = "";
    $("visualVideoApiKey").value = "";
    $("visualImageApiKey").placeholder = `已保存 ${data.profile.imageApiKeyMasked || "图片密钥"}，留空保留`;
    $("visualVideoApiKey").placeholder = `已保存 ${data.profile.videoApiKeyMasked || "视频密钥"}，留空保留`;
    $("visualProfileStatus").textContent = `已保存：图片 ${data.profile.imageApiKeyMasked || "未配置"}；视频 ${data.profile.videoApiKeyMasked || "未配置"}`;
    updateVisualTierLabels(data.profile);
    updateVisualEstimate();
    toast("视觉模型配置已保存。不同档位可以绑定不同模型。", false);
  } catch (error) { toast(error.message, true); }
  finally { $("saveVisualProfile").disabled = false; }
}

async function discoverVisualModels(media) {
  const prefix = media === "image" ? "Image" : "Video";
  const button = document.querySelector(`.discover-visual-models[data-media="${media}"]`);
  const status = $(`${media}ModelDiscoveryStatus`);
  try {
    button.disabled = true;
    button.textContent = "正在检测…";
    status.textContent = "正在验证地址和密钥，并读取模型列表…";
    const data = await postJson("/api/visual/models", { media, provider: $(`visual${prefix}Provider`).value, baseUrl: $(`visual${prefix}BaseUrl`).value.trim(), apiKey: $(`visual${prefix}ApiKey`).value.trim() });
    const models = data.models || [];
    $(`${media}ModelOptions`).innerHTML = models.map(id => `<option value="${escapeHtml(id)}"></option>`).join("");
    if (data.preset && models.length) {
      const fieldPrefix = media === "image" ? "imageModel" : "videoModel";
      [`${fieldPrefix}Economy`, `${fieldPrefix}Standard`, `${fieldPrefix}Premium`].forEach(id => {
        if (!models.includes($(id).value.trim())) $(id).value = models[0];
      });
    }
    status.textContent = data.message || `接口已接通，读取到 ${models.length} 个模型 ID。`;
    toast(`${media === "image" ? "图片" : "视频"}接口已接通。`);
  } catch (error) { status.textContent = error.message; toast(error.message, true); }
  finally { button.disabled = false; button.textContent = media === "image" ? "检测图片接口并读取模型 ID" : "检测视频接口并读取模型 ID"; }
}

function selectedVisualPrice(media) {
  const tier = $(media === "image" ? "visualImageTier" : "visualVideoTier").value;
  const suffix = tier[0].toUpperCase() + tier.slice(1);
  const field = `${media}Price${suffix}`;
  return Math.max(0, Number($(field)?.value ?? state.visualProfile?.[field]) || 0);
}

function updateVisualEstimate() {
  const project = state.visualProject;
  const assetCount = project ? ["people", "scenes", "props"].reduce((sum, kind) => sum + (project.assets?.[kind]?.length || 0), 0) : 0;
  const episodes = project?.episodes?.length || 0;
  const seconds = Math.max(2, Number($("visualVideoDuration")?.value) || 15);
  const imagePrice = selectedVisualPrice("image");
  const tier = $("visualVideoTier").value;
  const model = state.visualProfile?.[`videoModel${ModelPresentation.suffix(tier)}`] || "";
  const resolution = $("visualResolution").value;
  const imageCost = assetCount * imagePrice;
  const quotes = (project?.episodes || []).map(item => ModelPresentation.quote(state.visualProfile || {}, model, resolution, Number(item.durationSeconds) || seconds, tier, item.videoSettings?.ratio || project?.settings?.ratio || $("visualRatio").value));
  const points = quotes.every(Boolean) ? quotes.reduce((sum, quote) => sum + quote.points, 0) : null;
  const live236=ModelPresentation.isLiveQuote(state.visualProfile||{},'video',model)||ModelPresentation.isLiveQuote(state.visualProfile||{},'image',state.visualProfile?.['imageModel'+ModelPresentation.suffix($('visualImageTier').value)]||'');
  $("visualEstimate").textContent = project && live236?'当前项目按每项实际输入实时核价，生成前分别确认本次积分；静态单价不作为实时报价。':project
    ? `当前项目 ${assetCount} 个参考资产、${episodes} 集；参考图片约 ¥${imageCost.toFixed(2)}；${model || "未选模型"} / ${resolution.toUpperCase()}：${points == null ? "尚未配置计费标准" : `视频合计预计${points}积分`}。各集按实际秒数独立估算，可选首帧另计；实际扣费以渠道或积分服务账单为准。`
    : "生成前按实际模型、分辨率、图片张数和各集秒数显示预估积分。";
}

function visualAssetCard(item, kind) {
  const taskKey = `${kind}:${item.id}`;
  const task = state.visualTasks?.[taskKey];
  const image = item.imageFile ? `<img src="${visualMediaUrl(item.imageFile)}" alt="${escapeHtml(item.name)}参考图">` : escapeHtml((kind === "people" ? "人" : kind === "scenes" ? "景" : "物"));
  const actionLabel = task?.active ? "生成中…" : item.imageFile ? "重新生成" : "生成参考图";
  return `<article class="visual-card" data-visual-kind="${kind}" data-visual-id="${escapeHtml(item.id)}">
    <div class="visual-card-preview">${image}</div>
    <div class="visual-card-body"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.description || "等待补充设定")}</span>
      <textarea class="visual-asset-prompt" aria-label="${escapeHtml(item.name)}提示词">${escapeHtml(item.prompt || "")}</textarea>
      <div class="visual-card-actions"><button class="secondary-btn" data-visual-action="asset" ${task?.active ? "disabled" : ""}>${actionLabel}</button><span data-visual-task-status class="${task?.error ? "error" : task?.active ? "active" : ""}">${escapeHtml(task?.message || (item.status === "done" ? `${item.tier || ""} · ${item.size || ""}` : "可单独生成和重做"))}</span></div>
    </div>
  </article>`;
}

function visualAssetLayout(kind) {
  if (kind === "people") return $("visualRoleLayout").value;
  if (kind === "scenes") return $("visualSceneLayout").value;
  return "product_views";
}

function visualAssetSize(kind) {
  if (kind === "people") return $("visualRoleLayout").value === "four_views" ? "1024x1365" : "1792x1024";
  if (kind === "scenes") return "1792x1024";
  return $("visualImageSize").value;
}

function visualProjectSettings() {
  return { style: $("visualStyle").value, roleLayout: $("visualRoleLayout").value, sceneLayout: $("visualSceneLayout").value, eyeMask: $("visualEyeMask").checked, imageTier: $("visualImageTier").value, imageSize: $("visualImageSize").value, videoTier: $("visualVideoTier").value, videoDuration: Number($("visualVideoDuration").value), resolution: $("visualResolution").value, ratio: $("visualRatio").value };
}

function visualEpisodeCard(episode) {
  let output = "先生成第一帧，再生成视频";
  if (episode.videoFile) output = `<video controls preload="metadata" src="${visualMediaUrl(episode.videoFile)}"></video>`;
  else if (episode.firstFrameFile) output = `<img src="${visualMediaUrl(episode.firstFrameFile)}" alt="第${episode.number}集第一帧">`;
  const references = [...(episode.people || []), ...(episode.scenes || []), ...(episode.props || [])].join(" · ") || "将自动匹配已生成的参考资产";
  return `<article class="visual-episode-card" data-visual-episode="${escapeHtml(episode.id)}">
    <div class="visual-episode-source"><h4>第${episode.number}集 · 详细分镜</h4><pre>${escapeHtml(episode.storyboard || "")}</pre></div>
    <div class="visual-episode-prompt"><h4>视频描述词 · 绑定：${escapeHtml(references)}</h4><textarea class="visual-video-prompt">${escapeHtml(episode.videoPrompt || "")}</textarea></div>
    <div class="visual-episode-output"><h4>生成结果</h4><div class="visual-output-box">${output}</div><div class="visual-episode-actions"><button class="secondary-btn" data-visual-action="frame">${episode.firstFrameFile ? "重做第一帧" : "生成第一帧"}</button><button class="primary-btn" data-visual-action="video" ${episode.firstFrameFile ? "" : "disabled"}>${episode.videoFile ? "重新生成视频" : "生成视频"}</button></div></div>
  </article>`;
}

function renderVisualProject(project) {
  state.visualProject = project;
  $("visualEmpty").classList.add("hidden");
  $("visualWorkbench").classList.remove("hidden");
  $("visualStyle").value = project.style || "live_action";
  const people = project.assets?.people || [];
  const scenes = project.assets?.scenes || [];
  const props = project.assets?.props || [];
  $("visualPeopleCount").textContent = `${people.length}个角色`;
  $("visualSceneCount").textContent = `${scenes.length}个场景`;
  $("visualPropCount").textContent = `${props.length}个物品`;
  $("visualEpisodeCount").textContent = `${project.episodes?.length || 0}集 · 支持逐集制作`;
  $("visualPeople").innerHTML = people.map(item => visualAssetCard(item, "people")).join("") || '<div class="visual-empty">分镜中没有识别到角色资产表。</div>';
  $("visualScenes").innerHTML = scenes.map(item => visualAssetCard(item, "scenes")).join("") || '<div class="visual-empty">分镜中没有识别到场景资产表。</div>';
  $("visualProps").innerHTML = props.map(item => visualAssetCard(item, "props")).join("") || '<div class="visual-empty">分镜中没有识别到关键物品资产表。</div>';
  $("visualEpisodes").innerHTML = (project.episodes || []).map(visualEpisodeCard).join("");
  updateVisualEstimate();
}

async function createVisualPlan() {
  if (!state.result?.structure) return toast("请先生成或打开一份结构分镜。", true);
  if (state.result.workflowComplete === false && !await studioConfirm("当前剧本可能尚未完整。仍然使用这份正文进入工作流吗？")) return;
  if (state.result.resultKind === "script" && !await studioConfirm("确认使用这版剧本？工作流生成分镜将单独显示价格并由你确认后调用。")) return;
  localStorage.setItem("dramaVisualSource", JSON.stringify({ structure: state.result.structure, projectName: $("projectName").value || "未命名短剧", sourceType: "internal", resultKind: state.result.resultKind, assets: state.result.assets, scriptVersion: state.result.scriptVersion, durationSeconds: state.result.settings?.durationSeconds, savedAt: new Date().toISOString() }));
  setWorkMode("workflow");
  $("workflowFrame").src = `/static/visual.html?embedded=1&autoCreate=1&source=${Date.now()}`;
  toast("已带入当前成稿。创建项目后请单独识别剧中资产，再决定是否付费补齐分镜。", false);
}

$("editScript").addEventListener("click", () => {
  $("scriptEditor").value = state.result?.structure || "";
  $("scriptEditorPanel").classList.remove("hidden");
});
$("cancelScriptEdit").addEventListener("click", () => $("scriptEditorPanel").classList.add("hidden"));
$("saveScriptEdit").addEventListener("click", async () => {
  const button = $("saveScriptEdit");
  if (button.disabled) return;
  const owner = captureWritingActionOwner220();
  const metaFile = state.result?.metaFile || state.result?.id;
  const structure = $("scriptEditor").value;
  try {
    button.disabled = true;
    const result = await postJson("/api/script/revision", {metaFile, structure});
    if (!ownsWritingAction220(owner) || (state.result?.metaFile || state.result?.id) !== metaFile || $("scriptEditor").value !== structure) {
      loadHistory();
      return toast("原稿已另存新版本；当前打开的剧本或后来修改的内容已保留，未自动替换。");
    }
    renderResult(result);
    toast("已另存新版本，原稿未覆盖。进入工作流前请重新确认资产。");
  } catch (error) { toast(error.message, true); } finally { button.disabled = false; }
});

function fillVisualSourceFromCurrent() {
  if (!state.result?.structure) return toast("当前还没有可引用的分镜剧本。", true);
  $("visualSourceInput").value = state.result.structure;
  $("visualSourceStatus").textContent = "已引用当前改写分镜，可直接开始识别";
}

async function loadVisualHistorySource(recordId) {
  if (!recordId) return;
  try {
    const response = await fetch(`/api/history/item?id=${encodeURIComponent(recordId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取历史剧本");
    $("visualSourceInput").value = data.record.structure || "";
    $("visualSourceStatus").textContent = `已引用历史记录：${data.record.projectName || "未命名项目"}`;
  } catch (error) { toast(error.message, true); }
}

async function createVisualPlanFromSource() {
  const structure = $("visualSourceInput").value.trim();
  if (!structure) return toast("请引用当前分镜、选择历史记录或粘贴自己的剧本。", true);
  try {
    $("createVisualPlanFromSource").disabled = true;
    const submitted = await postJson("/api/visual/plan", {
      structure,
      projectName: $("projectName").value || "视觉制作项目",
      style: $("visualStyle").value || "live_action",
      settings: visualProjectSettings(),
    });
    const data = submitted.taskId ? await waitMarketingTask(submitted.taskId) : submitted;
    renderVisualProject(data.project);
    $("visualSourceStatus").textContent = "识别完成，已建立本项目的人物、场景、物品和分集工作流";
    $("visualCard").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("已从指定剧本识别角色、场景、物品和分集。", false);
  } catch (error) { toast(error.message, true); }
  finally { $("createVisualPlanFromSource").disabled = false; }
}

function normalizeVisualSource() {
  toast("请在短剧工作流导入外部剧本，点击“下一步开始编排剧本”。这里不再使用旧补齐规则，也不会扣费。", true);
}

async function runVisualTask(url, payload, successMessage) {
  const assetKey = payload.kind && payload.assetId ? `${payload.kind}:${payload.assetId}` : "";
  const card = assetKey ? document.querySelector(`[data-visual-kind="${CSS.escape(payload.kind)}"][data-visual-id="${CSS.escape(payload.assetId)}"]`) : null;
  const taskStatus = card?.querySelector("[data-visual-task-status]");
  let taskId = "";
  try {
    const submitted = await postJson(url, payload);
    taskId = submitted.taskId;
    if (assetKey) state.visualTasks[assetKey] = {active:true, message:"已提交，等待模型返回图片…", taskId};
    if (taskStatus) { taskStatus.className = "active"; window.ModelActivity?.set(taskStatus,{state:"pending",message:""}); }
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {cache:"no-store"});
      const task = await response.json();
      if (!response.ok) throw new Error(task.error || "无法读取图片任务状态");
      const message = `${task.message || "正在生成图片…"}${task.state === "running" ? ` · ${Math.floor((Date.now() - Number(task.startedAt || Date.now())) / 1000)}秒` : ""}`;
      if (assetKey) state.visualTasks[assetKey] = {active: ["queued","running"].includes(task.state), message, taskId};
      if (taskStatus) { taskStatus.className = ["queued","running"].includes(task.state) ? "active" : ""; window.ModelActivity?.task(taskStatus,task,{success:"图片已就绪"}); }
      if (task.state === "done") {
        if (assetKey) state.visualTasks[assetKey] = {active:false, message:"图片已就绪", taskId};
        renderVisualProject(task.result.project);
        toast(`${successMessage}${task.result.estimatedCost ? `，本次估算 ¥${Number(task.result.estimatedCost).toFixed(2)}` : ""}`);
        return;
      }
      if (task.state === "error") throw new Error(task.error || "图片生成失败，可查看错误后重新提交。");
      await new Promise(resolve => setTimeout(resolve, 900));
    }
    throw new Error("等待超过10分钟，已停止前端等待。请查看任务中心状态；如果仍显示运行中，请勿重复提交，稍后刷新。 ");
  } catch (error) {
    if (assetKey) state.visualTasks[assetKey] = {active:false, error:true, taskId, message:error.message};
    if (taskStatus) { taskStatus.className = "error"; window.ModelActivity?.text(taskStatus,`失败：${error.message}`,true); }
    throw error;
  }
}

async function handleVisualAction(button) {
  if (!state.visualProject) return;
  const assetCard = button.closest("[data-visual-id]");
  const episodeCard = button.closest("[data-visual-episode]");
  if (assetCard && state.visualTasks[`${assetCard.dataset.visualKind}:${assetCard.dataset.visualId}`]?.active) return;
  button.disabled = true;
  try {
    if (button.dataset.visualAction === "asset" && assetCard) {
      const kind = assetCard.dataset.visualKind;
      await runVisualTask("/api/visual/asset/generate", {
        projectId: state.visualProject.id,
        kind,
        assetId: assetCard.dataset.visualId,
        prompt: assetCard.querySelector(".visual-asset-prompt").value,
        tier: $("visualImageTier").value,
        size: visualAssetSize(kind),
        layout: visualAssetLayout(kind),
        eyeMask: kind === "people" && $("visualEyeMask").checked,
      }, "参考图已生成并保存到本机项目");
    } else if (button.dataset.visualAction === "frame" && episodeCard) {
      await runVisualTask("/api/visual/episode/frame", {
        projectId: state.visualProject.id,
        episodeId: episodeCard.dataset.visualEpisode,
        prompt: episodeCard.querySelector(".visual-video-prompt").value,
        tier: $("visualImageTier").value,
        size: $("visualRatio").value === "16:9" ? "1792x1024" : $("visualRatio").value === "1:1" ? "1024x1024" : "1024x1792",
      }, "本集第一帧已生成");
    } else if (button.dataset.visualAction === "video" && episodeCard) {
      await runVisualTask("/api/visual/episode/video", {
        projectId: state.visualProject.id,
        episodeId: episodeCard.dataset.visualEpisode,
        prompt: episodeCard.querySelector(".visual-video-prompt").value,
        tier: $("visualVideoTier").value,
        duration: Number($("visualVideoDuration").value),
        resolution: $("visualResolution").value,
        ratio: $("visualRatio").value,
      }, "本集视频已生成并保存");
    }
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
}

function showResult(name) {
  state.activeResult = name;
  document.querySelectorAll(".result-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.result === name));
  ["structure", "validation", "transcript"].forEach(item => $(`${item}Result`)?.classList.toggle("hidden", item !== name));
}

document.querySelectorAll(".step-link").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".step-link").forEach(x => x.classList.remove("active"));
  button.classList.add("active");
  $(button.dataset.target).scrollIntoView({ behavior: "smooth", block: "start" });
}));
document.querySelectorAll(".provider-tab").forEach(button => button.addEventListener("click", () => applyProvider(button.dataset.provider)));
document.querySelectorAll(".result-tab").forEach(button => button.addEventListener("click", () => showResult(button.dataset.result)));
document.querySelectorAll(".work-mode-tab").forEach(button => button.addEventListener("click", () => {
  if (button.dataset.workMode === "workflow" && button.dataset.action !== "open") { handleWorkflowAccessAction(); return; }
  const canvasFrame = button.dataset.workMode === "canvas" ? $("canvasFrame") : null;
  const canvasAlreadyLoaded = canvasFrame?.hasAttribute("src");
  setWorkMode(button.dataset.workMode);
  if (canvasAlreadyLoaded) canvasFrame.contentWindow?.postMessage({type:"canvas-show-projects"}, location.origin);
  if (button.dataset.workMode === "workflow") loadFeatureAccess();
}));
document.querySelectorAll(".original-type").forEach(button => button.addEventListener("click", () => setOriginalType(button.dataset.originalType)));
$("chooseVideo").addEventListener("click", () => $("videoInput").click());
document.querySelectorAll("[data-source-input]").forEach(button => button.addEventListener("click", () => setSourceInputTab(button.dataset.sourceInput)));
$("videoInput").addEventListener("change", event => uploadVideo(event.target.files[0]));
$("videoDrop").addEventListener("dragover", event => { event.preventDefault(); $("videoDrop").classList.add("dragover"); });
$("videoDrop").addEventListener("dragleave", () => $("videoDrop").classList.remove("dragover"));
$("videoDrop").addEventListener("drop", event => { event.preventDefault(); $("videoDrop").classList.remove("dragover"); uploadVideo(event.dataTransfer.files[0]); });
$("textFileInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  const navigationEpoch = ++creationNavigationEpoch;
  let text;
  try { text = await file.text(); } catch (_) { return toast('无法读取剧本文件，请重新选择。',true); }
  if (navigationEpoch !== creationNavigationEpoch) return;
  $("sourceText").value = text;
  invalidateSourceAnalysis("已导入新的原剧本文件。");
  updateSourceCount();
  if ($("sourceMode").value === "auto") $("sourceMode").value = state.videoId ? "both" : "text";
});
$("sourceText").addEventListener("input", () => { updateSourceCount(); invalidateSourceAnalysis("原剧本/对白已修改。"); });
document.addEventListener('input', event => {
  if (event.target.id === 'projectName' || event.target.closest('#originalCard,#sourceCard,#rewriteCard')) creationNavigationEpoch += 1;
});
$("clearText").addEventListener("click", () => { $("sourceText").value = ""; invalidateSourceAnalysis("原剧本/对白已清空。"); updateSourceCount(); });
$("analyzeSourceBtn")?.addEventListener("click", analyzeSource);
$("saveSourceScriptBtn")?.addEventListener("click", saveSourceScript);
$("generateProposalsBtn")?.addEventListener("click", generateRewriteProposals);
$("recoverProposalsBtn")?.addEventListener("click", recoverRewriteProposals);
$("proposalNeedBtn")?.addEventListener("click", generateRewriteProposals);
$("proposalSkipBtn")?.addEventListener("click", skipRewriteProposal);
$("proposalSkipAfterGenerateBtn")?.addEventListener("click", skipRewriteProposal);
$("proposalRegenerateBtn")?.addEventListener("click", generateRewriteProposals);
$("confirmSourceAssetsBtn")?.addEventListener("click", confirmSourceAssets);
$("saveRewriteConfigBtn")?.addEventListener("click", saveRewriteConfig);
$("confirmRewriteCallBtn")?.addEventListener("click", () => submitFinalGeneration(true));
$("cancelRewriteCallBtn")?.addEventListener("click", () => {
  state.rewriteCallPending = false;
  $("rewriteCallConfirm")?.classList.add("hidden");
  toast("已取消本次提交；没有调用模型或扣积分。修改完成后可再次确认。" );
});
$("standaloneScoreBtn")?.addEventListener("click", runStandaloneScriptScore);
$("copyCurrentForScoring")?.addEventListener("click", () => {
  const text = state.result?.structure || "";
  if (!text) return toast("当前还没有已完成的剧本成稿。", true);
  $("standaloneScoreInput").value = text;
  $("standaloneScoreCard").scrollIntoView({behavior:"smooth", block:"center"});
  toast("当前结构分镜已填入独立评分框；点击“开始独立评分”后才会分析。");
});
$("sourceAnalysisEditors")?.addEventListener("input", event => {
  const editor = event.target.closest("[data-analysis-field]");
  if (editor && state.sourceAnalysis) { state.sourceAnalysis[editor.dataset.analysisField] = editor.value; invalidateDownstream("原剧拆解已编辑，请重新确认当前资产版本。"); queueRewriteProjectSave(); }
});
$("sourceAnalysisOverview")?.addEventListener("input", event => {
  const editor = event.target.closest("[data-analysis-overview]");
  if (!editor || !state.sourceAnalysis) return;
  state.sourceAnalysis[editor.dataset.analysisOverview] = editor.type === "checkbox" ? editor.checked : editor.value;
  invalidateDownstream("原剧拆解已编辑，请重新确认当前资产版本。");
  queueRewriteProjectSave();
});
$("sourceAnalysisOverview")?.addEventListener("change", event => {
  const editor = event.target.closest("[data-analysis-overview]");
  if (editor?.type === "checkbox" && state.sourceAnalysis) { state.sourceAnalysis.isCommerce = editor.checked; invalidateDownstream("原剧拆解已编辑，请重新确认当前资产版本。"); queueRewriteProjectSave(); }
});
$("sourceAnalysisAssets")?.addEventListener("input", event => {
  const editor = event.target.closest("[data-analysis-asset]");
  if (!editor || !state.sourceAnalysis) return;
  const groups = prepareAssetGroups(state.sourceAnalysis);
  const group = editor.dataset.analysisAssetGroup || "confirmed";
  const row = groups[group]?.[editor.dataset.analysisAsset]?.[Number(editor.dataset.analysisAssetIndex)];
  if (row && typeof row === "object") { row[editor.dataset.analysisAssetKey] = editor.value; invalidateDownstream("人物、场景或物品已编辑，请重新确认当前资产版本。"); updateAssetConfirmationUi(); queueRewriteProjectSave(); }
});
$("sourceAnalysisAssets")?.addEventListener("click", event => {
  const button = event.target.closest("[data-asset-action]");
  if (!button || !state.sourceAnalysis) return;
  event.preventDefault();
  const groups = prepareAssetGroups(state.sourceAnalysis);
  if (button.dataset.assetAction === "confirm-all") {
    const count = suspectedAssetCount(state.sourceAnalysis);
    if (!count) return;
    for (const type of ["characters", "scenes", "props"]) {
      for (const item of groups.suspected[type]) {
        item.assetStatus = "confirmed";
        item.evidenceVerified = true;
        item.confirmedByUser = true;
        groups.confirmed[type].push(item);
      }
      groups.suspected[type] = [];
    }
    toast(`已将剩余${count}项疑似资产纳入已确认；请核对后点击“保存并确认资产清单”。`);
  } else {
    const type = button.dataset.assetType;
    const groupName = button.dataset.assetGroup || "suspected";
    const index = Number(button.dataset.assetIndex);
    const rows = groups[groupName]?.[type];
    if (!Array.isArray(rows) || !Number.isInteger(index) || !rows[index]) return;
    const item = rows[index];
    if (button.dataset.assetAction === "confirm") {
      rows.splice(index, 1);
      item.assetStatus = "confirmed";
      item.evidenceVerified = true;
      item.confirmedByUser = true;
      groups.confirmed[type].push(item);
      toast(`已将“${item.name || "该资产"}”纳入已确认资产。`);
    } else if (button.dataset.assetAction === "delete") {
      rows.splice(index, 1);
      toast(`已删除“${item.name || "该资产"}”。`);
    } else return;
  }
  prepareAssetGroups(state.sourceAnalysis);
  invalidateDownstream("资产清单已变化，请继续处理并保存确认结果。");
  $("sourceAnalysisAssets").innerHTML = renderAssetGroups(state.sourceAnalysis);
  const suspected = suspectedAssetCount(state.sourceAnalysis);
  $("sourceAnalysisState").textContent = `已整理 · 已确认${state.sourceAnalysis.characters?.length || 0}人/${state.sourceAnalysis.scenes?.length || 0}场景/${state.sourceAnalysis.props?.length || 0}物品 · 疑似${suspected}项`;
  updateAssetConfirmationUi();
  queueRewriteProjectSave();
});
$("sourceAnalysisEditors")?.addEventListener("click", event => {
  const button = event.target.closest("[data-analysis-ai]");
  if (button) { event.preventDefault(); refineAnalysisField(button.dataset.analysisAi); }
});
$("proposalGrid")?.addEventListener("click", event => {
  const aiButton = event.target.closest("[data-ai-refine-proposal]");
  if (aiButton) { event.preventDefault(); refineRewriteProposal(aiButton.dataset.aiRefineProposal); return; }
  const button = event.target.closest("[data-select-proposal]");
  if (!button) return;
  if (!state.sourceScriptKey || state.sourceScriptKey !== currentSourceSignature()) return toast("当前提案对应的原剧本已变化，请重新保存后再选择。", true);
  state.selectedProposalId = button.dataset.selectProposal;
  const proposal = state.rewriteProposals.find(item => item.id === state.selectedProposalId);
  state.proposalSkipped = false;
  state.proposalDecisionMade = true;
  state.proposalTextSnapshot = proposalReferenceText(proposal || {});
  invalidateRewriteConfig("已选择提案，请填写并保存当前版本的改写配置。");
  renderRewriteProposals(state.rewriteProposals);
  guideToRewriteSection("rewriteCard", true);
  toast(`已选择${state.selectedProposalId}案并保存本版提案快照；请继续填写改写配置。`);
});
$("proposalGrid")?.addEventListener("input", event => {
  const editor = event.target.closest("[data-edit-proposal]");
  if (!editor) return;
  const proposal = state.rewriteProposals.find(item => item.id === editor.dataset.editProposal);
  if (proposal) { proposal[editor.dataset.editProposalField] = editor.value; invalidateProposalChoice("提案已编辑，请重新选择这套提案，或跳过提案。"); queueRewriteProjectSave(); }
});
$("rewriteCard")?.addEventListener("change", () => { invalidateRewriteConfig(); queueRewriteProjectSave(); });
$("rewriteCard")?.addEventListener("input", () => { invalidateRewriteConfig(); queueRewriteProjectSave(); });
$("rewriteProjectVersions")?.addEventListener("click", event => {
  const button = event.target.closest("[data-open-rewrite-version]");
  if (button) openHistory(button.dataset.openRewriteVersion, button.dataset.historyVersion);
});
$("durationMinutes").addEventListener("input", updateDuration);
$("episodeSeconds").addEventListener("input", updateDuration);
$("storyStyle")?.addEventListener("change", updateRewriteCustomFields);
$("platform")?.addEventListener("change", updateRewriteCustomFields);
$("audience")?.addEventListener("change", updateRewriteCustomFields);
$("rewriteEra")?.addEventListener("change", updateRewriteCustomFields);
$("originalEpisodeValue").addEventListener("input", updateDuration);
$("originalEpisodeUnit").addEventListener("change", updateDuration);
$("originalEpisodeCount").addEventListener("input", updateDuration);
$("similarity").addEventListener("input", () => $("similarityValue").textContent = `${$("similarity").value}%`);
[["peopleMode","peopleCount"],["sceneMode","sceneCount"],["propMode","propCount"]].forEach(([a,b]) => $(a).addEventListener("change", () => updateCountInput(a,b)));
$("productEnabled").addEventListener("change", syncProductSettingsVisibility);
$("productCoverage").addEventListener("input", () => $("productCoverageValue").textContent = `${$("productCoverage").value}%`);
$("recommendOriginal").addEventListener("click", () => requestOriginalRecommendation("settings"));
$("refreshOriginalSettings").addEventListener("click", () => requestOriginalRecommendation("settings", false, true));
installOriginalFieldActions();
$("originalCard").addEventListener("click", event => {
  const button = event.target.closest("[data-field-ai]");
  if (button) { event.preventDefault(); requestOriginalFieldUpdate(button.dataset.fieldAi); }
});
$("refreshHotTypes").addEventListener("click", () => {
  if (state.originalType === "emotional_commerce") return toast("情感带货可观看大厅正在筹备中，当前不会混入普通真人短剧。", true);
  $("refreshHotTypes").disabled = true;
  requestHallRank(state.originalType, true);
});
$("hotTypeCount").addEventListener("input", () => loadDailyHall(state.originalType, false));
$("dailyWorkCount").addEventListener("change", () => { syncHallWorkCount(); loadDailyHall(state.originalType, false); });
$("originalPlotType").addEventListener("change", () => {
  $("customPlotTypeField").classList.toggle("hidden", $("originalPlotType").value !== "__custom__");
  if ($("originalPlotType").value === "__custom__") $("customPlotType").focus();
});
document.querySelectorAll(".hall-channel[data-hall-type]").forEach(button => button.addEventListener("click", () => setOriginalType(button.dataset.hallType)));
$("hallFavoritesTab").addEventListener("click", event => { event.stopPropagation(); showHallFavorites(); });
$("hallDownloadsTab").addEventListener("click", event => { event.stopPropagation(); showHallDownloads(); });
$("closeHallPlayer").addEventListener("click", closeHallPlayer);
$("hallPrevEpisode").addEventListener("click", () => playHallEpisode(state.hallEpisodeIndex - 1));
$("hallNextEpisode").addEventListener("click", () => playHallEpisode(state.hallEpisodeIndex + 1));
$("hallEpisodeSelect").addEventListener("change", () => playHallEpisode(Number($("hallEpisodeSelect").value)));
$("trendResults").addEventListener("click", async event => {
  if (event.target.closest("#refreshHallDownloads")) return loadHallDownloads(true);
  const downloadAction = event.target.closest("[data-download-action]");
  const downloadCard = event.target.closest(".downloaded-series-card");
  if (downloadAction && downloadCard) {
    const record = state.hallDownloads[Number(downloadCard.dataset.downloadIndex)];
    if (downloadAction.dataset.downloadAction === "play") playDownloadedSeries(record);
    return;
  }
  const pageButton = event.target.closest("[data-hall-page]");
  if (pageButton && !pageButton.disabled) {
    state.hallPage = Number(pageButton.dataset.hallPage) || 1;
    renderTrendHall(state.hallRenderTypes, state.hallAllWorks, state.hallRenderMessage, state.hallRenderProgress);
    $("trendResults").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (event.target.closest("#clearHallFavorites")) {
    if (await studioConfirm("确定清空全部本地收藏吗？此操作不会删除已下载视频或生成记录。")) {
      state.hallFavorites = [];
      saveHallFavorites();
      showHallFavorites();
      toast("本地收藏已清空。");
    }
    return;
  }
  const plot = event.target.closest(".trend-chip");
  const plotCard = event.target.closest(".trend-card");
  if (plot || plotCard) {
    const value = (plot || plotCard).dataset.plot || "";
    setPlotType(value);
    $("originalTheme").focus();
    toast(`已选择剧情类型：${value}。其他内容可不填，点击“智能补全全部设定”即可。`);
    return;
  }
  const action = event.target.closest("[data-work-action]");
  const card = event.target.closest(".reference-work");
  if (!action || !card) return;
  const work = state.hallWorks[Number(card.dataset.workIndex)];
  if (action.dataset.workAction === "play") playHallWork(work);
  if (action.dataset.workAction === "favorite") toggleHallFavorite(work);
});
$("validationResult").addEventListener("click", event => {
  const repairButton = event.target.closest("[data-repair-episode]");
  if (repairButton) return repairCurrentEpisode(Number(repairButton.dataset.repairEpisode), repairButton);
  const button = event.target.closest("[data-quality-optimize]");
  if (button) optimizeCurrentResult(button.dataset.qualityOptimize, button);
});
$("trendResults").addEventListener("pointerover", event => {
  const card = event.target.closest(".hall-poster-card");
  if (card?.classList.contains("downloaded-series-card")) return;
  if (!card || card.contains(event.relatedTarget)) return;
  scheduleHallCardPreview(card);
});
$("trendResults").addEventListener("pointerout", event => {
  const card = event.target.closest(".hall-poster-card");
  if (!card || card.contains(event.relatedTarget)) return;
  clearTimeout(state.hallHoverTimer);
  stopHallCardPreview(card);
});
$("trendResults").addEventListener("contextmenu", event => {
  const card = event.target.closest(".reference-work");
  if (!card || card.classList.contains("downloaded-series-card")) return;
  event.preventDefault();
  state.hallContextWork = state.hallWorks[Number(card.dataset.workIndex)] || null;
  const menu = $("hallContextMenu");
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 210)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 310)}px`;
  menu.classList.remove("hidden");
  menu.querySelector('[data-hall-action="play"]').disabled = !state.hallContextWork?.playableCandidate;
  menu.querySelector('[data-hall-action="favorite"]').textContent = isHallFavorite(state.hallContextWork) ? "★ 移出收藏" : "☆ 收藏这部剧";
});
$("hallContextMenu").addEventListener("click", async event => {
  const action = event.target.closest("[data-hall-action]")?.dataset.hallAction;
  $("hallContextMenu").classList.add("hidden");
  if (action === "play") playHallWork(state.hallContextWork);
  if (action === "favorite") toggleHallFavorite(state.hallContextWork);
  if (action === "download-series") await downloadHallSeries(state.hallContextWork);
  if (action === "rewrite-series") await rewriteHallSeries(state.hallContextWork);
  if (action === "detail") {
    const url = state.hallContextWork?.detailUrl || state.hallContextWork?.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }
  if (action === "copy" && state.hallContextWork?.url) {
    navigator.clipboard.writeText(state.hallContextWork.url).then(() => toast("作品链接已复制。")).catch(() => toast("作品链接复制失败：系统未允许访问剪贴板，请手动复制。",true));
  }
});
document.addEventListener("click", event => {
  if (!event.target.closest("#hallContextMenu")) $("hallContextMenu").classList.add("hidden");
});
$("toggleKey").addEventListener("click", () => { const hidden = $("apiKey").type === "password"; $("apiKey").type = hidden ? "text" : "password"; $("toggleKey").textContent = hidden ? "隐藏" : "显示"; });
$("saveModel").addEventListener("click", saveModel);
$("modelTest").addEventListener("click", testModel);
$("textModelSelect")?.addEventListener("change", event => {
  localStorage.setItem("drama-text-model", event.target.value);
  updateTextModelEstimate();
  document.querySelectorAll("[data-text-model-stage]").forEach(select => {
    if (select.dataset.textModelStage === "source-analyze") return;
    select.value = event.target.value;
    localStorage.setItem(`drama-text-model-${select.dataset.textModelStage}`, select.value);
    updateStageModelQuote(select);
  });
});
document.addEventListener("change", event => {
  const select = event.target.closest("[data-text-model-stage]");
  if (!select) return;
  if (select.dataset.textModelStage === "source-analyze") localStorage.setItem("drama-recognition-model", select.value);
  localStorage.setItem(`drama-text-model-${select.dataset.textModelStage}`, select.value);
  updateStageModelQuote(select);
});
$("checkSpeechBtn").addEventListener("click", () => checkSpeechStatus(true));
$("downloadSpeechBtn").addEventListener("click", downloadSpeechModel);
$("whisperModel").addEventListener("change", () => checkSpeechStatus(false));
$("transcribeBtn").addEventListener("click", transcribe);
$("generateBtn").addEventListener("click", generate);
$("generateMarketingPlan").addEventListener("click", generateMarketingPlan);
$("sendMarketingToWorkflow").addEventListener("click", sendMarketingToWorkflow);
document.querySelectorAll(".marketing-mode").forEach(button => button.addEventListener("click", () => setMarketingMode(button.dataset.marketingMode)));
$("chooseMarketingVideo").addEventListener("click", () => {
  if (!$("marketingRightsConfirmed").checked) return toast("请先勾选素材使用权确认。", true);
  $("marketingVideoInput").click();
});
$("marketingVideoInput").addEventListener("change", event => {
  const file=event.target.files[0];
  queueMicrotask(()=>uploadMarketingVideo(file));
});
$("importMarketingLink").addEventListener("click", importMarketingLink);
$("analyzeMarketingReference").addEventListener("click", analyzeMarketingReference);
$("marketingStrength").addEventListener("input", () => { $("marketingStrengthValue").textContent = `${$("marketingStrength").value}%`; if (["ecommerce","store","advertising"].includes(state.workMode)) state.marketingStrengths[state.workMode] = Number($("marketingStrength").value); });
$("marketingReferenceAnalysis").addEventListener("input", () => {
  ++marketingReferenceRevision262;
  state.marketingReferenceAnalysis = $("marketingReferenceAnalysis").value.trim();
  $("marketingReferenceState").className = 'status-pill ready';
  $("marketingReferenceState").textContent = '已手动修改';
});
$("marketingDuration").addEventListener("change", () => $("marketingCustomDurationField").classList.toggle("hidden", $("marketingDuration").value !== "custom"));
$("marketingCustomDuration").addEventListener("input", () => { if (Number($("marketingCustomDuration").value) > 600) $("marketingCustomDuration").value = "600"; });
$("storeIndustry")?.addEventListener("change", syncStoreBuilderVisibility);
for (const id of ['storeExplainPackage262','storeSpeakPrice262','storeIncludeAddress262']) $(id)?.addEventListener('change', syncStoreBuilderVisibility);
$("storeVideoType")?.addEventListener("change", syncStoreBuilderVisibility);
$("storeVoice")?.addEventListener("change", syncStoreBuilderVisibility);
$("storeSceneFiles")?.addEventListener("change", event => { state.storeFiles.scenes = [...event.target.files].slice(0, 12); updateStoreMaterialSummary(); });
$("storeProductFiles")?.addEventListener("change", event => { state.storeFiles.products = [...event.target.files].slice(0, 10); updateStoreMaterialSummary(); });
$("marketingResult").addEventListener("input", () => {
  $("sendMarketingToWorkflow").disabled = !$("marketingResult").value.trim();
});
$("createVisualPlan").addEventListener("click", createVisualPlan);
$("createVisualPlanTop").addEventListener("click", createVisualPlan);
$("acceptContinuation")?.addEventListener("click", acceptIncompleteRewrite);
const resumePreparingModes251 = new Set();
async function resumeRewriteGeneration() {
  const ownerMode = state.result?.settings?.creationMode || state.workMode;
  if (!['rewrite','original'].includes(ownerMode) || !state.result?.resumeAllowed) return;
  if (state.creationBusy[ownerMode] || state.creationTasks[ownerMode] || resumePreparingModes251.has(ownerMode)) return toast('这个创作板块的原任务仍在进行，请等待返回。');
  resumePreparingModes251.add(ownerMode);
  const metaFile = state.result.metaFile;
  const archiveContext = ownerMode === 'rewrite' && state.sourceScriptKey && (!state.result.rewriteProjectId || state.result.rewriteProjectId === state.rewriteProjectId) ? captureRewriteProjectContext() : null;
  const resultOwner=creationOwner251(ownerMode,archiveContext);
  const resumeModelConfig = modelConfig('final-generate',ownerMode);
  let submitted = false;
  try {
    if (!await studioConfirm("将继续原任务的未完成阶段，已完成批次不重跑。新增索引、正文或检查调用按后台配置单独计费。是否继续？")) return;
    submitted = true;
    state.generatingScript = true;
    state.creationBusy[ownerMode] = true;
    $("resumeLongRewrite").disabled = true;
    const owner = {submissionId:newCreationSubmissionId(),taskId:null,owner:resultOwner,message:`正在继续原${ownerMode === 'original' ? '原创' : '改写'}任务…`,progress:1,preview:''};
    state.creationTasks[ownerMode] = owner;
    persistCreationTasks();syncCreationTaskView();
    let data;
    try { data = await postJson("/api/rewrite/resume", {submissionId:owner.submissionId,metaFile,modelConfig:resumeModelConfig}); }
    catch (error) { if (!error.submissionUncertain) throw error; data = {taskId:await recoverCreationSubmission(owner,ownerMode)}; }
    if (!data.taskId) data.taskId = await recoverCreationSubmission(owner,ownerMode);
    await pollTask(data.taskId, result => {
      result = {...result, settings:{...(result.settings || {}),creationMode:ownerMode}};
      const sameDraft = ownsCreationResult251(owner.owner);
      if (sameDraft) state.creationResults[ownerMode] = result;
      if (state.workMode === ownerMode && sameDraft) renderResult(result,false,archiveContext);
      else { if(archiveContext&&result.metaFile) saveCurrentRewriteProject(result.metaFile,archiveContext).catch(error=>toast(error.message,true)); loadHistory();toast('原创作任务已返回，当前编辑稿未被替换。'); }
    },'main',ownerMode);
  } catch (error) { toast(error.message, true); }
  finally {
    resumePreparingModes251.delete(ownerMode);
    if (submitted) {state.creationTasks[ownerMode]=null;state.creationBusy[ownerMode]=false;persistCreationTasks();syncCreationTaskView();}
    state.generatingScript = Object.values(state.creationBusy).some(Boolean);
    $("resumeLongRewrite").disabled = false;
  }
}
$("resumeLongRewrite")?.addEventListener("click", resumeRewriteGeneration);
async function reconcileCreationResult() {
  if (!state.result?.metaFile || $("reconcileLongRewrite").disabled) return;
  const metaFile = state.result.metaFile;
  const ownerMode = state.result.settings?.creationMode || state.workMode;
  if (!['original','rewrite'].includes(ownerMode)) return;
  $("reconcileLongRewrite").disabled = true;
  try {
    const data = await postJson('/api/rewrite/reconcile', {metaFile, modelConfig:modelConfig('final-generate',ownerMode)});
    if (state.workMode === ownerMode && state.result?.metaFile === metaFile) renderResult(data.result, true);
    toast(data.message);
  } catch (error) { toast(error.message, true); }
  finally { $("reconcileLongRewrite").disabled = false; }
}
$("reconcileLongRewrite")?.addEventListener("click", reconcileCreationResult);
$("openVisualStudio").addEventListener("click", openVisualStudio);
$("useCurrentVisualSource").addEventListener("click", fillVisualSourceFromCurrent);
$("createVisualPlanFromSource").addEventListener("click", createVisualPlanFromSource);
$("normalizeVisualSource").addEventListener("click", normalizeVisualSource);
$("visualHistorySelect").addEventListener("change", event => loadVisualHistorySource(decodeURIComponent(event.target.value || "")));
$("saveVisualProfile")?.addEventListener("click", saveVisualProfile);
$("syncVisualConfigLegacy")?.addEventListener("click", () => loadVisualProfile(true, true));
document.querySelectorAll(".discover-visual-models").forEach(button => button.addEventListener("click", () => discoverVisualModels(button.dataset.media)));
$("visualCard").addEventListener("click", event => {
  const button = event.target.closest("[data-visual-action]");
  if (button) handleVisualAction(button);
});
["visualImageTier", "visualVideoTier", "visualVideoDuration", "visualResolution", "visualRatio"].forEach(id => $(id).addEventListener("change", updateVisualEstimate));
visualProfileFields.filter(id => id.includes("Price")).forEach(id => $(id).addEventListener("input", updateVisualEstimate));
[$("visualImageProvider"), $("visualVideoProvider")].forEach(select => select.addEventListener("change", () => {
  const defaults = { volcengine: "https://ark.cn-beijing.volces.com/api/v3", aliyun: "https://dashscope.aliyuncs.com/api/v1", custom: "" };
  $(select.id === "visualImageProvider" ? "visualImageBaseUrl" : "visualVideoBaseUrl").value = defaults[select.value] || "";
}));
$("analyzeLink").addEventListener("click", analyzeMediaLink);
$("saveLinkedVideo").addEventListener("click", saveLinkedVideo);
$("importLinkedVideo").addEventListener("click", importLinkedVideoAndRewrite);
$("openWatchBrowser")?.addEventListener("click", openWatchBrowser);
$("oneClickWatchImport")?.addEventListener("click", async () => {
  if ($("oneClickWatchImport").dataset.action === "finish") return finishWatchCapture("manual");
  if ($("oneClickWatchImport").dataset.mode === "direct") await importLinkedVideoAndRewrite();
  else await startWatchCapture();
});
$("linkPreview").addEventListener("loadeddata", () => {
  $("embeddedPlatform").textContent = `${state.linkMedia?.platformName || "授权视频"} · 可播放`;
});
$("linkPreview").addEventListener("error", () => {
  if (!state.linkMedia?.previewUrl) return;
  $("embeddedPlatform").textContent = `${state.linkMedia?.platformName || "视频"} · 播放失败`;
  $("linkStatus").textContent = "视频流已解析，但当前播放器无法解码。请重新分析链接或点击保存到本地播放。";
});
$("refreshCache").addEventListener("click", refreshCacheUsage);
$("clearCache").addEventListener("click", clearVideoCache);
$("refreshHistory").addEventListener("click", loadHistory);
$("refreshRewriteProjects")?.addEventListener("click", loadRewriteProjects);
$("deleteRewriteProjects")?.addEventListener("click", deleteSelectedRewriteProjects);
$("rewriteProjectSelectAll")?.addEventListener("change", event => {
  state.rewriteProjects.forEach(item => event.target.checked ? rewriteProjectSelection.add(item.id) : rewriteProjectSelection.delete(item.id));
  renderRewriteProjectHistory();
});
$("rewriteProjectHistoryList")?.addEventListener("change", event => {
  const checkbox = event.target.closest("[data-select-rewrite-project]");
  if (!checkbox) return;
  const id = checkbox.dataset.selectRewriteProject;
  checkbox.checked ? rewriteProjectSelection.add(id) : rewriteProjectSelection.delete(id);
  renderRewriteProjectHistory();
});
$("rewriteProjectHistoryList")?.addEventListener("click", event => {
  const open = event.target.closest("[data-open-rewrite-project]");
  if (open) return openRewriteProject(open.dataset.openRewriteProject);
  const deletion = event.target.closest("[data-delete-rewrite-project]");
  if (deletion) return deleteRewriteProject(deletion.dataset.deleteRewriteProject);
  const rename = event.target.closest("[data-rename-rewrite-project]");
  if (rename) return renameRewriteProject(rename.dataset.renameRewriteProject);
  const copy = event.target.closest("[data-copy-rewrite-project]");
  if (copy) return copyOrExportRewriteProject(copy.dataset.copyRewriteProject, false);
  const download = event.target.closest("[data-export-rewrite-project]");
  if (download) return copyOrExportRewriteProject(download.dataset.exportRewriteProject, true);
});
$("saveHistoryPolicy").addEventListener("click", saveHistoryPolicy);
$("historySearch").addEventListener("input", () => { state.historyVisibleCount = 8; renderHistory(); });
$("historyShowMore").addEventListener("click", () => { state.historyVisibleCount = (Number(state.historyVisibleCount) || 8) + 8; renderHistory(); });
$("historySelectAll").addEventListener("change", event => {
  const visibleIds = filteredHistoryRecords().map(record => record.id);
  visibleIds.forEach(id => event.target.checked ? state.historySelection.add(id) : state.historySelection.delete(id));
  renderHistory();
});
$("historyInvertSelection").addEventListener("click", () => {
  filteredHistoryRecords().forEach(record => state.historySelection.has(record.id) ? state.historySelection.delete(record.id) : state.historySelection.add(record.id));
  renderHistory();
});
$("deleteSelectedHistory").addEventListener("click", deleteSelectedHistory);
$("deleteAllHistory").addEventListener("click", deleteAllHistory);
$("historyList").addEventListener("change", event => {
  const checkbox = event.target.closest(".history-select-input");
  if (!checkbox) return;
  const recordId = decodeURIComponent(checkbox.dataset.historyId || "");
  if (checkbox.checked) state.historySelection.add(recordId);
  else state.historySelection.delete(recordId);
  renderHistory();
});
$("historyList").addEventListener("click", event => {
  const openButton = event.target.closest(".history-open");
  if (openButton) return openHistory(openButton.dataset.historyId, openButton.dataset.historyVersion);
  const videoButton = event.target.closest(".history-video");
  if (videoButton) return sendHistoryToWorkflow(videoButton.dataset.historyId);
  const renameButton = event.target.closest(".history-rename");
  if (renameButton) return renameHistory(renameButton.dataset.historyId);
  const deleteButton = event.target.closest(".history-delete");
  if (!deleteButton) return;
  const recordId = decodeURIComponent(deleteButton.dataset.historyId || "");
  const record = state.historyRecords.find(item => item.id === recordId);
  deleteHistoryRecords([recordId], `“${record?.projectName || "这条"}”历史记录`);
});
$("exitApp").addEventListener("click", async () => {
  if (state.busy && !await studioConfirm("当前任务仍在处理，确定要退出软件吗？")) return;
  try { await postJson("/api/shutdown", {}); document.body.innerHTML = '<main class="closed-screen"><div class="brand-mark"><img src="/static/nanbuduo-ai-icon.png" alt=""></div><h1>NanbudoTV·AI 已退出</h1><p>现在可以安全关闭此页面。</p></main>'; }
  catch (_) { window.close(); }
});
$("visualProjectCenterTop").addEventListener("click", () => {
  setWorkMode("workflow", true);
  $("workflowCard").scrollIntoView({behavior:"smooth",block:"start"});
});
$("workflowFrame").setAttribute("scrolling", "no");
$("workflowFrame").style.overflow = "hidden";
// The standalone workflow stylesheet has a viewport minimum. In the host
// page the iframe must shrink to the reported content height or it leaves a
// full-screen blank tail below the last video card.
$("workflowFrame").style.minHeight = "0";
$("workflowFrame").addEventListener("load", () => {
  $("workflowFrame").contentWindow?.postMessage({type:"visual-center-view",open:$("workflowFrame").dataset.projectCenter === "1"}, location.origin);
});
$("myPointsTop")?.addEventListener("click", openPointsCenter);
CreditGate.register('#analyzeSourceBtn,#generateProposalsBtn,#proposalNeedBtn,#proposalRegenerateBtn,#recommendOriginal,#refreshOriginalSettings,#refreshHotTypes,#generateBtn,#confirmRewriteCallBtn,#resumeLongRewrite,#generateMarketingPlan,#analyzeMarketingReference,#normalizeVisualSource,[data-analysis-ai],[data-ai-refine-proposal],[data-field-ai],[data-quality-optimize],[data-repair-episode],[data-visual-action]', mainButtonCreditCost);
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'open-credit-recharge') return;
  if (event.source !== window && ![...document.querySelectorAll('iframe')].some(frame => frame.contentWindow === event.source)) return;
  $("topRechargePoints")?.click();
});
$("topRechargePoints")?.addEventListener("click", async () => {
  const contact = "wkwl0531";
  const reminder = "充值最低30元，继续充值请按10元的整数倍（40元、50元……）。";
  try { await navigator.clipboard.writeText(contact); await studioAlert(`${reminder}\n\n充值请联系：${contact}\n联系方式已复制。`); }
  catch (_) { await studioAlert(`${reminder}\n\n充值请联系：${contact}`); }
});
$("closePointsCenter")?.addEventListener("click", closePointsCenter);
$("refreshGlobalPoints")?.addEventListener("click", () => loadGlobalPointsUsage(true));
$("rechargePoints")?.addEventListener("click", async () => {
  const contact = "wkwl0531";
  const reminder = "充值最低30元，继续充值请按10元的整数倍（40元、50元……）。";
  try { await navigator.clipboard.writeText(contact); await studioAlert(`${reminder}\n\n充值请联系：${contact}\n联系方式已复制。`); }
  catch (_) { await studioAlert(`${reminder}\n\n充值请联系：${contact}`); }
});
$("pointsCenterModal")?.addEventListener("click", event => { if (event.target === $("pointsCenterModal")) closePointsCenter(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("pointsCenterModal")?.classList.contains("hidden")) closePointsCenter(); });
document.addEventListener("click", async event => {
  const link = event.target.closest('a[href^="/api/download"],a[href^="/api/visual/download"],a[href^="/api/visual/archive"]');
  if (!link) return;
  event.preventDefault();
  try { await saveLocalDownload(link.getAttribute("href"), link.getAttribute("download") || ""); }
  catch (error) { toast(error.message, true); }
});
$("copyResult").addEventListener("click", async () => {
  const value = state.activeResult === "validation" ? $("validationResult").innerText : $(`${state.activeResult}Result`).textContent;
  const writing = ['rewrite','original'].includes(state.workMode);
  try {
    await navigator.clipboard.writeText(value || "");
    toast("已复制当前内容");
  } catch (error) {
    if (!writing) throw error;
    toast("复制失败：系统未允许访问剪贴板。原稿已保留，请选中文字后手动复制。",true);
  }
});
$("clientUpdateBtn").addEventListener("click", handleClientUpdate);
$("taskManagerToggle")?.addEventListener("click", () => toggleTaskManager());
$("taskManagerClose")?.addEventListener("click", () => toggleTaskManager(false));
$("dismissClientNotice").addEventListener("click", () => {
  if (state.clientConfig?.mandatory && state.clientConfig?.updateAvailable) return;
  const storage = $("clientNoticeRemember").checked ? localStorage : sessionStorage;
  storage.setItem($("clientNotice").dataset.dismissedKey || "drama-client-notice", "1");
  $("clientNotice").classList.add("hidden");
  $("clientNoticeBackdrop").classList.add("hidden");
});
$("openClientNotice")?.addEventListener("click", () => {
  $("clientNotice").classList.remove("hidden");
  $("clientNoticeBackdrop").classList.remove("hidden");
  $("dismissClientNotice").focus();
});
$("clientNoticeBackdrop")?.addEventListener("click", () => $("dismissClientNotice").click());
const guidePage248 = $("userGuidePage248");
const guideFrame248 = $("userGuideFrame247");
const guideTrigger248 = $("openUserGuide247");
const guideBackground248 = document.querySelectorAll("body > .topbar, body > .workspace");
function setGuidePage248(open) {
  guidePage248.hidden = !open;
  guideBackground248.forEach(element => { element.inert = open; });
  if (open) {
    if (!guideFrame248.hasAttribute("src")) guideFrame248.src = "/static/user_guide247.html";
    guideFrame248.focus();
  } else {
    guideTrigger248.focus({preventScroll: true});
  }
}
guideTrigger248?.addEventListener("click", () => setGuidePage248(true));
window.addEventListener("message", event => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === "nanbudo:return-user-guide" &&
      event.source === guideFrame248.contentWindow && !guidePage248.hidden) setGuidePage248(false);
  if (event.data?.type === "nanbudo:return-image-watermark" && state.workMode === "image-watermark" &&
      event.source === $("imageWatermarkFrame").contentWindow) {
    setWorkMode(imageWatermarkReturn.mode, imageWatermarkReturn.projectCenter, true);
    document.querySelector(`[data-work-mode="${state.workMode}"]`)?.focus({preventScroll: true});
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("clientNotice").classList.contains("hidden") && !$("dismissClientNotice").classList.contains("hidden")) $("dismissClientNotice").click();
});

updateSourceCount();
$("episodeSeconds").value = localStorage.getItem("drama-episode-seconds") || "15";
try {
  const savedOriginalDuration = JSON.parse(localStorage.getItem("drama-original-duration") || "{}");
  if (savedOriginalDuration.raw) $("originalEpisodeValue").value = savedOriginalDuration.raw;
  if (["seconds", "minutes"].includes(savedOriginalDuration.unit)) $("originalEpisodeUnit").value = savedOriginalDuration.unit;
  if (savedOriginalDuration.episodeCount) $("originalEpisodeCount").value = savedOriginalDuration.episodeCount;
} catch (_) { /* keep defaults */ }
state.originalType = localStorage.getItem("drama-original-type") || "emotional_commerce";
StoreVisit.init({
  active: () => state.workMode === 'store',
  openCharacters: () => setWorkMode('characters'),
  onRoleChange: () => updateStoreMaterialSummary(),
  files: () => state.storeFiles,
  resetFiles: () => {state.storeFiles.scenes=[];state.storeFiles.products=[];},
  clearFiles: kind => {state.storeFiles[kind]=[];},
  resetPlanning: resetStorePlanning,
  restoreMarketing: form => {
    if (['original','remix'].includes(form.creationMode)) setMarketingMode(form.creationMode);
    $("marketingStrengthValue").textContent=`${$("marketingStrength").value}%`;
    const duration = String(form.storyboardDuration || 30);
    const durationSelect = $('marketingDuration');
    const customDuration = ![...durationSelect.options].some(option => option.value === duration);
    durationSelect.value = customDuration ? 'custom' : duration;
    $('marketingCustomDuration').value = customDuration ? duration : '45';
    $('marketingCustomDurationField').classList.toggle('hidden', !customDuration);
    $('marketingResult').value = form.storyboardText || '';
    $('sendMarketingToWorkflow').disabled = !$('marketingResult').value.trim();
  },
  sync: () => syncStoreBuilderVisibility(),
  download: (url,name) => saveLocalDownload(url,name),
  payload: () => ({projectName:$("marketingProjectName").value.trim(),subject:$("marketingSubject").value.trim(),
    storyboardText:$("marketingResult").value,storyboardDuration:marketingDurationSeconds(),
    sellingPoints:$("marketingSellingPoints").value.trim(),audience:$("marketingAudience").value.trim(),tone:$("marketingTone").value,
    platform:$("marketingPlatform").value,pace:$("marketingPace").value,creationMode:state.marketingMode,
    referenceAnalysis:$("marketingReferenceAnalysis").value.trim(),referenceStrength:Number($("marketingStrength").value),
    materials:$("marketingMaterials").value.trim(),cta:$("marketingCta").value.trim(),storeDetails:storeDetailsPayload()}),
});
updateRewriteDurationControls();
updateDuration();
updateRewriteCustomFields();
$("dailyWorkCount").value = localStorage.getItem("drama-daily-work-count") || "10";
loadHallFavorites();
loadHallDownloads(false);
syncHallWorkCount();
setMarketingMode("remix");
setWorkMode(localStorage.getItem("drama-work-mode") || "rewrite");
updateCountInput("peopleMode", "peopleCount");
updateCountInput("sceneMode", "sceneCount");
updateCountInput("propMode", "propCount");
loadProfiles();
loadVisualProfile(true);
setInterval(() => loadVisualProfile(true), 60000);
checkSpeechStatus(false);
refreshCacheUsage();
loadHistory();
loadRewriteProjects();
pollRuntimeLicense();
setInterval(pollRuntimeLicense, 3000);
loadClientConfig();
loadFeatureAccess();
loadGlobalPointsUsage(false);
refreshTaskManager();
resumePendingCreationTasks();
setInterval(refreshTaskManager, 1500);
setInterval(() => { if (document.visibilityState === "visible") loadFeatureAccess(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { loadFeatureAccess(); loadGlobalPointsUsage(false); } });
setInterval(loadClientConfig, 30 * 60 * 1000);
let textCatalogRefresh = null;
function syncOpenTextCatalog() {
  if(document.hidden || !['rewrite','original'].includes(state.workMode) || textCatalogRefresh) return;
  textCatalogRefresh = loadClientConfig({modelsOnly:true}).finally(()=>{textCatalogRefresh=null;});
}
window.addEventListener('focus',syncOpenTextCatalog);
document.addEventListener('visibilitychange',syncOpenTextCatalog);
setInterval(syncOpenTextCatalog,30000);
setInterval(() => { if (state.hallView === "downloads") loadHallDownloads(true); }, 2500);

async function loadVisibleAppVersion() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();
    const version = `v${data.version || ""}`;
    const channel = data.channel === "internal" ? " · 内测版" : "";
    if ($("appVersionLabel")) $("appVersionLabel").textContent = `${version}${channel}`;
    document.title = `${data.appName || PRODUCT_NAME} ${version}${channel}`;
  } catch (_) {}
}
loadVisibleAppVersion();
window.addEventListener('message', event => {
  const frame = $('ecommerceFrame259');
  if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
  if (event.data?.type !== 'ecommerce-open-canvas259'
      || !/^[a-f0-9]{32}$/.test(event.data.canvasId || '')) return;
  const canvasId = event.data.canvasId;
  const canvasFrame=$('canvasFrame');
  const sendCanvas=()=>canvasFrame.contentWindow?.postMessage({type:'canvas-open-document259',canvasId},location.origin);
  const loaded=canvasFrame.contentDocument?.readyState==='complete'
    && canvasFrame.contentDocument.URL.startsWith(location.origin+'/static/video_canvas.html');
  if(!loaded)canvasFrame.addEventListener('load',sendCanvas,{once:true});
  setWorkMode('canvas');
  if(loaded)sendCanvas();
});

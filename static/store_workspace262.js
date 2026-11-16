/* Arrange the existing store controls; actions and request ownership stay in StoreVisit. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const card = $('futureCard'), workspace = $('storeWorkspace262');
  if (!card || !workspace) return;
  const stages = ['materials', 'creative', 'delivery'];
  const anchors = [];
  const originalLabels = [];
  let mounted = false, step = 'materials';
  const byField = id => $(id)?.closest('.field');

  function move(node, destination) {
    if (!node || !destination || node.parentElement === destination) return;
    const anchor = document.createComment('store-workspace262');
    node.before(anchor);
    anchors.push({node, anchor});
    destination.append(node);
  }
  function field(id, destination) { move(byField(id), $(destination)); }
  function label(id, text) {
    const span = byField(id)?.querySelector('span');
    if (!span) return;
    originalLabels.push({span, text:span.textContent, changedTo:text});
    span.textContent = text;
  }
  function active() {
    return !card.classList.contains('hidden') &&
      !!document.querySelector('.work-mode-tab.active[data-work-mode="store"]');
  }
  function updateSummary() {
    const title = $('marketingSubject').value.trim() || 'AI 探店';
    $('storeWorkspaceTitle262').textContent = title;
    const selected = id => $(id)?.selectedOptions?.[0]?.textContent || '';
    $('storeOutputSummary262').textContent = [selected('storeVideoModel'), selected('storeVideoDuration'), selected('storeVideoResolution'), selected('storeVideoRatio')].filter(Boolean).join(' · ') || '模型设置加载中…';
    const count = $('storeVideoResults').querySelectorAll('.store-video-result').length;
    $('storeResultsCount262').textContent = count ? String(count) : '';
    const kind = $('storeIndustry').value === '__custom__' ? $('storeCustomIndustry').value.trim() : $('storeIndustry').value;
    const category = /餐饮|美食|烘焙|茶饮/.test(kind) ? '菜品与套餐图片' : /教育|培训/.test(kind) ? '课程与服务素材' : /母婴|亲子/.test(kind) ? '商品与亲子服务素材' : '产品与服务素材';
    const productLabel = byField('storeProductFiles')?.querySelector('span');
    if (mounted && productLabel) {
      const entry = originalLabels.find(row => row.span === productLabel);
      if (entry) entry.changedTo = category;
      productLabel.textContent = category;
    }
    $('storeAddressSlot262').hidden = !$('storeIncludeAddress262').checked;
    workspace.classList.toggle('sw262-price-enabled', $('storeSpeakPrice262').checked);
    const counts = window.StoreVisit?.materialCounts?.() || {scenes:0,products:0};
    $('storeSceneCount262').textContent = counts.scenes ? `已选 ${counts.scenes} 张图片` : '未添加图片';
    $('storeProductCount262').textContent = counts.products ? `已选 ${counts.products} 张图片` : '未添加图片';
    $('storeProductCategory262').textContent = category.replace(/图片$/, '');
    const role = window.StoreVisit?.selected?.();
    $('storeSelectedRole262').textContent = role?.id ? role.name : '未选择角色';
  }
  function setStep(value, focus = false) {
    if (!stages.includes(value)) return;
    step = value;
    for (const panel of workspace.querySelectorAll('[data-store-stage]')) panel.hidden = panel.dataset.storeStage !== value;
    for (const button of workspace.querySelectorAll('[data-store-step]')) {
      const chosen = button.dataset.storeStep === value;
      button.setAttribute('aria-pressed', String(chosen));
      if (chosen) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      if (focus && chosen) button.focus({preventScroll:true});
    }
    const index = stages.indexOf(value);
    $('storeStepCount262').textContent = `第 ${index + 1} / 3 步`;
    $('storeStepBack262').hidden = index === 0;
    $('storeStepNext262').hidden = index === 2;
    $('storeStepNext262').textContent = index === 0 ? '下一步 · 创意与分镜' : '下一步 · 生成与验收';
    $('storeStepNote262').textContent = [
      '资料没填完也能保存草稿，稍后继续。',
      '可以让 AI 写分镜，也可以直接填写本次要生成的片段。',
      '先保存片段并核对价格，确认后才会生成。'
    ][index];
    updateSummary();
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    document.body.classList.add('store-workspace-mode262');
    card.classList.add('store-workspace-active262');
    workspace.hidden = false;
    move($('storeVideoProjects'), $('storeProjectSelect262'));
    field('marketingProjectName', 'storeProjectBar262');
    move($('newStoreVideo'), $('storeProjectActions262'));
    move($('saveStoreDraft261'), $('storeProjectActions262'));
    move($('deleteStoreProject261'), $('storeProjectManagement262'));
    move($('deletedStoreProjects261'), $('storeProjectManagement262'));
    move($('storeVideoProjectLabel'), $('storeProjectManagement262'));
    move($('storeVideoStatus'), $('storeGlobalStatus262'));
    for (const id of ['storeIndustry','storeCustomIndustry','marketingSubject','storeVideoType','marketingPlatform','marketingDuration','marketingCustomDuration','storeVideoStyle','storeVideoCustomStyle']) field(id,'storeBasicFields262');
    field('marketingSellingPoints','storeSellingField262');
    move($('storePackagePanel'), $('storePackageSlot262'));
    field('storeRoute','storeAddressSlot262');
    for (const id of ['storeExperience','storeAction','marketingAudience','storeCreativeBrief','marketingMaterials','marketingCta']) field(id,'storeExtraFields262');
    field('storeSceneFiles','storeSceneUpload262');
    move($('clearStoreScenes'), $('storeSceneUpload262'));
    field('storeProductFiles','storeProductUpload262');
    move($('clearStoreProducts'), $('storeProductUpload262'));
    move($('storeMaterialSummary'), $('storeMaterialMetadata262'));
    move($('storePersonaHall'), $('storeRoleHall262'));
    move($('manageStoreRoles').parentElement, $('storeRoleActions262'));
    field('storeVoice','storeRoleMoreFields262');
    field('storePersonaDirection','storeRoleMoreFields262');
    move(card.querySelector('.marketing-mode-switch'), $('storeCreationMode262'));
    move($('marketingReferencePanel'), $('storeReferenceSlot262'));
    for (const id of ['marketingTone','marketingPace','marketingStrength']) field(id,'storeWritingSettings262');
    move($('marketingReferenceStrategy'), $('storeWritingSettings262'));
    move($('generateMarketingPlan').parentElement, $('storePlanActions262'));
    // This workflow action is optional; use the same original element and event.
    move($('sendMarketingToWorkflow'), $('storeWorkflowAction262'));
    move(byField('marketingResult'), $('storeStoryboardSlot262'));
    field('storeClipPrompt','storeClipSlot262');
    move($('storeUseScript').parentElement, $('storeClipSlot262'));
    move($('storeVideoPanel'), $('storeGenerationSlot262'));
    const settings = document.createElement('details');
    settings.id = 'storeOutputSettings262'; settings.className = 'sw262-details';
    const summary = document.createElement('summary'); summary.textContent = '调整模型、时长、清晰度与画幅';
    settings.append(summary);
    $('storeVideoPanel').prepend(settings);
    move($('storeVideoModel').closest('.form-grid'), settings);
    label('marketingSellingPoints','真实卖点与拍摄重点（可选）');
    label('storeCreativeBrief','补充创意要求（可选）');
    label('marketingDuration','整片时长上限');
    label('storeProductFiles','产品与服务素材');
    setStep(step);
  }
  function unmount() {
    if (!mounted) return;
    mounted = false;
    document.body.classList.remove('store-workspace-mode262');
    for (const {node,anchor} of anchors.reverse()) { anchor.replaceWith(node); }
    anchors.length = 0;
    for (const row of originalLabels) {
      // setWorkMode updates shared labels before its navigation mutation is seen.
      if (row.span.textContent === row.changedTo) row.span.textContent = row.text;
    }
    originalLabels.length = 0;
    $('storeOutputSettings262')?.remove();
    card.classList.remove('store-workspace-active262');
    workspace.hidden = true;
  }
  function syncMode() { if (active()) mount(); else unmount(); }
  workspace.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'deleteStoreProject261' || button.id === 'deletedStoreProjects261') {
      $('storeProjectTools262').open = false;
    }
    if (button.hasAttribute('data-store-character')) {
      $('storeRoleGroup262').open = false;
      updateSummary();
    }
    if (button.dataset.storeStep) setStep(button.dataset.storeStep);
    else if (button.id === 'storeStepBack262') setStep(stages[Math.max(0,stages.indexOf(step)-1)],true);
    else if (button.id === 'storeStepNext262') setStep(stages[Math.min(2,stages.indexOf(step)+1)],true);
    else if (button.id === 'storeEditClip262') setStep('creative',true);
  });
  card.addEventListener('input', updateSummary);
  card.addEventListener('change', event => {
    updateSummary();
    if (event.target.id === 'storeSceneFiles' && event.target.files.length) $('storeScenesGroup262').open = false;
    if (event.target.id === 'storeProductFiles' && event.target.files.length) $('storeProductsGroup262').open = false;
  });
  window.addEventListener('store-project-changed', () => {
    $('storeProjectTools262').open = false;
    setStep('materials');
  });
  new MutationObserver(syncMode).observe(document.querySelector('.work-mode-tabs'), {subtree:true, attributes:true, attributeFilter:['class']});
  new MutationObserver(syncMode).observe(card,{attributes:true,attributeFilter:['class']});
  new MutationObserver(updateSummary).observe($('storeVideoResults'),{childList:true});
  new MutationObserver(updateSummary).observe($('storeVideoModel'),{childList:true});
  new MutationObserver(updateSummary).observe($('storeMaterialSummary'),{childList:true,characterData:true,subtree:true});
  syncMode();
  window.StoreWorkspace262 = {setStep, getStep:()=>step};
})();

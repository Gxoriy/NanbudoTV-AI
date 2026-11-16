/* Pure, version-scoped presentation; never substitute a failed task for cuts. */
(() => {
  const revision = p => window.WorkflowCutEditor?.revision(p) || String(p?.cutRevisionId || '');
  function current(project) {
    const s = project?.cutSubmission;
    if (!s?.requestId) return null;
    const expected = s.state === 'completed' ? s.resultRevisionId : s.baseRevisionId;
    if (expected !== revision(project) || (project.workflowAssetSourceHash && s.sourceHash !== project.workflowAssetSourceHash)) return null;
    return s;
  }
  const blocked = project => {
    const s = current(project);
    return Boolean(s && (['running', 'awaiting_confirmation'].includes(s.state) || (['failed', 'interrupted'].includes(s.state) && !s.previousCutConfirmedAt)));
  };
  const target = s => s?.planningPolicy?.requestedSeconds ? `目标${s.planningPolicy.requestedSeconds}秒` : '智能分镜';
  function canRecheckResponse(project) {
    const s = current(project);
    return Boolean(s?.state === 'failed' && s.processFile && (s.planningPolicy?.mode === 'custom'
      || (s.planningPolicy?.mode === 'smart' && s.storyboardFirstVersion === 1 && s.directorArrangementVersion === 1)));
  }
  function timingWarnings(project) {
    const s = current(project);
    if (s?.state !== 'completed' || s.timingAcceptanceVersion !== 2 || !Array.isArray(s.timingWarnings)) return [];
    return s.timingWarnings.map(value => typeof value === 'string' ? value : value?.message)
      .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim().slice(0, 300));
  }
  function summary(project) {
    const s = current(project);
    if (!s) return '';
    if (s.state === 'completed') return project.storyboardProductionVersion === 1 && project.productionReady !== true ? '第一步切卡已完成，原文和卡长已保存；请单独确认第二步制作正式分镜。已完成分镜的卡可生成视频。' : timingWarnings(project).length ? '本次切割已完成，已按模型返回保存；时长仅为估算，可继续生成。' : '';
    if (s.state === 'running') return '本次切割正在执行；下方旧稿不会作为新结果。';
    if (s.state === 'awaiting_confirmation') return '已收到待确认时长方案，请查看下方详情；尚未替换旧稿。';
    return s.previousCutConfirmedAt ? '已明确确认继续使用旧稿；它不是本次新切割结果。' : '本次切割未成功，旧稿与作品已保留；请查看下方详情。';
  }
  function message(project) {
    const s = current(project);
    if (!s) return '';
    if (s.state === 'completed') {
      const warnings = timingWarnings(project);
      if (!warnings.length) return '';
      const duration = (project.scriptCuts || []).reduce((sum, c) => sum + Number(c.durationSeconds || 0), 0);
      const next = project.storyboardProductionVersion === 1 && project.productionReady !== true ? '切割结果已锁定，请单独确认制作正式分镜；不改变原文和卡长，已完成的卡可生成视频。' : project.storyboardFirstVersion === 1 ? '完整分镜已同步保存，可直接生成视频。' : '可继续补齐分镜和生成视频。';
      return `本次切割已完成，已按模型返回保存${project.scriptCuts?.length || 0}段、${duration}秒。${warnings.slice(0, 3).join(' ')}${warnings.length > 3 ? ` 另有${warnings.length - 3}条估时提示记录在过程文件中。` : ''} 时长为文字估算，${next}`;
    }
    const old = project.scriptCuts?.length || 0;
    const duration = (project.scriptCuts || []).reduce((sum, c) => sum + Number(c.durationSeconds || 0), 0);
    if (s.state === 'running') return `本次${target(s)}切割尚未完成；${old ? `下面${old}段为旧稿，不是本次结果。` : '尚无已保存切割稿。'}`;
    if (s.state === 'awaiting_confirmation') {
      if (s.planningPolicy?.mode === 'smart') return `原智能编排返回已重新校验：${s.recommendedCardCount}张视频卡、模型估时合计${s.recommendedSeconds}秒，每卡不超过${s.planningPolicy.maxSeconds || s.planningPolicy.fixedSeconds}秒。${s.error || ''} 确认后采用原返回，不再次调用模型、不扣积分；当前下方仍是旧稿。`;
      return `用户${target(s)}；完整原文建议生成${s.recommendedSeconds}秒、${s.recommendedCardCount}段${s.planningPolicy?.durationMode === 'adaptive' ? `，每卡不超过${s.planningPolicy.maxSeconds || s.planningPolicy.fixedSeconds}秒，按剧情实际时长` : ''}，差额${s.recommendedSeconds - s.planningPolicy.requestedSeconds}秒。${s.error || ''} 需要你确认后才保存新稿；当前显示的不是这次的新结果。`;
    }
    return `本次${target(s)}切割未成功，未替换项目。${s.error || '请查看原任务记录。'} ${old ? `当前${old}段、${duration}秒仍为旧稿。${s.previousCutConfirmedAt ? '你已明确确认继续使用旧稿；它不满足本次新目标。' : '重新切割或明确确认使用旧稿后，才能继续生成。'}` : '请调整设定或原剧本后重新切割。'}`;
  }
  window.WorkflowCutSubmission = {current, blocked, message, summary, timingWarnings, canRecheckResponse};
})();

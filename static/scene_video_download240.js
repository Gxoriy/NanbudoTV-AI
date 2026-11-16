/* Local scene download only. Never quote, submit, regenerate or alter media. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SceneVideoDownload240=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const active=new Set();
  function summary(result){
    if(result?.canceled)return '已取消下载。';
    if(result?.browserDownload)return '已开始下载本场视频压缩包，请查看浏览器下载列表；包内有下载结果说明。';
    return `本场视频：已下载 ${Number(result?.savedCount)||0} 个，未生成跳过 ${Number(result?.skippedCount)||0} 个，失败 ${Number(result?.failedCount)||0} 个。${result?.path?'保存到：'+result.path:''}`;
  }
  async function save(selection,options={}){
    const win=options.win||globalThis,key=JSON.stringify([selection.projectId,selection.sourceKind,selection.sceneId]);
    if(active.has(key))throw Error('本场视频正在下载，请等待完成。');
    active.add(key);
    try{
      const api=win.pywebview?.api||win.parent?.pywebview?.api;
      if(api?.export_scene_videos){
        const result=await api.export_scene_videos(selection,options.feature||'workflow');
        if(result?.canceled)return result;
        if(!result?.ok)throw Error(result?.error||'本场视频下载失败。');
        return result;
      }
      const params=new URLSearchParams(selection),url='/api/visual/scene-videos/archive?'+params;
      // One ZIP avoids many Save As prompts. The server streams stored media
      // from this exact scene; the browser owns its normal download location.
      const anchor=win.document.createElement('a');anchor.href=url;anchor.download='本场视频.zip';
      win.document.body.append(anchor);anchor.click();anchor.remove();
      return {ok:true,browserDownload:true};
    }finally{active.delete(key);}
  }
  return {save,summary};
});

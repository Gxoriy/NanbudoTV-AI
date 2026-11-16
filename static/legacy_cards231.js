/* Current presentation for saved episode cards; original IDs/actions stay owned. */
(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LegacyCards231=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const normalized=value=>String(value??'').replace(/\r\n?/g,'\n').replace(/\s+/g,'');
  function create(options){
    const host=options.root,document=host.ownerDocument,win=document.defaultView;
    const selections=new Map();let project=null,active=false,destroyed=false,scene=null,rows=[],selected=null,header=null,nav=null,note=null,lastScope='',downloadBusy=false,downloadMessage='',downloadOwner='';
    function toolbar(){
      if(header?.isConnected&&nav?.isConnected)return;
      header=document.createElement('header');header.className='legacy-scene-header231';
      const title=document.createElement('h3');title.dataset.legacyTitle231='1';
      const action=document.createElement('button');action.type='button';action.className='primary-btn';action.dataset.legacyComplete231='1';action.textContent='补齐本卡分镜';
      const download=document.createElement('button');download.type='button';download.className='secondary-btn';download.dataset.legacySceneDownload240='1';download.textContent='下载本场视频';
      const status=document.createElement('small');status.dataset.legacySceneDownloadStatus240='1';status.setAttribute('role','status');
      header.append(title,action,download,status);nav=document.createElement('nav');nav.className='legacy-card-tabs231';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','已保存的视频卡');
      note=document.createElement('p');note.className='legacy-card-notice231';note.hidden=true;note.setAttribute('role','status');
      host.prepend(header,nav,note);
    }
    const current=()=>rows.find(row=>row.number===selected);
    function sourceRows(value){
      const cuts=new Map((value?.scriptCuts||[]).map(cut=>[Number(cut.number),cut]));
      const directory=(value?.workflowPreparedScript?.sceneDirectory||[]).map(item=>normalized(item.sourceText));
      return [...host.querySelectorAll('.visual-episode-card')].map((node,index)=>{
        const number=Number(node.dataset.cutNumber)||index+1,episode=(value.episodes||[]).find(item=>item.id===node.dataset.episode)||{};
        const source=normalized(cuts.get(number)?.sourceText||episode.sourceText||''),owners=source?directory.filter(text=>text&&text.includes(source)):[];
        return {node,number,episode,source,owner:owners.length===1?owners[0]:null,duration:Number(episode.durationSeconds||cuts.get(number)?.durationSeconds)||0};
      });
    }
    function setTextPrefix(node,value){
      if(!node)return;const text=[...node.childNodes].find(child=>child.nodeType===3);
      if(text){if(text.nodeValue!==value)text.nodeValue=value;}else node.prepend(document.createTextNode(value));
    }
    function adapt(row){
      const node=row.node;if(node.dataset.legacyCard231===project.id)return;
      node.dataset.legacyCard231=project.id;
      const prompt=node.querySelector('.visual-episode-prompt'),output=node.querySelector('.visual-episode-output'),source=node.querySelector('.visual-episode-script'),storyboard=node.querySelector('.visual-episode-storyboard');
      if(prompt&&source){
        const details=document.createElement('details');details.className='legacy-source231';
        const summary=document.createElement('summary');summary.textContent='查看原文';details.append(summary);source.before(details);details.append(source);
        setTextPrefix(source.querySelector('h4'),'原文内容');
      }
      if(prompt&&storyboard){prompt.append(storyboard);setTextPrefix(storyboard.querySelector('h4'),'视频描述词');}
      const cardHeading=node.querySelector('.episode-card-heading>b');if(cardHeading)cardHeading.textContent=`视频卡 ${row.number}${row.duration?' · '+row.duration+' 秒':''}`;
      if(output){
        const title=[...output.querySelectorAll(':scope > h4')].find(el=>/生成结果/.test(el.textContent));if(title)title.textContent='视频';
        const settings=output.querySelector('.episode-generation-settings>summary');if(settings)settings.textContent='视频生成设置 · 展开调整';
      }
      node.setAttribute('role','tabpanel');
    }
    function visibleRows(){
      const source=normalized(scene?.sourceText),mappingComplete=rows.length>0&&rows.every(row=>!!row.owner),matching=source&&mappingComplete?rows.filter(row=>row.owner===source):[];
      return {items:matching.length?matching:rows,reliable:!!matching.length};
    }
    function paint(){
      if(destroyed||!header)return;
      if(header.hidden!==!active)header.hidden=!active;
      if(nav.hidden!==!active)nav.hidden=!active;
      if(!active){if(!note.hidden)note.hidden=true;for(const row of rows)if(row.node.hidden)row.node.hidden=false;return;}
      const scope=visibleRows(),items=scope.items;
      if(!items.some(row=>row.number===selected))selected=items[0]?.number??null;
      const title=header.querySelector('[data-legacy-title231]');
      const caption=scope.reliable?String(scene.title||`第 ${scene.number||1} 场`):'已保存视频卡';
      if(title.textContent!==caption)title.textContent=caption;
      const signature=JSON.stringify([project.id,items.map(row=>[row.number,row.duration]),selected]);
      if(signature!==lastScope){
        const fragment=document.createDocumentFragment();
        for(const row of items){const button=document.createElement('button');button.type='button';button.className='mi-card-tab';button.dataset.legacyCardSelect231=String(row.number);button.id=`legacy-card-tab231-${project.id}-${row.number}`;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(row.number===selected));button.textContent=`视频卡 ${row.number}${row.duration?' · '+row.duration+' 秒':''}`;fragment.append(button);row.node.setAttribute('aria-labelledby',button.id);}
        nav.replaceChildren(fragment);lastScope=signature;
      }
      for(const row of rows){const hidden=row.number!==selected;if(row.node.hidden!==hidden)row.node.hidden=hidden;}
      const original=current()?.node.querySelector('.regenerate-local-storyboard'),action=header.querySelector('[data-legacy-complete231]');
      const disabled=!original||original.disabled;if(action.disabled!==disabled)action.disabled=disabled;
      const actionTitle='仅处理当前视频卡，沿用本卡原有费用确认和任务记录';if(action.title!==actionTitle)action.title=actionTitle;
      const download=header.querySelector('[data-legacy-scene-download240]'),owner=JSON.stringify([project.id,scene?.id||'']);
      download.disabled=downloadBusy||!scope.reliable||!scope.items.some(row=>row.episode.videoFile);
      download.textContent=downloadBusy?'正在下载本场视频…':'下载本场视频';
      download.title=scope.reliable?'选择本地文件夹，下载本场所有已生成视频':'旧卡场次归属尚未准确对应，仍可单卡下载';
      header.querySelector('[data-legacy-scene-download-status240]').textContent=owner===downloadOwner?downloadMessage:'';
      // This presentation must not imply a reliable scene mapping when old
      // cut text cannot be traced into the current directory source.
      const hideNote=scope.reliable||!scene?.sourceText;if(note.hidden!==hideNote)note.hidden=hideNote;
      const message='当前目录与已保存视频卡未能准确对应，以下按原卡号查看；补齐仅针对当前视频卡。';
      if(!note.hidden&&note.textContent!==message)note.textContent=message;
    }
    function enhance(value,settings={}){
      if(destroyed)return;
      const changed=project?.id!==value?.id;project=value;active=!!settings.active&&!!value?.id;scene=settings.scene||null;
      toolbar();rows=sourceRows(value||{});active=active&&rows.length>0;
      const mode=active?'1':'0';if(document.body.dataset.legacyCards231!==mode)document.body.dataset.legacyCards231=mode;
      if(changed){selected=selections.get(project?.id)??null;lastScope='';}
      if(active)for(const row of rows)adapt(row);
      paint();
    }
    function selectScene(value){scene=value||null;paint();}
    function click(event){
      const download=event.target.closest('[data-legacy-scene-download240]');
      if(download&&header?.contains(download)&&active&&!download.disabled){
        const selectedScene=scene,selectedProject=project;downloadOwner=JSON.stringify([project.id,scene?.id||'']);
        downloadBusy=true;downloadMessage='正在选择保存位置或下载本场视频…';paint();
        Promise.resolve().then(()=>options.onSceneDownload?.(selectedProject,selectedScene)).then(result=>{
          if(!result)throw Error('下载组件尚未加载，请重新打开软件。');
          downloadMessage=win.SceneVideoDownload240.summary(result);
        }).catch(error=>{downloadMessage='下载失败：'+(error.message||error);}).finally(()=>{downloadBusy=false;paint();});return;
      }
      const tab=event.target.closest('[data-legacy-card-select231]');
      if(tab&&nav?.contains(tab)&&active){
        const previous=current(),number=Number(tab.dataset.legacyCardSelect231);
        if(!visibleRows().items.some(row=>row.number===number))return;
        if(previous?.number!==number)for(const video of previous?.node.querySelectorAll('video')||[])try{video.pause();}catch(_){}
        selected=number;selections.set(project.id,number);paint();return;
      }
      const action=event.target.closest('[data-legacy-complete231]');
      if(action&&header?.contains(action)&&active&&!action.disabled){
        // Forward the original card's own confirmed, scoped action. Never
        // reuse the retired project-wide fill/batch buttons for this label.
        const original=current()?.node.querySelector('.regenerate-local-storyboard');
        if(original&&!original.disabled)original.click();
      }
    }
    host.addEventListener('click',click);
    return {enhance,selectScene,hasSceneHeader:id=>active&&!destroyed&&project?.id===id&&rows.length>0,
      destroy(){destroyed=true;host.removeEventListener('click',click);header?.remove();nav?.remove();note?.remove();for(const row of rows)row.node.hidden=false;document.body.dataset.legacyCards231='0';}};
  }
  return {create};
});

/* Executable graph rules for pointer, keyboard and inspector actions. */
'use strict';
window.CanvasGraph=(()=>{
  const processors=new Set(['image_generator','generator']);
  const output=node=>node.kind==='prompt'?'text':['reference','generator'].includes(node.kind)?'video':'image';
  function reason(nodes,edges,source,target,replacing=-1){
    const a=nodes.find(n=>n.id===source),b=nodes.find(n=>n.id===target);
    if(!a||!b)return '请选择存在的两个节点。';
    if(source===target)return '节点不能连接自己。';
    if(b.kind==='image_generator'&&(a.kind==='generator'||a.kind==='reference'&&(a.file||!edges.some(e=>e.target===a.id))))return '视频不能连入生图节点，请连接视频生成节点。';
    const others=edges.filter((_,index)=>index!==replacing);
    if(others.some(e=>e.source===source&&e.target===target))return '这两个节点已经连接。';
    if(others.length>=160)return '画布最多160条连接，请先断开一条连接或新建画布。';
    const stack=[target],seen=new Set();
    while(stack.length){const id=stack.pop();if(id===source)return '这条线会产生循环，请保持从输入到结果的方向。';if(seen.has(id))continue;seen.add(id);for(const e of others)if(e.source===id)stack.push(e.target);}
    const candidate=[...others,{source,target}],memo=new Map();
    function types(id){if(memo.has(id))return memo.get(id);const n=nodes.find(n=>n.id===id),result=new Set();if(processors.has(n.kind))result.add(output(n));else{if(n.text?.trim())result.add('text');if(n.file||n.kind==='reference'&&!candidate.some(e=>e.target===id))result.add(output(n));for(const e of candidate)if(e.target===id)for(const type of types(e.source))result.add(type);}memo.set(id,result);return result;}
    for(const n of nodes)if(n.kind==='image_generator'&&candidate.some(e=>e.target===n.id&&types(e.source).has('video')))return '视频不能连入生图节点，也不能通过素材节点伪装成图片；请连接视频生成节点。';
    return '';
  }
  function descendants(edges,ids){const affected=new Set(ids),stack=[...ids];while(stack.length){const id=stack.pop();for(const e of edges)if(e.source===id&&!affected.has(e.target)){affected.add(e.target);stack.push(e.target);}}return affected;}
  function payload(nodes,edges,nodeId,outputs={},memo=new Map()){
    if(memo.has(nodeId))return memo.get(nodeId);
    const n=nodes.find(n=>n.id===nodeId);if(!n)return [];
    if(processors.has(n.kind)){const out=outputs[n.id],result=[{id:n.id,file:out?.file||'',media:output(n),text:'',blocked:!out||out.stale}];memo.set(nodeId,result);return result;}
    const result=[],seen=new Set();for(const e of edges)if(e.target===nodeId)for(const item of payload(nodes,edges,e.source,outputs,memo))if(!seen.has(item.id)){seen.add(item.id);result.push(item);}
    if(n.file||n.text?.trim())result.push({id:n.id,file:n.file||'',media:n.file?output(n):'',text:n.text?.trim()||'',blocked:false});
    memo.set(nodeId,result);return result;
  }
  function received(nodes,edges,nodeId,outputs={}){const result=[],seen=new Set(),memo=new Map();for(const e of edges)if(e.target===nodeId)for(const item of payload(nodes,edges,e.source,outputs,memo))if(!seen.has(item.id)){seen.add(item.id);result.push(item);}return result;}
  return {processors,output,reason,descendants,payload,received};
})();

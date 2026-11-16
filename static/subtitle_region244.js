/* Integer percentage selection shared by preview, confirmation and requests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SubtitleRegion244=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const SCHEMA='outward_integer_percent166',keys=['x','y','width','height'];
 function decimal(value){let [text,power='0']=String(value).toLowerCase().split('e'),fraction=(text.split('.')[1]||'').length,scale=fraction-Number(power),coefficient=BigInt(text.replace('.',''));if(scale<0){coefficient*=10n**BigInt(-scale);scale=0;}return {coefficient,scale};}
 function sum(a,b){const scale=Math.max(a.scale,b.scale);return {coefficient:a.coefficient*10n**BigInt(scale-a.scale)+b.coefficient*10n**BigInt(scale-b.scale),scale};}
 function floor(value){const number=decimal(value);return Number(number.coefficient/(10n**BigInt(number.scale)));}
 function ceil(number){const unit=10n**BigInt(number.scale);return Number((number.coefficient+unit-1n)/unit);}
 function outward(value){
  if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='height,width,x,y'||!keys.every(key=>typeof value[key]==='number'&&Number.isFinite(value[key]))||value.x<0||value.y<0||value.width<=0||value.height<=0)throw Error('字幕区域无效，请填写画面内的完整选区。');
  const right=sum(decimal(value.x),decimal(value.width)),bottom=sum(decimal(value.y),decimal(value.height));
  if(right.coefficient>100n*10n**BigInt(right.scale)||bottom.coefficient>100n*10n**BigInt(bottom.scale))throw Error('字幕区域超出画面，请调整选区。');
  const x=floor(value.x),y=floor(value.y);return {x,y,width:ceil(right)-x,height:ceil(bottom)-y};
 }
 function canonical(value){try{const normalized=outward(value);return keys.every(key=>Number.isInteger(value[key])&&value[key]===normalized[key]);}catch(_){return false;}}
 function base(value){if(!canonical(value))throw Error('请先确认整数字幕选区。');return {...value};}
 function delta(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('字幕选框位置无效。');}
 function move(value,dx,dy){const r=base(value);delta(dx,dy);return {...r,x:Math.max(0,Math.min(100-r.width,Math.round(r.x+dx))),y:Math.max(0,Math.min(100-r.height,Math.round(r.y+dy)))};}
 function resize(value,dx,dy){const r=base(value);delta(dx,dy);return {...r,width:Math.max(1,Math.min(100-r.x,Math.round(r.width+dx))),height:Math.max(1,Math.min(100-r.y,Math.round(r.height+dy)))};}
 function quoted(quote){return !!quote&&quote.regionNormalization===SCHEMA&&canonical(quote.effectiveRegion);}
 return {SCHEMA,outward,canonical,move,resize,quoted};
});

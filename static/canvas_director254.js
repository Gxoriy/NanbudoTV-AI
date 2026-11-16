/* Local articulated geometry and shot reference. No model, quote or network calls. */
(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rad=d=>d*Math.PI/180;
  const SHOTS={establishing:{name:'远景',height:3.8,aim:.9},wide:{name:'全景',height:2.25,aim:.9},
    knee:{name:'中全景',height:1.62,aim:1.02},medium:{name:'中景',height:1.22,aim:1.3},
    close:{name:'近景',height:.78,aim:1.48},detail:{name:'特写',height:.4,aim:1.64}};
  const POSES={
    stand:{name:'自然站立'}, wave:{name:'举手打招呼',shoulder:135,elbow:65},
    sit:{name:'坐下交谈',rightHip:90,leftHip:90,rightKnee:90,leftKnee:90},
    reach:{name:'双手向前取物',shoulder:20,leftShoulder:20,rightArmPitch:75,leftArmPitch:75,elbow:30,leftElbow:25},
    walk:{name:'向前走',rightHip:29,leftHip:-22,rightKnee:14,leftKnee:34,rightArmPitch:-26,leftArmPitch:24,elbow:20,leftElbow:12,torsoPitch:5},
    run:{name:'快跑跨步',rightHip:59,leftHip:-39,rightKnee:26,leftKnee:78,rightArmPitch:-35,leftArmPitch:50,elbow:95,leftElbow:96,torsoPitch:18},
    crouch:{name:'下蹲查看',rightHip:100,leftHip:100,rightKnee:129,leftKnee:129,rightLegSpread:13,leftLegSpread:13,torsoPitch:27,rightArmPitch:50,leftArmPitch:50,elbow:25,leftElbow:25},
    kneel:{name:'单膝跪地',rightHip:86,leftHip:-3,rightKnee:89,leftKnee:88,torsoPitch:10,rightArmPitch:38,elbow:78},
    point:{name:'单手指向',shoulder:17,rightArmPitch:94,elbow:7,headYaw:12},
    defend:{name:'抬臂防御',shoulder:33,leftShoulder:33,rightArmPitch:50,leftArmPitch:52,elbow:125,leftElbow:125,rightHip:30,leftHip:25,rightKnee:38,leftKnee:41,torsoPitch:12},
    phone:{name:'举手打电话',shoulder:28,rightArmPitch:24,elbow:128,headYaw:13,headPitch:-8},
    bow:{name:'俯身鞠躬',torsoPitch:58,headPitch:12,rightArmPitch:-30,leftArmPitch:-30},
    handsOnHips:{name:'撑开双臂',shoulder:43,leftShoulder:43,elbow:65,leftElbow:65,rightArmPitch:-12,leftArmPitch:-12,rightLegSpread:11,leftLegSpread:11},
    turnBack:{name:'侧身回望',torsoYaw:34,headYaw:55,rightHip:12,leftHip:-13,rightKnee:8,leftKnee:14,rightArmPitch:15,leftArmPitch:-12}
  };
  const JOINTS={
    shoulder:[0,165,8],elbow:[0,130,0],leftShoulder:[0,165,8],leftElbow:[0,130,0],
    rightArmPitch:[-85,140,0],leftArmPitch:[-85,140,0],rightHip:[-60,115,0],leftHip:[-60,115,0],
    rightKnee:[0,145,0],leftKnee:[0,145,0],rightLegSpread:[0,35,0],leftLegSpread:[0,35,0],
    torsoPitch:[-40,70,0],torsoYaw:[-55,55,0],headPitch:[-35,45,0],headYaw:[-70,70,0]
  };
  const AIM={targetX:[-2,2],targetY:[-1.5,1.5],targetZ:[-2,2],roll:[-45,45]};
  const ASPECTS={'16:9':'16:9 横屏','9:16':'9:16 竖屏','1:1':'1:1 方形','21:9':'21:9 宽银幕'};
  const GUIDES={thirds:'三分线','center':'中心线',safe:'安全框',none:'关闭辅助线'};
  const ANGLES={front:['正面',0,0],quarter:['前侧 45°',45,0],side:['正侧 90°',90,0],back:['背面',180,0],low:['低机位',30,-.95],high:['高机位',30,1.4],overhead:['顶视',15,3]};
  const jointDefaults=()=>Object.fromEntries(Object.entries(JOINTS).map(([key,range])=>[key,range[2]]));
  function applyPose(actor,pose){
    if(!Object.hasOwn(POSES,pose))throw Error('导演预演姿态无效。');
    const joints=jointDefaults();
    for(const key of Object.keys(joints))if(Object.hasOwn(POSES[pose],key))joints[key]=POSES[pose][key];
    return {...actor,...joints,pose};
  }
  const COLORS={amber:[.64,.43,.28],blue:[.24,.46,.61],rose:[.65,.34,.42],green:[.29,.52,.43]};
  const PROP_NAMES={box:'方箱',table:'桌子',chair:'椅子',wall:'墙面',door:'门框'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const resetView=()=>({mode:'orbit',yaw:32,pitch:20,distance:5.6});
  function initialState(){return {version:3,actor:applyPose({x:0,y:0,z:0,yaw:0},'stand'),actorName:'角色 1',actorColor:'amber',actors:[],props:[],cameras:[],stage:'studio',motion:null,camera:{x:1.4,y:1.3,z:3.2,focal:35,targetX:0,targetY:0,targetZ:0,roll:0},shot:'wide',aspect:'16:9',guide:'thirds',view:resetView()};}
  function validateState(value){
    const number=(v,a,b)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<a||v>b)throw Error('导演预演数值无效，请重新调整后保存。');return v;};
    const choice=(v,items)=>{if(!items.includes(v))throw Error('导演预演选项无效，请重新调整后保存。');return v;};
    const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
    const name=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>40)throw Error('对象名称应在 1 到 40 字之间。');return v.trim();};
    const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)throw Error('片场对象数量超出范围。');return v;};
    if(!object(value)||![1,2,3].includes(value.version)||!object(value.actor)||!object(value.camera)||!object(value.view))throw Error('导演预演状态不完整，请重新打开导演台。');
    const legacy=value.version===1,multi=value.version===3;
    function actorOf(a){
      if(!object(a))throw Error('人物状态无效。');
      const pose=choice(a.pose,legacy?['stand','wave','sit','reach']:Object.keys(POSES));
      const actor={x:number(a.x,-12,12),y:number(a.y,0,3),z:number(a.z,-12,12),yaw:number(a.yaw,-180,180),pose};
      const defaults=jointDefaults();
      if(pose==='sit')Object.assign(defaults,{rightHip:90,leftHip:90,rightKnee:90,leftKnee:90});
      if(pose==='reach')defaults.leftShoulder=80;
      for(const [key,[min,max]] of Object.entries(JOINTS))actor[key]=number(legacy&&key!=='shoulder'&&key!=='elbow'?defaults[key]:a[key],min,max);
      return actor;
    }
    function cameraOf(c){
      if(!object(c))throw Error('机位状态无效。');
      const camera={x:number(c.x,-12,12),y:number(c.y,.2,6),z:number(c.z,-12,12),focal:number(c.focal,18,85)};
      for(const [key,[min,max]] of Object.entries(AIM))camera[key]=legacy?0:number(c[key],min,max);
      return camera;
    }
    const result={version:3,actor:actorOf(value.actor),camera:cameraOf(value.camera),
      shot:choice(value.shot,legacy?['wide','medium','close','detail']:Object.keys(SHOTS)),
      aspect:choice(value.aspect,legacy?['16:9','9:16','1:1']:Object.keys(ASPECTS)),guide:legacy?'thirds':choice(value.guide,Object.keys(GUIDES)),
      view:{mode:choice(value.view.mode,['orbit','camera']),yaw:number(value.view.yaw,-180,180),pitch:number(value.view.pitch,-15,75),distance:number(value.view.distance,2.5,18)},
      actorName:multi?name(value.actorName):'角色 1',actorColor:multi?choice(value.actorColor,Object.keys(COLORS)):'amber',
      actors:[],props:[],cameras:[],stage:multi?choice(value.stage,['studio','interior','street']):'studio',motion:null};
    if(multi){
      result.actors=list(value.actors,3).map(a=>({...actorOf(a),name:name(a.name),color:choice(a.color,Object.keys(COLORS))}));
      result.props=list(value.props,8).map(p=>{
        if(!object(p))throw Error('道具状态无效。');
        return {kind:choice(p.kind,Object.keys(PROP_NAMES)),name:name(p.name),x:number(p.x,-12,12),y:number(p.y,0,3),z:number(p.z,-12,12),yaw:number(p.yaw,-180,180),scale:number(p.scale,.25,3)};
      });
      result.cameras=list(value.cameras,6).map(c=>{
        if(!object(c))throw Error('保存机位无效。');
        return {name:name(c.name),camera:cameraOf(c.camera),shot:choice(c.shot,Object.keys(SHOTS)),aspect:choice(c.aspect,Object.keys(ASPECTS)),guide:choice(c.guide,Object.keys(GUIDES))};
      });
      if(value.motion!==null){
        const m=value.motion;
        if(!object(m))throw Error('运动预演状态无效。');
        let actor=null;
        if(m.endActor!==null){
          if(!object(m.endActor))throw Error('运动终点无效。');
          actor={x:number(m.endActor.x,-12,12),y:number(m.endActor.y,0,3),z:number(m.endActor.z,-12,12),yaw:number(m.endActor.yaw,-180,180)};
        }
        result.motion={duration:number(m.duration,1,12),endActor:actor,endCamera:m.endCamera===null?null:cameraOf(m.endCamera)};
        if(!result.motion.endActor&&!result.motion.endCamera)throw Error('请先设置人物或镜头的运动终点。');
      }
    }
    return result;
  }
  const actorsOf=s=>[{...s.actor,name:s.actorName,color:s.actorColor},...s.actors];
  const ratioOf=s=>{const [w,h]=s.aspect.split(':').map(Number);return w/h;};
  function targetOf(s){
    const {actor:a,camera:c}=s;
    const model=actorFrames(a);
    const tilt=rad(a.torsoPitch),azimuth=rad(a.yaw+a.torsoYaw),height=SHOTS[s.shot].aim-.87;
    const forward=Math.sin(tilt)*height;
    return [a.x+Math.sin(azimuth)*forward+c.targetX,a.y+model.ground+.87+height*Math.cos(tilt)+c.targetY,a.z+Math.cos(azimuth)*forward+c.targetZ];
  }
  function fitShot(value){
    const s=validateState(value),t=targetOf(s),ratio=ratioOf(s),distance=SHOTS[s.shot].height*s.camera.focal*ratio/36;
    const dx=s.camera.x-t[0],dz=s.camera.z-t[2],length=Math.hypot(dx,dz)||1;
    s.camera.x=clamp(t[0]+(length===1&&dx===0&&dz===0?0:dx/length)*distance,-12,12);
    s.camera.z=clamp(t[2]+(dx===0&&dz===0?1:dz/length)*distance,-12,12);
    s.camera.y=clamp(t[1],.2,6);return s;
  }
  function setCameraAngle(value,key){
    const s=validateState(value),angle=ANGLES[key];if(!angle)return s;
    const t=targetOf(s),[,azimuth,height]=angle,theta=rad(s.actor.yaw+azimuth);
    const distance=SHOTS[s.shot].height*s.camera.focal*ratioOf(s)/36;
    const horizontal=key==='overhead'?Math.max(.3,distance*.22):distance;
    s.camera.x=clamp(t[0]+Math.sin(theta)*horizontal,-12,12);
    s.camera.z=clamp(t[2]+Math.cos(theta)*horizontal,-12,12);
    s.camera.y=clamp(t[1]+height,.2,6);s.camera.roll=0;s.view.mode='camera';
    return s;
  }
  function describe(s){
    const c=s.camera,n=v=>Number(v.toFixed(2));
    const people=actorsOf(s).map(a=>a.name+'（'+POSES[a.pose].name+'，朝向'+n(a.yaw)+'°，位置 '+[a.x,a.y,a.z].map(n).join('/')+'米）').join('；');
    const props=s.props.map(p=>p.name+'（'+PROP_NAMES[p.kind]+'，位置 '+[p.x,p.y,p.z].map(n).join('/')+'米，朝向'+n(p.yaw)+'°，大小'+n(p.scale)+'倍）').join('；');
    const a=s.actor;
    return '镜头构图参考：'+SHOTS[s.shot].name+'，'+s.aspect+'画幅，'+n(c.focal)+'mm焦距，滚转'+n(c.roll)+'°。'+
      '人物站位：'+people+'。'+(props?'道具：'+props+'。':'')+
      '主角精调：躯干前倾'+n(a.torsoPitch)+'°，转体'+n(a.torsoYaw)+'°，转头'+n(a.headYaw)+'°，低头'+n(a.headPitch)+'°。右臂侧抬/前抬/屈肘 '+[a.shoulder,a.rightArmPitch,a.elbow].map(n).join('/')+'°，左臂 '+[a.leftShoulder,a.leftArmPitch,a.leftElbow].map(n).join('/')+'°。'+
      '机位 XYZ '+[c.x,c.y,c.z].map(n).join('、')+' 米，对准偏移 '+[c.targetX,c.targetY,c.targetZ].map(n).join('、')+' 米。'+
      (s.motion?'运动预演时长'+n(s.motion.duration)+'秒，'+(s.motion.endActor?'主角走到 '+[s.motion.endActor.x,s.motion.endActor.y,s.motion.endActor.z].map(n).join('/')+' 米，朝向'+n(s.motion.endActor.yaw)+'°。':'')+(s.motion.endCamera?'镜头移动到 '+[s.motion.endCamera.x,s.motion.endCamera.y,s.motion.endCamera.z].map(n).join('/')+' 米，焦距'+n(s.motion.endCamera.focal)+'mm。':''):'')+
      '以所附本地几何预演图为人物关系、空间、姿态和机位参考，按项目角色和场景细化。';
  }
  const V={sub:(a,b)=>a.map((x,i)=>x-b[i]),dot:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit:a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d);}};
  const M={identity:()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],mul:(a,b)=>{const out=Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[c*4+row]+=a[k*4+row]*b[c*4+k];return out;},translation:(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],scale:(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1],rotationZ:a=>{const c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];},rotationX:a=>{const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];},rotationY:a=>{const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];},perspective:(f,a,n,z)=>{const q=1/Math.tan(f/2);return[q/a,0,0,0,0,q,0,0,0,0,(z+n)/(n-z),-1,0,0,2*z*n/(n-z),0];},look:(eye,target)=>{const z=V.unit(V.sub(eye,target)),x=V.unit(V.cross(Math.abs(z[1])>.98?[0,0,1]:[0,1,0],z)),y=V.cross(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1];}};
  const chain=(...mat)=>mat.reduce((a,b)=>M.mul(a,b));
  function actorFrames(actor){
    const legs=[];
    for(const [sign,side] of [[-1,'left'],[1,'right']]){
      const hip=chain(M.translation(sign*.105,.8,0),M.rotationZ(rad(sign*actor[side+'LegSpread'])),M.rotationX(rad(-actor[side+'Hip'])));
      const knee=chain(hip,M.translation(0,-.4,0),M.rotationX(rad(actor[side+'Knee'])));
      const foot=chain(knee,M.translation(0,-.39,0),M.rotationX(rad(actor[side+'Hip']-actor[side+'Knee'])));
      legs.push({hip,knee,foot});
    }
    // Lower the pelvis until the lowest contact reaches the ground. Knees
    // can also bear weight in the kneeling and deeply crouched poses.
    const ground=-Math.min(...legs.flatMap(({knee,foot})=>[foot[13]+.06*foot[9]-.05,knee[13]-.065]));
    return {legs,ground};
  }
  function makeRenderer(canvas){
    const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    if(!gl)throw Error('此设备暂时无法开启三维预演。请在浏览器启用硬件加速后重开导演台。');
    const buffers=[],shaders=[];let program=null,disposed=false,lastView=null;
    function dispose(){if(disposed)return;disposed=true;for(const b of buffers)gl.deleteBuffer(b);for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=1;canvas.height=1;}
    try{
      function shader(type,source){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('三维着色器不可用，请更新显卡驱动后重试。');return s;}
      program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 position;attribute vec3 normal;uniform mat4 mvp;uniform mat4 model;varying float light;void main(){vec3 n=normalize(mat3(model)*normal);light=.55+.45*max(dot(n,normalize(vec3(.5,1.0,.7))),0.0);gl_Position=mvp*vec4(position,1.0);}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform vec3 color;varying float light;void main(){gl_FragColor=vec4(color*light,1.0);}'));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('三维渲染程序不可用，请关闭导演台后重试。');
      const attributes={position:gl.getAttribLocation(program,'position'),normal:gl.getAttribLocation(program,'normal')},uniforms={mvp:gl.getUniformLocation(program,'mvp'),model:gl.getUniformLocation(program,'model'),color:gl.getUniformLocation(program,'color')};
      function buffer(vertices,normals){const out={count:vertices.length/3};for(const [key,data]of[['position',vertices],['normal',normals]]){out[key]=gl.createBuffer();buffers.push(out[key]);gl.bindBuffer(gl.ARRAY_BUFFER,out[key]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);}return out;}
      const cv=[],cn=[],faces=[[[1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]],[[-1,0,0],[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]],[[0,1,0],[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]]],[[0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],[[0,0,-1],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]]];
      for(const [normal,points]of faces)for(const i of[0,1,2,0,2,3]){cv.push(...points[i]);cn.push(...normal);}const cube=buffer(cv,cn);
      const sv=[],sn=[],spherePoint=(u,v)=>[Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)];for(let y=0;y<14;y++)for(let x=0;x<20;x++){const p=[spherePoint(x/20*Math.PI*2,y/14*Math.PI),spherePoint((x+1)/20*Math.PI*2,y/14*Math.PI),spherePoint((x+1)/20*Math.PI*2,(y+1)/14*Math.PI),spherePoint(x/20*Math.PI*2,(y+1)/14*Math.PI)];for(const i of[0,1,2,0,2,3]){sv.push(...p[i]);sn.push(...p[i]);}}const sphere=buffer(sv,sn);
      const tv=[],tn=[];for(let i=0;i<20;i++){const a=i/20*Math.PI*2,b=(i+1)/20*Math.PI*2,p=[[Math.cos(a)*.5,-.5,Math.sin(a)*.5],[Math.cos(b)*.5,-.5,Math.sin(b)*.5],[Math.cos(b)*.5,.5,Math.sin(b)*.5],[Math.cos(a)*.5,.5,Math.sin(a)*.5]],n=[[Math.cos(a),0,Math.sin(a)],[Math.cos(b),0,Math.sin(b)],[Math.cos(b),0,Math.sin(b)],[Math.cos(a),0,Math.sin(a)]];for(const j of[0,1,2,0,2,3]){tv.push(...p[j]);tn.push(...n[j]);}}const tube=buffer(tv,tn);
      function draw(state,mode=state.view.mode,exporting=false,selected='actor:0',rig=false,centerOverride=null){
        if(disposed||gl.isContextLost())throw Error('三维预演已暂停，请点击重新开启。');
        const s=validateState(state),bounds=canvas.getBoundingClientRect(),ratio=ratioOf(s),dpr=Math.min(root.devicePixelRatio||1,1.5);
        const width=exporting?1280:Math.max(1,bounds.width*dpr),height=exporting?width/ratio:Math.max(1,bounds.height*dpr);
        const scale=Math.min(1,(exporting?1280:1920)/Math.max(width,height),Math.sqrt(2000000/(width*height)));
        const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
        gl.viewport(0,0,w,h);const bg=[.945,.935,.91],ink=[.53,.36,.25],neutral=[.38,.40,.41],line=[.83,.82,.78],joint=ink.map(n=>n*.72);
        gl.clearColor(...bg,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(program);
        const a=s.actor,c=s.camera,v=s.view,t=targetOf(s),camera=[c.x,c.y,c.z];if(Math.hypot(...V.sub(camera,t))<.12)throw Error('镜头离人物目标太近，请调整机位 X、Y、Z 或点击适配景别。');
        const orbit=mode==='orbit',oy=rad(v.yaw),op=rad(v.pitch),model=actorFrames(a);
        const cast=actorsOf(s),cx=cast.reduce((sum,a)=>sum+a.x,0)/cast.length,cz=cast.reduce((sum,a)=>sum+a.z,0)/cast.length;
        const center=centerOverride||[cx,.95,cz],eye=orbit?[center[0]+Math.sin(oy)*Math.cos(op)*v.distance,center[1]+Math.sin(op)*v.distance,center[2]+Math.cos(oy)*Math.cos(op)*v.distance]:camera;
        const fov=orbit?rad(42):2*Math.atan(18/c.focal/ratio),viewMatrix=M.look(eye,orbit?center:t);
        const vp=chain(M.perspective(fov,w/h,.04,100),M.rotationZ(orbit?0:rad(-c.roll)),viewMatrix);
        lastView={vp,eye,target:orbit?center:t,fov,aspect:w/h,bounds};
        const mesh=(geometry,model,color)=>{for(const key of['position','normal']){gl.bindBuffer(gl.ARRAY_BUFFER,geometry[key]);gl.enableVertexAttribArray(attributes[key]);gl.vertexAttribPointer(attributes[key],3,gl.FLOAT,false,0,0);}gl.uniformMatrix4fv(uniforms.mvp,false,new Float32Array(M.mul(vp,model)));gl.uniformMatrix4fv(uniforms.model,false,new Float32Array(model));gl.uniform3fv(uniforms.color,new Float32Array(color));gl.drawArrays(gl.TRIANGLES,0,geometry.count);};
        const box=(x,y,z,sx,sy,sz,color,parent=M.identity())=>mesh(cube,chain(parent,M.translation(x,y,z),M.scale(sx,sy,sz)),color),oval=(x,y,z,sx,sy,sz,color,parent=M.identity())=>mesh(sphere,chain(parent,M.translation(x,y,z),M.scale(sx,sy,sz)),color),ball=(x,y,z,size,color,parent)=>oval(x,y,z,size,size,size,color,parent);
        const capsule=(x,y,z,width,length,depth,color,parent=M.identity())=>{const mid=Math.max(.01,length-width);mesh(tube,chain(parent,M.translation(x,y,z),M.scale(width,mid,depth)),color);oval(x,y+mid/2,z,width/2,width/2,depth/2,color,parent);oval(x,y-mid/2,z,width/2,width/2,depth/2,color,parent);};
        const segment=(p,q,width,color)=>{const d=V.sub(q,p);if(Math.hypot(...d)<.001)return;const y=V.unit(d),x=V.unit(V.cross(y,Math.abs(y[2])>.95?[1,0,0]:[0,0,1])),z=V.cross(x,y),mid=p.map((n,i)=>(n+q[i])/2);mesh(cube,M.mul([x[0],x[1],x[2],0,y[0],y[1],y[2],0,z[0],z[1],z[2],0,...mid,1],M.scale(width,Math.hypot(...d),width)),color);};
        box(a.x,-.04,a.z,28,.05,28,bg);for(let i=-13;i<=13;i++){box(Math.round(a.x)+i,0,a.z,.008,.006,28,line);box(a.x,0,Math.round(a.z)+i,28,.006,.008,line);}
        for(const [index,a] of actorsOf(s).entries()){
        const ink=COLORS[a.color],joint=ink.map(n=>n*.68),model=actorFrames(a);
        const actorRoot=chain(M.translation(a.x,a.y,a.z),M.rotationY(rad(a.yaw))),base=chain(actorRoot,M.translation(0,model.ground,0));
        const torso=chain(base,M.translation(0,.87,0),M.rotationY(rad(a.torsoYaw)),M.rotationX(rad(a.torsoPitch)),M.translation(0,-.87,0));
        const head=chain(torso,M.translation(0,1.5,0),M.rotationY(rad(a.headYaw)),M.rotationX(rad(a.headPitch)),M.translation(0,-1.5,0));
        oval(0,1.17,0,.22,.31,.145,ink,torso);oval(0,1.67,0,.145,.17,.145,ink,head);
        capsule(0,1.45,0,.09,.14,.09,joint,torso);oval(0,.86,0,.18,.12,.135,ink,base);ball(0,1.68,.145,.026,joint,head);
        for(const leg of model.legs){
          const hip=M.mul(base,leg.hip),knee=M.mul(base,leg.knee),foot=M.mul(base,leg.foot);
          ball(0,0,0,.068,joint,hip);capsule(0,-.2,0,.14,.4,.15,ink,hip);
          ball(0,0,0,.065,joint,knee);capsule(0,-.18,0,.115,.36,.125,ink,knee);oval(0,0,.06,.075,.05,.135,ink,foot);
        }
        for(const [sign,side,raise,bend] of [[-1,'left',a.leftShoulder,a.leftElbow],[1,'right',a.shoulder,a.elbow]]){
          const shoulder=chain(torso,M.translation(sign*.225,1.38,0),M.rotationX(rad(-a[side+'ArmPitch'])),M.rotationZ(rad(sign*raise)));
          ball(0,0,0,.075,joint,shoulder);capsule(0,-.155,0,.11,.31,.11,ink,shoulder);
          const elbow=chain(shoulder,M.translation(0,-.31,0),M.rotationX(rad(-bend)));
          ball(0,0,0,.06,joint,elbow);capsule(0,-.14,0,.085,.28,.085,ink,elbow);oval(0,-.3,0,.055,.075,.035,ink,elbow);
        }
        if(a.pose==='sit'){
          const seat=Math.max(.12,.72+model.ground);
          box(0,seat,-.05,.62,.08,.58,neutral,actorRoot);
          for(const x of[-.22,.22])for(const z of[-.22,.22])box(x,seat/2,z,.045,seat,.045,neutral,actorRoot);
        }
        if(orbit&&selected==='actor:'+index)box(0,.008,0,.64,.012,.64,ink,actorRoot);
        }
        for(const [index,p] of s.props.entries()){
          const parent=chain(M.translation(p.x,p.y,p.z),M.rotationY(rad(p.yaw)),M.scale(p.scale,p.scale,p.scale)),color=[.48,.50,.49];
          if(p.kind==='box')box(0,.4,0,.8,.8,.8,color,parent);
          if(p.kind==='wall')box(0,1.3,0,3.6,2.6,.12,[.72,.73,.71],parent);
          if(p.kind==='door'){
            box(-.6,1.15,0,.12,2.3,.15,color,parent);box(.6,1.15,0,.12,2.3,.15,color,parent);box(0,2.3,0,1.32,.12,.15,color,parent);
          }
          if(p.kind==='table'){
            box(0,.76,0,1.5,.10,.85,color,parent);
            for(const x of[-.63,.63])for(const z of[-.32,.32])box(x,.36,z,.07,.72,.07,color,parent);
          }
          if(p.kind==='chair'){
            box(0,.48,0,.56,.08,.56,color,parent);box(0,.88,-.24,.56,.75,.065,color,parent);
            for(const x of[-.22,.22])for(const z of[-.22,.22])box(x,.23,z,.055,.46,.055,color,parent);
          }
          if(orbit&&selected==='prop:'+index)box(0,.01,0,1.0,.014,1.0,[.76,.57,.28],parent);
        }
        if(s.stage==='interior'){box(0,1.6,-4,11,3.2,.12,[.79,.79,.75]);box(-5.5,1.6,0,.12,3.2,8,[.74,.76,.74]);}
        if(s.stage==='street'){
          box(0,.006,0,4.2,.014,26,[.40,.43,.45]);
          for(let z=-12;z<=12;z+=2)box(0,.018,z,.055,.008,.85,[.82,.80,.63]);
          box(-3.4,.5,-4,2.4,1,2.5,[.61,.65,.64]);box(3.8,1,-6,2.4,2,3,[.69,.71,.68]);
        }
        if(orbit&&rig){
          const forward=V.unit(V.sub(t,camera)),right=V.unit(V.cross(forward,[0,1,0])),up=V.cross(right,forward),distance=Math.min(1.2,Math.hypot(...V.sub(t,camera))*.6);
          const center=camera.map((n,i)=>n+forward[i]*distance),halfWidth=distance*18/c.focal,halfHeight=halfWidth/ratio;
          const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>center.map((n,i)=>n+right[i]*x*halfWidth+up[i]*y*halfHeight));
          for(let i=0;i<4;i++){segment(camera,corners[i],.005,[.52,.60,.66]);segment(corners[i],corners[(i+1)%4],.005,[.52,.60,.66]);}
        }
      }
      function project(point){
        if(!lastView)return null;
        const {vp,bounds}=lastView,clip=[0,1,2,3].map(row=>vp[row]*point[0]+vp[4+row]*point[1]+vp[8+row]*point[2]+vp[12+row]);
        if(clip[3]<=0)return null;
        return {x:(clip[0]/clip[3]+1)*bounds.width/2,y:(1-clip[1]/clip[3])*bounds.height/2,depth:clip[3]};
      }
      function groundAt(clientX,clientY,height=0){
        if(!lastView)return null;
        const {eye,target,fov,aspect,bounds}=lastView,forward=V.unit(V.sub(target,eye)),right=V.unit(V.cross(forward,Math.abs(forward[1])>.98?[0,0,1]:[0,1,0])),up=V.cross(right,forward);
        const x=((clientX-bounds.left)/bounds.width*2-1)*Math.tan(fov/2)*aspect,y=(1-(clientY-bounds.top)/bounds.height*2)*Math.tan(fov/2);
        const ray=forward.map((n,i)=>n+right[i]*x+up[i]*y),distance=(height-eye[1])/ray[1];
        return Math.abs(ray[1])>.02&&distance>0?{x:eye[0]+ray[0]*distance,z:eye[2]+ray[2]*distance}:null;
      }
      return {draw,dispose,project,groundAt};
    }catch(error){dispose();throw error;}
  }
  const numberField=(name,label,min,max)=>`<label>${label}<input data-director-field="${name}" type="number" min="${min}" max="${max}" step="any" inputmode="decimal" required></label>`;
  const rangeField=(name,label,min,max)=>`<label class="director254-range">${label}<output data-director-output="${name}"></output><input data-director-field="${name}" type="range" min="${min}" max="${max}" step="1"></label>`;
  const jointField=(key,label)=>rangeField('actor.'+key,label+' · °',JOINTS[key][0],JOINTS[key][1]);
  const options=(values,label=value=>value)=>Object.entries(values).map(([key,value])=>`<option value="${key}">${label(value)}</option>`).join('');
  const coordinates=(prefix,range)=>`<div class="director254-triple">${['x','y','z'].map((axis,i)=>numberField(prefix+'.'+axis,['X · 左右','Y · 高度','Z · 前后'][i],range[i][0],range[i][1])).join('')}</div>`;
  function template(){return `
    <header class="director254-header">
      <div><h2>导演台 <small>片场预演</small></h2><p>摆人物、放道具，直接看镜头里的构图</p></div>
      <button type="button" data-director-action="close" aria-label="关闭导演台" class="director254-close">×</button>
    </header>
    <div class="director254-body">
      <aside class="director258-library" aria-label="片场对象">
        <h3>片场对象 <span data-stage-count></span></h3>
        <div class="director258-add"><button type="button" data-stage-add-actor>＋ 人物</button><select data-stage-add-prop aria-label="选择道具">${options(PROP_NAMES)}</select><button type="button" data-director-action="addProp" aria-label="添加所选道具">＋</button></div>
        <div class="director258-object-list" data-stage-objects></div>
        <div class="director258-object-edit">
          <label>对象名称<input data-stage-name maxlength="40" required></label>
          <label data-stage-color-label>人物颜色<select data-stage-color><option value="amber">琥珀</option><option value="blue">雾蓝</option><option value="rose">玫瑰</option><option value="green">青绿</option></select></label>
          <button type="button" data-director-action="deleteObject">删除选中对象</button>
        </div>
        <h3>快捷搭景</h3>
        <select data-stage-preset aria-label="快捷搭景"><option value="">选择场景布局</option><option value="conversation">双人对话</option><option value="opposition">双人对峙</option><option value="table">隔桌交谈</option></select>
        <p class="director258-caption">套用布局会替换当前站位与道具。可用撤销恢复。</p>
        <h3>场地</h3><select data-director-field="stage"><option value="studio">摄影棚</option><option value="interior">室内空间</option><option value="street">街道空间</option></select>
        <h3>保存机位 <span data-stage-camera-count></span></h3>
        <div class="director258-bookmark"><input data-stage-bookmark-name maxlength="40" placeholder="例如：主角近景" aria-label="机位名称"><button type="button" data-director-action="saveCamera">保存</button></div>
        <div data-stage-cameras></div>
      </aside>
      <section class="director254-stage" aria-label="预演画面">
        <div class="director254-toolbar">
          <div class="director254-view"><button type="button" data-director-action="orbit" aria-pressed="true">导演视角</button><button type="button" data-director-action="camera" aria-pressed="false">镜头画面</button></div>
          <div class="director254-tools"><button type="button" data-director-action="undo" aria-label="撤销片场操作">↶</button><button type="button" data-director-action="rig" aria-pressed="false">机位框</button><button type="button" data-director-action="resetView">复位视角</button><button type="button" data-director-action="focus" aria-pressed="false">专注画面</button></div>
        </div>
        <div class="director254-preview-slot"><div class="director254-viewport">
          <canvas tabindex="0" aria-label="三维预演。导演视角下拖动旋转、滚轮缩放，方向键旋转、加减键缩放。"></canvas>
          <div class="director254-safe" aria-hidden="true" hidden><span></span></div>
          <div class="director254-fallback" hidden><strong>三维预演暂不可用</strong><p data-director-error></p><button type="button" data-director-action="retry">重新开启</button></div>
          <span class="director254-view-label"></span>
          <div class="director258-handles" data-stage-handles></div>
        </div></div>
        <p class="director254-help">拖动对象调整站位 · 拖动空白旋转视角 · 滚轮缩放</p>
        <div class="director258-timeline">
          <div><strong>运动预演</strong><button type="button" data-director-action="motionStart">记录起点</button><button type="button" data-director-action="motionEnd">记录终点</button><button type="button" data-director-action="play">▶ 播放</button></div>
          <label>时长 <input data-stage-duration type="number" min="1" max="12" value="4"> 秒</label>
          <input data-stage-time type="range" min="0" max="100" value="0" aria-label="运动预演进度">
          <output data-stage-time-label>0.0s</output><button type="button" data-director-action="clearMotion" aria-label="清除运动">×</button>
          <p class="director258-motion-help">记录主角与机位的运动。加入画布保存起始构图图。</p>
        </div>
      </section>
      <aside class="director254-controls" aria-label="人物与镜头设置">
        <div class="director258-live-shot"><div><b>实时镜头</b><button type="button" data-director-action="camera">查看</button></div><canvas data-stage-shot-preview aria-label="实时镜头预览"></canvas></div>
        <button type="button" data-director-action="viewToCamera" class="director254-wide">将当前导演视角设为机位</button>
        <fieldset><legend>镜头</legend>
          <div class="director254-pair"><label>景别<select data-director-field="shot">${options(SHOTS,s=>s.name)}</select></label><label>画幅<select data-director-field="aspect">${options(ASPECTS)}</select></label></div>
          <div class="director254-pair"><label>机位预设<select data-director-angle><option value="">选择机位</option>${options(ANGLES,angle=>angle[0])}</select></label><label>构图辅助线<select data-director-field="guide">${options(GUIDES)}</select></label></div>
          ${rangeField('camera.focal','焦距 · mm',18,85)}
          ${coordinates('camera',[[-12,12],[.2,6],[-12,12]])}
          <button type="button" data-director-action="fit" class="director254-wide">适配当前景别</button>
          <details><summary>对准偏移与滚转</summary><div class="director254-detail">
            <div class="director254-triple">${numberField('camera.targetX','偏移 X',-2,2)}${numberField('camera.targetY','偏移 Y',-1.5,1.5)}${numberField('camera.targetZ','偏移 Z',-2,2)}</div>
            ${rangeField('camera.roll','镜头滚转 · °',-45,45)}
            <button type="button" data-director-action="resetAim">重置对准与滚转</button>
          </div></details>
        </fieldset>
        <fieldset data-stage-actor-fields><legend>选中人物</legend>
          <label>动作预设<select data-director-field="actor.pose">${options(POSES,pose=>pose.name)}</select></label>
          ${rangeField('actor.yaw','人物朝向 · °',-180,180)}
          ${coordinates('actor',[[-12,12],[0,3],[-12,12]])}
          <details><summary>肩、肘与手臂</summary><div class="director254-detail director254-pair">
            ${jointField('shoulder','右肩侧抬')}${jointField('leftShoulder','左肩侧抬')}
            ${jointField('rightArmPitch','右臂前抬')}${jointField('leftArmPitch','左臂前抬')}
            ${jointField('elbow','右肘弯曲')}${jointField('leftElbow','左肘弯曲')}
          </div></details>
          <details><summary>髋、膝与站距</summary><div class="director254-detail director254-pair">
            ${jointField('rightHip','右髋前抬')}${jointField('leftHip','左髋前抬')}
            ${jointField('rightKnee','右膝弯曲')}${jointField('leftKnee','左膝弯曲')}
            ${jointField('rightLegSpread','右腿外展')}${jointField('leftLegSpread','左腿外展')}
          </div></details>
          <details><summary>躯干与头部</summary><div class="director254-detail director254-pair">
            ${jointField('torsoPitch','躯干前倾')}${jointField('torsoYaw','躯干转向')}
            ${jointField('headPitch','低头角度')}${jointField('headYaw','头部转向')}
          </div></details>
          <button type="button" data-director-action="resetPose" class="director254-text-button">恢复当前预设姿态</button>
        </fieldset>
        <fieldset data-stage-prop-fields hidden><legend>选中道具</legend><div class="director254-triple">${['x','y','z'].map((axis,i)=>'<label>'+['X · 左右','Y · 高度','Z · 前后'][i]+'<input data-stage-prop="'+axis+'" type="number" step="any" min="'+(axis==='y'?0:-12)+'" max="'+(axis==='y'?3:12)+'" required></label>').join('')}</div><label>朝向 · °<input type="range" data-stage-prop="yaw" min="-180" max="180"></label><label>大小<input type="number" data-stage-prop="scale" min=".25" max="3" step=".05" required></label></fieldset>
        <details><summary>构图说明</summary><div class="director254-detail">
          <textarea rows="5" maxlength="2400" data-director-prompt aria-label="构图说明"></textarea>
          <button type="button" class="director254-text-button" data-director-action="refreshPrompt">按当前设置更新说明</button>
        </div></details>
        <button type="button" data-director-action="reset" class="director254-text-button director254-reset">重置人物与镜头</button>
      </aside>
    </div>
    <footer class="director254-footer"><p role="status" aria-live="polite" data-director-status>保存镜头画面与构图参数</p><div><button type="button" data-director-action="close">取消</button><button type="button" data-director-action="insert" class="director254-primary" disabled>加入画布</button></div></footer>`;}
  function create(b){
    if(!b||typeof b.state!=='function'||typeof b.insert!=='function')throw Error('导演台缺少画布接入函数。');
    let state=initialState(),dialog=null,canvas=null,renderer=null,miniRenderer=null,observer=null,pending=0,destroyed=false,saving=false,epoch=0,owner=null,listeners=[],pointer=null,promptEdited=false,validFrame=false,restoreFocus=null,focused=false;
    let selectedObject='actor:0',orbitCenter=[0,.95,0],rigShown=false,history=[],playing=false,playStarted=0,timePosition=0,motionStart=null,moduleActive=true,lastFrameTime=0;
    const query=s=>dialog?.querySelector(s),notify=(text,error=false)=>{if(typeof b.notify==='function')b.notify(text,error);},live=()=>!!dialog&&!destroyed;
    const status=(text,error=false)=>{const el=query('[data-director-status]');if(el){el.textContent=text;el.dataset.error=String(error);}};
    function activeActor(s=state){const index=Number(selectedObject.split(':')[1]);return index?s.actors[index-1]:s.actor;}
    function activeObject(s=state){return selectedObject.startsWith('prop:')?s.props[Number(selectedObject.split(':')[1])]:activeActor(s);}
    function checkpoint(){history.push(validateState(state));if(history.length>40)history.shift();}
    function stopPlayback(){playing=false;timePosition=0;}
    function ownerMatches(){const now=b.state();return !!now.doc&&now.doc.id===owner?.id&&(!owner.nodeId||now.doc.graph?.nodes.some(n=>n.id===owner.nodeId));}
    function listen(el,event,fn,options){el.addEventListener(event,fn,options);listeners.push(()=>el.removeEventListener(event,fn,options));}
    function unavailable(error){validFrame=false;playing=false;const panel=query('.director254-fallback');if(panel){panel.hidden=false;query('[data-director-error]').textContent=error.message||String(error);}query('[data-director-action="insert"]')?.setAttribute('disabled','');status('无法输出参考图。调整机位或重新开启后再试。',true);}
    function cancelFrame(){if(pending){root.cancelAnimationFrame(pending);pending=0;}}
    function sampleState(){
      const out=validateState(state),motion=out.motion;
      if(!motion||timePosition===0)return out;
      if(motion.endActor)for(const key of ['x','y','z','yaw'])out.actor[key]+= (motion.endActor[key]-out.actor[key])*timePosition;
      if(motion.endCamera)for(const key of Object.keys(out.camera))out.camera[key]+=(motion.endCamera[key]-out.camera[key])*timePosition;
      return out;
    }
    function paintObjects(frameState){
      const layer=query('[data-stage-handles]');
      if(state.view.mode!=='orbit'){layer.replaceChildren();return;}
      const rows=actorsOf(frameState).map((a,i)=>({key:'actor:'+i,name:a.name,point:[a.x,a.y+actorFrames(a).ground+1.95,a.z],color:a.color}));
      for(const [i,p]of frameState.props.entries())rows.push({key:'prop:'+i,name:p.name,point:[p.x,p.y+(.8*p.scale),p.z],color:'prop'});
      layer.innerHTML=rows.map(row=>{const point=renderer.project(row.point);if(!point)return '';return '<button type="button" data-stage-handle="'+row.key+'" style="left:'+point.x+'px;top:'+point.y+'px" class="'+(selectedObject===row.key?'selected':'')+'" aria-label="拖动'+esc(row.name)+'">'+esc(row.name)+'</button>';}).join('');
    }
    function schedule(){
      if(!live()||!renderer||pending||saving||document.hidden||!moduleActive)return;
      pending=root.requestAnimationFrame(now=>{
        pending=0;if(!live()||!renderer||saving||document.hidden||!moduleActive)return;
        if(playing&&now-lastFrameTime<33.3){schedule();return;}
        lastFrameTime=now;
        if(playing){timePosition=Math.min(1,(now-playStarted)/(state.motion.duration*1000));if(timePosition>=1)playing=false;}
        try{
          const frame=sampleState();
          renderer.draw(frame,state.view.mode,false,selectedObject,rigShown,orbitCenter);
          if(miniRenderer&&!focused)miniRenderer.draw(frame,'camera');
          paintObjects(frame);validFrame=true;query('.director254-fallback').hidden=true;query('[data-director-action="insert"]').disabled=false;
          query('[data-stage-time]').value=String(timePosition*100);
          query('[data-stage-time-label]').textContent=(timePosition*(state.motion?.duration||4)).toFixed(1)+'s';
          query('[data-director-action="play"]').textContent=playing?'Ⅱ 暂停':'▶ 播放';
        }catch(error){unavailable(error);}
        if(playing)schedule();
      });
    }
    function fitViewport(){
      if(!live())return;
      const view=query('.director254-viewport'),slot=query('.director254-preview-slot');
      const ratio=state.view.mode==='camera'?ratioOf(state):slot.clientWidth/Math.max(1,slot.clientHeight);
      const width=Math.max(1,Math.min(slot.clientWidth,slot.clientHeight*ratio));
      view.style.width=width+'px';view.style.height=Math.max(1,width/(ratio||1))+'px';
      query('[data-stage-shot-preview]').style.aspectRatio=String(ratioOf(state));schedule();
    }
    function syncObjects(skipInput){
      const prop=selectedObject.startsWith('prop:'),index=Number(selectedObject.split(':')[1]),item=activeObject();
      query('[data-stage-count]').textContent=String(1+state.actors.length+state.props.length);
      query('[data-stage-objects]').innerHTML=actorsOf(state).map((a,i)=>'<button type="button" data-stage-object="actor:'+i+'" aria-pressed="'+(selectedObject==='actor:'+i)+'"><i class="director258-dot '+a.color+'"></i>'+esc(a.name)+'</button>').join('')+
        state.props.map((p,i)=>'<button type="button" data-stage-object="prop:'+i+'" aria-pressed="'+(selectedObject==='prop:'+i)+'"><i class="director258-prop-icon">◇</i>'+esc(p.name)+'</button>').join('');
      query('[data-stage-camera-count]').textContent=state.cameras.length+'/6';
      query('[data-stage-cameras]').innerHTML=state.cameras.map((c,i)=>'<div class="director258-camera-row"><button type="button" data-stage-camera="'+i+'">▣ '+esc(c.name)+'</button><button type="button" data-stage-remove-camera="'+i+'" aria-label="删除机位'+esc(c.name)+'">×</button></div>').join('');
      query('[data-stage-add-actor]').disabled=state.actors.length>=3;
      query('[data-director-action="addProp"]').disabled=state.props.length>=8;
      query('[data-director-action="saveCamera"]').disabled=state.cameras.length>=6;
      query('[data-director-action="deleteObject"]').disabled=!prop&&index===0&&!state.actors.length;
      const nameInput=query('[data-stage-name]');
      if(nameInput!==skipInput)nameInput.value=prop||index?item.name:state.actorName;
      query('[data-stage-color-label]').hidden=prop;
      query('[data-stage-color]').value=index?item.color:state.actorColor;
      query('[data-stage-actor-fields]').hidden=prop;query('[data-stage-prop-fields]').hidden=!prop;
      for(const input of query('[data-stage-prop-fields]').querySelectorAll('input')){input.disabled=!prop;if(prop&&input!==skipInput)input.value=item[input.dataset.stageProp];}
      for(const input of query('[data-stage-actor-fields]').querySelectorAll('input,select'))input.disabled=prop;
    }
    function sync(skipInput=null){
      if(!live())return;
      const cameraMode=state.view.mode==='camera',prop=selectedObject.startsWith('prop:');
      for(const input of dialog.querySelectorAll('[data-director-field]')){
        if(input===skipInput)continue;
        const [section,field]=input.dataset.directorField.split('.');
        input.value=field?(section==='actor'&&!prop?activeActor():state[section])[field]:state[section];
      }
      for(const output of dialog.querySelectorAll('[data-director-output]')){
        const [section,field]=output.dataset.directorOutput.split('.');
        output.textContent=String((section==='actor'&&!prop?activeActor():state[section])[field]);
      }
      syncObjects(skipInput);
      for(const button of dialog.querySelectorAll('[data-director-action="orbit"],[data-director-action="camera"]'))button.setAttribute('aria-pressed',String(state.view.mode===button.dataset.directorAction));
      dialog.classList.toggle('director254-focus',focused);
      const focusButton=query('[data-director-action="focus"]');
      focusButton.setAttribute('aria-pressed',String(focused));focusButton.textContent=focused?'退出专注':'专注画面';
      query('[data-director-action="rig"]').setAttribute('aria-pressed',String(rigShown));
      query('[data-director-action="undo"]').disabled=!history.length;
      query('[data-director-action="play"]').disabled=!state.motion;
      query('[data-stage-time]').disabled=!state.motion;
      query('[data-stage-duration]').value=String(state.motion?.duration||4);
      query('.director254-viewport').dataset.guide=state.guide;
      query('.director254-view-label').textContent=(cameraMode?'镜头画面':'导演视角')+' · '+SHOTS[state.shot].name+' · '+state.camera.focal+'mm';
      query('.director254-safe').hidden=!cameraMode||state.guide==='none';
      query('.director254-help').textContent=cameraMode?'此视角用于导出构图图。':'拖动人物标签或身体调整站位 · 拖空白环绕 · 滚轮缩放';
      if(!promptEdited)query('[data-director-prompt]').value=describe(state);
      fitViewport();
    }
    function close(){
      if(!dialog)return;epoch++;playing=false;cancelFrame();observer?.disconnect();observer=null;for(const stop of listeners)stop();listeners=[];renderer?.dispose();miniRenderer?.dispose();renderer=null;miniRenderer=null;pointer=null;validFrame=false;
      const old=dialog;dialog=null;canvas=null;if(old.open&&typeof old.close==='function')old.close();old.remove();if(restoreFocus?.isConnected)restoreFocus.focus({preventScroll:true});restoreFocus=null;
    }
    function startRenderer(){try{renderer=makeRenderer(canvas);miniRenderer=makeRenderer(query('[data-stage-shot-preview]'));schedule();}catch(error){unavailable(error);}}
    function selectObject(key){selectedObject=key;stopPlayback();sync();}
    function addActor(){
      if(state.actors.length>=3)return;
      checkpoint();state.actors.push({...applyPose({x:clamp(state.actor.x+1+state.actors.length*.7,-12,12),y:0,z:state.actor.z,yaw:-25},'stand'),name:'角色 '+(state.actors.length+2),color:Object.keys(COLORS)[state.actors.length+1]});
      selectedObject='actor:'+state.actors.length;stopPlayback();sync();
    }
    function applyStagePreset(key){
      checkpoint();const a=applyPose({...state.actor,x:-.9,y:0,z:0,yaw:70},key==='table'?'sit':'stand');
      state.actor=a;state.actorName='角色 1';state.actorColor='amber';
      state.actors=[{...applyPose({x:.9,y:0,z:0,yaw:-70},key==='table'?'sit':'stand'),name:'角色 2',color:'blue'}];
      state.props=key==='table'?[{kind:'table',name:'交谈桌',x:0,y:0,z:.1,yaw:90,scale:1}]:[];
      if(key==='opposition'){state.actor.yaw=90;state.actors[0].yaw=-90;state.actor.x=-1.3;state.actors[0].x=1.3;}
      state.shot='wide';state.camera={x:0,y:1.35,z:5,focal:35,targetX:.9,targetY:0,targetZ:0,roll:0};state.view=resetView();state.view.distance=6.5;orbitCenter=[0,.95,0];state.motion=null;motionStart=null;selectedObject='actor:0';stopPlayback();sync();
      status('布局已摆好。可拖动人物、道具，右侧实时检查镜头。');
    }
    function pickObject(event){
      const direct=event.target.closest('[data-stage-handle]');if(direct)return direct.dataset.stageHandle;
      const bounds=canvas.getBoundingClientRect(),x=event.clientX-bounds.left,y=event.clientY-bounds.top;
      let nearest=null,best=45;
      for(const [i,a]of actorsOf(state).entries()){const point=renderer.project([a.x,a.y+actorFrames(a).ground+1,a.z]);if(point){const d=Math.hypot(x-point.x,y-point.y);if(d<best){best=d;nearest='actor:'+i;}}}
      for(const [i,p]of state.props.entries()){const point=renderer.project([p.x,p.y+.5*p.scale,p.z]);if(point){const d=Math.hypot(x-point.x,y-point.y);if(d<best){best=d;nearest='prop:'+i;}}}
      return nearest;
    }
    function open(retryDraft){
      if(destroyed)return;if(saving){notify('正在加入画布，请等待这次操作完成。');return;}if(dialog){dialog.focus();return;}
      const current=b.state();if(!current.doc){notify('请先打开或新建画布。',true);return;}if(current.locked){notify('当前画布任务进行中，结束后可打开导演台。',true);return;}
      const selected=current.doc.graph?.nodes.find(n=>n.id===current.selected),sameOwner=owner?.id===current.doc.id;owner={id:current.doc.id,nodeId:selected?.kind==='scene'?selected.id:''};let savedError='';
      if(retryDraft){state=validateState(retryDraft.state);}else if(selected?.kind==='scene'&&Object.prototype.hasOwnProperty.call(selected,'director254')){try{state=validateState(selected.director254);}catch(error){savedError=error.message;state=initialState();}}else if(!sameOwner){state=initialState();}
      promptEdited=false;focused=retryDraft?.focused??false;selectedObject='actor:0';orbitCenter=[actorsOf(state).reduce((sum,a)=>sum+a.x,0)/(1+state.actors.length),.95,actorsOf(state).reduce((sum,a)=>sum+a.z,0)/(1+state.actors.length)];history=[];playing=false;timePosition=0;motionStart=null;rigShown=false;
      const thisEpoch=++epoch;restoreFocus=document.activeElement;dialog=document.createElement('dialog');dialog.className='canvas-director254 director258-stage';dialog.setAttribute('aria-label','本地导演台');dialog.innerHTML=template();document.body.appendChild(dialog);canvas=query('.director254-viewport canvas');
      if(typeof dialog.showModal==='function')dialog.showModal();else{close();notify('当前浏览器不支持导演台弹窗，请更新浏览器后重试。',true);return;}
      listen(dialog,'cancel',event=>{event.preventDefault();if(saving){status('正在加入画布，请等待保存完成。');return;}close();});listen(dialog,'close',close);
      for(const surface of dialog.querySelectorAll('canvas'))listen(surface,'webglcontextlost',event=>{event.preventDefault();cancelFrame();if(live())unavailable(Error('显卡资源暂不可用。关闭其他三维页面后，点击重新开启。'));});
      listen(dialog,'click',event=>{
        if(saving)return;
        const objectButton=event.target.closest('[data-stage-object]');if(objectButton){selectObject(objectButton.dataset.stageObject);return;}
        if(event.target.closest('[data-stage-add-actor]')){addActor();return;}
        const cameraButton=event.target.closest('[data-stage-camera]');if(cameraButton){checkpoint();const saved=state.cameras[Number(cameraButton.dataset.stageCamera)];Object.assign(state,{camera:{...saved.camera},shot:saved.shot,aspect:saved.aspect,guide:saved.guide});stopPlayback();sync();return;}
        const removeCamera=event.target.closest('[data-stage-remove-camera]');if(removeCamera){checkpoint();state.cameras.splice(Number(removeCamera.dataset.stageRemoveCamera),1);sync();return;}
        const button=event.target.closest('[data-director-action]');if(!button||button.disabled)return;
        const action=button.dataset.directorAction;
        if(action==='close'){close();return;}if(action==='insert'){insert();return;}
        if(action==='retry'){const draft={state:validateState(state),prompt:query('[data-director-prompt]').value,edited:promptEdited,focused};close();open(draft);return;}
        if(action==='undo'){if(history.length){state=history.pop();selectedObject='actor:0';stopPlayback();motionStart=null;sync();}return;}
        if(action==='play'){
          if(!state.motion)return;
          playing=!playing;if(playing){if(timePosition>=1)timePosition=0;playStarted=performance.now()-timePosition*state.motion.duration*1000;}schedule();return;
        }
        if(action==='motionStart'){motionStart={actor:{...state.actor},camera:{...state.camera}};stopPlayback();status('起点已记住。调整主角或机位后点击记录终点。');return;}
        if(action==='motionEnd'){
          if(!motionStart){status('请先记录起点，再调整主角或机位。',true);return;}
          checkpoint();const duration=clamp(Number(query('[data-stage-duration]').value)||4,1,12),endActor=Object.fromEntries(['x','y','z','yaw'].map(key=>[key,state.actor[key]]));
          state.motion={duration,endActor,endCamera:{...state.camera}};state.actor={...motionStart.actor};state.camera={...motionStart.camera};motionStart=null;stopPlayback();sync();status('运动已记录。播放或拖动进度查看走位与运镜。');return;
        }
        if(action==='clearMotion'){checkpoint();state.motion=null;motionStart=null;stopPlayback();sync();return;}
        if(action==='reset'){checkpoint();state=initialState();selectedObject='actor:0';orbitCenter=[0,.95,0];promptEdited=false;motionStart=null;stopPlayback();}
        if(action==='resetView'){state.view=resetView();const cast=actorsOf(state);orbitCenter=[cast.reduce((sum,a)=>sum+a.x,0)/cast.length,.95,cast.reduce((sum,a)=>sum+a.z,0)/cast.length];}
        if(action==='focus')focused=!focused;
        if(action==='rig')rigShown=!rigShown;
        if(action==='resetPose'){checkpoint();const actor=activeActor();Object.assign(actor,applyPose(actor,actor.pose));stopPlayback();}
        if(action==='resetAim'){checkpoint();for(const key of Object.keys(AIM))state.camera[key]=0;stopPlayback();}
        if(action==='orbit'||action==='camera')state.view.mode=action;
        if(action==='fit'){checkpoint();state=fitShot(state);state.view.mode='camera';stopPlayback();}
        if(action==='viewToCamera'){
          checkpoint();const center=orbitCenter,v=state.view,oy=rad(v.yaw),op=rad(v.pitch),target=targetOf(state);
          state.camera.x=clamp(center[0]+Math.sin(oy)*Math.cos(op)*v.distance,-12,12);state.camera.y=clamp(center[1]+Math.sin(op)*v.distance,.2,6);state.camera.z=clamp(center[2]+Math.cos(oy)*Math.cos(op)*v.distance,-12,12);
          state.camera.targetX=clamp(state.camera.targetX+center[0]-target[0],-2,2);state.camera.targetY=clamp(state.camera.targetY+center[1]-target[1],-1.5,1.5);state.camera.targetZ=clamp(state.camera.targetZ+center[2]-target[2],-2,2);state.camera.focal=clamp(18/(Math.tan(rad(42)/2)*ratioOf(state)),18,85);state.camera.roll=0;stopPlayback();status('当前导演视角已转换为拍摄机位。');
        }
        if(action==='saveCamera'){
          if(state.cameras.length>=6)return;const name=query('[data-stage-bookmark-name]').value.trim()||'机位 '+(state.cameras.length+1);
          checkpoint();state.cameras.push({name,camera:{...state.camera},shot:state.shot,aspect:state.aspect,guide:state.guide});query('[data-stage-bookmark-name]').value='';status('机位已收进左侧列表，点击可恢复。');
        }
        if(action==='addProp'){
          if(state.props.length>=8)return;checkpoint();const kind=query('[data-stage-add-prop]').value;
          state.props.push({kind,name:PROP_NAMES[kind]+' '+(state.props.length+1),x:1.5,y:0,z:.4,yaw:0,scale:1});selectedObject='prop:'+(state.props.length-1);stopPlayback();
        }
        if(action==='deleteObject'){
          checkpoint();const [kind,indexText]=selectedObject.split(':'),index=Number(indexText);
          if(kind==='prop')state.props.splice(index,1);
          else if(index)state.actors.splice(index-1,1);
          else if(state.actors.length){const promoted=state.actors.shift();state.actorName=promoted.name;state.actorColor=promoted.color;state.actor={...promoted};delete state.actor.name;delete state.actor.color;state.motion=null;}
          selectedObject='actor:0';stopPlayback();
        }
        if(action==='refreshPrompt'){promptEdited=false;status('构图说明已按当前设置更新。');}
        sync();
      });
      listen(dialog,'input',event=>{
        const input=event.target;if(saving)return;
        if(input.matches('[data-director-prompt]')){promptEdited=true;return;}
        if(input.matches('[data-stage-time]')){playing=false;timePosition=Number(input.value)/100;schedule();return;}
        if(input.matches('[data-stage-duration]')){if(input.validity.valid&&state.motion){checkpoint();state.motion.duration=input.valueAsNumber;stopPlayback();sync();}return;}
        if(input.matches('[data-stage-preset]')){if(input.value){applyStagePreset(input.value);input.value='';}return;}
        if(input.matches('[data-director-angle]')){if(input.value){checkpoint();state=setCameraAngle(state,input.value);input.value='';stopPlayback();sync();}return;}
        if(input.matches('[data-stage-name]')){
          const name=input.value.trim();if(!name)return;checkpoint();
          if(selectedObject==='actor:0')state.actorName=name;else activeObject().name=name;
          sync(input);return;
        }
        if(input.matches('[data-stage-color]')){checkpoint();if(selectedObject==='actor:0')state.actorColor=input.value;else if(selectedObject.startsWith('actor:'))activeActor().color=input.value;sync();return;}
        if(input.dataset.stageProp){
          if(!input.validity.valid)return;checkpoint();activeObject()[input.dataset.stageProp]=input.valueAsNumber;stopPlayback();sync(input);return;
        }
        const key=input.dataset.directorField;if(!key)return;
        if(input.type==='number'&&!input.validity.valid){status('请输入范围内的数值。',true);return;}
        const [section,field]=key.split('.'),value=input.type==='number'||input.type==='range'?input.valueAsNumber:input.value,next=validateState(state);
        if(field){if(section==='actor')activeActor(next)[field]=value;else next[section][field]=value;}else next[section]=value;
        try{validateState(next);}catch(error){status(error.message,true);return;}
        checkpoint();state=next;stopPlayback();
        if(key==='actor.pose'){const actor=activeActor();Object.assign(actor,applyPose(actor,actor.pose));}
        if(key==='shot')state=fitShot(state);
        status(promptEdited?'已更新预演。可按当前设置刷新说明。':'调整会同步到右侧实时镜头。');sync(input.type==='number'?input:null);
      });
      listen(query('.director254-viewport'),'pointerdown',event=>{
        if(saving||state.view.mode!=='orbit'||event.button!==0||!renderer)return;
        stopPlayback();const key=event.shiftKey?null:pickObject(event);
        if(key){selectedObject=key;const item=activeObject(),ground=renderer.groundAt(event.clientX,event.clientY,item.y);checkpoint();pointer={id:event.pointerId,key,original:{...item},ground,start:{x:item.x,z:item.z}};sync();}
        else pointer={id:event.pointerId,x:event.clientX,y:event.clientY,yaw:state.view.yaw,pitch:state.view.pitch};
        canvas.setPointerCapture(event.pointerId);event.preventDefault();
      });
      listen(canvas,'pointermove',event=>{
        if(!pointer||pointer.id!==event.pointerId||saving)return;
        if(pointer.key){const item=activeObject(),at=renderer.groundAt(event.clientX,event.clientY,item.y);if(at&&pointer.ground){item.x=clamp(pointer.start.x+at.x-pointer.ground.x,-12,12);item.z=clamp(pointer.start.z+at.z-pointer.ground.z,-12,12);sync();}}
        else{state.view.yaw=((pointer.yaw+(event.clientX-pointer.x)*.45+540)%360)-180;state.view.pitch=clamp(pointer.pitch+(event.clientY-pointer.y)*.3,-15,75);schedule();}
      });
      listen(canvas,'pointerup',()=>{pointer=null;});
      listen(canvas,'pointercancel',()=>{if(pointer?.key)Object.assign(activeObject(),pointer.original);pointer=null;sync();});
      listen(canvas,'lostpointercapture',()=>{pointer=null;});
      listen(canvas,'wheel',event=>{if(saving||state.view.mode!=='orbit')return;event.preventDefault();state.view.distance=clamp(state.view.distance+clamp(event.deltaY,-160,160)*.008,2.5,18);schedule();},{passive:false});
      listen(canvas,'keydown',event=>{if(saving||state.view.mode!=='orbit')return;const key=event.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(key))return;event.preventDefault();if(key==='ArrowLeft'||key==='ArrowRight')state.view.yaw=clamp(state.view.yaw+(key==='ArrowLeft'?-5:5),-180,180);if(key==='ArrowUp'||key==='ArrowDown')state.view.pitch=clamp(state.view.pitch+(key==='ArrowUp'?-5:5),-15,75);if(key==='+'||key==='='||key==='-')state.view.distance=clamp(state.view.distance+(key==='-'?.4:-.4),2.5,18);schedule();});
      listen(document,'visibilitychange',()=>{if(document.hidden){playing=false;cancelFrame();}else schedule();});
      listen(root,'message',event=>{
        if(event.origin!==location.origin||event.source!==root.parent||event.data?.type!=='nanbudo:module-active251')return;
        moduleActive=!!event.data.active;
        if(!moduleActive){playing=false;cancelFrame();query('[data-director-action="play"]').textContent='▶ 播放';}
        else schedule();
      });
      listen(root,'resize',fitViewport);listen(root,'pagehide',close);
      if(root.ResizeObserver){observer=new ResizeObserver(()=>{if(thisEpoch===epoch)fitViewport();});observer.observe(query('.director254-preview-slot'));}
      sync();if(retryDraft){promptEdited=retryDraft.edited;query('[data-director-prompt]').value=retryDraft.prompt;}else if(!savedError&&selected?.director254&&typeof selected.text==='string'&&selected.text.trim()){query('[data-director-prompt]').value=selected.text.slice(0,2400);promptEdited=true;}
      startRenderer();if(savedError){status(savedError+' 当前显示默认预演，请调整后重新加入画布。',true);notify('原场景预演数据无效，原场景未修改。',true);}else if(selected?.director254)status('已恢复片场人物、道具与保存机位。');
    }
    async function insert(){
      if(!live()||saving||!renderer||!validFrame)return;
      const invalid=Array.from(dialog.querySelectorAll('input:invalid')).find(input=>!input.disabled&&!input.matches('[data-stage-bookmark-name]'));
      if(invalid){
        if(focused){focused=false;sync(invalid);}
        const group=invalid.closest('details');if(group)group.open=true;
        invalid.reportValidity();status('请先修正范围外的数值。',true);return;
      }
      if(!ownerMatches()||b.state().locked){status('画布已切换或任务正在运行，请关闭导演台后重开。',true);return;}
      const currentEpoch=epoch,snapshot=validateState(state),prompt=query('[data-director-prompt]').value.trim().slice(0,2400)||describe(snapshot);saving=true;playing=false;cancelFrame();for(const input of dialog.querySelectorAll('input,select,textarea,button'))input.disabled=true;status('正在保存本地镜头参考，请等待完成…');
      try{
        renderer.draw(snapshot,'camera',true);const source=canvas,blob=await new Promise((resolve,reject)=>{source.toBlob(value=>value?resolve(value):reject(Error('截图未完成，请重新开启导演台后再试。')),'image/png');});
        if(currentEpoch!==epoch||!live())return;if(!ownerMatches()||b.state().locked)throw Error('画布已切换或任务正在运行，本次参考未加入画布。');
        const file=new File([blob],'director-'+Date.now()+'.png',{type:'image/png'});await b.insert(file,prompt,snapshot);
        if(currentEpoch===epoch&&live()){notify('片场镜头参考已加入画布。');close();}
      }catch(error){if(currentEpoch===epoch&&live()){status(error.message||'参考图未加入，请重试。',true);notify(error.message||'参考图未加入，请重试。',true);}}
      finally{saving=false;if(currentEpoch===epoch&&live()){for(const input of dialog.querySelectorAll('input,select,textarea,button'))input.disabled=false;sync();}}
    }
    function destroy(){close();destroyed=true;state=initialState();owner=null;}
    return {open:()=>open(),close,destroy};
  }
  root.CanvasDirector254=Object.freeze({create,validateState,initialState,fitShot});
})(window);

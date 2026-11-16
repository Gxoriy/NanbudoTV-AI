/* Local-only video comparison. No model requests, billing or record writes. */
'use strict';
window.BreakdownCompare = class {
  constructor(source, result, {start=0, duration=0, notify=()=>{}}={}) {
    this.source=source; this.result=result; this.start=Math.max(0,Number(start)||0);
    this.duration=Math.max(0,Number(duration)||0); this.notify=notify;
    this.sync=true; this.closed=false; this.master=result; this.listeners=[];
    this.playing=false; this.wanted=false; this.buffering=false; this.operation=0;
    this.ignorePause=new WeakSet(); this.originalMute=[source.muted,result.muted];
    for(const video of [source,result]) {
      this.listen(video,'play',()=>{if(this.sync && !this.playing && !video.paused)this.playFrom(video);});
      this.listen(video,'pause',()=>{
        if(this.ignorePause.has(video)){this.ignorePause.delete(video);return;}
        if(this.sync)this.pause();
      });
      this.listen(video,'seeking',()=>{if(this.sync)this.seekFrom(video);});
      this.listen(video,'ratechange',()=>{
        if(!this.sync)return;
        this.master=video;
        const other=this.other(video);
        if(other.playbackRate!==video.playbackRate)other.playbackRate=video.playbackRate;
      });
      this.listen(video,'waiting',()=>{
        if(!this.sync || !this.wanted)return;
        this.buffering=true;this.playing=false;this.stopVideos();
        this.notify('正在缓冲，两侧暂停等待同一进度…');
      });
      this.listen(video,'canplay',()=>{
        if(this.sync && this.buffering && this.wanted && source.readyState>=3 && result.readyState>=3) {
          this.buffering=false;this.playFrom(this.master);
        }
      });
      this.listen(video,'ended',()=>{if(this.sync)this.pause();});
      this.listen(video,'error',()=>{this.pause();this.notify('视频读取失败，请重新打开结果或检查本机文件。');});
      this.listen(video,'loadedmetadata',()=>{if(this.sync)this.seekFrom(result);});
    }
    this.timer=setInterval(()=>this.tick(),80);
    this.setSync(true);
  }
  listen(video,event,callback) {
    const handler=()=>{if(!this.closed)callback();};
    video.addEventListener(event,handler);this.listeners.push([video,event,handler]);
  }
  other(video){return video===this.source?this.result:this.source;}
  length() {
    const available=[this.duration||Infinity,
      Number.isFinite(this.source.duration)?Math.max(0,this.source.duration-this.start):Infinity,
      Number.isFinite(this.result.duration)?this.result.duration:Infinity];
    return Math.min(...available);
  }
  time(video) {return Math.max(0,Math.min(this.length(),video.currentTime-(video===this.source?this.start:0)));}
  seek(video,time) {
    const target=time+(video===this.source?this.start:0);
    if(video.readyState && Math.abs(video.currentTime-target)>.035)video.currentTime=target;
  }
  seekFrom(video) {
    const time=this.time(video);
    this.seek(this.source,time);this.seek(this.result,time);this.master=video;
  }
  stopVideos() {
    for(const video of [this.source,this.result])if(!video.paused){this.ignorePause.add(video);video.pause();}
  }
  pause() {
    this.operation++;this.wanted=false;this.playing=false;this.buffering=false;this.stopVideos();
  }
  async playFrom(video) {
    if(this.closed || !this.sync)return;
    this.wanted=true;this.master=video;
    let time=this.time(video);
    if(time>=this.length()-.04)time=0;
    this.seek(this.source,time);this.seek(this.result,time);
    this.source.playbackRate=video.playbackRate;this.result.playbackRate=video.playbackRate;
    const operation=++this.operation;this.playing=true;
    try {
      await Promise.all([this.source.play(),this.result.play()]);
      if(this.closed || operation!==this.operation)return;
      this.notify('同步播放中 · 左原片 / 右生成结果');
    } catch(error) {
      if(error.name==='AbortError' && this.wanted && this.buffering)return;
      if(!this.closed && operation===this.operation){this.pause();this.notify('播放暂未开始，请等待加载后再次点击播放。');}
    }
  }
  tick() {
    if(this.closed || !this.sync || !this.playing || this.buffering)return;
    const time=this.time(this.master), end=this.length();
    if(end<=0 || time>=end-.04){this.seek(this.source,end);this.seek(this.result,end);this.pause();this.notify('对照片段已结束，两侧已暂停；可重新播放。');return;}
    if(!this.source.seeking && !this.result.seeking && Math.abs(this.time(this.source)-this.time(this.result))>.14)
      this.seek(this.other(this.master),time);
  }
  setSync(enabled) {
    this.pause();this.sync=!!enabled;
    if(this.sync){this.source.muted=true;this.result.muted=false;this.seekFrom(this.result);}
    else {[this.source.muted,this.result.muted]=this.originalMute;}
  }
  restart() {
    if(this.sync){this.pause();this.seek(this.source,0);this.seek(this.result,0);this.playFrom(this.result);}
    else {this.result.pause();this.seek(this.result,0);this.result.play().catch(()=>this.notify('请等待结果加载后再次点击播放。'));}
  }
  async toggle() {
    if(this.closed)return;
    if(this.sync){
      if(this.wanted || !this.source.paused || !this.result.paused)this.pause();
      else await this.playFrom(this.result);
    } else if(!this.result.paused)this.result.pause();
    else try{await this.result.play();}catch{this.notify('请等待结果加载后再次点击播放。');}
  }
  destroy() {
    this.pause();this.closed=true;clearInterval(this.timer);
    for(const [video,event,handler] of this.listeners)video.removeEventListener(event,handler);
    [this.source.muted,this.result.muted]=this.originalMute;
  }
};

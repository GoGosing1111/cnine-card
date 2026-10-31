const ROOT='/assets/raids/blackwing-20261024/';let loaded,releasing,users=0;
export async function preloadBlackwing(){
 if(releasing)await releasing;
 users++;
 loaded||=(async()=>{
  const response=await fetch(ROOT+'manifest.json?v=20261024-test1');if(!response.ok)throw Error('모르드레인 전투 리소스를 불러오지 못했습니다.');
  const manifest=await response.json(),rt=globalThis.ProjectVPixiBattle.fxRuntime,frames={};
  const results=await Promise.allSettled(Object.entries(manifest.atlases).map(async([key,spec])=>{const texture=await rt.Assets.load(ROOT+spec.url+'?v=20261024-test1');frames[key]=spec.frames.map(({rect:f})=>new rt.Texture({source:texture.source,frame:new rt.Rectangle(f.x,f.y,f.width,f.height)}));}));
  const failed=results.find(r=>r.status==='rejected');if(failed){await disposeBlackwing({manifest,frames});throw failed.reason;}
  return {manifest,frames};
 })();
 try{const data=await loaded;let released=false;return {...data,release(){if(released)return releasing||Promise.resolve();released=true;return releaseBlackwing();}};}catch(e){users--;if(!users)loaded=null;throw e;}
}
async function disposeBlackwing(data){
 const assets=globalThis.ProjectVPixiBattle.fxRuntime.Assets;
 for(const frames of Object.values(data.frames))for(const texture of frames)texture.destroy(false);
 const urls=Object.values(data.manifest.atlases).map(spec=>ROOT+spec.url+'?v=20261024-test1');
 await Promise.allSettled(urls.filter(url=>!assets.cache||assets.cache.has(url)).map(url=>assets.unload(url)));
}
function releaseBlackwing(){
 if(--users>0)return Promise.resolve();
 const retired=loaded;loaded=null;
 releasing=(async()=>{const data=await retired;if(data)await disposeBlackwing(data);})().finally(()=>{releasing=null;});
 return releasing;
}
export function playBlackwingCue(engine,cue,assets){
 const actor=engine.boss||engine.enemies.find(a=>a.battleActive!==false&&a.root.visible);if(!actor?.fullBodySprite)return {playback:Promise.resolve(),dispose(){}};
 const rt=globalThis.ProjectVPixiBattle.fxRuntime,original=actor.fullBodySprite,body=new rt.Sprite(),layer=new rt.Container({label:'BlackwingAuthoredFX'}),fx=new rt.Sprite();layer.eventMode='none';engine.effectLayer.addChild(layer);layer.addChild(fx);actor.view.addChild(body);body.zIndex=11;body.anchor.set(.5,.97);fx.anchor.set(.5);
 const visible=original.visible,clock={t:0},duration=2.4,sequence=cue.key==='CLEAR'?assets.manifest.bodySequence.defeat:cue.effect==='slash'?assets.manifest.bodySequence.attack:assets.manifest.bodySequence.cast,key=cue.effect==='fire'?'fire':cue.effect==='slash'?'slash':'oath';let disposed=false,timeline,registration;
 const restore=()=>{if(!original.destroyed)original.visible=visible;if(!body.destroyed)body.visible=false;if(!fx.destroyed)fx.visible=false;};
 const dispose=()=>{if(disposed)return;disposed=true;timeline?.kill();registration?.settle(false);restore();body.destroy();layer.destroy({children:true});};
 const playback=engine.timeline(t=>{timeline=t;registration=[...engine.simpleTimelines].find(e=>e.instance===t);t.to(clock,{t:duration,duration,ease:'none',onUpdate(){if(disposed||actor.root.destroyed)return;const p=clock.t/duration,index=Math.min(sequence.length-1,Math.floor(p*sequence.length));body.texture=assets.frames.body[sequence[index]];body.position.copyFrom(original.position);const h=actor.fullBodyHeight||original.height||300;body.scale.set(Math.abs(original.scale.x)*original.texture.height/body.texture.height);body.visible=true;original.visible=false;
 const target=key==='oath'?actor:engine.allies.find(a=>a.hp>0&&a.battleActive!==false)||actor,point=layer.toLocal(target.root.toGlobal({x:0,y:-(target.fullBodyHeight||h)*.48}));fx.texture=assets.frames[key][Math.min(11,Math.floor(p*12))];fx.position.copyFrom(point);const width=Math.min(engine.scene.width*.5,450);fx.scale.set((key==='fire'?-1:1)*width/fx.texture.width,width/fx.texture.width);fx.alpha=(engine.reducedMotion?.45:.90)*Math.min(1,p*6,(1-p)*5);fx.visible=p>.1&&p<.98;
 }},0);if(!engine.reducedMotion)engine.camera.addShake(t,{intensity:4,duration:.22,rotation:.001,at:1.3});},restore,1);
 // The installed V3 audio mixer owns recorded effects and the user's mute setting.
 engine.audio?.scheduleImpact?.('ATTACK',{impactAt:1.3,playbackSpeed:1,boss:true});
 return {playback:playback.finally(dispose),dispose,diagnostics:()=>({effect:key,progress:clock.t/duration,bodyVisible:!disposed&&body.visible,fxVisible:!disposed&&fx.visible,bodyFacing:disposed?null:Math.sign(body.worldTransform.a),idleFacing:Math.sign(original.worldTransform.a),hudFacing:Math.sign(actor.hud.worldTransform.a),disposed})};
}

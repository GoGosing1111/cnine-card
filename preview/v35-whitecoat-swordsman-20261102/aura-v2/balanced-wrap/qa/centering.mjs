import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {browser,open} from '../../../swordplay-v5/qa/probe.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),b=await browser(),checks=[];
const check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
try{
 const p=await open(b);await p.evaluate(()=>v35Review.pause(true));
 const frames=await p.evaluate(()=>{
  const a=v35Review.spine.aura,renderer=v35Review.engine.app.renderer,out=[];
  for(let i=0;i<16;i++){
   a.render(i*.15);
   const root=a.root,position=root.position.clone(),scale=root.scale.clone(),rotation=root.rotation;
   root.position.set(0,0);root.scale.set(1);root.rotation=0;
   const canvas=renderer.extract.canvas({target:root,frame:new PIXI.Rectangle(-170,-225,340,420),resolution:1});
   root.position.copyFrom(position);root.scale.copyFrom(scale);root.rotation=rotation;
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   let l=0,r=0,alphaL=0,alphaR=0,moment=0,total=0,black=0,covered=0,maxMirrorDelta=0;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const k=(y*canvas.width+x)*4,m=(y*canvas.width+(canvas.width-1-x))*4;
    const alpha=pixels[k+3]/255,energy=(pixels[k]*.2126+pixels[k+1]*.7152+pixels[k+2]*.0722)*alpha;
    if(x<canvas.width/2){l+=energy;alphaL+=alpha}else{r+=energy;alphaR+=alpha}
    moment+=(x+.5-canvas.width/2)*energy;total+=energy;
    if(pixels[k+3]>64){covered++;if(pixels[k]<50&&pixels[k+1]<50&&pixels[k+2]<50)black++}
    for(let c=0;c<4;c++)maxMirrorDelta=Math.max(maxMirrorDelta,Math.abs(pixels[k+c]-pixels[m+c]));
   }
   out.push({time:i*.15,lumaDifference:Math.abs(l-r)/Math.max(l+r,1),alphaDifference:Math.abs(alphaL-alphaR)/Math.max(alphaL+alphaR,1),centroidPixels:moment/Math.max(total,1),maxMirrorDelta,blackPixels:black,coveredPixels:covered});
  }
  a.render(1.5);v35Review.engine.app.render();return out;
 });
 check('All cels and crossfades balance visible light around the body axis',frames.every(f=>f.lumaDifference<.002&&f.alphaDifference<.002&&Math.abs(f.centroidPixels)<.15),frames);
 check('Normal final compositing retains opaque dark ink',frames.every(f=>f.blackPixels>300),frames.map(f=>({time:f.time,black:f.blackPixels})));
 const scene=await p.evaluate(()=>{const s=v35Review.spine;return {body:s.rig.getBounds(),aura:s.aura.audit(),rearSprites:s.aura.root.children.length,frontSprites:s.aura.front.children.length}});
 check('Rear currents stay behind body and front ribbons remain in front',scene.aura.behindBody&&scene.aura.inFrontOfBody&&scene.rearSprites===4&&scene.frontSprites===2,scene);
 const r=scene.body,box=await p.locator('#pvPixiBattle canvas').boundingBox();
 await p.screenshot({path:dir+'centred-closeup.png',clip:{x:r.minX-100,y:r.minY+box.y-85,width:r.maxX-r.minX+200,height:r.maxY-r.minY+160}});
 await p.locator('#pvPixiBattle canvas').screenshot({path:dir+'centred-stage.png'});
}catch(e){check('Execution',false,e.stack)}finally{
 await b.close();const failed=checks.filter(c=>!c.pass);await fs.writeFile(dir+'centering.json',JSON.stringify({passed:!failed.length,checks},null,2)+'\n');console.log({checks:checks.length,failed});if(failed.length)process.exitCode=1;
}

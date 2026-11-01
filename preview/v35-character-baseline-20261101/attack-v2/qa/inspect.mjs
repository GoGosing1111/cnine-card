import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import sharp from 'sharp';
const dir=fileURLToPath(new URL('../',import.meta.url)),file=p=>path.join(dir,p),native=JSON.parse(await fs.readFile(file('qa/native.json'),'utf8')),json=JSON.parse(await fs.readFile(file(native.runtimeDir+'/swordsman.json'),'utf8'));
const visible={};
for(const [name,byName]of Object.entries(json.skins[0].attachments)){
 const a=byName[name],{data,info}=await sharp(file(name==='body'?'images/body-clean-mesh.png':'../attack-v1/images/'+name+'-mesh.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});visible[name]=[];
 for(let i=0;i<a.triangles.length;i+=3){
  const ps=a.triangles.slice(i,i+3).map(k=>[a.uvs[k*2]*info.width,a.uvs[k*2+1]*info.height]),cross=(a,b,x,y)=>(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);let yes=false;
  const minX=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[0])))),maxX=Math.min(info.width-1,Math.ceil(Math.max(...ps.map(p=>p[0])))),minY=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[1])))),maxY=Math.min(info.height-1,Math.ceil(Math.max(...ps.map(p=>p[1]))));
  for(let y=minY;y<=maxY&&!yes;y++)for(let x=minX;x<=maxX;x++){if(data[(y*info.width+x)*4+3]<=32)continue;const s=ps.map((p,k)=>cross(p,ps[(k+1)%3],x+.5,y+.5));if(s.every(v=>v>=-1e-5)||s.every(v=>v<=1e-5)){yes=true;break;}}
  visible[name].push(yes);
 }
}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1120},deviceScaleFactor:1});await page.goto('http://127.0.0.1:18765/');await page.waitForFunction(()=>window.rigReview?.ready);
 const geometry=await page.evaluate(visible=>{
  rigReview.select('attack_basic',false);rigReview.seek(0);
  const actor=rigReview.actor,vertices=()=>actor.skeleton.slots.map(slot=>{const a=slot.appliedPose.attachment,v=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(actor.skeleton,slot,0,a.worldVerticesLength,v,0,2);return {name:slot.data.name,v:[...v],triangles:a.triangles};}),first=vertices(),start=rigReview.sample(),weaponLength=Math.hypot(start.grip.x-start.tip.x,start.grip.y-start.tip.y);
  let visibleFlips=0,nonFinite=0,weaponLengthError=0,backPlantDrift=0,frontPlantDrift=0,endpointError=0;const gaps={},examples=[];
  for(let i=0;i<=224;i++){
   const time=1.12*i/224;rigReview.seek(time);const now=vertices(),p=rigReview.sample();
   weaponLengthError=Math.max(weaponLengthError,Math.abs(Math.hypot(p.grip.x-p.tip.x,p.grip.y-p.tip.y)-weaponLength));backPlantDrift=Math.max(backPlantDrift,Math.hypot(p.soleBack.x-start.soleBack.x,p.soleBack.y-start.soleBack.y));
   if(time<=.12||(time>=.31&&time<=.70)||time>=.96){const dx=time>=.31&&time<=.70?120:0;frontPlantDrift=Math.max(frontPlantDrift,Math.hypot(p.soleFront.x-start.soleFront.x-dx,p.soleFront.y-start.soleFront.y));}
   for(const [lower,target]of [['arm_near_lower','wrist_near'],['arm_far_lower','wrist_far'],['leg_back_lower','foot_back'],['leg_front_lower','foot_front']]){const b=actor.skeleton.findBone(lower),pose=b.appliedPose,w=actor.skeleton.findBone(target).appliedPose;gaps[lower]=Math.max(gaps[lower]||0,Math.hypot(pose.worldX+pose.a*b.data.length-w.worldX,pose.worldY+pose.c*b.data.length-w.worldY));}
   for(let s=0;s<now.length;s++){const a=first[s],b=now[s];if(!b.v.every(Number.isFinite))nonFinite++;if(i===224)for(let k=0;k<a.v.length;k++)endpointError=Math.max(endpointError,Math.abs(a.v[k]-b.v[k]));const area=(v,aa,bb,cc)=>(v[bb*2]-v[aa*2])*(v[cc*2+1]-v[aa*2+1])-(v[bb*2+1]-v[aa*2+1])*(v[cc*2]-v[aa*2]);for(let t=0;t<a.triangles.length;t+=3){const ids=a.triangles.slice(t,t+3),a0=area(a.v,...ids),a1=area(b.v,...ids);if(Math.abs(a0)>1e-3&&a0*a1<=0&&visible[b.name][t/3]){visibleFlips++;if(examples.length<16)examples.push({time,slot:b.name,triangle:t/3,a0,a1});}}}
  }
  return {samples:225,visibleFlips,examples,nonFinite,weaponLengthError,backPlantDrift,frontPlantDrift,endpointError,gaps};
 },visible);
 await fs.writeFile(file('qa/geometry.json'),JSON.stringify(geometry,null,2));console.log(JSON.stringify(geometry));
 const poses=[],composite=[];let i=0;
 for(const time of [0,.12,.21,.27,.31,.34,.38,.47,.62,.80,.96,1.12]){
  const pose=await page.evaluate(t=>{rigReview.select('attack_basic',false);rigReview.setBackground('light');return rigReview.seek(t);},time);await page.waitForTimeout(50);
  const name='pose-'+time.toFixed(3).replace('.','-')+'.png',bytes=await page.locator('#stage').screenshot({path:file('qa/'+name)});poses.push({file:name,...pose});
  const cell=await sharp(bytes).resize({width:420,height:326,fit:'contain',background:'#e2e5e8'}).png().toBuffer();composite.push({input:cell,left:(i%4)*420,top:Math.floor(i/4)*352+26});
  const label=Buffer.from('<svg width="420" height="26"><text x="12" y="20" font-family="sans-serif" font-size="17" fill="#15202c">'+time.toFixed(2)+' s</text></svg>');composite.push({input:label,left:(i%4)*420,top:Math.floor(i/4)*352});i++;
 }
 await sharp({create:{width:1680,height:1056,channels:4,background:'#e2e5e8'}}).composite(composite).png().toFile(file('qa/pose-sheet.png'));
 await fs.writeFile(file('qa/poses.json'),JSON.stringify(poses,null,2));console.log(JSON.stringify({poses:poses.length,errors:await page.evaluate(()=>rigReview.errors)}));
}finally{await browser.close();}

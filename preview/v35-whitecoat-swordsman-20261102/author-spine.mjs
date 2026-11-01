import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url));
// Coordinates measured on the unscaled artwork, Y down. Whole-pose uniform
// registration only: no limb extraction, nonuniform stretching or alpha masking.
const poses={
 guard:{file:'art/guard-v1.png',scale:.50,pivot:[740,1082],head:[835,129],hand:[602,551],tip:[1413,900],feet:[[310,1082],[1180,1078]]},
 windup:{file:'cropped/windup.png',scale:.54,pivot:[625,1082],head:[750,220],hand:[400,178],tip:[880,16],feet:[[157,1082],[1110,1078]]},
 contact:{file:'cropped/contact.png',scale:1.06,pivot:[340,580],head:[368,139],hand:[430,204],tip:[634,191],feet:[[125,567],[555,580]]},
 follow:{file:'cropped/follow.png',scale:.53,pivot:[675,1000],head:[753,115],hand:[936,527],tip:[1515,835],feet:[[245,1000],[1115,993]]},
 iai_ready:{file:'cropped/iai_ready.png',scale:1.05,pivot:[320,574],head:[450,169],hand:[333,293],tip:[353,301],feet:[[180,574],[455,538]],sheathed:true},
 iai_cut:{file:'cropped/iai_cut.png',scale:1.04,pivot:[312,557],head:[470,188],hand:[290,303],tip:[609,428],feet:[[49,557],[555,557]]},
 rise:{file:'cropped/rise.png',scale:1.04,pivot:[389,610],head:[345,129],hand:[510,87],tip:[610,10],feet:[[180,610],[562,591]],foreshortenedBlade:true},
 step:{file:'cropped/step.png',scale:.94,pivot:[380,593],head:[516,105],hand:[325,297],tip:[660,384],feet:[[96,486],[576,591]],airborneRearFoot:true},
 hit:{file:'cropped/hit.png',scale:.92,pivot:[352,613],head:[223,53],hand:[273,244],tip:[483,65],feet:[[188,613],[512,563]]},
 defeat:{file:'cropped/defeat.png',scale:1.02,pivot:[400,498],head:[487,184],hand:[343,421],tip:[610,516],feet:[[275,493],[486,490]],kneeling:true},
};
await fs.mkdir(dir+'images',{recursive:true});
const registrations={};const attachments={};
for(const [name,p] of Object.entries(poses)){
 const m=await sharp(dir+p.file).metadata(),w=Math.round(m.width*p.scale),h=Math.round(m.height*p.scale);
 // Resize with proportional height chosen by Sharp; use the true resulting
 // dimensions in native Spine to avoid import normalization surprises.
 await sharp(dir+p.file).resize({width:w}).png().toFile(dir+'images/'+name+'.png');const n=await sharp(dir+'images/'+name+'.png').metadata();
 const s=w/m.width,point=([x,y])=>[+(s*(x-p.pivot[0])).toFixed(4),+(s*(p.pivot[1]-y)).toFixed(4)];
 const entry={...p,scale:s,size:[n.width,n.height],center:[+(n.width/2-p.pivot[0]*s).toFixed(4),+(p.pivot[1]*s-n.height/2).toFixed(4)],sockets:{head:point(p.head),weapon_grip:point(p.hand),blade_tip:point(p.tip),foot_rear:point(p.feet[0]),foot_front:point(p.feet[1])}};
 registrations[name]=entry;attachments[name]={type:'region',path:name,x:entry.center[0],y:entry.center[1],width:n.width,height:n.height};
}
const actions={
 setup:{duration:.1,keys:[[0,'guard']]},
 idle:{duration:3,loop:true,keys:[[0,'guard']]},
 dash:{duration:.3,keys:[[0,'guard'],[.04,'step'],[.24,'guard']]},
 attack_basic:{duration:1.18,contact:.32,keys:[[0,'guard'],[.035,'step'],[.17,'windup'],[.32,'contact'],[.40,'follow'],[.63,'guard'],[.79,'step'],[1.04,'guard']]},
 skill_iai:{duration:1.55,contact:.30,secondaryVisual:.54,keys:[[0,'guard'],[.08,'iai_ready'],[.30,'iai_cut'],[.51,'rise'],[.70,'follow'],[.94,'guard'],[1.16,'step'],[1.41,'guard']]},
 hit:{duration:.38,keys:[[0,'hit'],[.23,'guard']]},
 death:{duration:.65,keys:[[0,'hit'],[.13,'defeat']]},
};
const bones=[{name:'root'},{name:'art',parent:'root'},...Object.keys(registrations.guard.sockets).map(name=>({name,parent:'root',x:registrations.guard.sockets[name][0],y:registrations.guard.sockets[name][1]}))];
const animations={};
for(const [name,a] of Object.entries(actions)){
 const keys=[...a.keys,[a.duration,a.keys.at(-1)[1]]];
 const anim={slots:{body:{attachment:keys.map(([time,name])=>({time,name}))}},bones:{}};
 for(const socket of Object.keys(registrations.guard.sockets)){
  const [bx,by]=registrations.guard.sockets[socket];
  anim.bones[socket]={translate:keys.map(([time,pose])=>({time,x:registrations[pose].sockets[socket][0]-bx,y:registrations[pose].sockets[socket][1]-by,curve:'stepped'}))};
 }
 if(a.contact!==undefined)anim.events=[{time:a.contact,name:'visual_contact'}];
 if(a.secondaryVisual!==undefined)anim.events.push({time:a.secondaryVisual,name:'visual_finish'});
 animations[name]=anim;
}
const input={skeleton:{spine:'4.3.26',images:'images/',audio:'',fps:60},bones,slots:[{name:'body',bone:'art',attachment:'guard'}],skins:[{name:'default',attachments:{body:attachments}}],events:{visual_contact:{},visual_finish:{}},animations};
await fs.writeFile(dir+'whitecoat.input.json',JSON.stringify(input,null,2));
await fs.writeFile(dir+'pose-registration.json',JSON.stringify({coordinateSystem:'source pixels Y-down → Spine Y-up, uniform scale, floor pivot is projected two-foot baseline',bodyPixels:530,poses:registrations},null,2));
await fs.writeFile(dir+'actions.json',JSON.stringify({mode:'authored whole-pose replacement attachments; no limb mesh/IK claimed',damageAuthority:'existing V3 one impact callback only; Spine events are visual markers',actions},null,2));
const layers=[];let labels='';const ids=['guard','windup','contact','follow','iai_ready','iai_cut','rise','defeat'];
for(let i=0;i<ids.length;i++){const id=ids[i],p=registrations[id],cellX=i%4*480,cellY=Math.floor(i/4)*400,s=.55;const bytes=await sharp(dir+'images/'+id+'.png').resize({width:Math.round(p.size[0]*s)}).png().toBuffer();const m=await sharp(bytes).metadata();const left=Math.round(cellX+220+(p.center[0]-p.size[0]/2)*s),top=Math.round(cellY+355-(p.center[1]+p.size[1]/2)*s);layers.push({input:bytes,left,top});labels+=`<text x="${cellX+15}" y="${cellY+25}" fill="#dae5ef" font-family="Arial" font-size="17">${id}</text><path d="M${cellX},${cellY+355}h480" stroke="#839ab2" opacity=".3"/>`;}
layers.push({input:Buffer.from(`<svg width="1920" height="800">${labels}</svg>`),left:0,top:0});
await sharp({create:{width:1920,height:800,channels:4,background:'#263445'}}).composite(layers).png().toFile(dir+'qa/pose-lineup.png');
console.log({poses:Object.keys(poses),bones:bones.length,animations:Object.keys(actions),inputSha256:createHash('sha256').update(JSON.stringify(input)).digest('hex')});

import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),hero=fileURLToPath(new URL('../',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(await fs.readFile(hero+'whitecoat-c3ad326c9e61.spine'))!=='a2e45365a8f830266d3b91c1e9c76dc35f0bf93409b69027300954977f7bbf57')throw Error('Latest native was edited; preserve and derive from that edit instead.');
const input=JSON.parse(await fs.readFile(hero+'whitecoat.input.json','utf8')),registration=JSON.parse(await fs.readFile(hero+'pose-registration.json','utf8')),poses=JSON.parse(await fs.readFile(dir+'pose-inputs.json','utf8'));
const audit=JSON.parse(await fs.readFile(dir+'qa/crop-audit.json','utf8'));if(audit.some(p=>p.boundary))throw Error('Clipped artwork');
for(const[name,p]of Object.entries(poses)){
 const id='v3_'+name,m=await sharp(dir+p.file).metadata(),width=Math.round(m.width*p.scale);
 await sharp(dir+p.file).resize({width}).png().toFile(hero+'images/'+id+'.png');const n=await sharp(hero+'images/'+id+'.png').metadata(),s=width/m.width;
 const point=([x,y])=>[+(s*(x-p.pivot[0])).toFixed(4),+(s*(p.pivot[1]-y)).toFixed(4)];
 const r={...p,file:'action-v3/'+p.file,scale:s,size:[n.width,n.height],center:[+(n.width/2-p.pivot[0]*s).toFixed(4),+(p.pivot[1]*s-n.height/2).toFixed(4)],sockets:{head:point(p.head),weapon_grip:point(p.hand),blade_tip:point(p.tip),foot_rear:point(p.feet[0]),foot_front:point(p.feet[1])}};
 registration.poses[id]=r;input.skins[0].attachments.body[id]={type:'region',path:id,x:r.center[0],y:r.center[1],width:n.width,height:n.height};
}
const duration=2.12,keys=[[0,'guard'],[.08,'iai_ready'],[.30,'iai_cut'],[.40,'follow'],[.48,'v3_pivot'],[.64,'v3_turn'],[.75,'v3_compress'],[.84,'v3_takeoff'],[.98,'v3_apex'],[1.10,'v3_aircut'],[1.22,'v3_slam'],[1.39,'v3_recover'],[1.57,'guard'],[1.72,'step'],[1.97,'guard'],[duration,'guard']];
const flight=[{time:0,x:0,y:0},{time:.84,x:0,y:0}];
for(let i=1;i<=19;i++){const u=i/19;flight.push({time:+(.84+u*.38).toFixed(6),x:0,y:+(4*170*u*(1-u)).toFixed(4)});}
flight.push({time:duration,x:0,y:0});
const anim={slots:{body:{attachment:keys.map(([time,name])=>({time,name}))}},bones:{root:{translate:flight}},events:[{time:.30,name:'visual_contact'},{time:.64,name:'visual_contact'},{time:1.22,name:'visual_finish'}]};
for(const socket of Object.keys(registration.poses.guard.sockets)){
 const[bX,bY]=registration.poses.guard.sockets[socket];anim.bones[socket]={translate:keys.map(([time,id])=>({time,x:registration.poses[id].sockets[socket][0]-bX,y:registration.poses[id].sockets[socket][1]-bY,curve:'stepped'}))};
}
input.animations.skill_tempest=anim;
const actions={id:'whitecoat-tempest-v3',duration,damageTime:1.22,keys,flight,visualBeats:[{time:.30,hold:.035,id:'draw'},{time:.64,hold:.05,id:'turn'},{time:1.22,hold:.085,id:'slam'}],returnTime:1.72,returnDuration:.25,damageAuthority:'One existing server damage callback at final impact; three visual beats.'};
await fs.writeFile(hero+'whitecoat-action-v3.input.json',JSON.stringify(input,null,2));await fs.writeFile(dir+'pose-registration.json',JSON.stringify(registration,null,2));await fs.writeFile(dir+'action.json',JSON.stringify(actions,null,2));
const panels=[],ids=Object.keys(poses),cw=520,ch=440;
for(const[i,name]of ids.entries()){
 const r=registration.poses['v3_'+name],s=.48,png=await sharp(hero+'images/v3_'+name+'.png').resize({width:Math.round(r.size[0]*s)}).png().toBuffer();
 panels.push({input:png,left:Math.round(i%4*cw+250+(r.center[0]-r.size[0]/2)*s),top:Math.round(Math.floor(i/4)*ch+400-(r.center[1]+r.size[1]/2)*s)});
}
const labels=ids.map((name,i)=>`<text x="${i%4*cw+12}" y="${Math.floor(i/4)*ch+25}" fill="#e4edf5" font-family="Arial" font-size="18">${name}</text><path d="M${i%4*cw},${Math.floor(i/4)*ch+400}h${cw}" stroke="#abc" opacity=".2"/>`).join('');
panels.push({input:Buffer.from(`<svg width="2080" height="880">${labels}</svg>`),left:0,top:0});
await sharp({create:{width:2080,height:880,channels:4,background:'#273846'}}).composite(panels).png().toFile(dir+'qa/pose-lineup.png');
console.log({newPoses:ids.length,totalPoses:Object.keys(registration.poses).length,nativeAnimation:'skill_tempest',duration,visualBeats:actions.visualBeats,damageTime:actions.damageTime});

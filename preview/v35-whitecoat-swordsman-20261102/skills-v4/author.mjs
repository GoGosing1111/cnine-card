import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),hero=fileURLToPath(new URL('../',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(sha(await fs.readFile(hero+'whitecoat-action-v3-93718185df11.spine'))!=='6060250d7e614e59ed5b09044f93ad65beca438eeb878ee44f25674cf5f24901')throw Error('Preserve later native edits');
const input=JSON.parse(await fs.readFile(hero+'whitecoat-action-v3.input.json','utf8')),reg=JSON.parse(await fs.readFile(hero+'action-v3/pose-registration.json','utf8'));
const poses={
 rift_ready:{scale:1.5,pivot:[400,424],head:[472,153],hand:[365,270],tip:[417,281],feet:[[229,420],[554,421]]},
 rift_draw:{scale:1.5,pivot:[380,421],head:[452,163],hand:[390,253],tip:[645,235],feet:[[160,423],[598,420]]},
 rift_drive:{scale:1.5,pivot:[375,398],head:[455,154],hand:[566,185],tip:[777,173],feet:[[134,395],[586,395]]},
 rift_brake:{scale:1.5,pivot:[412,400],head:[410,111],hand:[296,257],tip:[110,371],feet:[[226,405],[602,396]]},
 echo_ready:{scale:1.3,pivot:[360,530],head:[372,144],hand:[286,237],tip:[347,10],feet:[[244,529],[493,526]]},
 echo_command:{scale:1.3,pivot:[400,518],head:[431,151],hand:[266,310],tip:[34,356],feet:[[256,515],[604,515]]},
 echo_rise:{scale:1.3,pivot:[380,486],head:[349,145],hand:[488,142],tip:[671,40],feet:[[137,487],[618,480]]},
 echo_cut:{scale:1.3,pivot:[345,483],head:[426,153],hand:[368,306],tip:[656,460],feet:[[115,487],[539,474]]},
 verdict_focus:{scale:1.3,pivot:[420,497],head:[421,97],hand:[451,218],tip:[433,8],feet:[[312,495],[533,493]]},
 verdict_raise:{scale:1.3,pivot:[440,494],head:[462,146],hand:[421,76],tip:[156,110],feet:[[235,490],[644,490]]},
 verdict_cut:{scale:1.3,pivot:[390,473],head:[506,174],hand:[490,323],tip:[715,472],feet:[[137,473],[556,466]]},
 verdict_sheathe:{scale:1.3,pivot:[450,456],head:[473,145],hand:[421,286],tip:[524,313],feet:[[288,450],[611,455]]}
};
for(const[name,p]of Object.entries(poses)){
 const id='v4_'+name,m=await sharp(dir+'cropped/'+name+'.png').metadata(),w=Math.round(m.width*p.scale);
 await sharp(dir+'cropped/'+name+'.png').resize({width:w}).png().toFile(hero+'images/'+id+'.png');const n=await sharp(hero+'images/'+id+'.png').metadata(),s=w/m.width;
 const point=([x,y])=>[+(s*(x-p.pivot[0])).toFixed(4),+(s*(p.pivot[1]-y)).toFixed(4)];
 const r={...p,file:'skills-v4/cropped/'+name+'.png',scale:s,size:[n.width,n.height],center:[+(n.width/2-p.pivot[0]*s).toFixed(4),+(p.pivot[1]*s-n.height/2).toFixed(4)],sockets:{head:point(p.head),weapon_grip:point(p.hand),blade_tip:point(p.tip),foot_rear:point(p.feet[0]),foot_front:point(p.feet[1])}};
 reg.poses[id]=r;input.skins[0].attachments.body[id]={type:'region',path:id,x:r.center[0],y:r.center[1],width:n.width,height:n.height};
}
const actions={
 skill_rift:{name:'흑금 단공',duration:1.67,damageTime:.48,returnTime:1.20,returnDuration:.30,keys:[[0,'guard'],[.09,'v4_rift_ready'],[.34,'v4_rift_draw'],[.42,'v4_rift_drive'],[.61,'v4_rift_brake'],[.91,'v4_verdict_sheathe'],[1.12,'guard'],[1.20,'step'],[1.50,'guard'],[1.67,'guard']],visualBeats:[{time:.48,hold:.065,id:'pierce'}]},
 skill_echo:{name:'잔영 삼재',duration:2.62,damageTime:1.51,returnTime:2.03,returnDuration:.34,keys:[[0,'guard'],[.10,'v4_echo_ready'],[.37,'v4_echo_command'],[1.12,'v4_echo_rise'],[1.34,'v3_aircut'],[1.51,'v4_echo_cut'],[1.79,'v4_verdict_sheathe'],[1.97,'guard'],[2.03,'step'],[2.37,'guard'],[2.62,'guard']],visualBeats:[{time:.57,hold:.025,id:'echo-left'},{time:.89,hold:.025,id:'echo-right'},{time:1.21,hold:.035,id:'echo-high'},{time:1.51,hold:.075,id:'closing-cleave'}]},
 skill_verdict:{name:'천형 종결',duration:3.30,damageTime:1.78,returnTime:2.71,returnDuration:.34,keys:[[0,'guard'],[.12,'v4_verdict_focus'],[.79,'v4_echo_ready'],[1.04,'v4_verdict_raise'],[1.61,'v3_aircut'],[1.78,'v4_verdict_cut'],[2.06,'v4_verdict_sheathe'],[2.54,'guard'],[2.71,'step'],[3.05,'guard'],[3.30,'guard']],visualBeats:[{time:.66,hold:.02,id:'scar-one'},{time:1.02,hold:.025,id:'scar-two'},{time:1.36,hold:.03,id:'scar-three'},{time:1.78,hold:.11,id:'verdict'}]}
};
for(const [id,a]of Object.entries(actions)){
 const anim={slots:{body:{attachment:a.keys.map(([time,name])=>({time,name}))}},bones:{root:{translate:[{time:0,x:0,y:0},{time:a.duration,x:0,y:0}]}},events:a.visualBeats.map(b=>({time:b.time,name:b.time===a.damageTime?'visual_finish':'visual_contact'}))};
 for(const socket of Object.keys(reg.poses.guard.sockets)){const [bx,by]=reg.poses.guard.sockets[socket];anim.bones[socket]={translate:a.keys.map(([time,p])=>({time,x:reg.poses[p].sockets[socket][0]-bx,y:reg.poses[p].sockets[socket][1]-by,curve:'stepped'}))};}
 input.animations[id]=anim;a.damageAuthority='One V3 server callback at final impact; earlier contacts are visual only.';
}
await fs.writeFile(hero+'whitecoat-skills-v4.input.json',JSON.stringify(input,null,2));await fs.writeFile(dir+'pose-inputs.json',JSON.stringify(poses,null,2));await fs.writeFile(dir+'pose-registration.json',JSON.stringify(reg,null,2));await fs.writeFile(dir+'actions.json',JSON.stringify(actions,null,2));
const panels=[],cw=560,ch=480,ids=Object.keys(poses);for(const [i,id]of ids.entries()){const p=reg.poses['v4_'+id],s=.5,png=await sharp(hero+'images/v4_'+id+'.png').resize({width:Math.round(p.size[0]*s)}).png().toBuffer();panels.push({input:png,left:Math.round(i%4*cw+280+(p.center[0]-p.size[0]/2)*s),top:Math.round(Math.floor(i/4)*ch+440-(p.center[1]+p.size[1]/2)*s)});}
panels.push({input:Buffer.from(`<svg width="2240" height="1440">${ids.map((id,i)=>`<text x="${i%4*cw+12}" y="${Math.floor(i/4)*ch+24}" fill="#edf4fb" font-family="Arial" font-size="20">${id}</text><path d="M${i%4*cw},${Math.floor(i/4)*ch+440}h${cw}" stroke="#bcd" opacity=".2"/>`).join('')}</svg>`),left:0,top:0});await sharp({create:{width:2240,height:1440,channels:4,background:'#273846'}}).composite(panels).png().toFile(dir+'qa/pose-lineup.png');
console.log({newPoses:12,totalPoses:Object.keys(reg.poses).length,animations:Object.keys(input.animations)});

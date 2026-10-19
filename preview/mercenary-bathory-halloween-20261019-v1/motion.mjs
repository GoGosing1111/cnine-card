const p=(at,bank,index)=>({at,bank,index,facing:1}),a=(at,anchor)=>({at,anchor});
export const MODES={
 idle:{label:'대기',duration:2.8,contacts:[],poses:[p(0,'idle',0),p(1.4,'idle',1)],path:[a(0,'home'),a(2.8,'home')]},
 dash:{label:'유리 그림자',duration:.8,contacts:[],poses:[p(0,'dash',0),p(.13,'dash',1),p(.28,'dash',2),p(.45,'dash',3),p(.68,'idle',0)],path:[a(0,'home'),a(.12,'home'),a(.38,'near'),a(.52,'near'),a(.8,'home')]},
 attack:{label:'혈광 참격',duration:1.05,contacts:[.40],poses:[p(0,'idle',0),p(.12,'attack',0),p(.32,'attack',1),p(.49,'attack',2),p(.72,'attack',3),p(.91,'idle',0)],path:[a(0,'home'),a(.32,'near'),a(.63,'near'),a(1.05,'home')]},
 skill:{label:'핏빛 만찬',duration:2.6,contacts:[.66,1.50],poses:[p(0,'idle',0),p(.13,'skill',0),p(.32,'skill',1),p(.57,'skill',2),p(.79,'skill',3),p(1.05,'skill',4),p(1.40,'skill',5),p(1.68,'skill',6),p(2.05,'skill',7),p(2.42,'idle',0)],path:[a(0,'home'),a(.33,'home'),a(.57,'rise'),a(.84,'rise'),a(1.35,'finish'),a(1.85,'finish'),a(2.6,'home')]},
 hit:{label:'피격',duration:.65,contacts:[],poses:[p(0,'hit',0),p(.23,'hit',1),p(.48,'idle',0)],path:[a(0,'home'),a(.65,'home')]},
 defeat:{label:'퇴장',duration:1.2,contacts:[],poses:[p(0,'hit',0),p(.25,'defeat',0),p(.72,'defeat',1)],path:[a(0,'home'),a(1.2,'home')]}
};
for(const m of Object.values(MODES))m.steps=m.poses.map(p=>p.at);
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>(x=clamp(x),x*x*(3-2*x));
export function sample(mode,time){
 const m=MODES[mode],t=clamp(time,0,m.duration),frame=Math.max(0,m.poses.findLastIndex(p=>p.at<=t)),i=Math.max(0,m.path.findLastIndex(p=>p.at<=t)),from=m.path[i],to=m.path[Math.min(i+1,m.path.length-1)];
 const effects=[],fx=(key,start,duration,anchor,width,angle=0)=>{if(t>=start&&t<start+duration)effects.push({key,progress:(t-start)/duration,anchor,width,angle,alpha:Math.min(1,(start+duration-t)/.12)});};
 if(mode==='dash')fx('drive',.12,.55,'wake',1.55);
 if(mode==='attack'){fx('drive',.18,.32,'wake',1.25);fx('cut',.26,.61,'target',1.65,.2);}
 if(mode==='skill'){fx('drive',.36,.45,'wake',1.6);fx('cut',.48,.68,'target',1.85,-.1);fx('cut',1.27,.61,'target',2.1,Math.PI*.5);fx('rupture',1.48,.98,'ground',2.35);}
 const impact=m.contacts.reduce((v,h)=>Math.max(v,t>=h&&t<h+.17?1-(t-h)/.17:0),0);
 return {mode,time:t,frame,pose:m.poses[frame],effects,impact,path:{from:from.anchor,to:to.anchor,mix:to.at===from.at?1:smooth((t-from.at)/(to.at-from.at))},lift:0,done:t>=m.duration,contactCount:m.contacts.filter(h=>h<=t).length,ghosts:(mode==='dash'&&t>.12&&t<.45)||(mode==='attack'&&t>.18&&t<.49)||(mode==='skill'&&t>.36&&t<.76),phase:mode==='skill'?(t<.45?'붉은 눈 · 검을 낮추다':t<.85?'첫 번째 검격':t<1.4?'대검을 되감다':t<1.8?'핏빛 만찬 · 마무리':'파편 · 자세 회복'):m.label};
}
// Authored edge segment against the torso, not a sword-tip distance shortcut.
export function bladeContact(start,tip,torso,radius){
 const dx=tip.x-start.x,dy=tip.y-start.y,l=dx*dx+dy*dy,u=l?clamp(((torso.x-start.x)*dx+(torso.y-start.y)*dy)/l):0,distance=Math.hypot(start.x+dx*u-torso.x,start.y+dy*u-torso.y);
 return{u,distance,intersects:u>.05&&u<.95&&distance<=radius,tipDistance:Math.hypot(tip.x-torso.x,tip.y-torso.y)};
}

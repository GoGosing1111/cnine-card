import {toPlayback} from '../timing.mjs';
// Coordinates are authored at 1280 × 720 and resolved against the wielder, target and floor at playback.
const peak={crescent:.236,dash:.156,helix:.244,burst:.103,ground:.176,vortex:.290,wave:.193,gust:.207,rift:.277,thunder:.152,fork:.155,leader:.289};
const origin=(anchor,x=0,y=0)=>({anchor,x,y});
const source=(x=0,y=0)=>origin('source',x,y);
const hit=(x=0,y=0)=>origin('target',x,y);
const floor=(x=0,y=0)=>origin('floor',x,y);
const beam=(p,q,t,life,width,opts={})=>({kind:'link',p,q,at:t,life,width,layer:'front',...opts});
const draw=(art,t,life,pos,w,h,opts={})=>({kind:'paint',art,pos,at:t,life,w,h,layer:'front',...opts});
const crest=(art,t,life,pos,w,h,opts={})=>draw(art,t-life*peak[art],life,pos,w,h,opts);
const chips=(t,pos,energy=1,opts={})=>({kind:'debris',at:t,life:.64+energy*.35,pos,energy,layer:'both',...opts});
const blades=(mode,t,life,count,opts={})=>({kind:'blades',mode,at:t,life,count,layer:'both',...opts});
const swipe=(t,flip=1,size=1,angle=-12,pos=hit(-55,-5))=>[
 crest('gust',t,.53,pos,583*size,283*size,{angle,flip,approach:[-84*flip,22],drift:[78*flip,-12],bloom:.67}),
 crest('crescent',t-.032,.45,pos,336*size,323*size,{angle:angle+12,flip,alpha:.73,layer:'rear',drift:[79*flip,4]})
];
const puncture=(t,pos=hit(),size=1,angle=-15)=>[
 crest('burst',t,.51,pos,257*size,215*size,{angle,drift:[27,9],bloom:.58}),
 crest('rift',t+.009,.285,pos,337*size,94*size,{angle,alpha:.91})
];
const bolt=(t,x=0,power=1,rot=0)=>[
 crest('leader',t-.010,.53,floor(x),336*power,529*power,{pivot:[.50,.912],angle:rot,layer:'rear',bloom:.84}),
 crest('leader',t+.075,.32,floor(x+13),224*power,360*power,{pivot:[.50,.912],angle:rot+15,flip:-1,layer:'rear',alpha:.68,bloom:.82}),
 crest('thunder',t+.010,.68,floor(x),317*power,208*power,{pivot:[.50,.90],angle:rot,bloom:.54}),
 crest('ground',t+.025,.68,floor(x,3),375*power,203*power,{pivot:[.50,.83],alpha:.87}),
 chips(t,floor(x),power,{ground:true})
];
const quick=(t,a,b,strength=1)=>beam(a,b,t-.045,.27,69*strength,{bloom:.72});
const dash=(t,reverse=false,angle=0)=>[
 crest('dash',t-.036,.62,hit(reverse?44:-75,4),729,144,{angle,flip:reverse?-1:1,approach:[reverse?81:-225,0],drift:[reverse?-145:175,0],layer:'rear'}),
 crest('wave',t,.43,hit(7,4),578,134,{angle,flip:reverse?-1:1,drift:[reverse?-105:110,0],bloom:.48})
];
const row=(id,title,seconds,ref,contacts,events)=>({id,title,seconds,ref,contacts,events:events.flat()});
const sequence=(a,step,n,fn)=>Array.from({length:n},(_,i)=>fn(a+i*step,i)).flat();

const sections=[
 row('cleave','대검 내려베기',.99,null,[.36],[
  crest('fork',.15,.24,source(40,-14),192,40,{angle:-48,alpha:.68,layer:'rear'}),
  swipe(.36,1,1.08,33,hit(-87,-47)),puncture(.373,hit(18,15),.96,34),
  crest('leader',.394,.34,hit(79,87),158,282,{pivot:[.50,.91],angle:-42,layer:'rear',alpha:.77}),
  quick(.42,hit(-74,-101),hit(84,117),.86),chips(.386,hit(6,18),.72,{angle:27})
 ]),
 row('cyclone','원형 연참',2.80,[3.20,6.00],[.35,.695,1.04,1.385,1.73,2.075],[
  draw('vortex',.06,1.79,hit(-55,31),494,339,{layer:'rear',alpha:.73,turn:19}),
  ...sequence(.35,.345,6,(t,i)=>[
   crest('gust',t,.48,hit(-44+(i%3)*22,24-(i%3)*23),593+i*22,162+(i%2)*51,{flip:i%2?-1:1,angle:i%2?-12:11,drift:[i%2?-62:67,0],bloom:.50}),
   quick(t+.025,hit(i%2?174:-213,11),hit(i%2?-176:214,(i%2?-1:1)*34),.56),
   ...(i===2||i===5?puncture(t,hit(22,-15),i===5?1.3:.84):[])
  ]),
  crest('helix',2.11,.65,hit(-17,2),380,367,{angle:-19,layer:'rear'}),chips(2.10,floor(-15),.8,{ground:true})
 ]),
 row('rush','섬전질주',4.15,[6.00,10.15],[.39,1.00,1.61,2.22,2.83,3.44],[
  ...sequence(.39,.61,6,(t,i)=>[
   dash(t,i%2===1,i%3===0?-9:5),
   quick(t,source(i%2?525:5,22),hit(i%2?-134:109,-27),.83),
   ...(i%2?swipe(t+.035,-1,.70,-18):puncture(t+.018,hit(i%2?-60:26,-4),.85))
  ]),crest('rift',3.48,.56,hit(-30,6),794,169,{angle:-8}),chips(3.49,hit(),.77)
 ]),
 row('cross','교차뇌광',2.42,[10.15,12.57],[.37,.82,1.25,1.54,1.78],[
  swipe(.37,1,.85,-26),swipe(.82,-1,1.02,22),
  crest('rift',1.24,.55,hit(-19,-11),801,157,{angle:-33}),
  crest('rift',1.43,.52,hit(6,3),708,154,{angle:42}),
  beam(hit(-237,161),hit(190,-143),1.20,.48,128),
  beam(hit(-208,-180),hit(190,157),1.41,.40,117),
  puncture(1.56,hit(),1.47,-23),crest('gust',1.75,.55,hit(-8,0),561,221,{angle:14}),chips(1.56,hit(),1.12)
 ]),
 row('orbit','환검추격',3.05,[12.57,15.62],[.52,1.22,1.40,1.58,1.76,1.94,2.12,2.48],[
  blades('orbit',.025,2.31,6),swipe(.52,1,.89,-13),crest('gust',.76,.88,hit(0,-48),428,153,{angle:-7,alpha:.65,layer:'rear'}),crest('helix',1.20,.60,hit(0,-68),327,148,{angle:9,alpha:.77,layer:'rear'}),
  ...sequence(1.22,.18,6,(t,i)=>[quick(t,hit(Math.cos(i*1.04)*189,Math.sin(i*1.04)*118-44),hit(),.64),crest('burst',t,.27,hit((i%3-1)*18,0),131,141,{angle:i*27})]),
  crest('helix',2.34,.62,hit(),421,380,{layer:'rear',angle:14}),puncture(2.48,hit(),1.55,-31),chips(2.49,hit(),1.03)
 ]),
 row('wave','연쇄검파',2.65,[15.62,18.27],[.32,.69,1.06,1.43,1.98],[
  ...sequence(.32,.37,4,(t,i)=>[
   crest('wave',t,.64,source(145+i*21,(i%2?12:-20)),472+i*55,146,{angle:i%2?4:-5,approach:[-110,0],drift:[302+i*19,0]}),
   crest('crescent',t+.13,.52,hit(-63+i*29,0),248+i*27,272+i*18,{angle:i%2?14:-18,drift:[125,0],alpha:.91})
  ]),
  quick(1.92,source(),hit(77,2),1.1),crest('gust',1.98,.57,hit(-5,2),594,286,{angle:-19}),puncture(1.98,hit(26,-6),1.48),chips(1.99,hit(21,-8),.93)
 ]),
 row('wings','뇌익검진',6.00,[18.27,24.27],[.64,1.46,3.04,3.22,3.40,3.58,3.76,3.94,4.12,4.30,4.90,5.40],[
  crest('rift',.64,.72,source(68,-20),566,99,{angle:-8,layer:'rear'}),
  blades('wings',.68,3.92,8),swipe(1.46,1,1.04,12,source(110,4)),
  draw('mantle',.63,2.76,source(2,-41),524,218,{pivot:[.50,.87],layer:'rear',bloom:.47,alpha:.92}),
  ...[-1,1].flatMap(sign=>[
   draw('gust',.77,2.45,source(sign*103,-79),284,189,{angle:sign*36,flip:sign,layer:'rear',alpha:.40,bloom:.50}),
   ...[.95,1.69,2.38].map((t,i)=>beam(source(sign*(142-i*16),-101-i*29),source(sign*(18+i*9),-43),t,.54,43,{layer:'rear',alpha:.83,bloom:.68}))
  ]),
  draw('vortex',1.98,1.48,floor(0),544,141,{pivot:[.5,.63],layer:'rear',alpha:.78}),
  ...sequence(3.04,.18,8,(t,i)=>[quick(t,source(43+(i%2?123:-62),-155+(i%4)*23),hit(i%2?25:-18,(i%3-1)*28),.69),crest('burst',t,.30,hit((i%3-1)*26,-19),165,144,{angle:i*33})]),
  bolt(4.90,7,.97),swipe(5.40,1,1.26,-14),puncture(5.40,hit(),1.25,12)
 ]),
 row('rain','천검낙뢰',4.40,[24.27,28.67],[.59,1.18,1.42,1.66,1.90,2.14,2.38,2.62,2.86,3.08,3.67],[
  crest('gust',.59,.58,hit(-67,-21),556,225,{angle:-19}),
  blades('rain',.47,2.51,9),
  ...sequence(1.18,.24,7,(t,i)=>[crest('leader',t,.38,floor((i-3)*53,-2),155+(i%2)*35,335+(i%3)*54,{pivot:[.50,.912],layer:i%2?'rear':'front',alpha:.94,angle:(i-3)*4}),
   crest('thunder',t+.018,.45,floor((i-3)*53),153,130,{pivot:[.50,.90],alpha:.82}),
   ...(i%2?[]:[chips(t+.015,floor((i-3)*53),.54,{ground:true})])]),
  bolt(3.08,4,1.12),quick(3.14,hit(-176,-155),floor(18),1.17),crest('gust',3.67,.56,floor(10,-32),615,155,{angle:1})
 ]),
 row('prison','검뢰결계',3.98,[28.67,32.65],[.68,1.28,1.62,1.96,2.30,2.64,3.13],[
  blades('cage',.045,2.99,8),
  crest('vortex',.68,1.25,floor(),545,149,{layer:'rear',pivot:[.5,.64]}),
  ...sequence(1.28,.34,5,(t,i)=>[beam(hit(i%2?185:-185,-132),hit(i%2?-167:167,113),t-.08,.41,112),
   crest('rift',t,.37,hit(0,-9),456,88,{angle:i%2?-39:32,alpha:.92})]),
  crest('helix',2.65,.74,hit(),489,459,{layer:'rear',turn:-23}),bolt(3.13,0,1.08),puncture(3.15,hit(4,22),1.40)
 ]),
 row('pursuit','잔영난무',8.54,[32.65,41.19],[.36,.96,1.43,2.06,2.56,3.20,3.75,4.23,4.90,5.47,6.15,6.83,7.59],[
  ...[.36,.96,1.43,2.06,2.56,3.20,3.75,4.23,4.90,5.47,6.15,6.83].flatMap((t,i)=>{
   const y=[0,-56,-83,-25,35,6][i%6],s=i%2?-1:1,p=hit(s*22,y);
   if(i%4===0)return [...dash(t,i%2===1,-12),...puncture(t,p,.80)];
   if(i%4===1)return [...swipe(t,s,.90,28*s,p),quick(t,hit(-141*s,y-98),hit(93*s,y+99),.77)];
   if(i%4===2)return [crest('gust',t,.50,p,568,275,{angle:-33*s,flip:s}),crest('rift',t+.06,.36,p,478,95,{angle:-47*s})];
   return [crest('helix',t,.55,p,350,316,{angle:12*s,layer:'rear'}),...puncture(t,p,1.07),chips(t+.03,p,.59)];
  }),
  crest('vortex',7.35,1.02,hit(0,16),515,362,{layer:'rear'}),swipe(7.59,1,1.34,-22),
  crest('rift',7.62,.61,hit(),861,181,{angle:-15}),chips(7.61,hit(),1.15)
 ]),
 row('horizon','뇌천일섬',6.29,[41.19,47.48],[.68,1.37,2.15,3.07,3.36,3.58,4.02,5.03,5.26],[
  beam(source(-100,-194),floor(-15),.04,.68,183,{layer:'rear'}),
  crest('leader',.68,.67,floor(-90),316,525,{pivot:[.5,.912],layer:'rear',angle:-8}),
  blades('judgment',.85,2.98,4),crest('ground',1.37,.90,floor(-43),479,274,{pivot:[.50,.84]}),chips(1.37,floor(-43),1.18,{ground:true}),
  crest('rift',2.15,.85,hit(-52,-44),843,227,{angle:29,layer:'rear'}),quick(2.17,source(30,-145),hit(175,74),1.42),
  ...[3.07,3.36,3.58].flatMap((t,i)=>[crest('gust',t,.48,hit(0,-48+i*28),545+i*35,234,{angle:[-32,24,-12][i],flip:i%2?-1:1}),...puncture(t,hit(6,4),.76)]),
  crest('burst',4.02,.53,hit(-8,-42),235,204,{layer:'rear'}),
  draw('rift',4.31,.53,hit(-79,-28),784,30,{angle:-11,alpha:.73,layer:'rear'}),
  crest('rift',5.03,.98,hit(-108,-23),1065,323,{angle:-13,bloom:1.05}),
  beam(source(-91,109),hit(278,-130),4.98,.46,161,{bloom:.95}),
  bolt(5.26,21,1.02),chips(5.07,hit(-29,-8),1.42,{angle:-12}),crest('wave',5.39,.76,hit(-30,4),888,195,{angle:-13,layer:'rear'})
 ])
];
const authored=sections.map(s=>({...s,events:s.events.flat(Infinity).map((e,seed)=>({...e,seed:71+seed*137}))}));
export const authoredById=Object.fromEntries(authored.map(s=>[s.id,s]));
export const skills=authored.map(s=>({...s,seconds:toPlayback(s.seconds),frames:Math.round(toPlayback(s.seconds)*60),
 contacts:s.contacts.map(toPlayback),events:s.events.map(e=>({...e,at:toPlayback(e.at),life:toPlayback(e.life)}))}));
export const byId=Object.fromEntries(skills.map(s=>[s.id,s]));
export const defaultAnchors={source:[386,396],target:[761,379],floor:[761,582],facing:1,scale:1};

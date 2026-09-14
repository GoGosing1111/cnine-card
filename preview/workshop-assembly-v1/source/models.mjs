// CMS names/IDs verified read-only on 2026-09-08. This is a presentation
// catalog, not a recipe, grant, combat skin replacement or balance setting.
const suitRoot='/assets/ui/project-v/account-battle-suits/suits/';
export const MODELS=Object.freeze({
  solaris:{mode:'vehicle',name:'솔라리스 - Ω',code:'SOLARIS_OMEGA',catalogSource:'/assets/tire/solaris-omega-v1.png',description:'백금 차체 · 황금 휠 · 독립 트윈 터빈 조립',source:'assets/solaris-omega-cutout-v1.png',color:0xffce65,css:'#f1cc83',line:'AUTOMOTIVE / SOLARIS Ω TWIN REACTOR',box:[0,0,1672,941],art:{x:162,y:180,scale:.67},wheels:[{cx:886,cy:617,rx:122,ry:167,dx:-290,dy:80,at:3.7},{cx:1529,cy:480,rx:86,ry:131,dx:235,dy:-60,at:4.25}],turbines:[{polygon:[954,270,962,240,983,218,1008,211,1064,213,1105,225,1130,253,1127,283,1061,285,1004,278],at:7.0,duration:1.15,joint:[1040,270]},{polygon:[1129,282,1139,251,1161,230,1191,219,1221,219,1267,227,1310,239,1344,250,1399,254,1411,269,1405,286,1371,292,1356,315,1304,331,1245,341,1190,336,1153,317],at:7.35,duration:1.15,joint:[1236,332]}],engine:[740,324],lights:[[268,497],[559,560]],cores:[[835,359],[959,371]],nozzles:[[943,336],[1103,365]],weld:[[580,605],[1090,530]]},
  h:{mode:'suit',name:'H-BODY',code:'BATTLE_SUIT_H_BODY',catalogId:42,description:'백색 판금 · 엠버 코어',source:'/assets/items/h-body-v2066.png',color:0xffac52,css:'#edb778',line:'EXOSUIT / ASSEMBLY BAY 04',legacy:true},
  e:{mode:'suit',name:'E-BODY',code:'BATTLE_SUIT_01',catalogId:36,description:'백금 장갑 · 청색 에너지 · 날개형 견갑',source:suitRoot+'battle-suit-appearance-01-white-gold-female-v2.png',sha256:'322e1958cfbf80cf7940cefd9c05a49b353559afe5319c05ec11a4c4e2c922f3',color:0x68c8ed,css:'#99d8e8',line:'EXOSUIT / ASSEMBLY BAY 01',box:[282,58,885,1168],core:[689,310],joints:{legL:[561,1020],legR:[830,976],hips:[697,526],torso:[678,370],wing:[521,306],shoulderL:[555,324],shoulderR:[737,321],armL:[539,556],armR:[806,544],head:[660,245],core:[689,310]}},
  f:{mode:'suit',name:'F-BODY',code:'BATTLE_SUIT_02',catalogId:37,description:'흑백 전술 장갑 · 청록색 전력 회로',source:suitRoot+'battle-suit-appearance-02-orange-tactical-v1.png',sha256:'d5e661b53fc0098106c1f2e9feb002ccc8d0cb898103561a84ea61cd38689cb0',color:0x48d4ef,css:'#8fcdd6',line:'EXOSUIT / ASSEMBLY BAY 02',box:[374,109,787,1206],core:[608,345],joints:{legL:[476,1034],legR:[704,985],hips:[591,562],torso:[594,395],coat:[558,639],shoulderL:[449,348],shoulderR:[676,278],armL:[431,575],armR:[747,480],head:[581,255],core:[608,345]}},
  g:{mode:'suit',name:'G-BODY',code:'BATTLE_SUIT_03',catalogId:38,description:'자수정 장갑 · 보라색 반응로 · 강화 견갑',source:suitRoot+'battle-suit-appearance-03-amethyst-exosuit-v1.png',sha256:'33411d6fb94a44b409470e94cf90edf1d96ce06803fc40c6d54e6431bfd99841',color:0xd080f6,css:'#c4a5e7',line:'EXOSUIT / ASSEMBLY BAY 03',box:[319,6,882,1340],core:[646,374],joints:{legL:[450,1138],legR:[764,1064],hips:[615,624],torso:[612,453],shoulderL:[432,362],shoulderR:[715,309],armL:[380,661],armR:[787,560],head:[580,254],core:[646,374]}},
  veneno:{mode:'vehicle',name:'LAMBORGHINI VENENO',description:'람보르기니 베네노 · 기존 검수 샘플',source:'assets/car-cutout.png',color:0xcaeced,css:'#a8d7e1',line:'AUTOMOTIVE / ASSEMBLY LINE 01',legacy:true},
  ignis:{mode:'vehicle',name:'이그니스 - X',code:'GARAGE_1787232065012',catalogId:27,description:'크림슨 차체 · 상부 터빈 · 독립 부스터 점화',catalogSource:'/assets/tire/1321312.jpg',source:'assets/ignis-x-cutout.png',color:0xff7051,css:'#ed9a7c',line:'AUTOMOTIVE / TURBINE LINE X',box:[0,0,1679,937],art:{x:162,y:180,scale:.67},wheels:[{cx:856,cy:626,rx:112,ry:140,dx:-290,dy:75,at:3.7},{cx:1453,cy:550,rx:78,ry:106,dx:250,dy:-55,at:4.25}],turbine:[881,136,403,145],engine:[740,324],lights:[[212,540],[458,570]],nozzle:[1005,330],weld:[[454,644],[1087,536]]}
});
export const DEFAULT_MODEL=Object.freeze({suit:'h',vehicle:'veneno'});
export const MODEL_ORDER=Object.freeze({suit:['e','f','g','h'],vehicle:['solaris','ignis','veneno']});
export function modelFor(mode,key=DEFAULT_MODEL[mode]){
  const model=MODELS[key];if(!model||model.mode!==mode)throw new TypeError('제작 라인에 맞는 모델이 필요합니다.');return model;
}
export function resolveModel(mode,key){return MODELS[key]?.mode===mode?key:DEFAULT_MODEL[mode];}
export function suitPlacement(model){
  const [left,top,right,bottom]=model.box,scale=650/(bottom-top);
  return {x:735-(left+right)/2*scale,y:764-bottom*scale,scale};
}
export function modelPhases(mode,key,base){
  const phases=base.map(p=>[...p]);
  if(mode==='suit'&&key!=='h')phases[4]=[6,'상부 인터페이스 동기화','INTERFACE SYNC'];
  if(key==='e')phases[3]=[3.7,'날개형 견갑 · 팔 결합','WING & ARM MODULES'];
  if(key==='f')phases[4]=[6,'전술 외장 · 인터페이스 연결','TACTICAL INTERFACE'];
  if(key==='ignis'){
    phases[5]=[7.2,'상부 터빈 결합 · 용접','TURBINE LOCK'];
    phases[7]=[10.3,'부스터 점화','TURBINE IGNITION'];
  }
  if(key==='solaris'){
    phases[5]=[7,'트윈 터빈 순차 결합 · 용접','TWIN TURBINE LOCK'];
    phases[7]=[10.3,'태양 코어 동기화 · 황금 점화','SOLAR IGNITION'];
  }
  return phases;
}

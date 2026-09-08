// CMS names/IDs verified read-only on 2026-09-08. This is a presentation
// catalog, not a recipe, grant, combat skin replacement or balance setting.
const suitRoot='/assets/ui/project-v/account-battle-suits/suits/';
export const MODELS=Object.freeze({
  h:{mode:'suit',name:'H-BODY',code:'BATTLE_SUIT_H_BODY',catalogId:42,description:'백색 판금 · 엠버 코어',source:'/assets/items/h-body-v2066.png',color:0xffac52,css:'#edb778',line:'EXOSUIT / ASSEMBLY BAY 04',legacy:true},
  e:{mode:'suit',name:'E-BODY',code:'BATTLE_SUIT_01',catalogId:36,description:'백금 장갑 · 청색 에너지 · 날개형 견갑',source:suitRoot+'battle-suit-appearance-01-white-gold-female-v2.png',sha256:'322e1958cfbf80cf7940cefd9c05a49b353559afe5319c05ec11a4c4e2c922f3',color:0x68c8ed,css:'#99d8e8',line:'EXOSUIT / ASSEMBLY BAY 01',box:[282,58,885,1168],core:[689,310],joints:{legL:[561,1020],legR:[830,976],hips:[697,526],torso:[678,370],wing:[521,306],shoulderL:[555,324],shoulderR:[737,321],armL:[539,556],armR:[806,544],head:[660,245],core:[689,310]}},
  f:{mode:'suit',name:'F-BODY',code:'BATTLE_SUIT_02',catalogId:37,description:'흑백 전술 장갑 · 청록색 전력 회로',source:suitRoot+'battle-suit-appearance-02-orange-tactical-v1.png',sha256:'d5e661b53fc0098106c1f2e9feb002ccc8d0cb898103561a84ea61cd38689cb0',color:0x48d4ef,css:'#8fcdd6',line:'EXOSUIT / ASSEMBLY BAY 02',box:[374,109,787,1206],core:[608,345],joints:{legL:[476,1034],legR:[704,985],hips:[591,562],torso:[594,395],coat:[558,639],shoulderL:[449,348],shoulderR:[676,278],armL:[431,575],armR:[747,480],head:[581,255],core:[608,345]}},
  g:{mode:'suit',name:'G-BODY',code:'BATTLE_SUIT_03',catalogId:38,description:'자수정 장갑 · 보라색 반응로 · 강화 견갑',source:suitRoot+'battle-suit-appearance-03-amethyst-exosuit-v1.png',sha256:'33411d6fb94a44b409470e94cf90edf1d96ce06803fc40c6d54e6431bfd99841',color:0xd080f6,css:'#c4a5e7',line:'EXOSUIT / ASSEMBLY BAY 03',box:[319,6,882,1340],core:[646,374],joints:{legL:[450,1138],legR:[764,1064],hips:[615,624],torso:[612,453],shoulderL:[432,362],shoulderR:[715,309],armL:[380,661],armR:[787,560],head:[580,254],core:[646,374]}},
  veneno:{mode:'vehicle',name:'LAMBORGHINI VENENO',description:'람보르기니 베네노 · 기존 검수 샘플',source:'assets/car-cutout.png',color:0xcaeced,css:'#a8d7e1',line:'AUTOMOTIVE / ASSEMBLY LINE 01',legacy:true},
  ignis:{mode:'vehicle',name:'이그니스 - X',code:'GARAGE_1787232065012',catalogId:27,description:'크림슨 차체 · 상부 터빈 · 독립 부스터 점화',catalogSource:'/assets/tire/1321312.jpg',source:'assets/ignis-x-cutout.png',color:0xff7051,css:'#ed9a7c',line:'AUTOMOTIVE / TURBINE LINE X',box:[0,0,1679,937],art:{x:162,y:180,scale:.67},wheels:[{cx:856,cy:626,rx:112,ry:140,dx:-290,dy:75,at:3.7},{cx:1453,cy:550,rx:78,ry:106,dx:250,dy:-55,at:4.25}],turbine:[881,136,403,145],engine:[740,324],lights:[[212,540],[458,570]],nozzle:[1005,330],weld:[[454,644],[1087,536]]}
});
export const DEFAULT_MODEL=Object.freeze({suit:'h',vehicle:'veneno'});
export const MODEL_ORDER=Object.freeze({suit:['e','f','g','h'],vehicle:['ignis','veneno']});
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
  return phases;
}

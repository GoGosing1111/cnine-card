// Review model only. No account, reward, persistence, or battle runtime imports.
export const POLICY = Object.freeze({maxLevel:250,startLevel:1,pvpBuff:false,status:'PROPOSAL'});
const rows = [
  ['TRAINEE','훈련병',1,4,'입문','새싹','olive'],
  ['PRIVATE','이병',5,14,'병사','▬','silver'],
  ['PRIVATE_FIRST','일병',15,24,'병사','▬▬','silver'],
  ['CORPORAL','상병',25,34,'병사','▬▬▬','silver'],
  ['SERGEANT','병장',35,49,'병사','▬▬▬▬','silver'],
  ['STAFF_SERGEANT','하사',50,64,'부사관','⌃','teal'],
  ['SERGEANT_FIRST','중사',65,79,'부사관','⌃⌃','teal'],
  ['MASTER_SERGEANT','상사',80,94,'부사관','⌃⌃⌃','teal'],
  ['SERGEANT_MAJOR','원사',95,109,'부사관','⌃✦⌃','teal'],
  ['WARRANT','준위',110,124,'준사관','금빛 봉오리','amber'],
  ['SECOND_LIEUTENANT','소위',125,139,'위관','봉오리 1','blue'],
  ['FIRST_LIEUTENANT','중위',140,154,'위관','봉오리 2','blue'],
  ['CAPTAIN','대위',155,169,'위관','봉오리 3','blue'],
  ['MAJOR','소령',170,184,'영관','✿','ruby'],
  ['LIEUTENANT_COLONEL','중령',185,199,'영관','✿✿','ruby'],
  ['COLONEL','대령',200,214,'영관','✿✿✿','ruby'],
  ['BRIGADIER','준장',215,224,'장군','★','gold'],
  ['MAJOR_GENERAL','소장',225,234,'장군','★★','gold'],
  ['LIEUTENANT_GENERAL','중장',235,244,'장군','★★★','gold'],
  ['GENERAL','대장',245,249,'장군','★★★★','gold'],
  ['MARSHAL','원수',250,250,'원수','★★★★★','gold']
];
const artwork = Object.fromEntries(rows.map(([code])=>[code,`${code.toLowerCase().replaceAll('_','-')}-v1.png`]));
artwork.SERGEANT_MAJOR='sergeant-major-v2.png';
export const RANKS=Object.freeze(rows.map(([code,name,min,max,group,insignia,tone],index)=>Object.freeze({
  code,name,min,max,group,insignia,tone,index,art:artwork[code]||null,
  // Total rank effect, never summed across earlier ranks. All values are proposals.
  attackBp:index*50,hpBp:index*75,coinBp:index*25,presetSlots:1+Math.floor(index/5)
})));
export function normalizeLevel(value){const n=Number(value);return Number.isFinite(n)?Math.max(1,Math.min(250,Math.floor(n))):1;}
export function rankForLevel(value){const level=normalizeLevel(value);return RANKS.find(r=>level>=r.min&&level<=r.max);}
export function draftEffects(value,context){
  // Explicit allow-list: unknown, PvP, clan, territory and scored PvE get nothing.
  const r=rankForLevel(value),allowed=context==='PERSONAL_PVE_UNRANKED';
  return {attackBp:allowed?r.attackBp:0,hpBp:allowed?r.hpBp:0,coinBp:allowed?r.coinBp:0};
}
export const percent=bp=>`${Number((bp/100).toFixed(2))}%`;

import {Assets,Texture,Rectangle} from 'pixi.js';

const ROOT='/preview/project-v-mercenary-system-v1/skill-assets-v2/';
const SUPPORT='/preview/battle-suit-skill-chip-v1/assets/textures/';
export const AUXILIARY_NAMES=['flash','smoke','dust','cinder'];
export async function loadSequence(row){
  if(!row||row.frameCount!==16||row.columns!==4||row.rows!==4)throw new Error('개별 연속 스프라이트 검수가 필요합니다.');
  const url=ROOT+row.runtime,atlas=await Assets.load(url);
  if(atlas.width!==row.cellSize*4||atlas.height!==row.cellSize*4)throw new Error('스프라이트 시트 크기가 제작 기록과 다릅니다.');
  const frames=Array.from({length:16},(_,i)=>new Texture({source:atlas.source,
    frame:new Rectangle(i%4*row.cellSize,Math.floor(i/4)*row.cellSize,row.cellSize,row.cellSize)}));
  const boxes=row.frames.map(f=>f.bounds).filter(Boolean),cell=row.cellSize;
  const extent={x:Math.max(...boxes.flatMap(b=>[Math.abs(b[0]/cell-.5),Math.abs(b[2]/cell-.5)])),
    y:Math.max(...boxes.flatMap(b=>[Math.abs(b[1]/cell-.55),Math.abs(b[3]/cell-.55)]))};
  return {url,atlas,frames,row,extent};
}
export async function loadAuxiliary(){
  const pairs=await Promise.all(AUXILIARY_NAMES.map(async name=>[name,await Assets.load(`${SUPPORT}${name}.webp`)]));
  return Object.fromEntries(pairs);
}
export function releaseFrameViews(sequence){for(const frame of sequence?.frames||[])frame.destroy(false);}
export function sampleSequence(age,lead=.24,life=1.05,authoredKeys=null){
  if(age< -lead||age>=life)return null;
  const keys=authoredKeys||[[-lead,0],[-.035,3],[0,4],[.13,7],[life*.44,10],[life*.75,13],[life,15]];
  let frame=0;
  for(let i=1;i<keys.length;i++)if(age<=keys[i][0]){
    const [a,av]=keys[i-1],[b,bv]=keys[i];frame=av+(bv-av)*(age-a)/(b-a);break;
  }
  const index=Math.max(0,Math.min(15,Math.floor(frame)));
  const opacity=age< -lead+.045?Math.max(0,(age+lead)/.045):age>life*.88?Math.max(0,(life-age)/(life*.12)):1;
  return {index,next:Math.min(15,index+1),blend:frame-index,alpha:opacity};
}

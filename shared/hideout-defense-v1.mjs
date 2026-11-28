const art='/assets/ui/personal-hideout-20261116/';

export const HIDEOUT_DEFENSES=Object.freeze([
  {code:'autocannon',name:'무인기관포',width:245,first:0,interval:6,targets:1,hpPercent:6,
    effect:'개전 시부터 일반 카드 행동 6회마다 침입자 1명에게 최대 체력의 6% 피해',
    cost:{STEEL:10,WIRE:4,CIRCUIT:2}},
  {code:'turret',name:'포탑',image:art+'defense-turret-v2.webp',width:290,first:3,interval:12,targets:3,hpPercent:4,
    effect:'일반 카드 행동 3회 후부터 12회마다 침입자 최대 3명에게 각각 최대 체력의 4% 피해',
    cost:{STEEL:16,WIRE:6,CIRCUIT:3,DRIVE:1}}
].map(v=>Object.freeze({defense:true,image:art+'defense-'+v.code+'.webp',...v})));

export const RAID_VICTORY_ITEMS=Object.freeze([
  {code:'GARAGE_TUNING_ENGINE_1',name:'스틸 인라인 엔진',quantity:1,image:'/assets/ui/garage/tuning-v2/engine-1.webp'},
  {code:'GARAGE_TUNING_FRAME_1',name:'스틸 래더 프레임',quantity:1,image:'/assets/ui/garage/tuning-v2/frame-1.webp'}
]);
export const RAID_VICTORY_PIG_COINS=1;

// Map the saved editor coordinates into the entire selected room, without
// choosing a furnished bay or moving off-screen furniture to preset stations.
export function projectRaidPlacement(piece,roomWidth){
  const width=piece.width/roomWidth;
  const x=(20+piece.width/2+(piece.x/1000)*(roomWidth-piece.width-40))/roomWidth;
  const depth=piece.y/1000,wall=piece.surface==='wall';
  return {x:.045+.91*x,y:wall ? .255+.025*depth : .365+.51*depth,
    width:width*(wall ? .92 : .78+.22*depth),wall};
}

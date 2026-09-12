import {towerError} from './_tower_v3.js';
// Read-only adapter over the existing tower. No reset, INSERT, UPDATE or DDL.
export async function loadTowerV3Legacy(env,user){
  const [progress,season,magic]=await Promise.all([
    env.DB.prepare('SELECT MAX(highest_floor) highest_floor FROM tower_user_progress WHERE user_id=?').bind(user.id).first(),
    env.DB.prepare("SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").first(),
    env.DB.prepare("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first()
  ]);
  if(!season)throw towerError('TOWER_V3_LEGACY','기존 무한의탑 설정을 찾을 수 없습니다.');
  const [ranges,floors]=await Promise.all([
    env.DB.prepare(`SELECT r.start_floor,r.end_floor,r.reward_coin FROM tower_floor_ranges r JOIN battle_monsters m ON m.id=r.monster_id WHERE r.season_id=? AND r.is_active=1 AND m.is_active=1 AND COALESCE(m.tower_enabled,0)=1 ORDER BY (r.end_floor-r.start_floor) ASC,r.id DESC`).bind(season.id).all(),
    env.DB.prepare('SELECT floor_no,reward_coin FROM tower_floors WHERE season_id=? AND is_active=1').bind(season.id).all()
  ]);
  let acquisition={};try{acquisition=JSON.parse(magic?.value||'{}').acquisition?.tower||{};}catch{throw towerError('TOWER_V3_LEGACY','기존 마력석 보상 설정을 확인하세요.');}
  // Preserve range priority over individual-floor fallbacks exactly as the
  // operating fight resolver does. Each tier becomes an explicit first row.
  const entries=new Map();
  for(const r of ranges.results||[])for(let tier=Number(r.start_floor);tier<=Number(r.end_floor);tier++){
    if(!Number.isSafeInteger(tier)||tier<1||tier>10000)throw towerError('TOWER_V3_LEGACY','기존 층 범위를 확인하세요.');
    if(!entries.has(tier))entries.set(tier,Number(r.reward_coin)||Math.max(100,tier*100));
  }
  for(const r of floors.results||[])if(!entries.has(Number(r.floor_no)))entries.set(Number(r.floor_no),Number(r.reward_coin)||Math.max(100,Number(r.floor_no)*100));
  const firstRewards=[...entries].sort((a,b)=>a[0]-b[0]).map(([tier,coin])=>({start:tier,end:tier,coin,
    magicCrystals:acquisition.enabled?Number(acquisition.floorRewards?.find(r=>Number(r.floor)===tier)?.amount||0):0}));
  const highestFloor=Number(progress?.highest_floor||0);
  return {highestFloor,currentFloor:highestFloor+1,firstRewards,legacySeasonId:Number(season.id)};
}

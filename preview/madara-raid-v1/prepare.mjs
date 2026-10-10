import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MADARA_RELEASE,MADARA_PLANS} from '../../functions/_raid_madara.js';

const entries=[
  ['madara-source-reference.png','USER_REFERENCE'],
  ['madara-concept-poster-v1.png','CONCEPT_POSTER_HISTORY'],
  ['madara-battle-v1.png','STATIC_BOSS_REVIEW'],
  ['azure-spirit-v1.png','STATIC_FINAL_FORM_REVIEW'],
  ['battlefield-v1.png','STAGING_ENVIRONMENT_REVIEW']
];
const assets=[];
for(const [file,kind]of entries){
  const url=new URL('assets/'+file,import.meta.url),buffer=await readFile(url),info=await sharp(buffer).metadata(),stats=await sharp(buffer).stats();
  if(kind.startsWith('STATIC_')&&(!info.hasAlpha||stats.channels[3].min!==0))throw new Error(file+' requires real transparent pixels');
  assets.push({file,kind,bytes:(await stat(url)).size,width:info.width,height:info.height,hasAlpha:info.hasAlpha,alphaRange:info.hasAlpha?[stats.channels[3].min,stats.channels[3].max]:null,sha256:createHash('sha256').update(buffer).digest('hex'),originalPreserved:true});
}
const manifest={version:1,release:MADARA_RELEASE,artApproval:'PENDING_USER_VISUAL_REVIEW',generationTool:'image_gen.imagegen (built-in)',prompts:'../art-prompts.json',assets,motionAtlases:[],effectAtlases:[],newAudio:[],note:'Static source poses and staging environment only. Character motion, per-skill continuous frames and licensed sound are not complete.'};
await writeFile(new URL('assets/manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
await writeFile(new URL('readiness.json',import.meta.url),JSON.stringify({version:1,name:'마다라 레이드',state:'LOCAL_PLAYABLE_PREPARATION',release:MADARA_RELEASE,liveRoutesConnected:false,liveMenuConnected:false,operatingDatabaseConnected:false,productionPolicy:{bossCombatPower:null,entryPolicy:null,rewards:null,weeklyLimit:null,launchDate:null},reviewOnly:{bossCombatPower:440000,enrageSeconds:360,minPlayers:3,maxPlayers:6,plans:MADARA_PLANS},renderer:{entry:'ProjectVBattleV3Live.ensureRuntime',extraPixiApplications:0,formation:'SHARED_V3',cardDock:'SHARED_V3'},remaining:['정지 자산 사용자 시각 검수','연속 보스 모션·4대 기믹 개별 효과·최종전 연출 및 사운드','실계정 편성·운영 공대 저장소·동시성·세션 및 이탈 정책 연결','입장·보상·보스 전투력·난이도 확정','실제 3~6인 공대의 네트워크 지연·난이도 검수','별도 출시 승인 후에만 운영 연결 및 배포']},null,2)+'\n');
console.log(JSON.stringify({scope:MADARA_RELEASE.scope,runtimeEnabled:false,assets:assets.map(({file,width,height,hasAlpha,bytes})=>({file,width,height,hasAlpha,bytes}))},null,2));

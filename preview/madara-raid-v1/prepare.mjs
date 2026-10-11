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
const presentation=JSON.parse(await readFile(new URL('assets/presentation-manifest.json',import.meta.url),'utf8'));
const manifest={version:2,release:MADARA_RELEASE,artApproval:'PENDING_USER_VISUAL_REVIEW',generationTool:'image_gen.imagegen (built-in)',prompts:['../art-prompts.json','../art-prompts-v2.json','../art-prompts-v3.json'],assets,motionAtlases:[presentation.atlases.cast],effectAtlases:Object.entries(presentation.atlases).filter(([key])=>key!=='cast').map(([key,value])=>({key,...value})),newAudio:[],note:'Four authored unarmed casting poses; five independent 12-frame effects; original final-form sprite and sword preserved. Boss lines are text, with no recorded voice-over. User visual approval remains pending.'};
await writeFile(new URL('assets/manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
await writeFile(new URL('readiness.json',import.meta.url),JSON.stringify({version:2,name:'마다라 레이드',state:'LOCAL_PARTY_AND_PRESENTATION_REVIEW',release:MADARA_RELEASE,liveRoutesConnected:false,liveMenuConnected:false,operatingDatabaseConnected:false,productionPolicy:{bossCombatPower:null,entryPolicy:null,rewards:null,weeklyLimit:null,launchDate:null},reviewOnly:{bossCombatPower:440000,enrageSeconds:360,minPlayers:3,maxPlayers:6,plans:MADARA_PLANS,tickets:{initial:3,creationCost:1,payer:'CREATOR',joinCost:0,refund:false,persistence:'LOCAL_SERVER_PROCESS_ONLY'},lobby:{listing:true,refresh:true,kick:'HOST_BEFORE_START_ONLY',rejoinBan:'SAME_LOCAL_IDENTITY_SAME_ROOM'},presentation:{bodyFrames:4,effectFrames:60,bossSubtitles:true,voiceOver:false,reviewPlayback:true}},renderer:{entry:'ProjectVBattleV3Live.ensureRuntime',extraPixiApplications:0,formation:'SHARED_V3',cardDock:'SHARED_V3'},remaining:['사용자 시각 검수와 연출 최종 채택','완전체 본체 추가 동작 및 별도 성우·전용 사운드는 미제작','실계정 편성·운영 공대 저장소·영속 거래·동시성·인증 및 이탈 정책 연결','운영 입장·보상·보스 전투력·난이도 확정','실제 3~6인 공대의 네트워크 지연·난이도 검수','별도 출시 승인 후에만 운영 연결 및 배포']},null,2)+'\n');
console.log(JSON.stringify({scope:MADARA_RELEASE.scope,runtimeEnabled:false,assets:assets.map(({file,width,height,hasAlpha,bytes})=>({file,width,height,hasAlpha,bytes}))},null,2));

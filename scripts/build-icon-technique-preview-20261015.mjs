import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {ICON_CARD_ROSTER} from '../shared/icon-card-roster-v1.mjs';
import {ICON_TECHNIQUES} from '../shared/icon-techniques-v1.mjs';
const require=createRequire(import.meta.url),modules=process.env.CNINE_NODE_MODULES;
const {build}=require(modules?path.join(modules,'esbuild'):'esbuild');
const base='preview/icon-techniques-20261015/';
await fs.mkdir(base,{recursive:true});
await build({entryPoints:['preview/project-v-v3/source/project-v-pixi-battle.src.js'],outfile:base+'battle.bundle.js',bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',nodePaths:modules?[modules]:[],define:{__CNINE_NATIVE_CONTINUOUS__:'false'}});
if(!process.argv.includes('--bundle-only')){
 const {iconTechniqueScenario}=await import('../tests/helpers/icon-technique-preparation-fixture.mjs');
 const rows=[],standIns=JSON.parse(await fs.readFile('assets/ui/project-v/characters/fur/manifest-v2.json','utf8')).characters.slice(0,5);
 const present=card=>{const real=ICON_CARD_ROSTER.find(c=>c.cardId===card.cardId||c.code===card.cardId||c.cardId===card.id),byIcon=ICON_CARD_ROSTER.find(c=>String(card.cardId).match(/^CN-1C00000(\d)$/)?.[1]===String(ICON_CARD_ROSTER.indexOf(c)+1)),art=real||byIcon||standIns[(Number(card.slot)||0)%standIns.length];return {...card,cardId:byIcon?card.cardId:art.cardId||card.cardId,image:art.sourceArt,sourceArt:art.sourceArt,originalCardArt:art.sourceArt,title:(art.name||art.member||art.title||'기존 승인 카드')+' · 대역',memberName:art.name||art.member||'',grade:byIcon?'ICON':'FUR',artPurpose:'EXISTING_APPROVED_STAND_IN'};};
 for(const def of ICON_TECHNIQUES){const data=await iconTechniqueScenario(def.code),battleV2=data.battleV2||data;for(const side of ['A','B'])battleV2.teams[side].cards=battleV2.teams[side].cards.filter(c=>!c.isSummon&&!c.summon&&!String(c.id).endsWith(':ICON_WEAPON')).map(present);const events=battleV2.result?.timeline||[];if(!events.some(e=>e.techniqueCode===def.code))throw Error('No server technique event: '+def.code);const payload={...(data.battleV2?data:{}),battleV2,mode:'PVP',battlefieldMode:'PVP',previewOnly:true,preparationOnly:true,actorArtPurpose:'EXISTING_APPROVED_STAND_INS_NOT_CARD_ASSIGNMENTS',playerName:'연출 확인용 대역',opponentName:'기술 준비 전투'};const file=def.code.toLowerCase()+'.json',text=JSON.stringify(payload);await fs.writeFile(base+file,text);rows.push({code:def.code,file,events:events.filter(e=>e.techniqueCode===def.code).length,phases:[...new Set(events.filter(e=>e.techniqueCode===def.code).map(e=>e.phase))],sha256:createHash('sha256').update(text).digest('hex')});}
 await fs.writeFile(base+'manifest.json',JSON.stringify({status:'PREPARATION_ONLY_UNASSIGNED',authority:'SERVER_SIMULATION_WITH_SYMBOL_CAPABILITY',releaseEnabled:false,art:'EXISTING_APPROVED_STAND_INS',numericValues:'FIXTURE_ONLY_NOT_PRODUCTION_DEFAULTS',fixtures:rows},null,2)+'\n');
 console.log(JSON.stringify(rows));
}

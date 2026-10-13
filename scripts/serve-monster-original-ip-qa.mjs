import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ORIGINAL_IP_MONSTERS} from '../shared/monster-original-ip-data-v1.mjs';
import {presentOriginalIpResponse} from '../shared/monster-original-ip-presentation-v1.mjs';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),port=8876;
const fixtures=Object.fromEntries(ORIGINAL_IP_MONSTERS.map(e=>{
 const id=e.monsterIds[0]||(e.raidCode==='CORE_PROTOCOL'?'CORE_ARCHEON':e.raidCode)||`RAID:${e.raidId}:BOSS`;
 const monster={id,name:e.previousNames[0]||e.name,image:e.sourceArt,isBoss:true,is_boss:1,battle_power:90000};
 const battleV2=createPveBattleV2({cards:REVIEW_DECK,monster,bossUltimatePercent:20,seed:83});
 return [e.key,presentOriginalIpResponse('battle/fight',{mode:'PVE',cards:REVIEW_DECK,monster,battleV2,bossUltimate:{name:'궁극기',mediaUrl:'removed.mp4',damagePercent:20},reviewOnly:true})];
}));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav'};
http.createServer((req,res)=>{
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 if(url.pathname==='/__original-ip-fixtures'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(fixtures));return;}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Original IP runtime QA: http://127.0.0.1:${port}/preview/monster-original-ip-sd-20261013-v1/live-check.html`));

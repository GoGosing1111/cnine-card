import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const details=file=>{const b=fs.readFileSync(path.join(root,file));assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return {path:file,width:b.readUInt32BE(16),height:b.readUInt32BE(20),bitDepth:b[24],colorType:b[25],bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex').toUpperCase()}};
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const bongsoonApproval=read('bongsoon-approval-20261001.json'),frameApproval=read('frame-approval-20261001.json'),joeunAdoption=read('joeun-adoption-20261001.json');
const adoptedJoeun=details(joeunAdoption.sourceArt);assert.equal(adoptedJoeun.sha256,joeunAdoption.sha256);
const entries=[
 {name:'나무늘봉순',concept:'설원의 특수부대 · 쌍기관단총',expectedRank:'SS',sourceArt:bongsoonApproval.sourceArt,status:'APPROVED_SOURCE_ART',approval:'bongsoon-approval-20261001.json',approvedScope:['entire sourceArt exactly as latest user attachment'],change:'사용자가 다시 첨부한 이미지를 바이트 단위로 그대로 보존. 이후 얼굴·의상·총기·파지 수정 금지.'},
 {name:'조은',concept:'네온 장비 흑백 특수부대 · 확장형 레이저 중화기',expectedRank:'SS',sourceArt:'assets/joeun-neon-source-art-v11-straightened-cannon.png',status:'ADOPTED_COMPOSITION_LOCAL_CORRECTION_REVIEW_PENDING',prompt:'prompt-joeun-v11.json',adoption:'joeun-adoption-20261001.json',adoptedBase:adoptedJoeun,generationIntent:'PRECISE_FORWARD_WEAPON_EDIT_ONLY',change:'사용자 채택본에서 앞쪽으로 휘어 보이는 레이저포 축·상하 레일을 직선으로 맞추는 국소 보정. 채택 원본은 별도 무가공 보존.'}
].map(entry=>{const source=details(entry.sourceArt);assert.ok(source.width>=1024&&source.height>=1536);assert.equal(source.width*3,source.height*2);assert.equal(source.bitDepth,8);assert.ok([2,6].includes(source.colorType));return {...entry,source}});
assert.equal(entries[0].source.sha256,bongsoonApproval.sha256);
assert.equal(entries[1].source.colorType,2);
const frame=details(frameApproval.asset);assert.equal(frame.sha256,frameApproval.sha256);assert.equal(frame.colorType,6);assert.equal(frame.width,1024);assert.equal(frame.height,1536);
const anchor=details('../../assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png');assert.equal(anchor.sha256,'629564D768A4BCEFCD0BE746E744DA49A64F1CF2BE7D048E7485FC6CB14FF874');
const archive=fs.readdirSync(path.join(root,'assets')).filter(f=>f.endsWith('.png')&&!entries.some(e=>e.sourceArt==='assets/'+f)&&f!=='mercenary-limited-frame-v1.png').map(f=>details('assets/'+f));
const generationInputs=read('prompt-joeun-v11.json').references.map(ref=>({...details(ref.path),role:ref.role}));
const manifest={version:3,dateKST:'2026-10-01',scope:'SOURCE_ART_AND_FRAME_PREVIEW',method:'built-in image_gen; selected user attachment preserved byte-for-byte',userReview:'BONGSOON_FRAME_APPROVED_JOEUN_ADOPTED_LOCAL_FIX_REVIEW',rankStatus:'EXPECTED_NOT_CONFIRMED',entries,frame:{...frame,status:'APPROVED_FRAME',approval:'frame-approval-20261001.json',displayFit:{artScalePercent:85.6,leftPercent:7.2,topPercent:5.6,aspectRatioPreserved:true,sourceAndFramePixelsUnchanged:true}},references:fs.readdirSync(path.join(root,'references')).filter(f=>f.endsWith('.png')).map(f=>details('references/'+f)),generationInputs,styleAnchor:{...anchor,role:'PAINTING_STYLE_ONLY'},archive:{status:'HISTORICAL_ONLY_NOT_CURRENT_SELECTION',assets:archive,prompts:fs.readdirSync(root).filter(f=>/^prompts.*\.json$|^prompt-.*\.json$/.test(f))},futureRules:{location:'../../AGENTS.md',face:'채택된 조은 얼굴·구도·포즈 고정 / 앞쪽 무기 축만 국소 보정',hair:'자연스러운 연속 모발 흐름 / 층층이 갈라진 판·띠형 헤어 금지',approvedAssets:'봉순·프레임·조은 채택 재첨부 원본의 해시 고정'},technicalQA:{sourcePixels:'raw original files preserved without recompression',upscaled:false,frameSeparateFromSourceArt:true,browserReport:fs.existsSync(path.join(root,'qa-preview-v11.json'))?'qa-preview-v11.json':null},liveRegistration:false,battleSprite:'NOT_REQUESTED',skills:'NOT_REQUESTED'};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({checkedArt:entries.length,frameHash:frame.sha256,status:manifest.userReview}));

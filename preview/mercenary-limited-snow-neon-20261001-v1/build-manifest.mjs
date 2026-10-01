import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const details=file=>{
 const b=fs.readFileSync(path.join(root,file));
 assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 return {path:file,width:b.readUInt32BE(16),height:b.readUInt32BE(20),bitDepth:b[24],colorType:b[25],bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex').toUpperCase()};
};
const bongsoonApproval=read('bongsoon-approval-20261001.json');
const joeunApproval=read('joeun-approval-20261001.json');
const inesSelection=read('ines-preview-addition-20261001.json');
const frameRejection=read('frame-rejection-20261001.json');
const frameDesign=read('frame-design-v2.json');
const entries=[
 {name:'나무늘봉순',concept:'설원의 특수부대 · 쌍기관단총',approval:'bongsoon-approval-20261001.json',status:'APPROVED_SOURCE_ART',expectedRank:'SS',rankStatus:'EXPECTED_NOT_CONFIRMED',record:bongsoonApproval},
 {name:'조은',concept:'네온 장비 흑백 특수부대 · 확장형 레이저 중화기',approval:'joeun-approval-20261001.json',status:'APPROVED_SOURCE_ART',expectedRank:'SS',rankStatus:'EXPECTED_NOT_CONFIRMED',record:joeunApproval},
 {name:'이네스',concept:'SSS 리미티드',selection:'ines-preview-addition-20261001.json',status:inesSelection.status,rank:inesSelection.rank,rankStatus:inesSelection.rankStatus,edition:inesSelection.edition,method:inesSelection.method,record:inesSelection}
].map(({record,...entry})=>{
 const source=details(record.sourceArt);
 assert.equal(source.sha256,record.sha256);
 assert.ok(source.width>=1024&&source.height>=1536);
 assert.equal(source.width*3,source.height*2);
 assert.equal(source.bitDepth,8);assert.equal(source.colorType,2);
 return {...entry,sourceArt:record.sourceArt,source,approvedScope:record.scope??'Entire source illustration; preserve bytes without further edits'};
});
const frame=details(frameDesign.asset);
assert.equal(frame.sha256,frameDesign.sha256);
assert.equal(frame.colorType,6);assert.equal(frame.bitDepth,8);
assert.equal(frame.width,1024);assert.equal(frame.height,1536);
const retired=details(frameRejection.asset);assert.equal(retired.sha256,frameRejection.sha256);
const anchor=details('../../assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png');
assert.equal(anchor.sha256,'629564D768A4BCEFCD0BE746E744DA49A64F1CF2BE7D048E7485FC6CB14FF874');
const currentPaths=new Set([...entries.map(e=>e.sourceArt),frame.path]);
const generationInputs=read(frameDesign.prompt).references.map(ref=>({...details(ref.path),role:ref.role}));
const manifest={
 version:5,dateKST:'2026-10-01',scope:'LIMITED_SOURCE_ART_COLLECTION_PREVIEW',
 method:'built-in image_gen; approved source files preserved byte-for-byte',
 userReview:'BONGSOON_JOEUN_FRAME_APPROVED_INES_USER_SELECTED_PREVIEW',
 rankStatus:'PER_ENTRY_INES_SSS_USER_DESIGNATED_OTHERS_EXPECTED_SS',entries,
 frame:{...frame,status:'APPROVED_FRAME',approval:'frame-approval-v2-20261001.json',design:'frame-design-v2.json',prompt:frameDesign.prompt,displayFit:frameDesign.displayFit},
 retiredFrames:[{...retired,status:'REJECTED_FRAME',record:'frame-rejection-20261001.json',previousApprovalRevoked:true}],
 generationInputs,
 references:fs.readdirSync(path.join(root,'references')).filter(f=>f.endsWith('.png')).map(f=>details('references/'+f)),
 styleAnchor:{...anchor,role:'PAINTING_STYLE_ONLY'},
 archive:{status:'HISTORICAL_ONLY_NOT_CURRENT_SELECTION',assets:fs.readdirSync(path.join(root,'assets')).filter(f=>f.endsWith('.png')&&!currentPaths.has('assets/'+f)).map(f=>details('assets/'+f)),prompts:fs.readdirSync(root).filter(f=>/^prompts.*\.json$|^prompt-.*\.json$/.test(f))},
 futureRules:{location:'../../AGENTS.md',approvedArt:'봉순 원본·조은 V11 전체 승인, 해시 고정',frame:'V1 폐기. 사용자 재첨부 V2 프레임 전체 승인, SHA-256 고정, 추가 수정 금지.',hair:'자연스러운 연속 모발 흐름 / 층층이 갈라진 판·띠형 헤어 금지'},
 technicalQA:{sourcePixels:'Approved originals and Ines user attachment unchanged',upscaled:false,frameSeparateFromSourceArt:true,pngReport:'qa-frame-v2.json',browserReport:fs.existsSync(path.join(root,'qa-preview-ines-20261001.json'))?'qa-preview-ines-20261001.json':null},
 liveRegistration:false,battleSprite:'NOT_REQUESTED',skills:'NOT_REQUESTED'
};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({checkedSourceArt:entries.length,frameHash:frame.sha256,status:manifest.userReview}));

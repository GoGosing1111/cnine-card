import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const [directory,root]=process.argv.slice(2),out=path.resolve(directory),roster=JSON.parse(fs.readFileSync(path.join(out,'public-roster.json'),'utf8'));
assert.equal(roster.memberCount,128);assert.equal(roster.clans.length,8);assert.equal(roster.clans.flatMap(c=>c.members).length,128);
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const source=file=>{const f=path.join(root,file);return fs.existsSync(f)?fs.readFileSync(f):execFileSync('git',['show','HEAD:'+file],{cwd:root,maxBuffer:35e6,stdio:['ignore','pipe','pipe']});};
const data=(file,mime)=>'data:'+mime+';base64,'+source(file).toString('base64');
const panel=data('assets/ui/mercenary-codex/command-20261021/panel-v3.webp','image/webp');
const sans=data('assets/fonts/lich-raid/NotoSansKR-lich-v1.woff2','font/woff2'),title=data('assets/fonts/clan-camp/BlackHanSans-Regular.ttf','font/ttf');
const at=new Date(roster.effectiveAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const sorted=members=>[...members].sort((a,b)=>Number(b.elder)-Number(a.elder)||a.nickname.localeCompare(b.nickname,'ko'));
const cards=roster.clans.map(c=>`<section class="clan panel" style="--clan:${c.color}"><div class="clan-head"><img src="${data(c.markImage.slice(1),'image/webp')}" alt=""><div><small>CLAN ${String(c.id).padStart(2,'0')}</small><h2>${e(c.name)}</h2></div><span class="count">${c.members.length}<small>명</small></span></div><div class="columns"><span>최종 소속 명단</span><span>이전 소속</span></div><ol>${sorted(c.members).map(m=>`<li data-nickname="${e(m.nickname)}"><span class="role ${m.elder?'elder':''}">${m.elder?'원로':'소속'}</span><span class="nickname">${e(m.nickname)}</span><span class="previous ${m.moved?'moved':''}">${m.moved?'이전 '+e(m.previousClan):'소속 유지'}</span></li>`).join('')}</ol></section>`).join('');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>리버스콜 8개 클랜 최종 명단</title><style>
@font-face{font-family:NoticeSans;src:url('${sans}')}@font-face{font-family:NoticeTitle;src:url('${title}')}
*{box-sizing:border-box}html,body{margin:0}body{font-family:NoticeSans,'Malgun Gothic','Segoe UI Emoji',sans-serif;background:#070d17;color:#edf5ff;width:2160px}.poster{width:2160px;padding:100px 92px 76px;background:radial-gradient(ellipse at 50% 0,#172e4c 0,transparent 40%),linear-gradient(155deg,#0b1728,#080f1c 58%,#102035)}.eyebrow{color:#b8e561;font-size:28px;letter-spacing:7px;font-weight:900}.topline{display:flex;justify-content:space-between;align-items:center}.date{color:#9fb2cc;font-size:25px;letter-spacing:1px}h1{font-family:NoticeTitle,'Malgun Gothic',sans-serif;font-size:126px;line-height:1.15;font-weight:400;margin:44px 0 16px;letter-spacing:-4px}h1 span{color:#c1f26c}.subtitle{font-size:36px;color:#bbcce1;line-height:1.7;margin:0 0 44px}.stats{display:flex;align-items:center;gap:38px;border-block:2px solid #41617f;padding:30px 4px;margin-bottom:36px}.stat{flex:1;font-size:27px;color:#9fb5d1}.stat b{font-family:NoticeTitle,sans-serif;font-size:71px;color:#fff;letter-spacing:-2px;margin-right:14px;font-weight:400}.stat small{font-size:29px;color:#e2efc9}.legend{font-size:27px;line-height:1.8;color:#afc1da;margin:0 0 46px;display:flex;justify-content:space-between}.legend b{color:#c1f26c}.grid{display:grid;grid-template-columns:1fr 1fr;gap:38px}.panel{border:24px solid transparent;border-image:url('${panel}') 48 fill / 24px / 0 stretch}.clan{padding:14px 22px 25px;min-width:0;background:#11243a}.clan-head{height:156px;display:flex;align-items:center;gap:24px;border-bottom:3px solid var(--clan);padding-bottom:20px}.clan-head img{width:132px;height:132px;object-fit:contain;filter:drop-shadow(0 3px 12px #0008)}.clan-head small{font-size:22px;letter-spacing:4px;color:#a8bfda}.clan-head h2{font-family:NoticeTitle,sans-serif;font-size:64px;line-height:1.1;font-weight:400;margin:12px 0 0}.count{margin-left:auto;font-family:NoticeTitle,sans-serif;font-size:85px;white-space:nowrap}.count small{font-family:NoticeSans,sans-serif;color:#c1f26c;font-size:27px;margin-left:8px;letter-spacing:0}.columns{display:flex;justify-content:space-between;padding:22px 0 15px;color:#9cb5d1;font-size:24px;letter-spacing:1px}.columns span:last-child{min-width:145px;text-align:right}ol{padding:0;margin:0;list-style:none}li{display:flex;align-items:center;gap:17px;height:59px;border-top:1px solid #ffffff10}.role{font-size:19px;font-weight:700;flex:0 0 56px;text-align:center;color:#7f9bb8;border:1px solid #526c8355;padding:4px 0}.role.elder{color:#c4f878;border-color:#a0d84b7a;background:#a8d85310}.nickname{font-size:34px;font-weight:650;letter-spacing:-.5px;white-space:nowrap;min-width:0;flex:1}.previous{font-size:23px;flex:0 0 145px;text-align:right;color:#7590aa;white-space:nowrap}.previous.moved{color:#c5d5e8}.footer{margin-top:52px;border-top:2px solid #4a6381;padding:36px 4px 0;display:flex;justify-content:space-between;align-items:flex-start;gap:40px}.footer strong{color:#c1f26c;font-size:34px}.footer p{font-size:27px;color:#b0c4dc;line-height:1.8;margin:12px 0 0}.footer .stamp{text-align:right;color:#8da6c3;font-size:25px;line-height:1.9}.footer b{color:#e2efff}.notice{margin-top:28px;color:#93aac4;font-size:24px;line-height:1.7}
</style><div class="poster"><div class="topline"><span class="eyebrow">REVERSE CALL · CLAN ROSTER</span><span class="date">2026.10.25 UPDATE</span></div><h1><span>8개 클랜</span>, 새로운 편성</h1><p class="subtitle">8개 클랜 재편 후 란x2 탈퇴를 반영한 최신 128명 명단입니다.<br>아래 명단에서 최종 소속과 원로, 이전 클랜을 확인해 주세요.</p><div class="stats"><div class="stat"><b>8</b><small>개 클랜</small></div><div class="stat"><b>128</b><small>명 현재 소속</small></div><div class="stat"><b>23</b><small>명 원로</small></div><div class="stat"><b>25</b><small>명씩 최대 정원</small></div></div><p class="legend"><span><b>원로</b> DK~FM 각 3명 · DC 2명 · 원로 우선, 닉네임순</span><span>현재 명단 중 재편 이동 ${roster.moved}명 · 소속 유지 ${128-roster.moved}명</span></p><main class="grid">${cards}</main><div class="footer"><div><strong>정규 클랜전 화·수·목·토 21~22시</strong><p>세력전 매일 랜덤 1회 · 4개 이상 점령 시 승점 +1<br>챔피언스리그 개최 · 새 가입 방식 보류</p></div><div class="stamp"><b>점령지 · 공동 자금 · 아지트 유지</b><br>DC 란x2 탈퇴 반영 · 다른 소속 유지<br>${e(at)} 적용 기준</div></div><p class="notice">※ 개인 재화·보유 카드·과거 보상은 변경하지 않았습니다. 게시 이후 가입·닉네임 변경 등이 발생하면 게임 내 최신 명부를 기준으로 확인해 주세요.</p></div></html>`;
const htmlPath=path.join(out,'clan-resume-roster-poster.html');fs.writeFileSync(htmlPath,html);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:2160,height:1300},deviceScaleFactor:1});await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.locator('img').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode())));
 const fit=await page.locator('.nickname').evaluateAll(ns=>ns.map(n=>{let size=34;while(n.scrollWidth>n.clientWidth+.5&&size>23){size--;n.style.fontSize=size+'px';}return {name:n.textContent,size,overflow:n.scrollWidth>n.clientWidth+1};}));assert(fit.every(r=>!r.overflow),'A nickname is clipped');
 assert.equal(await page.locator('[data-nickname]').count(),128);assert.equal(await page.locator('.role.elder').count(),23);
 assert.deepEqual((await page.locator('[data-nickname]').evaluateAll(ns=>ns.map(n=>n.dataset.nickname))).sort(),roster.clans.flatMap(c=>c.members.map(m=>m.nickname)).sort());
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),2160);
 const bounds=await page.locator('.poster').boundingBox();await page.screenshot({path:path.join(out,'clan-resume-roster-poster.png'),fullPage:true});
 const issues=await page.locator('li').evaluateAll(ns=>ns.filter(n=>{const b=n.getBoundingClientRect();return Array.from(n.children).some(c=>{const r=c.getBoundingClientRect();return r.top<b.top-1||r.bottom>b.bottom+1;});}).length);assert.equal(issues,0);
 const manifest={checkedAt:new Date().toISOString(),width:2160,height:Math.ceil(bounds.height),names:128,elders:23,moved:roster.moved,clippedNames:0,fonts:fit.map(f=>f.size),files:[]};
 for(const file of ['clan-resume-roster-poster.png','clan-resume-roster-poster.html']){const bytes=fs.readFileSync(path.join(out,file));manifest.files.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 fs.writeFileSync(path.join(out,'publication-verification.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({poster:true,width:manifest.width,height:manifest.height,names:128,elders:23,moved:roster.moved}));
}finally{await browser.close();}

const summary=roster.clans.map(c=>`${c.name} ${c.members.length}명`).join(' / ');
const kst=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const dates=roster.regularStarts.map((d,i)=>`${i+1}라운드: ${kst(d)}~22:00`).join('\n');
const firstFaction=roster.factionSchedule[0];
const notice=`[리버스콜] 8개 클랜 정규전·세력전 재개 및 최신 명단 안내

안녕하세요. 리버스콜 운영팀입니다.
8개 클랜 재편에 이어 정규 클랜전과 세력전을 재개합니다. 경기 요일·시간, 세력전 점령 조건과 승점 합산 방식, 최신 소속 명단을 아래와 같이 안내합니다.

1. 8개 클랜 및 현재 인원
DK·삼성·T1·한화·LG·롯데·FM·DC의 8개 클랜으로 운영합니다. 클랜당 정원은 25명, 전체 정원은 200명입니다.
${summary}
기존 129명 균등 재편 뒤 DC 소속 란x2의 탈퇴를 반영하여 현재 128명입니다. 이번 탈퇴 반영으로 다른 클랜원을 다시 이동시키지는 않았습니다.
129명 재편 당시에는 111명이 이동하고 18명이 소속을 유지했습니다. 첨부한 최신 128명 포스터에는 현재 소속과 재편 전 소속을 함께 표시했습니다.

2. 정규 클랜전 재개 일정
매주 화요일·수요일·목요일·토요일 21:00~22:00, 한국시간 기준입니다. 이번 시즌은 8개 클랜이 다른 7개 클랜과 한 번씩 만나는 7라운드 단일 순환 방식이며, 하루 4경기씩 총 28경기입니다.
${dates}
첫 경기는 10월 27일 화요일 21시입니다. 이번 시즌 마지막 경기는 11월 5일 목요일 22시에 종료합니다.

기존 정규전 참여·전투 방식과 행동력, 공격/지원 제한, 정규전 승점·보상 설정을 유지합니다. 참여 일정 화면에서 수요일을 포함한 출전 가능 요일을 등록해 주세요. 이번 재개는 현재 클랜 명단을 그대로 연결하며, 예전 모집·드래프트를 다시 진행하지 않습니다.

3. 세력전: 하루 1회 랜덤, 회차당 3시간
매일 하루 1회 무작위로 정해진 시간에 세력전이 열립니다. 예전 하루 2회에서 1회로 변경됩니다. 정확한 시작 시각은 게임 내 ‘일정·보상’에서 확인해 주세요.
${firstFaction?`재개 당일 첫 예정 회차: ${kst(firstFaction.startsAt)}~${kst(firstFaction.endsAt)}.`:'재개 당일 온전한 3시간 구간을 확보할 수 없어 다음 날부터 일정이 열립니다.'}
기존 영토전과 겹치면 세력전은 일시중단되거나 순연됩니다. 남은 진행시간을 유지하므로 실제 종료 시각이 처음 안내된 시각보다 늦어질 수 있습니다.
점령지 소유권은 유지되며, 이번 재개로 서울 25개 구를 초기화하지 않습니다.

4. 세력전 점령 조건과 정규 시즌 승점
세력전 회차 종료 시 4개 이상을 점령한 클랜은 정규 시즌 승점 1점을 받습니다. 점령 조건은 기존 8개에서 4개로 낮아집니다.
• 종료 시 3개 점령: 세력전 승점 0점
• 종료 시 4개 점령: 세력전 승점 1점
• 종료 시 8개 점령: 세력전 승점 1점
점령한 지역마다 1점씩 받는 방식이 아닙니다. 조건을 충족한 클랜에 회차당 한 번만 1점을 합산하며, 중간 점령·재점령 횟수는 승점으로 계산하지 않습니다.
정규 시즌 통합 순위에는 정규 클랜전 승점과 세력전 승점이 함께 표시됩니다. 각 클랜의 총 승점 아래에서 세력전 기여 점수를 볼 수 있습니다. 동점은 정규전 누적 전투점수·득실차 등 기존 순위 기준을 따릅니다.
시즌 종료 시각까지 끝난 세력전만 해당 시즌에 포함됩니다. 과거 회차에 승점을 소급 적용하지 않으며, 예전 월요일 주간 점령지 비례 정산은 재개하지 않습니다.

5. 세력전 보상 안내
회차 종료 시 4개 이상 점령한 클랜의 해당 회차 참여자에게 기존 금액을 유지하여 지급합니다.
• 코인 3,000억
• 마스터의 별 30만 개
• 미스틱 에너지 300개
• 피그코인 200개
보상은 메시지함에서 수령합니다. 소속만 있고 해당 회차에 참여하지 않은 인원은 참여자 보상 대상이 아닙니다. 진행 중인 회차는 시작 당시 설정을 유지하며, 기존 회차 보상을 다시 지급하지 않습니다. 클랜 공동 자금은 기존 지역당 수입 설정에 따라 별도로 정산됩니다.

6. 란x2 탈퇴 및 원로 현황
DC의 란x2가 현재 클랜 명단에서 제외되었습니다. 해당 계정은 삭제하지 않으며 보유 카드·재화·과거 전적을 유지합니다.
DK·삼성·T1·한화·LG·롯데·FM은 원로 각 3명, DC는 남은 원로 2명으로 총 23명입니다. 탈퇴자의 대체 원로를 임의 지정하지 않았습니다.
공통 재편 당시 비웠던 부대·주둔 편성 이후 새로 등록한 다른 클랜원의 편성은 이번 재개에서 유지했습니다.

7. 보류되는 사항 및 보존 내용
챔피언스리그 개최는 계속 보류합니다. 정규전 재개만으로 자동 개최하지 않으며, 다음 일정은 별도로 안내합니다.
새 가입 방식은 구상만 하고 시행을 보류합니다. 기존 원로 심사 가입 방식을 유지합니다.
개인 재화·카드, 클랜 점령지·공동 자금·아지트 단계, 기존 대기 신청, 과거 시즌 전적과 보상 기록은 보존합니다.

8. 순위표·명단 확인
순위표를 남색 공통 패널과 연두 선택 버튼으로 정리했습니다. 총 승점과 세력전 기여 점수를 같은 행에서 확인하고, 상세 규칙 및 정산 기록은 펼쳐 볼 수 있습니다.
첨부 포스터는 원로 우선·닉네임순으로 정리한 현재 128명의 명단입니다.
적용 기준: ${at} (한국시간)
작성 이후 가입·탈퇴·닉네임 변경이 있으면 게임 내 클랜 본부의 최신 명부를 확인해 주세요.

감사합니다.
리버스콜 운영팀
`;
fs.writeFileSync(path.join(out,'clan-resume-user-notice.txt'),notice);
const lists=roster.clans.map(c=>`■ ${c.name} — ${c.members.length}명\n`+sorted(c.members).map(m=>`${m.elder?'[원로] ':''}${m.nickname}${m.moved?' (이전 '+m.previousClan+')':' (소속 유지)'}`).join('\n')).join('\n\n');
fs.writeFileSync(path.join(out,'clan-resume-roster.txt'),`리버스콜 8개 클랜 최신 명단\n${at} 적용 기준 · 128명\n\n`+lists+'\n');

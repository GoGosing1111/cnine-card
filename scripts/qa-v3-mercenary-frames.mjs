import fs from 'node:fs/promises';
import path from 'node:path';
import {MERCENARY_SKILLS} from '../shared/mercenary-skills-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base='http://127.0.0.1:8899',out=path.resolve('../qa/mercenary-impact-review');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base+'/preview/project-v-mercenary-system-v1/skills.html');await page.waitForFunction(()=>window.MercenarySkillLab?.diagnostics().ready);
 const records=[];
 for(const width of[1440,390]){
  await page.setViewportSize({width,height:1100});
  for(const skill of MERCENARY_SKILLS.slice(0,Number(process.env.QA_FRAME_LIMIT)||17)){
   const gun=['PRECISION','CONVERGE','STILLNESS','BARRAGE','FINISH','RESTRAIN','DOUBLE_BEAT'].includes(skill.visual.motion);
   await page.selectOption('#previewMercenary',gun?'V-032':['INTERCEPT','BLOOM'].includes(skill.visual.motion)?'V-029':skill.visual.motion==='INTERRUPT'?'V-038':['STITCH','VEIL','RELAY'].includes(skill.visual.motion)?'V-018':'V-030');
   await page.evaluate(id=>window.MercenarySkillLab.configure(id),skill.id);
   await page.click('#replay');await page.waitForFunction(()=>window.MercenarySkillLab.fx.time>.1);await page.click('#play');
   const iframe=page.locator('#battleFrame');await iframe.scrollIntoViewIfNeeded();
   for(const [phase,at] of [['contact',skill.visual.impacts[0]+.065],['last',skill.visual.impacts.at(-1)+.14]]){
    await page.evaluate(async at=>{const lab=window.MercenarySkillLab;lab.fx.seek(at);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));lab.engine.app.render();},at);await page.waitForTimeout(60);
    const file=`${skill.id}-${width}-${phase}.png`;await iframe.screenshot({path:path.join(out,file)});
    records.push({skill:skill.id,name:skill.name,width,phase,file});
   }
  }
  console.log(`${width}: 17 skills contact + last stage captured.`);
 }
 await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>용병 스킬 충돌 검수</title><style>body{background:#0b151c;color:#ecf4fa;font:16px sans-serif;padding:24px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}figure{margin:0}img{width:100%}a{color:inherit}</style><h1>17종 충돌 · 마지막 단계</h1><p>실제 V3 캔버스. 사용자 시각 승인 대기. 아래 선택은 시연 모델이며 용병 배정이 아닙니다.</p><div class="grid">${records.map(r=>`<figure><a href="${r.file}"><img loading="lazy" src="${r.file}" alt="${r.name} ${r.phase}"></a><figcaption>${r.skill} · ${r.name} · ${r.width} · ${r.phase}</figcaption></figure>`).join('')}</div></html>`);
 await page.evaluate(()=>window.MercenarySkillLab.dispose());await page.waitForTimeout(100);if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}

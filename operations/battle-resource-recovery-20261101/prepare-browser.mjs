import fs from 'node:fs';
import assert from 'node:assert/strict';
let s=fs.readFileSync('operations/ios-safari-memory-20261031/profile.mjs','utf8');
const replace=(a,b)=>{assert(s.includes(a),a);s=s.replace(a,b);};
replace("import {chromium}","import {chromium,webkit}");
replace("(process.env.QA_SAMPLE||'before')","(process.env.QA_SAMPLE||'local-chromium')");
replace("const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];","const browser=process.env.QA_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];");
replace("(process.env.QA_DESKTOP==='1'?[1440]:[390])","(process.env.QA_ENGINE==='webkit'||publicBase?[390]:[1440,390])");
replace("(publicBase?['PVP']:['PVE','PVP'])","(publicBase?['PVE','PVP']:['PVE','PVE','PVP'])");
replace("    await ensureFeatureResources('battleV2');if(!window.__capOriginalMount){window.__capOriginalMount=ProjectVPixiBattle.mountForBattle;ProjectVPixiBattle.mountForBattle=async(...a)=>(window.__capEngine=await window.__capOriginalMount(...a));}",`    if(!window.__capEnsure){window.__capEnsure=ensureFeatureResources;window.ensureFeatureResources=async key=>{
      const result=await window.__capEnsure(key);
      if(key==='battleV2'&&window.__capRuntime!==ProjectVPixiBattle){
        window.__capRuntime=ProjectVPixiBattle;const mount=ProjectVPixiBattle.mountForBattle;
        ProjectVPixiBattle.mountForBattle=async(...a)=>(window.__capEngine=await mount(...a));
      }
      return result;
    };}
    // Exercise replacement of an obsolete renderer when switching PVE to PVP.
    if(mode==='PVP'&&!${'Boolean(publicBase)' }&&window.ProjectVPixiBattle)ProjectVPixiBattle.runtimeVersion='obsolete-runtime';`);
// The public/local flag is passed explicitly to the page, without embedding Node globals.
replace("async({data,deck,mode})=>","async({data,deck,mode,publicBase})=>");
replace("},{data,deck,mode});","},{data,deck,mode,publicBase});");
replace("   await page.waitForTimeout(7000);","   await page.waitForTimeout(800);");
replace("mode,label,rgbaMiB:data.rgbaBytes/1048576,images:data.textures.length","mode,label,rgbaMiB:data.rgbaBytes/1048576,images:data.textures.length");
replace("entry:mode==='DUO'?'owner-local duo payload through common ranked renderer':'actual start button'","entry:'actual start button; no preloading bypass',staleRendererRecovery:mode==='PVP'&&!publicBase");
replace("}catch(e){fs.writeFileSync(new URL('failure.json',out)","}catch(e){fs.writeFileSync(new URL('failure.json',out)");
fs.writeFileSync('operations/battle-resource-recovery-20261101/browser.mjs',s);
console.log('Prepared actual main-page start/result/return checks, repeat entry and stale-renderer replacement.');

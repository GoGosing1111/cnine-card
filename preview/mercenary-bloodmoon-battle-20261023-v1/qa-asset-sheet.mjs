import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1536,height:1200},deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:8467/preview/mercenary-bloodmoon-battle-20261023-v1/');
 const cells=[['diim','00'],['diim','03'],['diim','07'],['diim','11'],['diim','15'],['dagger','00'],['dagger','01']];
 await page.setContent('<style>body{margin:0;background:#ccc;font:16px system-ui;display:grid;grid-template-columns:repeat(3,512px)}figure{margin:0;background:#fff;border:1px solid #aaa;box-sizing:border-box;height:550px}img{width:510px;height:510px;object-fit:contain}figcaption{padding:8px}</style>'+cells.map(([slug,index])=>`<figure><figcaption>${slug} frame ${index}</figcaption><img src="http://127.0.0.1:8467/preview/mercenary-bloodmoon-battle-20261023-v1/assets/${slug}/frames/${index}.png"></figure>`).join(''));
 await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
 await page.screenshot({path:fileURLToPath(new URL('qa/weapon-feet-detail.png',import.meta.url)),fullPage:true});
}finally{await browser.close();}

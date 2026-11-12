import { createAdvancementWindow } from './AdvancementWindow.mjs';
import { createAdvancementClient } from './client.mjs';
import { ROLE_BY_ID } from '../../shared/mercenary-advancement-v1.mjs';

const base = '/assets/ui/mercenary-advancement-v1/';
let windowInstance, styles, manifest, token;
function stylesheet(href) {
  return new Promise((resolve,reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    link.onload = resolve; link.onerror = () => { link.remove(); reject(Error('전직창 디자인을 불러오지 못했습니다.')); };
    document.head.append(link);
  });
}
async function preview(id) {
  const dialog = document.createElement('dialog');
  dialog.className = 'adv-effect-preview';
  dialog.innerHTML = '<h2></h2><canvas width="320" height="320" aria-label="발동 이펙트"></canvas><p role="status">불러오는 중…</p><div><button type="button">다시 재생</button><button type="button" autofocus>닫기</button></div>';
  dialog.querySelector('h2').textContent = ROLE_BY_ID.get(id).name;
  document.body.append(dialog); dialog.showModal();
  const [replay, close] = dialog.querySelectorAll('button'), canvas = dialog.querySelector('canvas'), ctx = canvas.getContext('2d');
  let frame = 0;
  const stop = () => { cancelAnimationFrame(frame); frame = 0; };
  const dismiss = () => { stop(); dialog.close(); dialog.remove(); window.removeEventListener('pagehide', dismiss); };
  close.onclick = dismiss; dialog.addEventListener('cancel', e => { e.preventDefault(); dismiss(); });
  window.addEventListener('pagehide', dismiss, { once: true }); replay.disabled = true;
  try {
    manifest ||= fetch(base+'effects.json').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{manifest=null;throw e;});
    const spec = (await manifest).effects[id], image = new Image(); image.src = base+spec.atlas; await image.decode();
    if (!dialog.open) return;
    const play = () => {
      stop();
      const start = performance.now();
      function draw(now) {
        if (!dialog.open) return;
        const i = Math.max(0,Math.min(spec.frames.length-1,Math.floor((now-start)*spec.fps/1000))), f = spec.frames[i];
        const scale = Math.min(canvas.width/f.w,canvas.height/f.h);
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(image,f.x,f.y,f.w,f.h,(canvas.width-f.w*scale)/2,(canvas.height-f.h*scale)/2,f.w*scale,f.h*scale);
        if (i < spec.frames.length-1) frame=requestAnimationFrame(draw);
      }
      draw(start);
    };
    dialog.querySelector('p').hidden=true; replay.disabled=false; replay.onclick=play; play();
  } catch { if(dialog.open)dialog.querySelector('p').textContent='이펙트를 불러오지 못했습니다. 다시 열어 주세요.'; }
}
export async function openAdvancement(code, onChanged) {
  styles ||= Promise.all(['/css/command-ui-v1.css','/mercenary-codex/advancement/advancement.css'].map(stylesheet)).catch(e=>{styles=null;throw e;});
  await styles;
  const current = localStorage.getItem('cnine_card_api_token') || sessionStorage.getItem('cnine_card_api_token') || '';
  if (current !== token) { windowInstance?.destroy(); windowInstance=null; token=current; }
  windowInstance ||= createAdvancementWindow({adapter:createAdvancementClient(),onPreview:preview,onChanged});
  await windowInstance.open(code);
}

import {mountMadara} from './runtime.mjs?v=20261031-ios-memory1';
const VERSION='20261031-ios-memory1';let styles;
export async function mountInlineRaid(root,{current}){
  styles||=new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/raid/madara/live.css?v='+VERSION;link.onload=resolve;link.onerror=()=>{styles=null;link.remove();reject(new Error('바르센 화면을 불러오지 못했습니다.'));};document.head.appendChild(link);});
  const response=await fetch('/raid/madara/fragment.html?v='+VERSION,{cache:'no-cache'});if(!response.ok)throw Error('바르센 입장 화면을 불러오지 못했습니다.');const html=await response.text();await styles;if(!current())return null;
  root.innerHTML=html;return mountMadara(root);
}

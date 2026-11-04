import {createAdvancementWindow} from './AdvancementWindow.mjs';
/** Host integration prepared for the existing mercenary codex action area.
 * Default is OFF. The local workbench invokes the dialog directly. */
export function attachAdvancementEntry({container,adapter,enabled=false,getSelectedCode=()=>null,onPreview,onChanged}={}){
 if(!enabled)return {enabled:false,destroy(){}};
 if(!container?.append)throw Error('Mercenary action container required');
 const window=createAdvancementWindow({adapter,onPreview,onChanged}),button=document.createElement('button');
 button.type='button';button.className='cn-ui-button';button.textContent='용병 전직';button.addEventListener('click',()=>window.open(getSelectedCode()));container.append(button);
 return {enabled:true,window,button,destroy(){button.remove();window.destroy();}};
}

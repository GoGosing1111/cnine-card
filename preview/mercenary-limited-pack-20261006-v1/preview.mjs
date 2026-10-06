import {mountLimitedPack} from '../../js/mercenary-limited-pack-live.mjs?v=20261006-mixed';
import {previewService,memoryStorage} from './fixture.mjs';
const service=previewService(),storage=memoryStorage();if(new URL(location.href).searchParams.has('off'))service.state.userOpeningEnabled=false;
window.limitedPreview={...service,storage};
const open=()=>mountLimitedPack({...service,storage,preview:true,accountId:7,getAccountId:()=>7});
document.getElementById('open').onclick=open;await open();

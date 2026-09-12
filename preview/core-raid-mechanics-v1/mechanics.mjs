import {run as runLive,cancel} from '../../js/core-raid-screen-qte-v2086.js';
export {cancel};
export const run=(kind,options={})=>runLive(kind,{...options,review:true});

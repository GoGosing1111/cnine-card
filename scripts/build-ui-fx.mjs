import {build} from 'esbuild';
const targets={
  prime:'js/prime-draw-live-v1985',
  soopketland:'js/soopketland-v2039',
  challenger:'js/ranked-challenger-fx-v2032',
  playerCard:'js/player-card-fx-v2052'
};
const selected=process.argv[2]||'all';
if(selected!=='all'&&!targets[selected])throw new Error(`Unknown UI renderer: ${selected}`);
const options={bundle:true,minify:true,format:'iife',logLevel:'info'};
await build({...options,entryPoints:['js/ui-fx-vendor-v2045.src.js'],outfile:'js/ui-fx-vendor-v2045.bundle.js'});
const globals={name:'shared-ui-fx-runtime',setup(builder){
  builder.onResolve({filter:/^(pixi\.js|gsap)$/},args=>({path:args.path,namespace:'ui-fx-global'}));
  builder.onLoad({filter:/.*/,namespace:'ui-fx-global'},args=>({contents:args.path==='pixi.js'
    ?'export const {Application,Assets,BlurFilter,Container,Graphics,Rectangle,Sprite,Text}=globalThis.CNineUiFxVendor.pixi;'
    :'export const gsap=globalThis.CNineUiFxVendor.gsap; export default gsap;',loader:'js'}));
}};
await Promise.all(Object.entries(targets).filter(([key])=>selected==='all'||key===selected).map(([,base])=>
  build({...options,entryPoints:[`${base}.src.js`],outfile:`${base}.bundle.js`,plugins:[globals]})));

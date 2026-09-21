import {build} from 'esbuild';
const globals={name:'shared-ui-fx-runtime',setup(builder){
  builder.onResolve({filter:/^(pixi\.js|gsap)$/},args=>({path:args.path,namespace:'ui-fx-global'}));
  builder.onLoad({filter:/.*/,namespace:'ui-fx-global'},args=>({contents:args.path==='pixi.js'
    ?'export const {Application,Assets,Container,Graphics,Sprite}=globalThis.CNineUiFxVendor.pixi;'
    :'export const gsap=globalThis.CNineUiFxVendor.gsap;',loader:'js'}));
}};
await build({entryPoints:['js/raid-weekly-boss-fx-v1.src.js'],outfile:'js/raid-weekly-boss-fx-v1.bundle.js',bundle:true,minify:true,format:'iife',logLevel:'info',plugins:[globals]});

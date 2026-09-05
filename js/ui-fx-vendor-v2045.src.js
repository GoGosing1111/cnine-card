import {Application,Assets,BlurFilter,Container,Graphics,Rectangle,Sprite,Text} from 'pixi.js';
import {gsap} from 'gsap';
// UI-only shared runtime. The approved V3 battle renderer remains independent.
globalThis.CNineUiFxVendor=Object.freeze({version:2045,pixi:{Application,Assets,BlurFilter,Container,Graphics,Rectangle,Sprite,Text},gsap});

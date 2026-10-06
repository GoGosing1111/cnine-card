import {BitmapFont,Cache,CanvasTextMetrics,TextStyle,Texture} from 'pixi.js';

const NAME='Russo One Critical v1';

// Pixi's dynamic bitmap atlas paints a FillGradient without glyph metrics,
// collapsing a local vertical gradient to one pixel. Bake the eleven numeric
// glyphs once, with a separate gradient origin for each glyph. Hits still use
// BitmapText and share one small atlas instead of rasterising each hit string.
export function criticalDamageFont(family){
  if(!family.startsWith('Russo One')||!globalThis.document?.createElement)return family;
  if(Cache.has(`${NAME}-bitmap`))return NAME;
  const canvas=document.createElement('canvas');
  canvas.width=2048;canvas.height=160;
  const context=canvas.getContext('2d');
  if(!context)return family;
  const strokeWidth=8,padding=12;
  const style=new TextStyle({fontFamily:family,fontSize:100,fill:0xffffff,stroke:{color:0x07101e,width:strokeWidth,join:'round'}});
  context.font='400 100px "Russo One", Arial, sans-serif';
  context.textBaseline='alphabetic';context.lineWidth=strokeWidth;context.lineJoin='round';context.strokeStyle='#07101e';
  const chars={};let x=0,lineHeight=100;
  for(const char of '0123456789,.'){
    const metrics=CanvasTextMetrics.measureText(char,style,canvas,false);
    const width=Math.ceil(metrics.width)+padding*2,height=Math.ceil(metrics.height)+padding*2;
    const baseline=padding-strokeWidth/2+metrics.height-metrics.fontProperties.descent;
    const bounds=context.measureText(char);
    // Use the digits' cap height for commas too: punctuation stays coral.
    const cap=context.measureText('0').actualBoundingBoxAscent||72;
    const gradient=context.createLinearGradient(0,baseline-cap,0,baseline);
    gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.28,'#ffffff');gradient.addColorStop(.56,'#ffadbb');gradient.addColorStop(1,'#ff3864');
    context.fillStyle=gradient;
    context.strokeText(char,x+padding+strokeWidth/2,baseline);
    context.fillText(char,x+padding+strokeWidth/2,baseline);
    chars[char]={x,y:0,width,height,xOffset:-padding,yOffset:-padding,xAdvance:bounds.width,page:0,kerning:{}};
    x+=width;lineHeight=metrics.fontProperties.fontSize;
  }
  const font=new BitmapFont({textures:[Texture.from(canvas)],data:{fontFamily:NAME,fontSize:100,lineHeight,baseLineOffset:0,pages:[{id:0}],chars}});
  font.applyFillAsTint=false;
  Cache.set(`${NAME}-bitmap`,font);
  font.once('destroy',()=>Cache.remove(`${NAME}-bitmap`));
  return NAME;
}

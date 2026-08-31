const VERSION='1-v3-advancement-awakening';

/**
 * Recorded/foley-only SFX selected in the standalone advancement review.
 * The strongest authored transient is aligned to syncPointMs; no oscillator,
 * generated noise, runtime synthesis, or retired role-impact audio is used.
 */
export const V3_ADVANCEMENT_AUDIO_ASSETS=Object.freeze({
  SHATTER:Object.freeze({
    asset:`/assets/sfx/v3-advancement-awakening-v1/shatter-advancement-v1.mp3?v=${VERSION}`,
    bytes:36908,durationMs:1100,syncPointMs:250,gain:.97,
    sha256:'b4c498a8ae554411456f1c2b5a3883275b3d1e4b2fb974ab7df0b227c7b576c0'
  }),
  RIPOSTE:Object.freeze({
    asset:`/assets/sfx/v3-advancement-awakening-v1/riposte-advancement-v1.mp3?v=${VERSION}`,
    bytes:42284,durationMs:1250,syncPointMs:300,gain:.97,
    sha256:'e649a410e874bdfef29f88981170a5faaa683b4e34550ae459148e538831078f'
  }),
  AFTERIMAGE:Object.freeze({
    asset:`/assets/sfx/v3-advancement-awakening-v1/afterimage-advancement-v1.mp3?v=${VERSION}`,
    bytes:30764,durationMs:900,syncPointMs:178,gain:.97,
    sha256:'28b9a99971ad0564aa0da74fc8a9627cc2758ebd835db63da722e291f242aef6'
  }),
  IMMORTAL:Object.freeze({
    asset:`/assets/sfx/v3-advancement-awakening-v1/immortal-advancement-v1.mp3?v=${VERSION}`,
    bytes:72236,durationMs:2200,syncPointMs:333,gain:.97,
    sha256:'d86b5f69e20c5d7f0527683d4f7c5980438c9dc912f75ebd006768f78b785691'
  })
});

export function normalizeAdvancementAudioCode(value){
  const code=String(value||'').trim().toUpperCase();
  return V3_ADVANCEMENT_AUDIO_ASSETS[code]?code:'';
}

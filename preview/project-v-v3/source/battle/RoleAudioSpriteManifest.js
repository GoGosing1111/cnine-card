const VERSION='3-v3-live-audio';

export const V3_ROLE_AUDIO_ASSETS=Object.freeze({
  ATTACK:Object.freeze({
    asset:`/assets/sfx/v3-role-impact-v2/attack.mp3?v=${VERSION}`,
    bytes:23866,
    durationMs:970,
    syncPointMs:105,
    gain:.7
  }),
  DEFENSE:Object.freeze({
    asset:`/assets/sfx/v3-role-impact-v2/defense.mp3?v=${VERSION}`,
    bytes:32643,
    durationMs:1330,
    syncPointMs:48,
    gain:.72
  }),
  SPEED:Object.freeze({
    asset:`/assets/sfx/v3-role-impact-v2/speed.mp3?v=${VERSION}`,
    bytes:30136,
    durationMs:1230,
    syncPointMs:26,
    gain:.66
  }),
  HP:Object.freeze({
    asset:`/assets/sfx/v3-role-impact-v2/heal.mp3?v=${VERSION}`,
    bytes:42048,
    durationMs:1720,
    syncPointMs:110,
    gain:.64
  })
});

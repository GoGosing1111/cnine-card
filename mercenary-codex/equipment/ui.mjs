export const labels={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
const paths={
 back:'<path d="m10 5-7 7 7 7M3 12h18"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',down:'<path d="M12 3v18m-6-6 6 6 6-6"/>',chevron:'<path d="m6 9 6 6 6-6"/>',
 home:'<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',refresh:'<path d="M20 4v6h-6M4 20v-6h6M5 8a8 8 0 0 1 13-2l2 4M4 14l2 4a8 8 0 0 0 13-2"/>',
 pve:'<path d="m12 2 9 5v7l-9 8-9-8V7ZM12 6v12M8 10l4-4 4 4M8 14h8"/>',pvp:'<path d="M3 3h5l12 12-5 5L3 8ZM21 3h-5l-5 5M3 21l5-5M16 8l5-5M3 15l6 6m6-18 6 6M13 17l7 4 1-1-4-7"/>',
 box:'<path d="m3 7 9-4 9 4v13H3ZM3 7l9 4 9-4M12 11v9M3 14h18M10 13v3h4v-3"/>',search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
 spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM20 2v4m-2-2h4"/>',forge:'<path d="m12 3 5 5-4 4-5-5ZM12 10l-9 9 2 2 9-9M13 16h9l-4 4h-8M11 20v2h8"/>',check:'<path d="m5 12 5 5L20 6"/>',
 people:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-4c0-7 16-7 16 0v4M4 6a3 3 0 0 0 0 6M20 6a3 3 0 0 1 0 6"/>',swap:'<path d="M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5"/>',
 pointer:'<path d="m5 2 14 11-7 1-4 7ZM13 16l4 6"/>',compass:'<circle cx="12" cy="12" r="10"/><path d="m16 8-2 6-6 2 2-6Z"/>',sort:'<path d="M3 5h18M3 12h13M3 19h7m6-4 3 4 3-4M19 19V9"/>',
 grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',list:'<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
 WEAPON:'<path d="m16 3 5 0 0 5-11 11-5-5ZM4 12l8 8M3 21l5-5M14 10l4-4"/>',TOP:'<path d="m8 3-5 3 2 6 3-1v10h8V11l3 1 2-6-5-3M8 3c0 5 8 5 8 0M8 16h8"/>',BOTTOM:'<path d="M6 3h12l2 18h-6l-2-11-2 11H4ZM6 6h12M12 6v4"/>',SHOES:'<path d="M5 3h9v10l6 3v5H3v-7l2-3ZM4 17h5m5-4-4 2M3 18h17"/>',ACCESSORY:'<path d="m12 2 8 7-8 13L4 9ZM4 9h16M8 6l4 3 4-3M12 9v13"/>'
};
export const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.box}</svg>`;
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=value=>new Intl.NumberFormat('ko-KR').format(Number(value)||0);
export const image=value=>'/'+String(value||'').replace(/^\/+/, '');
export const itemKey=item=>item.instanceId||item.code;

// Engraved equipment emblems for empty sockets; separate from the small toolbar icons.
export function slotEmblem(part){
  const id='socket-'+part,steel=`url(#${id}-steel)`,gold=`url(#${id}-gold)`;
  const shapes={
    WEAPON:`<g transform="rotate(34 32 32)"><path d="M32 3 39 13 36 40H28L25 13Z" fill="${steel}"/><path d="M32 3V40H28L25 13Z" fill="#eff5f5" opacity=".32" stroke="none"/><path d="M32 10V34" stroke="#f1eee1"/><path d="m19 39 5-3 6 3h4l6-3 5 3-2 5-9-2h-4l-9 2Z" fill="${gold}" stroke="#c1aa78"/><path d="M29 43h6v12h-6Z" fill="#263240"/><path d="m29 46 6 2m-6 1 6 2" stroke="#9d9177"/><path d="m32 54 5 4-5 4-5-4Z" fill="${gold}" stroke="#c1aa78"/></g>`,
    TOP:`<path d="m21 9 7 4h8l7-4 10 8 4 9-11 4-2 21-12 7-12-7-2-21-11-4 4-9Z" fill="${steel}"/><path d="m21 10-3 18-10-4 4-8Zm22 0 3 18 10-4-4-8Z" fill="${gold}" stroke="#ac9c7a"/><path d="m23 18 9 6 9-6 2 29-11 8-11-8Z" fill="${steel}"/><path d="M32 24v27m-9-21 9 5 9-5m-19 10 10 5 10-5" fill="none" stroke="#e7e9e3" opacity=".48"/><path d="m22 48 10 5 10-5v4l-10 6-10-6Z" fill="${gold}" stroke="#aa9874"/>`,
    BOTTOM:`<path d="M18 9h28l2 11-5 35h-9l-2-25-2 25h-9l-5-35Z" fill="${steel}"/><path d="M18 9h28v8H18Z" fill="${gold}" stroke="#b3a180"/><path d="m32 10 4 3-4 3-4-3Z" fill="#293645"/><path d="m20 21 9 2-2 16-6-3Zm24 0-9 2 2 16 6-3Z" fill="#c5cbd0" opacity=".32"/><path d="m21 37 8 4-1 7-7-3Zm22 0-8 4 1 7 7-3Z" fill="${gold}" stroke="#9e947d"/><path d="m22 50 6 2m14-2-6 2" stroke="#e0e5e5"/>`,
    SHOES:`<path d="M12 15h17l-2 24-8 12H6v-8l7-11Z" fill="#596a7b" stroke="#9daab7"/><path d="M24 7h21l-3 27 3 8 12 7v8H19V43l7-12Z" fill="${steel}"/><path d="M24 7h21v7H24Z" fill="${gold}" stroke="#ac9d7f"/><path d="m27 18 11 2-2 14-10 4Z" fill="#c5d0d8" opacity=".35"/><path d="m26 37 13-2 5 7-18 5Z" fill="${gold}" stroke="#b4a382"/><path d="M19 52h38v5H19Z" fill="#35424f" stroke="#96a4b2"/><path d="m45 44-2 7m-8-7-2 7" stroke="#ecede6" opacity=".5"/>`,
    ACCESSORY:`<path d="M22 6C7 18 10 33 28 35m14-29c15 12 12 27-6 29" stroke="${gold}" stroke-width="2"/><path d="M22 11C12 21 16 30 28 31m14-20c10 10 6 19-6 20" stroke="#738392" opacity=".5"/><path d="m32 22 6 8-6 7-6-7Z" fill="${gold}" stroke="#bca77f"/><path d="m32 29 13 13-13 20-13-20Z" fill="${gold}" stroke="#baaa8a"/><path d="m32 34 8 9-8 13-8-13Z" fill="${steel}" stroke="#becdd9"/><path d="m32 34-3 9 3 13V34m-8 9h16" stroke="#e0eaf2" opacity=".58"/>`
  };
  return `<svg class="slot-emblem" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}-steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e1e4df"/><stop offset=".35" stop-color="#a2b0bd"/><stop offset=".52" stop-color="#617489"/><stop offset=".78" stop-color="#b8c4cd"/><stop offset="1" stop-color="#52677c"/></linearGradient><linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e2d3aa"/><stop offset=".48" stop-color="#b2a07a"/><stop offset="1" stop-color="#6e634e"/></linearGradient></defs><g stroke="#9daab6" stroke-width=".85" stroke-linejoin="round" fill="none">${shapes[part]||shapes.WEAPON}</g></svg>`;
}

export const socketTrim=()=>'<svg class="slot-trim" viewBox="0 0 100 116" preserveAspectRatio="none" aria-hidden="true"><path d="M7 24V14l7-7h12m48 0h12l7 7v10M7 92v10l7 7h12m48 0h12l7-7V92"/><path class="trim-dim" d="M32 7h10m16 0h10M32 109h36M7 32v9m86-9v9"/><path class="trim-jewel" d="m50 4 4 3-4 3-4-3Z"/></svg>';

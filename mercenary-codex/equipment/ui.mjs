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

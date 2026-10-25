// Current eight identities reuse the original clan art and colors. IDs and data ownership stay unchanged.
export const ORGANIZATION_IDENTITIES=Object.freeze([
 {id:1,name:'DK',markKey:'DK',markImage:'/assets/ui/clan/marks/dk-clan-mark-v1.webp',color:'#2f7cff',accentColor:'#d8e8ff'},
 {id:2,name:'삼성',markKey:'SAMSUNG',markImage:'/assets/ui/clan/marks/samsung-clan-mark-v1.webp',color:'#3c74c9',accentColor:'#e7f2ff'},
 {id:3,name:'T1',markKey:'T1',markImage:'/assets/ui/clan/marks/t1-clan-mark-v1.webp',color:'#d32f4a',accentColor:'#f6d37a'},
 {id:4,name:'한화',markKey:'HANWHA',markImage:'/assets/ui/clan/marks/hanwha-clan-mark-v1.webp',color:'#f1781f',accentColor:'#ffe3a1'},
 {id:5,name:'LG',markKey:'LG',markImage:'/assets/ui/clan/marks/lg-clan-mark-v1.webp',color:'#d64192',accentColor:'#f4dbea'},
 {id:6,name:'롯데',markKey:'LOTTE',markImage:'/assets/ui/clan/marks/lotte-clan-mark-v1.webp',color:'#7b2445',accentColor:'#f0d28e'},
 {id:7,name:'FM',markKey:'FM',markImage:'/assets/ui/clan/marks/fm-clan-mark-v1.webp',color:'#1dad72',accentColor:'#e9d07a'},
 {id:8,name:'DC',markKey:'DC',markImage:'/assets/ui/clan/marks/dc-clan-mark-v1.webp',color:'#7b4ae2',accentColor:'#62d9ff'}
].map(Object.freeze));
export function organizationIdentity(id){return ORGANIZATION_IDENTITIES.find(identity=>identity.id===Number(id))||null;}

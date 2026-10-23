// Preserve old bookmarked and cached tutorial links.
const guide=new URL('/growth-guide/',location.origin);const account=new URLSearchParams(location.search).get('account');if(account)guide.searchParams.set('account',account);guide.searchParams.set('v','20261024-1');location.replace(guide.href);

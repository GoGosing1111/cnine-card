// Preserve old bookmarked and cached tutorial links.
const guide=new URL('/ui/growth-guide/',location.origin);const account=new URLSearchParams(location.search).get('account');if(account)guide.searchParams.set('account',account);guide.searchParams.set('v','20261124-1');location.replace(guide.href);

import {ORGANIZATION_IDENTITIES} from './organization-identity-v1.mjs?v=20261025-clan-eight';
export const ORGANIZATION_PREPARATION = Object.freeze({
  version: 1, status: 'PREPARATION', registrationOpen: false,
  maxOrganizations: 8, maxMembers: 25, inheritance: 'NONE',
  names: Object.freeze(ORGANIZATION_IDENTITIES.map(identity=>identity.name)),
  hideouts: ['낡은 판자촌','골목 사무실','클랜 본거지','고급 저택','고급 펜트하우스'],
  conceptImage: '/assets/ui/organization/renewal-plan-20261012.png',
  emblemsImage: '/assets/ui/organization/emblem-concepts-20261012.png'
});

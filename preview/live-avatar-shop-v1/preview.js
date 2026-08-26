(() => {
  'use strict';

  const base = 'assets/ui/avatars-v1/lobby-v1/';
  const powerEffect = (value) => ({ type: 'BATTLE_POWER_PERCENT', value });
  const scrapyardEffect = () => ({ type: 'SCRAPYARD_FREE_ENTRY', value: 1 });
  const raidEffect = (value) => ({ type: 'RAID_EXTRA_ENTRY', value });
  const coinEffect = (value) => ({ type: 'COIN_GAIN_PERCENT', value });

  const avatar = (serial, code, name, callSign, role, file, accent, acquisitionType, acquisition, effectInput, owned = false, equipped = false) => ({
    serial, code, name, callSign, role,
    description: `${name}의 외형과 전용 로비 일러스트를 적용하고 고유 아바타 효과를 활성화합니다.`,
    lobbyImage: `${base}${file}-1024.webp`,
    lobbyMobileImage: `${base}${file}-640.webp`,
    accent, acquisitionType, effects: Array.isArray(effectInput) ? effectInput : [effectInput], effect: (Array.isArray(effectInput) ? effectInput[0] : effectInput), owned, equipped,
    ...(acquisitionType === 'COIN'
      ? { coinPrice: acquisition }
      : { sourceLabel: acquisition[0], sourceDetail: acquisition[1] })
  });

  const fixture = {
    profile: { nickname: '핑크빛유두', role: 'OWNER' },
    coin: 4420607473,
    access: { mode: 'ON', visible: true, shopEnabled: true },
    equipCooldown: { durationMs: 86400000, remainingMs: 0, nextEquipAt: null, locked: false },
    avatars: [
      avatar('A-01', 'AZURE_FROST_STRATEGIST', '서리의 전략관', 'AZURE FROST', '빙결 전술 지휘관', 'avatar-f01-azure-frost-strategist-lobby-v1', '#8bc9ff', 'COIN', 250000000, [coinEffect(50),powerEffect(5),raidEffect(1)], true, true),
      avatar('A-02', 'CRIMSON_SIEGE_MARSHAL', '진홍 공성 지휘관', 'CRIMSON SIEGE', '공성 화력 통제관', 'avatar-f02-crimson-siege-marshal-lobby-v1', '#ff6d64', 'DROP', ['영토전 최종 보상', '영토전 종료 시 지정 순위 또는 지휘 기여 보상으로 획득하는 전용 아바타입니다.'], powerEffect(8)),
      avatar('A-03', 'VERDANT_BIO_MEDIC', '에메랄드 전장의무관', 'VERDANT MEDIC', '전장 생체 의무관', 'avatar-f03-verdant-bio-medic-lobby-v1', '#6ee3bd', 'DROP', ['월드 레이드', '월드 레이드 보상 상자에서 낮은 확률로 획득하는 드랍 전용 아바타입니다.'], raidEffect(1)),
      avatar('A-04', 'SOLAR_VANGUARD', '태양의 선봉대장', 'SOLAR VANGUARD', '황금 성채 선봉장', 'avatar-f04-solar-vanguard-lobby-v1', '#ffd178', 'COIN', 400000000, powerEffect(4)),
      avatar('A-05', 'CYAN_NIGHT_COURIER', '청류 야간 전령', 'NIGHT COURIER', '도심 침투 전령', 'avatar-f05-cyan-night-courier-lobby-v1', '#61d9ec', 'COIN', 300000000, coinEffect(6)),
      avatar('A-06', 'AMBER_DUNE_CAPTAIN', '황야 포격대장', 'DUNE CAPTAIN', '사막 포격 전술관', 'avatar-f06-amber-dune-captain-lobby-v1', '#e6ae5e', 'DROP', ['몬스터 공성전', '공성전 최고 난이도 보스 처치 보상으로만 획득할 수 있습니다.'], scrapyardEffect()),
      avatar('A-07', 'ROSE_TEMPEST_DUELIST', '장미 폭풍 결투가', 'ROSE TEMPEST', '폭풍 궁정 결투가', 'avatar-f07-rose-tempest-duelist-lobby-v1', '#ff7da6', 'DROP', ['랭크전 시즌 보상', '랭크전 시즌 최종 티어 보상으로 지급되는 경쟁 콘텐츠 전용 아바타입니다.'], coinEffect(20), true),
      avatar('A-08', 'IRON_BASTION_WARDEN', '철벽 수호관', 'IRON BASTION', '중장갑 방벽 지휘관', 'avatar-m01-iron-bastion-warden-lobby-v1', '#a9b6c3', 'DROP', ['호송작전', '호송차 생존율과 작전 등급 조건을 달성하면 확률 보상으로 획득합니다.'], scrapyardEffect()),
      avatar('A-09', 'JADE_WIND_RANGER', '비취 바람 추적자', 'JADE RANGER', '수림 정찰대장', 'avatar-m02-jade-wind-ranger-lobby-v1', '#78d39d', 'DROP', ['PVE 보스 드랍', '지정된 고난도 PVE 보스의 전리품 목록에서 획득할 수 있습니다.'], powerEffect(10)),
      avatar('A-10', 'IVORY_ARCANE_ENGINEER', '상아빛 아케인 기술관', 'ARCANE ENGINEER', '정밀 병기 기술관', 'avatar-m03-ivory-arcane-engineer-lobby-v1', '#d6c49d', 'COIN', 350000000, raidEffect(1))
    ]
  };

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  async function previewRequest(path, init = {}) {
    await wait(180);
    const payload = init.body ? JSON.parse(init.body) : {};
    const item = fixture.avatars.find((row) => row.code === payload.avatarCode);
    if (!item) throw new Error('아바타 정보를 찾을 수 없습니다.');
    if (path === 'avatar/purchase') {
      if (item.acquisitionType !== 'COIN') throw new Error('드랍 전용 아바타는 구매할 수 없습니다.');
      if (item.owned) return { ok: true, alreadyOwned: true, coin: fixture.coin };
      if (fixture.coin < item.coinPrice) throw new Error('코인이 부족합니다.');
      fixture.coin -= item.coinPrice;
      item.owned = true;
      return { ok: true, coin: fixture.coin };
    }
    if (path === 'avatar/equip') {
      if (!item.owned) throw new Error('보유한 아바타만 적용할 수 있습니다.');
      fixture.avatars.forEach((row) => { row.equipped = row.code === item.code; });
      const nextEquipAt = new Date(Date.now() + 86400000).toISOString();
      fixture.equipCooldown = { durationMs: 86400000, remainingMs: 86400000, nextEquipAt, locked: true };
      return { ok: true, equippedAvatarCode: item.code, coin: fixture.coin, equipCooldown: fixture.equipCooldown };
    }
    throw new Error(`프리뷰 계약에 없는 요청입니다: ${path}`);
  }

  window.AvatarShopPreview = window.SoopketmonAvatarShopV1.create(
    document.getElementById('avatarShopV1'),
    {
      data: fixture,
      request: previewRequest,
      assetBase: '../../',
      profile: fixture.profile,
      onBack() {
        window.location.href = '../live-character-loadout-v2-v1/?v=9-avatar-equipment-art&tab=equipment';
      }
    }
  );
})();

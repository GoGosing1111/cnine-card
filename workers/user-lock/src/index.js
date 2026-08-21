// cnine-card USER_LOCK Durable Object
//
// 목적: 같은 계정의 게임 액션(battle/fight, tower/fight, pvp/fight, raid/*, ...)을
//       직렬화하던 D1 테이블 user_mutation_locks_v1520 을 대체한다.
//
// 왜 필요한가:
//   D1(SQLite)은 단일 라이터다. 기존 방식은 전투 1회마다 락 INSERT 1회 + DELETE 1회,
//   즉 D1 쓰기 2회를 추가로 발생시켰고 이 쓰기들이 전체 유저의 쓰기 큐에 직렬로 쌓였다.
//   동시접속이 늘수록 락 자체가 병목이 되고, 획득 실패 → 409 → 클라 재시도 →
//   쓰기 증가의 악순환(thundering herd)이 생긴다.
//
//   Durable Object 는 idFromName('user:<id>') 기준으로 유저마다 단일 인스턴스가
//   보장되므로, 메모리 변수 하나로 완벽한 상호배제를 얻는다. D1 쓰기 0회, 저장소 쓰기 0회.
//
// 실패 모드:
//   DO 가 evict/재시작되면 락이 사라진다. 이는 기존 D1 방식에서 lease 가 만료되는 것과
//   동일한 안전 방향(자동 해제)이며, 각 액션의 원자적 UPDATE(에너지 차감 등)가
//   2차 방어선으로 남아 있다.
//
// 배포:
//   1) wrangler.toml.example 을 wrangler.toml 로 복사
//   2) npx wrangler deploy
//   3) Cloudflare Pages(cnine-card) → Settings → Functions → Durable Object bindings 에
//      Variable name: USER_LOCK / 이 Worker 의 UserMutationLock 클래스를 연결
//   4) 바인딩이 붙는 즉시 functions/api/[[path]].js 가 자동으로 DO 경로를 쓴다.
//      바인딩을 빼면 기존 D1 경로로 자동 폴백한다. (코드 수정 불필요)

const MIN_LEASE_MS = 1000;
const MAX_LEASE_MS = 120000;

export class UserMutationLock {
  constructor(state) {
    this.state = state;
    this.lock = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const now = Date.now();

    if (url.pathname === '/acquire') {
      if (this.lock && this.lock.leaseUntil > now) {
        return Response.json({ acquired: false, holder: this.lock.actionPath });
      }
      const leaseMs = Math.max(MIN_LEASE_MS, Math.min(MAX_LEASE_MS, Number(body.leaseMs) || 60000));
      this.lock = {
        token: String(body.token || ''),
        actionPath: String(body.actionPath || '').slice(0, 100),
        leaseUntil: now + leaseMs
      };
      return Response.json({ acquired: true, leaseUntil: this.lock.leaseUntil });
    }

    if (url.pathname === '/release') {
      if (this.lock && this.lock.token === String(body.token || '')) this.lock = null;
      return Response.json({ released: true });
    }

    if (url.pathname === '/state') {
      return Response.json({ held: Boolean(this.lock && this.lock.leaseUntil > now), lock: this.lock });
    }

    return new Response('not found', { status: 404 });
  }
}

export default {
  fetch() {
    return new Response('cnine-card user-lock durable object worker', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
};

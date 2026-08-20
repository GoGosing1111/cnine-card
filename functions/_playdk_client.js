/**
 * PLAY DK game identity client.
 *
 * This module is server-only. PLAYDK_SECRET_KEY must never be shipped to the
 * browser or committed to source control.
 */

export class PlaydkApiError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'PlaydkApiError';
    this.status = Number(detail.status || 0);
    this.path = String(detail.path || '');
    this.body = detail.body ?? null;
  }
}

const encoder = new TextEncoder();
const trimSlash = value => String(value || '').replace(/\/+$/, '');

async function signTimestamp(secretKey, timestamp) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(String(timestamp)));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function authHeader(accessKey, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signTimestamp(secretKey, timestamp);
  return `HMAC-SHA256 accessKey=${accessKey}, signature=${signature}, timestamp=${timestamp}`;
}

async function readSmallResponse(response, limit = 32_768) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new PlaydkApiError('PLAY DK 응답 크기가 허용 범위를 초과했습니다.', { status: 502 });
  const text = await response.text();
  if (text.length > limit) throw new PlaydkApiError('PLAY DK 응답 크기가 허용 범위를 초과했습니다.', { status: 502 });
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export function createPlaydkIdentityClient(options = {}) {
  const baseUrl = trimSlash(options.baseUrl);
  const accessKey = String(options.accessKey || '').trim();
  const secretKey = String(options.secretKey || '').trim();
  const game = String(options.game || 'skm').trim();
  const timeoutMs = Math.max(1_000, Math.min(15_000, Number(options.timeoutMs || 8_000)));
  if (!baseUrl || !accessKey || !secretKey) throw new PlaydkApiError('PLAY DK 서버 인증 설정이 없습니다.');

  return {
    gameStartUrl() {
      return `${baseUrl}/api/v2/g/${encodeURIComponent(game)}`;
    },
    async getUserInfo(token) {
      const cleanToken = String(token || '').trim();
      if (!cleanToken || cleanToken.length > 2_048) throw new PlaydkApiError('PLAY DK 인증 토큰이 올바르지 않습니다.', { status: 400 });
      const url = new URL(`${baseUrl}/api/v2/ext/game/user`);
      url.searchParams.set('token', cleanToken);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: await authHeader(accessKey, secretKey), Accept: 'application/json' },
          signal: controller.signal,
          cache: 'no-store',
        });
      } catch (error) {
        throw new PlaydkApiError(
          error?.name === 'AbortError' ? 'PLAY DK 인증 서버 응답 시간이 초과되었습니다.' : 'PLAY DK 인증 서버에 연결할 수 없습니다.',
          { path: '/api/v2/ext/game/user' },
        );
      } finally {
        clearTimeout(timer);
      }
      const body = await readSmallResponse(response);
      if (!response.ok) {
        throw new PlaydkApiError('PLAY DK 인증 정보를 확인할 수 없습니다.', {
          status: response.status,
          path: '/api/v2/ext/game/user',
          body,
        });
      }
      const uuid = String(body?.uuid || '').trim();
      const name = String(body?.name || '').trim();
      if (!uuid || uuid.length > 128) throw new PlaydkApiError('PLAY DK 사용자 식별 응답이 올바르지 않습니다.', { status: 502 });
      return { uuid, name: name.slice(0, 80) };
    },
  };
}


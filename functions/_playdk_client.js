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
    this.retryAfter = String(detail.retryAfter || '');
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

  async function request(method, path, { query, body, failureMessage } = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = {
      Authorization: await authHeader(accessKey, secretKey),
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (error) {
      throw new PlaydkApiError(
        error?.name === 'AbortError' ? 'PLAY DK 서버 응답 시간이 초과되었습니다.' : 'PLAY DK 서버에 연결할 수 없습니다.',
        { path },
      );
    } finally {
      clearTimeout(timer);
    }
    const parsed = await readSmallResponse(response);
    if (!response.ok) {
      throw new PlaydkApiError(failureMessage || 'PLAY DK 요청을 처리하지 못했습니다.', {
        status: response.status,
        path,
        body: parsed,
        retryAfter: response.headers.get('retry-after') || '',
      });
    }
    return parsed;
  }

  return {
    gameStartUrl() {
      return `${baseUrl}/api/v2/g/${encodeURIComponent(game)}`;
    },
    async getUserInfo(token) {
      const cleanToken = String(token || '').trim();
      if (!cleanToken || cleanToken.length > 2_048) throw new PlaydkApiError('PLAY DK 인증 토큰이 올바르지 않습니다.', { status: 400 });
      const body = await request('GET', '/api/v2/ext/game/user', {
        query: { token: cleanToken },
        failureMessage: 'PLAY DK 인증 정보를 확인할 수 없습니다.',
      });
      const uuid = String(body?.uuid || '').trim();
      const name = String(body?.name || '').trim();
      if (!uuid || uuid.length > 128) throw new PlaydkApiError('PLAY DK 사용자 식별 응답이 올바르지 않습니다.', { status: 502 });
      return { uuid, name: name.slice(0, 80) };
    },
    async getDailyPostCount(params = {}) {
      const userUuid = String(params.userUuid || '').trim();
      const questDate = String(params.questDate || '').trim();
      const boardSlugs = [...new Set((Array.isArray(params.boardSlugs) ? params.boardSlugs : [])
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean))];
      if (!userUuid || userUuid.length > 128) throw new PlaydkApiError('PLAY DK 사용자 식별값이 올바르지 않습니다.', { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(questDate)) throw new PlaydkApiError('PLAY DK 퀘스트 날짜가 올바르지 않습니다.', { status: 400 });
      if (!boardSlugs.length || boardSlugs.length > 10 || boardSlugs.some(slug => !/^[a-z0-9_-]{1,80}$/.test(slug))) {
        throw new PlaydkApiError('PLAY DK 게시판 설정이 올바르지 않습니다.', { status: 400 });
      }
      const body = await request('POST', '/api/v2/ext/board/daily-post-count', {
        body: { userUuid, questDate, boardSlugs },
        failureMessage: 'PLAY DK 일일 게시글 수를 확인하지 못했습니다.',
      });
      const count = Number(body?.count);
      if (!Number.isSafeInteger(count) || count < 0) throw new PlaydkApiError('PLAY DK 게시글 집계 응답이 올바르지 않습니다.', { status: 502 });
      const posts = (Array.isArray(body?.posts) ? body.posts : []).slice(0, 500).map(post => ({
        postId: String(post?.postId ?? '').slice(0, 80),
        boardSlug: String(post?.boardSlug || '').trim().toLowerCase().slice(0, 80),
        createdAt: String(post?.createdAt || '').slice(0, 80),
      })).filter(post => post.postId && post.boardSlug);
      const countsByBoardSlug = {};
      for (const [slug, value] of Object.entries(body?.countsByBoardSlug || {})) {
        const normalizedSlug = String(slug || '').trim().toLowerCase();
        const normalizedCount = Number(value);
        if (/^[a-z0-9_-]{1,80}$/.test(normalizedSlug) && Number.isSafeInteger(normalizedCount) && normalizedCount >= 0) countsByBoardSlug[normalizedSlug] = normalizedCount;
      }
      return {
        userUuid: String(body?.userUuid || userUuid).slice(0, 128),
        questDate: String(body?.questDate || questDate).slice(0, 10),
        timezone: String(body?.timezone || 'Asia/Seoul').slice(0, 80),
        boardSlugs: Array.isArray(body?.boardSlugs) ? body.boardSlugs.map(value => String(value || '').toLowerCase()).filter(Boolean).slice(0, 10) : boardSlugs,
        count,
        countsByBoardSlug,
        posts,
        postsTruncated: body?.postsTruncated === true,
      };
    },
  };
}


import { randomBytes, randomUUID } from 'node:crypto';
import { createRoom, joinRoom, leaveRoom, commandRoom, advanceRoom, publicSnapshot, RULES, defaultLoadout } from './defense-model.mjs';
import {defenseRoomListing} from '../../../shared/monster-defense-room-list-v1.mjs';

const error = (message, status = 400) => Object.assign(new Error(message), { status });
export class DefenseRooms {
  constructor({ now = () => Date.now(), maxRooms = 100 } = {}) {
    this.now = now; this.maxRooms = maxRooms; this.rooms = new Map(); this.sessions = new Map(); this.lastTick = now(); this.remainder = 0;
  }
  session(room, player) {
    player.lastSeen=this.now();
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(token, { roomId: room.id, playerId: player.id, seen: this.now(), receipts: new Map(), rateAt: this.now(), requests: 0 });
    return { token, playerId: player.id, roomId: room.id, snapshot: publicSnapshot(room) };
  }
  create({ name, capacity, loadout, practice = false,difficulty='NORMAL' }) {
    this.cleanup();
    if (this.rooms.size >= this.maxRooms) throw error('검수 서버가 가득 찼습니다. 잠시 후 다시 시도하세요.', 503);
    let id;
    do { id = randomBytes(5).toString('hex').slice(0, 6).toUpperCase(); } while (this.rooms.has(id));
    const room = createRoom({ id, capacity,difficulty,now: this.now(), seed: randomBytes(4).readUInt32LE(), practice: practice === true });
    const host = joinRoom(room, { id: randomUUID(), name, loadout });
    if (room.practice) for (let index = 1; index < capacity; index++) {
      joinRoom(room, { id: `bot-${index}`, name: `연습 대원 ${index}`, bot: true,
        loadout: index === 1 ? { mercenaries: ['V-001', 'V-004'], card: 'BONGJUN' } : defaultLoadout() });
    }
    this.rooms.set(id, room);
    return this.session(room, host);
  }
  join({ roomId, name, loadout }) {
    const room = this.rooms.get(String(roomId || '').trim().toUpperCase());
    if (!room) throw error('대기방을 찾을 수 없습니다. 방 목록을 새로고침하세요.', 404);
    if (room.practice) throw error('연습 방에는 다른 플레이어가 입장할 수 없습니다.');
    const player = joinRoom(room, { id: randomUUID(), name, loadout });
    return this.session(room, player);
  }
  authenticate(token) {
    const session = typeof token === 'string' ? this.sessions.get(token) : null;
    const room = session ? this.rooms.get(session.roomId) : null;
    const player = room?.players.find(p => p.id === session.playerId);
    if (!room || !player) throw error('접속 정보가 만료되었습니다. 대기실에서 다시 입장하세요.', 401);
    session.seen = this.now(); player.connected = true;player.lastSeen=this.now();
    return { session, room, player };
  }
  snapshot(token, after = 0) {
    const { room } = this.authenticate(token);
    const cursor = Number.isSafeInteger(after) && after >= 0 && after <= room.seq ? after : room.seq;
    return publicSnapshot(room, cursor);
  }
  list(difficulty=''){
    this.cleanup();const rows=[...this.rooms.values()].map(room=>defenseRoomListing(room,this.now())).filter(room=>room&&(!difficulty||room.difficulty===difficulty)).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
    return {ok:true,rooms:rows.slice(0,50),hasMore:rows.length>50,serverNow:this.now()};
  }
  command(token, { requestId, command }) {
    const { session, room, player } = this.authenticate(token);
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) throw error('명령 식별자가 올바르지 않습니다.');
    const fingerprint = JSON.stringify(command), previous = session.receipts.get(requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw error('같은 명령 식별자를 다시 사용할 수 없습니다.', 409);
      return { ...previous.receipt, duplicate: true };
    }
    if (session.receipts.size >= 4096) throw error('이번 방의 명령 한도에 도달했습니다.', 429);
    if (this.now() - session.rateAt >= 1000) { session.rateAt = this.now(); session.requests = 0; }
    if (++session.requests > 15) throw error('명령을 너무 빠르게 전송했습니다.', 429);
    commandRoom(room, player.id, command);
    const receipt = { ok: true, requestId, seq: room.seq };
    session.receipts.set(requestId, { fingerprint, receipt });
    return receipt;
  }
  leave(token) {
    const { session, room } = this.authenticate(token);
    leaveRoom(room, session.playerId);
    this.sessions.delete(token);
    return { ok: true };
  }
  tick() {
    const now = this.now();
    // The server clock alone advances combat. A hidden or disconnected client cannot pause it.
    const elapsed = Math.max(0, Math.min(30000, now - this.lastTick)) + this.remainder;
    const steps = Math.floor(elapsed / RULES.tickMs) * RULES.tickMs;
    this.remainder = elapsed - steps; this.lastTick = now;
    for (const room of this.rooms.values()) advanceRoom(room, steps);
    for (const session of this.sessions.values()) {
      const player = this.rooms.get(session.roomId)?.players.find(p => p.id === session.playerId);
      if (player) player.connected = now - session.seen < 6000;
    }
    this.cleanup();
  }
  cleanup() {
    const now = this.now();
    for (const [id, room] of this.rooms) {
      const sessions = [...this.sessions.values()].filter(s => s.roomId === id);
      const lastSeen = Math.max(room.createdAt, ...sessions.map(s => s.seen));
      if (now - room.createdAt > 2 * 60 * 60 * 1000 || now - lastSeen > 10 * 60 * 1000) {
        this.rooms.delete(id);
        for (const [token, session] of this.sessions) if (session.roomId === id) this.sessions.delete(token);
      }
    }
  }
}

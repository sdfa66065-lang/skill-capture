import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { INITIAL_COINS, type RequestCmd, type Requests, type ResponseMsg } from '@game/shared';
import { startGameServer, type GameServer } from '../src/app.ts';

let server: GameServer;
beforeAll(async () => {
  server = await startGameServer({ port: 0, dbPath: ':memory:' });
});
afterAll(() => server.close());

async function connect() {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
  await new Promise((r) => ws.once('open', r));
  let seq = 0;
  const pushes: { cmd: string; data: unknown }[] = [];
  const pending = new Map<number, (m: ResponseMsg) => void>();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.seq !== undefined) pending.get(m.seq)?.(m);
    else pushes.push(m);
  });
  const call = <C extends RequestCmd>(cmd: C, data: Requests[C][0]) =>
    new Promise<ResponseMsg<C>>((resolve) => {
      const s = ++seq;
      pending.set(s, resolve as (m: ResponseMsg) => void);
      ws.send(JSON.stringify({ cmd, seq: s, data }));
    });
  return { ws, call, pushes };
}

describe('game server', () => {
  it('未登录不能进入游戏', async () => {
    const { ws, call } = await connect();
    expect(await call('fish.enter', {})).toMatchObject({ ok: false, error: 'NOT_LOGGED_IN' });
    ws.close();
  });

  it('未知命令返回 BAD_REQUEST', async () => {
    const { ws, call } = await connect();
    expect(await call('nope' as RequestCmd, {} as never)).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    ws.close();
  });

  it('登录 → 进入捕鱼 → 开炮 → 命中', async () => {
    const { ws, call } = await connect();
    const login = await call('login', { deviceId: 'integration-device-1' });
    expect(login).toMatchObject({ ok: true, data: { user: { coins: INITIAL_COINS } } });

    const enter = await call('fish.enter', {});
    if (!enter.ok) throw new Error(enter.error);
    expect(enter.data.fishes.length).toBeGreaterThan(0);

    const fire = await call('fish.fire', { bulletId: 1, level: 2 });
    expect(fire).toMatchObject({ ok: true, data: { coins: INITIAL_COINS - 2 } });

    const hit = await call('fish.hit', { bulletId: 1, fishId: enter.data.fishes[0]!.id });
    if (!hit.ok) throw new Error(hit.error);
    expect(hit.data.coins).toBe(INITIAL_COINS - 2 + hit.data.reward);

    // 重新连接后余额保持
    ws.close();
    const again = await connect();
    const relog = await again.call('login', { deviceId: 'integration-device-1' });
    if (!relog.ok) throw new Error(relog.error);
    expect(relog.data.user.coins).toBe(hit.data.coins);
    again.ws.close();
  });

  it('大字牌：进房 → 出牌 → 离开结算', async () => {
    const { ws, call, pushes } = await connect();
    await call('login', { deviceId: 'integration-device-zipai' });
    const enter = await call('zipai.enter', {});
    if (!enter.ok) throw new Error(enter.error);
    const view = enter.data;
    expect(view.players.map((p) => p.isBot)).toEqual([false, true, true]);
    expect(view.phase).toBe('discard');

    const discard = view.options.find((o) => o.type === 'discard')!;
    expect(await call('zipai.action', { action: discard })).toMatchObject({ ok: true });
    expect(await call('zipai.action', { action: discard })).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(await call('zipai.action', { action: { type: 'chi', cards: 'x' } as never })).toMatchObject({ ok: false });
    expect(pushes.some((p) => p.cmd === 'zipai.state')).toBe(true);

    const coinPushes = pushes.filter((p) => p.cmd === 'coins').length;
    expect(await call('zipai.leave', {})).toMatchObject({ ok: true });
    expect(pushes.filter((p) => p.cmd === 'coins').length).toBe(coinPushes + 1);
    expect(await call('zipai.next', {})).toMatchObject({ ok: false, error: 'NOT_IN_ROOM' });
    ws.close();
  });

  it('九个荔枝：转一次扣 8 × 单线押注', async () => {
    const { ws, call } = await connect();
    expect(await call('lychee.spin', { lineBet: 1 })).toMatchObject({ ok: false, error: 'NOT_LOGGED_IN' });
    await call('login', { deviceId: 'integration-device-lychee' });
    const r = await call('lychee.spin', { lineBet: 2 });
    if (!r.ok) throw new Error(r.error);
    expect(r.data.grid).toHaveLength(9);
    expect(r.data.coins).toBe(INITIAL_COINS - 16 + r.data.win);
    ws.close();
  });
});

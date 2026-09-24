import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { PushCmd, Pushes, RequestCmd, RequestMsg, Requests, ResponseMsg } from '@game/shared';
import { openDb } from './db.ts';
import { GameError } from './errors.ts';
import { FishRoom } from './fish/FishRoom.ts';
import { Wallet } from './wallet.ts';
import { ZipaiRoom } from './zipai/ZipaiRoom.ts';

const FISH_TICK_MS = 500;

export interface GameServerOptions {
  port: number;
  dbPath: string;
  /** 打包后的客户端目录；存在时由本服务直接托管 */
  staticDir?: string;
}

export interface GameServer {
  port: number;
  close(): Promise<void>;
}

/** 每个 WebSocket 连接对应一个会话 */
class Session {
  userId: number | null = null;
  nickname = '';
  zipaiRoom: ZipaiRoom | null = null;
  fishRoom: FishRoom | null = null;
  fishTimer: NodeJS.Timeout | null = null;

  constructor(private readonly ws: WebSocket) {}

  push<C extends PushCmd>(cmd: C, data: Pushes[C]) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify({ cmd, data }));
  }

  leaveFish() {
    if (this.fishTimer) clearInterval(this.fishTimer);
    this.fishTimer = null;
    this.fishRoom = null;
  }

  leaveZipai() {
    this.zipaiRoom?.leave();
    this.zipaiRoom = null;
  }
}

type Handler<C extends RequestCmd> = (s: Session, data: Requests[C][0]) => Requests[C][1];

export function startGameServer(opts: GameServerOptions): Promise<GameServer> {
  const db = openDb(opts.dbPath);
  const wallet = new Wallet(db);
  // 用加密随机数做命中判定，防止被预测
  const random = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;

  const requireUser = (s: Session): number => {
    if (s.userId === null) throw new GameError('NOT_LOGGED_IN');
    return s.userId;
  };
  const requireFishRoom = (s: Session): FishRoom => {
    requireUser(s);
    if (!s.fishRoom) throw new GameError('NOT_IN_ROOM');
    return s.fishRoom;
  };

  const requireZipaiRoom = (s: Session): ZipaiRoom => {
    requireUser(s);
    if (!s.zipaiRoom) throw new GameError('NOT_IN_ROOM');
    return s.zipaiRoom;
  };

  const handlers: { [C in RequestCmd]: Handler<C> } = {
    ping: (_s, { t }) => ({ t, serverTime: Date.now() }),

    login: (s, { deviceId }) => {
      if (typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 64) {
        throw new GameError('BAD_REQUEST');
      }
      const user = wallet.loginGuest(deviceId);
      s.userId = user.id;
      s.nickname = user.nickname;
      return { user, serverTime: Date.now() };
    },

    relief: (s) => wallet.claimRelief(requireUser(s)),

    'fish.enter': (s) => {
      const userId = requireUser(s);
      s.leaveFish();
      const room = new FishRoom({ roomId: randomUUID(), userId, wallet, now: Date.now, random });
      room.tick();
      s.fishRoom = room;
      s.fishTimer = setInterval(() => {
        const fishes = room.tick();
        if (fishes.length) s.push('fish.spawn', { fishes });
      }, FISH_TICK_MS);
      return { fishes: room.aliveFishes(), serverTime: Date.now() };
    },

    'fish.leave': (s) => {
      s.leaveFish();
      return {};
    },

    'fish.fire': (s, { bulletId, level }) => ({ coins: requireFishRoom(s).fire(bulletId, level) }),

    'fish.hit': (s, { bulletId, fishId }) => requireFishRoom(s).hit(bulletId, fishId),

    'zipai.enter': (s) => {
      const userId = requireUser(s);
      s.leaveZipai();
      const room = new ZipaiRoom({
        roomId: randomUUID(),
        userId,
        nickname: s.nickname,
        wallet,
        random,
        now: Date.now,
        send: (view) => {
          s.push('zipai.state', view);
          if (view.result) s.push('coins', { coins: wallet.balance(userId) });
        },
      });
      const view = room.start();
      s.zipaiRoom = room;
      return view;
    },

    'zipai.next': (s) => requireZipaiRoom(s).start(),

    'zipai.action': (s, { action }) => {
      if (typeof action !== 'object' || action === null) throw new GameError('BAD_REQUEST');
      requireZipaiRoom(s).act(action);
      return {};
    },

    'zipai.leave': (s) => {
      s.leaveZipai();
      return {};
    },
  };

  const http = createServer((req, res) => serveStatic(opts.staticDir, req.url ?? '/', res));
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

  wss.on('connection', (ws) => {
    const session = new Session(ws);
    ws.on('message', (raw) => {
      let msg: RequestMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return ws.close(1003, 'bad json');
      }
      const { cmd, seq } = msg;
      let reply: ResponseMsg;
      try {
        if (!Object.hasOwn(handlers, cmd) || typeof msg.data !== 'object' || msg.data === null) {
          throw new GameError('BAD_REQUEST');
        }
        const data = (handlers[cmd] as Handler<RequestCmd>)(session, msg.data);
        reply = { cmd, seq, ok: true, data } as ResponseMsg;
      } catch (e) {
        if (!(e instanceof GameError)) console.error(`[${cmd}]`, e);
        reply = { cmd, seq, ok: false, error: e instanceof GameError ? e.code : 'INTERNAL' };
      }
      ws.send(JSON.stringify(reply));
    });
    ws.on('close', () => {
      session.leaveFish();
      session.leaveZipai();
    });
  });

  return new Promise((resolve) => {
    http.listen(opts.port, () => {
      resolve({
        port: (http.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((done) => {
            for (const c of wss.clients) c.terminate();
            wss.close();
            http.close(() => {
              db.close();
              done();
            });
          }),
      });
    });
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
};

function serveStatic(dir: string | undefined, url: string, res: ServerResponse) {
  if (!dir || !existsSync(dir)) {
    res.writeHead(404).end('client not built');
    return;
  }
  const rel = normalize(decodeURIComponent(url.split('?')[0]!)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dir, rel);
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

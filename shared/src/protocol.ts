// 客户端 → 服务端：{ cmd, seq, data }   服务端回复：{ cmd, seq, ok, data | error }
// 服务端主动推送：{ cmd, data }（没有 seq）

import type { FishState } from './fish.ts';
import type { ZipaiAction, ZipaiView } from './zipai.ts';

export interface UserInfo {
  id: number;
  nickname: string;
  coins: number;
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_LOGGED_IN'
  | 'INSUFFICIENT_COINS'
  | 'RATE_LIMIT'
  | 'TOO_MANY_BULLETS'
  | 'NOT_IN_ROOM'
  | 'RELIEF_NOT_ELIGIBLE'
  | 'RELIEF_LIMIT'
  | 'INTERNAL';

/** 请求命令：cmd → [请求参数, 响应数据] */
export interface Requests {
  ping: [{ t: number }, { t: number; serverTime: number }];
  login: [{ deviceId: string }, { user: UserInfo; serverTime: number }];
  relief: [{}, { coins: number; remainingToday: number }];
  'fish.enter': [{}, { fishes: FishState[]; serverTime: number }];
  'fish.leave': [{}, {}];
  'fish.fire': [{ bulletId: number; level: number }, { coins: number }];
  'fish.hit': [{ bulletId: number; fishId: number }, FishHitResult];
  /** 进入大字牌房间并开始第一局 */
  'zipai.enter': [{}, ZipaiView];
  /** 上一局结束后开始下一局 */
  'zipai.next': [{}, ZipaiView];
  'zipai.action': [{ action: ZipaiAction }, {}];
  'zipai.leave': [{}, {}];
}

export interface FishHitResult {
  bulletId: number;
  fishId: number;
  caught: boolean;
  reward: number;
  coins: number;
}

/** 服务端推送 */
export interface Pushes {
  coins: { coins: number };
  'fish.spawn': { fishes: FishState[] };
  'zipai.state': ZipaiView;
}

export type RequestCmd = keyof Requests;
export type PushCmd = keyof Pushes;

export interface RequestMsg<C extends RequestCmd = RequestCmd> {
  cmd: C;
  seq: number;
  data: Requests[C][0];
}

export type ResponseMsg<C extends RequestCmd = RequestCmd> =
  | { cmd: C; seq: number; ok: true; data: Requests[C][1] }
  | { cmd: C; seq: number; ok: false; error: ErrorCode };

export interface PushMsg<C extends PushCmd = PushCmd> {
  cmd: C;
  data: Pushes[C];
}

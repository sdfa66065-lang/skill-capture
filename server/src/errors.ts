import type { ErrorCode } from '@game/shared';

/** 业务错误：code 原样返回给客户端 */
export class GameError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

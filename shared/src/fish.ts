/** 捕鱼场景的逻辑坐标系（客户端按比例缩放显示） */
export const WORLD_W = 1280;
export const WORLD_H = 720;

/** 炮台位置（底部居中） */
export const CANNON_X = WORLD_W / 2;
export const CANNON_Y = WORLD_H - 30;

/** 可选炮倍；每发子弹消耗 = 炮倍 */
export const CANNON_LEVELS = [1, 2, 5, 10] as const;

/** 目标回报率：捕获概率 = RTP / 鱼倍率，长期期望回收 = 1 - RTP */
export const FISH_RTP = 0.95;

export const BULLET_SPEED = 900; // px/s
export const BULLET_RADIUS = 8;
export const MAX_BULLETS = 20;
/** 客户端子弹寿命；服务端多留一点余量 */
export const BULLET_LIFETIME_MS = 20_000;
export const MIN_FIRE_INTERVAL_MS = 80;

export interface FishType {
  id: number;
  name: string;
  multiplier: number;
  weight: number; // 出现权重
  speed: number; // px/s
  radius: number; // 碰撞半径
  color: number;
}

export const FISH_TYPES: readonly FishType[] = [
  { id: 0, name: '小丑鱼', multiplier: 2, weight: 40, speed: 140, radius: 18, color: 0xff8c42 },
  { id: 1, name: '河豚', multiplier: 5, weight: 25, speed: 110, radius: 24, color: 0xf6d55c },
  { id: 2, name: '海龟', multiplier: 10, weight: 15, speed: 80, radius: 32, color: 0x3caea3 },
  { id: 3, name: '灯笼鱼', multiplier: 20, weight: 10, speed: 90, radius: 36, color: 0x9b5de5 },
  { id: 4, name: '鲨鱼', multiplier: 50, weight: 7, speed: 100, radius: 50, color: 0x6c8ead },
  { id: 5, name: '金龙', multiplier: 100, weight: 3, speed: 70, radius: 60, color: 0xffd700 },
];

export type Vec2 = [number, number];

/** 服务端生成、下发给客户端的鱼；位置由路径 + 时间确定性计算，无需逐帧同步 */
export interface FishState {
  id: number;
  type: number;
  spawnAt: number; // 服务器时间 ms
  duration: number; // ms
  path: [Vec2, Vec2, Vec2]; // 二次贝塞尔：起点、控制点、终点
}

export function pickFishType(random: () => number): FishType {
  const total = FISH_TYPES.reduce((s, f) => s + f.weight, 0);
  let r = random() * total;
  for (const f of FISH_TYPES) {
    r -= f.weight;
    if (r < 0) return f;
  }
  return FISH_TYPES[0]!;
}

/** 从屏幕一侧游到另一侧的随机路径 */
export function createFishPath(random: () => number, type: FishType): { path: [Vec2, Vec2, Vec2]; duration: number } {
  const margin = type.radius * 2 + 20;
  const leftToRight = random() < 0.5;
  const x0 = leftToRight ? -margin : WORLD_W + margin;
  const x2 = leftToRight ? WORLD_W + margin : -margin;
  const y0 = 60 + random() * (WORLD_H - 220);
  const y2 = 60 + random() * (WORLD_H - 220);
  const p1: Vec2 = [WORLD_W / 2 + (random() - 0.5) * 400, 40 + random() * (WORLD_H - 200)];
  const path: [Vec2, Vec2, Vec2] = [[x0, y0], p1, [x2, y2]];
  const length = approxBezierLength(path);
  return { path, duration: Math.round((length / type.speed) * 1000) };
}

function bezier(path: [Vec2, Vec2, Vec2], u: number): Vec2 {
  const [[x0, y0], [x1, y1], [x2, y2]] = path;
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return [a * x0 + b * x1 + c * x2, a * y0 + b * y1 + c * y2];
}

function approxBezierLength(path: [Vec2, Vec2, Vec2]): number {
  let len = 0;
  let prev = path[0];
  for (let i = 1; i <= 20; i++) {
    const p = bezier(path, i / 20);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return len;
}

export function isFishAlive(fish: FishState, now: number): boolean {
  return now >= fish.spawnAt && now <= fish.spawnAt + fish.duration;
}

/** 某时刻鱼的位置和朝向（弧度） */
export function fishPosition(fish: FishState, now: number): { x: number; y: number; angle: number } {
  const u = Math.min(1, Math.max(0, (now - fish.spawnAt) / fish.duration));
  const [x, y] = bezier(fish.path, u);
  // 用前后两点的差分算朝向；路径末端往回取样
  const u2 = Math.min(1, u + 0.01);
  const [ax, ay] = bezier(fish.path, u2 - 0.01);
  const [bx, by] = bezier(fish.path, u2);
  return { x, y, angle: Math.atan2(by - ay, bx - ax) };
}

import { describe, expect, it } from 'vitest';
import { ZIPAI_RULES, bestDecomposition, meldHuxi, tripleKind, type ZipaiAction } from '@game/shared';
import { chooseAction, chooseDiscard } from '../src/zipai/ai.ts';
import { ZipaiGame } from '../src/zipai/ZipaiGame.ts';

/** 可复现的伪随机数（mulberry32） */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 牌的简写：小字 1..10，大字 B(n) = 10 + n
const B = (n: number) => 10 + n;

/**
 * 构造指定手牌和牌墩的对局。发牌部分用不会起手提的顺序，发完再覆盖成想要的手牌。
 * 场景测试只关心规则，不要求 80 张牌守恒。
 */
function scenario(hands: number[][], stock: number[], dealer = 0) {
  const filler: number[] = [];
  for (let k = 0; k < 4; k++) for (let c = 1; c <= 20; c++) filler.push(c);
  const game = new ZipaiGame([...filler.slice(0, 61), ...stock], dealer);
  hands.forEach((h, i) => (game.players[i]!.hand = [...h]));
  return game;
}

/** 20 张的听牌手：一二三、壹贰叁、二七十、贰柒拾、四五六、肆伍陆 + 八九（听七或十） */
const WAITING_HAND = [1, 2, 3, B(1), B(2), B(3), 2, 7, 10, B(2), B(7), B(10), 4, 5, 6, B(4), B(5), B(6), 8, 9];

describe('牌型', () => {
  it('识别各种三张组合', () => {
    expect(tripleKind([3, 3, 3])).toBe('kan');
    expect(tripleKind([4, 5, 6])).toBe('shun');
    expect(tripleKind([B(2), B(7), B(10)])).toBe('ererqishi');
    expect(tripleKind([5, 5, B(5)])).toBe('jiao');
    expect(tripleKind([5, B(5), B(5)])).toBe('jiao');
    expect(tripleKind([9, 10, B(1)])).toBeNull(); // 大小字不能连成顺子
    expect(tripleKind([2, 7, B(10)])).toBeNull();
  });

  it('亮牌胡息', () => {
    expect(meldHuxi({ type: 'ti', cards: [1, 1, 1, 1] })).toBe(9);
    expect(meldHuxi({ type: 'pao', cards: [B(1), B(1), B(1), B(1)] })).toBe(9);
    expect(meldHuxi({ type: 'wei', cards: [B(3), B(3), B(3)] })).toBe(6);
    expect(meldHuxi({ type: 'peng', cards: [4, 4, 4] })).toBe(1);
    expect(meldHuxi({ type: 'chi', cards: [1, 2, 3] })).toBe(3);
    expect(meldHuxi({ type: 'chi', cards: [B(2), B(7), B(10)] })).toBe(6);
    expect(meldHuxi({ type: 'chi', cards: [4, 5, 6] })).toBe(0);
  });

  it('拆牌取胡息最大的拆法', () => {
    const r = bestDecomposition([...WAITING_HAND, 10]);
    expect(r?.huxi).toBe(18);
    expect(bestDecomposition([1, 2, 3, 5])).toBeNull();
    // 牌数 ≡ 2 时需要一个将
    expect(bestDecomposition([1, 2, 3, 9, 9])?.huxi).toBe(3);
    expect(bestDecomposition([1, 2, 3, 9, 8])).toBeNull();
  });

  it('坎不能拆开', () => {
    // 三三三 四 五：拆成 三四五 + 三三 需要将，这里牌数 5 ≡ 2；但坎锁定后只能 三三三 + 四五（不成组）
    expect(bestDecomposition([3, 3, 3, 4, 5], new Set([3]))).toBeNull();
    expect(bestDecomposition([3, 3, 3, 4, 5])).not.toBeNull();
  });
});

describe('ZipaiGame 规则', () => {
  it('出牌后下家可以碰也可以吃，合并成一次询问', () => {
    const g = scenario([[5, ...new Array(20).fill(20)], [5, 5, 4, 6, 1, 1, 12, 13], [9]], [11]);
    expect(g.pending()?.seat).toBe(0);
    g.act(0, { type: 'discard', card: 5 });
    const p = g.pending()!;
    expect(p.seat).toBe(1);
    expect(p.options).toContainEqual({ type: 'peng' });
    expect(p.options).toContainEqual({ type: 'chi', cards: [4, 6] });
    expect(p.options).toContainEqual({ type: 'pass' });
  });

  it('碰优先于吃；碰的人过了才轮到吃', () => {
    // 座位 2 有对子能碰，座位 1（下家）能吃
    const g = scenario([[5, 1, 2, 3], [4, 6, 9, 9], [5, 5, 8, 8]], [11, 12]);
    g.act(0, { type: 'discard', card: 5 });
    expect(g.pending()).toMatchObject({ seat: 2, options: [{ type: 'peng' }, { type: 'pass' }] });
    g.act(2, { type: 'pass' });
    expect(g.pending()?.seat).toBe(1);
    g.act(1, { type: 'chi', cards: [4, 6] });
    expect(g.players[1]!.melds).toEqual([{ type: 'chi', cards: [4, 5, 6] }]);
    // 吃完要出牌
    expect(g.pending()).toMatchObject({ seat: 1, options: [{ type: 'discard', card: 9 }] });
  });

  it('没人要的牌进弃牌区，下家摸牌', () => {
    const g = scenario([[5, 1], [9, 9, 9], [12]], [B(8)]);
    g.act(0, { type: 'discard', card: 5 });
    expect(g.pending()).toBeNull();
    g.step();
    expect(g.players[0]!.discards).toEqual([5]);
    expect(g.phase).toBe('draw');
    expect(g.turn).toBe(1);
    g.step(); // 座位 1 摸到 捌
    expect(g.table).toEqual({ card: B(8), from: 1, source: 'draw' });
  });

  it('坎里的牌不能打出，也不能拆开吃', () => {
    const g = scenario([[5, 5, 5, 1], [4, 4, 4, 6, 7, 9], [12]], []);
    expect(g.pending()!.options).toEqual([{ type: 'discard', card: 1 }]);
    expect(() => g.act(0, { type: 'discard', card: 5 })).toThrow('BAD_REQUEST');
    expect(g.chiOptions(1, 5)).toEqual([[6, 7]]);
  });

  it('自己摸到坎的第四张自动提；第一次提后出牌，第二次不用', () => {
    const g = scenario([[1], [3, 3, 3, 8, 8, 8, 10, 11], [12]], [3, 13, 8]);
    g.act(0, { type: 'discard', card: 1 });
    g.step(); // 无人要
    g.step(); // 座位 1 摸到 三
    expect(g.pending()).toBeNull();
    g.step(); // 自动提
    expect(g.players[1]!.melds).toEqual([{ type: 'ti', cards: [3, 3, 3, 3] }]);
    expect(g.pending()?.seat).toBe(1); // 第一次提要出牌
    g.act(1, { type: 'discard', card: 10 });
    g.step(); // 无人要
    g.step(); // 座位 2 摸到 叁，没人要
    g.step();
    g.step(); // 座位 0 摸到 八：座位 1 有坎 → 跑
    expect(g.table).toMatchObject({ card: 8, from: 0 });
    g.step();
    expect(g.players[1]!.melds[1]).toEqual({ type: 'pao', cards: [8, 8, 8, 8] });
    // 第二次提/跑不用出牌，轮到下家摸牌
    expect(g.phase).toBe('draw');
    expect(g.turn).toBe(2);
  });

  it('摸到的牌和手里对子组成偎，之后要出牌', () => {
    const g = scenario([[1], [B(4), B(4), 2, 9], [12]], [B(4)]);
    g.act(0, { type: 'discard', card: 1 });
    g.step();
    g.step(); // 座位 1 摸到 肆
    g.step(); // 自动偎
    expect(g.players[1]!.melds).toEqual([{ type: 'wei', cards: [B(4), B(4), B(4)] }]);
    expect(g.pending()?.seat).toBe(1);
  });

  it('胡息够了可以胡，按囤数结算', () => {
    const g = scenario([[10, ...new Array(20).fill(20)], WAITING_HAND, [12]], []);
    g.act(0, { type: 'discard', card: 10 });
    expect(g.pending()).toEqual({ seat: 1, options: [{ type: 'hu' }, { type: 'pass' }] });
    g.act(1, { type: 'hu' });
    expect(g.phase).toBe('ended');
    expect(g.result).toMatchObject({ winner: 1, huxi: 18, tun: 1 + Math.floor((18 - ZIPAI_RULES.minHuxi) / 3) });
  });

  it('胡息不够不能胡', () => {
    // 四五六 肆伍陆 七八九 ... 全是 0 胡息的顺子
    const hand = [4, 5, 6, B(4), B(5), B(6), 7, 8, 9, B(7), B(8), B(9), 1, 1, B(1), 3, 4, 5, 8, 9];
    const g = scenario([[10, ...new Array(20).fill(20)], hand, [12]], []);
    g.act(0, { type: 'discard', card: 10 });
    expect(g.pending()?.options).not.toContainEqual({ type: 'hu' });
  });

  it('摸完牌墩没人胡就荒庄', () => {
    const g = scenario([[1], [9], [12]], []);
    g.act(0, { type: 'discard', card: 1 });
    g.step();
    g.step();
    expect(g.phase).toBe('ended');
    expect(g.result?.winner).toBeNull();
  });
});

describe('AI', () => {
  it('能胡就胡，其次碰，吃只吃有胡息的', () => {
    const opts: ZipaiAction[] = [{ type: 'peng' }, { type: 'hu' }, { type: 'pass' }];
    expect(chooseAction([], opts, 5)).toEqual({ type: 'hu' });
    expect(chooseAction([], [{ type: 'peng' }, { type: 'pass' }], 5)).toEqual({ type: 'peng' });
    expect(chooseAction([], [{ type: 'chi', cards: [4, 6] }, { type: 'pass' }], 5)).toEqual({ type: 'pass' });
    expect(chooseAction([], [{ type: 'chi', cards: [2, 3] }, { type: 'pass' }], 1)).toEqual({ type: 'chi', cards: [2, 3] });
  });

  it('出最孤立的牌', () => {
    expect(chooseDiscard([1, 2, 3, 9, 15, 15], [1, 2, 3, 9, 15])).toBe(9);
  });
});

describe('ZipaiGame 自我对局', () => {
  it('1000 局 AI 对打：牌数守恒、手牌数合法、每局都能结束', () => {
    let wins = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const random = seeded(seed);
      const g = ZipaiGame.deal(random, seed % 3);
      let steps = 0;
      while (g.phase !== 'ended') {
        const p = g.pending();
        if (p) g.act(p.seat, chooseAction(g.players[p.seat]!.hand, p.options, g.table?.card ?? null));
        else g.step();
        if (++steps > 2000) throw new Error(`seed ${seed} did not finish`);

        const total =
          g.stockCount +
          (g.table ? 1 : 0) +
          g.players.reduce((s, pl) => s + pl.hand.length + pl.discards.length + pl.melds.reduce((a, m) => a + m.cards.length, 0), 0);
        expect(total).toBe(80);
        for (const [seat, pl] of g.players.entries()) {
          if (g.phase === 'discard' && g.turn === seat) continue;
          // 等牌时：没提/跑过 ≡ 2，提/跑过 ≡ 1（需要将）
          expect(pl.hand.length % 3).toBe(pl.tiCount === 0 ? 2 : 1);
        }
      }
      if (g.result!.winner !== null) {
        wins++;
        expect(g.result!.huxi).toBeGreaterThanOrEqual(ZIPAI_RULES.minHuxi);
      }
    }
    // 规则和 AI 大致合理的话，大部分局会有人胡
    expect(wins).toBeGreaterThan(300);
  });
});

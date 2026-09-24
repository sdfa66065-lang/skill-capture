# 游戏合集（捕鱼 / 大字牌 / 九个荔枝）

跨平台（网页 → 之后用 Capacitor 打包安卓/iOS）的休闲游戏，只使用虚拟金币，**不能充值、不能兑现**。
按「一个游戏一个游戏」推进，当前完成：**游客登录 + 金币系统 + 捕鱼（单人）**。

## 技术栈

| 目录 | 内容 |
|---|---|
| `shared/` | 前后端共用：协议类型、经济数值、鱼的配置和路径算法 |
| `server/` | Node.js + `ws` + 内置 SQLite（`node:sqlite`），所有扣费和判定都在服务端完成 |
| `client/` | Vite + Phaser 3；占位美术用代码绘制（`client/src/textures.ts`） |

需要 Node.js ≥ 22.5。

## 本地开发

```bash
npm install

# 终端 1：游戏服务（:8080，数据库 game.db）
npm run dev:server

# 终端 2：前端热更新（浏览器打开终端里显示的地址，/ws 会自动转发到 :8080）
npm run dev:client
```

用手机测试：手机和电脑连同一个 Wi-Fi，打开 `dev:client` 输出的 Network 地址。

## 检查与构建

```bash
npm test            # 服务端单元测试 + 集成测试
npm run typecheck   # 三个包的类型检查
npm run build       # 打包前端到 client/dist
npm start           # 服务端同时托管 client/dist，打开 http://localhost:8080
```

环境变量：`PORT`（默认 8080）、`DB_PATH`（默认 `game.db`）；前端可用 `VITE_WS_URL` 指定服务器地址（打包成 App 时需要）。

## 金币规则

- 新游客发 10,000 金币；余额 < 100 时可领 2,000 救济金，每天 3 次（北京时间自然日）。
- 所有变动都通过 `server/src/wallet.ts` 的 `Wallet.change`，同一事务内更新余额并写 `coin_logs` 流水；
  `(reason, ref_id)` 唯一，重复请求不会重复加扣。

## 捕鱼

- 炮倍 1 / 2 / 5 / 10，每发消耗 = 炮倍；捕获得到 鱼倍率 × 炮倍。
- 捕获概率 = `FISH_RTP / 鱼倍率`（默认 0.95，长期回收 5%），数值都在 `shared/src/fish.ts`。
- 鱼的路径由服务端生成（贝塞尔曲线 + 出生时间），客户端按服务器时间自行计算位置，不需要逐帧同步。
- 客户端只做表现：`fish.fire` 扣费、`fish.hit` 判定都在 `server/src/fish/FishRoom.ts`。

## 协议

WebSocket `/ws`，JSON：请求 `{cmd, seq, data}`，响应 `{cmd, seq, ok, data | error}`，推送 `{cmd, data}`。
完整定义见 `shared/src/protocol.ts`。

## 下一步

1. 捕鱼：在真机上调手感（射速、子弹速度、鱼的速度和数量），替换正式美术和音效。
2. 大字牌：先确认规则（地区、胡息门槛），再写规则引擎和测试。
3. 九个荔枝。
4. Capacitor 打包安卓 / iOS。

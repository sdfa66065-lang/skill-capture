# 美术素材（AI 生成）

把 PNG 放进这个目录，文件名就是贴图 key，刷新即可生效；缺哪张就继续用代码画的占位图。
素材会按原比例缩放、居中到下表的尺寸，所以碰撞半径、锚点、旋转等游戏逻辑都不用改。

## 规格

| 文件名 | 内容 | 游戏内尺寸 | 建议出图 | 朝向 / 要求 |
| --- | --- | --- | --- | --- |
| `fish0.png` | 小丑鱼 ×2 | 54×36 | 768×512 | 侧视，头朝右，尾巴贴左边 |
| `fish1.png` | 河豚 ×5 | 72×48 | 768×512 | 同上 |
| `fish2.png` | 海龟 ×10 | 96×64 | 768×512 | 同上 |
| `fish3.png` | 灯笼鱼 ×20 | 108×72 | 768×512 | 同上 |
| `fish4.png` | 鲨鱼 ×50 | 150×100 | 768×512 | 同上 |
| `fish5.png` | 金龙 ×100 | 180×120 | 768×512 | 同上 |
| `bullet.png` | 炮弹 | 16×16 | 256×256 | 圆形能量弹 |
| `net.png` | 渔网 | 80×80 | 512×512 | 正俯视圆形网，半透明白色 |
| `cannonBase.png` | 炮台底座 | 100×100 | 512×512 | 正俯视圆盘 |
| `cannonBarrel.png` | 炮管 | 80×28 | 800×280 | 俯视，炮口朝右，左端是转轴 |
| `coin.png` | 金币 | 28×28 | 256×256 | 正面 |

通用要求：

- **透明背景 PNG**。出图工具不支持透明时，用纯绿/纯白背景出图再抠图。
- **主体撑满画布、裁掉多余留白**，否则缩放后会显小。
- 宽高比尽量和“游戏内尺寸”一致（鱼 3:2，炮管 20:7，其余 1:1），不一致时会等比缩放后居中。
- 所有素材用同一套风格前缀，保证画风统一。

## 出图提示词

风格前缀（每张都带上）：

```
2D casual mobile game asset, cute cartoon style, bold clean outlines, soft cel shading,
vibrant saturated colors, single object, centered, isolated on transparent background, no text
```

| 文件名 | 主体描述 |
| --- | --- |
| `fish0.png` | side view of a small orange clownfish with white stripes, facing right |
| `fish1.png` | side view of a round yellow pufferfish with small spikes, facing right |
| `fish2.png` | side view of a teal green sea turtle swimming, facing right |
| `fish3.png` | side view of a purple deep-sea anglerfish with a glowing lantern lure, facing right |
| `fish4.png` | side view of a steel blue shark with sharp teeth, facing right |
| `fish5.png` | side view of a majestic golden Chinese dragon fish, glowing, facing right |
| `bullet.png` | glowing pale yellow energy orb, round |
| `net.png` | top-down view of a round white fishing net, semi-transparent mesh |
| `cannonBase.png` | top-down view of a round dark teal cannon turret base with gold rim |
| `cannonBarrel.png` | top-down view of a golden cannon barrel pointing right, horizontal |
| `coin.png` | front view of a shiny gold coin |

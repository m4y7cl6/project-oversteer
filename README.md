# NITRO RUSH（project-oversteer）

瀏覽器 3D 卡丁車競速遊戲，靈感來自跑跑卡丁車（KartRider）：甩尾累積氮氣、
加速超越 7 名 AI 對手、奪下勝利。使用 **Three.js + TypeScript + Vite +
Rapier 物理引擎** 打造——預設完全使用程序化資產，不需要任何美術檔案。

## 🎮 立即遊玩

**👉 <https://m4y7cl6.github.io/project-oversteer/>**

桌面瀏覽器、手機（觸控操作 + PWA 全螢幕）、遊戲手把皆支援。

## 快速開始（本機開發）

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 型別檢查 + 產出正式版（dist/）
```

> 需要 Node 16+（專案固定使用 Vite 4 以相容 Node 16）。

## 操作方式

| 按鍵 | 動作 |
| --- | --- |
| `W` | 加速 |
| `S` | 煞車／倒車 |
| `A` / `D` | 轉向 |
| `Shift` | 甩尾（轉彎時按住） |
| `Ctrl` | 發動氮氣（量表集滿時） |
| `R` | 重置卡丁車回賽道 |
| `M` | 音樂開關 |

## 遊戲內容（Phase 2 Alpha）

### 遊戲流程與生涯模式
- 完整流程：**Splash → 主選單 → 車庫／設定 → 賽事設定 → 比賽 → 結算**。
- **金幣經濟**：依名次、甩尾表現與賽道上撿到的金幣獲得獎勵。
- **存檔系統**（localStorage）：金幣、車輛／賽道解鎖、升級、各賽道最佳
  單圈與最佳總時間、音量設定全部自動保存。

### 車輛與升級
- **5 台可選車輛**（VOLT GT／AERO ONE／BRUTE X／DRIFTA SE／NITRO-X），
  各有 Speed／Acceleration／Handling／Nitro 四維屬性，直接影響物理表現。
- **4 條升級線**：引擎、輪胎、氮氣罐、轉向系統，每級花費金幣、
  實際修改物理參數。

### 賽道
- **5 條賽道、4 種主題**：
  - SUNRISE CIRCUIT（草原）、THUNDER LOOP（草原）— 免費
  - EMERALD WOODS（森林）、DUNE BLAZE（沙漠）、NEON DISTRICT（夜間城市）
    — 用金幣解鎖
- 主題會改變天空、霧色、光照、地表與場景物件（松樹／仙人掌／高樓）。

### 駕駛系統
- **三階甩尾**：藍火（Blue）→ 紅火（Red）→ 紫火（Purple）。
  甩尾越久火花等級越高，放開時獲得瞬間加速與額外氮氣，品質越好獎勵越多。
- **道具系統**：賽道上有氮氣罐（+35 氮氣）與金幣可撿，
  架構（ItemManager / ItemDefinition / ItemEffect）已為未來道具預留。
- **檢查點**需依序通過，圈數可選 1／3／5 圈。
- **8 位車手**（玩家 + 7 AI）。AI 沿賽車線行駛、依彎道煞車、閃避車流、
  直線使用氮氣，並有輕度 rubber-band 讓比賽保持緊湊。
- 卡丁車是 **Rapier 動力學剛體**——撞牆、車對車碰撞、草地越野
 （低抓地、高阻力）全部走物理。

### 模式
- **RACE**：與 7 名 AI 競速。
- **TIME TRIAL**：單人計時，自動錄製／重播你的最佳**幽靈車**。
- **線上多人（原型）**：見下方說明。

## 美術資產管線

卡丁車模型來自 **Kenney Car Kit + Racing Kit（CC0）**。下載的資產不進版控；
新 clone 後執行一次管線即可（缺少 `public/assets/` 時遊戲自動退回程序化模型）：

```bash
npm run assets:download   # 抓取 CC0 資產包到 assets/raw/
node -r ts-node/register/transpile-only scripts/optimize-assets.ts --filter "kart-oo|race-future|race\.glb|raceCarWhite"
npm run assets:build      # 發佈到 public/assets/ + manifest.json
```

車手模型在 `RACERS`（src/game/config.ts）中指定；車身材質載入時染成車手
代表色。僅允許 CC0／免費商用／可再散布的來源——詳見
[assets/ASSETS.md](assets/ASSETS.md)。

## 線上多人（原型）

在雙方都連得到的地方啟動房間伺服器：

```bash
npm run server        # ws 伺服器，埠 :8787（用 PORT 環境變數更改）
```

帶房間參數開啟遊戲（第一位加入者為房主，由房主開始比賽）：

```
http://localhost:5173/?room=MYROOM&name=PLAYER1
https://m4y7cl6.github.io/project-oversteer/?room=MYROOM&server=wss://your-host&name=PLAYER1
```

遠端卡丁車為插值顯示（線上模式無車對車碰撞）；排名即時同步。
同步模型細節見 docs/ROADMAP.md 的 M4 章節。

## 專案結構

```
src/
  core/      引擎底層：Physics（Rapier）、Input、AssetManager、ECS-like World
  game/      Game 組合根 + 調校參數 config
  track/     TrackBuilder（程序化賽道）、TrackData、TrackManager（規則）、主題
  vehicle/   Kart（剛體 + 操控模型）、玩家/AI 控制器、車輛資料庫與升級
  race/      RaceManager（計時、排名、rubber-band、重生）、GhostSystem
  items/     道具系統（ItemManager / ItemDefinition / ItemEffect）
  save/      SaveSystem（versioned localStorage）+ PlayerProfile（生涯存檔）
  audio/     AudioManager（BGM／引擎／甩尾／碰撞／氮氣 + 音量設定）
  replay/    Replay 錄製／回放基礎（資料結構 + 插值取樣）
  editor/    賽道編輯器基礎（自訂賽道資料模型、驗證、儲存）
  camera/    追逐攝影機
  effects/   輪胎煙霧／火花
  ui/        HUD、迷你地圖、各遊戲畫面、樣式
scripts/     資產管線 + E2E 測試（smoke / soak / career / timetrial / mobile / online）
docs/        架構與開發路線圖
```

更多細節見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 與
[docs/ROADMAP.md](docs/ROADMAP.md)。

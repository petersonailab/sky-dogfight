# 蒼穹纏鬥 Sky Dogfight — 給 Claude Code 的專案說明

## 工作方式
- 一律用繁體中文回覆。使用者不是程式老手：用白話說明改了什麼、要怎麼看到效果。
- 需要查的資料直接查，不用先問要不要查。
- 改完的流程：改 `src/` → `python3 build.py` → 跑相關測試、看截圖 → commit → 進 `main`。
- 網站由 GitHub Pages 從 `main` 分支根目錄發布，改動進 `main` 約 1 分鐘後上線。雲端工作階段會推一個分支：提醒使用者建立 PR 並合併，網站才會更新。

## 專案概要
- 瀏覽器多人空戰遊戲，正式網址：https://petersonailab.github.io/sky-dogfight/
- 沒有外部函式庫、沒有打包工具：自製 WebGL1 繪圖、合成音效，整個遊戲是一個 `index.html` 加上 `models/*.bin`。
- 連線：公開 MQTT（WSS）伺服器配對與轉送，再盡量改成 WebRTC 直連。
- 遊戲裡的文字都是繁體中文。repo 是公開的，不要放個人資料或金鑰。

## 檔案
- `src/*.js` 依檔名順序串成一支程式，模組之間用全域名稱互相呼叫：
  - `00_core` 數學（V3、Q、M4）與小工具；`10_gl` WebGL 繪圖與所有著色器；`20_mesh` 程式模型的網格產生器
  - `21_aircraft` 飛彈表 `MISSILES`、機型表 `AC_DEFS`（數值、掛載、塗裝、程式模型）；`22_hd` 精細模型載入
  - `30_world` 島嶼雲朵；`40_fx` 粒子；`45_audio` 音效；`50_plane` 飛機（飛行模型、遠端外插、舵面、尾焰）
  - `55_weapons` 機砲、飛彈、熱焰彈、雷達鎖定；`60_ai` AI 飛行員；`68_webnet` MQTT＋WebRTC 傳輸；`70_net` 連機核心
  - `75_game` 回合與重生、飛彈補充；`80_hud` 抬頭顯示器；`85_input` 操作與攝影機；`90_ui` 選單、機庫；`99_main` 主迴圈
- `src/page.html`：版面與 CSS。
- `build.py` 產生：`index.html`（正式網站，要 commit）、`dist/skydogfight.html`（Claude Artifact 版，載不到 .bin，只有程式模型）、`test/game.html`（有測試掛鉤 `window.__df` 和模擬的 Claude room）、`test/web.html`（測真正的網路傳輸）。`python3 build.py gallery` 產生機型圖鑑 `test/gallery.html`。
- **不要直接改 `index.html`**，改 `src/` 再執行 `build.py`。

## 測試
- 在 repo 根目錄開伺服器：`python3 -m http.server 8765 --bind 127.0.0.1`，測試都連 `http://127.0.0.1:8765/test/game.html`。
- 需要 Python 的 Playwright 和 Chromium（`pip install playwright`、`python3 -m playwright install chromium`）。腳本用 SwiftShader 軟體繪圖，沒有 GPU 也能跑；截圖存在 `test/shots/`（不進版控）。
- 軟體繪圖很慢，遊戲每幀最多算 0.1 秒，所以遊戲時間會比真實時間慢；量時間要用遊戲時間（參考 `test/reloadtest.py`）。
- 常用測試：
  - `python3 test/sim2.py 60 jet 7`、`python3 test/sim2.py 60 prop 6`：AI 混戰 60 秒，檢查 NaN、撞地、武器使用
  - `python3 test/mp.py`：兩個分頁連機（模擬 room）；`python3 test/webmp.py`：真正的 MQTT／WebRTC 流程（會自己開 `node test/mqtt_broker.js`）
  - `python3 test/reloadtest.py`：飛彈補充與熱焰彈冷卻
  - 外觀截圖：`test/hdview.py <stores|flames|prop|propfront|close> <機型…>`、`test/hdsurf2.py`（舵面）、`test/mslfly.py`（飛行中的飛彈）、`test/procshots.py`（程式模型）、`test/hdshots.py`（機庫）
  - `test/perfhd.py`：精細模型與程式模型的畫面時間比較

## 遊戲數值
- 七架噴射機（F-16V、F-22A、F-14A、Su-27、颱風、幻象 2000-5、經國號）和它們的飛彈，數值來自使用者給的表，**使用者沒要求就不要改**。MiG-21bis、R-3R、R-60 和四架螺旋槳機是估計值（`est: true`）。
- `perfOf()` 把表上的數值（km/h、°/s）換成飛行模型參數。
- 飛彈補充：`src/75_game.js` 的 `RELOAD_RAD`、`RELOAD_IR`（目前都是 7 秒補 1 枚）。熱焰彈冷卻：每架的 `st.flareCd`（噴射機都是 1.5 秒）。
- 尾焰：`def.flame: 'ru'` 是藍色（Su-27、MiG-21），其他是橘紅色，顏色在 `src/10_gl.js` 的 `FLAME_PAL`。

## 精細模型
- 有精細模型的：F-16、F-22、F-14、Su-27、颱風、幻象 2000、MiG-21、P-51、噴火、Bf 109，加上飛彈庫 `models/missiles.bin`。經國號和零戰只有程式模型（依三視圖做的，機徽用塗裝的 `marks`）。
- 載入在 `src/22_hd.js`（`HD_IDS`、作者標示 `HD_CREDIT`、飛彈對應 `MSL_HD`）。畫質「流暢」（觸控裝置預設）或網址加 `?lowpoly` 時改用程式模型。
- `.bin`（SDM1）格式：`'SDM1'` + u32 標頭長度 + JSON 標頭 + 頂點（每個 16 bytes：int16×3 位置、int16 飛彈槽、int8×3 法線、uint8 骨骼、uint16×2 UV）+ 索引 + WebP 貼圖。標頭的 `meta` 有 `bones`（舵面、F-14 後掠翼、螺旋槳的鉸鏈）、`flames`、`tips`、`stores`、`props`、`accY`。
- 飛彈槽：雷達彈 1–20、紅外線彈 21–40，著色器依已發射的數量把掛架上的飛彈藏起來。
- 轉檔工具在 `tools/hd/`。原始 GLB **不在 repo**（檔案太大，而且 F-22 的授權不允許單獨散布模型檔）。要重轉時：
  1. 把使用者提供的檔案放到 `tools/hd/src/<id>.glb`（id：f16、f22、f14、su27、typhoon、m2000、mig21、p51、spit、bf109），飛彈放到 `tools/hd/msl/`（`aim120.glb`、`nato_pack.glb`、`rus_pack.glb`）。
  2. 編譯 `tools/hd/msimp`（作法寫在 `msimp.cpp` 第一段註解，需要 meshoptimizer 原始碼）。
  3. 執行 `python3 tools/hd/build_hd.py <id>` 或 `python3 tools/hd/build_msl.py`。每架的設定在 `build_hd.py` 的 `CFG`：轉向、要移除的零件、掛架位置、可動零件。
- 授權：README 有作者與授權表。新增模型要同時更新 README 和 `HD_CREDIT`。標示 NC 的不可商用；F-22 是 Sketchfab Standard。

## 連機
- `src/70_net.js`（`PROTO = 4`）和 `src/68_webnet.js`。改了封包格式要把 `PROTO` 加一，避免新舊版本混在同一個房間。
- MQTT 主題前綴 `skydogfight/v4/`；邀請連結是網址後面的 `#房間代碼`；網址參數 `?nop2p` 只走伺服器轉送，`?mqtt=wss://…` 換伺服器。
- 房主是在房間待最久的人，負責 AI 和規則，離開時自動交接。

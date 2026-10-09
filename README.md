# 蒼穹纏鬥 Sky Dogfight

瀏覽器打開就能玩的多人空戰遊戲。挑一架真實戰機，把邀請連結傳給同學，一起在群島上空纏鬥。

**▶ 開始遊戲：https://petersonailab.github.io/sky-dogfight/**

## 跟同學連機

1. 打開上面的網址，選「聯機對戰」，挑好戰機按「起飛」，會自動開一間房間。
2. 按畫面左上的「邀請」（或在選單按「複製邀請連結」），把連結傳給同學。
3. 同學點開連結，房間代碼會自動帶入，選好戰機按「起飛」就進到同一場。

- 房主是在房間待最久的人，可以在選單裡加 AI 僚機、改模式（個人混戰／紅藍對抗）、時代和擊落數。
- 連線先透過公開的 MQTT 伺服器配對，接著盡量改成玩家之間 WebRTC 直連。直連不成（有些學校或公司網路會擋）就繼續由伺服器轉送，一樣能玩，只是延遲高一點。左上角會顯示「直連」或「轉送」和延遲。
- 完全連不上多人伺服器時，換個網路或開手機熱點再試。單人練習不需要網路。

## 操作

| 按鍵 | 功能 |
|---|---|
| 滑鼠 | 指向哪裡，飛機就轉向哪裡（點畫面鎖定游標，Esc 放開） |
| 左鍵／空白鍵 | 機砲 |
| 右鍵／F | 發射飛彈：把目標放進準星外的虛線圈，鎖定完成（紅色菱形）再發射 |
| Q／滾輪 | 切換雷達彈（遠）和紅外線彈（近） |
| E | 熱焰彈，有冷卻時間，等飛彈快打到再放最有效 |
| W／S | 油門加減；按住 Shift 開後燃器（燃料用完要等回充） |
| 方向鍵 | 直接操縱：↑↓ 俯仰（↓ 拉起）、←→ 滾轉；A／D 方向舵 |
| V／C | 切換座艙視角／按住看後方 |
| Tab | 計分板；Esc 或 P 叫出選單 |
| 手機 | 左半邊拖曳當搖桿，右邊按鈕開火，建議橫放 |

## 戰機數值

速度單位 km/h。

| 戰機 | 生命 | 極速（後燃／一般） | 最佳轉向 | 滾轉 | 雷達 | 後燃器 | 飛彈 |
|---|---|---|---|---|---|---|---|
| F-16V 毒蛇 | 174 | 1388／826 | 41°/s @738 | 240°/s | 7.1 km ±33° | 14.4 s | 4× AIM-120、2× AIM-9M |
| F-22A 猛禽 | 297 | 1510／1361 | 40°/s @810 | 180°/s | 11.9 km ±33° | 18.0 s | 6× AIM-120、2× AIM-9M |
| F-14A 雄貓 | 251 | 1240／739 | 36°/s @666 | 180°/s | 17.8 km ±49° | 18.0 s | 4× AIM-54、4× AIM-9M |
| Su-27 側衛 | 297 | 1496／947 | 37°/s @846 | 180°/s | 11.9 km ±33° | 17.3 s | 4× R-27R、4× R-73 |
| 颱風戰鬥機 | 232 | 1510／1240 | 40°/s @738 | 190°/s | 11.9 km ±39° | 16.8 s | 4× Meteor、4× IRIS-T |
| 幻象 2000-5 | 223 | 1509／907 | 40°/s @810 | 175°/s | 9.5 km ±33° | 14.4 s | 4× Super 530D、4× R.550 Magic |
| F-CK-1 經國號 | 200 | 1400／826 | 41°/s @738 | 240°/s | 7.1 km ±33° | 14.4 s | 4× AIM-120、2× AIM-9M |
| MiG-21bis 魚床\* | 165 | 1420／790 | 34°/s @760 | 200°/s | 6.0 km ±30° | 12.0 s | 2× R-3R、2× R-60 |

| 飛彈 | 類型 | 鎖定距離 | 傷害 | 速度 | 鎖定時間 |
|---|---|---|---|---|---|
| AIM-120 AMRAAM | 雷達 | 7.5 km | 140 | 4680 | 1.5 s |
| AIM-54 Phoenix | 雷達 | 12.0 km | 180 | 6120 | 1.5 s |
| Meteor | 雷達 | 12.0 km | 180 | 5400 | 1.5 s |
| R-27R | 雷達 | 7.1 km | 149 | 4914 | 1.0 s |
| Super 530D | 雷達 | 6.6 km | 167 | 4914 | 0.6 s |
| AIM-9M／R-73 | 紅外線 | 2.8 km | 132 | 3402 | 1.3 s |
| IRIS-T | 紅外線 | 2.8 km | 131 | 3402 | 1.3 s |
| R.550 Magic | 紅外線 | 2.5 km | 140 | 3402 | 1.3 s |

\* MiG-21bis、R-3R、R-60 和四架二戰螺旋槳機（P-51D、噴火、零戰、Bf 109）的數值是估計值。

### 規則重點

- 要先偵測到敵機才能鎖定：3 km 內靠目視全向發現，更遠要在雷達距離內、而且在機頭前方的掃描角裡。
- 飛彈進入爆炸半徑就造成表上的傷害；雷達彈每 20 秒補回 1 枚，紅外線彈每 15 秒補回 1 枚。
- 熱焰彈有機會騙走來襲飛彈，紅外線彈比雷達彈容易被騙。
- 後燃器燃料用完會鎖住，回充到 25% 才能再開。

## 3D 模型來源

七架噴射機使用 Sketchfab 上的精細模型（已減面、移除放下的起落架、轉成遊戲格式放在 `models/`）。經國號和四架螺旋槳機仍是程式產生的模型。

| 戰機 | 模型 | 作者 | 授權 |
|---|---|---|---|
| F-16 | [F16-C Falcon](https://sketchfab.com/3d-models/f16-c-falcon-4bc2ff75dc584af2afd0aa6bd8b79015) | Carlos.Maciel | CC BY 4.0 |
| F-22 | [F22 RAPTOR](https://sketchfab.com/3d-models/f22-raptor-ec44bd6cffa649b4927799a7b19c703b) | sxnneh | Sketchfab Standard |
| F-14 | [F14](https://sketchfab.com/3d-models/f14-af915a32b088402f8b22e31f93af09af) | manilov.ap | CC BY 4.0 |
| Su-27 | [Sukhoi Su-27M (USSR)](https://sketchfab.com/3d-models/sukhoi-su-27m-ussr-af788ebfb576454ca5eaac2313a30e5b) | 42manako | CC BY-NC 4.0 |
| 颱風 | [Eurofighter Typhoon - Fighter Jet - Free](https://sketchfab.com/3d-models/eurofighter-typhoon-fighter-jet-free-992bcc8987964ca09d55410330aa8579) | bohmerang | CC BY-NC-SA 4.0 |
| 幻象 2000 | [Mirage 2000-5F](https://sketchfab.com/3d-models/mirage-2000-5f-3894c147f6474d5eb6308b8d2724a914) | Jeyhun1985 | CC BY 4.0 |
| MiG-21 | [1972 MiG-21bis](https://sketchfab.com/3d-models/1972-mig-21bis-0fdbda95ec1a4121863fff5065c2fc51) | OUTPISTON | CC BY-NC-SA 4.0 |

- 修改內容：轉正方向與比例、移除起落架與部分座艙內裝、MiG-21 拿掉翼下副油箱、減面、貼圖縮小並轉成 WebP、機尾頂端改成玩家顏色。
- 標示 NC 的模型不可用於商業用途；標示 SA 的模型，改作後的檔案（`models/typhoon.bin`、`models/mig21.bin`）同樣以 CC BY-NC-SA 4.0 釋出。
- F-22 模型是 Sketchfab Standard 授權，只能作為作品的一部分使用，不可把模型檔單獨拿去散布。
- 電腦比較慢的話，網址加 `?lowpoly` 改用簡易模型。

## 技術說明

- 遊戲本體是單一 `index.html`：自製 WebGL 繪圖、合成音效，不需要安裝任何東西；精細模型放在 `models/`，載入前或載入失敗時會先用程式產生的簡易模型。原始碼在 `src/`，執行 `python3 build.py` 會重新產生 `index.html`；`tools/hd/` 是把 GLB 轉成 `models/*.bin` 的轉檔程式。
- 連線：公開的 MQTT over WSS 伺服器（[EMQX](https://www.emqx.com/mqtt/public-mqtt5-broker)、[HiveMQ](https://www.mqtt-dashboard.com/)）負責配對和轉送，WebRTC DataChannel 負責直連。公開伺服器上的訊息別人也看得到，呼號不要放個人資料。
- 進階：網址加 `?nop2p` 只用伺服器轉送；加 `?mqtt=wss://你的伺服器/mqtt` 改用自己的 MQTT 伺服器（可用逗號放多個）。

/* ============================================================
 *  Pixel Dungeon Quest - game.js  (v4)
 *  HTML/CSS/JS のみ。外部ライブラリ・画像なし。
 *
 *  v4 の主な仕様:
 *   - シンボルエンカウント（マップ上の敵に触れると戦闘。敵は待機）
 *   - 広く入り組んだマップ（部屋＋ループ通路＋行き止まり）
 *   - 各階に必ず守護者。倒すと「階段のカギ」を落とし次の階へ
 *   - 推奨レベル制（未満だと守護者は至難）
 *   - 敵を強化
 *   - もちものメニュー（装備の自由付け替え・アイテム使用で消費）
 *   - セーブ/音/タイトルは右上の歯車（設定）に集約
 *   - ミニマップ廃止（探索感UP）
 *   - 敵ビジュアルを精細化
 * ============================================================ */

/* ===========================================================
 * 1. 定数・設定
 * =========================================================== */
const MAP_W = 84, MAP_H = 54;     // さらに広いマップ
const TILE = 32;
const VIEW_W = 20, VIEW_H = 15;
const MAX_FLOOR = 5, BOSS_FLOOR = 5;
const SAVE_KEY = "pixel_dungeon_quest_save_v5";   // バランス刷新で旧セーブとは非互換

const T = { WALL: 0, FLOOR: 1, STAIRS: 2 };

const BASE_CRIT = 3;          // 基礎クリティカル率(%)
const BASE_DROP = 0.06;       // 基礎ドロップ率
const POISON_TURNS = 3;       // 毒の持続ターン
const POISON_DMG = 2;         // 毒1回のダメージ

// 敵テンプレート（短いローグライク向けに調整。evade=回避率%, poison=毒付与率%, greedy=低確率で多めGOLD）
const ENEMY_TYPES = {
  slime:     { name: "スライム",       hp: 14, atk: 4,  def: 0, exp: 5,  gold: 3 },
  bat:       { name: "コウモリ",       hp: 12, atk: 5,  def: 0, exp: 7,  gold: 4,  evade: 12 },
  goblin:    { name: "ゴブリン",       hp: 18, atk: 6,  def: 1, exp: 9,  gold: 6,  greedy: true },
  skeleton:  { name: "スケルトン",     hp: 28, atk: 8,  def: 2, exp: 14, gold: 8 },
  darkknight:{ name: "毒グモ",         hp: 24, atk: 6,  def: 1, exp: 13, gold: 7,  poison: 25 },
  ghost:     { name: "亡霊",           hp: 34, atk: 10, def: 1, exp: 18, gold: 10, evade: 18 },
  mimic:     { name: "ミミック",       hp: 42, atk: 13, def: 3, exp: 24, gold: 18 },
  orc:       { name: "魔導ゴーレム",   hp: 65, atk: 14, def: 5, exp: 30, gold: 20 },
  boss:      { name: "ダンジョンロード", hp: 200, atk: 18, def: 6, exp: 100, gold: 100, isBoss: true },
};

// フロアごとの出現テーブル（末尾ほど強い → 守護者は末尾の種）
const ENCOUNTER_TABLE = {
  1: ["slime", "slime", "bat", "goblin"],
  2: ["slime", "bat", "goblin", "skeleton"],
  3: ["goblin", "skeleton", "darkknight", "ghost"],
  4: ["skeleton", "darkknight", "ghost", "mimic"],
  5: ["ghost", "mimic", "orc"],
};

// 各階の推奨レベル
const FLOOR_RECLV = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 11 };

// 装備データ（短いローグライク向けに控えめな数値。各種ステータス：atk/def/crit%/evade%/luck/hp/xp%）
const EQUIP = {
  rusty_dagger:   { type: "weapon", name: "錆びた短剣",   atk: 1, crit: 3,        desc: "錆びついた短剣。心もとないが会心はわずかに出やすい。" },
  steel_sword:    { type: "weapon", name: "古びた剣",     atk: 2,                 desc: "使い込まれた剣。標準的で扱いやすい。" },
  battle_axe:     { type: "weapon", name: "旅人の斧",     atk: 3, evade: -2,      desc: "重い斧。火力は出るが大振りで回避が落ちる。" },
  amethyst_dagger:{ type: "weapon", name: "盗賊のナイフ", atk: 2, crit: 8, luck: 1, desc: "軽い刃。会心と幸運に優れる盗賊の得物。" },
  knight_sword:   { type: "weapon", name: "銀の剣",       atk: 4, def: 1,         desc: "銀の剣。攻守のバランスがよい。" },
  sage_staff:     { type: "weapon", name: "魔導士の杖",   atk: 3, xp: 10,         desc: "魔力を帯びた杖。経験値を多めに得られる。" },
  thunder_spear:  { type: "weapon", name: "雷鳴の槍",     atk: 5, crit: 8,        desc: "雷をまとう槍。鋭い一撃で会心を狙う。" },
  holy_sword:     { type: "weapon", name: "王家の大剣",   atk: 7, hp: 10,         desc: "王家の大剣。膂力を支える頑健さも宿す。" },
  demon_blade:    { type: "weapon", name: "呪われた黒剣", atk: 9, def: -3, luck: -2, desc: "強大な力と引き換えに守りと幸運を蝕む黒剣。" },
  // 防具
  cloth_tunic:    { type: "shield", name: "布の服",       def: 1,                 desc: "ありふれた布の服。気休め程度の守り。" },
  leather_armor:  { type: "shield", name: "皮の鎧",       def: 2,                 desc: "軽い革の鎧。動きやすい基本装備。" },
  wood_shield:    { type: "shield", name: "木の盾",       def: 1, evade: 2,       desc: "木の盾。少し身をかわしやすくなる。" },
  iron_armor:     { type: "shield", name: "鉄の鎧",       def: 3, evade: -2,      desc: "硬い鉄の鎧。重く回避は落ちる。" },
  green_cloak:    { type: "shield", name: "旅人のマント", def: 2, evade: 5,       desc: "軽い旅装。回避に優れる。" },
  knight_plate:   { type: "shield", name: "銀の胸当て",   def: 4, luck: 1,        desc: "銀の胸当て。守りと幸運をわずかに高める。" },
  golden_plate:   { type: "shield", name: "守護者の鎧",   def: 5, hp: 15,         desc: "重厚な守護者の鎧。体力も底上げする。" },
  royal_cloak:    { type: "shield", name: "王の外套",     def: 4, evade: 8, luck: 3, desc: "王の外套。回避と幸運に秀でた逸品。" },
  demon_armor:    { type: "shield", name: "呪いの鎧",     def: 7, hp: -10, evade: -5, desc: "強固だが体力と回避を削る呪いの鎧。" },
  // 装飾（控えめなユーティリティ。3枠まで・同種重複不可）
  green_amulet:     { type: "accessory", name: "翠玉のお守り",   def: 1,           desc: "翠玉のお守り。わずかに守りを足す。" },
  ruby_ring:        { type: "accessory", name: "業火のルビー指輪", atk: 1, crit: 5, desc: "炎のルビー。攻撃と会心を少し高める。" },
  sapphire_necklace:{ type: "accessory", name: "蒼星の首飾り",   def: 1, evade: 3, desc: "蒼い首飾り。守りと回避を補う。" },
  fang_pendant:     { type: "accessory", name: "魔牙の護符",     atk: 2,           desc: "魔物の牙の護符。攻撃を高める。" },
  beast_fang:       { type: "accessory", name: "獣王の牙",       atk: 1, def: 1, luck: 1, desc: "獣王の牙。攻守と幸運を少しずつ。" },
  star_ring:        { type: "accessory", name: "聖光の星輪",     def: 2, evade: 4, desc: "聖光の指輪。守りと回避を高める。" },
  skull_medallion:  { type: "accessory", name: "冥府の紋章",     atk: 2, crit: 5, luck: 1, desc: "冥府の紋章。攻撃・会心・幸運を補う。" },
};
const WEAPON_DROPS = ["rusty_dagger", "steel_sword", "battle_axe", "amethyst_dagger", "knight_sword", "sage_staff", "thunder_spear", "holy_sword", "demon_blade"];
const SHIELD_DROPS = ["cloth_tunic", "leather_armor", "wood_shield", "iron_armor", "green_cloak", "knight_plate", "golden_plate", "royal_cloak", "demon_armor"];
const ACCESSORY_DROPS = ["green_amulet", "ruby_ring", "sapphire_necklace", "fang_pendant", "beast_fang", "star_ring", "skull_medallion"];
const FLEE_COOLDOWN = 2500;   // 逃走後、その敵が再戦闘しない時間(ms)

// 消費アイテム（ポーションは別管理 p.potions。これらは p.bag に格納）
// heal=回復 / fullheal=全回復 / cure=状態回復 / buff=同系統は上書き(重複しない)
const CONSUMABLES = {
  hi_potion:   { name: "上質なポーション", heal: 40,                desc: "HPを40回復する上質な薬。" },
  antidote:    { name: "毒消し草",         cure: "poison",          desc: "毒を消す薬草。" },
  str_potion:  { name: "力の薬",           buff: "atk",  val: 2,    desc: "攻撃力アップ(+2)。同系統は重複せず上書き。" },
  def_potion:  { name: "守りの薬",         buff: "def",  val: 2,    desc: "防御力アップ(+2)。同系統は重複せず上書き。" },
  luck_potion: { name: "幸運の薬",         buff: "luck", val: 2,    desc: "幸運値アップ(+2)。同系統は重複せず上書き。" },
  scroll:      { name: "知恵の巻物",       buff: "xp",   val: 0.3,  desc: "獲得XP1.3倍。同系統は重複せず上書き。" },
  feather:     { name: "天使の羽根",       fullheal: true,          desc: "HPを全回復する希少な羽根。" },
};
const POTION_DESC = "HPを15回復する基本の薬。";
const BUFF_NAME = { atk: "攻撃力アップ", def: "防御力アップ", luck: "幸運値アップ", xp: "XPアップ", evade: "回避率アップ" };
// 出現する消費アイテム（回復系は控えめ。feather は通常出現させない）
const CONSUMABLE_SPAWN = ["antidote", "str_potion", "def_potion", "luck_potion", "scroll", "hi_potion"];

// 敵の強さ階級（ドロップする装備の強さに対応。雑魚=0で弱い装備）
const ENEMY_TIER = { slime: 0, bat: 0, goblin: 1, darkknight: 1, skeleton: 1, ghost: 2, mimic: 2, orc: 3 };
// 移動方向ベクトル（上下左右）
const DIRV = [[0, -1], [0, 1], [-1, 0], [1, 0]];
// 敵の移動速度（タイル/秒）。リアルタイムでヌルヌル動く
const ENEMY_SPEED = 2.6;

// フロアテーマ（色・名前・BGM）
const FLOOR_THEMES = {
  1: { name: "苔むす森の入口", wall: "#2a3a24", wallTop: "#374d2e", wallShade: "#16240f", floor: "#0f1a0d", floorIn: "#15240f", accent: "#5ee06a", bgm: "explore" },
  2: { name: "せせらぎの洞窟",  wall: "#1f2d40", wallTop: "#2a3f59", wallShade: "#121d2c", floor: "#0a1320", floorIn: "#0f1c30", accent: "#4ad4ff", bgm: "explore" },
  3: { name: "朽ちた邪教の廃墟", wall: "#332a22", wallTop: "#473a2c", wallShade: "#1d160f", floor: "#15110c", floorIn: "#1d1610", accent: "#c9a23a", bgm: "explore" },
  4: { name: "血染めの回廊",    wall: "#3a2024", wallTop: "#522a30", wallShade: "#220f12", floor: "#1a0c0e", floorIn: "#260f12", accent: "#ff5a5a", bgm: "boss" },
  5: { name: "竜の花園",        wall: "#2e2440", wallTop: "#41335c", wallShade: "#1a1330", floor: "#160f24", floorIn: "#201534", accent: "#b56bff", bgm: "boss" },
};
function themeOf(floor) { return FLOOR_THEMES[floor] || FLOOR_THEMES[1]; }
function recLvOf(floor) { return FLOOR_RECLV[floor] || 1; }

const LANDMARKS = {
  fountain: { name: "癒やしの泉" }, altar: { name: "古びた祭壇" },
  statue: { name: "怪しげな像" }, tree: { name: "大樹" },
};

/* ===========================================================
 * 2. グローバル状態
 * =========================================================== */
let canvas, ctx, bcanvas, bctx, shopCanvas, shopCtx;
let game = null;
let soundOn = true;
let currentScreen = "title";
let battleCmdIndex = 0;

/* ===========================================================
 * 3. サウンド / BGM
 * =========================================================== */
let audioCtx = null;
function initAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; } }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function beep(freq, dur, type = "square", vol = 0.07) {
  if (!soundOn || !audioCtx) return;
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq; gain.gain.value = vol;
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime; osc.start(now);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + dur); osc.stop(now + dur);
}
const SFX = {
  attack:   () => beep(220, 0.08, "square"),
  damage:   () => beep(110, 0.13, "sawtooth"),
  item:     () => { beep(660, 0.08); setTimeout(() => beep(880, 0.08), 70); },
  stairs:   () => { beep(330, 0.1); setTimeout(() => beep(440, 0.12), 90); },
  encounter:() => { beep(200, 0.06); setTimeout(() => beep(300, 0.06), 60); setTimeout(() => beep(420, 0.1), 120); },
  levelup:  () => { beep(523, 0.1); setTimeout(() => beep(659, 0.1), 90); setTimeout(() => beep(784, 0.18), 180); },
  flee:     () => { beep(500, 0.06); setTimeout(() => beep(380, 0.1), 70); },
  gameover: () => { beep(330, 0.2, "sawtooth"); setTimeout(() => beep(220, 0.3, "sawtooth"), 200); setTimeout(() => beep(110, 0.5, "sawtooth"), 450); },
  clear:    () => { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.2), i * 150)); },
};
const BGM_TRACKS = {
  explore: { tempo: 300, notes: [220, 0, 262, 0, 330, 0, 262, 0, 196, 0, 247, 0, 294, 0, 247, 0] },
  battle:  { tempo: 180, notes: [330, 392, 330, 262, 294, 349, 294, 247, 330, 392, 440, 392, 330, 294, 247, 196] },
  boss:    { tempo: 200, notes: [165, 0, 196, 220, 165, 0, 147, 0, 175, 196, 233, 196, 175, 147, 131, 0] },
};
let bgm = { timer: null, track: null, step: 0 };
function startBGM(name) {
  stopBGM();
  if (!soundOn || !audioCtx) { bgm.track = name; return; }
  const track = BGM_TRACKS[name]; if (!track) return;
  bgm.track = name; bgm.step = 0;
  bgm.timer = setInterval(() => {
    const f = track.notes[bgm.step % track.notes.length]; bgm.step++;
    if (f > 0 && soundOn && audioCtx) {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = "triangle"; osc.frequency.value = f; gain.gain.value = 0.04;
      osc.connect(gain); gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime; osc.start(now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22); osc.stop(now + 0.24);
    }
  }, track.tempo);
}
function stopBGM() { if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; } }

/* ===========================================================
 * 4. ユーティリティ
 * =========================================================== */
function rnd(n) { return Math.floor(Math.random() * n); }
function rndRange(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function choice(arr) { return arr[rnd(arr.length)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

/* ===========================================================
 * 5. マップ生成（広く入り組んだ迷路）
 * =========================================================== */
function generateFloor(floor) {
  const map = [];
  for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(T.WALL));

  // 部屋を多めに配置（大小さまざま）
  const rooms = [];
  const roomCount = rndRange(20, 28);
  let tries = 0;
  while (rooms.length < roomCount && tries < 400) {
    tries++;
    const big = rnd(4) === 0;                                  // たまに大部屋
    const w = big ? rndRange(8, 13) : rndRange(4, 8);
    const h = big ? rndRange(6, 9) : rndRange(4, 6);
    const x = rndRange(1, MAP_W - w - 2), y = rndRange(1, MAP_H - h - 2);
    let overlap = false;
    for (const r of rooms) {
      if (x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y) { overlap = true; break; }
    }
    if (overlap) continue;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) map[yy][xx] = T.FLOOR;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
  }

  // 連結（チェーン）。通路は太さがランダムに変化
  for (let i = 1; i < rooms.length; i++) connectRooms(map, rooms[i - 1], rooms[i]);
  // ループ通路（入り組ませる）
  const loops = Math.floor(rooms.length / 2);
  for (let k = 0; k < loops; k++) connectRooms(map, choice(rooms), choice(rooms));
  // 行き止まり通路（探索感）
  const deadEnds = rndRange(6, 10);
  for (let k = 0; k < deadEnds; k++) carveDeadEnd(map, choice(rooms));

  const start = rooms[0];
  const player = game ? game.player : createPlayer();
  player.x = start.cx; player.y = start.cy; player.fx = start.cx; player.fy = start.cy;

  // 最遠の部屋 = 守護者の間
  let farRoom = rooms[rooms.length - 1], maxD = -1;
  for (const r of rooms) {
    const d = Math.abs(r.cx - start.cx) + Math.abs(r.cy - start.cy);
    if (d > maxD) { maxD = d; farRoom = r; }
  }

  const occupied = new Set([start.cx + "," + start.cy]);
  const fd = {
    floor, theme: themeOf(floor).name, map, rooms,
    enemies: [], guardian: null, stairs: null, stairsLocked: true,
    items: [], vault: null, key: null, landmarks: [], hasKey: false,
    torches: [], props: [],
  };

  // 守護者（必ず配置）
  const guardianType = floor === BOSS_FLOOR ? "boss" : ENCOUNTER_TABLE[floor][ENCOUNTER_TABLE[floor].length - 1];
  const grole = floor === BOSS_FLOOR ? "boss" : "guardian";
  fd.guardian = makeEnemy(guardianType, farRoom.cx, farRoom.cy, grole);
  occupied.add(farRoom.cx + "," + farRoom.cy);

  // 階段（ボス階以外）。守護者の間の中に置き、最初は施錠
  if (floor < MAX_FLOOR) {
    const st = roomTileAvoid(farRoom, occupied);
    const sx = st ? st.x : farRoom.cx, sy = st ? st.y : (farRoom.cy + 1);
    map[sy][sx] = T.STAIRS;
    fd.stairs = { x: sx, y: sy };
    occupied.add(sx + "," + sy);
  }

  // シンボルの敵（待機）。開始/守護者部屋以外に配置
  placeSymbolEnemies(fd, rooms, start, floor, occupied);

  // 宝物庫（封印された宝箱＋その鍵）・ランドマーク
  placeVault(fd, rooms, occupied);
  placeLandmarks(fd, rooms, floor, occupied);

  // 行商人（一定確率で出現。倒すのではなくショップが開く）
  if (rooms.length >= 3 && Math.random() < 0.6) {
    const mt = randomRoomTile(rooms, occupied);
    if (mt) fd.merchant = { x: mt.x, y: mt.y, offers: generateShopOffers(floor) };
  }

  fd.items.push(...spawnItems(rooms, floor, occupied));

  // 雰囲気づくり：壁の松明＋床の装飾オブジェ
  placeTorches(fd);
  placeProps(fd, rooms, occupied);
  return fd;
}

// 壁（下が床のセル）に松明を設置
function placeTorches(fd) {
  const map = fd.map, cand = [];
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++)
    if (map[y][x] === T.WALL && map[y + 1][x] === T.FLOOR && map[y - 1][x] === T.WALL) cand.push([x, y]);
  // 程よい間隔で間引いて配置
  const target = Math.min(cand.length, 14 + fd.floor * 2);
  const used = new Set();
  let guard = 0;
  while (fd.torches.length < target && guard++ < cand.length * 3) {
    const c = choice(cand); const k = c[0] + "," + c[1];
    if (used.has(k)) continue;
    // 近すぎる松明を避ける
    let near = false;
    for (const t of fd.torches) if (Math.abs(t.x - c[0]) + Math.abs(t.y - c[1]) < 5) { near = true; break; }
    if (near) continue;
    used.add(k); fd.torches.push({ x: c[0], y: c[1] });
  }
}

// 床に装飾オブジェ（柱・像・骨・かがり火）を配置（非ブロック・装飾のみ・壁沿い）
const PILLAR_VARIANTS = ["pillar1", "pillar2", "pillar3"];
const STATUE_VARIANTS = ["statue_knight", "statue_queen", "statue_gargoyle", "statue_wolf", "statue_throne", "statue_ruins"];
// 部屋の縁（壁に接する床マス）を返す
function randomWallTile(rooms, occupied) {
  for (let i = 0; i < 60; i++) {
    const r = choice(rooms);
    if (r.w < 3 || r.h < 3) continue;
    let x, y;
    switch (rnd(4)) {
      case 0: x = rndRange(r.x, r.x + r.w - 1); y = r.y; break;
      case 1: x = rndRange(r.x, r.x + r.w - 1); y = r.y + r.h - 1; break;
      case 2: x = r.x; y = rndRange(r.y, r.y + r.h - 1); break;
      default: x = r.x + r.w - 1; y = rndRange(r.y, r.y + r.h - 1); break;
    }
    const k = x + "," + y;
    if (!occupied.has(k)) { occupied.add(k); return { x, y }; }
  }
  return null;
}
function placeProps(fd, rooms, occupied) {
  const count = rndRange(5, 9) + Math.floor(fd.floor * 1.5);
  for (let i = 0; i < count; i++) {
    const t = randomWallTile(rooms, occupied);     // 壁沿いに置く
    if (!t) break;
    const r = rnd(10);
    let type, v;
    if (r < 3) { type = "pillar"; v = choice(PILLAR_VARIANTS); }
    else if (r < 6) { type = "statue"; v = choice(STATUE_VARIANTS); }
    else if (r < 8) { type = "bones"; v = "bones"; }
    else { type = "brazier"; }
    fd.props.push({ x: t.x, y: t.y, type, v });
  }
}

// 行商人の品揃え（個数制限つき）
function generateShopOffers(floor) {
  const o = [];
  o.push({ kind: "potion", name: "ポーション", desc: "HPを15回復", price: 15, stock: floor >= 3 ? 3 : 5 });
  if (floor >= 2) o.push({ kind: "bag", id: "hi_potion", name: "上質なポーション", desc: CONSUMABLES.hi_potion.desc, price: 40, stock: 2 });
  o.push({ kind: "bag", id: "antidote", name: "毒消し草", desc: CONSUMABLES.antidote.desc, price: 12, stock: 3 });
  o.push({ kind: "bag", id: "str_potion", name: "力の薬", desc: CONSUMABLES.str_potion.desc, price: 35, stock: 1 });
  o.push({ kind: "bag", id: "def_potion", name: "守りの薬", desc: CONSUMABLES.def_potion.desc, price: 35, stock: 1 });
  if (floor >= 3) o.push({ kind: "bag", id: "luck_potion", name: "幸運の薬", desc: CONSUMABLES.luck_potion.desc, price: 45, stock: 1 });
  o.push({ kind: "bag", id: "scroll", name: "知恵の巻物", desc: CONSUMABLES.scroll.desc, price: 50, stock: 1 });
  o.push({ kind: "key", name: "古い鍵", desc: "宝物庫の扉を開けられる古い鍵。", price: 40, stock: 1 });
  const w = pickWeaponForFloor(floor); o.push({ kind: "equip", id: w, name: EQUIP[w].name, desc: EQUIP[w].desc, price: equipBuyPrice(w), stock: 1 });
  const s = pickShieldForFloor(floor); o.push({ kind: "equip", id: s, name: EQUIP[s].name, desc: EQUIP[s].desc, price: equipBuyPrice(s), stock: 1 });
  const a = pickAccessoryForFloor(floor); o.push({ kind: "equip", id: a, name: EQUIP[a].name, desc: EQUIP[a].desc, price: equipBuyPrice(a), stock: 1 });
  return o;
}

function corridorWidth() { return (rnd(3) === 0) ? rndRange(2, 3) : 1; }   // 太い廊下/狭い通路が混在
function connectRooms(map, a, b) {
  if (a === b) return;
  const w = corridorWidth();
  if (rnd(2) === 0) { carveH(map, a.cx, b.cx, a.cy, w); carveV(map, a.cy, b.cy, b.cx, w); }
  else { carveV(map, a.cy, b.cy, a.cx, w); carveH(map, a.cx, b.cx, b.cy, w); }
}
function carveH(map, x1, x2, y, wid) {
  wid = wid || 1; const off = (wid - 1) >> 1;
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
    for (let dy = -off; dy < wid - off; dy++) { const yy = y + dy; if (yy > 0 && yy < MAP_H - 1 && map[yy][x] === T.WALL) map[yy][x] = T.FLOOR; }
}
function carveV(map, y1, y2, x, wid) {
  wid = wid || 1; const off = (wid - 1) >> 1;
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
    for (let dx = -off; dx < wid - off; dx++) { const xx = x + dx; if (xx > 0 && xx < MAP_W - 1 && map[y][xx] === T.WALL) map[y][xx] = T.FLOOR; }
}

function carveDeadEnd(map, room) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const [dx, dy] = choice(dirs);
  let x = room.cx, y = room.cy;
  const len = rndRange(3, 7);
  for (let i = 0; i < len; i++) {
    x += dx; y += dy;
    if (x < 1 || x >= MAP_W - 1 || y < 1 || y >= MAP_H - 1) break;
    map[y][x] = T.FLOOR;
  }
}

/* ===========================================================
 * 6. エンティティ生成
 * =========================================================== */
function makeEnemy(type, x, y, role) {
  const t = ENEMY_TYPES[type];
  let hp = t.hp, atk = t.atk, def = t.def, exp = t.exp, gold = t.gold, name = t.name;
  let isGuardian = false, isBoss = !!t.isBoss;
  if (role === "guardian") {
    hp = Math.round(t.hp * 1.8); atk = t.atk + 2; def = t.def + 1;
    exp = Math.round(t.exp * 2.2); gold = Math.round(t.gold * 2.2);
    name = t.name + "（守護者）"; isGuardian = true;
  } else if (role === "boss") {
    isBoss = true;
  }
  return {
    type, role: role || "enemy", name, x, y, fx: x, fy: y, hp, maxHp: hp, atk, def, exp, gold,
    evade: t.evade || 0, poison: t.poison || 0, greedy: !!t.greedy,
    isGuardian, isBoss, dir: rnd(4), moveAcc: 0,
  };
}

function roomTileAvoid(room, occupied) {
  for (let i = 0; i < 40; i++) {
    const x = rndRange(room.x, room.x + room.w - 1), y = rndRange(room.y, room.y + room.h - 1);
    const k = x + "," + y;
    if (!occupied.has(k)) { occupied.add(k); return { x, y }; }
  }
  return null;
}
function randomRoomTile(rooms, occupied) {
  for (let i = 0; i < 80; i++) {
    const r = choice(rooms);
    const x = rndRange(r.x, r.x + r.w - 1), y = rndRange(r.y, r.y + r.h - 1);
    const k = x + "," + y;
    if (!occupied.has(k)) { occupied.add(k); return { x, y }; }
  }
  return null;
}

function placeSymbolEnemies(fd, rooms, start, floor, occupied) {
  const table = ENCOUNTER_TABLE[floor] || ENCOUNTER_TABLE[1];
  const count = rndRange(12, 16) + floor * 2;   // たくさん徘徊させる
  for (let i = 0; i < count; i++) {
    const t = randomRoomTile(rooms, occupied);
    if (!t) break;
    if (Math.abs(t.x - start.cx) + Math.abs(t.y - start.cy) < 5) continue; // 開始地点近くは避ける
    fd.enemies.push(makeEnemy(choice(table), t.x, t.y, "enemy"));
  }
}

// 9種の武器を5階層に分散（深いほど上位武器）
function pickWeaponForFloor(floor) {
  const base = (floor - 1) * 2;   // 1F→0, 2F→2, 3F→4, 4F→6, 5F→8
  return WEAPON_DROPS[clamp(rndRange(base - 1, base + 1), 0, WEAPON_DROPS.length - 1)];
}
// 9種の防具を5階層に分散
function pickShieldForFloor(floor) {
  const base = (floor - 1) * 2;
  return SHIELD_DROPS[clamp(rndRange(base - 1, base + 1), 0, SHIELD_DROPS.length - 1)];
}
function pickAccessoryForFloor(floor) {
  const base = Math.floor((floor - 1) * 1.5);
  return ACCESSORY_DROPS[clamp(rndRange(base - 1, base + 1), 0, ACCESSORY_DROPS.length - 1)];
}

function spawnItems(rooms, floor, occupied) {
  const items = [];
  // 回復ポーションは控えめ。3階以降はさらに出にくく（ゴリ押し防止）
  const potionCount = floor <= 2 ? rndRange(2, 3) : rndRange(0, 1);
  for (let i = 0; i < potionCount; i++) addItem(items, rooms, occupied, { kind: "potion" });
  for (let i = 0; i < rndRange(2, 4); i++) addItem(items, rooms, occupied, { kind: "gold", amount: rndRange(8, 20) + floor * 3 });
  if (rnd(2) === 0) addItem(items, rooms, occupied, { kind: "equip", id: pickWeaponForFloor(floor) });
  if (rnd(2) === 0) addItem(items, rooms, occupied, { kind: "equip", id: pickShieldForFloor(floor) });
  for (let i = 0; i < rndRange(1, 2); i++) addItem(items, rooms, occupied, { kind: choice(CONSUMABLE_SPAWN) }); // 各種アイテム
  for (let i = 0; i < rndRange(1, 3); i++) addItem(items, rooms, occupied, { kind: "chest" });
  return items;
}
function addItem(items, rooms, occupied, data) {
  const t = randomRoomTile(rooms, occupied);
  if (t) items.push(Object.assign({ x: t.x, y: t.y }, data));
}

// 封印された宝物庫＋その鍵
function placeVault(fd, rooms, occupied) {
  const map = fd.map, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const cand = rooms.length > 1 ? rooms.slice(1) : rooms;
  for (let a = 0; a < 250; a++) {
    const r = choice(cand);
    const cx = rndRange(r.x, r.x + r.w - 1), cy = rndRange(r.y, r.y + r.h - 1);
    if (map[cy][cx] !== T.FLOOR) continue;
    const [dx, dy] = choice(dirs);
    const doorX = cx + dx, doorY = cy + dy, chestX = cx + 2 * dx, chestY = cy + 2 * dy;
    if (chestX < 1 || chestX >= MAP_W - 1 || chestY < 1 || chestY >= MAP_H - 1) continue;
    if (map[doorY][doorX] !== T.WALL || map[chestY][chestX] !== T.WALL) continue;
    let enclosed = true;
    for (const [ex, ey] of dirs) {
      const nx = chestX + ex, ny = chestY + ey;
      if (nx === doorX && ny === doorY) continue;
      if (map[ny][nx] !== T.WALL) { enclosed = false; break; }
    }
    if (!enclosed) continue;
    map[doorY][doorX] = T.FLOOR; map[chestY][chestX] = T.FLOOR;
    fd.vault = { chestX, chestY, doorX, doorY, opened: false, taken: false };
    occupied.add(chestX + "," + chestY); occupied.add(doorX + "," + doorY);
    const kt = randomRoomTile(rooms, occupied);
    if (kt) fd.key = { x: kt.x, y: kt.y, taken: false };
    return;
  }
}
function placeLandmarks(fd, rooms, floor, occupied) {
  const pool = { 1: ["tree", "fountain"], 2: ["fountain", "statue"], 3: ["altar", "statue"], 4: ["statue", "altar"], 5: ["tree", "altar"] }[floor] || ["fountain"];
  const count = rndRange(1, 3);
  for (let i = 0; i < count; i++) {
    const t = randomRoomTile(rooms, occupied);
    if (!t) break;
    fd.landmarks.push({ x: t.x, y: t.y, type: choice(pool), used: false });
  }
}

/* ===========================================================
 * 7. 描画ヘルパー & モンスター（精細化）
 * =========================================================== */
function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
function ell(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function ellG(c, x, y, rx, ry, inner, outer) { // 立体感のある楕円
  const g = c.createRadialGradient(x - rx * 0.3, y - ry * 0.4, Math.max(1, rx * 0.1), x, y, Math.max(rx, ry));
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
function stroke(c, col, w) { c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
function eye(c, x, y, r, white = "#fff", pupil = "#111") {
  ell(c, x, y, r, r, white);
  ell(c, x + r * 0.15, y + r * 0.1, r * 0.55, r * 0.55, pupil);
  ell(c, x - r * 0.25, y - r * 0.3, r * 0.22, r * 0.22, "#fff"); // ハイライト
}

// 外部画像（読み込めたら画像、無ければCanvas描画にフォールバック）
const MONSTER_IMG = {};
let HERO_IMG = null, MERCHANT_IMG = null;
const HERO_DIR = {};   // 進行方向ごとの主人公画像 up/down/left/right
function loadSprite(path) {
  const im = new Image();
  const rec = { img: im, ready: false };
  im.onload = () => { rec.ready = true; };
  im.onerror = () => { rec.ready = false; };
  im.src = asset(path);
  return rec;
}
const DECO_IMG = {};   // ギミック・装飾オブジェ
function loadMonsters() {
  for (const t of Object.keys(ENEMY_TYPES)) MONSTER_IMG[t] = loadSprite("assets/monsters/" + t + ".png");
  HERO_IMG = loadSprite("assets/hero.png");
  for (const dir of ["up", "down", "left", "right"]) HERO_DIR[dir] = loadSprite("assets/hero_" + dir + ".png");
  MERCHANT_IMG = loadSprite("assets/merchant.png");
  ["chest", "vault", "fountain", "altar", "tree", "coin", "stairs", "door"].forEach(k => DECO_IMG["g_" + k] = loadSprite("assets/gimmicks/" + k + ".png"));
  ["pillar1", "pillar2", "pillar3", "statue_knight", "statue_queen", "statue_gargoyle", "statue_wolf", "statue_throne", "statue_ruins", "bones"]
    .forEach(k => DECO_IMG["p_" + k] = loadSprite("assets/props/" + k + ".png"));
}
// 装飾画像を「タイル下端基準」で描画（読めたら true）
function drawDeco(key, px, py, box, lift) {
  const r = DECO_IMG[key];
  if (!r || !r.ready) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(r.img, Math.round(px + 16 - box / 2), Math.round(py + TILE - box + (lift || 4)), Math.round(box), Math.round(box));
  return true;
}

function drawMonster(c, type, cx, cy, s) {
  const m = MONSTER_IMG[type];
  if (m && m.ready) {
    const sz = s * 7.6;                       // ドット絵時とほぼ同じ大きさ
    c.imageSmoothingEnabled = true;
    c.drawImage(m.img, Math.round(cx - sz / 2), Math.round(cy - sz / 2), Math.round(sz), Math.round(sz));
    return;
  }
  drawMonsterShape(c, type, cx, cy, s);       // フォールバック（ドット絵）
}

// 旧・Canvasドット絵による描画（画像が無いときのフォールバック）
function drawMonsterShape(c, type, cx, cy, s) {
  c.lineJoin = "round";
  switch (type) {
    case "slime": return drawSlime(c, cx, cy, s);
    case "bat": return drawBat(c, cx, cy, s);
    case "goblin": return drawGoblin(c, cx, cy, s);
    case "skeleton": return drawSkeleton(c, cx, cy, s);
    case "ghost": return drawGhost(c, cx, cy, s);
    case "mimic": return drawMimic(c, cx, cy, s);
    case "orc": return drawOrc(c, cx, cy, s);
    case "darkknight": return drawDarkKnight(c, cx, cy, s);
    case "boss": return drawBoss(c, cx, cy, s);
  }
}

function drawSlime(c, x, y, s) {
  c.save();
  // 影
  ell(c, x, y + s * 1.0, s * 1.7, s * 0.4, "rgba(0,0,0,0.35)");
  // 半透明ゼリー本体
  c.beginPath(); c.ellipse(x, y - s * 0.2, s * 1.7, s * 1.4, 0, 0, Math.PI * 2);
  const g = c.createRadialGradient(x - s * 0.5, y - s * 0.8, s * 0.3, x, y, s * 1.8);
  g.addColorStop(0, "#9bffae"); g.addColorStop(0.6, "#3fbf52"); g.addColorStop(1, "#1d7a2c");
  c.fillStyle = g; c.fill(); stroke(c, "#0e4a17", Math.max(1, s * 0.18));
  // 内部の気泡
  ell(c, x + s * 0.6, y + s * 0.2, s * 0.25, s * 0.25, "rgba(255,255,255,0.35)");
  ell(c, x - s * 0.2, y + s * 0.5, s * 0.18, s * 0.18, "rgba(255,255,255,0.25)");
  // つやハイライト
  ell(c, x - s * 0.6, y - s * 0.8, s * 0.5, s * 0.32, "rgba(255,255,255,0.55)");
  // 目と口
  eye(c, x - s * 0.55, y - s * 0.3, s * 0.34);
  eye(c, x + s * 0.55, y - s * 0.3, s * 0.34);
  c.beginPath(); c.arc(x, y + s * 0.2, s * 0.45, 0.15 * Math.PI, 0.85 * Math.PI); stroke(c, "#0e4a17", Math.max(1, s * 0.16));
  c.restore();
}

function drawBat(c, x, y, s) {
  c.save();
  ell(c, x, y + s * 1.4, s * 1.2, s * 0.3, "rgba(0,0,0,0.3)");
  // 翼（膜）
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + dir * s * 1.6, y - s * 1.4, x + dir * s * 2.6, y - s * 0.5);
    c.lineTo(x + dir * s * 2.1, y - s * 0.1);
    c.lineTo(x + dir * s * 2.4, y + s * 0.5);
    c.lineTo(x + dir * s * 1.6, y + s * 0.2);
    c.lineTo(x + dir * s * 1.7, y + s * 0.7);
    c.lineTo(x + dir * s * 0.9, y + s * 0.4);
    c.quadraticCurveTo(x + dir * s * 0.5, y + s * 0.2, x, y + s * 0.3);
    const g = c.createLinearGradient(x, y - s, x, y + s);
    g.addColorStop(0, "#7d4fc0"); g.addColorStop(1, "#3c2660");
    c.fillStyle = g; c.fill(); stroke(c, "#241040", Math.max(1, s * 0.14));
  }
  // 体
  ellG(c, x, y, s * 0.85, s * 1.0, "#c9a2ff", "#5e3aa0"); stroke(c, "#241040", Math.max(1, s * 0.14));
  // 耳
  for (const dir of [-1, 1]) {
    c.beginPath(); c.moveTo(x + dir * s * 0.4, y - s * 0.7);
    c.lineTo(x + dir * s * 0.75, y - s * 1.6); c.lineTo(x + dir * s * 0.05, y - s * 0.85);
    c.fillStyle = "#6e44b0"; c.fill(); stroke(c, "#241040", Math.max(1, s * 0.1));
  }
  eye(c, x - s * 0.32, y - s * 0.1, s * 0.24, "#ffec6b", "#111");
  eye(c, x + s * 0.32, y - s * 0.1, s * 0.24, "#ffec6b", "#111");
  // 牙
  rect(c, x - s * 0.18, y + s * 0.35, s * 0.12, s * 0.28, "#fff");
  rect(c, x + s * 0.06, y + s * 0.35, s * 0.12, s * 0.28, "#fff");
  c.restore();
}

function drawGoblin(c, x, y, s) {
  c.save();
  ell(c, x, y + s * 1.7, s * 1.2, s * 0.3, "rgba(0,0,0,0.3)");
  // 体
  ellG(c, x, y + s * 1.0, s * 1.0, s * 0.95, "#7bbf63", "#365e26"); stroke(c, "#1d3614", Math.max(1, s * 0.14));
  rect(c, x - s * 0.8, y + s * 1.0, s * 1.6, s * 0.7, "#2f5320"); // 腰布
  // 頭
  ellG(c, x, y - s * 0.4, s * 1.05, s * 0.95, "#8fd071", "#3f6e2c"); stroke(c, "#1d3614", Math.max(1, s * 0.14));
  // 耳
  for (const dir of [-1, 1]) {
    c.beginPath(); c.moveTo(x + dir * s * 0.85, y - s * 0.5);
    c.quadraticCurveTo(x + dir * s * 2.0, y - s * 0.9, x + dir * s * 1.7, y - s * 0.4);
    c.quadraticCurveTo(x + dir * s * 1.2, y - s * 0.2, x + dir * s * 0.8, y - s * 0.05);
    c.fillStyle = "#6fae52"; c.fill(); stroke(c, "#1d3614", Math.max(1, s * 0.1));
  }
  // 鼻
  ell(c, x, y - s * 0.2, s * 0.22, s * 0.3, "#5f9444");
  eye(c, x - s * 0.42, y - s * 0.55, s * 0.26, "#ffec6b", "#111");
  eye(c, x + s * 0.42, y - s * 0.55, s * 0.26, "#ffec6b", "#111");
  // 口と牙
  c.beginPath(); c.moveTo(x - s * 0.5, y + s * 0.15); c.lineTo(x + s * 0.5, y + s * 0.15); stroke(c, "#1d3614", Math.max(1, s * 0.14));
  c.beginPath(); c.moveTo(x - s * 0.3, y + s * 0.15); c.lineTo(x - s * 0.2, y - s * 0.18); c.lineTo(x - s * 0.1, y + s * 0.15); c.fillStyle = "#fff"; c.fill();
  c.beginPath(); c.moveTo(x + s * 0.3, y + s * 0.15); c.lineTo(x + s * 0.2, y - s * 0.18); c.lineTo(x + s * 0.1, y + s * 0.15); c.fillStyle = "#fff"; c.fill();
  c.restore();
}

function drawSkeleton(c, x, y, s) {
  c.save();
  ell(c, x, y + s * 1.9, s * 1.1, s * 0.3, "rgba(0,0,0,0.3)");
  // 肋骨・背骨
  rect(c, x - s * 0.12, y + s * 0.4, s * 0.24, s * 1.5, "#cfcfe0");
  for (let i = 0; i < 4; i++) {
    c.beginPath(); c.moveTo(x, y + s * 0.6 + i * s * 0.35);
    c.quadraticCurveTo(x + s * 0.9, y + s * 0.55 + i * s * 0.35, x + s * 0.75, y + s * 0.95 + i * s * 0.35);
    c.moveTo(x, y + s * 0.6 + i * s * 0.35);
    c.quadraticCurveTo(x - s * 0.9, y + s * 0.55 + i * s * 0.35, x - s * 0.75, y + s * 0.95 + i * s * 0.35);
    stroke(c, "#cfcfe0", Math.max(1, s * 0.16));
  }
  // 頭蓋
  ellG(c, x, y - s * 0.5, s * 1.0, s * 1.05, "#ffffff", "#b8b8c8"); stroke(c, "#6a6a7a", Math.max(1, s * 0.12));
  rect(c, x - s * 0.55, y + s * 0.2, s * 1.1, s * 0.45, "#e8e8f0"); // 顎
  // 眼窩（赤く光る）
  ell(c, x - s * 0.4, y - s * 0.55, s * 0.3, s * 0.34, "#100");
  ell(c, x + s * 0.4, y - s * 0.55, s * 0.3, s * 0.34, "#100");
  ell(c, x - s * 0.4, y - s * 0.52, s * 0.13, s * 0.15, "#ff5a5a");
  ell(c, x + s * 0.4, y - s * 0.52, s * 0.13, s * 0.15, "#ff5a5a");
  // 鼻・歯
  c.beginPath(); c.moveTo(x, y - s * 0.25); c.lineTo(x - s * 0.12, y + s * 0.05); c.lineTo(x + s * 0.12, y + s * 0.05); c.fillStyle = "#100"; c.fill();
  for (let i = -2; i <= 2; i++) rect(c, x + i * s * 0.2 - s * 0.05, y + s * 0.2, s * 0.1, s * 0.32, "#100");
  c.restore();
}

function drawGhost(c, x, y, s) {
  c.save();
  c.globalAlpha = 0.9;
  c.beginPath();
  c.arc(x, y - s * 0.2, s * 1.2, Math.PI, 0);
  let by = y + s * 1.1;
  c.lineTo(x + s * 1.2, by);
  for (let i = 0; i < 4; i++) c.quadraticCurveTo(x + s * 1.2 - (i + 0.5) * s * 0.6, by + s * 0.45, x + s * 1.2 - (i + 1) * s * 0.6, by);
  c.lineTo(x - s * 1.2, y - s * 0.2);
  const g = c.createLinearGradient(x, y - s * 1.4, x, y + s * 1.2);
  g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#9fb0e0");
  c.fillStyle = g; c.fill(); stroke(c, "#5a6ba0", Math.max(1, s * 0.12));
  c.globalAlpha = 1;
  // 暗い眼と口
  ell(c, x - s * 0.42, y - s * 0.25, s * 0.22, s * 0.3, "#2a2f55");
  ell(c, x + s * 0.42, y - s * 0.25, s * 0.22, s * 0.3, "#2a2f55");
  ell(c, x, y + s * 0.35, s * 0.2, s * 0.3, "#2a2f55");
  c.restore();
}

function drawMimic(c, x, y, s) {
  c.save();
  ell(c, x, y + s * 1.5, s * 1.6, s * 0.35, "rgba(0,0,0,0.3)");
  // 下箱
  const g = c.createLinearGradient(x, y, x, y + s * 1.4);
  g.addColorStop(0, "#9a6630"); g.addColorStop(1, "#5a3414");
  c.fillStyle = g; c.fillRect(x - s * 1.5, y, s * 3, s * 1.4); stroke(c, "#2e1a0a", Math.max(1, s * 0.16));
  rect(c, x - s * 1.5, y, s * 3, s * 0.18, "#caa017"); // 金縁
  // 開いた蓋
  c.beginPath(); c.moveTo(x - s * 1.5, y); c.lineTo(x - s * 1.2, y - s * 1.2); c.lineTo(x + s * 1.2, y - s * 1.2); c.lineTo(x + s * 1.5, y); c.closePath();
  c.fillStyle = "#7a4a1e"; c.fill(); stroke(c, "#2e1a0a", Math.max(1, s * 0.16));
  // 赤い口内
  rect(c, x - s * 1.2, y - s * 0.15, s * 2.4, s * 0.75, "#4a0a0a");
  // 上下の牙
  for (let i = -3; i <= 3; i++) {
    c.fillStyle = "#fff";
    c.beginPath(); c.moveTo(x + i * s * 0.4, y - s * 0.15); c.lineTo(x + i * s * 0.4 + s * 0.2, y - s * 0.15); c.lineTo(x + i * s * 0.4 + s * 0.1, y + s * 0.3); c.fill();
    c.beginPath(); c.moveTo(x + i * s * 0.4, y + s * 0.6); c.lineTo(x + i * s * 0.4 + s * 0.2, y + s * 0.6); c.lineTo(x + i * s * 0.4 + s * 0.1, y + s * 0.2); c.fill();
  }
  // 舌
  ell(c, x, y + s * 0.4, s * 0.5, s * 0.2, "#d23a4a");
  // 目
  eye(c, x - s * 0.55, y - s * 0.75, s * 0.26, "#ffec6b", "#111");
  eye(c, x + s * 0.55, y - s * 0.75, s * 0.26, "#ffec6b", "#111");
  c.restore();
}

function drawOrc(c, x, y, s) {
  c.save();
  ell(c, x, y + s * 1.9, s * 1.5, s * 0.35, "rgba(0,0,0,0.3)");
  // 体
  ellG(c, x, y + s * 1.1, s * 1.5, s * 1.15, "#6f8a44", "#33491f"); stroke(c, "#1c2a10", Math.max(1, s * 0.16));
  // 肩アーマー
  ellG(c, x - s * 1.4, y + s * 0.55, s * 0.6, s * 0.55, "#7a7d9a", "#3a3d5e");
  ellG(c, x + s * 1.4, y + s * 0.55, s * 0.6, s * 0.55, "#7a7d9a", "#3a3d5e");
  // 頭
  ellG(c, x, y - s * 0.35, s * 1.15, s * 1.0, "#80a052", "#3f5a26"); stroke(c, "#1c2a10", Math.max(1, s * 0.16));
  eye(c, x - s * 0.45, y - s * 0.45, s * 0.24, "#ff5a5a", "#111");
  eye(c, x + s * 0.45, y - s * 0.45, s * 0.24, "#ff5a5a", "#111");
  // 太い眉
  rect(c, x - s * 0.75, y - s * 0.8, s * 0.6, s * 0.16, "#33491f");
  rect(c, x + s * 0.15, y - s * 0.8, s * 0.6, s * 0.16, "#33491f");
  // 口と下牙
  rect(c, x - s * 0.6, y + s * 0.15, s * 1.2, s * 0.16, "#1c2a10");
  c.fillStyle = "#fff";
  c.beginPath(); c.moveTo(x - s * 0.5, y + s * 0.23); c.lineTo(x - s * 0.32, y + s * 0.23); c.lineTo(x - s * 0.41, y - s * 0.22); c.fill();
  c.beginPath(); c.moveTo(x + s * 0.5, y + s * 0.23); c.lineTo(x + s * 0.32, y + s * 0.23); c.lineTo(x + s * 0.41, y - s * 0.22); c.fill();
  c.restore();
}

function drawDarkKnight(c, x, y, s) {
  c.save();
  ell(c, x, y + s * 1.9, s * 1.4, s * 0.35, "rgba(0,0,0,0.35)");
  // マント
  c.beginPath(); c.moveTo(x - s * 1.0, y); c.lineTo(x - s * 1.7, y + s * 1.8); c.lineTo(x + s * 1.7, y + s * 1.8); c.lineTo(x + s * 1.0, y);
  c.fillStyle = "#3a1030"; c.fill();
  // 鎧の体
  ellG(c, x, y + s * 1.0, s * 1.3, s * 1.1, "#4a4f74", "#191b2e"); stroke(c, "#0c0d18", Math.max(1, s * 0.16));
  // 兜
  ellG(c, x, y - s * 0.4, s * 1.05, s * 1.0, "#3a3f5e", "#13152400");
  ellG(c, x, y - s * 0.4, s * 1.05, s * 1.0, "#3a3f5e", "#131524"); stroke(c, "#0c0d18", Math.max(1, s * 0.16));
  rect(c, x - s * 1.05, y - s * 0.4, s * 2.1, s * 0.7, "#1c1e33");
  // 角
  for (const dir of [-1, 1]) {
    c.beginPath(); c.moveTo(x + dir * s * 0.85, y - s * 1.0);
    c.quadraticCurveTo(x + dir * s * 1.9, y - s * 1.9, x + dir * s * 1.0, y - s * 1.25);
    c.fillStyle = "#6a6f9a"; c.fill(); stroke(c, "#0c0d18", Math.max(1, s * 0.1));
  }
  // 目スリット（赤光）
  rect(c, x - s * 0.6, y - s * 0.5, s * 1.2, s * 0.2, "#000");
  ell(c, x - s * 0.32, y - s * 0.4, s * 0.14, s * 0.1, "#ff3a3a");
  ell(c, x + s * 0.32, y - s * 0.4, s * 0.14, s * 0.1, "#ff3a3a");
  // 大剣
  rect(c, x + s * 1.1, y - s * 0.9, s * 0.2, s * 2.6, "#aab0e0");
  rect(c, x + s * 1.05, y - s * 1.0, s * 0.3, s * 0.2, "#dfe4ff");
  rect(c, x + s * 0.85, y + s * 0.55, s * 0.7, s * 0.2, "#5a5da0");
  c.restore();
}

function drawBoss(c, x, y, s) {
  c.save();
  ell(c, x, y + s * 2.1, s * 2.2, s * 0.5, "rgba(0,0,0,0.4)");
  // 翼
  for (const dir of [-1, 1]) {
    c.beginPath(); c.moveTo(x, y);
    c.quadraticCurveTo(x + dir * s * 2.2, y - s * 1.8, x + dir * s * 3.2, y - s * 0.2);
    c.quadraticCurveTo(x + dir * s * 2.0, y - s * 0.3, x + dir * s * 1.8, y + s * 0.6);
    c.quadraticCurveTo(x + dir * s * 1.2, y - s * 0.1, x, y);
    c.fillStyle = "#3a0a0a"; c.fill(); stroke(c, "#1a0000", Math.max(1, s * 0.16));
  }
  // 体
  ellG(c, x, y + s * 1.2, s * 1.9, s * 1.45, "#9a2020", "#440808"); stroke(c, "#1a0000", Math.max(1, s * 0.18));
  // 頭
  ellG(c, x, y - s * 0.5, s * 1.45, s * 1.25, "#b52a2a", "#5a0d0d"); stroke(c, "#1a0000", Math.max(1, s * 0.18));
  // 角
  for (const dir of [-1, 1]) {
    c.beginPath(); c.moveTo(x + dir * s * 1.2, y - s * 1.0);
    c.quadraticCurveTo(x + dir * s * 2.4, y - s * 2.2, x + dir * s * 1.3, y - s * 1.5);
    c.fillStyle = "#2b0606"; c.fill(); stroke(c, "#1a0000", Math.max(1, s * 0.12));
  }
  // 王冠
  c.fillStyle = "#ffce47";
  c.beginPath();
  c.moveTo(x - s * 1.25, y - s * 1.25); c.lineTo(x - s * 1.25, y - s * 2.0); c.lineTo(x - s * 0.65, y - s * 1.4);
  c.lineTo(x, y - s * 2.25); c.lineTo(x + s * 0.65, y - s * 1.4); c.lineTo(x + s * 1.25, y - s * 2.0); c.lineTo(x + s * 1.25, y - s * 1.25);
  c.fill(); stroke(c, "#9a7b0a", Math.max(1, s * 0.1));
  ell(c, x, y - s * 1.95, s * 0.18, s * 0.18, "#ff5a5a");
  // 光る目
  eye(c, x - s * 0.55, y - s * 0.5, s * 0.34, "#ffec6b", "#ff3a3a");
  eye(c, x + s * 0.55, y - s * 0.5, s * 0.34, "#ffec6b", "#ff3a3a");
  // 牙の口
  rect(c, x - s * 0.85, y + s * 0.15, s * 1.7, s * 0.32, "#1a0000");
  for (let i = -3; i <= 3; i++) {
    c.fillStyle = "#fff";
    c.beginPath(); c.moveTo(x + i * s * 0.26, y + s * 0.15); c.lineTo(x + i * s * 0.26 + s * 0.13, y + s * 0.15); c.lineTo(x + i * s * 0.26 + s * 0.06, y + s * 0.5); c.fill();
  }
  c.restore();
}

/* ===========================================================
 * 8. マップ描画
 * =========================================================== */
/* 入手・レベルアップ時に主人公の頭上へ表示する浮遊テキスト
   item=緑（アイテム系） / equip=赤（装備系） / level=金（レベルアップ） */
const FLOAT_LIFE = 1.5;
const FLOAT_COLOR = { item: "#8dff70", equip: "#ff8484", level: "#ffd34d" };
const floatTexts = [];
function _nowMs() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
function floatGain(text, type) { floatTexts.push({ text, type, born: _nowMs() }); if (floatTexts.length > 6) floatTexts.shift(); }
function drawFloatTexts(p, camX, camY) {
  if (!floatTexts.length) return;
  const now = _nowMs();
  for (let i = floatTexts.length - 1; i >= 0; i--) if ((now - floatTexts[i].born) / 1000 > FLOAT_LIFE) floatTexts.splice(i, 1);
  const v = inView(p.fx, p.fy, camX, camY); if (!v) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.lineJoin = "round";
  floatTexts.forEach((f, i) => {
    const age = (now - f.born) / 1000;
    const x = v.px + 16, y = v.py - 8 - age * 30 - i * 15;
    ctx.globalAlpha = age < 1.0 ? 1 : Math.max(0, 1 - (age - 1.0) / 0.5);
    ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(0,0,0,0.9)"; ctx.strokeText(f.text, x, y);
    ctx.fillStyle = FLOAT_COLOR[f.type] || "#fff"; ctx.fillText(f.text, x, y);
  });
  ctx.restore();
}

function draw() {
  if (!game || !game.floorData) return;
  ctx.fillStyle = "#05060f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const p = game.player, fd = game.floorData, th = themeOf(game.floor);
  // 浮動小数カメラ（主人公の表示位置 fx,fy に追従＝なめらかスクロール）
  const camX = clamp(p.fx - Math.floor(VIEW_W / 2), 0, MAP_W - VIEW_W);
  const camY = clamp(p.fy - Math.floor(VIEW_H / 2), 0, MAP_H - VIEW_H);
  const ci = Math.floor(camX), cj = Math.floor(camY);
  const ox = (camX - ci) * TILE, oy = (camY - cj) * TILE;

  for (let vy = 0; vy <= VIEW_H; vy++)
    for (let vx = 0; vx <= VIEW_W; vx++) {
      const mx = ci + vx, my = cj + vy;
      if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) continue;
      drawTile(fd.map[my][mx], vx * TILE - ox, vy * TILE - oy, th, mx, my);   // 隙間防止のため丸めない
    }

  if (fd.props) for (const pr of fd.props) drawProp(pr, camX, camY);     // 装飾オブジェ
  for (const lm of fd.landmarks) drawLandmark(lm, camX, camY);
  if (fd.key && !fd.key.taken) drawKey(fd.key, camX, camY);
  if (fd.vault) { drawLockedDoor(fd.vault, camX, camY); if (!fd.vault.taken) drawVaultChest(fd.vault, camX, camY); }
  for (const it of fd.items) drawItemTile(it, camX, camY);
  if (fd.stairs) drawStairs(fd.stairs, camX, camY, th, fd.stairsLocked);
  if (fd.torches) for (const t of fd.torches) drawTorch(t, camX, camY);  // 壁の松明
  if (fd.merchant) drawMerchant(fd.merchant, camX, camY);
  for (const e of fd.enemies) drawEnemySymbol(e, camX, camY);
  if (fd.guardian && !fd.guardian.defeated) drawEnemySymbol(fd.guardian, camX, camY);
  drawHero(p, camX, camY);

  drawLighting(fd, p, camX, camY);                                       // 照明（暗がり＋松明/主人公の灯り）
  drawFloatTexts(p, camX, camY);                                         // 頭上の入手/Lv表示（照明の上＝常に明るく）
}

// 暖色のグロー（加算）
function warmGlow(c, x, y, r, a, col) {
  const g = c.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, (col || "rgba(255,205,120,") + a + ")");
  g.addColorStop(1, (col || "rgba(255,205,120,") + "0)");
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

function drawLighting(fd, p, camX, camY) {
  const pvx = (p.fx - camX) * TILE + 16, pvy = (p.fy - camY) * TILE + 16;
  // 画面端を暗く（プレイヤー中心の暗がり）
  const dk = ctx.createRadialGradient(pvx, pvy, TILE * 2.5, pvx, pvy, TILE * 8.5);
  dk.addColorStop(0, "rgba(4,4,12,0)"); dk.addColorStop(1, "rgba(4,4,12,0.5)");
  ctx.fillStyle = dk; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 灯り（加算合成）
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  warmGlow(ctx, pvx, pvy - 6, TILE * 3.4, 0.20, "rgba(255,230,160,");      // 主人公の周囲を明るく
  if (fd.torches) for (const t of fd.torches) {
    const v = inView(t.x, t.y, camX, camY); if (!v) continue;
    const fl = 0.8 + 0.2 * Math.sin(_time / 110 + t.x * 1.7 + t.y * 0.9);
    warmGlow(ctx, v.px + 16, v.py + 14, TILE * 2.7 * fl, 0.34 * fl, "rgba(255,180,90,");
  }
  if (fd.props) for (const pr of fd.props) {
    if (pr.type !== "brazier") continue;
    const v = inView(pr.x, pr.y, camX, camY); if (!v) continue;
    const fl = 0.8 + 0.2 * Math.sin(_time / 95 + pr.x);
    warmGlow(ctx, v.px + 16, v.py + 12, TILE * 2.2 * fl, 0.30 * fl, "rgba(255,170,80,");
  }
  ctx.restore();
}

// 壁の松明
function drawTorch(t, camX, camY) {
  const v = inView(t.x, t.y, camX, camY); if (!v) return;
  const { px, py } = v, bx = px + 16, by = py + TILE - 6;
  rect(ctx, bx - 2, by - 6, 4, 11, "#3a2a18");
  rect(ctx, bx - 4, by + 3, 8, 4, "#5a4326");
  const f = 0.7 + 0.3 * Math.sin(_time / 90 + t.x * 2.1 + t.y);
  const fy = by - 9;
  ctx.fillStyle = "#ff7a1e"; ctx.beginPath(); ctx.moveTo(bx, fy - 13 * f); ctx.quadraticCurveTo(bx + 6, fy - 2, bx, fy + 2); ctx.quadraticCurveTo(bx - 6, fy - 2, bx, fy - 13 * f); ctx.fill();
  ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(bx, fy - 8 * f); ctx.quadraticCurveTo(bx + 3.5, fy - 1, bx, fy + 1); ctx.quadraticCurveTo(bx - 3.5, fy - 1, bx, fy - 8 * f); ctx.fill();
  ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(bx, fy, 2, 0, Math.PI * 2); ctx.fill();
}

// 床の装飾オブジェ（効果なしなので控えめ＝小さく・暗く）
function drawProp(pr, camX, camY) {
  const v = inView(pr.x, pr.y, camX, camY); if (!v) return;
  const { px, py } = v, cx = px + 16;
  let drawn = false;
  ctx.save();
  ctx.globalAlpha = 0.6;                              // 暗く・控えめに
  if (pr.type === "pillar" || pr.type === "statue") drawn = drawDeco("p_" + (pr.v || "pillar1"), px, py, TILE * 1.2, 4);
  else if (pr.type === "bones") drawn = drawDeco("p_bones", px, py, TILE * 0.95, 2);
  ctx.restore();
  if (drawn) return;
  drawPropProc(pr, px, py, cx);                       // brazier 等のフォールバック
}

function drawPropProc(pr, px, py, cx) {
  switch (pr.type) {
    case "pillar":
      rect(ctx, cx - 9, py + 0, 18, 5, "#52566e"); rect(ctx, cx - 7, py + 4, 14, 24, "#3a3d52");
      rect(ctx, cx - 7, py + 4, 5, 24, "#4a4e66"); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(cx + 2, py + 6, 2, 22);
      rect(ctx, cx - 9, py + 26, 18, 5, "#2e3144"); break;
    case "statue":
      rect(ctx, cx - 8, py + 23, 16, 7, "#4a4e66"); rect(ctx, cx - 6, py + 13, 12, 12, "#5a5e76");
      ell(ctx, cx, py + 9, 6, 7, "#6a6e86"); rect(ctx, cx - 3, py + 7, 2, 2, "#1a1a22"); rect(ctx, cx + 1, py + 7, 2, 2, "#1a1a22");
      rect(ctx, cx + 5, py + 4, 3, 22, "#7a7e96"); break;                          // 槍を持つ像
    case "brazier":
      rect(ctx, cx - 2, py + 18, 4, 10, "#3a2a18"); rect(ctx, cx - 7, py + 26, 14, 4, "#3a2a18");
      ell(ctx, cx, py + 16, 8, 4, "#5a4326"); ell(ctx, cx, py + 14, 7, 3, "#2a1a0e");
      { const f = 0.7 + 0.3 * Math.sin(_time / 80 + pr.x);
        ctx.fillStyle = "#ff7a1e"; ctx.beginPath(); ctx.moveTo(cx, py + 14 - 12 * f); ctx.quadraticCurveTo(cx + 6, py + 13, cx, py + 16); ctx.quadraticCurveTo(cx - 6, py + 13, cx, py + 14 - 12 * f); ctx.fill();
        ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(cx, py + 12, 3, 0, Math.PI * 2); ctx.fill(); } break;
    case "rubble":
      ctx.fillStyle = "#3a3d52"; for (const o of [[-7, 22], [2, 24], [8, 20], [-2, 26]]) { ctx.beginPath(); ctx.arc(cx + o[0], py + o[1], 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#2e3144"; ctx.beginPath(); ctx.arc(cx + 4, py + 23, 2, 0, Math.PI * 2); ctx.fill(); break;
    case "bones":
      ctx.strokeStyle = "#cfcfe0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 7, py + 25); ctx.lineTo(cx + 7, py + 21); ctx.moveTo(cx - 3, py + 21); ctx.lineTo(cx + 1, py + 27); ctx.stroke();
      ell(ctx, cx - 8, py + 24, 3.2, 3.2, "#e8e8f0"); ctx.fillStyle = "#1a1a22"; ctx.fillRect(cx - 9, py + 23, 1, 1); ctx.fillRect(cx - 7, py + 23, 1, 1); break;
  }
}

function inView(mx, my, camX, camY) {
  const px = (mx - camX) * TILE, py = (my - camY) * TILE;
  if (px <= -TILE * 1.6 || px >= canvas.width + TILE * 0.6 || py <= -TILE * 1.6 || py >= canvas.height + TILE * 0.6) return null;
  return { px: Math.round(px), py: Math.round(py) };
}

// セル座標から決定的な擬似乱数（テクスチャのばらつき用・毎フレーム同じ）
function cellHash(mx, my) { let h = (mx * 73856093) ^ (my * 19349663); h = (h ^ (h >>> 13)) >>> 0; return h; }

function drawTile(tile, px, py, th, mx, my) {
  const h = cellHash(mx, my);
  if (tile === T.WALL) {
    // 石レンガ（行ごとにオフセット、目地・ハイライト・ひび）
    rect(ctx, px, py, TILE, TILE, th.wallShade);
    const bh = 8, off = (my % 2) ? 16 : 0;
    for (let ry = 0; ry < TILE; ry += bh) {
      for (let rx = -off; rx < TILE; rx += 16) {
        const v = (cellHash(mx * 7 + rx, my * 7 + ry) % 5);
        const col = v === 0 ? th.wallTop : (v === 1 ? th.wallShade : th.wall);
        ctx.fillStyle = col; ctx.fillRect(px + rx + 1, py + ry + 1, 15, bh - 1);
        ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(px + rx + 1, py + ry + 1, 15, 1);
      }
    }
    // 目地（縦横の暗線）
    ctx.fillStyle = th.wallShade;
    for (let ry = 0; ry <= TILE; ry += bh) ctx.fillRect(px, py + ry, TILE, 1);
    // たまにひび
    if (h % 7 === 0) { ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 6 + (h % 6), py + 4); ctx.lineTo(px + 10 + (h % 8), py + 22); ctx.stroke(); }
  } else {
    // 石床スラブ（4分割の石畳＋目地＋まれに苔/ひび）
    rect(ctx, px, py, TILE, TILE, th.floor);
    const sub = [[2, 2], [16, 2], [2, 16], [16, 16]];
    for (let i = 0; i < 4; i++) {
      const v = (cellHash(mx * 3 + i, my * 3) % 4);
      ctx.fillStyle = v === 0 ? th.floorIn : (v === 1 ? th.floor : th.floorIn);
      ctx.fillRect(px + sub[i][0], py + sub[i][1], 13, 13);
      ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.fillRect(px + sub[i][0], py + sub[i][1], 13, 1);
    }
    // 目地
    ctx.fillStyle = "rgba(0,0,0,0.30)"; ctx.fillRect(px + 15, py + 1, 1, TILE - 2); ctx.fillRect(px + 1, py + 15, TILE - 2, 1);
    // 苔/ひび/小石
    const r = h % 11;
    if (r === 0) { ctx.fillStyle = "rgba(70,120,60,0.30)"; ctx.fillRect(px + 4 + (h % 6), py + 18, 6, 5); ctx.fillRect(px + 6, py + 22, 4, 3); }
    else if (r === 1) { ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 8, py + 6); ctx.lineTo(px + 20, py + 14); ctx.stroke(); }
    else if (r === 2) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(px + 20, py + 8, 2, 2); }
  }
}

function drawStairs(st, camX, camY, th, locked) {
  const v = inView(st.x, st.y, camX, camY); if (!v) return;
  const { px, py } = v;
  if (drawDeco("g_stairs", px, py, TILE * 1.28, 4)) {
    if (locked) {                                       // 施錠中は暗くして鍵マーク
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ell(ctx, px + 16, py + 13, 4, 4, "#ffd24a"); rect(ctx, px + 15, py + 15, 2, 7, "#ffd24a"); rect(ctx, px + 11, py + 20, 10, 6, "#caa017");
    } else {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; warmGlow(ctx, px + 16, py + 18, 18, 0.18, "rgba(160,255,180,"); ctx.restore();
    }
    return;
  }
  const ac = locked ? "#7a7a90" : (th.accent || "#5ee06a");
  rect(ctx, px + 2, py + 2, TILE - 4, TILE - 4, "#0a0b18");
  for (let i = 0; i < 4; i++) {
    rect(ctx, px + 4, py + 6 + i * 6, TILE - 8 - i * 4, 5, ac);
    rect(ctx, px + 4, py + 6 + i * 6, TILE - 8 - i * 4, 2, "#ffffff");
  }
  if (locked) {
    ell(ctx, px + 16, py + 13, 4, 4, "#ffd24a");
    rect(ctx, px + 15, py + 15, 2, 7, "#ffd24a");
    rect(ctx, px + 11, py + 20, 10, 6, "#caa017");
  }
}

function drawEnemySymbol(e, camX, camY) {
  const fx = (typeof e.fx === "number") ? e.fx : e.x;
  const fy = (typeof e.fy === "number") ? e.fy : e.y;
  const px = Math.round((fx - camX) * TILE), py = Math.round((fy - camY) * TILE);
  if (px < -TILE || px > canvas.width || py < -TILE || py > canvas.height) return;
  const cooling = e.fleeUntil && Date.now() < e.fleeUntil;   // 逃走直後は半透明
  if (cooling) ctx.globalAlpha = 0.4;
  if (e.isBoss) {
    ctx.fillStyle = "rgba(255,90,90,0.22)"; ctx.fillRect(px, py, TILE, TILE);
    drawMonster(ctx, e.type, px + 16, py + 15, 6.5);
    rect(ctx, px + 3, py + 28, TILE - 6, 3, "#ff5a5a");
  } else if (e.isGuardian) {
    ctx.fillStyle = "rgba(255,170,60,0.18)"; ctx.fillRect(px, py, TILE, TILE);
    drawMonster(ctx, e.type, px + 16, py + 16, 6);
    rect(ctx, px + 3, py + 28, TILE - 6, 3, "#ffae3c");
  } else {
    drawMonster(ctx, e.type, px + 16, py + 17, 5);
  }
  if (cooling) ctx.globalAlpha = 1;
}

function drawVaultChest(vault, camX, camY) {
  const v = inView(vault.chestX, vault.chestY, camX, camY); if (!v) return;
  const { px, py } = v, cx = px + 16, cy = py + 16;
  ctx.save(); ctx.globalCompositeOperation = "lighter"; warmGlow(ctx, cx, cy, 22, 0.28, "rgba(255,210,90,"); ctx.restore();
  if (drawDeco("g_vault", px, py, TILE * 1.12, 3)) return;
  ctx.fillStyle = "rgba(255,210,74,0.18)"; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
  rect(ctx, cx - 10, cy - 3, 20, 12, "#caa017");
  rect(ctx, cx - 10, cy - 9, 20, 6, "#ffd24a");
  rect(ctx, cx - 10, cy + 1, 20, 2, "#7a5e0a");
  rect(ctx, cx - 3, cy - 5, 6, 8, "#fff7d0");
  rect(ctx, cx - 1, cy - 3, 2, 4, "#7a5e0a");
}
function drawLockedDoor(vault, camX, camY) {
  const v = inView(vault.doorX, vault.doorY, camX, camY); if (!v) return;
  const { px, py } = v;
  if (vault.opened) {                                   // 開いた扉は枠だけ薄く
    const r = DECO_IMG["g_door"];
    if (r && r.ready) { ctx.save(); ctx.globalAlpha = 0.3; drawDeco("g_door", px, py, TILE * 1.22, 3); ctx.restore(); return; }
    rect(ctx, px + 2, py + 2, 4, TILE - 4, "#5a3414"); rect(ctx, px + TILE - 6, py + 2, 4, TILE - 4, "#5a3414"); return;
  }
  if (drawDeco("g_door", px, py, TILE * 1.22, 3)) return;
  rect(ctx, px + 3, py + 2, TILE - 6, TILE - 4, "#5a3414");
  rect(ctx, px + 5, py + 4, TILE - 10, TILE - 8, "#7a4a1e");
  rect(ctx, px + 14, py + 4, 3, TILE - 8, "#3a2410");
  ell(ctx, px + 16, py + 14, 4, 4, "#ffd24a"); rect(ctx, px + 15, py + 16, 2, 7, "#ffd24a");
}
function drawKey(key, camX, camY) {
  const v = inView(key.x, key.y, camX, camY); if (!v) return;
  drawBronzeKey(ctx, v.px + 16, v.py + 16, 2.4);
}

function drawLandmark(lm, camX, camY) {
  const v = inView(lm.x, lm.y, camX, camY); if (!v) return;
  const { px, py } = v, cx = px + 16, cy = py + 16;
  rect(ctx, px + 1, py + 1, TILE - 2, TILE - 2, "rgba(181,107,255,0.08)");
  // 画像（ギミック）優先：泉/祭壇/大樹はギミック、像は石像
  const dkey = lm.type === "fountain" ? "g_fountain" : lm.type === "altar" ? "g_altar" : lm.type === "tree" ? "g_tree" : lm.type === "statue" ? "p_statue_gargoyle" : null;
  if (dkey && drawDeco(dkey, px, py, TILE * 1.5, 5)) return;
  switch (lm.type) {
    case "fountain":
      ell(ctx, cx, cy + 4, 12, 6, "#274b66"); ell(ctx, cx, cy + 3, 9, 4, "#4ad4ff");
      rect(ctx, cx - 1, cy - 8, 2, 10, "#9fdcff"); ell(ctx, cx, cy - 8, 3, 2, "#cfeeff"); break;
    case "altar":
      rect(ctx, cx - 9, cy + 2, 18, 6, "#6b6b80"); rect(ctx, cx - 6, cy - 4, 12, 6, "#8a8aa0");
      rect(ctx, cx - 2, cy - 12, 4, 8, "#c9a23a"); ell(ctx, cx, cy - 13, 2.5, 4, "#ffce47"); break;
    case "statue":
      rect(ctx, cx - 7, cy + 5, 14, 5, "#5a5a6e"); ell(ctx, cx, cy - 6, 5, 6, "#9a86c0");
      rect(ctx, cx - 5, cy - 1, 10, 8, "#8273a8"); ell(ctx, cx - 2, cy - 7, 1, 1.4, "#ff5a5a"); ell(ctx, cx + 2, cy - 7, 1, 1.4, "#ff5a5a"); break;
    case "tree":
      rect(ctx, cx - 2, cy, 4, 12, "#5a3414"); ell(ctx, cx, cy - 6, 12, 10, "#2f6d33");
      ell(ctx, cx - 5, cy - 3, 6, 6, "#3f8d43"); ell(ctx, cx + 5, cy - 3, 6, 6, "#3f8d43"); break;
  }
}

function drawItemTile(it, camX, camY) {
  const v = inView(it.x, it.y, camX, camY); if (!v) return;
  const { px, py } = v, cx = px + 16, cy = py + 16;
  switch (it.kind) {
    case "potion": drawConsumableArt(ctx, "potion", cx, cy, 2.7); break;
    case "hi_potion": case "antidote": case "str_potion": case "def_potion": case "luck_potion": case "scroll": case "feather":
      drawConsumableArt(ctx, it.kind, cx, cy, 2.7); break;
    case "gold":
      if (drawDeco("g_coin", px, py, TILE * 0.95, 3)) break;
      ell(ctx, cx, cy, 8, 8, "#ffce47"); ell(ctx, cx, cy, 5, 5, "#ffe680"); rect(ctx, cx - 2, cy - 4, 4, 8, "#caa017"); break;
    case "chest":
      if (drawDeco("g_chest", px, py, TILE * 1.05, 3)) break;
      rect(ctx, cx - 9, cy - 4, 18, 11, "#7a4a1e"); rect(ctx, cx - 9, cy - 8, 18, 5, "#8a5424"); rect(ctx, cx - 9, cy - 1, 18, 2, "#3a2410"); rect(ctx, cx - 2, cy - 4, 4, 6, "#ffce47"); break;
    case "equip": {
      const et = EQUIP[it.id] ? EQUIP[it.id].type : "weapon";
      if (et === "weapon") drawWeaponArt(ctx, it.id, cx, cy, 1.7);
      else if (et === "accessory") drawAccessoryArt(ctx, it.id, cx, cy, 2.6);
      else drawArmorArt(ctx, it.id, cx, cy, 2.9);
      break;
    }
  }
}
/* ---- 武器ドット絵（アップロードのデザインを再現） ----
   各 art 関数は「刃を上に向けた縦向き」で原点中心に描画。
   drawWeaponArt が -45° 回転させて右上向き（アップ画像と同じ向き）にする。 */
const OUTLINE = "#14110c";
// ブロック描画ヘルパー（s 単位）
function blk(c, s) { return (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * s, y * s, w * s, h * s); }; }

// 共通の剣／短剣ジェネレータ
function artSword(c, s, o) {
  const b = blk(c, s);
  const L = o.len, w = o.w, gw = o.gw, gl = o.grip;
  // 刃の輪郭→本体→刃先ハイライト→中央樋
  b(-w / 2 - 0.35, -L - 0.35, w + 0.7, L + 0.7, OUTLINE);
  b(-w / 2, -L, w, L, o.blade);
  b(-w / 2, -L, w * 0.42, L, o.edge);                 // 左側の光
  if (o.fuller) b(-0.18, -L + 1, 0.36, L - 1.6, o.fuller);
  b(-0.55, -L - 0.9, 1.1, 1.2, OUTLINE); b(-0.4, -L - 0.7, 0.8, 1, o.blade); // 切っ先
  // 鍔
  b(-gw / 2 - 0.2, -0.7, gw + 0.4, 1.3, OUTLINE);
  b(-gw / 2, -0.55, gw, 1, o.guard);
  if (o.guardLt) b(-gw / 2, -0.55, gw, 0.35, o.guardLt);
  if (o.gem) { b(-0.55, -0.65, 1.1, 1.15, OUTLINE); b(-0.42, -0.5, 0.84, 0.85, o.gem); b(-0.28, -0.4, 0.34, 0.34, "#ffffff"); }
  // 握り
  b(-0.6, 0.5, 1.2, gl + 0.2, OUTLINE);
  b(-0.45, 0.6, 0.9, gl, o.grip2);
  for (let i = 0; i < gl - 0.2; i += 0.66) b(-0.45, 0.72 + i, 0.9, 0.2, o.gripDk);
  // 柄頭
  b(-0.65, 0.55 + gl, 1.3, 1.1, OUTLINE);
  b(-0.5, 0.65 + gl, 1.0, 0.9, o.pommel || o.guard);
  if (o.gem) { b(-0.3, 0.78 + gl, 0.6, 0.6, o.gem); b(-0.2, 0.85 + gl, 0.24, 0.24, "#ffffff"); }
}

const WEAPON_ART = {
  // 1. サビた短剣
  rusty_dagger: (c, s) => artSword(c, s, { len: 4, w: 1.5, gw: 2.6, grip: 2.2,
    blade: "#9a9286", edge: "#c7c1b3", guard: "#6f6a60", grip2: "#7a4a1e", gripDk: "#4a2c10", pommel: "#8a8276" }),
  // 2. 鋼の剣
  steel_sword: (c, s) => artSword(c, s, { len: 6.4, w: 1.5, gw: 2.9, grip: 2.2,
    blade: "#aab0c6", edge: "#eaeef8", guard: "#8a8d9a", grip2: "#7a4a1e", gripDk: "#4a2c10", pommel: "#9a9db0" }),
  // 4. 紫水晶の短剣
  amethyst_dagger: (c, s) => artSword(c, s, { len: 4.3, w: 1.5, gw: 2.7, grip: 2.2,
    blade: "#8f95a8", edge: "#dfe4f0", guard: "#e8b830", guardLt: "#ffe07a", gem: "#9a3fd0", grip2: "#3a2b55", gripDk: "#241a38", pommel: "#e8b830" }),
  // 5. 騎士の剣
  knight_sword: (c, s) => artSword(c, s, { len: 6.6, w: 1.6, gw: 3.1, grip: 2.3,
    blade: "#cdd4e8", edge: "#ffffff", guard: "#e8b830", guardLt: "#ffe07a", gem: "#2a6bd6", grip2: "#2a3f9a", gripDk: "#1a2860", pommel: "#e8b830" }),
  // 8. 聖剣（豪奢・幅広・金の樋）
  holy_sword: (c, s) => artSword(c, s, { len: 7.2, w: 2.0, gw: 3.6, grip: 2.4,
    blade: "#dfe4f0", edge: "#ffffff", fuller: "#e8b830", guard: "#f0c64a", guardLt: "#fff0a8", gem: "#2a6bd6", grip2: "#2a3f9a", gripDk: "#1a2860", pommel: "#f0c64a" }),

  // 3. 戦斧
  battle_axe: (c, s) => {
    const b = blk(c, s);
    // 柄
    b(-0.5, -3.4, 1.0, 8.4, OUTLINE);
    b(-0.35, -3.2, 0.7, 8.0, "#7a4a1e");
    b(-0.35, -3.2, 0.28, 8.0, "#9a6330");
    for (let i = 0; i < 7; i += 1.3) b(-0.35, -2.6 + i, 0.7, 0.22, "#4a2c10");
    // 斧頭（ポリゴンで斧らしい形に）
    const axe = (off, col) => {
      c.fillStyle = col; c.beginPath();
      c.moveTo((0.2 - off) * s, (-3.6 - off) * s);
      c.lineTo((2.0) * s, (-3.95 - off) * s);
      c.lineTo((3.2 + off) * s, (-2.5) * s);
      c.lineTo((3.15 + off) * s, (-1.2) * s);
      c.lineTo((1.9) * s, (-0.45 + off) * s);
      c.lineTo((0.2 - off) * s, (-0.7 + off) * s);
      c.closePath(); c.fill();
    };
    axe(0.35, OUTLINE);
    axe(0, "#9a9db0");
    // 刃の光（外側の縁）
    c.fillStyle = "#d2d6e4"; c.beginPath();
    c.moveTo(2.55 * s, -3.2 * s); c.lineTo(3.2 * s, -2.5 * s); c.lineTo(3.15 * s, -1.2 * s); c.lineTo(2.5 * s, -1.5 * s); c.closePath(); c.fill();
    b(0.3, -2.5, 1.2, 1.0, "#7a7d90");           // 内側の陰
    // 上の2つのボルト
    b(-0.7, -4.4, 1.0, 1.0, OUTLINE); b(-0.55, -4.25, 0.7, 0.7, "#9a9db0"); b(-0.45, -4.15, 0.3, 0.3, "#c6cad8");
    b(0.5, -4.4, 1.0, 1.0, OUTLINE); b(0.65, -4.25, 0.7, 0.7, "#9a9db0"); b(0.75, -4.15, 0.3, 0.3, "#c6cad8");
    // 柄頭
    b(-0.55, 4.4, 1.1, 0.9, OUTLINE); b(-0.4, 4.5, 0.8, 0.7, "#8a8276");
  },

  // 6. 賢者の杖（青いオーブ）
  sage_staff: (c, s) => {
    const b = blk(c, s);
    // 柄
    b(-0.5, -1.5, 1.0, 7.0, OUTLINE);
    b(-0.35, -1.3, 0.7, 6.7, "#7a4a1e");
    b(-0.35, -1.3, 0.26, 6.7, "#9a6330");
    // 先端の又
    b(-1.0, -3.4, 0.7, 2.2, "#6e4422"); b(0.3, -3.4, 0.7, 2.2, "#6e4422");
    // オーブ（青）
    b(-1.1, -5.2, 2.2, 2.2, OUTLINE);
    c.fillStyle = "#1f6fd0"; c.beginPath(); c.arc(0, -4.1 * s, 1.05 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#5ea8ff"; c.beginPath(); c.arc(-0.3 * s, -4.45 * s, 0.5 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ffffff"; c.beginPath(); c.arc(-0.4 * s, -4.55 * s, 0.2 * s, 0, Math.PI * 2); c.fill();
    // きらめき
    b(1.2, -5.2, 0.3, 0.3, "#9fd0ff"); b(-1.5, -4.6, 0.3, 0.3, "#9fd0ff"); b(0.9, -3.2, 0.25, 0.25, "#9fd0ff");
    // 金の帯と石突
    b(-0.45, 4.4, 0.9, 0.5, "#e8b830");
    b(-0.5, 5.0, 1.0, 0.9, OUTLINE); b(-0.38, 5.1, 0.76, 0.7, "#5a5a66");
  },

  // 7. 雷神の槍
  thunder_spear: (c, s) => {
    const b = blk(c, s);
    // 柄（紺）
    b(-0.45, -1.5, 0.9, 7.0, OUTLINE);
    b(-0.32, -1.3, 0.64, 6.7, "#243a66");
    b(-0.32, -1.3, 0.24, 6.7, "#3a5a9a");
    // 穂先（木の葉型）
    b(-1.0, -5.6, 2.0, 4.3, OUTLINE);
    b(-0.8, -5.4, 1.6, 4.0, "#aeb6cc");
    b(-0.1, -5.3, 0.7, 3.8, "#e6ecf8");          // 光
    b(-0.5, -5.9, 1.0, 0.9, "#cdd4e8");          // 切っ先
    // 金の星型カラー
    b(-1.3, -2.0, 2.6, 1.2, OUTLINE);
    b(-1.15, -1.85, 2.3, 0.95, "#e8b830");
    b(-0.25, -1.75, 0.5, 0.7, "#2a6bd6");        // 中央の青石
    // 稲妻（黄）
    b(1.3, -2.6, 0.3, 0.5, "#ffd24a"); b(1.55, -2.0, 0.3, 0.4, "#ffd24a");
    b(-1.6, -2.6, 0.3, 0.5, "#ffd24a"); b(-1.85, -1.9, 0.3, 0.4, "#ffd24a");
    // 金の石突
    b(-0.5, 5.0, 1.0, 1.1, OUTLINE); b(-0.38, 5.1, 0.76, 0.9, "#e8b830");
  },

  // 9. 魔王の剣（黒刃＋紫炎＋赤石）
  demon_blade: (c, s) => {
    const b = blk(c, s);
    // 紫の炎（背後）
    c.fillStyle = "rgba(150,60,210,0.55)";
    for (const [fx, fy, fr] of [[-1.4, -4, 0.8], [1.3, -3, 0.7], [-1.0, -1.5, 0.6], [1.1, -5, 0.6], [0, -6, 0.7]]) {
      c.beginPath(); c.arc(fx * s, fy * s, fr * s, 0, Math.PI * 2); c.fill();
    }
    // 黒い刃（ギザギザ）
    b(-1.0 - 0.35, -7 - 0.35, 2.0 + 0.7, 6.4 + 0.7, OUTLINE);
    b(-1.0, -7, 2.0, 6.4, "#2a2435");
    b(-1.0, -7, 0.7, 6.4, "#473b58");            // 左の光
    b(-0.15, -6.6, 0.3, 5.6, "#6a4a8a");         // 中央の溝（紫）
    b(-0.5, -7.7, 1.0, 1.0, OUTLINE); b(-0.38, -7.5, 0.76, 0.8, "#2a2435"); // 切っ先
    // 棘のある鍔
    b(-2.0, -0.7, 4.0, 1.3, OUTLINE);
    b(-1.85, -0.55, 3.7, 1.0, "#2a2435");
    b(-1.85, -0.55, 3.7, 0.35, "#473b58");
    b(-0.4, -0.55, 0.8, 0.95, "#c01818"); b(-0.28, -0.45, 0.4, 0.4, "#ff6a6a"); // 赤石
    // 握り
    b(-0.55, 0.5, 1.1, 2.4, OUTLINE); b(-0.4, 0.6, 0.8, 2.2, "#3a3045");
    // 柄頭の赤石
    b(-0.6, 2.9, 1.2, 1.1, OUTLINE); b(-0.46, 3.0, 0.92, 0.9, "#2a2435");
    b(-0.3, 3.15, 0.6, 0.6, "#c01818"); b(-0.18, 3.25, 0.26, 0.26, "#ff6a6a");
  },
};

// 武器を (cx,cy) 中心に、右上向き（アップ画像と同じ）で描画
function drawWeaponArt(c, id, cx, cy, s) {
  const fn = WEAPON_ART[id] || WEAPON_ART.steel_sword;
  c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 4); fn(c, s); c.restore();
}

// 盾（木＋金属縁＋中央ボス）。r は半径目安
function drawShieldArt(c, cx, cy, r) {
  c.fillStyle = OUTLINE; c.beginPath();
  c.moveTo(cx - r - 1, cy - r - 1); c.lineTo(cx + r + 1, cy - r - 1);
  c.lineTo(cx + r + 1, cy + r * 0.3); c.lineTo(cx, cy + r + 2); c.lineTo(cx - r - 1, cy + r * 0.3); c.closePath(); c.fill();
  c.fillStyle = "#9a7b4f"; c.beginPath();
  c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy - r);
  c.lineTo(cx + r, cy + r * 0.3); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy + r * 0.3); c.closePath(); c.fill();
  c.fillStyle = "#b89868"; c.fillRect(cx - r, cy - r, r * 2, r * 0.3);  // 上部ハイライト
  c.fillStyle = "#cfc0a0"; c.fillRect(cx - r, cy - r, r * 2, Math.max(1, r * 0.18)); // 金属縁
  c.fillStyle = "#5a3414"; c.fillRect(cx - 1, cy - r * 0.5, 2, r * 1.2);           // 縦の木目
  ell(c, cx, cy - r * 0.1, r * 0.32, r * 0.32, "#cfc0a0");                          // 中央ボス
  ell(c, cx, cy - r * 0.1, r * 0.16, r * 0.16, "#8a7250");
}

/* ---- 防具ドット絵（アップロードのデザインを再現） ----
   各 art 関数は前向きの胴防具／マント／盾を原点中心に s 単位で描画。
   drawArmorArt が指定位置に配置する。 */
function poly(c, s, pts) { c.beginPath(); pts.forEach((p, i) => { const x = p[0] * s, y = p[1] * s; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); }
function eo(c, x, y, rx, ry, fill, s) { c.beginPath(); c.ellipse(x * s, y * s, rx * s, ry * s, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }

// 胴防具のシルエット
function torsoPath(c, s) {
  poly(c, s, [[-3.4, -2.6], [-1.0, -2.8], [-0.8, -1.7], [0.8, -1.7], [1.0, -2.8], [3.4, -2.6],
    [3.7, -0.8], [2.5, 0.6], [2.3, 2.6], [1.4, 3.4], [0, 2.8], [-1.4, 3.4], [-2.3, 2.6], [-2.5, 0.6], [-3.7, -0.8]]);
}
function armorPauldron(c, s, x, y, o) {
  eo(c, x, y, 1.35, 1.15, o.paulCol || o.base, s); c.lineWidth = Math.max(1, 0.5 * s); c.strokeStyle = OUTLINE; c.stroke();
  c.globalAlpha = 0.5; eo(c, x - 0.3, y - 0.3, 0.6, 0.45, o.light, s); c.globalAlpha = 1;
  eo(c, x + 0.2, y + 0.4, 0.18, 0.18, "#8a8a96", s);
  if (o.trim) { c.lineWidth = Math.max(1, 0.25 * s); c.strokeStyle = o.trim; c.beginPath(); c.ellipse(x * s, y * s, 1.35 * s, 1.15 * s, 0, 0, Math.PI * 2); c.stroke(); }
}
// 共通の胴防具
function artTorso(c, s, o) {
  if (o.pauldron) { armorPauldron(c, s, -2.8, -2.0, o); armorPauldron(c, s, 2.8, -2.0, o); }
  torsoPath(c, s); c.fillStyle = o.base; c.fill();
  c.lineWidth = Math.max(1, 0.55 * s); c.strokeStyle = OUTLINE; c.lineJoin = "round"; c.stroke();
  c.save(); torsoPath(c, s); c.clip();
  c.fillStyle = o.shade; c.fillRect(0, -4 * s, 5 * s, 8 * s);
  c.globalAlpha = 0.55; c.fillStyle = o.light; c.fillRect(-2.6 * s, -2.2 * s, 1.6 * s, 2.6 * s); c.globalAlpha = 1;
  c.fillStyle = o.shade; c.fillRect(-0.12 * s, -1.6 * s, 0.24 * s, 4.4 * s);
  c.fillStyle = o.shade; c.fillRect(-2.4 * s, 1.6 * s, 4.8 * s, 0.3 * s);
  c.restore();
  eo(c, 0, -2.2, 0.95, 0.7, o.neck || "#2a2620", s);     // 襟ぐり
  if (o.trim) {
    c.lineWidth = Math.max(1, 0.28 * s); c.strokeStyle = o.trim;
    torsoPath(c, s); c.stroke();
    c.beginPath(); c.ellipse(0, -2.2 * s, 0.95 * s, 0.7 * s, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = o.trim; c.fillRect(-0.14 * s, -1.4 * s, 0.28 * s, 3.8 * s);
  }
  if (o.emblem) { // フルール（百合）紋章
    c.fillStyle = o.trim || "#e8b830";
    c.fillRect(-0.18 * s, -1.3 * s, 0.36 * s, 2.0 * s);
    c.fillRect(-0.85 * s, -0.5 * s, 1.7 * s, 0.3 * s);
    c.fillRect(-0.6 * s, -1.0 * s, 0.2 * s, 0.7 * s); c.fillRect(0.4 * s, -1.0 * s, 0.2 * s, 0.7 * s);
    eo(c, 0, -1.5, 0.22, 0.22, o.trim || "#e8b830", s);
  }
  if (o.gem) {
    eo(c, 0, 0.3, 0.52, 0.52, OUTLINE, s); eo(c, 0, 0.3, 0.36, 0.36, o.gem, s);
    eo(c, -0.1, 0.18, 0.12, 0.12, "#ffffff", s);
  }
}

// マント（ベル型・裾ギザギザ）
function cloakBody(c, s) {
  poly(c, s, [[-1.6, -1.6], [1.6, -1.6], [2.4, 1.5], [2.8, 3.4], [1.6, 2.8], [1.0, 3.6], [0.2, 2.9],
    [-0.2, 3.7], [-1.0, 2.9], [-1.6, 3.6], [-2.8, 3.4], [-2.4, 1.5]]);
}

const ARMOR_ART = {
  // 1. 布の服
  cloth_tunic: (c, s) => {
    poly(c, s, [[-2.0, -2.6], [-0.9, -2.7], [0, -2.5], [0.9, -2.7], [2.0, -2.6], [2.7, -1.5], [2.0, -1.1],
      [2.4, 2.0], [2.7, 3.2], [1.7, 2.6], [1.2, 3.3], [0.4, 2.6], [0, 3.3], [-0.4, 2.6], [-1.2, 3.3], [-1.7, 2.6], [-2.7, 3.2], [-2.4, 2.0], [-2.0, -1.1], [-2.7, -1.5]]);
    c.fillStyle = "#dcd2b6"; c.fill(); c.lineWidth = Math.max(1, 0.5 * s); c.strokeStyle = OUTLINE; c.lineJoin = "round"; c.stroke();
    c.save(); c.clip();
    c.fillStyle = "#c2b692"; c.fillRect(0, -4 * s, 4 * s, 9 * s);
    c.globalAlpha = 0.6; c.fillStyle = "#ece3c8"; c.fillRect(-2.3 * s, -2 * s, 1.3 * s, 3.5 * s); c.globalAlpha = 1;
    c.restore();
    c.fillStyle = "#7d7256"; poly(c, s, [[-0.8, -2.6], [0.8, -2.6], [0, -0.7]]); c.fill();   // Vネック
    c.fillStyle = "#7a4a1e"; c.fillRect(-2.2 * s, 1.4 * s, 4.4 * s, 0.55 * s);                // 縄ベルト
    c.fillStyle = "#9a6330"; c.fillRect(-2.2 * s, 1.4 * s, 4.4 * s, 0.2 * s);
    eo(c, 0.5, 1.85, 0.4, 0.5, "#6e4422", s); c.fillStyle = "#6e4422"; c.fillRect(0.3 * s, 2.0 * s, 0.3 * s, 1.3 * s);
  },
  // 2. 革の鎧
  leather_armor: (c, s) => {
    artTorso(c, s, { base: "#8a5a2e", shade: "#5f3c1c", light: "#a87340", pauldron: true, paulCol: "#7a4a1e", neck: "#3a2410" });
    c.save(); torsoPath(c, s); c.clip();
    c.strokeStyle = "#5f3c1c"; c.lineWidth = 0.5 * s; c.beginPath(); c.moveTo(-2 * s, -1.5 * s); c.lineTo(1.8 * s, 1.3 * s); c.stroke();
    c.restore();
    c.fillStyle = "#9aa0ac"; c.fillRect(-0.4 * s, -0.45 * s, 0.85 * s, 0.7 * s); c.fillStyle = OUTLINE; c.fillRect(-0.2 * s, -0.25 * s, 0.4 * s, 0.3 * s);
    c.fillStyle = "#5f3c1c"; c.fillRect(-2.3 * s, 1.5 * s, 4.6 * s, 0.7 * s);                 // ベルト
    c.fillStyle = "#cdd2de"; c.fillRect(-0.45 * s, 1.45 * s, 0.9 * s, 0.8 * s); c.fillStyle = OUTLINE; c.fillRect(-0.25 * s, 1.6 * s, 0.5 * s, 0.5 * s);
  },
  // 3. 木の盾
  wood_shield: (c, s) => {
    const sp = (g) => { c.beginPath(); c.moveTo((-2.6 - g) * s, (-3.4 - g) * s); c.lineTo((2.6 + g) * s, (-3.4 - g) * s); c.lineTo((2.8 + g) * s, 0.5 * s); c.quadraticCurveTo(2.4 * s, 3 * s, 0, (3.8 + g) * s); c.quadraticCurveTo(-2.4 * s, 3 * s, (-2.8 - g) * s, 0.5 * s); c.closePath(); };
    sp(0.3); c.fillStyle = OUTLINE; c.fill();
    sp(0); c.fillStyle = "#8a5a2e"; c.fill();
    c.save(); sp(0); c.clip();
    c.fillStyle = "#6e4422"; for (const px of [-1.6, -0.55, 0.55, 1.6]) c.fillRect(px * s, -4 * s, 0.12 * s, 9 * s);
    c.globalAlpha = 0.5; c.fillStyle = "#a87340"; c.fillRect(-2.2 * s, -3 * s, 0.7 * s, 7 * s); c.globalAlpha = 1;
    c.restore();
    c.lineWidth = 0.5 * s; c.strokeStyle = "#9aa0ac"; sp(0); c.stroke();
    c.lineWidth = 0.18 * s; c.strokeStyle = "#cdd2de"; sp(-0.15); c.stroke();
    eo(c, 0, 0, 0.85, 0.85, OUTLINE, s); eo(c, 0, 0, 0.65, 0.65, "#9aa0ac", s); eo(c, -0.2, -0.2, 0.3, 0.3, "#cdd2de", s);
  },
  // 4. 鉄の鎧
  iron_armor: (c, s) => {
    artTorso(c, s, { base: "#9aa0b0", shade: "#6a7080", light: "#dde2ee", pauldron: true, paulCol: "#aab0c0", neck: "#2a2e3a" });
    c.save(); torsoPath(c, s); c.clip();
    c.globalAlpha = 0.5; c.fillStyle = "#dde2ee"; c.fillRect(-0.3 * s, -1.4 * s, 0.6 * s, 3.6 * s); c.globalAlpha = 1;
    c.fillStyle = "#5f3c1c"; c.fillRect(-2.4 * s, 1.4 * s, 4.8 * s, 0.4 * s);
    c.restore();
  },
  // 5. 森のローブ（フード付きマント）
  green_cloak: (c, s) => {
    cloakBody(c, s); c.fillStyle = "#3f8d43"; c.fill(); c.lineWidth = Math.max(1, 0.5 * s); c.strokeStyle = OUTLINE; c.lineJoin = "round"; c.stroke();
    c.save(); cloakBody(c, s); c.clip();
    c.fillStyle = "#2f6d33"; c.fillRect(0, -4 * s, 4 * s, 9 * s);
    c.strokeStyle = "#2a5e2c"; c.lineWidth = 0.22 * s; for (const fx of [-1.4, -0.4, 0.7, 1.6]) { c.beginPath(); c.moveTo(fx * s, -1 * s); c.lineTo(fx * 1.3 * s, 4 * s); c.stroke(); }
    c.globalAlpha = 0.5; c.fillStyle = "#57a85a"; c.fillRect(-1.7 * s, -1 * s, 0.7 * s, 4.5 * s); c.globalAlpha = 1;
    c.restore();
    c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(0, -2.6 * s, 1.95 * s, 1.55 * s, 0, Math.PI, 0); c.fill();
    c.fillStyle = "#3f8d43"; c.beginPath(); c.ellipse(0, -2.6 * s, 1.8 * s, 1.4 * s, 0, Math.PI, 0); c.fill();
    c.fillStyle = "#1f3a20"; c.beginPath(); c.ellipse(0, -2.5 * s, 1.1 * s, 0.95 * s, 0, Math.PI, 0); c.fill();
    eo(c, 0, -1.3, 0.55, 0.45, "#e8b830", s); eo(c, 0, -1.3, 0.28, 0.28, "#2aa84a", s); eo(c, -0.08, -1.4, 0.1, 0.1, "#bfffcf", s);
  },
  // 6. 騎士の鎧（銀＋金トリム＋紋章）
  knight_plate: (c, s) => artTorso(c, s, { base: "#c2c8d6", shade: "#8a90a0", light: "#ffffff", pauldron: true, paulCol: "#cdd2de", trim: "#e8b830", emblem: true, neck: "#2a2e3a" }),
  // 7. 黄金の大鎧（黒＋金＋青石）
  golden_plate: (c, s) => {
    artTorso(c, s, { base: "#3a3d4e", shade: "#23262f", light: "#5a5d70", pauldron: true, paulCol: "#3a3d4e", trim: "#e8b830", gem: "#2a6bd6", neck: "#15161e" });
    c.strokeStyle = "#e8b830"; c.lineWidth = 0.22 * s;
    c.beginPath(); c.moveTo(-1.6 * s, 0.9 * s); c.quadraticCurveTo(-2.3 * s, 0.2 * s, -1.5 * s, -0.4 * s); c.stroke();
    c.beginPath(); c.moveTo(1.6 * s, 0.9 * s); c.quadraticCurveTo(2.3 * s, 0.2 * s, 1.5 * s, -0.4 * s); c.stroke();
  },
  // 8. 王者のマント（紫＋毛皮＋金）
  royal_cloak: (c, s) => {
    cloakBody(c, s); c.fillStyle = "#6a2f9a"; c.fill(); c.lineWidth = Math.max(1, 0.5 * s); c.strokeStyle = OUTLINE; c.lineJoin = "round"; c.stroke();
    c.save(); cloakBody(c, s); c.clip();
    c.fillStyle = "#4e2173"; c.fillRect(0, -4 * s, 4 * s, 9 * s);
    c.fillStyle = "#e8b830"; c.fillRect(-0.55 * s, -1.4 * s, 0.28 * s, 5 * s); c.fillRect(0.27 * s, -1.4 * s, 0.28 * s, 5 * s);
    c.globalAlpha = 0.5; c.fillStyle = "#8a4fc0"; c.fillRect(-1.7 * s, -1 * s, 0.7 * s, 4.5 * s); c.globalAlpha = 1;
    c.restore();
    c.fillStyle = OUTLINE; for (let i = -4; i <= 4; i++) { c.beginPath(); c.ellipse(i * 0.5 * s, -1.7 * s, 0.5 * s, 0.42 * s, 0, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = "#f0f0f0"; for (let i = -4; i <= 4; i++) { c.beginPath(); c.ellipse(i * 0.5 * s, -1.8 * s, 0.42 * s, 0.36 * s, 0, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = "#cfcfd6"; for (let i = -4; i <= 4; i++) { c.beginPath(); c.ellipse(i * 0.5 * s + 0.1 * s, -1.62 * s, 0.16 * s, 0.14 * s, 0, 0, Math.PI * 2); c.fill(); }
    eo(c, 0, -1.0, 0.5, 0.45, "#e8b830", s); eo(c, 0, -1.0, 0.28, 0.28, "#9a3fd0", s); eo(c, -0.08, -1.1, 0.1, 0.1, "#e0a0ff", s);
  },
  // 9. 魔王の鎧（黒＋紫炎＋赤石＋棘）
  demon_armor: (c, s) => {
    c.fillStyle = "rgba(150,60,210,0.5)";
    for (const f of [[-3, -2, 0.9], [3, -2, 0.9], [-2.4, 1, 0.7], [2.4, 1, 0.7], [0, -3.4, 0.8], [-3.4, 0.6, 0.6], [3.4, 0.6, 0.6]]) { c.beginPath(); c.arc(f[0] * s, f[1] * s, f[2] * s, 0, Math.PI * 2); c.fill(); }
    // 棘（肩の後ろ）
    for (const sx of [-1, 1]) { c.fillStyle = OUTLINE; poly(c, s, [[sx * 2.9 - 0.9 * sx, -2.6], [sx * 4.4, -4.0], [sx * 2.9 + 0.3 * sx, -2.9]]); c.fill(); c.fillStyle = "#3a2f48"; poly(c, s, [[sx * 2.9 - 0.8 * sx, -2.7], [sx * 4.0, -3.8], [sx * 2.9 + 0.2 * sx, -3.0]]); c.fill(); }
    artTorso(c, s, { base: "#241c2e", shade: "#15101c", light: "#3e3450", pauldron: true, paulCol: "#241c2e", gem: "#c01818", neck: "#0c0810" });
    c.save(); torsoPath(c, s); c.clip(); c.strokeStyle = "#7a3fae"; c.lineWidth = 0.2 * s;
    c.beginPath(); c.moveTo(-1.4 * s, -1 * s); c.lineTo(-1.0 * s, 2.4 * s); c.stroke();
    c.beginPath(); c.moveTo(1.4 * s, -1 * s); c.lineTo(1.0 * s, 2.4 * s); c.stroke();
    c.restore();
    for (const gx of [-2.8, 2.8]) { eo(c, gx, -2, 0.3, 0.3, "#c01818", s); eo(c, gx - 0.08, -2.1, 0.1, 0.1, "#ff6a6a", s); }
  },
};

// 防具を (cx,cy) 中心に描画
function drawArmorArt(c, id, cx, cy, s) {
  const fn = ARMOR_ART[id] || ARMOR_ART.leather_armor;
  c.save(); c.translate(cx, cy); fn(c, s); c.restore();
}

/* ---- アクセサリーのドット絵（アップロードのデザインを再現） ---- */
const ACCESSORY_ART = {
  // 翠玉のお守り（金の円メダル＋緑石＋紐）
  green_amulet: (c, s) => {
    c.strokeStyle = "#6e4422"; c.lineWidth = 0.45 * s; c.lineCap = "round";
    c.beginPath(); c.arc(-0.5 * s, -3.0 * s, 0.55 * s, 0, Math.PI * 2); c.arc(0.6 * s, -3.0 * s, 0.55 * s, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(0.3 * s, -2.6 * s); c.lineTo(0.7 * s, -1.7 * s); c.stroke();
    eo(c, 0, 0.2, 2.4, 2.4, OUTLINE, s); eo(c, 0, 0.2, 2.1, 2.1, "#e8b830", s); eo(c, 0, 0.2, 1.5, 1.5, "#8a6a18", s);
    c.strokeStyle = "#ffe07a"; c.lineWidth = 0.3 * s;
    c.beginPath(); c.arc(-0.6 * s, -0.2 * s, 0.7 * s, 0, Math.PI * 1.4); c.arc(0.6 * s, 0.6 * s, 0.7 * s, Math.PI, Math.PI * 2.4); c.stroke();
    eo(c, 0, 0.2, 0.75, 0.75, "#2aa84a", s); eo(c, 0, 0.2, 0.5, 0.5, "#5ee06a", s); eo(c, -0.18, 0.0, 0.18, 0.18, "#bfffcf", s);
  },
  // 業火のルビー指輪
  ruby_ring: (c, s) => {
    c.lineWidth = 1.1 * s; c.strokeStyle = OUTLINE; c.beginPath(); c.ellipse(0, 0.8 * s, 1.7 * s, 2.0 * s, 0, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 0.75 * s; c.strokeStyle = "#9aa0ac"; c.beginPath(); c.ellipse(0, 0.8 * s, 1.7 * s, 2.0 * s, 0, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 0.22 * s; c.strokeStyle = "#dde2ee"; c.beginPath(); c.ellipse(-0.3 * s, 0.6 * s, 1.6 * s, 1.9 * s, 0, Math.PI * 0.8, Math.PI * 1.5); c.stroke();
    eo(c, 0, -1.7, 1.0, 1.0, OUTLINE, s); eo(c, 0, -1.7, 0.8, 0.8, "#e8b830", s);
    eo(c, 0, -1.7, 0.55, 0.55, "#c01818", s); eo(c, -0.15, -1.85, 0.16, 0.16, "#ff8a8a", s);
  },
  // 蒼星の首飾り（金細工＋青石＋鎖）
  sapphire_necklace: (c, s) => {
    c.strokeStyle = "#aab0bc"; c.lineWidth = 0.3 * s;
    c.beginPath(); c.moveTo(-2.6 * s, -3.2 * s); c.quadraticCurveTo(-1.2 * s, -1.6 * s, 0, -0.7 * s);
    c.moveTo(2.6 * s, -3.2 * s); c.quadraticCurveTo(1.2 * s, -1.6 * s, 0, -0.7 * s); c.stroke();
    poly(c, s, [[0, -1.4], [1.6, 0.4], [0, 2.6], [-1.6, 0.4]]); c.fillStyle = OUTLINE; c.fill();
    poly(c, s, [[0, -1.0], [1.3, 0.5], [0, 2.2], [-1.3, 0.5]]); c.fillStyle = "#e8b830"; c.fill();
    eo(c, 0, 0.6, 0.95, 1.1, "#1f6fd0", s); eo(c, 0, 0.6, 0.6, 0.75, "#5ea8ff", s); eo(c, -0.2, 0.3, 0.2, 0.2, "#dff0ff", s);
    eo(c, 0, 2.9, 0.45, 0.6, OUTLINE, s); eo(c, 0, 2.9, 0.3, 0.42, "#2a6bd6", s);   // 下の雫
  },
  // 魔牙の護符（黒牙＋緑石＋金フック）
  fang_pendant: (c, s) => {
    c.strokeStyle = "#e8b830"; c.lineWidth = 0.5 * s; c.lineCap = "round";
    c.beginPath(); c.arc(0.3 * s, -2.6 * s, 0.9 * s, Math.PI * 0.15, Math.PI * 1.5); c.stroke();
    c.fillStyle = OUTLINE; poly(c, s, [[-0.3, -1.6], [1.1, -1.4], [-0.4, 2.8], [-1.2, -0.6]]); c.fill();
    c.fillStyle = "#2a2a32"; poly(c, s, [[-0.2, -1.3], [0.8, -1.2], [-0.4, 2.4], [-0.95, -0.5]]); c.fill();
    c.fillStyle = "#54545f"; poly(c, s, [[-0.1, -1.1], [0.4, -1.0], [-0.35, 1.8]]); c.fill();
    poly(c, s, [[-0.2, -1.7], [0.9, -1.6], [0.7, -0.5], [-0.4, -0.6]]); c.fillStyle = "#e8b830"; c.fill();
    eo(c, 0.25, -1.1, 0.42, 0.42, "#2aa84a", s); eo(c, 0.12, -1.25, 0.14, 0.14, "#bfffcf", s);
  },
  // 獣王の牙（白牙＋金＋赤石＋角）
  beast_fang: (c, s) => {
    c.strokeStyle = "#6e4422"; c.lineWidth = 0.5 * s; c.lineCap = "round";
    c.beginPath(); c.moveTo(-0.8 * s, -1.4 * s); c.quadraticCurveTo(-2.0 * s, -2.6 * s, -1.4 * s, -4.2 * s); c.stroke();
    c.beginPath(); c.moveTo(0.8 * s, -1.4 * s); c.quadraticCurveTo(2.0 * s, -2.6 * s, 1.4 * s, -4.2 * s); c.stroke();
    c.fillStyle = OUTLINE; poly(c, s, [[-1.3, -1.6], [1.3, -1.6], [-0.2, 3.0]]); c.fill();
    c.fillStyle = "#e8dfc4"; poly(c, s, [[-1.05, -1.35], [1.05, -1.35], [-0.2, 2.6]]); c.fill();
    c.fillStyle = "#fffaf0"; poly(c, s, [[-0.7, -1.2], [0.1, -1.2], [-0.25, 1.8]]); c.fill();
    poly(c, s, [[-1.2, -1.7], [1.2, -1.7], [0.9, -0.4], [-0.9, -0.4]]); c.fillStyle = "#e8b830"; c.fill();
    c.strokeStyle = "#a87a10"; c.lineWidth = 0.18 * s; c.beginPath(); c.moveTo(-0.9 * s, -1.0 * s); c.lineTo(0.9 * s, -1.0 * s); c.stroke();
    eo(c, 0, -1.0, 0.4, 0.5, "#c01818", s); eo(c, -0.12, -1.2, 0.14, 0.14, "#ff8a8a", s);
  },
  // 聖光の星輪（銀金の指輪＋青星石）
  star_ring: (c, s) => {
    c.lineWidth = 1.0 * s; c.strokeStyle = OUTLINE; c.beginPath(); c.ellipse(0, 1.0 * s, 1.7 * s, 1.9 * s, 0, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 0.7 * s; c.strokeStyle = "#cdd2de"; c.beginPath(); c.ellipse(0, 1.0 * s, 1.7 * s, 1.9 * s, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "#ffe07a"; c.lineWidth = 0.5 * s; for (let a = 0; a < 6; a++) { const an = a / 6 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(an) * 2.6 * s, -1.6 * s + Math.sin(an) * 0.4 * s); c.lineTo(Math.cos(an) * 3.2 * s, -1.6 * s + Math.sin(an) * 0.5 * s); c.stroke(); } // きらめき
    const star = (rO, rI, fill) => { c.beginPath(); for (let k = 0; k < 12; k++) { const r = k % 2 ? rI : rO, an = -Math.PI / 2 + k * Math.PI / 6; const x = Math.cos(an) * r * s, y = -1.6 * s + Math.sin(an) * r * s; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.fillStyle = fill; c.fill(); };
    star(2.0, 0.9, "#e8b830"); star(1.6, 0.7, "#2a6bd6"); star(1.2, 0.45, "#bcd6ff");
    eo(c, 0, -1.6, 0.3, 0.3, "#ffffff", s);
  },
  // 冥府の紋章（黒銀メダル＋ドクロ＋紫炎）
  skull_medallion: (c, s) => {
    c.fillStyle = "rgba(150,60,210,0.5)";
    for (const f of [[-2.4, -1.6, 0.8], [2.4, -1.6, 0.8], [-2.6, 1, 0.7], [2.6, 1, 0.7], [0, -2.8, 0.8], [0, 2.6, 0.7]]) { c.beginPath(); c.arc(f[0] * s, f[1] * s, f[2] * s, 0, Math.PI * 2); c.fill(); }
    eo(c, 0, 0, 2.4, 2.4, OUTLINE, s); eo(c, 0, 0, 2.15, 2.15, "#6a6f7e", s); eo(c, 0, 0, 1.75, 1.75, "#3a3f4a", s);
    c.strokeStyle = "#aab0bc"; c.lineWidth = 0.18 * s; c.beginPath(); c.arc(0, 0, 1.9 * s, 0, Math.PI * 2); c.stroke();
    // ドクロ
    eo(c, 0, -0.3, 0.9, 0.85, "#cdd2de", s);
    c.fillStyle = "#cdd2de"; c.fillRect(-0.55 * s, 0.2 * s, 1.1 * s, 0.5 * s);
    eo(c, -0.38, -0.35, 0.26, 0.3, "#23262f", s); eo(c, 0.38, -0.35, 0.26, 0.3, "#23262f", s);
    c.fillStyle = "#23262f"; poly(c, s, [[0, -0.15], [-0.16, 0.2], [0.16, 0.2]]); c.fill();
    for (let i = -1; i <= 1; i++) c.fillRect((i * 0.28 - 0.07) * s, 0.45 * s, 0.14 * s, 0.32 * s);
  },
};
function drawAccessoryArt(c, id, cx, cy, s) {
  const fn = ACCESSORY_ART[id] || ACCESSORY_ART.ruby_ring;
  c.save(); c.translate(cx, cy); fn(c, s); c.restore();
}

/* ---- 消費アイテムのドット絵 ---- */
// 丸底フラスコ（コルク栓＋液体）
function drawFlask(c, cx, cy, s, col, colHi, opt) {
  opt = opt || {};
  const b = (x, y, w, h, cl) => { c.fillStyle = cl; c.fillRect(cx + x * s, cy + y * s, w * s, h * s); };
  // コルク
  b(-1.2, -5.3, 2.4, 1.7, OUTLINE); b(-1.0, -5.1, 2.0, 1.3, "#b07a3a"); b(-1.0, -5.1, 2.0, 0.45, "#cf9a52"); b(-0.9, -4.1, 1.8, 0.4, "#7a4a1e");
  // 首
  b(-1.15, -4.0, 2.3, 1.5, OUTLINE); b(-1.0, -3.9, 2.0, 1.3, "#c6d0dc");
  b(-1.0, -3.9, 0.5, 1.3, "#eef4fa");
  // 本体ガラス
  c.fillStyle = OUTLINE; c.beginPath(); c.arc(cx, cy + 0.7 * s, 3.5 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#dfe8f2"; c.beginPath(); c.arc(cx, cy + 0.7 * s, 3.15 * s, 0, Math.PI * 2); c.fill();
  // 液体
  c.save(); c.beginPath(); c.arc(cx, cy + 0.7 * s, 2.75 * s, 0, Math.PI * 2); c.clip();
  c.fillStyle = col; c.fillRect(cx - 3 * s, cy - 1.3 * s, 6 * s, 5.5 * s);
  c.fillStyle = colHi; c.fillRect(cx - 3 * s, cy - 1.3 * s, 6 * s, 0.7 * s);
  c.fillStyle = "rgba(255,255,255,0.3)"; c.beginPath(); c.arc(cx + 1.3 * s, cy + 1.4 * s, 0.4 * s, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(cx - 0.6 * s, cy + 2 * s, 0.28 * s, 0, Math.PI * 2); c.fill();
  if (opt.emblem) opt.emblem(c, cx, cy + 0.7 * s, s);
  c.restore();
  // ガラスの光沢
  c.fillStyle = "rgba(255,255,255,0.7)"; c.beginPath(); c.arc(cx - 1.4 * s, cy - 0.3 * s, 0.5 * s, 0, Math.PI * 2); c.fill();
  b(-1.7, -0.8, 0.5, 2.4, "rgba(255,255,255,0.4)");
  if (opt.gold) { c.strokeStyle = "#e8b830"; c.lineWidth = 0.35 * s; c.beginPath(); c.arc(cx, cy + 0.7 * s, 2.5 * s, Math.PI * 0.12, Math.PI * 0.88); c.stroke(); }
}
function emShield(c, x, y, s) { c.fillStyle = "#cdd2de"; c.beginPath(); c.moveTo(x - 0.9 * s, y - 0.9 * s); c.lineTo(x + 0.9 * s, y - 0.9 * s); c.lineTo(x + 0.9 * s, y + 0.2 * s); c.lineTo(x, y + 1.1 * s); c.lineTo(x - 0.9 * s, y + 0.2 * s); c.closePath(); c.fill(); c.fillStyle = "#3a6bd6"; c.beginPath(); c.moveTo(x - 0.5 * s, y - 0.55 * s); c.lineTo(x + 0.5 * s, y - 0.55 * s); c.lineTo(x, y + 0.55 * s); c.closePath(); c.fill(); }
function emClover(c, x, y, s) { c.fillStyle = "#2f8f3a"; for (const a of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) { c.beginPath(); c.arc(x + a[0] * s, y + a[1] * s, 0.5 * s, 0, Math.PI * 2); c.fill(); } c.fillStyle = "#5ee06a"; c.beginPath(); c.arc(x - 0.2 * s, y - 0.2 * s, 0.35 * s, 0, Math.PI * 2); c.fill(); }
function emFlame(c, x, y, s) { c.fillStyle = "#ffce47"; c.beginPath(); c.moveTo(x, y - 1.1 * s); c.quadraticCurveTo(x + 0.9 * s, y, x + 0.2 * s, y + 0.9 * s); c.quadraticCurveTo(x - 0.9 * s, y + 0.3 * s, x, y - 1.1 * s); c.fill(); c.fillStyle = "#ff7a2a"; c.beginPath(); c.arc(x, y + 0.2 * s, 0.45 * s, 0, Math.PI * 2); c.fill(); }
function emGem(c, x, y, s, col) { c.fillStyle = "#e8b830"; c.beginPath(); c.moveTo(x, y - 1.0 * s); c.lineTo(x + 0.7 * s, y); c.lineTo(x, y + 1.0 * s); c.lineTo(x - 0.7 * s, y); c.closePath(); c.fill(); c.fillStyle = col; c.beginPath(); c.moveTo(x, y - 0.6 * s); c.lineTo(x + 0.4 * s, y); c.lineTo(x, y + 0.6 * s); c.lineTo(x - 0.4 * s, y); c.closePath(); c.fill(); }

const CONSUMABLE_ART = {
  potion:      (c, x, y, s) => drawFlask(c, x, y, s, "#e23a3a", "#ff8a8a"),
  hi_potion:   (c, x, y, s) => drawFlask(c, x, y, s, "#d81f4a", "#ff6a9a", { gold: true, emblem: (c, ex, ey, es) => emGem(c, ex, ey, es, "#ff4a6a") }),
  herb:        (c, x, y, s) => {
    // 束ねた葉
    const leaf = (ang, len, col) => { c.save(); c.translate(x, y + 0.6 * s); c.rotate(ang); c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(0, -len * s, 0.85 * s, len * s, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = col; c.beginPath(); c.ellipse(0, -len * s, 0.6 * s, (len - 0.2) * s, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = "#7ad06a"; c.fillRect(-0.08 * s, -2 * len * s + 0.4 * s, 0.16 * s, (len * 1.4) * s); c.restore(); };
    leaf(-0.5, 2.2, "#2f8f3a"); leaf(0.5, 2.2, "#2f8f3a"); leaf(0, 2.7, "#3fa34a"); leaf(-0.95, 1.8, "#4faa56"); leaf(0.95, 1.8, "#4faa56");
    // 結び目
    c.fillStyle = "#7a4a1e"; c.fillRect(x - 1.0 * s, y + 2.2 * s, 2.0 * s, 0.8 * s); c.fillStyle = "#9a6330"; c.fillRect(x - 1.0 * s, y + 2.2 * s, 2.0 * s, 0.3 * s);
  },
  str_potion:  (c, x, y, s) => drawFlask(c, x, y, s, "#ff5a1e", "#ffb060", { emblem: emFlame }),
  def_potion:  (c, x, y, s) => drawFlask(c, x, y, s, "#2a6bd6", "#7ab0ff", { emblem: emShield }),
  life_potion: (c, x, y, s) => drawFlask(c, x, y, s, "#3fbf52", "#8fe89a", { gold: true, emblem: emClover }),
  scroll:      (c, x, y, s) => {
    c.save(); c.translate(x, y); c.rotate(-0.35);
    c.fillStyle = OUTLINE; c.fillRect(-4.2 * s, -1.6 * s, 8.4 * s, 3.2 * s);
    c.fillStyle = "#e8d9a8"; c.fillRect(-4.0 * s, -1.4 * s, 8.0 * s, 2.8 * s);
    c.fillStyle = "#cbb87e"; c.fillRect(-4.0 * s, 0.4 * s, 8.0 * s, 1.0 * s);
    // 巻き（左右）
    for (const ex of [-4.0, 3.0]) { c.fillStyle = OUTLINE; c.beginPath(); c.arc(ex * s + 0.5 * s, 0, 1.7 * s, 0, Math.PI * 2); c.fill(); c.fillStyle = "#cbb87e"; c.beginPath(); c.arc(ex * s + 0.5 * s, 0, 1.45 * s, 0, Math.PI * 2); c.fill(); c.fillStyle = "#9a854e"; c.beginPath(); c.arc(ex * s + 0.5 * s, 0, 0.6 * s, 0, Math.PI * 2); c.fill(); }
    c.restore();
    // 青い封蝋＋リボン
    c.fillStyle = "#1f4fb0"; c.beginPath(); c.arc(x + 0.4 * s, y + 0.6 * s, 1.3 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#3a6bd6"; c.beginPath(); c.arc(x + 0.4 * s, y + 0.6 * s, 1.0 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#bcd6ff"; c.beginPath(); c.arc(x + 0.1 * s, y + 0.3 * s, 0.3 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#1f4fb0"; c.fillRect(x - 0.3 * s, y + 1.6 * s, 0.6 * s, 1.6 * s); c.fillRect(x + 0.5 * s, y + 1.6 * s, 0.6 * s, 1.4 * s);
  },
  feather:     (c, x, y, s) => {
    c.save(); c.translate(x, y); c.rotate(0.5);
    c.fillStyle = "rgba(120,180,255,0.25)"; c.beginPath(); c.ellipse(0, -0.5 * s, 2.2 * s, 4.4 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#2a3a8a"; c.beginPath(); c.ellipse(0, -0.8 * s, 1.7 * s, 4.0 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#dfe8ff"; c.beginPath(); c.ellipse(0, -0.8 * s, 1.45 * s, 3.7 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#a8c4ff"; c.beginPath(); c.ellipse(0.5 * s, -0.5 * s, 0.7 * s, 3.2 * s, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#7a9ae0"; c.lineWidth = 0.18 * s; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(0, (i * 0.9 - 0.8) * s); c.lineTo(1.2 * s, (i * 0.9 - 1.4) * s); c.stroke(); c.beginPath(); c.moveTo(0, (i * 0.9 - 0.8) * s); c.lineTo(-1.2 * s, (i * 0.9 - 1.4) * s); c.stroke(); }
    c.strokeStyle = "#3a5ac0"; c.lineWidth = 0.22 * s; c.beginPath(); c.moveTo(0, -4.4 * s); c.lineTo(-0.5 * s, 3.6 * s); c.stroke();
    // 金の軸先＋青ビーズ
    c.fillStyle = "#e8b830"; c.fillRect(-0.7 * s, 3.2 * s, 1.0 * s, 1.4 * s);
    c.fillStyle = "#3a8aff"; c.beginPath(); c.arc(-0.2 * s, 3.4 * s, 0.45 * s, 0, Math.PI * 2); c.fill();
    c.restore();
    // きらめき
    c.fillStyle = "#cfe4ff"; c.fillRect(x - 3 * s, y - 1.5 * s, 0.4 * s, 0.4 * s); c.fillRect(x + 2.4 * s, y - 2.8 * s, 0.35 * s, 0.35 * s);
  },
};
CONSUMABLE_ART.antidote = CONSUMABLE_ART.herb;          // 毒消し草＝薬草の見た目
CONSUMABLE_ART.luck_potion = CONSUMABLE_ART.life_potion; // 幸運の薬＝四つ葉の薬の見た目
function drawConsumableArt(c, id, cx, cy, s) { const fn = CONSUMABLE_ART[id] || CONSUMABLE_ART.potion; fn(c, cx, cy, s); }

// 古びた青銅の鍵（宝物庫のカギ）
function drawBronzeKey(c, cx, cy, s) {
  c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 5);
  c.fillStyle = "rgba(232,184,48,0.16)"; c.beginPath(); c.arc(0, 0, 3.6 * s, 0, Math.PI * 2); c.fill();
  c.lineWidth = 1.1 * s; c.strokeStyle = OUTLINE; c.beginPath(); c.arc(-1.9 * s, 0, 1.6 * s, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 0.7 * s; c.strokeStyle = "#9a6e20"; c.beginPath(); c.arc(-1.9 * s, 0, 1.6 * s, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 0.3 * s; c.strokeStyle = "#e8b860"; c.beginPath(); c.arc(-2.2 * s, -0.4 * s, 1.5 * s, Math.PI * 0.8, Math.PI * 1.6); c.stroke();
  const b = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * s, y * s, w * s, h * s); };
  b(-0.3, -0.55, 3.6, 1.1, OUTLINE); b(-0.2, -0.4, 3.4, 0.8, "#a8761e"); b(-0.2, -0.4, 3.4, 0.28, "#e8b860");
  b(2.7, 0.3, 0.7, 1.3, OUTLINE); b(2.8, 0.4, 0.5, 1.1, "#a8761e");
  b(1.9, 0.3, 0.6, 1.0, OUTLINE); b(2.0, 0.4, 0.4, 0.8, "#a8761e");
  c.restore();
}

function drawHero(p, camX, camY) {
  const v = inView(p.fx, p.fy, camX, camY); if (!v) return;
  const { px, py } = v, cx = px + 16;
  // 足元の明るいハイライト（見やすく）
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  warmGlow(ctx, cx, py + 20, 22, 0.55, "rgba(255,236,180,");
  ctx.restore();
  const dirSprite = HERO_DIR[p.dir || "down"];   // 進行方向ごとの画像
  const heroImg = (dirSprite && dirSprite.ready) ? dirSprite : HERO_IMG;
  if (heroImg && heroImg.ready) {                // 画像の主人公（明るく補正）
    const sz = TILE * 1.42;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.filter = "brightness(1.45) saturate(1.12) contrast(1.04)";
    ctx.drawImage(heroImg.img, Math.round(cx - sz / 2), Math.round(py + TILE - sz + 5), Math.round(sz), Math.round(sz));
    ctx.filter = "none";
    ctx.restore();
    return;
  }
  rect(ctx, px + 2, py + 2, TILE - 4, TILE - 4, "rgba(255,206,71,0.10)");
  rect(ctx, cx - 6, py + 16, 12, 12, "#3a5fc0");
  ell(ctx, cx, py + 12, 6, 6, "#f0c89a");
  rect(ctx, cx - 7, py + 5, 14, 5, "#ffce47"); rect(ctx, cx - 7, py + 9, 14, 2, "#caa017");
  rect(ctx, cx - 3, py + 12, 2, 2, "#111"); rect(ctx, cx + 1, py + 12, 2, 2, "#111");
  rect(ctx, cx + 7, py + 8, 2, 16, "#cfd2f0"); rect(ctx, cx + 5, py + 18, 6, 2, "#9a7b4f");
}

// 行商人をマップに描画
function drawMerchant(m, camX, camY) {
  const v = inView(m.x, m.y, camX, camY); if (!v) return;
  const { px, py } = v;
  ctx.fillStyle = "rgba(255,206,71,0.14)"; ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
  const sz = TILE * 1.4;
  if (MERCHANT_IMG && MERCHANT_IMG.ready) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(MERCHANT_IMG.img, Math.round(px + 16 - sz / 2), Math.round(py + TILE - sz + 5), Math.round(sz), Math.round(sz));
  } else { rect(ctx, px + 8, py + 6, 16, 22, "#3a5f8a"); ell(ctx, px + 16, py + 10, 6, 6, "#caa07a"); }
  // 金貨マーク
  ctx.fillStyle = "#ffce47"; ctx.beginPath(); ctx.arc(px + 26, py + 7, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8a6a10"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", px + 26, py + 7);
}
// ショップ画面用に行商人を描画
function drawMerchantArt(c, cx, cy, box) {
  if (MERCHANT_IMG && MERCHANT_IMG.ready) { const sz = box * 0.94; c.imageSmoothingEnabled = true; c.drawImage(MERCHANT_IMG.img, cx - sz / 2, cy - sz / 2, sz, sz); }
  else { c.fillStyle = "#3a5f8a"; c.fillRect(cx - box * 0.25, cy - box * 0.3, box * 0.5, box * 0.6); c.fillStyle = "#caa07a"; c.beginPath(); c.arc(cx, cy - box * 0.22, box * 0.16, 0, Math.PI * 2); c.fill(); }
}

/* ===========================================================
 * 9. プレイヤー・探索
 * =========================================================== */
function createPlayer() {
  return {
    x: 0, y: 0, fx: 0, fy: 0, dir: "down", baseMaxHp: 30, maxHp: 30, hp: 30, baseAtk: 4, baseDef: 1,
    level: 1, exp: 0, nextExp: 20, gold: 0, potions: 0, poison: 0, buffs: {},
    weapon: null, shield: null, accessories: [], inventory: [], bag: {}, floor: 1,
  };
}
function bagCount(p, id) { return (p.bag && p.bag[id]) || 0; }
function addBag(p, id, n) { p.bag = p.bag || {}; p.bag[id] = (p.bag[id] || 0) + (n || 1); }
function removeBag(p, id, n) { if (!p.bag || !p.bag[id]) return; p.bag[id] -= (n || 1); if (p.bag[id] <= 0) delete p.bag[id]; }
const ACC_MAX = 3;                                  // 装飾の装備枠は3つ
function accList(p) { return p.accessories || (p.accessories = []); }
function buffVal(p, key) { return (p.buffs && p.buffs[key]) || 0; }
// 装備（武器・防具・装飾3枠）合計のステータス
function gearSum(p, key) {
  let v = 0;
  if (p.weapon) v += (p.weapon[key] || 0);
  if (p.shield) v += (p.shield[key] || 0);
  for (const ac of accList(p)) v += (ac[key] || 0);
  return v;
}
function getAtk(p) { return Math.max(1, p.baseAtk + gearSum(p, "atk") + buffVal(p, "atk")); }
function getDef(p) { return Math.max(0, p.baseDef + gearSum(p, "def") + buffVal(p, "def")); }
function getCrit(p) { return clamp(BASE_CRIT + gearSum(p, "crit"), 0, 75); }       // 会心率%
function getEvade(p) { return clamp(gearSum(p, "evade") + buffVal(p, "evade"), 0, 60); } // 回避率%
function getLuck(p) { return Math.max(0, gearSum(p, "luck") + buffVal(p, "luck")); }     // 幸運値
function getXpMult(p) { return 1 + gearSum(p, "xp") / 100 + buffVal(p, "xp"); }          // XP倍率
// 装備のHP補正を反映した実効・最大HP
function recalcMaxHp(p) { p.maxHp = Math.max(1, p.baseMaxHp + gearSum(p, "hp")); if (p.hp > p.maxHp) p.hp = p.maxHp; }
// 装備スロット名と強さ評価
function slotOf(item) { return item.type === "weapon" ? "weapon" : item.type === "accessory" ? "accessory" : "shield"; }
function powerOf(item) { return (item.atk || 0) * 2 + (item.def || 0) * 2 + (item.crit || 0) * 0.4 + (item.luck || 0) + (item.hp || 0) * 0.2 + (item.evade || 0) * 0.3; }
function statText(item) {
  const parts = [];
  const sg = (n) => (n > 0 ? "+" + n : "" + n);
  if (item.atk) parts.push("ATK" + sg(item.atk));
  if (item.def) parts.push("DEF" + sg(item.def));
  if (item.crit) parts.push("会心" + sg(item.crit) + "%");
  if (item.evade) parts.push("回避" + sg(item.evade) + "%");
  if (item.luck) parts.push("幸運" + sg(item.luck));
  if (item.hp) parts.push("HP" + sg(item.hp));
  if (item.xp) parts.push("XP+" + item.xp + "%");
  return parts.join(" ");
}

// 敵がそのマス(=次の目標タイル)を取れるか（self は自分自身、除外用）
function canEnemyMove(fd, x, y, self) {
  if (x < 1 || x >= MAP_W - 1 || y < 1 || y >= MAP_H - 1) return false;
  if (fd.map[y][x] === T.WALL) return false;
  if (game.player.x === x && game.player.y === y) return false;
  if (fd.guardian && !fd.guardian.defeated && fd.guardian.x === x && fd.guardian.y === y) return false;
  if (fd.merchant && fd.merchant.x === x && fd.merchant.y === y) return false;
  for (const e of fd.enemies) { if (e === self) continue; if (e.x === x && e.y === y) return false; }
  return true;
}

// 目標タイルに到達した敵が、次の一歩を決める。
// プレイヤーに踏み込む向きなら戦闘開始（'battle'）。
function decideEnemyStep(e, fd, p) {
  if (typeof e.dir !== "number") e.dir = rnd(4);
  const cooling = e.fleeUntil && Date.now() < e.fleeUntil;
  for (let a = 0; a < 4; a++) {
    const v = DIRV[e.dir], nx = e.x + v[0], ny = e.y + v[1];
    if (nx === p.x && ny === p.y) {
      if (cooling) { e.dir = rnd(4); continue; }   // 逃走直後は仕掛けてこない
      startBattle(e, {}); return "battle";
    }
    if (canEnemyMove(fd, nx, ny, e)) { e.x = nx; e.y = ny; if (rnd(10) === 0) e.dir = rnd(4); return "moved"; }
    e.dir = rnd(4);
  }
  return "stuck";
}

// リアルタイム更新：プレイヤーの行動と無関係に、毎フレーム敵を補間移動させる。
function updateEnemies(dt) {
  const fd = game.floorData, p = game.player;
  const step = ENEMY_SPEED * dt;
  for (const e of fd.enemies) {
    if (typeof e.fx !== "number") { e.fx = e.x; e.fy = e.y; }
    const dx = e.x - e.fx, dy = e.y - e.fy;
    if (Math.abs(dx) + Math.abs(dy) < 0.02) {
      e.fx = e.x; e.fy = e.y;
      if (decideEnemyStep(e, fd, p) === "battle") return;   // 戦闘開始
    } else {
      if (dx !== 0) e.fx += Math.sign(dx) * Math.min(step, Math.abs(dx));
      if (dy !== 0) e.fy += Math.sign(dy) * Math.min(step, Math.abs(dy));
    }
  }
}

// 極々たまにアイテムをドロップ（雑魚ほど弱い装備）
function rollDrop(e) {
  const luck = getLuck(game.player);
  const chance = BASE_DROP + Math.min(luck * 0.01, 0.10);   // 幸運でドロップ率+最大10%
  if (Math.random() >= chance) return;
  // 回復(ポーション)か装備か。幸運でレア(装備)寄りに最大+5%
  const rareBonus = Math.min(luck * 0.005, 0.05);
  if (Math.random() < 0.5 - rareBonus) {
    game.player.potions++;
    log(`${e.name}は ポーションを落とした！`, "good");
    floatGain("ポーション", "item");
  } else {
    let tier = (ENEMY_TIER[e.type] != null) ? ENEMY_TIER[e.type] : 0;
    if (Math.random() < rareBonus) tier += 1;              // 幸運で稀に1段上の装備
    const r = Math.random();
    let id;
    if (r < 0.4) id = WEAPON_DROPS[clamp(tier, 0, WEAPON_DROPS.length - 1)];
    else if (r < 0.75) id = SHIELD_DROPS[clamp(tier, 0, SHIELD_DROPS.length - 1)];
    else id = ACCESSORY_DROPS[clamp(tier, 0, ACCESSORY_DROPS.length - 1)];   // アクセサリー
    log(`${e.name}は ${EQUIP[id].name}を落とした！`, "good");
    pickupEquip(id);
  }
}

function tryMove(dx, dy) {
  if (!game || game.over || game.mode !== "explore" || game.busy) return;
  const p = game.player, fd = game.floorData;
  // 進行方向で見た目を更新（壁にぶつかっても向きは変える）
  if (dx > 0) p.dir = "right"; else if (dx < 0) p.dir = "left";
  else if (dy > 0) p.dir = "down"; else if (dy < 0) p.dir = "up";
  const nx = p.x + dx, ny = p.y + dy;
  if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return;

  // 鍵のかかった宝物庫の扉
  if (fd.vault && !fd.vault.opened && nx === fd.vault.doorX && ny === fd.vault.doorY) {
    if (fd.hasKey) { fd.vault.opened = true; SFX.stairs(); log("宝物庫のカギで 扉を開けた！", "gold"); }
    else { log("宝物庫の扉は施錠されている。カギを探そう", "sys"); draw(); return; }
  }

  // 行商人に接触 → ショップ（戦闘ではない）
  if (fd.merchant && nx === fd.merchant.x && ny === fd.merchant.y) { draw(); openShop(); return; }

  // シンボルの敵に接触 → 戦闘（逃走クールダウン中の敵はすり抜ける）
  const now = Date.now();
  const enemy = fd.enemies.find(e => !(e.fleeUntil && now < e.fleeUntil) &&
    ((e.x === nx && e.y === ny) || (Math.round(e.fx) === nx && Math.round(e.fy) === ny)));
  if (enemy) { draw(); startBattle(enemy, {}); return; }

  // 守護者 / ボス
  if (fd.guardian && !fd.guardian.defeated && nx === fd.guardian.x && ny === fd.guardian.y) {
    const rl = recLvOf(game.floor);
    if (p.level < rl) log(`推奨Lv${rl}未満… ${fd.guardian.name}は強大だ。勝ち目は薄い！`, "bad");
    draw();
    startBattle(fd.guardian, fd.guardian.isBoss ? { boss: true } : { guardian: true });
    return;
  }

  if (fd.map[ny][nx] === T.WALL) return;

  // 施錠された階段
  if (fd.stairs && nx === fd.stairs.x && ny === fd.stairs.y) {
    if (fd.stairsLocked) { log("階段は施錠されている。守護者を倒してカギを取れ！", "sys"); draw(); return; }
    p.x = nx; p.y = ny; descend(); return;
  }

  p.x = nx; p.y = ny;

  // 鍵
  if (fd.key && !fd.key.taken && nx === fd.key.x && ny === fd.key.y) {
    fd.key.taken = true; fd.hasKey = true; SFX.item(); log("宝物庫のカギを 手に入れた！", "gold");
  }
  // 金の宝箱
  if (fd.vault && !fd.vault.taken && nx === fd.vault.chestX && ny === fd.vault.chestY) openVaultChest();
  // ランドマーク
  const lm = fd.landmarks.find(l => !l.used && l.x === nx && l.y === ny);
  if (lm) triggerLandmark(lm);
  // 通常アイテム
  pickupItem(nx, ny);

  // 毒の継続ダメージ（探索中も歩くたびに進行）
  if (p.poison > 0) {
    p.hp -= 1; p.poison--;
    if (p.hp <= 0) { p.hp = 0; draw(); updateUI(); gameOver(); return; }
    if (p.poison === 0) log("毒が 抜けた", "sys");
  }

  // 敵はリアルタイムループで独立に動くので、ここでは敵を動かさない
  draw(); updateUI();
}

function waitTurn() {
  if (!game || game.over || game.mode !== "explore") return;
  game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1);
  updateUI();
}

function openVaultChest() {
  const fd = game.floorData;
  fd.vault.taken = true; SFX.levelup();
  log("宝物庫の宝箱を 開けた！ 豪華な中身だ！", "gold");
  pickupEquip(pickWeaponForFloor(Math.min(MAX_FLOOR, game.floor + 1)));
  pickupEquip(pickShieldForFloor(Math.min(MAX_FLOOR, game.floor + 1)));
  pickupEquip(pickAccessoryForFloor(Math.min(MAX_FLOOR, game.floor + 1)));
  const g = rndRange(50, 90) + game.floor * 6;
  game.player.gold += g; log(`ゴールド +${g}`, "gold");
  game.player.potions += 1; log("ポーションを手に入れた", "good");
  const ci = choice(["hi_potion", "scroll", "luck_potion"]); addBag(game.player, ci); log(`${CONSUMABLES[ci].name}も 入っていた！`, "good");
  updateUI();
}

function triggerLandmark(lm) {
  lm.used = true; const p = game.player; SFX.item();
  switch (lm.type) {
    case "fountain": { const h = p.maxHp - p.hp; p.hp = p.maxHp; log(`癒やしの泉。HP全回復（+${h}）`, "good"); break; }
    case "altar": pickupEquip(pickWeaponForFloor(game.floor)); log("祭壇に武器が供えられていた", "good"); break;
    case "statue": { const g = rndRange(25, 55); p.gold += g; p.potions++; log(`像の足元から GOLD+${g}・ポーション`, "gold"); break; }
    case "tree": pickupEquip(pickShieldForFloor(game.floor)); p.potions++; log("大樹のうろに 盾とポーション", "good"); break;
  }
  updateUI();
}

/* ===========================================================
 * 10. バトル処理
 * =========================================================== */
function startBattle(entity, opts) {
  opts = opts || {};
  game.mode = "battle";
  game.battle = { entity, isBoss: !!entity.isBoss, isGuardian: !!entity.isGuardian, playerTurn: true, ended: false };
  battleCmdIndex = 0;
  hideBattleItems();
  SFX.encounter();
  startBGM(game.battle.isBoss ? "boss" : "battle");
  showScreen("screen-battle");
  setBattleMessage(`${entity.name} が あらわれた！`);
  renderBattle();
}

function renderBattle() {
  const b = game.battle, e = b.entity, p = game.player;
  setText("bt-enemy-name", e.name);
  setBar("bt-enemy-hp", e.hp / e.maxHp);
  setText("bt-lv", p.level);
  setBar("bt-player-hp", p.hp / p.maxHp);
  setText("bt-hp-text", `${p.hp}/${p.maxHp}` + (p.poison > 0 ? " 毒" : ""));
  setText("bt-atk", getAtk(p)); setText("bt-def", getDef(p)); setText("bt-potion", p.potions);
  drawBattleScene(); updateCommandHighlight();
}

// 装飾画像を任意のコンテキストに描画
function drawDecoOn(c, key, cx, cy, w, h) {
  const r = DECO_IMG[key]; if (!r || !r.ready) return false;
  c.imageSmoothingEnabled = true; c.drawImage(r.img, cx - w / 2, cy - h / 2, w, h); return true;
}
function drawBattleScene() {
  if (game.battle && game.battle.isBoss) drawBossHall();   // ボスは広間
  else drawCorridorScene();                                // 通常は一本道の通路
}
function drawCorridorScene() {
  const c = bctx, W = bcanvas.width, H = bcanvas.height, b = game.battle;
  const th = themeOf(game.floor);
  const vpx = W / 2;
  // 奥行きパラメータ（d=0:手前 〜 d=1:消失点）。スラブを奥→手前で描いて立体的な石の回廊に。
  const HORIZON = H * 0.36, CEIL = H * 0.16, OPEN = W * 0.085;
  const persp = d => Math.pow(d, 0.62);
  const floorY = d => H - (H - HORIZON) * persp(d);
  const ceilY = d => CEIL * persp(d) + 2;
  const halfW = d => (W / 2) - ((W / 2) - OPEN) * persp(d);
  const SEG = 16;
  const shade = (hex, k) => hex;                 // （簡易）色はそのまま、暗さは上に重ねる

  c.fillStyle = "#04040a"; c.fillRect(0, 0, W, H);
  const quad = (ax, ay, bx, by, cx2, cy2, dx, dy, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx2, cy2); c.lineTo(dx, dy); c.closePath(); c.fill(); };

  for (let s = SEG - 1; s >= 0; s--) {           // 奥から手前へ
    const dA = (s + 1) / SEG, dB = s / SEG;       // dA:奥 dB:手前
    const yfA = floorY(dA), yfB = floorY(dB), ycA = ceilY(dA), ycB = ceilY(dB);
    const hwA = halfW(dA), hwB = halfW(dB);
    const lA = vpx - hwA, lB = vpx - hwB, rA = vpx + hwA, rB = vpx + hwB;
    const dk = 0.62 * dB;                          // 奥ほど暗い
    // 床（市松）
    quad(lB, yfB, rB, yfB, rA, yfA, lA, yfA, (s % 2) ? th.floor : th.floorIn);
    // 左右の壁
    quad(lB, ycB, lB, yfB, lA, yfA, lA, ycA, (s % 2) ? th.wall : th.wallShade);
    quad(rB, ycB, rB, yfB, rA, yfA, rA, ycA, (s % 2) ? th.wall : th.wallShade);
    // 天井
    quad(lB, ycB, rB, ycB, rA, ycA, lA, ycA, "#0b0b16");
    // 奥ほど暗くする黒被せ
    c.fillStyle = "rgba(2,2,8," + dk + ")";
    c.beginPath(); c.moveTo(lB, ycB); c.lineTo(rB, ycB); c.lineTo(rB, yfB); c.lineTo(lB, yfB); c.closePath();
    c.lineTo(lA, yfA); c.lineTo(rA, yfA); c.lineTo(rA, ycA); c.lineTo(lA, ycA); c.fill();
    // 床と壁の境界の陰
    c.fillStyle = "rgba(0,0,0,0.22)"; c.fillRect(lB, yfB - 2, rB - lB, 2);
    // レンガの横目地（壁）
    c.strokeStyle = "rgba(0,0,0,0.30)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(lB, (ycB + yfB) / 2); c.lineTo(lA, (ycA + yfA) / 2); c.stroke();
    c.beginPath(); c.moveTo(rB, (ycB + yfB) / 2); c.lineTo(rA, (ycA + yfA) / 2); c.stroke();
  }
  // 奥の闇（行き止まりの暗がり＋ほのかな霧）
  const fz = floorY(1), cz = ceilY(1), hz = halfW(1);
  const fog = c.createRadialGradient(vpx, (fz + cz) / 2, 2, vpx, (fz + cz) / 2, hz * 3.4);
  fog.addColorStop(0, "rgba(40,40,70,0.35)"); fog.addColorStop(1, "rgba(10,10,20,0)");
  c.fillStyle = "rgba(2,2,8,0.85)"; c.fillRect(vpx - hz, cz, hz * 2, fz - cz);
  c.fillStyle = fog; c.fillRect(vpx - hz * 4, cz - 10, hz * 8, fz - cz + 20);

  // 縦の床目地（パース）
  c.strokeStyle = "rgba(0,0,0,0.22)"; c.lineWidth = 1;
  for (let k = -3; k <= 3; k++) { if (k === 0) continue; c.beginPath(); c.moveTo(vpx + k * (OPEN * 0.7), floorY(0.96)); c.lineTo(vpx + k * (W * 0.5 / 3.2), floorY(0)); c.stroke(); }

  // 側壁のたいまつ（手前側・揺らめき＋灯り）
  for (const sgn of [-1, 1]) {
    const d = 0.34, hw = halfW(d), wx = vpx + sgn * hw, wy = (ceilY(d) + floorY(d)) / 2 - 6;
    const f = 0.7 + 0.3 * Math.sin(_time / 90 + sgn);
    c.save(); c.globalCompositeOperation = "lighter"; warmGlow(c, wx, wy, 100 * f, 0.55 * f, "rgba(255,180,80,"); c.restore();
    c.fillStyle = "#3a2a18"; c.fillRect(wx - 2, wy, 4, 12);
    c.fillStyle = "#ff7a1e"; c.beginPath(); c.moveTo(wx, wy - 16 * f); c.quadraticCurveTo(wx + 7, wy - 2, wx, wy + 2); c.quadraticCurveTo(wx - 7, wy - 2, wx, wy - 16 * f); c.fill();
    c.fillStyle = "#ffd24a"; c.beginPath(); c.arc(wx, wy - 3, 3, 0, Math.PI * 2); c.fill();
  }

  // 影＋モンスター（一本道の中央）
  const my = H * 0.64;
  c.fillStyle = "rgba(0,0,0,0.5)"; c.beginPath(); c.ellipse(vpx, my + (b.isBoss ? 38 : 28), (b.isBoss ? 74 : 54), (b.isBoss ? 16 : 12), 0, 0, Math.PI * 2); c.fill();
  const sc = b.isBoss ? 28 : (b.isGuardian ? 24 : 20);
  drawMonster(c, b.entity.type, vpx, my, sc);

  // 画面端のヴィネット
  const vg = c.createRadialGradient(vpx, H * 0.5, H * 0.34, vpx, H * 0.5, H * 0.9);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  void shade;
}
// ボス戦：広い大広間
function drawBossHall() {
  const c = bctx, W = bcanvas.width, H = bcanvas.height, b = game.battle, th = themeOf(game.floor);
  const vpx = W / 2;
  const HORIZON = H * 0.48, CEIL = H * 0.07;
  const quad = (ax, ay, bx, by, cx2, cy2, dx, dy, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx2, cy2); c.lineTo(dx, dy); c.closePath(); c.fill(); };

  // 背景（紫がかった荘厳な闇）
  const amb = c.createLinearGradient(0, 0, 0, H);
  amb.addColorStop(0, "#160f2a"); amb.addColorStop(0.5, "#100a20"); amb.addColorStop(1, "#080612");
  c.fillStyle = amb; c.fillRect(0, 0, W, H);

  // 奥の大壁（広い）＋レンガ
  c.fillStyle = th.wallShade; c.fillRect(0, CEIL, W, HORIZON - CEIL);
  c.strokeStyle = "rgba(0,0,0,0.28)"; c.lineWidth = 1;
  for (let y = CEIL + 10; y < HORIZON; y += 12) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  for (let x = (W % 28) / 2; x < W; x += 28) { c.beginPath(); c.moveTo(x, CEIL); c.lineTo(x, HORIZON); c.stroke(); }
  c.fillStyle = "rgba(255,255,255,0.03)"; c.fillRect(0, CEIL, W, 3);

  // 中央の巨大アーチ（玉座の間の入口）＋紫の魔力
  const aw = W * 0.30, ax = vpx - aw / 2, atop = CEIL + (HORIZON - CEIL) * 0.16;
  c.fillStyle = "#05030c";
  c.beginPath(); c.moveTo(ax, HORIZON); c.lineTo(ax, atop + (HORIZON - atop) * 0.4);
  c.quadraticCurveTo(vpx, atop - 6, ax + aw, atop + (HORIZON - atop) * 0.4); c.lineTo(ax + aw, HORIZON); c.fill();
  // アーチ枠
  c.strokeStyle = th.wall; c.lineWidth = 4; c.stroke();
  c.save(); c.globalCompositeOperation = "lighter";
  warmGlow(c, vpx, HORIZON - 8, W * 0.34, 0.30, "rgba(150,70,225,");
  c.restore();
  // 奥の柱（左右、壁面）
  for (const fx of [W * 0.12, W * 0.88]) { c.fillStyle = th.wall; c.fillRect(fx - 8, CEIL, 16, HORIZON - CEIL); c.fillStyle = "rgba(0,0,0,0.3)"; c.fillRect(fx + 3, CEIL, 5, HORIZON - CEIL); }

  // 床（広い石床・市松＋目地、緩いパース）
  const persp = d => Math.pow(d, 0.75);
  const SEG = 9;
  for (let s = SEG - 1; s >= 0; s--) {
    const dA = (s + 1) / SEG, dB = s / SEG;                  // dA奥 dB手前
    const yA = HORIZON + (H - HORIZON) * persp(dA), yB = HORIZON + (H - HORIZON) * persp(dB);
    const hwA = (W * 0.30) + (W * 0.5 - W * 0.30) * persp(dA), hwB = (W * 0.30) + (W * 0.5 - W * 0.30) * persp(dB);
    quad(vpx - hwB, yB, vpx + hwB, yB, vpx + hwA, yA, vpx - hwA, yA, (s % 2) ? th.floor : th.floorIn);
    c.fillStyle = "rgba(0,0,0," + (0.10 * dB) + ")"; c.fillRect(vpx - hwB, yB - 1, hwB * 2, 1);
  }
  // 床の縦目地（中央から放射）
  c.strokeStyle = "rgba(0,0,0,0.22)"; c.lineWidth = 1;
  for (let k = -4; k <= 4; k++) { if (!k) continue; c.beginPath(); c.moveTo(vpx + k * (W * 0.30 / 4), HORIZON); c.lineTo(vpx + k * (W * 0.5 / 4) * 1.9, H); c.stroke(); }
  // 中央の赤じゅうたん
  c.fillStyle = "rgba(120,20,30,0.5)";
  c.beginPath(); c.moveTo(vpx - W * 0.05, HORIZON); c.lineTo(vpx + W * 0.05, HORIZON); c.lineTo(vpx + W * 0.16, H); c.lineTo(vpx - W * 0.16, H); c.closePath(); c.fill();

  // 手前を縁取る2本の大柱（柱画像）＋根元のかがり火
  const colW = W * 0.16, colH = H * 0.82;
  for (const [cxp, sgn] of [[W * 0.13, -1], [W * 0.87, 1]]) {
    if (!drawDecoOn(c, "p_pillar1", cxp, H - colH / 2 + 6, colW, colH)) { c.fillStyle = th.wall; c.fillRect(cxp - colW / 3, H - colH, colW * 0.66, colH); }
    const bx = cxp - sgn * colW * 0.05, by = H * 0.60, f = 0.7 + 0.3 * Math.sin(_time / 85 + cxp);
    c.save(); c.globalCompositeOperation = "lighter"; warmGlow(c, bx, by, 110 * f, 0.5 * f, "rgba(255,150,70,"); c.restore();
    c.fillStyle = "#3a2a18"; c.fillRect(bx - 2, by + 6, 4, 10);
    c.fillStyle = "#ff7a1e"; c.beginPath(); c.moveTo(bx, by - 16 * f); c.quadraticCurveTo(bx + 7, by, bx, by + 4); c.quadraticCurveTo(bx - 7, by, bx, by - 16 * f); c.fill();
    c.fillStyle = "#ffd24a"; c.beginPath(); c.arc(bx, by - 2, 3, 0, Math.PI * 2); c.fill();
  }

  // 影＋ボス（広間中央・大きめ）
  const my = H * 0.62;
  c.fillStyle = "rgba(0,0,0,0.5)"; c.beginPath(); c.ellipse(vpx, my + 40, 86, 18, 0, 0, Math.PI * 2); c.fill();
  drawMonster(c, b.entity.type, vpx, my, 30);

  // ヴィネット
  const vg = c.createRadialGradient(vpx, H * 0.5, H * 0.38, vpx, H * 0.5, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
}
function setBattleMessage(m) { setText("battle-msg", m); }

function battleCommand(cmd) {
  const b = game.battle; if (!b || b.ended || !b.playerTurn) return;
  const e = b.entity, p = game.player;
  if (cmd === "attack") {
    b.playerTurn = false;
    if (e.evade && Math.random() * 100 < e.evade) {       // 敵の回避
      SFX.attack(); setBattleMessage(`${e.name}は すばやく 攻撃を かわした！`); renderBattle();
      setTimeout(enemyBattleTurn, 650); return;
    }
    let dmg = calcDamage(getAtk(p), e.def);
    const crit = Math.random() * 100 < getCrit(p);
    if (crit) dmg = Math.floor(dmg * 1.5);                 // 会心は1.5倍
    e.hp -= dmg; SFX.attack();
    setBattleMessage(crit ? `会心の一撃！ ${e.name}に ${dmg} ダメージ！` : `${e.name}に ${dmg} ダメージ！`); renderBattle();
    if (e.hp <= 0) { setTimeout(battleVictory, 600); return; }
    setTimeout(enemyBattleTurn, 700);
  } else if (cmd === "item") {
    openBattleItems();
  } else if (cmd === "flee") {
    if (b.isBoss || b.isGuardian) { setBattleMessage("守護者からは 逃げられない！"); return; }
    b.playerTurn = false;
    if (Math.random() < 0.5) {
      SFX.flee();
      e.fleeUntil = Date.now() + FLEE_COOLDOWN;   // この敵はしばらく再戦闘しない
      setBattleMessage("うまく 逃げ切った！");
      setTimeout(() => endBattleReturn(false), 800);
    }
    else { setBattleMessage("逃げられなかった！"); setTimeout(enemyBattleTurn, 700); }
  }
}

/* ===== バトル中のアイテム使用 ===== */
function battleItemList() {                         // バトルで使える消費アイテム一覧
  const p = game.player, out = [];
  if (p.potions > 0) out.push({ kind: "potion", name: "ポーション", n: p.potions });
  for (const id of Object.keys(CONSUMABLES)) { const n = bagCount(p, id); if (n > 0) out.push({ kind: id, name: CONSUMABLES[id].name, n }); }
  return out;
}
function openBattleItems() {
  const b = game.battle; if (!b || b.ended || !b.playerTurn) return;
  renderBattleItems();
  const cm = document.getElementById("command-menu"), bi = document.getElementById("battle-items");
  if (cm) cm.style.display = "none";
  if (bi) bi.style.display = "grid";
}
function hideBattleItems() {
  const cm = document.getElementById("command-menu"), bi = document.getElementById("battle-items");
  if (bi) bi.style.display = "none";
  if (cm) cm.style.display = "";
}
function renderBattleItems() {
  const bi = document.getElementById("battle-items"); if (!bi) return;
  const items = battleItemList();
  let html = "";
  if (items.length === 0) html += `<div class="bi-empty">使える アイテムが ない</div>`;
  else items.forEach(it => { html += `<button class="bi-btn" data-bi="${it.kind}">${it.name} <span class="bi-n">x${it.n}</span></button>`; });
  html += `<button class="bi-btn bi-back" data-biback="1">もどる</button>`;
  bi.innerHTML = html;
  bi.querySelectorAll("button[data-bi]").forEach(btn => btn.onclick = () => { initAudio(); useBattleItem(btn.getAttribute("data-bi")); });
  bi.querySelectorAll("button[data-biback]").forEach(btn => btn.onclick = () => { initAudio(); hideBattleItems(); });
}
function useBattleItem(kind) {
  const b = game.battle, p = game.player;
  if (!b || b.ended || !b.playerTurn) return;
  let msg;
  if (kind === "potion") {
    if (p.potions <= 0) { setBattleMessage("ポーションを 持っていない！"); return; }
    if (p.hp >= p.maxHp) { setBattleMessage("HPは 満タンだ！"); return; }
    p.potions--;
    const heal = Math.min(15, p.maxHp - p.hp); p.hp += heal;
    msg = `ポーションを 使った！ HPが ${heal} 回復`;
  } else {
    const d = CONSUMABLES[kind];
    if (!d || bagCount(p, kind) <= 0) return;
    if ((d.heal || d.fullheal) && p.hp >= p.maxHp) { setBattleMessage("HPは 満タンだ！"); return; }
    if (d.cure === "poison" && !p.poison) { setBattleMessage("毒に かかっていない！"); return; }
    p.bag[kind]--;
    if (d.heal) { const h = Math.min(d.heal, p.maxHp - p.hp); p.hp += h; msg = `${d.name}！ HPが ${h} 回復`; }
    else if (d.fullheal) { const h = p.maxHp - p.hp; p.hp += h; msg = `${d.name}！ HPが全回復（+${h}）`; }
    else if (d.cure === "poison") { p.poison = 0; msg = `${d.name}！ 毒が 消えた`; }
    else if (d.buff) { const had = applyBuff(p, d.buff, d.val); msg = `${d.name}！ ${BUFF_NAME[d.buff]}（${had ? "上書き" : "発動"}）`; }
  }
  SFX.item();
  hideBattleItems();
  b.playerTurn = false;
  setBattleMessage(msg); renderBattle();
  setTimeout(enemyBattleTurn, 750);
}

function finishEnemyTurn(b) { b.playerTurn = true; battleCmdIndex = 0; updateCommandHighlight(); }
function enemyBattleTurn() {
  const b = game.battle; if (!b || b.ended) return;
  const e = b.entity, p = game.player;
  // 毒の継続ダメージ（ターン開始）
  if (p.poison > 0) {
    p.hp -= POISON_DMG; p.poison--; SFX.damage();
    if (p.hp <= 0) { p.hp = 0; b.ended = true; setBattleMessage("毒が まわった…"); renderBattle(); setTimeout(gameOver, 800); return; }
  }
  // ボスのフェーズ制
  let darkWave = false;
  if (e.isBoss) {
    e.turnCount = (e.turnCount || 0) + 1;
    const pct = e.hp / e.maxHp;
    if (pct <= 0.30 && !e.enraged) { e.enraged = true; e.atk += 3; log("ダンジョンロードの鎧から紫の炎が噴き出した！", "bad"); }
    if (pct <= 0.60 && pct > 0.30 && e.turnCount % 3 === 0) darkWave = true;
  }
  // プレイヤーの回避
  if (getEvade(p) > 0 && Math.random() * 100 < getEvade(p)) {
    SFX.flee(); setBattleMessage(`${e.name}の こうげき！ ひらりと かわした！`); renderBattle();
    return finishEnemyTurn(b);
  }
  let dmg = calcDamage(e.atk, getDef(p));
  if (darkWave) dmg = Math.floor(dmg * 1.5) + 2;          // 闇の波動は強め
  p.hp -= dmg; SFX.damage();
  let msg = darkWave ? `${e.name}の 闇の波動！ ${dmg} ダメージ！` : `${e.name}の こうげき！ ${dmg} ダメージ`;
  if (e.poison && !p.poison && Math.random() * 100 < e.poison) { p.poison = POISON_TURNS; msg += "（毒を うけた）"; }
  setBattleMessage(msg); renderBattle();
  if (p.hp <= 0) { p.hp = 0; b.ended = true; setTimeout(gameOver, 700); return; }
  finishEnemyTurn(b);
}
// ダメージ計算：防御は0.6倍して引く（防御で完全無効化されないように）
function calcDamage(atk, def) { return Math.max(1, atk + rndRange(-2, 2) - Math.floor(def * 0.6)); }

function battleVictory() {
  const b = game.battle, e = b.entity, fd = game.floorData, p = game.player;
  b.ended = true; game.kills++;
  const exp = Math.round(e.exp * getXpMult(p));            // XP倍率（杖・知恵の巻物）
  let gold = e.gold;
  if (e.greedy && Math.random() < 0.18) gold = Math.round(gold * 2.5);  // ゴブリンは稀に多め
  p.exp += exp; p.gold += gold;
  log(`${e.name}を 倒した！ EXP+${exp} GOLD+${gold}`, "good");

  if (b.isBoss) { SFX.clear(); stopBGM(); setBattleMessage(`${e.name}を 倒した！ ゲームクリア！`); setTimeout(showClear, 900); return; }

  if (b.isGuardian) {
    fd.guardian.defeated = true;
    fd.stairsLocked = false;
    SFX.levelup();
    log("守護者は「階段のカギ」を落とした！ 先へ進める！", "gold");
    pickupEquip(rnd(2) === 0 ? pickWeaponForFloor(Math.min(MAX_FLOOR, game.floor + 1)) : pickAccessoryForFloor(Math.min(MAX_FLOOR, game.floor + 1)));
    const g = rndRange(25, 45); p.gold += g; if (rnd(2) === 0) p.potions++;
    log(`守護者の宝 GOLD+${g}`, "gold");
    setBattleMessage(`${e.name}撃破！ 階段のカギを手に入れた！`);
  } else {
    rollDrop(e);                                  // 控えめなドロップ
    fd.enemies = fd.enemies.filter(x => x !== e); // マップから消える
    setBattleMessage(`${e.name}を 倒した！`);
  }
  checkLevelUp();
  setTimeout(() => endBattleReturn(true), 1100);
}

function endBattleReturn(victory) {
  game.mode = "explore"; game.battle = null;
  startBGM(themeOf(game.floor).bgm);
  showScreen("screen-game"); updateUI(); draw();
}

function checkLevelUp() {
  const p = game.player;
  while (p.exp >= p.nextExp) {
    p.exp -= p.nextExp; p.level++;
    p.baseMaxHp += 5;                                  // 控えめな成長（装備を主役にしてインフレ抑制）
    if (p.level % 3 === 0) p.baseAtk += 1;
    if (p.level % 3 === 1) p.baseDef += 1;
    recalcMaxHp(p); p.hp = p.maxHp; p.nextExp = Math.floor(p.nextExp * 1.4);
    SFX.levelup(); log(`レベルアップ！ Lv${p.level} になった！`, "gold");
    floatGain(`Lv${p.level}！`, "level");
    if (game.mode === "battle") setBattleMessage(`レベルアップ！ Lv${p.level}！`);
  }
}

/* ===========================================================
 * 11. アイテム・装備処理
 * =========================================================== */
function pickupItem(x, y) {
  const idx = game.floorData.items.findIndex(it => it.x === x && it.y === y);
  if (idx < 0) return;
  const it = game.floorData.items[idx];
  game.floorData.items.splice(idx, 1);
  if (it.kind === "chest") { openChest(); return; }
  if (it.kind === "equip") { pickupEquip(it.id); return; }
  if (CONSUMABLES[it.kind]) { addBag(game.player, it.kind); SFX.item(); log(`${CONSUMABLES[it.kind].name}を 拾った`, "good"); floatGain(CONSUMABLES[it.kind].name, "item"); return; }
  applyConsumable(it.kind, it.amount);
}

// もちものの消費アイテムを使う（使うと無くなる）
function useBagItem(id) {
  const p = game.player, d = CONSUMABLES[id];
  if (!d || bagCount(p, id) <= 0) return;
  if ((d.heal || d.fullheal) && p.hp >= p.maxHp) { log("HPは 満タンだ", "sys"); return; }
  if (d.cure === "poison" && !p.poison) { log("毒に かかっていない", "sys"); return; }
  p.bag[id]--;
  SFX.item();
  if (d.heal) { const h = Math.min(d.heal, p.maxHp - p.hp); p.hp += h; log(`${d.name}で HPが ${h} 回復`, "good"); }
  else if (d.fullheal) { const h = p.maxHp - p.hp; p.hp += h; log(`${d.name}！ HPが全回復した（+${h}）`, "good"); }
  else if (d.cure === "poison") { p.poison = 0; log(`${d.name}で 毒が 消えた`, "good"); }
  else if (d.buff) { const had = applyBuff(p, d.buff, d.val); log(`${d.name}！ ${BUFF_NAME[d.buff]}（${had ? "上書き" : "発動"}）`, "gold"); }
  renderInventory(); updateUI();
}
function applyConsumable(kind, amount) {
  const p = game.player; SFX.item();
  if (kind === "potion") { p.potions++; log("ポーションを 拾った", "good"); floatGain("ポーション", "item"); }
  else if (kind === "gold") { const g = amount || rndRange(8, 20); p.gold += g; log(`金貨を 拾った GOLD+${g}`, "gold"); floatGain(`+${g}G`, "item"); }
}
const EQUIP_KEYS = ["atk", "def", "crit", "evade", "luck", "hp", "xp"];
function makeEquip(id) {
  const d = EQUIP[id] || EQUIP.rusty_dagger;
  const realId = EQUIP[id] ? id : "rusty_dagger";
  const it = { id: realId, type: d.type, name: d.name };
  for (const k of EQUIP_KEYS) if (d[k]) it[k] = d[k];
  return it;
}
function pickupEquip(id) {
  const item = makeEquip(id); SFX.item();
  const p = game.player;
  if (item.type === "accessory") {                       // 装飾：3枠・同じ物は重複不可
    const list = accList(p);
    if (list.some(a => a.id === item.id)) { p.inventory.push(item); log(`${item.name}を 手に入れた（同じ装飾は装備済み）`, "good"); }
    else if (list.length < ACC_MAX) { list.push(item); log(`${item.name}を 装備した！（${statText(item)}）`, "good"); }
    else { p.inventory.push(item); log(`${item.name}を 手に入れた（Iで装備）`, "good"); }
    recalcMaxHp(p); floatGain(item.name, "equip"); updateUI(); return;
  }
  const slot = slotOf(item);
  const cur = p[slot];
  if (!cur || powerOf(item) > powerOf(cur)) {
    if (cur) p.inventory.push(cur);
    p[slot] = item;
    log(`${item.name}を 装備した！（${statText(item)}）`, "good");
  } else { p.inventory.push(item); log(`${item.name}を 手に入れた（Iで装備）`, "good"); }
  recalcMaxHp(p); floatGain(item.name, "equip");
  updateUI();
}
function openChest() {
  SFX.item(); log("宝箱を 開けた！", "");
  const deep = game.floor >= 3;                          // 3階以降は回復が出にくい
  const roll = rnd(100);
  const potionTop = deep ? 40 : 50;
  if (roll < 30) applyConsumable("gold", rndRange(20, 45));
  else if (roll < potionTop) { game.player.potions++; log("ポーションが 入っていた", "good"); floatGain("ポーション", "item"); }
  else if (roll < 64) { const id = choice(CONSUMABLE_SPAWN); addBag(game.player, id); log(`${CONSUMABLES[id].name}が 入っていた`, "good"); floatGain(CONSUMABLES[id].name, "item"); }
  else if (roll < 78) pickupEquip(pickWeaponForFloor(game.floor));
  else if (roll < 90) pickupEquip(pickShieldForFloor(game.floor));
  else pickupEquip(pickAccessoryForFloor(game.floor));   // アクセサリー
  updateUI();
}
// 同系統のバフは重複させず上書き（had=既に効果中だったか）
function applyBuff(p, key, val) { p.buffs = p.buffs || {}; const had = !!p.buffs[key]; p.buffs[key] = val; return had; }

// もちものから装備（自由に付け替え）
function equipFromInventory(i) {
  const p = game.player, item = p.inventory[i]; if (!item) return;
  if (item.type === "accessory") {                       // 装飾：3枠・重複不可
    const list = accList(p);
    if (list.some(a => a.id === item.id)) { log("同じ装飾は1つしか装備できない", "sys"); return; }
    if (list.length >= ACC_MAX) { log("装飾の枠が空いていない（先に外してね）", "sys"); return; }
    p.inventory.splice(i, 1); list.push(item);
    SFX.item(); log(`${item.name}を 装備した`, "good");
    recalcMaxHp(p); renderInventory(); updateUI(); return;
  }
  p.inventory.splice(i, 1);
  const slot = slotOf(item);
  if (p[slot]) p.inventory.push(p[slot]);
  p[slot] = item;
  SFX.item(); log(`${item.name}を 装備した`, "good");
  recalcMaxHp(p); renderInventory(); updateUI();
}
// 装備を外す（武器・防具）
function unequip(slot) {
  const p = game.player;
  if (!p[slot]) return;
  p.inventory.push(p[slot]); p[slot] = null;
  recalcMaxHp(p); SFX.item(); renderInventory(); updateUI();
}
// 装飾を外す（枠番号で指定）
function unequipAccessory(idx) {
  const p = game.player, list = accList(p);
  if (idx < 0 || idx >= list.length) return;
  p.inventory.push(list[idx]); list.splice(idx, 1);
  recalcMaxHp(p); SFX.item(); renderInventory(); updateUI();
}
// もちものからポーション使用（使うと無くなる）
function usePotionMenu() {
  const p = game.player;
  if (p.potions <= 0) return;
  if (p.hp >= p.maxHp) { log("HPは 満タンだ", "sys"); return; }
  p.potions--;
  const heal = Math.min(15, p.maxHp - p.hp); p.hp += heal;
  SFX.item(); log(`ポーションを 使った HPが ${heal} 回復`, "good");
  renderInventory(); updateUI();
}

/* ===========================================================
 * 12. UI・ログ
 * =========================================================== */
function updateUI() {
  if (!game) return;
  const p = game.player, fd = game.floorData;
  setText("st-floor", game.floor + "F");
  setText("st-theme", themeOf(game.floor).name);
  const rl = recLvOf(game.floor);
  setText("st-reclv", "Lv" + rl);
  const rlEl = document.getElementById("st-reclv");
  if (rlEl) rlEl.classList.toggle("low", p.level < rl);
  // 階段のカギ表示
  const keyEl = document.getElementById("st-key");
  if (keyEl) {
    if (game.floor === BOSS_FLOOR) { keyEl.textContent = "ボス階"; keyEl.classList.remove("has"); }
    else if (fd && !fd.stairsLocked) { keyEl.textContent = "所持"; keyEl.classList.add("has"); }
    else { keyEl.textContent = "未所持"; keyEl.classList.remove("has"); }
  }
  setText("st-level", p.level);
  setText("st-hp", `${p.hp}/${p.maxHp}` + (p.poison > 0 ? " 毒" : ""));
  setText("st-exp", `${p.exp}/${p.nextExp}`);
  setText("st-atk", getAtk(p)); setText("st-def", getDef(p));
  setText("st-gold", p.gold); setText("st-potion", p.potions);
  setBar("hp-bar", p.hp / p.maxHp);
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setBar(id, ratio) {
  const bar = document.getElementById(id); if (!bar) return;
  ratio = clamp(ratio, 0, 1);
  bar.style.width = (ratio * 100) + "%";
  bar.style.background = ratio > 0.3 ? "#5ee06a" : "#ff5a5a";
}
function log(msg, cls = "") {
  if (!game) return;
  game.logs.push({ msg, cls });
  if (game.logs.length > 8) game.logs.shift();
  renderLog();
}
function renderLog() {
  const panel = document.getElementById("log-panel"); if (!panel) return;
  panel.innerHTML = "";
  for (const l of game.logs) { const d = document.createElement("div"); d.className = "log-line " + l.cls; d.textContent = l.msg; panel.appendChild(d); }
}

/* ===========================================================
 * 13. セーブ／ロード
 * =========================================================== */
function saveGame(silent) {
  if (!game || game.over) return;
  if (game.mode !== "explore") { if (!silent) log("戦闘中はセーブできません", "sys"); return; }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      floor: game.floor, kills: game.kills, player: game.player, floorData: game.floorData, logs: game.logs,
    }));
    if (!silent) log("セーブしました", "sys");
  } catch (e) { if (!silent) log("セーブに失敗しました", "bad"); }
}
function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    game = { floor: d.floor, kills: d.kills || 0, player: d.player, floorData: d.floorData, logs: d.logs || [], mode: "explore", busy: false, over: false, battle: null };
    const p = game.player;
    if (p.inventory === undefined) p.inventory = [];
    if (p.weapon === undefined) p.weapon = null;
    if (p.shield === undefined) p.shield = null;
    if (!Array.isArray(p.accessories)) { p.accessories = p.accessory ? [p.accessory] : []; delete p.accessory; }
    if (p.bag === undefined) p.bag = {};
    if (!p.dir) p.dir = "down";
    if (!p.buffs) p.buffs = {};
    if (typeof p.poison !== "number") p.poison = 0;
    if (typeof p.baseMaxHp !== "number") p.baseMaxHp = p.maxHp || 30;
    recalcMaxHp(p);
    p.fx = p.x; p.fy = p.y;
    return true;
  } catch (e) { return false; }
}

/* ===========================================================
 * 14. 画面遷移
 * =========================================================== */
function showScreen(id) {
  if (id !== "screen-game") stopAllHold();   // 画面が変わったら長押しを止める
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  currentScreen = id;
}
function startNewGame() {
  game = { floor: 1, kills: 0, player: createPlayer(), floorData: null, logs: [], mode: "explore", busy: false, over: false, battle: null };
  game.floorData = generateFloor(1);
  log(`1F「${themeOf(1).name}」に降り立った。守護者を倒して進め！`, "sys");
  startBGM(themeOf(1).bgm); showScreen("screen-game"); updateUI(); draw();
}
function continueGame() {
  if (!hasSave()) { setText("title-msg", "セーブデータがありません"); return; }
  if (loadGame()) { startBGM(themeOf(game.floor).bgm); showScreen("screen-game"); renderLog(); updateUI(); draw(); }
  else setText("title-msg", "セーブデータが壊れています");
}
function descend() {
  SFX.stairs();
  game.floor++; game.player.floor = game.floor;
  game.floorData = generateFloor(game.floor);
  const th = themeOf(game.floor);
  log(`階段を 降りた… ${game.floor}F「${th.name}」へ`, "sys");
  log(`推奨レベル Lv${recLvOf(game.floor)}。守護者に注意！`, "sys");
  startBGM(th.bgm);
  if (game.floor === BOSS_FLOOR) log("濃い気配… 竜の花園だ。ボスを探せ！", "bad");
  updateUI(); draw();
}
function gameOver() {
  game.over = true; stopBGM(); SFX.gameover();
  const p = game.player;
  document.getElementById("gameover-stats").innerHTML =
    `<div><span class="label">到達階層</span> <span class="val">${game.floor}F</span></div>` +
    `<div><span class="label">レベル</span> <span class="val">${p.level}</span></div>` +
    `<div><span class="label">獲得ゴールド</span> <span class="val">${p.gold}</span></div>`;
  // セーブは消さない（セーブ地点から復活できる）
  const rev = document.getElementById("btn-revive");
  if (rev) rev.style.display = hasSave() ? "" : "none";
  setTimeout(() => showScreen("screen-gameover"), 500);
}
function showClear() {
  game.over = true; stopBGM();
  const p = game.player;
  document.getElementById("clear-stats").innerHTML =
    `<div><span class="label">最終レベル</span> <span class="val">${p.level}</span></div>` +
    `<div><span class="label">獲得ゴールド</span> <span class="val">${p.gold}</span></div>` +
    `<div><span class="label">倒した敵</span> <span class="val">${game.kills}</span></div>`;
  localStorage.removeItem(SAVE_KEY); showScreen("screen-clear");
}

function showInventory() {
  if (!game || game.over || game.mode !== "explore") return;
  renderInventory(); showScreen("screen-inventory");
}

/* ===== 行商人ショップ ===== */
function openShop() {
  if (!game || game.over || !game.floorData.merchant) return;
  game.mode = "shop";
  shopTab = "buy";
  SFX.item();
  setText("shop-msg", "「いらっしゃい。掘り出し物だよ」");
  renderShop();
  showScreen("screen-shop");
}
let shopTab = "buy";
function renderShop() {
  const m = game.floorData.merchant, p = game.player;
  setText("shop-gold", p.gold);
  if (shopCtx) { shopCtx.clearRect(0, 0, shopCanvas.width, shopCanvas.height); drawMerchantArt(shopCtx, shopCanvas.width / 2, shopCanvas.height / 2, shopCanvas.width); }
  const list = document.getElementById("shop-list");
  let html = `<div class="shop-tabs">` +
    `<button class="shop-tab ${shopTab === "buy" ? "active" : ""}" data-tab="buy">買う</button>` +
    `<button class="shop-tab ${shopTab === "sell" ? "active" : ""}" data-tab="sell">売る</button></div>`;

  if (shopTab === "buy") {
    m.offers.forEach((of, i) => {
      const sold = of.stock <= 0;
      const can = !sold && p.gold >= of.price;
      html += `<div class="shop-item"><div class="sinfo"><div class="sname">${of.name}</div><div class="sdesc">${of.desc || ""}</div></div>` +
        `<span class="sprice">${of.price}G</span>` +
        (sold ? `<span class="shop-soldout">売切</span>`
              : `<span class="sstock">残${of.stock}</span><button class="shop-buy" data-buy="${i}" ${can ? "" : "disabled"}>買う</button>`) +
        `</div>`;
    });
  } else {
    const items = sellableItems(p);
    if (items.length === 0) html += `<div class="inv-empty">売れる物がありません</div>`;
    else items.forEach((it, i) => {
      html += `<div class="shop-item"><div class="sinfo"><div class="sname">${it.name}${it.qty > 1 ? " x" + it.qty : ""}</div><div class="sdesc">${it.desc || ""}</div></div>` +
        `<span class="sprice">${it.price}G</span>` +
        `<button class="shop-sell" data-sell="${i}">売る</button></div>`;
    });
  }

  list.innerHTML = html;
  list.querySelectorAll("button[data-tab]").forEach(b => b.onclick = () => { shopTab = b.getAttribute("data-tab"); renderShop(); });
  list.querySelectorAll("button[data-buy]").forEach(b => b.onclick = () => buyOffer(parseInt(b.getAttribute("data-buy"), 10)));
  list.querySelectorAll("button[data-sell]").forEach(b => b.onclick = () => sellItem(parseInt(b.getAttribute("data-sell"), 10)));
}
function buyOffer(i) {
  const m = game.floorData.merchant, p = game.player, fd = game.floorData, of = m.offers[i];
  if (!of || of.stock <= 0) return;
  if (of.kind === "key" && fd.hasKey) { setText("shop-msg", "「もうカギは 持ってるだろう？」"); return; }
  if (p.gold < of.price) { setText("shop-msg", "「お金が足りないようだね」"); return; }
  p.gold -= of.price; of.stock--;
  SFX.item();
  if (of.kind === "potion") { p.potions++; }
  else if (of.kind === "bag") { addBag(p, of.id); }
  else if (of.kind === "equip") { pickupEquip(of.id); }
  else if (of.kind === "key") { fd.hasKey = true; log("古い鍵を 手に入れた（宝物庫が開けられる）", "gold"); }
  setText("shop-msg", `「${of.name}だね、まいど！」`);
  renderShop(); updateUI();
}

/* ===== 売買価格 ===== */
const CONSUMABLE_BUY = { potion: 15, hi_potion: 40, antidote: 12, str_potion: 35, def_potion: 35, luck_potion: 45, scroll: 50, feather: 60 };
// 装備の概算価値（各ステータスを重み付け）
function equipValue(id) {
  const e = EQUIP[id]; if (!e) return 10;
  return Math.abs((e.atk || 0)) * 14 + Math.abs(e.def || 0) * 13 + (e.crit || 0) * 3
    + Math.abs(e.evade || 0) * 2 + Math.abs(e.luck || 0) * 8 + Math.abs(e.hp || 0) * 0.8 + (e.xp || 0) * 2;
}
function equipBuyPrice(id) { return Math.max(20, Math.round(20 + equipValue(id) * 1.6)); }
function equipSellValue(id) { return Math.max(5, Math.round(equipValue(id) * 0.45) + 6); }
function itemSellValue(id) { return Math.max(2, Math.round((CONSUMABLE_BUY[id] || 15) * 0.4)); }
// 売れる物（装備中の物は除く＝予備の装備・どうぐのみ）
function sellableItems(p) {
  const out = [];
  p.inventory.forEach((it, i) => out.push({ kind: "equip", invIndex: i, name: it.name, desc: statText(it), price: equipSellValue(it.id), qty: 1 }));
  if (p.potions > 0) out.push({ kind: "potion", name: "ポーション", desc: POTION_DESC, price: itemSellValue("potion"), qty: p.potions });
  for (const id of Object.keys(CONSUMABLES)) { const n = bagCount(p, id); if (n > 0) out.push({ kind: "bag", id, name: CONSUMABLES[id].name, desc: CONSUMABLES[id].desc, price: itemSellValue(id), qty: n }); }
  return out;
}
function sellItem(i) {
  const p = game.player, items = sellableItems(p), it = items[i];
  if (!it) return;
  p.gold += it.price; SFX.item();
  if (it.kind === "equip") p.inventory.splice(it.invIndex, 1);
  else if (it.kind === "potion") p.potions--;
  else if (it.kind === "bag") removeBag(p, it.id);
  setText("shop-msg", `「${it.name}を ${it.price}Gで 買い取ったよ」`);
  renderShop(); updateUI();
}
function closeShop() {
  if (!game) return;
  game.mode = "explore";
  showScreen("screen-game"); draw();
}
// 装備のサムネイル付き行を作る
function invThumb(item) {
  if (!item) return `<span class="thumb-empty"></span>`;
  return `<canvas class="eq-thumb" width="40" height="40" data-art="${item.type}" data-id="${item.id || ""}"></canvas>`;
}
function descOf(item) { return (item && EQUIP[item.id] && EQUIP[item.id].desc) || ""; }
// 名前＋説明を縦に並べた情報ブロック
function infoBlock(label, name, stat, desc) {
  const title = (label ? label + " " : "") + name + (stat ? " (" + stat + ")" : "");
  return `<div class="einfo"><span class="ename">${title}</span>` + (desc ? `<span class="edesc">${desc}</span>` : "") + `</div>`;
}
function renderInventory() {
  const body = document.getElementById("inv-body"); const p = game.player;
  let html = "";
  html += `<div class="inv-section-title">装備中</div>`;
  html += `<div class="equip-item">${invThumb(p.weapon)}` +
    infoBlock("武器:", p.weapon ? p.weapon.name : "なし", p.weapon ? statText(p.weapon) : "", descOf(p.weapon)) +
    (p.weapon ? `<button class="inv-equip-btn" data-uneq="weapon">はずす</button>` : "") + `</div>`;
  html += `<div class="equip-item">${invThumb(p.shield)}` +
    infoBlock("防具:", p.shield ? p.shield.name : "なし", p.shield ? statText(p.shield) : "", descOf(p.shield)) +
    (p.shield ? `<button class="inv-equip-btn" data-uneq="shield">はずす</button>` : "") + `</div>`;
  const accs = accList(p);
  for (let s = 0; s < ACC_MAX; s++) {
    const ac = accs[s];
    html += `<div class="equip-item">${invThumb(ac)}` +
      infoBlock("装飾" + (s + 1) + ":", ac ? ac.name : "なし", ac ? statText(ac) : "", descOf(ac)) +
      (ac ? `<button class="inv-equip-btn" data-uneqacc="${s}">はずす</button>` : "") + `</div>`;
  }

  html += `<div class="inv-section-title">予備の装備</div>`;
  if (p.inventory.length === 0) html += `<div class="inv-empty">予備の装備はありません</div>`;
  else p.inventory.forEach((item, i) => {
    html += `<div class="equip-item">${invThumb(item)}` + infoBlock("", item.name, statText(item), descOf(item)) +
      `<button class="inv-equip-btn" data-equip="${i}">そうび</button></div>`;
  });

  html += `<div class="inv-section-title">どうぐ</div>`;
  html += `<div class="equip-item"><canvas class="eq-thumb" width="40" height="40" data-art="item" data-id="potion"></canvas>` +
    infoBlock("", "ポーション x" + p.potions, "", POTION_DESC) +
    `<button class="inv-use-btn" data-use="potion" ${p.potions <= 0 ? "disabled" : ""}>つかう</button></div>`;
  for (const id of Object.keys(CONSUMABLES)) {
    const n = bagCount(p, id); if (n <= 0) continue;
    html += `<div class="equip-item"><canvas class="eq-thumb" width="40" height="40" data-art="item" data-id="${id}"></canvas>` +
      infoBlock("", CONSUMABLES[id].name + " x" + n, "", CONSUMABLES[id].desc) +
      `<button class="inv-use-btn" data-useitem="${id}">つかう</button></div>`;
  }
  html += `<div class="equip-item">${infoBlock("", "ゴールド", "", "ダンジョンで集めたお金。")}<span class="ebadge">${p.gold}</span></div>`;
  body.innerHTML = html;

  // サムネイルを描画
  body.querySelectorAll("canvas.eq-thumb").forEach(cv => {
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    const art = cv.getAttribute("data-art"), id = cv.getAttribute("data-id");
    if (art === "weapon") drawWeaponArt(c, id, cv.width / 2, cv.height / 2, cv.width / 15);
    else if (art === "accessory") drawAccessoryArt(c, id, cv.width / 2, cv.height / 2, cv.width / 12);
    else if (art === "item") drawConsumableArt(c, id, cv.width / 2, cv.height / 2, cv.width / 13);
    else drawArmorArt(c, id, cv.width / 2, cv.height / 2, cv.width / 11);
  });

  body.querySelectorAll("button[data-equip]").forEach(b => b.onclick = () => equipFromInventory(parseInt(b.getAttribute("data-equip"), 10)));
  body.querySelectorAll("button[data-uneq]").forEach(b => b.onclick = () => unequip(b.getAttribute("data-uneq")));
  body.querySelectorAll("button[data-uneqacc]").forEach(b => b.onclick = () => unequipAccessory(parseInt(b.getAttribute("data-uneqacc"), 10)));
  body.querySelectorAll("button[data-use]").forEach(b => b.onclick = () => usePotionMenu());
  body.querySelectorAll("button[data-useitem]").forEach(b => b.onclick = () => useBagItem(b.getAttribute("data-useitem")));
}

/* ===========================================================
 * 15. 入力処理
 * =========================================================== */
const BATTLE_CMDS = ["attack", "item", "flee"];
function updateCommandHighlight() {
  document.querySelectorAll("#command-menu .cmd-btn").forEach((b, i) => b.classList.toggle("selected", i === battleCmdIndex));
}

// --- 長押し移動 ---
const ARROW_DIR = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};
const REPEAT_MS = 140;            // 長押し時の移動間隔
const pressedDirs = [];           // 現在押されている方向（最後が有効）
let moveTimer = null;
let touchHeldDir = null;          // 十字パッドで現在ホールド中の方向

function dirMove(dir) {
  if (dir === "up") tryMove(0, -1);
  else if (dir === "down") tryMove(0, 1);
  else if (dir === "left") tryMove(-1, 0);
  else if (dir === "right") tryMove(1, 0);
}
function canHold() { return currentScreen === "screen-game" && game && !game.over && game.mode === "explore"; }
function startHold(dir) {
  if (!canHold()) return;
  if (!pressedDirs.includes(dir)) pressedDirs.push(dir);
  dirMove(dir);                   // 押した瞬間に1歩
  if (!moveTimer) moveTimer = setInterval(holdTick, REPEAT_MS);
}
function holdTick() {
  if (!canHold() || pressedDirs.length === 0) { stopAllHold(); return; }
  dirMove(pressedDirs[pressedDirs.length - 1]);
}
function stopHold(dir) {
  const i = pressedDirs.indexOf(dir);
  if (i >= 0) pressedDirs.splice(i, 1);
  if (pressedDirs.length === 0) stopAllHold();
}
function stopAllHold() {
  pressedDirs.length = 0;
  if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
}

function handleKey(e) {
  initAudio();
  if (currentScreen === "screen-battle") {
    if (!game || !game.battle || game.battle.ended || !game.battle.playerTurn) return;
    if (["ArrowUp", "w", "W"].includes(e.key)) { battleCmdIndex = (battleCmdIndex + 2) % 3; updateCommandHighlight(); e.preventDefault(); }
    else if (["ArrowDown", "s", "S"].includes(e.key)) { battleCmdIndex = (battleCmdIndex + 1) % 3; updateCommandHighlight(); e.preventDefault(); }
    else if (e.key === "Enter" || e.key === " ") { battleCommand(BATTLE_CMDS[battleCmdIndex]); e.preventDefault(); }
    else if (e.key === "Escape") hideBattleItems();
    else if (e.key === "1") battleCommand("attack");
    else if (e.key === "2") battleCommand("item");
    else if (e.key === "3") battleCommand("flee");
    return;
  }
  if (currentScreen === "screen-inventory") { if (e.key === "i" || e.key === "I" || e.key === "Escape") { showScreen("screen-game"); draw(); } return; }
  if (currentScreen === "screen-settings") { if (e.key === "Escape") { showScreen("screen-game"); draw(); } return; }
  if (currentScreen === "screen-shop") { if (e.key === "Escape") closeShop(); return; }
  if (currentScreen !== "screen-game") return;
  if (!game || game.over) return;

  const dir = ARROW_DIR[e.key];
  if (dir) { if (!e.repeat) startHold(dir); e.preventDefault(); return; } // 長押し対応（自前リピート）

  switch (e.key) {
    case " ": waitTurn(); e.preventDefault(); break;
    case "i": case "I": showInventory(); break;
    case "Escape": showScreen("screen-settings"); break;
  }
}
function handleKeyUp(e) {
  const dir = ARROW_DIR[e.key];
  if (dir) stopHold(dir);
}

// 確認ダイアログ
let _confirmYes = null;
function showConfirm(msg, onYes) {
  _confirmYes = onYes;
  setText("confirm-msg", msg);
  showScreen("screen-confirm");
}

function bindButtons() {
  // はじめから：セーブがあれば削除確認
  document.getElementById("btn-new").onclick = () => {
    initAudio();
    if (hasSave()) showConfirm("現在のセーブデータを削除して、最初から始めますか？", () => { localStorage.removeItem(SAVE_KEY); startNewGame(); });
    else startNewGame();
  };
  document.getElementById("btn-continue").onclick = () => { initAudio(); continueGame(); };
  document.getElementById("btn-howto").onclick = () => showScreen("screen-howto");
  document.getElementById("btn-howto-back").onclick = () => showScreen("screen-title");
  document.getElementById("btn-confirm-yes").onclick = () => { const f = _confirmYes; _confirmYes = null; if (f) f(); };
  document.getElementById("btn-confirm-no").onclick = () => { _confirmYes = null; showScreen("screen-title"); };
  document.getElementById("btn-revive").onclick = () => { initAudio(); if (hasSave()) continueGame(); else { showScreen("screen-title"); setText("title-msg", ""); } };

  // 歯車・設定
  document.getElementById("btn-gear").onclick = () => { initAudio(); showScreen("screen-settings"); };
  document.getElementById("btn-resume").onclick = () => { showScreen("screen-game"); draw(); };
  document.getElementById("btn-save").onclick = () => { saveGame(false); };
  document.getElementById("btn-sound").onclick = toggleSound;
  document.getElementById("btn-to-title").onclick = () => { saveGame(true); stopBGM(); showScreen("screen-title"); setText("title-msg", ""); };

  // もちもの・セーブ（パネル）
  document.getElementById("btn-bag").onclick = () => { initAudio(); showInventory(); };
  document.getElementById("btn-save-panel").onclick = () => { initAudio(); saveGame(false); };
  document.getElementById("btn-bag-touch").onclick = () => { initAudio(); showInventory(); };
  document.getElementById("btn-save-touch").onclick = () => { initAudio(); saveGame(false); };
  document.getElementById("btn-inv-close").onclick = () => { showScreen("screen-game"); draw(); };
  document.getElementById("btn-shop-close").onclick = () => closeShop();

  // 結果
  document.getElementById("btn-retry-over").onclick = () => { showScreen("screen-title"); setText("title-msg", ""); };
  document.getElementById("btn-retry-clear").onclick = () => { showScreen("screen-title"); setText("title-msg", ""); };

  // タッチ移動：十字パッド上で指を離さずに滑らせて方向転換できるジェスチャー操作
  const dpadEl = document.querySelector("#touch-controls .dpad");
  if (dpadEl) {
    const dirBtns = {};
    dpadEl.querySelectorAll(".touch-btn[data-dir]").forEach(b => { dirBtns[b.getAttribute("data-dir")] = b; });
    let activePid = null;

    const highlight = (dir) => { for (const k in dirBtns) dirBtns[k].classList.toggle("held", k === dir); };
    const padDir = (x, y) => {                       // パッド中心からの位置で4方向を判定（縦横シームレス）
      const r = dpadEl.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.1) return null;   // ごく中央のみ無反応
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    };
    const applyDir = (d) => {
      if (d === touchHeldDir) { highlight(d); return; }
      if (touchHeldDir) stopHold(touchHeldDir);
      touchHeldDir = d;
      if (d) startHold(d);
      highlight(d);
    };

    dpadEl.addEventListener("pointerdown", (e) => {
      e.preventDefault(); initAudio();
      activePid = e.pointerId;
      try { dpadEl.setPointerCapture(e.pointerId); } catch (_) {}
      applyDir(padDir(e.clientX, e.clientY));
    });
    dpadEl.addEventListener("pointermove", (e) => {
      if (e.pointerId !== activePid) return;
      applyDir(padDir(e.clientX, e.clientY));
    });
    const endTouch = (e) => {
      if (e.pointerId !== activePid) return;
      applyDir(null);
      activePid = null;
    };
    dpadEl.addEventListener("pointerup", endTouch);
    dpadEl.addEventListener("pointercancel", endTouch);
  }

  // バトルコマンド
  document.querySelectorAll("#command-menu .cmd-btn").forEach((btn, i) => {
    btn.addEventListener("click", () => { initAudio(); battleCmdIndex = i; updateCommandHighlight(); battleCommand(btn.getAttribute("data-cmd")); });
  });
}

function toggleSound() {
  soundOn = !soundOn;
  setText("btn-sound", soundOn ? "音 ON" : "音 OFF");
  if (soundOn) { beep(660, 0.08); startBGM(currentScreen === "screen-battle" ? (game && game.battle && game.battle.isBoss ? "boss" : "battle") : themeOf(game ? game.floor : 1).bgm); }
  else stopBGM();
}

/* ===========================================================
 * 16. 初期化
 * =========================================================== */
/* リアルタイム描画ループ：探索中は毎フレーム敵を動かして再描画する。
   プレイヤーの入力とは無関係に敵が動き、補間でヌルヌル見える。 */
let _lastT = 0, _rafId = null, _time = 0;
function gameLoop(t) {
  _rafId = requestAnimationFrame(gameLoop);
  let dt = (t - _lastT) / 1000;
  _lastT = t; _time = t;                              // 松明の揺らぎ等に使用
  if (!(dt > 0) || dt > 0.1) dt = 0.016;             // タブ復帰時などの飛びを抑制
  if (currentScreen === "screen-game" && game && !game.over && game.mode === "explore") {
    updatePlayerSmooth(dt);
    updateEnemies(dt);
    draw();
  }
}

// 主人公の表示位置(fx,fy)を目標タイル(x,y)へなめらかに寄せる
const PLAYER_SPEED = 9;   // タイル/秒
function updatePlayerSmooth(dt) {
  const p = game.player;
  if (typeof p.fx !== "number") { p.fx = p.x; p.fy = p.y; return; }
  const step = PLAYER_SPEED * dt;
  const dx = p.x - p.fx, dy = p.y - p.fy;
  if (Math.abs(dx) <= step) p.fx = p.x; else p.fx += Math.sign(dx) * step;
  if (Math.abs(dy) <= step) p.fy = p.y; else p.fy += Math.sign(dy) * step;
}

function init() {
  canvas = document.getElementById("dungeon-canvas"); ctx = canvas.getContext("2d");
  bcanvas = document.getElementById("battle-canvas"); bctx = bcanvas.getContext("2d");
  shopCanvas = document.getElementById("shop-canvas"); shopCtx = shopCanvas.getContext("2d");
  bindButtons();
  window.addEventListener("keydown", handleKey);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", stopAllHold);   // フォーカスを失ったら停止
  showScreen("screen-title");
  loadTitleArt();                                  // タイトル画像があれば背景に
  loadMonsters();                                  // モンスター画像を読み込み
  _rafId = requestAnimationFrame(gameLoop);        // 描画ループ開始
}

// 単体HTML用：画像を data URI 差し替えできるようにする（フォルダ版ではそのままのパス）
function asset(p) { return (typeof window !== "undefined" && window.__PDQ_ASSETS__ && window.__PDQ_ASSETS__[p]) || p; }

// assets/title.png が存在すれば、タイトル画面の背景として使う（無ければ文字ロゴのまま）
function loadTitleArt() {
  const img = new Image();
  img.onload = () => { const t = document.getElementById("screen-title"); if (t) t.classList.add("has-art"); };
  img.src = asset("assets/title.png");
}
window.addEventListener("load", init);

'use strict';

// ============================================================
// calc.js — 税計算・データ検証の純粋ロジック
// DOM/ストレージに依存しない。test.html から読み込んでテスト可能。
// ============================================================

// ── 都道府県リスト ──────────────────────────────
const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];

// ── 都道府県別 均等割（円/年）2026年 ──────────────
// 標準額 = 5,000円（道府県民税1,000 + 市区町村民税3,000 + 森林環境税1,000・国税）
// ※2024年度以降。多くの県が森林・水源系の超過課税（300〜1,200円）を上乗せ。
// 出典: 東京都主税局／各県の超過課税（2026年時点・37府県が上乗せ）
const KINTOU_WARI_BASE = 5000; // 超過課税のない都道府県の標準額
const PREF_KINTOU_WARI = {
  '北海道': 5000, '青森県': 5000, '岩手県': 6000, '宮城県': 6200,
  '秋田県': 5800, '山形県': 6000, '福島県': 6000, '茨城県': 6000,
  '栃木県': 5700, '群馬県': 5700, '埼玉県': 5000, '千葉県': 5000,
  '東京都': 5000, '神奈川県': 5300, '新潟県': 5000, '富山県': 5500,
  '石川県': 5500, '福井県': 5000, '山梨県': 5500, '長野県': 5500,
  '岐阜県': 6000, '静岡県': 5400, '愛知県': 5500, '三重県': 6000,
  '滋賀県': 5800, '京都府': 5600, '大阪府': 5300, '兵庫県': 5800,
  '奈良県': 5500, '和歌山県': 5500, '鳥取県': 5500, '島根県': 5500,
  '岡山県': 5500, '広島県': 5500, '山口県': 5500, '徳島県': 5000,
  '香川県': 5000, '愛媛県': 5700, '高知県': 5500, '福岡県': 5500,
  '佐賀県': 5500, '長崎県': 5500, '熊本県': 5500, '大分県': 5500,
  '宮崎県': 5500, '鹿児島県': 5500, '沖縄県': 5000,
};
function getKintouWari(prefecture) {
  return PREF_KINTOU_WARI[prefecture] ?? KINTOU_WARI_BASE;
}

// ── 2026年税制改正対応定数（令和7年度税制改正・2025年分以降） ──
const KYUYO_KOJO   = 650000; // 給与所得控除 最低額（65万円）※旧55万
const KISO_JUMINZEI = 530000; // 住民税 基礎控除（53万円）※旧43万
// 住民税の非課税限度額（単身・合計所得）。級地で異なる:
//   1級地45万→給与110万 / 2級地41.5万→106.5万 / 3級地38万→103万
// 本ツールは大都市に多い1級地（45万＝給与110万）を標準採用。
const KINTOU_HIKAZEI_GOUKEI = 450000;

// ── 主要な「年収の壁」（給与収入ベース・2026年） ──────────
// 住民税が発生し始めるライン（均等割。自治体により100〜110万、目安110万）
const JUMINZEI_LINE = KYUYO_KOJO + KINTOU_HIKAZEI_GOUKEI; // = 1,100,000円
// 住民税の所得割が発生するライン（給与所得控除＋住民税基礎控除）
const SHOTOKUWARI_LINE = KYUYO_KOJO + KISO_JUMINZEI;      // = 1,180,000円
// 親の扶養控除の判定基準（合計所得58万 = 給与123万）
const FUYO_LINE = 1230000;
// 社会保険の扶養を外れるライン（手取りへの影響が最も大きい）
const SHAHO_LINE = 1300000;
// 親の特定扶養控除が満額維持／勤労学生控除の上限（合計所得85万）
const TOKUTEI_FUYO_LINE = 1500000;
// 本人に所得税がかかり始めるライン（給与所得控除65万＋基礎控除95万）
const SHOTOKUZEI_LINE = 1600000;

// 標準の上限（社会保険の壁＝学生バイトに最も影響が大きい）
const DEFAULT_LIMIT = SHAHO_LINE;

// 調整控除：所得税と住民税の人的控除の差による負担増を調整する税額控除。
// 課税所得200万円以下は「人的控除差の合計 と 課税所得 の小さい方 × 5%」。
// 単身・給与所得のみ（基礎控除のみ）を想定し、人的控除差＝5万円で概算。
const JINTEKI_KOJO_SA = 50000; // 基礎控除の人的控除差（所得税58万−住民税53万）

// ── 住民税計算 ──────────────────────────────────
// 住民税 = 均等割（定額・地域差あり）＋ 所得割（課税所得×10% − 調整控除）
// ・給与収入が約110万円以下：均等割・所得割とも非課税（合計所得≦45万）
// ・約110万〜118万円：均等割（標準5,000円）のみ
// ・118万円超：均等割 ＋ 所得割（調整控除 最大2,500円を差し引く）
function calcJuminzei(annualIncome, prefecture = null) {
  const goukeiShotoku = Math.max(annualIncome - KYUYO_KOJO, 0); // 合計所得金額
  if (goukeiShotoku <= KINTOU_HIKAZEI_GOUKEI) return 0;         // 非課税限度額以下
  const kintouWari = getKintouWari(prefecture);                 // 均等割（地域別）
  const kazeiShotoku = Math.max(goukeiShotoku - KISO_JUMINZEI, 0);
  if (kazeiShotoku === 0) return kintouWari;                    // 所得割なし（均等割のみ）
  // 所得割 ＝ 課税所得×10% − 調整控除（課税所得200万以下）
  const choseiKojo = Math.floor(Math.min(JINTEKI_KOJO_SA, kazeiShotoku) * 0.05);
  const shotokuWari = Math.max(Math.floor(kazeiShotoku * 0.10) - choseiKojo, 0);
  return kintouWari + shotokuWari;
}

// ── 定数（検証用） ──────────────────────────────
const STORAGE_KEY = 'baito_data';
const MAX_AMOUNT = 100000000; // 1件あたり上限（1億円）— 異常値の混入を防ぐ
const EMPTY_DATA = { records: [], settings: {} };

// ── 入力サニタイズ ──────────────────────────────
// 金額を「有限・非負・上限以内の整数」に正規化（NaN/負数/巨大値を排除）
function sanitizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_AMOUNT);
}

// 保存データ全体を検証して安全な形に整える（破損・型不一致から防御）
function sanitizeData(raw) {
  const safe = { records: [], settings: {} };
  if (!raw || typeof raw !== 'object') return safe;

  // records: 配列かつ各要素が正しい形式のものだけ残す
  if (Array.isArray(raw.records)) {
    const seen = new Set();
    for (const r of raw.records) {
      if (!r || typeof r.month !== 'string') continue;
      // YYYY-MM 形式のみ許可
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)) continue;
      if (seen.has(r.month)) continue; // 同月重複を排除
      seen.add(r.month);
      safe.records.push({
        month: r.month,
        gross: sanitizeAmount(r.gross),
        transport: sanitizeAmount(r.transport),
      });
    }
  }

  // settings: 既知キーのみ・型を固定して取り込む
  if (raw.settings && typeof raw.settings === 'object') {
    const s = raw.settings;
    safe.settings = {
      limitType: typeof s.limitType === 'string' ? s.limitType : '',
      customLimit: sanitizeAmount(s.customLimit),
      prefecture: PREFECTURES.includes(s.prefecture) ? s.prefecture : '',
      city: typeof s.city === 'string' ? s.city.slice(0, 50) : '',
    };
  }
  return safe;
}

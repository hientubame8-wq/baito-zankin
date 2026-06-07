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
// 標準6,000円（都道府県2,000 + 市区町村3,000 + 森林環境税1,000）
// ※独自環境税・超過課税がある都道府県は加算
const PREF_KINTOU_WARI = {
  '北海道': 6000, '青森県': 6200, '岩手県': 6500, '宮城県': 6300,
  '秋田県': 6500, '山形県': 6300, '福島県': 6200, '茨城県': 6000,
  '栃木県': 6000, '群馬県': 6000, '埼玉県': 6000, '千葉県': 6000,
  '東京都': 6000, '神奈川県': 6000, '新潟県': 6000, '富山県': 6000,
  '石川県': 6000, '福井県': 6000, '山梨県': 6300, '長野県': 6300,
  '岐阜県': 6000, '静岡県': 6000, '愛知県': 6000, '三重県': 6300,
  '滋賀県': 6000, '京都府': 6000, '大阪府': 6000, '兵庫県': 6000,
  '奈良県': 6000, '和歌山県': 6200, '鳥取県': 6000, '島根県': 6500,
  '岡山県': 6000, '広島県': 6000, '山口県': 6000, '徳島県': 6200,
  '香川県': 6000, '愛媛県': 6200, '高知県': 6500, '福岡県': 6000,
  '佐賀県': 6000, '長崎県': 6200, '熊本県': 6000, '大分県': 6200,
  '宮崎県': 6300, '鹿児島県': 6000, '沖縄県': 6000,
};
function getKintouWari(prefecture) {
  return PREF_KINTOU_WARI[prefecture] ?? 6000;
}

// ── 2026年税制改正対応定数 ──────────────────────
// 2025年税制改正（2026年1月〜施行）
const KYUYO_KOJO     = 650000; // 給与所得控除 最低額（65万円）※旧55万
const KISO_SHOTOKU   = 580000; // 所得税 基礎控除（58万円）※旧48万
const KISO_JUMINZEI  = 530000; // 住民税 基礎控除（53万円）※旧43万

// 住民税が発生する収入ライン（給与所得控除＋住民税基礎控除）
const JUMINZEI_LINE  = KYUYO_KOJO + KISO_JUMINZEI;  // = 1,180,000円
// 所得税が発生する収入ライン（= 旧「103万の壁」→ 2026年から「123万の壁」）
const SHOTOKUZEI_LINE = KYUYO_KOJO + KISO_SHOTOKU;  // = 1,230,000円

// ── 住民税計算 ──────────────────────────────────
// prefecture を渡すと地域別均等割を使用（省略時は全国標準6,000円）
function calcJuminzei(annualIncome, prefecture = null) {
  const kyuyoShotoku = Math.max(annualIncome - KYUYO_KOJO, 0);
  const kazeiShotoku = Math.max(kyuyoShotoku - KISO_JUMINZEI, 0);
  if (kazeiShotoku === 0) return 0;
  const shotokuWari = Math.floor(kazeiShotoku * 0.10);
  const kintouWari = getKintouWari(prefecture);
  return shotokuWari + kintouWari;
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

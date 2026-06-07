'use strict';
// ============================================================
// calc.test.js — calc.js の純粋ロジックを Node/CI で検証
// 実行: node test/calc.test.js   （失敗時は exit code 1 で CI を落とす）
// ============================================================
const c = require('../calc.js');

let pass = 0, fail = 0;
const fails = [];

function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
  } else {
    fail++;
    fails.push(`✗ ${name}\n    期待: ${JSON.stringify(expected)}\n    実際: ${JSON.stringify(actual)}`);
  }
}

// ── 2026年税制定数 ──
eq('給与所得控除 = 65万', c.KYUYO_KOJO, 650000);
eq('住民税基礎控除 = 53万', c.KISO_JUMINZEI, 530000);
eq('住民税(均等割)ライン = 110万', c.JUMINZEI_LINE, 1100000);
eq('住民税(所得割)ライン = 118万', c.SHOTOKUWARI_LINE, 1180000);
eq('社会保険の壁 = 130万', c.SHAHO_LINE, 1300000);
eq('特定扶養/勤労学生 = 150万', c.TOKUTEI_FUYO_LINE, 1500000);
eq('本人所得税の壁 = 160万', c.SHOTOKUZEI_LINE, 1600000);
eq('均等割の標準額 = 5000', c.KINTOU_WARI_BASE, 5000);

// ── 住民税計算（均等割5,000 ＋ 所得割10% − 調整控除 最大2,500） ──
eq('109万は非課税', c.calcJuminzei(1090000, '東京都'), 0);
eq('110万も非課税', c.calcJuminzei(1100000, '東京都'), 0);
eq('115万は均等割のみ5000', c.calcJuminzei(1150000, '東京都'), 5000);
eq('118万も均等割のみ5000', c.calcJuminzei(1180000, '東京都'), 5000);
eq('119万は5500（調整控除後）', c.calcJuminzei(1190000, '東京都'), 5500);
eq('120万は6000', c.calcJuminzei(1200000, '東京都'), 6000);
eq('130万は14500', c.calcJuminzei(1300000, '東京都'), 14500);
eq('150万・東京は34500', c.calcJuminzei(1500000, '東京都'), 34500);
eq('150万・高知は35000', c.calcJuminzei(1500000, '高知県'), 35000);
eq('地域差は均等割差500', c.calcJuminzei(1500000, '高知県') - c.calcJuminzei(1500000, '東京都'), 500);
eq('調整控除は最大2500', c.calcJuminzei(1230000, '東京都'), 7500);
eq('未指定は標準5000ベース', c.calcJuminzei(1500000), 34500);

// ── 均等割テーブル（5,000＋超過課税） ──
eq('東京都=5000', c.getKintouWari('東京都'), 5000);
eq('宮城県=6200(最高)', c.getKintouWari('宮城県'), 6200);
eq('岩手県=6000', c.getKintouWari('岩手県'), 6000);
eq('神奈川県=5300', c.getKintouWari('神奈川県'), 5300);
eq('長野県=5500', c.getKintouWari('長野県'), 5500);
eq('沖縄県=5000(超過課税なし)', c.getKintouWari('沖縄県'), 5000);
eq('不明な県は標準5000', c.getKintouWari('海外'), 5000);
eq('null=標準5000', c.getKintouWari(null), 5000);

// ── 均等割テーブルの整合性（全47件・標準5000以上） ──
eq('都道府県は47件', c.PREFECTURES.length, 47);
eq('均等割テーブルも47件', Object.keys(c.PREF_KINTOU_WARI).length, 47);
const allValid = c.PREFECTURES.every(p =>
  c.PREF_KINTOU_WARI[p] >= 5000 && c.PREF_KINTOU_WARI[p] <= 7000);
eq('全県の均等割が5000〜7000の範囲', allValid, true);
const surtaxCount = c.PREFECTURES.filter(p => c.PREF_KINTOU_WARI[p] > 5000).length;
eq('超過課税ありは37府県', surtaxCount, 37);

// ── 金額サニタイズ ──
eq('通常値はそのまま', c.sanitizeAmount(85000), 85000);
eq('負数→0', c.sanitizeAmount(-5000), 0);
eq('NaN→0', c.sanitizeAmount('abc'), 0);
eq('Infinity→0', c.sanitizeAmount(Infinity), 0);
eq('小数切り捨て', c.sanitizeAmount(1234.99), 1234);
eq('上限cap', c.sanitizeAmount(1e15), 100000000);

// ── データ検証 ──
eq('null→空データ', c.sanitizeData(null), { records: [], settings: {} });
eq('不正な月を除外', c.sanitizeData({ records: [{ month: '2026-13', gross: 100 }] }).records.length, 0);
eq('重複月を1件に', c.sanitizeData({ records: [{ month: '2026-05', gross: 1 }, { month: '2026-05', gross: 2 }] }).records.length, 1);
eq('負数grossを0に', c.sanitizeData({ records: [{ month: '2026-03', gross: -9 }] }).records[0].gross, 0);
eq('不正な都道府県を空に', c.sanitizeData({ settings: { prefecture: '<script>' } }).settings.prefecture, '');
eq('city長さ制限', c.sanitizeData({ settings: { city: 'あ'.repeat(100) } }).settings.city.length, 50);

// ── 結果出力 ──
console.log(`\n住民税・データ検証テスト: ${pass} 件合格 / ${fail} 件失敗`);
if (fail > 0) {
  console.error('\n--- 失敗 ---\n' + fails.join('\n'));
  process.exit(1);
}
console.log('✅ すべて合格しました');

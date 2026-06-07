'use strict';
// ============================================================
// healthcheck.js — サイトの健全性チェック（CI / 手元どちらでも）
//  1) HTML内の内部リンク・参照ファイルが実在するか
//  2) sitemap.xml に列挙したページが実在するか
//  3) （任意）公開サイトが 200 を返すか  ※ CHECK_LIVE=1 のとき
// 実行: node test/healthcheck.js
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errors = [];
const warnings = [];

// 対象HTMLファイル
const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

// 1) 内部リンク／参照の実在チェック
const refRe = /(?:href|src)\s*=\s*"([^"]+)"/g;
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  let m;
  while ((m = refRe.exec(html)) !== null) {
    const ref = m[1];
    // 外部URL・アンカー・mailto・data はスキップ
    if (/^(https?:|mailto:|#|data:|\/\/)/.test(ref)) continue;
    let cleaned = ref.split('#')[0].split('?')[0];
    if (!cleaned) continue;
    // GitHub Pagesのベースパス /baito-zankin/ をローカルのルートに対応付け
    cleaned = cleaned.replace(/^\/baito-zankin\//, '').replace(/^\//, '');
    const target = path.join(ROOT, cleaned);
    if (!fs.existsSync(target)) {
      errors.push(`[リンク切れ] ${file} → ${ref}`);
    }
  }
}

// 2) sitemap.xml のページ実在チェック
const sitemapPath = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const loc of locs) {
    // URL末尾のパスをローカルファイルに対応付け
    const rel = loc.replace(/^https?:\/\/[^/]+\/baito-zankin\//, '').replace(/\/$/, '') || 'index.html';
    const local = rel.endsWith('.html') || rel.endsWith('.xml') ? rel : rel + '/index.html';
    if (!fs.existsSync(path.join(ROOT, local === '' ? 'index.html' : local))) {
      warnings.push(`[sitemap] ${loc} に対応するファイルが見つかりません（${local}）`);
    }
  }
} else {
  warnings.push('sitemap.xml がありません');
}

// 3) 公開サイトの死活チェック（CHECK_LIVE=1 のときのみ）
async function checkLive() {
  // 環境変数 CHECK_LIVE=1 または引数 --live で有効化（Windows/Unix両対応）
  if (process.env.CHECK_LIVE !== '1' && !process.argv.includes('--live')) return;
  const urls = [
    'https://hientubame8-wq.github.io/baito-zankin/',
    'https://hientubame8-wq.github.io/baito-zankin/kabe-130man.html',
    'https://hientubame8-wq.github.io/baito-zankin/privacy.html',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) errors.push(`[死活] ${url} が HTTP ${res.status}`);
    } catch (e) {
      errors.push(`[死活] ${url} に接続できません: ${e.message}`);
    }
  }
}

(async () => {
  await checkLive();

  if (warnings.length) {
    console.log('⚠ 警告:\n' + warnings.map(w => '  ' + w).join('\n'));
  }
  if (errors.length) {
    console.error('\n❌ 問題が見つかりました:\n' + errors.map(e => '  ' + e).join('\n'));
    process.exit(1);
  }
  console.log(`✅ 健全性チェック合格（HTML ${htmlFiles.length}件・内部リンク／sitemap 整合）`);
})();

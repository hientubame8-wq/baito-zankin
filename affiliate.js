'use strict';
// ============================================================
// affiliate.js — アフィリエイトリンクの設定と表示制御
//
// ▼ 使い方（詳細は AFFILIATE.md）
//   下の AFFILIATE に、取得したアフィリエイトリンクのURLを貼り付けてください。
//   空（''）のままにした広告枠は、自動的に非表示になります（リンク切れを防止）。
// ============================================================
const AFFILIATE = {
  // バイト求人サイト（例: マイナビバイト / バイトル 等のアフィリエイトURL）
  baito_kyujin: '',
  // 確定申告・会計ソフト（例: freee / マネーフォワード 等のアフィリエイトURL）
  kakutei_shinkoku: '',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.aff-box[data-aff]').forEach(box => {
    const url = AFFILIATE[box.getAttribute('data-aff')];
    const link = box.querySelector('.aff-btn');
    if (url && link) {
      link.href = url;
      // Google推奨: アフィリエイトは sponsored、別タブで開く
      link.setAttribute('rel', 'sponsored nofollow noopener');
      link.setAttribute('target', '_blank');
    } else {
      box.style.display = 'none'; // 未設定の枠は表示しない
    }
  });
});

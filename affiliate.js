'use strict';
// ============================================================
// affiliate.js — アフィリエイトリンクの設定と表示制御
//
// ▼ テキストボタン広告（.aff-box）
//   下の AFFILIATE に取得したリンクURLを貼り付けてください。
//   空（''）のままの枠は自動的に非表示になります（リンク切れ防止）。
//
// ▼ バナー広告（全ページのフッター直前に表示）
//   BANNERS.main に A8.net 等のバナーHTMLを貼り付けてください。
//   差し替えるときもここだけ書き換えてコミットすれば全ページ反映されます。
// ============================================================

const AFFILIATE = {
  // バイト求人サイト（例: マイナビバイト / バイトル 等のアフィリエイトURL）
  baito_kyujin: '',
  // 確定申告・会計ソフト（例: freee / マネーフォワード 等のアフィリエイトURL）
  kakutei_shinkoku: '',
};

// バナー広告（全ページのフッター直前に自動挿入）
// 差し替え: main の値を新しいバナーHTMLに書き換えてコミットするだけ
// 空（''）のままにすると非表示
const BANNERS = {
  main: `<a href="https://px.a8.net/svt/ejp?a8mat=4B5SK5+ADAT2Q+31E2+5YRHD" rel="sponsored nofollow noopener" target="_blank"><img border="0" width="250" height="250" alt="" src="https://www23.a8.net/svt/bgt?aid=260610773627&wid=001&eno=01&mid=s00000014177001002000&mc=1"></a><img border="0" width="1" height="1" src="https://www17.a8.net/0.gif?a8mat=4B5SK5+ADAT2Q+31E2+5YRHD" alt="">`,
};

document.addEventListener('DOMContentLoaded', () => {
  // テキストボタン広告の表示制御
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

  // バナー広告の挿入（フッター直前）
  if (BANNERS.main) {
    const footer = document.querySelector('footer');
    if (footer) {
      const section = document.createElement('section');
      section.className = 'aff-banner-section';
      section.innerHTML = `<span class="aff-label">広告</span>${BANNERS.main}`;
      footer.parentNode.insertBefore(section, footer);
    }
  }
});

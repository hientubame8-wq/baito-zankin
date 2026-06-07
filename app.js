'use strict';

// ============================================================
// app.js — UI・DOM・ストレージ I/O
// 税計算とデータ検証の純粋ロジックは calc.js に分離（先に読み込む）
// ============================================================

// ── LocalStorage（堅牢化版） ─────────────────────
// ストレージが使えるか事前判定（プライベートブラウズ・無効化対策）
function isStorageAvailable() {
  try {
    const t = '__test__';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_DATA);
    return sanitizeData(JSON.parse(raw)); // 破損JSONはcatchで復旧
  } catch (e) {
    console.warn('保存データの読み込みに失敗しました。初期化します。', e);
    return structuredClone(EMPTY_DATA);
  }
}

function saveData(data) {
  try {
    const safe = sanitizeData(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch (e) {
    // 容量超過・ストレージ無効など
    console.error('保存に失敗しました。', e);
    if (typeof toast === 'function') {
      toast('保存に失敗しました。ブラウザの設定をご確認ください');
    }
    return false;
  }
}

// ── 設定 ───────────────────────────────────────
function getSettings() {
  return loadData().settings;
}
function getLimitAmount(settings) {
  if (!settings.limitType) return SHOTOKUZEI_LINE; // デフォルト: 123万（2026年新基準）
  if (settings.limitType === 'custom') return Number(settings.customLimit) || SHOTOKUZEI_LINE;
  return Number(settings.limitType);
}

// ── 今年の記録 ─────────────────────────────────
function getCurrentYear() { return new Date().getFullYear(); }

function getYearRecords() {
  const year = getCurrentYear();
  return loadData().records.filter(r => r.month.startsWith(String(year)));
}

function getCumulative() {
  return getYearRecords().reduce((sum, r) => sum + r.gross, 0);
}

// ── 予測 ───────────────────────────────────────
function predictOverMonth(limit) {
  const records = getYearRecords();
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => a.month.localeCompare(b.month));
  const total = sorted.reduce((s, r) => s + r.gross, 0);
  const avg = total / sorted.length;
  if (avg <= 0) return null;
  const remaining = limit - total;
  if (remaining <= 0) return '既に超過';
  const monthsLeft = Math.ceil(remaining / avg);
  const lastMonth = sorted[sorted.length - 1].month;
  const [y, m] = lastMonth.split('-').map(Number);
  let predictDate = new Date(y, m - 1 + monthsLeft, 1);
  if (predictDate.getFullYear() > getCurrentYear()) return '今年は超えない見込み';
  return `${predictDate.getMonth() + 1}月頃`;
}

// ── フォーマット ────────────────────────────────
function fmt(n) { return '¥' + Math.round(n).toLocaleString(); }

// ── チャート ────────────────────────────────────
let chart = null;

function renderChart() {
  const year = getCurrentYear();
  const records = getYearRecords();
  const monthMap = {};
  records.forEach(r => { monthMap[r.month] = (monthMap[r.month] || 0) + r.gross; });

  const labels = [];
  const values = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    labels.push(`${m}月`);
    values.push(monthMap[key] || 0);
  }

  const ctx = document.getElementById('incomeChart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '収入',
        data: values,
        backgroundColor: '#2563eb',
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => v >= 10000 ? (v / 10000) + '万' : v,
          },
        },
      },
    },
  });
}

// ── ダッシュボード更新 ──────────────────────────
function updateDashboard() {
  const settings = getSettings();
  const limit = getLimitAmount(settings);
  const cumulative = getCumulative();
  const remaining = Math.max(limit - cumulative, 0);
  const ratio = Math.min(cumulative / limit, 1);
  const juminzeiRatio = Math.min(JUMINZEI_LINE / limit, 1);

  const hasData = cumulative > 0 || Object.keys(settings).length > 0;

  document.getElementById('no-data-msg').style.display = hasData ? 'none' : 'block';

  // header
  document.getElementById('header-remaining').textContent = remaining.toLocaleString();

  // cards
  document.getElementById('remaining').textContent = fmt(remaining);
  document.getElementById('cumulative').textContent = fmt(cumulative);
  document.getElementById('limit-label').textContent = `上限：${fmt(limit)}`;

  const remainingMonths = 12 - new Date().getMonth();
  document.getElementById('remaining-months').textContent =
    remaining > 0 ? `残り${remainingMonths}ヶ月` : '今年の上限到達';

  // 住民税（地域別）
  const pref = settings.prefecture || null;
  const kintouWari = getKintouWari(pref);
  const estimatedJuminzei = calcJuminzei(cumulative, pref);
  document.getElementById('juminzei-line').textContent = fmt(JUMINZEI_LINE);
  const juminzeiStatus = cumulative >= JUMINZEI_LINE
    ? `発生中（推定 ${fmt(estimatedJuminzei)} ）`
    : `あと ${fmt(JUMINZEI_LINE - cumulative)} で発生`;
  document.getElementById('juminzei-status').textContent = juminzeiStatus;

  // 推定住民税カード
  const juminzeiCard = document.getElementById('estimated-juminzei');
  const juminzeiCardSub = document.getElementById('estimated-juminzei-sub');
  if (juminzeiCard) {
    juminzeiCard.textContent = cumulative >= JUMINZEI_LINE ? fmt(estimatedJuminzei) : '¥0';
    juminzeiCardSub.textContent = pref
      ? `${pref}（均等割 ${kintouWari.toLocaleString()}円）`
      : '地域を設定すると精度UP';
  }

  // 予測
  const pred = predictOverMonth(limit);
  document.getElementById('prediction').textContent = pred ?? '---';
  document.getElementById('prediction-sub').textContent = pred ? '壁を超える見込み' : 'データを入力してください';

  // progress
  const fillEl = document.getElementById('progress-fill');
  fillEl.style.width = (ratio * 100) + '%';
  fillEl.className = 'progress-fill' + (ratio >= 1 ? ' danger' : ratio >= 0.85 ? ' warn' : '');
  document.getElementById('progress-label').textContent = Math.round(ratio * 100) + '%';
  document.getElementById('progress-limit').textContent = fmt(limit);
  document.getElementById('progress-fill').style.width = (ratio * 100) + '%';

  const marker = document.getElementById('juminzei-marker');
  marker.style.left = (juminzeiRatio * 100) + '%';
  marker.style.display = juminzeiRatio <= 1 ? 'block' : 'none';

  renderChart();
}

// ── 履歴レンダリング ────────────────────────────
function renderHistory() {
  const records = getYearRecords().sort((a, b) => b.month.localeCompare(a.month));
  const el = document.getElementById('history-list');
  if (records.length === 0) {
    el.innerHTML = '<p style="color:#9ca3af;font-size:.875rem;text-align:center;padding:1rem">まだ入力がありません</p>';
    return;
  }
  el.innerHTML = records.map(r => {
    const [y, m] = r.month.split('-');
    return `
      <div class="history-item">
        <span class="history-month">${y}年${parseInt(m)}月</span>
        <span class="history-amount">${fmt(r.gross)}</span>
        <button class="history-delete" data-month="${r.month}">✕</button>
      </div>`;
  }).join('');

  el.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const month = btn.dataset.month;
      const data = loadData();
      data.records = data.records.filter(r => r.month !== month);
      saveData(data);
      renderHistory();
      updateDashboard();
      toast('削除しました');
    });
  });
}

// ── 設定フォーム初期化 ──────────────────────────
function initSettingsForm() {
  const sel = document.getElementById('setting-prefecture');
  PREFECTURES.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  });

  const settings = getSettings();
  if (settings.limitType) {
    document.getElementById('setting-limit').value = settings.limitType;
    if (settings.limitType === 'custom') {
      document.getElementById('custom-limit-row').style.display = 'flex';
      document.getElementById('setting-custom-limit').value = settings.customLimit || '';
    }
  }
  if (settings.prefecture) sel.value = settings.prefecture;
  if (settings.city) document.getElementById('setting-city').value = settings.city;

  document.getElementById('setting-limit').addEventListener('change', e => {
    document.getElementById('custom-limit-row').style.display =
      e.target.value === 'custom' ? 'flex' : 'none';
  });
}

// ── Toast ────────────────────────────────────────
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ── OCR ────────────────────────────────────────
function parseOcrText(text) {
  // 数字文字列を正規化（全角→半角、カンマ除去）
  const normalize = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/,|，/g, '');

  // 総支給額を探すキーワードパターン
  const grossPatterns = [
    /総支給[額]?[\s:：]*([0-9０-９,，]+)/,
    /支給合計[\s:：]*([0-9０-９,，]+)/,
    /総額[\s:：]*([0-9０-９,，]+)/,
    /支給[総合]計[\s:：]*([0-9０-９,，]+)/,
  ];
  // 交通費を探すキーワードパターン
  const transportPatterns = [
    /通勤手当[\s:：]*([0-9０-９,，]+)/,
    /交通費[\s:：]*([0-9０-９,，]+)/,
    /通勤費[\s:：]*([0-9０-９,，]+)/,
  ];

  let gross = null, transport = null;

  for (const pat of grossPatterns) {
    const m = text.match(pat);
    if (m) { gross = parseInt(normalize(m[1]), 10); break; }
  }
  for (const pat of transportPatterns) {
    const m = text.match(pat);
    if (m) { transport = parseInt(normalize(m[1]), 10); break; }
  }

  // フォールバック：行ごとにスキャン
  if (!gross || !transport) {
    const lines = text.split('\n');
    for (const line of lines) {
      if (!gross && /総支給|支給合計/.test(line)) {
        const nums = line.match(/[0-9０-９,，]{4,}/g);
        if (nums) gross = parseInt(normalize(nums[nums.length - 1]), 10);
      }
      if (!transport && /交通|通勤/.test(line)) {
        const nums = line.match(/[0-9０-９,，]{3,}/g);
        if (nums) transport = parseInt(normalize(nums[nums.length - 1]), 10);
      }
    }
  }

  return { gross: gross || 0, transport: transport || 0 };
}

function initOcr() {
  const dropzone = document.getElementById('ocr-dropzone');
  const fileInput = document.getElementById('ocr-file');
  const dropInner = document.getElementById('ocr-drop-inner');
  const preview = document.getElementById('ocr-preview');
  const status = document.getElementById('ocr-status');
  const statusText = document.getElementById('ocr-status-text');
  const result = document.getElementById('ocr-result');

  const showStatus = (msg) => {
    status.style.display = 'flex';
    statusText.textContent = msg;
    result.style.display = 'none';
  };
  const hideStatus = () => { status.style.display = 'none'; };

  async function runOcr(imageSource) {
    dropInner.style.display = 'none';
    preview.src = imageSource;
    preview.style.display = 'block';
    showStatus('日本語モデルを読み込み中...');

    try {
      const worker = await Tesseract.createWorker('jpn', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            statusText.textContent = `読み取り中... ${Math.round(m.progress * 100)}%`;
          }
        }
      });
      showStatus('テキストを解析中...');
      const { data: { text } } = await worker.recognize(imageSource);
      await worker.terminate();

      const extracted = parseOcrText(text);
      document.getElementById('ocr-gross').value = extracted.gross || '';
      document.getElementById('ocr-transport').value = extracted.transport || '';

      hideStatus();
      result.style.display = 'block';
    } catch (err) {
      hideStatus();
      dropInner.style.display = 'block';
      preview.style.display = 'none';
      toast('読み取りに失敗しました。別の画像をお試しください。');
    }
  }

  // クリックで選択
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    runOcr(url);
  });

  // ドラッグ＆ドロップ
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    runOcr(URL.createObjectURL(file));
  });

  // クリップボードから貼り付け（Ctrl+V）
  document.addEventListener('paste', e => {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab || activeTab.id !== 'tab-input') return;
    const items = Array.from(e.clipboardData.items);
    const img = items.find(i => i.type.startsWith('image/'));
    if (!img) return;
    const url = URL.createObjectURL(img.getAsFile());
    runOcr(url);
  });

  // フォームに反映
  document.getElementById('ocr-apply').addEventListener('click', () => {
    const gross = document.getElementById('ocr-gross').value;
    const transport = document.getElementById('ocr-transport').value;
    if (gross) document.getElementById('input-gross').value = gross;
    if (transport) document.getElementById('input-transport').value = transport;
    result.style.display = 'none';
    dropInner.style.display = 'block';
    preview.style.display = 'none';
    fileInput.value = '';
    toast('フォームに反映しました。内容を確認して登録してください。');
    document.getElementById('input-gross').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // やり直す
  document.getElementById('ocr-retry').addEventListener('click', () => {
    result.style.display = 'none';
    dropInner.style.display = 'block';
    preview.style.display = 'none';
    fileInput.value = '';
  });
}

// ── 初期化 ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // タブ切り替え
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'dashboard') updateDashboard();
      if (tab.dataset.tab === 'input') renderHistory();
    });
  });

  // デフォルト月を今月にセット
  const now = new Date();
  document.getElementById('input-month').value =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 明細入力フォーム
  document.getElementById('input-form').addEventListener('submit', e => {
    e.preventDefault();
    const month = document.getElementById('input-month').value;
    const grossRaw = document.getElementById('input-gross').value;
    const transport = sanitizeAmount(document.getElementById('input-transport').value);

    // バリデーション
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      toast('対象月を正しく入力してください');
      return;
    }
    if (grossRaw === '' || Number(grossRaw) < 0 || !Number.isFinite(Number(grossRaw))) {
      toast('総支給額を正しく入力してください');
      return;
    }
    const gross = sanitizeAmount(grossRaw);

    const data = loadData();
    // 同月は上書き
    const existed = data.records.some(r => r.month === month);
    data.records = data.records.filter(r => r.month !== month);
    data.records.push({ month, gross, transport });
    if (!saveData(data)) return; // 保存失敗時は中断

    document.getElementById('input-gross').value = '';
    document.getElementById('input-transport').value = '0';

    renderHistory();
    updateDashboard();
    toast(existed ? `${parseInt(month.split('-')[1])}月の明細を更新しました` : '登録しました！');
  });

  // 設定フォーム
  document.getElementById('settings-form').addEventListener('submit', e => {
    e.preventDefault();
    const limitType = document.getElementById('setting-limit').value;
    const customLimit = document.getElementById('setting-custom-limit').value;
    const prefecture = document.getElementById('setting-prefecture').value;
    const city = document.getElementById('setting-city').value;

    const data = loadData();
    data.settings = { limitType, customLimit, prefecture, city };
    saveData(data);
    updateDashboard();
    toast('設定を保存しました');
  });

  // エクスポート
  document.getElementById('btn-export').addEventListener('click', () => {
    const data = loadData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `baito-zankin-${getCurrentYear()}.json`;
    a.click();
  });

  // リセット
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('全データを削除します。よろしいですか？')) {
      localStorage.removeItem('baito_data');
      location.reload();
    }
  });

  // モーダル（免責事項・プライバシーポリシー）
  document.querySelectorAll('.footer-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.modal);
      if (modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    const close = () => { overlay.hidden = true; document.body.style.overflow = ''; };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not([hidden])').forEach(o => {
        o.hidden = true; document.body.style.overflow = '';
      });
    }
  });

  // ストレージ利用不可の警告
  if (!isStorageAvailable()) {
    toast('プライベートモードではデータが保存できません');
  }

  initSettingsForm();
  initOcr();
  updateDashboard();
});

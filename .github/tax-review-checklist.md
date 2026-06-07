## 税制レビュー チェックリスト

税制改正で「年収の壁」や住民税が変わっていないか、毎年確認してください。
変更があれば `calc.js` の定数・`PREF_KINTOU_WARI` と、各HTML・記事の数値を更新します。

### 1. 年収の壁（calc.js の定数）
- [ ] 給与所得控除の最低額（現在 65万円 / `KYUYO_KOJO`）
- [ ] 住民税の基礎控除（現在 53万円 / `KISO_JUMINZEI`）
- [ ] **本人の所得税の壁（現在 160万円 / `SHOTOKUZEI_LINE`）**
      ※ 基礎控除の上乗せ特例は **令和7・8年分（2025〜2026年）限定**。2027年分以降の扱いを要確認
- [ ] 社会保険の壁（130万円 / `SHAHO_LINE`、106万円の要件）
- [ ] 特定親族特別控除・勤労学生控除の上限（150万円 / `TOKUTEI_FUYO_LINE`）

### 2. 住民税
- [ ] 均等割の標準額（現在 5,000円 / `KINTOU_WARI_BASE`）と森林環境税の扱い
- [ ] 都道府県の超過課税（`PREF_KINTOU_WARI`）の改廃・金額変更（特に期限切れ）
- [ ] 非課税限度額・調整控除（`KINTOU_HIKAZEI_GOUKEI` / `JINTEKI_KOJO_SA`）

### 3. 反映する場所
- [ ] `calc.js`（定数・テーブル）
- [ ] `test/calc.test.js` と `test.html`（期待値を更新）
- [ ] `index.html`（設定の選択肢・ガイド・FAQ・構造化データ）
- [ ] 記事3本（`kabe-130man.html` / `kinrou-gakusei-kojo.html` / `baito-juminzei.html`）
- [ ] `sitemap.xml` の `lastmod` を更新

### 4. 確認の出典
- 国税庁（令和○年度 税制改正）
- 各都道府県・市区町村の公式サイト（住民税・超過課税）
- 日本年金機構（社会保険）

> 作業後は `node test/calc.test.js` と `node test/healthcheck.js` が通ることを確認してから push してください。

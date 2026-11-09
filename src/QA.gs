/**
 * Q&A の読み込みと保存
 *
 * syncQA() が1時間ごとにスプレッドシートを読み、次の2種類を保存する。
 *   QA_ALL … 全タブ・全行（社内 Chat ボット用）
 *   QA_PUB … 「公開」列が○の行だけ（クライアント向け Web アプリ用）
 * 保存先はスクリプトプロパティ（圧縮して分割保存）。Chat ボットは質問した本人の
 * 権限で動くため、社員にスプレッドシートの閲覧権限がなくても回答できる。
 */

function syncQA() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const all = [];
  const pub = [];
  let no = 0;

  ss.getSheets().forEach(function (sheet) {
    const tab = sheet.getName().trim();
    if (isSystemSheet_(tab)) return;

    const values = sheet.getDataRange().getDisplayValues();
    if (values.length < 2) return;

    const header = values[0].map(function (h) { return String(h).trim(); });
    const qCol = header.findIndex(function (h) { return h.indexOf('質問') >= 0; });
    const aCol = header.findIndex(function (h) { return h.indexOf('回答') >= 0; });
    if (qCol < 0 || aCol < 0) return; // Q&A 形式でないタブは読まない

    // カテゴリー列：見出しに「カテゴリ」があればその列、なければ質問列より左の先頭列
    let cCol = header.findIndex(function (h) { return h.indexOf('カテゴリ') >= 0; });
    if (cCol < 0 && qCol > 0) cCol = 0;

    const pCol = header.findIndex(function (h) { return h.indexOf(CONFIG.PUBLIC_COLUMN) >= 0; });
    const clientTab = !CONFIG.CLIENT_EXCLUDED_TABS.some(function (w) { return tab.indexOf(w) >= 0; });

    for (let r = 1; r < values.length; r++) {
      const q = clean_(values[r][qCol]);
      const a = clean_(values[r][aCol]);
      if (!q || !a) continue; // 回答が未記入の行は使わない
      no++;
      const item = { no: no, tab: tab, cat: cCol >= 0 ? clean_(values[r][cCol]) : '', q: q, a: a };
      all.push(item);
      if (clientTab && pCol >= 0 && isPublicMark_(values[r][pCol])) pub.push(item);
    }
  });

  saveText_('QA_ALL', formatQA_(all));
  saveText_('QA_PUB', formatQA_(pub));
  PropertiesService.getScriptProperties().setProperties({
    QA_COUNT_ALL: String(all.length),
    QA_COUNT_PUB: String(pub.length),
    QA_UPDATED: new Date().toISOString(),
  });

  flushChatLogs_(ss);
  issueCodes_(ss);
  cleanupCounters_();
  console.log('Q&A を読み込みました：全 ' + all.length + ' 件／クライアント公開 ' + pub.length + ' 件');
}

function formatQA_(items) {
  return items.map(function (it) {
    return '### No.' + it.no + '［' + it.tab + (it.cat ? '／' + it.cat : '') + '］\n' +
      '質問：' + it.q + '\n回答：' + it.a;
  }).join('\n\n');
}

function isSystemSheet_(tab) {
  return tab === CONFIG.CLIENT_SHEET_NAME || tab.indexOf(CONFIG.LOG_SHEET_NAME) === 0;
}

function isPublicMark_(v) {
  const s = String(v || '').trim();
  return CONFIG.PUBLIC_MARKS.indexOf(s) >= 0;
}

function clean_(v) {
  return String(v || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- スクリプトプロパティへの保存（gzip＋base64 で分割） ---------- */

const CHUNK_CHARS_ = 8000; // プロパティ1件の上限（9KB）に収まる長さ

function saveText_(key, text) {
  const props = PropertiesService.getScriptProperties();
  const oldN = Number(props.getProperty(key + '_N') || 0);
  let b64 = '';
  if (text) {
    const blob = Utilities.newBlob('').setDataFromString(text, 'UTF-8');
    b64 = Utilities.base64Encode(Utilities.gzip(blob).getBytes());
  }
  const chunks = {};
  let n = 0;
  for (let i = 0; i < b64.length; i += CHUNK_CHARS_) {
    chunks[key + '_' + n] = b64.slice(i, i + CHUNK_CHARS_);
    n++;
  }
  chunks[key + '_N'] = String(n);
  props.setProperties(chunks);
  for (let i = n; i < oldN; i++) props.deleteProperty(key + '_' + i);
}

function loadText_(key) {
  const all = PropertiesService.getScriptProperties().getProperties();
  const n = Number(all[key + '_N'] || 0);
  if (!n) return '';
  let b64 = '';
  for (let i = 0; i < n; i++) b64 += all[key + '_' + i] || '';
  const gz = Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip');
  return Utilities.ungzip(gz).getDataAsString('UTF-8');
}

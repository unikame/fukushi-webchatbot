/**
 * 質問ログ（スプレッドシートの「質問ログ」タブ）
 *
 *   ・Web アプリ … デプロイしたアカウントの権限で動くので、その場で直接書き込む
 *   ・Chat ボット … 社員本人の権限で動き、スプシに書けないため、いったん
 *                   スクリプトプロパティに貯めて syncQA() のたびに書き出す
 *
 * 以前の5列（日時〜判定）のログはそのまま残し、右に列を足して使う。
 */

const LOG_HEADER_ = ['日時', '質問者', '質問', 'ボットの回答', '判定', '利用元', '評価', 'ログID'];

function ensureLogSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    sheet.setFrozenRows(1);
  }
  const current = sheet.getRange(1, 1, 1, LOG_HEADER_.length).getDisplayValues()[0];
  if (current.join('|') !== LOG_HEADER_.join('|')) {
    sheet.getRange(1, 1, 1, LOG_HEADER_.length).setValues([LOG_HEADER_]);
  }
  return sheet;
}

/* ---------- Chat ボット ---------- */

function bufferChatLog_(userName, question, answer, notFound) {
  try {
    const key = 'LOG_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
      t: new Date().toISOString(),
      u: userName,
      q: question.slice(0, 1000),
      a: answer.slice(0, 1000),
      f: notFound ? '該当なし' : '回答済み',
    }));
  } catch (e) {
    console.warn('ログ保存に失敗: ' + e.message);
  }
}

function flushChatLogs_(ss) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const keys = Object.keys(all).filter(function (k) { return k.indexOf('LOG_') === 0; }).sort();
  if (!keys.length) return;

  const sheet = ensureLogSheet_(ss);
  const rows = keys.map(function (k) {
    const r = JSON.parse(all[k]);
    return [new Date(r.t), r.u, r.q, r.a, r.f, r.s || 'Chat', '', ''];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_HEADER_.length).setValues(rows);
  keys.forEach(function (k) { props.deleteProperty(k); });
}

/* ---------- Web アプリ ---------- */

function writeWebLog_(clientName, question, answer, notFound) {
  const id = Utilities.getUuid().slice(0, 8);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureLogSheet_(SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID));
    sheet.appendRow([new Date(), clientName, question.slice(0, 1000), answer.slice(0, 2000),
      notFound ? '該当なし' : '回答済み', 'Web', '', id]);
  } finally {
    lock.releaseLock();
  }
  return id;
}

function setFeedback_(logId, value, clientName) {
  const sheet = ensureLogSheet_(SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID));
  const idCol = LOG_HEADER_.indexOf('ログID') + 1;
  const cell = sheet.getRange(1, idCol, sheet.getLastRow(), 1)
    .createTextFinder(logId).matchEntireCell(true).findNext();
  if (!cell) return false;
  const row = cell.getRow();
  // 他のクライアントのログには書き込ませない
  if (sheet.getRange(row, 2).getDisplayValue() !== clientName) return false;
  sheet.getRange(row, LOG_HEADER_.indexOf('評価') + 1).setValue(value);
  return true;
}

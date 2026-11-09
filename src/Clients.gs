/**
 * クライアントのアクセスコードと利用回数の管理
 *
 * 「クライアント管理」タブにクライアント名を入力すると、アクセスコードが自動で発行される
 * （編集時のトリガー、または1時間ごとの syncQA で発行）。
 * 状態を「停止」にすると、1分以内にそのコードでは使えなくなる。
 */

const CLIENT_HEADER_ = ['クライアント名', 'アクセスコード', '状態', '1日の上限回数', '発行日', '停止日', '備考'];
const CODE_CHARS_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 見間違えやすい 0/O/1/I は使わない
const CODE_LENGTH_ = 10;

function ensureClientSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.CLIENT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.CLIENT_SHEET_NAME);
    sheet.getRange(1, 1, 1, CLIENT_HEADER_.length).setValues([CLIENT_HEADER_]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 240);
    sheet.setColumnWidth(2, 140);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(['有効', '停止'], true).build();
    sheet.getRange('C2:C1000').setDataValidation(rule);
  }
  return sheet;
}

/** 名前があってコードがない行にコードを発行する */
function issueCodes_(ss) {
  const sheet = ensureClientSheet_(ss || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID));
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const range = sheet.getRange(2, 1, last - 1, CLIENT_HEADER_.length);
  const values = range.getValues();
  const used = {};
  values.forEach(function (r) { if (r[1]) used[normalizeCode_(r[1])] = true; });

  let issued = 0;
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  values.forEach(function (r) {
    const name = String(r[0] || '').trim();
    if (!name) return;
    if (!r[1]) {
      let code;
      do { code = generateCode_(); } while (used[code]);
      used[code] = true;
      r[1] = code;
      r[4] = r[4] || today;
      issued++;
    }
    if (!r[2]) r[2] = '有効';
    if (r[2] === '停止' && !r[5]) r[5] = today;
    if (r[3] === '' || r[3] === null) r[3] = CONFIG.DEFAULT_DAILY_LIMIT;
  });
  range.setValues(values);
  CacheService.getScriptCache().remove('CLIENTS');
  return issued;
}

/** 「クライアント管理」タブが編集されたとき（setup() で登録する編集トリガー） */
function onClientSheetEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== CONFIG.CLIENT_SHEET_NAME) return;
  issueCodes_(e.source);
}

function generateCode_() {
  let s = '';
  for (let i = 0; i < CODE_LENGTH_; i++) {
    s += CODE_CHARS_.charAt(Math.floor(Math.random() * CODE_CHARS_.length));
  }
  return s;
}

function normalizeCode_(code) {
  return String(code || '').toUpperCase().replace(/[\s\-ー－]/g, '');
}

/** コードから有効なクライアントを探す。見つからない・停止中は null */
function findClient_(code) {
  const c = normalizeCode_(code);
  if (c.length !== CODE_LENGTH_) return null;
  const cache = CacheService.getScriptCache();
  let list = null;
  const cached = cache.get('CLIENTS');
  if (cached) {
    list = JSON.parse(cached);
  } else {
    const sheet = ensureClientSheet_(SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID));
    const last = sheet.getLastRow();
    const values = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 4).getValues();
    list = values
      .filter(function (r) { return r[0] && r[1]; })
      .map(function (r) {
        return { name: String(r[0]).trim(), code: normalizeCode_(r[1]), status: String(r[2] || '').trim(), limit: Number(r[3]) || CONFIG.DEFAULT_DAILY_LIMIT };
      });
    cache.put('CLIENTS', JSON.stringify(list), 60); // 停止などの変更は1分以内に反映
  }
  const hit = list.filter(function (x) { return x.code === c; })[0];
  return hit && hit.status === '有効' ? hit : null;
}

/* ---------- 利用回数 ---------- */

/** 1回分を数え、上限内なら true。上限を超えていたら数えずに false */
function takeQuota_(client) {
  const props = PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  const kAll = 'CNT_' + day + '_ALL';
  const kOne = 'CNT_' + day + '_' + client.code;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const nAll = Number(props.getProperty(kAll) || 0);
    const nOne = Number(props.getProperty(kOne) || 0);
    if (nAll >= CONFIG.GLOBAL_DAILY_LIMIT) return { ok: false, reason: 'global' };
    if (nOne >= client.limit) return { ok: false, reason: 'client' };
    props.setProperties({ [kAll]: String(nAll + 1), [kOne]: String(nOne + 1) });
    return { ok: true, remaining: client.limit - nOne - 1 };
  } finally {
    lock.releaseLock();
  }
}

/** 前日以前のカウンターを消す（syncQA から呼ぶ） */
function cleanupCounters_() {
  const props = PropertiesService.getScriptProperties();
  const today = 'CNT_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd') + '_';
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf('CNT_') === 0 && k.indexOf(today) !== 0) props.deleteProperty(k);
  });
}

/* ---------- コードの総当たり対策 ---------- */

const FAIL_LIMIT_ = 50;      // 10分間に全体でこの回数まちがえたら
const FAIL_WINDOW_SEC_ = 600; // 10分間ログインを受け付けない

function loginLocked_() {
  return Number(CacheService.getScriptCache().get('LOGIN_FAILS') || 0) >= FAIL_LIMIT_;
}

function recordLoginFail_() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('LOGIN_FAILS') || 0) + 1;
  cache.put('LOGIN_FAILS', String(n), FAIL_WINDOW_SEC_);
}

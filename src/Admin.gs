/**
 * 管理者用（Apps Script エディタから実行する関数）
 */

/** 初回と、コードを更新したあとに1回実行：シート準備・トリガー登録・Q&A読み込み */
function setup() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  removeOldStorage_();
  ensureLogSheet_(ss);
  ensureClientSheet_(ss);

  const handlers = ['syncQA', 'onClientSheetEdit'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncQA').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('onClientSheetEdit').forSpreadsheet(ss).onEdit().create();

  syncQA();
}

/** 以前のバージョン（ver.4まで）の保存形式を消す。貯まっていたログは先に書き出す */
function removeOldStorage_() {
  const props = PropertiesService.getScriptProperties();
  flushChatLogs_(SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID));
  Object.keys(props.getProperties()).forEach(function (k) {
    if (/^QA_\d+$/.test(k) || k === 'QA_CHUNKS' || k === 'QA_COUNT') props.deleteProperty(k);
  });
}

/** クライアント管理タブで、コードが空の行にすぐ発行したいとき */
function issueCodes() {
  const n = issueCodes_();
  console.log(n + ' 件のアクセスコードを発行しました');
}

/** 動作確認：社内向け（全件）の回答 */
function testAsk() {
  runTest_('グループホームで同じ日に複数の利用者さんを訪問したとき、基本療養費はどうなりますか？', 'internal');
}

/** 動作確認：クライアント向け（公開行のみ）の回答 */
function testClientAsk() {
  const n = PropertiesService.getScriptProperties().getProperty('QA_COUNT_PUB') || '0';
  console.log('クライアントに公開中の Q&A：' + n + ' 件');
  runTest_('グループホームで同じ日に複数の利用者さんを訪問したとき、基本療養費はどうなりますか？', 'client');
}

function runTest_(q, audience) {
  const start = Date.now();
  const result = answerQuestion_(q, audience);
  console.log(result.answer);
  console.log('判定：' + (result.notFound ? '該当なし' : '回答済み') +
    '／回答までの時間：' + ((Date.now() - start) / 1000).toFixed(1) + ' 秒');
}

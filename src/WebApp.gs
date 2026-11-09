/**
 * クライアント向け Web アプリ
 *
 * デプロイ設定：「次のユーザーとして実行」＝自分、「アクセスできるユーザー」＝全員
 * 画面から呼ばれる関数は webLogin / webAsk / webFeedback の3つだけ。
 * どれも毎回アクセスコードを確かめ、停止中のコードは使えない。
 */

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appTitle = CONFIG.APP_TITLE;
  t.contact = CONFIG.CONTACT_CLIENT;
  t.suggestionsJson = JSON.stringify(CONFIG.SUGGESTIONS).replace(/</g, '\\u003c');
  t.maxLength = CONFIG.MAX_QUESTION_LENGTH;
  return t.evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** テンプレートから部品ファイルを読み込む */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

const BAD_CODE_MESSAGE_ = 'アクセスコードが正しくないか、利用が停止されています。';

function webLogin(code) {
  if (loginLocked_()) {
    return { ok: false, message: 'ただいまログインを受け付けていません。10分ほどおいて再度お試しください。' };
  }
  const client = findClient_(code);
  if (!client) {
    recordLoginFail_();
    return { ok: false, message: BAD_CODE_MESSAGE_ };
  }
  return { ok: true, name: client.name };
}

function webAsk(code, question) {
  const client = findClient_(code);
  if (!client) return { ok: false, logout: true, message: BAD_CODE_MESSAGE_ };

  const q = String(question || '').trim();
  if (!q) return { ok: false, message: '質問を入力してください。' };
  if (q.length > CONFIG.MAX_QUESTION_LENGTH) {
    return { ok: false, message: '質問は ' + CONFIG.MAX_QUESTION_LENGTH + ' 文字以内で入力してください。' };
  }

  const quota = takeQuota_(client);
  if (!quota.ok) {
    return {
      ok: false,
      message: quota.reason === 'client'
        ? '本日の質問回数の上限に達しました。明日またご利用ください。お急ぎの場合は ' + CONFIG.CONTACT_CLIENT + ' までお問い合わせください。'
        : 'ただいま混み合っています。時間をおいて再度お試しください。',
    };
  }

  try {
    const result = answerQuestion_(q, 'client');
    const logId = result.skipped ? '' : writeWebLog_(client.name, q, result.answer, result.notFound);
    return { ok: true, answer: result.answer, notFound: result.notFound, logId: logId };
  } catch (e) {
    console.error(e);
    return { ok: false, message: 'エラーのため回答できませんでした。少し時間をおいて再度お試しください。' };
  }
}

function webFeedback(code, logId, helpful) {
  const client = findClient_(code);
  if (!client || !logId) return { ok: false };
  const saved = setFeedback_(String(logId), helpful ? '役に立った' : '役に立たなかった', client.name);
  return { ok: saved };
}

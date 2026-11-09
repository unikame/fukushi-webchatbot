/**
 * 社内向け Google Chat ボット
 * （Chat アプリの「Apps Script プロジェクト」接続から呼ばれる）
 */

function onMessage(event) {
  const isAddon = !!event.chat;
  const msg = isAddon ? event.chat.messagePayload.message : event.message;
  const user = isAddon ? event.chat.user : event.user;
  const text = String((msg && (msg.argumentText || msg.text)) || '').trim();

  let reply;
  if (!text) {
    reply = '質問を入力してください。';
  } else if (/^(help|ヘルプ|使い方)$/i.test(text)) {
    reply = chatHelpText_();
  } else {
    try {
      const result = answerQuestion_(text, 'internal');
      reply = result.answer;
      if (!result.skipped) {
        bufferChatLog_((user && (user.displayName || user.name)) || '', text, result.answer, result.notFound);
      }
    } catch (e) {
      console.error(e);
      reply = 'すみません、エラーのため回答できませんでした。少し時間をおいて再度お試しください。\n（' + e.message + '）';
    }
  }
  return chatReply_(reply, isAddon);
}

function onAddedToSpace(event) {
  return chatReply_('追加ありがとうございます。\n' + chatHelpText_(), !!event.chat);
}

function onRemovedFromSpace(event) {
  // 何もしない
}

function chatHelpText_() {
  const n = PropertiesService.getScriptProperties().getProperty('QA_COUNT_ALL') || '?';
  return '訪問看護Q&Aボットです（登録 ' + n + ' 件／' + CONFIG.VERSION + '）。\n' +
    '加算・指示書・請求・採用・働き方などの質問を、そのまま文章で送ってください。\n' +
    'Q&Aにない内容は「' + CONFIG.NOT_FOUND_MARK + '」と表示されます。その場合は' + CONFIG.CONTACT_INTERNAL + 'に確認してください。';
}

function chatReply_(text, isAddon) {
  if (isAddon) {
    return { hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: text } } } } };
  }
  return { text: text };
}

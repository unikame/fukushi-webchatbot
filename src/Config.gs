/**
 * 訪問看護Q&A（社内 Google Chat ボット＋クライアント向け Web アプリ）
 *
 * 設定はこのファイルだけで変更できます。
 * 仕組みと手順は README.md を参照してください。
 */

const CONFIG = {
  VERSION: 'ver.5',

  // Q&A のスプレッドシート（訪問看護Q＆A）
  SPREADSHEET_ID: '1oBd-7wCCEbu5BMXXI1t1annfhFARDWJThlDfLPCTAJI',
  LOG_SHEET_NAME: '質問ログ',          // 自動で作成・追記
  CLIENT_SHEET_NAME: 'クライアント管理', // 自動で作成

  // クライアントに使う Q&A の条件
  PUBLIC_COLUMN: '公開',                       // 各タブの見出しにこの文字を含む列
  PUBLIC_MARKS: ['○', '◯', '〇', '公開'],       // この値の行だけをクライアントに使う
  CLIENT_EXCLUDED_TABS: ['求職者'],             // タブ名にこの文字を含むタブは、○があってもクライアントに使わない

  // Gemini（Google Cloud「horenso」の Vertex AI）
  GCP_PROJECT_ID: 'horenso-510409',
  LOCATION: 'asia-northeast1',  // 使うモデルがこのリージョンにない場合は 'global'
  MODEL: 'gemini-2.5-flash',    // 費用を抑えるなら 'gemini-2.5-flash-lite'
  MAX_TOKENS: 2048,
  THINKING: false,              // true にすると考えてから答える（精度↑・速度↓・費用↑）

  // 回答の表示
  NOT_FOUND_MARK: '【該当なし】',
  CONTACT_INTERNAL: '本部の担当者',            // 社内ボットで【該当なし】のときの案内先
  CONTACT_CLIENT: '[本部の問い合わせ先]',      // クライアントに案内する問い合わせ先（電話・メールなどに書き換える）

  // Web アプリ
  APP_TITLE: '訪問看護Q&A',
  DEFAULT_DAILY_LIMIT: 30,     // 1クライアントあたり1日の質問回数（管理タブで個別に変更可）
  GLOBAL_DAILY_LIMIT: 300,     // 全クライアント合計の1日の上限
  MAX_QUESTION_LENGTH: 500,    // 1回の質問の最大文字数
  SUGGESTIONS: [               // 「よくある質問」ボタン（公開する Q&A にある内容にする）
    'グループホームで複数名訪問したときの療養費',
    '複数名訪問加算をとる条件',
    'カルテはスマホでも見られる？',
    '自立支援医療を使ったときの自己負担',
  ],
};

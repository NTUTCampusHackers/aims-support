chrome.runtime.onInstalled.addListener(() => {
  // 1. 拡張機能インストール時に、まずは全ページでアイコンを無効化（グレーアウト）する
  chrome.action.disable();

  // 2. 既存のルールをクリアして、新しいルールを追加する
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      // 条件: URLのホスト名が 'aims.ad.tsukuba-tech.ac.jp' の場合
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: 'aims.ad.tsukuba-tech.ac.jp' },
        })
      ],
      // 動作: アクション（アイコン）を有効にする
      actions: [new chrome.declarativeContent.ShowAction()]
    }]);
  });
});

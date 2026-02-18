// ボタンの要素を取得
const extractBtn = document.getElementById("extractBtn");
const resultArea = document.getElementById("resultArea");

extractBtn.addEventListener("click", async () => {
  // 1. 現在のアクティブなタブを取得する
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // 2. そのタブでスクリプトを実行する
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getPageText, // 実行したい関数を指定
  }, (results) => {
    // 3. 結果を受け取って画面に表示する
    if (results && results[0] && results[0].result) {
      resultArea.value = results[0].result;
    } else {
      resultArea.value = "テキストが見つかりませんでした。";
    }
  });
});

// ページ内で実行される関数（この中身がブラウザの画面側で動きます）
function getPageText() {
  return document.body.innerText;
}

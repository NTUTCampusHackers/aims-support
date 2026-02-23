const extractBtn = document.getElementById("extractBtn");
const creditOkValue = document.getElementById("creditOkValue");
const creditNgValue = document.getElementById("creditNgValue");

extractBtn.addEventListener("click", async () => {
  // 現在のアクティブなタブを取得
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // ページ内で集計関数を実行
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: calculateCredits,
  }, (results) => {
    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      creditOkValue.textContent = `${data.creditTotal} 単位`;
      creditNgValue.textContent = `${data.noCreditTotal} 単位`;
    } else {
      alert("成績データの読み取りに失敗しました。");
    }
  });
});

// --- ここから下のコードが対象のWebページ上で実行されます ---
function calculateCredits() {
  const text = document.body.innerText;
  const lines = text.split('\n');

  let creditTotal = 0;
  let noCreditTotal = 0;
  let parsedSubjects = new Set(); // 重複カウント防止用のセット

  lines.forEach(line => {
    // タブ、または2つ以上の空白で区切る
    const parts = line.trim().split(/\t+|\s{2,}/);

    if (parts.length >= 5) {
      let gradeIndex = -1;

      // 行の後ろの方から「評価（A+, A, B, C, D）」を探す
      for (let i = parts.length - 2; i >= 1; i--) {
        if (/^(A\+|A|B|C|D)$/.test(parts[i].trim())) {
          // 評価の次の列が「単位数（数字）」か確認
          if (/^\d+$/.test(parts[i + 1].trim())) {
            gradeIndex = i;
            break;
          }
        }
      }

      if (gradeIndex !== -1) {
        const grade = parts[gradeIndex].trim();
        const credit = parseInt(parts[gradeIndex + 1].trim(), 10);
        const subjectName = parts[1].trim(); // 科目名（通常左から2番目）

        // 科目名がまだ集計されていない場合のみ加算（重複防止）
        if (!parsedSubjects.has(subjectName)) {
          parsedSubjects.add(subjectName);

          if (grade === 'D') {
            noCreditTotal += credit;
          } else {
            creditTotal += credit;
          }
        }
      }
    }
  });

  return { creditTotal, noCreditTotal };
}

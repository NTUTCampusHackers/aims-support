// ==========================================
// 1. 単位集計機能（変更なし）
// ==========================================
const extractBtn = document.getElementById("extractBtn");
const creditOkValue = document.getElementById("creditOkValue");
const creditNgValue = document.getElementById("creditNgValue");

extractBtn.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

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

function calculateCredits() {
  const text = document.body.innerText;
  const lines = text.split('\n');

  let creditTotal = 0;
  let noCreditTotal = 0;
  let parsedSubjects = new Set();

  lines.forEach(line => {
    const parts = line.trim().split(/\t+|\s{2,}/);
    if (parts.length >= 5) {
      let gradeIndex = -1;
      for (let i = parts.length - 2; i >= 1; i--) {
        if (/^(A\+|A|B|C|D)$/.test(parts[i].trim())) {
          if (/^\d+$/.test(parts[i + 1].trim())) {
            gradeIndex = i;
            break;
          }
        }
      }
      if (gradeIndex !== -1) {
        const grade = parts[gradeIndex].trim();
        const credit = parseInt(parts[gradeIndex + 1].trim(), 10);
        const subjectName = parts[1].trim();

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

// ==========================================
// 2. 分野別講義リスト表示機能（新しいJSON構造に対応）
// ==========================================
const categorySelect = document.getElementById("categorySelect");
const courseList = document.getElementById("courseList");
let coursesData = [];

// JSONファイルを読み込む
fetch(chrome.runtime.getURL('courses.json'))
  .then(response => response.json())
  .then(data => {
    coursesData = data;

    // JSONのデータから重複しないようにカテゴリ（分野区分）を抽出
    const categories = [...new Set(coursesData.map(course => course.category))];

    // プルダウンにカテゴリを追加
    categories.forEach(category => {
      // 空欄のカテゴリを除外したい場合はここでチェック
      if (category) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
      }
    });
  })
  .catch(error => {
    console.error("データの読み込みに失敗しました:", error);
    courseList.innerHTML = "<li class='course-item'>データベースの読み込みに失敗しました。</li>";
  });

// プルダウンの選択が変更された時の処理
categorySelect.addEventListener("change", (e) => {
  const selectedCategory = e.target.value;
  courseList.innerHTML = "";

  if (!selectedCategory) {
    courseList.innerHTML = "<li class='course-item'>分野を選択するとここに講義が表示されます。</li>";
    return;
  }

  // 選ばれたカテゴリに一致する講義を抽出
  const filteredCourses = coursesData.filter(course => course.category === selectedCategory);

  if (filteredCourses.length === 0) {
    courseList.innerHTML = "<li class='course-item'>該当する講義がありません。</li>";
    return;
  }

  // 抽出した講義をリスト形式でHTMLに追加
  filteredCourses.forEach(course => {
    const li = document.createElement("li");
    li.className = "course-item";

    // データが存在しない場合のフォールバック（ハイフン等）を設定
    const title = course.title || "不明な講義";
    const credits = course.credits || "-";
    const grade = course.grade || "-";
    const reqOrChoice = course.required_or_choice || "-";
    const semester = course.semester || "-";
    const category = course.category || "-";

    // 表示するHTMLを組み立てる
    li.innerHTML = `
      <div class="course-title">${title}</div>
      <div class="course-details">
        分野: ${category}<br>
        単位: ${credits} | 評価: <span class="grade">${grade}</span><br>
        区分: ${reqOrChoice} | 時期: ${semester}
      </div>
    `;
    courseList.appendChild(li);
  });
});

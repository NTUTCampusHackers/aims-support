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
// 2. コース・分野別講義リスト表示機能（マッピング対応版）
// ==========================================

// 表示名と .json 内の sheet_name の紐付けルール
const courseMapping = {
  "産業情報学科（1年）": ["1教養教育(産業情報)", "2専門基礎(産業情報)"],
  "産業情報学科 -情報科学コース-": ["1教養教育(産業情報)", "2専門基礎(産業情報)", "3専門基教(情報科学)", "4専門教育(情報科学)"],
  "産業情報学科 -先端機械工学コース-": ["1教養教育(産業情報)", "2専門基礎(産業情報)", "x5専門基教(先端機械)", "5専門基教(先端機械)", "x6専門教育(先端機械)", "6専門基教(先端機械)"],
  "産業情報学科 -建築学コース-": ["1教養教育(産業情報)", "2専門基礎(産業情報)", "7専門基教(建築学)", "8専門教育(建築)"],
  "産業情報学科 -支援技術学コース-": ["1教養教育(産業情報)", "2専門基礎(産業情報)", "9専門基教(支援-情報)", "10専門教育(支援-情報)", "11専門基教(支援-機器)", "12専門教育(支援-機器)", "13専門基教(支援-住環境)", "14専門教育(支援-住環境)"],
  "総合デザイン学科（1年）": ["1教養教育（デザイン）"],
  "総合デザイン学科 -クリエイティブデザイン学": ["1教養教育（デザイン）", "3専門（クリエイティブ）"],
  "総合デザイン学科 -支援技術学-": ["1教養教育（デザイン）", "4専門（支援-アクセシブル)"]
};

const courseSelect = document.getElementById("courseSelect");
const categorySelect = document.getElementById("categorySelect");
const courseList = document.getElementById("courseList");
let coursesData = [];

// JSONファイルを読み込む
fetch(chrome.runtime.getURL('courses.json'))
  .then(response => response.json())
  .then(data => {
    coursesData = data;

    // JSONのsheet_nameではなく、マッピングのキー（表示名）をプルダウンに追加する
    Object.keys(courseMapping).forEach(displayName => {
      const option = document.createElement("option");
      option.value = displayName;
      option.textContent = displayName;
      courseSelect.appendChild(option);
    });
  })
  .catch(error => {
    console.error("データの読み込みに失敗しました:", error);
    courseList.innerHTML = "<li class='course-item'>データベースの読み込みに失敗しました。</li>";
  });

// 【STEP 1】コースが選択されたときの処理
courseSelect.addEventListener("change", (e) => {
  const selectedDisplayName = e.target.value;

  categorySelect.innerHTML = '<option value="">分野区分を選択してください</option>';
  courseList.innerHTML = "<li class='course-item'>分野を選択するとここに講義が表示されます。</li>";

  if (!selectedDisplayName) {
    categorySelect.disabled = true;
    return;
  }

  categorySelect.disabled = false;

  // 選択されたコース名に対応する sheet_name の配列を取得
  const targetSheetNames = courseMapping[selectedDisplayName];

  // 該当する sheet_name のいずれかを持つ講義データを絞り込み
  const coursesInSelectedCourse = coursesData.filter(course =>
    targetSheetNames.includes(course.sheet_name)
  );

  // その中から重複しない分野（category）を抽出
  const categories = [...new Set(coursesInSelectedCourse.map(course => course.category))];

  categories.forEach(category => {
    if (category) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    }
  });
});

// 【STEP 2】分野が選択されたときの処理
categorySelect.addEventListener("change", (e) => {
  const selectedDisplayName = courseSelect.value;
  const selectedCategory = e.target.value;

  courseList.innerHTML = "";

  if (!selectedCategory || !selectedDisplayName) {
    courseList.innerHTML = "<li class='course-item'>コースと分野を選択するとここに講義が表示されます。</li>";
    return;
  }

  // 選択されたコース名に対応する sheet_name の配列を取得
  const targetSheetNames = courseMapping[selectedDisplayName];

  // 「該当するsheet_nameのいずれか」かつ「選択した分野」に一致する講義を抽出
  const filteredCourses = coursesData.filter(course =>
    targetSheetNames.includes(course.sheet_name) && course.category === selectedCategory
  );

  if (filteredCourses.length === 0) {
    courseList.innerHTML = "<li class='course-item'>該当する講義がありません。</li>";
    return;
  }

  // 抽出した講義をリスト形式でHTMLに追加
  filteredCourses.forEach(course => {
    const li = document.createElement("li");
    li.className = "course-item";

    const title = course.title || "不明な講義";
    const credits = course.credits || "-";
    const grade = course.grade || "-";
    const reqOrChoice = course.required_or_choice || "-";
    const semester = course.semester || "-";
    const category = course.category || "-";

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

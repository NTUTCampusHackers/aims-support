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
// 2. コース・分野別講義リスト表示機能（新DB対応版）
// ==========================================

// 表示名と .json 内の "course_name" の紐付けルール
// ※「産共通」は全コースで表示されるように配列に含めています
const courseMapping = {
  "情報科学コース": ["産共通", "情報科学"],
  "先端機械工学コース": ["産共通", "先端機械"],
  "建築学コース": ["産共通", "建築学"],
  "支援技術学コース（情報）": ["産共通", "支援（情報）"],
  "支援技術学コース（福祉機器）": ["産共通", "支援（福祉機器）"],
  "支援技術学コース（福祉住環境）": ["産共通", "支援（福祉住）"]
};

const courseSelect = document.getElementById("courseSelect");
const categorySelect = document.getElementById("categorySelect");
const courseList = document.getElementById("courseList");
let coursesData = [];

// カテゴリを階層ごとに結合して表示用ラベルを作る関数
function getCategoryLabel(course) {
  let label = course.category_large || "";
  if (course.category_medium) label += ` > ${course.category_medium}`;
  if (course.category_small) label += ` > ${course.category_small}`;
  return label;
}

// 新しいJSONファイルを読み込む
fetch(chrome.runtime.getURL('courses_view.json'))
  .then(response => response.json())
  .then(data => {
    coursesData = data;

    // マッピングのキー（表示名）をプルダウンに追加する
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

  // 選択されたコースに対応する course_name の配列を取得（例: ["産共通", "情報科学"]）
  const targetCourseNames = courseMapping[selectedDisplayName];

  // 該当する学科の講義データを絞り込み
  const coursesInSelectedCourse = coursesData.filter(course =>
    targetCourseNames.includes(course.course_name)
  );

  // その中から重複しないカテゴリを抽出
  const categories = [...new Set(coursesInSelectedCourse.map(course => getCategoryLabel(course)))];

  // カテゴリをアルファベット・五十音順にソートして追加
  categories.sort().forEach(category => {
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

  // 選択されたコース名に対応する配列を取得
  const targetCourseNames = courseMapping[selectedDisplayName];

  // 対象コースかつ、カテゴリラベルが一致する講義を抽出
  const filteredCourses = coursesData.filter(course =>
    targetCourseNames.includes(course.course_name) && getCategoryLabel(course) === selectedCategory
  );

  if (filteredCourses.length === 0) {
    courseList.innerHTML = "<li class='course-item'>該当する講義がありません。</li>";
    return;
  }

  // 年次順 -> 科目名順 で並び替え
  filteredCourses.sort((a, b) => {
    if (a.year !== b.year) return (a.year > b.year ? 1 : -1);
    return (a.subject_name > b.subject_name ? 1 : -1);
  });

  // 抽出した講義をリスト形式でHTMLに追加
  filteredCourses.forEach(course => {
    const li = document.createElement("li");
    li.className = "course-item";

    const title = course.subject_name || "不明な講義";
    const credits = course.credits ? `${course.credits}単位` : "-";
    const reqOrChoice = course.requirement_type || "-";
    const year = course.year ? `${course.year}年次` : "-";
    const method = course.teaching_method || "-";

    // 産共通か専門かでタグの色分けなどをすると見やすいです
    const deptTag = course.course_name === "産共通" ? "共通" : "専門";

    li.innerHTML = `
      <div class="course-title"><span class="tag">${deptTag}</span> ${title}</div>
      <div class="course-details">
        区分: ${reqOrChoice} | 単位: ${credits} <br>
        年次: ${year} | 授業方法: ${method}
      </div>
    `;
    courseList.appendChild(li);
  });
});

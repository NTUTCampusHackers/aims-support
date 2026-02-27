// ==========================================
// 1. 単位集計機能＆表からの不足単位解析
// ==========================================
const extractBtn = document.getElementById("extractBtn");
const creditOkValue = document.getElementById("creditOkValue");
const creditNgValue = document.getElementById("creditNgValue");

let completedCoursesInfo = {};
let shortfallCategoriesList = [];
let isExtracted = false;

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

      // 解析データをグローバル変数に保持
      completedCoursesInfo = data.completedCoursesInfo;
      shortfallCategoriesList = data.shortfallCategories;
      isExtracted = true;

      // もし既にコースが選択されていた場合、リストを更新
      if (courseSelect.value) {
        courseSelect.dispatchEvent(new Event('change'));
      } else {
        alert("集計が完了しました。コースを選択してください。");
      }
    } else {
      alert("成績データの読み取りに失敗しました。成績ページで実行してください。");
    }
  });
});

// コンテンツスクリプト（実際のページ上で実行される関数）
function calculateCredits() {
  const text = document.body.innerText;
  const lines = text.split('\n');

  let creditTotal = 0;
  let noCreditTotal = 0;
  let parsedSubjects = new Set();
  let completed = {};

  // ① これまでの成績テキスト読み取り（履修済講義の取得）
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
            completed[subjectName] = credit;
          }
        }
      }
    }
  });

  // ② 単位集計表（HTMLタグ）からの不足分野読み取り
  let shortfallCategories = new Set();
  try {
    const lblBunya = document.getElementById("ctlTaniShukei_lblBunya");
    const lblYouken = document.getElementById("ctlTaniShukei_lblYouken");
    const lblShutoku = document.getElementById("ctlTaniShukei_lblShutoku");

    if (lblBunya && lblYouken && lblShutoku) {
      const trBunya = lblBunya.closest("tr");
      const trYouken = lblYouken.closest("tr");
      const trShutoku = lblShutoku.closest("tr");

      const tdsBunya = trBunya.querySelectorAll("td");
      const tdsYouken = trYouken.querySelectorAll("td");
      const tdsShutoku = trShutoku.querySelectorAll("td");

      for (let i = 1; i < tdsBunya.length; i++) {
        const bunyaText = tdsBunya[i].innerText.replace(/\s/g, '');
        const youkenText = tdsYouken[i] ? tdsYouken[i].innerText.trim() : "0";
        const shutokuText = tdsShutoku[i] ? tdsShutoku[i].innerText.trim() : "0";

        const req = parseInt(youkenText, 10) || 0;
        const earned = parseInt(shutokuText, 10) || 0;

        // 卒業要件 - 修得単位 を計算して不足があるかチェック
        if (req - earned > 0) {
          let mappedCat = "";
          // 表の列名をDBのカテゴリ名（中分類・大分類）にマッピング
          if (bunyaText.includes("教養系教育")) mappedCat = "教養系教育科目";
          else if (bunyaText.includes("語学")) mappedCat = "語学教育科目";
          else if (bunyaText.includes("健康スポーツ")) mappedCat = "健康・スポーツ教育科目";
          else if (bunyaText.includes("キャリア")) mappedCat = "キャリア教育科目";
          else if (bunyaText.includes("技術基礎") || bunyaText.includes("データサイエンス") || bunyaText.includes("産業情報学基礎")) mappedCat = "産業情報学基礎教育科目";
          else if (bunyaText.includes("専門基礎")) mappedCat = "専門基礎教育科目";
          else if (bunyaText.includes("専門教育")) mappedCat = "専門教育科目";
          else if (bunyaText.includes("教養教育系")) mappedCat = "教養教育系科目";

          if (mappedCat) {
            shortfallCategories.add(mappedCat);
          }
        }
      }
    }
  } catch(e) {
    console.error("単位集計表の解析エラー:", e);
  }

  return {
    creditTotal,
    noCreditTotal,
    completedCoursesInfo: completed,
    shortfallCategories: Array.from(shortfallCategories)
  };
}

// ==========================================
// 2. コース・分野別講義リスト表示機能
// ==========================================

const courseMapping = {
  "情報科学コース": ["産共通", "情報科学"],
  "先端機械工学コース": ["産共通", "先端機械"],
  "建築学コース": ["産共通", "建築学"],
  "支援技術学コース": ["産共通", "支援（情報）", "支援（福祉機器）", "支援（福祉住）"]
};

const courseSelect = document.getElementById("courseSelect");
const categorySelect = document.getElementById("categorySelect");
const courseList = document.getElementById("courseList");
let coursesData = [];

function getCategoryLabel(course) {
  return course.category_medium || course.category_large || "その他";
}

// JSONファイルを読み込む
fetch(chrome.runtime.getURL('courses_view.json'))
  .then(response => response.json())
  .then(data => {
    coursesData = data;
    Object.keys(courseMapping).forEach(displayName => {
      const option = document.createElement("option");
      option.value = displayName;
      option.textContent = displayName;
      courseSelect.appendChild(option);
    });
  })
  .catch(error => {
    courseList.innerHTML = "<div class='empty-message'>データの読み込みに失敗しました。</div>";
  });

// 【STEP 1】コース選択時（不足分野のみを抽出）
courseSelect.addEventListener("change", (e) => {
  const selectedDisplayName = e.target.value;

  categorySelect.innerHTML = '<option value="">分野区分を選択してください</option>';
  courseList.innerHTML = "<div class='empty-message'>分野を選択するとここに講義が表示されます。</div>";

  if (!selectedDisplayName) {
    categorySelect.disabled = true;
    return;
  }

  // ページ上の集計ボタンが押されていない場合は操作をブロック
  if (!isExtracted) {
    categorySelect.innerHTML = '<option value="">先に「ページから単位を集計」を実行してください</option>';
    categorySelect.disabled = true;
    return;
  }

  categorySelect.disabled = false;

  const targetCourseNames = courseMapping[selectedDisplayName];
  const coursesInSelectedCourse = coursesData.filter(course =>
    targetCourseNames.includes(course.course_name)
  );

  const availableCategories = [...new Set(coursesInSelectedCourse.map(c => getCategoryLabel(c)))];
  let optionAdded = false;

  availableCategories.sort().forEach(category => {
    // ページから取得した「不足単位のある分野リスト(shortfallCategoriesList)」に含まれる場合のみ表示
    if (shortfallCategoriesList.includes(category)) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
      optionAdded = true;
    }
  });

  // もし不足分野が1つもない場合（すべて単位取得済み）
  if (!optionAdded) {
    categorySelect.innerHTML = '<option value="">不足している分野はありません</option>';
    categorySelect.disabled = true;
  }
});

// 【STEP 2】分野選択時（未履修・履修済を一覧表示）
categorySelect.addEventListener("change", (e) => {
  const selectedDisplayName = courseSelect.value;
  const selectedCategory = e.target.value;

  courseList.innerHTML = "";

  if (!selectedCategory || !selectedDisplayName) {
    courseList.innerHTML = "<div class='empty-message'>コースと分野を選択してください。</div>";
    return;
  }

  const targetCourseNames = courseMapping[selectedDisplayName];
  const filteredCourses = coursesData.filter(course =>
    targetCourseNames.includes(course.course_name) && getCategoryLabel(course) === selectedCategory
  );

  const uncompletedCourses = [];
  const completedCourses = [];
  const seenSubjects = new Set();

  filteredCourses.forEach(course => {
    if (!seenSubjects.has(course.subject_name)) {
      seenSubjects.add(course.subject_name);

      // 取得済み講義リストに存在すれば「履修済」、なければ「未履修」に振り分ける
      if (completedCoursesInfo[course.subject_name]) {
        completedCourses.push(course);
      } else {
        uncompletedCourses.push(course);
      }
    }
  });

  // 並び替え用関数（年次順 -> 科目名順）
  const sortCourses = (a, b) => {
    if (a.year !== b.year) return (a.year > b.year ? 1 : -1);
    return (a.subject_name > b.subject_name ? 1 : -1);
  };

  const renderCourseItem = (course, container) => {
    const div = document.createElement("div");
    div.className = "course-item";
    const title = course.subject_name || "不明な講義";
    const reqOrChoice = course.requirement_type || "-";
    const deptTag = course.course_name === "産共通" ? "共通" : "専門";

    div.innerHTML = `
      <div class="course-title"><span class="tag">${deptTag}</span>${title}</div>
      <div class="course-details">区分: ${reqOrChoice}</div>
    `;
    container.appendChild(div);
  };

  // === 【未履修の講義セクション】 ===
  const uncompHeader = document.createElement("div");
  uncompHeader.className = "section-header";
  uncompHeader.textContent = "未履修の講義";
  courseList.appendChild(uncompHeader);

  if (uncompletedCourses.length > 0) {
    uncompletedCourses.sort(sortCourses).forEach(c => renderCourseItem(c, courseList));
  } else {
    courseList.insertAdjacentHTML('beforeend', '<div class="empty-message">未履修の講義はありません。</div>');
  }

  // === 【履修済の講義セクション】 ===
  const compHeader = document.createElement("div");
  compHeader.className = "section-header";
  compHeader.textContent = "履修済の講義";
  courseList.appendChild(compHeader);

  if (completedCourses.length > 0) {
    completedCourses.sort(sortCourses).forEach(c => renderCourseItem(c, courseList));
  } else {
    courseList.insertAdjacentHTML('beforeend', '<div class="empty-message">履修済の講義はありません。</div>');
  }
});

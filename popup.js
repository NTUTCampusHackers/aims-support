// ==========================================
// 1. 単位集計機能＆表解析ロジック
// ==========================================
const extractBtn = document.getElementById("extractBtn");
const creditOkValue = document.getElementById("creditOkValue");
const creditNgValue = document.getElementById("creditNgValue");

let completedCoursesInfo = {};
let parsedCategories = { large: {}, medium: {} };
let isExtracted = false;

// 中項目の一覧マスター
const mediumKeysMaster = [
  "教養系教育科目／選択", "語学・外国語／必修", "語学・手話言語／選必", "語学・日本語／必修",
  "健康スポーツ教育／必修", "健康スポーツ教育／選必", "キャリア教育科目／必修", "語学・健康・キャリア教育／選択",
  "技術基礎／必修", "データサイエンス／必修", "産業情報学基礎教育科目／選択",
  "専門基礎教育／必修", "専門基礎教育／選択",
  "専門教育／必修", "専門教育／選択必修", "専門教育／選択"
];

// 大項目と中項目の紐付け設定
const largeToMediumMap = {
  "専門教育科目": ["専門教育／必修", "専門教育／選択必修", "専門教育／選択"],
  "専門基礎教育科目": ["専門基礎教育／必修", "専門基礎教育／選択"],
  "産業情報学基礎教育科目": ["技術基礎／必修", "データサイエンス／必修", "産業情報学基礎教育科目／選択"],
  "教養教育系科目": [
    "教養系教育科目／選択", "語学・外国語／必修", "語学・手話言語／選必", "語学・日本語／必修",
    "健康スポーツ教育／必修", "健康スポーツ教育／選必", "キャリア教育科目／必修", "語学・健康・キャリア教育／選択"
  ]
};

extractBtn.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: calculateCredits,
    args: [mediumKeysMaster]
  }, (results) => {
    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      creditOkValue.textContent = `${data.creditTotal} 単位`;
      creditNgValue.textContent = `${data.noCreditTotal} 単位`;

      completedCoursesInfo = data.completedCoursesInfo;
      parsedCategories = data.parsedCategories;
      isExtracted = true;

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
function calculateCredits(mediumKeysArr) {
  const text = document.body.innerText;
  const lines = text.split('\n');

  let creditTotal = 0;
  let noCreditTotal = 0;
  let parsedSubjects = new Set();
  let completed = {};

  // ① 履修済講義の取得
  lines.forEach(line => {
    const parts = line.trim().split(/\t+|\s{2,}/);
    if (parts.length >= 5) {
      let gradeIndex = -1;
      for (let i = parts.length - 2; i >= 1; i--) {
        if (/^(A\+|A|B|C|D)$/.test(parts[i].trim())) {
          if (/^\d+$/.test(parts[i + 1].trim())) {
            gradeIndex = i; break;
          }
        }
      }
      if (gradeIndex !== -1) {
        const grade = parts[gradeIndex].trim();
        const credit = parseInt(parts[gradeIndex + 1].trim(), 10);
        const subjectName = parts[1].trim();

        if (!parsedSubjects.has(subjectName)) {
          parsedSubjects.add(subjectName);
          if (grade === 'D') noCreditTotal += credit;
          else { creditTotal += credit; completed[subjectName] = credit; }
        }
      }
    }
  });

  // ② HTMLテーブルから「不足単位」を抽出
  let extractedCats = { large: {}, medium: {} };

  const getNum = (td) => {
    if (!td) return 0;
    const match = td.innerText.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  try {
    const lblBunya = document.getElementById("ctlTaniShukei_lblBunya");
    const lblYouken = document.getElementById("ctlTaniShukei_lblYouken");
    const lblShutoku = document.getElementById("ctlTaniShukei_lblShutoku");
    const lblFusoku = document.getElementById("ctlTaniShukei_lblFusoku");

    if (lblBunya) {
      const trBunya = lblBunya.closest("tr").querySelectorAll("td");
      const trYouken = lblYouken ? lblYouken.closest("tr").querySelectorAll("td") : [];
      const trShutoku = lblShutoku ? lblShutoku.closest("tr").querySelectorAll("td") : [];
      const trFusoku = lblFusoku ? lblFusoku.closest("tr").querySelectorAll("td") : [];

      for (let i = 1; i < trBunya.length; i++) {
        const bTextClean = trBunya[i].innerText.replace(/[\s　\n]/g, '');

        let shortfall = 0;
        if (trFusoku.length > i) {
          shortfall = getNum(trFusoku[i]);
        } else {
          const req = getNum(trYouken[i]);
          const earned = getNum(trShutoku[i]);
          shortfall = req - earned > 0 ? req - earned : 0;
        }

        if (bTextClean.includes("教養教育系科目合計")) extractedCats.large["教養教育系科目"] = { shortfall };
        else if (bTextClean.includes("産業情報学基礎教育科目合計")) extractedCats.large["産業情報学基礎教育科目"] = { shortfall };
        else if (bTextClean.includes("専門基礎教育科目合計")) extractedCats.large["専門基礎教育科目"] = { shortfall };
        else if (bTextClean.includes("専門教育科目合計")) extractedCats.large["専門教育科目"] = { shortfall };

        if (!bTextClean.includes("計")) {
          const matchKey = mediumKeysArr.find(k => bTextClean.replace(/／/g, '').includes(k.replace(/／/g, '')));
          if (matchKey) {
            extractedCats.medium[matchKey] = { shortfall };
          }
        }
      }
    }
  } catch(e) {
    console.error("単位集計表の解析エラー:", e);
  }

  // ★以前の「強制的に選択に割り当てる」処理を削除し、純粋に表のデータをそのまま返します
  return { creditTotal, noCreditTotal, completedCoursesInfo: completed, parsedCategories: extractedCats };
}

// ==========================================
// 2. ツリー描画ロジック
// ==========================================

const courseMapping = {
  "情報科学コース": ["産共通", "情報科学"],
  "先端機械工学コース": ["産共通", "先端機械"],
  "建築学コース": ["産共通", "建築学"],
  "支援技術学コース": ["産共通", "支援（情報）", "支援（福祉機器）", "支援（福祉住）"]
};

const courseSelect = document.getElementById("courseSelect");
const courseList = document.getElementById("courseList");
let coursesData = [];

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
  });

function getChukoumoku(course) {
  const large = course.category_large || "";
  const med = course.category_medium || "";
  const small = course.category_small || "";
  const req = course.requirement_type || "";

  if (large === "教養教育系科目") {
    if (med === "教養系教育科目") return "教養系教育科目／選択";
    if (req === "選択" && (med === "語学教育科目" || med === "健康・スポーツ教育科目" || med === "キャリア教育科目")) return "語学・健康・キャリア教育／選択";
    if (med === "語学教育科目") {
      if (small === "外国語" && req === "必修") return "語学・外国語／必修";
      if (small === "手話言語") return "語学・手話言語／選必";
      if (small === "日本語" && req === "必修") return "語学・日本語／必修";
    }
    if (med === "健康・スポーツ教育科目") {
      if (req === "必修") return "健康スポーツ教育／必修";
      if (req === "選択必修") return "健康スポーツ教育／選必";
    }
    if (med === "キャリア教育科目" && req === "必修") return "キャリア教育科目／必修";
  } else if (large === "専門教育系科目") {
    if (med === "産業情報学基礎教育科目") {
      if (req === "選択") return "産業情報学基礎教育科目／選択";
      if (small === "技術基礎科目" && req === "必修") return "技術基礎／必修";
      if (small === "データサイエンス科目" && req === "必修") return "データサイエンス／必修";
    }
    if (med === "専門基礎教育科目") {
      if (req === "必修") return "専門基礎教育／必修";
      if (req === "選択") return "専門基礎教育／選択";
    }
    if (med === "専門教育科目") {
      if (req === "必修") return "専門教育／必修";
      if (req === "選択必修") return "専門教育／選択必修";
      if (req === "選択") return "専門教育／選択";
    }
  }
  return null;
}

courseSelect.addEventListener("change", (e) => {
  const selectedDisplayName = e.target.value;
  courseList.innerHTML = "";

  if (!selectedDisplayName) {
    courseList.innerHTML = "<div class='empty-message'>コースを選択してください。</div>";
    return;
  }
  if (!isExtracted) {
    courseSelect.value = "";
    alert("先に「ページから単位を集計する」ボタンを押してください。");
    return;
  }

  const targetCourseNames = courseMapping[selectedDisplayName];
  const coursesInSelectedCourse = coursesData.filter(course =>
    targetCourseNames.includes(course.course_name)
  );

  // 大項目ごとに処理
  Object.keys(largeToMediumMap).forEach(largeKey => {
    const largeData = parsedCategories.large[largeKey] || { shortfall: 0 };

    // その大項目に属する中項目のいずれかが不足しているかチェック
    const hasMediumShortfall = largeToMediumMap[largeKey].some(m => (parsedCategories.medium[m]?.shortfall || 0) > 0);

    // 大項目自体の合計不足、または中項目の不足があれば「不足」扱いとしてツリーを展開
    const isLargeShort = largeData.shortfall > 0 || hasMediumShortfall;

    // ① 大項目の描画（常に表示）
    const largeDiv = document.createElement("div");
    largeDiv.className = "cat-large";
    let largeStatusText = '<span class="status-ok">満</span>';
    if (isLargeShort) {
      // 合計単位が不足している場合はその数値を表示、そうでない場合（必修だけ不足している等）は「不足」とのみ表示
      const shortfallText = largeData.shortfall > 0 ? `不足　${largeData.shortfall}` : '不足';
      largeStatusText = `<span class="status-ng">${shortfallText}</span>`;
    }
    largeDiv.innerHTML = `・${largeKey}　${largeStatusText}`;
    courseList.appendChild(largeDiv);

    // 大項目が「不足」の場合のみ中項目を展開
    if (isLargeShort) {
      largeToMediumMap[largeKey].forEach(mediumKey => {
        const mediumData = parsedCategories.medium[mediumKey] || { shortfall: 0 };

        // 基本は中項目自体が不足している場合のみ表示
        let shouldDisplayMedium = mediumData.shortfall > 0;

        // 【重要】専門教育科目の特別ルール
        // 合計単位（Large）が不足している場合、必修・選択必修・選択の「すべて」を合計単位補填の選択肢として表示する
        if (largeKey === "専門教育科目" && largeData.shortfall > 0) {
          shouldDisplayMedium = true;
        }

        // ② 中項目の描画（表示条件を満たしたもののみ）
        if (shouldDisplayMedium) {
          const mediumDiv = document.createElement("div");
          mediumDiv.className = "cat-medium";
          let mediumStatusText = "";

          // 中項目自体に具体的な不足がある場合のみ「不足 X」と表示する
          if (mediumData.shortfall > 0) {
            mediumStatusText = `　<span class="status-ng">不足　${mediumData.shortfall}</span>`;
          }

          mediumDiv.innerHTML = `・${mediumKey}${mediumStatusText}`;
          courseList.appendChild(mediumDiv);

          // 講義データの仕分け
          const filteredCourses = coursesInSelectedCourse.filter(c => getChukoumoku(c) === mediumKey);
          const uncompleted = [];
          const completed = [];
          const seen = new Set();

          filteredCourses.forEach(c => {
            if (!seen.has(c.subject_name)) {
              seen.add(c.subject_name);
              if (completedCoursesInfo[c.subject_name]) completed.push(c);
              else uncompleted.push(c);
            }
          });

          const sortCourses = (a, b) => {
            if (a.year !== b.year) return (a.year > b.year ? 1 : -1);
            return (a.subject_name > b.subject_name ? 1 : -1);
          };

          const renderList = (coursesArr, titleText) => {
            const header = document.createElement("div");
            header.className = "list-header";
            header.textContent = `・${titleText}`;
            courseList.appendChild(header);

            if (coursesArr.length > 0) {
              coursesArr.sort(sortCourses).forEach(c => {
                const item = document.createElement("div");
                item.className = "course-item";
                item.textContent = `・${c.subject_name}`;
                courseList.appendChild(item);
              });
            } else {
              const item = document.createElement("div");
              item.className = "course-item";
              item.style.color = "#9aa0a6";
              item.textContent = "・該当なし";
              courseList.appendChild(item);
            }
          };

          // ③ 未履修・履修済のリスト描画
          renderList(uncompleted, "未履修の講義");
          renderList(completed, "履修済の講義");
        }
      });
    }
  });
});

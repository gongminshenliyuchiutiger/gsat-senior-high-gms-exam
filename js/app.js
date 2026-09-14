/**
 * 學測/會考公民神模考系統 - 主控制邏輯
 * 包含：模考引擎、即時刷題、考券/PDF產生器、吉祥物拖曳與互動特效
 */

document.addEventListener("DOMContentLoaded", () => {
  // 核心狀態管理
  const AppState = {
    currentView: "overview-view",
    exam: {
      active: false,
      questions: [],
      userAnswers: {},
      flagged: new Set(),
      timerSeconds: 0,
      totalSeconds: 0,
      timerInterval: null,
      startTime: null,
      elapsedSeconds: 0,
      submitted: false,
      score: 0,
      correctCount: 0,
      wrongCount: 0
    },
    practice: {
      questions: [],
      unitFilter: "all"
    },
    print: {
      mode: "question", // 'question' 或 'answer'
      unitFilter: "all"
    },
    wrongQuestions: JSON.parse(localStorage.getItem("gms_wrong_questions") || "[]")
  };

  // 初始化 DOM 元素快取
  const DOM = {
    views: document.querySelectorAll(".view-section"),
    navButtons: document.querySelectorAll(".nav-tab-btn"),
    unitsGrid: document.getElementById("units-grid-container"),
    unitSelectorCheckboxes: document.getElementById("unit-selector-checkboxes"),
    
    // Exam Elements
    examQCountSelect: document.getElementById("exam-qcount-select"),
    examTimerSelect: document.getElementById("exam-timer-select"),
    examOrderSelect: document.getElementById("exam-order-select"),
    examTypeFilterSelect: document.getElementById("exam-type-filter-select"),
    btnLaunchExam: document.getElementById("btn-launch-exam"),
    btnConfigReset: document.getElementById("btn-config-reset"),
    btnStartFullExam: document.getElementById("btn-start-full-exam"),
    
    examActiveTitle: document.getElementById("exam-active-title"),
    timerDisplay: document.getElementById("exam-timer-display"),
    timerText: document.getElementById("timer-text"),
    progressAnswered: document.getElementById("progress-answered"),
    progressTotal: document.getElementById("progress-total"),
    examQuestionsContainer: document.getElementById("exam-questions-container"),
    sheetButtonsGrid: document.getElementById("sheet-buttons-grid"),
    btnSubmitExam: document.getElementById("btn-submit-exam"),
    btnSidebarSubmit: document.getElementById("btn-sidebar-submit"),
    
    // Score Report
    reportFinalScore: document.getElementById("report-final-score"),
    reportTierBadge: document.getElementById("report-tier-badge"),
    reportCorrectCount: document.getElementById("report-correct-count"),
    reportWrongCount: document.getElementById("report-wrong-count"),
    reportAccuracyRate: document.getElementById("report-accuracy-rate"),
    reportTimeSpent: document.getElementById("report-time-spent"),
    reviewQuestionsList: document.getElementById("review-questions-list"),
    scoreCircleIndicator: document.getElementById("score-circle-indicator"),
    btnRetest: document.getElementById("btn-retest"),
    btnExportResultPdf: document.getElementById("btn-export-result-pdf"),
    
    // Practice Elements
    practiceUnitSelect: document.getElementById("practice-unit-select"),
    btnPracticeRefresh: document.getElementById("btn-practice-refresh"),
    practiceQuestionsContainer: document.getElementById("practice-questions-container"),
    
    // Print Elements
    printUnitFilter: document.getElementById("print-unit-filter"),
    btnModeQuestionPaper: document.getElementById("btn-mode-question-paper"),
    btnModeAnswerPaper: document.getElementById("btn-mode-answer-paper"),
    btnTriggerPrint: document.getElementById("btn-trigger-print"),
    paperQuestionsRenderArea: document.getElementById("paper-questions-render-area"),
    paperStudentInfoBox: document.getElementById("paper-student-info-box"),
    paperNoticeText: document.getElementById("paper-notice-text"),
    printPaperSubTitle: document.getElementById("print-paper-sub-title"),
    paperManualAnswerSheet: document.getElementById("paper-manual-answer-sheet"),
    paperAnswerBoxesGrid: document.getElementById("paper-answer-boxes-grid"),
    
    // Mascot Elements
    mascotContainer: document.getElementById("mascot-container"),
    mascotImg: document.getElementById("mascot-img"),
    
    // Modal
    submitModal: document.getElementById("submit-confirm-modal"),
    modalSubmitStats: document.getElementById("modal-submit-stats"),
    btnModalCancel: document.getElementById("btn-modal-cancel"),
    btnModalConfirm: document.getElementById("btn-modal-confirm"),
    
    // Wrong Book & History
    wrongCountBadge: document.getElementById("wrong-count-badge"),
    btnQuickWrongBook: document.getElementById("btn-quick-wrong-book"),
    btnClearHistory: document.getElementById("btn-clear-history"),
    clearHistoryModal: document.getElementById("clear-history-modal"),
    btnModalClearCancel: document.getElementById("btn-modal-clear-cancel"),
    btnModalClearConfirm: document.getElementById("btn-modal-clear-confirm"),
    
    // Stats in hero
    statTotalUnits: document.getElementById("stat-total-units"),
    statTotalQuestions: document.getElementById("stat-total-questions")
  };

  /* ==========================================================================
     1. 初始化與視圖切換
     ========================================================================== */
  function populateUnitDropdowns() {
    if (DOM.practiceUnitSelect) {
      const curPracticeVal = DOM.practiceUnitSelect.value;
      DOM.practiceUnitSelect.innerHTML = `<option value="all">全單元隨機刷題 (共 18 單元)</option>`;
      EXAM_DATABASE.units.forEach(u => {
        DOM.practiceUnitSelect.innerHTML += `<option value="${u.id}">${u.title} (${u.questions.length} 題)</option>`;
      });
      if (curPracticeVal) DOM.practiceUnitSelect.value = curPracticeVal;
    }

    if (DOM.printUnitFilter) {
      const curPrintVal = DOM.printUnitFilter.value;
      DOM.printUnitFilter.innerHTML = `<option value="all">匯出範圍：全單元綜合試卷 (18 單元共收錄)</option>`;
      EXAM_DATABASE.units.forEach(u => {
        DOM.printUnitFilter.innerHTML += `<option value="${u.id}">${u.title} (${u.questions.length} 題)</option>`;
      });
      if (curPrintVal) DOM.printUnitFilter.value = curPrintVal;
    }
  }

  function init() {
    populateUnitDropdowns();
    renderOverviewUnitCards();
    renderConfigUnitSelector();
    updateTotalStats();
    updateWrongBadge();
    initMascotDrag();
    bindEvents();
    
    // 預設渲染刷題與列印區塊
    renderPracticeMode();
    renderPrintPaper();
  }

  function switchView(targetViewId) {
    DOM.views.forEach(v => {
      v.classList.remove("active");
      if (v.id === targetViewId) {
        v.classList.add("active");
      }
    });

    DOM.navButtons.forEach(btn => {
      if (btn.dataset.target === targetViewId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    AppState.currentView = targetViewId;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateTotalStats() {
    let totalQ = 0;
    EXAM_DATABASE.units.forEach(u => {
      totalQ += u.questions.length;
    });
    if (DOM.statTotalUnits) DOM.statTotalUnits.textContent = `${EXAM_DATABASE.units.length} 大核心`;
    if (DOM.statTotalQuestions) DOM.statTotalQuestions.textContent = `${totalQ} 題全收錄`;
  }

  /* ==========================================================================
     2. 單元總覽視圖渲染
     ========================================================================== */
  function renderOverviewUnitCards() {
    if (!DOM.unitsGrid) return;
    DOM.unitsGrid.innerHTML = "";

<<<<<<< HEAD
    EXAM_DATABASE.units.forEach(unit => {
      const card = document.createElement("div");
      card.className = "unit-card";
      card.innerHTML = `
        <div class="unit-card-header">
          <span class="unit-num-badge">單元 ${unit.id}</span>
          <span class="unit-qcount"><i class="fa-solid fa-file-lines"></i> ${unit.questions.length} 題</span>
        </div>
        <h3 class="unit-card-title">${unit.title}</h3>
        <p class="unit-card-desc">${unit.description}</p>
        <div class="unit-card-footer" style="display:flex; gap:0.4rem; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm btn-unit-practice" data-unit="${unit.id}" style="flex:1; min-width:85px;">
            <i class="fa-solid fa-book-open"></i> 即時刷題
          </button>
          <button class="btn btn-primary btn-sm btn-unit-exam" data-unit="${unit.id}" style="flex:1; min-width:85px;">
            <i class="fa-solid fa-pen-nib"></i> 單元模考
          </button>
          <button class="btn btn-accent btn-sm btn-unit-print" data-unit="${unit.id}" style="flex:1; min-width:85px;">
            <i class="fa-solid fa-print"></i> 考券PDF
          </button>
=======
  // 渲染講義精讀模式
  function renderReadingMode(unit) {
    if (!readingContent) return;

    let mdText = unit.content;

    // 把立即演練或公民神演練區塊轉化為互動卡片標記
    const quizBlocks = [];
    const quizRegex = />\s*###\s*(?:<i[^>]*><\/i>\s*)?(?:📝\s*)?(?:立即演練|公民神演練)[！!]?[\s\S]*?(?=(?:\r?\n---|\r?\n##|$))/g;

    let replacedMd = mdText.replace(quizRegex, (match) => {
      const quizObj = window.GSAT_QUIZ.parseQuizBlock(match);
      const placeholder = `%%QUIZ_PLACEHOLDER_${quizBlocks.length}%%`;
      quizBlocks.push(quizObj);
      return `\n\n${placeholder}\n\n`;
    });

    // 轉換所有 Emoji 為 Font Awesome 圖標
    replacedMd = replaceEmojisWithFontAwesome(replacedMd);

    // Marked.js 解析（包含 KaTeX 數學公式安全保護）
    let renderedHtml = window.parseMarkdownWithMath
      ? window.parseMarkdownWithMath(replacedMd)
      : (window.marked ? window.marked.parse(replacedMd) : replacedMd);

    // 回填題目互動卡片
    quizBlocks.forEach((q, idx) => {
      const placeholder = `%%QUIZ_PLACEHOLDER_${idx}%%`;
      const quizHtml = window.GSAT_QUIZ.renderQuizHtml(q, idx, false);
      renderedHtml = renderedHtml.replace(placeholder, quizHtml);
    });

    readingContent.innerHTML = renderedHtml;

    // 自動建置大綱目錄 TOC
    buildToc(readingContent);

    // KaTeX 數學公式渲染
    if (window.renderMathInElement) {
      window.renderMathInElement(readingContent, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
      });
    }
  }

  // 自動提取章節標題建置側邊目錄
  function buildToc(contentEl) {
    if (!tocList || !contentEl) return;
    tocList.innerHTML = "";

    const headings = contentEl.querySelectorAll("h2, h3");
    if (headings.length === 0) {
      tocList.innerHTML = '<li class="toc-item"><span style="color:var(--text-muted);font-size:0.82rem;">（本單元無次級標題）</span></li>';
      return;
    }

    headings.forEach((h, index) => {
      let text = h.textContent.trim();
      text = text.replace(/^(?:<i[^>]*><\/i>\s*)+/gi, "").replace(/^[📌📝\s]+/, "").trim();
      const slug = `heading-${index}`;
      h.id = slug;

      const isH2 = h.tagName.toLowerCase() === "h2";
      const li = document.createElement("li");
      li.className = `toc-item ${isH2 ? 'level-2' : 'level-3'}`;
      li.innerHTML = `
        <a href="#${slug}">
          <i class="${isH2 ? 'fa-solid fa-folder-open' : 'fa-solid fa-thumbtack'}"></i> ${text}
        </a>
      `;

      li.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      tocList.appendChild(li);
    });
  }

  // 渲染學測題庫模式
  function renderQuizMode(unit) {
    if (!quizModeQuestions) return;

    // 抓取當前單元中所有的立即演練或公民神演練
    const raw = unit.content;
    const quizRegex = />\s*###\s*(?:<i[^>]*><\/i>\s*)?(?:📝\s*)?(?:立即演練|公民神演練)[！!]?[\s\S]*?(?=(?:\r?\n---|\r?\n##|$))/g;
    const quizzes = [];
    let match;
    while ((match = quizRegex.exec(raw)) !== null) {
      const q = window.GSAT_QUIZ.parseQuizBlock(match[0]);
      if (q) quizzes.push(q);
    }

    document.getElementById("quiz-count-stat").textContent = `${quizzes.length} 題`;

    if (quizzes.length === 0) {
      quizModeQuestions.innerHTML = `
        <div style="text-align:center; padding: 40px; background:var(--bg-surface); border-radius:var(--radius-md); border:1px solid var(--border-color);">
          <i class="fa-solid fa-clipboard-check" style="font-size: 2.5rem; color: #10b981; margin-bottom: 12px;"></i>
          <h3>本單元練習題已同步整合至講義核心段落！</h3>
          <p style="color:var(--text-muted); margin-top: 8px;">請切換至【簡報投影模式】或【講義精讀模式】隨堂演練！</p>
>>>>>>> d30f44030fa4f66630dd2a7171361dc2ebaad609
        </div>
      `;
      DOM.unitsGrid.appendChild(card);
    });

    // 綁定單元按鈕事件
    DOM.unitsGrid.querySelectorAll(".btn-unit-practice").forEach(btn => {
      btn.addEventListener("click", () => {
        const uid = btn.dataset.unit;
        DOM.practiceUnitSelect.value = uid;
        renderPracticeMode();
        switchView("practice-view");
      });
    });

    DOM.unitsGrid.querySelectorAll(".btn-unit-exam").forEach(btn => {
      btn.addEventListener("click", () => {
        const uid = parseInt(btn.dataset.unit);
        // 設定選取該單元
        document.querySelectorAll(".unit-check-input").forEach(cb => {
          cb.checked = (parseInt(cb.value) === uid);
        });
        switchView("exam-config-view");
      });
    });

    DOM.unitsGrid.querySelectorAll(".btn-unit-print").forEach(btn => {
      btn.addEventListener("click", () => {
        const uid = btn.dataset.unit;
        DOM.printUnitFilter.value = uid;
        AppState.print.unitFilter = uid;
        renderPrintPaper();
        switchView("print-view");
      });
    });
  }

  function renderConfigUnitSelector() {
    if (!DOM.unitSelectorCheckboxes) return;
    DOM.unitSelectorCheckboxes.innerHTML = "";

    EXAM_DATABASE.units.forEach(u => {
      const label = document.createElement("label");
      label.className = "checkbox-label";
      label.innerHTML = `
        <input type="checkbox" class="unit-check-input" value="${u.id}" checked>
        <span>${u.title} (${u.questions.length} 題)</span>
      `;
      DOM.unitSelectorCheckboxes.appendChild(label);
    });
  }

  /* ==========================================================================
     3. 模擬測驗引擎 (Exam Mode Engine)
     ========================================================================== */
  function startExam(customQuestions = null) {
    let questions = [];

    if (customQuestions) {
      questions = [...customQuestions];
    } else {
      // 依勾選單元篩選
      const selectedUnits = Array.from(document.querySelectorAll(".unit-check-input:checked"))
        .map(cb => parseInt(cb.value));

      if (selectedUnits.length === 0) {
        alert("請至少選擇一個測驗單元！");
        return;
      }

      EXAM_DATABASE.units.forEach(u => {
        if (selectedUnits.includes(u.id)) {
          questions.push(...u.questions);
        }
      });

      // 依題型篩選
      const typeFilter = DOM.examTypeFilterSelect.value;
      if (typeFilter === "single") {
        questions = questions.filter(q => q.type === "single" && q.section !== "學測有試嗎");
      } else if (typeFilter === "mixed") {
        questions = questions.filter(q => q.type === "mixed" || q.type === "non_single" || q.type === "group");
      } else if (typeFilter === "gsat") {
        questions = questions.filter(q => q.section === "學測有試嗎" || q.tag);
      }

      // 排序
      const order = DOM.examOrderSelect.value;
      if (order === "random") {
        questions = shuffleArray(questions);
      }

      // 題數截取
      const countVal = DOM.examQCountSelect.value;
      if (countVal !== "all") {
        const count = parseInt(countVal);
        questions = questions.slice(0, Math.min(count, questions.length));
      }
    }

    if (questions.length === 0) {
      alert("此篩選條件下沒有題目，請重新調整設定！");
      return;
    }

    // 初始化測驗狀態
    AppState.exam.active = true;
    AppState.exam.questions = questions;
    AppState.exam.userAnswers = {};
    AppState.exam.flagged.clear();
    AppState.exam.submitted = false;
    AppState.exam.startTime = new Date();

    // 設定計時器
    const timerMins = parseInt(DOM.examTimerSelect.value);
    if (timerMins > 0) {
      AppState.exam.totalSeconds = timerMins * 60;
      AppState.exam.timerSeconds = timerMins * 60;
      startTimerCountdown();
    } else {
      AppState.exam.totalSeconds = 0;
      AppState.exam.timerSeconds = 0;
      DOM.timerText.textContent = "自由測驗（不計時）";
      DOM.timerDisplay.className = "timer-box normal";
    }

    // 渲染題目與答案卡
    renderExamQuestions();
    renderExamSheetNavigation();
    updateExamProgress();

    switchView("exam-active-view");
  }

  function startTimerCountdown() {
    if (AppState.exam.timerInterval) clearInterval(AppState.exam.timerInterval);

    updateTimerDisplay();

    AppState.exam.timerInterval = setInterval(() => {
      AppState.exam.timerSeconds--;
      updateTimerDisplay();

      if (AppState.exam.timerSeconds <= 0) {
        clearInterval(AppState.exam.timerInterval);
        alert("測驗時間結束！系統將自動交卷。");
        submitExam();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const s = AppState.exam.timerSeconds;
    const m = Math.floor(s / 60);
    const remS = s % 60;
    DOM.timerText.textContent = `${String(m).padStart(2, "0")}:${String(remS).padStart(2, "0")}`;

    if (s <= 300) {
      DOM.timerDisplay.className = "timer-box"; // warning red
    } else {
      DOM.timerDisplay.className = "timer-box normal";
    }
  }

  function renderExamQuestions() {
    DOM.examQuestionsContainer.innerHTML = "";

    AppState.exam.questions.forEach((q, idx) => {
      const qIndex = idx + 1;
      const card = document.createElement("div");
      card.className = `question-card ${AppState.exam.flagged.has(q.id) ? "flagged" : ""}`;
      card.id = `exam-q-${idx}`;

      let groupContextHtml = "";
      if (q.groupContext && (q.type === "group" || q.type === "mixed" || q.type === "non_single")) {
        groupContextHtml = `
          <div class="q-group-box">
            <div class="q-group-title">
              <i class="fa-solid fa-file-lines text-primary"></i> ${q.groupTitle || "題組背景資料"}
            </div>
            <div>${escapeAndFormatText(q.groupContext)}</div>
          </div>
        `;
      }

      let optionsHtml = "";
      if (q.options && q.options.length > 0) {
        optionsHtml = `
          <div class="options-list">
            ${q.options.map(opt => {
              const isSelected = AppState.exam.userAnswers[q.id] === opt.key;
              return `
                <div class="option-item ${isSelected ? "selected" : ""}" data-qid="${q.id}" data-opt="${opt.key}">
                  <span class="option-key">${opt.key}</span>
                  <span class="option-text">${opt.text}</span>
                </div>
              `;
            }).join("")}
          </div>
        `;
      } else if (q.tableTemplate) {
        // 混合/非選勾選題
        const checkOptions = q.tableTemplate.checkOptions || [];
        optionsHtml = `
          <div class="mixed-interactive-box">
            ${checkOptions.length > 0 ? `
              <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.4rem;"><i class="fa-solid fa-square-check"></i> 請勾選答案項目：</div>
              <div class="checkbox-pick-group">
                ${checkOptions.map(chk => {
                  const isChecked = (AppState.exam.userAnswers[q.id] || {}).check === chk;
                  return `
                    <div class="check-chip ${isChecked ? "checked" : ""}" data-qid="${q.id}" data-check="${chk}">
                      <i class="fa-regular ${isChecked ? "fa-circle-dot" : "fa-circle"}"></i> ${chk}
                    </div>
                  `;
                }).join("")}
              </div>
            ` : ""}
            <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.4rem;">
              <i class="fa-solid fa-pen"></i> ${q.tableTemplate.explanationLabel || "寫出判斷理由"}：
            </div>
            <textarea class="written-textarea" data-qid="${q.id}" placeholder="請在此輸入您的理由或佐證說明...">${(AppState.exam.userAnswers[q.id] || {}).written || ""}</textarea>
          </div>
        `;
      } else {
        // 一般非選 / 簡答題
        const userWritten = typeof AppState.exam.userAnswers[q.id] === 'string' ? AppState.exam.userAnswers[q.id] : (AppState.exam.userAnswers[q.id] || {}).written || "";
        optionsHtml = `
          <div class="mixed-interactive-box">
            <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.4rem;">
              <i class="fa-solid fa-pen-nib"></i> 【手寫作答填答區】請輸入您的分析與答案：
            </div>
            <textarea class="written-textarea" data-qid="${q.id}" placeholder="請在此輸入您的作答內容...">${userWritten}</textarea>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="question-card-header">
          <div class="q-meta">
            <span class="q-num-badge">第 ${qIndex} 題</span>
            <span class="q-type-badge">${q.typeName || "單選題"}</span>
            <span class="q-unit-badge">單元 ${q.unit}</span>
            ${q.tag ? `<span class="q-type-badge text-primary" style="background:#eff6ff;"><i class="fa-solid fa-award"></i> ${q.tag}</span>` : ""}
          </div>
          <button class="q-flag-btn ${AppState.exam.flagged.has(q.id) ? "active" : ""}" data-qid="${q.id}">
            <i class="fa-${AppState.exam.flagged.has(q.id) ? "solid" : "regular"} fa-bookmark"></i>
            <span>${AppState.exam.flagged.has(q.id) ? "已標記" : "標記題"}</span>
          </button>
        </div>

        ${groupContextHtml}

        <div class="q-stem">${qIndex}. ${escapeAndFormatText(q.stem)}</div>

        ${optionsHtml}
      `;

      DOM.examQuestionsContainer.appendChild(card);
    });

    // 綁定選項點擊事件
    DOM.examQuestionsContainer.querySelectorAll(".option-item").forEach(item => {
      item.addEventListener("click", () => {
        const qid = item.dataset.qid;
        const optKey = item.dataset.opt;

        AppState.exam.userAnswers[qid] = optKey;

        // 更新此題選項高亮
        const parent = item.closest(".options-list");
        parent.querySelectorAll(".option-item").forEach(o => o.classList.remove("selected"));
        item.classList.add("selected");

        updateExamProgress();
        updateSheetNavigationButton(qid);
      });
    });

    // 綁定混合題勾選
    DOM.examQuestionsContainer.querySelectorAll(".check-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const qid = chip.dataset.qid;
        const checkVal = chip.dataset.check;
        
        if (!AppState.exam.userAnswers[qid]) AppState.exam.userAnswers[qid] = {};
        AppState.exam.userAnswers[qid].check = checkVal;

        const group = chip.closest(".checkbox-pick-group");
        group.querySelectorAll(".check-chip").forEach(c => {
          c.classList.remove("checked");
          c.querySelector("i").className = "fa-regular fa-circle";
        });
        chip.classList.add("checked");
        chip.querySelector("i").className = "fa-regular fa-circle-dot";

        updateExamProgress();
        updateSheetNavigationButton(qid);
      });
    });

    // 綁定手寫輸入
    DOM.examQuestionsContainer.querySelectorAll(".written-textarea").forEach(textarea => {
      textarea.addEventListener("input", () => {
        const qid = textarea.dataset.qid;
        if (!AppState.exam.userAnswers[qid]) AppState.exam.userAnswers[qid] = {};
        AppState.exam.userAnswers[qid].written = textarea.value;

        updateExamProgress();
        updateSheetNavigationButton(qid);
      });
    });

    // 標記書籤按鈕
    DOM.examQuestionsContainer.querySelectorAll(".q-flag-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const qid = btn.dataset.qid;
        if (AppState.exam.flagged.has(qid)) {
          AppState.exam.flagged.delete(qid);
          btn.classList.remove("active");
          btn.innerHTML = '<i class="fa-regular fa-bookmark"></i> <span>標記題</span>';
          btn.closest(".question-card").classList.remove("flagged");
        } else {
          AppState.exam.flagged.add(qid);
          btn.classList.add("active");
          btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> <span>已標記</span>';
          btn.closest(".question-card").classList.add("flagged");
        }
        updateSheetNavigationButton(qid);
      });
    });
  }

  function renderExamSheetNavigation() {
    DOM.sheetButtonsGrid.innerHTML = "";

    AppState.exam.questions.forEach((q, idx) => {
      const btn = document.createElement("button");
      btn.className = "sheet-btn";
      btn.id = `sheet-btn-${q.id}`;
      btn.textContent = idx + 1;
      btn.dataset.index = idx;

      btn.addEventListener("click", () => {
        const targetQ = document.getElementById(`exam-q-${idx}`);
        if (targetQ) {
          targetQ.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });

      DOM.sheetButtonsGrid.appendChild(btn);
    });
  }

  function updateSheetNavigationButton(qid) {
    const btn = document.getElementById(`sheet-btn-${qid}`);
    if (!btn) return;

    const answer = AppState.exam.userAnswers[qid];
    let isAnswered = false;

    if (typeof answer === "string" && answer.trim() !== "") {
      isAnswered = true;
    } else if (typeof answer === "object" && answer !== null) {
      if (answer.check || (answer.written && answer.written.trim().length > 0)) {
        isAnswered = true;
      }
    }

    if (isAnswered) {
      btn.classList.add("answered");
    } else {
      btn.classList.remove("answered");
    }

    if (AppState.exam.flagged.has(qid)) {
      btn.classList.add("flagged");
    } else {
      btn.classList.remove("flagged");
    }
  }

  function updateExamProgress() {
    const total = AppState.exam.questions.length;
    let answered = 0;

    AppState.exam.questions.forEach(q => {
      const ans = AppState.exam.userAnswers[q.id];
      if (typeof ans === "string" && ans.trim() !== "") answered++;
      else if (typeof ans === "object" && ans !== null && (ans.check || (ans.written && ans.written.trim().length > 0))) {
        answered++;
      }
    });

    DOM.progressAnswered.textContent = answered;
    DOM.progressTotal.textContent = total;
  }

  function promptSubmitModal() {
    const total = AppState.exam.questions.length;
    let answered = 0;

    AppState.exam.questions.forEach(q => {
      const ans = AppState.exam.userAnswers[q.id];
      if (typeof ans === "string" && ans.trim() !== "") answered++;
      else if (typeof ans === "object" && ans !== null && (ans.check || (ans.written && ans.written.trim().length > 0))) {
        answered++;
      }
    });

    const unanswered = total - answered;
    DOM.modalSubmitStats.textContent = `全份試卷共 ${total} 題，您已作答 ${answered} 題，尚有 ${unanswered} 題未填寫。確認要現在交卷結算成績嗎？`;
    DOM.submitModal.classList.add("active");
  }

  function submitExam() {
    if (AppState.exam.timerInterval) {
      clearInterval(AppState.exam.timerInterval);
    }
    DOM.submitModal.classList.remove("active");

    // 計算作答用時
    const endTime = new Date();
    const elapsedSecs = Math.round((endTime - AppState.exam.startTime) / 1000);
    AppState.exam.elapsedSeconds = elapsedSecs;

    // 計分引擎
    let correctCount = 0;
    let wrongCount = 0;
    const totalCount = AppState.exam.questions.length;

    AppState.exam.questions.forEach(q => {
      const userAns = AppState.exam.userAnswers[q.id];
      let isCorrect = false;

      if (q.type === "single" || q.type === "group" || !q.tableTemplate) {
        if (userAns && userAns.toUpperCase() === q.answer.toUpperCase()) {
          isCorrect = true;
        }
      } else if (q.tableTemplate) {
        // 混合/非選
        const correctCheck = q.tableTemplate.correctCheck;
        if (userAns && userAns.check && userAns.check === correctCheck) {
          isCorrect = true;
        }
      }

      if (isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
        // 記錄到錯題本
        saveToWrongQuestions(q);
      }
    });

    const score = Math.round((correctCount / totalCount) * 100);
    AppState.exam.score = score;
    AppState.exam.correctCount = correctCount;
    AppState.exam.wrongCount = wrongCount;
    AppState.exam.submitted = true;

    // 渲染成績報告
    renderScoreReport();
    switchView("score-report-view");
  }

  function renderScoreReport() {
    const score = AppState.exam.score;
    DOM.reportFinalScore.textContent = score;
    DOM.reportCorrectCount.textContent = `${AppState.exam.correctCount} 題`;
    DOM.reportWrongCount.textContent = `${AppState.exam.wrongCount} 題`;
    DOM.reportAccuracyRate.textContent = `${Math.round((AppState.exam.correctCount / AppState.exam.questions.length) * 100)}%`;

    const m = Math.floor(AppState.exam.elapsedSeconds / 60);
    const s = AppState.exam.elapsedSeconds % 60;
    DOM.reportTimeSpent.textContent = `${m} 分 ${s} 秒`;

    // 圓形進度條
    DOM.scoreCircleIndicator.style.setProperty("--score-pct", `${score}%`);

    // 等級評定
    let tierText = "";
    if (score >= 90) {
      tierText = '<i class="fa-solid fa-crown text-amber-300"></i> 預估等級：頂標（A++ 公民神實力！）';
    } else if (score >= 80) {
      tierText = '<i class="fa-solid fa-medal text-blue-300"></i> 預估等級：前標（A+ 實力穩健，再接再厲！）';
    } else if (score >= 65) {
      tierText = '<i class="fa-solid fa-shield text-emerald-300"></i> 預估等級：均標（A/B++ 基礎紮實，多刷錯題！）';
    } else if (score >= 50) {
      tierText = '<i class="fa-solid fa-arrow-trend-up text-amber-300"></i> 預估等級：後標（加強核心單元觀念可大幅進步）';
    } else {
      tierText = '<i class="fa-solid fa-fire text-red-300"></i> 預估等級：底標（建議從第 1 單元重新循序複習）';
    }
    DOM.reportTierBadge.innerHTML = tierText;

    // 渲染試題解析列表
    renderReviewQuestions("all");
  }

  function renderReviewQuestions(filter = "all") {
    DOM.reviewQuestionsList.innerHTML = "";

    AppState.exam.questions.forEach((q, idx) => {
      const userAns = AppState.exam.userAnswers[q.id];
      let isCorrect = false;
      let userAnsDisplay = "";

      if (q.type === "single" || q.type === "group" || !q.tableTemplate) {
        userAnsDisplay = userAns || "未作答";
        if (userAns && userAns.toUpperCase() === q.answer.toUpperCase()) {
          isCorrect = true;
        }
      } else if (q.tableTemplate) {
        userAnsDisplay = userAns ? `勾選：${userAns.check || "未選"} / 理由：${userAns.written || "未填"}` : "未作答";
        if (userAns && userAns.check && userAns.check === q.tableTemplate.correctCheck) {
          isCorrect = true;
        }
      }

      if (filter === "wrong" && isCorrect) return;
      if (filter === "correct" && !isCorrect) return;

      const card = document.createElement("div");
      card.className = `review-card ${isCorrect ? "correct" : "wrong"}`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
          <div>
            <span class="q-num-badge">第 ${idx + 1} 題</span>
            <span class="q-unit-badge">單元 ${q.unit}</span>
            <span class="q-type-badge">${q.typeName || "單選"}</span>
          </div>
          <div>
            ${isCorrect 
              ? '<span class="badge text-success font-bold" style="font-weight:800; color:#10b981;"><i class="fa-solid fa-circle-check"></i> 作答正確</span>' 
              : '<span class="badge text-danger font-bold" style="font-weight:800; color:#ef4444;"><i class="fa-solid fa-circle-xmark"></i> 作答錯誤</span>'}
          </div>
        </div>

        ${q.groupContext ? `<div class="q-group-box" style="margin-bottom:0.75rem;">${escapeAndFormatText(q.groupContext)}</div>` : ""}

        <div class="q-stem" style="font-size:1rem; margin-bottom:0.75rem;">${idx + 1}. ${escapeAndFormatText(q.stem)}</div>

        ${q.options ? `
          <div class="options-list" style="margin-bottom:1rem;">
            ${q.options.map(opt => {
              const isOptCorrect = opt.key === q.answer;
              const isOptUser = userAns === opt.key;
              let styleCls = "";
              if (isOptCorrect) styleCls = "style='border-color:#10b981; background:#ecfdf5;'";
              else if (isOptUser && !isCorrect) styleCls = "style='border-color:#ef4444; background:#fef2f2;'";

              return `
                <div class="option-item" ${styleCls} style="cursor:default;">
                  <span class="option-key" style="${isOptCorrect ? "background:#10b981; color:#fff; border-color:#10b981;" : isOptUser ? "background:#ef4444; color:#fff; border-color:#ef4444;" : ""}">${opt.key}</span>
                  <span class="option-text">${opt.text} ${isOptCorrect ? '<b style="color:#059669;"> (正確答案)</b>' : ""} ${isOptUser && !isCorrect ? '<b style="color:#dc2626;"> (您的作答)</b>' : ""}</span>
                </div>
              `;
            }).join("")}
          </div>
        ` : ""}

        <div class="explanation-box show ${isCorrect ? "" : "wrong"}" style="margin-top:0.5rem;">
          <div class="explanation-header ${isCorrect ? "correct-text" : "wrong-text"}">
            <i class="fa-solid fa-lightbulb"></i> 正確答案：${q.answer || q.tableTemplate?.correctCheck} ｜ 您的作答：${userAnsDisplay}
          </div>
          <div class="explanation-body">
            <b>【考點與完整詳解】</b> ${escapeAndFormatText(q.explanation || (q.tableTemplate ? q.tableTemplate.modelAnswer : ""))}
          </div>
        </div>
      `;

      DOM.reviewQuestionsList.appendChild(card);
    });
  }

  /* ==========================================================================
     4. 即時練習 / 刷題模式 (Practice Mode)
     ========================================================================== */
  function renderPracticeMode() {
    if (!DOM.practiceQuestionsContainer) return;
    DOM.practiceQuestionsContainer.innerHTML = "";

    const selectedUnit = DOM.practiceUnitSelect.value;
    let questions = [];

    if (selectedUnit === "all") {
      EXAM_DATABASE.units.forEach(u => questions.push(...u.questions));
    } else {
      const uid = parseInt(selectedUnit);
      const targetUnit = EXAM_DATABASE.units.find(u => u.id === uid);
      if (targetUnit) questions.push(...targetUnit.questions);
    }

    questions = shuffleArray(questions);

    questions.forEach((q, idx) => {
      const card = document.createElement("div");
      card.className = "question-card";
      card.id = `practice-q-${idx}`;

      let groupContextHtml = "";
      if (q.groupContext) {
        groupContextHtml = `
          <div class="q-group-box">
            <div class="q-group-title"><i class="fa-solid fa-file-lines text-primary"></i> ${q.groupTitle || "題組資料"}</div>
            <div>${escapeAndFormatText(q.groupContext)}</div>
          </div>
        `;
      }

      let optionsHtml = "";
      if (q.options && q.options.length > 0) {
        optionsHtml = `
          <div class="options-list">
            ${q.options.map(opt => `
              <div class="option-item practice-option-item" data-qid="${q.id}" data-opt="${opt.key}" data-correct="${q.answer}">
                <span class="option-key">${opt.key}</span>
                <span class="option-text">${opt.text}</span>
              </div>
            `).join("")}
          </div>
        `;
      } else if (q.tableTemplate) {
        const checkOptions = q.tableTemplate.checkOptions || [];
        optionsHtml = `
          <div class="mixed-interactive-box" style="margin-bottom:0.75rem;">
            ${checkOptions.length > 0 ? `
              <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.4rem;"><i class="fa-solid fa-square-check"></i> 請勾選答案項目：</div>
              <div class="checkbox-pick-group">
                ${checkOptions.map(chk => `
                  <div class="check-chip practice-check-chip" data-qid="${q.id}" data-check="${chk}" data-correct="${q.tableTemplate.correctCheck}">
                    <i class="fa-regular fa-circle"></i> ${chk}
                  </div>
                `).join("")}
              </div>
            ` : ""}
            <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.4rem;">
              <i class="fa-solid fa-pen"></i> ${q.tableTemplate.explanationLabel || "寫出判斷理由"}：
            </div>
            <textarea class="written-textarea" placeholder="請在此輸入您的理由或佐證說明..."></textarea>
            <div style="margin-top:0.6rem;">
              <button class="btn btn-secondary btn-sm btn-practice-reveal" data-idx="${idx}">
                <i class="fa-solid fa-eye"></i> 對照標準答案與解析
              </button>
            </div>
          </div>
        `;
      } else {
        optionsHtml = `
          <div class="mixed-interactive-box" style="margin-bottom:0.75rem;">
            <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.4rem;">
              <i class="fa-solid fa-pen-nib"></i> 【手寫作答填答區】請輸入您的分析與答案：
            </div>
            <textarea class="written-textarea" placeholder="請在此輸入您的作答內容..."></textarea>
            <div style="margin-top:0.6rem;">
              <button class="btn btn-secondary btn-sm btn-practice-reveal" data-idx="${idx}">
                <i class="fa-solid fa-eye"></i> 對照標準答案與解析
              </button>
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="question-card-header">
          <div class="q-meta">
            <span class="q-num-badge">練習 #${idx + 1}</span>
            <span class="q-unit-badge">單元 ${q.unit}</span>
            <span class="q-type-badge">${q.typeName || "單選"}</span>
            ${q.tag ? `<span class="q-type-badge text-primary" style="background:#eff6ff;"><i class="fa-solid fa-award"></i> ${q.tag}</span>` : ""}
          </div>
        </div>

        ${groupContextHtml}

        <div class="q-stem">${escapeAndFormatText(q.stem)}</div>

        ${optionsHtml}

        <div class="explanation-box" id="practice-exp-${idx}">
          <div class="explanation-header" id="practice-exp-header-${idx}">
            <i class="fa-solid fa-circle-check"></i> 正確答案：${q.answer || (q.tableTemplate ? q.tableTemplate.correctCheck : "")}
          </div>
          <div class="explanation-body">
            <b>【考點解析】</b> ${escapeAndFormatText(q.explanation || (q.tableTemplate ? q.tableTemplate.modelAnswer : ""))}
          </div>
        </div>
      `;

      DOM.practiceQuestionsContainer.appendChild(card);
    });

    // 綁定刷題點擊立即解析
    DOM.practiceQuestionsContainer.querySelectorAll(".practice-option-item").forEach(item => {
      item.addEventListener("click", () => {
        const qid = item.dataset.qid;
        const opt = item.dataset.opt;
        const correct = item.dataset.correct;
        const card = item.closest(".question-card");
        const expBox = card.querySelector(".explanation-box");
        const expHeader = card.querySelector(".explanation-header");

        // 鎖定此卡片所有選項
        card.querySelectorAll(".practice-option-item").forEach(o => {
          o.style.pointerEvents = "none";
          if (o.dataset.opt === correct) {
            o.style.borderColor = "#10b981";
            o.style.background = "#ecfdf5";
          }
        });

        if (opt === correct) {
          item.style.borderColor = "#10b981";
          item.style.background = "#ecfdf5";
          expBox.className = "explanation-box show";
          expHeader.className = "explanation-header correct-text";
          expHeader.innerHTML = `<i class="fa-solid fa-circle-check"></i> 答對了！正確答案是 (${correct})`;
        } else {
          item.style.borderColor = "#ef4444";
          item.style.background = "#fef2f2";
          expBox.className = "explanation-box show wrong";
          expHeader.className = "explanation-header wrong-text";
          expHeader.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 答錯囉！您選 (${opt})，正確答案是 (${correct})`;
          
          // 加入錯題本
          const targetQ = findQuestionById(qid);
          if (targetQ) saveToWrongQuestions(targetQ);
        }
      });
    });

    // 綁定混合題選項勾選與非選題答案對照按鈕
    DOM.practiceQuestionsContainer.querySelectorAll(".practice-check-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const card = chip.closest(".question-card");
        const expBox = card.querySelector(".explanation-box");
        const expHeader = card.querySelector(".explanation-header");
        const chosen = chip.dataset.check;
        const correct = chip.dataset.correct;

        card.querySelectorAll(".practice-check-chip").forEach(c => {
          c.classList.remove("checked");
          c.querySelector("i").className = "fa-regular fa-circle";
        });
        chip.classList.add("checked");
        chip.querySelector("i").className = "fa-regular fa-circle-dot";

        expBox.className = "explanation-box show";
        if (chosen === correct) {
          expHeader.className = "explanation-header correct-text";
          expHeader.innerHTML = `<i class="fa-solid fa-circle-check"></i> 勾選正確！正確答案是【${correct}】`;
        } else {
          expHeader.className = "explanation-header wrong-text";
          expHeader.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 勾選有誤！您選【${chosen}】，正確答案是【${correct}】`;
        }
      });
    });

    DOM.practiceQuestionsContainer.querySelectorAll(".btn-practice-reveal").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = btn.dataset.idx;
        const expBox = document.getElementById(`practice-exp-${idx}`);
        if (expBox) {
          expBox.classList.toggle("show");
          if (expBox.classList.contains("show")) {
            btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> 隱藏標準答案與解析';
          } else {
            btn.innerHTML = '<i class="fa-solid fa-eye"></i> 對照標準答案與解析';
          }
        }
      });
    });
  }

  /* ==========================================================================
     5. 考券列印與 PDF 匯出模式 (Print & PDF Generator)
     ========================================================================== */
  function renderPrintPaper() {
    if (!DOM.paperQuestionsRenderArea) return;
    DOM.paperQuestionsRenderArea.innerHTML = "";

    const mode = AppState.print.mode; // 'question' | 'answer'
    const unitFilter = AppState.print.unitFilter;

    let questions = [];
    if (unitFilter === "all") {
      EXAM_DATABASE.units.forEach(u => questions.push(...u.questions));
    } else {
      const uid = parseInt(unitFilter);
      const targetUnit = EXAM_DATABASE.units.find(u => u.id === uid);
      if (targetUnit) questions.push(...targetUnit.questions);
    }

    // 更新抬頭與副標題
    if (mode === "question") {
      DOM.printPaperSubTitle.textContent = `115 學年度 公民與社會科 實戰測驗【題目卷】（共 ${questions.length} 題）`;
      DOM.paperStudentInfoBox.style.display = "table";
      DOM.paperNoticeText.style.display = "block";
      DOM.paperNoticeText.innerHTML = `<b>【注意事項】</b> 1. 本試卷為測驗試題卷，請將答案依題號謄寫於作答欄中。 2. 滿分 100 分，請掌握作答時間。`;
      DOM.paperManualAnswerSheet.style.display = "block";
      renderManualAnswerGrid(questions.length);
    } else {
      DOM.printPaperSubTitle.textContent = `115 學年度 公民與社會科 實戰測驗【解答與詳解卷】（共 ${questions.length} 題）`;
      DOM.paperStudentInfoBox.style.display = "none";
      DOM.paperNoticeText.style.display = "none";
      DOM.paperNoticeText.innerHTML = "";
      DOM.paperManualAnswerSheet.style.display = "none";
    }

    // 解答卷模式在最上方加上「快速簡答速查表」
    if (mode === "answer") {
      const quickKeyCard = document.createElement("div");
      quickKeyCard.style.cssText = "background: #f1f5f9; border: 1.5px solid #000; padding: 1rem; margin-bottom: 1.5rem; border-radius: 4px;";
      
      let keysHtml = '<div style="font-weight:900; margin-bottom:0.5rem; font-size:1rem; text-align:center;"><i class="fa-solid fa-key"></i> 【簡答速查表】</div><div style="display:grid; grid-template-columns:repeat(10, 1fr); gap:6px; font-size:0.85rem; text-align:center;">';
      
      questions.forEach((q, idx) => {
        const ans = q.answer || (q.tableTemplate ? q.tableTemplate.correctCheck : "—");
        keysHtml += `
          <div style="border:1px solid #94a3b8; background:#fff; padding:4px 2px; border-radius:2px;">
            <div style="font-size:0.75rem; color:#64748b;">${idx + 1}</div>
            <div style="font-weight:800; color:#b91c1c;">${ans}</div>
          </div>
        `;
      });
      keysHtml += "</div>";
      quickKeyCard.innerHTML = keysHtml;
      DOM.paperQuestionsRenderArea.appendChild(quickKeyCard);
    }

    // 依題型分類或循序輸出試題
    let currentSection = "";
    let questionCounter = 0;

    questions.forEach((q, idx) => {
      questionCounter++;

      // 單元或題型分段標題
      const sectionKey = `${q.unitName} - ${q.section}`;
      if (sectionKey !== currentSection) {
        currentSection = sectionKey;
        const secHeader = document.createElement("div");
        secHeader.className = "paper-section-title";
        secHeader.textContent = `▌ ${currentSection}`;
        DOM.paperQuestionsRenderArea.appendChild(secHeader);
      }

      const qItem = document.createElement("div");
      qItem.className = "paper-q-item";

      let groupContextHtml = "";
      if (q.groupContext) {
        groupContextHtml = `
          <div style="background:#f8fafc; border-left:3px solid #3b82f6; padding:0.6rem 0.85rem; margin-bottom:0.6rem; font-size:0.9rem; line-height:1.6;">
            <b>${q.groupTitle || "【題組資料】"}</b><br>
            ${escapeAndFormatText(q.groupContext)}
          </div>
        `;
      }

      let optionsHtml = "";
      if (q.options && q.options.length > 0) {
        optionsHtml = `
          <div class="paper-q-options">
            ${q.options.map(opt => {
              const isCorrectOpt = mode === "answer" && opt.key === q.answer;
              return `
                <div class="paper-q-opt">
                  (${opt.key}) ${opt.text} ${isCorrectOpt ? '<span class="paper-ans-highlight">【正解】</span>' : ""}
                </div>
              `;
            }).join("")}
          </div>
        `;
      } else if (q.tableTemplate) {
        // 混合/非選題表格呈現
        optionsHtml = `
          <div style="margin: 0.5rem 0 0.5rem 1.25rem; font-size:0.9rem;">
            ${q.tableTemplate.checkOptions ? `
              <div style="margin-bottom:0.35rem;">
                <b>勾選項目：</b> ${q.tableTemplate.checkOptions.map(c => `[ ${mode === "answer" && c === q.tableTemplate.correctCheck ? '<b style="color:#b91c1c;">☑ 正解：' + c + '</b>' : '☐ ' + c} ]`).join("　")}
              </div>
            ` : ""}
            <div>
              <b>${q.tableTemplate.explanationLabel || "理由說明"}：</b>
              ${mode === "answer" ? `<span style="color:#b91c1c; font-weight:700;">${q.tableTemplate.modelAnswer}</span>` : '<span style="color:#94a3b8;">（請於作答欄寫出理由）</span>'}
            </div>
          </div>
        `;
      }

      let explanationBoxHtml = "";
      if (mode === "answer") {
        explanationBoxHtml = `
          <div class="paper-explanation-box">
            <b>【試題解析與考點】</b> ${escapeAndFormatText(q.explanation || (q.tableTemplate ? q.tableTemplate.modelAnswer : ""))}<br>
            <span style="font-size:0.8rem; color:#64748b;">出處來源：${q.unitName} ${q.tag ? " / " + q.tag : ""}</span>
          </div>
        `;
      }

      qItem.innerHTML = `
        ${groupContextHtml}
        <div class="paper-q-stem">
          ${questionCounter}. ${escapeAndFormatText(q.stem)}
          ${mode === "answer" ? `<span class="paper-ans-highlight">【答案：${q.answer || q.tableTemplate?.correctCheck}】</span>` : ""}
        </div>
        ${optionsHtml}
        ${explanationBoxHtml}
      `;

      DOM.paperQuestionsRenderArea.appendChild(qItem);
    });
  }

  function renderManualAnswerGrid(totalQuestions) {
    if (!DOM.paperAnswerBoxesGrid) return;
    DOM.paperAnswerBoxesGrid.innerHTML = "";

    for (let i = 1; i <= totalQuestions; i++) {
      const box = document.createElement("div");
      box.style.cssText = "border: 1px solid #000; padding: 4px 2px; text-align: center;";
      box.innerHTML = `
        <div style="font-size: 0.7rem; color: #475569;">${i}</div>
        <div style="height: 18px;"></div>
      `;
      DOM.paperAnswerBoxesGrid.appendChild(box);
    }
  }

  /* ==========================================================================
     6. 吉祥物懸停霓虹發光 + 抖動 + 全螢幕拖曳移動
     ========================================================================== */
  function initMascotDrag() {
    const mascot = DOM.mascotContainer;
    if (!mascot) return;

    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop;
    let hasMoved = false;

    // 滑鼠事件
    mascot.addEventListener("mousedown", (e) => {
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = mascot.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // 移除 bottom/right，改為 top/left 控制
      mascot.style.bottom = "auto";
      mascot.style.right = "auto";
      mascot.style.left = `${initialLeft}px`;
      mascot.style.top = `${initialTop}px`;

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
      }

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      // 限制在可視螢幕範圍內
      const maxLeft = window.innerWidth - mascot.offsetWidth - 10;
      const maxTop = window.innerHeight - mascot.offsetHeight - 10;

      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      mascot.style.left = `${newLeft}px`;
      mascot.style.top = `${newTop}px`;
    }

    function onMouseUp() {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    // 行動裝置觸控事件 (Touch Drag)
    mascot.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      isDragging = true;
      hasMoved = false;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;

      const rect = mascot.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      mascot.style.bottom = "auto";
      mascot.style.right = "auto";
      mascot.style.left = `${initialLeft}px`;
      mascot.style.top = `${initialTop}px`;
    }, { passive: true });

    mascot.addEventListener("touchmove", (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
      }

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      const maxLeft = window.innerWidth - mascot.offsetWidth - 10;
      const maxTop = window.innerHeight - mascot.offsetHeight - 10;

      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      mascot.style.left = `${newLeft}px`;
      mascot.style.top = `${newTop}px`;
    }, { passive: true });

    mascot.addEventListener("touchend", () => {
      isDragging = false;
    });
  }

  /* ==========================================================================
     7. 錯題本儲存與快覽功能
     ========================================================================== */
  function saveToWrongQuestions(question) {
    if (!AppState.wrongQuestions.some(item => item.id === question.id)) {
      AppState.wrongQuestions.push(question);
      localStorage.setItem("gms_wrong_questions", JSON.stringify(AppState.wrongQuestions));
      updateWrongBadge();
    }
  }

  function updateWrongBadge() {
    if (DOM.wrongCountBadge) {
      DOM.wrongCountBadge.textContent = AppState.wrongQuestions.length;
    }
  }

  function launchWrongQuestionsExam() {
    if (AppState.wrongQuestions.length === 0) {
      alert("目前錯題本空空如也！先去練習或進行模擬測驗吧～");
      return;
    }
    startExam(AppState.wrongQuestions);
  }

  /* ==========================================================================
     8. 事件監聽綁定
     ========================================================================== */
  function bindEvents() {
    // 頂部導航
    DOM.navButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        if (target === "print-view") {
          renderPrintPaper();
        } else if (target === "practice-view") {
          renderPracticeMode();
        }
        switchView(target);
      });
    });

    // 模考設定啟動
    DOM.btnLaunchExam.addEventListener("click", () => startExam());
    DOM.btnStartFullExam.addEventListener("click", () => {
      // 全單元模考快捷鍵
      document.querySelectorAll(".unit-check-input").forEach(cb => cb.checked = true);
      startExam();
    });

    // 模考重設
    DOM.btnConfigReset.addEventListener("click", () => {
      document.querySelectorAll(".unit-check-input").forEach(cb => cb.checked = true);
      DOM.examQCountSelect.value = "20";
      DOM.examTimerSelect.value = "50";
      DOM.examOrderSelect.value = "random";
      DOM.examTypeFilterSelect.value = "all";
    });

    // 交卷按鈕
    DOM.btnSubmitExam.addEventListener("click", promptSubmitModal);
    DOM.btnSidebarSubmit.addEventListener("click", promptSubmitModal);

    // Modal 按鈕
    DOM.btnModalCancel.addEventListener("click", () => {
      DOM.submitModal.classList.remove("active");
    });
    DOM.btnModalConfirm.addEventListener("click", submitExam);

    // 成績頁重新測驗
    DOM.btnRetest.addEventListener("click", () => {
      switchView("exam-config-view");
    });

    // 匯出詳解 PDF
    DOM.btnExportResultPdf.addEventListener("click", () => {
      AppState.print.mode = "answer";
      AppState.print.unitFilter = "all";
      DOM.btnModeAnswerPaper.classList.add("active");
      DOM.btnModeQuestionPaper.classList.remove("active");
      renderPrintPaper();
      switchView("print-view");
      setTimeout(() => window.print(), 300);
    });

    // 成績頁檢討篩選
    document.querySelectorAll("[data-review-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-review-filter]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderReviewQuestions(btn.dataset.reviewFilter);
      });
    });

    // 刷題單元切換
    DOM.practiceUnitSelect.addEventListener("change", renderPracticeMode);
    DOM.btnPracticeRefresh.addEventListener("click", renderPracticeMode);

    // 考券列印模式切換
    DOM.btnModeQuestionPaper.addEventListener("click", () => {
      AppState.print.mode = "question";
      DOM.btnModeQuestionPaper.classList.add("active");
      DOM.btnModeAnswerPaper.classList.remove("active");
      renderPrintPaper();
    });

    DOM.btnModeAnswerPaper.addEventListener("click", () => {
      AppState.print.mode = "answer";
      DOM.btnModeAnswerPaper.classList.add("active");
      DOM.btnModeQuestionPaper.classList.remove("active");
      renderPrintPaper();
    });

    DOM.printUnitFilter.addEventListener("change", (e) => {
      AppState.print.unitFilter = e.target.value;
      renderPrintPaper();
    });

    DOM.btnTriggerPrint.addEventListener("click", () => {
      window.print();
    });

    // 錯題本快捷按鈕
    DOM.btnQuickWrongBook.addEventListener("click", launchWrongQuestionsExam);

    // 清除歷史紀錄 Modal 事件
    if (DOM.btnClearHistory) {
      DOM.btnClearHistory.addEventListener("click", () => {
        if (DOM.clearHistoryModal) DOM.clearHistoryModal.classList.add("active");
      });
    }

    if (DOM.btnModalClearCancel) {
      DOM.btnModalClearCancel.addEventListener("click", () => {
        if (DOM.clearHistoryModal) DOM.clearHistoryModal.classList.remove("active");
      });
    }

    if (DOM.btnModalClearConfirm) {
      DOM.btnModalClearConfirm.addEventListener("click", () => {
        localStorage.removeItem("gms_wrong_questions");
        AppState.wrongQuestions = [];
        updateWrongBadge();
        if (DOM.clearHistoryModal) DOM.clearHistoryModal.classList.remove("active");
        alert("已成功清除所有作答與錯題歷史紀錄！");
      });
    }

    // Hero 統計卡片捷徑
    const heroStatPdf = document.getElementById("hero-stat-pdf");
    if (heroStatPdf) {
      heroStatPdf.addEventListener("click", () => {
        renderPrintPaper();
        switchView("print-view");
      });
    }

    const heroStatQuestions = document.getElementById("hero-stat-questions");
    if (heroStatQuestions) {
      heroStatQuestions.addEventListener("click", () => {
        switchView("exam-config-view");
      });
    }

    const heroStatUnits = document.getElementById("hero-stat-units");
    if (heroStatUnits) {
      heroStatUnits.addEventListener("click", () => {
        switchView("overview-view");
      });
    }
  }

  /* ==========================================================================
     輔助工具函數
     ========================================================================== */
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function findQuestionById(qid) {
    for (const unit of EXAM_DATABASE.units) {
      const found = unit.questions.find(q => q.id === qid);
      if (found) return found;
    }
    return null;
  }

  function renderMarkdownTable(rows) {
    if (rows.length === 0) return "";
    let html = '<div class="table-responsive"><table class="data-table">';
    const headerRow = rows[0];
    html += '<thead><tr>';
    headerRow.forEach(cell => {
      html += `<th>${cell}</th>`;
    });
    html += '</tr></thead><tbody>';

    for (let r = 1; r < rows.length; r++) {
      html += '<tr>';
      rows[r].forEach(cell => {
        html += `<td>${cell}</td>`;
      });
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  function escapeAndFormatText(text) {
    if (!text) return "";

    // 1. 替換常見 LaTeX 特殊符號為標準符號
    let formatted = text
      .replace(/\\to/g, "→")
      .replace(/\\times/g, "×")
      .replace(/\\approx/g, "≈")
      .replace(/\\ge/g, "≥")
      .replace(/\\le/g, "≤")
      .replace(/\\checkmark/g, "✔")
      .replace(/\\square/g, "□")
      .replace(/\\uparrow/g, "↑")
      .replace(/\\downarrow/g, "↓")
      .replace(/\\rightarrow/g, "→")
      .replace(/\\leftarrow/g, "←")
      .replace(/\\text\{([^}]+)\}/g, "$1")
      .replace(/\$([^\$]+)\$/g, '<span class="math-expr">$1</span>');

    // 2. 判斷是否包含 Markdown 表格 (以 | 開頭和結尾的行)
    if (formatted.includes("|")) {
      const lines = formatted.split("\n");
      let inTable = false;
      let tableRows = [];
      let result = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("|") && line.endsWith("|")) {
          // 判斷是否為表格分隔線如 |---|---|
          if (/^\|(\s*[-:]+[-|\s:]*)\|$/.test(line)) {
            continue;
          }
          if (!inTable) {
            inTable = true;
            tableRows = [];
          }
          const cells = line.slice(1, -1).split("|").map(c => c.trim());
          tableRows.push(cells);
        } else {
          if (inTable) {
            result.push(renderMarkdownTable(tableRows));
            inTable = false;
            tableRows = [];
          }
          result.push(line);
        }
      }

      if (inTable) {
        result.push(renderMarkdownTable(tableRows));
      }

      formatted = result.join("\n");
    }

    // 3. 粗體語法 **字串**
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 4. 一般文字換行符號轉為 <br>
    return formatted.replace(/\n/g, "<br>");
  }

  // 執行啟動
  init();
});

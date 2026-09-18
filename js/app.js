/**
 * 學測/會考 公民神模考系統 - 主控制邏輯
 * 模式：(1) 單元總覽 (2) 即時刷題練習 (題組集中容器) (3) 考券列印與 PDF 匯出
 * 整合：公民神AI助教 (Google Gemini API)、吉祥物互動、錯題本
 */

document.addEventListener("DOMContentLoaded", () => {
  // 核心狀態管理
  const AppState = {
    currentView: "overview-view",
    practice: {
      questions: [],
      unitFilter: "all",
      isWrongMode: false
    },
    print: {
      mode: "question", // 'question' (題目卷) 或 'answer' (解答卷)
      unitFilter: "all"
    },
    ai: {
      apiKey: localStorage.getItem("gms_gemini_api_key") || "",
      model: localStorage.getItem("gms_gemini_model") || "gemini-2.5-flash",
      chatHistories: {}
    },
    wrongQuestions: JSON.parse(localStorage.getItem("gms_wrong_questions") || "[]")
  };

  // 初始化 DOM 元素快取
  const DOM = {
    views: document.querySelectorAll(".view-section"),
    navButtons: document.querySelectorAll(".nav-tab-btn"),
    unitsGrid: document.getElementById("units-grid-container"),
    btnStartAllPractice: document.getElementById("btn-start-all-practice"),

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

    // AI Elements
    btnAiSettings: document.getElementById("btn-ai-settings"),
    aiSettingsModal: document.getElementById("ai-settings-modal"),
    inputGeminiApiKey: document.getElementById("input-gemini-api-key"),
    selectGeminiModel: document.getElementById("select-gemini-model"),
    btnToggleKeyVisibility: document.getElementById("btn-toggle-key-visibility"),
    iconEyeKey: document.getElementById("icon-eye-key"),
    btnSaveAiSettings: document.getElementById("btn-save-ai-settings"),
    btnCloseAiModal: document.getElementById("btn-close-ai-modal"),
    btnCloseAiX: document.getElementById("btn-close-ai-x"),
    btnTestAiKey: document.getElementById("btn-test-ai-key"),
    btnClearAiKey: document.getElementById("btn-clear-ai-key"),
    aiTestStatus: document.getElementById("ai-test-status"),
    aiTutorialModal: document.getElementById("ai-tutorial-modal"),
    btnOpenTutorialFromSettings: document.getElementById("btn-open-tutorial-from-settings"),
    btnCloseTutorialX: document.getElementById("btn-close-tutorial-x"),
    btnTutorialGotIt: document.getElementById("btn-tutorial-got-it"),

    // Mascot Elements
    mascotContainer: document.getElementById("mascot-container"),
    mascotImg: document.getElementById("mascot-img"),

    // Wrong Book & History
    wrongCountBadge: document.getElementById("wrong-count-badge"),
    btnQuickWrongBook: document.getElementById("btn-quick-wrong-book"),
    btnClearHistory: document.getElementById("btn-clear-history"),
    clearHistoryModal: document.getElementById("clear-history-modal"),
    btnModalClearCancel: document.getElementById("btn-modal-clear-cancel"),
    btnModalClearConfirm: document.getElementById("btn-modal-clear-confirm"),

    // Stats in hero
    statTotalUnits: document.getElementById("stat-total-units"),
    statTotalQuestions: document.getElementById("stat-total-questions"),
    heroStatUnits: document.getElementById("hero-stat-units"),
    heroStatQuestions: document.getElementById("hero-stat-questions"),
    heroStatPdf: document.getElementById("hero-stat-pdf")
  };

  /* ==========================================================================
     0. 安全資料庫存取輔助 (Safe Database Access)
     ========================================================================== */
  function getDB() {
    if (typeof EXAM_DATABASE !== "undefined" && EXAM_DATABASE && EXAM_DATABASE.units) {
      return EXAM_DATABASE;
    }
    if (typeof window !== "undefined" && window.EXAM_DATABASE && window.EXAM_DATABASE.units) {
      return window.EXAM_DATABASE;
    }
    return { units: [] };
  }

  /* ==========================================================================
     1. 題組歸納與群組化演算法 (Group Clustering Engine)
     ========================================================================== */
  function clusterQuestions(questions) {
    if (!questions || questions.length === 0) return [];
    const clusters = [];
    let currentGroup = null;

    questions.forEach(q => {
      const hasGroup = q.groupContext && q.groupContext.trim().length > 0;
      if (hasGroup) {
        if (currentGroup && currentGroup.groupContext === q.groupContext) {
          currentGroup.questions.push(q);
        } else {
          if (currentGroup) {
            clusters.push(currentGroup);
          }
          currentGroup = {
            isGroup: true,
            groupContext: q.groupContext,
            groupTitle: q.groupTitle || "題組背景資料",
            unit: q.unit,
            unitName: q.unitName || `第 ${q.unit} 單元`,
            questions: [q]
          };
        }
      } else {
        if (currentGroup) {
          clusters.push(currentGroup);
          currentGroup = null;
        }
        clusters.push({
          isGroup: false,
          question: q
        });
      }
    });

    if (currentGroup) {
      clusters.push(currentGroup);
    }
    return clusters;
  }

  function getQuestionsForScope(unitVal = "all") {
    const db = getDB();
    const units = db.units || [];
    let list = [];

    if (unitVal === "all") {
      units.forEach(u => {
        if (u.questions) list.push(...u.questions);
      });
    } else {
      const uid = parseInt(unitVal);
      const targetUnit = units.find(u => u.id === uid);
      if (targetUnit && targetUnit.questions) {
        list.push(...targetUnit.questions);
      }
    }
    return list;
  }

  /* ==========================================================================
     2. 視圖切換與頂部狀態統計
     ========================================================================== */
  function switchView(viewId) {
    AppState.currentView = viewId;
    DOM.views.forEach(view => {
      if (view.id === viewId) {
        view.classList.add("active");
      } else {
        view.classList.remove("active");
      }
    });

    DOM.navButtons.forEach(btn => {
      if (btn.dataset.target === viewId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateTotalStats() {
    const db = getDB();
    const units = db.units || [];
    const totalUnits = units.length;
    let totalQuestions = 0;
    units.forEach(u => {
      totalQuestions += (u.questions ? u.questions.length : 0);
    });

    if (DOM.statTotalUnits) {
      DOM.statTotalUnits.textContent = `${totalUnits} 大核心`;
    }
    if (DOM.statTotalQuestions) {
      DOM.statTotalQuestions.textContent = `${totalQuestions} 題`;
    }
  }

  function populateUnitDropdowns() {
    const db = getDB();
    const units = db.units || [];

    if (DOM.practiceUnitSelect) {
      const curPracticeVal = DOM.practiceUnitSelect.value;
      DOM.practiceUnitSelect.innerHTML = `<option value="all">🌟 全單元隨機刷題 (共 18 單元)</option>`;
      units.forEach(u => {
        DOM.practiceUnitSelect.innerHTML += `<option value="${u.id}">第 ${u.id} 單元 ${escapeHtml(u.title)} (${u.questions ? u.questions.length : 0} 題)</option>`;
      });
      if (curPracticeVal) DOM.practiceUnitSelect.value = curPracticeVal;
    }

    if (DOM.printUnitFilter) {
      const curPrintVal = DOM.printUnitFilter.value;
      DOM.printUnitFilter.innerHTML = `<option value="all">匯出範圍：全單元綜合試卷 (18 單元共收錄)</option>`;
      units.forEach(u => {
        DOM.printUnitFilter.innerHTML += `<option value="${u.id}">第 ${u.id} 單元 ${escapeHtml(u.title)} (${u.questions ? u.questions.length : 0} 題)</option>`;
      });
      if (curPrintVal) DOM.printUnitFilter.value = curPrintVal;
    }
  }

  /* ==========================================================================
     3. 視圖 1: 單元總覽 (Overview Cards)
     ========================================================================== */
  function renderOverviewUnitCards() {
    if (!DOM.unitsGrid) return;
    DOM.unitsGrid.innerHTML = "";
    const db = getDB();
    const units = db.units || [];

    if (units.length === 0) {
      DOM.unitsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #64748b;">題庫載入中，請稍候...</div>`;
      return;
    }

    units.forEach(u => {
      const card = document.createElement("div");
      card.className = "unit-card";
      card.innerHTML = `
        <div class="unit-card-header">
          <span class="unit-num-badge">第 ${u.id} 單元</span>
          <span class="unit-qcount"><i class="fa-solid fa-list-check"></i> ${u.questions ? u.questions.length : 0} 題</span>
        </div>
        <h3 class="unit-card-title">${escapeHtml(u.title)}</h3>
        <p class="unit-card-desc">${escapeHtml(u.description || "包含精選單選素養題、歷屆試題與非選題組。")}</p>
        <div class="unit-card-footer">
          <button class="btn btn-primary btn-sm btn-unit-practice" data-uid="${u.id}" style="flex: 1.2;">
            <i class="fa-solid fa-bolt"></i> 即時刷題
          </button>
          <button class="btn btn-secondary btn-sm btn-unit-print" data-uid="${u.id}" style="flex: 1;">
            <i class="fa-solid fa-file-pdf"></i> 列印考卷
          </button>
        </div>
      `;

      const btnPractice = card.querySelector(".btn-unit-practice");
      if (btnPractice) {
        btnPractice.addEventListener("click", () => {
          if (DOM.practiceUnitSelect) {
            DOM.practiceUnitSelect.value = String(u.id);
          }
          AppState.practice.isWrongMode = false;
          renderPracticeMode();
          switchView("practice-view");
        });
      }

      const btnPrint = card.querySelector(".btn-unit-print");
      if (btnPrint) {
        btnPrint.addEventListener("click", () => {
          if (DOM.printUnitFilter) {
            DOM.printUnitFilter.value = String(u.id);
          }
          AppState.print.unitFilter = String(u.id);
          renderPrintPaper();
          switchView("print-view");
        });
      }

      DOM.unitsGrid.appendChild(card);
    });
  }

  /* ==========================================================================
     4. AI 助教服務模組 (Google Gemini API 整合 - 公民神AI助教)
     ========================================================================== */
  const AIService = {
    getApiKey() {
      return localStorage.getItem("gms_gemini_api_key") || "";
    },
    getModel() {
      return localStorage.getItem("gms_gemini_model") || "gemini-2.5-flash";
    },
    saveConfig(apiKey, model) {
      localStorage.setItem("gms_gemini_api_key", apiKey.trim());
      localStorage.setItem("gms_gemini_model", model);
      AppState.ai.apiKey = apiKey.trim();
      AppState.ai.model = model;
    },
    clearConfig() {
      localStorage.removeItem("gms_gemini_api_key");
      AppState.ai.apiKey = "";
    },
    async testConnection(apiKey, model) {
      if (!apiKey || apiKey.trim() === "") {
        throw new Error("請先填入 Google Gemini API Key！");
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "測試連線：請回覆「連線成功」四個字即可。" }] }],
          generationConfig: { maxOutputTokens: 30 }
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `連線失敗 (HTTP ${res.status})`);
      }
      return await res.json();
    },
    async askQuestion(questionObj, userAnswer = null, customPrompt = null, chatHistory = []) {
      const apiKey = this.getApiKey();
      const model = this.getModel();
      if (!apiKey) {
        throw new Error("NO_API_KEY");
      }

      const systemPrompt = `你是一位專業的高中公民與社會科頂標名師兼升學輔導「公民神AI助教」。
請針對以下試題進行【精準、結構化、不冗長、直擊高中生盲點與迷思】的解析。回答字數請控制在精簡好讀的範圍（約 200~350 字以內），不要長篇大論，以條列式清晰呈現。

【試題資訊】
單元：${questionObj.unitName || `第 ${questionObj.unit} 單元`}
${questionObj.groupContext ? `【題組背景資料】：\n${questionObj.groupContext}\n` : ""}
【題目】：${questionObj.stem}
${questionObj.options && questionObj.options.length > 0 ? `【選項】：\n${questionObj.options.map(o => `(${o.key}) ${o.text}`).join("\n")}` : ""}
${questionObj.tableTemplate ? `【作答表格/非選題型架構】：\n${JSON.stringify(questionObj.tableTemplate)}` : ""}
【標準答案】：${questionObj.answer || questionObj.tableTemplate?.correctCheck || questionObj.tableTemplate?.modelAnswer || "依題意"}
${userAnswer ? `【學生作答】：${userAnswer}` : ""}

請嚴格遵循以下 4 點結構化格式輸出：
1. 🎯【核心考點】：（1~2 句話一針見血點出本題測驗的核心公民概念或法條原則）
2. ⚠️【高中生常見迷思釐清】：（指出學生最常混淆的概念界線、題目關鍵陷阱或誤區）
3. 🔍【選項速剖與正解理由】：（條列各選項對錯關鍵原因，簡明扼要）
4. 💡【秒殺關鍵字】：（一句話提點快速判斷的關鍵訊號或口訣）`;

      const contents = [];
      if (chatHistory && chatHistory.length > 0) {
        chatHistory.forEach(msg => {
          contents.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
          });
        });
        if (customPrompt) {
          contents.push({
            role: "user",
            parts: [{ text: customPrompt }]
          });
        }
      } else {
        const userMsg = customPrompt 
          ? `${systemPrompt}\n\n學生額外提問：${customPrompt}`
          : `${systemPrompt}\n\n請為我提供精準、結構化的考點與高中生常見迷思解析。`;
        contents.push({
          role: "user",
          parts: [{ text: userMsg }]
        });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: contents,
          generationConfig: {
            temperature: 0.3
          }
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `API 請求失敗 (HTTP ${res.status})`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "（公民神AI助教未回傳內容）";
    }
  };

  function renderAiTutorHtml(qid) {
    const currentModel = AIService.getModel();
    return `
      <div class="ai-tutor-container" id="ai-box-${qid}">
        <div class="ai-tutor-header">
          <div class="ai-tutor-title">
            <i class="fa-solid fa-robot"></i> 公民神AI助教
            <span class="ai-model-badge">${currentModel}</span>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: #7c3aed;"><i class="fa-solid fa-bolt"></i> 頂標名師個別指導</span>
          </div>
        </div>
        
        <div class="ai-chat-thread">
        </div>

        <div class="ai-loading-indicator" style="display: none;">
          <i class="fa-solid fa-spinner fa-spin"></i> 公民神AI助教正在思考並為您深度拆解題目...
        </div>

        <div class="ai-quick-prompts">
          <span style="font-size: 0.75rem; font-weight: 700; color: #6b21a8; align-self: center;"><i class="fa-solid fa-lightbulb"></i> 快速追問：</span>
          <button class="ai-quick-chip" data-qid="${qid}" data-prompt="請用精簡條列方式，針對高中生容易混淆的觀念，說明各個選項錯在哪裡？"><i class="fa-solid fa-bullseye"></i> 各選項迷思剖析</button>
          <button class="ai-quick-chip" data-qid="${qid}" data-prompt="請精要補充本題核心公民專有名詞或法條的定義與區辨。"><i class="fa-solid fa-book-bookmark"></i> 核心名詞與法條精解</button>
          <button class="ai-quick-chip" data-qid="${qid}" data-prompt="請根據本題相同的核心迷思，精簡出 1 題相似素養練習題。"><i class="fa-solid fa-pen-to-square"></i> 相似素養練習題</button>
        </div>

        <div class="ai-input-row">
          <input type="text" class="ai-input-field" placeholder="有任何不懂的地方？輸入問題繼續問公民神AI助教..." data-qid="${qid}">
          <button class="ai-btn-send" data-qid="${qid}">
            <i class="fa-solid fa-paper-plane"></i> 發送
          </button>
        </div>
      </div>
    `;
  }

  function setupAiTutorForQuestion(cardElement, q, userAns = null) {
    const btnAsk = cardElement.querySelector(`.btn-ask-ai[data-qid="${q.id}"]`);
    const aiBox = cardElement.querySelector(`#ai-box-${q.id}`);
    if (!btnAsk || !aiBox) return;

    btnAsk.addEventListener("click", async () => {
      const apiKey = AIService.getApiKey();
      if (!apiKey) {
        if (DOM.aiSettingsModal) DOM.aiSettingsModal.classList.add("active");
        alert("請先設定您的 Google Gemini API Key 才能向 公民神AI助教 提問喔！");
        return;
      }

      const isExpanded = aiBox.classList.contains("active");
      if (isExpanded) {
        aiBox.classList.remove("active");
        btnAsk.innerHTML = `<i class="fa-solid fa-robot"></i> 公民神AI助教`;
        return;
      }

      aiBox.classList.add("active");
      btnAsk.innerHTML = `<i class="fa-solid fa-chevron-up"></i> 收合 公民神AI助教`;

      if (!AppState.ai.chatHistories[q.id] || AppState.ai.chatHistories[q.id].length === 0) {
        await executeAiQuery(cardElement, q, userAns);
      }
    });
  }

  async function executeAiQuery(cardElement, q, userAns = null, customPrompt = null) {
    const aiBox = cardElement.querySelector(`#ai-box-${q.id}`);
    if (!aiBox) return;

    const thread = aiBox.querySelector(".ai-chat-thread");
    const loading = aiBox.querySelector(".ai-loading-indicator");
    const sendBtn = aiBox.querySelector(".ai-btn-send");
    const inputField = aiBox.querySelector(".ai-input-field");
    if (!thread || !loading) return;

    if (customPrompt) {
      const userMsgDiv = document.createElement("div");
      userMsgDiv.className = "ai-message ai-message-user";
      userMsgDiv.innerHTML = `<b><i class="fa-solid fa-user"></i> 您：</b> ${escapeAndFormatText(customPrompt)}`;
      thread.appendChild(userMsgDiv);
    }

    loading.style.display = "flex";
    if (sendBtn) sendBtn.disabled = true;

    try {
      if (!AppState.ai.chatHistories[q.id]) {
        AppState.ai.chatHistories[q.id] = [];
      }

      const reply = await AIService.askQuestion(q, userAns, customPrompt, AppState.ai.chatHistories[q.id]);
      
      if (customPrompt) {
        AppState.ai.chatHistories[q.id].push({ role: "user", content: customPrompt });
      }
      AppState.ai.chatHistories[q.id].push({ role: "assistant", content: reply });

      const aiMsgDiv = document.createElement("div");
      aiMsgDiv.className = "ai-message ai-message-assistant";
      aiMsgDiv.innerHTML = `
        <div style="font-weight: 800; color: #6b21a8; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
          <i class="fa-solid fa-robot"></i> 公民神AI助教解析：
        </div>
        <div>${escapeAndFormatText(reply)}</div>
      `;
      thread.appendChild(aiMsgDiv);

    } catch (err) {
      const errDiv = document.createElement("div");
      errDiv.className = "ai-message ai-message-assistant";
      errDiv.style.borderLeftColor = "#ef4444";
      errDiv.innerHTML = `
        <div style="color: #b91c1c; font-weight: 700;">
          <i class="fa-solid fa-triangle-exclamation"></i> 公民神AI助教連線異常：${err.message}
        </div>
        <div style="font-size: 0.85rem; color: #64748b; margin-top: 0.35rem;">
          請檢查 API Key 是否正確或具備存取權限。
        </div>
      `;
      thread.appendChild(errDiv);
    } finally {
      loading.style.display = "none";
      if (sendBtn) sendBtn.disabled = false;
      if (inputField) inputField.value = "";
    }
  }

  function bindAiInteractiveEvents(cardElement, q, userAns = null) {
    setupAiTutorForQuestion(cardElement, q, userAns);

    cardElement.querySelectorAll(`.ai-quick-chip[data-qid="${q.id}"]`).forEach(chip => {
      chip.addEventListener("click", () => {
        const prompt = chip.dataset.prompt;
        executeAiQuery(cardElement, q, userAns, prompt);
      });
    });

    const aiBox = cardElement.querySelector(`#ai-box-${q.id}`);
    if (aiBox) {
      const inputField = aiBox.querySelector(".ai-input-field");
      const sendBtn = aiBox.querySelector(".ai-btn-send");

      if (sendBtn && inputField) {
        sendBtn.addEventListener("click", () => {
          const text = inputField.value.trim();
          if (text) {
            executeAiQuery(cardElement, q, userAns, text);
          }
        });

        inputField.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            const text = inputField.value.trim();
            if (text) {
              executeAiQuery(cardElement, q, userAns, text);
            }
          }
        });
      }
    }
  }

  /* ==========================================================================
     5. 視圖 2: 即時刷題練習 (Practice Mode - 支援同題組集中卡片容器)
     ========================================================================== */
  function renderPracticeMode(customQuestions = null) {
    if (!DOM.practiceQuestionsContainer) return;
    DOM.practiceQuestionsContainer.innerHTML = "";

    let rawQuestions = [];
    if (customQuestions) {
      rawQuestions = customQuestions;
      AppState.practice.isWrongMode = true;
    } else {
      AppState.practice.isWrongMode = false;
      const selectedUnit = DOM.practiceUnitSelect.value;
      rawQuestions = getQuestionsForScope(selectedUnit);
    }

    if (rawQuestions.length === 0) {
      DOM.practiceQuestionsContainer.innerHTML = `
        <div style="text-align:center; padding:3rem 1rem; background:#fff; border-radius:12px; border:1px dashed #cbd5e1;">
          <i class="fa-solid fa-circle-info" style="font-size:2rem; color:#64748b; margin-bottom:0.75rem;"></i>
          <h4 style="font-size:1.15rem; color:#1e293b; font-weight:700;">目前沒有符合條件的試題</h4>
          <p style="color:#64748b; font-size:0.9rem; margin-top:0.25rem;">請切換單元或返回單元總覽選擇其他題目！</p>
        </div>
      `;
      return;
    }

    // 依題組進行集群化（同題組題目永遠綁定在同一個 cluster 內）
    let clusters = clusterQuestions(rawQuestions);
    // 對 cluster 進行洗牌，確保題組內部不被拆開
    clusters = shuffleArray(clusters);

    let globalQIndex = 1;

    clusters.forEach(cluster => {
      if (cluster.isGroup) {
        // ========== 題組題目：渲染在同一個大型 .practice-group-card 容器中 ==========
        const startNum = globalQIndex;
        const endNum = globalQIndex + cluster.questions.length - 1;
        const dynamicGroupTitle = startNum === endNum 
          ? `第 ${startNum} 題為題組` 
          : `第 ${startNum}～${endNum} 題為題組`;

        const groupCard = document.createElement("div");
        groupCard.className = "practice-group-card";

        let groupInnerHtml = `
          <div class="group-card-header">
            <div class="group-header-left">
              <span class="group-tag-badge">
                <i class="fa-solid fa-layer-group"></i> 題組（共 ${cluster.questions.length} 小題）
              </span>
              <span class="group-title-text">${dynamicGroupTitle}</span>
              <span class="q-unit-badge">${escapeHtml(cluster.unitName)}</span>
            </div>
          </div>

          <div class="group-reading-passage">
            <div class="group-reading-passage-label">
              <i class="fa-solid fa-book-open"></i> 【題組閱讀材料與背景資訊】
            </div>
            <div>${escapeAndFormatText(cluster.groupContext)}</div>
          </div>

          <div class="group-sub-questions-container">
        `;

        cluster.questions.forEach((q) => {
          const subNum = globalQIndex;
          globalQIndex++;
          groupInnerHtml += renderSinglePracticeQuestionHtml(q, subNum, true);
        });

        groupInnerHtml += `</div>`;
        groupCard.innerHTML = groupInnerHtml;
        DOM.practiceQuestionsContainer.appendChild(groupCard);

        cluster.questions.forEach(q => {
          bindPracticeQuestionEvents(groupCard, q);
          bindAiInteractiveEvents(groupCard, q);
        });

      } else {
        // ========== 獨立單選/非選題：渲染為標準 .question-card ==========
        const q = cluster.question;
        const qNum = globalQIndex;
        globalQIndex++;

        const card = document.createElement("div");
        card.className = "question-card";
        card.id = `practice-card-${q.id}`;
        card.innerHTML = renderSinglePracticeQuestionHtml(q, qNum, false);

        DOM.practiceQuestionsContainer.appendChild(card);
        bindPracticeQuestionEvents(card, q);
        bindAiInteractiveEvents(card, q);
      }
    });
  }

  function renderSinglePracticeQuestionHtml(q, qNum, isSubQuestion = false) {
    let optionsHtml = "";

    if (q.options && q.options.length > 0) {
      optionsHtml = `
        <div class="options-list">
          ${q.options.map(opt => `
            <div class="option-item practice-option-item" data-qid="${q.id}" data-opt="${opt.key}" data-correct="${q.answer}">
              <span class="option-key">${opt.key}</span>
              <span class="option-text">${escapeAndFormatText(opt.text)}</span>
            </div>
          `).join("")}
        </div>
      `;
    } else if (q.tableTemplate) {
      const t = q.tableTemplate;
      const checkOptions = t.checkOptions || [];
      const fillRows = t.fillRows || [];

      let fillRowsPracticeHtml = "";
      if (fillRows.length > 0) {
        fillRowsPracticeHtml = `
          <div class="paper-answering-table-wrapper" style="margin-bottom:0.75rem;">
            <table class="paper-answering-table">
              <thead>
                <tr>
                  <th style="width: 25%;">${escapeHtml(t.header1 || "項目")}</th>
                  <th style="width: 75%;">${escapeHtml(t.header2 || "填入內容")}</th>
                </tr>
              </thead>
              <tbody>
                ${fillRows.map((row) => `
                  <tr>
                    <td style="font-weight:700; background:#fafafa;">${escapeHtml(row.item)}</td>
                    <td>
                      <input type="text" class="input-text-answer" placeholder="請在此填寫 ${escapeHtml(row.item)} 的答案..." style="width:100%; padding:0.4rem; border:1px solid #cbd5e1; border-radius:4px; font-size:0.9rem;">
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      }

      optionsHtml = `
        <div class="mixed-interactive-box" style="margin-bottom:0.75rem;">
          ${checkOptions.length > 0 ? `
            <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.4rem;"><i class="fa-solid fa-square-check"></i> 請勾選答案項目：</div>
            <div class="checkbox-pick-group">
              ${checkOptions.map(chk => `
                <div class="check-chip practice-check-chip" data-qid="${q.id}" data-check="${chk}" data-correct="${t.correctCheck}">
                  <i class="fa-regular fa-circle"></i> ${escapeHtml(chk)}
                </div>
              `).join("")}
            </div>
          ` : ""}
          ${fillRowsPracticeHtml}
          <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.4rem;">
            <i class="fa-solid fa-pen"></i> ${t.explanationLabel || "寫出判斷理由"}：
          </div>
          <textarea class="written-textarea" placeholder="請在此輸入您的理由或佐證說明..."></textarea>
          <div style="margin-top:0.6rem;">
            <button class="btn btn-secondary btn-sm btn-practice-reveal" data-qid="${q.id}">
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
            <button class="btn btn-secondary btn-sm btn-practice-reveal" data-qid="${q.id}">
              <i class="fa-solid fa-eye"></i> 對照標準答案與解析
            </button>
          </div>
        </div>
      `;
    }

    const standardAnswer = q.answer || (q.tableTemplate ? q.tableTemplate.correctCheck : "");
    const containerClass = isSubQuestion ? "group-sub-question-card" : "";

    return `
      <div class="${containerClass}" id="practice-qbox-${q.id}">
        <div class="question-card-header">
          <div class="q-meta">
            <span class="q-num-badge">第 ${qNum} 題</span>
            ${!isSubQuestion ? `<span class="q-unit-badge">單元 ${q.unit}</span>` : ""}
            <span class="q-type-badge">${q.typeName || "單選"}</span>
            ${q.tag ? `<span class="q-type-badge text-primary" style="background:#eff6ff;"><i class="fa-solid fa-award"></i> ${escapeHtml(q.tag)}</span>` : ""}
          </div>
          <div>
            <button class="btn btn-ask-ai" data-qid="${q.id}">
              <i class="fa-solid fa-robot"></i> 公民神AI助教
            </button>
          </div>
        </div>

        <div class="q-stem">${qNum}. ${escapeAndFormatText(q.stem)}</div>

        ${optionsHtml}

        <div class="explanation-box" id="practice-exp-${q.id}">
          <div class="explanation-header" id="practice-exp-header-${q.id}">
            <i class="fa-solid fa-circle-check"></i> 正確答案：${standardAnswer}
          </div>
          <div class="explanation-body">
            <b>【考點與精解】</b> ${escapeAndFormatText(q.explanation || (q.tableTemplate ? q.tableTemplate.modelAnswer : "請點擊上方「公民神AI助教」獲取由 Gemini 深度剖析的即時詳解與迷思釐清！"))}
          </div>
        </div>

        ${renderAiTutorHtml(q.id)}
      </div>
    `;
  }

  function bindPracticeQuestionEvents(containerElement, q) {
    const qBox = containerElement.querySelector(`#practice-qbox-${q.id}`) || containerElement;

    qBox.querySelectorAll(`.practice-option-item[data-qid="${q.id}"]`).forEach(item => {
      item.addEventListener("click", () => {
        const opt = item.dataset.opt;
        const correct = item.dataset.correct;
        const expBox = qBox.querySelector(`#practice-exp-${q.id}`);
        const expHeader = qBox.querySelector(`#practice-exp-header-${q.id}`);

        qBox.querySelectorAll(`.practice-option-item[data-qid="${q.id}"]`).forEach(o => {
          o.style.pointerEvents = "none";
          if (o.dataset.opt === correct) {
            o.style.borderColor = "#10b981";
            o.style.background = "#ecfdf5";
          }
        });

        if (opt === correct) {
          item.style.borderColor = "#10b981";
          item.style.background = "#ecfdf5";
          if (expBox) expBox.className = "explanation-box show";
          if (expHeader) {
            expHeader.className = "explanation-header correct-text";
            expHeader.innerHTML = `<i class="fa-solid fa-circle-check"></i> 答對了！正確答案是 (${correct})`;
          }
        } else {
          item.style.borderColor = "#ef4444";
          item.style.background = "#fef2f2";
          if (expBox) expBox.className = "explanation-box show wrong";
          if (expHeader) {
            expHeader.className = "explanation-header wrong-text";
            expHeader.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 答錯囉！您選 (${opt})，正確答案是 (${correct})`;
          }
          saveToWrongQuestions(q);
        }
      });
    });

    qBox.querySelectorAll(`.practice-check-chip[data-qid="${q.id}"]`).forEach(chip => {
      chip.addEventListener("click", () => {
        const expBox = qBox.querySelector(`#practice-exp-${q.id}`);
        const expHeader = qBox.querySelector(`#practice-exp-header-${q.id}`);
        const chosen = chip.dataset.check;
        const correct = chip.dataset.correct;

        qBox.querySelectorAll(`.practice-check-chip[data-qid="${q.id}"]`).forEach(c => {
          c.classList.remove("checked");
          const icon = c.querySelector("i");
          if (icon) icon.className = "fa-regular fa-circle";
        });

        chip.classList.add("checked");
        const icon = chip.querySelector("i");
        if (icon) icon.className = "fa-regular fa-circle-dot";

        if (expBox) expBox.className = "explanation-box show";
        if (expHeader) {
          if (chosen === correct) {
            expHeader.className = "explanation-header correct-text";
            expHeader.innerHTML = `<i class="fa-solid fa-circle-check"></i> 勾選正確！正確答案是【${correct}】`;
          } else {
            expHeader.className = "explanation-header wrong-text";
            expHeader.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 勾選有誤！您選【${chosen}】，正確答案是【${correct}】`;
            saveToWrongQuestions(q);
          }
        }
      });
    });

    const revealBtn = qBox.querySelector(`.btn-practice-reveal[data-qid="${q.id}"]`);
    if (revealBtn) {
      revealBtn.addEventListener("click", () => {
        const expBox = qBox.querySelector(`#practice-exp-${q.id}`);
        if (expBox) {
          expBox.classList.toggle("show");
          if (expBox.classList.contains("show")) {
            revealBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> 隱藏標準答案與解析';
          } else {
            revealBtn.innerHTML = '<i class="fa-solid fa-eye"></i> 對照標準答案與解析';
          }
        }
      });
    }
  }

  /* ==========================================================================
     6. 視圖 3: 考券列印與 PDF 匯出模式 (Print & PDF Generator)
     ========================================================================== */
  function renderPrintPaper() {
    if (!DOM.paperQuestionsRenderArea) return;
    DOM.paperQuestionsRenderArea.innerHTML = "";

    const mode = AppState.print.mode;
    const unitFilter = AppState.print.unitFilter;
    const rawQuestions = getQuestionsForScope(unitFilter);

    if (mode === "question") {
      DOM.printPaperSubTitle.textContent = `115 學年度 公民與社會科 實戰測驗【題目卷】（共 ${rawQuestions.length} 題）`;
      DOM.paperStudentInfoBox.style.display = "table";
      DOM.paperNoticeText.style.display = "block";
      DOM.paperNoticeText.innerHTML = `<b>【注意事項】</b> 1. 本試卷為測驗試題卷，請將答案依題號謄寫於下方作答欄中。 2. 滿分 100 分，請把握作答時間。`;
      DOM.paperManualAnswerSheet.style.display = "block";
      renderManualAnswerGrid(rawQuestions.length);
    } else {
      DOM.printPaperSubTitle.textContent = `115 學年度 公民與社會科 實戰測驗【解答與詳解卷】（共 ${rawQuestions.length} 題）`;
      DOM.paperStudentInfoBox.style.display = "none";
      DOM.paperNoticeText.style.display = "none";
      DOM.paperNoticeText.innerHTML = "";
      DOM.paperManualAnswerSheet.style.display = "none";
    }

    if (mode === "answer") {
      const quickKeyCard = document.createElement("div");
      quickKeyCard.style.cssText = "background: #f1f5f9; border: 1.5px solid #000; padding: 1rem; margin-bottom: 1.5rem; border-radius: 4px;";
      
      let keysHtml = '<div style="font-weight:900; margin-bottom:0.5rem; font-size:1rem; text-align:center;"><i class="fa-solid fa-key"></i> 【簡答速查表】</div><div style="display:grid; grid-template-columns:repeat(10, 1fr); gap:6px; font-size:0.85rem; text-align:center;">';
      
      rawQuestions.forEach((q, idx) => {
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

    const clusters = clusterQuestions(rawQuestions);
    let questionCounter = 0;
    let currentSection = "";

    clusters.forEach(cluster => {
      if (cluster.isGroup) {
        const startNum = questionCounter + 1;
        const endNum = questionCounter + cluster.questions.length;
        const dynamicGroupTitle = startNum === endNum 
          ? `第 ${startNum} 題為題組` 
          : `第 ${startNum}～${endNum} 題為題組`;

        const groupWrapper = document.createElement("div");
        groupWrapper.className = "paper-group-box";

        let groupHtml = `
          <div class="paper-group-title">
            <i class="fa-solid fa-layer-group"></i> 【${dynamicGroupTitle}】
          </div>
          <div class="paper-group-content">
            ${escapeAndFormatText(cluster.groupContext)}
          </div>
        `;
        groupWrapper.innerHTML = groupHtml;
        DOM.paperQuestionsRenderArea.appendChild(groupWrapper);

        cluster.questions.forEach(q => {
          questionCounter++;
          const qItem = renderSinglePrintQuestionElement(q, questionCounter, mode);
          DOM.paperQuestionsRenderArea.appendChild(qItem);
          if (mode === "answer") {
            bindAiInteractiveEvents(qItem, q);
          }
        });

      } else {
        questionCounter++;
        const q = cluster.question;
        const sectionKey = `${q.unitName || `第 ${q.unit} 單元`} - ${q.section || ""}`;
        if (sectionKey !== currentSection && currentSection !== "") {
          currentSection = sectionKey;
        }

        const qItem = renderSinglePrintQuestionElement(q, questionCounter, mode);
        DOM.paperQuestionsRenderArea.appendChild(qItem);
        if (mode === "answer") {
          bindAiInteractiveEvents(qItem, q);
        }
      }
    });
  }

  function renderSinglePrintQuestionElement(q, qNum, mode) {
    const qItem = document.createElement("div");
    qItem.className = "paper-q-item";

    let optionsHtml = "";
    if (q.options && q.options.length > 0) {
      optionsHtml = `
        <div class="paper-q-options">
          ${q.options.map(opt => {
            const isCorrectOpt = mode === "answer" && q.answer && q.answer.includes(opt.key);
            return `
              <div class="paper-q-opt">
                (${opt.key}) ${escapeAndFormatText(opt.text)} ${isCorrectOpt ? '<span class="paper-ans-highlight">【正解】</span>' : ""}
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else if (q.tableTemplate) {
      const t = q.tableTemplate;
      const hasChecks = t.checkOptions && t.checkOptions.length > 0;
      const hasFills = t.fillRows && t.fillRows.length > 0;

      if (hasChecks) {
        optionsHtml = `
          <div class="paper-answering-table-wrapper">
            <table class="paper-answering-table">
              <thead>
                <tr>
                  <th class="col-check">${escapeHtml(t.header1 || "項目（請勾選）")}</th>
                  <th class="col-reason">${escapeHtml(t.header2 || "判斷的理由")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="col-check">
                    ${t.checkOptions.map(chk => {
                      const isCorrect = (t.correctChecks || []).includes(chk) || chk === t.correctCheck;
                      if (mode === "answer") {
                        return `
                          <span class="paper-check-item ${isCorrect ? "paper-check-checked" : ""}">
                            ${isCorrect ? '<b style="color:#b91c1c;">☑ ' + escapeHtml(chk) + ' (正解)</b>' : '☐ ' + escapeHtml(chk)}
                          </span>
                        `;
                      } else {
                        return `<span class="paper-check-item">☐ ${escapeHtml(chk)}</span>`;
                      }
                    }).join("")}
                  </td>
                  <td class="col-reason">
                    ${mode === "answer" ? `
                      <div class="paper-model-answer">${escapeAndFormatText(t.modelAnswer || "—")}</div>
                    ` : `
                      <div class="paper-blank-answer-box">
                        <span style="color:#94a3b8; font-size:0.85rem;">（請在此填寫理由與佐證說明）</span>
                      </div>
                    `}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      } else if (hasFills) {
        optionsHtml = `
          <div class="paper-answering-table-wrapper">
            <table class="paper-answering-table">
              <thead>
                <tr>
                  <th style="width: 25%;">${escapeHtml(t.header1 || "項目")}</th>
                  <th style="width: 75%;">${escapeHtml(t.header2 || "填入內容")}</th>
                </tr>
              </thead>
              <tbody>
                ${t.fillRows.map(row => `
                  <tr>
                    <td style="font-weight: 700; background: #fafafa;">${escapeHtml(row.item)}</td>
                    <td>
                      ${mode === "answer" ? `
                        <div class="paper-model-answer">${escapeAndFormatText(row.answer)}</div>
                      ` : `
                        <div class="paper-blank-answer-box" style="min-height: 40px;">
                          <span style="color:#94a3b8; font-size:0.85rem;">（作答填寫處）</span>
                        </div>
                      `}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    } else {
      if (mode === "question") {
        optionsHtml = `
          <div class="paper-answering-table-wrapper">
            <div class="paper-blank-answer-box" style="border: 1.5px dashed #94a3b8; padding: 0.75rem; border-radius: 4px; min-height: 80px; background: #fafafa;">
              <span style="color:#94a3b8; font-size:0.85rem;">【作答區】請於此處書寫作答內容...</span>
            </div>
          </div>
        `;
      }
    }

    let explanationBoxHtml = "";
    if (mode === "answer") {
      explanationBoxHtml = `
        <div class="paper-explanation-box">
          <div style="margin-bottom:0.5rem;">
            <b>【試題考點與解答】</b> ${escapeAndFormatText(q.explanation || (q.tableTemplate ? q.tableTemplate.modelAnswer : "（點擊下方「公民神AI助教」獲取由 Gemini 深度剖析的即時詳解與迷思釐清）"))}<br>
            <span style="font-size:0.8rem; color:#64748b;">出處來源：${escapeHtml(q.unitName || `第 ${q.unit} 單元`)} ${q.tag ? " / " + escapeHtml(q.tag) : ""}</span>
          </div>
          <div class="paper-ai-tutor-trigger" style="margin-top: 0.5rem; display: flex; justify-content: flex-end;">
            <button class="btn btn-ask-ai" data-qid="${q.id}">
              <i class="fa-solid fa-robot"></i> 公民神AI助教
            </button>
          </div>
        </div>
        ${renderAiTutorHtml(q.id)}
      `;
    }

    const ansDisplay = q.answer || (q.tableTemplate ? q.tableTemplate.correctCheck : "");
    qItem.innerHTML = `
      <div class="paper-q-stem">
        ${qNum}. ${escapeAndFormatText(q.stem)}
        ${mode === "answer" && ansDisplay ? `<span class="paper-ans-highlight">【答案：${escapeHtml(ansDisplay)}】</span>` : ""}
      </div>
      ${optionsHtml}
      ${explanationBoxHtml}
    `;

    return qItem;
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
     7. 吉祥物懸停霓虹發光 + 抖動 + 全螢幕拖曳移動
     ========================================================================== */
  function initMascotDrag() {
    const mascot = DOM.mascotContainer;
    if (!mascot) return;

    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop;

    mascot.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = mascot.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

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

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

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

    mascot.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      isDragging = true;
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
     8. 錯題本儲存與快覽功能
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

  function launchWrongQuestionsPractice() {
    if (AppState.wrongQuestions.length === 0) {
      alert("目前錯題本空空如也！先去練習試題吧～");
      return;
    }
    renderPracticeMode(AppState.wrongQuestions);
    switchView("practice-view");
  }

  /* ==========================================================================
     9. 事件監聽綁定
     ========================================================================== */
  function bindEvents() {
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

    if (DOM.btnStartAllPractice) {
      DOM.btnStartAllPractice.addEventListener("click", () => {
        if (DOM.practiceUnitSelect) {
          DOM.practiceUnitSelect.value = "all";
        }
        renderPracticeMode();
        switchView("practice-view");
      });
    }

    if (DOM.practiceUnitSelect) {
      DOM.practiceUnitSelect.addEventListener("change", () => {
        renderPracticeMode();
      });
    }

    if (DOM.btnPracticeRefresh) {
      DOM.btnPracticeRefresh.addEventListener("click", () => {
        renderPracticeMode();
      });
    }

    if (DOM.btnModeQuestionPaper) {
      DOM.btnModeQuestionPaper.addEventListener("click", () => {
        AppState.print.mode = "question";
        DOM.btnModeQuestionPaper.classList.add("active");
        DOM.btnModeAnswerPaper.classList.remove("active");
        renderPrintPaper();
      });
    }

    if (DOM.btnModeAnswerPaper) {
      DOM.btnModeAnswerPaper.addEventListener("click", () => {
        AppState.print.mode = "answer";
        DOM.btnModeAnswerPaper.classList.add("active");
        DOM.btnModeQuestionPaper.classList.remove("active");
        renderPrintPaper();
      });
    }

    if (DOM.printUnitFilter) {
      DOM.printUnitFilter.addEventListener("change", (e) => {
        AppState.print.unitFilter = e.target.value;
        renderPrintPaper();
      });
    }

    if (DOM.btnTriggerPrint) {
      DOM.btnTriggerPrint.addEventListener("click", () => {
        window.print();
      });
    }

    if (DOM.btnQuickWrongBook) {
      DOM.btnQuickWrongBook.addEventListener("click", launchWrongQuestionsPractice);
    }

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
        if (AppState.practice.isWrongMode) {
          renderPracticeMode();
        }
      });
    }

    // AI 設定 Modal
    if (DOM.btnAiSettings) {
      DOM.btnAiSettings.addEventListener("click", () => {
        DOM.inputGeminiApiKey.value = AIService.getApiKey();
        DOM.selectGeminiModel.value = AIService.getModel();
        DOM.aiTestStatus.style.display = "none";
        DOM.aiSettingsModal.classList.add("active");
      });
    }

    if (DOM.btnCloseAiModal) {
      DOM.btnCloseAiModal.addEventListener("click", () => {
        DOM.aiSettingsModal.classList.remove("active");
      });
    }

    if (DOM.btnCloseAiX) {
      DOM.btnCloseAiX.addEventListener("click", () => {
        DOM.aiSettingsModal.classList.remove("active");
      });
    }

    // AI 金鑰 5 步驟教學 Modal 事件綁定
    if (DOM.btnOpenTutorialFromSettings) {
      DOM.btnOpenTutorialFromSettings.addEventListener("click", () => {
        if (DOM.aiTutorialModal) {
          DOM.aiTutorialModal.classList.add("active");
        }
      });
    }

    if (DOM.btnCloseTutorialX) {
      DOM.btnCloseTutorialX.addEventListener("click", () => {
        if (DOM.aiTutorialModal) {
          DOM.aiTutorialModal.classList.remove("active");
        }
      });
    }

    if (DOM.btnTutorialGotIt) {
      DOM.btnTutorialGotIt.addEventListener("click", () => {
        if (DOM.aiTutorialModal) {
          DOM.aiTutorialModal.classList.remove("active");
        }
      });
    }

    if (DOM.btnToggleKeyVisibility) {
      DOM.btnToggleKeyVisibility.addEventListener("click", () => {
        if (DOM.inputGeminiApiKey.type === "password") {
          DOM.inputGeminiApiKey.type = "text";
          DOM.iconEyeKey.className = "fa-solid fa-eye-slash";
        } else {
          DOM.inputGeminiApiKey.type = "password";
          DOM.iconEyeKey.className = "fa-solid fa-eye";
        }
      });
    }

    if (DOM.btnSaveAiSettings) {
      DOM.btnSaveAiSettings.addEventListener("click", () => {
        const key = DOM.inputGeminiApiKey.value.trim();
        const model = DOM.selectGeminiModel.value;
        AIService.saveConfig(key, model);
        DOM.aiSettingsModal.classList.remove("active");
        alert("已成功儲存 公民神AI助教 API Key 與模型設定！");
      });
    }

    if (DOM.btnClearAiKey) {
      DOM.btnClearAiKey.addEventListener("click", () => {
        AIService.clearConfig();
        DOM.inputGeminiApiKey.value = "";
        DOM.aiTestStatus.style.display = "none";
        alert("已清除儲存的 API Key！");
      });
    }

    if (DOM.btnTestAiKey) {
      DOM.btnTestAiKey.addEventListener("click", async () => {
        const key = DOM.inputGeminiApiKey.value.trim();
        const model = DOM.selectGeminiModel.value;
        DOM.aiTestStatus.style.display = "block";
        DOM.aiTestStatus.style.background = "#eff6ff";
        DOM.aiTestStatus.style.color = "#1e40af";
        DOM.aiTestStatus.style.border = "1px solid #bfdbfe";
        DOM.aiTestStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在測試連線至 Google Gemini API，請稍候...';

        try {
          await AIService.testConnection(key, model);
          DOM.aiTestStatus.style.background = "#ecfdf5";
          DOM.aiTestStatus.style.color = "#065f46";
          DOM.aiTestStatus.style.border = "1px solid #a7f3d0";
          DOM.aiTestStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 連線成功！API Key 與模型運作正常。';
        } catch (err) {
          DOM.aiTestStatus.style.background = "#fef2f2";
          DOM.aiTestStatus.style.color = "#991b1b";
          DOM.aiTestStatus.style.border = "1px solid #fecaca";
          DOM.aiTestStatus.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 連線失敗：${err.message}`;
        }
      });
    }

    // Hero 捷徑
    if (DOM.heroStatUnits) {
      DOM.heroStatUnits.addEventListener("click", () => switchView("overview-view"));
    }
    if (DOM.heroStatQuestions) {
      DOM.heroStatQuestions.addEventListener("click", () => {
        renderPracticeMode();
        switchView("practice-view");
      });
    }
    if (DOM.heroStatPdf) {
      DOM.heroStatPdf.addEventListener("click", () => {
        renderPrintPaper();
        switchView("print-view");
      });
    }
  }

  /* ==========================================================================
     10. 輔助工具函數
     ========================================================================== */
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
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

  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAndFormatText(text) {
    if (!text) return "";

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

    if (formatted.includes("|")) {
      const lines = formatted.split("\n");
      let inTable = false;
      let tableRows = [];
      let result = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("|") && line.endsWith("|")) {
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

    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    return formatted.replace(/\n/g, "<br>");
  }

  /* ==========================================================================
     11. 系統啟動流程 (Initialization)
     ========================================================================== */
  function init() {
    if (DOM.inputGeminiApiKey) {
      DOM.inputGeminiApiKey.value = AppState.ai.apiKey;
    }
    if (DOM.selectGeminiModel) {
      DOM.selectGeminiModel.value = AppState.ai.model;
    }

    populateUnitDropdowns();
    renderOverviewUnitCards();
    updateTotalStats();
    updateWrongBadge();
    initMascotDrag();
    bindEvents();
    
    renderPracticeMode();
    renderPrintPaper();
  }

  init();
});

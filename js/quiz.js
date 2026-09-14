/**
 * 學測實戰「立即演練」互動解題引擎
 * 採用行級狀態機解析（State-Machine Parser），100% 精準提取題目、選項、正解與詳解
 */

(function () {
  // 將通用 Emoji 轉換為標準 Font Awesome 圖標
  function replaceEmojisWithFontAwesome(text) {
    if (!text) return "";
    return text
      .replace(/📝/g, '<i class="fa-solid fa-pen-to-square"></i>')
      .replace(/📌/g, '<i class="fa-solid fa-thumbtack"></i>')
      .replace(/[☑✔]/g, '<i class="fa-solid fa-check"></i>')
      .replace(/[☒✘]/g, '<i class="fa-solid fa-xmark"></i>')
      .replace(/💡/g, '<i class="fa-solid fa-lightbulb"></i>')
      .replace(/🎉/g, '<i class="fa-solid fa-circle-check"></i>')
      .replace(/💪/g, '<i class="fa-solid fa-circle-xmark"></i>');
  }

  // 安全解析 Markdown 並保護 KaTeX 數學公式（防止 Marked 剝除 \% 轉義與破壞下標底線 _）
  function parseMarkdownWithMath(markdown) {
    if (!markdown) return "";
    if (!window.marked || !window.marked.parse) return markdown;

    const mathBlocks = [];

    // 1. 先暫存保護雙錢字號區塊數學公式 $$...$$
    let protectedMd = markdown.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      const placeholder = `@@MATH_BLOCK_${mathBlocks.length}@@`;
      mathBlocks.push({ placeholder, math: match });
      return placeholder;
    });

    // 2. 暫存保護單錢字號行內數學公式 $...$
    protectedMd = protectedMd.replace(/\$([^\$\n\r]+?)\$/g, (match) => {
      const placeholder = `@@MATH_INLINE_${mathBlocks.length}@@`;
      mathBlocks.push({ placeholder, math: match });
      return placeholder;
    });

    // 3. 執行 marked.parse
    let html = window.marked.parse(protectedMd);

    // 4. 精確回填數學公式（必須使用 function replacer 避免 $$ 在 JS replace 中被解析為轉義符號 $）
    mathBlocks.forEach(({ placeholder, math }) => {
      html = html.replace(placeholder, () => math);
    });

    return html;
  }

  // 解析 markdown 中包含的題目字串為結構化物件
  function parseQuizBlock(rawText) {
    if (!rawText) return null;

    // 1. 清洗每行前綴引號 >
    const cleanLines = rawText
      .split(/\r?\n/)
      .map(l => l.replace(/^>\s?/, "").trimEnd());

    if (!cleanLines.some(l => l.trim().length > 0)) return null;

    // 2. 尋找考題年份或出處標籤，例如 【112. 學測】、【107. 指考】
    const fullText = cleanLines.join("\n");
    const sourceMatch = fullText.match(/【([^】]*?(?:學測|指考|分科|統測|會考|模考|精選)[^】]*?)】/i);
    const source = sourceMatch ? `【${sourceMatch[1].trim()}】` : "【學測精選試題】";

    // 3. 狀態機變數
    let state = "question"; // "question" | "A" | "B" | "C" | "D" | "E" | "answer"
    const questionLines = [];
    const optLines = { A: [], B: [], C: [], D: [], E: [] };
    const answerLines = [];
    const checkboxOptions = [];

    for (const line of cleanLines) {
      // 若已進入答案區，後續所有內容（包含表格、勾選結果、說明與解析）全數保留至 answerLines
      if (state === "answer") {
        answerLines.push(line);
        continue;
      }

      // 判斷是否進入答案解析區（支援所有答案、標準作答、破題關鍵、判斷理由、解析等標籤）
      if (
        /【(?:(?:參考)?答案|標準(?:作答|答案)|(?:公民神)?破題關鍵|判斷理由)/i.test(line) ||
        /^[*•-]?\s*[*_]*解析[：:]/i.test(line) ||
        /^[*•-]?\s*[*_]*【(?:(?:參考)?答案|標準(?:作答|答案)|(?:公民神)?破題關鍵)/i.test(line)
      ) {
        state = "answer";
        answerLines.push(line);
        continue;
      }

      // 判斷是否進入 (A), (B), (C), (D), (E)
      const optMatch = line.match(/^[*•-]?\s*\(?（?([A-EＡ-Ｅ])\)?）?[\s.、:：](.*)/);
      if (optMatch) {
        let char = optMatch[1].toUpperCase();
        if (char.charCodeAt(0) > 122) {
          char = String.fromCharCode(char.charCodeAt(0) - 65248);
        }
        state = char;
        if (!optLines[char]) optLines[char] = [];
        optLines[char].push(optMatch[2].trim());
        continue;
      }

      // 判斷勾選型選項 [x] 或 [ ]
      const chkMatch = line.match(/^[*•-]?\s*\[([ xX])\]\s*(.*)/);
      if (chkMatch) {
        state = "checkbox";
        checkboxOptions.push({
          checked: chkMatch[1].toLowerCase() === "x",
          text: chkMatch[2].replace(/\*\*/g, "").trim()
        });
        continue;
      }

      // 依當前狀態持續附加內容
      if (state === "question") {
        if (!line.match(/###\s*(?:<i[^>]*><\/i>\s*)?(?:📝\s*)?(?:立即演練|公民神演練)/)) {
          questionLines.push(line);
        }
      } else if (state === "answer") {
        answerLines.push(line);
      } else if (optLines[state]) {
        if (line.trim().length > 0) {
          optLines[state].push(line.trim());
        }
      }
    }

    // 4. 提取答案與解析
    const ansFullText = answerLines.join("\n");
    let answer = "";
    let explanation = "";

    const ansLetterMatch = ansFullText.match(/【(?:參考)?答案】[*\s:：`]*\(?（?([A-E])\)?）?[`*]*/i);
    if (ansLetterMatch) {
      answer = ansLetterMatch[1].toUpperCase();
    }

    explanation = ansFullText.trim();

    // 5. 組合最終選項清單（支援 2 到 5 個選項）
    const options = [];
    const validLetters = ["A", "B", "C", "D", "E"].filter(l => optLines[l] && optLines[l].length > 0);
    if (validLetters.length >= 2) {
      validLetters.forEach(l => {
        options.push({ letter: l, text: cleanOptionText(optLines[l].join(" ")) });
      });
    } else if (checkboxOptions.length > 0) {
      const standardLetters = ["A", "B", "C", "D", "E"];
      checkboxOptions.forEach((chk, idx) => {
        const optLetter = standardLetters[idx] || `${idx + 1}`;
        options.push({
          letter: optLetter,
          text: cleanOptionText(chk.text)
        });
        if (chk.checked && !answer) {
          answer = optLetter;
        }
      });
    }

    return {
      question: questionLines.join("\n"),
      source: source,
      options: options,
      answer: answer || (options.length > 0 ? options[0].letter : ""),
      explanation: explanation || ansFullText || "請對照本單元之觀念架構與法理依據複習。"
    };
  }

  // 清洗選項文字
  function cleanOptionText(txt) {
    if (!txt) return "";
    return txt
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .replace(/【.*?】/g, "")
      .replace(/^[*_~`]+|[*_~`]+$/g, "")
      .trim();
  }

  // 渲染單題互動卡片 HTML
  function renderQuizHtml(quiz, index = 0, isSlide = false) {
    if (!quiz) return "";

    const cardId = `quiz-${Date.now()}-${Math.floor(Math.random() * 1000)}-${index}`;

    let optionsHtml = "";
    if (quiz.options && quiz.options.length > 0) {
      quiz.options.forEach(opt => {
        optionsHtml += `
          <button type="button" class="quiz-option-btn" data-card-id="${cardId}" data-letter="${opt.letter}" data-ans="${quiz.answer}">
            <span class="option-prefix">(${opt.letter})</span>
            <span class="option-content">${opt.text}</span>
          </button>
        `;
      });
    } else {
      optionsHtml = `
        <div style="padding: 14px 18px; background: rgba(56, 189, 248, 0.1); border-radius: 8px; font-size: 0.95rem; color: var(--text-secondary); border: 1px dashed #38bdf8;">
          <i class="fa-solid fa-pencil"></i> 本題為 108 課綱非選與混合實作題，請自行思考作答後點擊下方按鈕核對標準答案與破題關鍵！
        </div>
      `;
    }

    // 格式化題幹與解析（若有 marked 支援則解析粗體、強調、表格、段落，並完整保護數學公式）
    let formattedQuestion = replaceEmojisWithFontAwesome(quiz.question);
    if (window.marked && window.marked.parse) {
      // 若包含 <details ...> 閱讀題文區塊，將其內部的 markdown（包含表格、段落、粗體）先解析為 HTML
      formattedQuestion = formattedQuestion.replace(
        /(<details[^>]*>[\s\S]*?<summary>[\s\S]*?<\/summary>)([\s\S]*?)(<\/details>)/gi,
        (match, openSummary, innerMd, closeTag) => {
          return `${openSummary}\n<div class="reading-context-body">\n${parseMarkdownWithMath(innerMd.trim())}\n</div>\n${closeTag}\n\n`;
        }
      );
      formattedQuestion = parseMarkdownWithMath(formattedQuestion);
    }

    let formattedExplanation = replaceEmojisWithFontAwesome(quiz.explanation);
    if (window.marked && window.marked.parse) {
      formattedExplanation = parseMarkdownWithMath(formattedExplanation);
    }

    return `
      <div class="quiz-card-wrapper ${isSlide ? 'quiz-slide-layout' : ''}" id="${cardId}">
        <div class="quiz-card-header">
          <span class="quiz-badge">
            <i class="fa-solid fa-fire"></i> 公民神演練
          </span>
          <span class="quiz-source-tag">
            <i class="fa-solid fa-stamp"></i> ${quiz.source}
          </span>
        </div>
        <div class="quiz-question-text">
          ${formattedQuestion}
        </div>
        <div class="quiz-options-list">
          ${optionsHtml}
        </div>
        <div class="quiz-action-bar" style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <button type="button" class="btn-toggle-explanation" data-target="${cardId}-exp">
            <i class="fa-solid fa-lightbulb"></i> <span>查看公民神解題關鍵與詳解</span>
          </button>
          <div class="quiz-feedback-msg" id="${cardId}-feedback" style="font-weight: 700; font-size: 0.95rem; display: none;"></div>
        </div>
        <div class="quiz-explanation-box" id="${cardId}-exp">
          <div class="explanation-title">
            <i class="fa-solid fa-circle-check"></i> ${quiz.answer ? `【正確答案 (${quiz.answer})】學測破題思維：` : '【公民神標準作答與破題關鍵】'}
          </div>
          <div class="explanation-content" style="line-height: 1.8;">
            ${formattedExplanation}
          </div>
        </div>
      </div>
    `;
  }

  // 綁定全域選項點擊事件委派
  document.addEventListener("click", (e) => {
    const optBtn = e.target.closest(".quiz-option-btn");
    if (optBtn) {
      handleOptionSelect(optBtn);
      return;
    }

    const toggleExpBtn = e.target.closest(".btn-toggle-explanation");
    if (toggleExpBtn) {
      const targetId = toggleExpBtn.getAttribute("data-target");
      const expBox = document.getElementById(targetId);
      if (expBox) {
        expBox.classList.toggle("show");
        const isShown = expBox.classList.contains("show");
        toggleExpBtn.querySelector("span").textContent = isShown ? "收合公民神解題關鍵與詳解" : "查看公民神解題關鍵與詳解";
      }
      return;
    }
  });

  function handleOptionSelect(clickedBtn) {
    const cardId = clickedBtn.getAttribute("data-card-id");
    const selectedLetter = clickedBtn.getAttribute("data-letter");
    const correctLetter = clickedBtn.getAttribute("data-ans");
    const card = document.getElementById(cardId);
    if (!card) return;

    // 若已經作答過，不再重複觸發
    if (card.dataset.answered === "true") return;
    card.dataset.answered = "true";

    const allOptions = card.querySelectorAll(".quiz-option-btn");
    const feedbackMsg = document.getElementById(`${cardId}-feedback`);
    const expBox = document.getElementById(`${cardId}-exp`);

    allOptions.forEach(btn => {
      btn.classList.add("disabled");
      const letter = btn.getAttribute("data-letter");
      if (letter === correctLetter) {
        btn.classList.add("correct");
      }
    });

    if (feedbackMsg) {
      feedbackMsg.style.display = "flex";
      feedbackMsg.style.alignItems = "center";
      feedbackMsg.style.gap = "6px";
    }

    if (selectedLetter === correctLetter) {
      clickedBtn.classList.add("correct");
      if (feedbackMsg) {
        feedbackMsg.style.color = "#10b981";
        feedbackMsg.innerHTML = '<i class="fa-solid fa-circle-check"></i> 太神啦！完全命中學測考點！';
      }
      // 慶祝彩花
      if (window.confetti) {
        window.confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.7 }
        });
      }

    } else {
      clickedBtn.classList.add("wrong");
      if (feedbackMsg) {
        feedbackMsg.style.color = "#ef4444";
        feedbackMsg.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 可惜選錯了！正解為 (${correctLetter})`;
      }
    }

    // 自動展開解析協助記憶
    if (expBox) {
      setTimeout(() => {
        expBox.classList.add("show");
        const toggleBtn = card.querySelector(".btn-toggle-explanation span");
        if (toggleBtn) toggleBtn.textContent = "收合公民神解題關鍵與詳解";
      }, 400);
    }
  }

  window.GSAT_QUIZ = {
    parseQuizBlock: parseQuizBlock,
    renderQuizHtml: renderQuizHtml,
    replaceEmojisWithFontAwesome: replaceEmojisWithFontAwesome,
    parseMarkdownWithMath: parseMarkdownWithMath
  };
  window.parseMarkdownWithMath = parseMarkdownWithMath;
})();

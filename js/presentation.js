/**
 * 互動式簡報投影引擎 (Presentation Engine)
 * 專為高中學測衝刺班打造：
 * 1. 投影片切換與進度條
 * 2. 智慧大屏/觸控/滑鼠自由劃記筆 (Whiteboard Annotate Pen Tool)
 * 3. 簡報封面標題分行呈現（主標題與括號子重點換行）
 * 4. 虛擬雷射筆與全螢幕投影
 */

(function () {
  let currentSlides = [];
  let currentSlideIndex = 0;
  let isLaserActive = false;
  let isPenActive = false;
  let isDrawing = false;
  let currentColor = "#ef4444";
  let currentLineWidth = 3;
  let ctx = null;

  const stageWrapper = document.getElementById("slide-stage-wrapper");
  const slideViewport = document.getElementById("slide-viewport");
  const slideCounter = document.getElementById("slide-counter");
  const slideProgressBar = document.getElementById("slide-progress-bar");
  const btnPrev = document.getElementById("btn-prev-slide");
  const btnNext = document.getElementById("btn-next-slide");
  const btnFullscreen = document.getElementById("btn-slide-fullscreen");
  const btnLaser = document.getElementById("btn-slide-laser");
  const laserDot = document.getElementById("laser-pointer-dot");

  // 劃記畫布與工具
  const drawingCanvas = document.getElementById("slide-drawing-canvas");
  const btnPen = document.getElementById("btn-slide-pen");
  const penPalette = document.getElementById("slide-pen-palette");
  const btnUndo = document.getElementById("btn-slide-undo");
  const btnRedo = document.getElementById("btn-slide-redo");
  const btnClearDrawing = document.getElementById("btn-slide-clear-drawing");
  const btnClosePen = document.getElementById("btn-slide-close-pen");
  const penColorBtns = document.querySelectorAll(".pen-color-btn");

  // 劃記復原／重作歷史堆疊 (Undo/Redo History Stacks)
  let historyStack = [];
  let redoStack = [];
  const MAX_HISTORY = 30;

  // 將通用 Emoji 轉換為標準 Font Awesome 圖標
  function replaceEmojisWithFontAwesome(text) {
    if (!text) return "";
    if (window.GSAT_QUIZ && window.GSAT_QUIZ.replaceEmojisWithFontAwesome) {
      return window.GSAT_QUIZ.replaceEmojisWithFontAwesome(text);
    }
    return text
      .replace(/📝/g, '<i class="fa-solid fa-pen-to-square"></i>')
      .replace(/📌/g, '<i class="fa-solid fa-thumbtack"></i>')
      .replace(/[☑✔]/g, '<i class="fa-solid fa-check text-success"></i>')
      .replace(/[☒✘]/g, '<i class="fa-solid fa-xmark text-danger"></i>')
      .replace(/💡/g, '<i class="fa-solid fa-lightbulb"></i>')
      .replace(/🎉/g, '<i class="fa-solid fa-circle-check text-success"></i>')
      .replace(/💪/g, '<i class="fa-solid fa-circle-xmark text-danger"></i>');
  }

  // 格式化簡報封面標題：主標題在第一行，括號子標題換至第二行
  function formatSlideCoverTitle(fullTitle) {
    if (!fullTitle) return "";
    const match = fullTitle.match(/^(.*?)[\s]*([（\(].*)$/);
    if (match) {
      return `
        <div class="slide-cover-title-main">${match[1].trim()}</div>
        <div class="slide-cover-title-sub">${match[2].trim()}</div>
      `;
    }
    return `<div class="slide-cover-title-main">${fullTitle}</div>`;
  }

  // 從講義原始 Markdown 智慧切分出簡報幻燈片陣列
  function buildSlidesFromUnit(unit) {
    if (!unit || !unit.content) return [];

    const slides = [];

    // 1. 封面投影片
    slides.push({
      type: "cover",
      category: unit.category,
      title: unit.title,
      summary: `本單元為學測關鍵衝刺單元【${unit.category}】，完整掌握核心憲政法規、公民參政、經濟供需與歷屆大考必考經典概念。`
    });

    // 2. 依據 ## 重點 或 ### 分解區塊
    const raw = unit.content;
    const sections = raw.split(/\r?\n(?=##\s+)/);

    sections.forEach((sec) => {
      const trimmed = sec.trim();
      if (!trimmed) return;

      // 檢查區塊中是否包含「立即演練」或「公民神演練」
      const quizRegex = />\s*###\s*(?:<i[^>]*><\/i>\s*)?(?:📝\s*)?(?:立即演練|公民神演練)[！!]?[\s\S]*?(?=(?:\r?\n---|\r?\n##|$))/g;
      let cleanedSection = trimmed;
      let quizMatch;

      const extractedQuizzes = [];
      while ((quizMatch = quizRegex.exec(trimmed)) !== null) {
        extractedQuizzes.push(quizMatch[0]);
      }

      // 將題目從常規內容抽離，以便題目能獨自成為「大考實戰投影片」
      cleanedSection = trimmed.replace(quizRegex, "").trim();

      // 切分重點子標題 ###
      const subParts = cleanedSection.split(/\r?\n(?=###\s+)/);

      subParts.forEach(sub => {
        const subTrimmed = sub.trim();
        if (!subTrimmed || subTrimmed.startsWith("# 單元")) return;

        const lines = subTrimmed.split(/\r?\n/);
        const firstLine = lines[0].replace(/^#+\s*/, "").replace(/---/g, "").trim();
        if (!firstLine) return;

        // 若此段落僅是一行 ## 標題而無實質內容，則略過，避免產生空白投影片
        const bodyLines = lines.slice(1).filter(l => l.trim().length > 0 && !l.trim().startsWith("---"));
        if (lines[0].startsWith("## ") && bodyLines.length === 0) {
          return;
        }

        // 移除投影片正文中與標題重複的首行
        const bodyMarkdown = bodyLines.length > 0 ? lines.slice(1).join("\n") : subTrimmed;
        const cleanTitle = firstLine
          .replace(/^(?:<i[^>]*><\/i>\s*)+/gi, "")
          .replace(/^[📌📝\s]+/, "")
          .replace(/^(?:<i[^>]*><\/i>\s*)+/gi, "")
          .trim();

        slides.push({
          type: "concept",
          title: cleanTitle,
          rawMarkdown: bodyMarkdown
        });
      });

      // 題目獨立為練習投影片
      extractedQuizzes.forEach(qRaw => {
        const parsed = window.GSAT_QUIZ.parseQuizBlock(qRaw);
        if (parsed) {
          slides.push({
            type: "quiz",
            title: `公民神演練 (${parsed.source})`,
            quiz: parsed
          });
        }
      });
    });

    return slides;
  }

  // 載入當前單元的投影片
  function loadUnitSlides(unit) {
    currentSlides = buildSlidesFromUnit(unit);
    currentSlideIndex = 0;
    resetDrawingForNewSlide();
    renderCurrentSlide();
  }

  // 渲染當前頁
  function renderCurrentSlide() {
    if (!slideViewport || currentSlides.length === 0) return;

    const slide = currentSlides[currentSlideIndex];
    let html = "";

    if (slide.type === "cover") {
      html = `
        <div class="slide-card">
          <div class="slide-cover-layout">
            <span class="slide-cover-tag">
              <i class="fa-solid fa-graduation-cap"></i> ${slide.category}
            </span>
            <h2 class="slide-cover-title">
              ${formatSlideCoverTitle(slide.title)}
            </h2>
            <p class="slide-cover-summary">${slide.summary}</p>
            <div style="margin-top: 20px; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap;">
              <span class="sprint-badge">
                <i class="fa-solid fa-bolt"></i> 學測命中神考點
              </span>
              <span style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600;">
                <i class="fa-solid fa-layer-group"></i> 全單元共 ${currentSlides.length} 頁簡報精華
              </span>
            </div>
          </div>
        </div>
      `;
    } else if (slide.type === "quiz") {
      html = `
        <div class="slide-card quiz-slide-card">
          <div class="slide-concept-header" style="margin-bottom: 8px;">
            <h3 class="slide-concept-title">
              <i class="fa-solid fa-circle-question" style="color: #f59e0b;"></i> ${slide.title}
            </h3>
          </div>
          <div class="slide-concept-body" style="padding-top: 0;">
            ${window.GSAT_QUIZ.renderQuizHtml(slide.quiz, currentSlideIndex, true)}
          </div>
        </div>
      `;
    } else {
      // 概念卡片
      let cleanSlideTitle = (slide.title || "")
        .replace(/^(?:<i[^>]*><\/i>\s*)+/gi, "")
        .replace(/^[📌📝\s]+/, "")
        .replace(/^(?:<i[^>]*><\/i>\s*)+/gi, "")
        .trim();
      let formattedMd = replaceEmojisWithFontAwesome(slide.rawMarkdown);
      let parsedMd = window.parseMarkdownWithMath
        ? window.parseMarkdownWithMath(formattedMd)
        : (window.marked ? window.marked.parse(formattedMd) : formattedMd);
      html = `
        <div class="slide-card">
          <div class="slide-concept-header">
            <h3 class="slide-concept-title">
              <i class="fa-solid fa-thumbtack" style="color: #38bdf8;"></i> ${cleanSlideTitle}
            </h3>
          </div>
          <div class="slide-concept-body">
            ${parsedMd}
          </div>
        </div>
      `;
    }

    slideViewport.innerHTML = html;

    // 渲染數學公式 (KaTeX)
    if (window.renderMathInElement) {
      window.renderMathInElement(slideViewport, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
      });
    }

    // 更新計數與進度條
    const total = currentSlides.length;
    const curr = currentSlideIndex + 1;
    if (slideCounter) {
      slideCounter.textContent = `投影片 ${curr} / ${total}`;
    }
    if (slideProgressBar) {
      const percentage = (curr / total) * 100;
      slideProgressBar.style.width = `${percentage}%`;
    }

    // 按鈕可用性
    if (btnPrev) btnPrev.disabled = currentSlideIndex === 0;
    if (btnNext) btnNext.disabled = currentSlideIndex === total - 1;
  }

  function nextSlide() {
    if (currentSlideIndex < currentSlides.length - 1) {
      currentSlideIndex++;
      resetDrawingForNewSlide();
      renderCurrentSlide();
    }
  }

  function prevSlide() {
    if (currentSlideIndex > 0) {
      currentSlideIndex--;
      resetDrawingForNewSlide();
      renderCurrentSlide();
    }
  }

  function goToSlide(index) {
    if (index >= 0 && index < currentSlides.length) {
      currentSlideIndex = index;
      resetDrawingForNewSlide();
      renderCurrentSlide();
    }
  }

  // 全螢幕切換
  function toggleFullscreen() {
    if (!stageWrapper) return;
    const mascot = document.getElementById("mascot-container");
    if (!document.fullscreenElement) {
      stageWrapper.requestFullscreen().then(() => {
        if (mascot) {
          stageWrapper.appendChild(mascot);
          mascot.style.zIndex = "99999";
          if (window.GSAT_MASCOT && window.GSAT_MASCOT.clampToViewport) {
            window.GSAT_MASCOT.clampToViewport();
          }
        }
        setTimeout(resizeCanvas, 100);
      }).catch(err => {
        console.warn("Fullscreen request error:", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        if (mascot) {
          document.body.appendChild(mascot);
          mascot.style.zIndex = "99999";
          if (window.GSAT_MASCOT && window.GSAT_MASCOT.clampToViewport) {
            window.GSAT_MASCOT.clampToViewport();
          }
        }
        setTimeout(resizeCanvas, 100);
      });
    }
  }

  // 虛擬雷射筆切換
  function toggleLaser() {
    isLaserActive = !isLaserActive;
    if (laserDot) {
      laserDot.style.display = isLaserActive ? "block" : "none";
    }
    if (btnLaser) {
      btnLaser.style.color = isLaserActive ? "#ff0055" : "";
      btnLaser.style.borderColor = isLaserActive ? "#ff0055" : "";
    }
    if (stageWrapper) {
      stageWrapper.style.cursor = isLaserActive ? "none" : (isPenActive ? "crosshair" : "default");
    }
  }

  // 雷射筆跟隨游標
  if (stageWrapper && laserDot) {
    stageWrapper.addEventListener("mousemove", (e) => {
      if (!isLaserActive) return;
      const rect = stageWrapper.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      laserDot.style.left = `${x}px`;
      laserDot.style.top = `${y}px`;
    });
  }

  /* ==========================================================================
     大屏觸控劃記筆引擎 (Interactive Screen Canvas Markup with Undo/Redo)
     ========================================================================== */
  function resizeCanvas() {
    if (!drawingCanvas || !stageWrapper) return;
    const rect = stageWrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const newWidth = rect.width * dpr;
    const newHeight = rect.height * dpr;

    // 若原畫布已有內容，暫存以避免縮放時清空
    let tempCanvas = null;
    if (ctx && drawingCanvas.width > 0 && drawingCanvas.height > 0) {
      tempCanvas = document.createElement("canvas");
      tempCanvas.width = drawingCanvas.width;
      tempCanvas.height = drawingCanvas.height;
      const tCtx = tempCanvas.getContext("2d");
      tCtx.drawImage(drawingCanvas, 0, 0);
    }

    drawingCanvas.width = newWidth;
    drawingCanvas.height = newHeight;
    drawingCanvas.style.width = `${rect.width}px`;
    drawingCanvas.style.height = `${rect.height}px`;

    ctx = drawingCanvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tempCanvas) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
      ctx.restore();
    }
  }

  // 儲存當前劃記狀態至歷史堆疊 (Undo)
  function saveDrawingState() {
    if (!ctx || !drawingCanvas) return;
    try {
      const w = drawingCanvas.width;
      const h = drawingCanvas.height;
      if (w === 0 || h === 0) return;
      const imgData = ctx.getImageData(0, 0, w, h);
      historyStack.push(imgData);
      if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
      }
      redoStack = []; // 有新筆劃時重設重作堆疊
      updateUndoRedoButtons();
    } catch (err) {
      console.warn("saveDrawingState error:", err);
    }
  }

  // 復原筆劃 (Undo)
  function undoDrawing() {
    if (!ctx || !drawingCanvas || historyStack.length === 0) return;
    try {
      const currentImgData = ctx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
      redoStack.push(currentImgData);
      const prevImgData = historyStack.pop();
      ctx.putImageData(prevImgData, 0, 0);
      updateUndoRedoButtons();
    } catch (err) {
      console.warn("undoDrawing error:", err);
    }
  }

  // 重作筆劃 (Redo)
  function redoDrawing() {
    if (!ctx || !drawingCanvas || redoStack.length === 0) return;
    try {
      const currentImgData = ctx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
      historyStack.push(currentImgData);
      const nextImgData = redoStack.pop();
      ctx.putImageData(nextImgData, 0, 0);
      updateUndoRedoButtons();
    } catch (err) {
      console.warn("redoDrawing error:", err);
    }
  }

  // 更新復原/重作按鈕外觀狀態
  function updateUndoRedoButtons() {
    if (btnUndo) {
      const canUndo = historyStack.length > 0;
      btnUndo.disabled = !canUndo;
      btnUndo.style.opacity = canUndo ? "1" : "0.35";
      btnUndo.style.cursor = canUndo ? "pointer" : "not-allowed";
    }
    if (btnRedo) {
      const canRedo = redoStack.length > 0;
      btnRedo.disabled = !canRedo;
      btnRedo.style.opacity = canRedo ? "1" : "0.35";
      btnRedo.style.cursor = canRedo ? "pointer" : "not-allowed";
    }
  }

  // 切換投影片時清空並重設畫布
  function resetDrawingForNewSlide() {
    historyStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    if (ctx && drawingCanvas) {
      ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    }
  }

  function togglePen() {
    isPenActive = !isPenActive;
    if (btnPen) {
      btnPen.classList.toggle("active", isPenActive);
      btnPen.style.background = isPenActive ? "#ef4444" : "";
      btnPen.style.color = isPenActive ? "#ffffff" : "";
      btnPen.innerHTML = isPenActive ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-pen"></i>';
      btnPen.title = isPenActive ? "關閉大屏觸控劃記筆 (P 或 Esc)" : "開啟大屏觸控劃記筆 (P)";
    }
    if (penPalette) {
      penPalette.style.display = isPenActive ? "inline-flex" : "none";
    }
    if (drawingCanvas) {
      drawingCanvas.style.pointerEvents = isPenActive ? "auto" : "none";
      drawingCanvas.style.cursor = isPenActive ? "crosshair" : "default";
    }
    if (isPenActive) {
      resizeCanvas();
      updateUndoRedoButtons();
      if (isLaserActive) toggleLaser(); // 互斥切換
    }
  }

  function closePen() {
    if (isPenActive) {
      togglePen();
    }
  }

  function clearDrawing() {
    if (!ctx || !drawingCanvas) return;
    saveDrawingState(); // 記錄當前狀態以支援清除後仍可復原
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  }

  function getCanvasCoords(e) {
    const rect = drawingCanvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function startDraw(e) {
    if (!isPenActive || !ctx) return;
    saveDrawingState(); // 開始繪製新筆劃前先保存歷史
    isDrawing = true;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentLineWidth;
  }

  function drawingMove(e) {
    if (!isDrawing || !isPenActive || !ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw() {
    if (!isDrawing) return;
    isDrawing = false;
    if (ctx) ctx.closePath();
  }

  // 綁定畫布事件（滑鼠 + 觸控）
  if (drawingCanvas) {
    // 滑鼠事件
    drawingCanvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) startDraw(e);
    });
    drawingCanvas.addEventListener("mousemove", drawingMove);
    window.addEventListener("mouseup", endDraw);
    drawingCanvas.addEventListener("mouseleave", endDraw);

    // 觸控事件（支援電子白板、智慧大屏與平板手勢）
    drawingCanvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        startDraw(e);
        e.preventDefault();
      }
    }, { passive: false });

    drawingCanvas.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) {
        drawingMove(e);
        e.preventDefault();
      }
    }, { passive: false });

    drawingCanvas.addEventListener("touchend", endDraw);
    drawingCanvas.addEventListener("touchcancel", endDraw);
  }

  // 顏色與筆刷切換
  penColorBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      penColorBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentColor = btn.getAttribute("data-color");
      currentLineWidth = parseInt(btn.getAttribute("data-width") || "3", 10);
    });
  });

  if (btnPen) btnPen.addEventListener("click", togglePen);
  if (btnClosePen) {
    btnClosePen.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePen();
    });
  }
  if (btnUndo) {
    btnUndo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      undoDrawing();
    });
  }
  if (btnRedo) {
    btnRedo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      redoDrawing();
    });
  }
  if (btnClearDrawing) {
    btnClearDrawing.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearDrawing();
    });
  }

  // 監聽視窗縮放調整畫布
  window.addEventListener("resize", () => {
    if (isPenActive) resizeCanvas();
  });

  // 事件監聽綁定
  if (btnPrev) btnPrev.addEventListener("click", prevSlide);
  if (btnNext) btnNext.addEventListener("click", nextSlide);
  if (btnFullscreen) btnFullscreen.addEventListener("click", toggleFullscreen);
  if (btnLaser) btnLaser.addEventListener("click", toggleLaser);

  // 簡報鍵盤快捷鍵
  document.addEventListener("keydown", (e) => {
    // 忽略輸入框內的打字事件
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    // 僅在簡報模式為可見時生效
    const presContainer = document.getElementById("presentation-container");
    if (!presContainer || !presContainer.classList.contains("active")) return;

    // 劃記模式快捷鍵：復原 (Ctrl+Z) 與 重作 (Ctrl+Y 或 Ctrl+Shift+Z)
    if (isPenActive) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (e.shiftKey) {
          redoDrawing();
        } else {
          undoDrawing();
        }
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        redoDrawing();
        e.preventDefault();
        return;
      }
    }

    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        nextSlide();
        e.preventDefault();
        break;
      case "ArrowLeft":
      case "PageUp":
        prevSlide();
        e.preventDefault();
        break;
      case "Home":
        goToSlide(0);
        e.preventDefault();
        break;
      case "End":
        goToSlide(currentSlides.length - 1);
        e.preventDefault();
        break;
      case "f":
      case "F":
        toggleFullscreen();
        e.preventDefault();
        break;
      case "p":
      case "P":
        togglePen();
        e.preventDefault();
        break;
      case "Escape":
        if (isPenActive) {
          closePen();
          e.preventDefault();
        }
        break;
      case "l":
      case "L":
        toggleLaser();
        e.preventDefault();
        break;
    }
  });

  window.GSAT_PRESENTATION = {
    buildSlidesFromUnit: buildSlidesFromUnit,
    loadUnitSlides: loadUnitSlides,
    nextSlide: nextSlide,
    prevSlide: prevSlide,
    goToSlide: goToSlide,
    toggleFullscreen: toggleFullscreen,
    togglePen: togglePen,
    closePen: closePen,
    clearDrawing: clearDrawing,
    undo: undoDrawing,
    redo: redoDrawing,
    resetDrawing: resetDrawingForNewSlide
  };
})();

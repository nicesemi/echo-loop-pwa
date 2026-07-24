/* ============ Echo Loop PWA · 主脚本 ============ */
(function () {
  "use strict";

  /* ---------- 工具 ---------- */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];
  const storage = {
    get(key) { try { return JSON.parse(localStorage.getItem("echo_" + key)); } catch { return null; } },
    set(key, val) { localStorage.setItem("echo_" + key, JSON.stringify(val)); }
  };

  /* ---------- 页面路由 ---------- */
  const pages = {};
  $$(".page").forEach(p => pages[p.id.replace("page-", "")] = p);
  function goto(name) {
    Object.values(pages).forEach(p => p.classList.remove("active"));
    pages[name].classList.add("active");
    $$(".tab-item").forEach(t => t.classList.toggle("active", t.dataset.goto === name));
    if (name === "home") renderHome();
  }
  $$("[data-goto]").forEach(el => el.addEventListener("click", () => goto(el.dataset.goto)));

  /* ---------- 安装按钮 ---------- */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = $("#installBtn");
    btn.hidden = false;
    btn.addEventListener("click", () => {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => { deferredPrompt = null; btn.hidden = true; });
    });
  });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; $("#installBtn").hidden = true; });

  /* ---------- Service Worker ---------- */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  /* ================================================================
     首页
  ================================================================ */
  function renderHome() {
    const streak = storage.get("streak") || 0;
    $("#homeStreak").textContent = streak;
  }

  /* ================================================================
     听音选词
  ================================================================ */
  let listenState = {};
  function initListen() {
    const pool = [...WORDS].sort(() => Math.random() - 0.5).slice(0, 5);
    listenState = {
      pool,
      idx: 0,
      score: 0,
      total: pool.length,
      answered: false,
      round: 1
    };
    $("#listenResult").hidden = true;
    $$("#page-listen .quiz-card, #page-listen .page-head")[1].hidden = false;
    showListenQuestion();
  }

  function showListenQuestion() {
    const { pool, idx, total, score } = listenState;
    if (idx >= total) return showListenResult();
    const word = pool[idx];
    const wrongs = WORDS.filter(w => w.word !== word.word).sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [...wrongs, word].sort(() => Math.random() - 0.5);
    listenState.word = word;
    listenState.options = options;
    listenState.answered = false;

    $("#listenProgress").textContent = `${idx + 1} / ${total}`;
    $("#listenScore").textContent = score;
    $("#listenFeedback").textContent = "";
    $("#listenFeedback").className = "feedback";
    $("#listenNextBtn").hidden = true;

    const opts = $("#listenOptions");
    opts.innerHTML = options.map((o, i) => `<button class="option-btn" data-index="${i}">${o.word}</button>`).join("");
    opts.querySelectorAll(".option-btn").forEach(btn => {
      btn.addEventListener("click", () => handleListenAnswer(btn));
    });
  }

  function playWord() {
    if (!listenState.word) return;
    const utterance = new SpeechSynthesisUtterance(listenState.word.word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  function handleListenAnswer(btn) {
    if (listenState.answered) return;
    listenState.answered = true;
    const correct = listenState.word;
    const selected = listenState.options[parseInt(btn.dataset.index)];
    const isCorrect = selected.word === correct.word;
    const allBtns = $$("#listenOptions .option-btn");

    allBtns.forEach(b => {
      const idx = parseInt(b.dataset.index);
      const opt = listenState.options[idx];
      b.disabled = true;
      if (opt.word === correct.word) b.classList.add("correct");
      else if (b === btn && !isCorrect) b.classList.add("wrong");
    });

    if (isCorrect) {
      listenState.score++;
      $("#listenScore").textContent = listenState.score;
      $("#listenFeedback").textContent = "正确！";
      $("#listenFeedback").className = "feedback ok";
    } else {
      $("#listenFeedback").textContent = `正确答案：${correct.word}`;
      $("#listenFeedback").className = "feedback no";
    }
    $("#listenNextBtn").hidden = false;
  }

  function nextListenQuestion() {
    listenState.idx++;
    showListenQuestion();
  }

  function showListenResult() {
    const { score, total, round } = listenState;
    $$("#page-listen .quiz-card, #page-listen .page-head")[1].hidden = true;
    $("#listenResult").hidden = false;
    $("#listenFinalScore").textContent = `${score} / ${total} · 正确率 ${Math.round(score / total * 100)}%`;
    // 自动打卡
    autoCheckin();
  }

  function restartListen() {
    initListen();
  }

  $("#playSoundBtn").addEventListener("click", playWord);
  $("#listenNextBtn").addEventListener("click", nextListenQuestion);
  $("#listenRestartBtn").addEventListener("click", restartListen);

  /* ================================================================
     跟读评分
  ================================================================ */
  let speakState = { sentenceIdx: 0, recording: false };
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  const speakUnsupported = $("#speakUnsupported");

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    speakUnsupported.hidden = true;
  } else {
    speakUnsupported.hidden = false;
  }

  function loadSpeakSentence() {
    const item = SENTENCES[speakState.sentenceIdx % SENTENCES.length];
    $("#speakSentence").textContent = item.en;
    $("#speakMeaning").textContent = item.zh;
    $("#speakResult").hidden = true;
    $("#speakStatus").textContent = "";
    speakState.recording = false;
    $("#speakRecordBtn").classList.remove("recording");
    $("#speakRecordBtn").innerHTML = "🎙️<span>跟读</span>";
  }

  function playSpeakDemo() {
    const text = $("#speakSentence").textContent;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.8;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  function toggleRecord() {
    if (!SpeechRecognition) return;
    if (speakState.recording) {
      recognition.stop();
      speakState.recording = false;
      $("#speakRecordBtn").classList.remove("recording");
      $("#speakRecordBtn").innerHTML = "🎙️<span>跟读</span>";
      $("#speakStatus").textContent = "识别中…";
    } else {
      $("#speakResult").hidden = true;
      recognition.start();
      speakState.recording = true;
      $("#speakRecordBtn").classList.add("recording");
      $("#speakRecordBtn").innerHTML = "⏹️<span>停止</span>";
      $("#speakStatus").textContent = "正在听…请跟读";
    }
  }

  function calcScore(ref, spoken) {
    if (!spoken) return 0;
    const r = ref.toLowerCase().replace(/[^a-z ]/g, "").trim();
    const s = spoken.toLowerCase().replace(/[^a-z ]/g, "").trim();
    const rWords = r.split(/\s+/);
    const sWords = s.split(/\s+/);
    let hits = 0;
    for (let i = 0; i < rWords.length; i++) {
      if (i < sWords.length && sWords[i] === rWords[i]) hits++;
    }
    return Math.round((hits / Math.max(rWords.length, 1)) * 100);
  }

  if (recognition) {
    recognition.addEventListener("result", (e) => {
      const spoken = e.results[0][0].transcript;
      const ref = $("#speakSentence").textContent;
      const score = calcScore(ref, spoken);
      $("#speakResult").hidden = false;
      $("#speakScoreNum").textContent = score;
      $("#speakRecognized").textContent = spoken || "(未识别到内容)";
      if (score >= 80) {
        $("#speakScoreText").textContent = "发音很棒！继续保持 🔥";
      } else if (score >= 50) {
        $("#speakScoreText").textContent = "还不错，再多练几次";
      } else {
        $("#speakScoreText").textContent = "加油，注意每个单词的发音";
      }
      $("#speakStatus").textContent = "";
      speakState.recording = false;
      $("#speakRecordBtn").classList.remove("recording");
      $("#speakRecordBtn").innerHTML = "🎙️<span>跟读</span>";
      autoCheckin();
    });
    recognition.addEventListener("error", () => {
      $("#speakStatus").textContent = "识别失败，请重试";
      speakState.recording = false;
      $("#speakRecordBtn").classList.remove("recording");
      $("#speakRecordBtn").innerHTML = "🎙️<span>跟读</span>";
    });
    recognition.addEventListener("end", () => {
      if (speakState.recording) {
        speakState.recording = false;
        $("#speakRecordBtn").classList.remove("recording");
        $("#speakRecordBtn").innerHTML = "🎙️<span>跟读</span>";
      }
    });
  }

  function nextSpeakSentence() {
    speakState.sentenceIdx++;
    loadSpeakSentence();
  }

  $("#speakPlayBtn").addEventListener("click", playSpeakDemo);
  $("#speakRecordBtn").addEventListener("click", toggleRecord);
  $("#speakNextBtn").addEventListener("click", nextSpeakSentence);

  /* ================================================================
     单词闪卡
  ================================================================ */
  let flashState = { idx: 0, flipped: false };

  function loadFlashcard() {
    const word = WORDS[flashState.idx];
    $("#flashWord").textContent = word.word;
    $("#flashPhonetic").textContent = word.phonetic;
    $("#flashMeaning").textContent = word.meaning;
    $("#flashSentence").textContent = word.sentence;
    $("#flashIndex").textContent = `${flashState.idx + 1} / ${WORDS.length}`;
    flashState.flipped = false;
    $("#flashCard").classList.remove("flipped");
  }

  $("#flashCard").addEventListener("click", () => {
    flashState.flipped = !flashState.flipped;
    $("#flashCard").classList.toggle("flipped", flashState.flipped);
  });

  $("#flashSpeakBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const word = WORDS[flashState.idx];
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });

  function flashPrev() {
    flashState.idx = (flashState.idx - 1 + WORDS.length) % WORDS.length;
    loadFlashcard();
  }
  function flashNext() {
    flashState.idx = (flashState.idx + 1) % WORDS.length;
    loadFlashcard();
  }
  $("#flashPrevBtn").addEventListener("click", flashPrev);
  $("#flashNextBtn").addEventListener("click", flashNext);

  /* ================================================================
     每日打卡
  ================================================================ */
  function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function renderCheckin() {
    const streak = storage.get("streak") || 0;
    const totalDays = storage.get("totalDays") || 0;
    const checkedDates = storage.get("checkedDates") || [];
    const today = getToday();
    const todayChecked = checkedDates.includes(today);

    $("#ciStreak").textContent = streak;
    $("#ciTotal").textContent = totalDays;

    const todayDate = new Date();
    const weekRow = $("#weekRow");
    weekRow.innerHTML = "";
    const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const done = checkedDates.includes(key);
      const isToday = key === today;
      const cell = document.createElement("div");
      cell.className = "day-cell" + (done ? " done" : "") + (isToday ? " today" : "");
      cell.innerHTML = `<span>${dayNames[d.getDay()]}</span><span class="d-num">${d.getDate()}</span>`;
      weekRow.appendChild(cell);
    }

    const btn = $("#checkinBtn");
    if (todayChecked) {
      btn.textContent = "今日已打卡";
      btn.disabled = true;
      btn.style.opacity = "0.5";
    } else {
      btn.textContent = "今日打卡";
      btn.disabled = false;
      btn.style.opacity = "1";
    }
    $("#checkinMsg").textContent = todayChecked ? "今天已经打过卡了，明天继续！" : "";
  }

  function doCheckin() {
    const today = getToday();
    let checkedDates = storage.get("checkedDates") || [];
    if (checkedDates.includes(today)) {
      $("#checkinMsg").textContent = "今天已经打过卡了！";
      return;
    }

    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1));
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    checkedDates.push(today);
    storage.set("checkedDates", checkedDates);

    let streak = storage.get("streak") || 0;
    if (checkedDates.includes(yKey)) {
      streak++;
    } else {
      streak = 1;
    }
    storage.set("streak", streak);
    const totalDays = (storage.get("totalDays") || 0) + 1;
    storage.set("totalDays", totalDays);

    renderCheckin();
    renderHome();
    $("#checkinMsg").textContent = `打卡成功！连续 ${streak} 天 🔥`;
  }

  function autoCheckin() {
    const today = getToday();
    let checkedDates = storage.get("checkedDates") || [];
    if (!checkedDates.includes(today)) {
      doCheckin();
    }
  }

  $("#checkinBtn").addEventListener("click", doCheckin);

  /* ================================================================
     手势：左右滑动切换闪卡
  ================================================================ */
  let touchStartX = 0;
  $("#flashCard").addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  $("#flashCard").addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 50) return; // 不够长，当作点击
    if (dx < 0) flashNext();
    else flashPrev();
  });

  /* ================================================================
     初始化
  ================================================================ */
  renderHome();
  initListen();
  loadSpeakSentence();
  loadFlashcard();
  renderCheckin();
})();

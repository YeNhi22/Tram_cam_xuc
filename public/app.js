/* ============================================================
   Trung Tâm Cảm Xúc — app.js
   Tab: Viết / Nhật ký / Bảng tin / Trò chuyện / Thống kê
   Tính năng:
     - Đăng ký / Đăng nhập / Đăng xuất
     - Nhật ký: ghi, sửa, xoá, nhãn, lịch, streak cá nhân
     - Chia sẻ riêng tư hoặc chọn người nhận cụ thể
     - Bảng tin (Feed): xem các bài người khác chia sẻ
     - Đính kèm ảnh / video (tối đa 20MB, lightbox phóng to ảnh)
     - Thông báo thời gian thực khi được chia sẻ hoặc có tin nhắn
     - Trò chuyện 2 người: giữ chuỗi 🔥 liên tiếp mỗi ngày
     - Khôi phục chuỗi: tối đa 5 lần / tháng khi qua 24g không nhắn
     - Thống kê: biểu đồ 7 & 30 ngày, Ngày này năm ngoái, tóm tắt tháng
     - Dark mode, 4 theme, âm thanh, confetti, particles, auto-draft
   ============================================================ */
(function () {
  "use strict";

  /* ---- Service Worker ---- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ================================================================
     CONSTANTS & CONFIG
  ================================================================ */
  const MOODS = {
    vui:        { emoji: "😊", label: "Vui",         color: "var(--vui)" },
    buc:        { emoji: "😤", label: "Bực",         color: "var(--buc)" },
    bthuong:    { emoji: "😔", label: "Buồn",        color: "var(--bthuong)" },
    binhthuong: { emoji: "😌", label: "Bình thường", color: "var(--binhthuong)" },
  };

  const API_ENTRIES   = "/api/entries";
  const API_FEED      = "/api/feed";
  const API_NOTIFS    = "/api/notifications";
  const API_CONVS     = "/api/conversations";
  const API_USERS     = "/api/users";
  const API_UPLOAD    = "/api/upload";
  const API_AUTH      = "/api/auth";

  const TOKEN_KEY     = "camxuc_auth_token";
  const DRAFT_KEY     = "camxuc_draft";

  const WEEKDAYS      = ["CN","T2","T3","T4","T5","T6","T7"];
  const WEEKDAYS_FULL = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
  const MONTHS        = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
                         "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

  const QUOTES = [
    "Mỗi ngày là một trang mới — hãy viết điều gì đó đẹp.",
    "Cảm xúc không cần lý do, chỉ cần được lắng nghe.",
    "Viết ra là buông đi một nửa nỗi lo.",
    "Ngày buồn cũng xứng đáng được ghi lại.",
    "Nhật ký là người bạn không bao giờ phán xét.",
    "Hôm nay dù thế nào, bạn vẫn đang cố gắng.",
    "Mỗi cảm xúc đều có giá trị của nó.",
    "Nhẹ lòng hơn sau khi viết — đó là điều thật.",
    "Ngày tốt bắt đầu từ việc nhận ra mình đang cảm thấy gì.",
    "Bực cũng được, buồn cũng được — quan trọng là không giữ trong bụng.",
    "Sự chân thật với bản thân là dũng cảm nhất.",
    "Một câu thôi cũng đủ để ghi lại ngày hôm nay.",
  ];

  /* ================================================================
     DOM HELPERS
  ================================================================ */
  const $  = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatDisplayDate(iso) {
    if (!iso) return "";
    const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return `${WEEKDAYS_FULL[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  function formatTimeAgo(iso) {
    if (!iso) return "";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "vừa xong";
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
    return formatDisplayDate(iso.slice(0, 10));
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function countWords(s) {
    return s.trim() ? s.trim().split(/\s+/).length : 0;
  }

  /* ================================================================
     APPLICATION STATE
  ================================================================ */
  let currentUser         = null;
  let authToken           = localStorage.getItem(TOKEN_KEY) || null;

  let entries             = [];
  let feedEntries         = [];
  let conversations       = [];
  let notifications       = [];

  let selectedMood        = null;
  let activeFilter        = "all";
  let searchQuery         = "";
  let editingId           = null;
  let currentTags         = [];
  let selectedShareUsers  = []; // [{ id, displayName, username }]
  let attachedMedia       = []; // [{ id, url, type, name }]

  let activeConvId        = null;
  let activeConv          = null;

  let calYear, calMonth;
  let chartRange          = "week";
  let activeTab           = "write";

  let notifPollInterval   = null;
  let chatPollInterval    = null;

  /* ================================================================
     DOM REFERENCES
  ================================================================ */
  // Header & User
  const streakBadge       = $("#streak-badge");
  const streakCount       = $("#streak-count");
  const darkToggle        = $("#dark-toggle");
  const themeDots         = $$(".theme-dot");
  const userArea          = $("#user-area");
  const userNameEl        = $("#user-name");
  const logoutBtn         = $("#logout-btn");
  const notifBtn          = $("#notif-btn");
  const notifBadge        = $("#notif-badge");
  const notifPanel        = $("#notif-panel");
  const quoteText         = $("#quote-text");

  // Tabs
  const tabBtns           = $$(".tab-btn");
  const tabBadgeDiary     = $("#tab-badge-diary");
  const tabBadgeFeed      = $("#tab-badge-feed");
  const tabBadgeChat      = $("#tab-badge-chat");

  // Composer
  const moodChips         = $$(".mood-chip");
  const dateInput         = $("#entry-date");
  const titleInput        = $("#entry-title");
  const textInput         = $("#entry-text");
  const saveBtn           = $("#save-entry");
  const clearBtn          = $("#clear-entry");
  const cancelEditBtn     = $("#cancel-edit");
  const composerMsg       = $("#composer-msg");
  const composerTitle     = $("#composer-title");
  const wordCount         = $("#word-count");
  const tagInput          = $("#tag-input");
  const tagList           = $("#tag-list");
  const shareInput        = $("#share-input");
  const shareList         = $("#share-list");
  const shareResults      = $("#share-results");
  const attachBtn         = $("#attach-btn");
  const attachFile        = $("#attach-file");
  const attachPreview     = $("#attach-preview");

  // Backup
  const exportBtn         = $("#export-btn");
  const importBtn         = $("#import-btn");
  const importFile        = $("#import-file");

  // Timeline & Calendar
  const filterBtns        = $$(".filter-btn");
  const entriesList       = $("#entries-list");
  const emptyState        = $("#empty-state");
  const statTotal         = $("#stat-total");
  const statVui           = $("#stat-vui");
  const statBuc           = $("#stat-buc");
  const searchInput       = $("#search-input");
  const calPrev           = $("#cal-prev");
  const calNext           = $("#cal-next");
  const calTitle          = $("#cal-title");
  const calGrid           = $("#cal-grid");

  // Feed
  const feedList          = $("#feed-list");
  const feedEmpty         = $("#feed-empty");

  // Chat
  const convList          = $("#conv-list");
  const convEmpty         = $("#conv-empty");
  const chatHeader        = $("#chat-header");
  const chatStreak        = $("#chat-streak");
  const chatMsgs          = $("#chat-msgs");
  const chatPlaceholder   = $("#chat-placeholder");
  const chatInput         = $("#chat-input");
  const chatSend          = $("#chat-send");
  const chatUserSearch    = $("#chat-user-search");
  const chatUserResults   = $("#chat-user-results");

  // Stats
  const chartWrap         = $("#chart-wrap");
  const chartTabs         = $$(".chart-tab");
  const otdSection        = $("#on-this-day");
  const otdList           = $("#otd-list");
  const otdTitle          = $("#otd-title");
  const summaryEl         = $("#summary-content");

  // Auth Screen
  const authScreen        = $("#auth-screen");
  const authTabs          = $$(".auth-tab");
  const authForm          = $("#auth-form");
  const authUsername      = $("#auth-username");
  const authDisplay       = $("#auth-display");
  const authPassword      = $("#auth-password");
  const authSubmit        = $("#auth-submit");
  const authMsg           = $("#auth-msg");

  // Canvas
  const confettiCvs       = $("#confetti-canvas");
  const particlesCvs      = $("#particles-canvas");

  // Lightbox
  const imgModal          = $("#img-modal");
  const imgModalSrc       = $("#img-modal-src");
  const imgModalClose     = $("#img-modal-close");

  /* ================================================================
     API FETCH WRAPPER
  ================================================================ */
  async function apiFetch(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    if (opts.body && typeof opts.body === "string" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    opts.headers = headers;

    const res = await fetch(path, opts);
    if (res.status === 401) {
      // Phiên hết hạn hoặc chưa đăng nhập
      setAuth(null, null);
      throw new Error("Chưa đăng nhập");
    }
    return res;
  }

  /* ================================================================
     AUTH MANAGEMENT
  ================================================================ */
  let authMode = "login"; // "login" | "register"

  function setAuthMode(mode) {
    authMode = mode;
    authTabs.forEach(t => t.classList.toggle("is-active", t.dataset.amode === mode));
    if (mode === "register") {
      authDisplay.hidden = false;
      authSubmit.textContent = "Đăng ký";
      authPassword.placeholder = "Mật khẩu (ít nhất 4 ký tự)";
    } else {
      authDisplay.hidden = true;
      authSubmit.textContent = "Đăng nhập";
      authPassword.placeholder = "Mật khẩu";
    }
    authMsg.textContent = "";
  }

  authTabs.forEach(t => {
    t.addEventListener("click", () => setAuthMode(t.dataset.amode));
  });

  function setAuth(token, user) {
    authToken = token;
    currentUser = user;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      authScreen.hidden = true;
      userArea.hidden = false;
      userNameEl.textContent = `🌸 ${user.displayName || user.username}`;
      startPolling();
    } else {
      localStorage.removeItem(TOKEN_KEY);
      authScreen.hidden = false;
      userArea.hidden = true;
      userNameEl.textContent = "";
      stopPolling();
    }
  }

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = authUsername.value.trim();
    const password = authPassword.value;
    const displayName = authDisplay.value.trim();

    if (!username || !password) {
      authMsg.textContent = "Vui lòng điền tên đăng nhập và mật khẩu";
      authMsg.className = "auth-msg";
      return;
    }

    authSubmit.disabled = true;
    authSubmit.textContent = "Đang xử lý...";
    authMsg.textContent = "";

    try {
      const endpoint = authMode === "register" ? `${API_AUTH}/register` : `${API_AUTH}/login`;
      const payload = authMode === "register"
        ? { username, password, displayName }
        : { username, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");

      authUsername.value = "";
      authPassword.value = "";
      authDisplay.value = "";

      setAuth(data.token, data.user);
      await bootstrapAfterLogin();
    } catch (err) {
      authMsg.textContent = err.message || "Không thể hoàn tất yêu cầu";
      authMsg.className = "auth-msg";
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = authMode === "register" ? "Đăng ký" : "Đăng nhập";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await apiFetch(`${API_AUTH}/logout`, { method: "POST" });
    } catch {}
    setAuth(null, null);
    entries = [];
    feedEntries = [];
    conversations = [];
    notifications = [];
    render();
    renderFeed();
    renderConversations();
  });

  async function checkAuthSession() {
    if (!authToken) {
      setAuth(null, null);
      return false;
    }
    try {
      const res = await apiFetch(`${API_AUTH}/me`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAuth(authToken, data.user);
      return true;
    } catch {
      setAuth(null, null);
      return false;
    }
  }

  /* ================================================================
     TABS NAVIGATION
  ================================================================ */
  function switchTab(name, opts = {}) {
    activeTab = name;
    tabBtns.forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".tab-panel").forEach(panel => {
      const on = panel.id === `tab-${name}`;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });

    if (name === "stats") {
      renderChart();
      renderOnThisDay();
      renderMonthlySummary();
    }
    if (name === "diary") {
      if (tabBadgeDiary) { tabBadgeDiary.hidden = true; tabBadgeDiary.textContent = ""; }
      if (opts.highlight) {
        setTimeout(() => {
          const el = entriesList.querySelector(".entry");
          if (el) { el.classList.add("is-new"); setTimeout(() => el.classList.remove("is-new"), 2000); }
        }, 100);
      }
    }
    if (name === "feed") {
      if (tabBadgeFeed) tabBadgeFeed.hidden = true;
      loadFeed();
    }
    if (name === "chat") {
      if (tabBadgeChat) tabBadgeChat.hidden = true;
      loadConversations();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  tabBtns.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  /* ================================================================
     DARK MODE & THEMES
  ================================================================ */
  function applyDark(on) {
    document.documentElement.classList.toggle("dark", on);
    darkToggle.textContent = on ? "☀️" : "🌙";
    localStorage.setItem("dark", on ? "1" : "0");
  }
  function applyTheme(name) {
    document.documentElement.setAttribute("data-theme", name);
    themeDots.forEach(d => d.classList.toggle("is-active", d.dataset.theme === name));
    localStorage.setItem("theme", name);
  }
  applyDark(localStorage.getItem("dark") === "1");
  applyTheme(localStorage.getItem("theme") || "hong");
  darkToggle.addEventListener("click", () => applyDark(!document.documentElement.classList.contains("dark")));
  themeDots.forEach(dot => dot.addEventListener("click", () => applyTheme(dot.dataset.theme)));

  /* ================================================================
     DAILY QUOTE
  ================================================================ */
  quoteText.textContent = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];

  /* ================================================================
     PARTICLES
  ================================================================ */
  (function () {
    const cvs = particlesCvs, ctx = cvs.getContext("2d");
    let W, H, particles;
    function resize() { W = cvs.width = window.innerWidth; H = cvs.height = window.innerHeight; }
    function mk() {
      return {
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 2.5 + 1,
        vx: (Math.random() - 0.5) * 0.4, vy: -Math.random() * 0.5 - 0.2,
        alpha: Math.random() * 0.35 + 0.08
      };
    }
    function init() { resize(); particles = Array.from({ length: 40 }, mk); }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      const color = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#e08aa0";
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        if (p.x < -5) p.x = W + 5;
        if (p.x > W + 5) p.x = -5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.globalAlpha = p.alpha; ctx.fill();
      });
      ctx.globalAlpha = 1; requestAnimationFrame(draw);
    }
    window.addEventListener("resize", resize);
    init(); draw();
  })();

  /* ================================================================
     CONFETTI
  ================================================================ */
  const ctx2d = confettiCvs.getContext("2d");
  let confettiRAF = null;
  function launchConfetti() {
    confettiCvs.width = window.innerWidth; confettiCvs.height = window.innerHeight;
    const pieces = Array.from({ length: 100 }, () => ({
      x: Math.random() * confettiCvs.width, y: Math.random() * -confettiCvs.height,
      r: Math.random() * 7 + 4, d: Math.random() * 50,
      color: ["#e08aa0","#f6a96b","#7b8cc4","#6fb39a","#f4c05a","#c56a82"][Math.floor(Math.random() * 6)],
      tilt: Math.random() * 10 - 10, tiltAngle: 0, tiltSpeed: Math.random() * 0.1 + 0.05,
    }));
    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    let frame = 0;
    function draw() {
      ctx2d.clearRect(0, 0, confettiCvs.width, confettiCvs.height);
      pieces.forEach(p => {
        p.tiltAngle += p.tiltSpeed; p.y += Math.cos(p.d) + 2.5; p.x += Math.sin(frame / 15) * 1.5; p.tilt = Math.sin(p.tiltAngle) * 12;
        ctx2d.beginPath(); ctx2d.lineWidth = p.r / 2; ctx2d.strokeStyle = p.color;
        ctx2d.moveTo(p.x + p.tilt + p.r / 4, p.y); ctx2d.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4); ctx2d.stroke();
      });
      frame++;
      if (frame < 180) confettiRAF = requestAnimationFrame(draw);
      else ctx2d.clearRect(0, 0, confettiCvs.width, confettiCvs.height);
    }
    draw();
  }

  /* ================================================================
     SOUND EFFECTS
  ================================================================ */
  function playSound(type) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      if (type === "save") {
        osc.frequency.setValueAtTime(880, ac.currentTime);
        osc.frequency.setValueAtTime(1100, ac.currentTime + 0.08);
        gain.gain.setValueAtTime(0.18, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
        osc.start(); osc.stop(ac.currentTime + 0.3);
      } else {
        osc.frequency.setValueAtTime(300, ac.currentTime);
        osc.frequency.setValueAtTime(200, ac.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
        osc.start(); osc.stop(ac.currentTime + 0.25);
      }
    } catch {}
  }

  /* ================================================================
     DRAFT MANAGEMENT
  ================================================================ */
  let draftTimer = null;
  function saveDraft() {
    if (!currentUser) return;
    localStorage.setItem(`${DRAFT_KEY}_${currentUser.id}`, JSON.stringify({
      title: titleInput.value, text: textInput.value,
      date: dateInput.value, mood: selectedMood, tags: currentTags.slice(),
    }));
  }
  function loadDraft() {
    if (!currentUser) return;
    try {
      const d = JSON.parse(localStorage.getItem(`${DRAFT_KEY}_${currentUser.id}`));
      if (!d || !d.text) return;
      titleInput.value = d.title || "";
      textInput.value = d.text || "";
      dateInput.value = d.date || todayISO();
      currentTags = Array.isArray(d.tags) ? d.tags : [];
      renderTagList();
      updateWordCount();
      if (d.mood && MOODS[d.mood]) {
        selectedMood = d.mood;
        moodChips.forEach(c => {
          const on = c.dataset.mood === d.mood;
          c.classList.toggle("is-selected", on);
          c.setAttribute("aria-checked", on ? "true" : "false");
        });
      }
    } catch {}
  }
  function clearDraft() {
    if (currentUser) localStorage.removeItem(`${DRAFT_KEY}_${currentUser.id}`);
  }
  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 2500);
  }
  titleInput.addEventListener("input", scheduleDraft);
  textInput.addEventListener("input",  scheduleDraft);

  /* ================================================================
     WORD COUNT
  ================================================================ */
  function updateWordCount() {
    const txt = textInput.value;
    wordCount.textContent = txt.length > 0 ? `${txt.length} ký tự · ${countWords(txt)} từ` : "";
  }
  textInput.addEventListener("input", updateWordCount);

  /* ================================================================
     TAGS
  ================================================================ */
  function renderTagList() {
    tagList.innerHTML = "";
    currentTags.forEach((tag, i) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.innerHTML = `${escapeHtml(tag)}<button type="button" class="tag-remove" aria-label="Xoá">×</button>`;
      chip.querySelector(".tag-remove").addEventListener("click", () => {
        currentTags.splice(i, 1);
        renderTagList();
      });
      tagList.appendChild(chip);
    });
  }
  tagInput.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput.value);
    }
    if (e.key === "Backspace" && tagInput.value === "" && currentTags.length) {
      currentTags.pop();
      renderTagList();
    }
  });
  tagInput.addEventListener("blur", () => addTag(tagInput.value));
  function addTag(raw) {
    const tag = raw.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase();
    if (tag && !currentTags.includes(tag) && currentTags.length < 8) {
      currentTags.push(tag);
      renderTagList();
    }
    tagInput.value = "";
  }

  /* ================================================================
     MOOD PICKER
  ================================================================ */
  moodChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const mood = chip.dataset.mood;
      if (selectedMood === mood) {
        selectedMood = null;
        chip.classList.remove("is-selected");
        chip.setAttribute("aria-checked", "false");
      } else {
        selectedMood = mood;
        moodChips.forEach(c => {
          c.classList.remove("is-selected");
          c.setAttribute("aria-checked", "false");
        });
        chip.classList.add("is-selected");
        chip.setAttribute("aria-checked", "true");
      }
    });
  });

  /* ================================================================
     TOAST MESSAGE
  ================================================================ */
  let msgTimer = null;
  function showMsg(text, isError = false) {
    composerMsg.textContent = text;
    composerMsg.classList.toggle("is-error", isError);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => {
      composerMsg.textContent = "";
      composerMsg.classList.remove("is-error");
    }, 3500);
  }

  /* ================================================================
     SHARE WITH RECIPIENTS SELECTOR
  ================================================================ */
  let shareSearchTimer = null;

  function renderShareList() {
    shareList.innerHTML = "";
    selectedShareUsers.forEach((u, idx) => {
      const chip = document.createElement("span");
      chip.className = "share-chip";
      chip.innerHTML = `👤 ${escapeHtml(u.displayName || u.username)} <button type="button" class="share-chip-remove" aria-label="Bỏ chọn">×</button>`;
      chip.querySelector(".share-chip-remove").addEventListener("click", () => {
        selectedShareUsers.splice(idx, 1);
        renderShareList();
      });
      shareList.appendChild(chip);
    });
  }

  shareInput.addEventListener("input", () => {
    clearTimeout(shareSearchTimer);
    const q = shareInput.value.trim();
    if (!q) {
      shareResults.hidden = true;
      shareResults.innerHTML = "";
      return;
    }
    shareSearchTimer = setTimeout(async () => {
      try {
        const res = await apiFetch(`${API_USERS}/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const users = await res.json();
        const filtered = users.filter(u => !selectedShareUsers.some(s => s.id === u.id));
        if (!filtered.length) {
          shareResults.innerHTML = `<div class="share-result-item" style="color:var(--ink-soft)">Không tìm thấy người dùng</div>`;
        } else {
          shareResults.innerHTML = filtered.map(u => `
            <div class="share-result-item" data-id="${escapeHtml(u.id)}" data-name="${escapeHtml(u.displayName)}" data-user="${escapeHtml(u.username)}">
              <span class="share-result-name">👤 ${escapeHtml(u.displayName)}</span>
              <span class="share-result-user">@${escapeHtml(u.username)}</span>
            </div>
          `).join("");
          shareResults.querySelectorAll(".share-result-item").forEach(item => {
            if (!item.dataset.id) return;
            item.addEventListener("click", () => {
              selectedShareUsers.push({
                id: item.dataset.id,
                displayName: item.dataset.name,
                username: item.dataset.user,
              });
              renderShareList();
              shareInput.value = "";
              shareResults.hidden = true;
              shareResults.innerHTML = "";
            });
          });
        }
        shareResults.hidden = false;
      } catch {}
    }, 250);
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".share-wrap")) {
      shareResults.hidden = true;
    }
    if (!e.target.closest(".user-area")) {
      notifPanel.hidden = true;
    }
    if (!e.target.closest(".chat-search-wrap")) {
      chatUserResults.hidden = true;
    }
  });

  /* ================================================================
     ATTACHMENTS & FILE UPLOAD
  ================================================================ */
  attachBtn.addEventListener("click", () => attachFile.click());

  attachFile.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (attachedMedia.length + files.length > 6) {
      showMsg("Đính kèm tối đa 6 file trong một entry", true);
      attachFile.value = "";
      return;
    }

    attachBtn.disabled = true;
    attachBtn.textContent = "⏳ Đang tải lên...";

    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        showMsg(`File "${file.name}" vượt quá 20MB!`, true);
        continue;
      }
      try {
        const base64 = await readFileAsBase64(file);
        const res = await apiFetch(API_UPLOAD, {
          method: "POST",
          body: JSON.stringify({ data: base64, name: file.name }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Lỗi tải file");
        }
        const media = await res.json();
        attachedMedia.push(media);
        renderAttachPreview();
      } catch (err) {
        showMsg(err.message || "Tải lên thất bại", true);
      }
    }

    attachBtn.disabled = false;
    attachBtn.textContent = "📎 Tải ảnh / video";
    attachFile.value = "";
  });

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderAttachPreview() {
    attachPreview.innerHTML = "";
    attachedMedia.forEach((m, idx) => {
      const item = document.createElement("div");
      item.className = "attach-item";
      if (m.type === "video") {
        item.innerHTML = `
          <div class="attach-thumb-video">🎬</div>
          <button type="button" class="attach-remove" aria-label="Xoá file">×</button>
        `;
      } else {
        item.innerHTML = `
          <img src="${escapeHtml(m.url)}" class="attach-thumb" alt="${escapeHtml(m.name || 'Ảnh')}" />
          <button type="button" class="attach-remove" aria-label="Xoá file">×</button>
        `;
      }
      item.querySelector(".attach-remove").addEventListener("click", () => {
        attachedMedia.splice(idx, 1);
        renderAttachPreview();
      });
      attachPreview.appendChild(item);
    });
  }

  /* ================================================================
     LIGHTBOX / IMAGE MODAL
  ================================================================ */
  function openLightbox(src) {
    imgModalSrc.src = src;
    imgModal.hidden = false;
    imgModal.style.display = "flex";
  }
  function closeLightbox() {
    imgModal.hidden = true;
    imgModal.style.display = "none";
    imgModalSrc.src = "";
  }
  if (imgModalClose) imgModalClose.addEventListener("click", closeLightbox);
  if (imgModal) {
    imgModal.addEventListener("click", (e) => {
      if (e.target.classList.contains("img-modal-backdrop") || e.target === imgModal) {
        closeLightbox();
      }
    });
  }

  /* ================================================================
     SAVE ENTRY
  ================================================================ */
  saveBtn.addEventListener("click", async () => {
    const text  = textInput.value.trim();
    const title = titleInput.value.trim();
    const date  = dateInput.value || todayISO();

    if (!text) {
      showMsg("Viết gì đi đã, đang trống kìa 😅", true);
      textInput.focus();
      return;
    }
    if (!selectedMood) {
      showMsg("Chọn tâm trạng hôm nay đi nè~", true);
      return;
    }

    addTag(tagInput.value);
    const isNew = !editingId;
    const entry = {
      id: editingId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      date,
      mood: selectedMood,
      title,
      text,
      tags: currentTags.slice(),
      sharedWith: selectedShareUsers.map(u => u.id),
      attachments: attachedMedia.slice(),
      createdAt: new Date().toISOString(),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";

    try {
      const res = await apiFetch(API_ENTRIES, {
        method: "POST",
        body: JSON.stringify(entry),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Không lưu được");
      }

      clearDraft();
      const wasEditing = editingId;
      editingId = null;
      resetComposer();

      await loadEntries();
      render();
      renderCalendar();
      updateStreak();

      if (isNew && entry.mood === "vui") launchConfetti();
      playSound("save");

      const shareCount = entry.sharedWith.length;
      const shareMsg = shareCount > 0 ? ` (đã chia sẻ cho ${shareCount} người)` : " (chỉ riêng bạn xem)";
      showMsg(wasEditing ? "Đã cập nhật 💛" : `Đã lưu 💛${shareMsg} — xem lại ở tab Nhật ký`);

      if (tabBadgeDiary) {
        tabBadgeDiary.hidden = false;
        tabBadgeDiary.textContent = "✓";
      }
      setTimeout(() => switchTab("diary", { highlight: true }), 1000);
    } catch (err) {
      showMsg(err.message || "Không lưu được, kiểm tra kết nối server nha.", true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = editingId ? "Cập nhật" : "Lưu lại";
    }
  });

  /* ================================================================
     RESET COMPOSER
  ================================================================ */
  clearBtn.addEventListener("click", () => {
    clearDraft();
    resetComposer();
  });
  cancelEditBtn.addEventListener("click", () => {
    editingId = null;
    resetComposer();
  });

  function resetComposer() {
    titleInput.value = "";
    textInput.value = "";
    dateInput.value = todayISO();
    selectedMood = null;
    currentTags = [];
    selectedShareUsers = [];
    attachedMedia = [];

    renderTagList();
    renderShareList();
    renderAttachPreview();
    updateWordCount();

    moodChips.forEach(c => {
      c.classList.remove("is-selected");
      c.setAttribute("aria-checked", "false");
    });
    composerTitle.textContent = "Hôm nay tui thấy sao?";
    saveBtn.textContent = "Lưu lại";
    cancelEditBtn.hidden = true;
  }

  /* ================================================================
     EDIT & DELETE ENTRY
  ================================================================ */
  async function startEdit(entry) {
    editingId = entry.id;
    composerTitle.textContent = "✏️ Đang sửa entry";
    dateInput.value = entry.date;
    titleInput.value = entry.title || "";
    textInput.value = entry.text;
    currentTags = Array.isArray(entry.tags) ? [...entry.tags] : [];
    attachedMedia = Array.isArray(entry.attachments) ? [...entry.attachments] : [];

    renderTagList();
    renderAttachPreview();
    updateWordCount();

    selectedMood = entry.mood;
    moodChips.forEach(c => {
      const on = c.dataset.mood === entry.mood;
      c.classList.toggle("is-selected", on);
      c.setAttribute("aria-checked", on ? "true" : "false");
    });

    // Populate shared with
    selectedShareUsers = [];
    if (entry.sharedWith && entry.sharedWith.length) {
      try {
        const res = await apiFetch(`${API_USERS}/batch?ids=${encodeURIComponent(entry.sharedWith.join(","))}`);
        if (res.ok) {
          const list = await res.json();
          selectedShareUsers = list;
          renderShareList();
        }
      } catch {}
    } else {
      renderShareList();
    }

    saveBtn.textContent = "Cập nhật";
    cancelEditBtn.hidden = false;
    switchTab("write");
  }

  async function deleteEntry(id) {
    if (!confirm("Xoá entry này nha, không lấy lại được đâu?")) return;
    try {
      const res = await apiFetch(`${API_ENTRIES}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (editingId === id) { editingId = null; resetComposer(); }
      playSound("delete");
      await loadEntries();
      render();
      renderCalendar();
      updateStreak();
    } catch {
      showMsg("Không xoá được, thử lại nha.", true);
    }
  }

  /* ================================================================
     LOAD MY ENTRIES
  ================================================================ */
  async function loadEntries() {
    if (!currentUser) { entries = []; return; }
    try {
      const res = await apiFetch(API_ENTRIES);
      if (!res.ok) throw new Error();
      entries = await res.json();
      if (!Array.isArray(entries)) entries = [];
    } catch {
      entries = [];
    }
  }

  /* ================================================================
     RENDER DIARY TIMELINE
  ================================================================ */
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      filterBtns.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      render();
    });
  });

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    render();
  });

  function render() {
    statTotal.textContent = entries.length;
    statVui.textContent   = entries.filter(e => e.mood === "vui").length;
    statBuc.textContent   = entries.filter(e => e.mood === "buc").length;

    let shown = entries.slice();
    if (activeFilter !== "all") shown = shown.filter(e => e.mood === activeFilter);
    if (searchQuery) {
      shown = shown.filter(e =>
        e.text.toLowerCase().includes(searchQuery) ||
        (e.title || "").toLowerCase().includes(searchQuery) ||
        e.date.includes(searchQuery) ||
        (e.tags || []).some(t => t.toLowerCase().includes(searchQuery.replace(/^#/, "")))
      );
    }
    shown.sort((a, b) => b.date < a.date ? -1 : b.date > a.date ? 1 : (b.createdAt < a.createdAt ? -1 : 1));

    entriesList.innerHTML = "";
    if (!shown.length) {
      emptyState.classList.add("is-show");
      emptyState.textContent = searchQuery
        ? `Không tìm thấy "${searchQuery}" 🔍`
        : entries.length > 0 && activeFilter !== "all"
          ? "Không có entry loại này~"
          : "Chưa có entry nào. Sang tab Viết để bắt đầu nhé 🌱";
    } else {
      emptyState.classList.remove("is-show");
      const frag = document.createDocumentFragment();
      shown.forEach(e => frag.appendChild(buildEntryCard(e)));
      entriesList.appendChild(frag);
    }
  }

  function buildEntryCard(entry) {
    const mood = MOODS[entry.mood] || { emoji: "🙂", label: "" };
    const card = document.createElement("article");
    card.className = "entry";
    card.setAttribute("data-mood", entry.mood);

    const titleHtml = entry.title ? `<h3 class="entry-title handwriting">${escapeHtml(entry.title)}</h3>` : "";
    const tagsHtml  = (entry.tags || []).length
      ? `<div class="entry-tags">${entry.tags.map(t => `<span class="entry-tag">#${escapeHtml(t)}</span>`).join("")}</div>`
      : "";

    // Share badge
    const isShared = Array.isArray(entry.sharedWith) && entry.sharedWith.length > 0;
    const shareBadgeHtml = isShared
      ? `<span class="share-badge">👥 Đã chia sẻ (${entry.sharedWith.length} người)</span>`
      : `<span class="share-badge is-private">🔒 Chỉ mình tôi</span>`;

    // Attachments
    let attachHtml = "";
    if (Array.isArray(entry.attachments) && entry.attachments.length) {
      const isSingle = entry.attachments.length === 1 ? " single" : "";
      attachHtml = `<div class="entry-attachments${isSingle}">` +
        entry.attachments.map(att => {
          if (att.type === "video") {
            return `<div class="entry-attachment-item"><video src="${escapeHtml(att.url)}" controls class="entry-video" preload="metadata"></video></div>`;
          }
          return `<div class="entry-attachment-item"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name || 'Ảnh')}" class="entry-img" loading="lazy" /></div>`;
        }).join("") + `</div>`;
    }

    card.innerHTML = `
      <div class="entry-top">
        <span class="entry-mood" title="${mood.label}">${mood.emoji}</span>
        <span class="entry-date">${escapeHtml(formatDisplayDate(entry.date))}</span>
      </div>
      ${titleHtml}
      <div class="entry-body handwriting">${escapeHtml(entry.text)}</div>
      ${attachHtml}
      ${tagsHtml}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:.6rem;">
        ${shareBadgeHtml}
        <div class="entry-foot" style="margin:0">
          <button type="button" class="btn-edit">✏️ Sửa</button>
          <button type="button" class="btn-delete">🗑️ Xoá</button>
        </div>
      </div>
    `;

    card.querySelector(".btn-edit").addEventListener("click", () => startEdit(entry));
    card.querySelector(".btn-delete").addEventListener("click", () => deleteEntry(entry.id));

    card.querySelectorAll(".entry-img").forEach(img => {
      img.addEventListener("click", () => openLightbox(img.src));
    });

    return card;
  }

  /* ================================================================
     FEED (BẢNG TIN)
  ================================================================ */
  async function loadFeed() {
    if (!currentUser) return;
    try {
      const res = await apiFetch(API_FEED);
      if (!res.ok) throw new Error();
      feedEntries = await res.json();
      if (!Array.isArray(feedEntries)) feedEntries = [];
      renderFeed();
    } catch {
      feedEntries = [];
      renderFeed();
    }
  }

  function renderFeed() {
    feedList.innerHTML = "";
    if (!feedEntries.length) {
      feedEmpty.classList.add("is-show");
      return;
    }
    feedEmpty.classList.remove("is-show");

    const frag = document.createDocumentFragment();
    feedEntries.forEach(entry => {
      const card = document.createElement("article");
      card.className = "entry";
      card.setAttribute("data-mood", entry.mood);

      const mood = MOODS[entry.mood] || { emoji: "🙂", label: "" };
      const titleHtml = entry.title ? `<h3 class="entry-title handwriting">${escapeHtml(entry.title)}</h3>` : "";
      const tagsHtml  = (entry.tags || []).length
        ? `<div class="entry-tags">${entry.tags.map(t => `<span class="entry-tag">#${escapeHtml(t)}</span>`).join("")}</div>`
        : "";

      // Attachments
      let attachHtml = "";
      if (Array.isArray(entry.attachments) && entry.attachments.length) {
        const isSingle = entry.attachments.length === 1 ? " single" : "";
        attachHtml = `<div class="entry-attachments${isSingle}">` +
          entry.attachments.map(att => {
            if (att.type === "video") {
              return `<div class="entry-attachment-item"><video src="${escapeHtml(att.url)}" controls class="entry-video" preload="metadata"></video></div>`;
            }
            return `<div class="entry-attachment-item"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name || 'Ảnh')}" class="entry-img" loading="lazy" /></div>`;
          }).join("") + `</div>`;
      }

      const initial = (entry.ownerName || "?").charAt(0).toUpperCase();

      card.innerHTML = `
        <div class="feed-author-bar">
          <div class="feed-author-info">
            <div class="feed-author-avatar">${escapeHtml(initial)}</div>
            <div>
              <div class="feed-author-name">${escapeHtml(entry.ownerName || "Người dùng")}</div>
              <div style="font-size:.72rem; color:var(--ink-soft);">${escapeHtml(formatTimeAgo(entry.createdAt))}</div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm btn-feed-chat" data-owner="${escapeHtml(entry.ownerId)}">
            💬 Nhắn tin
          </button>
        </div>
        <div class="entry-top">
          <span class="entry-mood" title="${mood.label}">${mood.emoji}</span>
          <span class="entry-date">${escapeHtml(formatDisplayDate(entry.date))}</span>
        </div>
        ${titleHtml}
        <div class="entry-body handwriting">${escapeHtml(entry.text)}</div>
        ${attachHtml}
        ${tagsHtml}
      `;

      card.querySelectorAll(".entry-img").forEach(img => {
        img.addEventListener("click", () => openLightbox(img.src));
      });

      const chatBtn = card.querySelector(".btn-feed-chat");
      chatBtn.addEventListener("click", async () => {
        const otherId = chatBtn.dataset.owner;
        if (!otherId || otherId === currentUser.id) return;
        await startChatWithUser(otherId);
      });

      frag.appendChild(card);
    });
    feedList.appendChild(frag);
  }

  /* ================================================================
     NOTIFICATIONS
  ================================================================ */
  async function loadNotifications() {
    if (!currentUser) return;
    try {
      const [nRes, cRes] = await Promise.all([
        apiFetch(API_NOTIFS),
        apiFetch(`${API_NOTIFS}/unread-count`),
      ]);
      if (nRes.ok) notifications = await nRes.json();
      if (cRes.ok) {
        const countData = await cRes.json();
        const count = countData.count || 0;
        if (count > 0) {
          notifBadge.hidden = false;
          notifBadge.textContent = count > 99 ? "99+" : count;
        } else {
          notifBadge.hidden = true;
          notifBadge.textContent = "0";
        }
      }
      renderNotifications();
    } catch {}
  }

  function renderNotifications() {
    if (!notifications.length) {
      notifPanel.innerHTML = `<div class="notif-empty">Chưa có thông báo nào 🌸</div>`;
      return;
    }
    notifPanel.innerHTML = notifications.map(n => {
      const icon = n.type === "share" ? "🌸" : n.type === "message" ? "💬" : "🔔";
      const unreadClass = !n.read ? " is-unread" : "";
      return `
        <div class="notif-item${unreadClass}" data-id="${escapeHtml(n.id)}" data-type="${escapeHtml(n.type)}" data-ref="${escapeHtml(n.refId || '')}" data-from="${escapeHtml(n.fromId || '')}">
          <span class="notif-icon">${icon}</span>
          <div class="notif-content">
            <div>${escapeHtml(n.message)}</div>
            <div class="notif-meta">${escapeHtml(formatTimeAgo(n.createdAt))}</div>
          </div>
        </div>
      `;
    }).join("");

    notifPanel.querySelectorAll(".notif-item").forEach(item => {
      item.addEventListener("click", async () => {
        const id   = item.dataset.id;
        const type = item.dataset.type;
        const ref  = item.dataset.ref;
        const from = item.dataset.from;

        try {
          await apiFetch(`${API_NOTIFS}/${encodeURIComponent(id)}/read`, { method: "POST" });
        } catch {}
        notifPanel.hidden = true;
        loadNotifications();

        if (type === "share") {
          switchTab("feed");
        } else if (type === "message") {
          switchTab("chat");
          if (ref) openConversation(ref);
          else if (from) startChatWithUser(from);
        }
      });
    });
  }

  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifPanel.hidden = !notifPanel.hidden;
    if (!notifPanel.hidden) loadNotifications();
  });

  /* ================================================================
     CHAT & STREAK
  ================================================================ */
  async function loadConversations() {
    if (!currentUser) return;
    try {
      const res = await apiFetch(API_CONVS);
      if (!res.ok) throw new Error();
      conversations = await res.json();
      if (!Array.isArray(conversations)) conversations = [];
      renderConversations();

      if (activeConvId) {
        const found = conversations.find(c => c.id === activeConvId);
        if (found) {
          activeConv = found;
          updateActiveChatMeta();
        }
      }
    } catch {
      conversations = [];
      renderConversations();
    }
  }

  function renderConversations() {
    convList.innerHTML = "";
    if (!conversations.length) {
      convEmpty.classList.add("is-show");
      return;
    }
    convEmpty.classList.remove("is-show");

    conversations.forEach(c => {
      const item = document.createElement("div");
      const isActive = c.id === activeConvId;
      item.className = `conv-item${isActive ? " is-active" : ""}`;
      item.dataset.id = c.id;

      const initial = (c.otherName || "?").charAt(0).toUpperCase();

      // Streak badge
      let streakBadgeHtml = "";
      if (c.broken && (c.streak > 0 || c.previousStreak > 0)) {
        streakBadgeHtml = `<span class="conv-streak-pill is-broken" title="Chuỗi đã đứt!">💔 Đứt</span>`;
      } else if (c.streak > 0) {
        streakBadgeHtml = `<span class="conv-streak-pill" title="Chuỗi ${c.streak} ngày">🔥 ${c.streak}</span>`;
      }

      item.innerHTML = `
        <div class="conv-avatar">${escapeHtml(initial)}</div>
        <div class="conv-info">
          <div class="conv-top">
            <span class="conv-name">${escapeHtml(c.otherName)}</span>
            ${streakBadgeHtml}
          </div>
          <div class="conv-preview">${c.lastMessageAt ? escapeHtml(formatTimeAgo(c.lastMessageAt)) : "Chưa có tin nhắn"}</div>
        </div>
      `;

      item.addEventListener("click", () => openConversation(c.id));
      convList.appendChild(item);
    });
  }

  async function startChatWithUser(otherUserId) {
    try {
      const res = await apiFetch(API_CONVS, {
        method: "POST",
        body: JSON.stringify({ otherUserId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Không tạo được cuộc trò chuyện");
      }
      const conv = await res.json();
      switchTab("chat");
      await loadConversations();
      openConversation(conv.id);
    } catch (err) {
      alert(err.message || "Không thể bắt đầu trò chuyện");
    }
  }

  // Tìm bạn để nhắn tin trực tiếp trong Chat Sidebar
  let chatSearchTimer = null;
  chatUserSearch.addEventListener("input", () => {
    clearTimeout(chatSearchTimer);
    const q = chatUserSearch.value.trim();
    if (!q) {
      chatUserResults.hidden = true;
      chatUserResults.innerHTML = "";
      return;
    }
    chatSearchTimer = setTimeout(async () => {
      try {
        const res = await apiFetch(`${API_USERS}/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const users = await res.json();
        if (!users.length) {
          chatUserResults.innerHTML = `<div class="share-result-item" style="color:var(--ink-soft)">Không tìm thấy người dùng</div>`;
        } else {
          chatUserResults.innerHTML = users.map(u => `
            <div class="share-result-item" data-id="${escapeHtml(u.id)}">
              <span class="share-result-name">👤 ${escapeHtml(u.displayName)}</span>
              <span class="share-result-user">@${escapeHtml(u.username)}</span>
            </div>
          `).join("");
          chatUserResults.querySelectorAll(".share-result-item").forEach(item => {
            if (!item.dataset.id) return;
            item.addEventListener("click", async () => {
              chatUserResults.hidden = true;
              chatUserSearch.value = "";
              await startChatWithUser(item.dataset.id);
            });
          });
        }
        chatUserResults.hidden = false;
      } catch {}
    }, 250);
  });

  async function openConversation(convId) {
    activeConvId = convId;
    activeConv = conversations.find(c => c.id === convId) || null;

    // Mobile layout toggle
    const chatWrap = $(".chat-wrap");
    if (chatWrap) chatWrap.classList.add("is-chat-open");

    // Highlight sidebar
    $$(".conv-item").forEach(item => {
      item.classList.toggle("is-active", item.dataset.id === convId);
    });

    chatPlaceholder.hidden = true;
    chatInput.disabled = false;
    chatSend.disabled = false;

    updateActiveChatMeta();
    await loadMessages(convId);
    chatInput.focus();
  }

  function updateActiveChatMeta() {
    if (!activeConv) return;

    // Header
    const initial = (activeConv.otherName || "?").charAt(0).toUpperCase();
    chatHeader.innerHTML = `
      <div class="chat-header-user">
        <button type="button" class="icon-btn btn-chat-back" style="display:none; margin-right:.4rem;" aria-label="Quay lại">‹</button>
        <div class="conv-avatar" style="width:34px; height:34px; font-size:.9rem;">${escapeHtml(initial)}</div>
        <div>
          <div class="chat-header-name">${escapeHtml(activeConv.otherName)}</div>
          <div class="chat-header-streak">${activeConv.streak > 0 ? `🔥 Chuỗi ${activeConv.streak} ngày` : "Chưa có chuỗi"}</div>
        </div>
      </div>
    `;

    // Mobile back button
    const backBtn = chatHeader.querySelector(".btn-chat-back");
    if (window.innerWidth <= 768 && backBtn) {
      backBtn.style.display = "inline-flex";
      backBtn.addEventListener("click", () => {
        const chatWrap = $(".chat-wrap");
        if (chatWrap) chatWrap.classList.remove("is-chat-open");
      });
    }

    // Streak banner
    chatStreak.hidden = false;
    if (activeConv.broken) {
      chatStreak.className = "chat-streak chat-streak-broken";
      const restoresLeft = activeConv.restoresLeft !== undefined ? activeConv.restoresLeft : 5;
      chatStreak.innerHTML = `
        <span>💔 <strong>Chuỗi đã đứt</strong> (quá 24g không nhắn tin). Bạn còn <strong>${restoresLeft}/5</strong> lần khôi phục trong tháng này.</span>
        <button type="button" id="btn-restore-streak" class="btn-restore-streak" ${restoresLeft <= 0 ? "disabled" : ""}>
          ${restoresLeft > 0 ? "🔄 Khôi phục chuỗi" : "Hết lượt tháng này"}
        </button>
      `;
      const restoreBtn = $("#btn-restore-streak");
      if (restoreBtn && restoresLeft > 0) {
        restoreBtn.addEventListener("click", restoreCurrentStreak);
      }
    } else if (activeConv.streak > 0) {
      chatStreak.className = "chat-streak chat-streak-active";
      chatStreak.innerHTML = `
        <span>🔥 Đang giữ chuỗi <strong>${activeConv.streak} ngày</strong>! Nhắn tin hôm nay để cùng nhau duy trì chuỗi nhé.</span>
      `;
    } else {
      chatStreak.className = "chat-streak chat-streak-active";
      chatStreak.innerHTML = `
        <span>💬 Hãy nhắn tin cho nhau mỗi ngày để thắp sáng và duy trì chuỗi lửa 🔥!</span>
      `;
    }
  }

  async function restoreCurrentStreak() {
    if (!activeConvId) return;
    const btn = $("#btn-restore-streak");
    if (btn) { btn.disabled = true; btn.textContent = "Đang khôi phục..."; }

    try {
      const res = await apiFetch(`${API_CONVS}/${encodeURIComponent(activeConvId)}/restore`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không khôi phục được");

      activeConv = Object.assign(activeConv || {}, data);
      updateActiveChatMeta();
      await loadConversations();
      launchConfetti();
      playSound("save");
    } catch (err) {
      alert(err.message || "Không thể khôi phục chuỗi");
      if (btn) { btn.disabled = false; btn.textContent = "🔄 Khôi phục chuỗi"; }
    }
  }

  async function loadMessages(convId) {
    if (!convId || convId !== activeConvId) return;
    try {
      const res = await apiFetch(`${API_CONVS}/${encodeURIComponent(convId)}/messages`);
      if (!res.ok) return;
      const msgs = await res.json();
      renderMessages(msgs);
    } catch {}
  }

  function renderMessages(msgs) {
    chatMsgs.innerHTML = "";
    if (!msgs.length) {
      chatMsgs.innerHTML = `<div class="chat-placeholder" style="flex:none; padding:3rem 1rem;">Chưa có tin nhắn nào. Hãy gửi lời chào đầu tiên! 👋</div>`;
      return;
    }
    msgs.forEach(m => {
      const isMine = m.senderId === currentUser.id;
      const wrap = document.createElement("div");
      wrap.className = `chat-bubble-wrap ${isMine ? "mine" : "theirs"}`;
      wrap.innerHTML = `
        <div class="chat-bubble">${escapeHtml(m.text)}</div>
        <div class="chat-bubble-time">${escapeHtml(formatTime(m.createdAt))}</div>
      `;
      chatMsgs.appendChild(wrap);
    });
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text || !activeConvId) return;

    chatInput.value = "";
    chatSend.disabled = true;

    try {
      const res = await apiFetch(`${API_CONVS}/${encodeURIComponent(activeConvId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không gửi được tin nhắn");

      // Cập nhật streak live
      if (activeConv) {
        activeConv.streak = data.streak;
        activeConv.broken = false;
        activeConv.lastMessageAt = new Date().toISOString();
        updateActiveChatMeta();
      }

      await loadMessages(activeConvId);
      loadConversations();
    } catch (err) {
      alert(err.message || "Lỗi gửi tin nhắn");
    } finally {
      chatSend.disabled = false;
      chatInput.focus();
    }
  }

  chatSend.addEventListener("click", sendChatMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  /* ================================================================
     PERSONAL STREAK BADGE
  ================================================================ */
  function updateStreak() {
    const dates = [...new Set(entries.map(e => e.date))].sort().reverse();
    if (!dates.length) {
      streakBadge.hidden = true;
      return;
    }
    let streak = 0, cur = new Date(todayISO() + "T00:00:00");
    for (const d of dates) {
      const dt = new Date(d + "T00:00:00"), diff = Math.round((cur - dt) / 86400000);
      if (diff === 0 || diff === 1) {
        streak++;
        cur = dt;
      } else break;
    }
    streakBadge.hidden = streak < 2;
    if (streak >= 2) streakCount.textContent = streak;
  }

  /* ================================================================
     CALENDAR
  ================================================================ */
  function initCalendar() {
    const now = new Date();
    calYear  = now.getFullYear();
    calMonth = now.getMonth();
    renderCalendar();
  }
  calPrev.addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  calNext.addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
  function renderCalendar() {
    calTitle.textContent = `${MONTHS[calMonth]} ${calYear}`;
    const dateMap = {};
    entries.forEach(e => {
      if (!dateMap[e.date]) dateMap[e.date] = [];
      dateMap[e.date].push(e.mood);
    });
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = todayISO();
    let html = "";
    WEEKDAYS.forEach(d => { html += `<div class="cal-header-cell">${d}</div>`; });
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell cal-blank"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const moods = dateMap[iso] || [], mainMood = moods[0] || "", isToday = iso === today;
      html += `<div class="cal-cell${mainMood ? " cal-has-entry" : ""}${isToday ? " cal-today" : ""}" data-date="${iso}"${moods.length ? ` role="button" tabindex="0"` : ""}>
        <span class="cal-day">${day}</span>${mainMood ? `<span class="cal-mood-dot">${MOODS[mainMood].emoji}</span>` : ""}
      </div>`;
    }
    calGrid.innerHTML = html;
    calGrid.querySelectorAll(".cal-cell.cal-has-entry").forEach(cell => {
      cell.addEventListener("click", () => {
        searchInput.value = cell.dataset.date;
        searchQuery = cell.dataset.date;
        render();
      });
    });
  }

  /* ================================================================
     STATS: CHART
  ================================================================ */
  chartTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      chartRange = tab.dataset.range;
      chartTabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      renderChart();
    });
  });
  function renderChart() {
    const days = chartRange === "week" ? 7 : 30;
    const labels = [], data = { vui: [], buc: [], bthuong: [], binhthuong: [] };
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      labels.push(iso);
      const de = entries.filter(e => e.date === iso);
      Object.keys(data).forEach(m => { data[m].push(de.filter(e => e.mood === m).length); });
    }
    const maxVal = Math.max(1, ...Object.values(data).flat());
    let html = `<div class="chart-bars">`;
    labels.forEach((iso, i) => {
      const d = new Date(iso + "T00:00:00");
      const label = days === 7 ? WEEKDAYS[d.getDay()] : String(d.getDate());
      const stacks = Object.keys(data).map(m => {
        const h = Math.round((data[m][i] / maxVal) * 80);
        return h > 0 ? `<span class="chart-bar-seg" style="height:${h}px;background:var(--${m})" title="${MOODS[m].label}: ${data[m][i]}"></span>` : "";
      }).join("");
      html += `<div class="chart-col"><div class="chart-stack">${stacks || `<span class="chart-bar-empty"></span>`}</div><span class="chart-label">${label}</span></div>`;
    });
    html += `</div>`;
    chartWrap.innerHTML = html;
  }

  /* ================================================================
     STATS: ON THIS DAY
  ================================================================ */
  function renderOnThisDay() {
    const today = todayISO(), mm = today.slice(5);
    const past = entries.filter(e => e.date.slice(5) === mm && e.date !== today);
    if (!past.length) { otdSection.hidden = true; return; }
    otdSection.hidden = false;
    const years = [...new Set(past.map(e => e.date.slice(0, 4)))].sort().reverse();
    otdTitle.textContent = `📅 Ngày này ${years.length > 1 ? "những năm trước" : "năm " + years[0]}`;
    otdList.innerHTML = past.slice(0, 3).map(e => {
      const mood = MOODS[e.mood] || { emoji: "🙂" };
      return `<div class="otd-card" data-mood="${e.mood}">
        <div class="otd-meta">${mood.emoji} <strong>${e.date.slice(0, 4)}</strong></div>
        ${e.title ? `<div class="otd-title">${escapeHtml(e.title)}</div>` : ""}
        <div class="otd-body handwriting">${escapeHtml(e.text.slice(0, 120))}${e.text.length > 120 ? "…" : ""}</div>
      </div>`;
    }).join("");
  }

  /* ================================================================
     STATS: MONTHLY SUMMARY
  ================================================================ */
  function renderMonthlySummary() {
    const now = new Date(), ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = entries.filter(e => e.date.startsWith(ym));
    if (!month.length) {
      summaryEl.innerHTML = `<p class="summary-empty">Tháng này chưa có entry — sang tab Viết để bắt đầu nhé 🌱</p>`;
      return;
    }
    const counts = { vui: 0, buc: 0, bthuong: 0, binhthuong: 0 };
    month.forEach(e => { if (counts[e.mood] !== undefined) counts[e.mood]++; });
    const dayCount = new Set(month.map(e => e.date)).size;
    const topMood = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const dow = [0, 0, 0, 0, 0, 0, 0];
    month.forEach(e => { dow[new Date(e.date + "T00:00:00").getDay()]++; });
    const topDow = dow.indexOf(Math.max(...dow));
    const tagFreq = {};
    month.flatMap(e => e.tags || []).forEach(t => { tagFreq[t] = (tagFreq[t] || 0) + 1; });
    const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 3);
    summaryEl.innerHTML = `
      <div class="summary-grid">
        <div class="summary-item"><span class="summary-big">${dayCount}</span><span class="summary-lbl">ngày đã ghi</span></div>
        <div class="summary-item"><span class="summary-big">${MOODS[topMood[0]].emoji}</span><span class="summary-lbl">tâm trạng chủ đạo</span></div>
        <div class="summary-item"><span class="summary-big">${WEEKDAYS_FULL[topDow].replace("Thứ ", "T")}</span><span class="summary-lbl">hay viết nhất</span></div>
        <div class="summary-item"><span class="summary-big">${counts.vui}</span><span class="summary-lbl">ngày vui 😊</span></div>
        <div class="summary-item"><span class="summary-big">${counts.buc}</span><span class="summary-lbl">ngày bực 😤</span></div>
        <div class="summary-item"><span class="summary-big">${month.length}</span><span class="summary-lbl">lượt ghi</span></div>
      </div>
      ${topTags.length ? `<div class="summary-tags">Tag hay dùng: ${topTags.map(([t]) => `<span class="entry-tag">#${escapeHtml(t)}</span>`).join(" ")}</div>` : ""}`;
  }

  /* ================================================================
     KEYBOARD SHORTCUT
  ================================================================ */
  textInput.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      saveBtn.click();
    }
  });

  /* ================================================================
     EXPORT / IMPORT
  ================================================================ */
  exportBtn.addEventListener("click", () => {
    if (!entries.length) { showMsg("Chưa có gì để tải về~", true); return; }
    const blob = new Blob([JSON.stringify({
      app: "trung-tam-cam-xuc",
      version: 2,
      exportedAt: new Date().toISOString(),
      entries,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `nhat-ky-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showMsg("Đã tải file về 💾");
  });

  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        const imported = Array.isArray(data) ? data : data.entries;
        if (!Array.isArray(imported)) throw new Error();
        let ok = 0;
        for (const en of imported) {
          if (en && en.text && en.mood && MOODS[en.mood]) {
            const res = await apiFetch(API_ENTRIES, {
              method: "POST",
              body: JSON.stringify({
                id: en.id ? String(en.id) : undefined,
                date: en.date || todayISO(),
                mood: String(en.mood),
                title: en.title ? String(en.title) : "",
                text: String(en.text),
                tags: Array.isArray(en.tags) ? en.tags : [],
                sharedWith: Array.isArray(en.sharedWith) ? en.sharedWith : [],
                attachments: Array.isArray(en.attachments) ? en.attachments : [],
                createdAt: en.createdAt || new Date().toISOString(),
              }),
            });
            if (res.ok) ok++;
          }
        }
        await loadEntries();
        render();
        renderCalendar();
        updateStreak();
        showMsg(`Đã nhập ${ok} entry 🎉`);
      } catch {
        showMsg("File không hợp lệ hoặc lỗi kết nối.", true);
      }
      importFile.value = "";
    };
    reader.readAsText(file);
  });

  /* ================================================================
     BACKGROUND POLLING
  ================================================================ */
  function startPolling() {
    stopPolling();
    loadNotifications();
    notifPollInterval = setInterval(loadNotifications, 15000);
    chatPollInterval  = setInterval(() => {
      if (activeTab === "chat" && activeConvId) {
        loadMessages(activeConvId);
      }
    }, 4000);
  }

  function stopPolling() {
    if (notifPollInterval) clearInterval(notifPollInterval);
    if (chatPollInterval) clearInterval(chatPollInterval);
    notifPollInterval = null;
    chatPollInterval  = null;
  }

  /* ================================================================
     BOOTSTRAP
  ================================================================ */
  async function bootstrapAfterLogin() {
    dateInput.value = todayISO();
    await loadEntries();
    render();
    initCalendar();
    updateStreak();
    loadDraft();
    loadNotifications();
    loadFeed();
    loadConversations();
  }

  (async () => {
    dateInput.value = todayISO();
    const hasSession = await checkAuthSession();
    if (hasSession) {
      await bootstrapAfterLogin();
    }
  })();
})();

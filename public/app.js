/* ============================================================
   Trung Tâm Cảm Xúc — app.js
   Tính năng: ghi / sửa / xoá / tìm kiếm / lọc / tag /
              lịch tháng / streak / dark-mode / theme /
              confetti / font chữ tay / PWA service worker
   ============================================================ */
(function () {
  "use strict";

  /* ---- Service Worker ---- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  /* ================================================================
     CONSTANTS & CONFIG
  ================================================================ */
  const MOODS = {
    vui:        { emoji: "😊", label: "Vui" },
    buc:        { emoji: "😤", label: "Bực" },
    bthuong:    { emoji: "😔", label: "Buồn / hụt hẫng" },
    binhthuong: { emoji: "😌", label: "Bình thường" },
  };
  const API = "/api/entries";
  const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const WEEKDAYS_FULL = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const MONTHS = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
                  "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

  /* ================================================================
     DOM HELPERS
  ================================================================ */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  /* ================================================================
     STATE
  ================================================================ */
  let entries      = [];
  let selectedMood = null;
  let activeFilter = "all";
  let searchQuery  = "";
  let editingId    = null;       // id entry đang sửa (null = tạo mới)
  let currentTags  = [];         // tags đang gõ trong composer
  let calYear, calMonth;         // lịch hiện tại

  /* ================================================================
     DOM REFS
  ================================================================ */
  const moodChips    = $$(".mood-chip");
  const dateInput    = $("#entry-date");
  const titleInput   = $("#entry-title");
  const textInput    = $("#entry-text");
  const saveBtn      = $("#save-entry");
  const clearBtn     = $("#clear-entry");
  const cancelEditBtn= $("#cancel-edit");
  const composerMsg  = $("#composer-msg");
  const composerTitle= $("#composer-title");
  const filterBtns   = $$(".filter-btn");
  const entriesList  = $("#entries-list");
  const emptyState   = $("#empty-state");
  const statTotal    = $("#stat-total");
  const statVui      = $("#stat-vui");
  const statBuc      = $("#stat-buc");
  const exportBtn    = $("#export-btn");
  const importBtn    = $("#import-btn");
  const importFile   = $("#import-file");
  const searchInput  = $("#search-input");
  const tagInput     = $("#tag-input");
  const tagList      = $("#tag-list");
  const streakBadge  = $("#streak-badge");
  const streakCount  = $("#streak-count");
  const darkToggle   = $("#dark-toggle");
  const themeDots    = $$(".theme-dot");
  const calPrev      = $("#cal-prev");
  const calNext      = $("#cal-next");
  const calTitle     = $("#cal-title");
  const calGrid      = $("#cal-grid");
  const confettiCvs  = $("#confetti-canvas");

  /* ================================================================
     UTILS
  ================================================================ */
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function formatDisplayDate(iso) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return `${WEEKDAYS_FULL[d.getDay()]}, ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  }
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  /* ================================================================
     DARK MODE & THEME
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
  // Khởi tạo preferences
  applyDark(localStorage.getItem("dark") === "1");
  applyTheme(localStorage.getItem("theme") || "hong");

  darkToggle.addEventListener("click", () => applyDark(!document.documentElement.classList.contains("dark")));
  themeDots.forEach(dot => dot.addEventListener("click", () => applyTheme(dot.dataset.theme)));

  /* ================================================================
     CONFETTI 🎉
  ================================================================ */
  const ctx2d = confettiCvs.getContext("2d");
  let confettiPieces = [];
  let confettiRAF = null;

  function launchConfetti() {
    confettiCvs.width  = window.innerWidth;
    confettiCvs.height = window.innerHeight;
    confettiPieces = Array.from({length: 90}, () => ({
      x: Math.random() * confettiCvs.width,
      y: Math.random() * -confettiCvs.height,
      r: Math.random() * 7 + 4,
      d: Math.random() * 50,
      color: ["#e08aa0","#f6a96b","#7b8cc4","#6fb39a","#f4c05a","#c56a82"][Math.floor(Math.random()*6)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: 0,
      tiltSpeed: Math.random() * 0.1 + 0.05,
    }));
    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    let frame = 0;
    function draw() {
      ctx2d.clearRect(0, 0, confettiCvs.width, confettiCvs.height);
      confettiPieces.forEach(p => {
        p.tiltAngle += p.tiltSpeed;
        p.y += Math.cos(p.d) + 2.5;
        p.x += Math.sin(frame / 15) * 1.5;
        p.tilt = Math.sin(p.tiltAngle) * 12;
        ctx2d.beginPath();
        ctx2d.lineWidth = p.r / 2;
        ctx2d.strokeStyle = p.color;
        ctx2d.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx2d.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx2d.stroke();
      });
      frame++;
      if (frame < 160) confettiRAF = requestAnimationFrame(draw);
      else ctx2d.clearRect(0, 0, confettiCvs.width, confettiCvs.height);
    }
    draw();
  }

  /* ================================================================
     TAG INPUT
  ================================================================ */
  function renderTagList() {
    tagList.innerHTML = "";
    currentTags.forEach((tag, i) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.innerHTML = `${escapeHtml(tag)}<button type="button" class="tag-remove" aria-label="Xoá nhãn ${escapeHtml(tag)}">×</button>`;
      chip.querySelector(".tag-remove").addEventListener("click", () => {
        currentTags.splice(i, 1);
        renderTagList();
      });
      tagList.appendChild(chip);
    });
  }
  tagInput.addEventListener("keydown", (e) => {
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
        moodChips.forEach(c => { c.classList.remove("is-selected"); c.setAttribute("aria-checked","false"); });
        chip.classList.add("is-selected");
        chip.setAttribute("aria-checked","true");
      }
    });
  });

  /* ================================================================
     MESSAGE TOAST
  ================================================================ */
  let msgTimer = null;
  function showMsg(text, isError = false) {
    composerMsg.textContent = text;
    composerMsg.classList.toggle("is-error", isError);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { composerMsg.textContent = ""; composerMsg.classList.remove("is-error"); }, 3500);
  }

  /* ================================================================
     SAVE / EDIT ENTRY
  ================================================================ */
  saveBtn.addEventListener("click", async () => {
    const text  = textInput.value.trim();
    const title = titleInput.value.trim();
    const date  = dateInput.value || todayISO();
    if (!text)         { showMsg("Viết gì đi đã, đang trống kìa 😅", true); textInput.focus(); return; }
    if (!selectedMood) { showMsg("Chọn tâm trạng hôm nay đi nè~", true); return; }

    // flush tag nếu đang gõ dở
    addTag(tagInput.value);

    const entry = {
      id:        editingId || (Date.now().toString(36) + Math.random().toString(36).slice(2,6)),
      date,
      mood:      selectedMood,
      title,
      text,
      tags:      currentTags.slice(),
      createdAt: new Date().toISOString(),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";
    try {
      const res = await fetch(API, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(entry) });
      if (!res.ok) throw new Error("Lỗi lưu");
      resetComposer();
      await loadEntries();
      render();
      renderCalendar();
      updateStreak();
      if (entry.mood === "vui") launchConfetti();
      showMsg(editingId ? "Đã cập nhật — nhẹ lòng hơn chưa? 💛" : "Đã lưu — nhẹ lòng hơn chưa? 💛");
      editingId = null;
    } catch {
      showMsg("Không lưu được, kiểm tra kết nối server nha.", true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = editingId ? "Cập nhật" : "Lưu lại";
    }
  });

  /* ================================================================
     RESET COMPOSER
  ================================================================ */
  clearBtn.addEventListener("click", resetComposer);
  cancelEditBtn.addEventListener("click", () => { editingId = null; resetComposer(); });

  function resetComposer() {
    titleInput.value = "";
    textInput.value  = "";
    dateInput.value  = todayISO();
    selectedMood = null;
    currentTags  = [];
    renderTagList();
    moodChips.forEach(c => { c.classList.remove("is-selected"); c.setAttribute("aria-checked","false"); });
    composerTitle.textContent = "Hôm nay tui thấy sao?";
    saveBtn.textContent = "Lưu lại";
    cancelEditBtn.hidden = true;
  }

  /* ================================================================
     START EDITING AN ENTRY
  ================================================================ */
  function startEdit(entry) {
    editingId = entry.id;
    composerTitle.textContent = "✏️ Đang sửa entry";
    dateInput.value  = entry.date;
    titleInput.value = entry.title || "";
    textInput.value  = entry.text;
    currentTags = entry.tags ? [...entry.tags] : [];
    renderTagList();
    // set mood chip
    selectedMood = entry.mood;
    moodChips.forEach(c => {
      const on = c.dataset.mood === entry.mood;
      c.classList.toggle("is-selected", on);
      c.setAttribute("aria-checked", on ? "true" : "false");
    });
    saveBtn.textContent  = "Cập nhật";
    cancelEditBtn.hidden = false;
    // cuộn lên composer
    $(".composer").scrollIntoView({ behavior:"smooth", block:"start" });
  }

  /* ================================================================
     DELETE ENTRY
  ================================================================ */
  async function deleteEntry(id) {
    if (!confirm("Xoá entry này nha, không lấy lại được đâu?")) return;
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method:"DELETE" });
      if (!res.ok) throw new Error();
      if (editingId === id) { editingId = null; resetComposer(); }
      await loadEntries();
      render();
      renderCalendar();
      updateStreak();
    } catch {
      showMsg("Không xoá được, thử lại nha.", true);
    }
  }

  /* ================================================================
     FILTER & SEARCH
  ================================================================ */
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      filterBtns.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      render();
    });
  });
  searchInput.addEventListener("input", () => { searchQuery = searchInput.value.trim().toLowerCase(); render(); });

  /* ================================================================
     LOAD DATA
  ================================================================ */
  async function loadEntries() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error();
      const data = await res.json();
      entries = Array.isArray(data) ? data : [];
    } catch {
      entries = [];
    }
  }

  /* ================================================================
     STREAK CALCULATOR
  ================================================================ */
  function updateStreak() {
    const dates = [...new Set(entries.map(e => e.date))].sort().reverse();
    if (!dates.length) { streakBadge.hidden = true; return; }
    let streak = 0;
    let cur = new Date(todayISO() + "T00:00:00");
    for (const d of dates) {
      const dt = new Date(d + "T00:00:00");
      const diff = Math.round((cur - dt) / 86400000);
      if (diff === 0 || diff === 1) { streak++; cur = dt; }
      else break;
    }
    if (streak >= 2) {
      streakBadge.hidden = false;
      streakCount.textContent = streak;
    } else {
      streakBadge.hidden = true;
    }
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
  calPrev.addEventListener("click", () => { calMonth--; if (calMonth < 0) { calMonth=11; calYear--; } renderCalendar(); });
  calNext.addEventListener("click", () => { calMonth++; if (calMonth > 11) { calMonth=0; calYear++; } renderCalendar(); });

  function renderCalendar() {
    calTitle.textContent = `${MONTHS[calMonth]} ${calYear}`;
    // map date -> top mood
    const dateMap = {};
    entries.forEach(e => {
      if (!dateMap[e.date]) dateMap[e.date] = [];
      dateMap[e.date].push(e.mood);
    });

    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=CN
    const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    const today = todayISO();

    let html = "";
    // header
    WEEKDAYS.forEach(d => { html += `<div class="cal-header-cell">${d}</div>`; });
    // blank cells before 1st
    for (let i=0; i<firstDay; i++) html += `<div class="cal-cell cal-blank"></div>`;
    // days
    for (let day=1; day<=daysInMonth; day++) {
      const iso = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const moods = dateMap[iso] || [];
      const mainMood = moods[0] || "";
      const isToday  = iso === today;
      html += `<div class="cal-cell${mainMood ? " cal-has-entry" : ""}${isToday ? " cal-today" : ""}" data-date="${iso}" title="${moods.map(m=>MOODS[m]?.emoji).join("")||""}" role="button" tabindex="${moods.length ? 0 : -1}">
        <span class="cal-day">${day}</span>
        ${mainMood ? `<span class="cal-mood-dot mood-dot-${mainMood}">${MOODS[mainMood].emoji}</span>` : ""}
      </div>`;
    }
    calGrid.innerHTML = html;
    // click on a day → filter timeline to that date
    calGrid.querySelectorAll(".cal-cell.cal-has-entry").forEach(cell => {
      cell.addEventListener("click", () => {
        const d = cell.dataset.date;
        searchInput.value = d;
        searchQuery = d;
        render();
        $(".timeline").scrollIntoView({ behavior:"smooth" });
      });
    });
  }

  /* ================================================================
     RENDER TIMELINE + STATS
  ================================================================ */
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
        (e.tags || []).some(t => t.toLowerCase().includes(searchQuery.replace(/^#/,"")))
      );
    }
    shown.sort((a,b) => b.date < a.date ? -1 : b.date > a.date ? 1 : 0);

    entriesList.innerHTML = "";
    if (shown.length === 0) {
      emptyState.classList.add("is-show");
      emptyState.textContent = searchQuery
        ? `Không tìm thấy entry nào với "${searchQuery}" 🔍`
        : entries.length > 0 && activeFilter !== "all"
          ? "Không có entry nào loại này. Đổi bộ lọc thử xem~"
          : "Chưa có entry nào. Viết gì đó đi, bắt đầu từ hôm nay 🌱";
    } else {
      emptyState.classList.remove("is-show");
      const frag = document.createDocumentFragment();
      shown.forEach(e => frag.appendChild(buildEntryCard(e)));
      entriesList.appendChild(frag);
    }
  }

  function buildEntryCard(entry) {
    const mood = MOODS[entry.mood] || { emoji:"🙂", label:"" };
    const card = document.createElement("article");
    card.className = "entry";
    card.setAttribute("data-mood", entry.mood);

    const titleHtml = entry.title
      ? `<h3 class="entry-title handwriting">${escapeHtml(entry.title)}</h3>` : "";
    const tagsHtml = (entry.tags || []).length
      ? `<div class="entry-tags">${entry.tags.map(t=>`<span class="entry-tag">#${escapeHtml(t)}</span>`).join("")}</div>` : "";

    card.innerHTML = `
      <div class="entry-top">
        <span class="entry-mood" title="${mood.label}">${mood.emoji}</span>
        <span class="entry-date">${escapeHtml(formatDisplayDate(entry.date))}</span>
      </div>
      ${titleHtml}
      <div class="entry-body handwriting">${escapeHtml(entry.text)}</div>
      ${tagsHtml}
      <div class="entry-foot">
        <button type="button" class="btn-edit"   data-id="${entry.id}" title="Sửa entry này">✏️ Sửa</button>
        <button type="button" class="btn-delete" data-id="${entry.id}" title="Xoá entry này">🗑️ Xoá</button>
      </div>
    `;
    card.querySelector(".btn-edit").addEventListener("click",   () => startEdit(entry));
    card.querySelector(".btn-delete").addEventListener("click", () => deleteEntry(entry.id));
    return card;
  }

  /* ================================================================
     KEYBOARD SHORTCUTS
  ================================================================ */
  textInput.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); saveBtn.click(); }
  });

  /* ================================================================
     EXPORT / IMPORT
  ================================================================ */
  exportBtn.addEventListener("click", () => {
    if (!entries.length) { showMsg("Chưa có gì để tải về, viết đi đã nè~", true); return; }
    const data = { app:"trung-tam-cam-xuc", version:2, exportedAt:new Date().toISOString(), entries };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `nhat-ky-cam-xuc-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMsg("Đã tải file về máy — cất kỹ nha 💾");
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
        if (!Array.isArray(imported)) throw new Error("Sai định dạng");
        let ok = 0;
        for (const en of imported) {
          if (en && en.id && en.text && en.mood && MOODS[en.mood]) {
            const payload = {
              id: String(en.id), date: en.date || todayISO(),
              mood: String(en.mood), title: en.title ? String(en.title) : "",
              text: String(en.text), tags: Array.isArray(en.tags) ? en.tags : [],
              createdAt: en.createdAt || new Date().toISOString(),
            };
            const res = await fetch(API, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
            if (res.ok) ok++;
          }
        }
        await loadEntries(); render(); renderCalendar(); updateStreak();
        showMsg(`Đã nhập ${ok} entry — chào mừng trở lại! 🎉`);
      } catch { showMsg("File không hợp lệ, kiểm tra lại nha.", true); }
      importFile.value = "";
    };
    reader.readAsText(file);
  });

  /* ================================================================
     BOOT
  ================================================================ */
  (async () => {
    dateInput.value = todayISO();
    await loadEntries();
    render();
    initCalendar();
    updateStreak();
  })();
})();

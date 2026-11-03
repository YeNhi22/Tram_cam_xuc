/* ============================================================
   Trung Tâm Cảm Xúc — nhật ký cảm xúc cá nhân
   Lưu trữ: qua server (API /api/entries) — đồng bộ nhiều thiết bị
   ============================================================ */

(function () {
  "use strict";

  // Đăng ký service worker (cho trải nghiệm app trên điện thoại)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  const MOODS = {
    vui:        { emoji: "😊", label: "Vui" },
    buc:        { emoji: "😤", label: "Bực" },
    bthuong:    { emoji: "😔", label: "Buồn / hụt hẫng" },
    binhthuong: { emoji: "😌", label: "Bình thường" },
  };

  const API = "/api/entries";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

  function formatDisplayDate(iso) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${WEEKDAYS[d.getDay()]}, ${dd}/${mm}/${d.getFullYear()}`;
  }

  function todayISO() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  // ---- Trạng thái ----
  let entries = [];
  let selectedMood = null;
  let activeFilter = "all";

  // ---- DOM refs ----
  const moodChips = $$(".mood-chip");
  const dateInput = $("#entry-date");
  const titleInput = $("#entry-title");
  const textInput = $("#entry-text");
  const saveBtn = $("#save-entry");
  const clearBtn = $("#clear-entry");
  const composerMsg = $("#composer-msg");
  const filterBtns = $$(".filter-btn");
  const entriesList = $("#entries-list");
  const emptyState = $("#empty-state");
  const statTotal = $("#stat-total");
  const statVui = $("#stat-vui");
  const statBuc = $("#stat-buc");
  const exportBtn = $("#export-btn");
  const importBtn = $("#import-btn");
  const importFile = $("#import-file");

  // ---- Data layer (gọi server) ----
  async function loadEntries() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("Lỗi mạng");
      const data = await res.json();
      entries = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn("Không tải được entries:", err);
      entries = [];
    }
  }

  // ---- Chọn tâm trạng ----
  moodChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const mood = chip.dataset.mood;
      if (selectedMood === mood) {
        selectedMood = null;
        chip.classList.remove("is-selected");
        chip.setAttribute("aria-checked", "false");
      } else {
        selectedMood = mood;
        moodChips.forEach((c) => {
          c.classList.remove("is-selected");
          c.setAttribute("aria-checked", "false");
        });
        chip.classList.add("is-selected");
        chip.setAttribute("aria-checked", "true");
      }
    });
  });

  // ---- Thông báo nhỏ ----
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

  // ---- Lưu entry ----
  saveBtn.addEventListener("click", async () => {
    const text = textInput.value.trim();
    const title = titleInput.value.trim();
    const date = dateInput.value || todayISO();

    if (!text) {
      showMsg("Viết gì đi đã, đang trống kìa 😅", true);
      textInput.focus();
      return;
    }
    if (!selectedMood) {
      showMsg("Chọn tâm trạng hôm nay đi nè~", true);
      return;
    }

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: date,
      mood: selectedMood,
      title: title,
      text: text,
      createdAt: new Date().toISOString(),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error("Lỗi lưu");
      resetComposer();
      await loadEntries();
      render();
      showMsg("Đã lưu — nhẹ lòng hơn chưa? 💛");
    } catch (err) {
      showMsg("Không lưu được, kiểm tra kết nối server nha.", true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Lưu lại";
    }
  });

  // ---- Xoá viết (reset form) ----
  clearBtn.addEventListener("click", resetComposer);

  function resetComposer() {
    titleInput.value = "";
    textInput.value = "";
    dateInput.value = todayISO();
    selectedMood = null;
    moodChips.forEach((c) => {
      c.classList.remove("is-selected");
      c.setAttribute("aria-checked", "false");
    });
  }

  // ---- Xoá entry ----
  async function deleteEntry(id) {
    if (!confirm("Xoá entry này nha, không lấy lại được đâu?")) return;
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Lỗi xoá");
      await loadEntries();
      render();
    } catch (err) {
      showMsg("Không xoá được, thử lại nha.", true);
    }
  }

  // ---- Lọc ----
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      filterBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      render();
    });
  });

  // ---- Escape HTML để tránh hiển thị code lạ ----
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---- Render danh sách + thống kê ----
  function render() {
    statTotal.textContent = entries.length;
    statVui.textContent = entries.filter((e) => e.mood === "vui").length;
    statBuc.textContent = entries.filter((e) => e.mood === "buc").length;

    let shown = entries.slice();
    if (activeFilter !== "all") shown = shown.filter((e) => e.mood === activeFilter);
    shown.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

    entriesList.innerHTML = "";
    if (shown.length === 0) {
      emptyState.classList.add("is-show");
      emptyState.textContent =
        entries.length > 0 && activeFilter !== "all"
          ? "Không có entry nào loại này. Đổi bộ lọc thử xem~"
          : "Chưa có entry nào. Viết gì đó đi, bắt đầu từ hôm nay 🌱";
    } else {
      emptyState.classList.remove("is-show");
      const frag = document.createDocumentFragment();
      shown.forEach((entry) => frag.appendChild(buildEntryCard(entry)));
      entriesList.appendChild(frag);
    }
  }

  function buildEntryCard(entry) {
    const mood = MOODS[entry.mood] || { emoji: "🙂", label: "" };
    const card = document.createElement("article");
    card.className = "entry";
    card.setAttribute("data-mood", entry.mood);
    const titleHtml = entry.title
      ? `<h3 class="entry-title">${escapeHtml(entry.title)}</h3>`
      : "";
    card.innerHTML = `
      <div class="entry-top">
        <span class="entry-mood" title="${mood.label}">${mood.emoji}</span>
        <span class="entry-date">${escapeHtml(formatDisplayDate(entry.date))}</span>
      </div>
      ${titleHtml}
      <div class="entry-body">${escapeHtml(entry.text)}</div>
      <div class="entry-foot">
        <button type="button" class="btn-delete" data-id="${entry.id}" title="Xoá entry này">🗑️ Xoá</button>
      </div>
    `;
    card.querySelector(".btn-delete").addEventListener("click", () => deleteEntry(entry.id));
    return card;
  }

  // ---- Phím tắt: Ctrl+Enter để lưu ----
  textInput.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      saveBtn.click();
    }
  });

  // ---- Sao lưu: tải file về máy ----
  exportBtn.addEventListener("click", () => {
    if (entries.length === 0) {
      showMsg("Chưa có gì để tải về, viết đi đã nè~", true);
      return;
    }
    const data = {
      app: "trung-tam-cam-xuc",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: entries,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nhat-ky-cam-xuc-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMsg("Đã tải file về máy — cất kỹ nha 💾");
  });

  // ---- Nhập lại từ file ----
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const imported = Array.isArray(data) ? data : data.entries;
        if (!Array.isArray(imported)) throw new Error("Sai định dạng");
        let ok = 0;
        for (const en of imported) {
          if (en && en.id && en.text && en.mood && MOODS[en.mood]) {
            const payload = {
              id: String(en.id),
              date: en.date || todayISO(),
              mood: String(en.mood),
              title: en.title ? String(en.title) : "",
              text: String(en.text),
              createdAt: en.createdAt || new Date().toISOString(),
            };
            const res = await fetch(API, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (res.ok) ok++;
          }
        }
        await loadEntries();
        render();
        showMsg(`Đã nhập ${ok} entry — chào mừng trở lại! 🎉`);
      } catch (err) {
        showMsg("File không hợp lệ, kiểm tra lại nha.", true);
      }
      importFile.value = "";
    };
    reader.readAsText(file);
  });

  // ---- Khởi động ----
  (async () => {
    dateInput.value = todayISO();
    await loadEntries();
    render();
  })();
})();

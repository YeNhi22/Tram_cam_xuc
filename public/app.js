/* ============================================================
   Trung Tâm Cảm Xúc — app.js  (full features)
   ghi/sửa/xoá · tìm kiếm · tag · lịch · streak · biểu đồ ·
   On This Day · tóm tắt tháng · auto-save nháp · đếm chữ ·
   dark mode · 4 theme · confetti · particles · âm thanh ·
   quote ngẫu nhiên · PIN bảo vệ · PWA
   ============================================================ */
(function () {
  "use strict";

  /* ---- Service Worker ---- */
  if ("serviceWorker" in navigator)
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

  /* ================================================================
     CONSTANTS
  ================================================================ */
  const MOODS = {
    vui:        { emoji:"😊", label:"Vui",          color:"var(--vui)" },
    buc:        { emoji:"😤", label:"Bực",          color:"var(--buc)" },
    bthuong:    { emoji:"😔", label:"Buồn",         color:"var(--bthuong)" },
    binhthuong: { emoji:"😌", label:"Bình thường",  color:"var(--binhthuong)" },
  };
  const API = "/api/entries";
  const WEEKDAYS      = ["CN","T2","T3","T4","T5","T6","T7"];
  const WEEKDAYS_FULL = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
  const MONTHS        = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
                         "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];
  const DRAFT_KEY     = "camxuc_draft";
  const PIN_KEY       = "camxuc_pin";
  const LOCK_KEY      = "camxuc_locked";
  const LOCK_TIMEOUT  = 5 * 60 * 1000; // 5 phút

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

  /* ================================================================
     STATE
  ================================================================ */
  let entries      = [];
  let selectedMood = null;
  let activeFilter = "all";
  let searchQuery  = "";
  let editingId    = null;
  let currentTags  = [];
  let calYear, calMonth;
  let chartRange   = "week";
  let lockTimer    = null;
  let pinBuffer    = "";
  let isSettingPin = false;
  let pinFirst     = "";

  /* ================================================================
     DOM REFS
  ================================================================ */
  const moodChips     = $$(".mood-chip");
  const dateInput     = $("#entry-date");
  const titleInput    = $("#entry-title");
  const textInput     = $("#entry-text");
  const saveBtn       = $("#save-entry");
  const clearBtn      = $("#clear-entry");
  const cancelEditBtn = $("#cancel-edit");
  const composerMsg   = $("#composer-msg");
  const composerTitle = $("#composer-title");
  const wordCount     = $("#word-count");
  const filterBtns    = $$(".filter-btn");
  const entriesList   = $("#entries-list");
  const emptyState    = $("#empty-state");
  const statTotal     = $("#stat-total");
  const statVui       = $("#stat-vui");
  const statBuc       = $("#stat-buc");
  const exportBtn     = $("#export-btn");
  const importBtn     = $("#import-btn");
  const importFile    = $("#import-file");
  const searchInput   = $("#search-input");
  const tagInput      = $("#tag-input");
  const tagList       = $("#tag-list");
  const streakBadge   = $("#streak-badge");
  const streakCount   = $("#streak-count");
  const darkToggle    = $("#dark-toggle");
  const themeDots     = $$(".theme-dot");
  const calPrev       = $("#cal-prev");
  const calNext       = $("#cal-next");
  const calTitle      = $("#cal-title");
  const calGrid       = $("#cal-grid");
  const confettiCvs   = $("#confetti-canvas");
  const particlesCvs  = $("#particles-canvas");
  const chartWrap     = $("#chart-wrap");
  const chartTabs     = $$(".chart-tab");
  const otdSection    = $("#on-this-day");
  const otdList       = $("#otd-list");
  const otdTitle      = $("#otd-title");
  const summaryEl     = $("#summary-content");
  const pinOverlay    = $("#pin-overlay");
  const pinDots       = $("#pin-dots");
  const pinTitle      = $("#pin-title");
  const pinSub        = $("#pin-sub");
  const pinError      = $("#pin-error");
  const pinSetupBtn   = $("#pin-setup-btn");
  const pinToggleBtn  = $("#pin-toggle-btn");
  const quoteText     = $("#quote-text");

  /* ================================================================
     UTILS
  ================================================================ */
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function formatDisplayDate(iso) {
    const d = new Date(iso+"T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return `${WEEKDAYS_FULL[d.getDay()]}, ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function countWords(s) {
    return s.trim() ? s.trim().split(/\s+/).length : 0;
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
  applyDark(localStorage.getItem("dark") === "1");
  applyTheme(localStorage.getItem("theme") || "hong");
  darkToggle.addEventListener("click", () => applyDark(!document.documentElement.classList.contains("dark")));
  themeDots.forEach(dot => dot.addEventListener("click", () => applyTheme(dot.dataset.theme)));

  /* ================================================================
     DAILY QUOTE
  ================================================================ */
  function showQuote() {
    const idx = Math.floor(Date.now() / 86400000) % QUOTES.length;
    quoteText.textContent = QUOTES[idx];
  }

  /* ================================================================
     PARTICLES (hạt bay nhẹ nền)
  ================================================================ */
  (function initParticles() {
    const cvs = particlesCvs;
    const ctx = cvs.getContext("2d");
    let W, H, particles;
    function resize() {
      W = cvs.width  = window.innerWidth;
      H = cvs.height = window.innerHeight;
    }
    function mk() {
      return { x:Math.random()*W, y:Math.random()*H, r:Math.random()*2.5+1,
               vx:(Math.random()-.5)*.4, vy:-Math.random()*.5-.2, alpha:Math.random()*.4+.1 };
    }
    function init() { resize(); particles = Array.from({length:40}, mk); }
    function draw() {
      ctx.clearRect(0,0,W,H);
      // lấy màu primary từ CSS
      const style = getComputedStyle(document.documentElement);
      const color = style.getPropertyValue("--primary").trim() || "#e08aa0";
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -5) { p.y=H+5; p.x=Math.random()*W; }
        if (p.x < -5) p.x=W+5; if (p.x > W+5) p.x=-5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }
    window.addEventListener("resize", () => { resize(); });
    init(); draw();
  })();

  /* ================================================================
     CONFETTI 🎉
  ================================================================ */
  const ctx2d = confettiCvs.getContext("2d");
  let confettiRAF = null;
  function launchConfetti() {
    confettiCvs.width  = window.innerWidth;
    confettiCvs.height = window.innerHeight;
    const pieces = Array.from({length:100}, () => ({
      x:Math.random()*confettiCvs.width, y:Math.random()*-confettiCvs.height,
      r:Math.random()*7+4, d:Math.random()*50,
      color:["#e08aa0","#f6a96b","#7b8cc4","#6fb39a","#f4c05a","#c56a82"][Math.floor(Math.random()*6)],
      tilt:Math.random()*10-10, tiltAngle:0, tiltSpeed:Math.random()*.1+.05,
    }));
    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    let frame=0;
    function draw() {
      ctx2d.clearRect(0,0,confettiCvs.width,confettiCvs.height);
      pieces.forEach(p => {
        p.tiltAngle+=p.tiltSpeed; p.y+=Math.cos(p.d)+2.5;
        p.x+=Math.sin(frame/15)*1.5; p.tilt=Math.sin(p.tiltAngle)*12;
        ctx2d.beginPath(); ctx2d.lineWidth=p.r/2; ctx2d.strokeStyle=p.color;
        ctx2d.moveTo(p.x+p.tilt+p.r/4, p.y);
        ctx2d.lineTo(p.x+p.tilt, p.y+p.tilt+p.r/4); ctx2d.stroke();
      });
      frame++;
      if (frame<180) confettiRAF=requestAnimationFrame(draw);
      else ctx2d.clearRect(0,0,confettiCvs.width,confettiCvs.height);
    }
    draw();
  }

  /* ================================================================
     SOUND — Web Audio API (không cần file âm thanh)
  ================================================================ */
  function playSound(type) {
    try {
      const ac = new (window.AudioContext||window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      if (type === "save") {
        osc.frequency.setValueAtTime(880, ac.currentTime);
        osc.frequency.setValueAtTime(1100, ac.currentTime+.08);
        gain.gain.setValueAtTime(.18, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, ac.currentTime+.3);
        osc.start(); osc.stop(ac.currentTime+.3);
      } else if (type === "delete") {
        osc.frequency.setValueAtTime(300, ac.currentTime);
        osc.frequency.setValueAtTime(200, ac.currentTime+.1);
        gain.gain.setValueAtTime(.12, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, ac.currentTime+.25);
        osc.start(); osc.stop(ac.currentTime+.25);
      }
    } catch {}
  }

  /* ================================================================
     AUTO-SAVE DRAFT
  ================================================================ */
  function saveDraft() {
    const draft = {
      title: titleInput.value,
      text:  textInput.value,
      date:  dateInput.value,
      mood:  selectedMood,
      tags:  currentTags.slice(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }
  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (!d || !d.text) return;
      titleInput.value = d.title || "";
      textInput.value  = d.text  || "";
      dateInput.value  = d.date  || todayISO();
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
  function clearDraft() { localStorage.removeItem(DRAFT_KEY); }
  // Auto-save mỗi 3 giây khi đang gõ
  let draftTimer = null;
  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 3000);
  }
  titleInput.addEventListener("input", scheduleDraft);
  textInput.addEventListener("input",  scheduleDraft);

  /* ================================================================
     WORD COUNT
  ================================================================ */
  function updateWordCount() {
    const txt = textInput.value;
    const chars = txt.length;
    const words = countWords(txt);
    wordCount.textContent = chars > 0 ? `${chars} ký tự · ${words} từ` : "";
  }
  textInput.addEventListener("input", updateWordCount);

  /* ================================================================
     TAG INPUT
  ================================================================ */
  function renderTagList() {
    tagList.innerHTML = "";
    currentTags.forEach((tag,i) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.innerHTML = `${escapeHtml(tag)}<button type="button" class="tag-remove" aria-label="Xoá nhãn">×</button>`;
      chip.querySelector(".tag-remove").addEventListener("click", () => { currentTags.splice(i,1); renderTagList(); });
      tagList.appendChild(chip);
    });
  }
  tagInput.addEventListener("keydown", e => {
    if (e.key==="Enter"||e.key===",") { e.preventDefault(); addTag(tagInput.value); }
    if (e.key==="Backspace"&&tagInput.value===""&&currentTags.length) { currentTags.pop(); renderTagList(); }
  });
  tagInput.addEventListener("blur", () => addTag(tagInput.value));
  function addTag(raw) {
    const tag = raw.trim().replace(/^#+/,"").replace(/\s+/g,"-").toLowerCase();
    if (tag && !currentTags.includes(tag) && currentTags.length<8) { currentTags.push(tag); renderTagList(); }
    tagInput.value = "";
  }

  /* ================================================================
     MOOD PICKER
  ================================================================ */
  moodChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const mood = chip.dataset.mood;
      if (selectedMood===mood) {
        selectedMood=null; chip.classList.remove("is-selected"); chip.setAttribute("aria-checked","false");
      } else {
        selectedMood=mood;
        moodChips.forEach(c => { c.classList.remove("is-selected"); c.setAttribute("aria-checked","false"); });
        chip.classList.add("is-selected"); chip.setAttribute("aria-checked","true");
      }
    });
  });

  /* ================================================================
     TOAST MESSAGE
  ================================================================ */
  let msgTimer=null;
  function showMsg(text, isError=false) {
    composerMsg.textContent=text; composerMsg.classList.toggle("is-error",isError);
    clearTimeout(msgTimer);
    msgTimer=setTimeout(()=>{ composerMsg.textContent=""; composerMsg.classList.remove("is-error"); }, 3500);
  }

  /* ================================================================
     SAVE / UPSERT
  ================================================================ */
  saveBtn.addEventListener("click", async () => {
    const text  = textInput.value.trim();
    const title = titleInput.value.trim();
    const date  = dateInput.value || todayISO();
    if (!text)         { showMsg("Viết gì đi đã, đang trống kìa 😅",true); textInput.focus(); return; }
    if (!selectedMood) { showMsg("Chọn tâm trạng hôm nay đi nè~",true); return; }
    addTag(tagInput.value);
    const isNew = !editingId;
    const entry = {
      id:        editingId || (Date.now().toString(36)+Math.random().toString(36).slice(2,6)),
      date, mood:selectedMood, title, text,
      tags:      currentTags.slice(),
      createdAt: new Date().toISOString(),
    };
    saveBtn.disabled=true; saveBtn.textContent="Đang lưu...";
    try {
      const res = await fetch(API, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(entry) });
      if (!res.ok) throw new Error();
      clearDraft();
      const wasEditing = editingId;
      editingId=null;
      resetComposer();
      await loadEntries();
      render(); renderCalendar(); updateStreak(); renderChart(); renderOnThisDay(); renderMonthlySummary();
      if (isNew && entry.mood==="vui") launchConfetti();
      playSound("save");
      showMsg(wasEditing ? "Đã cập nhật 💛" : "Đã lưu — nhẹ lòng hơn chưa? 💛");
    } catch { showMsg("Không lưu được, kiểm tra kết nối server nha.",true); }
    finally { saveBtn.disabled=false; saveBtn.textContent=editingId?"Cập nhật":"Lưu lại"; }
  });

  /* ================================================================
     RESET COMPOSER
  ================================================================ */
  clearBtn.addEventListener("click", () => { clearDraft(); resetComposer(); });
  cancelEditBtn.addEventListener("click", () => { editingId=null; resetComposer(); });
  function resetComposer() {
    titleInput.value=""; textInput.value=""; dateInput.value=todayISO();
    selectedMood=null; currentTags=[]; renderTagList(); updateWordCount();
    moodChips.forEach(c => { c.classList.remove("is-selected"); c.setAttribute("aria-checked","false"); });
    composerTitle.textContent="Hôm nay tui thấy sao?";
    saveBtn.textContent="Lưu lại"; cancelEditBtn.hidden=true;
  }

  /* ================================================================
     EDIT ENTRY
  ================================================================ */
  function startEdit(entry) {
    editingId=entry.id;
    composerTitle.textContent="✏️ Đang sửa entry";
    dateInput.value=entry.date; titleInput.value=entry.title||""; textInput.value=entry.text;
    currentTags=entry.tags?[...entry.tags]:[];
    renderTagList(); updateWordCount();
    selectedMood=entry.mood;
    moodChips.forEach(c => {
      const on=c.dataset.mood===entry.mood;
      c.classList.toggle("is-selected",on); c.setAttribute("aria-checked",on?"true":"false");
    });
    saveBtn.textContent="Cập nhật"; cancelEditBtn.hidden=false;
    $(".composer").scrollIntoView({behavior:"smooth",block:"start"});
  }

  /* ================================================================
     DELETE ENTRY
  ================================================================ */
  async function deleteEntry(id) {
    if (!confirm("Xoá entry này nha, không lấy lại được đâu?")) return;
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}`,{method:"DELETE"});
      if (!res.ok) throw new Error();
      if (editingId===id) { editingId=null; resetComposer(); }
      playSound("delete");
      await loadEntries();
      render(); renderCalendar(); updateStreak(); renderChart(); renderOnThisDay(); renderMonthlySummary();
    } catch { showMsg("Không xoá được, thử lại nha.",true); }
  }

  /* ================================================================
     FILTER & SEARCH
  ================================================================ */
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      activeFilter=btn.dataset.filter;
      filterBtns.forEach(b=>b.classList.remove("is-active")); btn.classList.add("is-active");
      render();
    });
  });
  searchInput.addEventListener("input", () => { searchQuery=searchInput.value.trim().toLowerCase(); render(); });

  /* ================================================================
     LOAD DATA
  ================================================================ */
  async function loadEntries() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error();
      entries = await res.json();
      if (!Array.isArray(entries)) entries=[];
    } catch { entries=[]; }
  }

  /* ================================================================
     STREAK
  ================================================================ */
  function updateStreak() {
    const dates=[...new Set(entries.map(e=>e.date))].sort().reverse();
    if (!dates.length) { streakBadge.hidden=true; return; }
    let streak=0, cur=new Date(todayISO()+"T00:00:00");
    for (const d of dates) {
      const dt=new Date(d+"T00:00:00");
      const diff=Math.round((cur-dt)/86400000);
      if (diff===0||diff===1) { streak++; cur=dt; } else break;
    }
    streakBadge.hidden=streak<2;
    if (streak>=2) streakCount.textContent=streak;
  }

  /* ================================================================
     CALENDAR
  ================================================================ */
  function initCalendar() {
    const now=new Date(); calYear=now.getFullYear(); calMonth=now.getMonth();
    renderCalendar();
  }
  calPrev.addEventListener("click",()=>{ calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCalendar(); });
  calNext.addEventListener("click",()=>{ calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCalendar(); });
  function renderCalendar() {
    calTitle.textContent=`${MONTHS[calMonth]} ${calYear}`;
    const dateMap={};
    entries.forEach(e=>{ if(!dateMap[e.date]) dateMap[e.date]=[]; dateMap[e.date].push(e.mood); });
    const firstDay=new Date(calYear,calMonth,1).getDay();
    const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
    const today=todayISO();
    let html="";
    WEEKDAYS.forEach(d=>{ html+=`<div class="cal-header-cell">${d}</div>`; });
    for(let i=0;i<firstDay;i++) html+=`<div class="cal-cell cal-blank"></div>`;
    for(let day=1;day<=daysInMonth;day++){
      const iso=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const moods=dateMap[iso]||[];
      const mainMood=moods[0]||"";
      const isToday=iso===today;
      html+=`<div class="cal-cell${mainMood?" cal-has-entry":""}${isToday?" cal-today":""}" data-date="${iso}" ${moods.length?`role="button" tabindex="0"`:""}>`
        +`<span class="cal-day">${day}</span>`
        +(mainMood?`<span class="cal-mood-dot">${MOODS[mainMood].emoji}</span>`:"")
        +`</div>`;
    }
    calGrid.innerHTML=html;
    calGrid.querySelectorAll(".cal-cell.cal-has-entry").forEach(cell=>{
      cell.addEventListener("click",()=>{
        searchInput.value=cell.dataset.date; searchQuery=cell.dataset.date; render();
        $(".timeline").scrollIntoView({behavior:"smooth"});
      });
    });
  }

  /* ================================================================
     CHART — biểu đồ cảm xúc
  ================================================================ */
  chartTabs.forEach(tab=>{
    tab.addEventListener("click",()=>{
      chartRange=tab.dataset.range;
      chartTabs.forEach(t=>t.classList.remove("is-active")); tab.classList.add("is-active");
      renderChart();
    });
  });
  function renderChart() {
    const days = chartRange==="week" ? 7 : 30;
    const labels=[], data={vui:[],buc:[],bthuong:[],binhthuong:[]};
    for(let i=days-1;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
      const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      labels.push(iso);
      const dayEntries=entries.filter(e=>e.date===iso);
      Object.keys(data).forEach(m=>{ data[m].push(dayEntries.filter(e=>e.mood===m).length); });
    }
    const maxVal=Math.max(1,...Object.values(data).flat());
    const BAR_W=Math.max(6, Math.floor((chartWrap.offsetWidth||300)/days)-3);
    let html=`<div class="chart-bars" style="--days:${days}">`;
    labels.forEach((iso,i)=>{
      const d=new Date(iso+"T00:00:00");
      const label= days===7 ? WEEKDAYS[d.getDay()] : String(d.getDate());
      const stacks = Object.keys(data).map(m=>{
        const h=Math.round((data[m][i]/maxVal)*80);
        return h>0?`<span class="chart-bar-seg" style="height:${h}px;background:var(--${m})" title="${MOODS[m].label}: ${data[m][i]}"></span>`:"";
      }).join("");
      html+=`<div class="chart-col" style="width:${BAR_W}px">
        <div class="chart-stack">${stacks||`<span class="chart-bar-empty"></span>`}</div>
        <span class="chart-label">${label}</span>
      </div>`;
    });
    html+=`</div>`;
    chartWrap.innerHTML=html;
  }

  /* ================================================================
     ON THIS DAY
  ================================================================ */
  function renderOnThisDay() {
    const today=todayISO();
    const mm=today.slice(5); // MM-DD
    const past=entries.filter(e=>e.date.slice(5)===mm && e.date!==today);
    if(!past.length) { otdSection.hidden=true; return; }
    otdSection.hidden=false;
    const years=[...new Set(past.map(e=>e.date.slice(0,4)))].sort().reverse();
    otdTitle.textContent=`📅 Ngày này ${years.length>1?"những năm trước":"năm "+years[0]}`;
    otdList.innerHTML=past.slice(0,3).map(e=>{
      const mood=MOODS[e.mood]||{emoji:"🙂"};
      const yr=e.date.slice(0,4);
      return `<div class="otd-card" data-mood="${e.mood}">
        <div class="otd-meta">${mood.emoji} <strong>${yr}</strong></div>
        ${e.title?`<div class="otd-title">${escapeHtml(e.title)}</div>`:""}
        <div class="otd-body handwriting">${escapeHtml(e.text.slice(0,120))}${e.text.length>120?"…":""}</div>
      </div>`;
    }).join("");
  }

  /* ================================================================
     MONTHLY SUMMARY
  ================================================================ */
  function renderMonthlySummary() {
    const now=new Date();
    const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const month=entries.filter(e=>e.date.startsWith(ym));
    if(!month.length) { summaryEl.innerHTML=`<p class="summary-empty">Tháng này chưa có entry nào — bắt đầu viết nhé! 🌱</p>`; return; }
    const counts={vui:0,buc:0,bthuong:0,binhthuong:0};
    month.forEach(e=>{ if(counts[e.mood]!==undefined) counts[e.mood]++; });
    const dayCount=new Set(month.map(e=>e.date)).size;
    const topMood=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    // Ngày viết nhiều nhất trong tuần
    const dayOfWeek=[0,0,0,0,0,0,0];
    month.forEach(e=>{ const dow=new Date(e.date+"T00:00:00").getDay(); dayOfWeek[dow]++; });
    const topDow=dayOfWeek.indexOf(Math.max(...dayOfWeek));
    const allTags=month.flatMap(e=>e.tags||[]);
    const tagFreq={};
    allTags.forEach(t=>{ tagFreq[t]=(tagFreq[t]||0)+1; });
    const topTags=Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,3);
    summaryEl.innerHTML=`
      <div class="summary-grid">
        <div class="summary-item"><span class="summary-big">${dayCount}</span><span class="summary-lbl">ngày đã ghi</span></div>
        <div class="summary-item"><span class="summary-big">${MOODS[topMood[0]].emoji}</span><span class="summary-lbl">tâm trạng chủ đạo</span></div>
        <div class="summary-item"><span class="summary-big">${WEEKDAYS_FULL[topDow].replace("Thứ ","T")}</span><span class="summary-lbl">hay viết nhất</span></div>
        <div class="summary-item"><span class="summary-big">${counts.vui}</span><span class="summary-lbl">ngày vui 😊</span></div>
        <div class="summary-item"><span class="summary-big">${counts.buc}</span><span class="summary-lbl">ngày bực 😤</span></div>
        <div class="summary-item"><span class="summary-big">${month.length}</span><span class="summary-lbl">lượt ghi</span></div>
      </div>
      ${topTags.length?`<div class="summary-tags">Tag hay dùng: ${topTags.map(([t])=>`<span class="entry-tag">#${escapeHtml(t)}</span>`).join(" ")}</div>`:""}
    `;
  }

  /* ================================================================
     PIN / LOCK
  ================================================================ */
  function hasPin() { return !!localStorage.getItem(PIN_KEY); }
  function isLocked() { return localStorage.getItem(LOCK_KEY)==="1"; }
  function lock() { localStorage.setItem(LOCK_KEY,"1"); showPinOverlay("unlock"); }
  function unlock() { localStorage.removeItem(LOCK_KEY); pinOverlay.hidden=true; document.body.style.overflow=""; resetLockTimer(); }
  function resetLockTimer() {
    clearTimeout(lockTimer);
    if (hasPin()) lockTimer=setTimeout(lock, LOCK_TIMEOUT);
  }
  ["click","keydown","touchstart"].forEach(ev=>document.addEventListener(ev,resetLockTimer,{passive:true}));

  function showPinOverlay(mode) {
    pinBuffer=""; isSettingPin=(mode==="set"); pinFirst="";
    pinOverlay.hidden=false; document.body.style.overflow="hidden";
    updatePinDots();
    if (mode==="set") {
      pinTitle.textContent="Đặt PIN mới"; pinSub.textContent="Nhập 4 chữ số";
      pinSetupBtn.textContent="Huỷ"; pinSetupBtn.onclick=()=>{ pinOverlay.hidden=true; document.body.style.overflow=""; };
    } else {
      pinTitle.textContent="Nhập PIN"; pinSub.textContent="Nhật ký đang được bảo vệ";
      pinSetupBtn.textContent="Quên PIN? Xoá PIN"; pinSetupBtn.onclick=()=>{
        if(confirm("Xoá PIN? App sẽ không còn bảo vệ bằng PIN nữa.")) {
          localStorage.removeItem(PIN_KEY); unlock();
        }
      };
    }
    pinError.textContent="";
  }
  function updatePinDots() {
    $$(".pin-dot").forEach((dot,i)=>dot.classList.toggle("filled", i<pinBuffer.length));
  }
  function handlePinKey(k) {
    if (k==="clear") { pinBuffer=""; updatePinDots(); pinError.textContent=""; return; }
    if (k==="del")   { pinBuffer=pinBuffer.slice(0,-1); updatePinDots(); return; }
    if (pinBuffer.length>=4) return;
    pinBuffer+=k; updatePinDots();
    if (pinBuffer.length===4) setTimeout(()=>processPinEntry(), 120);
  }
  function processPinEntry() {
    if (isSettingPin) {
      if (!pinFirst) {
        pinFirst=pinBuffer; pinBuffer=""; updatePinDots();
        pinSub.textContent="Nhập lại để xác nhận"; pinError.textContent="";
      } else {
        if (pinBuffer===pinFirst) {
          localStorage.setItem(PIN_KEY, pinBuffer);
          pinOverlay.hidden=true; document.body.style.overflow="";
          resetLockTimer(); showMsg("Đã đặt PIN thành công 🔒");
        } else {
          pinFirst=""; pinBuffer=""; updatePinDots();
          pinError.textContent="PIN không khớp, thử lại nha.";
          pinSub.textContent="Nhập 4 chữ số";
        }
      }
    } else {
      if (pinBuffer===localStorage.getItem(PIN_KEY)) { unlock(); }
      else { pinBuffer=""; updatePinDots(); pinError.textContent="PIN sai rồi, thử lại nha 🙈"; }
    }
  }
  $$(".pin-key").forEach(btn=>btn.addEventListener("click",()=>handlePinKey(btn.dataset.k)));
  document.addEventListener("keydown", e=>{
    if (pinOverlay.hidden) return;
    if (e.key>="0"&&e.key<="9") handlePinKey(e.key);
    else if (e.key==="Backspace")   handlePinKey("del");
    else if (e.key==="Escape"&&isSettingPin) { pinOverlay.hidden=true; document.body.style.overflow=""; }
  });
  pinToggleBtn.addEventListener("click",()=>{
    if (hasPin()) {
      if (confirm("Xoá PIN bảo vệ?")) { localStorage.removeItem(PIN_KEY); clearTimeout(lockTimer); showMsg("Đã xoá PIN."); pinToggleBtn.textContent="🔒 Đặt PIN"; }
    } else { showPinOverlay("set"); }
  });
  // Cập nhật label nút PIN
  function updatePinBtn() { pinToggleBtn.textContent = hasPin() ? "🔓 Xoá PIN" : "🔒 Đặt PIN"; }

  /* ================================================================
     RENDER TIMELINE + STATS
  ================================================================ */
  function render() {
    statTotal.textContent=entries.length;
    statVui.textContent=entries.filter(e=>e.mood==="vui").length;
    statBuc.textContent=entries.filter(e=>e.mood==="buc").length;
    let shown=entries.slice();
    if (activeFilter!=="all") shown=shown.filter(e=>e.mood===activeFilter);
    if (searchQuery) shown=shown.filter(e=>
      e.text.toLowerCase().includes(searchQuery)||
      (e.title||"").toLowerCase().includes(searchQuery)||
      e.date.includes(searchQuery)||
      (e.tags||[]).some(t=>t.toLowerCase().includes(searchQuery.replace(/^#/,"")))
    );
    shown.sort((a,b)=>b.date<a.date?-1:b.date>a.date?1:0);
    entriesList.innerHTML="";
    if (!shown.length) {
      emptyState.classList.add("is-show");
      emptyState.textContent=searchQuery
        ?`Không tìm thấy entry với "${searchQuery}" 🔍`
        :entries.length>0&&activeFilter!=="all"
          ?"Không có entry nào loại này~"
          :"Chưa có entry nào. Viết gì đó đi, bắt đầu từ hôm nay 🌱";
    } else {
      emptyState.classList.remove("is-show");
      const frag=document.createDocumentFragment();
      shown.forEach(e=>frag.appendChild(buildEntryCard(e)));
      entriesList.appendChild(frag);
    }
  }
  function buildEntryCard(entry) {
    const mood=MOODS[entry.mood]||{emoji:"🙂",label:""};
    const card=document.createElement("article");
    card.className="entry"; card.setAttribute("data-mood",entry.mood);
    const titleHtml=entry.title?`<h3 class="entry-title handwriting">${escapeHtml(entry.title)}</h3>`:"";
    const tagsHtml=(entry.tags||[]).length
      ?`<div class="entry-tags">${entry.tags.map(t=>`<span class="entry-tag">#${escapeHtml(t)}</span>`).join("")}</div>`:"";
    card.innerHTML=`
      <div class="entry-top">
        <span class="entry-mood" title="${mood.label}">${mood.emoji}</span>
        <span class="entry-date">${escapeHtml(formatDisplayDate(entry.date))}</span>
      </div>
      ${titleHtml}
      <div class="entry-body handwriting">${escapeHtml(entry.text)}</div>
      ${tagsHtml}
      <div class="entry-foot">
        <button type="button" class="btn-edit"   data-id="${entry.id}">✏️ Sửa</button>
        <button type="button" class="btn-delete" data-id="${entry.id}">🗑️ Xoá</button>
      </div>`;
    card.querySelector(".btn-edit").addEventListener("click",()=>startEdit(entry));
    card.querySelector(".btn-delete").addEventListener("click",()=>deleteEntry(entry.id));
    return card;
  }

  /* ================================================================
     KEYBOARD SHORTCUTS
  ================================================================ */
  textInput.addEventListener("keydown", e=>{
    if ((e.ctrlKey||e.metaKey)&&e.key==="Enter") { e.preventDefault(); saveBtn.click(); }
  });

  /* ================================================================
     EXPORT / IMPORT
  ================================================================ */
  exportBtn.addEventListener("click",()=>{
    if (!entries.length) { showMsg("Chưa có gì để tải về~",true); return; }
    const blob=new Blob([JSON.stringify({app:"trung-tam-cam-xuc",version:2,exportedAt:new Date().toISOString(),entries},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`nhat-ky-cam-xuc-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showMsg("Đã tải file về máy 💾");
  });
  importBtn.addEventListener("click",()=>importFile.click());
  importFile.addEventListener("change", e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try {
        const data=JSON.parse(ev.target.result);
        const imported=Array.isArray(data)?data:data.entries;
        if (!Array.isArray(imported)) throw new Error();
        let ok=0;
        for (const en of imported) {
          if (en&&en.id&&en.text&&en.mood&&MOODS[en.mood]) {
            const payload={id:String(en.id),date:en.date||todayISO(),mood:String(en.mood),
              title:en.title?String(en.title):"",text:String(en.text),
              tags:Array.isArray(en.tags)?en.tags:[],createdAt:en.createdAt||new Date().toISOString()};
            const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
            if(res.ok) ok++;
          }
        }
        await loadEntries(); render(); renderCalendar(); updateStreak(); renderChart(); renderOnThisDay(); renderMonthlySummary();
        showMsg(`Đã nhập ${ok} entry 🎉`);
      } catch { showMsg("File không hợp lệ.",true); }
      importFile.value="";
    };
    reader.readAsText(file);
  });

  /* ================================================================
     BOOT
  ================================================================ */
  (async ()=>{
    showQuote();
    dateInput.value=todayISO();
    // PIN check
    if (hasPin()&&isLocked()) { showPinOverlay("unlock"); }
    else { resetLockTimer(); }
    updatePinBtn();
    await loadEntries();
    render();
    initCalendar();
    updateStreak();
    renderChart();
    renderOnThisDay();
    renderMonthlySummary();
    loadDraft(); // phục hồi nháp
  })();
})();

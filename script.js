// ===== script.js (Kemas Kini Penuh) =====

// ---------- APP STATE ----------
const APP = {
  currentPage: 'dashboard',
  currentDate: new Date(),
  tasbihCount: 0,
  tasbihTarget: 33,
  currentDhikr: 'subhanallah',
  locationLat: 3.1390, // Default KL
  locationLng: 101.6869,
  locationName: 'Kuala Lumpur',
  checklistData: {}  // key: dateString, value: { subuh:bool, ..., istiqfar:number, selawat:number }
};

// ---------- DHIKR DATA ----------
const dhikrData = {
  subhanallah: { arabic: 'سُبْحَانَ اللَّهِ', target: 33 },
  alhamdulillah: { arabic: 'الْحَمْدُ لِلَّهِ', target: 33 },
  allahuakbar: { arabic: 'اللَّهُ أَكْبَرُ', target: 34 }
};

let doaData = [];
let prayerTimesToday = {};

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', () => {
  setHijriDate();
  getLocation();
  fetchDoaData();
  loadFromStorage();
  renderChecklist();
  updateScoreAndHeart();
  initPWA();
});

// ---------- NAVIGATION ----------
function showPage(pageId) {
  // Sembunyikan semua page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Paparkan page sasaran
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  APP.currentPage = pageId;
  window.scrollTo(0,0);

  // Trigger spesifik ikut page
  if (pageId === 'checklist') {
    renderChecklist();
    updateScoreAndHeart();
  }
}

// ---------- HIJRI CALENDAR ----------
function setHijriDate() {
  try {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    const hijri = new Intl.DateTimeFormat('ms-MY-u-ca-islamic', options).format(APP.currentDate);
    const display = document.getElementById('hijriDateDisplay');
    if(display) display.textContent = hijri + ' H';
  } catch (e) {
    const display = document.getElementById('hijriDateDisplay');
    if(display) display.textContent = APP.currentDate.toLocaleDateString('ms-MY');
  }
}

// ---------- LOKASI TEPAT & SOLAT ----------
function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        APP.locationLat = pos.coords.latitude;
        APP.locationLng = pos.coords.longitude;
        reverseGeocode(APP.locationLat, APP.locationLng);
        fetchPrayerTimes(APP.locationLat, APP.locationLng);
      },
      err => {
        document.getElementById('locationText').textContent = "Kuala Lumpur (Lalai)";
        fetchPrayerTimes(APP.locationLat, APP.locationLng);
      }
    );
  } else {
    fetchPrayerTimes(APP.locationLat, APP.locationLng);
  }
}

async function reverseGeocode(lat, lng) {
  try {
    // API OpenStreetMap untuk lokasi tepat (City, State)
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=ms`);
    const data = await res.json();
    const addr = data.address || {};
    
    const area = addr.suburb || addr.neighbourhood || addr.village || addr.town || "";
    const city = addr.city || addr.county || addr.state_district || "";
    const state = addr.state || "";
    
    const fullAddress = [area, city, state].filter(Boolean).join(', ');
    APP.locationName = fullAddress || data.display_name || 'Lokasi Ditemui';
    
    document.getElementById('locationText').textContent = APP.locationName;
  } catch (e) {
    document.getElementById('locationText').textContent = "Gagal mengesan nama penuh";
  }
}

async function fetchPrayerTimes(lat, lng) {
  try {
    // ✅ Format tarikh YYYY-MM-DD
    const dateStr = APP.currentDate.toISOString().split('T')[0];
    // ✅ Method 17 – Singapore (20° Subuh, 18° Isyak) paling tepat untuk Malaysia
    const res = await fetch(`https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=17`);
    const data = await res.json();
    if (data.code === 200) {
      prayerTimesToday = data.data.timings;
      calculateNextPrayer();
    }
  } catch (e) {
    document.getElementById('nextPrayerName').textContent = "Ralat jadual";
  }
}

function calculateNextPrayer() {
  if (!prayerTimesToday.Fajr) return;
  const now = new Date();
  const prayers = [
    { name: 'Subuh', time: prayerTimesToday.Fajr },
    { name: 'Zohor', time: prayerTimesToday.Dhuhr },
    { name: 'Asar', time: prayerTimesToday.Asr },
    { name: 'Maghrib', time: prayerTimesToday.Maghrib },
    { name: 'Isyak', time: prayerTimesToday.Isha }
  ];

  let next = null;
  for (let p of prayers) {
    let [h, m] = p.time.split(':');
    let pTime = new Date();
    pTime.setHours(parseInt(h), parseInt(m), 0, 0);
    if (pTime > now) {
      next = { name: p.name, timeObj: pTime };
      break;
    }
  }

  // Jika semua solat harini dah lepas, set Subuh esok
  if (!next) {
    // ✅ Guna prayers[0] (waktu Subuh) untuk esok
    let [h, m] = prayers[0].time.split(':');
    let pTime = new Date();
    pTime.setDate(pTime.getDate() + 1);
    pTime.setHours(parseInt(h), parseInt(m), 0, 0);
    next = { name: 'Subuh (Esok)', timeObj: pTime };
  }

  document.getElementById('nextPrayerName').textContent = next.name;

  // Clear existing interval if any
  if (APP.countdownInterval) clearInterval(APP.countdownInterval);

  // Kira detik (Countdown)
  APP.countdownInterval = setInterval(() => {
    const diff = next.timeObj - new Date();
    if (diff <= 0) { 
      clearInterval(APP.countdownInterval);
      fetchPrayerTimes(APP.locationLat, APP.locationLng); // Refresh jadual
      return; 
    }
    const hrs = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    
    document.getElementById('nextPrayerCountdown').textContent = 
      `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }, 1000);
}

// ---------- DOA (MENU GRID & TTS) ----------
async function fetchDoaData() {
  try {
    const response = await fetch('doa.json');
    if (!response.ok) throw new Error('Gagal memuat doa.json');
    doaData = await response.json();
  } catch (err) {
    console.warn('Menggunakan data doa sandaran.');
    doaData = [
      { id: 1, title: "Sayyidul Istighfar", arabic: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ...", translation: "Ya Allah, Engkau adalah Tuhanku...", source: "Sahih al-Bukhari" },
      { id: 2, title: "Selawat al-Fateh", arabic: "اللَّهُمَّ صَلِّ عَلَى سَيِّدِنَا مُحَمَّدٍ الْفَاتِحِ...", translation: "Ya Allah, limpahkan selawat...", source: "Kitab Durrat al-Asrar" }
    ];
  }
  renderDoaGrid();
}

function renderDoaGrid() {
  const container = document.getElementById('doaGrid');
  if (!container) return;
  container.innerHTML = '';
  
  doaData.forEach(doa => {
    container.innerHTML += `
      <div class="doa-card">
        <div class="doa-title"><i class="fa-solid fa-star"></i> ${doa.title}</div>
        <div class="arabic">${doa.arabic}</div>
        <div class="translation">${doa.translation}</div>
        <div class="source"><i class="fa-solid fa-book"></i> ${doa.source}</div>
        <button class="audio-btn" onclick="playTTS(this, '${doa.arabic.replace(/'/g, "\\'")}')" style="margin-top: 15px;">
          <i class="fa-solid fa-volume-high"></i> Dengar Bacaan
        </button>
      </div>
    `;
  });
}

function playTTS(btnElement, textToRead) {
  if (!('speechSynthesis' in window)) {
    showToast('Sistem audio tidak disokong pada peranti ini.');
    return;
  }
  
  // Jika sedang main, kita hentikan
  if (btnElement.classList.contains('playing')) {
    window.speechSynthesis.cancel();
    resetAudioBtn(btnElement);
    return;
  }
  
  // Hentikan sebarang bacaan lain
  window.speechSynthesis.cancel();
  document.querySelectorAll('.audio-btn.playing').forEach(b => resetAudioBtn(b));

  const utterance = new SpeechSynthesisUtterance(textToRead);
  utterance.lang = 'ar-SA';
  utterance.rate = 0.8;

  btnElement.classList.add('playing');
  btnElement.innerHTML = '<i class="fa-solid fa-pause"></i> Sedang Membaca...';

  utterance.onend = () => resetAudioBtn(btnElement);
  utterance.onerror = () => {
    resetAudioBtn(btnElement);
    showToast('Gagal membaca audio.');
  };
  
  window.speechSynthesis.speak(utterance);
}

function resetAudioBtn(btn) {
  btn.classList.remove('playing');
  btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Dengar Bacaan';
}

// ---------- TASBIH ----------
document.getElementById('dhikrSelector')?.addEventListener('click', (e) => {
  if (e.target.classList.contains('dhikr-btn')) {
    const k = e.target.dataset.dhikr;
    document.querySelectorAll('.dhikr-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    APP.currentDhikr = k;
    APP.tasbihTarget = dhikrData[k].target;
    
    document.getElementById('tasbihArabic').textContent = dhikrData[k].arabic;
    document.getElementById('targetDisplay').textContent = APP.tasbihTarget;
    resetTasbih();
  }
});

function countTasbih() {
  APP.tasbihCount++;
  document.getElementById('counterDisplay').textContent = APP.tasbihCount;
  updateProgressRing();
  if (navigator.vibrate) navigator.vibrate(15);
  if (APP.tasbihCount === APP.tasbihTarget) showToast('✅ Sasaran zikir tercapai!');
}

function resetTasbih() {
  APP.tasbihCount = 0;
  document.getElementById('counterDisplay').textContent = '0';
  updateProgressRing();
}

function changeTarget() {
  // ✅ Array sasaran yang sah
  const targets = [33, 100, 500];
  const currentIndex = targets.indexOf(APP.tasbihTarget);
  APP.tasbihTarget = targets[(currentIndex + 1) % targets.length];
  document.getElementById('targetDisplay').textContent = APP.tasbihTarget;
  resetTasbih();
}

function updateProgressRing() {
  const circle = document.getElementById('progressCircle');
  if (!circle) return;
  const circumference = 2 * Math.PI * 88; // 552.9
  const progress = Math.min(APP.tasbihCount / APP.tasbihTarget, 1);
  const offset = circumference * (1 - progress);
  circle.setAttribute('stroke-dasharray', `${circumference - offset} ${circumference}`);
}

// ---------- CHECKLIST & STORAGE ----------
function getDateKey() {
  const d = APP.currentDate;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadFromStorage() {
  const saved = localStorage.getItem('istikamah_checklist');
  APP.checklistData = saved ? JSON.parse(saved) : {};
}

function saveToStorage() {
  localStorage.setItem('istikamah_checklist', JSON.stringify(APP.checklistData));
  updateScoreAndHeart();
}

function getTodayData() {
  const key = getDateKey();
  if (!APP.checklistData[key]) {
    APP.checklistData[key] = {
      subuh: false, zohor: false, asar: false, maghrib: false, isyak: false,
      istiqfar: 0, selawat: 0
    };
    saveToStorage();
  }
  return APP.checklistData[key];
}

function renderChecklist() {
  const container = document.getElementById('checklistContainer');
  if (!container) return;
  const day = getTodayData();
  const solatNames = ['subuh', 'zohor', 'asar', 'maghrib', 'isyak'];

  let html = '<h3 class="section-title">Solat 5 Waktu</h3>';
  solatNames.forEach(p => {
    html += `
      <div class="checklist-item" onclick="toggleSolat('${p}')">
        <div class="check-box ${day[p] ? 'checked' : ''}"><i class="fa-solid fa-check"></i></div>
        <span class="checklist-label ${day[p] ? 'done' : ''}">${p}</span>
      </div>`;
  });

  html += '<h3 class="section-title" style="margin-top:20px;">Zikir Harian</h3>';

  // Istighfar
  html += `
    <div class="checklist-item">
      <span class="checklist-label">Sayyidul Istighfar (3x)</span>
      <div class="counter-row">
        <button class="counter-btn" onclick="changeZikr('istiqfar', -1)">−</button>
        <span class="counter-value">${day.istiqfar || 0}</span>
        <button class="counter-btn" onclick="changeZikr('istiqfar', 1)">+</button>
      </div>
    </div>`;

  // Selawat
  html += `
    <div class="checklist-item">
      <span class="checklist-label">Selawat al-Fateh (7x)</span>
      <div class="counter-row">
        <button class="counter-btn" onclick="changeZikr('selawat', -1)">−</button>
        <span class="counter-value">${day.selawat || 0}</span>
        <button class="counter-btn" onclick="changeZikr('selawat', 1)">+</button>
      </div>
    </div>`;

  container.innerHTML = html;
}

function toggleSolat(prayer) {
  const day = getTodayData();
  day[prayer] = !day[prayer];
  saveToStorage();
  renderChecklist();
}

function changeZikr(type, delta) {
  const day = getTodayData();
  if (typeof day[type] !== 'number') day[type] = 0;
  day[type] = Math.max(0, day[type] + delta);
  saveToStorage();
  renderChecklist();
}

// ---------- GAMIFICATION (SISTEM MATA & HATI) ----------
function updateScoreAndHeart() {
  let totalPoints = 0;
  let todayPoints = 0;
  let fullDays = 0;
  const todayKey = getDateKey();
  const maxScorePerDay = 8; // 5 solat + 1 istiqfar(>=3) + 2 selawat(>=7)

  // Gelung untuk kira semua data sejarah
  Object.entries(APP.checklistData).forEach(([date, data]) => {
    let pts = 0;
    if (data.subuh) pts += 1;
    if (data.zohor) pts += 1;
    if (data.asar) pts += 1;
    if (data.maghrib) pts += 1;
    if (data.isyak) pts += 1;
    if (data.istiqfar >= 3) pts += 1;
    if (data.selawat >= 7) pts += 2;
    
    totalPoints += pts;
    
    if (date === todayKey) {
      todayPoints = pts;
    }

    if (pts === maxScorePerDay) {
      fullDays += 1;
    }
  });

  // Update UI Mata
  const elDashTotal = document.getElementById('dashTotalScore');
  const elTotalScore = document.getElementById('totalScore');
  const elTodayScore = document.getElementById('todayScore');
  
  if (elDashTotal) elDashTotal.textContent = totalPoints;
  if (elTotalScore) elTotalScore.textContent = totalPoints;
  if (elTodayScore) elTodayScore.textContent = todayPoints;

  // Lencana (Badge)
  let badge = '🌱 Permulaan';
  if (totalPoints >= 200) badge = '🌟 Mujahid';
  else if (totalPoints >= 100) badge = '💪 Pejuang';
  else if (totalPoints >= 50) badge = '🌿 Istiqamah';
  
  const elDashBadge = document.getElementById('dashRewardBadge');
  const elRewardBadge = document.getElementById('rewardBadge');
  if (elDashBadge) elDashBadge.textContent = badge;
  if (elRewardBadge) elRewardBadge.textContent = badge;

  // Carta Hati UI (Maksimum 40)
  const percent = Math.min((fullDays / 40) * 100, 100);
  const heartIcon = document.getElementById('heartIcon');
  const progressFill = document.getElementById('heartProgressFill');
  const streakText = document.getElementById('heartStreakText');

  if (heartIcon) {
    if (fullDays >= 40) heartIcon.textContent = '💚';
    else if (fullDays >= 30) heartIcon.textContent = '💛';
    else if (fullDays >= 15) heartIcon.textContent = '🧡';
    else if (fullDays >= 5) heartIcon.textContent = '❤️';
    else heartIcon.textContent = '🤍';
  }
  if (progressFill) progressFill.style.width = percent + '%';
  if (streakText) streakText.textContent = `${fullDays}/40`;
}

// ---------- TOAST ----------
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 3000);
}

// ---------- PWA ----------
function initPWA() {
  if ('serviceWorker' in navigator) {
    const swCode = `self.addEventListener('fetch', e => {});`;
    const blob = new Blob([swCode], { type: 'application/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(() => {});
  }
}

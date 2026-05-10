// ===== script.js (Kemas Kini – Waktu Solat Tepat JAKIM) =====

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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  APP.currentPage = pageId;
  window.scrollTo(0,0);

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

// ---------- LOKASI & SOLAT ----------
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
    const dateStr = APP.currentDate.toISOString().split('T');
    
    // PENYELESAIAN WAKTU SOLAT JAKIM:
    // 1. method=99 : Membenarkan tetapan sudut kustom.
    // 2. methodSettings=18,null,18 : Sudut Subuh 18° dan Isyak 18° (Piawaian terkini JAKIM 2020+).
    // 3. tune=0,1,0,2,1,1,1,1,0 : Minit Ihtiyat (Waktu Berjaga-jaga JAKIM). 
    //    Susunan: Imsak(+0), Subuh(+1), Syuruk(+0), Zohor(+2), Asar(+1), Maghrib(+1), Sunset(+1), Isyak(+1), Midnight(+0)
    const apiUrl = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=99&methodSettings=18,null,18&tune=0,1,0,2,1,1,1,1,0`;
    
    const res = await fetch(apiUrl);
    const data = await res.json();
    if (data.code === 200) {
      prayerTimesToday = data.data.timings;
      
      // Paparkan grid 5 waktu solat
      renderPrayerTimes();
      
      // Kira countdown untuk solat seterusnya
      calculateNextPrayer();
    }
  } catch (e) {
    console.error('Ralat memuat waktu solat:', e);
  }
}

// ---------- PAMERAN 5 WAKTU SOLAT (GRID HIJAU CAIR) ----------
function renderPrayerTimes() {
  if (!prayerTimesToday.Fajr) return;
  const grid = document.getElementById('prayerTimesGrid');
  if (!grid) return;
  
  const prayers = [
    { name: 'Subuh', time: prayerTimesToday.Fajr, icon: 'fa-sun' },
    { name: 'Zohor', time: prayerTimesToday.Dhuhr, icon: 'fa-sun' },
    { name: 'Asar', time: prayerTimesToday.Asr, icon: 'fa-sun' },
    { name: 'Maghrib', time: prayerTimesToday.Maghrib, icon: 'fa-sun' },
    { name: 'Isyak', time: prayerTimesToday.Isha, icon: 'fa-moon' }
  ];

  const now = new Date();
  let nextIndex = -1;
  for (let i = 0; i < prayers.length; i++) {
    let [h, m] = prayers[i].time.split(':');
    let pTime = new Date();
    pTime.setHours(parseInt(h), parseInt(m), 0, 0);
    if (pTime > now) {
      nextIndex = i;
      break;
    }
  }
  if (nextIndex === -1) nextIndex = 0; // Subuh esok

  let html = '';
  prayers.forEach((p, index) => {
    const isNext = (index === nextIndex);
    html += `
      <div class="prayer-time-item ${isNext ? 'next-prayer' : ''}">
        <i class="fa-solid ${p.icon} prayer-icon"></i>
        <span class="prayer-name">${p.name}</span>
        <span class="prayer-time">${p.time}</span>
        ${isNext ? '<div style="font-size: 0.6rem; margin-top: 2px; opacity: 0.9;">⬅ Seterusnya</div>' : ''}
      </div>
    `;
  });
  grid.innerHTML = html;
}

// ---------- COUNTDOWN (SOLAT SETERUSNYA) ----------
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

  if (!next) {
    let [h, m] = prayers.time.split(':');
    let pTime = new Date();
    pTime.setDate(pTime.getDate() + 1);
    pTime.setHours(parseInt(h), parseInt(m), 0, 0);
    next = { name: 'Subuh (Esok)', timeObj: pTime };
  }

  const nameElement = document.getElementById('nextPrayerName');
  if (nameElement) nameElement.textContent = next.name;

  if (APP.countdownInterval) clearInterval(APP.countdownInterval);

  APP.countdownInterval = setInterval(() => {
    const diff = next.timeObj - new Date();
    if (diff <= 0) { 
      clearInterval(APP.countdownInterval);
      fetchPrayerTimes(APP.locationLat, APP.locationLng);
      return; 
    }
    const hrs = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    
    const countdownElement = document.getElementById('nextPrayerCountdown');
    if (countdownElement) {
      countdownElement.textContent = 
        `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }
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
  
  if (btnElement.classList.contains('playing')) {
    window.speechSynthesis.cancel();
    resetAudioBtn(btnElement);
    return;
  }
  
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
  const targets =''; // <- Masukkan semula di sini
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
    
    if (date === todayKey) todayPoints = pts;
    if (pts === maxScorePerDay) fullDays += 1;
  });

  document.getElementById('dashTotalScore') && (document.getElementById('dashTotalScore').textContent = totalPoints);
  document.getElementById('totalScore') && (document.getElementById('totalScore').textContent = totalPoints);
  document.getElementById('todayScore') && (document.getElementById('todayScore').textContent = todayPoints);

  let badge = '🌱 Permulaan';
  if (totalPoints >= 200) badge = '🌟 Mujahid';
  else if (totalPoints >= 100) badge = '💪 Pejuang';
  else if (totalPoints >= 50) badge = '🌿 Istiqamah';
  
  document.getElementById('dashRewardBadge') && (document.getElementById('dashRewardBadge').textContent = badge);
  document.getElementById('rewardBadge') && (document.getElementById('rewardBadge').textContent = badge);

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
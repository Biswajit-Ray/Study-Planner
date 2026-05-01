let subjects = JSON.parse(localStorage.getItem('sm-subjects') || '[]');
let selectedConf = 'low';
let pomoInterval = null;
let pomoSeconds = 25 * 60;
let pomoBreak = false;
let pomoRunning = false;
let pomoSessionCount = parseInt(localStorage.getItem('sm-pomo-sessions') || '0');
let schedule = JSON.parse(localStorage.getItem('sm-schedule') || 'null');

const CONF_COLORS = { low: '#e87a7a', mid: '#e8c97a', high: '#7ae8b8' };
const CONF_EMOJIS = { low: '😬', mid: '😐', high: '😎' };
const CONF_WEIGHT = { low: 3, mid: 2, high: 1 };

const QUOTES = [
  "The secret of getting ahead is getting started.",
  "It always seems impossible until it's done.",
  "Study hard, for the well is deep and our brains are shallow.",
  "You don't have to be great to start, but you have to start to be great.",
  "The expert in anything was once a beginner.",
  "Discipline is the bridge between goals and accomplishment.",
];

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('quote-bar').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('start-date').value = today;
  document.getElementById('sub-date').min = today;
  renderSubjects();
  if (schedule) restoreSchedule();
  updatePomoUI();
});

// ── Theme ──
function toggleTheme() {
  document.body.classList.toggle('light');
  document.querySelector('.dark-toggle').textContent = document.body.classList.contains('light') ? '🌙 Dark' : '☀ Light';
}

// ── Confidence ──
function selectConf(btn) {
  document.querySelectorAll('.conf-btn').forEach(b => b.className = 'conf-btn');
  selectedConf = btn.dataset.val;
  btn.classList.add('active-' + (selectedConf === 'low' ? 'low' : selectedConf === 'mid' ? 'mid' : 'high'));
}

// ── Add Subject ──
function addSubject() {
  const name = document.getElementById('sub-name').value.trim();
  const date = document.getElementById('sub-date').value;
  if (!name) return toast('Please enter a subject name.', '⚠');
  if (!date) return toast('Please pick an exam date.', '⚠');
  if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase()))
    return toast('Subject already added.', '⚠');
  subjects.push({ id: Date.now(), name, date, conf: selectedConf });
  save();
  renderSubjects();
  document.getElementById('sub-name').value = '';
  document.getElementById('sub-date').value = '';
  toast(`"${name}" added!`, '✓');
}

function removeSubject(id) {
  subjects = subjects.filter(s => s.id !== id);
  save();
  renderSubjects();
}

function renderSubjects() {
  const el = document.getElementById('subject-list');
  if (!subjects.length) {
    el.innerHTML = '<div class="empty-msg">No subjects yet — add at least 3 to generate a plan.</div>';
    return;
  }
  const sorted = [...subjects].sort((a, b) => new Date(a.date) - new Date(b.date));
  el.innerHTML = sorted.map(s => {
    const daysLeft = Math.ceil((new Date(s.date) - new Date()) / 86400000);
    const urgency = daysLeft <= 2 ? 'color:var(--red)' : daysLeft <= 5 ? 'color:var(--accent)' : '';
    return `<div class="subject-tag">
      <div>
        <div class="s-name">${s.name}</div>
        <div class="s-meta" style="${urgency}">${formatDate(s.date)} · ${daysLeft < 0 ? 'past' : daysLeft === 0 ? 'Today!' : daysLeft + 'd left'}</div>
      </div>
      <div class="s-right">
        <span style="font-size:1.2rem">${CONF_EMOJIS[s.conf]}</span>
        <button class="btn btn-del" onclick="removeSubject(${s.id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Generate Schedule ──
function generateSchedule() {
  if (subjects.length < 3) return toast('Add at least 3 subjects first.', '⚠');
  const startDateVal = document.getElementById('start-date').value;
  const hoursPerDay = parseFloat(document.getElementById('hours-day').value) || 4;
  if (!startDateVal) return toast('Set a start date.', '⚠');

  const startDate = new Date(startDateVal);
  startDate.setHours(0, 0, 0, 0);

  // Sort subjects: closer exam + lower confidence = higher priority
  const sorted = [...subjects].sort((a, b) => {
    const dA = (new Date(a.date) - startDate) / 86400000;
    const dB = (new Date(b.date) - startDate) / 86400000;
    const scoreA = dA / CONF_WEIGHT[a.conf];
    const scoreB = dB / CONF_WEIGHT[b.conf];
    return scoreA - scoreB;
  });

  // Find last exam date
  const lastExam = sorted.reduce((max, s) => new Date(s.date) > max ? new Date(s.date) : max, startDate);
  const totalDays = Math.ceil((lastExam - startDate) / 86400000) + 1;

  // Assign hours per subject: weight by confidence + proximity
  const totalWeight = sorted.reduce((sum, s) => {
    const days = Math.max(1, Math.ceil((new Date(s.date) - startDate) / 86400000));
    return sum + CONF_WEIGHT[s.conf] * (1 / days) * 10;
  }, 0);

  const subjectHours = {};
  sorted.forEach(s => {
    const days = Math.max(1, Math.ceil((new Date(s.date) - startDate) / 86400000));
    const weight = CONF_WEIGHT[s.conf] * (1 / days) * 10;
    subjectHours[s.id] = Math.max(1, Math.round((weight / totalWeight) * hoursPerDay * totalDays * 0.8));
  });

  // Build daily plan
  const days = [];
  for (let d = 0; d < totalDays; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];

    // Find subjects valid for this day (exam not yet passed)
    const validSubs = sorted.filter(s => {
      const examDate = new Date(s.date);
      examDate.setHours(0, 0, 0, 0);
      return examDate >= date;
    });

    if (!validSubs.length) continue;

    // Pick 1-2 subjects for the day, prioritizing urgent + weak
    const sessions = [];
    let hoursLeft = hoursPerDay;

    // Rotate priority by day to avoid monotony
    const rotated = [...validSubs].sort((a, b) => {
      const dA = Math.max(1, Math.ceil((new Date(a.date) - date) / 86400000));
      const dB = Math.max(1, Math.ceil((new Date(b.date) - date) / 86400000));
      const pA = CONF_WEIGHT[a.conf] / dA;
      const pB = CONF_WEIGHT[b.conf] / dB;
      return pB - pA;
    });

    // Primary: highest priority
    const primary = rotated[0];
    const primaryHours = Math.min(Math.ceil(hoursLeft * 0.65), 3);
    sessions.push({ subject: primary, hours: primaryHours });
    hoursLeft -= primaryHours;

    // Secondary if time left and more than 1 valid subject
    if (rotated.length > 1 && hoursLeft >= 1) {
      const secondary = rotated[1];
      sessions.push({ subject: secondary, hours: Math.min(hoursLeft, 2) });
    }

    days.push({ date: dateStr, sessions });
  }

  schedule = { days, generated: Date.now() };
  localStorage.setItem('sm-schedule', JSON.stringify(schedule));
  save();
  renderSchedule(days);
  document.getElementById('pomodoro-section').style.display = 'block';
  document.getElementById('schedule-section').classList.add('visible');
  document.getElementById('schedule-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast('Plan generated! Let\'s go 🚀', '');
}

function restoreSchedule() {
  if (!schedule) return;
  renderSchedule(schedule.days);
  document.getElementById('pomodoro-section').style.display = 'block';
  document.getElementById('schedule-section').classList.add('visible');
}

function renderSchedule(days) {
  const out = document.getElementById('schedule-output');
  const savedDone = JSON.parse(localStorage.getItem('sm-done') || '{}');
  let totalSessions = 0, doneSessions = 0;

  const html = days.map((day, di) => {
    const dayLabel = formatDate(day.date, true);
    const sessionsHtml = day.sessions.map((sess, si) => {
      const key = `${di}-${si}`;
      const done = !!savedDone[key];
      if (done) doneSessions++;
      totalSessions++;
      const color = CONF_COLORS[sess.subject.conf];
      return `<div class="session-item ${done ? 'done' : ''}" style="border-left-color:${color}" id="sess-${key}">
        <input type="checkbox" class="session-done-cb" ${done ? 'checked' : ''} onchange="markDone('${key}', this)">
        <span class="s-subject">${sess.subject.name}</span>
        <span class="s-conf">${CONF_EMOJIS[sess.subject.conf]}</span>
        <span class="s-duration">${sess.hours}h</span>
      </div>`;
    }).join('');

    return `<div class="day-block" style="animation-delay:${di * 0.04}s">
      <div class="day-header">
        <span class="day-label">${dayLabel}</span>
        <span>${day.sessions.reduce((a, s) => a + s.hours, 0)}h total</span>
      </div>
      <div class="day-sessions">${sessionsHtml}</div>
    </div>`;
  }).join('');

  out.innerHTML = html;
  updateProgress(doneSessions, totalSessions);
}

function markDone(key, cb) {
  const saved = JSON.parse(localStorage.getItem('sm-done') || '{}');
  saved[key] = cb.checked;
  localStorage.setItem('sm-done', JSON.stringify(saved));
  const el = document.getElementById(`sess-${key}`);
  if (el) el.classList.toggle('done', cb.checked);

  // Recount
  const all = document.querySelectorAll('.session-done-cb');
  const done = [...all].filter(c => c.checked).length;
  updateProgress(done, all.length);

  if (cb.checked) toast('Session marked done! 🎯', '');
}

function updateProgress(done, total) {
  document.getElementById('progress-text').textContent = `${done} / ${total}`;
  const pct = total ? (done / total) * 100 : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
}

function clearSchedule() {
  schedule = null;
  localStorage.removeItem('sm-schedule');
  localStorage.removeItem('sm-done');
  document.getElementById('schedule-section').classList.remove('visible');
  document.getElementById('pomodoro-section').style.display = 'none';
  setTimeout(() => { document.getElementById('schedule-output').innerHTML = ''; }, 300);
  toast('Plan cleared.', '');
}

// ── Copy Plan ──
function copyPlan() {
  if (!schedule) return;
  let text = '📚 STUDY PLAN — StudyMap\n\n';
  schedule.days.forEach(day => {
    text += `${formatDate(day.date, true)}\n`;
    day.sessions.forEach(s => {
      text += `  • ${s.subject.name} — ${s.hours}h ${CONF_EMOJIS[s.subject.conf]}\n`;
    });
    text += '\n';
  });
  navigator.clipboard.writeText(text).then(() => toast('Plan copied to clipboard! 📋', ''));
}

// ── Pomodoro ──
function startPomo() {
  if (pomoRunning) return;
  pomoRunning = true;
  document.querySelectorAll('.pomo-btn')[0].classList.add('active');
  pomoInterval = setInterval(() => {
    pomoSeconds--;
    if (pomoSeconds <= 0) {
      clearInterval(pomoInterval);
      pomoRunning = false;
      document.querySelectorAll('.pomo-btn')[0].classList.remove('active');
      if (!pomoBreak) {
        pomoSessionCount++;
        localStorage.setItem('sm-pomo-sessions', pomoSessionCount);
        document.getElementById('pomo-sessions').textContent = `Sessions completed today: ${pomoSessionCount}`;
        pomoBreak = true;
        pomoSeconds = 5 * 60;
        toast('Work session done! Take a 5-min break. ☕', '');
      } else {
        pomoBreak = false;
        pomoSeconds = 25 * 60;
        toast('Break over! Back to work. 💪', '');
      }
      updatePomoUI();
    }
    updatePomoUI();
  }, 1000);
}

function pausePomo() {
  if (!pomoRunning) return;
  pomoRunning = false;
  clearInterval(pomoInterval);
  document.querySelectorAll('.pomo-btn')[0].classList.remove('active');
}

function resetPomo() {
  pausePomo();
  pomoBreak = false;
  pomoSeconds = 25 * 60;
  updatePomoUI();
}

function updatePomoUI() {
  const mins = Math.floor(pomoSeconds / 60).toString().padStart(2, '0');
  const secs = (pomoSeconds % 60).toString().padStart(2, '0');
  document.getElementById('pomo-display').textContent = `${mins}:${secs}`;
  document.getElementById('pomo-display').className = 'pomo-display' + (pomoBreak ? ' break' : '');
  document.getElementById('pomo-label').textContent = pomoBreak ? 'Break Time ☕' : 'Work Session';
  document.getElementById('pomo-sessions').textContent = `Sessions completed today: ${pomoSessionCount}`;
}

// ── Utils ──
function formatDate(dateStr, long = false) {
  const d = new Date(dateStr + 'T00:00:00');
  if (long) {
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function save() {
  localStorage.setItem('sm-subjects', JSON.stringify(subjects));
}

let toastTimer;
function toast(msg, icon = '✓') {
  const el = document.getElementById('toast');
  el.textContent = (icon ? icon + ' ' : '') + msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}


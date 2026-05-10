let subjects = JSON.parse(localStorage.getItem('sm-subjects') || '[]');
    let schedule = JSON.parse(localStorage.getItem('sm-schedule') || 'null');
    let selectedConf = 'low';
    let pomoSeconds = 25 * 60;
    let pomoInterval = null;
    let pomoBreak = false;

    const CONF_COLORS = { low: '#e87a7a', mid: '#e8c97a', high: '#7ae8b8' };
    const CONF_EMOJIS = { low: '😬', mid: '😐', high: '😎' };
    
    const QUOTES_DB = [
        { text: "Arise, awake, and stop not until the goal is reached.", author: "Swami Vivekananda" },
        { text: "Education is the manifestation of the perfection already in man.", author: "Swami Vivekananda" },
        { text: "Everything comes to us that belongs to us if we create the capacity to receive it.", author: "Rabindranath Tagore" },
        { text: "Reach high, for stars lie hidden in your soul. Dream deep, for every dream precedes the goal.", author: "Rabindranath Tagore" },
        { text: "Ignorance is the curse of God; knowledge is the wing wherewith we fly to heaven.", author: "William Shakespeare" },
        { text: "It always seems impossible until it's done!.", author: "Nelson Mandela" },
        { text: "The mind is everything. What you think you become.", author: "Buddha" },
        { text: "The more that you read, the more things you will know.", author: "Dr. Seuss" }
    ];

    document.addEventListener('DOMContentLoaded', () => {
        if (localStorage.getItem('sm-theme') === 'light') toggleTheme(true);
        document.getElementById('quick-notes').value = localStorage.getItem('sm-notes') || '';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('start-date').value = today;
        document.getElementById('sub-date').min = today;
        renderSubjects();
        if (schedule) {
            document.getElementById('schedule-section').classList.add('visible');
            document.getElementById('pomodoro-section').style.display = 'block';
            renderSchedule();
        }
        newQuote();
    });

    function toggleTheme(init = false) {
        const isLight = init ? true : document.body.classList.toggle('light');
        if (init) document.body.classList.add('light');
        localStorage.setItem('sm-theme', document.body.classList.contains('light') ? 'light' : 'dark');
        document.getElementById('theme-btn').textContent = document.body.classList.contains('light') ? '🌙 Dark' : '☀ Light';
    }

    function selectConf(btn) {
        document.querySelectorAll('.conf-btn').forEach(b => b.classList.remove('active-low', 'active-mid', 'active-high'));
        selectedConf = btn.dataset.val;
        btn.classList.add('active-' + selectedConf);
    }

    function addSubject() {
        const name = document.getElementById('sub-name').value.trim();
        const date = document.getElementById('sub-date').value;
        if (!name || !date) return toast("Fill all fields", "⚠");
        subjects.push({ id: Date.now(), name, date, conf: selectedConf });
        localStorage.setItem('sm-subjects', JSON.stringify(subjects));
        renderSubjects();
        document.getElementById('sub-name').value = '';
        toast("Subject added!", "✓");
    }

    function removeSubject(id) {
        subjects = subjects.filter(s => s.id !== id);
        localStorage.setItem('sm-subjects', JSON.stringify(subjects));
        renderSubjects();
    }

    function renderSubjects() {
        const list = document.getElementById('subject-list');
        if (!subjects.length) {
            list.innerHTML = `<p style="text-align:center; color:var(--muted); font-size:0.8rem; margin:10px 0;">No subjects added.</p>`;
            return;
        }
        list.innerHTML = subjects.map(s => `
            <div class="subject-tag">
                <div>
                    <div style="font-weight:700; font-size:0.9rem;">${s.name}</div>
                    <div style="font-size:0.75rem; color:var(--muted);">${s.date}</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span>${CONF_EMOJIS[s.conf]}</span>
                    <button class="btn btn-del" onclick="removeSubject(${s.id})">✕</button>
                </div>
            </div>
        `).join('');
    }

    function generateSchedule() {
        if (subjects.length < 2) return toast("Add at least 2 subjects", "⚠");
        const startStr = document.getElementById('start-date').value;
        let hrs = parseInt(document.getElementById('hours-day').value) || 4;
        hrs = Math.min(14, Math.max(1, hrs));

        const startDate = new Date(startStr);
        const sorted = [...subjects].sort((a,b) => new Date(a.date) - new Date(b.date));
        const lastExam = new Date(sorted[sorted.length-1].date);
        const totalDays = Math.ceil((lastExam - startDate) / 86400000) + 1;

        const days = [];
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dStr = d.toISOString().split('T')[0];
            const valid = sorted.filter(s => new Date(s.date) >= d);
            if (valid.length === 0) continue;
            const primaryHrs = Math.ceil(hrs * 0.7);
            const secondaryHrs = hrs - primaryHrs;
            const sessions = [{ name: valid[0].name, conf: valid[0].conf, hrs: primaryHrs }];
            if (valid.length > 1 && secondaryHrs > 0) sessions.push({ name: valid[1].name, conf: valid[1].conf, hrs: secondaryHrs });
            days.push({ date: dStr, sessions });
        }

        schedule = { days };
        localStorage.setItem('sm-schedule', JSON.stringify(schedule));
        localStorage.removeItem('sm-done');
        document.getElementById('schedule-section').classList.add('visible');
        document.getElementById('pomodoro-section').style.display = 'block';
        renderSchedule();
        toast("Plan generated! 🚀", "✓");
    }

    function renderSchedule() {
        const out = document.getElementById('schedule-output');
        const doneMap = JSON.parse(localStorage.getItem('sm-done') || '{}');
        let total = 0, doneCount = 0;
        if (!schedule) return;
        out.innerHTML = schedule.days.map((day, di) => {
            const sessions = day.sessions.map((s, si) => {
                const id = `${di}-${si}`;
                const isDone = !!doneMap[id];
                total++; if(isDone) doneCount++;
                return `
                    <div class="session-item ${isDone ? 'done' : ''}" style="border-left-color:${CONF_COLORS[s.conf]}">
                        <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleDone('${id}', this)">
                        <span style="flex:1; font-weight:700;">${s.name}</span>
                        <span style="font-family:'DM Mono'; font-size:0.8rem; color:var(--muted);">${s.hrs}h</span>
                    </div>
                `;
            }).join('');
            return `<div class="day-block"><div class="day-header"><span>${day.date}</span></div><div>${sessions}</div></div>`;
        }).join('');
        updateProgress(doneCount, total);
    }

    function toggleDone(id, cb) {
        const doneMap = JSON.parse(localStorage.getItem('sm-done') || '{}');
        doneMap[id] = cb.checked;
        localStorage.setItem('sm-done', JSON.stringify(doneMap));
        renderSchedule();
        if (cb.checked) toast("Session marked done! 🎯", "✓");
    }

    function updateProgress(done, total) {
        const textEl = document.getElementById('progress-text');
        const fillEl = document.getElementById('progress-fill');
        if(textEl) textEl.textContent = `${done} / ${total}`;
        if(fillEl) fillEl.style.width = (total === 0 ? 0 : (done / total) * 100) + '%';
    }

    function saveNotes() { localStorage.setItem('sm-notes', document.getElementById('quick-notes').value); }

    function copyPlan() {
        let text = "📚 MY STUDY PLAN\n\n";
        schedule.days.forEach(d => {
            text += `${d.date}\n`;
            d.sessions.forEach(s => text += ` - ${s.name} (${s.hrs}h)\n`);
            text += "\n";
        });
        const dummy = document.createElement("textarea");
        document.body.appendChild(dummy);
        dummy.value = text;
        dummy.select();
        document.execCommand("copy");
        document.body.removeChild(dummy);
        toast("Plan copied! 📋", "");
    }

    function newQuote() {
        const q = QUOTES_DB[Math.floor(Math.random() * QUOTES_DB.length)];
        document.getElementById('main-quote').textContent = `"${q.text}"`;
        document.getElementById('main-author').textContent = `— ${q.author}`;
    }

    function toast(msg, icon) {
        const t = document.getElementById('toast');
        t.textContent = `${icon} ${msg}`;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
    }

    function togglePomo() {
        if (pomoInterval) {
            clearInterval(pomoInterval);
            pomoInterval = null;
            document.getElementById('pomo-run-btn').textContent = '▶ Start';
        } else {
            document.getElementById('pomo-run-btn').textContent = '⏸ Pause';
            pomoInterval = setInterval(() => {
                pomoSeconds--;
                if (pomoSeconds <= 0) {
                    pomoBreak = !pomoBreak;
                    pomoSeconds = (pomoBreak ? 5 : 25) * 60;
                    toast(pomoBreak ? "Break time!" : "Work session!", "⏰");
                }
                updatePomoUI();
            }, 1000);
        }
    }

    function resetPomo() {
        clearInterval(pomoInterval);
        pomoInterval = null;
        pomoSeconds = 25 * 60;
        pomoBreak = false;
        document.getElementById('pomo-run-btn').textContent = '▶ Start';
        updatePomoUI();
    }

    function updatePomoUI() {
        const m = Math.floor(pomoSeconds / 60).toString().padStart(2, '0');
        const s = (pomoSeconds % 60).toString().padStart(2, '0');
        document.getElementById('pomo-display').textContent = `${m}:${s}`;
        document.getElementById('pomo-display').className = 'pomo-display' + (pomoBreak ? ' break' : '');
        document.getElementById('pomo-label').textContent = pomoBreak ? 'Break' : 'Focus';
    }

    function clearSchedule() {
        localStorage.removeItem('sm-schedule');
        schedule = null;
        document.getElementById('schedule-section').classList.remove('visible');
        toast("Plan cleared", "✕");
    }
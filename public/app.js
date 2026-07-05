const DOM = {
    views: {
        auth: document.getElementById('view-auth'),
        admin: document.getElementById('view-admin'),
        voting: document.getElementById('view-voting')
    }
};

const State = {
    currentPoll: null, voterIin: null, timerInterval: null
};

function switchView(viewId) {
    Object.keys(DOM.views).forEach(key => {
        DOM.views[key].classList.toggle('hidden', key !== viewId);
        DOM.views[key].classList.toggle('active', key === viewId);
    });
}

const AuthModule = {
    init() {
        if (localStorage.getItem('adminToken')) switchView('admin');

        document.getElementById('tab-voter').onclick = () => this.toggleRole('voter');
        document.getElementById('tab-admin').onclick = () => this.toggleRole('admin');

        // Admin Auth
        document.getElementById('btn-admin-auth').onclick = async () => {
            const iin = document.getElementById('admin-iin').value;
            const res = await fetch('/api/admin/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({iin}) });
            if (res.ok) {
                document.getElementById('admin-iin').classList.add('hidden');
                document.getElementById('btn-admin-auth').classList.add('hidden');
                document.getElementById('admin-otp-block').classList.remove('hidden');
            } else alert((await res.json()).error);
        };

        document.getElementById('btn-admin-verify').onclick = async () => {
            const res = await fetch('/api/admin/verify', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
                iin: document.getElementById('admin-iin').value,
                otp: document.getElementById('admin-otp').value
            })});
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('adminToken', data.token);
                switchView('admin');
                AdminModule.loadPolls();
            } else alert(data.error);
        };

        // Voter Auth
        document.getElementById('btn-voter-auth').onclick = async () => {
            const code = document.getElementById('voter-code').value;
            const iin = document.getElementById('voter-iin').value;
            const res = await fetch('/api/voter/auth', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({code, iin}) });
            if (res.ok) {
                State.voterIin = iin;
                document.getElementById('voter-code').classList.add('hidden');
                document.getElementById('voter-iin').classList.add('hidden');
                document.getElementById('btn-voter-auth').classList.add('hidden');
                document.getElementById('voter-otp-block').classList.remove('hidden');
            } else alert((await res.json()).error);
        };

        document.getElementById('btn-voter-verify').onclick = async () => {
            const res = await fetch('/api/voter/verify', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
                iin: State.voterIin, code: document.getElementById('voter-code').value, otp: document.getElementById('voter-otp').value
            })});
            const data = await res.json();
            if (data.poll) {
                State.currentPoll = data.poll;
                VotingModule.renderPoll();
                switchView('voting');
            } else alert(data.error);
        };
    },
    toggleRole(role) {
        document.getElementById('tab-voter').classList.toggle('active', role === 'voter');
        document.getElementById('tab-admin').classList.toggle('active', role === 'admin');
        document.getElementById('form-voter').classList.toggle('hidden', role !== 'voter');
        document.getElementById('form-admin').classList.toggle('hidden', role !== 'admin');
    }
};

const AdminModule = {
    init() {
        document.getElementById('btn-logout').onclick = () => { localStorage.removeItem('adminToken'); window.location.reload(); };
        document.getElementById('btn-test-vote').onclick = () => {
            document.getElementById('btn-back-admin').classList.remove('hidden');
            switchView('voting');
        };
        document.getElementById('btn-back-admin').onclick = () => {
            document.getElementById('btn-back-admin').classList.add('hidden');
            switchView('admin');
        };

        // Admin Navigation
        document.getElementById('nav-active').onclick = () => this.switchNav('active');
        document.getElementById('nav-create').onclick = () => this.switchNav('create');

        document.getElementById('btn-add-question').onclick = () => this.addCard();
        document.getElementById('btn-create-poll').onclick = () => this.createPoll();

        this.addCard(); // Init first card
        if(localStorage.getItem('adminToken')) this.loadPolls();
    },

    switchNav(tab) {
        document.getElementById('nav-active').classList.toggle('active', tab === 'active');
        document.getElementById('nav-create').classList.toggle('active', tab === 'create');
        document.getElementById('subview-active').classList.toggle('hidden', tab !== 'active');
        document.getElementById('subview-create').classList.toggle('hidden', tab !== 'create');
        if(tab === 'active') this.loadPolls();
    },

    async loadPolls() {
        const res = await fetch('/api/admin/polls', { headers: { 'Authorization': localStorage.getItem('adminToken') } });
        if (!res.ok) return;
        const data = await res.json();
        const container = document.getElementById('active-polls-list');
        container.innerHTML = data.polls.length ? '' : '<p>Нет активных голосований.</p>';
        
        data.polls.forEach(poll => {
            const status = Date.now() > poll.deadline ? '<span style="color:red">Завершен</span>' : '<span style="color:green">Активен</span>';
            container.innerHTML += `
                <div class="poll-item">
                    <h3>Код доступа: ${poll.code}</h3>
                    <p>Статус: ${status} | Дедлайн: ${new Date(poll.deadline).toLocaleString('ru-RU')}</p>
                </div>
            `;
        });
    },

    addCard() {
        const container = document.getElementById('questions-container');
        const card = document.createElement('div');
        card.className = 'gf-card';
        card.innerHTML = `
            <div class="gf-header">
                <input type="text" placeholder="Вопрос без заголовка" class="q-title" required>
                <select class="q-type">
                    <option value="radio">Один из списка</option>
                    <option value="text">Текст (абзац)</option>
                </select>
            </div>
            <div class="gf-options">
                <div class="gf-option-row">
                    <span>○</span><input type="text" value="Вариант 1" class="q-option">
                </div>
            </div>
            <button class="outline-btn btn-add-opt" style="width: auto; padding: 5px 10px; margin-top: 10px;">Добавить вариант</button>
            <div style="text-align: right; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;">
                <button class="delete-btn btn-del-card">🗑 Удалить</button>
            </div>
        `;

        card.querySelector('.q-type').onchange = (e) => {
            card.querySelector('.gf-options').style.display = e.target.value === 'text' ? 'none' : 'flex';
            card.querySelector('.btn-add-opt').style.display = e.target.value === 'text' ? 'none' : 'inline-block';
        };

        card.querySelector('.btn-add-opt').onclick = () => {
            const optDiv = document.createElement('div');
            optDiv.className = 'gf-option-row';
            optDiv.innerHTML = `<span>○</span><input type="text" placeholder="Новый вариант" class="q-option"><button class="delete-btn btn-del-opt">×</button>`;
            optDiv.querySelector('.btn-del-opt').onclick = () => optDiv.remove();
            card.querySelector('.gf-options').appendChild(optDiv);
        };

        card.querySelector('.btn-del-card').onclick = () => card.remove();
        container.appendChild(card);
    },

    async createPoll() {
        const dateVal = document.getElementById('poll-date').value;
        const timeVal = document.getElementById('poll-time').value;
        if (!dateVal || !timeVal) return alert('Укажите и дату, и время окончания');
        const deadline = new Date(`${dateVal}T${timeVal}`).getTime();

        const questions = Array.from(document.querySelectorAll('.gf-card')).map(card => ({
            title: card.querySelector('.q-title').value.trim(),
            type: card.querySelector('.q-type').value,
            options: card.querySelector('.q-type').value === 'text' ? [] : Array.from(card.querySelectorAll('.q-option')).map(i => i.value.trim()).filter(Boolean)
        }));

        const res = await fetch('/api/admin/polls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': localStorage.getItem('adminToken') },
            body: JSON.stringify({ deadline, questions })
        });

        if (res.ok) {
            const data = await res.json();
            const msg = document.getElementById('admin-message');
            msg.innerHTML = `Опрос создан! Код для избирателей: <b>${data.code}</b>`;
            msg.classList.remove('hidden');
            setTimeout(() => this.switchNav('active'), 2500);
        }
    }
};

const VotingModule = {
    renderPoll() {
        const container = document.getElementById('poll-questions');
        container.innerHTML = '';
        if (!State.currentPoll) return;

        State.currentPoll.questions.forEach((q, i) => {
            const card = document.createElement('div');
            card.className = 'gf-card';
            let html = `<h3>${q.title}</h3><div class="gf-options">`;
            if (q.type === 'radio') {
                q.options.forEach(opt => { html += `<label><input type="radio" name="q_${i}" value="${opt}"> ${opt}</label>`; });
            } else {
                html += `<textarea name="q_${i}" rows="3" placeholder="Ваш ответ..."></textarea>`;
            }
            card.innerHTML = html + `</div>`;
            container.appendChild(card);
        });
        
        this.startTimer();
        document.getElementById('btn-submit-vote').onclick = () => this.submitVote();
    },

    startTimer() {
        clearInterval(State.timerInterval);
        State.timerInterval = setInterval(() => {
            const diff = State.currentPoll.deadline - Date.now();
            if (diff <= 0) {
                clearInterval(State.timerInterval);
                document.getElementById('time-left').innerText = "ЗАВЕРШЕНО";
                document.getElementById('poll-questions').style.opacity = '0.5';
                document.getElementById('poll-questions').style.pointerEvents = 'none';
                return;
            }
            const h = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
            const m = String(Math.floor((diff / 1000 / 60) % 60)).padStart(2, '0');
            const s = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
            document.getElementById('time-left').innerText = `${h}:${m}:${s}`;
        }, 1000);
    },

    async submitVote() {
        const answers = {};
        State.currentPoll.questions.forEach((q, i) => {
            const input = q.type === 'radio' ? document.querySelector(`input[name="q_${i}"]:checked`) : document.querySelector(`textarea[name="q_${i}"]`);
            answers[`q_${i}`] = input ? input.value : null;
        });

        const res = await fetch('/api/voter/vote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pollId: State.currentPoll.id, iin: State.voterIin, answers })
        });
        if (res.ok) { alert('Голос учтен'); window.location.reload(); }
        else alert((await res.json()).error);
    }
};

document.addEventListener('DOMContentLoaded', () => { AuthModule.init(); AdminModule.init(); });
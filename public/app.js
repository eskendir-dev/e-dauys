// public/app.js

const DOM = {
    views: {
        auth: document.getElementById('view-auth'),
        admin: document.getElementById('view-admin'),
        voting: document.getElementById('view-voting')
    }
};

const State = {
    currentPoll: null,
    voterIin: null
};

// Навигация
function switchView(viewId) {
    Object.values(DOM.views).forEach(v => v.classList.remove('active'));
    DOM.views[viewId].classList.add('active');
}

// Модуль Авторизации
const AuthModule = {
    init() {
        const token = localStorage.getItem('adminToken');
        if (token) switchView('admin');

        document.getElementById('tab-admin').onclick = () => this.toggleTab('admin');
        document.getElementById('tab-voter').onclick = () => this.toggleTab('voter');

        // Админ
        document.getElementById('btn-admin-auth').onclick = async () => {
            const iin = document.getElementById('admin-iin').value;
            await fetch('/api/admin/login', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ iin })
            });
            document.getElementById('admin-otp-block').classList.remove('hidden');
        };

        document.getElementById('btn-admin-verify').onclick = async () => {
            const iin = document.getElementById('admin-iin').value;
            const otp = document.getElementById('admin-otp').value;
            const res = await fetch('/api/admin/verify', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ iin, otp })
            });
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('adminToken', data.token);
                switchView('admin');
            } else {
                alert(data.error);
            }
        };

        // Избиратель
        document.getElementById('btn-voter-auth').onclick = async () => {
            const code = document.getElementById('voter-code').value;
            const iin = document.getElementById('voter-iin').value;
            const res = await fetch('/api/voter/auth', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ code, iin })
            });
            if (res.ok) {
                State.voterIin = iin;
                document.getElementById('voter-otp-block').classList.remove('hidden');
            } else {
                alert((await res.json()).error);
            }
        };

        document.getElementById('btn-voter-verify').onclick = async () => {
            const code = document.getElementById('voter-code').value;
            const otp = document.getElementById('voter-otp').value;
            const res = await fetch('/api/voter/verify', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ iin: State.voterIin, code, otp })
            });
            const data = await res.json();
            if (data.poll) {
                State.currentPoll = data.poll;
                VotingModule.renderPoll();
                switchView('voting');
            } else {
                alert(data.error);
            }
        };
    },
    toggleTab(type) {
        document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${type}`).classList.add('active');
        document.getElementById('form-admin').classList.toggle('hidden', type !== 'admin');
        document.getElementById('form-voter').classList.toggle('hidden', type !== 'voter');
    }
};

// Модуль Администратора (Конструктор)
const AdminModule = {
    questions: [],
    init() {
        document.getElementById('btn-logout').onclick = () => {
            localStorage.removeItem('adminToken');
            switchView('auth');
        };
        document.getElementById('btn-add-question').onclick = () => this.addQuestionBlock();
        document.getElementById('btn-create-poll').onclick = () => this.createPoll();
        document.getElementById('btn-test-vote').onclick = () => {
            // Тестовый режим не сбрасывает сессию
            document.getElementById('btn-back-admin').classList.remove('hidden');
            switchView('voting');
        };
        document.getElementById('btn-back-admin').onclick = () => {
            document.getElementById('btn-back-admin').classList.add('hidden');
            switchView('admin');
        };
        this.addQuestionBlock(); // Дефолтный вопрос
    },
    addQuestionBlock() {
        const id = Date.now();
        const div = document.createElement('div');
        div.className = 'question-block';
        div.innerHTML = `
            <input type="text" placeholder="Текст вопроса" class="q-title" required>
            <select class="q-type">
                <option value="radio">Один вариант (Radio)</option>
                <option value="text">Свободный текст</option>
            </select>
            <div class="options-container">
                <input type="text" value="ЗА" class="q-option">
                <input type="text" value="Против" class="q-option">
                <input type="text" value="Воздержался" class="q-option">
            </div>
        `;
        
        div.querySelector('.q-type').onchange = (e) => {
            div.querySelector('.options-container').style.display = e.target.value === 'text' ? 'none' : 'block';
        };
        
        document.getElementById('questions-container').appendChild(div);
    },
    async createPoll() {
        const blocks = document.querySelectorAll('.question-block');
        const questions = Array.from(blocks).map(b => {
            return {
                title: b.querySelector('.q-title').value,
                type: b.querySelector('.q-type').value,
                options: Array.from(b.querySelectorAll('.q-option')).map(opt => opt.value)
            };
        });
        
        const deadlineInput = document.getElementById('poll-deadline').value;
        const deadline = new Date(deadlineInput).getTime();

        const res = await fetch('/api/admin/polls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': localStorage.getItem('adminToken')
            },
            body: JSON.stringify({ deadline, questions })
        });
        
        const data = await res.json();
        document.getElementById('admin-message').innerText = `Опрос создан! Код: ${data.code}`;
    }
};

// Модуль Избирателя
const VotingModule = {
    timerInterval: null,
    renderPoll() {
        const container = document.getElementById('poll-questions');
        container.innerHTML = '';
        
        State.currentPoll.questions.forEach((q, index) => {
            const div = document.createElement('div');
            div.className = 'question-block';
            let html = `<h3>${q.title}</h3>`;
            
            if (q.type === 'radio') {
                q.options.forEach(opt => {
                    html += `<label><input type="radio" name="q_${index}" value="${opt}"> ${opt}</label><br>`;
                });
            } else {
                html += `<textarea name="q_${index}" rows="3"></textarea>`;
            }
            div.innerHTML = html;
            container.appendChild(div);
        });

        this.startTimer();
        
        document.getElementById('btn-submit-vote').onclick = () => this.submitVote();
    },
    startTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const left = State.currentPoll.deadline - now;
            
            if (left <= 0) {
                clearInterval(this.timerInterval);
                document.getElementById('time-left').innerText = "ЗАВЕРШЕНО";
                document.querySelector('.voting-interface').classList.add('disabled-layer');
                document.getElementById('btn-submit-vote').disabled = true;
                return;
            }
            
            const h = Math.floor((left % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((left % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((left % (1000 * 60)) / 1000);
            document.getElementById('time-left').innerText = `${h}:${m}:${s}`;
        }, 1000);
    },
    async submitVote() {
        const answers = {};
        State.currentPoll.questions.forEach((q, index) => {
            const input = document.querySelector(`[name="q_${index}"]:checked`) || document.querySelector(`textarea[name="q_${index}"]`);
            answers[`q_${index}`] = input ? input.value : null;
        });

        const res = await fetch('/api/voter/vote', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ pollId: State.currentPoll.id, iin: State.voterIin, answers })
        });
        
        if (res.ok) {
            alert('Голос успешно учтен!');
            window.location.reload();
        } else {
            alert((await res.json()).error);
        }
    }
};

AuthModule.init();
AdminModule.init();
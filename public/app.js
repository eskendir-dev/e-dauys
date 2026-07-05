// Основные элементы интерфейса
const DOM = {
    views: {
        auth: document.getElementById('view-auth'),
        admin: document.getElementById('view-admin'),
        voting: document.getElementById('view-voting')
    },
    tabs: {
        voter: document.getElementById('tab-voter'),
        admin: document.getElementById('tab-admin')
    },
    forms: {
        voter: document.getElementById('form-voter'),
        admin: document.getElementById('form-admin')
    }
};

// Внутреннее состояние приложения
const State = {
    currentPoll: null,
    voterIin: null,
    timerInterval: null
};

// Функция переключения глобальных экранов (SPA)
function switchView(viewId) {
    Object.keys(DOM.views).forEach(key => {
        const view = DOM.views[key];
        if (key === viewId) {
            view.classList.remove('hidden');
            view.classList.add('active');
        } else {
            view.classList.add('hidden');
            view.classList.remove('active');
        }
    });
}

// --- МОДУЛЬ АВТОРИЗАЦИИ И ТАБОВ ---
const AuthModule = {
    init() {
        // Проверка существующей сессии администратора
        if (localStorage.getItem('adminToken')) {
            switchView('admin');
        }

        // Переключение табов роли
        DOM.tabs.voter.onclick = () => this.switchTab('voter');
        DOM.tabs.admin.onclick = () => this.switchTab('admin');

        this.initAdminAuth();
        this.initVoterAuth();
    },

    switchTab(role) {
        const isVoter = role === 'voter';
        
        DOM.tabs.voter.classList.toggle('active', isVoter);
        DOM.tabs.voter.setAttribute('aria-selected', isVoter);
        DOM.tabs.admin.classList.toggle('active', !isVoter);
        DOM.tabs.admin.setAttribute('aria-selected', !isVoter);

        DOM.forms.voter.classList.toggle('hidden', !isVoter);
        DOM.forms.admin.classList.toggle('hidden', isVoter);
    },

    initAdminAuth() {
        const btnAuth = document.getElementById('btn-admin-auth');
        const btnVerify = document.getElementById('btn-admin-verify');
        const inputIin = document.getElementById('admin-iin');
        const otpBlock = document.getElementById('admin-otp-block');
        const inputOtp = document.getElementById('admin-otp');

        btnAuth.onclick = async () => {
            const iin = inputIin.value.trim();
            if (iin.length !== 12) return alert('ИИН должен состоять из 12 цифр');

            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iin })
            });

            if (res.ok) {
                // Скрытие первичных полей ввода
                inputIin.classList.add('hidden');
                DOM.forms.admin.querySelector('label[for="admin-iin"]').classList.add('hidden');
                btnAuth.classList.add('hidden');
                
                // Отображение блока ввода OTP
                otpBlock.classList.remove('hidden');
            } else {
                alert((await res.json()).error || 'Ошибка доступа');
            }
        };

        btnVerify.onclick = async () => {
            const iin = inputIin.value.trim();
            const otp = inputOtp.value.trim();

            const res = await fetch('/api/admin/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iin, otp })
            });
            const data = await res.json();

            if (data.token) {
                localStorage.setItem('adminToken', data.token);
                switchView('admin');
            } else {
                alert(data.error || 'Неверный код доступа');
            }
        };
    },

    initVoterAuth() {
        const btnAuth = document.getElementById('btn-voter-auth');
        const btnVerify = document.getElementById('btn-voter-verify');
        const inputCode = document.getElementById('voter-code');
        const inputIin = document.getElementById('voter-iin');
        const otpBlock = document.getElementById('voter-otp-block');
        const inputOtp = document.getElementById('voter-otp');

        btnAuth.onclick = async () => {
            const code = inputCode.value.trim().toUpperCase();
            const iin = inputIin.value.trim();

            if (!code || iin.length !== 12) return alert('Заполните код опроса и ИИН (12 цифр)');

            const res = await fetch('/api/voter/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, iin })
            });

            if (res.ok) {
                State.voterIin = iin;
                
                // Полное скрытие начальных элементов формы
                inputCode.classList.add('hidden');
                inputIin.classList.add('hidden');
                btnAuth.classList.add('hidden');
                DOM.forms.voter.querySelectorAll('label').forEach(lbl => lbl.classList.add('hidden'));

                // Активация блока подтверждения
                otpBlock.classList.remove('hidden');
            } else {
                alert((await res.json()).error || 'Ошибка авторизации');
            }
        };

        btnVerify.onclick = async () => {
            const code = inputCode.value.trim().toUpperCase();
            const otp = inputOtp.value.trim();

            const res = await fetch('/api/voter/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iin: State.voterIin, code, otp })
            });
            const data = await res.json();

            if (data.poll) {
                State.currentPoll = data.poll;
                VotingModule.renderPoll();
                switchView('view-voting');
            } else {
                alert(data.error || 'Неверный OTP-код');
            }
        };
    }
};

// --- МОДУЛЬ АДМИНИСТРАТОРА (КОНСТРУКТОР) ---
const AdminModule = {
    init() {
        document.getElementById('btn-logout').onclick = () => {
            localStorage.removeItem('adminToken');
            window.location.reload();
        };

        document.getElementById('btn-add-question').onclick = () => this.addQuestionBlock();
        document.getElementById('btn-create-poll').onclick = () => this.createPoll();

        // Логика тестового переключения режима избирателя
        document.getElementById('btn-test-vote').onclick = () => {
            document.getElementById('btn-back-admin').classList.remove('hidden');
            switchView('view-voting');
        };

        document.getElementById('btn-back-admin').onclick = () => {
            document.getElementById('btn-back-admin').classList.add('hidden');
            switchView('view-admin');
        };

        // Создаем первый обязательный вопрос при инициализации
        this.addQuestionBlock();
    },

    addQuestionBlock() {
        const container = document.getElementById('questions-container');
        const div = document.createElement('div');
        div.className = 'question-block';
        
        div.innerHTML = `
            <input type="text" placeholder="Формулировка вопроса" class="q-title" style="margin-bottom: 0.5rem;" required>
            <select class="q-type" style="margin-bottom: 0.5rem; width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #b6cae2;">
                <option value="radio">Один вариант (Фиксированный выбор)</option>
                <option value="text">Свободный развернутый ответ</option>
            </select>
            <div class="options-container">
                <input type="text" value="ЗА" class="q-option" style="margin-bottom: 0.25rem;">
                <input type="text" value="Против" class="q-option" style="margin-bottom: 0.25rem;">
                <input type="text" value="Воздержался" class="q-option">
            </div>
        `;

        // Динамическое скрытие вариантов ответа для текстового типа вопроса
        div.querySelector('.q-type').onchange = (e) => {
            div.querySelector('.options-container').style.display = e.target.value === 'text' ? 'none' : 'block';
        };

        container.appendChild(div);
    },

    async createPoll() {
        const blocks = document.querySelectorAll('.question-block');
        const questions = Array.from(blocks).map(b => {
            const type = b.querySelector('.q-type').value;
            return {
                title: b.querySelector('.q-title').value.trim(),
                type: type,
                options: type === 'text' ? [] : Array.from(b.querySelectorAll('.q-option')).map(o => o.value.trim()).filter(Boolean)
            };
        });

        const deadlineInput = document.getElementById('poll-deadline').value;
        if (!deadlineInput) return alert('Установите время окончания голосования');

        const deadline = new Date(deadlineInput).getTime();
        const msgBlock = document.getElementById('admin-message');

        const res = await fetch('/api/admin/polls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': localStorage.getItem('adminToken')
            },
            body: JSON.stringify({ deadline, questions })
        });

        const data = await res.json();
        if (res.ok) {
            msgBlock.innerHTML = `<strong>Опрос успешно создан.</strong><br>Код доступа: <span style="font-size: 1.2rem; letter-spacing: 1px; color: var(--accent-ink);">${data.code}</span>`;
            msgBlock.className = ""; // Удаление hidden
        } else {
            alert(data.error || 'Ошибка создания опроса');
        }
    }
};

// --- МОДУЛЬ ИЗБИРАТЕЛЯ (ОПРОСНЫЙ ЛИСТ) ---
const VotingModule = {
    renderPoll() {
        const container = document.getElementById('poll-questions');
        container.innerHTML = '';

        if (!State.currentPoll || !State.currentPoll.questions) return;

        State.currentPoll.questions.forEach((q, qIndex) => {
            const div = document.createElement('div');
            div.className = 'question-block';
            let html = `<h3 style="margin-bottom: 0.75rem;">${q.title}</h3>`;

            if (q.type === 'radio') {
                q.options.forEach(opt => {
                    html += `
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: normal; cursor: pointer;">
                            <input type="radio" name="q_${qIndex}" value="${opt}" style="width: auto; margin-right: 0.5rem;">
                            ${opt}
                        </label>
                    `;
                });
            } else {
                html += `<textarea name="q_${qIndex}" rows="3" placeholder="Введите ваш ответ..." style="width: 100%; resize: vertical;"></textarea>`;
            }

            div.innerHTML = html;
            container.appendChild(div);
        });

        this.initTimer();
        document.getElementById('btn-submit-vote').onclick = () => this.submitVote();
    },

    initTimer() {
        clearInterval(State.timerInterval);
        const timerSpan = document.getElementById('time-left');

        State.timerInterval = setInterval(() => {
            const distance = State.currentPoll.deadline - Date.now();

            if (distance <= 0) {
                clearInterval(State.timerInterval);
                timerSpan.innerText = "ВРЕМЯ ИСТЕКЛО";
                document.getElementById('poll-questions').classList.add('disabled-layer');
                document.getElementById('btn-submit-vote').disabled = true;
                return;
            }

            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            const pad = (num) => String(num).padStart(2, '0');
            timerSpan.innerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        }, 1000);
    },

    async submitVote() {
        const answers = {};
        let allAnswered = true;

        State.currentPoll.questions.forEach((q, qIndex) => {
            if (q.type === 'radio') {
                const checked = document.querySelector(`input[name="q_${qIndex}"]:checked`);
                if (!checked) allAnswered = false;
                answers[`q_${qIndex}`] = checked ? checked.value : null;
            } else {
                const textVal = document.querySelector(`textarea[name="q_${qIndex}"]`).value.trim();
                if (!textVal) allAnswered = false;
                answers[`q_${qIndex}`] = textVal;
            }
        });

        if (!allAnswered) {
            if (!confirm('Вы заполнили не все вопросы. Всё равно отправить бюллетень?')) return;
        }

        const res = await fetch('/api/voter/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pollId: State.currentPoll.id,
                iin: State.voterIin,
                answers: answers
            })
        });

        if (res.ok) {
            alert('Ваш голос успешно зафиксирован в системе.');
            window.location.reload();
        } else {
            alert((await res.json()).error || 'Ошибка отправки бюллетеня');
        }
    }
};

// Запуск при полной загрузке DOM-структуры
document.addEventListener('DOMContentLoaded', () => {
    AuthModule.init();
    AdminModule.init();
});
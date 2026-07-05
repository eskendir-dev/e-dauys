// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DATABASE_URL || path.join(__dirname, 'edauys.sqlite');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Безопасное определение пути: если диска нет, уходим в in-memory режим
const DB_PATH = process.env.DATABASE_URL || ':memory:';

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err);
    } else {
        console.log(`База данных успешно инициализирована. Режим: ${DB_PATH}`);
    }
});

// Инициализация таблиц
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        iin TEXT PRIMARY KEY,
        email TEXT,
        otp TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        iin TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE,
        deadline INTEGER,
        data_json TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poll_id TEXT,
        iin TEXT,
        answers_json TEXT,
        UNIQUE(poll_id, iin)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS voter_otp (
        iin TEXT,
        poll_code TEXT,
        otp TEXT,
        PRIMARY KEY(iin, poll_code)
    )`);

    // Автоматическое добавление дефолтного админа при каждом старте памяти
    db.run(`INSERT OR IGNORE INTO admins (iin, email) VALUES ('123456789012', 'admin@e-dauys.kz')`);
});

// --- API Администратора ---

app.post('/api/admin/login', (req, res) => {
    const { iin } = req.body;
    db.get('SELECT * FROM admins WHERE iin = ?', [iin], (err, admin) => {
        if (!admin) return res.status(403).json({ error: 'Администратор не найден' });
        
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        db.run('UPDATE admins SET otp = ? WHERE iin = ?', [otp, iin], () => {
            console.log(`[СИМУЛЯЦИЯ EMAIL] OTP для администратора ${iin}: ${otp}`);
            res.json({ message: 'OTP отправлен на привязанную почту' });
        });
    });
});

app.post('/api/admin/verify', (req, res) => {
    const { iin, otp } = req.body;
    db.get('SELECT * FROM admins WHERE iin = ? AND otp = ?', [iin, otp], (err, admin) => {
        if (!admin) return res.status(401).json({ error: 'Неверный OTP' });
        
        const token = uuidv4();
        db.run('INSERT INTO sessions (token, iin) VALUES (?, ?)', [token, iin], () => {
            db.run('UPDATE admins SET otp = NULL WHERE iin = ?', [iin]);
            res.json({ token });
        });
    });
});

app.post('/api/admin/polls', (req, res) => {
    const token = req.headers.authorization;
    db.get('SELECT iin FROM sessions WHERE token = ?', [token], (err, session) => {
        if (!session) return res.status(401).json({ error: 'Неавторизован' });
        
        const { deadline, questions } = req.body;
        const pollId = uuidv4();
        const pollCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        
        db.run('INSERT INTO polls (id, code, deadline, data_json) VALUES (?, ?, ?, ?)', 
            [pollId, pollCode, deadline, JSON.stringify(questions)], 
            (err) => {
                if (err) return res.status(500).json({ error: 'Ошибка создания опроса' });
                res.json({ code: pollCode, id: pollId });
            });
    });
});

// --- API Избирателя ---

app.post('/api/voter/auth', (req, res) => {
    const { code, iin } = req.body;
    db.get('SELECT * FROM polls WHERE code = ?', [code], (err, poll) => {
        if (!poll) return res.status(404).json({ error: 'Голосование не найдено' });
        if (Date.now() > poll.deadline) return res.status(403).json({ error: 'Голосование завершено' });

        db.get('SELECT id FROM votes WHERE poll_id = ? AND iin = ?', [poll.id, iin], (err, vote) => {
            if (vote) return res.status(403).json({ error: 'Вы уже проголосовали' });

            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            db.run('INSERT OR REPLACE INTO voter_otp (iin, poll_code, otp) VALUES (?, ?, ?)', [iin, code, otp], () => {
                console.log(`[СИМУЛЯЦИЯ EMAIL] OTP для избирателя ${iin}: ${otp}`);
                res.json({ message: 'OTP отправлен' });
            });
        });
    });
});

app.post('/api/voter/verify', (req, res) => {
    const { iin, code, otp } = req.body;
    db.get('SELECT * FROM voter_otp WHERE iin = ? AND poll_code = ? AND otp = ?', [iin, code, otp], (err, record) => {
        if (!record) return res.status(401).json({ error: 'Неверный OTP' });
        
        db.get('SELECT * FROM polls WHERE code = ?', [code], (err, poll) => {
            db.run('DELETE FROM voter_otp WHERE iin = ? AND poll_code = ?', [iin, code]);
            res.json({ poll: { id: poll.id, deadline: poll.deadline, questions: JSON.parse(poll.data_json) } });
        });
    });
});

app.post('/api/voter/vote', (req, res) => {
    const { pollId, iin, answers } = req.body;
    
    db.get('SELECT deadline FROM polls WHERE id = ?', [pollId], (err, poll) => {
        if (!poll || Date.now() > poll.deadline) return res.status(403).json({ error: 'Голосование недоступно' });

        db.run('BEGIN TRANSACTION');
        db.run('INSERT INTO votes (poll_id, iin, answers_json) VALUES (?, ?, ?)', 
            [pollId, iin, JSON.stringify(answers)], 
            function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(403).json({ error: 'Голос уже учтен или ошибка сохранения' });
                }
                db.run('COMMIT');
                res.json({ success: true });
            });
    });
});

app.listen(PORT, () => {
    console.log(`Сервер e-Dauys запущен на порту ${PORT}`);
});
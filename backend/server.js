require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const PYTHON_SCRIPT = path.join(__dirname, '../api.py');
const SCHEDULE_FILE = path.join(__dirname, 'scheduled_tasks.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Supabase setup
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ─── Scheduled Tasks Helpers ─────────────────────────────────────────────────

function toLocalISOString(date) {
    const pad = (num) => (num < 10 ? '0' : '') + num;
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 
           'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function loadSchedule() {
    if (!fs.existsSync(SCHEDULE_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveSchedule(tasks) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(tasks, null, 2));
}

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) return { spotify_playlist_id: '37i9dQZF1DXcBWIGoYBM5M' };
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
        return { spotify_playlist_id: '37i9dQZF1DXcBWIGoYBM5M' };
    }
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function sendTelegramMessage(chatId, text) {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const options = {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
        res.on('data', () => {});
    });
    req.on('error', (e) => console.error('[Reminder] Telegram send error:', e.message));
    req.write(body);
    req.end();
}

// ─── 20-Minute Reminder Loop ─────────────────────────────────────────────────
setInterval(() => {
    const now = new Date();
    const tasks = loadSchedule();
    let changed = false;

    tasks.forEach(task => {
        if (task.reminded) return;

        const taskTime = new Date(task.scheduled_time);
        const diffMs = taskTime - now;
        const diffMin = diffMs / 60000;

        // Within 20–21 minute window
        if (diffMin >= 19.5 && diffMin <= 21) {
            const timeStr = taskTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            const msg =
                `⏰ *20-Minute Reminder!*\n\n` +
                `🔔 *${task.title}* starts at *${timeStr}*\n\n` +
                `Get ready! You've got 20 minutes. You've got this! 💪`;
            sendTelegramMessage(task.chat_id, msg);
            task.reminded = true;
            changed = true;
            console.log(`[Reminder] Sent 20-min reminder for: ${task.title}`);
        }

        // Music Alarm Execution Logic
        if (task.type === 'music' && !task.played) {
            if (diffMin <= 0 && diffMin >= -2) {
                const scriptPath = path.join(__dirname, '../play_spotify.py');
                exec(`python "${scriptPath}"`, (err, stdout, stderr) => {
                    if (err) console.error("[Spotify] Play failed", err);
                });
                
                sendTelegramMessage(task.chat_id, "🎵 *Time to wake up/focus!* Playing your Spotify playlist now.");
                
                if (task.is_recurring) {
                    const tomorrow = new Date(taskTime);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    task.scheduled_time = toLocalISOString(tomorrow);
                    task.reminded = false;
                } else {
                    task.played = true;
                }
                changed = true;
            }
        }
    });

    if (changed) saveSchedule(tasks);
}, 60 * 1000); // check every minute

// ─── Telegram Pairing Routes ─────────────────────────────────────────────────

app.post('/api/telegram/generate-code', (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const users = loadUsers();
    
    if (!users[user_id]) users[user_id] = {};
    users[user_id].pairing_code = code;
    // We do NOT reset linked_at here so they stay linked until they overwrite with a new link
    
    saveUsers(users);
    res.json({ status: 'success', code });
});

app.post('/api/telegram/link', (req, res) => {
    const { code, chat_id } = req.body;
    if (!code || !chat_id) return res.status(400).json({ error: 'code and chat_id required' });

    const users = loadUsers();
    let linkedUserId = null;

    for (const [userId, data] of Object.entries(users)) {
        if (data.pairing_code === code) {
            data.telegram_chat_id = chat_id;
            data.pairing_code = null; // consume code
            data.linked_at = new Date().toISOString();
            linkedUserId = userId;
            break;
        }
    }

    if (linkedUserId) {
        saveUsers(users);
        res.json({ status: 'success', message: 'Accounts successfully linked!' });
    } else {
        res.status(404).json({ status: 'error', message: 'Invalid or expired pairing code.' });
    }
});

app.get('/api/config', (req, res) => {
    res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
    const { spotify_playlist_id } = req.body;
    if (!spotify_playlist_id) return res.status(400).json({ error: 'spotify_playlist_id required' });
    const config = loadConfig();
    config.spotify_playlist_id = spotify_playlist_id;
    saveConfig(config);
    res.json({ status: 'success', config });
});

app.get('/api/telegram/status', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const users = loadUsers();
    const user = users[user_id];

    if (user && user.telegram_chat_id) {
        res.json({ status: 'success', is_linked: true, chat_id: user.telegram_chat_id });
    } else {
        res.json({ status: 'success', is_linked: false });
    }
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// Save schedule from Telegram
app.post('/api/schedule', (req, res) => {
    const { tasks, chat_id } = req.body;
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No tasks provided' });
    }

    const existing = loadSchedule();

    const newTasks = tasks.map((t, i) => ({
        id: `${Date.now()}-${i}`,
        title: t.title || 'Task',
        scheduled_time: t.scheduled_time,
        type: t.type || 'task',
        is_recurring: t.is_recurring || false,
        played: false,
        chat_id: chat_id,
        reminded: false,
        created_at: new Date().toISOString()
    }));

    const updated = [...existing, ...newTasks];
    saveSchedule(updated);

    // Also save to Supabase for dashboard history
    newTasks.forEach(async (t) => {
        try {
            await supabase.from('tasks').insert({
                title: t.title,
                skill: 'schedule',
                source: 'telegram',
                status: 'pending'
            });
        } catch (e) { /* silent */ }
    });

    console.log(`[Schedule] Saved ${newTasks.length} tasks`);
    res.json({ status: 'success', saved: newTasks.length });
});

// Get scheduled tasks (for dashboard)
app.get('/api/tasks/scheduled', (req, res) => {
    const tasks = loadSchedule();
    // Return tasks that haven't started yet (scheduled_time in future or within last 10 min)
    const now = new Date();
    const relevant = tasks.filter(t => {
        const taskTime = new Date(t.scheduled_time);
        return taskTime > new Date(now.getTime() - 10 * 60 * 1000); // show for 10 min after start
    });
    // Sort by time
    relevant.sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));
    res.json({ status: 'success', tasks: relevant });
});

// Complete a scheduled task and update it in the database
app.post('/api/schedule/complete', async (req, res) => {
    const { id, title } = req.body;
    let tasks = loadSchedule();
    
    // Remove from JSON schedule
    const newTasks = tasks.filter(t => t.id !== id);
    saveSchedule(newTasks);

    // Update the pending task in Supabase to completed
    try {
        await supabase
            .from('tasks')
            .update({ status: 'completed' })
            .match({ title: title, status: 'pending', source: 'telegram' });
    } catch (e) {
        console.error("Supabase update error", e);
    }

    res.json({ status: 'success' });
});

// Cancel a scheduled task
app.post('/api/schedule/cancel', async (req, res) => {
    const { id, title } = req.body;
    let tasks = loadSchedule();
    
    const newTasks = tasks.filter(t => t.id !== id);
    saveSchedule(newTasks);

    try {
        await supabase
            .from('tasks')
            .update({ status: 'cancelled' })
            .match({ title: title, status: 'pending' });
    } catch (e) {
        console.error("Supabase cancel error", e);
    }

    res.json({ status: 'success' });
});

// Reschedule a task and shift subsequent schedule
app.post('/api/schedule/reschedule', (req, res) => {
    const { task_name, new_time } = req.body;
    let tasks = loadSchedule();
    
    // Find closest matching task (case insensitive, partial match)
    // We allow finding past tasks in case the user missed them and wants to push them forward.
    const targetTask = tasks.find(t => t.title.toLowerCase().includes(task_name.toLowerCase()));
    if (!targetTask) {
        return res.status(404).json({ status: 'error', message: `Could not find any task matching "${task_name}"` });
    }

    const oldTime = new Date(targetTask.scheduled_time);
    const updatedTime = new Date(new_time);
    const diffMs = updatedTime.getTime() - oldTime.getTime();

    targetTask.scheduled_time = toLocalISOString(updatedTime);
    targetTask.reminded = false; 

    let shiftedCount = 0;
    // Shift all tasks that were scheduled strictly AFTER the target task's original time
    tasks.forEach(t => {
        if (t.id !== targetTask.id) {
            const tTime = new Date(t.scheduled_time);
            if (tTime.getTime() >= oldTime.getTime()) {
                t.scheduled_time = toLocalISOString(new Date(tTime.getTime() + diffMs));
                t.reminded = false; // Reset reminder as time changed
                shiftedCount++;
            }
        }
    });

    saveSchedule(tasks);
    
    res.json({ 
        status: 'success', 
        target_title: targetTask.title,
        old_time: toLocalISOString(oldTime),
        new_time: toLocalISOString(updatedTime),
        shifted_count: shiftedCount
    });
});

// Process intent and save task
app.post('/api/intent', (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ status: 'error', message: 'Prompt is required' });
    }
    console.log(`Received prompt: ${prompt}`);
    exec(`python "${PYTHON_SCRIPT}" "${prompt}"`, async (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
        }
        try {
            const result = JSON.parse(stdout.trim());
            const taskTitle = prompt.length > 80 ? prompt.substring(0, 80) + '...' : prompt;
            const skill = result.skill || 'chat';
            if (skill !== 'chat') {
                const { error: dbError } = await supabase.from('tasks').insert({
                    title: taskTitle,
                    skill: skill,
                    source: 'web',
                    status: result.status === 'success' ? 'completed' : 'failed'
                });
                if (dbError) console.error('Supabase insert error:', dbError.message);
            }
            res.json(result);
        } catch (e) {
            console.error('Failed to parse Python output:', stdout);
            res.status(500).json({ status: 'error', message: 'Failed to parse python response', raw: stdout });
        }
    });
});

// Get task history from Supabase
app.get('/api/tasks/history', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) return res.status(500).json({ status: 'error', message: error.message });
        res.json({ status: 'success', tasks: data || [] });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// Save task from Telegram
app.post('/api/tasks', async (req, res) => {
    const { title, skill, source } = req.body;
    const { data, error } = await supabase.from('tasks').insert({
        title: title || 'Untitled Task',
        skill: skill || 'general',
        source: source || 'telegram',
        status: 'completed'
    }).select();
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    res.json({ status: 'success', task: data });
});

// Trigger Weather Alert
app.post('/api/send-alert', (req, res) => {
    const { weather_desc, temp } = req.body;
    if (!weather_desc || temp === undefined) {
        return res.status(400).json({ status: 'error', message: 'Missing weather data' });
    }
    const scriptPath = path.join(__dirname, '../send_alert.py');
    exec(`python "${scriptPath}" "${weather_desc}" "${temp}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ status: 'error', message: 'Internal Server Error', stderr });
        }
        res.json({ status: 'success', output: stdout.trim() });
    });
});

app.listen(PORT, () => {
    console.log(`Agent API Server running on http://localhost:${PORT}`);
    console.log(`[Reminder] 20-minute reminder loop active.`);
});

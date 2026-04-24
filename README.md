# 🧠 BrainSync: Your Hyper-Personalized AI Command Center

BrainSync is an all-in-one AI agent and dashboard designed to streamline your life through a beautiful, matte-black interface and a powerful Telegram integration.

## 🚀 What can BrainSync do?

- **Smart Scheduling**: Chat with your bot on Telegram to schedule tasks (e.g., "9am meeting, 11am gym"). It automatically shifts your day if you need to reschedule!
- **Music Alarms**: Tell the bot to wake you up with music. It will automatically launch your favorite Spotify playlist on your computer at the exact time you choose.
- **Weather Alerts**: Get personalized weather advice sent to your Telegram every morning so you know whether to grab an umbrella or sunglasses.
- **Unified Dashboard**: See your entire day, your task history, and your live music player all in one sleek, professional web dashboard.
- **Multi-User Link**: Securely connect your personal Telegram account to the dashboard using a simple 6-digit pairing code.

## 🛠️ The Tech Stack

- **Frontend**: React + Vite + Tailwind CSS (The beautiful dashboard)
- **Backend**: Node.js + Express (The brain connecting everything)
- **Bot**: Python (The Telegram interface you talk to)
- **Database**: Supabase (Stores your task history securely)
- **Automation**: Custom Python scripts for OS-level control (Spotify, etc.)

## 🏃 How to run it?

### 1. Backend
```bash
cd backend
npm install
npm run dev
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. Telegram Bot
```bash
# Make sure you have python installed
pip install python-telegram-bot httpx python-dotenv
python telegram_bot.py
```

## 📝 Configuration
Make sure to set up your `.env` files in both the root and `backend/` folders with your:
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY` (for the AI's personality)

---
Built for the Hackathon with ❤️ by BrainSync Team.

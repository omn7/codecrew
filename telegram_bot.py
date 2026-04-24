import os
import re
import json
import logging
import urllib.parse
import httpx as http_client
from datetime import datetime, timedelta
from dotenv import load_dotenv
from google import genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
from skills import generate_personalized_plan, enable_focus_mode, setup_workspace

BACKEND_URL = "http://localhost:3001"

load_dotenv()

# Setup logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Gemini
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")


def save_task_to_db(title: str, skill: str):
    """Save a completed task to Supabase via the backend"""
    try:
        http_client.post(f"{BACKEND_URL}/api/tasks", json={
            "title": title[:80],
            "skill": skill,
            "source": "telegram"
        }, timeout=5)
    except Exception:
        pass  # Don't block bot if DB save fails


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    welcome = (
        "🤖 *Welcome to BrainSync!*\n\n"
        "I'm your hyper-personalized daily assistant.\n\n"
        "🔥 *What I can do:*\n"
        "• 📅 Schedule tasks — _\"9am standup, 11am coding, 2pm review\"_\n"
        "• 🗓️ Plan your day — _\"Plan my day with 4 hours for coding and demo\"_\n"
        "• 🎯 Focus mode — _\"Start focus mode for 30 minutes\"_\n"
        "• 🖥️ Setup workspace — _\"Set up my coding workspace\"_\n"
        "• 💬 Chat about anything — _\"Tell me a joke\"_\n\n"
        "⏰ *I'll remind you 20 minutes before each scheduled task!*\n\n"
        "Just type a message and I'll handle the rest! 🚀"
    )
    await update.message.reply_text(welcome, parse_mode="Markdown")

async def connect_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("⚠️ Please provide your 6-digit code, e.g., `/connect 123456`", parse_mode="Markdown")
        return
    
    code = context.args[0]
    chat_id = update.effective_chat.id
    
    try:
        resp = http_client.post(f"{BACKEND_URL}/api/telegram/link", json={
            "code": code,
            "chat_id": str(chat_id)
        }, timeout=5)
        if resp.status_code == 200:
            await update.message.reply_text("✅ *Successfully connected to your Web Dashboard!*\n\nYour schedule will now automatically sync.", parse_mode="Markdown")
        else:
            await update.message.reply_text("⚠️ Invalid or expired code. Please generate a new one on the dashboard.")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Could not reach the backend to link accounts: {e}")


def parse_time_str(time_str: str, today: str) -> str | None:
    """Convert a time string like '9am', '9:30pm', '14:00' to ISO 8601 datetime"""
    time_str = time_str.strip().lower()
    dt = None
    for fmt in ["%I:%M%p", "%I%p", "%H:%M"]:
        try:
            t = datetime.strptime(time_str.replace(' ', ''), fmt)
            dt = datetime.strptime(today, "%Y-%m-%d").replace(hour=t.hour, minute=t.minute, second=0)
            break
        except ValueError:
            continue
    if dt:
        return dt.strftime("%Y-%m-%dT%H:%M:00")
    return None


def local_intent_parser(user_input: str) -> dict:
    """Fallback parser when Gemini is down — supports schedule detection"""
    text = user_input.lower()
    today = datetime.now().strftime("%Y-%m-%d")

    # ── Schedule detection: multiple time mentions → schedule_tasks ──────────
    # Pattern: "9am standup, 11am coding, 2pm review"
    # Match entries like: "9am task name" or "9:30pm task name"
    schedule_pattern = re.findall(
        r'(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))\s+([^,\n]+)',
        user_input
    )
    if len(schedule_pattern) >= 2 or (
        len(schedule_pattern) == 1 and (',' in user_input or 'then' in text or 'after' in text)
    ):
        tasks = []
        for time_part, title_part in schedule_pattern:
            iso_time = parse_time_str(time_part, today)
            if iso_time:
                tasks.append({"title": title_part.strip().rstrip(','), "scheduled_time": iso_time})
        if tasks:
            return {"skill": "schedule_tasks", "params": {"tasks": tasks}}

    # ── Also detect comma-separated list with at least 2 times anywhere ──────
    all_times = re.findall(r'(\d{1,2}(?::\d{2})?\s*(?:am|pm))', text)
    if len(all_times) >= 2:
        # Try to pair each time with the text following it
        entries = re.split(r',|\n|;', user_input)
        tasks = []
        for entry in entries:
            entry = entry.strip()
            m = re.search(r'(\d{1,2}(?::\d{2})?\s*(?:am|pm))[:\s-]*(.+)', entry, re.IGNORECASE)
            if m:
                iso_time = parse_time_str(m.group(1), today)
                title = m.group(2).strip()
                if iso_time and title:
                    tasks.append({"title": title, "scheduled_time": iso_time})
        if len(tasks) >= 2:
            return {"skill": "schedule_tasks", "params": {"tasks": tasks}}

    # ── Reschedule detection ──────────────────────────────────────────────────
    reschedule_match = re.search(r'(?:reschedule|move|delay)\s+(.+?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))', text)
    if reschedule_match:
        task_name = reschedule_match.group(1).strip()
        new_time_str = reschedule_match.group(2).strip()
        new_iso = parse_time_str(new_time_str, today)
        if new_iso:
            return {"skill": "reschedule_task", "params": {"task_name": task_name, "new_time": new_iso}}

    # ── Single intents ────────────────────────────────────────────────────────
    if "meeting" in text or "calendar" in text:
        start_h = 9
        if "pm" in text:
            match = re.search(r'(\d+)\s*pm', text)
            if match:
                start_h = int(match.group(1)) + 12
        elif "am" in text:
            match = re.search(r'(\d+)\s*am', text)
            if match:
                start_h = int(match.group(1))
        return {
            "skill": "add_to_calendar",
            "params": {
                "event_title": user_input,
                "start_hour": start_h,
                "start_minute": 0,
                "end_hour": start_h + 1,
                "end_minute": 0,
                "date": today
            }
        }
    elif "focus" in text:
        duration = 30
        match = re.search(r'(\d+)\s*min', text)
        if match:
            duration = int(match.group(1))
        return {"skill": "enable_focus", "params": {"duration_minutes": duration}}
    elif "workspace" in text or "set up" in text:
        return {"skill": "setup_workspace", "params": {"environment_type": "coding"}}
    elif "plan" in text:
        return {"skill": "generate_plan", "params": {"hours": 4, "priorities": ["Deep Work"]}}
    elif "pending" in text or "tasks" in text or ("schedule" in text and "reschedule" not in text):
        return {"skill": "show_tasks"}

    return {
        "skill": "chat",
        "message": "⚠️ My AI brain is offline right now due to high load. However, you can still send me schedules like:\n\n`9am standup, 11am coding, 2pm review`\n\nI'll parse it automatically and sync it to your dashboard!"
    }


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_input = update.message.text
    chat_id = update.effective_chat.id

    await context.bot.send_chat_action(chat_id=chat_id, action="typing")

    today = datetime.now().strftime('%Y-%m-%d')
    now_time = datetime.now().strftime('%H:%M')

    prompt = f"""
    You are BrainSync, a hyper-personalized, highly-capable AI assistant with a humorous, witty, and engaging personality.
    The user has said: "{user_input}"
    Today's date is: {today} and the current time is {now_time}.

    You have access to specific system skills:
    1. 'schedule_tasks': Use this when the user provides a SCHEDULE or LIST of tasks with times (e.g. "9am standup, 11am coding session, 2pm review"). 
       Extract EACH task with its time and return them as a list.
       Needs: "tasks" (list of objects, each with "title" (string) and "scheduled_time" (ISO 8601 string, YYYY-MM-DDTHH:MM:00, use today's date {today} if no date given)).
    2. 'add_to_calendar': Use for a SINGLE calendar event. Needs "event_title", "start_hour" (int, 24h), "start_minute" (int), "end_hour" (int, 24h), "end_minute" (int), "date" (YYYY-MM-DD).
    3. 'generate_plan': Needs "hours" (int) and "priorities" (list of strings).
    4. 'enable_focus': Needs "duration_minutes" (int).
    5. 'setup_workspace': Needs "environment_type" (string, e.g., 'coding', 'writing').
    6. 'reschedule_task': Use when the user asks to reschedule, move, or delay a task. Needs "task_name" (string) and "new_time" (ISO 8601 string, YYYY-MM-DDTHH:MM:00, use today's date).
    7. 'show_tasks': Use when the user asks to see their tasks, schedule, or what is pending for the day. No params needed.

    If the user provides a list/schedule of multiple tasks, use 'schedule_tasks'.
    If the user's intent matches one of the other skills, output the matching skill JSON.
    If it doesn't match any skill, reply naturally. Output JSON with "skill": "chat" and "message": your witty response.

    Output ONLY valid JSON without markdown blocks.
    """

    try:
        models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']
        response = None
        last_err = None
        for model_name in models:
            try:
                response = client.models.generate_content(model=model_name, contents=prompt)
                break
            except Exception as model_err:
                last_err = str(model_err)
                logger.warning(f"Model {model_name} failed: {model_err}")
                continue

        if response is None:
            logger.warning(f"All Gemini models failed (last error: {last_err}). Using local fallback.")
            data = local_intent_parser(user_input)
        else:
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:-3]
            elif text.startswith("```"):
                text = text[3:-3]
            data = json.loads(text.strip())

        # --- Handle schedule_tasks ---
        if data["skill"] == "schedule_tasks":
            tasks = data["params"].get("tasks", [])
            if not tasks:
                await update.message.reply_text("⚠️ Couldn't extract any tasks from your message. Please try again with times, e.g. '9am standup, 11am coding'.")
                return

            # Send to backend
            try:
                resp = http_client.post(f"{BACKEND_URL}/api/schedule", json={
                    "tasks": tasks,
                    "chat_id": str(chat_id)
                }, timeout=10)
                resp_data = resp.json()
            except Exception as e:
                await update.message.reply_text(f"⚠️ Could not save schedule: {e}")
                return

            # Build confirmation message
            lines = ["📅 *Schedule Saved! Here's your plan for today:*\n"]
            for i, task in enumerate(tasks, 1):
                try:
                    dt = datetime.fromisoformat(task["scheduled_time"])
                    time_str = dt.strftime("%I:%M %p")
                except Exception:
                    time_str = task.get("scheduled_time", "?")
                lines.append(f"  *{i}.* {task['title']} — `{time_str}`")

            lines.append("\n⏰ _I'll remind you 20 minutes before each task!_")
            await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
            save_task_to_db(f"Schedule: {len(tasks)} tasks", "schedule_tasks")

        elif data["skill"] == "reschedule_task":
            task_name = data["params"].get("task_name")
            new_time = data["params"].get("new_time")
            
            if not task_name or not new_time:
                await update.message.reply_text("⚠️ Could not determine which task or what time. Try: 'Reschedule coding to 3pm'")
                return
                
            try:
                resp = http_client.post(f"{BACKEND_URL}/api/schedule/reschedule", json={
                    "task_name": task_name,
                    "new_time": new_time
                }, timeout=10)
                
                if resp.status_code == 200:
                    resp_data = resp.json()
                    dt = datetime.fromisoformat(resp_data["new_time"])
                    time_str = dt.strftime("%I:%M %p")
                    msg = (
                        f"✅ *Task Rescheduled!*\n\n"
                        f"Moved *{resp_data['target_title']}* to `{time_str}`.\n"
                    )
                    if resp_data.get("shifted_count", 0) > 0:
                        msg += f"\n_Smart Shift: Also adjusted {resp_data['shifted_count']} subsequent task(s) to prevent overlap!_"
                    await update.message.reply_text(msg, parse_mode="Markdown")
                    save_task_to_db(f"Rescheduled: {resp_data['target_title']}", "reschedule_task")
                else:
                    err = resp.json().get('message', 'Unknown error')
                    await update.message.reply_text(f"⚠️ Reschedule failed: {err}")
            except Exception as e:
                await update.message.reply_text(f"⚠️ Could not reach schedule brain: {e}")

        elif data["skill"] == "show_tasks":
            try:
                resp = http_client.get(f"{BACKEND_URL}/api/tasks/scheduled", timeout=5)
                if resp.status_code == 200:
                    tasks = resp.json().get('tasks', [])
                    if not tasks:
                        await update.message.reply_text("You have no pending tasks on your schedule! Enjoy your free time 🌴")
                    else:
                        lines = ["📋 *Your Pending Schedule:*"]
                        for i, task in enumerate(tasks, 1):
                            try:
                                dt = datetime.fromisoformat(task["scheduled_time"])
                                time_str = dt.strftime("%I:%M %p")
                            except Exception:
                                time_str = task.get("scheduled_time", "?")
                            lines.append(f"  *{i}.* {task['title']} — `{time_str}`")
                        await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
                else:
                    await update.message.reply_text("⚠️ Could not fetch tasks right now.")
            except Exception as e:
                await update.message.reply_text(f"⚠️ Could not reach the backend: {e}")

        elif data["skill"] == "generate_plan":
            result = generate_personalized_plan(
                data["params"].get("priorities", ["Hackathon", "Demo"]),
                data["params"].get("hours", 6)
            )
            reply = f"📋 *Your Personalized Plan*\n\n{result.get('content', 'Plan generated!')}"
            if result.get("file"):
                reply += f"\n\n📁 _Saved to: {result['file']}_"
            await update.message.reply_text(reply, parse_mode="Markdown")
            save_task_to_db(user_input, "generate_plan")

        elif data["skill"] == "enable_focus":
            result = enable_focus_mode(data["params"].get("duration_minutes", 60))
            actions_text = "\n".join([f"  ▸ {a}" for a in result.get("actions_taken", [])])
            reply = f"🎯 *Focus Mode Activated!*\n\n{actions_text}\n\n⏱️ Duration: *{result.get('duration')} minutes*"
            await update.message.reply_text(reply, parse_mode="Markdown")
            save_task_to_db(user_input, "enable_focus")

        elif data["skill"] == "setup_workspace":
            result = setup_workspace(data["params"].get("environment_type", "coding"))
            actions_text = "\n".join([f"  ▸ {a}" for a in result.get("setup_actions", [])])
            reply = f"🖥️ *Workspace Ready!*\n\n{actions_text}"
            await update.message.reply_text(reply, parse_mode="Markdown")
            save_task_to_db(user_input, "setup_workspace")

        elif data["skill"] == "add_to_calendar":
            params = data.get("params", {})
            event_title = params.get("event_title", "Meeting")
            event_date = params.get("date", datetime.now().strftime("%Y-%m-%d"))
            start_h = params.get("start_hour", 9)
            start_m = params.get("start_minute", 0)
            end_h = params.get("end_hour", start_h + 1)
            end_m = params.get("end_minute", 0)

            start_dt = datetime.strptime(f"{event_date} {start_h}:{start_m}", "%Y-%m-%d %H:%M")
            end_dt = datetime.strptime(f"{event_date} {end_h}:{end_m}", "%Y-%m-%d %H:%M")
            start_str = start_dt.strftime("%Y%m%dT%H%M%S")
            end_str = end_dt.strftime("%Y%m%dT%H%M%S")

            await update.message.reply_text("🤖 Connecting to your computer's browser to save the event...")

            from skills import add_to_calendar
            result = add_to_calendar(event_title, start_str, end_str)

            if result["status"] == "success":
                reply = (
                    f"✅ *Task Fully Completed!*\n\n"
                    f"*Title:* {event_title}\n"
                    f"*Date:* {start_dt.strftime('%A, %B %d, %Y')}\n"
                    f"*Time:* {start_dt.strftime('%I:%M %p')} - {end_dt.strftime('%I:%M %p')}\n\n"
                    f"The event was saved automatically on your desktop!"
                )
            else:
                reply = f"⚠️ Automation failed: {result.get('message', 'Unknown error')}"

            await update.message.reply_text(reply, parse_mode="Markdown")
            save_task_to_db(user_input, "add_to_calendar")

        elif data["skill"] == "chat":
            await update.message.reply_text(data.get("message", "I'm speechless! 😅"))

    except Exception as e:
        logger.error(f"Error processing message: {e}")
        await update.message.reply_text(f"⚠️ Oops, my brain glitched: {str(e)}")


def main():
    print("[BrainSync] Starting Telegram Bot...")
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("connect", connect_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("[BrainSync] Bot is live! Send a message on Telegram.")
    app.run_polling()


if __name__ == "__main__":
    main()

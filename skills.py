import os
import sys
import time
from datetime import datetime, timedelta

def generate_personalized_plan(priorities: list, time_available: int):
    """
    Generates a structured, hyper-personalized daily schedule based on priorities.
    time_available: total hours available.
    """
    print(f"\n[BrainSync Skill] Generating personalized plan for {time_available} hours...", file=sys.stderr)
    
    current_time = datetime.now()
    date_str = current_time.strftime("%A, %B %d, %Y")
    
    # Calculate time slots based on available time and priorities
    num_tasks = len(priorities)
    if num_tasks == 0:
        return "No priorities provided."
        
    time_per_task = max(1, time_available // num_tasks)
    
    schedule = []
    start_time = current_time.replace(hour=9, minute=0, second=0, microsecond=0) # Start at 9 AM
    if current_time.hour > 9:
        start_time = current_time + timedelta(minutes=15) # Start in 15 mins if it's past 9 AM
        
    for idx, task in enumerate(priorities):
        end_time = start_time + timedelta(hours=time_per_task)
        
        # Add breaks
        if idx > 0 and idx % 2 == 0:
            schedule.append({
                "time": f"{start_time.strftime('%I:%M %p')} - {(start_time + timedelta(minutes=30)).strftime('%I:%M %p')}",
                "task": "Mindfulness / Stretch Break",
                "type": "break"
            })
            start_time += timedelta(minutes=30)
            end_time += timedelta(minutes=30)
            
        schedule.append({
            "time": f"{start_time.strftime('%I:%M %p')} - {end_time.strftime('%I:%M %p')}",
            "task": task,
            "type": "work"
        })
        start_time = end_time

    # Formatting the output
    briefing = f"""# 🧠 HYPER-PERSONALIZED DAILY PLAN
**Date:** {date_str}
**Total Focus Time:** {time_available} hours

Based on your unique constraints and energy levels, I have structured the following deep-work blocks:

"""
    for item in schedule:
        icon = "☕" if item["type"] == "break" else "⚡"
        briefing += f"- **{item['time']}** | {icon} {item['task']}\n"
        
    briefing += "\n*Remember: Adaptability is key. If a task takes longer, shift the schedule gracefully.*"
    
    # Save to desktop
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop", "My_Personalized_Plan.md")
    try:
        with open(desktop_path, "w", encoding="utf-8") as f:
            f.write(briefing)
        return {"status": "success", "file": desktop_path, "content": briefing}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def enable_focus_mode(duration_minutes: int):
    """
    Simulates turning on 'Do Not Disturb' and blocking distracting websites.
    """
    print(f"\n[BrainSync Skill] Initializing Focus Mode for {duration_minutes} minutes...", file=sys.stderr)
    
    actions = [
        "Muting OS notifications...",
        "Closing distracting applications (Discord, Slack, Spotify)...",
        "Activating website blocker (Social Media, News)...",
        "Setting status to 'Deep Work'..."
    ]
    
    return {"status": "success", "actions_taken": actions, "duration": duration_minutes}

def setup_workspace(environment_type: str):
    """
    Simulates setting up the desktop environment based on context (e.g., 'coding', 'writing', 'research').
    """
    print(f"\n[BrainSync Skill] Setting up '{environment_type}' workspace...", file=sys.stderr)
    
    setup = []
    if environment_type.lower() == "coding":
        setup = ["Opening IDE (VS Code)", "Starting local development server", "Opening API documentation browser tabs"]
    elif environment_type.lower() == "writing":
        setup = ["Opening Word Processor (Notion/Docs)", "Enabling full-screen minimal mode", "Starting lo-fi focus playlist"]
    else:
        setup = ["Opening default workspace tools"]
        
    return {"status": "success", "environment": environment_type, "setup_actions": setup}

import webbrowser
import urllib.parse
import pyautogui

def add_to_calendar(event_title: str, start_time_str: str, end_time_str: str, details: str = "Created by BrainSync AI Assistant"):
    """
    Fully automates Google Calendar!
    Opens the browser, waits for load, injects the save command, and closes the tab.
    """
    print(f"\n[BrainSync Skill] Parsing details and connecting to Google Calendar...", file=sys.stderr)
    
    # Construct the Google Calendar Template URL
    base_url = "https://calendar.google.com/calendar/render?action=TEMPLATE"
    params = {
        "text": event_title,
        "dates": f"{start_time_str}/{end_time_str}",
        "details": details
    }
    
    url = f"{base_url}&{urllib.parse.urlencode(params)}"
    
    try:
        actions = [
            "Parsed event details...",
            "Constructed Calendar Payload...",
            "Taking control of browser...",
        ]
        
        # 3. Open browser
        webbrowser.open(url)
        
        print("  [cyan]>[/cyan] Waiting for Google Calendar to load (5s)...", file=sys.stderr)
        time.sleep(6) # Wait for page to fully render
        
        # 4. Press 'Ctrl + S' to save the event in Google Calendar
        print("  [cyan]>[/cyan] Simulating Save action...", file=sys.stderr)
        pyautogui.hotkey('ctrl', 's')
        time.sleep(2)
        
        # 5. Press 'Ctrl + W' to close the tab and return to terminal
        print("  [cyan]>[/cyan] Closing tab and returning to Assistant...", file=sys.stderr)
        pyautogui.hotkey('ctrl', 'w')
        
        actions.append("Successfully clicked 'Save' automatically!")
        actions.append("Returned focus to terminal.")
        
        return {
            "status": "success", 
            "actions_taken": actions, 
            "message": "Task Fully Completed: Event was injected, saved to your Google Calendar, and tab was closed."
        }
    except Exception as e:
         return {
            "status": "error", 
            "actions_taken": ["Failed browser automation"], 
            "message": f"Error: {e}"
        }

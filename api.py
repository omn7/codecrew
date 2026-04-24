import sys
import json
import re
import os
from dotenv import load_dotenv
from google import genai
from skills import generate_personalized_plan, enable_focus_mode, setup_workspace, add_to_calendar

load_dotenv()

# Initialize Gemini Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "No input provided."}))
        return

    user_input = sys.argv[1]

    # Use Gemini to parse intent and extract arguments, or fallback to general chat
    prompt = f"""
    You are BrainSync, a hyper-personalized, highly-capable AI assistant with a humorous, witty, and engaging personality.
    The user has said: "{user_input}"
    
    You have access to specific system skills:
    1. 'add_to_calendar': Needs a "meeting_details" string.
    2. 'generate_plan': Needs "hours" (int) and "priorities" (list of strings).
    3. 'enable_focus': Needs "duration_minutes" (int).
    4. 'setup_workspace': Needs "environment_type" (string, e.g., 'coding', 'writing').
    
    If the user's intent matches one of these skills, output JSON with "skill" set to the skill name, and "params" containing the extracted arguments.
    If the user's intent does NOT match any of these skills, you should reply naturally as a humorous, helpful chatbot. In this case, output JSON with "skill" set to "chat" and "message" set to your witty response. Answer any question they have, or provide any code they need, but keep your personality.
    
    Output ONLY valid JSON without markdown blocks.
    Example chat response: {{"skill": "chat", "message": "Why did the programmer quit his job? Because he didn't get arrays! Anyway, the capital of France is Paris."}}
    Example calendar response: {{"skill": "add_to_calendar", "params": {{"meeting_details": "Hackathon meeting at 8pm"}}}}
    """

    try:
        models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']
        response = None
        for model_name in models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                break
            except Exception:
                continue
        
        if response is None:
            print(json.dumps({"status": "error", "message": "All AI models are currently busy. Please try again."}))
            return
        
        # Parse JSON from response
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:-3]
        elif text.startswith("```"):
            text = text[3:-3]
            
        data = json.loads(text.strip())
        
        if data["skill"] == "add_to_calendar":
            result = add_to_calendar(data["params"].get("meeting_details", "Meeting"))
            print(json.dumps(result))
        elif data["skill"] == "generate_plan":
            result = generate_personalized_plan(data["params"].get("priorities", ["Hackathon", "Demo"]), data["params"].get("hours", 6))
            print(json.dumps(result))
        elif data["skill"] == "enable_focus":
            result = enable_focus_mode(data["params"].get("duration_minutes", 60))
            print(json.dumps(result))
        elif data["skill"] == "setup_workspace":
            result = setup_workspace(data["params"].get("environment_type", "coding"))
            print(json.dumps(result))
        elif data["skill"] == "chat":
            print(json.dumps({"status": "success", "message": data.get("message", "Hmm, I'm speechless!")}))
        else:
            print(json.dumps({"status": "success", "message": data.get("message", "I did something, but I'm not sure what!")}))
            
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"BrainSync Brain Error: {str(e)}"}))

if __name__ == "__main__":
    main()

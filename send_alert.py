import os
import sys
import httpx
from google import genai
from dotenv import load_dotenv

load_dotenv()

def send_telegram_message(message):
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    
    if not bot_token or not chat_id:
        print("Error: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in .env")
        sys.exit(1)
        
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown"
    }
    
    try:
        response = httpx.post(url, json=payload, timeout=10.0)
        if response.status_code == 200:
            print("Message sent successfully!")
        else:
            print(f"Failed to send message: {response.text}")
    except Exception as e:
        print(f"Error sending message: {e}")

def main():
    if len(sys.argv) < 3:
        print("Usage: python send_alert.py <weather_description> <temp>")
        sys.exit(1)
        
    weather_desc = sys.argv[1]
    temp = sys.argv[2]
    
    # Use Gemini to generate a personalized message
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    prompt = f"""
    You are BrainSync, a personal AI assistant. 
    It is currently {temp}°C with {weather_desc}. 
    Write a short, friendly morning alert message (max 2 sentences). 
    Suggest what to bring (e.g., umbrella if raining, sunscreen/sunglasses if sunny/clear, jacket if cold).
    Keep it energetic and use emojis.
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt
        )
        message = response.text.strip()
    except Exception as e:
        print(f"Gemini error: {e}")
        # Fallback message
        message = f"⛅ Good morning! It's currently {temp}°C with {weather_desc}. Have a great day!"
        
    send_telegram_message(message)

if __name__ == "__main__":
    main()

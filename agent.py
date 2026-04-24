import time
import sys
import json
import os
from dotenv import load_dotenv
from google import genai
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.progress import Progress, SpinnerColumn, TextColumn
from skills import generate_personalized_plan, enable_focus_mode, setup_workspace, add_to_calendar

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

console = Console()

def print_header():
    console.print(Panel.fit(
        "[bold cyan]BrainSync[/bold cyan] [white]Autonomous Daily Assistant[/white] \n"
        "[dim]Hackathon Edition v1.0.0 | System Context: Enabled[/dim]",
        border_style="cyan"
    ))

def simulate_thinking(task_text, duration=1.5):
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
    ) as progress:
        progress.add_task(description=f"[cyan]{task_text}...", total=None)
        time.sleep(duration)

def parse_and_execute(user_input: str):
    if "exit" in user_input.lower() or "quit" in user_input.lower():
        console.print("[dim]Shutting down agent interface...[/dim]")
        sys.exit(0)
        
    simulate_thinking("Consulting Gemini Core", 1.5)
    
    prompt = f"""
    You are BrainSync, a hyper-personalized, highly-capable AI assistant with a humorous and engaging personality.
    The user has said: "{user_input}"
    
    You have access to specific system skills:
    1. 'add_to_calendar': Needs a "meeting_details" string.
    2. 'generate_plan': Needs "hours" (int) and "priorities" (list of strings).
    3. 'enable_focus': Needs "duration_minutes" (int).
    4. 'setup_workspace': Needs "environment_type" (string, e.g., 'coding', 'writing').
    
    If the user's intent matches one of these skills, output JSON with "skill" set to the skill name, and "params" containing the extracted arguments.
    If the user's intent does NOT match any of these skills, you should reply naturally as a humorous, helpful chatbot. In this case, output JSON with "skill" set to "chat" and "message" set to your witty response. Answer any question they have.
    
    Output ONLY valid JSON without markdown blocks.
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:-3]
        elif text.startswith("```"):
            text = text[3:-3]
            
        data = json.loads(text.strip())
        
        if data["skill"] == "add_to_calendar":
            console.print("[green]Intent recognized:[/green] Add to Calendar")
            result = add_to_calendar(data["params"].get("meeting_details", "Meeting"))
            for action in result.get("actions_taken", []):
                console.print(f"  [cyan]>[/cyan] {action}")
                time.sleep(0.5)
            console.print(f"[bold green]✔ {result.get('message', 'Done.')}[/bold green]")
            
        elif data["skill"] == "generate_plan":
            console.print("[green]Intent recognized:[/green] Generate Daily Plan")
            result = generate_personalized_plan(data["params"].get("priorities", ["Hackathon", "Demo"]), data["params"].get("hours", 6))
            if result["status"] == "success":
                console.print(Panel(result["content"], title="Your Personalized Plan", border_style="green"))
                console.print(f"[bold green]✔[/bold green] Plan successfully exported to: [underline]{result['file']}[/underline]")
                
        elif data["skill"] == "enable_focus":
            console.print("[green]Intent recognized:[/green] Enable Focus Mode")
            result = enable_focus_mode(data["params"].get("duration_minutes", 60))
            for action in result.get("actions_taken", []):
                console.print(f"  [cyan]>[/cyan] {action}")
                time.sleep(0.5)
            console.print(f"[bold green]✔ Focus Mode active for {result.get('duration')} minutes.[/bold green]")
            
        elif data["skill"] == "setup_workspace":
            console.print("[green]Intent recognized:[/green] Setup Workspace")
            result = setup_workspace(data["params"].get("environment_type", "coding"))
            for action in result.get("setup_actions", []):
                console.print(f"  [cyan]>[/cyan] {action}")
            console.print("[bold green]✔ Workspace Ready.[/bold green]")
            
        elif data["skill"] == "chat":
            console.print(f"\n[bold magenta]BrainSync:[/bold magenta] {data.get('message', '')}")
            
    except Exception as e:
        console.print(f"[bold red]Error parsing response from Gemini:[/bold red] {e}")

def main():
    console.clear()
    print_header()
    console.print("\n[italic]Hello! I am your hyper-personalized AI assistant.[/italic]")
    console.print("[italic]I can plan your day, manage your OS environment, block distractions, and answer anything![/italic]\n")
    
    while True:
        try:
            command = Prompt.ask("\n[bold magenta]User[/bold magenta]")
            parse_and_execute(command)
        except KeyboardInterrupt:
            console.print("\n[dim]Shutting down...[/dim]")
            break
        except Exception as e:
            console.print(f"[bold red]Error:[/bold red] {e}")

if __name__ == "__main__":
    main()

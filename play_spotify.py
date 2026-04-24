import os
import webbrowser
import json

def play_spotify():
    # Read config from backend folder
    # Assuming script is in root and config is in backend/
    base_dir = os.path.dirname(__file__)
    config_path = os.path.join(base_dir, 'backend', 'config.json')
    playlist_id = '37i9dQZF1DXcBWIGoYBM5M' # default: Lofi Beats
    
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
                playlist_id = config.get('spotify_playlist_id', playlist_id)
        except Exception as e:
            print(f"Error reading config: {e}")

    print(f"Opening Spotify Playlist: {playlist_id}...")
    # Attempting to open Spotify Windows app
    result = os.system(f"start spotify:playlist:{playlist_id}")
    
    # If it fails, fallback to web player
    if result != 0:
        print("Falling back to web browser...")
        webbrowser.open(f"https://open.spotify.com/playlist/{playlist_id}")

if __name__ == "__main__":
    play_spotify()

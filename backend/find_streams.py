"""Find live traffic camera streams from India/Delhi on YouTube."""
import yt_dlp
import json

queries = [
    'ytsearch5:live traffic camera india delhi 24/7',
    'ytsearch5:live CCTV road india highway camera',
    'ytsearch3:live webcam india traffic',
]

results = []
ydl_opts = {'quiet': True, 'no_warnings': True}

for q in queries:
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(q, download=False)
            for e in info.get('entries', []):
                vid_id = e.get('id', '')
                title = e.get('title', '')
                is_live = e.get('is_live', False)
                url = f"https://www.youtube.com/watch?v={vid_id}"
                results.append({
                    'id': vid_id,
                    'title': title,
                    'is_live': is_live,
                    'url': url
                })
                print(f"{'LIVE' if is_live else 'VOD '} | {vid_id} | {title[:60]}")
    except Exception as ex:
        print(f"Error: {ex}")

# Filter live streams
live = [r for r in results if r['is_live']]
print(f"\nFound {len(live)} live streams out of {len(results)} total")
for l in live:
    print(f"  LIVE: {l['url']} - {l['title']}")

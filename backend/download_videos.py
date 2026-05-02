"""Download real Delhi traffic footage from user-provided YouTube URLs."""
import os
import sys

try:
    import yt_dlp
except ImportError:
    print("Installing yt-dlp...")
    os.system("pip install yt-dlp --quiet")
    import yt_dlp

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

VIDEOS = {
    'cam_ito_junction.mp4': {
        'url': 'https://www.youtube.com/watch?v=Esoaz8m7dkA',
        'desc': 'ITO Junction traffic footage'
    },
    'cam_aiims_flyover.mp4': {
        'url': 'https://www.youtube.com/shorts/QEvMRZ1OX_A',
        'desc': 'AIIMS Flyover traffic footage'
    },
}

def download_all():
    for filename, info in VIDEOS.items():
        dest = os.path.join(BACKEND_DIR, filename)
        if os.path.exists(dest):
            size = os.path.getsize(dest) / (1024*1024)
            print(f"  [OK] {info['desc']}: exists ({size:.1f} MB)")
            continue
        print(f"  [DL] {info['desc']}: {info['url']}")
        try:
            ydl_opts = {
                'outtmpl': dest.replace('.mp4', '.%(ext)s'),
                'format': 'best[height<=480][ext=mp4]/best[height<=480]/best',
                'quiet': False,
                'no_warnings': True,
                'merge_output_format': 'mp4',
                'postprocessors': [{
                    'key': 'FFmpegVideoConvertor',
                    'preferedformat': 'mp4',
                }],
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([info['url']])
            
            # Check if file was saved with different extension and rename
            for ext in ['mp4', 'webm', 'mkv']:
                candidate = dest.replace('.mp4', f'.{ext}')
                if os.path.exists(candidate) and candidate != dest:
                    os.rename(candidate, dest)
                    break
            
            if os.path.exists(dest):
                size = os.path.getsize(dest) / (1024*1024)
                print(f"       Saved: {dest} ({size:.1f} MB)")
            else:
                print(f"  [WARN] File not found after download, checking alternatives...")
                # yt-dlp may have saved with a slightly different name
                for f in os.listdir(BACKEND_DIR):
                    if f.startswith(filename.replace('.mp4', '')) and not f.endswith('.part'):
                        src = os.path.join(BACKEND_DIR, f)
                        os.rename(src, dest)
                        print(f"       Renamed {f} -> {filename}")
                        break
        except Exception as e:
            print(f"  [ERR] {info['desc']}: {e}")

if __name__ == '__main__':
    print("[SAARTHI] Downloading Delhi traffic camera footage...")
    download_all()
    print("Done.")

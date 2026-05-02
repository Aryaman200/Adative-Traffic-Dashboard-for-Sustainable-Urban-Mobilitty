from playwright.sync_api import sync_playwright
import time
import os

def take_screenshots():
    print("Initializing Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        
        print("Navigating to http://localhost:5000...")
        try:
            page.goto("http://localhost:5000", wait_until="networkidle")
        except Exception as e:
            print(f"Error navigating: {e}")
            return
            
        # Give the map, videos, and UI elements time to load completely
        print("Waiting for map and video to load...")
        time.sleep(10)
        
        # Dashboard screenshot
        print("Capturing Dashboard...")
        os.makedirs(".github/screenshots", exist_ok=True)
        page.screenshot(path=".github/screenshots/dashboard.png")
        
        # Click Signal Control
        print("Capturing Signal Control...")
        page.click("button[data-dash='signals']")
        time.sleep(2)
        page.screenshot(path=".github/screenshots/signals.png")
        
        # Click AI Predictor
        print("Capturing AI Predictor...")
        page.click("button[data-dash='prediction']")
        time.sleep(1)
        # run a prediction
        page.click("#btn-ml-predict")
        time.sleep(3)
        page.screenshot(path=".github/screenshots/predictor.png")
        
        browser.close()
        print("Screenshots saved in .github/screenshots/")

if __name__ == "__main__":
    take_screenshots()

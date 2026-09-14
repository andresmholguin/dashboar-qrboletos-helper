import asyncio
from playwright.async_api import async_playwright
import os
import struct

svg_code = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" rx="20" fill="#030712"/>
  <rect x="12" y="12" width="76" height="76" rx="16" fill="rgba(16, 185, 129, 0.12)" stroke="#059669" stroke-width="4.5"/>
  <rect x="23" y="54" width="10" height="24" rx="2.5" fill="#10B981"/>
  <rect x="38" y="44" width="10" height="34" rx="2.5" fill="#10B981"/>
  <rect x="53" y="34" width="10" height="44" rx="2.5" fill="#10B981"/>
  <rect x="68" y="24" width="10" height="54" rx="2.5" fill="#10B981"/>
  <path d="M 19 46 Q 44 41 62 23" fill="none" stroke="#34D399" stroke-width="5" stroke-linecap="round"/>
  <polygon points="54,20 71,15 66,32" fill="#34D399" stroke="#34D399" stroke-width="1.5" stroke-linejoin="round"/>
</svg>"""

html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      background: #030712;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }}
    .icon-wrapper {{
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }}
  </style>
</head>
<body>
  <div class="icon-wrapper">
    {svg_code}
  </div>
</body>
</html>"""

def png_to_ico(png_path, ico_path):
    with open(png_path, "rb") as f:
        png_data = f.read()
    # 1 image, width=48, height=48, 32 bpp
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", 48, 48, 0, 0, 1, 32, len(png_data), 22)
    with open(ico_path, "wb") as f:
        f.write(header + entry + png_data)

async def main():
    os.makedirs("public", exist_ok=True)
    os.makedirs("src/app", exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # 512x512 icon for Android and PWA splash
        page = await browser.new_page(viewport={"width": 512, "height": 512}, device_scale_factor=1)
        await page.set_content(html_content)
        await page.screenshot(path="public/icon-512.png")
        await page.screenshot(path="src/app/icon.png")
        await page.close()

        # 192x192 icon for Android home screen
        page = await browser.new_page(viewport={"width": 192, "height": 192}, device_scale_factor=1)
        await page.set_content(html_content)
        await page.screenshot(path="public/icon-192.png")
        await page.close()

        # 180x180 for Apple touch icon (iOS & Safari)
        page = await browser.new_page(viewport={"width": 180, "height": 180}, device_scale_factor=1)
        await page.set_content(html_content)
        await page.screenshot(path="public/apple-touch-icon.png")
        await page.screenshot(path="src/app/apple-icon.png")
        await page.close()

        # 48x48 for favicon
        page = await browser.new_page(viewport={"width": 48, "height": 48}, device_scale_factor=1)
        await page.set_content(html_content)
        await page.screenshot(path="public/favicon-48.png")
        await page.close()

        await browser.close()
        
        png_to_ico("public/favicon-48.png", "src/app/favicon.ico")
        png_to_ico("public/favicon-48.png", "public/favicon.ico")
        print("OK: Todos los iconos generados correctamente.")

if __name__ == "__main__":
    asyncio.run(main())

# Run this Python script ONCE to generate placeholder icons
# Save it as: create_icons.py (run from the project root)

from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs("extension/icons", exist_ok=True)

for size in [16, 48, 128]:
    img = Image.new('RGB', (size, size), color="#0d00ff")
    draw = ImageDraw.Draw(img)
    
    # Draw a simple "B" for "Breakdown"
    font_size = size // 2
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "Break"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    draw.text((x, y), text, fill="white", font=font)
    
    img.save(f"extension/icons/icon{size}.png")
    print(f"Created icon{size}.png")
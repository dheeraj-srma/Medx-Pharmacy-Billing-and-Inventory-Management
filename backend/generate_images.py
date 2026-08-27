"""
Generate placeholder product images for all products in the database.
Creates colorful, professional-looking placeholder images with product initials.
"""
import os
import sys

# Check if Pillow is installed
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Installing Pillow...")
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image, ImageDraw, ImageFont

from sqlalchemy import create_engine, text

# Color palette - medical/pharmacy themed
COLORS = [
    ("#4F46E5", "#818CF8"),  # Indigo
    ("#0891B2", "#67E8F9"),  # Cyan
    ("#059669", "#6EE7B7"),  # Emerald
    ("#7C3AED", "#C4B5FD"),  # Violet
    ("#DB2777", "#F9A8D4"),  # Pink
    ("#EA580C", "#FDBA74"),  # Orange
    ("#0284C7", "#7DD3FC"),  # Sky
    ("#4338CA", "#A5B4FC"),  # Indigo deep
    ("#0D9488", "#5EEAD4"),  # Teal
    ("#9333EA", "#D8B4FE"),  # Purple
    ("#DC2626", "#FCA5A5"),  # Red
    ("#2563EB", "#93C5FD"),  # Blue
]

def get_initials(name: str) -> str:
    """Get up to 2 initials from a product name."""
    words = name.strip().split()
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    return name[:2].upper()

def generate_product_image(product_id: int, product_name: str, output_dir: str):
    """Generate a single product placeholder image."""
    size = 200
    img = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(img)
    
    # Pick color based on product_id
    bg_color, accent_color = COLORS[product_id % len(COLORS)]
    
    # Draw gradient-like background (solid with lighter bottom)
    draw.rectangle([0, 0, size, size], fill=bg_color)
    # Add a subtle lighter rectangle at bottom
    draw.rectangle([0, size//2, size, size], fill=accent_color + "33")
    
    # Draw a pill/capsule shape in the center
    pill_color = accent_color
    cx, cy = size // 2, size // 2 - 10
    pill_w, pill_h = 60, 28
    draw.rounded_rectangle(
        [cx - pill_w, cy - pill_h, cx + pill_w, cy + pill_h],
        radius=pill_h,
        fill=pill_color,
        outline="white",
        width=2
    )
    # Draw a line in the middle of the pill
    draw.line([cx, cy - pill_h + 4, cx, cy + pill_h - 4], fill="white", width=2)
    
    # Draw product initials below the pill
    initials = get_initials(product_name)
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 24)
        except:
            font = ImageFont.load_default()
    
    # Get text bounding box for centering
    bbox = draw.textbbox((0, 0), initials, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    text_x = (size - tw) // 2
    text_y = cy + pill_h + 12
    
    draw.text((text_x, text_y), initials, fill="white", font=font)
    
    # Add a thin border
    draw.rectangle([0, 0, size-1, size-1], outline=accent_color, width=2)
    
    # Save
    filepath = os.path.join(output_dir, f"prod_{product_id}.png")
    img.save(filepath, "PNG")


def main():
    # Connect to Supabase DB
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres.ucjlmzoihumquwksefla:Dheeraj%25402004@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
    )
    
    engine = create_engine(db_url)
    
    output_dir = os.path.join(os.path.dirname(__file__), "uploads", "products")
    os.makedirs(output_dir, exist_ok=True)
    
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, name, image_url FROM products ORDER BY id"))
        products = result.fetchall()
    
    print(f"Generating {len(products)} product placeholder images...")
    
    for prod_id, name, image_url in products:
        if image_url and f"prod_{prod_id}.png" in image_url:
            generate_product_image(prod_id, name, output_dir)
            print(f"  [OK] prod_{prod_id}.png - {name}")
    
    print(f"\nDone! {len(products)} images saved to {output_dir}")


if __name__ == "__main__":
    main()

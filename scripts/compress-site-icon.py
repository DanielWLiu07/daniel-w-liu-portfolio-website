"""Create a real, small multi-resolution ICO; preserve the original artwork."""
from pathlib import Path
from PIL import Image

target = Path('app/favicon.ico')
source = Path('assets-original/favicon-source.png')
source.parent.mkdir(parents=True, exist_ok=True)
if not source.exists():
    source.write_bytes(target.read_bytes())
image = Image.open(source).convert('RGBA')
# Preserve aspect ratio on a transparent square, then encode practical tab sizes.
square = Image.new('RGBA', (max(image.size), max(image.size)))
square.paste(image, ((square.width-image.width)//2, (square.height-image.height)//2))
square.save(target, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
assert Image.open(target).format == 'ICO'
assert target.stat().st_size < 20000
print(f'Icon: {source.stat().st_size} → {target.stat().st_size} bytes')

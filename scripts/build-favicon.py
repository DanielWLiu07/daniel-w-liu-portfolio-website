"""Build standard browser icon sizes from the preserved full-resolution artwork."""
from PIL import Image, ImageOps
source = Image.open('assets/source/favicon.png').convert('RGBA')
square = ImageOps.pad(source, (256, 256), color=(0, 0, 0, 0))
square.save('app/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])

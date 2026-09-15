"""Delivery-only bitmap strike; retains glyphs, outlines and layout metrics.

Requires fonttools[woff] and Pillow. The original 911-ppem face is retained
for editing/capture; live canvas lettering is rasterized at 130–190 px.
"""
from io import BytesIO
from pathlib import Path
from fontTools.ttLib import TTFont
from PIL import Image

source = Path('public/fonts/KatieRoze-web.woff2')
target = Path('public/fonts/KatieRoze-display-512.woff2')
font = TTFont(source)
metrics = dict(font['hmtx'].metrics)
strikes = {}
for strike in font['sbix'].strikes.values():
    ppem = min(strike.ppem, 512)
    scale = ppem / strike.ppem
    for glyph in strike.glyphs.values():
        if not glyph.imageData or glyph.graphicType != 'png ':
            continue
        image = Image.open(BytesIO(glyph.imageData)).convert('RGBA')
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
        # Palette retains translucent watercolor edges with substantially less PNG data.
        image = image.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
        data = BytesIO()
        image.save(data, format='PNG', optimize=True)
        glyph.imageData = data.getvalue()
        glyph.originOffsetX = round(glyph.originOffsetX * scale)
        glyph.originOffsetY = round(glyph.originOffsetY * scale)
    strike.ppem = ppem
    strikes[ppem] = strike
font['sbix'].strikes = strikes
font.save(target)
assert TTFont(target)['hmtx'].metrics == metrics
assert target.stat().st_size < source.stat().st_size
print(f'{source.stat().st_size} -> {target.stat().st_size} bytes; layout metrics unchanged')

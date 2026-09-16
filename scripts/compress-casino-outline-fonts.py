"""Lossless WOFF2 delivery copies: all glyphs, outlines and layout retained."""
from pathlib import Path
from fontTools.ttLib import TTFont

for source, target in [
    ('public/fonts/Atop.ttf', 'public/fonts/Atop.woff2'),
    ('public/fonts/ARCADECLASSIC.TTF', 'public/fonts/ARCADECLASSIC.woff2'),
    ('public/shared/fonts/weddingday-font/WeddingdayPersonalUseRegular-1Gvo0.ttf', 'public/fonts/Weddingday.woff2'),
]:
    original = TTFont(source, recalcTimestamp=False)
    cmap, metrics, glyphs = original.getBestCmap(), dict(original['hmtx'].metrics), original.getGlyphOrder()
    original.flavor = 'woff2'
    original.save(target)
    delivery = TTFont(target)
    assert delivery.getBestCmap() == cmap
    assert delivery['hmtx'].metrics == metrics
    assert delivery.getGlyphOrder() == glyphs
    for name in glyphs:
        assert original['glyf'][name].compile(original['glyf']) == delivery['glyf'][name].compile(delivery['glyf'])
    for table in ['GSUB', 'GPOS', 'kern']:
        if table in original:
            assert original[table].compile(original) == delivery[table].compile(delivery)
    print(f'{source}: {Path(source).stat().st_size} → {Path(target).stat().st_size} bytes')

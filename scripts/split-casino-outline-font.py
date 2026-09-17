"""Split Fredericka without changing outlines or dropping supported characters."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

root = Path(__file__).resolve().parents[1]
source = root / 'public/fonts/FrederickatheGreat-Regular.woff2'
font = TTFont(source)
all_chars = set(font.getBestCmap())
core = all_chars & (set(range(128)) | {0xA0, 0xE9, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026})
for name, chars in [('core', core), ('extended', all_chars - core)]:
    output = source.with_name(f'FrederickatheGreat-{name}-v1.woff2')
    face = TTFont(source)
    options = subset.Options()
    job = subset.Subsetter(options=options)
    job.populate(unicodes=chars)
    job.subset(face)
    face.flavor = 'woff2'
    face.save(output)
    decoded = TTFont(output)
    assert set(decoded.getBestCmap()) == chars
    original_glyphs, subset_glyphs = font.getGlyphSet(), decoded.getGlyphSet()
    for code in chars:
        original_name, subset_name = font.getBestCmap()[code], decoded.getBestCmap()[code]
        before, after = DecomposingRecordingPen(original_glyphs), DecomposingRecordingPen(subset_glyphs)
        original_glyphs[original_name].draw(before)
        subset_glyphs[subset_name].draw(after)
        assert before.value == after.value, f'Outline changed: {code:X}'
        assert font['hmtx'][original_name] == decoded['hmtx'][subset_name]
    print(name, output.stat().st_size, ','.join(f'U+{c:X}' for c in sorted(chars)))

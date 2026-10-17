"""Optional pixel-level test for repeat-y artwork. Requires Pillow.

Run: python -m pip install pillow
     python scripts/check-background-loop-edges.py

This checks the difference between the FIRST and LAST row of each image.
Passing this metric prevents a hard-color border but cannot guarantee there
are no visually repeated buildings or that an artist has matched structures.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

parser = argparse.ArgumentParser()
parser.add_argument('images', nargs='*')
parser.add_argument('--max-mean', type=float, default=8)
parser.add_argument('--max-channel', type=int, default=25)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
images = [Path(x) for x in args.images] if args.images else sorted((root/'public/images/backgrounds/demo').glob('*.webp'))
if not images:
    raise SystemExit('FAIL no background files')
failed = False
for path in images:
    with Image.open(path) as source:
        img = source.convert('RGB')
        width, height = img.size
        top = img.crop((0, 0, width, 1))
        bottom = img.crop((0, height-1, width, height))
        delta = ImageChops.difference(top, bottom)
        mean = sum(ImageStat.Stat(delta).mean) / 3
        largest = max(channel[1] for channel in delta.getextrema())
        status = 'PASS' if mean <= args.max_mean and largest <= args.max_channel else 'FAIL'
        print(f'{status} {path.name} {width}x{height}: seam RGB mean={mean:.2f}, max={largest}')
        failed |= status == 'FAIL'
if failed:
    raise SystemExit(1)
print('Pixel edge check passed; inspect the scrolling artwork for repeating landmarks manually.')

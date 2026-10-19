#!/usr/bin/env python3
"""Generate UNRELEASED WebP base + mobileLow candidates from artist source.

This script never promotes artwork, edits catalog, changes saves or writes into
production folders unless the artist explicitly selects an output location.
Use with an owned, cleared, seamless vertical top-down source at >=1024x2048.
Example: python scripts/prepare-background-assets.py --source alpha_master.png --id alpha_coast_v1 --out ../BG3_Staging
"""
import argparse
import json
import re
from pathlib import Path
from PIL import Image, ImageChops, ImageStat


def seam_stats(im):
    rgb = im.convert('RGB')
    w,h=rgb.size
    d=ImageChops.difference(rgb.crop((0,0,w,1)),rgb.crop((0,h-1,w,h)))
    return sum(ImageStat.Stat(d).mean)/3, max(x[1] for x in d.getextrema())


def make_variant(img, size, output, quality):
    resized=img.resize(size, Image.Resampling.LANCZOS)
    resized.save(output,'WEBP',quality=quality,method=6)
    # Lossy resizing can slightly unmatch edges even when the source is seamless.
    mean,peak=seam_stats(Image.open(output))
    if mean>8 or peak>25:
        output.unlink(missing_ok=True)
        raise ValueError(f'Encoding broke the Y seam for {size}: mean={mean:.2f}, peak={peak}. Return to artist/source; no auto seam painting.')
    return {'file':output.name,'width':size[0],'height':size[1],'seamMean':round(mean,2),'seamMax':peak,'kiB':round(output.stat().st_size/1024,1)}


def run(args):
    if not re.fullmatch(r'[a-z][a-z0-9_]{2,63}',args.id): raise ValueError('Invalid asset ID: use lowercase letters/underscores/digits')
    source=Path(args.source).resolve()
    if not source.is_file(): raise FileNotFoundError(source)
    out=Path(args.out).resolve()/args.id
    if out.exists() and any(out.iterdir()) and not args.overwrite: raise ValueError('Destination exists; inspect existing files or pass --overwrite intentionally')
    with Image.open(source) as raw:
        w,h=raw.size
        if w<1024 or h<2048: raise ValueError(f'Source {w}x{h} too small. Minimum 1024x2048.')
        if abs(w/h-.5)>.01: raise ValueError(f'Source aspect {w}x{h} is not near 1:2; crop in your artwork editor. No silent stretching.')
        img=raw.convert('RGB')
        mean,peak=seam_stats(img)
        if mean>8 or peak>25: raise ValueError(f'Y seam not approved: mean={mean:.2f}, max={peak}. Fix the master artwork first.')
        out.mkdir(parents=True,exist_ok=True)
        variants=[make_variant(img,(1024,2048),out/f'{args.id}.webp',args.quality),
                  make_variant(img,(512,1024),out/f'{args.id}_low.webp',args.low_quality)]
        data={'artId':args.id,'sourceFilename':source.name,'state':'STAGING_UNREVIEWED',
              'commercialRights':'NOT_VERIFIED','humanVisualReview':'PENDING',
              'sourceDimensions':[w,h],'seamMean':round(mean,2),'seamMax':peak,
              'variants':variants,'next':'Get licensing + center-lane visual review + QA, then explicitly register in BackgroundCatalog.'}
        (out/'staging.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(data,ensure_ascii=False,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--source',required=True)
    p.add_argument('--id',required=True)
    p.add_argument('--out',default='../BG3_Staging')
    p.add_argument('--quality',type=int,default=86)
    p.add_argument('--low-quality',type=int,default=80)
    p.add_argument('--overwrite',action='store_true')
    opts=p.parse_args()
    if not 65<=opts.quality<=95 or not 65<=opts.low_quality<=95:
        p.error('WEBP quality must be in [65,95]')
    run(opts)

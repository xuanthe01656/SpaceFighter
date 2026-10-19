#!/usr/bin/env python3
"""BG.3 offline artwork QA. No Firebase, network or writes into source art.

Usage (from client folder):
    python scripts/background-art-qa.py --out ../BG3_Art_QA

Requires Pillow. Validates committed deterministic asset manifest, seam,
visually scores the central combat lane and exports JPG overlays for a HUMAN
review. It cannot certify ownership, readability or technical art quality.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter, ImageDraw, ImageFont, ImageStat

CLIENT = Path(__file__).resolve().parents[1]
MANIFEST = CLIENT / 'docs' / 'BG3_BACKGROUND_ASSET_MANIFEST.json'


def edge_metrics(img):
    rgb = img.convert('RGB')
    w, h = rgb.size
    upper = rgb.crop((0, 0, w, 1))
    lower = rgb.crop((0, h - 1, w, h))
    diff = ImageChops.difference(upper, lower)
    mean = sum(ImageStat.Stat(diff).mean) / 3
    peak = max(ext[1] for ext in diff.getextrema())
    return round(mean, 3), int(peak)


def visual_complexity(img):
    rgb = img.convert('RGB').resize((256, 512), Image.Resampling.BILINEAR)
    edge = rgb.convert('L').filter(ImageFilter.FIND_EDGES)
    # HUD and ship impact readability; assess center lane only for artist QA.
    box = (int(0.26*256), int(0.15*512), int(0.74*256), int(0.84*512))
    mid = edge.crop(box)
    left = edge.crop((0, int(.15*512), int(.20*256), int(.84*512)))
    right = edge.crop((int(.80*256), int(.15*512),256,int(.84*512)))
    center = ImageStat.Stat(mid).mean[0]
    sides = (ImageStat.Stat(left).mean[0] + ImageStat.Stat(right).mean[0])/2
    return round(center, 2), round(sides, 2)


def annotated_preview(image, label, source, destination):
    thumbnail = image.convert('RGB').copy()
    thumbnail.thumbnail((340, 610), Image.Resampling.LANCZOS)
    w, h = thumbnail.size
    overlay = Image.new('RGBA', (w,h), (0,0,0,0))
    painter = ImageDraw.Draw(overlay)
    painter.rectangle((int(.26*w), int(.15*h), int(.74*w), int(.84*h)),
                      fill=(20,220,145,23), outline=(45,245,176,220), width=2)
    painter.rectangle((0, 0, w-1, int(.10*h)), fill=(225,54,65,45), outline=(243,91,95,150), width=1)
    painter.rectangle((0, int(.80*h), w-1, h-1), fill=(225,148,54,20), outline=(250,162,71,150), width=1)
    thumbnail = Image.alpha_composite(thumbnail.convert('RGBA'), overlay).convert('RGB')
    thumbnail.save(destination, 'JPEG', quality=90)
    return thumbnail


def run(out):
    if not MANIFEST.is_file():
        raise SystemExit('ERROR: committed manifest missing. Run npm run backgrounds:manifest first.')
    contents = json.loads(MANIFEST.read_text(encoding='utf-8'))
    assets = contents.get('assets', [])
    results=[]
    previews=[]
    out.mkdir(parents=True, exist_ok=True)
    for item in assets:
        relative = item['src'].lstrip('/')
        source=CLIENT / 'public' / relative
        if not source.resolve().is_relative_to((CLIENT/'public').resolve()):
            raise SystemExit(f'Unsafe path {relative}')
        raw=source.read_bytes()
        verified_hash=hashlib.sha256(raw).hexdigest()==item['sha256']
        with Image.open(source) as src:
            img=src.convert('RGBA')
            rgb=src.convert('RGB')
            w,h=src.size
            mean,peak=edge_metrics(rgb)
            center,sides=visual_complexity(rgb)
            alpha_min,alpha_max=img.getchannel('A').getextrema()
            valid = verified_hash and (w,h)==(item['width'], item['height']) and mean<=8 and peak<=25
            if item['role']=='base' and alpha_min<255:
                valid = False
            result={
                'catalogId':item['backgroundId'], 'layerId':item['layerId'],
                'variant':item['quality'], 'src':item['src'], 'width':w, 'height':h,
                'compressedKiB':round(len(raw)/1024,1), 'sha256Verified':verified_hash,
                'seamMeanRgb':mean, 'seamMaxChannel':peak, 'centerEdgeActivity':center,
                'sideEdgeActivity':sides, 'centerToSideActivityRatio':round(center/max(sides,0.1),2),
                'opaqueBase':alpha_min==255,
                'technicalPass':valid,
                'rightsStatus':item['licenseStatus'],
                'releaseReady': valid and item['catalogStatus']=='production' and item['licenseStatus']=='approved',
            }
            results.append(result)
            if item['quality']=='base':
                preview_file=out / (item['backgroundId']+'_'+item['layerId']+'_safezone.jpg')
                thumbnail=annotated_preview(img, item['backgroundId'], source, preview_file)
                previews.append((item,thumbnail,center,sides))
    if previews:
        padding=18
        box_w=max(im.width for _,im,_,_ in previews)+2*padding
        box_h=max(im.height for _,im,_,_ in previews)+88
        sheet=Image.new('RGB',(box_w*len(previews),box_h),(15,27,40))
        d=ImageDraw.Draw(sheet)
        for i,(asset,img,center,sides) in enumerate(previews):
            left=i*box_w+padding
            sheet.paste(img,(left,55))
            d.text((left,12),f"{asset['backgroundId']} / {asset['layerId']}", fill=(237,243,250))
            d.text((left,30),f"Central detail {center:.1f} | Side {sides:.1f}", fill=(135,209,236))
            d.text((left,55+img.height+8),'GREEN: combat lane / RED: HUD / ORANGE: player',fill=(220,225,231))
        sheet.save(out/'BG3_ART_SAFEZONE_CONTACT.jpg','JPEG',quality=89)
    report={
        'schema':'sf-bg3-art-qa/v1', 'sourceCatalogVersion':contents['catalogVersion'],
        'checkedAssets':len(results), 'technicalPassed':sum(x['technicalPass'] for x in results),
        'humanApprovalRequired':True,
        'note':'Demo art is prototype-only. Automated PASS never authorizes commercial distribution.',
        'assets':results,
    }
    (out/'BG3_ART_QA_REPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"BG3 QA: {report['technicalPassed']}/{len(results)} technical PASS. Manual rights/composition review required.")
    for x in results:
        print(f"  {'PASS' if x['technicalPass'] else 'FAIL'} {x['src']} seam mean {x['seamMeanRgb']}, max {x['seamMaxChannel']}, center/side edge {x['centerToSideActivityRatio']}")
    print('Report:',out/'BG3_ART_QA_REPORT.json')
    print('Contact sheet:',out/'BG3_ART_SAFEZONE_CONTACT.jpg')
    return all(x['technicalPass'] for x in results)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default=str(CLIENT.parent/'BG3_Art_QA'))
    args=parser.parse_args()
    raise SystemExit(0 if run(Path(args.out)) else 1)

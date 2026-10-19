#!/usr/bin/env python3
"""Offline technical Y-seam prototype repair. NOT a substitute for artist inpainting.

No content generation, no API, no source overwrite. Crops a 9:16 image to a centered
1:2 region, blends conflicting Y borders in low/high spatial-frequency bands, and
scales to a prototype 1024x2048 PNG. Enlarged pixels are NOT new artistic detail.
Metadata explicitly records the original resolution and non-release status.
"""
import argparse, json
from pathlib import Path
import numpy as np
import cv2
from PIL import Image


def edge_difference(rgb):
    a=np.asarray(rgb.convert('RGB'),np.int16)
    d=np.abs(a[0]-a[-1]);return {'mean':round(float(d.mean()),3),'peak':int(d.max())}


def smooth(t): return t*t*(3-2*t)


def make_periodic(src, lowBand=160, highBand=48, blurSigma=13):
    src=np.asarray(src.convert('RGB')).astype('float32')
    height,width,_=src.shape
    lowBand=min(int(lowBand),height//4); highBand=min(int(highBand),height//4)
    if not (highBand>1 and lowBand>highBand):raise ValueError('Bands must satisfy: 1 < highBand < lowBand <= height/4')
    low=cv2.GaussianBlur(src,(0,0),sigmaX=blurSigma,sigmaY=blurSigma)
    hi=src-low
    def stitch(layer,band):
        out=layer.copy()
        y=np.arange(band,dtype='float32')
        weight=(0.5*(1-smooth(y/(band-1))))[:,None,None]
        a=layer[:band]; b=layer[-band:][::-1]
        out[:band]=a*(1-weight)+b*weight
        out[-band:]=(b*(1-weight)+a*weight)[::-1]
        return out
    merged=stitch(low,lowBand)+stitch(hi,highBand)
    merged=np.clip(np.rint(merged),0,255).astype('uint8')
    # Bit-for-bit periodic seam: both outer rows are equal; no abrupt color edge.
    avg=np.uint8((merged[0].astype('uint16')+merged[-1].astype('uint16'))//2)
    merged[0]=avg; merged[-1]=avg
    return Image.fromarray(merged,'RGB')


def repair(source, out, lowBand, highBand):
    source=Path(source).resolve();out=Path(out).resolve()
    with Image.open(source) as image:
        original=image.convert('RGB'); w,h=original.size
    h_even=h-(h%2); w_crop=h_even//2
    if w<w_crop: raise ValueError(f'Original too narrow to center-crop to 1:2 without extrapolating: {w}x{h}')
    x0=(w-w_crop)//2
    cropped=original.crop((x0,0,x0+w_crop,h_even))
    corrected=make_periodic(cropped,lowBand,highBand)
    # Resize to the BG3 staging size. These pixels are interpolated, not real HD master artwork.
    scaled=corrected.resize((1024,2048),Image.Resampling.LANCZOS)
    scaled=make_periodic(scaled,lowBand=12,highBand=4,blurSigma=2)
    out.parent.mkdir(parents=True,exist_ok=True);scaled.save(out,'PNG',optimize=True)
    report={'sourceFile':source.name,'originalDimensions':[w,h],'centerCrop':{'x0':x0,'y0':0,'width':w_crop,'height':h_even},
            'croppedDimensions':list(cropped.size),'outputDimensions':list(scaled.size),
            'seamBefore':edge_difference(cropped),'seamAfterNative':edge_difference(corrected),'seamAfterUpscale':edge_difference(scaled),
            'technique':{'blend':'low-high-frequency symmetric wrap','lowBandPx':lowBand,'highBandPx':highBand,'sigma':13},
            'provenanceStatus':'DERIVED_UPSCALED_FROM_SMALL_REFERENCE','commercialArtStatus':'NOT_APPROVED',
            'humanQA':'REQUIRED: look for morphing buildings and repeated landmarks at the wrap seam',
            'rightsStatus':'NOT_VERIFIED'}
    (out.with_suffix('.provenance.json')).write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',required=True)
    p.add_argument('--low-band',type=int,default=160);p.add_argument('--high-band',type=int,default=48)
    a=p.parse_args();repair(a.source,a.out,a.low_band,a.high_band)

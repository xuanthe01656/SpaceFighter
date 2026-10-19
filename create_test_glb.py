"""Builds one lightweight non-commercial QA glTF 2.0 GLB with 7 named clips.
Does not require Blender or third-party Python libraries. A geometry-only test asset.
"""
import json
import struct
from pathlib import Path

out = Path(__file__).parent / 'client/public/models/visuals/enemy/p1_small.glb'
out.parent.mkdir(parents=True, exist_ok=True)
blob = bytearray()
views=[]
accessors=[]

def put(data, stride_type, count, component_type, shape, minval=None, maxval=None):
    while len(blob)%4:blob.append(0)
    idx=len(views)
    off=len(blob)
    blob.extend(data)
    views.append({'buffer':0,'byteOffset':off,'byteLength':len(data)})
    acc={'bufferView':idx,'componentType':component_type,'count':count,'type':shape}
    if minval is not None:acc['min']=minval
    if maxval is not None:acc['max']=maxval
    accessors.append(acc)
    return len(accessors)-1

vertices=[
    (0.0, 0.14, -1.0), (-0.25, 0.10,-0.25), (0.25,0.10,-0.25),
    (-0.78,0.06,0.48), (-0.28,0.07,0.25),
    (0.28,0.07,0.25), (0.78,0.06,0.48),
    (-0.22,0.08,0.62), (0.22,0.08,0.62),
    (0.0,0.3,0.03),
]
indices=[0,1,2, 1,3,4, 2,5,6, 1,4,9, 2,9,5, 4,7,9, 5,9,8, 7,8,9]
pos=put(b''.join(struct.pack('<3f',*v) for v in vertices),12,len(vertices),5126,'VEC3',
        [min(v[i] for v in vertices) for i in range(3)], [max(v[i] for v in vertices) for i in range(3)])
ind=put(struct.pack('<'+str(len(indices))+'H',*indices),2,len(indices),5123,'SCALAR', [min(indices)],[max(indices)])
time=put(struct.pack('<2f',0.0,0.25),4,2,5126,'SCALAR',[0],[0.25])
animations=[]
clip_shift={
 'spawn':(0.0,0.09,0.0),'idle':(0.0,0.025,0.0),'move':(0.03,0.0,-0.03),
 'attack':(0.0,0.0,-0.07),'hit':(0.03,0.0,0.07),
 'enrage':(0.0,0.12,-0.03),'death':(0.0,-0.15,0.0),
}
for name,(x,y,z) in clip_shift.items():
    anim_output=put(struct.pack('<6f',0,0,0,x,y,z),12,2,5126,'VEC3')
    animations.append({'name':name,'samplers':[{'input':time,'output':anim_output,'interpolation':'LINEAR'}],
                      'channels':[{'sampler':0,'target':{'node':0,'path':'translation'}}]})
while len(blob)%4:blob.append(0)
gltf={
 'asset':{'version':'2.0','generator':'SpaceFighter B2.2 QA primitive'},
 'extensionsUsed':['KHR_materials_unlit'],
 'scene':0,
 'scenes':[{'nodes':[0]}],
 'nodes':[{'mesh':0,'name':'QA_scout'}],
 'meshes':[{'name':'QA_enemy_ship','primitives':[{'attributes':{'POSITION':pos},'indices':ind,'material':0,'mode':4}]}],
 'materials':[{'name':'QA_Unlit_Cyan','doubleSided':True,'extensions':{'KHR_materials_unlit':{}},
               'pbrMetallicRoughness':{'baseColorFactor':[0.1,0.8,1.0,1.0],'metallicFactor':0.0,'roughnessFactor':1.0},
               'emissiveFactor':[0.05,0.3,0.4]}],
 'buffers':[{'byteLength':len(blob)}],
 'bufferViews':views,
 'accessors':accessors,
 'animations':animations,
}
json_bytes=json.dumps(gltf,separators=(',',':')).encode()
json_bytes+=b' ' * (-len(json_bytes)%4)
data=struct.pack('<III',0x46546c67,2,12+8+len(json_bytes)+8+len(blob))
data+=struct.pack('<II',len(json_bytes),0x4e4f534a)+json_bytes
data+=struct.pack('<II',len(blob),0x004e4942)+bytes(blob)
out.write_bytes(data)
print(f'Created {out}: {len(data)} bytes, {len(animations)} clips, {len(indices)//3} triangles')

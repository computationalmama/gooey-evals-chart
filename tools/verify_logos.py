import json, os
from PIL import Image, ImageDraw
S=5
items=[]
for d,man in (("assets/logos","logos.manifest.json"),("assets/icons","icons.manifest.json")):
    m=json.load(open(os.path.join(d,man)))
    for n,v in m.items(): items.append((n, os.path.join(d,v["file"])))
cellw=max(Image.open(p).size[0] for _,p in items)*S+16
cellh=max(Image.open(p).size[1] for _,p in items)*S+16
sheet=Image.new("RGB",(cellw*len(items), cellh*2+22),(255,255,255))
d0=ImageDraw.Draw(sheet)
# row 0 = on white, row 1 = on highlight teal
d0.rectangle([0,22+cellh,sheet.width,22+cellh*2],fill=(191,230,225))
for i,(n,p) in enumerate(items):
    im=Image.open(p).convert("RGBA")
    big=im.resize((im.size[0]*S,im.size[1]*S), Image.NEAREST)
    x=i*cellw+8
    d0.text((x,6), n, fill=(0,0,0))
    sheet.paste(big,(x,22+8),big)
    sheet.paste(big,(x,22+cellh+8),big)
sheet.save("/private/tmp/claude-501/-Users-cmama-Documents-gooey/90007186-e9e9-42f2-a865-767104b8ee24/scratchpad/verify.png")
print(sheet.size, "| top row on white, bottom row on #bfe6e1")

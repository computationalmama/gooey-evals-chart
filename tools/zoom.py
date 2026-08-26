import os, sys
from PIL import Image, ImageDraw
# The reference infographic these crops came from. Not in the repo (it is the
# original AI-generated image); set REFERENCE_IMAGE to point at your own copy.
SRC = os.environ.get("REFERENCE_IMAGE",
    "/Users/cmama/.claude/image-cache/90007186-e9e9-42f2-a865-767104b8ee24/1.png")
x0,y0,x1,y1,scale,out = int(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5]),sys.argv[6]
im=Image.open(SRC).convert("RGB").crop((x0,y0,x1,y1))
w,h=im.size
im=im.resize((w*scale,h*scale), Image.NEAREST)
d=ImageDraw.Draw(im)
# grid every 5 source px, label every 10
for i in range(0,w+1,5):
    c=(255,0,0) if i%10==0 else (255,170,170)
    d.line([(i*scale,0),(i*scale,h*scale)],fill=c)
    if i%10==0: d.text((i*scale+2,2), str(x0+i), fill=(255,0,0))
for j in range(0,h+1,5):
    c=(0,0,255) if j%10==0 else (170,170,255)
    d.line([(0,j*scale),(w*scale,j*scale)],fill=c)
    if j%10==0: d.text((2,j*scale+2), str(y0+j), fill=(0,0,255))
im.save(out); print(out, im.size)

from PIL import Image, ImageDraw
SRC="/Users/cmama/.claude/image-cache/90007186-e9e9-42f2-a865-767104b8ee24/1.png"
im=Image.open(SRC).convert("RGB")
# generous 44x44 windows centred on each chip (x-shift -8 applied from the openai finding)
wins={
 "openai":(344,394),"moonshot":(376,213),"anthropic":(484,362),"google":(758,536),
 "minimax":(178,519),"meta":(838,395),"intron":(1038,300),"gooey":(680,705),
}
S=6; W=44
cols=4; rows=2
sheet=Image.new("RGB",(cols*(W*S+8)+8, rows*(W*S+26)+8),(240,240,240))
d0=ImageDraw.Draw(sheet)
for i,(name,(x0,y0)) in enumerate(wins.items()):
    c=im.crop((x0,y0,x0+W,y0+W)).resize((W*S,W*S), Image.NEAREST)
    d=ImageDraw.Draw(c)
    for k in range(0,W+1,4):
        col=(255,0,0) if k%8==0 else (255,200,200)
        d.line([(k*S,0),(k*S,W*S)],fill=col); d.line([(0,k*S),(W*S,k*S)],fill=col)
        if k%8==0:
            d.text((k*S+1,1), str(x0+k), fill=(200,0,0))
            d.text((1,k*S+1), str(y0+k), fill=(0,0,200))
    cx=8+(i%cols)*(W*S+8); cy=8+(i//cols)*(W*S+26)
    sheet.paste(c,(cx,cy+20))
    d0.text((cx+2,cy+4), name, fill=(0,0,0))
sheet.save("/private/tmp/claude-501/-Users-cmama-Documents-gooey/90007186-e9e9-42f2-a865-767104b8ee24/scratchpad/sheet.png")
print(sheet.size)

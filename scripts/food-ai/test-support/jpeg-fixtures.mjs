import { execFileSync } from "node:child_process";

// Synthetic images only; both encoding and decoding stay in RAM.
export const jpegSamples = JSON.parse(execFileSync("python3", ["-B", "-c", `
import base64,io,json
from PIL import Image,ImageCms
samples={}
for mode,progressive in [('RGB',False),('RGB',True),('L',False),('L',True)]:
    image=Image.new(mode,(16,12))
    image.putdata([((x*11%256,x*19%256,x*31%256) if mode=='RGB' else x*11%256) for x in range(192)])
    buffer=io.BytesIO()
    image.save(buffer,format='JPEG',progressive=progressive)
    data=buffer.getvalue()
    with Image.open(io.BytesIO(data)) as decoded:
        decoded.load()
        assert decoded.size==(16,12)
    samples[mode+('-progressive' if progressive else '-baseline')]=base64.b64encode(data).decode()
buffer=io.BytesIO()
Image.new('RGB',(64,48),(12,100,240)).save(buffer,format='JPEG',restart_marker_blocks=1)
data=buffer.getvalue()
assert bytes([255,208]) in data
with Image.open(io.BytesIO(data)) as decoded:
    decoded.load()
samples['RGB-restarts']=base64.b64encode(data).decode()
buffer=io.BytesIO()
Image.new('RGB',(16,12),(12,100,240)).save(buffer,format='JPEG',icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
samples['RGB-icc']=base64.b64encode(buffer.getvalue()).decode()
print(json.dumps(samples))
`], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } }));

export const baselineJpeg = Buffer.from(jpegSamples["RGB-baseline"], "base64");
export const exifSegment = Buffer.from([0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0]);
export const withExif = (jpeg = baselineJpeg) => Buffer.concat([jpeg.subarray(0, 2), exifSegment, jpeg.subarray(2)]);

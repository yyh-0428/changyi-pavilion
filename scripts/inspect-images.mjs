import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';

// Inspect decoded bytes, not just image dimensions or valid glTF references.
// This detects the transparent-canvas failure that format validators cannot see.
export async function inspectEmbeddedImages(file, document) {
  const binaryStart=28+file.readUInt32LE(12),reports=[];
  for(const [index,entry] of document.images.entries()) {
    const view=document.bufferViews[entry.bufferView],start=binaryStart+(view.byteOffset??0);
    const bytes=file.subarray(start,start+view.byteLength),image=await loadImage(bytes);
    const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,image.width,image.height).data;
    let visible=0,low=255,high=0;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i+3])visible++;low=Math.min(low,pixels[i],pixels[i+1],pixels[i+2]);high=Math.max(high,pixels[i],pixels[i+1],pixels[i+2]);}
    assert.ok(visible>image.width*image.height*.5,`embedded image ${index} is empty or transparent`);
    assert.ok(high>low,`embedded image ${index} has no texture data`);
    reports.push({index,width:image.width,height:image.height,visiblePixels:visible,channelRange:[low,high],sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  return reports;
}

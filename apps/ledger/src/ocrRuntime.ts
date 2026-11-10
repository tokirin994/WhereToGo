/** Bump when the engine, trained data, or preprocessing contract changes. */
export const OCR_REVISION = 'receipt-20261110-r8'
export const OCR_MODEL_CACHE = 'smartledger-models-7-b8a23f10-45b4cb34-499c9924'

export interface OcrDiagnostic {
  revision: string; modelCache: string; sourceSha256: string; normalizedSha256: string
  sourceBytes: number; width: number; height: number; engine: string
}
export async function ocrFingerprint(file: Blob): Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer())
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
}

export function ocrWorkerOptions(base: string) {
  return {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${base}tesseract/lang`,
    // Tesseract otherwise shares './chi_sim.traineddata' with older releases.
    cachePath: OCR_MODEL_CACHE,
  }
}

export function canonicalOcrFile(dataUrl: string | null): File {
  if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('无法生成统一识别图像，请重新选择原图')
  const binary=atob(dataUrl.slice(dataUrl.indexOf(',')+1)),bytes=new Uint8Array(binary.length)
  for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index)
  return new File([bytes],'ocr-input.png',{type:'image/png'})
}

/** CPU resampling: Canvas GPU scaling produces different pixels across engines. */
export function resizeOcrPixels(source: Uint8ClampedArray, width: number, height: number, targetWidth: number, targetHeight: number): Uint8ClampedArray {
  const result=new Uint8ClampedArray(targetWidth*targetHeight*4)
  for(let y=0;y<targetHeight;y++){
    const sy=Math.max(0,Math.min(height-1,(y+.5)*height/targetHeight-.5)),y0=Math.floor(sy),y1=Math.min(height-1,y0+1),fy=sy-y0
    for(let x=0;x<targetWidth;x++){
      const sx=Math.max(0,Math.min(width-1,(x+.5)*width/targetWidth-.5)),x0=Math.floor(sx),x1=Math.min(width-1,x0+1),fx=sx-x0
      for(let channel=0;channel<4;channel++){
        const a=source[(y0*width+x0)*4+channel]!,b=source[(y0*width+x1)*4+channel]!,c=source[(y1*width+x0)*4+channel]!,d=source[(y1*width+x1)*4+channel]!
        result[(y*targetWidth+x)*4+channel]=Math.round((a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy)
      }
    }
  }
  return result
}

export function paintOcrRegion(context: CanvasRenderingContext2D, source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
  const width=Math.max(1,Math.round(sw)),height=Math.max(1,Math.round(sh)),targetWidth=Math.max(1,Math.round(dw)),targetHeight=Math.max(1,Math.round(dh))
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const input=canvas.getContext('2d',{willReadFrequently:true})
  if(!input)throw new Error('无法读取识别图片')
  input.fillStyle='#fff';input.fillRect(0,0,width,height);input.imageSmoothingEnabled=false
  input.drawImage(source,Math.round(sx),Math.round(sy),width,height,0,0,width,height)
  const pixels=input.getImageData(0,0,width,height)
  canvas.width=canvas.height=0
  context.putImageData(new ImageData(resizeOcrPixels(pixels.data,width,height,targetWidth,targetHeight),targetWidth,targetHeight),Math.round(dx),Math.round(dy))
}

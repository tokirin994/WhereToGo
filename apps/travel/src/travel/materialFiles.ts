/** Lazy local readers. Files and image pixels never go to an external OCR service. */
export interface ReadPage {label:string;text:string;sourceUrl:string}
export const acceptedMaterialFiles='.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp'
export const fileKind=(file:File)=>file.name.toLowerCase().split('.').pop()||''
const base=import.meta.env.BASE_URL||'/'
export async function readMaterialFile(file:File,progress:(message:string)=>void):Promise<ReadPage[]> {
  if(file.size>15*1024*1024)throw new Error('单个文件最多 15 MB，请拆分文件')
  const ext=fileKind(file),pages:ReadPage[]=[]
  const page=(text:string,suffix='')=>{if(text.length>30000)throw new Error('单页文字超过 30000 字，请拆分资料');return {label:(file.name+suffix).slice(0,200),text,sourceUrl:''}}
  if(['txt','md'].includes(ext)){if(file.size>150000)throw new Error('文本文件过大，请限制在 30000 字以内');return [page(await file.text())]}
  if(ext==='docx'){
    const {unzipSync,strFromU8}=await import('fflate')
    const entries=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>entry.name==='word/document.xml'&&entry.originalSize<=4*1024*1024})
    if(!entries['word/document.xml'])throw new Error('DOCX 无法读取、正文超过 4 MB，或不是标准文档')
    const doc=new DOMParser().parseFromString(strFromU8(entries['word/document.xml']),'application/xml')
    if(doc.querySelector('parsererror'))throw new Error('DOCX 正文格式无效')
    const text=Array.from(doc.getElementsByTagNameNS('*','p')).map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(t=>t.textContent||'').join('')).join('\n')
    return [page(text)]
  }
  if(ext==='pdf'){
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=base+'reader/pdfjs/pdf.worker.min.mjs'
    const root=base+'reader/pdfjs/'
    const task=pdfjs.getDocument({data:await file.arrayBuffer(),cMapUrl:root+'cmaps/',cMapPacked:true,standardFontDataUrl:root+'standard_fonts/',wasmUrl:root+'wasm/',iccUrl:root+'iccs/'})
    try{
      const doc=await task.promise;if(doc.numPages>20)throw new Error('每个 PDF 最多 20 页，请先拆分；手机建议每次 5 页以内')
      let scanned=0
      for(let i=1;i<=doc.numPages;i++){
        progress(`读取 ${file.name} · 第 ${i}/${doc.numPages} 页`)
        const p=await doc.getPage(i),content=await p.getTextContent();let text=''
        for(const item of content.items)if('str' in item)text+=item.str+(item.hasEOL?'\n':' ')
        if(text.replace(/\s/g,'').length<15){
          if(++scanned>8)throw new Error('扫描 PDF 每次最多 OCR 8 页，请拆分后重试')
          const original=p.getViewport({scale:1}),scale=Math.min(2,Math.sqrt(1800000/(original.width*original.height))),viewport=p.getViewport({scale}),canvas=document.createElement('canvas')
          canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height)
          try{await p.render({canvas,viewport}).promise;text=await recognize(canvas,progress)}finally{canvas.width=canvas.height=0}
        }
        pages.push(page(text,` · 第 ${i} 页`));p.cleanup()
      }
      return pages
    }finally{await task.destroy()}
  }
  if(['png','jpg','jpeg','webp'].includes(ext)){
    const url=URL.createObjectURL(file),image=new Image()
    try{
      image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>32000000)throw new Error('图片分辨率过大，请先缩小或裁剪')
      const scale=Math.min(2,Math.sqrt(2200000/(image.naturalWidth*image.naturalHeight))),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale)
      try{const context=canvas.getContext('2d');if(!context)throw new Error('无法创建图片画布');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return [page(await recognize(canvas,progress))]}finally{canvas.width=canvas.height=0}
    }finally{URL.revokeObjectURL(url);image.src=''}
  }
  throw new Error('支持 PDF、DOCX、TXT、Markdown、PNG、JPG 和 WebP；旧版 DOC 请另存为 DOCX 或 PDF')
}
async function recognize(canvas:HTMLCanvasElement,progress:(message:string)=>void){
  const {createWorker,PSM}=await import('tesseract.js')
  let rejectFailure:(error:Error)=>void=()=>{},expired=false
  const failed=new Promise<never>((_,reject)=>{rejectFailure=reject})
  const pending=createWorker('chi_sim+eng',1,{workerPath:base+'reader/ocr/worker.min.js',corePath:base+'reader/ocr',langPath:base+'reader/ocr/lang',cacheMethod:'none',errorHandler:()=>rejectFailure(new Error('本地 OCR 引擎或语言模型加载失败，请检查网络后重试，或粘贴原文')),logger:event=>progress(event.status==='recognizing text'?`识别图片文字 ${Math.round((event.progress||0)*100)}%`:event.status==='loading language traineddata'?`下载中英文字库 ${Math.round((event.progress||0)*100)}%（首次加载较慢）`:'准备本地识别引擎（首次需要下载识别资源）…')})
  void pending.then(worker=>{if(expired)void worker.terminate()},()=>{})
  const timer=setTimeout(()=>rejectFailure(new Error('本地 OCR 引擎下载超时。首次需要下载识别资源，请检查网络后重试，或粘贴原文')),240000)
  let worker:Awaited<ReturnType<typeof createWorker>>
  try{worker=await Promise.race([pending,failed])}catch(error){expired=true;throw error}finally{clearTimeout(timer)}
  try{await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO,preserve_interword_spaces:'1'});const result=await worker.recognize(canvas);return result.data.text.replace(/([\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g,'$1')}
  finally{await worker.terminate()}
}

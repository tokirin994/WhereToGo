<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist'
import { formatFileSize, type ImportSource } from './importSources'
import { parseCsv, readBillText } from './ocrText'
import { loadPdfJs, pdfOptions } from './pdfRuntime'
import { trapDialogTab, useDialogFocus } from './dialogFocus'
import UiIcon from './UiIcon.vue'
const props = defineProps<{ source: ImportSource; initialPage?: number; initialRow?: number; initialSheet?: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement | null>(null), viewport = ref<HTMLElement | null>(null), canvas = ref<HTMLCanvasElement | null>(null)
useDialogFocus(dialog)
const loading = ref(false), rendering = ref(false), error = ref(''), zoom = ref(1), page = ref(1), pageCount = ref(0)
const imageFit = ref<'page'|'width'>('page')
const naturalWidth = ref(0), naturalHeight = ref(0), availableWidth = ref(800), availableHeight = ref(600)
const tables = ref<Array<{ name: string; rows: string[][] }>>([]), sheetIndex = ref(0), tablePage = ref(0), textLines = ref<string[]>([])
let generation = 0, renderGeneration = 0, pdf: PDFDocumentProxy | undefined, pdfTask: PDFDocumentLoadingTask | undefined, renderTask: RenderTask | undefined, observer: ResizeObserver | undefined
const table = computed(() => tables.value[sheetIndex.value]?.rows || [])
const rows = computed(() => table.value.slice(tablePage.value * 100, (tablePage.value + 1) * 100))
const baseWidth = computed(() => naturalWidth.value ? imageFit.value==='width'?Math.min(naturalWidth.value,availableWidth.value-40):Math.min(naturalWidth.value, availableWidth.value - 40, (availableHeight.value - 40) * naturalWidth.value / naturalHeight.value) : 0)
const imageStyle = computed(() => baseWidth.value ? { width: `${Math.max(1, baseWidth.value * zoom.value)}px` } : {})
function stopPdf() { renderGeneration++; renderTask?.cancel(); renderTask = undefined; const oldTask=pdfTask; pdfTask=undefined; pdf=undefined; void oldTask?.destroy().catch(()=>{}) }
async function load() {
  const current=++generation;stopPdf();error.value='';loading.value=true;rendering.value=false;zoom.value=1;imageFit.value='page';naturalWidth.value=naturalHeight.value=0;tables.value=[];textLines.value=[];sheetIndex.value=0;tablePage.value=Math.max(0,Math.floor(((props.initialRow||1)-1)/100));pageCount.value=0
  try {
    if(props.source.kind==='pdf'){
      const pdfjs=await loadPdfJs();if(current!==generation)return
      const data=await props.source.file.arrayBuffer();if(current!==generation)return
      const task=pdfjs.getDocument({...pdfOptions,data});pdfTask=task
      const document=await task.promise;if(current!==generation)return
      pdf=document;pageCount.value=document.numPages;page.value=Math.max(1,Math.min(props.initialPage||1,document.numPages))
      loading.value=false;await nextTick();await renderPdf()
    } else if(props.source.kind==='table'){
      if(props.source.name.toLowerCase().endsWith('.xlsx')){
        const readXlsx=(await import('read-excel-file/browser')).default
        const sheets=await readXlsx(props.source.file);if(current!==generation)return
        tables.value=sheets.map(sheet=>({name:sheet.sheet,rows:sheet.data.map(row=>row.map(value=>value instanceof Date?value.toLocaleString('zh-CN'):String(value??'')))}))
        sheetIndex.value=Math.max(0,tables.value.findIndex(sheet=>sheet.name===props.initialSheet))
      }else{const text=await readBillText(props.source.file);if(current!==generation)return;tables.value=[{name:'账单数据',rows:parseCsv(text)}]}
      tablePage.value=Math.min(tablePage.value,Math.max(0,Math.ceil(table.value.length/100)-1))
    } else if(props.source.kind==='text'){
      const text=await readBillText(props.source.file);if(current!==generation)return;textLines.value=text.split(/\r?\n/);tablePage.value=0
    }
  }catch(cause){if(current===generation){error.value=cause instanceof Error?cause.message:'无法读取原始文件';if(props.source.kind==='pdf')stopPdf()}}
  finally{if(current===generation)loading.value=false}
}
async function renderPdf() {
  const document=pdf, target=canvas.value
  if(!document||!target)return
  const current=++renderGeneration;const previous=renderTask;renderTask=undefined;previous?.cancel();rendering.value=true
  try{
    if(previous)await previous.promise.catch(()=>{})
    if(current!==renderGeneration)return
    const pdfPage=await document.getPage(page.value);if(current!==renderGeneration)return
    const original=pdfPage.getViewport({scale:1})
    const scale=Math.max(0.1,Math.min(1.6,(availableWidth.value-48)/original.width))*zoom.value
    const display=pdfPage.getViewport({scale})
    const ratio=Math.min(window.devicePixelRatio||1,2,8192/Math.max(display.width,display.height),Math.sqrt(16000000/(display.width*display.height)))
    const rendered=pdfPage.getViewport({scale:scale*ratio})
    const context=target.getContext('2d');if(!context)throw new Error('浏览器无法创建 PDF 预览画布')
    target.width=Math.ceil(rendered.width);target.height=Math.ceil(rendered.height);target.style.width=`${display.width}px`;target.style.height=`${display.height}px`
    renderTask=pdfPage.render({canvas:target,canvasContext:context,viewport:rendered});await renderTask.promise
  }catch(cause){if(current===renderGeneration&&!(cause instanceof Error&&cause.name==='RenderingCancelledException'))error.value=cause instanceof Error?cause.message:'PDF 页面预览失败'}
  finally{if(current===renderGeneration)rendering.value=false}
}
function imageLoaded(event:Event){const image=event.target as HTMLImageElement;naturalWidth.value=image.naturalWidth;naturalHeight.value=image.naturalHeight;imageFit.value=image.naturalHeight/image.naturalWidth>2.5?'width':'page'}
function fitPage(){imageFit.value='page';zoom.value=1}
function fitWidth(){imageFit.value='width';zoom.value=1}
function toggleImageZoom(){if(imageFit.value==='page')fitWidth();else zoom.value=zoom.value===1?2:1}
function changeZoom(delta:number){zoom.value=Math.max(.5,Math.min(4,Math.round((zoom.value+delta)*100)/100))}
let drag:{id:number;x:number;y:number;left:number;top:number}|null=null
function startPan(event:PointerEvent){if(zoom.value<=1||!viewport.value||event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.value.scrollLeft,top:viewport.value.scrollTop};viewport.value.setPointerCapture(event.pointerId)}
function pan(event:PointerEvent){if(drag&&viewport.value){viewport.value.scrollLeft=drag.left-event.clientX+drag.x;viewport.value.scrollTop=drag.top-event.clientY+drag.y}}
function stopPan(){drag=null}
watch(()=>props.source.id,load,{immediate:true})
watch([page,zoom,availableWidth],()=>{if(!loading.value)void renderPdf()})
onMounted(()=>{if(viewport.value){observer=new ResizeObserver(entries=>{availableWidth.value=entries[0].contentRect.width;availableHeight.value=entries[0].contentRect.height});observer.observe(viewport.value)}})
onUnmounted(()=>{generation++;observer?.disconnect();stopPdf()})
</script>
<template>
  <div class="source-preview-shade" @click.self="emit('close')">
    <section ref="dialog" class="source-preview" role="dialog" aria-modal="true" aria-labelledby="source-preview-title" tabindex="-1" @keydown="trapDialogTab($event,dialog)" @keydown.esc.stop.prevent="emit('close')">
      <header><span class="source-preview-file-icon"><UiIcon :name="source.kind==='image'?'image':'file'" :size="22"/></span><div><h2 id="source-preview-title">{{ source.name }}</h2><small>原始文件 · {{ formatFileSize(source.file.size) }}<template v-if="initialPage"> · 来源第 {{ initialPage }} 页</template><template v-if="initialRow"> · 来源第 {{ initialRow }} 行</template></small></div><a :href="source.url" :download="source.name" class="feature-icon-button" aria-label="下载原始文件" title="下载原始文件"><UiIcon name="download" :size="18"/></a><button type="button" class="feature-icon-button" aria-label="关闭原件预览" @click="emit('close')"><UiIcon name="close"/></button></header>
      <div v-if="source.kind==='image'||source.kind==='pdf'" class="source-preview-tools"><div v-if="source.kind==='pdf'" class="preview-pagination"><button type="button" aria-label="上一页" :disabled="page<=1||loading" @click="page--"><UiIcon name="back" :size="16"/></button><span>第 {{ page }} / {{ pageCount||'—' }} 页</span><button type="button" aria-label="下一页" :disabled="page>=pageCount||loading" @click="page++"><UiIcon name="chevron" :size="16"/></button></div><div class="preview-zoom"><button v-if="source.kind==='image'" type="button" title="适合宽度，长截图可上下滚动" @click="fitWidth">适宽</button><button type="button" aria-label="缩小预览" :disabled="zoom<=.5" @click="changeZoom(-.25)"><UiIcon name="minus" :size="16"/></button><button type="button" class="preview-zoom-percentage" title="恢复适合窗口" @click="fitPage">{{ Math.round(zoom*100) }}%</button><button type="button" aria-label="放大预览" :disabled="zoom>=4" @click="changeZoom(.25)"><UiIcon name="plus" :size="16"/></button><button type="button" title="适合窗口" aria-label="适合窗口" @click="fitPage"><UiIcon name="expand" :size="16"/></button></div></div>
      <div v-if="source.kind==='table'&&tables.length" class="source-preview-tools"><label>工作表<select v-model="sheetIndex" @change="tablePage=0"><option v-for="(sheet,index) in tables" :key="index" :value="index">{{ sheet.name }}</option></select></label><span>{{ table.length }} 行</span></div>
      <div ref="viewport" class="source-preview-viewport" :class="{'is-document':source.kind==='table'||source.kind==='text','is-zoomed':zoom>1}" :style="{touchAction:zoom>1?'none':'auto'}" @pointerdown="startPan" @pointermove="pan" @pointerup="stopPan" @pointercancel="stopPan">
        <div v-if="loading" class="preview-loading" role="status">正在打开原始文件…</div>
        <div v-else-if="error" class="preview-error" role="alert"><UiIcon name="file" :size="30"/><b>暂时无法预览</b><p>{{ error }}</p><button type="button" class="feature-button" @click="load">重新加载</button></div>
        <div v-else-if="source.kind==='image'" class="source-image-stage"><img :src="source.url" :alt="source.name" :style="imageStyle" draggable="false" @load="imageLoaded" @error="error='浏览器无法解码这张图片，请将原件另存为 PNG 或 JPG 后重试'" @dblclick="toggleImageZoom"/></div>
        <div v-show="source.kind==='pdf'&&!loading&&!error" class="source-pdf-stage"><canvas ref="canvas" :aria-label="`PDF 第 ${page} 页`"></canvas><span v-if="rendering" class="preview-rendering">正在呈现页面…</span></div>
        <table v-if="source.kind==='table'&&!loading&&!error&&table.length" class="source-preview-table"><tbody><tr v-for="(row,index) in rows" :key="tablePage*100+index" :class="{highlight:tablePage*100+index+1===initialRow}"><th scope="row">{{ tablePage*100+index+1 }}</th><td v-for="(cell,column) in row" :key="column" :title="cell">{{ cell }}</td></tr></tbody></table>
        <pre v-else-if="source.kind==='text'&&!loading&&!error" class="source-text-preview">{{ textLines.slice(tablePage*100,(tablePage+1)*100).join('\n') }}</pre>
        <div v-else-if="source.kind==='unsupported'||(source.kind==='table'&&!loading&&!table.length&&!error)" class="preview-error"><UiIcon name="file" :size="30"/><b>{{ source.kind==='unsupported'?'此文件格式暂不支持内嵌预览':'文件里没有可显示的数据' }}</b><p>可以下载原始文件查看；支持图片、PDF、CSV、TXT 和 XLSX 预览。</p></div>
      </div>
      <footer><span>{{ source.kind==='image'?'双击缩放，放大后可拖动查看细节':source.kind==='pdf'?'逐页核对原件，识别记录保留来源页码':'显示原始文件内容，不会修改文件' }}</span><div v-if="(source.kind==='table'&&table.length)||(source.kind==='text'&&textLines.length)" class="preview-pagination"><button type="button" aria-label="上一组行" :disabled="tablePage===0" @click="tablePage--"><UiIcon name="back" :size="15"/></button><span>{{ tablePage*100+1 }}–{{ Math.min((tablePage+1)*100,source.kind==='table'?table.length:textLines.length) }} 行</span><button type="button" aria-label="下一组行" :disabled="(tablePage+1)*100>=(source.kind==='table'?table.length:textLines.length)" @click="tablePage++"><UiIcon name="chevron" :size="15"/></button></div></footer>
    </section>
  </div>
</template>

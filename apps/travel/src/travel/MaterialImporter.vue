<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {ArrowLeft,ArrowRight,Check,FileText,Link,MapPin,Plus,Route,ScanText,Sparkles,Upload,X} from '@lucide/vue'
import TravelModal from './TravelModal.vue'
import RouteFields from './RouteFields.vue'
import {acceptedMaterialFiles,readMaterialFile,fileKind,type ReadPage} from './materialFiles'
import {emptyRoute,extractLocal,normalizeMaterial,materialStatus,parseMaterial,resolveRednote,placePayload,rednoteUrl,routeModes,saveMaterial,validateRoute,type MaterialDraft,type PlaceDraft,type RouteDraft,type MaterialPage} from './library'
import type {Place} from '../stores/places'
import type {SavedRoute} from './library'
const props=defineProps<{places:Place[];routes:SavedRoute[]}>()
const emit=defineEmits<{close:[];saved:[counts:{places:number;routes:number}]}>()
const stage=ref<'source'|'review'>('source'),tab=ref<'link'|'files'|'text'>('link'),city=ref(''),link=ref(''),text=ref(''),busy=ref(false),message=ref(''),error=ref(''),aiAvailable=ref(false),useAi=ref(false)
const rednoteAvailable=ref(false)
type SourceFile={id:string;file:File;url:string;status:'queued'|'ready'|'error';error:string;pages:ReadPage[]}
const files=ref<SourceFile[]>([]),draft=ref<MaterialDraft>({places:[],routes:[],warnings:[]}),editing=ref<PlaceDraft|RouteDraft|null>(null),lastPages=ref<MaterialPage[]>([]),pageIndex=ref(0)
const selectedCount=computed(()=>draft.value.places.filter(x=>x.selected).length+draft.value.routes.filter(x=>x.selected).length)
const isRoute=(item:PlaceDraft|RouteDraft):item is RouteDraft=>'waypoints' in item
const editorCopy=ref<PlaceDraft|RouteDraft|null>(null)
function edit(item:PlaceDraft|RouteDraft){editing.value=item;editorCopy.value=JSON.parse(JSON.stringify(item));error.value=''}
function finishEdit(){if(!editing.value||!editorCopy.value)return;const item=editorCopy.value;if(isRoute(item)){const issue=validateRoute(item);if(issue){error.value=issue;return}}else if(!item.name.trim()||!item.city.trim()){error.value='请补全地点名称和城市';return}Object.assign(editing.value,item);editing.value=null;editorCopy.value=null;error.value=''}
onMounted(async()=>{try{const status=await materialStatus();aiAvailable.value=status.aiAvailable;rednoteAvailable.value=status.rednoteAvailable}catch{/* Local extraction remains available. */}})
onUnmounted(()=>files.value.forEach(f=>URL.revokeObjectURL(f.url)))
function addFiles(event:Event){const input=event.target as HTMLInputElement;error.value='';for(const file of Array.from(input.files||[])){
  if(files.value.length>=5){error.value='每次最多 5 个文件';break}if(file.size>15*1024*1024){error.value=`${file.name} 超过 15 MB`;continue}
  if(!['pdf','docx','txt','md','png','jpg','jpeg','webp'].includes(fileKind(file))){error.value='文件类型不支持，请将 DOC 另存为 DOCX 或 PDF';continue}
  files.value.push({id:crypto.randomUUID(),file,url:URL.createObjectURL(file),status:'queued',error:'',pages:[]})
}input.value=''}
function removeFile(index:number){URL.revokeObjectURL(files.value[index]!.url);files.value.splice(index,1)}
function sourcePage():MaterialPage[]{
  if(tab.value==='files')return []
  const sourceUrl=tab.value==='link'?rednoteUrl(link.value):null
  if(tab.value==='link'&&!sourceUrl)throw new Error('请粘贴小红书分享文字或完整的 HTTPS 笔记链接')
  return text.value.trim()?[{label:sourceUrl?'小红书 · 粘贴正文':'粘贴的旅行资料',text:text.value.trim(),sourceUrl:sourceUrl||''}]:[]
}
async function analyze(){
  if(busy.value)return;error.value='';busy.value=true;const pages:MaterialPage[]=[]
  try{
    if(tab.value==='link'&&!text.value.trim()&&rednoteAvailable.value){const url=rednoteUrl(link.value);if(!url)throw new Error('请先填写有效的小红书笔记链接');message.value='通过已配置的连接器读取笔记正文…';const resolved=await resolveRednote(url);link.value=resolved.sourceUrl;text.value=resolved.text}
    pages.push(...sourcePage())
    if(tab.value==='link'&&!pages.length&&!files.value.length)throw new Error('链接已保留，但当前未连接小红书正文读取服务。请粘贴笔记正文或上传截图后再解析。')
    for(const source of files.value){
      if(source.status!=='ready')try{source.pages=await readMaterialFile(source.file,status=>{message.value=status});source.status='ready';source.error=''}catch(cause){source.status='error';source.error=cause instanceof Error?cause.message:'文件读取失败'}
      if(source.status==='error')throw new Error(`${source.file.name}：${source.error}。请移除该文件或重新选择后继续。`)
      pages.push(...source.pages.map(p=>({...p,sourceUrl:tab.value==='link'?rednoteUrl(link.value)||'':''})))
    }
    const size=pages.reduce((n,p)=>n+p.text.length,0);if(!size)throw new Error('没有读到文字，请换用清晰截图或粘贴正文');if(size>30000)throw new Error('提取文字超过 30000 字，请拆分资料后导入')
    lastPages.value=pages;pageIndex.value=0;await makeDraft(pages);stage.value='review'
  }catch(cause){error.value=cause instanceof Error?cause.message:'解析失败，请重试'}finally{busy.value=false;message.value=''}
}
async function makeDraft(pages:MaterialPage[]){
  const result:MaterialDraft={places:[],routes:[],warnings:[]}
  if(useAi.value){
    message.value='AI 正在整理地点与路线…';const combined={label:pages.length===1?pages[0]!.label:'多份导入资料',sourceUrl:pages.length===1?pages[0]!.sourceUrl:'',text:pages.map(p=>`【${p.label}】\n${p.text}`).join('\n\n')}
    if(combined.text.length>30000)throw new Error('资料及来源标签合计超过 30000 字，请拆分后导入')
    Object.assign(result,normalizeMaterial(await parseMaterial(combined.text,city.value.trim()),combined,city.value.trim()))
    for(const item of [...result.places,...result.routes]){const source=item.evidence?pages.find(p=>p.text.includes(item.evidence)):null;if(source){item.sourceLabel=source.label;item.sourceUrl=source.sourceUrl}}
    result.warnings.push('AI 提取结果需要核对。里程、耗时、爬升和途经点请与原文逐项确认；没有原文片段的结果尤其需要复核。')
  }else for(const p of pages){const local=extractLocal(p,city.value.trim());result.places.push(...local.places);result.routes.push(...local.routes);result.warnings.push(...local.warnings)}
  if(result.places.length>80||result.routes.length>20)throw new Error('本次提取结果过多，请拆分资料（最多 80 个地点、20 条路线）')
  const knownPlaces=new Set(props.places.map(p=>key(p))),knownRoutes=new Set(props.routes.map(p=>key(p)))
  for(const p of result.places){if(knownPlaces.has(key(p)))p.selected=false;knownPlaces.add(key(p))}
  for(const p of result.routes){if(knownRoutes.has(key(p)))p.selected=false;knownRoutes.add(key(p))}
  result.warnings=[...new Set(result.warnings)];draft.value=result
}
const key=(p:{name:string;city:string})=>p.city.trim().toLowerCase()+'|'+p.name.trim().toLowerCase()
function add(kind:'place'|'route'){
  if(kind==='route'){if(draft.value.routes.length>=20)return;const item={...emptyRoute(),draftId:crypto.randomUUID(),selected:true,city:city.value,sourceUrl:tab.value==='link'?rednoteUrl(link.value)||'':'',sourceLabel:'手动补充'};draft.value.routes.push(item);edit(item)}
  else{if(draft.value.places.length>=80)return;const item:PlaceDraft={draftId:crypto.randomUUID(),selected:true,name:'',city:city.value,address:'',category:'景点',tags:[],notes:'',sourceUrl:tab.value==='link'?rednoteUrl(link.value)||'':'',sourceLabel:'手动补充',evidence:''};draft.value.places.push(item);edit(item)}
}
function drop(item:PlaceDraft|RouteDraft){if(isRoute(item))draft.value.routes=draft.value.routes.filter(p=>p!==item);else draft.value.places=draft.value.places.filter(p=>p!==item)}
function collectWaypoints(){
  const known=new Set([...props.places,...draft.value.places].map(key));error.value=''
  for(const route of draft.value.routes.filter(r=>r.selected))for(const point of route.waypoints){const value={name:point.name,city:route.city};if(!point.name.trim()||known.has(key(value)))continue;if(draft.value.places.length>=80){error.value='地点清单已达 80 项，请分批导入';return}known.add(key(value));draft.value.places.push({...value,draftId:crypto.randomUUID(),selected:true,category:'景点',address:'',tags:[],notes:point.note,sourceLabel:route.sourceLabel,sourceUrl:route.sourceUrl,evidence:route.evidence})}
}
async function save(){
  if(busy.value||!selectedCount.value)return;error.value=''
  const points=draft.value.places.filter(x=>x.selected),routes=draft.value.routes.filter(x=>x.selected)
  if(points.some(p=>!p.name.trim()||!p.city.trim())){error.value='请编辑选中的地点，补全名称和城市';return}
  for(const route of routes){const issue=validateRoute(route);if(issue){error.value=`${route.name||'未命名路线'}：${issue}`;return}}
  busy.value=true;message.value='正在保存确认过的收藏…'
  try{const result=await saveMaterial(points.map(placePayload),routes);emit('saved',{places:result.places.length,routes:result.routes.length})}
  catch(cause){error.value=(cause instanceof Error?cause.message:'保存未完成')+'。未自动重试；如果网络中断，请先查看收藏库是否已保存，避免重复导入。'}finally{busy.value=false;message.value=''}
}
</script>
<template>
<TravelModal :title="editorCopy?(isRoute(editorCopy)?'核对这条路线':'核对这个地点'):'把灵感，变成下一站。'" eyebrow="COLLECT YOUR NEXT ADVENTURE" wide :locked="busy" :error="error" @close="emit('close')">
  <template v-if="editorCopy"><form @submit.prevent="finishEdit"><div class="tw-modal-body"><button type="button" class="tw-text" @click="editorCopy=null;editing=null;error='' "><ArrowLeft :size="14"/>返回识别清单</button><RouteFields v-if="isRoute(editorCopy)" :value="editorCopy"/><template v-else><div class="tw-form-grid"><label class="tw-field">地点名称<input v-model="editorCopy.name" required maxlength="180"/></label><label class="tw-field">城市 / 地区<input v-model="editorCopy.city" required maxlength="120"/></label></div><label class="tw-field">收藏分类<select v-model="editorCopy.category"><option v-for="category in ['景点','美食','咖啡','住宿']" :key="category">{{ category }}</option></select></label><label class="tw-field">地址<input v-model="editorCopy.address" maxlength="300"/></label><label class="tw-field">备注<textarea v-model="editorCopy.notes" maxlength="3500" rows="4"></textarea></label><p class="tw-hint">来源：{{ editorCopy.sourceLabel }} · 坐标待定位</p><blockquote class="tw-material-quote">{{ editorCopy.evidence||'暂无可核对的原文片段' }}</blockquote></template></div><footer class="tw-modal-footer"><button type="button" class="tw-button secondary" @click="editorCopy=null;editing=null;error=''">取消编辑</button><button class="tw-button primary">保存到待确认清单<Check :size="15"/></button></footer></form></template>
  <template v-else><div class="tw-import-progress"><span :class="{active:stage==='source'}">1 添加资料</span><ArrowRight :size="13"/><span :class="{active:stage==='review'}">2 核对与收藏</span></div>
    <div class="tw-modal-body tw-material-body">
      <template v-if="stage==='source'"><div class="tw-source-tabs" role="group" aria-label="资料来源"><button :class="{active:tab==='link'}" :disabled="busy" @click="tab='link'"><Link :size="17"/>小红书链接</button><button :class="{active:tab==='files'}" :disabled="busy" @click="tab='files'"><Upload :size="17"/>文件与图片</button><button :class="{active:tab==='text'}" :disabled="busy" @click="tab='text'"><FileText :size="17"/>粘贴文字</button></div>
        <div v-if="tab==='link'" class="tw-field"><label for="material-link">笔记链接或分享内容</label><textarea id="material-link" v-model="link" rows="2" maxlength="3000" :disabled="busy" placeholder="粘贴小红书分享链接，来源会随收藏保留"></textarea><small>{{ rednoteAvailable?'已配置正文连接器，点击提取可读取笔记；也可补充正文或截图。':'当前未连接正文读取服务。请补充笔记正文或截图；不会仅凭链接编造地点。' }}</small></div>
        <label class="tw-field">默认城市 / 地区<input v-model="city" maxlength="120" :disabled="busy" placeholder="选填，补全资料里未注明的城市"/></label>
        <label v-if="tab!=='files'" class="tw-field">{{ tab==='link'?'补充笔记正文':'旅行资料正文' }}<textarea v-model="text" rows="5" maxlength="30000" :disabled="busy" placeholder="可以粘贴游记，或使用：&#10;景点：灵隐寺&#10;路线：起点 → 山顶 → 终点&#10;全程 8 km，耗时 4 小时，爬升 500 米"></textarea></label>
        <label class="tw-file-drop tw-material-upload"><Upload :size="25"/><b>{{ tab==='link'?'上传笔记截图或附件':'选择旅行文档或截图' }}</b><small>PDF / DOCX / TXT / MD / JPG / PNG / WebP<br/>最多 5 个文件 · 每个 15 MB · PDF 最多 20 页</small><input type="file" :accept="acceptedMaterialFiles" multiple :disabled="busy" @change="addFiles"/></label>
        <div class="tw-source-files"><article v-for="(source,index) in files" :key="source.id"><img v-if="['png','jpg','jpeg','webp'].includes(fileKind(source.file))" :src="source.url" :alt="source.file.name"/><FileText v-else :size="24"/><div><b>{{ source.file.name }}</b><small>{{ source.error|| (source.status==='ready'?`已读取 ${source.pages.length} 页`:`${(source.file.size/1024/1024).toFixed(1)} MB · 等待提取`) }}</small></div><button class="tw-icon" :disabled="busy" aria-label="移除文件" @click="removeFile(index)"><X :size="16"/></button></article></div>
        <section class="tw-material-engine"><div><ScanText :size="20"/><span><b>本地文字提取</b><small>PDF 和图片在此浏览器读取，不上传原文件。首次识图需要下载引擎与字库，后续由浏览器缓存。</small></span></div><label><input v-model="useAi" type="checkbox" :disabled="busy||!aiAvailable"/><span><Sparkles :size="15"/>用 AI 整理自由游记<small>{{ aiAvailable?'会将提取的文字发送给你配置的 AI 服务商。':'先到账号与服务配置 AI；目前仍可提取规范清单和箭头路线。' }}</small></span></label></section>
      </template>
      <template v-else>
        <div class="tw-review-intro"><div><h3>先核对，再收进收藏。</h3><p>{{ draft.places.length }} 个地点 · {{ draft.routes.length }} 条路线 · 已取消勾选同名同城的重复项</p></div><button class="tw-text" :disabled="busy" @click="draft.places.forEach(p=>p.selected=true);draft.routes.forEach(p=>p.selected=true)">全选</button><button class="tw-text" :disabled="busy" @click="draft.places.forEach(p=>p.selected=false);draft.routes.forEach(p=>p.selected=false)">清空选择</button></div>
        <details class="tw-material-evidence"><summary>对照原文 · {{ lastPages.length }} 段资料</summary><select v-model="pageIndex" aria-label="选择原文页"><option v-for="(page,index) in lastPages" :key="index" :value="index">{{ page.label }}</option></select><textarea v-if="lastPages[pageIndex]" :value="lastPages[pageIndex]!.text" readonly rows="7" aria-label="识别原文"></textarea></details>
        <p v-for="warning in draft.warnings" :key="warning" class="tw-hint tw-import-warning">{{ warning }}</p>
        <div class="tw-review-section-title"><h3><MapPin :size="17"/>地点</h3><button class="tw-text" :disabled="busy||draft.places.length>=80" @click="add('place')"><Plus :size="14"/>补充地点</button></div>
        <article v-for="item in draft.places" :key="item.draftId" class="tw-import-result"><input v-model="item.selected" type="checkbox" :disabled="busy" :aria-label="'保存地点'+item.name"/><button class="tw-result-main" :disabled="busy" @click="edit(item)"><span><MapPin :size="18"/></span><div><b>{{ item.name||'未命名地点' }}</b><p>{{ item.city||'待补城市' }} · {{ item.category }} · 待定位</p><small>{{ item.sourceLabel }}</small></div><ArrowRight :size="16"/></button><button class="tw-icon" :disabled="busy" :aria-label="'移除'+item.name" @click="drop(item)"><X :size="16"/></button></article><p v-if="!draft.places.length" class="tw-hint">没有提取到明确地点，可以手动补充。</p>
        <div class="tw-review-section-title"><h3><Route :size="17"/>路线</h3><button class="tw-text" :disabled="busy||draft.routes.length>=20" @click="add('route')"><Plus :size="14"/>补充路线</button></div>
        <article v-for="item in draft.routes" :key="item.draftId" class="tw-import-result"><input v-model="item.selected" type="checkbox" :disabled="busy" :aria-label="'保存路线'+item.name"/><button class="tw-result-main" :disabled="busy" @click="edit(item)"><span><Route :size="18"/></span><div><b>{{ item.name||'未命名路线' }}</b><p>{{ item.city||'待补城市' }} · {{ routeModes[item.mode] }} · {{ item.waypoints.length }} 个途经点</p><small>{{ item.distanceKm!=null?item.distanceKm+' km':'里程待确认' }} · {{ item.sourceLabel }}</small></div><ArrowRight :size="16"/></button><button class="tw-icon" :disabled="busy" :aria-label="'移除'+item.name" @click="drop(item)"><X :size="16"/></button></article>
        <button v-if="draft.routes.length" class="tw-button secondary" :disabled="busy" @click="collectWaypoints"><MapPin :size="14"/>将选中路线的途经点也加入地点清单</button>
        <p class="tw-hint tw-import-warning">保存的是可编辑的旅行资料；途经点顺序不代表可通行轨迹。出发前请核对开放情况、路况与天气。</p>
      </template>
      <p v-if="busy" class="tw-material-processing" role="status"><ScanText :size="17"/>{{ message||'正在读取资料…' }}</p>
    </div><footer class="tw-modal-footer"><button class="tw-button secondary" :disabled="busy" @click="stage==='source'?emit('close'):(stage='source',error='')">{{ stage==='source'?'取消':'返回资料' }}</button><button v-if="stage==='source'" class="tw-button primary" :disabled="busy" @click="analyze">{{ busy?'提取中…':'提取并预览' }}<ArrowRight :size="15"/></button><button v-else class="tw-button primary" :disabled="busy||!selectedCount" @click="save">{{ busy?'保存中…':`收藏选中的 ${selectedCount} 项` }}<Check :size="15"/></button></footer>
  </template>
</TravelModal>
</template>

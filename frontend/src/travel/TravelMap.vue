<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import { LocateFixed, Maximize2, MapPin } from '@lucide/vue'
import 'leaflet/dist/leaflet.css'
import { categoryColors, hasCoordinates } from './model'
export interface MapPoint{id:string;name:string;category:string;longitude?:number|null;latitude?:number|null;order?:number}
const props=defineProps<{points:MapPoint[];selected?:string|null;route?:boolean;road?:[number,number][];pick?:boolean;picked?:{longitude:number;latitude:number}|null}>()
const emit=defineEmits<{select:[id:string];pick:[point:{longitude:number;latitude:number}]}>()
const element=ref<HTMLDivElement|null>(null),frame=ref<HTMLElement|null>(null),message=ref(''),failures=ref(0)
let map:L.Map|undefined,layer:L.LayerGroup|undefined,pickLayer:L.LayerGroup|undefined,observer:ResizeObserver|undefined
const markers=new Map<string,L.Marker>()
function render(fit=true){
  if(!map||!layer)return;layer.clearLayers();markers.clear()
  const points=props.points.filter(hasCoordinates)
  points.forEach((point,index)=>{
    const color=categoryColors[point.category]||'#4d8b7c',number=props.route?String(point.order??index+1):'•'
    const icon=L.divIcon({className:'tw-map-pin'+(point.id===props.selected?' selected':''),html:`<span style="--pin-color:${color}"><b>${number}</b></span>`,iconSize:[34,38],iconAnchor:[17,36]})
    const label=document.createElement('span');label.textContent=point.name
    const marker=L.marker([point.latitude!,point.longitude!],{icon,keyboard:true,alt:point.name,title:point.name}).bindTooltip(label).on('click',()=>emit('select',point.id)).addTo(layer!)
    markers.set(point.id,marker)
  })
  if(props.road?.length)L.polyline(props.road.map(point=>[point[1],point[0]] as L.LatLngTuple),{color:'#6b9bb1',weight:4,opacity:.95}).addTo(layer)
  else if(props.route&&points.length>1)L.polyline(points.map(point=>[point.latitude!,point.longitude!] as L.LatLngTuple),{color:'#e4987b',weight:3,dashArray:'7 7',opacity:.85}).addTo(layer)
  if(fit&&points.length)map.fitBounds(L.latLngBounds(points.map(point=>[point.latitude!,point.longitude!] as L.LatLngTuple)),{padding:[45,45],maxZoom:14,animate:false})
  renderPick()
}
function renderPick(){if(!map||!pickLayer)return;pickLayer.clearLayers();if(props.picked){L.circleMarker([props.picked.latitude,props.picked.longitude],{radius:9,color:'#d36d50',fillOpacity:.7}).addTo(pickLayer);map.panTo([props.picked.latitude,props.picked.longitude])}}
function locate(){message.value='';map?.locate({setView:true,maxZoom:14})}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await frame.value?.requestFullscreen();await nextTick();map?.invalidateSize()}catch{message.value='当前浏览器不支持地图全屏'}}
onMounted(()=>{
  if(!element.value)return
  map=L.map(element.value,{center:[32,105],zoom:4,zoomControl:true,scrollWheelZoom:true})
  L.tileLayer(import.meta.env.VITE_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',referrerPolicy:'strict-origin-when-cross-origin'}).on('tileerror',()=>{failures.value++}).addTo(map)
  layer=L.layerGroup().addTo(map);pickLayer=L.layerGroup().addTo(map)
  map.on('click',(event:L.LeafletMouseEvent)=>{if(props.pick)emit('pick',{longitude:Number(event.latlng.wrap().lng.toFixed(6)),latitude:Number(event.latlng.lat.toFixed(6))})})
  map.on('locationerror',()=>{message.value='未能获取位置。你仍可手动缩放地图或填写坐标。'})
  observer=new ResizeObserver(()=>map?.invalidateSize());observer.observe(element.value);render()
})
watch(()=>[props.points,props.road],()=>render(),{deep:true})
watch(()=>props.selected,id=>{render(false);if(id){const marker=markers.get(id);marker?.openTooltip();if(marker&&!map?.getBounds().contains(marker.getLatLng()))map?.panTo(marker.getLatLng())}})
watch(()=>props.picked,renderPick,{deep:true})
onUnmounted(()=>{observer?.disconnect();map?.remove()})
</script>
<template><section ref="frame" class="tw-map-frame"><div ref="element" class="tw-leaflet" :aria-label="pick?'点击地图选择真实坐标':'收藏地点与行程地图'"></div><div class="tw-map-actions"><button class="tw-icon" type="button" aria-label="定位到当前位置" @click="locate"><LocateFixed :size="17"/></button><button class="tw-icon" type="button" aria-label="地图全屏" @click="fullscreen"><Maximize2 :size="17"/></button></div><p v-if="pick" class="tw-map-caption"><MapPin :size="13"/>点击地图选点，保存后才会更新地点</p><p v-else-if="route" class="tw-map-caption">{{ road?.length?'道路参考路线 · 不含实时路况':'点位按日程编号 · 虚线为直线连接，不是导航路线' }}</p><p v-if="message||failures>=3" class="tw-map-warning" role="status">{{ message||'底图加载受限，已保存的地点与行程仍可使用。' }}</p></section></template>

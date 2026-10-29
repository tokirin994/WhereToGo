import {nextTick,onMounted,onUnmounted,ref,watch,type CSSProperties,type Ref} from 'vue'

interface Rect {left:number;top:number;width:number;height:number}
/** Coordinates are relative to the visible viewport, including Safari zoom and keyboard offsets. */
export function popoverPlacement(anchor:Rect,panel:{width:number;height:number},viewport:Rect,margin=12,gap=8){
  const width=Math.max(0,Math.min(panel.width,viewport.width-margin*2))
  const minLeft=viewport.left+margin,maxRight=viewport.left+viewport.width-margin
  const minTop=viewport.top+margin,maxBottom=viewport.top+viewport.height-margin
  const below=Math.max(0,maxBottom-anchor.top-anchor.height-gap),above=Math.max(0,anchor.top-gap-minTop)
  const upward=panel.height>below&&above>below
  const maxHeight=Math.max(0,Math.min(viewport.height-margin*2,upward?above:below))
  const height=Math.min(panel.height,maxHeight)
  return {left:Math.max(minLeft,Math.min(anchor.left+anchor.width-width,maxRight-width)),
    top:Math.max(minTop,Math.min(upward?anchor.top-gap-height:anchor.top+anchor.height+gap,maxBottom-height)),
    width,maxHeight}
}

/** Keep an absolutely positioned popup inside the visible screen without clipping its contents. */
export function useAnchoredPopover(anchor:Ref<HTMLElement|null>,panel:Ref<HTMLElement|null>,open:Ref<boolean>){
  const style=ref<CSSProperties>({visibility:'hidden'})
  let frame=0,preferredWidth=0,observer:ResizeObserver|undefined
  function position(){
    if(!open.value||!anchor.value||!panel.value)return
    const a=anchor.value.getBoundingClientRect(),p=panel.value
    const visible=window.visualViewport
    const viewport={left:visible?.offsetLeft||0,top:visible?.offsetTop||0,width:visible?.width||document.documentElement.clientWidth,height:visible?.height||window.innerHeight}
    const box=p.getBoundingClientRect()
    if(!preferredWidth)preferredWidth=box.width
    const placement=popoverPlacement(a,{width:preferredWidth,height:p.scrollHeight+p.offsetHeight-p.clientHeight},viewport)
    style.value={position:'absolute',boxSizing:'border-box',minWidth:0,right:'auto',bottom:'auto',
      left:`${placement.left-a.left}px`,top:`${placement.top-a.top}px`,
      width:`${placement.width}px`,maxWidth:`${Math.max(0,viewport.width-24)}px`,maxHeight:`${placement.maxHeight}px`,visibility:'visible'}
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;position()})}
  watch([open,anchor,panel],async ([value])=>{
    observer?.disconnect()
    preferredWidth=0;style.value={visibility:'hidden'}
    if(!value)return
    await nextTick();position()
    if(typeof ResizeObserver!=='undefined'){
      observer=new ResizeObserver(schedule)
      if(panel.value)observer.observe(panel.value)
      if(anchor.value)observer.observe(anchor.value)
    }
  })
  onMounted(()=>{
    window.addEventListener('resize',schedule)
    window.addEventListener('scroll',schedule,true)
    window.visualViewport?.addEventListener('resize',schedule)
    window.visualViewport?.addEventListener('scroll',schedule)
  })
  onUnmounted(()=>{
    observer?.disconnect();cancelAnimationFrame(frame)
    window.removeEventListener('resize',schedule)
    window.removeEventListener('scroll',schedule,true)
    window.visualViewport?.removeEventListener('resize',schedule)
    window.visualViewport?.removeEventListener('scroll',schedule)
  })
  return {style,position}
}

export function useDetailsPopover(menu:Ref<HTMLDetailsElement|null>=ref(null),panel:Ref<HTMLElement|null>=ref(null)){
  const open=ref(false)
  const {style}=useAnchoredPopover(menu,panel,open)
  function toggled(){open.value=!!menu.value?.open}
  function close(restoreFocus=true){if(menu.value)menu.value.open=false;open.value=false;if(restoreFocus)menu.value?.querySelector('summary')?.focus()}
  function outside(event:PointerEvent){if(event.target instanceof Node&&!menu.value?.contains(event.target))close(false)}
  onMounted(()=>window.addEventListener('pointerdown',outside))
  onUnmounted(()=>window.removeEventListener('pointerdown',outside))
  return {menu,panel,style,toggled,close}
}

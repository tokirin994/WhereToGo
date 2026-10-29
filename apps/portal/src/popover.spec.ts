import {describe,expect,it} from 'vitest'
import {popoverPlacement} from '@personal/platform/popover'

describe('popup screen boundaries',()=>{
  const viewport={left:0,top:0,width:390,height:844}
  it('moves an end-aligned app menu away from the left edge',()=>{
    const result=popoverPlacement({left:145,top:30,width:44,height:44},{width:264,height:300},viewport)
    expect(result.left).toBe(12);expect(result.top).toBe(82)
  })
  it('keeps right-hand menus in the viewport',()=>{
    const result=popoverPlacement({left:355,top:20,width:44,height:44},{width:264,height:300},viewport)
    expect(result.left+result.width).toBe(378)
  })
  it('opens above a trigger near the bottom of the screen',()=>{
    const result=popoverPlacement({left:240,top:780,width:44,height:44},{width:205,height:200},viewport)
    expect(result.top).toBe(572);expect(result.maxHeight).toBe(760)
  })
  it('limits oversized menus and lets their content scroll',()=>{
    const result=popoverPlacement({left:100,top:15,width:44,height:44},{width:500,height:900},viewport)
    expect(result.width).toBe(366);expect(result.left).toBe(12);expect(result.maxHeight).toBe(765)
  })
  it('uses Safari visible viewport offsets and keyboard height',()=>{
    const result=popoverPlacement({left:190,top:400,width:44,height:44},{width:264,height:300},{left:70,top:160,width:290,height:380})
    expect(result.left).toBe(82);expect(result.width).toBe(264)
    expect(result.top).toBe(172);expect(result.maxHeight).toBe(220)
  })
  it.each([320,375,390,430,768,1280])('fits a menu on a %ipx screen',width=>{
    for(const x of [0,80,width-44]){
      const result=popoverPlacement({left:x,top:10,width:44,height:44},{width:264,height:400},{...viewport,width})
      expect(result.left).toBeGreaterThanOrEqual(12)
      expect(result.left+result.width).toBeLessThanOrEqual(width-12)
    }
  })
})

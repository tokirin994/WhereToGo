import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {canonicalOcrFile,ocrWorkerOptions,OCR_MODEL_CACHE,resizeOcrPixels} from './ocrRuntime'
import {parseReceiptText,retainEnterpriseMealScene} from './importers'

describe('cross-device OCR contract',()=>{
  it('isolates cached language data by the actual deployed model revisions',()=>{
    const fingerprints=['chi_sim','eng','chi_tra'].map(name=>createHash('sha256').update(readFileSync(new URL(`../public/tesseract/lang/${name}.traineddata.gz`,import.meta.url))).digest('hex').slice(0,8)).join('-')
    expect(OCR_MODEL_CACHE).toContain(fingerprints)
    expect(ocrWorkerOptions('/ledger/')).toMatchObject({cachePath:OCR_MODEL_CACHE,langPath:'/ledger/tesseract/lang'})
  })
  it('retains pixels when no resize is requested',()=>{
    const pixels=new Uint8ClampedArray([255,0,0,255,0,255,0,255])
    expect(resizeOcrPixels(pixels,2,1,2,1)).toEqual(pixels)
  })
  it('uses the same explicit bilinear rounding on every engine',()=>{
    expect([...resizeOcrPixels(new Uint8ClampedArray([255,0,0,255,0,255,0,255]),2,1,1,1)]).toEqual([128,128,0,255])
    expect([...resizeOcrPixels(new Uint8ClampedArray([12,34,56,255]),1,1,2,2)]).toEqual(Array(4).fill([12,34,56,255]).flat())
  })
  it('rejects a missing canonical image instead of silently mixing decoders',()=>{
    expect(()=>canonicalOcrFile(null)).toThrow('统一识别图像')
  })
  it('preserves enterprise meal recognition when the other pass wins field scoring',()=>{
    const scene=parseReceiptText('消费记录详情\n企业订单\n已支付\n¥18.25\n订单时间 2025-06-07 12:13:14\n消费商家 合成餐馆\n业务场景 工作餐')
    const ordinary=parseReceiptText('商户：合成餐馆\n实付金额：18.25\n支付时间：2025-06-07 12:13:14')
    expect(ordinary.presetKey).toBeUndefined()
    expect(retainEnterpriseMealScene(ordinary,[scene,ordinary])).toMatchObject({presetKey:'meituan_enterprise_meal',amount:18.25,title:'合成餐馆',paymentMethod:'公司补贴',offsetEnabled:true,offsetRatio:100})
    expect(retainEnterpriseMealScene(ordinary,[ordinary]).offsetEnabled).toBeUndefined()
  })
  it('recognizes a detail when its heading is unreadable but normalized fields agree',()=>{
    const receipt=parseReceiptText('合成商户\n-18.25\n支付方式 合成银行信用卡(9876)、\n支付时间 2025-06-07 12:13:14\n商品说明 矿泉水')
    expect(receipt).toMatchObject({title:'合成商户',amount:18.25,paymentMethod:'合成银行信用卡(9876)'})
  })
})

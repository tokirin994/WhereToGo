import {describe,it,expect} from 'vitest'
import {responseJson} from './responseJson'
describe('JSON-only account data',()=>{
 it('accepts JSON and empty successful mutation responses',async()=>{expect(await responseJson(new Response('{"ok":true}'))).toEqual({ok:true});expect(await responseJson(new Response(null,{status:204}))).toBeUndefined()})
 it('rejects an HTTP 200 login page without exposing its HTML',async()=>{await expect(responseJson(new Response('<!doctype html><input value="private-data">',{headers:{'content-type':'text/html'}}))).rejects.toThrow('服务返回了网页')})
 it('gives a readable error for malformed JSON',async()=>{await expect(responseJson(new Response('broken-response'))).rejects.toThrow('无法读取')})
})

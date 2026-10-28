import {describe,it,expect} from 'vitest'
import {accountDate,accountProfile,accountSessions} from './accountPresentation'
describe('account response presentation',()=>{
 it('formats Unix seconds, milliseconds, numeric strings and ISO dates consistently',()=>{const stamp=1793100000000;expect(accountDate(stamp/1000)).toBe(accountDate(stamp));expect(accountDate(String(stamp))).toBe(accountDate(stamp));expect(accountDate(new Date(stamp).toISOString())).toBe(accountDate(stamp))})
 it.each(['invalid date','not-set',undefined,Number.NaN,Number.POSITIVE_INFINITY,9e17])('does not throw or blank the screen for invalid date %s',value=>{expect(accountDate(value)).toBe('—')})
 it('requires an actual profile and never renders metadata as user text',()=>{expect(()=>accountProfile('<html>')).toThrow('资料格式');expect(accountProfile({id:'alice',username:'alice',firstName:{secret:'not text'}}).firstName).toBe('')})
 it('accepts native Keycloak session arrays and ignores malformed client rows',()=>{const sessions=accountSessions([{id:'device1',lastAccess:'1793100000',clients:{unexpected:true}},null,{invalid:true}]);expect(sessions).toHaveLength(1);expect(sessions[0]!.clients).toEqual([]);expect(accountSessions({sessions:[]})).toEqual([]);expect(()=>accountSessions({notSessions:[]})).toThrow('设备信息格式')})
})

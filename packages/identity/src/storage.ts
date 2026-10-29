/** Lazy access keeps a denied Safari storage permission from crashing the entry module.
 * PKCE state must survive navigation: never silently replace it with memory storage.
 */
export function browserSessionStorage():Storage{
  const run=<T>(operation:(store:Storage)=>T):T=>{
    try{return operation(window.sessionStorage)}
    catch{throw new Error('浏览器无法保存登录会话，请允许此网站使用存储后重试；也可改用普通浏览窗口')}
  }
  return {
    get length(){return run(store=>store.length)},
    key:index=>run(store=>store.key(index)),
    getItem:key=>run(store=>store.getItem(key)),
    setItem:(key,value)=>run(store=>store.setItem(key,value)),
    removeItem:key=>run(store=>store.removeItem(key)),
    clear:()=>run(store=>store.clear()),
  }
}

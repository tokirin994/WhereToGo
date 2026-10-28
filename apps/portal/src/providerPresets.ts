export const providerPresets=[
  {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com/v1',model:'deepseek-chat',protocol:'chat-completions'},
  {id:'glm',name:'GLM / 智谱',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'',protocol:'chat-completions'},
  {id:'openai',name:'OpenAI / GPT',baseUrl:'https://api.openai.com/v1',model:'',protocol:'responses'},
  {id:'anthropic',name:'Claude',baseUrl:'https://api.anthropic.com/v1',model:'',protocol:'anthropic'},
  {id:'custom-ai',name:'其他兼容 AI',baseUrl:'',model:'',protocol:'chat-completions'},
  {id:'amap',name:'高德地图',baseUrl:'',model:'',protocol:'chat-completions'},
] as const

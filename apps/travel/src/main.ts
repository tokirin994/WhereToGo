import {createApp,h} from 'vue'
import ApplicationBoundary from '@personal/platform/ApplicationBoundary.vue'
import {portalUrl} from './appLinks'
import {createPinia} from 'pinia'
import App from './TravelRoot.vue'
import './style.css'
createApp({render:()=>h(ApplicationBoundary,{appName:'旅行规划',portalUrl},()=>h(App))}).use(createPinia()).mount('#app')

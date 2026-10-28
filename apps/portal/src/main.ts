import { createApp,h } from 'vue'
import ApplicationBoundary from '@personal/platform/ApplicationBoundary.vue'
import {portalUrl} from './appLinks'
import App from './PortalRoot.vue'
import './style.css'

createApp({render:()=>h(ApplicationBoundary,{appName:'个人空间',portalUrl},()=>h(App))}).mount('#app')

import { createApp,h } from 'vue'
import ApplicationBoundary from '@personal/platform/ApplicationBoundary.vue'
import {portalUrl} from './appLinks'
import App from './App.vue'
import './style.css'
import './ledger.css'
import './workspace.css'
import './visual-refresh.css'
import './ledger-ui.css'
import './experience.css'
import './ocr-ui.css'
import './mobile-layout.css'

createApp({render:()=>h(ApplicationBoundary,{appName:'日常记账',portalUrl},()=>h(App))}).mount('#app')

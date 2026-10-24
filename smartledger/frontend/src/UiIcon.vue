<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })
const paths: Record<string,string[]> = {
  image:['M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5','M9 7h.01'],
  file:['M14 2H5v20h14V7l-5-5zM14 2v5h5M8 12h8M8 16h6'],
  table:['M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16'],
  camera:['M3 7h4l2-3h6l2 3h4v14H3V7z','M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  expand:['M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5'],
  download:['M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5'], minus:['M5 12h14'],
  overview:['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  sync:['M20 7a8 8 0 0 0-14-2L3 8M3 3v5h5M4 17a8 8 0 0 0 14 2l3-3M21 21v-5h-5'],
  scan:['M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 8h10M7 12h10M7 16h6'],
  wallet:['M20 8V5H5a2 2 0 0 0 0 4h15v11H5a2 2 0 0 1-2-2V7M20 12h-5v4h5M17 14h.01'],
  budget:['M12 3a9 9 0 1 0 9 9h-9V3zM16 3v5h5a8 8 0 0 0-5-5'],
  tag:['M3 3h7l11 11-7 7L3 10V3zM7 7h.01'], premium:['m4 16 6-6 4 4 6-10M15 4h5v5'],
  chart:['M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7'], trend:['M3 18 9 12l4 4L21 5M15 5h6v6'],
  plus:['M12 5v14M5 12h14'], close:['m6 6 12 12M6 18 18 6'], search:['M21 21l-5-5','M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0'],
  back:['m14 6-6 6 6 6'], chevron:['m9 5 7 7-7 7'], down:['m6 9 6 6 6-6'],
  more:['M5 12h.01M12 12h.01M19 12h.01'], edit:['m15 4 5 5L9 20H4v-5L15 4zM13 6l5 5'],
  trash:['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
  pin:['m9 3 10 10-3 1-3 5-2-2-6 5 5-6-2-2 5-3 1-3z'],
  export:['M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8'], book:['M4 5a2 2 0 0 1 2-2h14v17H6a2 2 0 0 0-2 2V5zM4 18h16M8 7h8'],
  calendar:['M4 5h16v16H4zM8 3v4M16 3v4M4 10h16'], filter:['M4 6h16M7 12h10M10 18h4'],
  sort:['M8 4v16m-3-3 3 3 3-3M14 5h6M14 10h4M14 15h2'],
  list:['M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01'],
  income:['M18 6 6 18M6 7v11h11'], expense:['M6 18 18 6M7 6h11v11'], check:['m5 12 4 4L19 6'],
  users:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 3a4 4 0 0 1 0 8'],
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="ledger-ui-icon"><path v-for="(path,index) in paths[name] || paths.list" :key="index" :d="path" stroke="currentColor" :stroke-width="name==='more'?3:1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></template>
<style scoped>.ledger-ui-icon{display:block;flex:none;}</style>

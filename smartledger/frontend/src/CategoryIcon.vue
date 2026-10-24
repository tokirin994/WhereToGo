<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name?: string | null; color?: string; size?: number }>(), { name: '', color: 'currentColor', size: 20 })
const aliases: Record<string, string> = {
  'fork-knife':'food','fork.knife':'food','fork-knife-circle-fill':'food',
  car:'car','car.fill':'car','car-side':'car','house':'house','house.fill':'house',
  bag:'bag','bag.fill':'bag','heart':'heart','heart.fill':'heart','book':'book','book.fill':'book',
  game:'game','gamecontroller.fill':'game','gift':'gift','gift.fill':'gift','book.closed.fill':'book','books.vertical.fill':'book','folder':'book','folder.fill':'book',
  'credit-card':'card','creditcard.fill':'card','ellipsis':'grid','more':'grid',
  wallet:'wallet','wallet.pass.fill':'wallet',store:'store','storefront.fill':'store',
  chart:'chart','chart.bar.fill':'chart',plus:'plus',grid:'grid','square.grid.2x2.fill':'grid',
  airplane:'travel','airplane.fill':'travel','airplane.circle.fill':'travel','suitcase.rolling.fill':'travel','bus.fill':'travel','tram.fill':'travel',
  'cup.and.saucer.fill':'food','takeoutbag.and.cup.and.straw.fill':'food',
  'cross.case.fill':'health','pills.fill':'health','graduationcap.fill':'book',
  'ticket.fill':'travel','bed.double.fill':'house','cart.fill':'bag',
}
const paths: Record<string, string[]> = {
  food: ['M7 3v7','M4 3v4a3 3 0 0 0 6 0V3','M7 10v11','M17 3v18','M17 3c-2 2-3 5-3 8h3'],
  car: ['M5 11l1.5-5h11L19 11','M3 11h18v7H3z','M6 18v2','M18 18v2','M6 14h.01','M18 14h.01'],
  house: ['M3 11l9-8 9 8','M5 10v11h14V10','M9 21v-7h6v7'],
  bag: ['M4 8h16l-1 13H5L4 8z','M9 8V6a3 3 0 0 1 6 0v2'],
  heart: ['M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.8 2.8z'],
  book: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z','M4 5.5v16','M8 7h8'],
  game: ['M6 9h12a4 4 0 0 1 3.8 5l-1 3.2a2 2 0 0 1-3.2 1L15 16H9l-2.6 2.2a2 2 0 0 1-3.2-1L2.2 14A4 4 0 0 1 6 9z','M7 12v4','M5 14h4','M17 13h.01','M19 15h.01'],
  gift: ['M3 9h18v12H3z','M2 5h20v4H2z','M12 5v16','M12 5H8.5a2.5 2.5 0 1 1 2.5-2.5V5z','M12 5h3.5A2.5 2.5 0 1 0 13 2.5V5z'],
  card: ['M3 5h18v14H3z','M3 10h18','M7 15h4'],
  wallet: ['M4 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6z','M3 7V5a2 2 0 0 1 2-2h13','M15 12h6v4h-6a2 2 0 0 1 0-4z'],
  store: ['M3 10h18l-2-7H5z','M4 10v11h16V10','M9 21v-7h6v7','M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0'],
  chart: ['M4 20V4','M4 20h17','M8 16v-5','M13 16V7','M18 16v-9'],
  plus: ['M12 5v14','M5 12h14'],
  grid: ['M4 4h6v6H4z','M14 4h6v6h-6z','M4 14h6v6H4z','M14 14h6v6h-6z'],
  travel: ['M3 14l8-2 1-8a2 2 0 0 1 4 0l-1 7 5 2a2 2 0 0 1 1 3l-7-1-4 5-2-.5 2-5-7 1z'],
  health: ['M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11z','M12 8v6','M9 11h6'],
}
const glyph = computed(() => aliases[props.name || ''] || '')
const emoji = computed(() => !glyph.value && props.name && !/^[\p{L}\p{N}._-]+$/u.test(props.name) ? props.name : '')
</script>

<template>
  <svg v-if="glyph" class="category-icon-svg" :width="size" :height="size" viewBox="0 0 24 24" fill="none" :style="{color}" aria-hidden="true">
    <path v-for="(path,index) in paths[glyph]" :key="index" :d="path" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <span v-else class="category-icon-emoji" :style="{color}">{{ emoji || '◈' }}</span>
</template>

import { nextTick, onMounted, onUnmounted, type Ref } from 'vue'
let locks = 0, previousOverflow = ''
export function useDialogFocus(element: Ref<HTMLElement | null>) {
  let previous: HTMLElement | null = null, mounted = false
  onMounted(async () => {
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!locks++) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    mounted = true
    await nextTick(); if (mounted) element.value?.focus()
  })
  onUnmounted(() => {
    mounted = false
    if (--locks === 0) document.body.style.overflow = previousOverflow
    if (previous?.isConnected) previous.focus()
  })
}
export function trapDialogTab(event: KeyboardEvent, element: HTMLElement | null) {
  if (event.key !== 'Tab' || !element) return
  const options = [...element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(item => item.getClientRects().length)
  const first = options[0], last = options.at(-1)
  if (!first) { event.preventDefault(); element.focus(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus() }
}

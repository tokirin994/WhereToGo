const base = import.meta.env.BASE_URL || '/'
export const pdfOptions = {
  cMapUrl: `${base}pdfjs/cmaps/`, cMapPacked: true,
  iccUrl: `${base}pdfjs/iccs/`,
  standardFontDataUrl: `${base}pdfjs/standard_fonts/`, wasmUrl: `${base}pdfjs/wasm/`,
}
export async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdfjs/pdf.worker.min.mjs`
  return pdfjs
}

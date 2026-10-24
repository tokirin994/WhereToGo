export type ImportSourceKind = 'image' | 'pdf' | 'table' | 'text' | 'unsupported'
export interface ImportSource {
  id: string; file: File; name: string; url: string; kind: ImportSourceKind
  status: 'queued' | 'processing' | 'ready' | 'error'
  candidateCount: number; error: string
}
export function importSourceKind(file: File): ImportSourceKind {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (file.type.startsWith('image/') || /^(png|jpe?g|webp|gif|bmp|tiff?|avif)$/.test(extension || '')) return 'image'
  if (extension === 'pdf' || file.type === 'application/pdf') return 'pdf'
  if (extension === 'csv' || extension === 'xlsx') return 'table'
  if (extension === 'txt') return 'text'
  return 'unsupported'
}
export function createImportSource(file: File): ImportSource {
  return { id: crypto.randomUUID(), file, name: file.name, url: URL.createObjectURL(file), kind: importSourceKind(file), status: 'queued', candidateCount: 0, error: '' }
}
export function formatFileSize(size: number): string {
  return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
}

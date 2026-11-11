import { apiError, authorizedRequest } from './apiClient'
import { parseReceiptText, type ImportCandidate } from './importers'
import { OCR_REVISION, ocrFingerprint } from './ocrRuntime'
import { applyReceiptEvidence, inspectReceiptRows, type ReceiptRow } from './receiptEvidence'

const MAX_BYTES = 4 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function enhancedImageType(file: File) {
  if (TYPES.includes(file.type)) return file.type
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  return extension === 'png' || extension === 'webp' ? `image/${extension}`
    : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : undefined
}

const center = ({ y0, y1 }: ReceiptRow['bbox']) => (y0 + y1) / 2

function readRows(rows: ReceiptRow[]) {
  const lines: ReceiptRow[][] = []
  for (const row of [...rows].sort((a, b) => center(a.bbox) - center(b.bbox))) {
    const previous = lines.at(-1)
    const anchor = previous?.[0]?.bbox
    const box = row.bbox
    if (previous && anchor && Math.abs(center(anchor) - center(box)) <= Math.min(anchor.y1 - anchor.y0, box.y1 - box.y0) * .45) {
      previous.push(row)
    } else {
      lines.push([row])
    }
  }
  return lines.map(line => line.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(row => row.text).join(' ')).join('\n')
}

export async function requestEnhancedReceipt(apiUrl: string, token: string, file: File): Promise<ImportCandidate> {
  const type = enhancedImageType(file)
  if (!type) throw new Error('增强识别支持 PNG、JPEG 和 WebP')
  if (file.size > MAX_BYTES) throw new Error('图片超过 4 MiB，请压缩后再试')
  const response = await authorizedRequest(apiUrl, token, '/api/v1/ocr/recognize', {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: await file.arrayBuffer(),
  })
  if (!response.ok) throw await apiError(response, '增强识别失败')
  const result = await response.json() as { engine: string; width: number; height: number; rows: ReceiptRow[] }
  if (!Array.isArray(result.rows) || !result.rows.length) throw new Error('增强识别未找到文字，请对照原图')
  const candidate = parseReceiptText(readRows(result.rows))
  applyReceiptEvidence(candidate, inspectReceiptRows([result.rows]), value => parseReceiptText(value).happenedAt)
  candidate.ocrDiagnostic = {
    revision: OCR_REVISION, modelCache: result.engine, engine: result.engine,
    sourceSha256: await ocrFingerprint(file), sourceBytes: file.size, width: result.width, height: result.height,
  }
  return candidate
}

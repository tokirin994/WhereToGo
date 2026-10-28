/** Normalize OCR spacing without joining English words or separate receipt lines. */
export function normalizeOcrText(value: string): string {
  return value.normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B\u2060\uFEFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/(?<=\p{Script=Han}) +(?=\p{Script=Han})/gu, '')
    .replace(/ +([，。！？、；：）】》])/g, '$1')
    .replace(/([（【《]) +/g, '$1')
    .split('\n').map(line => line.trim()).join('\n').trim()
}

export function normalizeOcrName(value: string | null | undefined): string {
  return normalizeOcrText(value || '').replace(/\n+/g, ' ')
    .replace(/(?<=\p{Script=Han}) +(?=[A-Za-z0-9(])/gu, '')
    .replace(/(?<=[A-Za-z0-9)]) +(?=\p{Script=Han})/gu, '')
    .replace(/ +([),:;!?])/g, '$1').replace(/([(]) +/g, '$1').trim()
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  const lines = text.split(/\r?\n/, 60)
  const firstLine = lines.find(line => /金额|交易时间|商品/.test(line) && /[,\t]/.test(line)) || lines[0]
  const separator = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ','
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index++ }
    else if (char === '"') quoted = !quoted
    else if (char === separator && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(cell.trim()); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row)
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '')
  return rows
}

/** UTF-8 exports and legacy Chinese bank/WeChat CSV files both occur in practice. */
export async function readBillText(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer()
  const data = new Uint8Array(bytes)
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return new TextDecoder('gb18030').decode(bytes) }
}

/**
 * The letter to the studio (wow-plan E9). Pure — tested in letter.test.ts.
 */
export interface Letter {
  name: string
  email: string
  message: string
}

export type LetterField = keyof Letter

export const LETTER_LIMITS = { name: 80, email: 120, message: 2000 } as const

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Which fields are not right (empty when the letter can go). */
export function letterErrors(l: Letter): LetterField[] {
  const out: LetterField[] = []
  if (!l.name.trim() || l.name.length > LETTER_LIMITS.name) out.push('name')
  if (!EMAIL.test(l.email.trim()) || l.email.length > LETTER_LIMITS.email) out.push('email')
  if (l.message.trim().length < 2 || l.message.length > LETTER_LIMITS.message) out.push('message')
  return out
}

/** What goes out: trimmed. */
export const cleanLetter = (l: Letter): Letter => ({ name: l.name.trim(), email: l.email.trim(), message: l.message.trim() })

/**
 * Lines of the message as they are written on the 3D sheet: wrapped at `perLine` characters
 * (by words; a word longer than a line is cut), at most `maxLines` (the last ends in "…").
 */
export function sheetLines(text: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = []
  for (const para of text.split(/\n/)) {
    let line = ''
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > perLine) {
        if (line) {
          lines.push(line)
          line = ''
        }
        lines.push(word.slice(0, perLine))
        word = word.slice(perLine)
      }
      if (!line) line = word
      else if (line.length + 1 + word.length <= perLine) line += ' ' + word
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  if (lines.length <= maxLines) return lines
  const cut = lines.slice(0, maxLines)
  const last = cut[maxLines - 1]!
  cut[maxLines - 1] = (last.length > perLine - 1 ? last.slice(0, perLine - 1) : last) + '…'
  return cut
}

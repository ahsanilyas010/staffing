import { en, type CopyKey } from './en'
import { ur } from './ur'

export type Lang = 'en' | 'ur'

const dictionaries = { en, ur } as const

export function t(lang: Lang, key: CopyKey, vars: Record<string, string> = {}): string {
  let text: string = dictionaries[lang][key] ?? dictionaries.en[key]
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{{${k}}}`, v)
  }
  return text
}

export { en, ur }
export type { CopyKey }

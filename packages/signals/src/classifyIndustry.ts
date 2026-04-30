// NAICS industry classification via Claude Haiku 4.5.
// Used by TerritoryLord to classify candidates that lack a Wikidata industry tag.
// Called with the rep's decrypted BYOK Anthropic key.

import Anthropic from '@anthropic-ai/sdk'

export const NAICS_SECTORS = [
  { code: '11', label: 'Agriculture, Forestry, Fishing and Hunting' },
  { code: '21', label: 'Mining, Quarrying, and Oil and Gas Extraction' },
  { code: '22', label: 'Utilities' },
  { code: '23', label: 'Construction' },
  { code: '31', label: 'Manufacturing' },
  { code: '42', label: 'Wholesale Trade' },
  { code: '44', label: 'Retail Trade' },
  { code: '48', label: 'Transportation and Warehousing' },
  { code: '51', label: 'Information' },
  { code: '52', label: 'Finance and Insurance' },
  { code: '53', label: 'Real Estate and Rental and Leasing' },
  { code: '54', label: 'Professional, Scientific, and Technical Services' },
  { code: '55', label: 'Management of Companies and Enterprises' },
  { code: '56', label: 'Administrative and Support Services' },
  { code: '61', label: 'Educational Services' },
  { code: '62', label: 'Health Care and Social Assistance' },
  { code: '71', label: 'Arts, Entertainment, and Recreation' },
  { code: '72', label: 'Accommodation and Food Services' },
  { code: '81', label: 'Other Services' },
  { code: '99', label: 'Unknown / Other' },
] as const

export type NaicsSectorCode = typeof NAICS_SECTORS[number]['code']

export type IndustryClassification = {
  naicsCode: NaicsSectorCode
  naicsLabel: string
  confidence: 'high' | 'low'
}

const SECTOR_LIST = NAICS_SECTORS.map(s => `${s.code}: ${s.label}`).join('\n')

export async function classifyIndustry(
  orgName: string,
  description: string | null,
  anthropicApiKey: string,
): Promise<IndustryClassification> {
  const client = new Anthropic({ apiKey: anthropicApiKey })

  const context = description
    ? `Company: ${orgName}\nDescription: ${description}`
    : `Company: ${orgName}`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8,
      messages: [{
        role: 'user',
        content: `Classify this company into the best-matching NAICS 2-digit sector code. Reply with ONLY the 2-digit number.\n\nSectors:\n${SECTOR_LIST}\n\n${context}`,
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const code = text.replace(/\D/g, '').slice(0, 2) as NaicsSectorCode
    const match = NAICS_SECTORS.find(s => s.code === code)

    if (match) return { naicsCode: match.code, naicsLabel: match.label, confidence: 'high' }
  } catch (err) {
    console.warn('[TerritoryLord/classifyIndustry] Haiku call failed', { orgName, err })
  }

  return { naicsCode: '99', naicsLabel: 'Unknown / Other', confidence: 'low' }
}

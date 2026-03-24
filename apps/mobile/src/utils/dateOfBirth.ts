type ParsedDateOfBirth = {
  date: Date
  iso: string
}

const GERMAN_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function padDatePart(value: number) {
  return value.toString().padStart(2, '0')
}

function buildParsedDate(day: number, month: number, year: number): ParsedDateOfBirth | null {
  const date = new Date(year, month - 1, day)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return {
    date,
    iso: `${year}-${padDatePart(month)}-${padDatePart(day)}`,
  }
}

export function formatDateOfBirthInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)

  if (digits.length <= 2) {
    return digits
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

export function parseDateOfBirthInput(value: string): ParsedDateOfBirth | null {
  const trimmed = value.trim()
  const germanMatch = trimmed.match(GERMAN_DATE_PATTERN)

  if (germanMatch) {
    const [, dayText, monthText, yearText] = germanMatch
    return buildParsedDate(Number(dayText), Number(monthText), Number(yearText))
  }

  const isoMatch = trimmed.match(ISO_DATE_PATTERN)
  if (isoMatch) {
    const [, yearText, monthText, dayText] = isoMatch
    return buildParsedDate(Number(dayText), Number(monthText), Number(yearText))
  }

  return null
}

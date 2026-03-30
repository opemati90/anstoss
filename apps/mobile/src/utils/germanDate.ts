type ParsedGermanDate = {
  date: Date
  iso: string
}

type ParsedGermanTime = {
  hours: number
  minutes: number
  value: string
}

const GERMAN_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const GERMAN_TIME_PATTERN = /^(\d{2}):(\d{2})$/

function pad(value: number) {
  return value.toString().padStart(2, '0')
}

function buildParsedDate(day: number, month: number, year: number): ParsedGermanDate | null {
  const date = new Date(year, month - 1, day)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  date.setHours(0, 0, 0, 0)

  return {
    date,
    iso: `${year}-${pad(month)}-${pad(day)}`,
  }
}

export function formatGermanDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)

  if (digits.length <= 2) {
    return digits
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

export function parseGermanDateInput(value: string): ParsedGermanDate | null {
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

export function formatGermanTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)

  if (digits.length <= 2) {
    return digits
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export function parseGermanTimeInput(value: string): ParsedGermanTime | null {
  const trimmed = value.trim()
  const match = trimmed.match(GERMAN_TIME_PATTERN)

  if (!match) {
    return null
  }

  const [, hoursText, minutesText] = match
  const hours = Number(hoursText)
  const minutes = Number(minutesText)

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null
  }

  return {
    hours,
    minutes,
    value: `${pad(hours)}:${pad(minutes)}`,
  }
}

export function buildGermanDateTime(dateValue: string, timeValue: string) {
  const parsedDate = parseGermanDateInput(dateValue)
  const parsedTime = parseGermanTimeInput(timeValue)

  if (!parsedDate || !parsedTime) {
    return null
  }

  const date = new Date(parsedDate.date)
  date.setHours(parsedTime.hours, parsedTime.minutes, 0, 0)

  return date
}

export function formatGermanShortDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatGermanDateTime(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = typeof value === 'string' ? new Date(value) : value

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(options || {}),
  }).format(date)
}

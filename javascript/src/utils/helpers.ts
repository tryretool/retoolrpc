export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result: Partial<T> = {}

  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }

  return result as Pick<T, K>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isFalsyArgumentValue(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

export function isBooleanString(value: unknown): value is string {
  if (typeof value === 'string') {
    const lowercaseValue = value.toLowerCase()
    return lowercaseValue === 'true' || lowercaseValue === 'false'
  }

  return false
}

export function isNumberString(value: unknown): value is string {
  if (typeof value === 'string') {
    // Use a regular expression to check if the string is a valid number
    return /^-?\d+(\.\d+)?$/.test(value)
  }

  return false
}

export function isClientError(status: number): boolean {
  return status >= 400 && status < 500
}

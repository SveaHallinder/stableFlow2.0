export function isValidHorseBirthYear(value: number, currentYear = new Date().getFullYear()): boolean {
  return Number.isInteger(value) && value >= 1900 && value <= currentYear;
}

export function parseHorseBirthYear(value: string, currentYear = new Date().getFullYear()): number | undefined {
  const trimmed = value.trim();
  const year = Number(trimmed);
  return /^\d{4}$/.test(trimmed) && isValidHorseBirthYear(year, currentYear) ? year : undefined;
}

export function getHorseAge(horse: { birthYear?: number; age?: number }, currentYear = new Date().getFullYear()): number | undefined {
  if (horse.birthYear !== undefined) {
    return isValidHorseBirthYear(horse.birthYear, currentYear) ? currentYear - horse.birthYear : undefined;
  }
  return horse.age !== undefined && Number.isInteger(horse.age) && horse.age >= 0 ? horse.age : undefined;
}

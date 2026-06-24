/** 10-digit Indian mobile (digits only, no country code) */
export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));
}

/** Min 2 non-space characters */
export function isValidName(name: string): boolean {
  return name.trim().length >= 2;
}

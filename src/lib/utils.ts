import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function anonimizeCredit(email: string): string {
  if (!email || !email.includes('@')) return 'usuário_desconhecido';
  const [local, domain] = email.split('@');
  if (local.length <= 4) {
    return `${local}*****@${domain}`;
  }
  return `${local.slice(0, 4)}${'*'.repeat(local.length - 4)}@${domain}`;
}

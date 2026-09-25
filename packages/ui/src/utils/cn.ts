import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 类名合并：clsx（条件拼接）+ tailwind-merge（冲突类后者胜），ADR-0009 技术栈 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

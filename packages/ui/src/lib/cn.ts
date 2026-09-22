import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 类名合并：clsx 组合 + tailwind-merge 去冲突（ADR-0009） */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

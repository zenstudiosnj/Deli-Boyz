export const REWARD_TOKEN_PREFIX = 'DBZ';

export interface Tier {
  name: string;
  color: string;
  min: number;
  next: number | null;
}

export function getTier(points: number): Tier {
  if (points >= 250) return { name: 'BRONX BOSS', color: '#ff4500', min: 250, next: null };
  if (points >= 100) return { name: 'HARLEM HERO', color: '#f59e0b', min: 100, next: 250 };
  return { name: 'STREET STARTER', color: '#a8a29e', min: 0, next: 100 };
}

export function pointsToNextTier(points: number): number | null {
  const tier = getTier(points);
  return tier.next !== null ? tier.next - points : null;
}

// Reward tokens are prefixed so a scanner can tell a promotional reward QR
// apart from a customer loyalty QR (which encodes the raw Firebase Auth UID).
export function isRewardToken(token: string): boolean {
  return token.startsWith(`${REWARD_TOKEN_PREFIX}-`);
}

export function generateRewardToken(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${REWARD_TOKEN_PREFIX}-${hex}`;
}

export function formatExpiry(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

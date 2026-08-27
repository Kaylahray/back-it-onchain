import * as React from 'react';

export type BadgeTone = 'green' | 'yellow' | 'red' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-800 border-green-300',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  red: 'bg-red-100 text-red-800 border-red-300',
  neutral: 'bg-gray-100 text-gray-700 border-gray-300',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: React.ReactNode;
}

/**
 * Small status pill.
 *
 * Colour alone is not the signal — the label always carries the meaning in
 * words too, so the badge is readable to anyone who cannot distinguish the
 * tones.
 */
export function Badge({ tone = 'neutral', children, className = '', ...rest }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

export default Badge;

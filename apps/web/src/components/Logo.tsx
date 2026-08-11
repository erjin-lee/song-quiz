interface LogoProps {
  size?: 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<LogoProps['size']>, string> = {
  md: 'text-xl',
  lg: 'text-3xl',
};

const BADGE_SIZE_CLASSES: Record<NonNullable<LogoProps['size']>, string> = {
  md: 'h-8 w-8 text-base',
  lg: 'h-10 w-10 text-xl',
};

export function Logo({ size = 'lg', className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-400 text-white shadow-sm ${BADGE_SIZE_CLASSES[size]}`}
      >
        ♪
      </span>
      <span
        className={`bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text font-extrabold tracking-tight text-transparent ${SIZE_CLASSES[size]}`}
      >
        노래맞추기
      </span>
    </div>
  );
}

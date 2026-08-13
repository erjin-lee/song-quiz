interface LogoProps {
  size?: 'md' | 'lg';
  className?: string;
}

const IMG_SIZE_CLASSES: Record<NonNullable<LogoProps['size']>, string> = {
  md: 'h-8',
  lg: 'h-10',
};

export function Logo({ size = 'lg', className = '' }: LogoProps) {
  return (
    <img
      src="/noraemat_logo.png"
      alt="♪노래맞히기"
      className={`w-auto ${IMG_SIZE_CLASSES[size]} ${className}`}
    />
  );
}

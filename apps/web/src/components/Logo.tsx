import { Link } from 'react-router-dom';

interface LogoProps {
  size?: 'md' | 'lg';
  className?: string;
  to?: string;
  onClick?: () => void;
}

const IMG_SIZE_CLASSES: Record<NonNullable<LogoProps['size']>, string> = {
  md: 'h-8',
  lg: 'h-10',
};

export function Logo({ size = 'lg', className = '', to, onClick }: LogoProps) {
  const img = (
    <img
      src="/noraemat_logo.png"
      alt="♪노래맞히기"
      className={`w-auto ${IMG_SIZE_CLASSES[size]} ${className}`}
    />
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label="방 목록으로 이동">
        {img}
      </button>
    );
  }

  if (!to) {
    return img;
  }

  return (
    <Link to={to} aria-label="방 목록으로 이동">
      {img}
    </Link>
  );
}

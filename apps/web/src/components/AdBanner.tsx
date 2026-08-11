import { useEffect, useRef } from 'react';

const ADFIT_SCRIPT_SRC = '//t1.daumcdn.net/kas/static/ba.min.js';

interface AdBannerProps {
  /** 카카오 애드핏 광고 단위 ID(DAN-...). 비어있으면 아무것도 렌더링하지 않는다. */
  unitId: string | undefined;
  width: number;
  height: number;
}

/**
 * 카카오 애드핏 배너. 애드핏 스크립트는 로드 시점에 자기 부모 안의 `.kakao_ad_area`만
 * 초기화하므로, SPA 라우팅으로 이 컴포넌트가 다시 마운트될 때마다 스크립트 태그를
 * 매번 새로 삽입해야 광고가 다시 채워진다.
 */
export function AdBanner({ unitId, width, height }: AdBannerProps) {
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!unitId || !insRef.current) {
      return;
    }
    const script = document.createElement('script');
    script.src = ADFIT_SCRIPT_SRC;
    script.async = true;
    insRef.current.appendChild(script);
  }, [unitId]);

  if (!unitId) {
    return null;
  }

  return (
    <ins
      ref={insRef}
      className="kakao_ad_area"
      style={{ display: 'none' }}
      data-ad-unit={unitId}
      data-ad-width={width}
      data-ad-height={height}
    />
  );
}

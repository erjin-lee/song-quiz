import { useEffect, useRef } from 'react';

const ADSENSE_SCRIPT_SRC =
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID;

function loadAdsenseScript(clientId: string) {
  const existing = document.querySelector(
    `script[src^="${ADSENSE_SCRIPT_SRC}"]`,
  );
  if (existing) {
    return;
  }
  const script = document.createElement('script');
  script.src = `${ADSENSE_SCRIPT_SRC}?client=${clientId}`;
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

interface AdBannerProps {
  /** 구글 애드센스 광고 슬롯 ID. 비어있으면 아무것도 렌더링하지 않는다. */
  slotId: string | undefined;
}

/**
 * 구글 애드센스 반응형 배너. 애드센스 전역 스크립트는 문서 전체에서 한 번만 로드하고,
 * 광고 단위(ins)가 새로 마운트될 때마다 adsbygoogle.push({})를 호출해 채운다.
 */
export function AdBanner({ slotId }: AdBannerProps) {
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!slotId || !ADSENSE_CLIENT_ID || !insRef.current) {
      return;
    }
    loadAdsenseScript(ADSENSE_CLIENT_ID);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }, [slotId]);

  if (!slotId || !ADSENSE_CLIENT_ID) {
    return null;
  }

  return (
    <ins
      ref={insRef}
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client={ADSENSE_CLIENT_ID}
      data-ad-slot={slotId}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}

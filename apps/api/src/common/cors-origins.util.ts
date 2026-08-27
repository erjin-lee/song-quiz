/**
 * CORS 허용 origin 목록. `main.ts`의 `enableCors`와 `SameOriginGuard`(로그인
 * CSRF 방어)가 반드시 같은 목록을 봐야 하므로 하나로 뺐다.
 */
export function getCorsOrigins(): string[] {
  const corsOriginEnv = process.env.CORS_ORIGIN?.trim();
  return corsOriginEnv
    ? corsOriginEnv.split(',').map((origin) => origin.trim())
    : [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://noraemat.site',
      ];
}

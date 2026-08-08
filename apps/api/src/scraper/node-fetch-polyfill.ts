import { File } from 'node:buffer';

// Node 18의 전역 fetch(undici)는 File 전역이 없으면 cheerio 로드시 즉시 예외를 던진다.
// node:buffer의 File은 DOM lib의 File 타입과 구조가 달라 단언이 불가피하다.
if (typeof globalThis.File === 'undefined') {
  globalThis.File = File as unknown as typeof globalThis.File;
}

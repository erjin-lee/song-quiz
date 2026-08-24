const esbuild = require('esbuild');

// alarm-notifier와 달리 이 Lambda는 openai(런타임 미제공 npm 패키지)를 의존하므로
// tsc 산출물만으로는 배포 zip이 동작하지 않는다. esbuild로 openai와 그 의존성을
// 하나의 파일로 번들링한다. @aws-sdk/*는 Lambda Node.js 관리형 런타임이 이미
// 포함하고 있어(alarm-notifier/README.md와 동일한 근거) external로 제외해 번들
// 크기를 줄인다.
esbuild
  .build({
    entryPoints: ['src/handler.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist/handler.js',
    external: ['@aws-sdk/*'],
  })
  .catch(() => process.exit(1));

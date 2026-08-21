module.exports = {
  apps: [
    {
      name: 'song-quiz-api',
      cwd: __dirname,
      // cluster 모드(무중단 재시작)는 PM2가 Node cluster 모듈로 fork하는 방식이라
      // 반드시 node로 직접 실행해야 한다(yarn 래핑 불가). .env 로드는 기존 방식과
      // 동일하게 dotenv가 담당하되, 앱 코드 대신 node 프리로드(-r)로 주입한다.
      script: 'dist/main.js',
      node_args: ['-r', 'dotenv/config'],
      exec_mode: 'cluster',
      instances: 2,
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};

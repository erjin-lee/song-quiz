module.exports = {
  apps: [
    {
      name: 'song-quiz-game',
      cwd: __dirname,
      // apps/api/ecosystem.config.js와 동일한 무중단 재시작 방식(PM2 cluster).
      // room 상태가 이미 Redis 기반 멀티 인스턴스로 동작하도록 설계되어 있어
      // (ADR-0001 멀티 인스턴스 마이그레이션 참고) game도 동일하게 cluster로 띄운다.
      script: 'dist/main.js',
      node_args: ['-r', 'dotenv/config'],
      exec_mode: 'cluster',
      instances: 2,
      // apps/api의 ecosystem.config.js와 동일한 이유로, cluster 워커별로 로그
      // 파일이 나뉘지 않고 하나의 out/error 로그로 합쳐지도록 한다.
      merge_logs: true,
      wait_ready: true,
      listen_timeout: 10_000,
      kill_timeout: 5_000,
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};

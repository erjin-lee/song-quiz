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
      // cluster reload는 기본적으로 인스턴스를 한 번에 하나씩 순차 교체하지만,
      // wait_ready 없이는 새 워커가 "listening" 이벤트만 내면 바로 이전 워커를
      // 죽이기 시작한다. wait_ready + listen_timeout으로 새 워커가 실제로 요청을
      // 받을 준비(Redis 연결 등 main.ts 부트스트랩 포함)를 마칠 때까지 다음 교체를
      // 미루고, kill_timeout으로 내려가는 워커에게 진행 중이던 요청/소켓을 정리할
      // 시간을 준다(main.ts의 app.enableShutdownHooks와 짝을 이룸).
      wait_ready: true,
      listen_timeout: 10_000,
      kill_timeout: 5_000,
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};

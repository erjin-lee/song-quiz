module.exports = {
  apps: [
    {
      name: 'song-quiz-api',
      cwd: __dirname,
      script: 'yarn',
      args: 'start:prod:local',
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};

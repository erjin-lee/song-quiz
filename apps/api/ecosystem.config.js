module.exports = {
  apps: [
    {
      name: 'song-quiz-api',
      cwd: __dirname,
      script: 'dist/main.js',
      node_args: ['-r', 'dotenv/config'],
      exec_mode: 'cluster',
      instances: 2,
      merge_logs: true,
      wait_ready: true,
      listen_timeout: 8_000,
      kill_timeout: 5_000,
      error_file: "../../logs/api.log",
      out_file: "../../logs/api.log",
      env: { NODE_ENV: 'production', COMMIT_SHA: process.env.COMMIT_SHA },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};

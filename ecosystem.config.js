/** @type {import('pm2').Config} */
module.exports = {
  apps: [
    {
      name: 'neuradexai',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: 'C:/Users/bobel/projects/neuradexai',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 2000,
      watch: false,
      autorestart: true,
    },
    {
      name: 'jarvis-meeting-alert',
      script: 'scripts/jarvis-meeting-alert.ts',
      interpreter: 'ts-node',
      cron_restart: '*/10 * * * *',
      watch: false,
      autorestart: false,
    },
    {
      name: 'jarvis-local-bridge',
      script: 'scripts/local-bridge.mjs',
      cwd: 'C:/Users/bobel/projects/neuradexai',
      env: {
        LOCAL_BRIDGE_PORT: '3099',
        LOCAL_BRIDGE_SECRET: 'change-me-in-env',
      },
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
}

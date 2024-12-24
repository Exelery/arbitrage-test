module.exports = {
  apps: [{
    name: 'spread-bot',
    script: 'dist/index.js',
    watch: ['dist'],
    ignore_watch: ['node_modules', 'logs', '*.json'],
    watch_options: {
      followSymlinks: false
    },
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    exp_backoff_restart_delay: 100,
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000
  }]
}; 
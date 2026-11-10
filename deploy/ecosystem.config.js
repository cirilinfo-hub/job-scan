// PM2 process file, for the VPS route only.
module.exports = {
  apps: [{
    name: 'rolewise',
    script: 'backend/dist/server.js',
    node_args: '--env-file=backend/.env',
    instances: 1,
    max_memory_restart: '512M',
    time: true,
  }],
};

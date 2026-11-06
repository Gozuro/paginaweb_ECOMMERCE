// Entry point para Vercel Serverless Functions
const server = require('../server/server');

module.exports = (req, res) => {
  server.emit('request', req, res);
};

// src/utils/sms.js  —  Termii SMS (Nigerian gateway)
const https  = require('https');
const { logger } = require('./logger');

const sendSMS = async (to, message) => {
  if (process.env.NODE_ENV !== 'production') {
    logger.debug(`[SMS MOCK] To: ${to} | Msg: ${message}`);
    return { status: 'mocked' };
  }

  const payload = JSON.stringify({
    to,
    from:    process.env.TERMII_SENDER_ID || 'ADEY',
    sms:     message,
    type:    'plain',
    channel: 'generic',
    api_key: process.env.TERMII_API_KEY,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.ng.termii.com',
      path:     '/api/sms/send',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', (err) => {
      logger.error('SMS send error:', err);
      resolve({ error: err.message }); // non-blocking
    });
    req.write(payload);
    req.end();
  });
};

module.exports = { sendSMS };

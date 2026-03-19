// src/utils/email.js  —  Resend transactional email
const https  = require('https');
const { logger } = require('./logger');

const sendEmail = async ({ to, subject, html }) => {
  if (process.env.NODE_ENV !== 'production') {
    logger.debug(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
    return { status: 'mocked' };
  }

  const payload = JSON.stringify({
    from:    process.env.EMAIL_FROM || 'orders@adeyimports.com',
    to:      [to],
    subject,
    html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.RESEND_API_KEY}`,
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
      logger.error('Email send error:', err);
      resolve({ error: err.message });
    });
    req.write(payload);
    req.end();
  });
};

// Order confirmation email template
const orderConfirmationHTML = (order, user) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0;}
  .wrap{max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;}
  .header{background:#0A0D0F;padding:24px 32px;text-align:center;}
  .logo{color:#F0A500;font-size:2rem;font-weight:800;letter-spacing:-1px;}
  .body{padding:32px;}
  h2{color:#0A0D0F;margin-bottom:8px;}
  .ref{background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:16px 20px;margin:20px 0;}
  .ref-label{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;}
  .ref-val{font-size:1.4rem;font-weight:800;color:#F0A500;margin-top:4px;}
  table{width:100%;border-collapse:collapse;margin:16px 0;}
  th{text-align:left;font-size:12px;color:#888;text-transform:uppercase;border-bottom:1px solid #eee;padding:8px 0;}
  td{padding:10px 0;border-bottom:1px solid #f4f4f4;font-size:14px;}
  .total-row td{font-weight:800;font-size:16px;color:#0A0D0F;}
  .cta{display:block;background:#F0A500;color:#0A0D0F;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;font-weight:800;font-size:16px;margin:24px 0;}
  .footer{background:#f4f4f4;padding:20px 32px;font-size:12px;color:#999;text-align:center;}
</style></head>
<body>
<div class="wrap">
  <div class="header"><div class="logo">ADEY</div></div>
  <div class="body">
    <h2>Hi ${user.firstName}, your order is confirmed! 🎉</h2>
    <p style="color:#666;">Thank you for shopping with ADEY. We've received your order and payment.</p>
    <div class="ref">
      <div class="ref-label">Order Reference</div>
      <div class="ref-val">${order.reference}</div>
    </div>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>
        ${order.items.map(item => `
          <tr>
            <td>${item.product?.name || 'Product'}</td>
            <td>${item.quantity}</td>
            <td>₦${item.totalPrice.toLocaleString('en-NG')}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="2">Delivery</td><td>₦${order.deliveryFee.toLocaleString('en-NG')}</td></tr>
        <tr class="total-row"><td colspan="2">Total Paid</td><td>₦${order.total.toLocaleString('en-NG')}</td></tr>
      </tfoot>
    </table>
    <p style="color:#666;font-size:14px;">You'll receive an SMS update when your order is dispatched. Expected delivery: <strong>1–2 business days</strong> within Lagos.</p>
    <a href="${process.env.FRONTEND_URL}/orders/${order.reference}" class="cta">Track My Order →</a>
  </div>
  <div class="footer">ADEY Imports · Lagos, Nigeria · <a href="mailto:support@adeyimports.com" style="color:#F0A500;">support@adeyimports.com</a></div>
</div>
</body>
</html>`;

module.exports = { sendEmail, orderConfirmationHTML };

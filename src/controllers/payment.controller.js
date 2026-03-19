// src/controllers/payment.controller.js
// Full Paystack integration — initiate, verify, webhook

const https    = require('https');
const crypto   = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { sendSMS }      = require('../utils/sms');
const { sendEmail }    = require('../utils/email');
const { logger }       = require('../utils/logger');

const prisma = new PrismaClient();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// ── Helper: call Paystack API ──────────────────
const paystackRequest = (method, path, body) =>
  new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      port:     443,
      path,
      method,
      headers: {
        Authorization:  `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Paystack')); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

// ── Initiate payment ───────────────────────────
exports.initiatePayment = async (req, res) => {
  try {
    const { orderReference, isDeposit } = req.body;

    const order = await prisma.order.findUnique({
      where: { reference: orderReference },
      include: { user: true },
    });

    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.userId !== req.user.id) return res.status(403).json({ error: 'Not your order.' });
    if (order.paymentStatus === 'PAID') return res.status(400).json({ error: 'Order already paid.' });

    const amountKobo = Math.round(
      (isDeposit ? order.depositPaid : order.total) * 100
    );

    const payload = {
      email:     order.user.email,
      amount:    amountKobo,
      reference: `PAY-${order.reference}-${Date.now()}`,
      callback_url: `${process.env.FRONTEND_URL}/checkout/confirm`,
      metadata: {
        order_reference: order.reference,
        order_id:        order.id,
        user_id:         req.user.id,
        is_deposit:      isDeposit || false,
        custom_fields: [
          { display_name: 'Order Ref', variable_name: 'order_ref', value: order.reference },
        ],
      },
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    };

    const response = await paystackRequest('POST', '/transaction/initialize', payload);

    if (!response.status) {
      return res.status(502).json({ error: 'Payment initiation failed. Try again.' });
    }

    logger.info(`Payment initiated for order ${order.reference}`);
    res.json({
      authorizationUrl: response.data.authorization_url,
      reference:        response.data.reference,
      accessCode:       response.data.access_code,
    });

  } catch (err) {
    logger.error('initiatePayment error:', err);
    res.status(500).json({ error: 'Payment initiation failed.' });
  }
};

// ── Verify payment ─────────────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await paystackRequest('GET', `/transaction/verify/${reference}`);

    if (!response.status || response.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful.' });
    }

    const meta      = response.data.metadata;
    const orderId   = meta.order_id;
    const isDeposit = meta.is_deposit;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Idempotency — skip if already processed
    const existing = await prisma.payment.findUnique({ where: { paystackRef: reference } });
    if (existing) return res.json({ message: 'Already processed.', order });

    const amountPaid = response.data.amount / 100;

    await prisma.$transaction(async (tx) => {
      // Record payment
      await tx.payment.create({
        data: {
          orderId:     orderId,
          paystackRef: reference,
          amount:      amountPaid,
          channel:     response.data.channel,
          status:      'success',
          paidAt:      new Date(),
          metadata:    response.data,
        },
      });

      // Update order
      const newStatus = isDeposit ? 'DEPOSIT_PAID' : 'PAID';
      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: newStatus,
          paymentRef:    reference,
          paidAt:        new Date(),
          status:        'CONFIRMED',
          depositPaid:   isDeposit ? amountPaid : order.total,
          balanceDue:    isDeposit ? order.total - amountPaid : 0,
        },
      });

      // Decrement reserved stock → actual sold
      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            reservedQty: { decrement: item.quantity },
            stockQty:    { decrement: isDeposit ? 0 : item.quantity },
            soldCount:   { increment: item.quantity },
          },
        });
      }
    });

    // Notify customer
    const user = await prisma.user.findUnique({ where: { id: order.userId } });
    await sendSMS(user.phone,
      `✅ Payment confirmed! Order ${order.reference} for ₦${amountPaid.toLocaleString('en-NG')} received. We'll keep you updated. - ADEY`
    );

    res.json({ message: 'Payment verified.', reference });

  } catch (err) {
    logger.error('verifyPayment error:', err);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
};

// ── Paystack webhook ───────────────────────────
exports.webhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    if (hash !== signature) {
      logger.warn('Webhook: invalid signature');
      return res.status(400).json({ error: 'Invalid signature.' });
    }

    const event = JSON.parse(req.body.toString());
    logger.info(`Webhook received: ${event.event}`);

    if (event.event === 'charge.success') {
      const { reference, metadata } = event.data;

      // Re-use verify logic
      const existing = await prisma.payment.findUnique({ where: { paystackRef: reference } });
      if (!existing) {
        // Process if not already done via verify endpoint
        const orderId   = metadata?.order_id;
        const isDeposit = metadata?.is_deposit;
        const amountPaid = event.data.amount / 100;

        if (orderId) {
          await prisma.payment.create({
            data: {
              orderId,
              paystackRef: reference,
              amount:  amountPaid,
              channel: event.data.channel,
              status:  'success',
              paidAt:  new Date(),
              metadata: event.data,
            },
          });

          await prisma.order.update({
            where: { id: orderId },
            data:  {
              paymentStatus: isDeposit ? 'DEPOSIT_PAID' : 'PAID',
              paymentRef:    reference,
              paidAt:        new Date(),
              status:        'CONFIRMED',
            },
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error('webhook error:', err);
    res.sendStatus(500);
  }
};

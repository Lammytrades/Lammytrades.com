const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let premiumUsers = {}; // { phone: { expiresAt, trades } }
let pendingPayments = {};

// --- Daraja Config - WEKA ZAKO HAPA BAADAYE ---
const CONSUMER_KEY = 'YOUR_CONSUMER_KEY';
const CONSUMER_SECRET = 'YOUR_CONSUMER_SECRET';
const SHORTCODE = '174379'; // Sandbox shortcode
const PASSKEY = 'YOUR_PASSKEY';
const CALLBACK_URL = 'https://your-render-url.onrender.com/callback';

async function getToken() {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` }
  });
  return res.data.access_token;
}

app.post('/pay', async (req, res) => {
  const { phone, amount } = req.body;
  if (!phone || !phone.startsWith('254')) return res.json({ message: 'Namba si sahihi, tumia 254...' });
  // Kama bado hujajaza Daraja keys, tumia TEST MODE
  if (CONSUMER_KEY === 'YOUR_CONSUMER_KEY') {
    console.log('TEST MODE payment for', phone);
    // Simulate payment success after 10 sec for testing
    setTimeout(() => {
      premiumUsers[phone] = { expiresAt: Date.now() + 30*24*60*60*1000, trades: 0 };
      console.log('TEST Premium activated for', phone);
    }, 10000);
    return res.json({ message: 'TEST MODE: Premium ita-activate baada ya sekunde 10. (Weka Daraja keys kwa payment halisi)' });
  }
  try {
    const token = await getToken();
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0,14);
    const password = Buffer.from(SHORTCODE + PASSKEY + timestamp).toString('base64');
    const resp = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: CALLBACK_URL,
      AccountReference: 'Lammytrades Premium',
      TransactionDesc: 'Premium 30 Days'
    }, { headers: { Authorization: `Bearer ${token}` } });
    pendingPayments[phone] = Date.now();
    res.json({ message: 'STK imetumwa! Angalia simu yako, weka PIN.' });
  } catch (e) {
    console.log(e.response?.data || e.message);
    res.json({ message: 'M-Pesa error: ' + (e.response?.data?.errorMessage || 'Jaribu tena') });
  }
});

app.post('/callback', (req, res) => {
  try {
    const result = req.body.Body.stkCallback;
    if (result.ResultCode === 0) {
      const phone = result.CallbackMetadata.Item.find(i => i.Name === 'PhoneNumber')?.Value?.toString();
      if (phone) premiumUsers[phone] = { expiresAt: Date.now() + 30*24*60*60*1000, trades: 0 };
      console.log('Payment success for', phone);
    }
  } catch(e){ console.log(e.message); }
  res.json({ ResultCode: 0, ResultDesc: 'OK' });
});

app.get('/check-premium/:phone', (req, res) => {
  const u = premiumUsers[req.params.phone];
  if (u && u.expiresAt > Date.now()) return res.json({ premium: true, expiresAt: u.expiresAt, trades: u.trades });
  res.json({ premium: false });
});

app.post('/count-trade', (req, res) => {
  const { phone } = req.body;
  if (premiumUsers[phone]) premiumUsers[phone].trades++;
  res.json({ ok: true });
});

app.post('/request-refund', (req, res) => {
  const { phone, reason } = req.body;
  const u = premiumUsers[phone];
  if (!u) return res.json({ message: 'Huna Premium active. Haiwezi ku-refund.' });
  if (u.trades > 10) return res.json({ message: 'Umeshatrade zaidi ya 10. Refund haikubaliki (Policy: Max 10 trades).' });
  if (Date.now() - (u.expiresAt - 30*24*60*60*1000) > 7*24*60*60*1000) return res.json({ message: 'Siku 7 zimepita. Refund haikubaliki.' });
  // Hapa utaweka manual review - kwa sasa tunarecord tu
  console.log('REFUND REQUEST:', phone, reason);
  res.json({ message: 'Refund request imepokelewa! Tutakujibu WhatsApp ndani ya 24h. Tuma screenshot ya hii kwa 0712...' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Lammytrades running on port ' + PORT));

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const fetchRates = async (base, date) => {
  const key = `${base}-${date || 'latest'}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = date
    ? `https://api.frankfurter.app/${date}?from=${base}`
    : `https://api.frankfurter.app/latest?from=${base}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch rates: ${res.statusText}`);
  const data = await res.json();

  cache.set(key, { data, timestamp: Date.now() });
  return data;
};

const fetchCurrencies = async () => {
  const cached = cache.get('currencies');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const res = await fetch('https://api.frankfurter.app/currencies');
  const data = await res.json();
  cache.set('currencies', { data, timestamp: Date.now() });
  return data;
};

app.get('/', (_req, res) => {
  res.json({
    name: 'Currency Exchange API',
    version: '1.0.0',
    endpoints: {
      'GET /convert?from=USD&to=EUR&amount=100': 'Convert between currencies',
      'GET /rates?base=USD': 'Get all exchange rates for a base currency',
      'GET /currencies': 'List all supported currencies',
      'GET /historical?date=2024-01-15&base=USD': 'Historical rates for a date',
      'POST /convert/batch': 'Batch convert (body: { from, conversions: [{ to, amount }] })',
      'GET /health': 'Health check',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/currencies', async (_req, res) => {
  try {
    const currencies = await fetchCurrencies();
    res.json({ total: Object.keys(currencies).length, currencies });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch currencies', message: err.message });
  }
});

app.get('/rates', async (req, res) => {
  const { base = 'USD' } = req.query;
  try {
    const data = await fetchRates(base.toUpperCase());
    res.json({
      base: data.base,
      date: data.date,
      rates: data.rates,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rates', message: err.message });
  }
});

app.get('/convert', async (req, res) => {
  const { from = 'USD', to, amount = '1' } = req.query;
  if (!to) {
    return res.status(400).json({ error: 'Missing required query parameter: to' });
  }
  try {
    const data = await fetchRates(from.toUpperCase());
    const rate = data.rates[to.toUpperCase()];
    if (!rate) {
      return res.status(400).json({ error: `Currency "${to.toUpperCase()}" not found` });
    }
    const amountNum = parseFloat(amount) || 1;
    res.json({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      amount: amountNum,
      rate,
      result: Math.round(amountNum * rate * 100) / 100,
      date: data.date,
    });
  } catch (err) {
    res.status(500).json({ error: 'Conversion failed', message: err.message });
  }
});

app.get('/historical', async (req, res) => {
  const { date, base = 'USD' } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Missing required query parameter: date (YYYY-MM-DD)' });
  }
  try {
    const data = await fetchRates(base.toUpperCase(), date);
    res.json({
      base: data.base,
      date: data.date,
      rates: data.rates,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch historical rates', message: err.message });
  }
});

app.post('/convert/batch', async (req, res) => {
  const { from = 'USD', conversions } = req.body;
  if (!conversions || !Array.isArray(conversions)) {
    return res.status(400).json({ error: 'Request body must contain a "conversions" array' });
  }
  if (conversions.length > 25) {
    return res.status(400).json({ error: 'Maximum 25 conversions per batch request' });
  }
  try {
    const data = await fetchRates(from.toUpperCase());
    const results = conversions.map(({ to, amount = 1 }) => {
      const rate = data.rates[to?.toUpperCase()];
      if (!rate) return { to: to?.toUpperCase(), error: 'Currency not found' };
      return {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        amount,
        rate,
        result: Math.round(amount * rate * 100) / 100,
      };
    });
    res.json({ date: data.date, total: results.length, results });
  } catch (err) {
    res.status(500).json({ error: 'Batch conversion failed', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Currency Exchange API running on port ${PORT}`);
});

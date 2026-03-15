import express from 'express';

const app = express();
const PORT = process.env.PORT || 3006;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_BATCH_SIZE = 25;
const FETCH_TIMEOUT_MS = 10000;
const MAX_AMOUNT = 999999999;
const CURRENCY_REGEX = /^[A-Z]{3}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const cache = new Map();

app.use(express.json({ limit: '100kb' }));
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  });
  next();
});

const isValidCurrency = (code) => typeof code === 'string' && CURRENCY_REGEX.test(code.toUpperCase());
const isValidDate = (date) => typeof date === 'string' && DATE_REGEX.test(date);

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Currency-Exchange-API/1.0',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) { throw new Error('Rate service unavailable'); }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
};

const getCached = (key) => {
  const cached = cache.get(key);
  return (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) ? cached.data : null;
};

const setCache = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

const fetchRates = async (base, date) => {
  const key = `${base}-${date || 'latest'}`;
  const cached = getCached(key);
  if (cached) { return cached; }

  const url = date
    ? `https://api.frankfurter.app/${date}?from=${base}`
    : `https://api.frankfurter.app/latest?from=${base}`;

  const data = await fetchWithTimeout(url);
  setCache(key, data);
  return data;
};

const fetchCurrencies = async () => {
  const cached = getCached('currencies');
  if (cached) { return cached; }

  const data = await fetchWithTimeout('https://api.frankfurter.app/currencies');
  setCache('currencies', data);
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
  } catch {
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

app.get('/rates', async (req, res) => {
  const { base = 'USD' } = req.query;

  if (!isValidCurrency(base)) {
    return res.status(400).json({ error: 'Invalid currency code (must be 3 uppercase letters)' });
  }

  try {
    const data = await fetchRates(base.toUpperCase());
    res.json({ base: data.base, date: data.date, rates: data.rates });
  } catch {
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

app.get('/convert', async (req, res) => {
  const { from = 'USD', to, amount = '1' } = req.query;

  if (!to) {
    return res.status(400).json({ error: 'Missing required query parameter: to' });
  }

  if (!isValidCurrency(from) || !isValidCurrency(to)) {
    return res.status(400).json({ error: 'Invalid currency code (must be 3 uppercase letters)' });
  }

  const amountNum = parseFloat(amount);
  if (!Number.isFinite(amountNum) || amountNum < 0 || amountNum > MAX_AMOUNT) {
    return res.status(400).json({ error: `Amount must be a number between 0 and ${MAX_AMOUNT}` });
  }

  try {
    const data = await fetchRates(from.toUpperCase());
    const rate = data.rates[to.toUpperCase()];

    if (!rate) {
      return res.status(400).json({ error: `Currency "${to.toUpperCase()}" not found` });
    }

    res.json({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      amount: amountNum,
      rate,
      result: Math.round(amountNum * rate * 100) / 100,
      date: data.date,
    });
  } catch {
    res.status(500).json({ error: 'Conversion failed' });
  }
});

app.get('/historical', async (req, res) => {
  const { date, base = 'USD' } = req.query;

  if (!date || !isValidDate(date)) {
    return res.status(400).json({ error: 'Missing or invalid date parameter (use YYYY-MM-DD)' });
  }

  if (!isValidCurrency(base)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }

  try {
    const data = await fetchRates(base.toUpperCase(), date);
    res.json({ base: data.base, date: data.date, rates: data.rates });
  } catch {
    res.status(500).json({ error: 'Failed to fetch historical rates' });
  }
});

app.post('/convert/batch', async (req, res) => {
  const { from = 'USD', conversions } = req.body;

  if (!conversions || !Array.isArray(conversions)) {
    return res.status(400).json({ error: 'Request body must contain a "conversions" array' });
  }

  if (conversions.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ error: `Maximum ${MAX_BATCH_SIZE} conversions per batch request` });
  }

  if (!isValidCurrency(from)) {
    return res.status(400).json({ error: 'Invalid "from" currency code' });
  }

  try {
    const data = await fetchRates(from.toUpperCase());
    const results = conversions.map(({ to, amount = 1 }) => {
      if (!to || !isValidCurrency(to)) { return { to, error: 'Invalid currency code' }; }
      const rate = data.rates[to.toUpperCase()];
      if (!rate) { return { to: to.toUpperCase(), error: 'Currency not found' }; }
      return {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        amount,
        rate,
        result: Math.round(amount * rate * 100) / 100,
      };
    });
    res.json({ date: data.date, total: results.length, results });
  } catch {
    res.status(500).json({ error: 'Batch conversion failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Currency Exchange API running on port ${PORT}`);
});

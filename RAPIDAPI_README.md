**Spotlight:** Real-time and historical currency exchange rates for 30+ currencies. Convert, compare, and batch-process conversions with a single API call.

Convert between 30+ world currencies with real-time and historical exchange rates. Supports single conversions, full rate tables, and batch operations.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/convert` | Convert an amount between two currencies |
| GET | `/rates` | Get all exchange rates for a base currency |
| GET | `/currencies` | List all supported currencies |
| GET | `/historical` | Get historical rates for a specific date |
| POST | `/convert/batch` | Convert multiple currency pairs in one request (max 25) |

### Quick Start

```javascript
const response = await fetch('https://currency-exchange-pro.p.rapidapi.com/convert?from=USD&to=EUR&amount=100', {
  headers: {
    'x-rapidapi-key': 'YOUR_API_KEY',
    'x-rapidapi-host': 'currency-exchange-pro.p.rapidapi.com'
  }
});
const data = await response.json();
// { from: "USD", to: "EUR", amount: 100, rate: 0.92, result: 92.0, date: "2026-03-15" }
```

### Rate Limits

| Plan | Requests/month | Rate |
|------|---------------|------|
| Basic (Pay Per Use) | Unlimited | 10/min |
| Pro ($9.99/mo) | 5,000 | 50/min |
| Ultra ($29.99/mo) | 25,000 | 200/min |
| Mega ($99.99/mo) | 100,000 | 500/min |

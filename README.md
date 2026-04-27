# TradingDoge

Stock display web application with TradingView charts and moving averages.

## Quick Start

### Backend

```bash
cd backend
npm install
npm run dev
```

Server runs on http://localhost:3004

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173

## API

- `GET /api/stocks` - List stocks
- `GET /api/stock/:symbol?interval=1day` - Get stock data with MAs
- `GET /api/signals/:symbol?days=30` - Get B/S signals
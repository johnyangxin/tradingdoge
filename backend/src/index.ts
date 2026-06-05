import express from 'express';
import cors from 'cors';
import apiRouter from './api';
import { initDatabase } from './database';

// Create Express app
const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(cors());
app.use(express.json());

// Handle API routes
app.use('/api', apiRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const startServer = async () => {
  await initDatabase();
  return new Promise<void>((resolve) => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      resolve();
    });
  });
};

// Start if not being imported
startServer().catch(console.error);
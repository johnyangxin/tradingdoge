import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './api';
import { initDatabase } from './database';
import { startScheduler, manualFetch } from './scheduler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

// 中间件
app.use(cors());
app.use(express.json());

// API路由
app.use('/api', apiRouter);

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 初始化数据库
initDatabase();
console.log('Database initialized');

// 启动定时任务
startScheduler();

// 启动时自动抓取最新数据
manualFetch();

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
// 用户提醒通知模块
import { getUserById, saveUserAlert } from './database';
import { StopLossTakeProfit } from './signals';

const isProduction = process.env.NODE_ENV === 'production';

// 通知新评论
export async function notifyNewComment(_comment: any): Promise<void> {
  // 通知功能已禁用
}

// 通知全 B/全 S 信号
export async function notifyAllBSignal(_symbol: string, _signalType: 'B' | 'S', _price: number, _sltp?: StopLossTakeProfit): Promise<void> {
  // 通知功能已禁用
  if (_sltp) {
    console.log(`  -> SL: $${_sltp.stopLoss.toFixed(2)}, TP: $${_sltp.takeProfit.toFixed(2)} (ATR: $${_sltp.atr.toFixed(2)})`);
  }
}

// 通知用户提醒
export async function notifyUseralert(
  userId: number,
  symbol: string,
  signalType: 'B' | 'S',
  price: number,
  sltp?: StopLossTakeProfit
): Promise<void> {
  const user = await getUserById(userId);
  if (!user) return;

  const direction = signalType === 'B' ? '买入 (Bullish)' : '卖出 (Bearish)';

  if (isProduction) {
    // 生产环境发送真实邮件
    await sendEmail(user.email, symbol, signalType, price, sltp, direction);
  } else {
    // 本地开发仅记录日志
    if (sltp) {
      console.log(`[DEV] Email would be sent to ${user.email}: ${symbol} 全${signalType}信号，当前价格 $${price}, Entry: $${sltp.entry.toFixed(2)}, SL: $${sltp.stopLoss.toFixed(2)}, TP: $${sltp.takeProfit.toFixed(2)}`);
    } else {
      console.log(`[DEV] Email would be sent to ${user.email}: ${symbol} 全${signalType}信号，当前价格 $${price}`);
    }
  }

  // 保存提醒记录
  await saveUserAlert(
    userId,
    symbol,
    signalType,
    price,
    sltp?.entry,
    sltp?.stopLoss,
    sltp?.takeProfit,
    sltp?.atr
  );
}

// 发送邮件（生产环境）
async function sendEmail(
  email: string,
  symbol: string,
  signalType: 'B' | 'S',
  price: number,
  sltp: StopLossTakeProfit | undefined,
  direction: string
): Promise<void> {
  // TODO: 配置 SMTP 后实现真实的邮件发送
  if (sltp) {
    console.log(`[PROD] Sending email to ${email}: ${symbol} ${direction} at $${price}, Entry: $${sltp.entry.toFixed(2)}, SL: $${sltp.stopLoss.toFixed(2)}, TP: $${sltp.takeProfit.toFixed(2)}`);
  } else {
    console.log(`[PROD] Sending email to ${email}: ${symbol} ${direction} at $${price}`);
  }
}

export default { notifyNewComment, notifyAllBSignal, notifyUseralert };
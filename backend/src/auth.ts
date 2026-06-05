import { createUser, getUserByEmail, saveVerificationCode, verifyCode, type User } from './database';
import crypto from 'crypto';

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'tradingdoge-secret-key-change-in-production';
const VERIFICATION_EXPIRE_MINUTES = 10;

// Generate 6-digit verification code
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Simple hash function ( SHA256 )
function simpleHash(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate JWT token
function generateToken(user: User): string {
  const payload = { id: user.id, email: user.email };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(encoded)
    .digest('base64');

  return `${encoded}.${signature}`;
}

// Verify JWT token
export function verifyToken(token: string): { id: number; email: string } | null {
  try {
    const [encoded, signature] = token.split('.');

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(encoded)
      .digest('base64');

    if (signature !== expectedSignature) {
      return null;
    }

    return JSON.parse(Buffer.from(encoded, 'base64').toString());
  } catch {
    return null;
  }
}

// Send verification email using Resend
async function sendVerificationEmail(toEmail: string, code: string): Promise<void> {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');

  await resend.emails.send({
    from: 'service@tradingdoge.com',
    to: toEmail,
    subject: 'Your TradingDoge verification code',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2 style="color: #c9a227;">TradingDoge</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; padding: 20px; background: #f5f5f5; text-align: center; border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          This code will expire in ${VERIFICATION_EXPIRE_MINUTES} minutes.
        </p>
      </div>
    `
  });
}

// Handler: Send verification code
export async function sendVerificationCode(email: string): Promise<{ success: boolean; message: string }> {
  const code = generateCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + VERIFICATION_EXPIRE_MINUTES);

  try {
    await saveVerificationCode(email, code, expiresAt);

    // Attempt to send email - if fails, still save code for development
    try {
      await sendVerificationEmail(email, code);
    } catch (emailError) {
      console.log('Email send failed (likely missing RESEND_API_KEY):', emailError);
      // In development, return code so it can be tested
      if (!process.env.RESEND_API_KEY) {
        return { success: true, message: `Verification code: ${code}` };
      }
    }

    return { success: true, message: 'Verification code sent' };
  } catch (error) {
    return { success: false, message: 'Failed to send verification code' };
  }
}

// Handler: Register with verification code
export async function registerWithCode(
  email: string,
  code: string,
  password: string
): Promise<{ success: boolean; token?: string; message: string }> {
  // Test mode: if no RESEND_API_KEY, accept any 6-digit code for testing
  if (!process.env.RESEND_API_KEY) {
    // Check if email already exists
    const existing = await getUserByEmail(email);
    if (existing) {
      return { success: false, message: 'Email already registered' };
    }

    // Create user directly (test mode)
    const passwordHash = simpleHash(password);
    const user = await createUser(email, passwordHash);
    const token = generateToken(user);

    return { success: true, token, message: 'Registration successful (test mode)' };
  }

  // Verify the code
  const isValid = await verifyCode(email, code);
  if (!isValid) {
    return { success: false, message: 'Invalid or expired verification code' };
  }

  // Check if email already exists
  const existing = await getUserByEmail(email);
  if (existing) {
    return { success: false, message: 'Email already registered' };
  }

  // Create user
  const passwordHash = simpleHash(password);
  const user = await createUser(email, passwordHash);

  // Generate token
  const token = generateToken(user);

  return { success: true, token, message: 'Registration successful' };
}

// Handler: Login
export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; token?: string; message: string }> {
  const user = await getUserByEmail(email);

  if (!user) {
    return { success: false, message: 'Invalid email or password' };
  }

  const passwordHash = simpleHash(password);
  if (user.password_hash !== passwordHash) {
    return { success: false, message: 'Invalid email or password' };
  }

  const token = generateToken(user);

  return { success: true, token, message: 'Login successful' };
}
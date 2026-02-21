import { FirestoreService } from './firestore.service';
import { User, UserProfile, SignupRequest, AuthResponse } from '../models/user';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { GoogleSecretsService } from './google-secrets.service';

export class AuthService {
  private firestoreService: FirestoreService;
  private secretsService: GoogleSecretsService;
  private jwtSecret: string | null = null;
  private secretName: string;

  constructor(firestoreService: FirestoreService) {
    this.firestoreService = firestoreService;
    this.secretsService = new GoogleSecretsService();
    this.secretName = process.env.JWT_SECRET_NAME || 'firstline-jwt-secret';
  }

  /**
   * Get JWT Secret from Google Secret Manager or cache
   */
  private async getJwtSecret(): Promise<string> {
    if (this.jwtSecret) return this.jwtSecret;

    // In test/development, allow env-based secret
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      const envSecret = process.env.JWT_SECRET;
      if (envSecret) {
        this.jwtSecret = envSecret;
        return this.jwtSecret;
      }
    }

    try {
      console.log(`Fetching secret ${this.secretName} from Google Secret Manager...`);
      this.jwtSecret = await this.secretsService.getSecret(this.secretName);
      return this.jwtSecret;
    } catch (error) {
      console.error('CRITICAL: Failed to fetch JWT secret from Secret Manager:', error);
      // Fail fast — never fall back to a hardcoded secret in production
      throw new Error('JWT secret unavailable. Cannot proceed without secure authentication.');
    }
  }

  /**
   * Hash password using PBKDF2 with salt
   */
  private hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const s = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, s, 100000, 64, 'sha512').toString('hex');
    return { hash, salt: s };
  }

  /**
   * Generate JWT token
   */
  async generateToken(user: UserProfile): Promise<string> {
    const secret = await this.getJwtSecret();
    const payload = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
    };

    // Simple JWT implementation (in production, use jsonwebtoken library)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payloadStr}`)
      .digest('base64url');

    return `${header}.${payloadStr}.${signature}`;
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<UserProfile | null> {
    try {
      const secret = await this.getJwtSecret();
      const [header, payload, signature] = token.split('.');

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      // Decode payload
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());

      // Check expiration
      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name || '',
        role: decoded.role,
        organization: decoded.organization || '',
        createdAt: decoded.createdAt || new Date().toISOString(),
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Register new user
   */
  async signup(request: SignupRequest): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.getUserByEmail(request.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create user
    const userId = uuidv4();
    const { hash, salt } = this.hashPassword(request.password);
    const now = new Date().toISOString();

    const user: User = {
      userId,
      email: request.email.toLowerCase(),
      name: request.name,
      role: request.role,
      organization: request.organization,
      passwordHash: hash,
      salt: salt,
      createdAt: now,
      isActive: true,
    };

    // Store in Firestore
    await this.firestoreService.put({
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      Type: 'User',
      UserId: userId,
      Email: user.email,
      Name: user.name,
      Role: user.role,
      Organization: user.organization,
      PasswordHash: hash,
      Salt: salt,
      CreatedAt: now,
      IsActive: true,
      TTL: this.firestoreService.calculateTTL(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)), // 1 year
      // "GSI" field for email lookup
      GSI1PK: `EMAIL#${user.email}`,
      GSI1SK: 'USER',
    });

    // Generate token
    const userProfile: UserProfile = {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      organization: user.organization,
      createdAt: user.createdAt,
    };

    const token = await this.generateToken(userProfile);

    return {
      token,
      user: userProfile,
    };
  }

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    // Get user by email
    const user = await this.getUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const { hash: loginHash } = this.hashPassword(password, user.salt);
    if (loginHash !== user.passwordHash) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is disabled');
    }

    // Update last login
    await this.updateLastLogin(user.userId);

    // Generate token
    const userProfile: UserProfile = {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      organization: user.organization,
      createdAt: user.createdAt,
      lastLogin: new Date().toISOString(),
    };

    const token = await this.generateToken(userProfile);

    return {
      token,
      user: userProfile,
    };
  }

  /**
   * Get user by email
   */
  private async getUserByEmail(email: string): Promise<User | null> {
    try {
      // Query using the equivalent of GSI1 index
      const result = await this.firestoreService.queryGSI1(
        `EMAIL#${email.toLowerCase()}`,
        'USER'
      );

      if (!result || result.length === 0) {
        return null;
      }

      const item = result[0];
      return {
        userId: item.UserId,
        email: item.Email,
        name: item.Name,
        role: item.Role,
        organization: item.Organization,
        passwordHash: item.PasswordHash,
        salt: item.Salt,
        createdAt: item.CreatedAt,
        lastLogin: item.LastLogin,
        isActive: item.IsActive ?? true,
      };
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserProfile | null> {
    try {
      const result = await this.firestoreService.get(`USER#${userId}`, 'PROFILE');

      if (!result) {
        return null;
      }

      return {
        userId: result.UserId,
        email: result.Email,
        name: result.Name,
        role: result.Role,
        organization: result.Organization,
        createdAt: result.CreatedAt,
        lastLogin: result.LastLogin,
      };
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  /**
   * Update last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    await this.firestoreService.update(
      `USER#${userId}`,
      'PROFILE',
      {
        LastLogin: new Date().toISOString(),
      }
    );
  }

  /**
   * Initiate password reset
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.getUserByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      return;
    }

    // Generate reset token
    const resetToken = uuidv4();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Store reset token
    await this.firestoreService.put({
      PK: `RESET#${resetToken}`,
      SK: 'TOKEN',
      Type: 'PasswordReset',
      UserId: user.userId,
      Email: user.email,
      ExpiresAt: resetExpiry,
      TTL: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    });

    // TODO: Send email with reset link
    console.log(`Password reset token for ${email}: ${resetToken}`);
    console.log(`Reset link: https://app.firstline.health/reset-password?token=${resetToken}`);
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Get reset token
    const result = await this.firestoreService.get(`RESET#${token}`, 'TOKEN');

    if (!result) {
      throw new Error('Invalid or expired reset token');
    }

    // Check expiry
    if (new Date(result.ExpiresAt) < new Date()) {
      throw new Error('Reset token has expired');
    }

    // Update password
    const { hash: passwordHash, salt } = this.hashPassword(newPassword);
    await this.firestoreService.update(
      `USER#${result.UserId}`,
      'PROFILE',
      {
        PasswordHash: passwordHash,
        Salt: salt,
      }
    );

    // Delete reset token (using put with empty object to effectively delete)
    await this.firestoreService.put({
      PK: `RESET#${token}`,
      SK: 'TOKEN',
      TTL: Math.floor(Date.now() / 1000), // Expire immediately
    });
  }
}

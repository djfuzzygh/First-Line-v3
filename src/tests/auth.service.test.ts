import { AuthService } from '../services/auth.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('AuthService', () => {
  let authService: AuthService;
  let dynamoDBService: DynamoDBService;

  beforeEach(() => {
    dynamoMock.reset();
    dynamoDBService = new DynamoDBService({ tableName: 'TestTable' });
    authService = new AuthService(dynamoDBService);
  });

  describe('signup', () => {
    it('should create a new user', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] }); // No existing user
      dynamoMock.on(PutCommand).resolves({});

      const result = await authService.signup({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'healthcare_worker',
        organization: 'Test Hospital',
      });

      expect(result.token).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test User');
      expect(result.user.role).toBe('healthcare_worker');
    });

    it('should throw error if user already exists', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          UserId: 'existing-user',
          Email: 'test@example.com',
        }],
      });

      await expect(
        authService.signup({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
          role: 'healthcare_worker',
          organization: 'Test Hospital',
        })
      ).rejects.toThrow('already exists');
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const passwordHash = require('crypto')
        .createHash('sha256')
        .update('password123')
        .digest('hex');

      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          UserId: 'user-123',
          Email: 'test@example.com',
          Name: 'Test User',
          Role: 'healthcare_worker',
          Organization: 'Test Hospital',
          PasswordHash: passwordHash,
          IsActive: true,
          CreatedAt: new Date().toISOString(),
        }],
      });
      dynamoMock.on(UpdateCommand).resolves({});

      const result = await authService.login('test@example.com', 'password123');

      expect(result.token).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw error with invalid password', async () => {
      const passwordHash = require('crypto')
        .createHash('sha256')
        .update('correctpassword')
        .digest('hex');

      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          UserId: 'user-123',
          Email: 'test@example.com',
          PasswordHash: passwordHash,
          IsActive: true,
        }],
      });

      await expect(
        authService.login('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error if user not found', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await expect(
        authService.login('nonexistent@example.com', 'password123')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error if account is disabled', async () => {
      const passwordHash = require('crypto')
        .createHash('sha256')
        .update('password123')
        .digest('hex');

      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          UserId: 'user-123',
          Email: 'test@example.com',
          PasswordHash: passwordHash,
          IsActive: false,
        }],
      });

      await expect(
        authService.login('test@example.com', 'password123')
      ).rejects.toThrow('disabled');
    });
  });

  describe('token generation and verification', () => {
    it('should generate and verify valid token', () => {
      const user = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'healthcare_worker' as const,
        organization: 'Test Hospital',
        createdAt: new Date().toISOString(),
      };

      const token = authService.generateToken(user);
      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(3); // JWT format

      const verified = authService.verifyToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(user.userId);
      expect(verified?.email).toBe(user.email);
    });

    it('should reject invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const verified = authService.verifyToken(invalidToken);
      expect(verified).toBeNull();
    });

    it('should reject tampered token', () => {
      const user = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'healthcare_worker' as const,
        organization: 'Test Hospital',
        createdAt: new Date().toISOString(),
      };

      const token = authService.generateToken(user);
      const [header, payload] = token.split('.');
      const tamperedToken = `${header}.${payload}.tampered-signature`;

      const verified = authService.verifyToken(tamperedToken);
      expect(verified).toBeNull();
    });
  });

  describe('forgotPassword', () => {
    it('should create reset token for existing user', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [{
          UserId: 'user-123',
          Email: 'test@example.com',
        }],
      });
      dynamoMock.on(PutCommand).resolves({});

      await authService.forgotPassword('test@example.com');

      expect(dynamoMock.commandCalls(PutCommand).length).toBe(1);
    });

    it('should not throw error for non-existent user', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await expect(
        authService.forgotPassword('nonexistent@example.com')
      ).resolves.not.toThrow();
    });
  });
});

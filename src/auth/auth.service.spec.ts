import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let refreshTokensRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let jwtService: Partial<Record<keyof JwtService, jest.Mock>>;

  const configValues: Record<string, string> = {
    JWT_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  };

  const configService = {
    get: jest.fn((key: string, def?: string) => configValues[key] ?? def),
    getOrThrow: jest.fn((key: string) => {
      const value = configValues[key];
      if (!value) throw new Error(`Missing config: ${key}`);
      return value;
    }),
  } as unknown as ConfigService;

  const user = {
    id: 'user-1',
    email: 'jane@example.com',
    name: 'Jane Doe',
    passwordHash: '',
  };

  beforeEach(async () => {
    user.passwordHash = await bcrypt.hash('StrongP@ssw0rd', 10);

    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    refreshTokensRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest
        .fn()
        .mockImplementation((entity: object) =>
          Promise.resolve({ id: 'rt-1', ...entity }),
        ),
      create: jest.fn().mockImplementation((data: object) => data),
      update: jest.fn(),
      delete: jest.fn(),
    };

    let tokenCounter = 0;
    jwtService = {
      signAsync: jest.fn().mockImplementation(() => {
        tokenCounter += 1;
        return Promise.resolve(`signed-token-${tokenCounter}`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokensRepo,
        },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException when the email is already registered', async () => {
      usersService.findByEmail!.mockResolvedValue(user);

      await expect(
        service.register({ email: user.email, password: 'x', name: 'x' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a new user and returns a token pair', async () => {
      usersService.findByEmail!.mockResolvedValue(null);
      usersService.create!.mockResolvedValue(user);

      const result = await service.register({
        email: user.email,
        password: 'StrongP@ssw0rd',
        name: user.name,
      });

      expect(usersService.create).toHaveBeenCalled();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(user.email);
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      usersService.findByEmail!.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      usersService.findByEmail!.mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns a token pair on valid credentials', async () => {
      usersService.findByEmail!.mockResolvedValue(user);

      const result = await service.login({
        email: user.email,
        password: 'StrongP@ssw0rd',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when no stored refresh token matches', async () => {
      usersService.findById!.mockResolvedValue(user);
      refreshTokensRepo.findOne.mockResolvedValue(null);

      await expect(
        service.refresh(user.id, 'some-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rotates the refresh token and returns a new pair when it matches', async () => {
      usersService.findById!.mockResolvedValue(user);
      refreshTokensRepo.findOne.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        tokenHash: hashToken('valid-refresh-token'),
        expiresAt: new Date(Date.now() + 60_000),
        revoked: false,
      });

      const result = await service.refresh(user.id, 'valid-refresh-token');

      expect(result.accessToken).toBeDefined();
      expect(refreshTokensRepo.save).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the refresh token is expired', async () => {
      usersService.findById!.mockResolvedValue(user);
      refreshTokensRepo.findOne.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        tokenHash: hashToken('expired-refresh-token'),
        expiresAt: new Date(Date.now() - 60_000),
        revoked: false,
      });

      await expect(
        service.refresh(user.id, 'expired-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('looks up the refresh token by its own hash, not just any unrevoked token for the user', async () => {
      // Regression test: two tokens issued to the same user (e.g. before/after
      // rotation) must never be treated as interchangeable. The lookup must be
      // keyed on the exact token's hash so a stale/rotated token cannot be
      // replayed just because *some* unrevoked row exists for the user.
      usersService.findById!.mockResolvedValue(user);
      refreshTokensRepo.findOne.mockResolvedValue(null);

      await expect(service.refresh(user.id, 'stale-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(refreshTokensRepo.findOne).toHaveBeenCalledWith({
        where: {
          userId: user.id,
          revoked: false,
          tokenHash: hashToken('stale-token'),
        },
      });
    });
  });
});

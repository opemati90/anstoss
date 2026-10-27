import { HttpException, HttpStatus } from '@nestjs/common'
import { ZodError } from 'zod'
import { AppExceptionFilter } from './app-exception.filter'
import { LoggerService } from './logger.service'
import { requirePrivateMediaCapability } from '../media/private-media-capability'
import {
  ClerkTokenExpiredError,
  RateLimitExceededError,
  StripeWebhookSignatureError,
} from '@anstoss/shared'

// Mock Sentry so it's not required
jest.mock('@sentry/node', () => ({
  withScope: jest.fn(),
  captureException: jest.fn(),
}), { virtual: true })

describe('AppExceptionFilter', () => {
  let filter: AppExceptionFilter
  let mockLogger: jest.Mocked<LoggerService>
  let mockResponse: any
  let mockRequest: any
  let mockHost: any

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      child: jest.fn(),
    } as any

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    mockRequest = {
      requestId: 'req-123',
      user: { id: 'user-456' },
      method: 'POST',
      url: '/api/events',
    }
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    }

    filter = new AppExceptionFilter(mockLogger)
  })

  it('handles AppError with structured response', () => {
    const error = new ClerkTokenExpiredError('expired')
    filter.catch(error, mockHost as any)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'CLERK_TOKEN_EXPIRED',
        message: 'Session expired. Please log in again.',
      },
      requestId: 'req-123',
    })
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('preserves the private-media upgrade code through the HTTP error envelope', () => {
    let error: unknown
    try { requirePrivateMediaCapability(undefined) } catch (caught) { error = caught }
    filter.catch(error, mockHost)
    expect(mockResponse.status).toHaveBeenCalledWith(426)
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: { code: 'UPGRADE_REQUIRED', message: 'Update Anstoss to send private chat attachments.' },
      requestId: 'req-123',
    })
  })

  it('handles operational AppError without Sentry', () => {
    const error = new RateLimitExceededError('slow down')
    filter.catch(error, mockHost as any)

    expect(mockResponse.status).toHaveBeenCalledWith(429)
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
      }),
    )
  })

  it('handles non-operational AppError (security) with Sentry', () => {
    const error = new StripeWebhookSignatureError('bad sig')
    filter.catch(error, mockHost as any)

    expect(mockResponse.status).toHaveBeenCalledWith(400)
    // Non-operational → should attempt Sentry report
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('handles HttpException', () => {
    const error = new HttpException('Not Found', HttpStatus.NOT_FOUND)
    filter.catch(error, mockHost as any)

    expect(mockResponse.status).toHaveBeenCalledWith(404)
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'HTTP_404' }),
      }),
    )
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  // onboarding review fixes (M1/M9): stable codes + wait time pass through.
  it('passes a machine code and retryAfterSeconds from an object HttpException body', () => {
    const error = new HttpException(
      { message: 'Too many attempts', code: 'OTP_HOURLY_CAP', retryAfterSeconds: 1234.2 },
      HttpStatus.TOO_MANY_REQUESTS,
    )
    filter.catch(error, mockHost as any)
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: 'OTP_HOURLY_CAP', message: 'Too many attempts', retryAfterSeconds: 1235 },
      }),
    )
  })

  it('ignores a malformed custom code', () => {
    const error = new HttpException({ message: 'x', code: 'drop table;' }, HttpStatus.CONFLICT)
    filter.catch(error, mockHost as any)
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: 'HTTP_409', message: 'x' } }),
    )
  })

  it('handles unknown errors with 500', () => {
    filter.catch(new Error('kaboom'), mockHost as any)

    expect(mockResponse.status).toHaveBeenCalledWith(500)
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong. Please try again.',
        }),
      }),
    )
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('handles non-Error thrown values', () => {
    filter.catch('string error', mockHost as any)

    expect(mockResponse.status).toHaveBeenCalledWith(500)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('includes requestId in all responses', () => {
    filter.catch(new Error('test'), mockHost as any)
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-123' }),
    )
  })

  it('handles ZodError with 422 and field-level details', () => {
    const zodError = new ZodError([
      {
        code: 'too_small',
        minimum: 1,
        type: 'string',
        inclusive: true,
        exact: false,
        message: 'Title is required',
        path: ['title'],
      },
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        message: 'Expected string, received number',
        path: ['location', 'name'],
      },
    ])
    filter.catch(zodError, mockHost as any)

    expect(mockResponse.status).toHaveBeenCalledWith(422)
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        fields: [
          { path: 'title', message: 'Title is required' },
          { path: 'location.name', message: 'Expected string, received number' },
        ],
      },
      requestId: 'req-123',
    })
    expect(mockLogger.warn).toHaveBeenCalled()
  })
})

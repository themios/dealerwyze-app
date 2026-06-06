/**
 * Centralized API error handler for user-friendly responses with internal logging.
 * Returns simple English messages to clients while logging raw errors internally.
 */

import { NextResponse } from 'next/server'

export interface ErrorResponse {
  error: string
  code?: string
  status: number
}

interface ErrorContext {
  route: string
  action: string
  userId?: string
  orgId?: string
}

/**
 * Format API error with user-friendly message and internal logging.
 * Maps database errors, validation errors, and auth errors to simple English.
 */
export function formatApiError(
  error: unknown,
  context: ErrorContext,
  statusCode: number = 500
): ErrorResponse {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const code = (error as any)?.code || 'unknown'

  // Log raw error internally for debugging
  console.error(`[${context.route}] ${context.action} error:`, {
    code,
    message: errorMessage,
    userId: context.userId,
    orgId: context.orgId,
    stack: error instanceof Error ? error.stack : undefined,
  })

  // Map database errors to user-friendly messages
  if (code === '23505') {
    return {
      error: 'This item already exists. Please check your input and try again.',
      code: 'DUPLICATE_ENTRY',
      status: 409,
    }
  }

  if (code === '23503') {
    return {
      error: 'This item cannot be deleted because it is being used elsewhere.',
      code: 'FOREIGN_KEY_VIOLATION',
      status: 409,
    }
  }

  if (code === '23514') {
    return {
      error: 'The data you provided does not meet our requirements. Please review and try again.',
      code: 'CHECK_VIOLATION',
      status: 400,
    }
  }

  if (code === '42P01') {
    return {
      error: 'System error. Please try again or contact support.',
      code: 'TABLE_NOT_FOUND',
      status: 500,
    }
  }

  // Map validation errors
  if (errorMessage.includes('Invalid') || errorMessage.includes('validation')) {
    return {
      error: 'The information you provided is not valid. Please check and try again.',
      code: 'VALIDATION_ERROR',
      status: 400,
    }
  }

  // Map auth errors
  if (errorMessage.includes('Unauthorized') || errorMessage.includes('permission')) {
    return {
      error: 'You do not have permission to perform this action.',
      code: 'PERMISSION_DENIED',
      status: 403,
    }
  }

  if (errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
    return {
      error: 'The item you are looking for does not exist.',
      code: 'NOT_FOUND',
      status: 404,
    }
  }

  // Timeout errors
  if (errorMessage.includes('timeout')) {
    return {
      error: 'The request took too long. Please try again.',
      code: 'TIMEOUT',
      status: 504,
    }
  }

  // Default server error
  return {
    error: 'Something went wrong. Please try again or contact support if the problem persists.',
    code: 'SERVER_ERROR',
    status: statusCode,
  }
}

/**
 * Create a NextResponse with formatted error.
 */
export function apiError(
  error: unknown,
  context: ErrorContext,
  statusCode: number = 500
): NextResponse {
  const formatted = formatApiError(error, context, statusCode)
  return NextResponse.json(
    { error: formatted.error, ...(formatted.code && { code: formatted.code }) },
    { status: formatted.status }
  )
}

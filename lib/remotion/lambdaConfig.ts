import type { AwsRegion } from '@remotion/lambda-client'

/** AWS region for Remotion Lambda (`REMOTION_LAMBDA_AWS_REGION` or `AWS_REGION`). */
export function getRemotionAwsRegion(): AwsRegion {
  return (process.env.REMOTION_LAMBDA_AWS_REGION ??
    process.env.AWS_REGION ??
    'us-east-1') as AwsRegion
}

export function getRemotionLambdaFunctionName(): string | undefined {
  return process.env.REMOTION_LAMBDA_FUNCTION_NAME
}

export function getRemotionServeUrl(): string | undefined {
  return process.env.REMOTION_SERVE_URL
}

export function getRemotionAppBaseUrl(): string {
  return (
    process.env.REALTYWYZE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ''
  ).replace(/\/$/, '')
}

/** Webhook target for `renderMediaOnLambda` completion callbacks. */
export function getRemotionWebhookConfig():
  | { url: string; secret: string }
  | undefined {
  const base = getRemotionAppBaseUrl()
  const secret = process.env.RENDER_WEBHOOK_SECRET ?? ''
  if (!base || !secret) return undefined
  return {
    url: `${base}/api/webhooks/remotion`,
    secret,
  }
}

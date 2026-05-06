import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { withRetry, isNetworkError } from '@/lib/retry'

interface InvokeOptions<T> {
  body?: T
  retries?: number
}

/**
 * Type-safe wrapper around supabase.functions.invoke.
 * All Edge Function calls should go through this.
 */
export async function invokeFunction<TBody, TResponse>(
  name: string,
  options: InvokeOptions<TBody> = {}
): Promise<TResponse> {
  const { body, retries = 2 } = options

  return withRetry(
    async () => {
      const invokeOpts = body !== undefined ? { body: body as Record<string, unknown> } : {}
      const response = await supabase.functions.invoke<TResponse>(name, invokeOpts)
      if (response.error) {
        const msg: string =
          (response.error as { message?: string }).message ?? 'Unknown function error'
        logger.error(`Edge Function error: ${name}`, { message: msg })
        throw new Error(msg)
      }
      if (response.data === null) {
        throw new Error(`Edge Function ${name} returned null`)
      }
      return response.data
    },
    {
      maxAttempts: retries + 1,
      shouldRetry: isNetworkError,
    }
  )
}

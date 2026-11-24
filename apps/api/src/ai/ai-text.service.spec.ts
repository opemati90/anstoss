import { AiTextService, AI_MODEL, AI_MAX_OUTPUT_TOKENS } from './ai-text.service'
import { AiUnavailableException, aiMonthlyLimitMicros } from './ai-budget.service'

describe('AI provider safety boundary', () => {
  const original = { ...process.env }
  const originalFetch = global.fetch
  let reserve: jest.Mock
  let service: AiTextService
  const completed = (text = 'Hallo') =>
    new Response(
      JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
      }),
    )

  beforeEach(() => {
    process.env.ANSTOSS_AI_ENABLED = 'true'
    process.env.OPENAI_API_KEY = 'test-not-a-real-key'
    delete process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD
    reserve = jest.fn().mockResolvedValue(undefined)
    service = new AiTextService({ reserve } as never)
    global.fetch = jest.fn().mockImplementation(async () => completed())
  })
  afterEach(() => {
    process.env = { ...original }
    global.fetch = originalFetch
  })

  it('reserves before dispatch, pins standard pricing, disables retention/tools/retries', async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async () => {
      expect(reserve).toHaveBeenCalledWith('TRANSLATION')
      return completed()
    })
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).resolves.toBe('Hallo')
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(options.redirect).toBe('error')
    expect(JSON.parse(options.body)).toEqual({
      model: AI_MODEL,
      instructions: 'Translate',
      input: 'Hello',
      max_output_tokens: AI_MAX_OUTPUT_TOKENS,
      service_tier: 'default',
      store: false,
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, 'false', 'TRUE'])('makes no request when disabled (%s)', async (value) => {
    if (value === undefined) delete process.env.ANSTOSS_AI_ENABLED
    else process.env.ANSTOSS_AI_ENABLED = value
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).rejects.toBeInstanceOf(
      AiUnavailableException,
    )
    expect(reserve).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it('fails closed without the secret', async () => {
    delete process.env.OPENAI_API_KEY
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).rejects.toThrow()
    expect(reserve).not.toHaveBeenCalled()
  })
  it('counts UTF-8 bytes, not JS character length, before reserving', async () => {
    await expect(service.generate('TRANSLATION', 'Translate', '😀'.repeat(2100))).rejects.toThrow()
    expect(reserve).not.toHaveBeenCalled()
  })
  it('fails closed before network when reservation fails', async () => {
    reserve.mockRejectedValue(new AiUnavailableException())
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).rejects.toThrow()
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it('rechecks consent AFTER a waiting budget reservation and retains it when denied', async () => {
    let permitted = true
    reserve.mockImplementation(async () => {
      permitted = false
    })
    const guard = jest.fn(async () => permitted)
    await expect(
      service.generate('TRANSLATION', 'Translate', 'Hello', undefined, guard),
    ).rejects.toThrow()
    expect(guard).toHaveBeenCalledTimes(1)
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it('rechecks the kill switch after reservation', async () => {
    reserve.mockImplementation(async () => {
      process.env.ANSTOSS_AI_ENABLED = 'false'
    })
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).rejects.toThrow()
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it.each([401, 429, 500])('retains one reservation and never retries HTTP %s', async (status) => {
    ;(global.fetch as jest.Mock).mockResolvedValue(
      new Response('private provider error', { status }),
    )
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).rejects.toThrow(
      'temporarily unavailable',
    )
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it('does not retry timeouts or expose provider exceptions', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('private chat content and secret'))
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).rejects.toThrow(
      'temporarily unavailable',
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(reserve).toHaveBeenCalledTimes(1)
  })
  it.each([
    { status: 'incomplete', output: [] },
    {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }],
    },
    { status: 'completed', output: [] },
  ])('does not deliver partial, refused or empty output', async (body) => {
    ;(global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify(body)))
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).rejects.toThrow()
  })
  it('bounds provider response size', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(completed('x'.repeat(65_000)))
    await expect(service.generate('TRANSLATION', 'Translate', 'Hello')).rejects.toThrow()
  })
  it('accounts for schema/instructions in request bound', async () => {
    await expect(
      service.generate('TRANSLATION', 'x'.repeat(7990), 'x', {
        name: 'test',
        schema: { type: 'object' },
      }),
    ).rejects.toThrow()
    expect(reserve).not.toHaveBeenCalled()
  })
  it.each(['31', '30.01', '0', '-1', 'NaN', 'Infinity', '0.001', '30usd'])(
    'rejects unsafe budget %s',
    (value) => {
      process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD = value
      expect(aiMonthlyLimitMicros).toThrow()
    },
  )
  it('defaults to approved $30 and permits a lower limit', () => {
    expect(aiMonthlyLimitMicros()).toBe(30_000_000)
    process.env.ANSTOSS_AI_MONTHLY_LIMIT_USD = '0.01'
    expect(aiMonthlyLimitMicros()).toBe(10_000)
  })
})

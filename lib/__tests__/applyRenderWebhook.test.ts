import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()
const mockDeliverShowing = vi.fn().mockResolvedValue(undefined)
const mockRunOrgSocialPublish = vi.fn().mockResolvedValue({ results: [] })
const mockAutoPostContent = vi.fn().mockResolvedValue([])

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('@/lib/showings/confirmationVideo', () => ({
  deliverShowingTourVideoEmail: (...args: unknown[]) => mockDeliverShowing(...args),
}))

vi.mock('@/lib/social/runOrgSocialPublish', () => ({
  runOrgSocialPublish: (...args: unknown[]) => mockRunOrgSocialPublish(...args),
  captionForListing: () => 'caption',
}))

vi.mock('@/lib/content/autoPostContent', () => ({
  autoPostContentRender: (...args: unknown[]) => mockAutoPostContent(...args),
}))

import { applyRemotionRenderWebhook } from '@/lib/social/applyRenderWebhook'

function chain(resolved: unknown) {
  const chainObj = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
  }
  return chainObj
}

describe('applyRemotionRenderWebhook idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns duplicateWebhook when video render already complete with same URL', async () => {
    const updateChain = { eq: vi.fn().mockReturnThis() }; const updateChainFinal = { ...updateChain, eq: vi.fn().mockResolvedValue({ error: null }) }; updateChain.eq = vi.fn((field, val) => updateChainFinal)
    const videoChain = chain({
      data: {
        id: 'vr-1',
        org_id: 'org-1',
        vehicle_id: 'veh-1',
        auto_post: false,
        auto_post_platforms: [],
        status: 'complete',
        output_url: 'https://cdn.example.com/v.mp4',
        showing_request_id: null,
      },
    })
    videoChain.update = vi.fn().mockReturnValue(updateChain)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'video_renders') return videoChain
      return chain({ data: null })
    })

    const result = await applyRemotionRenderWebhook({
      type: 'success',
      renderId: 'lambda-abc',
      outputUrl: 'https://cdn.example.com/v.mp4',
    })

    expect(result).toEqual({ matched: true, duplicateWebhook: true })
    expect(videoChain.update).not.toHaveBeenCalled()
    expect(mockDeliverShowing).not.toHaveBeenCalled()
  })

  it('updates content render and skips duplicate content webhook', async () => {
    const videoChain = chain({ data: null })
    const contentSelect = chain({
      data: {
        id: 'cr-1',
        org_id: 'org-1',
        auto_post: false,
        auto_post_platforms: [],
        status: 'complete',
        output_url: 'https://cdn.example.com/reel.mp4',
      },
    })
    const contentUpdate = { eq: vi.fn().mockResolvedValue({ error: null }) }
    contentSelect.update = vi.fn().mockReturnValue(contentUpdate)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'video_renders') return videoChain
      if (table === 'content_renders') return contentSelect
      if (table === 'content_drafts') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return chain({ data: null })
    })

    const result = await applyRemotionRenderWebhook({
      type: 'success',
      renderId: 'lambda-reel',
      outputUrl: 'https://cdn.example.com/reel.mp4',
    })

    expect(result).toEqual({ matched: true, duplicateWebhook: true })
    expect(contentSelect.update).not.toHaveBeenCalled()
  })

  it('emails buyer when showing-linked video render completes', async () => {
    const updateChain = { eq: vi.fn().mockReturnThis() }; const updateChainFinal = { ...updateChain, eq: vi.fn().mockResolvedValue({ error: null }) }; updateChain.eq = vi.fn((field, val) => updateChainFinal)
    const videoChain = chain({
      data: {
        id: 'vr-2',
        org_id: 'org-1',
        vehicle_id: 'veh-1',
        auto_post: false,
        auto_post_platforms: [],
        status: 'rendering',
        output_url: null,
        showing_request_id: 'showing-1',
      },
    })
    videoChain.update = vi.fn().mockReturnValue(updateChain)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'video_renders') return videoChain
      return chain({ data: null })
    })

    const result = await applyRemotionRenderWebhook({
      type: 'success',
      renderId: 'lambda-show',
      outputUrl: 'https://cdn.example.com/tour.mp4',
    })

    expect(result.matched).toBe(true)
    expect(mockDeliverShowing).toHaveBeenCalledWith(
      'showing-1',
      'https://cdn.example.com/tour.mp4',
    )
  })
})

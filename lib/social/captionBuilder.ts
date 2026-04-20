import { VehicleVideoProps } from '@/lib/remotion/types'

const DEFAULT_TEMPLATE = `Just listed! {year} {make} {model} {trim} - {price}. {mileage}.
{dealer_city}, {dealer_state}
{dealer_phone}
{dealer_website}
#usedcars #{make} #{model} #dealerwyze #carsofinstagram`

const TIKTOK_TEMPLATE = `{year} {make} {model} just hit the lot! {price} | {mileage}
{dealer_name} - {dealer_city}, {dealer_state}
Call/text {dealer_phone}
#fyp #carbuy #usedcars #{make} #{model} #dealerwyze`

const YOUTUBE_TEMPLATE = `{year} {make} {model} {trim} - {price}

{mileage} on this clean {color} {year} {make} {model}{trim}.

Dealer: {dealer_name}
Location: {dealer_city}, {dealer_state}
Phone: {dealer_phone}
Website: {dealer_website}

Stop by or give us a call today. We make it easy to buy and drive.

#usedcars #{make} #{model} #dealerwyze`

function replacePlaceholders(template: string, props: VehicleVideoProps): string {
  return template
    .replace(/\{year\}/g,          String(props.year))
    .replace(/\{make\}/g,          props.make)
    .replace(/\{model\}/g,         props.model)
    .replace(/\{trim\}/g,          props.trim ?? '')
    .replace(/\{price\}/g,         props.price  ? `$${props.price.toLocaleString()}`            : 'Call for price')
    .replace(/\{mileage\}/g,       props.mileage ? `${props.mileage.toLocaleString()} miles`    : '')
    .replace(/\{color\}/g,         props.color  ?? '')
    .replace(/\{dealer_name\}/g,   props.dealerName)
    .replace(/\{dealer_phone\}/g,  props.dealerPhone)
    .replace(/\{dealer_city\}/g,   props.dealerCity)
    .replace(/\{dealer_state\}/g,  props.dealerState)
    .replace(/\{dealer_website\}/g, props.dealerWebsite ?? '')
    // Remove empty lines with only whitespace from removed placeholders
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim()
}

function trimToLength(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}

/**
 * Build a platform-appropriate caption for the video post.
 * Uses org caption_template if provided; falls back to platform defaults.
 * No em-dashes anywhere.
 */
export function buildCaption(
  props: VehicleVideoProps,
  platform: string,
  orgCaptionTemplate?: string | null,
): string {
  let template: string

  if (orgCaptionTemplate) {
    template = orgCaptionTemplate
  } else {
    switch (platform) {
      case 'tiktok':   template = TIKTOK_TEMPLATE; break
      case 'youtube':  template = YOUTUBE_TEMPLATE; break
      default:         template = DEFAULT_TEMPLATE; break
    }
  }

  const caption = replacePlaceholders(template, props)

  // Platform character limits
  switch (platform) {
    case 'instagram': return trimToLength(caption, 2200)
    case 'tiktok':    return trimToLength(caption, 2200)
    case 'youtube':   return trimToLength(caption, 5000)
    case 'facebook':  return trimToLength(caption, 63206)
    default:          return caption
  }
}

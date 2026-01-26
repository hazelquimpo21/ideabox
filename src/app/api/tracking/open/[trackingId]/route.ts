/**
 * Email Open Tracking Endpoint
 *
 * Serves a transparent 1x1 pixel image that records when an email is opened.
 * This endpoint is embedded in outbound emails via the tracking pixel injection.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * HOW IT WORKS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. GmailSendService injects a tracking pixel URL into HTML emails
 * 2. When recipient opens email, email client loads the image
 * 3. This endpoint receives the request with the tracking ID
 * 4. We record the open event in the database
 * 5. Return a transparent 1x1 GIF image
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRIVACY CONSIDERATIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * We capture minimal data:
 * - Timestamp of open
 * - IP address (for geo approximation, not stored permanently)
 * - User agent (for device/client detection)
 *
 * We do NOT store:
 * - Personally identifiable information
 * - Precise location data
 * - Browser fingerprints beyond user agent
 *
 * @module app/api/tracking/open/[trackingId]/route
 * @see docs/GMAIL_SENDING_IMPLEMENTATION.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transparent 1x1 GIF image (43 bytes).
 * This is the smallest valid GIF that's completely transparent.
 */
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * Response headers for the tracking pixel.
 */
const PIXEL_HEADERS = {
  'Content-Type': 'image/gif',
  'Content-Length': String(TRACKING_PIXEL.length),
  // Prevent caching so each open is tracked
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  // Security headers
  'X-Content-Type-Options': 'nosniff',
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('EmailTracking');

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a Supabase client with service role for tracking operations.
 * Service role is needed because tracking requests are unauthenticated
 * (they come from email clients, not logged-in users).
 */
function createTrackingClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts the client IP address from the request.
 * Handles various proxy headers (Vercel, Cloudflare, nginx).
 *
 * @param request - The incoming request
 * @returns IP address string or null
 */
function getClientIp(request: NextRequest): string | null {
  // Check Vercel's forwarded header first
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, first is the client
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  // Check Vercel's real IP header
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  // Check Cloudflare's header
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  return null;
}

/**
 * Parses device type from user agent string.
 *
 * @param userAgent - Browser user agent string
 * @returns Device type: 'mobile', 'tablet', or 'desktop'
 */
function parseDeviceType(userAgent: string | null): string | null {
  if (!userAgent) return null;

  const ua = userAgent.toLowerCase();

  if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) {
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    return 'mobile';
  }

  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'tablet';
  }

  return 'desktop';
}

/**
 * Attempts to identify the email client from user agent.
 *
 * @param userAgent - Browser user agent string
 * @returns Email client name or null
 */
function parseEmailClient(userAgent: string | null): string | null {
  if (!userAgent) return null;

  const ua = userAgent.toLowerCase();

  // Gmail proxy
  if (ua.includes('googleimageproxy')) {
    return 'gmail';
  }

  // Outlook
  if (ua.includes('microsoft outlook') || ua.includes('ms office')) {
    return 'outlook';
  }

  // Apple Mail
  if (ua.includes('apple mail') || (ua.includes('mac') && ua.includes('webkit'))) {
    return 'apple_mail';
  }

  // Yahoo
  if (ua.includes('yahoo')) {
    return 'yahoo';
  }

  // Thunderbird
  if (ua.includes('thunderbird')) {
    return 'thunderbird';
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/tracking/open/[trackingId]
 *
 * Records an email open event and returns a transparent 1x1 pixel.
 *
 * The tracking ID is a UUID that uniquely identifies an outbound email.
 * When the email client loads this image, we record the open.
 *
 * @param request - The incoming request
 * @param params - Route parameters containing trackingId
 * @returns 1x1 transparent GIF image
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  // Always return the pixel, even if tracking fails
  // This ensures the email renders correctly regardless of tracking status
  const pixelResponse = () => new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: PIXEL_HEADERS,
  });

  try {
    const { trackingId } = await params;

    // Validate tracking ID format (should be a UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trackingId)) {
      logger.warn('Invalid tracking ID format', {
        trackingId: trackingId.substring(0, 8),
      });
      return pixelResponse();
    }

    // Extract request metadata
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent');
    const deviceType = parseDeviceType(userAgent);
    const emailClient = parseEmailClient(userAgent);

    logger.debug('Processing email open', {
      trackingId: trackingId.substring(0, 8),
      hasIp: !!ipAddress,
      hasUserAgent: !!userAgent,
      deviceType,
      emailClient,
    });

    // Record the open event in the database
    const supabase = createTrackingClient();

    // Use the database function to record the open
    // This function handles:
    // - Finding the email by tracking ID
    // - Creating the open event record
    // - Updating open count and timestamps on outbound_emails
    // - Deduplication via fingerprint
    const { data, error } = await supabase.rpc('record_email_open', {
      p_tracking_id: trackingId,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_country: null, // Could be enriched with IP geolocation service
      p_city: null,
      p_device_type: deviceType,
      p_email_client: emailClient,
    });

    if (error) {
      logger.warn('Failed to record email open', {
        trackingId: trackingId.substring(0, 8),
        error: error.message,
      });
    } else {
      const isNewOpen = data === true;
      logger.info('Email open recorded', {
        trackingId: trackingId.substring(0, 8),
        isNewOpen,
        deviceType,
        emailClient,
      });
    }
  } catch (error) {
    // Log error but still return pixel
    logger.error('Error processing email open', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  return pixelResponse();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEAD HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * HEAD /api/tracking/open/[trackingId]
 *
 * Some email clients send HEAD requests before GET.
 * We respond with appropriate headers but don't record the open.
 */
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: PIXEL_HEADERS,
  });
}

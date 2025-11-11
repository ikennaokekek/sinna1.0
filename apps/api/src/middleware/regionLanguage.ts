/**
 * Region-Based Localization Middleware
 * 
 * Detects user region from IP address and sets language preference
 * Priority: User override > Browser locale > Geo-IP > Default (en-US)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from '../types';

export interface LanguageInfo {
  resolved_language: string;
  source: 'user_override' | 'browser_locale' | 'geo_ip' | 'fallback';
  fallback_used: boolean;
  region?: string;
  country_code?: string;
}

// Language map: country code -> language code
const REGION_LANGUAGE_MAP: Record<string, string> = {
  // Middle East & North Africa
  'SA': 'ar-SA', // Saudi Arabia
  'AE': 'ar-AE', // UAE
  'EG': 'ar-EG', // Egypt
  'IQ': 'ar-SA', // Iraq
  'JO': 'ar-SA', // Jordan
  'LB': 'ar-SA', // Lebanon
  'MA': 'fr-FR', // Morocco (French)
  'DZ': 'fr-FR', // Algeria (French)
  'TN': 'ar-SA', // Tunisia
  
  // South Asia
  'IN': 'hi-IN', // India
  'PK': 'ur-PK', // Pakistan (Urdu)
  'BD': 'bn-BD', // Bangladesh (Bengali)
  'LK': 'si-LK', // Sri Lanka (Sinhala)
  
  // East Asia
  'CN': 'zh-CN', // China
  'JP': 'ja-JP', // Japan
  'KR': 'ko-KR', // Korea
  'TW': 'zh-TW', // Taiwan
  'HK': 'zh-CN', // Hong Kong
  
  // Southeast Asia
  'ID': 'id-ID', // Indonesia
  'TH': 'th-TH', // Thailand
  'MY': 'ms-MY', // Malaysia
  'SG': 'en-US', // Singapore (English)
  'PH': 'en-US', // Philippines (English)
  'VN': 'vi-VN', // Vietnam
  
  // Europe
  'IE': 'en-IE', // Ireland
  'GB': 'en-GB', // United Kingdom
  'FR': 'fr-FR', // France
  'DE': 'de-DE', // Germany
  'IT': 'it-IT', // Italy
  'ES': 'es-ES', // Spain
  'PT': 'pt-PT', // Portugal
  'NL': 'nl-NL', // Netherlands
  'SE': 'sv-SE', // Sweden
  'NO': 'no-NO', // Norway
  'DK': 'da-DK', // Denmark
  'FI': 'fi-FI', // Finland
  'PL': 'pl-PL', // Poland
  'GR': 'el-GR', // Greece
  'RU': 'ru-RU', // Russia
  'TR': 'tr-TR', // Turkey
  
  // Americas
  'US': 'en-US', // United States
  'CA': 'en-US', // Canada (English)
  'MX': 'es-MX', // Mexico
  'BR': 'pt-BR', // Brazil
  'AR': 'es-ES', // Argentina
  
  // Africa
  'NG': 'en-US', // Nigeria (English)
  'ZA': 'en-US', // South Africa (English)
  'KE': 'sw-KE', // Kenya (Swahili)
  'GH': 'en-US', // Ghana (English)
  'ET': 'am-ET', // Ethiopia (Amharic)
  
  // Oceania
  'AU': 'en-US', // Australia
  'NZ': 'en-US', // New Zealand
};

/**
 * Get client IP address from request
 */
function getClientIP(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = String(forwarded).split(',');
    return ips[0]?.trim() || req.ip;
  }
  
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return String(realIP);
  }
  
  return req.ip || '127.0.0.1';
}

/**
 * Get geo-location from IP address using ipapi.co
 */
async function getGeoLocation(ip: string): Promise<{ country_code?: string; region?: string }> {
  if (ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return { country_code: 'US', region: 'Unknown' };
  }

  try {
    const response = await globalThis.fetch(`https://ipapi.co/${ip}/json/`, {
      headers: {
        'User-Agent': 'Sinna-1.0-API/1.0',
      },
    });

    if (!response.ok) {
      return { country_code: 'US', region: 'Unknown' };
    }

    const data = await response.json() as { country_code?: string; region?: string; error?: boolean };
    
    if (data.error) {
      return { country_code: 'US', region: 'Unknown' };
    }

    return {
      country_code: data.country_code || 'US',
      region: data.region || 'Unknown',
    };
  } catch (error) {
    console.error('Geo-IP lookup error:', error);
    return { country_code: 'US', region: 'Unknown' };
  }
}

/**
 * Resolve language preference with priority:
 * 1. User override (from profile/API key metadata)
 * 2. Browser locale (Accept-Language header)
 * 3. Geo-IP region
 * 4. Default (en-US)
 */
export async function resolveLanguage(req: FastifyRequest): Promise<LanguageInfo> {
  const authReq = req as AuthenticatedRequest;
  if (authReq.userLanguage) {
    return {
      resolved_language: authReq.userLanguage,
      source: 'user_override',
      fallback_used: false,
    };
  }

  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    const languages = acceptLanguage.split(',').map(lang => {
      const [code, q = '1.0'] = lang.trim().split(';q=');
      return { code: code.split('-')[0], full: code, quality: parseFloat(q) };
    });
    
    languages.sort((a, b) => b.quality - a.quality);
    
    for (const lang of languages) {
      const matched = Object.keys(REGION_LANGUAGE_MAP).find(code => 
        REGION_LANGUAGE_MAP[code] === lang.full || REGION_LANGUAGE_MAP[code]?.startsWith(lang.code + '-')
      );
      if (matched) {
        return {
          resolved_language: REGION_LANGUAGE_MAP[matched],
          source: 'browser_locale',
          fallback_used: false,
        };
      }
    }
  }

  const ip = getClientIP(req);
  const geo = await getGeoLocation(ip);
  
  if (geo.country_code) {
    const regionLang = REGION_LANGUAGE_MAP[geo.country_code];
    if (regionLang) {
      // Region is supported, return detected language
      return {
        resolved_language: regionLang,
        source: 'geo_ip',
        fallback_used: false,
        region: geo.region,
        country_code: geo.country_code,
      };
    }
    // Region detected but not in language map (unsupported region like Mars)
    // Only use fallback if region is truly unsupported
    return {
      resolved_language: 'en-US',
      source: 'fallback',
      fallback_used: true,
      region: geo.region,
      country_code: geo.country_code,
    };
  }

  // No country code detected (e.g., localhost, private IP)
  // Use fallback only for truly unsupported cases
  return {
    resolved_language: 'en-US',
    source: 'fallback',
    fallback_used: true,
    region: geo.region,
    country_code: geo.country_code || 'US',
  };
}

/**
 * Fastify middleware hook for region-based localization
 */
export async function regionLanguageMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const languageInfo = await resolveLanguage(req);
    const authReq = req as AuthenticatedRequest;
    
    authReq.languageInfo = languageInfo;
    authReq.resolvedLanguage = languageInfo.resolved_language;
    
    reply.header('X-Resolved-Language', languageInfo.resolved_language);
    reply.header('X-Language-Source', languageInfo.source);
  } catch (error) {
    console.error('Language detection error:', error);
    const authReq = req as AuthenticatedRequest;
    authReq.languageInfo = {
      resolved_language: 'en-US',
      source: 'fallback',
      fallback_used: true,
    };
    authReq.resolvedLanguage = 'en-US';
  }
}


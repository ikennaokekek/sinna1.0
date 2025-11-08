import { FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { Job } from 'bullmq';

// Extended Fastify request with tenant context
export interface AuthenticatedRequest extends FastifyRequest {
  tenantId?: string;
  rawBody?: Buffer;
  requestId?: string;
}

// Standard API response format
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: unknown;
}

// Error response format
export interface ErrorResponse {
  success: false;
  error: string;
  message?: string;
  details?: unknown;
}

// Tenant state type
export interface TenantState {
  active: boolean;
  graceUntil?: number;
  usage: {
    requests: number;
    minutes: number;
    jobs: number;
    storage: number;
    cap: number;
  };
  customerId?: string;
}

// Job result types
export interface CaptionJobResult {
  ok: boolean;
  artifactKey?: string;
  tenantId?: string;
  error?: string;
}

export interface AudioDescriptionJobResult {
  ok: boolean;
  artifactKey?: string;
  tenantId?: string;
  error?: string;
}

export interface ColorJobResult {
  ok: boolean;
  artifactKey?: string;
  tenantId?: string;
  error?: string;
}

// Job bundle type
export interface JobBundle {
  id: string;
  steps: {
    captions: string;
    ad: string;
    color: string;
    videoTransform?: string;
  };
  preset: string;
}

// Artifact type
export interface Artifact {
  type: 'captions' | 'audio_description' | 'color_analysis' | 'video_transform';
  format: string;
  url: string;
  key: string;
}

// Job status response
export interface JobStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  steps: {
    captions?: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      artifactKey?: string;
      url?: string;
    };
    ad?: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      artifactKey?: string;
      url?: string;
    };
    color?: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      artifactKey?: string;
      url?: string;
    };
    videoTransform?: {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      artifactKey?: string;
      url?: string;
      cloudinaryUrl?: string;
    };
  };
  preset: string;
  createdAt: string;
}

// Preset configuration type
export interface PresetConfig {
  subtitleFormats?: string[];
  captionStyle?: string;
  burnIn?: boolean;
  adEnabled?: boolean;
  speed?: number;
  colorProfile?: string;
  motionReduce?: boolean;
  strobeReduce?: boolean;
  videoTransform?: boolean;
  videoTransformConfig?: {
    colorProfile?: string;
    filter?: string;
    motionReduce?: boolean;
    strobeReduce?: boolean;
    colorSoftening?: boolean;
    saturation?: number;
    speed?: number;
    captionOverlay?: boolean;
    volumeBoost?: boolean;
    audioDescription?: boolean;
    contrastBoost?: boolean;
    flashReduce?: boolean;
    brightness?: number;
    contrast?: number;
    audioSmooth?: boolean;
    lowPassFilter?: boolean;
    simplifiedText?: boolean;
    focusHighlight?: boolean;
  };
}

// Usage period response
export interface UsagePeriodResponse {
  period_start: Date;
  period_end: Date;
  requests: number;
  minutes: number;
  jobs: number;
  storage: number;
  cap: number;
}

// Stripe webhook event handlers
export interface StripeWebhookHandlers {
  onInvoicePaymentSucceeded?: (invoice: Stripe.Invoice, tenantId: string) => Promise<void>;
  onInvoicePaymentFailed?: (invoice: Stripe.Invoice, tenantId: string) => Promise<void>;
  onCheckoutSessionCompleted?: (session: Stripe.Checkout.Session, tenantId: string) => Promise<void>;
}

export interface SubscriptionResponse {
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid' | 'trialing' | 'unknown';
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  active: boolean;
  grace_until: string | null;
  created_at: string;
}

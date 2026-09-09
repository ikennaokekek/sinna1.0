import crypto from 'crypto';
import { coreQueueRetryOptions } from '@sinna/types';

interface TransformFlowInput {
  videoUrl: string;
  tenantId: string;
  presetId: string;
  transformConfig: Record<string, unknown>;
  captionData: Record<string, unknown>;
  adData: Record<string, unknown>;
  colorData: Record<string, unknown>;
}

export function createTransformFlow(input: TransformFlowInput, createId = () => crypto.randomUUID()) {
  const childIds = {
    captions: createId(),
    ad: createId(),
    color: createId(),
  };

  return {
    childIds,
    definition: {
      name: 'transform-video',
      queueName: 'video-transform',
      opts: coreQueueRetryOptions,
      data: {
        videoUrl: input.videoUrl,
        tenantId: input.tenantId,
        presetId: input.presetId,
        transformConfig: input.transformConfig,
        adJobId: childIds.ad,
        captionJobId: childIds.captions,
      },
      children: [
        {
          name: 'generate-subtitles',
          queueName: 'captions',
          data: input.captionData,
          opts: { ...coreQueueRetryOptions, jobId: childIds.captions, failParentOnFailure: true },
        },
        {
          name: 'generate-audio-description',
          queueName: 'ad',
          data: input.adData,
          opts: { ...coreQueueRetryOptions, jobId: childIds.ad, failParentOnFailure: true },
        },
        {
          name: 'analyze-colors',
          queueName: 'color',
          data: input.colorData,
          opts: { ...coreQueueRetryOptions, jobId: childIds.color, failParentOnFailure: true },
        },
      ],
    },
  };
}
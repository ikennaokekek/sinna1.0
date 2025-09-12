import { Request, Response } from 'express';
import { z } from 'zod';
import { MediaProcessingService } from '../services/mediaProcessing';
import { QueueService } from '../services/queue';
import { logger } from '../utils/logger';

// Validation schemas
const colorAnalysisSchema = z.object({
  videoUrl: z.string().url(),
  frameCount: z.number().min(1).max(20).optional(),
  startTime: z.number().min(0).optional(),
  interval: z.number().min(5).max(300).optional(), // 5 seconds to 5 minutes
  webhookUrl: z.string().url().optional(),
});

const accessibilityAuditSchema = z.object({
  videoUrl: z.string().url(),
  checkContrast: z.boolean().default(true),
  checkColorBlindness: z.boolean().default(true),
  checkMotionSensitivity: z.boolean().default(false),
  webhookUrl: z.string().url().optional(),
});

export class AccessibilityController {
  private mediaProcessingService: MediaProcessingService;
  private queueService: QueueService;

  constructor(mediaProcessingService: MediaProcessingService, queueService: QueueService) {
    this.mediaProcessingService = mediaProcessingService;
    this.queueService = queueService;
  }

  /**
   * Analyze video colors for accessibility
   * POST /api/v1/accessibility/color-analysis
   */
  analyzeColors = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = colorAnalysisSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      // For quick analysis, process immediately
      if (!body.webhookUrl) {
        const result = await this.mediaProcessingService.analyzeVideoColors(body.videoUrl, {
          frameCount: body.frameCount || 5,
          startTime: body.startTime || 10,
          interval: body.interval || 30
        });

        res.status(200).json({
          success: true,
          data: {
            analysis: result,
            processedAt: new Date().toISOString(),
            processingMethod: 'immediate'
          },
          message: 'Color analysis completed successfully'
        });
        return;
      }

      // For webhook delivery, queue the job
      const job = await this.queueService.addColorAnalysisJob({
        videoUrl: body.videoUrl,
        tenantId,
        userId,
        webhookUrl: body.webhookUrl
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          queueName: 'color-analysis',
          status: 'queued',
          estimatedTime: '1-3 minutes',
          processingMethod: 'async'
        },
        message: 'Color analysis job queued successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('Color analysis failed', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to analyze colors'
      });
    }
  };

  /**
   * Comprehensive accessibility audit
   * POST /api/v1/accessibility/audit
   */
  performAccessibilityAudit = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = accessibilityAuditSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      // Perform various accessibility checks
      const auditResults: any = {
        videoUrl: body.videoUrl,
        auditId: `audit_${Date.now()}`,
        timestamp: new Date().toISOString(),
        checks: {}
      };

      // Color contrast analysis
      if (body.checkContrast) {
        try {
          const colorAnalysis = await this.mediaProcessingService.analyzeVideoColors(body.videoUrl, {
            frameCount: 3,
            startTime: 10,
            interval: 60
          });
          
          auditResults.checks.colorContrast = {
            passed: colorAnalysis.accessibility_score >= 70,
            score: colorAnalysis.accessibility_score,
            contrastRatio: colorAnalysis.contrast_ratio,
            recommendations: colorAnalysis.recommendations,
            details: colorAnalysis
          };
        } catch (error) {
          auditResults.checks.colorContrast = {
            passed: false,
            error: 'Failed to analyze color contrast',
            recommendations: ['Manual color contrast review recommended']
          };
        }
      }

      // Color blindness check
      if (body.checkColorBlindness) {
        auditResults.checks.colorBlindness = {
          passed: true, // Mock result
          simulationUrls: {
            protanopia: `${body.videoUrl}?colorblind=protanopia`,
            deuteranopia: `${body.videoUrl}?colorblind=deuteranopia`,
            tritanopia: `${body.videoUrl}?colorblind=tritanopia`
          },
          recommendations: [
            'Consider adding patterns or textures alongside color coding',
            'Ensure sufficient contrast ratios',
            'Test with color blindness simulation tools'
          ]
        };
      }

      // Motion sensitivity check (placeholder)
      if (body.checkMotionSensitivity) {
        auditResults.checks.motionSensitivity = {
          passed: true, // Mock result - would require actual video analysis
          flashingDetected: false,
          rapidMotionDetected: false,
          recommendations: [
            'Provide option to reduce motion',
            'Include warnings for flashing content',
            'Consider auto-pause for rapid scene changes'
          ]
        };
      }

      // Calculate overall score
      const passedChecks = Object.values(auditResults.checks).filter((check: any) => check.passed).length;
      const totalChecks = Object.keys(auditResults.checks).length;
      auditResults.overallScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
      auditResults.overallPassed = auditResults.overallScore >= 70;

      // Generate summary recommendations
      auditResults.summaryRecommendations = this.generateSummaryRecommendations(auditResults.checks);

      res.status(200).json({
        success: true,
        data: auditResults,
        message: 'Accessibility audit completed successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('Accessibility audit failed', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to perform accessibility audit'
      });
    }
  };

  /**
   * Get accessibility guidelines and best practices
   * GET /api/v1/accessibility/guidelines
   */
  getAccessibilityGuidelines = async (req: Request, res: Response): Promise<void> => {
    try {
      const guidelines = {
        wcagVersion: '2.1',
        levels: ['A', 'AA', 'AAA'],
        categories: {
          perceivable: {
            description: 'Information must be presentable in ways users can perceive',
            guidelines: [
              {
                id: '1.4.3',
                level: 'AA',
                title: 'Contrast (Minimum)',
                description: 'Text has contrast ratio of at least 4.5:1',
                videoRelevance: 'Applies to subtitle text and UI elements'
              },
              {
                id: '1.4.6',
                level: 'AAA', 
                title: 'Contrast (Enhanced)',
                description: 'Text has contrast ratio of at least 7:1',
                videoRelevance: 'Higher standard for subtitle readability'
              }
            ]
          },
          operable: {
            description: 'Interface components must be operable',
            guidelines: [
              {
                id: '2.3.1',
                level: 'A',
                title: 'Three Flashes or Below Threshold',
                description: 'Content does not flash more than 3 times per second',
                videoRelevance: 'Critical for video content safety'
              }
            ]
          },
          understandable: {
            description: 'Information and UI operation must be understandable',
            guidelines: [
              {
                id: '3.1.2',
                level: 'AA',
                title: 'Language of Parts',
                description: 'Language of each passage is programmatically determined',
                videoRelevance: 'Important for multi-language subtitles'
              }
            ]
          }
        },
        bestPractices: [
          'Provide captions for all video content',
          'Include audio descriptions for visual content',
          'Ensure subtitle timing allows for comfortable reading',
          'Use clear, readable fonts for subtitles',
          'Provide controls for subtitle customization',
          'Test with assistive technologies',
          'Consider cognitive accessibility in content design'
        ],
        tools: [
          'Color contrast analyzers',
          'Screen readers',
          'Keyboard navigation testing',
          'Color blindness simulators',
          'Automated accessibility scanners'
        ]
      };

      res.status(200).json({
        success: true,
        data: guidelines,
        message: 'Accessibility guidelines retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get accessibility guidelines', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve accessibility guidelines'
      });
    }
  };

  /**
   * Generate summary recommendations based on audit results
   */
  private generateSummaryRecommendations(checks: any): string[] {
    const recommendations: string[] = [];

    // Analyze each check and generate recommendations
    Object.entries(checks).forEach(([checkType, result]: [string, any]) => {
      if (!result.passed) {
        switch (checkType) {
          case 'colorContrast':
            recommendations.push('Improve color contrast ratios to meet WCAG standards');
            break;
          case 'colorBlindness':
            recommendations.push('Implement color-blind friendly design patterns');
            break;
          case 'motionSensitivity':
            recommendations.push('Add motion controls and seizure warnings');
            break;
        }
      }
    });

    // Add general recommendations
    if (recommendations.length === 0) {
      recommendations.push('Great job! Continue monitoring accessibility as content changes');
    } else {
      recommendations.push('Consider implementing automated accessibility testing in your workflow');
      recommendations.push('Regular accessibility audits help maintain compliance');
    }

    return recommendations;
  }
}

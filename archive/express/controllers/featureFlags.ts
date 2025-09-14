/**
 * Feature Flags Controller
 * Provides API endpoints for feature flag management and status
 */

import { Request, Response } from 'express';
import { FeatureFlagService, featureFlags } from '../config/featureFlags';

/**
 * Get all feature flags with their current status
 */
export const getFeatureFlags = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.headers['x-tenant-id'] as string;
    const environment = process.env.NODE_ENV || 'production';
    
    const featureFlagService = new FeatureFlagService(tenantId, environment);
    const enabledFlags = featureFlagService.getEnabledFlags();
    
    // Get detailed information for all flags
    const flagsWithStatus = Object.keys(featureFlags).map(flagName => {
      const flag = featureFlags[flagName];
      const isEnabled = featureFlagService.isEnabled(flagName);
      
      return {
        name: flagName,
        ...flag,
        isEnabled,
        canEnable: !flag.environment || flag.environment.includes(environment),
        requiresUpgrade: flag.requiresSubscription && 
          !flag.requiresSubscription.includes('standard') && 
          !flag.requiresSubscription.includes('gold')
      };
    });

    // Group flags by category
    const categories = {
      'Real-time Streaming': flagsWithStatus.filter(f => 
        f.name.includes('REALTIME') || f.name.includes('STREAMING')
      ),
      'GPU Acceleration': flagsWithStatus.filter(f => 
        f.name.includes('GPU')
      ),
      'Advanced AI': flagsWithStatus.filter(f => 
        f.name.includes('MULTI_LANGUAGE') || 
        f.name.includes('SPEAKER') || 
        f.name.includes('EMOTION') || 
        f.name.includes('CONTENT_MODERATION')
      ),
      'Accessibility': flagsWithStatus.filter(f => 
        f.name.includes('WCAG') || 
        f.name.includes('ACCESSIBILITY') || 
        f.name.includes('CUSTOM')
      ),
      'Performance': flagsWithStatus.filter(f => 
        f.name.includes('EDGE') || 
        f.name.includes('AUTO_SCALING') || 
        f.name.includes('CACHING')
      ),
      'Analytics': flagsWithStatus.filter(f => 
        f.name.includes('ANALYTICS') || 
        f.name.includes('A_B_TESTING') || 
        f.name.includes('WEBHOOK_ANALYTICS')
      ),
      'Integrations': flagsWithStatus.filter(f => 
        f.name.includes('THIRD_PARTY') || 
        f.name.includes('GRAPHQL') || 
        f.name.includes('SDK')
      )
    };

    res.json({
      success: true,
      data: {
        totalFlags: flagsWithStatus.length,
        enabledFlags: enabledFlags.length,
        categories,
        summary: {
          enabled: enabledFlags.length,
          disabled: flagsWithStatus.length - enabledFlags.length,
          requiresUpgrade: flagsWithStatus.filter(f => f.requiresUpgrade).length,
          comingSoon: flagsWithStatus.filter(f => 
            f.metadata?.estimatedRelease && 
            f.metadata.estimatedRelease.includes('2024')
          ).length
        }
      },
      message: 'Feature flags retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting feature flags:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feature flags',
      code: 'FEATURE_FLAGS_ERROR'
    });
  }
};

/**
 * Get status of a specific feature flag
 */
export const getFeatureFlag = async (req: Request, res: Response) => {
  try {
    const { flagName } = req.params;
    const tenantId = req.tenantId || req.headers['x-tenant-id'] as string;
    const environment = process.env.NODE_ENV || 'production';
    
    const featureFlagService = new FeatureFlagService(tenantId, environment);
    const flagInfo = featureFlagService.getFlagInfo(flagName);
    
    if (!flagInfo) {
      return res.status(404).json({
        success: false,
        error: 'Feature flag not found',
        code: 'FEATURE_FLAG_NOT_FOUND'
      });
    }

    const isEnabled = featureFlagService.isEnabled(flagName);
    
    res.json({
      success: true,
      data: {
        name: flagName,
        ...flagInfo,
        isEnabled,
        canEnable: !flagInfo.environment || flagInfo.environment.includes(environment),
        requiresUpgrade: flagInfo.requiresSubscription && 
          !flagInfo.requiresSubscription.includes('standard') && 
          !flagInfo.requiresSubscription.includes('gold')
      },
      message: 'Feature flag retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting feature flag:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feature flag',
      code: 'FEATURE_FLAG_ERROR'
    });
  }
};

/**
 * Get enabled feature flags for current tenant
 */
export const getEnabledFlags = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.headers['x-tenant-id'] as string;
    const environment = process.env.NODE_ENV || 'production';
    
    const featureFlagService = new FeatureFlagService(tenantId, environment);
    const enabledFlags = featureFlagService.getEnabledFlags();
    
    // Get detailed info for enabled flags only
    const enabledFlagsInfo = enabledFlags.map(flagName => {
      const flag = featureFlags[flagName];
      return {
        name: flagName,
        description: flag.description,
        metadata: flag.metadata
      };
    });

    res.json({
      success: true,
      data: {
        enabledFlags: enabledFlagsInfo,
        count: enabledFlags.length
      },
      message: 'Enabled feature flags retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting enabled flags:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve enabled flags',
      code: 'ENABLED_FLAGS_ERROR'
    });
  }
};

/**
 * Get feature flags roadmap
 */
export const getFeatureRoadmap = async (req: Request, res: Response) => {
  try {
    const roadmap = Object.values(featureFlags)
      .filter(flag => flag.metadata?.estimatedRelease)
      .map(flag => ({
        name: flag.name,
        description: flag.description,
        estimatedRelease: flag.metadata?.estimatedRelease,
        complexity: flag.metadata?.complexity || 'medium',
        category: getCategoryFromFlagName(flag.name),
        status: flag.enabled ? 'available' : 'coming_soon'
      }))
      .sort((a, b) => {
        // Sort by release date
        const aQuarter = a.estimatedRelease?.split(' ')[0] || 'Q4 2024';
        const bQuarter = b.estimatedRelease?.split(' ')[0] || 'Q4 2024';
        return aQuarter.localeCompare(bQuarter);
      });

    // Group by quarter
    const roadmapByQuarter = roadmap.reduce((acc, feature) => {
      const quarter = feature.estimatedRelease || 'Q4 2024';
      if (!acc[quarter]) {
        acc[quarter] = [];
      }
      acc[quarter].push(feature);
      return acc;
    }, {} as Record<string, any[]>);

    res.json({
      success: true,
      data: {
        roadmap: roadmapByQuarter,
        totalFeatures: roadmap.length,
        nextRelease: Object.keys(roadmapByQuarter)[0] || 'Q2 2024'
      },
      message: 'Feature roadmap retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting feature roadmap:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feature roadmap',
      code: 'ROADMAP_ERROR'
    });
  }
};

/**
 * Get feature flag analytics (usage statistics)
 */
export const getFeatureAnalytics = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.headers['x-tenant-id'] as string;
    const environment = process.env.NODE_ENV || 'production';
    
    const featureFlagService = new FeatureFlagService(tenantId, environment);
    const enabledFlags = featureFlagService.getEnabledFlags();
    
    // Mock analytics data - in production, this would come from a database
    const analytics = {
      totalFlags: Object.keys(featureFlags).length,
      enabledFlags: enabledFlags.length,
      usageStats: {
        mostUsed: ['REALTIME_STREAMING', 'GPU_ACCELERATION', 'MULTI_LANGUAGE_DETECTION'],
        leastUsed: ['EMOTION_DETECTION', 'A_B_TESTING', 'GRAPHQL_API'],
        recentlyEnabled: ['CACHING_LAYER', 'WEBHOOK_ANALYTICS']
      },
      performance: {
        averageResponseTime: '150ms',
        errorRate: '0.1%',
        uptime: '99.9%'
      },
      recommendations: [
        'Consider enabling GPU_ACCELERATION for better performance',
        'MULTI_LANGUAGE_DETECTION could improve your global reach',
        'CACHING_LAYER is recommended for high-traffic applications'
      ]
    };

    res.json({
      success: true,
      data: analytics,
      message: 'Feature analytics retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting feature analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feature analytics',
      code: 'ANALYTICS_ERROR'
    });
  }
};

/**
 * Helper function to determine category from flag name
 */
function getCategoryFromFlagName(flagName: string): string {
  if (flagName.includes('REALTIME') || flagName.includes('STREAMING')) {
    return 'Real-time Streaming';
  } else if (flagName.includes('GPU')) {
    return 'GPU Acceleration';
  } else if (flagName.includes('MULTI_LANGUAGE') || flagName.includes('SPEAKER') || 
             flagName.includes('EMOTION') || flagName.includes('CONTENT_MODERATION')) {
    return 'Advanced AI';
  } else if (flagName.includes('WCAG') || flagName.includes('ACCESSIBILITY') || 
             flagName.includes('CUSTOM')) {
    return 'Accessibility';
  } else if (flagName.includes('EDGE') || flagName.includes('AUTO_SCALING') || 
             flagName.includes('CACHING')) {
    return 'Performance';
  } else if (flagName.includes('ANALYTICS') || flagName.includes('A_B_TESTING') || 
             flagName.includes('WEBHOOK_ANALYTICS')) {
    return 'Analytics';
  } else if (flagName.includes('THIRD_PARTY') || flagName.includes('GRAPHQL') || 
             flagName.includes('SDK')) {
    return 'Integrations';
  }
  return 'Other';
}

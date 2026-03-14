export interface ResolveConfigInput {
  opencodeConfig: {
    opencodeAnalytics?: {
      enabled?: boolean;
      debug?: boolean;
      storagePath?: string;
      commands?: { enabled?: boolean };
      trackers?: { skill?: { enabled?: boolean } };
    };
  };
  env: Record<string, string | undefined>;
  homeDir: string;
}

export interface AnalyticsConfig {
  enabled: boolean;
  debug: boolean;
  storagePath: string;
  commands: { enabled: boolean };
  trackers: { skill: { enabled: boolean } };
}

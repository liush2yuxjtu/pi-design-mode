import { createTelemetry } from '@nyn5255/telemetry';

const DEFAULT_ENDPOINT = 'https://telemetry-peach.vercel.app/api/events';

function truthy(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return !!value && value !== '0' && value !== 'false' && value !== 'no';
}

/**
 * Compatibility adapter for the existing package instrumentation.
 * The shared telemetry SDK owns schema validation, dedupe, D7/WAU derivation,
 * kill switches, CI suppression, local state, and bounded network delivery.
 */
export function createUsageFunnel(packageName: string, version: string) {
  const telemetry = createTelemetry({
    package: packageName,
    version,
    enabled: truthy('PI_USAGE_TELEMETRY'),
    collectorPrivacyAcknowledged: truthy('PI_USAGE_TELEMETRY_PRIVACY_ACK'),
    endpoint: process.env.PI_USAGE_TELEMETRY_ENDPOINT || DEFAULT_ENDPOINT,
  });

  return {
    async launch(): Promise<void> {
      await telemetry.install();
      await telemetry.activated();
      await telemetry.active();
    },
    success(): Promise<void> {
      return telemetry.success();
    },
  };
}

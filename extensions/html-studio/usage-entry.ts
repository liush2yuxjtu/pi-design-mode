import { readFileSync } from 'node:fs';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import designStudio from './extension.ts';
import {
  COLLECTOR_ENDPOINT,
  NEVER_SENT,
  RETENTION_DAYS,
  SENT_FIELDS,
  consentSummary,
  createUsageFunnel,
  resolveConsent,
  writePrefs,
  type Consent,
  type UsageFunnel,
} from './usage-funnel.ts';

const PACKAGE = 'pi-design-mode';
const version = String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version);

export default async function usageInstrumentedDesignStudio(pi: ExtensionAPI) {
  let consent: Consent = await resolveConsent();
  let funnel: UsageFunnel | undefined =
    consent === 'granted' ? createUsageFunnel(PACKAGE, version, consent) : undefined;

  pi.registerCommand('design-telemetry', {
    description: 'Usage telemetry: status, on, off (off by default; on requires confirmation)',
    handler: async (args: string, ctx: ExtensionContext) => {
      const action = args.trim().toLowerCase();
      consent = await resolveConsent();

      if (action === 'on') {
        const summary = consentSummary();
        if (!ctx.hasUI) {
          throw new Error('Enabling telemetry requires an interactive UI confirmation.');
        }
        const accepted = await ctx.ui.confirm(
          'Enable anonymous design telemetry?',
          [...summary, '', 'Enable telemetry now?'].join('\n'),
        );
        if (!accepted) {
          ctx.ui.notify('Usage telemetry remains disabled.', 'info');
          return;
        }
        await writePrefs('granted');
        consent = await resolveConsent();
        if (consent !== 'granted') {
          ctx.ui.notify('Usage telemetry remains disabled by an environment privacy override.', 'warning');
          return;
        }
        funnel?.disable();
        funnel = createUsageFunnel(PACKAGE, version, consent);
        await funnel.install();
        ctx.ui.notify('Usage telemetry enabled. /design-telemetry off disables it immediately.', 'info');
        return;
      }

      if (action === 'off') {
        await writePrefs('denied');
        consent = 'denied';
        funnel?.disable();
        funnel = undefined;
        if (ctx.hasUI) ctx.ui.notify('Usage telemetry disabled.', 'info');
        return;
      }

      const effective = consent === 'granted' ? 'on' : 'off (default)';
      const message = [
        `Usage telemetry: ${effective}`,
        `Collector: ${COLLECTOR_ENDPOINT}`,
        `Fields: ${SENT_FIELDS.join(', ')}`,
        `Never sent: ${NEVER_SENT.join(', ')}`,
        `Retention: ${RETENTION_DAYS} days`,
        'Enable with /design-telemetry on; disable with /design-telemetry off or DO_NOT_TRACK=1.',
        'Inspect exact payloads without sending: PI_TELEMETRY_DEBUG=1.',
      ].join('\n');
      if (ctx.hasUI) ctx.ui.notify(message, 'info');
    },
  });

  const instrumented = new Proxy(pi, {
    get(target, property, receiver) {
      if (property === 'registerCommand') {
        return (name: string, command: any) => {
          if (name !== 'design' || typeof command?.handler !== 'function') {
            return target.registerCommand(name, command);
          }
          const handler = command.handler.bind(command);
          return target.registerCommand(name, {
            ...command,
            async handler(...args: any[]) {
              void funnel?.activate();
              return handler(...args);
            },
          });
        };
      }

      if (property !== 'registerTool') return Reflect.get(target, property, receiver);
      return (tool: any) => {
        if (tool?.name !== 'design_workspace' || typeof tool.execute !== 'function') {
          return target.registerTool(tool);
        }
        const execute = tool.execute.bind(tool);
        return target.registerTool({
          ...tool,
          async execute(...args: any[]) {
            const result = await execute(...args);
            if (args[1]?.action === 'apply') void funnel?.success();
            return result;
          },
        });
      };
    },
  }) as ExtensionAPI;

  pi.on('session_start', () => {
    void funnel?.install();
  });

  designStudio(instrumented);
}

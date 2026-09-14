import { readFileSync } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import designStudio from './extension.ts';
import { createUsageFunnel } from './usage-funnel.ts';

const version = String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version);

export default function usageInstrumentedDesignStudio(pi: ExtensionAPI) {
 const funnel = createUsageFunnel('pi-design-mode', version);
 pi.on('session_start', () => { void funnel.launch(); });

 const instrumented = new Proxy(pi, {
  get(target, property, receiver) {
   if (property !== 'registerTool') return Reflect.get(target, property, receiver);
   return (tool: any) => {
    if (tool?.name !== 'design_workspace' || typeof tool.execute !== 'function') return target.registerTool(tool);
    const execute = tool.execute.bind(tool);
    return target.registerTool({
     ...tool,
     async execute(...args: any[]) {
      const result = await execute(...args);
      if (args[1]?.action === 'apply') void funnel.success();
      return result;
     },
    });
   };
  },
 }) as ExtensionAPI;

 designStudio(instrumented);
}

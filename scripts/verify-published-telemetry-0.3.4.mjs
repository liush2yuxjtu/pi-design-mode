import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

assert.equal(process.platform, "darwin", "pi-design-mode is darwin-only");
const tmp=await mkdtemp(join(tmpdir(),"pi-design-published-"));
await writeFile(join(tmp,"package.json"), JSON.stringify({name:"published-consumer",private:true,type:"module"},null,2));
const install=spawnSync("npm",["install","--ignore-scripts","--no-audit","--no-fund","--omit=peer","pi-design-mode@0.3.4"],{cwd:tmp,stdio:"inherit",env:process.env});
assert.equal(install.status,0,"npm registry install failed");

const root=join(tmp,"node_modules","pi-design-mode");
const pkg=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
assert.equal(pkg.version,"0.3.4");
assert.equal(pkg.dependencies?.["@nyn5255/telemetry"],"^0.1.3");
const usage=await readFile(join(root,"extensions/html-studio/usage-funnel.ts"),"utf8");
const entry=await readFile(join(root,"extensions/html-studio/usage-entry.ts"),"utf8");
const readme=await readFile(join(root,"README.md"),"utf8");
assert.match(entry,/registerCommand\(["']design-telemetry["']/);
assert.match(entry,/ctx\.ui\.confirm/);
assert.match(readme,/off by default/i);
assert.match(readme,/180-day retention/i);
await writeFile(join(tmp,"published-usage-funnel.ts"),usage);

const probe=join(tmp,"probe.mjs");
await writeFile(probe,`
import assert from "node:assert/strict";
import {mkdtemp,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {COLLECTOR_ENDPOINT,RETENTION_DAYS,SENT_FIELDS,consentSummary,createUsageFunnel,resolveConsent} from "./published-usage-funnel.ts";
const env={CI:"0",GITHUB_ACTIONS:"0",GITLAB_CI:"0",TF_BUILD:"0",JENKINS_URL:"0",BUILD_ID:"0"};
const state=await mkdtemp(join(tmpdir(),"pi-design-wire-"));
assert.equal(await resolveConsent(env,join(state,"prefs.json")),"denied");
const disclosure=consentSummary().join("\\n");
assert.ok(disclosure.includes(COLLECTOR_ENDPOINT));
assert.ok(disclosure.includes(String(RETENTION_DAYS)));
for(const field of SENT_FIELDS) assert.ok(disclosure.includes(field));
const c=createUsageFunnel("pi-design-mode","0.3.4","granted",{stateDirectory:state,env:{...env,PI_TELEMETRY_DEBUG:"1"}});
await c.install(); await c.activate(); await c.success(); await c.flush();
assert.equal((await readdir(state)).filter(n=>n.endsWith(".json")).length,0);
`);

const env={...process.env,PI_TELEMETRY_DEBUG:"1",CI:"0",GITHUB_ACTIONS:"0",GITLAB_CI:"0",TF_BUILD:"0",JENKINS_URL:"0",BUILD_ID:"0"};
const result=spawnSync(process.execPath,["--experimental-strip-types",probe],{cwd:tmp,env,encoding:"utf8"});
if(result.stdout) process.stdout.write(result.stdout);
if(result.stderr) process.stderr.write(result.stderr);
assert.equal(result.status,0,`probe failed ${result.status}`);
const payloads=result.stderr.split(/\r?\n/).filter(l=>l.startsWith("[telemetry:debug] ")).map(l=>JSON.parse(l.slice(18)));
assert.deepEqual(payloads.map(p=>p.event),["install","activated","weekly_active","first_success","weekly_active"]);
assert.ok(payloads.every(p=>p.package==="pi-design-mode"&&p.version==="0.3.4"&&p.ci===false));
console.log(JSON.stringify({verified:"pi-design-mode@0.3.4",platform:process.platform,node:process.versions.node,dependency:pkg.dependencies["@nyn5255/telemetry"],events:payloads.map(p=>p.event),publishedConsentCommand:true},null,2));

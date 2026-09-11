import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { executeResearch } from './research-core.js';

export async function executeWithJiuwen(protocol, options = {}) {
  const python = options.python || process.env.RESEARCH_PYTHON;
  if (!python) throw new Error('RESEARCH_PYTHON must point to the Python environment containing openJiuwen.');
  const script = fileURLToPath(new URL('../services/research/jiuwen_workflow.py', import.meta.url));
  const child = spawn(python, ['-u', script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', WORKFLOW_EXECUTE_TIMEOUT: '900' } });
  let pending = null, requested = null, failure = null, stderr = '', sdk = null;
  let resolveExit, rejectExit;
  const exited = new Promise((resolve, reject) => { resolveExit = resolve; rejectExit = reject; });
  // A process can fail before a scientific stage awaits the gate.
  exited.catch(() => {});
  const fail = (error) => { failure = error; pending?.reject(error); pending = null; rejectExit(error); };
  child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-5000); });
  child.stdin.on('error', fail);
  child.on('error', fail);
  child.on('exit', (code) => {
    if (code !== 0) fail(new Error(`openJiuwen exited (${code}): ${stderr.slice(-1600)}`));
    else if (pending) fail(new Error('openJiuwen exited before granting a stage.'));
    else resolveExit();
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'ready') sdk = event;
    if (event.type !== 'request') return;
    if (pending) {
      const gate = pending; pending = null;
      if (gate.stage !== event.stage) fail(new Error(`Unexpected workflow stage: ${event.stage}`));
      else gate.resolve();
    } else requested = event.stage;
  });
  const timeout = setTimeout(() => { fail(new Error('openJiuwen execution budget exceeded (15 minutes).')); child.kill(); }, 900000);
  const upstreamBeforeStage = options.beforeStage;
  try {
    const result = await executeResearch(protocol, {
      ...options, runtime: 'openjiuwen-workflow',
      beforeStage: async (stage) => {
        if (upstreamBeforeStage) await upstreamBeforeStage(stage);
        if (failure) return Promise.reject(failure);
        if (requested) {
          const received = requested; requested = null;
          return received === stage ? Promise.resolve() : Promise.reject(new Error(`Workflow order mismatch: ${received} / ${stage}`));
        }
        return new Promise((resolve, reject) => { pending = { stage, resolve, reject }; });
      },
      afterStage: (stage, outputHash) => child.stdin.write(JSON.stringify({ stage, outputHash }) + '\n')
    });
    await exited;
    result.orchestrator = { name: sdk.sdk, version: sdk.version, workflow: 'floracast_research', transport: 'stdio', stages: result.stages.map((s) => s.id) };
    return result;
  } finally {
    clearTimeout(timeout); lines.close(); child.stdin.destroy();
    if (child.exitCode === null) child.kill();
  }
}

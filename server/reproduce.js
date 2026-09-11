// Standalone process: reads a frozen exported run from stdin, executes shared calculations.
import { executeResearch, sha256 } from './research-core.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const snapshot = JSON.parse(input);
  if (!snapshot.result?.datasets || !snapshot.result?.reproduction) throw new Error('A completed research package is required.');
  const { datasets } = snapshot.result;
  for (const asset of datasets.manifests) {
    const data = asset.source === 'NASA_POWER' ? datasets.power : asset.source === 'MODIS_ORNL' ? datasets.vegetation : null;
    if (data && asset.checksum && sha256(data) !== asset.checksum) throw new Error(`Input checksum mismatch: ${asset.id}`);
  }
  const result = await executeResearch(snapshot.protocol, {
    datasets, runtime: 'standalone-reproduction', literature: snapshot.result.literature,
    planProtocol: async () => snapshot.result.planning
  });
  const verification = {
    runId: snapshot.id,
    inputsEqual: result.reproduction.inputHash === snapshot.result.reproduction.inputHash,
    outputsEqual: result.reproduction.outputHash === snapshot.result.reproduction.outputHash,
    outputHash: result.reproduction.outputHash,
    scope: 'fresh Node.js process, frozen inputs, shared deterministic methods',
    summaries: result.summaries
  };
  process.stdout.write(JSON.stringify(verification));
  if (!verification.inputsEqual || !verification.outputsEqual) process.exitCode = 1;
} catch (error) {
  process.stderr.write(String(error.message));
  process.exitCode = 1;
}

import assert from 'node:assert/strict';
import { executeWithJiuwen } from '../jiuwen-runtime.js';
const result = await executeWithJiuwen({ question: '验证华为框架是否调度每一个科研计算阶段', lat: 36, lng: 120, mode: 'demo', startYear: 2024, endYear: 2024 });
assert.equal(result.orchestrator.name, 'openjiuwen');
assert.equal(result.stages.length, 8);
assert.equal(result.stages.every((stage) => stage.status === 'completed'), true);
console.log(JSON.stringify({ orchestrator: result.orchestrator, outputHash: result.reproduction.outputHash }));

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { executeResearch, normalizeProtocol, RESEARCH_STAGES, buildNotebook, buildReport, sha256 } from './research-core.js';
import { validateGroundObservations } from './ground-validation.js';

export class ResearchStore {
  constructor(rootDir, options = {}) {
    this.rootDir = rootDir;
    this.runs = new Map();
    this.events = new EventEmitter();
    this.events.setMaxListeners(100);
    this.executeFn = options.execute || executeResearch;
    this.runtime = options.runtime || 'local-deterministic';
    this.openJiuwenUrl = options.openJiuwenUrl || '';
    this.maxConcurrency = Math.max(1, Math.min(8, Number(options.maxConcurrency || process.env.RESEARCH_MAX_CONCURRENCY || 2)));
    this.activeCount = 0;
    this.pending = [];
    fs.mkdirSync(rootDir, { recursive: true });
    this.load();
  }

  load() {
    for (const name of fs.readdirSync(this.rootDir).filter((item) => item.endsWith('.json'))) {
      try {
        const run = JSON.parse(fs.readFileSync(path.join(this.rootDir, name), 'utf8'));
        if (run?.id) {
          if (['running', 'queued', 'paused'].includes(run.status)) run.status = 'interrupted';
          run.events ||= [];
          this.runs.set(run.id, run);
          this.persist(run);
        }
      } catch (_) {
        // A corrupt runtime record is ignored and never used as scientific evidence.
      }
    }
  }

  persist(run) {
    const target = path.join(this.rootDir, `${run.id}.json`);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(run, null, 2));
    fs.renameSync(temp, target);
  }

  list() {
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((run) => this.summary(run));
  }

  summary(run) {
    return {
      id: run.id, status: run.status, createdAt: run.createdAt, updatedAt: run.updatedAt,
      protocol: run.protocol, runtime: run.runtime, currentStage: run.currentStage,
      stageCount: run.result?.stages?.length || run.stageEvents?.filter((item) => item.status === 'completed').length || 0,
      audit: run.result?.evidence?.audit || null,
      parentRunId: run.parentRunId || null,
      error: run.error || null
    };
  }

  get(id) {
    return this.runs.get(id) || null;
  }

  create(input, metadata = {}) {
    const protocol = normalizeProtocol(input);
    const now = new Date().toISOString();
    const run = {
      id: `run_${now.slice(0, 10).replaceAll('-', '')}_${crypto.randomUUID().slice(0, 8)}`,
      status: 'queued', createdAt: now, updatedAt: now, protocol,
      protocolHash: sha256(protocol), runtime: this.openJiuwenUrl ? 'openjiuwen-remote' : this.runtime,
      currentStage: null, stageEvents: [], events: [], result: null, error: null,
      replayDatasets: metadata.datasets || null,
      replayPlanning: metadata.planning || null,
      replayLiterature: metadata.literature || null,
      parentRunId: metadata.parentRunId || null
    };
    this.runs.set(run.id, run);
    this.persist(run);
    this.pending.push(run.id);
    this.drain();
    return run;
  }

  drain() {
    while (this.activeCount < this.maxConcurrency && this.pending.length) {
      const id = this.pending.shift();
      this.activeCount += 1;
      setImmediate(async () => {
        try { await this.execute(id); }
        finally { this.activeCount -= 1; this.drain(); }
      });
    }
  }

  emit(run, event) {
    event = { ...event, id: run.events.length + 1, runId: run.id, at: new Date().toISOString() };
    run.events.push(event);
    run.updatedAt = new Date().toISOString();
    if (event.type === 'stage') {
      run.currentStage = event.stageId;
      run.stageEvents.push(event);
    }
    this.persist(run);
    this.events.emit(run.id, event);
  }

  async execute(id) {
    const run = this.get(id);
    if (!run || run.status !== 'queued') return;
    run.status = 'running';
    this.emit(run, { type: 'run', status: 'running', runId: run.id, at: new Date().toISOString() });
    try {
      // The remote adapter is deliberately contract-based: deployments may front an openJiuwen
      // WorkflowAgent with POST /runs and return the normalized result below.
      let result;
      if (this.openJiuwenUrl) {
        const response = await fetch(this.openJiuwenUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ protocol: run.protocol, contractVersion: 'floracast-research/1.0' })
        });
        if (!response.ok) throw new Error(`openJiuwen adapter failed with HTTP ${response.status}`);
        result = await response.json();
        if (!result?.evidence || !result?.reproduction || !result?.report) throw new Error('openJiuwen adapter returned an invalid research result contract.');
      } else {
        result = await this.executeFn(run.protocol, {
          runtime: run.runtime,
          datasets: run.replayDatasets,
          literature: run.replayLiterature || undefined,
          planProtocol: run.replayPlanning ? async () => run.replayPlanning : undefined,
          notify: (event) => {
            if (run.status === 'cancelled') throw new Error('任务已取消。');
            this.emit(run, event);
          },
          beforeStage: () => this.awaitRunnable(run)
        });
      }
      if (run.status === 'cancelled') return;
      run.result = result;
      const source = this.get(run.parentRunId);
      if (source?.result && run.replayDatasets) {
        run.reproductionComparison = {
          inputsEqual: result.reproduction.inputHash === source.result.reproduction.inputHash,
          outputsEqual: result.reproduction.outputHash === source.result.reproduction.outputHash,
          scope: '同一服务内冻结快照重新计算；独立环境验证尚未执行。'
        };
      }
      run.status = 'completed';
      run.currentStage = null;
      this.emit(run, { type: 'run', status: 'completed', runId: run.id, at: new Date().toISOString(), audit: result.evidence.audit });
    } catch (error) {
      if (run.status === 'cancelled') return;
      run.status = 'failed';
      run.error = { message: String(error?.message || error), at: new Date().toISOString() };
      this.emit(run, { type: 'run', status: 'failed', runId: run.id, error: run.error });
    }
  }

  reproduce(id) {
    const source = this.get(id);
    if (!source) return null;
    if (!source.result) throw Object.assign(new Error('没有可复算的数据快照。'), { status: 409 });
    return this.create(source.protocol, { parentRunId: source.id, datasets: source.result.datasets, planning: source.result.planning, literature: source.result.literature });
  }

  cancel(id) {
    const run = this.get(id);
    if (!run) throw Object.assign(new Error('研究任务不存在。'), { status: 404 });
    if (!['queued', 'running', 'paused'].includes(run.status)) throw Object.assign(new Error('任务已结束。'), { status: 409 });
    run.status = 'cancelled';
    this.emit(run, { type: 'run', status: 'cancelled' });
    this.events.emit(`${run.id}:state`);
    return run;
  }

  pause(id) {
    const run = this.get(id);
    if (!run) throw Object.assign(new Error('研究任务不存在。'), { status: 404 });
    if (run.status !== 'running') throw Object.assign(new Error('只有执行中的任务可以暂停。'), { status: 409 });
    run.status = 'paused';
    this.emit(run, { type: 'run', status: 'paused', note: '将在当前阶段结束后的安全边界暂停。' });
    return run;
  }

  resume(id) {
    const run = this.get(id);
    if (!run) throw Object.assign(new Error('研究任务不存在。'), { status: 404 });
    if (run.status !== 'paused') throw Object.assign(new Error('任务并未暂停。'), { status: 409 });
    run.status = 'running';
    this.emit(run, { type: 'run', status: 'running', note: '已从阶段边界恢复。' });
    this.events.emit(`${run.id}:state`);
    return run;
  }

  async awaitRunnable(run) {
    while (run.status === 'paused') await new Promise((resolve) => this.events.once(`${run.id}:state`, resolve));
    if (run.status === 'cancelled') throw new Error('任务已取消。');
  }

  subscribe(id, listener) {
    this.events.on(id, listener);
    return () => this.events.off(id, listener);
  }

  package(id) {
    const run = this.get(id);
    if (!run) return null;
    const presented = structuredClone(run);
    if (presented.result) presented.result.report = buildReport(presented.protocol, presented.result.datasets, presented.result.summaries, presented.result.evidence, presented.result.runtime, presented.result.planning, presented.result.literature);
    return {
      schema: 'floracast-research-package/1.0', exportedAt: new Date().toISOString(),
      ...presented,
      instructions: {
        verify: 'Compare result.reproduction.inputHash and outputHash after running the same frozen protocol.',
        disclosure: run.protocol.mode === 'demo' ? 'This package contains fixed demonstration data and is not an empirical result.' : 'This package records live-source manifests; re-fetching may reflect upstream revisions.'
      }
    };
  }

  notebook(id) {
    const run = this.get(id);
    if (!run) return null;
    const presented = structuredClone(run);
    if (presented.result) presented.result.report = buildReport(presented.protocol, presented.result.datasets, presented.result.summaries, presented.result.evidence, presented.result.runtime, presented.result.planning, presented.result.literature);
    return buildNotebook(presented);
  }

  validate(id, observations) {
    const run = this.get(id);
    if (!run) throw Object.assign(new Error('研究任务不存在。'), { status: 404 });
    if (!run.result) throw Object.assign(new Error('研究尚未产生可验证的物候结果。'), { status: 409 });
    run.groundValidation = validateGroundObservations(run.result.summaries?.phenology, observations);
    this.emit(run, { type: 'validation', status: run.groundValidation.status, submitted: run.groundValidation.submitted, comparablePairs: run.groundValidation.comparablePairs });
    return run.groundValidation;
  }

  compare(id) {
    const selected = this.get(id);
    if (!selected) throw Object.assign(new Error('研究任务不存在。'), { status: 404 });
    if (!selected.result) throw Object.assign(new Error('研究尚未完成。'), { status: 409 });
    const rows = [...this.runs.values()].filter((run) => run.status === 'completed' && run.result).slice(-50).map((run) => ({
      id: run.id, isSelected: run.id === id, parentRunId: run.parentRunId || null, protocolHash: run.protocolHash,
      aoi: run.protocol.aoi.name, period: `${run.protocol.period.startYear}–${run.protocol.period.endYear}`, mode: run.protocol.mode,
      meanTemperatureC: run.result.summaries?.power?.meanTemperatureC ?? null,
      ndviChange: run.result.summaries?.vegetation?.change ?? null,
      estimatedYears: run.result.summaries?.phenology?.years?.filter((year) => year.status === 'estimated').length || 0,
      inputHash: run.result.reproduction?.inputHash || null, outputHash: run.result.reproduction?.outputHash || null
    }));
    return { selectedRunId: id, rows, disclosure: '跨运行表仅作描述比较；协议或输入哈希不同的运行不能解释为受控实验。' };
  }

  static stages() {
    return RESEARCH_STAGES;
  }
}

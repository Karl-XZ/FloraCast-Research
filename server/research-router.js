import express from 'express';
import { normalizeProtocol } from './research-core.js';
import { ResearchStore } from './research-store.js';

export function researchRouter(store) {
  const router = express.Router();
  router.get('/capabilities', (_req, res) => res.json({ runtime: store.runtime, openJiuwenIntegrated: store.runtime === 'openjiuwen-workflow', stages: ResearchStore.stages() }));
  router.post('/protocols/validate', (req, res) => res.json({ protocol: normalizeProtocol(req.body) }));
  router.get('/runs', (_req, res) => res.json({ runs: store.list() }));
  router.post('/runs', (req, res) => res.status(202).json(store.create(req.body)));
  router.param('id', (req, res, next, id) => {
    req.run = store.get(id);
    if (!req.run) return res.status(404).json({ error: '研究任务不存在。' });
    next();
  });
  router.get('/runs/:id', (req, res) => res.json(store.package(req.params.id)));
  router.post('/runs/:id/actions', (req, res) => {
    if (req.body.action === 'cancel') return res.json(store.cancel(req.params.id));
    if (req.body.action === 'pause') return res.json(store.pause(req.params.id));
    if (req.body.action === 'resume') return res.json(store.resume(req.params.id));
    return res.status(400).json({ error: '未知操作。' });
  });
  router.post('/runs/:id/reproduce', (req, res) => res.status(202).json(store.reproduce(req.params.id)));
  router.post('/runs/:id/validate', (req, res) => res.json(store.validate(req.params.id, req.body?.observations)));
  router.get('/runs/:id/compare', (req, res) => res.json(store.compare(req.params.id)));
  router.get('/runs/:id/export', (req, res) => {
    const notebook = req.query.format === 'notebook';
    res.attachment(`${req.params.id}.${notebook ? 'ipynb' : 'json'}`);
    res.json(notebook ? store.notebook(req.params.id) : store.package(req.params.id));
  });
  router.get('/runs/:id/events', (req, res) => {
    const cursor = Number(req.get('last-event-id') || req.query.after || 0);
    if (!Number.isInteger(cursor) || cursor < 0) return res.status(400).json({ error: '无效事件游标。' });
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (event) => res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    const stop = store.subscribe(req.params.id, send);
    req.run.events.filter((event) => event.id > cursor).forEach(send);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    res.on('close', () => { clearInterval(heartbeat); stop(); });
  });
  router.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message, field: error.field || null }));
  return router;
}

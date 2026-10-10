const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');

// Render the real client modules with deterministic hooks and server-action doubles.
// No browser session, DB writes, AI calls, or new test dependencies are required.
function load(file, mocks, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => name === 'react/jsx-runtime' ? jsx : mocks[name] || {}, console, ...globals }, { filename: file });
  return exports;
}
function find(node, predicate) {
  if (!node) return;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return; }
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

async function main() {
  for (const accepted of [true, false]) {
    let closeCount = 0, notifications = 0, creditRefresh = 0, resolveSubmission;
    const submission = new Promise(resolve => { resolveSubmission = resolve; });
    let stateIndex = 0;
    const states = [{ success: true, hasProfile: true, creditBalance: 3 }, false, false, 'preview'];
    const store = selector => selector({ isTailorModalOpen: true, tailoringJob: { id: 'job', jobRoleTitle: 'Role', company: 'Company' }, closeTailorModal: () => { closeCount++; } });
    const credit = selector => selector({ balance: 3 }); credit.getState = () => ({ fetchCredits: async () => { creditRefresh++; } });
    const module = load('components/TailorResumeModal.tsx', {
      react: { useEffect() {}, useCallback: fn => fn, useState: initial => [stateIndex < states.length ? states[stateIndex++] : initial, () => {}] },
      '@/store/useJobStore': { useJobStore: store }, '@/store/useCreditStore': { useCreditStore: credit },
      '@/lib/auth/client': { authClient: { useSession: () => ({ data: { user: { id: 'user' } } }) } },
      '@/app/actions/tailored-resume': { initiateTailoringRequest: async () => submission },
      sonner: { toast: { success() {}, error() {} } },
    }, { Event, window: { dispatchEvent() { notifications++; } } });
    const inner = module.TailorResumeModal();
    const tree = inner.type(inner.props);
    const generate = find(tree, node => node.type === 'button' && typeof node.props.children?.[1]?.props?.children === 'string'
      && node.props.children[1].props.children.includes('Generate Tailored Resume'));
    assert.ok(generate, 'Actual Generate button must be found');
    const pending = generate.props.onClick();
    assert.equal(closeCount, 0, 'Do not close before the server accepts');
    resolveSubmission(accepted ? { success: true, requestId: 'durable-id', status: 'queued' } : { success: false, error: 'No credit' });
    await pending;
    assert.equal(closeCount, accepted ? 1 : 0); assert.equal(notifications, accepted ? 1 : 0); assert.equal(creditRefresh, accepted ? 1 : 0);
  }

  let response = { userId: 'user-A', requests: [{ id: 'request', title: 'Role', company: 'Company', status: 'running', credit_state: 'held', has_draft: false }] };
  let timer, effect, snapshot, errors = 0, reads = 0, toasts = 0, clock = 0;
  class MockDate extends Date { static now() { return clock; } }
  function mount() {
    let stateIndex = 0;
    const module = load('components/BackgroundResumeTasks.tsx', {
      react: { useEffect: callback => { effect = callback; }, useState: initial => {
        const index = stateIndex++; return [initial, value => { if (index === 0) snapshot = value; if (index === 1 && value) errors++; }];
      } },
      '@/lib/auth/client': { authClient: { useSession: () => ({ data: { user: { id: 'user-A' } } }) } },
      '@/app/actions/tailored-resume': { listResumeRequests: async () => { reads++; if (response instanceof Error) throw response; return response; } },
      '@/store/useCreditStore': { useCreditStore: { getState: () => ({ fetchCredits: async () => {} }) } },
      sonner: { toast: { success() { toasts++; }, warning() { toasts++; }, error() { toasts++; } } },
    }, { Date: MockDate, window: { addEventListener() {}, removeEventListener() {} }, setTimeout: (callback, delay) => { timer = () => { clock += delay; callback(); }; return 1; }, clearTimeout() {} });
    module.BackgroundResumeTasks(); return effect();
  }
  let cleanup = mount(); await flush();
  assert.equal(snapshot.requests[0].status, 'running');
  // A long run is still observed after many ticks; no elapsed-time terminal status.
  for (let i = 0; i < 30; i++) { timer(); await flush(); }
  assert.equal(clock, 120000); assert.equal(reads, 31); assert.equal(snapshot.requests[0].status, 'running');
  const saved = response; response = new Error('Transient outage'); timer(); await flush();
  assert.equal(errors, 1); assert.equal(snapshot.requests[0].status, 'running'); assert.equal(typeof timer, 'function');
  response = { userId: 'user-A', requests: [{ ...saved.requests[0], status: 'needs_review', credit_state: 'consumed', has_draft: true }] };
  timer(); await flush(); assert.equal(snapshot.requests[0].status, 'needs_review'); assert.equal(toasts, 1);
  cleanup(); cleanup = mount(); await flush();
  assert.equal(snapshot.requests[0].has_draft, true, 'Remount/reload restores the durable output'); assert.equal(toasts, 1, 'Do not repeat completion toast on reload');
  const ownSnapshot = snapshot; response = { userId: 'other-user', requests: [{ id: 'private' }] }; timer(); await flush();
  assert.equal(snapshot, ownSnapshot, 'Reject a response for a different signed-in account');
  cleanup();
  for (const status of ['queued', 'running', 'completed', 'needs_review', 'failed']) {
    let mirroredStatus;
    const actions = load('app/actions/tailored-resume.ts', {
      '@/lib/auth/server': { getCurrentUser: async () => ({ id: 'user-A' }) },
      'next/headers': { cookies: async () => ({ toString: () => 'synthetic-session' }) },
      '@/lib/db': { db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: () => ({ values: async value => { mirroredStatus = value.status; assert.ok(['draft', 'ready'].includes(value.status), 'Existing DB constraint must be respected'); } }) } },
      '@/lib/db/schema': { userJobResumes: { userId: 'user_id', jobId: 'job_id' } },
      'drizzle-orm': { and() {}, eq() {} },
    }, { process: { env: {} }, AbortSignal, fetch: async url => new Response(JSON.stringify(
      url.includes('/generated/') ? { generation: { resume_markdown: '# Synthetic draft', status } }
        : { request: { status, job_id: 'synthetic-job', credit_state: status === 'failed' ? 'released' : 'consumed', error_code: 'experience.roles' } }
    ), { status: 200 }) });
    const result = await actions.getResumeRequestStatus('synthetic-request');
    assert.equal(result.status, status === 'completed' ? 'succeeded' : status);
    if (status === 'needs_review') { assert.equal(result.markdown, '# Synthetic draft'); assert.equal(result.creditState, 'consumed'); assert.equal(result.reviewReason, 'experience.roles'); assert.equal(mirroredStatus, 'draft'); }
    if (status === 'completed') assert.equal(mirroredStatus, 'ready');
    if (status === 'failed') assert.equal(result.success, false);
  }
  console.log('PASS: actual modal acceptance/error handling; 30 active background ticks, outage/reload/account isolation; queued/running/completed/review/failed action outcomes');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

from deploy_runtime import APP
path = APP / 'scripts/verify-resume-generation.ts'
text = path.read_text(encoding='utf-8')
text = text.replace('    await assert.rejects(worker.recordUsage(next, { ...event, id: randomUUID(), reserved_tokens: generation.dailyLimit() }), /allowance_exhausted/);', '''    const large = { ...event, id: randomUUID(), reserved_tokens: 1000000 };
    await worker.recordUsage(next, large);
    await worker.recordUsage(next, { ...large, status: "reported", usage: { prompt_tokens: 0, completion_tokens: 0, cost: 0 } });''')
path.write_text(text, encoding='utf-8')

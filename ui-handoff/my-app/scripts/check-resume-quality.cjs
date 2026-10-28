const assert=require('node:assert/strict');const {load}=require('./load-ts.cjs');
const {resumeReviewReason,resumeReviewError,resumeDigest}=load('lib/resume-review.ts');
assert.equal(typeof resumeReviewError,'function');assert.equal(typeof resumeDigest,'function');
const message=resumeReviewReason({error:'experience.metric_count, length.word_count'});
assert(message.includes('source-backed'));assert(message.includes('resume length'));assert(!message.includes('metric_count'));
assert.equal(resumeReviewReason({}),null);
assert(!resumeReviewReason({error:'internal.private_code'}).includes('internal.private_code'));
assert.equal(resumeReviewReason({compliance_ledger:[{code:'length.word_count',passed:true}]}),null);
console.log('RESUME_QUALITY_UI_PASSED');

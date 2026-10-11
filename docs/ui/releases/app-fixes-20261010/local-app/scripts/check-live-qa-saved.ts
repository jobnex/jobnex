import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadAvailableGeneration} from "../../../../resume-quality-review/heading-web-build/lib/resume-tailoring";
import {pool} from "../lib/db";
async function main(){
 const request=JSON.parse(readFileSync("../../../resume-quality-review/authorized-live-request.json","utf8"));
 const userId="96419deb-a030-4ac8-9f20-22a90cef6026";
 const saved=await loadAvailableGeneration(userId,request.id);
 assert.ok(saved?.resume_markdown.trim(),"saved draft unavailable through production helper");
 const latest=await pool.query(`SELECT g.id FROM resume_generations g
  JOIN resume_generation_requests r ON r.id=g.id AND r.user_id=g.user_id
  WHERE g.user_id=$1 AND g.job_id=$2 AND g.job_id=r.job_id AND g.base_resume_id=r.base_resume_id
   AND ((r.status='completed' AND r.credit_state='consumed' AND g.status IN ('completed','completed_with_estimates'))
    OR (r.status='needs_review' AND r.credit_state IN ('consumed','released') AND g.status='needs_review'))
   AND length(trim(g.resume_markdown))>0 ORDER BY r.created_at DESC LIMIT 1`,[userId,saved.job_id]);
 assert.equal(latest.rows[0]?.id,request.id,"latest job draft does not select test result");
 console.log(JSON.stringify({requestId:request.id,savedDraftAvailable:true,latestJobDraftAvailable:true,status:saved.status}));
}
main().catch(e=>{console.error(e?.message);process.exitCode=1}).finally(()=>pool.end());

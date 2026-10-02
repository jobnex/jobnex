import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const read=p=>readFileSync(p,'utf8');
const config=read('terraform/main.tf'),docker=read('Dockerfile'),doc=read('README.md'),store=read('src/store.rs'),main=read('src/main.rs');
for(const fragment of ['google_compute_backend_service','EXTERNAL_MANAGED','SERVERLESS','INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER','secret_key_ref','max_instance_request_concurrency','max_instance_count','enable_cdn','google_compute_managed_ssl_certificate'])assert.ok(config.includes(fragment),fragment);
assert.ok(/enable_cdn\s*=\s*false/.test(config));
assert.ok(docker.includes('cargo build --release --locked'));
assert.ok(!docker.includes('--features local-test'));
assert.ok(docker.includes('USER 10001:10001'));
assert.ok(docker.includes('typst:0.15.1'));
assert.ok(!/FROM python|COPY web|CMD.*python/i.test(docker));
for(const name of ['DATABASE_URL','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','BACKEND_SERVICE_TOKEN'])assert.ok(config.includes(name)&&read('env.example').includes(name));
assert.ok(store.includes('pg_advisory_xact_lock'));assert.ok(store.includes('WHERE user_id=$1 AND job_id=$2'));
assert.ok(store.includes('public.applications'));assert.ok(store.includes('neon_auth'));
assert.ok(main.includes('digest.ct_eq(secret)'));assert.ok(main.includes('Stored PDF integrity check failed'));
for(const text of ['service-to-service','verified session identity','deployed privately','No UI','Real Neon schema access','Liberation fallback','No recompilation','Do not apply a blanket R2 expiration'])assert.ok(doc.toLowerCase().includes(text.toLowerCase()),text);
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
assert.ok(walk('src').every(p=>p.endsWith('.rs')));
assert.ok(!existsSync('web'));
// Parse/format HCL using the official Terraform binary if provisioned locally.
const terraform=process.env.TERRAFORM_BIN||path.resolve('.tools/terraform/terraform.exe');
assert.ok(existsSync(terraform),'Official Terraform syntax checker required');
const fmt=spawnSync(terraform,['fmt','-check','-recursive','terraform'],{encoding:'utf8'});
assert.equal(fmt.status,0,fmt.stdout+fmt.stderr);
const validate=spawnSync(terraform,['-chdir=terraform','validate','-no-color'],{encoding:'utf8'});
assert.equal(validate.status,0,validate.stdout+validate.stderr);
console.log('BACKEND_CONFIG_VERIFIED');

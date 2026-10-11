import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { Footer } from "../components/Footer";
import { JobHuntSidebar, creditBalanceLabel } from "../components/JobHuntSidebar";
import { currentResumeRequests, isHistoricalResumeRequest } from "../components/BackgroundResumeTasks";
import Privacy from "../app/(main)/privacy/page";
import Terms from "../app/(main)/terms/page";
import Guidelines from "../app/(main)/guidelines/page";
import Contact from "../app/(main)/contact/page";

const footer = renderToStaticMarkup(<Footer />);
assert.ok(!footer.includes('href="#"'), "footer destinations must be real routes");
for (const href of ["/job-hunt", "/privacy", "/terms", "/guidelines", "/contact"]) assert.ok(footer.includes(`href="${href}"`));
for (const Component of [Privacy, Terms, Guidelines, Contact]) {
  const html = renderToStaticMarkup(<Component />);
  assert.match(html, /<h1/);
  assert.match(html, /href="\/job-hunt"/);
}
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} } as any;

const sidebar = renderToStaticMarkup(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/job-hunt"><JobHuntSidebar /></PathnameContext.Provider></AppRouterContext.Provider>);
assert.match(sidebar, /Loading credits/);
assert.equal(creditBalanceLabel(4), "4 available");
assert.equal(creditBalanceLabel(0), "0 available");
assert.equal(creditBalanceLabel(null), "Loading credits...");
assert.ok(!sidebar.includes("/ 200"), "wallet display must not invent a quota");
assert.match(sidebar, /Applications/);
const row = (id: string, job_id: string, status: string) => ({ id, job_id, status, title: "Test role", company: "Fixture", has_draft: status === "completed", credit_state: "released", error_code: null, failureReason: null });
const runs = [row("active-a", "a", "running"), row("active-b", "a", "queued"), row("new-a", "a", "completed"), row("old-a", "a", "failed"), row("new-b", "b", "failed"), row("old-b", "b", "completed")];
assert.deepEqual(currentResumeRequests(runs).map(run => run.id), ["active-a", "active-b", "new-a", "new-b"]);
assert.deepEqual(currentResumeRequests([]), []);
assert.equal(runs.length, 6, "grouping must not delete persisted history");
assert.equal(isHistoricalResumeRequest(runs[2], runs), false, "latest finished draft can be edited");
assert.equal(isHistoricalResumeRequest(runs[3], runs), true, "earlier attempt is view only");
assert.equal(isHistoricalResumeRequest(runs[5], runs), true, "an older saved draft remains view only after a newer failure");
console.log("UI RELEASE PASSED: real resource routes, readable disclosures, available credits, mobile routes, active runs and earlier history.");

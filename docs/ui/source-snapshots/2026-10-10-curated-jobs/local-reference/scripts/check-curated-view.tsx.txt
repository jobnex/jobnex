import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import JobHuntPage from "../app/(main)/job-hunt/page";

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} } as any;
const queryKey = ["matched-jobs", "jobs", "", "24h", "newest", 1, 24];
function render(data?: any) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data) client.setQueryData(queryKey, data);
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <QueryClientProvider client={client}><JobHuntPage /></QueryClientProvider>
    </AppRouterContext.Provider>
  );
  client.clear();
  return html;
}
const loading = render();
assert.match(loading, /aria-label="Curated jobs date window"/);
assert.match(loading, /value="24h" selected=""/);
assert.match(loading, /value="newest" selected=""/);
assert.match(loading, /Added to Joberry/);
assert.ok(!loading.includes("No matching opportunities found"), "loading must not imply zero matches");
const empty = render({ jobs: [], total: 0, totalPages: 1, page: 1, requestedCount: 0 });
assert.match(empty, /No matching roles added in the last 24 hours/);
assert.match(empty, /Check the last 7 days/);
assert.ok(!empty.includes("Pagination Navigation"));
const populated = render({ jobs: [{ id: "fixture", jobRoleTitle: "Backend Developer",
  company: "Fixture Company", type: "Full-time", location: "New York", salary: "",
  jobDescription: "Build services", categories: [], postedAt: new Date().toISOString() }],
  total: 25, totalPages: 2, page: 1, requestedCount: 0 });
assert.match(populated, /Fixture Company/);
assert.match(populated, /Pagination Navigation \(top\)/);
assert.match(populated, /Pagination Navigation \(bottom\)/);
assert.ok(!populated.includes("No matching roles"));
console.log("CURATED VIEW SSR PASSED: default controls, loading, empty/widen action, real result cards and pagination");

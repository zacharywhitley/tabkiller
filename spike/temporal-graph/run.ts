import { GraphStore } from './store.js';
import { buildFixture, fmt, T } from './fixtures.js';
import {
  pagesOpenedFromDomain,
  visitFocusedAt,
  visitsInTagPredatingTag,
  visitsBefore,
  tabTreeForTag,
} from './queries.js';

const g = new GraphStore();
const { nodes, edges } = buildFixture();
for (const n of nodes) g.putNode(n);
for (const e of edges) g.putEdge(e);

const S = 1000;
const M = 60 * S;
const H = 60 * M;

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

console.log('Store loaded:', g.stats());

// -------------------------------------------------------------------
section('Q1  Pages opened from news.ycombinator.com today');
const q1 = pagesOpenedFromDomain(g, 'news.ycombinator.com', 0, 24 * H);
for (const r of q1) {
  console.log(`  ${fmt(r.visit.at_time)}  ${r.page.title}  <- from  ${r.parent_page.title}`);
}
console.log(`  (${q1.length} result${q1.length === 1 ? '' : 's'})`);

// -------------------------------------------------------------------
section('Q2  What was I focused on at various instants');
const probes = [
  9 * H + 2 * M,       // deep in v1 focus
  9 * H + 6 * M,       // v3 focus (in tab2)
  9 * H + 9 * M,       // v2 focus resumed after tab2 close
  10 * H,              // during idle — nothing focused
  11 * H + 3 * M,      // v5 focus after idle
  11 * H + 10 * M,     // v6 focus
];
for (const t of probes) {
  const r = visitFocusedAt(g, t);
  if (!r) {
    console.log(`  ${fmt(t)}  (nothing focused)`);
  } else {
    console.log(`  ${fmt(t)}  visit=${r.visit.id}  page=${r.page?.title ?? '?'}`);
  }
}

// -------------------------------------------------------------------
section("Q3  Visits in session tagged 'wasted-time' that predate the tag");
const q3 = visitsInTagPredatingTag(g, 'wasted-time');
if (q3.length === 0) console.log('  (none)');
for (const r of q3) {
  console.log(
    `  visit ${r.visit.id}  page="${r.page?.title ?? '?'}"  ` +
    `event_time=${fmt(r.visit.at_time)}  tag_applied_at=${fmt(r.tag_applied_at)}`,
  );
}
console.log(`  (${q3.length} visit${q3.length === 1 ? '' : 's'} predate the tag)`);

// -------------------------------------------------------------------
section('Q4  What did I look at in the 60s before v6 (react.dev/reference/hooks)?');
const q4 = visitsBefore(g, 'v6', 60 * S);
if (q4.length === 0) {
  console.log('  (none within window)');
} else {
  for (const r of q4) {
    console.log(`  -${(r.delta_ms / S).toFixed(0)}s  ${r.page?.title ?? '?'}  (${fmt(r.visit.at_time)})`);
  }
}
// Widen the window to test crossing the s1→s2 idle gap
section('Q4b Same, but 3 hours back — should walk across the idle gap');
const q4b = visitsBefore(g, 'v6', 3 * H);
for (const r of q4b) {
  console.log(`  -${(r.delta_ms / M).toFixed(1)}m  ${r.page?.title ?? '?'}  (${fmt(r.visit.at_time)})`);
}

// -------------------------------------------------------------------
section("Q5  Tab tree for session tagged 'react-research'");
const q5 = tabTreeForTag(g, 'react-research');
for (const s of q5) {
  console.log(`  Session ${s.session.id}  [${fmt(s.session.started_at)} .. ${fmt(s.session.ended_at)}]`);
  for (const t of s.tabs) {
    const parent = t.parent_tab_id ? ` (spawned from ${t.parent_tab_id})` : '';
    console.log(`    Tab ${t.tab.id}${parent}`);
    for (const v of t.visits) {
      console.log(`      ${fmt(v.visit.at_time)}  ${v.page?.title ?? '?'}`);
    }
  }
}

section("Q5b Same, for 'wasted-time'");
const q5b = tabTreeForTag(g, 'wasted-time');
for (const s of q5b) {
  console.log(`  Session ${s.session.id}  [${fmt(s.session.started_at)} .. ${fmt(s.session.ended_at)}]`);
  for (const t of s.tabs) {
    const parent = t.parent_tab_id ? ` (spawned from ${t.parent_tab_id})` : '';
    console.log(`    Tab ${t.tab.id}${parent}`);
    for (const v of t.visits) {
      console.log(`      ${fmt(v.visit.at_time)}  ${v.page?.title ?? '?'}`);
    }
  }
}

console.log('\n(done)');

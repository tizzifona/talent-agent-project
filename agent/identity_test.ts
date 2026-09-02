import { assertEquals, assert } from '@std/assert';
import { normalizeRecord } from './normalize.ts';
import { runMatching } from './matcher.ts';
import {
  applyHighTierEnrichment,
  enrichMatchingResults,
  parseYears,
  seniorityFromTitle,
  seniorityFromYears,
} from './enrich.ts';

function load(
  rows: Array<{ file: string; data: Record<string, unknown> }>,
) {
  const byFile = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    if (!byFile.has(row.file)) byFile.set(row.file, []);
    byFile.get(row.file)!.push(row.data);
  }
  return {
    databases: [...byFile.entries()].map(([name, records]) => ({
      name,
      rowCount: records.length,
      records: records.map((record, index) => ({
        ...normalizeRecord(record, name),
        sourceDb: name,
        rowIndex: index,
      })),
    })),
  };
}

Deno.test('source IDs merge across files of the same BD5 source, not across BD5/BD6', () => {
  const results = runMatching(
    load([
      { file: '5) Talent Main View A.xlsx', data: { 'Talent ID': 'TAL217', 'First Name': 'Andrii', 'Last Name': 'Koval', Email: 'a@example.com' } },
      { file: '5) Talent Main View B.xlsx', data: { 'Talent ID': 'TAL217', 'First Name': 'Andrii', 'Last Name': 'Kovalenko' } },
      { file: "6) Blue Hope Contacts - Na'amal.csv", data: { profile_id: 'TAL217', 'First Name': 'Other', 'Last Name': 'Person', Email: 'other@example.com' } },
    ]),
    { fuzzyThreshold: 85 },
  );
  const andrii = results.persons.find((p) => p.primaryEmail === 'a@example.com');
  const other = results.persons.find((p) => p.primaryEmail === 'other@example.com');
  assert(andrii);
  assert(other);
  assertEquals(andrii.records.length, 2);
  assertEquals(andrii.matchType, 'source-id');
  assertEquals(other.records.length, 1);
});

Deno.test('same Talent ID in two source-5 files without email still merges', () => {
  const results = runMatching(
    load([
      { file: '5) Talent A.csv', data: { 'Talent ID': 'TAL99', 'First Name': 'Olena', 'Last Name': 'Shevchenko' } },
      { file: '5) Talent B.csv', data: { 'Talent ID': 'TAL99', 'First Name': 'Olena', 'Last Name': 'Shevchenko' } },
    ]),
    { fuzzyThreshold: 85 },
  );
  const people = results.persons.filter((p) => !p.heldOut);
  assertEquals(people.length, 1);
  assertEquals(people[0].matchType, 'source-id');
  assertEquals(people[0].records.length, 2);
});

Deno.test('test placeholder rows are held out and do not merge on email', () => {
  const results = runMatching(
    load([
      { file: '5) Talent.csv', data: { 'First Name': 'Test', Email: 'shared@example.com' } },
      { file: '6) Contacts.csv', data: { 'First Name': 'Maria', 'Last Name': 'Lopez', Email: 'shared@example.com' } },
    ]),
    { fuzzyThreshold: 85 },
  );
  assertEquals(results.heldOut, 1);
  assertEquals(results.persons.length, 1);
  assertEquals(results.persons[0].primaryName, 'Maria Lopez');
  assertEquals(results.heldOutPersons[0].needsReview, true);
  assert(String(results.heldOutPersons[0].reviewReason).includes('test'));
});

Deno.test('fuzzy attach keeps high confidence on the email-anchored field', () => {
  const results = runMatching(
    load([
      {
        file: '5) Talent.csv',
        data: {
          'First Name': 'Alvaro',
          'Last Name': 'Garcia',
          Email: 'alvaro@example.com',
          'Country of Residence': 'Spain',
          'Application Date': '2024-03-01',
        },
      },
      {
        file: '2) Student Information.csv',
        data: {
          'Student Name': 'Alvaro Garcia',
          'Country of Residence': 'Spain',
          'Application Date': '2024-04-01',
        },
      },
    ]),
    { fuzzyThreshold: 80 },
  );
  const person = results.persons.find((p) => p.primaryEmail === 'alvaro@example.com');
  assert(person);
  assertEquals(person.matchConfidence, 'high');
  assertEquals(person.fieldProvenance.email.match_confidence, 'high');
  assertEquals(person.records.length, 2);
});

Deno.test('fuzzy match into a flagged node escalates instead of skipping', () => {
  const results = runMatching(
    load([
      {
        file: '5) Talent.csv',
        data: {
          'First Name': 'Anna',
          'Last Name': 'Koval',
          Phone: '+380971112233',
          'Country of Residence': 'Ukraine',
          'Application Date': '2024-02-01',
        },
      },
      {
        file: '6) Contacts.csv',
        data: {
          'First Name': 'Hanna',
          'Last Name': 'Koval',
          Phone: '+380971112233',
          'Country of Residence': 'Ukraine',
          'Application Date': '2024-02-10',
        },
      },
      {
        file: '1) OG - early.csv',
        data: {
          'First Name': 'Anna',
          'Last Name': 'Koval',
          Email: 'anna.k@example.com',
          'Country of Residence': 'Ukraine',
          'Application Date': '2024-03-01',
        },
      },
    ]),
    { fuzzyThreshold: 80 },
  );
  const incoming = [...results.persons, ...results.heldOutPersons].find((p) =>
    p.primaryEmail === 'anna.k@example.com' && p.needsReview
  );
  assert(incoming);
  assertEquals(incoming.matchType, 'manual-review');
  assert(String(incoming.reviewReason).includes('flagged node'));
});

Deno.test('high-tier skill tags copy structured fields and skip prose', () => {
  const person = {
    unified: {
      technical_skills: 'Python | SQL',
      key_skills: 'Facilitation',
      work_experience_summary: 'Built a React platform',
    },
  };
  applyHighTierEnrichment(person);
  assertEquals(person.skillTags, 'Python | SQL | Facilitation');
  assertEquals(person.enrichment?.skill_tags?.confidence_tier, 'high');
  assertEquals(person.enrichment?.skill_tags?.source, 'original_data');
  assertEquals(person.seniority, undefined);
});

Deno.test('high-tier seniority maps title first, then years; never sets employment', () => {
  assertEquals(seniorityFromTitle('Senior Software Engineer'), 'Senior');
  assertEquals(seniorityFromYears(7), 'Senior');
  assertEquals(parseYears('5+ years'), 5);

  const fromTitle = { unified: { job_title: 'Junior Designer', years_of_experience: '12' } };
  applyHighTierEnrichment(fromTitle);
  assertEquals(fromTitle.seniority, 'Junior');
  assertEquals(fromTitle.enrichment?.seniority?.inference_basis, 'job_title');

  const fromYears = { unified: { years_of_tech_experience: '3' } };
  applyHighTierEnrichment(fromYears);
  assertEquals(fromYears.seniority, 'Mid-level');
  assertEquals(fromYears.enrichment?.seniority?.inference_basis, 'years_of_tech_experience');

  const empty = { unified: { work_experience_summary: 'Led large teams across Europe' } };
  applyHighTierEnrichment(empty);
  assertEquals(empty.seniority, undefined);
  assertEquals((empty as { employmentStatus?: string }).employmentStatus, undefined);
});

Deno.test('enrichMatchingResults fills skill_tags on matched persons', () => {
  const results = enrichMatchingResults(runMatching(
    load([
      {
        file: '5) Talent.csv',
        data: {
          'First Name': 'Nour',
          Email: 'nour@example.com',
          'Top Technical Skills': 'JavaScript',
          'Years of Experience': '6',
        },
      },
    ]),
    { fuzzyThreshold: 85 },
  ));
  const person = results.persons[0];
  assertEquals(person.skillTags, 'JavaScript');
  assertEquals(person.seniority, 'Senior');
  assertEquals(person.enrichment?.skill_tags?.confidence_tier, 'high');
});

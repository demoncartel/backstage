// Generates demo/repos (Acme Bank sample content). Usage, from the repo root: node demo/generate-repos.mjs .
// Edit the data below, then re-run. demo/repos is overwritten file by file.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(process.argv[2], 'demo', 'repos');
const write = (rel, text) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text.replace(/^\n/, ''), 'utf8');
};
const FOOTER = '*Fictional demo content for the Acme Bank developer portal.*\n';

const component = c => `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: ${c.name}
  title: ${JSON.stringify(c.title)}
  description: ${JSON.stringify(c.description)}
  annotations:
    github.com/project-slug: __ORG__/${c.name}${c.docs ? '\n    backstage.io/techdocs-ref: dir:.' : ''}
  tags: [${c.tags.join(', ')}]
spec:
  type: ${c.type}
  lifecycle: ${c.lifecycle ?? 'production'}
  owner: group:${c.owner}
  system: ${c.system}${c.provides ? `\n  providesApis: [${c.provides.join(', ')}]` : ''}${c.consumes ? `\n  consumesApis: [${c.consumes.join(', ')}]` : ''}${c.dependsOn ? `\n  dependsOn: [${c.dependsOn.map(d => `resource:${d}`).join(', ')}]` : ''}
`;

const apiEntity = (a, c) => `---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: ${a.name}
  title: ${JSON.stringify(a.title)}
  description: ${JSON.stringify(a.description)}
  tags: [${a.tags.join(', ')}]
spec:
  type: openapi
  lifecycle: production
  owner: group:${c.owner}
  system: ${c.system}
  definition:
    $text: ./openapi.yaml
`;

const openapi = a => {
  const paths = a.paths
    .map(
      ([method, path, summary, codes]) => `  ${path}:
    ${method}:
      summary: ${summary}${path.includes('{id}') ? "\n      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]" : ''}
      responses: { ${codes} }`,
    )
    .join('\n');
  return `openapi: 3.0.3
info: { title: ${a.title}, version: ${a.version}, description: '${a.description} (fictional)' }
paths:
${paths}
`;
};

const resource = r => `---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: ${r.name}
  title: ${JSON.stringify(r.title)}
  description: ${JSON.stringify(r.description)}
  tags: [${r.tags.join(', ')}]
spec:
  type: ${r.type}
  owner: group:${r.owner}
  system: ${r.system}
`;

const services = [
  {
    name: 'customer-web-app', title: 'Customer web app', type: 'website', owner: 'team-customer', system: 'customer',
    description: 'The Acme Bank web banking app customers sign in to.', tags: ['react', 'pii'],
    consumes: ['onboarding-api', 'accounts-api', 'payments-api'],
    readme: ['Customer-facing web banking app (React).', 'Signs customers in, shows balances and statements, and starts payments through the public APIs.'],
  },
  {
    name: 'onboarding-service', title: 'Onboarding service', type: 'service', owner: 'team-customer', system: 'customer',
    description: 'Opens new customer accounts and runs KYC (identity and AML checks).', tags: ['kotlin', 'pii', 'kyc'],
    consumes: ['accounts-api', 'notifications-api'],
    api: {
      name: 'onboarding-api', title: 'Onboarding API', version: '1.4.0', description: 'Start and track a customer application.', tags: ['rest', 'pii'],
      paths: [
        ['post', '/applications', 'Start an application', "'201': { description: Created }"],
        ['get', '/applications/{id}', 'Get application status (pending, kyc_review, approved, rejected)', "'200': { description: Application }"],
      ],
    },
    readme: ['Opens new accounts and runs KYC.', 'Calls the identity-verification vendor, screens against sanctions lists, then asks accounts-service to open the account.'],
    docs: {
      overview: 'Opens customer accounts. An application moves through **pending → kyc_review → approved/rejected**. Identity checks call an external verification vendor, and AML screening runs on every application and again nightly.',
      runbook: [['KycVendorErrorRate', 'Verification vendor failing', 'Check the vendor status page; applications queue and retry automatically'], ['ApplicationsStuckInReview', 'Manual review backlog over 4 hours', 'Page the operations on-call to add reviewers']],
    },
  },
  {
    name: 'accounts-service', title: 'Accounts service', type: 'service', owner: 'team-accounts', system: 'accounts',
    description: 'Current accounts, balances and account holders.', tags: ['java', 'pii', 'sox'],
    consumes: ['ledger-api'], dependsOn: ['accounts-db'],
    api: {
      name: 'accounts-api', title: 'Accounts API', version: '2.1.0', description: 'Read accounts and balances; open and close accounts.', tags: ['rest', 'pii'],
      paths: [
        ['get', '/accounts/{id}', 'Get an account', "'200': { description: Account }"],
        ['get', '/accounts/{id}/balance', 'Get the available and ledger balance', "'200': { description: Balance }"],
      ],
    },
    readme: ['Current accounts and balances (Java).', 'Balances are derived from the ledger; this service never moves money itself.'],
  },
  {
    name: 'ledger-service', title: 'Ledger service', type: 'service', owner: 'team-accounts', system: 'accounts',
    description: 'Double-entry ledger, the single source of truth for money movements.', tags: ['go', 'sox'],
    dependsOn: ['ledger-db', 'event-bus'],
    api: {
      name: 'ledger-api', title: 'Ledger API', version: '3.0.0', description: 'Post balanced journal entries and read account history.', tags: ['rest', 'sox'],
      paths: [
        ['post', '/journal-entries', 'Post a balanced journal entry (debits must equal credits)', "'201': { description: Posted }, '422': { description: Unbalanced entry }"],
        ['get', '/accounts/{id}/entries', 'List entries for an account', "'200': { description: Entries }"],
      ],
    },
    readme: ['Double-entry ledger (Go).', 'Every money movement is a balanced journal entry. Entries are immutable; corrections are new entries.'],
    docs: {
      overview: 'The ledger records every money movement as an immutable, balanced journal entry. It is **SOX-relevant**: changes need two approvals, and entries are never updated or deleted.',
      runbook: [['LedgerImbalance', 'Daily trial balance is not zero', 'Stop the end-of-day job and page team-accounts; never fix entries by hand'], ['JournalPostLatencyHigh', 'p99 over 300 ms', 'Check ledger-db replication lag']],
    },
  },
  {
    name: 'statements-service', title: 'Statements service', type: 'service', owner: 'team-accounts', system: 'accounts',
    description: 'Generates monthly PDF statements from ledger history.', tags: ['python', 'pii'],
    consumes: ['ledger-api', 'notifications-api'],
    readme: ['Monthly statements (Python).', 'Runs on the 1st of each month, renders PDFs and notifies customers.'],
  },
  {
    name: 'payments-service', title: 'Payments service', type: 'service', owner: 'team-payments', system: 'payments',
    description: 'Sends outgoing payments (Faster Payments, SEPA) and books them to the ledger.', tags: ['java', 'pii'],
    consumes: ['accounts-api', 'ledger-api', 'fraud-api', 'notifications-api'], dependsOn: ['payments-db', 'event-bus'],
    api: {
      name: 'payments-api', title: 'Payments API', version: '1.9.0', description: 'Create and track outgoing payments.', tags: ['rest', 'pii'],
      paths: [
        ['post', '/payments', 'Create a payment (idempotent with the Idempotency-Key header)', "'202': { description: Accepted }, '409': { description: Duplicate key }"],
        ['get', '/payments/{id}', 'Get payment status', "'200': { description: Payment }"],
      ],
    },
    readme: ['Outgoing payments (Java).', 'Checks the balance, asks fraud-detection-service for a decision, books the movement to the ledger and submits it to the payment scheme.'],
    docs: {
      overview: 'Flow: **balance check → fraud decision → ledger booking → scheme submission**. Every request needs an Idempotency-Key, so retries never send money twice.',
      runbook: [['SchemeSubmissionFailures', 'Payments are not reaching the scheme', 'Check the scheme gateway status; payments stay queued'], ['FraudDecisionTimeouts', 'fraud-api is slow', 'Payments fall back to manual review; page team-payments']],
    },
  },
  {
    name: 'fraud-detection-service', title: 'Fraud detection service', type: 'service', owner: 'team-payments', system: 'payments',
    description: 'Scores payments and card transactions for fraud in real time.', tags: ['python', 'ml', 'pci'],
    dependsOn: ['event-bus'],
    api: {
      name: 'fraud-api', title: 'Fraud API', version: '1.2.0', description: 'Returns allow, review or block for a transaction.', tags: ['rest'],
      paths: [['post', '/decisions', 'Score a transaction; returns allow, review or block', "'200': { description: Decision }"]],
    },
    readme: ['Real-time fraud scoring (Python, ML).', "Must answer within 150 ms; callers treat a timeout as 'review'."],
  },
  {
    name: 'card-service', title: 'Card service', type: 'service', owner: 'team-payments', system: 'payments',
    description: 'Issues debit cards and authorises card transactions. In PCI DSS scope.', tags: ['java', 'pci', 'pii'],
    consumes: ['accounts-api', 'ledger-api', 'fraud-api'], dependsOn: ['card-vault'],
    api: {
      name: 'cards-api', title: 'Cards API', version: '1.0.0', description: 'Issue, freeze and replace cards. Never returns full card numbers.', tags: ['rest', 'pci'],
      paths: [
        ['post', '/cards', 'Issue a card', "'201': { description: Card issued }"],
        ['post', '/cards/{id}/freeze', 'Freeze a card', "'204': { description: Frozen }"],
      ],
    },
    readme: ['Debit cards (Java). **In PCI DSS scope.**', 'Full card numbers live only in the card vault; this service handles tokens.'],
  },
  {
    name: 'api-gateway', title: 'API gateway', type: 'service', owner: 'team-platform', system: 'platform',
    description: 'Public entry point. Authenticates customers and routes to internal APIs.', tags: ['envoy'],
    consumes: ['onboarding-api', 'accounts-api', 'payments-api', 'cards-api'],
    readme: ['Public API gateway (Envoy).', 'Terminates TLS, validates customer tokens and applies rate limits before routing.'],
  },
  {
    name: 'notification-service', title: 'Notification service', type: 'service', owner: 'team-platform', system: 'platform',
    description: 'Sends push, email and SMS messages to customers.', tags: ['node', 'pii'],
    dependsOn: ['event-bus'],
    api: {
      name: 'notifications-api', title: 'Notifications API', version: '1.1.0', description: 'Send a templated message to a customer.', tags: ['rest'],
      paths: [['post', '/messages', 'Send a templated message (push, email or sms)', "'202': { description: Queued }"]],
    },
    readme: ['Customer messaging (Node.js).', 'Templates live in this repo; messages are sent asynchronously from the event bus.'],
  },
  {
    name: 'platform-infrastructure', title: 'Platform infrastructure', type: 'library', owner: 'team-platform', system: 'platform',
    description: "Terraform for Acme Bank's cloud accounts, databases and event bus.", tags: ['terraform'],
    resources: [
      { name: 'ledger-db', title: 'Ledger database', description: 'PostgreSQL with point-in-time recovery and 7-year retention.', tags: ['postgres', 'sox'], type: 'database', owner: 'team-accounts', system: 'accounts' },
      { name: 'accounts-db', title: 'Accounts database', description: 'PostgreSQL holding account and customer records.', tags: ['postgres', 'pii'], type: 'database', owner: 'team-accounts', system: 'accounts' },
      { name: 'payments-db', title: 'Payments database', description: 'PostgreSQL holding payment instructions and status.', tags: ['postgres', 'pii'], type: 'database', owner: 'team-payments', system: 'payments' },
      { name: 'card-vault', title: 'Card vault', description: 'Tokenisation vault, the only store of full card numbers.', tags: ['pci'], type: 'vault', owner: 'team-payments', system: 'payments' },
      { name: 'event-bus', title: 'Event bus', description: 'Kafka cluster carrying payment, ledger and notification events.', tags: ['kafka'], type: 'message-queue', owner: 'team-platform', system: 'platform' },
    ],
    readme: ['Terraform for shared infrastructure.', 'Databases, the card vault and the event bus are defined here and listed as Resources in the portal.'],
    docs: {
      overview: "Terraform for Acme Bank's cloud accounts. Each database and the event bus is a **Resource** in the portal, so you can see which services depend on it before you change it.",
      runbook: [['Database parameter change', 'Affects every dependent service', 'Plan in staging first; owners of dependent services must approve'], ['Card vault change', 'PCI DSS scope', 'Needs PCI change approval and two reviewers']],
    },
  },
];

for (const s of services) {
  let catalog = component({ ...s, provides: s.api ? [s.api.name] : undefined });
  if (s.api) {
    catalog += apiEntity(s.api, s);
    write(`${s.name}/openapi.yaml`, openapi(s.api));
  }
  for (const r of s.resources ?? []) catalog += resource(r);
  write(`${s.name}/catalog-info.yaml`, catalog);
  write(`${s.name}/README.md`, `# ${s.name}\n\n${s.readme[0]}\n\n${s.readme[1]}\n\n${FOOTER}`);
  if (s.docs) {
    write(`${s.name}/mkdocs.yml`, `site_name: ${s.title}\nnav:\n  - Overview: index.md\n  - Runbook: runbook.md\nplugins:\n  - techdocs-core\n`);
    write(`${s.name}/docs/index.md`, `# ${s.title}\n\n${s.docs.overview}\n`);
    const rows = s.docs.runbook.map(([a, b, c]) => `| \`${a}\` | ${b} | ${c} |`).join('\n');
    write(`${s.name}/docs/runbook.md`, `# Runbook\n\n| Alert or change | Meaning | First step |\n| --- | --- | --- |\n${rows}\n`);
  }
}

// Systems live in their own repo.
const systems = [
  ['customer', 'Customer Experience', 'How customers find, join and use Acme Bank: web app, onboarding and KYC.', 'team-customer', ['pii']],
  ['accounts', 'Accounts & Ledger', 'Current accounts, balances, the double-entry ledger and statements.', 'team-accounts', ['pii', 'sox']],
  ['payments', 'Payments & Cards', 'Card issuing, outgoing payments and real-time fraud checks.', 'team-payments', ['pci', 'pii']],
  ['platform', 'Platform', 'Shared infrastructure, the API gateway and notifications.', 'team-platform', []],
];
let sysYaml = "# Acme Bank's systems. Components in other repos join one with spec.system.\n";
sysYaml += systems
  .map(([name, title, description, owner, tags], i) => `${i ? '---\n' : ''}apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: ${name}
  title: ${JSON.stringify(title)}
  description: ${JSON.stringify(description)}
  tags: [${tags.join(', ')}]
spec:
  owner: group:${owner}
`)
  .join('');
sysYaml += '---\n' + component({
  name: 'software-catalog', title: 'Software catalog', type: 'documentation', owner: 'team-platform', system: 'platform',
  description: "Defines Acme Bank's systems for the developer portal.", tags: ['catalog'],
});
write('software-catalog/catalog-info.yaml', sysYaml);
write('software-catalog/README.md', `# software-catalog\n\nDefines Acme Bank's **systems** (Customer Experience, Accounts & Ledger, Payments & Cards, Platform) for the developer portal. Each service repo says which system it belongs to in its own \`catalog-info.yaml\`.\n\n${FOOTER}`);

console.log('generated', services.length + 1, 'repos');

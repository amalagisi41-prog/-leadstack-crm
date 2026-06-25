import "server-only";

import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";

/**
 * Demo-data seeder for the LeadStack public demo only.
 *
 * Targets sub-account #1004 by accountNumber. Generates 300 contacts (200
 * jittered around central London, 100 spread across major world cities),
 * ~80 deals across pipeline stages, and a sprinkle of activities so the
 * dashboard map, KPI cards, pipeline snapshot, and activity timelines all
 * show realistic data.
 *
 * Every seeded contact is tagged "seed" so unseedDemo() can find and
 * remove them later (along with their subcollections + referencing deals).
 *
 * Gated to the LeadStack demo at the API-route layer via LANDING_VARIANT
 * === "leadstack". Buyer clones never reach this code.
 */

const TARGET_ACCOUNT_NUMBER = 1004;
const SEED_TAG = "seed";

const FIRST_NAMES = [
  "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael",
  "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan",
  "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Christopher",
  "Nancy", "Daniel", "Lisa", "Matthew", "Margaret", "Anthony", "Sandra",
  "Mark", "Ashley", "Donald", "Kimberly", "Steven", "Emily", "Paul", "Donna",
  "Andrew", "Michelle", "Joshua", "Carol", "Kenneth", "Amanda", "Kevin",
  "Melissa", "Brian", "Deborah", "Edward", "Stephanie", "Ronald", "Rebecca",
  "Priya", "Aarav", "Ananya", "Arjun", "Yuki", "Hiroshi", "Wei", "Mei",
  "Mohammed", "Fatima", "Ahmed", "Aisha", "Carlos", "Sofia", "Diego",
  "Isabella", "Sebastien", "Camille", "Lukas", "Hannah",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams",
  "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter",
  "Roberts", "Patel", "Kumar", "Singh", "Tanaka", "Sato", "Chen", "Wang",
  "Al-Hassan", "Khan", "Rossi", "Bianchi", "Müller", "Schmidt", "Dubois",
  "Petit", "Andersson", "Nilsson",
];

const COMPANIES = [
  "Acme Logistics", "Globex Capital", "Initech Systems", "Umbrella Health",
  "Wayne Industries", "Stark Innovations", "Hooli", "Pied Piper",
  "Cyberdyne Robotics", "Tyrell Bio", "Aperture Labs", "Soylent Foods",
  "Massive Dynamic", "Veridian Dynamics", "Vandelay Imports", "Dunder Mifflin",
  "Wonka Sweets", "Oscorp", "LexCorp", "Bluth Properties", "Strickland Propane",
  "Bing Translations", "Lumon Industries", "Pendant Publishing",
];

const SOURCES = ["website", "referral", "ads", "other"] as const;

interface CityEntry {
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  phoneCode: string;
}

const WORLD_CITIES: CityEntry[] = [
  { city: "New York", country: "United States", countryCode: "US", lat: 40.7128, lng: -74.006, phoneCode: "+1212" },
  { city: "San Francisco", country: "United States", countryCode: "US", lat: 37.7749, lng: -122.4194, phoneCode: "+1415" },
  { city: "Los Angeles", country: "United States", countryCode: "US", lat: 34.0522, lng: -118.2437, phoneCode: "+1213" },
  { city: "Chicago", country: "United States", countryCode: "US", lat: 41.8781, lng: -87.6298, phoneCode: "+1312" },
  { city: "Toronto", country: "Canada", countryCode: "CA", lat: 43.6532, lng: -79.3832, phoneCode: "+1416" },
  { city: "Mexico City", country: "Mexico", countryCode: "MX", lat: 19.4326, lng: -99.1332, phoneCode: "+5255" },
  { city: "Paris", country: "France", countryCode: "FR", lat: 48.8566, lng: 2.3522, phoneCode: "+331" },
  { city: "Berlin", country: "Germany", countryCode: "DE", lat: 52.52, lng: 13.405, phoneCode: "+4930" },
  { city: "Madrid", country: "Spain", countryCode: "ES", lat: 40.4168, lng: -3.7038, phoneCode: "+3491" },
  { city: "Amsterdam", country: "Netherlands", countryCode: "NL", lat: 52.3676, lng: 4.9041, phoneCode: "+3120" },
  { city: "Stockholm", country: "Sweden", countryCode: "SE", lat: 59.3293, lng: 18.0686, phoneCode: "+468" },
  { city: "Dublin", country: "Ireland", countryCode: "IE", lat: 53.3498, lng: -6.2603, phoneCode: "+3531" },
  { city: "Rome", country: "Italy", countryCode: "IT", lat: 41.9028, lng: 12.4964, phoneCode: "+3906" },
  { city: "Tokyo", country: "Japan", countryCode: "JP", lat: 35.6762, lng: 139.6503, phoneCode: "+813" },
  { city: "Singapore", country: "Singapore", countryCode: "SG", lat: 1.3521, lng: 103.8198, phoneCode: "+656" },
  { city: "Hong Kong", country: "Hong Kong", countryCode: "HK", lat: 22.3193, lng: 114.1694, phoneCode: "+8522" },
  { city: "Mumbai", country: "India", countryCode: "IN", lat: 19.076, lng: 72.8777, phoneCode: "+9122" },
  { city: "Bangalore", country: "India", countryCode: "IN", lat: 12.9716, lng: 77.5946, phoneCode: "+9180" },
  { city: "Sydney", country: "Australia", countryCode: "AU", lat: -33.8688, lng: 151.2093, phoneCode: "+612" },
  { city: "Melbourne", country: "Australia", countryCode: "AU", lat: -37.8136, lng: 144.9631, phoneCode: "+613" },
  { city: "Auckland", country: "New Zealand", countryCode: "NZ", lat: -36.8485, lng: 174.7633, phoneCode: "+649" },
  { city: "Dubai", country: "United Arab Emirates", countryCode: "AE", lat: 25.2048, lng: 55.2708, phoneCode: "+9714" },
  { city: "Tel Aviv", country: "Israel", countryCode: "IL", lat: 32.0853, lng: 34.7818, phoneCode: "+9723" },
  { city: "Cape Town", country: "South Africa", countryCode: "ZA", lat: -33.9249, lng: 18.4241, phoneCode: "+2721" },
  { city: "Lagos", country: "Nigeria", countryCode: "NG", lat: 6.5244, lng: 3.3792, phoneCode: "+2341" },
  { city: "Nairobi", country: "Kenya", countryCode: "KE", lat: -1.2864, lng: 36.8172, phoneCode: "+25420" },
  { city: "Sao Paulo", country: "Brazil", countryCode: "BR", lat: -23.5505, lng: -46.6333, phoneCode: "+5511" },
  { city: "Buenos Aires", country: "Argentina", countryCode: "AR", lat: -34.6037, lng: -58.3816, phoneCode: "+5411" },
  { city: "Bogota", country: "Colombia", countryCode: "CO", lat: 4.711, lng: -74.0721, phoneCode: "+571" },
  { city: "Santiago", country: "Chile", countryCode: "CL", lat: -33.4489, lng: -70.6693, phoneCode: "+562" },
];

const LONDON_CENTER = {
  city: "London",
  country: "United Kingdom",
  countryCode: "GB",
  lat: 51.5074,
  lng: -0.1278,
  phoneCode: "+4420",
};

const EMAIL_DOMAINS = [
  "gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com",
  "proton.me", "fastmail.com",
];

// Stable but pseudo-random — we don't need crypto, just variety.
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function jitter(amount: number): number {
  return (Math.random() - 0.5) * amount;
}

function randomPhoneSuffix(): string {
  // 7 digits, padded
  return Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, "0");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

interface SeededContact {
  name: string;
  email: string;
  phone: string;
  company: string;
  source: (typeof SOURCES)[number];
  countryCode: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
}

function makeContact(location: "london" | CityEntry): SeededContact {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const name = `${first} ${last}`;
  const email = `${slugify(first)}.${slugify(last)}${Math.floor(Math.random() * 99)}@${pick(EMAIL_DOMAINS)}`;
  const company = Math.random() < 0.6 ? pick(COMPANIES) : "";
  const source = pick(SOURCES);

  if (location === "london") {
    return {
      name,
      email,
      phone: `${LONDON_CENTER.phoneCode}${randomPhoneSuffix()}`,
      company,
      source,
      countryCode: LONDON_CENTER.countryCode,
      country: LONDON_CENTER.country,
      city: LONDON_CENTER.city,
      // Jitter ~10km around central London
      lat: LONDON_CENTER.lat + jitter(0.18),
      lng: LONDON_CENTER.lng + jitter(0.3),
    };
  }

  return {
    name,
    email,
    phone: `${location.phoneCode}${randomPhoneSuffix()}`,
    company,
    source,
    countryCode: location.countryCode,
    country: location.country,
    city: location.city,
    // Small jitter so multiple contacts in the same city don't overlap exactly
    lat: location.lat + jitter(0.05),
    lng: location.lng + jitter(0.05),
  };
}

/**
 * Resolve the target sub-account by accountNumber. Returns null if no
 * sub-account exists with that number (e.g., the demo hasn't been
 * provisioned yet). Caller should surface a useful error.
 */
async function resolveTargetSubAccount(
  db: Firestore,
): Promise<{ subAccountId: string; agencyId: string } | null> {
  const snap = await db
    .collection("subAccounts")
    .where("accountNumber", "==", TARGET_ACCOUNT_NUMBER)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  return { subAccountId: doc.id, agencyId: data.agencyId as string };
}

export interface SeedResult {
  contactsCreated: number;
  dealsCreated: number;
  activitiesCreated: number;
  subAccountId: string;
}

export async function seedDemo(db: Firestore): Promise<SeedResult> {
  const target = await resolveTargetSubAccount(db);
  if (!target) {
    throw new Error(
      `Sub-account #${TARGET_ACCOUNT_NUMBER} not found. Create it first.`,
    );
  }
  const { subAccountId, agencyId } = target;
  const createdByUid = "demo-seed";

  // Pre-allocate document refs so we can write in batches.
  const contactsToCreate: Array<{
    ref: FirebaseFirestore.DocumentReference;
    data: SeededContact;
  }> = [];

  for (let i = 0; i < 200; i++) {
    contactsToCreate.push({
      ref: db.collection("contacts").doc(),
      data: makeContact("london"),
    });
  }
  for (let i = 0; i < 100; i++) {
    contactsToCreate.push({
      ref: db.collection("contacts").doc(),
      data: makeContact(pick(WORLD_CITIES)),
    });
  }

  // ~80 deals: spread across stages so the dashboard's "Open deals",
  // "Pipeline value", and "Won this month" all populate meaningfully.
  const stageDistribution: Array<{
    stageId: string;
    count: number;
    valueMin: number;
    valueMax: number;
    isTerminal: boolean;
  }> = [
    { stageId: "new", count: 18, valueMin: 500, valueMax: 5000, isTerminal: false },
    { stageId: "contacted", count: 15, valueMin: 1000, valueMax: 8000, isTerminal: false },
    { stageId: "qualified", count: 12, valueMin: 2000, valueMax: 15000, isTerminal: false },
    { stageId: "proposal", count: 8, valueMin: 5000, valueMax: 25000, isTerminal: false },
    { stageId: "won", count: 18, valueMin: 1500, valueMax: 30000, isTerminal: true },
    { stageId: "lost", count: 10, valueMin: 1000, valueMax: 20000, isTerminal: false },
  ];

  const dealsToCreate: Array<{
    ref: FirebaseFirestore.DocumentReference;
    contactRef: FirebaseFirestore.DocumentReference;
    contactData: SeededContact;
    stageId: string;
    value: number;
    isTerminal: boolean;
  }> = [];

  const shuffledContacts = [...contactsToCreate].sort(() => Math.random() - 0.5);
  let contactIdx = 0;
  for (const stage of stageDistribution) {
    for (let i = 0; i < stage.count; i++) {
      if (contactIdx >= shuffledContacts.length) break;
      const c = shuffledContacts[contactIdx++];
      const value =
        stage.valueMin + Math.floor(Math.random() * (stage.valueMax - stage.valueMin));
      dealsToCreate.push({
        ref: db.collection("deals").doc(),
        contactRef: c.ref,
        contactData: c.data,
        stageId: stage.stageId,
        value,
        isTerminal: stage.isTerminal,
      });
    }
  }

  // Activities: every contact gets a form_submitted (since most are
  // "website" sourced anyway, this matches), and contacts with deals get
  // a pipeline_moved. A random ~30% get a note.
  // We write activities as subcollections, so they're created in their
  // own batches by referencing the parent contact ref's collection.

  // ---------- Batch writes ----------
  const BATCH_LIMIT = 400; // Firestore cap is 500; leave headroom.
  let writes = 0;
  let batch = db.batch();
  const now = FieldValue.serverTimestamp();

  // Helper to commit + reset when we approach the limit.
  async function maybeFlush() {
    if (writes >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }

  // Contacts
  for (const c of contactsToCreate) {
    batch.set(c.ref, {
      name: c.data.name,
      email: c.data.email,
      phone: c.data.phone,
      company: c.data.company,
      address: "",
      source: c.data.source,
      tags: [SEED_TAG],
      pipelineStage: null,
      agencyId,
      subAccountId,
      createdByUid,
      emailOptedOut: false,
      smsOptedOut: false,
      countryCode: c.data.countryCode,
      country: c.data.country,
      city: c.data.city,
      lat: c.data.lat,
      lng: c.data.lng,
      createdAt: now,
      updatedAt: now,
    });
    writes++;
    await maybeFlush();
  }

  // Deals
  for (const d of dealsToCreate) {
    batch.set(d.ref, {
      title: d.contactData.company
        ? `${d.contactData.company} deal`
        : `${d.contactData.name} opportunity`,
      value: d.value,
      currency: "USD",
      contactId: d.contactRef.id,
      stageId: d.stageId,
      priority: pick(["high", "medium", "low"] as const),
      agencyId,
      subAccountId,
      createdByUid,
      lostReason: d.stageId === "lost" ? "Budget" : null,
      createdAt: now,
      updatedAt: now,
      stageChangedAt: now,
    });
    writes++;
    await maybeFlush();
  }

  // Activities: form_submitted for every contact
  let activitiesCreated = 0;
  for (const c of contactsToCreate) {
    batch.set(c.ref.collection("activities").doc(), {
      type: "form_submitted",
      content: `Submitted contact form`,
      createdBy: createdByUid,
      meta: {},
      createdAt: now,
    });
    activitiesCreated++;
    writes++;
    await maybeFlush();
  }

  // Activities: pipeline_moved for contacts with deals
  for (const d of dealsToCreate) {
    batch.set(d.contactRef.collection("activities").doc(), {
      type: "pipeline_moved",
      content: `Moved to ${d.stageId}`,
      createdBy: createdByUid,
      meta: { dealId: d.ref.id, stageId: d.stageId },
      createdAt: now,
    });
    activitiesCreated++;
    writes++;
    await maybeFlush();
  }

  // Notes (~30% of contacts)
  const NOTE_SAMPLES = [
    "Followed up via email — waiting on their procurement timeline.",
    "Great call. They want a follow-up next quarter.",
    "Reached out on LinkedIn. No response yet.",
    "Budget confirmed. Sending proposal this week.",
    "Decision-maker is on leave until next month.",
    "Demo scheduled for Tuesday.",
  ];
  for (const c of contactsToCreate) {
    if (Math.random() < 0.3) {
      batch.set(c.ref.collection("notes").doc(), {
        content: pick(NOTE_SAMPLES),
        createdBy: createdByUid,
        createdAt: now,
      });
      writes++;
      await maybeFlush();
    }
  }

  // Final flush
  if (writes > 0) {
    await batch.commit();
  }

  return {
    contactsCreated: contactsToCreate.length,
    dealsCreated: dealsToCreate.length,
    activitiesCreated,
    subAccountId,
  };
}

export interface UnseedResult {
  contactsRemoved: number;
  dealsRemoved: number;
  subAccountId: string;
}

export async function unseedDemo(db: Firestore): Promise<UnseedResult> {
  const target = await resolveTargetSubAccount(db);
  if (!target) {
    throw new Error(
      `Sub-account #${TARGET_ACCOUNT_NUMBER} not found. Nothing to unseed.`,
    );
  }
  const { subAccountId } = target;

  // Find every seeded contact (tag-based).
  const contactsSnap = await db
    .collection("contacts")
    .where("subAccountId", "==", subAccountId)
    .where("tags", "array-contains", SEED_TAG)
    .get();

  const contactIds = contactsSnap.docs.map((d) => d.id);
  let dealsRemoved = 0;

  // Delete deals referencing these contacts. Firestore's `in` op caps at
  // 30 values per query; chunk it.
  for (let i = 0; i < contactIds.length; i += 30) {
    const chunk = contactIds.slice(i, i + 30);
    const dealsSnap = await db
      .collection("deals")
      .where("subAccountId", "==", subAccountId)
      .where("contactId", "in", chunk)
      .get();
    if (!dealsSnap.empty) {
      const batch = db.batch();
      dealsSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      dealsRemoved += dealsSnap.size;
    }
  }

  // Delete contacts + their subcollections (notes, activities).
  for (const contactDoc of contactsSnap.docs) {
    const [notesSnap, activitiesSnap, messagesSnap] = await Promise.all([
      contactDoc.ref.collection("notes").get(),
      contactDoc.ref.collection("activities").get(),
      contactDoc.ref.collection("messages").get(),
    ]);
    const batch = db.batch();
    notesSnap.docs.forEach((d) => batch.delete(d.ref));
    activitiesSnap.docs.forEach((d) => batch.delete(d.ref));
    messagesSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(contactDoc.ref);
    await batch.commit();
  }

  return {
    contactsRemoved: contactsSnap.size,
    dealsRemoved,
    subAccountId,
  };
}

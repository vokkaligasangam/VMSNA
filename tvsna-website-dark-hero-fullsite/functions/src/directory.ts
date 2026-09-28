/**
 * Server-owned member directory projection.
 *
 * The directory used to be built in the browser: dashboard.html queried every
 * approved application and spread the whole document into the page, then the
 * "limited profile" rows simply printed the word "Private" over data that was
 * already downloaded. Phone numbers, home addresses and children's details for
 * members who had explicitly chosen name-and-state-only were readable by any
 * other member with devtools open.
 *
 * The fix has to be server-side: you cannot hide a field the client has
 * already received. These functions maintain a `directory` collection that
 * contains only what each member's privacy level permits, and a `memberIndex`
 * collection the security rules use to decide who may read it. Clients never
 * touch membershipApplications except for their own record.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { requireAdmin, ChunkedWriter } from "./lib/admin.js";

/** Fields the directory may expose, per privacy level. */
const VISIBLE = {
  full: [
    "name",
    "city",
    "state",
    "nativePlaceSelf",
    "profession",
    "profileUrl",
    "email",
    "phone",
  ],
  limited: ["name", "state"],
} as const;

type Level = keyof typeof VISIBLE;

function levelOf(data: FirebaseFirestore.DocumentData): Level {
  return data.privacyLevel === "limited" ? "limited" : "full";
}

/** Copy across only the permitted fields. Everything else stays on the server. */
function project(
  source: FirebaseFirestore.DocumentData,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const level = levelOf(source);
  const row: Record<string, unknown> = { privacyLevel: level };
  for (const field of VISIBLE[level]) {
    const value = source[field];
    if (value !== undefined && value !== null && value !== "") row[field] = value;
  }
  // Lower-cased name drives client-side search without exposing anything new.
  if (typeof row.name === "string") row.search = (row.name as string).toLowerCase();
  return { ...row, ...extra };
}

/**
 * A spouse without their own login appears as a second directory row, which is
 * how the old dashboard behaved. Skip it when the spouse is a member in their
 * own right, or they would appear twice.
 */
async function spouseHasOwnRecord(
  db: FirebaseFirestore.Firestore,
  spouseEmail: string,
): Promise<boolean> {
  const snap = await db
    .collection("membershipApplications")
    .where("email", "==", spouseEmail)
    .limit(1)
    .get();
  return !snap.empty;
}

export const projectMemberToDirectory = onDocumentWritten(
  { document: "membershipApplications/{docId}", region: "us-central1" },
  async (event) => {
    const db = admin.firestore();
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    const uid: string | undefined = after?.userId ?? before?.userId;

    if (!uid) {
      logger.warn("Application has no userId; nothing to project", {
        docId: event.params.docId,
      });
      return;
    }

    const primary = db.collection("directory").doc(uid);
    const spouse = db.collection("directory").doc(`${uid}_s1`);
    const index = db.collection("memberIndex").doc(uid);

    const approved = after?.status === "approved";

    if (!approved) {
      // Rejected, reverted to pending, or deleted: remove from the directory
      // and revoke read access. The source record is untouched.
      await Promise.all([
        primary.delete().catch(() => undefined),
        spouse.delete().catch(() => undefined),
        after
          ? index.set(
              { status: after.status ?? "unknown", access: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
              { merge: true },
            )
          : index.delete().catch(() => undefined),
      ]);
      logger.info(`Directory entry removed for ${uid} (status: ${after?.status ?? "deleted"})`);
      return;
    }

    const writes: Promise<unknown>[] = [
      primary.set(
        project(after!, {
          uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      ),
      index.set(
        {
          status: "approved",
          access: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ];

    const spouseEmail = (after!.spouseEmail ?? "").trim();
    if (spouseEmail && !(await spouseHasOwnRecord(db, spouseEmail))) {
      writes.push(
        spouse.set(
          project(
            {
              name: after!.spouseName || `Spouse of ${after!.name ?? "member"}`,
              email: spouseEmail,
              phone: after!.spousePhone,
              profession: after!.spouseProfession,
              profileUrl: after!.spouseProfileUrl,
              nativePlaceSelf: after!.nativePlaceSpouse,
              city: after!.city,
              state: after!.state,
              privacyLevel: after!.privacyLevel,
            },
            { uid, linkedTo: uid, isSpouseEntry: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          ),
        ),
      );
    } else {
      writes.push(spouse.delete().catch(() => undefined));
    }

    await Promise.all(writes);
    logger.info(`Directory entry published for ${uid} (${levelOf(after!)})`);
  },
);

/**
 * One-off/repair pass. Rebuilds every directory row from the applications
 * collection. Safe to re-run: it is a full reconcile, not an append.
 * Dry-run by default so the counts can be reviewed before anything is written.
 */
export const rebuildDirectory = onCall(
  { region: "us-central1" },
  async (request) => {
    requireAdmin(request);

    const dryRun = request.data?.dryRun !== false;
    const db = admin.firestore();

    const apps = await db.collection("membershipApplications").get();
    const report = {
      dryRun,
      applicationsScanned: apps.size,
      approved: 0,
      missingUserId: 0,
      duplicateUids: 0,
      spouseRows: 0,
      wouldWrite: 0,
      removedStale: 0,
      writesCommitted: 0,
    };

    const seen = new Set<string>();
    const keep = new Set<string>();
    const writer = new ChunkedWriter(db);

    for (const doc of apps.docs) {
      const data = doc.data();
      if (!data.userId) {
        report.missingUserId++;
        continue;
      }
      if (data.status !== "approved") continue;
      report.approved++;

      if (seen.has(data.userId)) {
        report.duplicateUids++;
        continue;
      }
      seen.add(data.userId);

      keep.add(data.userId);
      report.wouldWrite++;

      const spouseEmail = (data.spouseEmail ?? "").trim();
      const withSpouse = spouseEmail && !(await spouseHasOwnRecord(db, spouseEmail));
      if (withSpouse) {
        keep.add(`${data.userId}_s1`);
        report.spouseRows++;
      }

      if (!dryRun) {
        await writer.set(
          db.collection("directory").doc(data.userId),
          project(data, { uid: data.userId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }),
        );
        await writer.set(
          db.collection("memberIndex").doc(data.userId),
          { status: "approved", access: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
        if (withSpouse) {
          await writer.set(
            db.collection("directory").doc(`${data.userId}_s1`),
            project(
              {
                name: data.spouseName || `Spouse of ${data.name ?? "member"}`,
                email: spouseEmail,
                phone: data.spousePhone,
                profession: data.spouseProfession,
                profileUrl: data.spouseProfileUrl,
                nativePlaceSelf: data.nativePlaceSpouse,
                city: data.city,
                state: data.state,
                privacyLevel: data.privacyLevel,
              },
              { uid: data.userId, linkedTo: data.userId, isSpouseEntry: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            ),
          );
        }
      }
    }

    // Anything in the directory that no longer corresponds to an approved
    // application is stale and must go — this is what removes a member who was
    // rejected or deleted while the trigger was not running.
    const existing = await db.collection("directory").get();
    for (const doc of existing.docs) {
      if (!keep.has(doc.id)) {
        report.removedStale++;
        if (!dryRun) {
          await writer.delete(doc.ref);
        }
      }
    }

    if (!dryRun) await writer.flush();
    report.writesCommitted = dryRun ? 0 : writer.total;

    logger.info("rebuildDirectory", report);
    return report;
  },
);

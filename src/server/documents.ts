import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentCheck, ID, LoanApplication, Scope, SessionUser, StoredDocumentFile } from "@/lib/types";
import { ApiError, assertBranchScope, assertRecordPermission } from "./access";
import { appendAudit, getStore, makeId } from "./store";

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_DOCUMENT_TYPES: { mime: string; extension: string }[] = [
  { mime: "application/pdf", extension: "pdf" },
  { mime: "image/png", extension: "png" },
  { mime: "image/jpeg", extension: "jpg" },
];

const ALLOWED_MIME = new Map(ALLOWED_DOCUMENT_TYPES.map((entry) => [entry.mime, entry.extension]));

const DOC_WORKABLE_STATUSES: LoanApplication["status"][] = ["NEW", "IN_PROCESS", "SENT_BACK"];

/** Private, non-public storage root. Never served by the static handler. */
export function documentStorageDir() {
  return path.resolve(process.env.FINCLOUD_DOCUMENT_DIR ?? path.join(process.cwd(), ".data", "documents"));
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** Strip path separators, control characters and reserved names before storing or echoing a filename. */
export function sanitizeOriginalName(value: string) {
  const base = value.split(/[\\/]/).pop() ?? "document";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._ ()-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || "document";
}

function extensionFor(mime: string, originalName: string) {
  const known = ALLOWED_MIME.get(mime);
  if (known) return known;
  const fromName = originalName.split(".").pop()?.toLowerCase();
  return fromName && /^[a-z0-9]{1,5}$/.test(fromName) ? fromName : "bin";
}

function scopedApplication(user: SessionUser, scope: Scope, applicationId: string, permission: "applications:manage" | "applications:view") {
  const application = getStore().applications.find((item) => item.id === applicationId);
  if (!application) throw new ApiError(404, "NOT_FOUND", "Application not found.");
  assertBranchScope(scope, application.branchId);
  assertRecordPermission(user, "APPLICATION", application.id, permission, application.branchId, application.ownerId);
  return application;
}

export type StoredDocumentResult = {
  documentId: ID;
  fileId: ID;
  originalName: string;
  mime: string;
  size: number;
  uploadedAt: string;
  status: DocumentCheck["status"];
};

export async function storeDocumentFile(
  user: SessionUser,
  scope: Scope,
  applicationId: string,
  documentId: string,
  upload: { name: string; declaredMime: string; bytes: Buffer },
): Promise<StoredDocumentResult> {
  const store = getStore();
  const application = scopedApplication(user, scope, applicationId, "applications:manage");

  if (!DOC_WORKABLE_STATUSES.includes(application.status)) {
    throw new ApiError(409, "LOCKED_APPLICATION", "Documents cannot be changed after a credit decision.");
  }
  const document = application.documents.find((item) => item.id === documentId);
  if (!document) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found on this application.");
  if (document.fileId) {
    throw new ApiError(409, "FILE_EXISTS", "A file is already attached to this document. It cannot be replaced.");
  }
  if (document.status === "VERIFIED") {
    throw new ApiError(409, "INVALID_DOCUMENT_TRANSITION", "A verified document cannot be replaced.");
  }
  if (!upload.bytes.length) throw new ApiError(422, "EMPTY_FILE", "The selected file is empty.");
  if (upload.bytes.length > MAX_DOCUMENT_BYTES) {
    throw new ApiError(413, "FILE_TOO_LARGE", "File must be 5 MB or smaller.");
  }

  const sniffed = sniffMime(upload.bytes);
  if (!sniffed) {
    throw new ApiError(415, "UNSUPPORTED_FILE", "Only PDF, PNG and JPEG files are accepted (content check failed).");
  }
  if (upload.declaredMime && upload.declaredMime !== sniffed) {
    throw new ApiError(415, "MIME_MISMATCH", "The file contents do not match the declared type.");
  }

  const originalName = sanitizeOriginalName(upload.name);
  const storedName = `${randomUUID()}.${extensionFor(sniffed, originalName)}`;
  const directory = documentStorageDir();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, storedName);
  await writeFile(target, upload.bytes, { flag: "wx", mode: 0o600 });

  const now = new Date().toISOString();
  const record: StoredDocumentFile = {
    id: makeId("doc-file"),
    applicationId: application.id,
    documentId: document.id,
    branchId: application.branchId,
    originalName,
    storedName,
    mime: sniffed,
    size: upload.bytes.length,
    sha256: createHash("sha256").update(upload.bytes).digest("hex"),
    uploadedBy: user.id,
    uploadedAt: now,
  };
  store.documentFiles.push(record);

  document.fileId = record.id;
  document.fileName = originalName;
  document.uploadedAt = now;
  document.status = "UPLOADED";

  application.activities.push({
    id: makeId("act"),
    at: now,
    actorId: user.id,
    type: "DOCUMENT_UPLOADED",
    summary: `${document.name} uploaded (${(record.size / 1024).toFixed(0)} KB, ${sniffed}) to private storage.`,
  });
  application.updatedAt = now;

  appendAudit(
    store,
    user.id,
    "DOCUMENT_UPLOADED",
    "Application",
    application.id,
    `${document.name} stored as ${storedName} (${record.size} bytes, sha256 ${record.sha256.slice(0, 16)}…) for ${application.ref}.`,
  );

  return {
    documentId: document.id,
    fileId: record.id,
    originalName: record.originalName,
    mime: record.mime,
    size: record.size,
    uploadedAt: record.uploadedAt,
    status: document.status,
  };
}

export type DocumentFilePayload = {
  bytes: Buffer;
  mime: string;
  fileName: string;
  size: number;
};

export async function readDocumentFile(
  user: SessionUser,
  scope: Scope,
  applicationId: string,
  documentId: string,
): Promise<DocumentFilePayload> {
  const store = getStore();
  const application = scopedApplication(user, scope, applicationId, "applications:view");
  const document = application.documents.find((item) => item.id === documentId);
  if (!document || !document.fileId) {
    throw new ApiError(404, "NOT_FOUND", "No stored file is attached to this document.");
  }
  const record = store.documentFiles.find(
    (item) => item.id === document.fileId && item.applicationId === application.id && item.documentId === document.id,
  );
  if (!record) throw new ApiError(404, "NOT_FOUND", "Stored file metadata not found.");

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(documentStorageDir(), record.storedName));
  } catch {
    throw new ApiError(
      410,
      "FILE_UNAVAILABLE",
      "The stored file is unavailable in this environment (ephemeral demo storage).",
    );
  }

  appendAudit(
    store,
    user.id,
    "DOCUMENT_DOWNLOADED",
    "Application",
    application.id,
    `${document.name} (${record.originalName}) downloaded for ${application.ref}.`,
  );

  return { bytes, mime: record.mime, fileName: record.originalName, size: record.size };
}

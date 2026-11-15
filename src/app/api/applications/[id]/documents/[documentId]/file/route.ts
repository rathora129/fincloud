import {
  ApiError,
  assertPermission,
  buildScope,
  errorResponse,
  requireSession,
} from "@/server/access";
import { MAX_DOCUMENT_BYTES, readDocumentFile, storeDocumentFile } from "@/server/documents";

type RouteContext = { params: Promise<{ id: string; documentId: string }> };

const MULTIPART_OVERHEAD = 512 * 1024;

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSession();
    assertPermission(user, "applications:manage");
    const { id, documentId } = await context.params;
    const scope = buildScope(user);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_BYTES + MULTIPART_OVERHEAD) {
      throw new ApiError(413, "FILE_TOO_LARGE", "File must be 5 MB or smaller.");
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) {
      throw new ApiError(422, "FILE_REQUIRED", "Select a PDF, PNG or JPEG file to upload.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await storeDocumentFile(user, scope, id, documentId, {
      name: file.name,
      declaredMime: file.type,
      bytes,
    });
    return Response.json({ item: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSession();
    assertPermission(user, "applications:view");
    const { id, documentId } = await context.params;
    const scope = buildScope(user);

    const file = await readDocumentFile(user, scope, id, documentId);
    const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

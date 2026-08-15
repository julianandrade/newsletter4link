import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The seam decides which bucket every upload lands in, from one environment variable, and
 * both deployments are live at once: Vercel still serves production with no Google
 * credentials, Cloud Run has the service account and `GCS_MEDIA_BUCKET`.
 *
 * So the case worth testing is not "does GCS work", which needs a real bucket, but "does the
 * right backend get chosen", which is what would silently take uploads down on the site that
 * is actually serving people.
 */

const gcsUpload = vi.fn(async () => ({ path: "g", url: "https://gcs/g" }));
const gcsDelete = vi.fn(async () => {});
const supaUpload = vi.fn(async () => ({ path: "s", url: "https://supa/s" }));
const supaDelete = vi.fn(async () => {});

vi.mock("@/lib/storage/gcs", () => ({
  uploadFile: (...args: unknown[]) => gcsUpload(...(args as [])),
  deleteFile: (...args: unknown[]) => gcsDelete(...(args as [])),
  getPublicUrl: (p: string) => `https://gcs/${p}`,
  fileExists: async () => true,
  listFiles: async () => [],
}));

vi.mock("@/lib/supabase/storage", () => ({
  uploadFile: (...args: unknown[]) => supaUpload(...(args as [])),
  deleteFile: (...args: unknown[]) => supaDelete(...(args as [])),
  getPublicUrl: (p: string) => `https://supa/${p}`,
  fileExists: async () => false,
  listFiles: async () => [],
}));

async function seam() {
  // Imported fresh each time: the backend is resolved per call, and this proves it rather
  // than trusting the module not to have captured the value at load.
  return import("@/lib/storage");
}

afterEach(() => {
  delete process.env.GCS_MEDIA_BUCKET;
  vi.clearAllMocks();
});

describe("storage backend selection", () => {
  it("uses Supabase when GCS_MEDIA_BUCKET is absent, which is Vercel", async () => {
    const s = await seam();
    expect(s.storageBackend()).toBe("supabase");

    await s.uploadFile(Buffer.from("x"), "a.png", "image/png");
    expect(supaUpload).toHaveBeenCalledTimes(1);
    expect(gcsUpload).not.toHaveBeenCalled();
  });

  it("uses GCS when GCS_MEDIA_BUCKET is set, which is Cloud Run", async () => {
    process.env.GCS_MEDIA_BUCKET = "newsletter-link-ai-radar-media";
    const s = await seam();
    expect(s.storageBackend()).toBe("gcs");

    await s.uploadFile(Buffer.from("x"), "a.png", "image/png");
    expect(gcsUpload).toHaveBeenCalledTimes(1);
    expect(supaUpload).not.toHaveBeenCalled();
  });

  it("switches within one process, so the backend is not captured at import", async () => {
    const s = await seam();

    await s.deleteFile("one");
    expect(supaDelete).toHaveBeenCalledTimes(1);

    process.env.GCS_MEDIA_BUCKET = "bucket";
    await s.deleteFile("two");
    expect(gcsDelete).toHaveBeenCalledTimes(1);
    expect(supaDelete).toHaveBeenCalledTimes(1);
  });

  it("routes getPublicUrl through the same choice as uploads", async () => {
    const s = await seam();
    expect(s.getPublicUrl("f.png")).toBe("https://supa/f.png");

    process.env.GCS_MEDIA_BUCKET = "bucket";
    expect(s.getPublicUrl("f.png")).toBe("https://gcs/f.png");
  });
});

describe("gcs url shape", () => {
  it("builds a public object URL and escapes the path", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/storage/gcs");
    process.env.GCS_MEDIA_BUCKET = "my-bucket";

    const real = await vi.importActual<typeof import("@/lib/storage/gcs")>("@/lib/storage/gcs");

    expect(real.getPublicUrl("1786663115100-meme-inhaling-seagull.jpg")).toBe(
      "https://storage.googleapis.com/my-bucket/1786663115100-meme-inhaling-seagull.jpg"
    );
    // A space in a filename must not produce a URL that breaks in an email client.
    expect(real.getPublicUrl("a b.png")).toBe(
      "https://storage.googleapis.com/my-bucket/a%20b.png"
    );
  });
});

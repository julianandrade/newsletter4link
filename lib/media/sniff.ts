/**
 * What an uploaded file actually is, read from its own bytes.
 *
 * The upload route used to validate `file.type`, which is the browser's word taken from the
 * multipart part header and controlled by whoever posts, and then handed that same value to
 * Supabase as the stored object's content type. Renaming `evil.svg` to `meme.png` and
 * declaring `image/png` passed both checks, and the `newsletter-media` bucket is public, so
 * Supabase would serve it back as script from a domain the product owns.
 *
 * The accepted set is deliberately the three formats every mail client renders:
 *
 *  - SVG is refused because it can carry `<script>` and no email client renders it anyway,
 *    so it is risk with no upside.
 *  - WebP is refused because Outlook on Windows does not render it, and a broken image is
 *    worse than a rejected upload.
 */

export type SniffedImageType = "image/png" | "image/jpeg" | "image/gif";

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // "GIF8", which covers both 87a and 89a.
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  return null;
}

/**
 * Whether a GIF loops, detected by the NETSCAPE2.0 application extension.
 *
 * A heuristic, and stated as one. It is what looping GIFs carry, which is substantially all
 * animated ones, and nothing depends on it being exact: it exists only to warn an editor,
 * because Outlook on Windows renders the first frame and nothing else. So the first frame
 * has to carry the joke on its own, and that is a fact about the file rather than about the
 * code.
 *
 * Bounded to the first 4KB. The marker sits in the header, and scanning a 5MB buffer for it
 * would be work with no answer at the end.
 */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (sniffImageType(bytes) !== "image/gif") return false;

  const marker = "NETSCAPE2.0";
  const limit = Math.min(bytes.length, 4096);

  outer: for (let start = 0; start + marker.length <= limit; start++) {
    for (let offset = 0; offset < marker.length; offset++) {
      if (bytes[start + offset] !== marker.charCodeAt(offset)) continue outer;
    }
    return true;
  }

  return false;
}

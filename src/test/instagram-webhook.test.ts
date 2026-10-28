import { describe, expect, it } from "vitest";
import { instagramCommentMediaId } from "@/lib/instagram-webhook";

describe("Instagram comment webhook media ID parsing", () => {
  it("reads the media_id field used in Instagram Login webhook payloads", () => {
    expect(instagramCommentMediaId({ media_id: "17890001234567890" })).toBe("17890001234567890");
  });

  it("supports a nested media.id compatibility payload", () => {
    expect(instagramCommentMediaId({ media: { id: "17890001234567890" } })).toBe("17890001234567890");
  });

  it("returns an empty value for a missing or invalid media ID", () => {
    expect(instagramCommentMediaId({})).toBe("");
    expect(instagramCommentMediaId({ media_id: 123, media: { id: null } })).toBe("");
    expect(instagramCommentMediaId({ media_id: "  " })).toBe("");
  });
});

export type InstagramCommentMediaReference = {
  media_id?: unknown;
  media?: { id?: unknown } | null;
};

/** Read the media ID shape used by Instagram Login comment webhook payloads. */
export function instagramCommentMediaId(comment: InstagramCommentMediaReference): string {
  if (typeof comment.media_id === "string" && comment.media_id.trim()) {
    return comment.media_id.trim();
  }
  if (typeof comment.media?.id === "string" && comment.media.id.trim()) {
    return comment.media.id.trim();
  }
  return "";
}

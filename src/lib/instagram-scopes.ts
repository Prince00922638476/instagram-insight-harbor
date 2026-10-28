export const ALL_SCOPES = [
  { id: "instagram_business_basic", label: "Read profile & media", write: false },
  { id: "instagram_business_manage_insights", label: "Read insights", write: false },
  { id: "instagram_business_manage_comments", label: "Read & reply to comments", write: true },
  { id: "instagram_business_content_publish", label: "Publish posts & reels", write: true },
] as const;

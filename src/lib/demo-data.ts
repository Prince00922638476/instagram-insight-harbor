export const demoAccount = {
  username: "studio.ondine",
  name: "Studio Ondine",
  type: "BUSINESS",
  followers: 12840,
  follows: 311,
  mediaCount: 248,
};

export type Media = {
  id: string;
  type: "IMAGE" | "REEL" | "CAROUSEL";
  caption: string;
  date: string;
  likes: number;
  comments: number;
  reach: number;
  saves: number;
  hue: number;
};

export const demoMedia: Media[] = [
  { id: "m1", type: "REEL", caption: "Behind the glaze: a 30s studio tour", date: "2026-10-22", likes: 1820, comments: 94, reach: 21400, saves: 312, hue: 190 },
  { id: "m2", type: "IMAGE", caption: "New autumn bowls drop Friday", date: "2026-10-19", likes: 964, comments: 41, reach: 9800, saves: 120, hue: 350 },
  { id: "m3", type: "CAROUSEL", caption: "5 steps from clay to kiln", date: "2026-10-15", likes: 1312, comments: 67, reach: 14200, saves: 455, hue: 40 },
  { id: "m4", type: "IMAGE", caption: "Workshop seats open for November", date: "2026-10-11", likes: 702, comments: 58, reach: 7600, saves: 88, hue: 160 },
  { id: "m5", type: "REEL", caption: "Throwing a vase in one take", date: "2026-10-06", likes: 2410, comments: 133, reach: 30100, saves: 501, hue: 320 },
  { id: "m6", type: "IMAGE", caption: "Studio cat approves", date: "2026-10-02", likes: 1590, comments: 112, reach: 12500, saves: 64, hue: 70 },
];

export type Comment = {
  id: string;
  mediaId: string;
  user: string;
  text: string;
  date: string;
  replies: string[];
  hidden?: boolean;
};

export const demoComments: Comment[] = [
  { id: "c1", mediaId: "m2", user: "maple.and.moss", text: "Will the speckled ones be restocked?", date: "2026-10-24", replies: [] },
  { id: "c2", mediaId: "m4", user: "jules_makes", text: "Is the workshop beginner friendly?", date: "2026-10-24", replies: [] },
  { id: "c3", mediaId: "m1", user: "kiln.notes", text: "That glaze colour is unreal 😍", date: "2026-10-23", replies: ["Thank you! It's our 'tide pool' blend."] },
  { id: "c4", mediaId: "m5", user: "pottery.paul", text: "What clay body do you use?", date: "2026-10-21", replies: [] },
];

export const weeklyReach = [6200, 7400, 6900, 9100, 8800, 11200, 12600];

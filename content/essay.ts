/**
 * 首页介绍。逐行填墨的动画来自折纸 demo，文案是 Lonely 自己的。
 * 组织名会在读到时收成带图标的词，其余括号是外链，留在句子里。
 */

export type Feature = {
  id: string;
  title: string;
  /** 属于句子、但不进词牌的标点 */
  suffix: string;
  href?: string;
  icon?: string;
  /** 头像铺满；标本身留白多的用 contain */
  iconFit?: "cover" | "contain";
};

export type TextPiece = { type: "text"; text: string };
export type FeaturePiece = { type: "feature"; id: string };
export type LinkPiece = { type: "link"; href: string; text: string };
export type Piece = TextPiece | FeaturePiece | LinkPiece;

const WIKI = {
  developer: "https://zh.wikipedia.org/wiki/软件开发者",
  furry: "https://zh.wikipedia.org/wiki/Furry",
  designer: "https://zh.wikipedia.org/wiki/设计师",
  infp: "https://zh.wikipedia.org/wiki/INFP",
  bi: "https://zh.wikipedia.org/wiki/双性恋",
  lgbtq: "https://zh.wikipedia.org/wiki/LGBT",
  school: "https://zh.wikipedia.org/wiki/海南中学",
};

export const ui = {
  hint: "向下滚动，字会逐行写完。",
};

export const features: Record<string, Feature> = {
  sr: {
    id: "sr",
    title: "SR思锐",
    suffix: "",
    href: "https://github.com/SRInternet-Studio",
    icon: "/icons/orgs/sr.jpg",
    iconFit: "cover",
  },
  coludai: {
    id: "coludai",
    title: "ColudAI",
    suffix: "",
    href: "https://coludai.cn",
    icon: "/icons/orgs/coludai.png",
    iconFit: "contain",
  },
  amethyst: {
    id: "amethyst",
    title: "Amethyst",
    suffix: "",
    href: "https://github.com/AmethystDev-Labs",
    icon: "/icons/orgs/amethyst.png",
    iconFit: "contain",
  },
  cuz: {
    id: "cuz",
    title: "Cuz Technology",
    suffix: "",
    href: "https://github.com/CuzTeam",
    icon: "/icons/orgs/cuz.png",
    iconFit: "cover",
  },
  entropy: {
    id: "entropy",
    title: "Entropy",
    suffix: "。",
    href: "https://entropy.asia",
    icon: "/icons/orgs/entropy.png",
    iconFit: "contain",
  },
  angel: { id: "angel", title: "Angel", suffix: "、" },
  devil: { id: "devil", title: "Devil", suffix: "" },
  zhufeng: { id: "zhufeng", title: "竹风", suffix: "。" },
};

export const paragraphs: Piece[][] = [
  [
    { type: "text", text: "嗨！我是 Lonely，我是一位 " },
    { type: "link", href: WIKI.developer, text: "Developer" },
    { type: "text", text: " / " },
    { type: "link", href: WIKI.furry, text: "Furry" },
    { type: "text", text: " / " },
    { type: "link", href: WIKI.designer, text: "Designer" },
    { type: "text", text: "。" },
  ],
  [
    { type: "text", text: "我的性格是 " },
    { type: "link", href: WIKI.infp, text: "INFP" },
    { type: "text", text: "。我是" },
    { type: "link", href: WIKI.bi, text: "双性恋" },
    { type: "text", text: "。我支持 " },
    { type: "link", href: WIKI.lgbtq, text: "LGBTQ+" },
    { type: "text", text: "。" },
  ],
  [
    { type: "text", text: "我在" },
    { type: "link", href: WIKI.school, text: "海南中学初中部" },
    { type: "text", text: "上学，目前 14 岁，初一。" },
  ],
  [
    { type: "text", text: "曾在 " },
    { type: "feature", id: "sr" },
    { type: "text", text: " 和 " },
    { type: "feature", id: "coludai" },
    { type: "text", text: " 工作过，曾创建 " },
    { type: "feature", id: "amethyst" },
    { type: "text", text: " 和 " },
    { type: "feature", id: "cuz" },
    { type: "text", text: "，现工作于 " },
    { type: "feature", id: "entropy" },
  ],
  [
    { type: "text", text: "现在有三个崽崽，分别为 " },
    { type: "feature", id: "angel" },
    { type: "feature", id: "devil" },
    { type: "text", text: " 和 " },
    { type: "feature", id: "zhufeng" },
  ],
];

import { defineConfig } from "vitepress";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
  title: "Guard",
  description: "Framework-independent browser Back guard.",
  lang: "zh-CN",
  base: isProduction ? "/guard/" : "/",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,
  head: [
    ["meta", { name: "theme-color", content: "#1746d1" }],
    [
      "link",
      {
        rel: "icon",
        href: isProduction ? "/guard/favicon.svg" : "/favicon.svg",
      },
    ],
  ],
  themeConfig: {
    logo: "/favicon.svg",
    siteTitle: "@revfanc/guard",
    nav: [
      { text: "指南", link: "/guide/getting-started" },
      { text: "API", link: "/api" },
      { text: "限制", link: "/guide/limitations" },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "快速开始", link: "/guide/getting-started" },
          { text: "生命周期", link: "/guide/lifecycle" },
          { text: "多层 Guard", link: "/guide/nested" },
          { text: "工程结构与构建", link: "/guide/project-structure" },
        ],
      },
      {
        text: "框架",
        items: [
          { text: "React", link: "/frameworks/react" },
          { text: "Vue", link: "/frameworks/vue" },
          { text: "iframe", link: "/frameworks/iframe" },
        ],
      },
      {
        text: "参考",
        items: [
          { text: "API", link: "/api" },
          { text: "边界与限制", link: "/guide/limitations" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/revfanc/guard" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 revfanc",
    },
    search: { provider: "local" },
  },
});

import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { h } from "vue";
import HistoryStack from "./HistoryStack.vue";
import "./styles.css";

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "home-hero-image": () => h(HistoryStack),
    }),
  enhanceApp({ app }) {
    app.component("HistoryStack", HistoryStack);
  },
} satisfies Theme;

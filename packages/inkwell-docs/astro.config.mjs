import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  devToolbar: { enabled: false },
  redirects: {
    "/llms.md": "/llms.txt",
  },
  integrations: [
    starlight({
      title: "Inkwell",
      favicon: "/favicon.svg",
      // globals.css starts with `@import "@railway/inkwell/styles.css"` so
      // the package defaults load first. Demo overrides below are scoped
      // under `[data-demo-style="custom"]`, so in default mode only the
      // package defaults apply.
      customCss: ["./src/styles/globals.css"],
      components: {
        PageSidebar: "./src/components/page-sidebar.astro",
      },
      sidebar: [
        { slug: "docs/quickstart" },
        {
          label: "Guide",
          items: [
            { slug: "docs/editor" },
            { slug: "docs/renderer" },
            { slug: "docs/styling" },
          ],
        },
        {
          label: "Plugins",
          items: [
            { slug: "docs/plugins", label: "Overview" },
            { slug: "docs/custom-plugins", label: "Creating custom plugins" },
            {
              label: "Included plugins",
              items: [
                { slug: "docs/plugins/bubble-menu" },
                { slug: "docs/plugins/snippets" },
                { slug: "docs/plugins/emoji" },
                { slug: "docs/plugins/completions" },
                { slug: "docs/plugins/slash-commands" },
                { slug: "docs/plugins/mentions" },
                { slug: "docs/plugins/attachments" },
                { slug: "docs/plugins/character-limit" },
              ],
            },
          ],
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/railwayapp/inkwell",
        },
      ],
    }),
    react({ include: ["**/inkwell/**", "**/src/components/**"] }),
  ],
});

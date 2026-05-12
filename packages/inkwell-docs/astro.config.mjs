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
            { slug: "docs/editor-plugins", label: "Plugins" },
            { slug: "docs/collaboration" },
            { slug: "docs/styling" },
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

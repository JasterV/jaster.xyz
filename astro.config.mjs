import { defineConfig } from "astro/config";
import icon from "astro-icon";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://jaster.xyz",
  integrations: [
    icon({
      include: {
        // Include only three `mdi` icons in the bundle
        // Otherwise, Astro Icons could include every single icon in the mdi package and result in a huge bundle size
        mdi: ["github", "linkedin"],
      },
    }),
    sitemap(),
  ],
});

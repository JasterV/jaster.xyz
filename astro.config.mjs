import { defineConfig } from "astro/config";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";
import d2 from "astro-d2";

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
    // Refer to: https://astro-d2.vercel.app/configuration/
    d2({
      // Outputs to `public/assets/d2`
      output: "assets/d2",
      sketch: true,
      pad: 50,
      layout: "dagre",
      // https://d2lang.com/tour/themes/
      theme: {
        default: "3",
        dark: "200",
      },
    }),
  ],
});

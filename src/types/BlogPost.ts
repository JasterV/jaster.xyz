import type { MarkdownInstance } from "astro";

export interface Image {
  url: string;
  alt?: string;
}

export interface Frontmatter {
  title: string;
  pubDate: string;
  image?: Image;
}

export type BlogPost = MarkdownInstance<Frontmatter>;

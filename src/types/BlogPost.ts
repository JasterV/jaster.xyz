import type { MarkdownInstance } from "astro";

export interface Image {
  url: string;
  alt?: string;
}

export interface Frontmatter {
  title: string;
  description?: string;
  pubDate: string;
  tags: string[];
  image?: Image;
}

export type BlogPost = MarkdownInstance<Frontmatter>;

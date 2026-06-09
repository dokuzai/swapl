import { OG_SIZE, OG_CONTENT_TYPE, renderOgImage } from "@/lib/marketing/og";
import { getBlogPost } from "@/app/content/blog";

export const alt = "swapl blog";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  return renderOgImage({
    kicker: post ? post.category : "The swapl blog",
    title: post ? post.title : "The swapl blog",
    subtitle: post ? post.description : "Home swapping — no money, fully insured.",
  });
}

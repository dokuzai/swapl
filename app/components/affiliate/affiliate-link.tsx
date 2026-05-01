// Reusable affiliate CTA — points at our /api/affiliate redirector so the
// click is logged server-side. Style mirrors `pill-ghost` so it never
// outshines a primary swapl CTA.

type Props = {
  partner: "skyscanner" | "airalo" | "getyourguide" | "battleface";
  city?: string;
  country?: string;
  agreementId?: string;
  campaign?: string;
  children: React.ReactNode;
  variant?: "ghost" | "card";
};

export function AffiliateLink({ partner, city, country, agreementId, campaign, children, variant = "ghost" }: Props) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (country) params.set("country", country);
  if (agreementId) params.set("agreement", agreementId);
  if (campaign) params.set("utm_campaign", campaign);
  const href = `/api/affiliate/${partner}${params.toString() ? `?${params.toString()}` : ""}`;
  const className =
    variant === "card"
      ? "surface-card p-5 block hover:no-underline"
      : "pill-ghost inline-flex";
  return (
    <a href={href} target="_blank" rel="noopener sponsored" className={className}>
      {children}
    </a>
  );
}

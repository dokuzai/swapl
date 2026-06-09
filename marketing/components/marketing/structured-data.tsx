import { SITE_URL, appUrl } from "@/lib/app-url";

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "swapl",
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.ico`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "swapl",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: appUrl("/listings?city={search_term_string}"),
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Service",
      "@id": `${SITE_URL}/#service`,
      name: "swapl home swapping",
      serviceType: "Home exchange marketplace",
      provider: { "@id": `${SITE_URL}/#organization` },
      areaServed: "Worldwide",
      description:
        "An insured home swap marketplace where hosts trade homes keys for keys, without nightly rates or platform commission.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        availabilityStarts: "2026-09-01",
      },
    },
  ],
};

export function MarketingStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
    />
  );
}

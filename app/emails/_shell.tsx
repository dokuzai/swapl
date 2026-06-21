// Shared chrome for every transactional email — cream bg, navy headings,
// pink CTA. Built with @react-email/components so output renders consistently
// across Gmail, Apple Mail, and Outlook.

import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

const TOKENS = {
  bgPage: "#FAF6E8",
  bgCard: "#FFFFFF",
  navy: "#1A1F3C",
  navy2: "#2A3066",
  navy3: "#5E63A0",
  pink: "#F24B8E",
  line: "#E5E0D0",
};

export function EmailShell({
  preview,
  heading,
  intro,
  body,
  ctaLabel,
  ctaHref,
  footnote,
}: {
  preview: string;
  heading: string;
  intro?: string;
  body?: ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
  footnote?: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ background: TOKENS.bgPage, margin: 0, padding: "32px 12px", fontFamily: "Inter, Helvetica, Arial, sans-serif", color: TOKENS.navy }}>
        <Container style={{ maxWidth: 560, background: TOKENS.bgCard, borderRadius: 14, padding: 32, border: `1px solid ${TOKENS.line}` }}>
          <Section>
            <Text style={{ margin: 0, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 24, fontWeight: 600, letterSpacing: -0.4 }}>
              swapl<span style={{ color: TOKENS.pink }}>.</span>
            </Text>
          </Section>
          <Hr style={{ borderColor: TOKENS.line, margin: "20px 0" }} />
          <Heading as="h1" style={{ fontFamily: "Georgia, serif", fontSize: 28, lineHeight: 1.15, margin: 0 }}>
            {heading}
          </Heading>
          {intro && (
            <Text style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: TOKENS.navy2 }}>{intro}</Text>
          )}
          {body && <Section style={{ marginTop: 16 }}>{body}</Section>}
          {ctaLabel && ctaHref && (
            <Section style={{ marginTop: 28 }}>
              <Link
                href={ctaHref}
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  borderRadius: 999,
                  background: TOKENS.pink,
                  color: "#fff",
                  fontWeight: 500,
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                {ctaLabel}
              </Link>
            </Section>
          )}
          <Hr style={{ borderColor: TOKENS.line, margin: "28px 0 14px" }} />
          <Text style={{ margin: 0, fontSize: 12, color: TOKENS.navy3 }}>
            {footnote ?? "swapl · keys for keys, no money, fully backed."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

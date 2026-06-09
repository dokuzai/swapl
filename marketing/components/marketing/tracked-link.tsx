"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { attributionFromSearchParams, trackMarketingEvent } from "@/lib/marketing/attribution";

type TrackedLinkProps = React.ComponentProps<typeof Link> & {
  eventName: string;
  eventMetadata?: Record<string, unknown>;
};

export function TrackedLink({
  eventName,
  eventMetadata,
  onClick,
  ...props
}: TrackedLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Link
      {...props}
      onClick={(event) => {
        trackMarketingEvent(eventName, {
          ...attributionFromSearchParams(searchParams, pathname),
          metadata: eventMetadata,
        });
        onClick?.(event);
      }}
    />
  );
}

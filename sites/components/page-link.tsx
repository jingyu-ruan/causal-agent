"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

/**
 * Use the app router directly so shared layouts stay mounted. Vinext's Link
 * shim dynamically imports an internal export that is removed by its production
 * client-reference transform; useRouter's public push API avoids that path.
 */
export default function PageLink(props: ComponentProps<"a">) {
  const router = useRouter();
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    const { href, target, download } = props;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !href ||
      !href.startsWith("/") ||
      href.startsWith("//") ||
      download !== undefined ||
      (target && target !== "_self")
    )
      return;
    event.preventDefault();
    router.push(href);
  };
  return <a {...props} onClick={navigate} />;
}

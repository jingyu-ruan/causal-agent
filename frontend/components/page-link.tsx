import type { ComponentProps } from "react"

/**
 * Document navigation keeps every route usable before hydration and avoids the
 * client router's production-only RSC module failure in the Sites runtime.
 */
export default function PageLink(props: ComponentProps<"a">) {
  return <a {...props} />
}

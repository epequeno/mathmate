/**
 * Tiny `clsx`-equivalent without a dependency.
 *
 * Usage:
 *   cx("foo", false && "bar", "baz")   → "foo baz"
 *   cx(styles.row, isActive && styles.active) → "Sidebar_row__xxx Sidebar_active__yyy"
 */
export function cx(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(" ");
}

/**
 * Skip-to-content link for keyboard and screen reader users.
 * Visually hidden until focused — appears at top of page when tabbed to.
 * Allows keyboard users to skip repeated navigation.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100]
                 focus:bg-white focus:text-blue-600 focus:px-4 focus:py-2 focus:rounded-lg
                 focus:border focus:border-blue-300 focus:shadow-lg focus:font-medium focus:text-sm"
    >
      Skip to content
    </a>
  );
}

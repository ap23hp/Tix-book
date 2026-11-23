// Full-page navigation to another site (e.g. Stripe's checkout page).
// router.push only works inside our own app. In its own module so tests
// can replace it: jsdom doesn't allow spying on window.location.
export function goToExternal(url: string) {
  window.location.assign(url);
}

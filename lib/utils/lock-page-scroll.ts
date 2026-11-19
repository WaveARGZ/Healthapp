/** Keep a mobile dialog's background at its original position, including on iOS. */
export function lockPageScroll(): () => void {
  const { body, documentElement } = document;
  const left = window.scrollX;
  const top = window.scrollY;
  const properties = ["position", "top", "left", "width", "overflow", "paddingRight"] as const;
  const previous = properties.map((property) => [property, body.style[property]] as const);
  const scrollbar = Math.max(0, window.innerWidth - documentElement.clientWidth);
  if (scrollbar) body.style.paddingRight = `${parseFloat(window.getComputedStyle(body).paddingRight) + scrollbar}px`;
  body.style.position = "fixed";
  body.style.top = `${-top}px`;
  body.style.left = `${-left}px`;
  body.style.width = "100%";
  body.style.overflow = "hidden";
  return () => {
    for (const [property, value] of previous) body.style[property] = value;
    window.scrollTo({ left, top, behavior: "instant" });
  };
}

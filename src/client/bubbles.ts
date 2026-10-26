// The rising bubbles behind every screen (docs/design/look-and-feel.md U3):
// faint, translucent disc shapes in red, yellow and blue, some with the ring
// or cross marker. Pure decoration: hidden from screen readers, never in the
// way of a tap. They animate with CSS (transform only); this only creates
// them. Under reduced motion CSS keeps them still, scattered over the screen.
import { themeNumber } from "./arcade.ts";

const host = document.getElementById("bubbles");

if (host) {
  const phone = window.matchMedia("(max-width: 600px)").matches;
  const count = phone ? 7 : 12;
  const colours = ["red", "yellow", "blue"];
  const marks = ["ring", "cross", "", ""];
  for (let i = 0; i < count; i++) {
    // A fixed pattern rather than random numbers, so every load looks the same
    // and the same bubbles appear on both players' screens.
    const bubble = document.createElement("span");
    bubble.className = "bubble";
    bubble.dataset.colour = colours[i % 3];
    const mark = marks[(i * 3) % 4];
    if (mark) bubble.dataset.mark = mark;
    const size = themeNumber("--bubble-size-min") + ((i * 17) % themeNumber("--bubble-size-spread")); // 24 to 72px
    bubble.style.setProperty("--size", `${size}px`);
    bubble.style.setProperty("--x", `${(i * 83 + 7) % 94}%`);
    // 18 to 34 seconds a crossing: the shortest, plus a repeating step up to the spread.
    const seconds = (themeNumber("--dur-bubble-min") + ((i * themeNumber("--dur-bubble-step")) % themeNumber("--dur-bubble-spread"))) / 1000;
    bubble.style.setProperty("--time", `${seconds}s`);
    bubble.style.setProperty("--delay", `-${((i * themeNumber("--dur-bubble-stagger")) / 1000).toFixed(1)}s`); // already mid-flight when the page opens
    bubble.style.setProperty("--rest", `${(i * 29 + 11) % 86}%`); // where it sits under reduced motion
    host.append(bubble);
  }
}

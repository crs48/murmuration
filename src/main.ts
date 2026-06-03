import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

root.innerHTML = `
  <section class="boot-screen" aria-label="Murmuration loading">
    <span>Murmuration</span>
  </section>
`;


import { createApp } from "./app/createApp";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

createApp(root);

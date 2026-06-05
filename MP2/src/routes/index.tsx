import { createFileRoute } from "@tanstack/react-router";
import { StarMap } from "@/components/StarMap";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Twinkle — Custom Constellation Creator" },
      { name: "description", content: "Interactive star map and custom constellation creator" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;500;700&display=swap",
      },
    ],
  }),
});

function Index() {
  return <StarMap />;
}

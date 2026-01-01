import { NameDisplay } from "@/components/ui/name-display";

export default function ExperiencePage() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-24 bg-[#cacda7]"
      style={{
        backgroundImage: 'url(/images/canvas.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <NameDisplay subtitle="Waterloo CS and Finance Double Major" />
    </main>
  );
}

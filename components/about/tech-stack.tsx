import { TechBadge } from "./tech-badge";

const techCategories = [
  {
    title: "Languages",
    badges: [
      { src: "/badges/python.svg", alt: "Python" },
      { src: "/badges/javascript.svg", alt: "JavaScript" },
      { src: "/badges/typescript.svg", alt: "TypeScript" },
      { src: "/badges/java.svg", alt: "Java" },
      { src: "/badges/csharp.svg", alt: "C#" },
    ],
  },
  {
    title: "Fullstack",
    badges: [
      { src: "/badges/html5.svg", alt: "HTML5" },
      { src: "/badges/css3.svg", alt: "CSS3" },
      { src: "/badges/react.svg", alt: "React" },
      { src: "/badges/nextjs.svg", alt: "Next.js" },
      { src: "/badges/nodejs.svg", alt: "Node.js" },
      { src: "/badges/expressjs.svg", alt: "Express.js" },
      { src: "/badges/tailwindcss.svg", alt: "TailwindCSS" },
      { src: "/badges/radixui.svg", alt: "RadixUI" },
      { src: "/badges/bootstrap.svg", alt: "Bootstrap" },
      { src: "/badges/mongodb.svg", alt: "MongoDB" },
      { src: "/badges/postgresql.svg", alt: "PostgreSQL" },
      { src: "/badges/firebase.svg", alt: "Firebase" },
    ],
  },
  {
    title: "3D",
    badges: [
      { src: "/badges/threejs.svg", alt: "Three.js" },
      { src: "/badges/blender.svg", alt: "Blender" },
      { src: "/badges/unity.svg", alt: "Unity" },
    ],
  },
  {
    title: "Data + ML",
    badges: [
      { src: "/badges/numpy.svg", alt: "NumPy" },
      { src: "/badges/pandas.svg", alt: "Pandas" },
      { src: "/badges/matplotlib.svg", alt: "Matplotlib" },
    ],
  },
  {
    title: "Cloud/DevOps",
    badges: [
      { src: "/badges/aws.svg", alt: "AWS" },
      { src: "/badges/vercel.svg", alt: "Vercel" },
      { src: "/badges/git.svg", alt: "Git" },
      { src: "/badges/github.svg", alt: "GitHub" },
    ],
  },
];

export function TechStack() {
  return (
    <div className="overflow-visible -space-y-6 max-w-sm md:max-w-none">
      <h1 className="text-6xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-tight py-2">
        Tech Stack
      </h1>

      <div className="pl-3 md:pl-2 text-black text-xl md:text-3xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] flex flex-col gap-y-4 max-w-sm md:max-w-none bg-white/40 xl:bg-transparent p-3 xl:p-0 rounded-lg xl:rounded-none backdrop-blur-sm xl:backdrop-blur-none">
        {techCategories.map((category) => (
          <div key={category.title}>
            <p className="text-2xl md:text-4xl mb-2 text-stroke-white-xs">0 {category.title}</p>
            <div className="flex flex-wrap gap-2">
              {category.badges.map((badge) => (
                <TechBadge key={badge.alt} {...badge} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

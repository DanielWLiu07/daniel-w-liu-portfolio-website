import { TechBadge } from "./tech-badge";

const techCategories = [
  {
    title: "Languages",
    badges: [
      { src: "/shared/badges/python.svg", alt: "Python" },
      { src: "/shared/badges/javascript.svg", alt: "JavaScript" },
      { src: "/shared/badges/typescript.svg", alt: "TypeScript" },
      { src: "/shared/badges/java.svg", alt: "Java" },
      { src: "/shared/badges/csharp.svg", alt: "C#" },
    ],
  },
  {
    title: "Fullstack",
    badges: [
      { src: "/shared/badges/html5.svg", alt: "HTML5" },
      { src: "/shared/badges/css3.svg", alt: "CSS3" },
      { src: "/shared/badges/react.svg", alt: "React" },
      { src: "/shared/badges/nextjs.svg", alt: "Next.js" },
      { src: "/shared/badges/nodejs.svg", alt: "Node.js" },
      { src: "/shared/badges/expressjs.svg", alt: "Express.js" },
      { src: "/shared/badges/tailwindcss.svg", alt: "TailwindCSS" },
      { src: "/shared/badges/radixui.svg", alt: "RadixUI" },
      { src: "/shared/badges/bootstrap.svg", alt: "Bootstrap" },
      { src: "/shared/badges/mongodb.svg", alt: "MongoDB" },
      { src: "/shared/badges/postgresql.svg", alt: "PostgreSQL" },
      { src: "/shared/badges/firebase.svg", alt: "Firebase" },
    ],
  },
  {
    title: "3D",
    badges: [
      { src: "/shared/badges/threejs.svg", alt: "Three.js" },
      { src: "/shared/badges/blender.svg", alt: "Blender" },
      { src: "/shared/badges/unity.svg", alt: "Unity" },
    ],
  },
  {
    title: "Data + ML",
    badges: [
      { src: "/shared/badges/numpy.svg", alt: "NumPy" },
      { src: "/shared/badges/pandas.svg", alt: "Pandas" },
      { src: "/shared/badges/matplotlib.svg", alt: "Matplotlib" },
    ],
  },
  {
    title: "Cloud/DevOps",
    badges: [
      { src: "/shared/badges/aws.svg", alt: "AWS" },
      { src: "/shared/badges/vercel.svg", alt: "Vercel" },
      { src: "/shared/badges/git.svg", alt: "Git" },
      { src: "/shared/badges/github.svg", alt: "GitHub" },
    ],
  },
];

export function TechStack() {
  return (
    <div className="overflow-visible -space-y-6 max-w-sm md:max-w-none mt-2">
      <h1 className="text-6xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-tight py-2">
        Tech Stack
      </h1>

      <div className="pl-3 md:pl-2 text-black text-xl md:text-3xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] flex flex-col gap-y-4 max-w-sm md:max-w-none">
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

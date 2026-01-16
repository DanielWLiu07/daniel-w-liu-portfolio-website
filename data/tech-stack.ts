export interface TechBadge {
  src: string
  alt: string
}

export interface TechCategory {
  title: string
  badges: TechBadge[]
}

export const techCategories: TechCategory[] = [
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
]

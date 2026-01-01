export interface Project {
  id: number;
  title: string;
  description: string;
  detailedDescription: string;
  image: string;
  technologies: string[];
  link?: string;
  github?: string;
}

export const projects: Project[] = [
  {
    id: 1,
    title: "Project One",
    description: "A brief description of your first project",
    detailedDescription: "A detailed description of your first project. Add details about what you built, the impact it had, the challenges you faced, and what you learned. You can add multiple paragraphs here to provide comprehensive information about your project.",
    image: "/watercolour/images/waterloo.png",
    technologies: ["React", "Next.js", "TypeScript"],
    link: "https://example.com",
    github: "https://github.com/yourusername/project1"
  },
  {
    id: 2,
    title: "Project Two",
    description: "A brief description of your second project",
    detailedDescription: "A detailed description of your second project. Highlight key features and technologies used. Explain the problem it solves and the value it provides to users. Include metrics or results if available.",
    image: "/watercolour/images/waterloo.png",
    technologies: ["Node.js", "Express", "MongoDB"],
    link: "https://example.com",
    github: "https://github.com/yourusername/project2"
  },
  {
    id: 3,
    title: "Project Three",
    description: "A brief description of your third project",
    detailedDescription: "A detailed description of your third project. Explain the problem it solves, your approach to solving it, and the technologies you chose. Discuss any interesting technical challenges you overcame.",
    image: "/watercolour/images/waterloo.png",
    technologies: ["Python", "Django", "PostgreSQL"],
    link: "https://example.com",
    github: "https://github.com/yourusername/project3"
  },
  {
    id: 4,
    title: "Project Four",
    description: "A brief description of your fourth project",
    detailedDescription: "A detailed description of your fourth project. Share what you learned while building it, the design decisions you made, and how you iterated on the solution. Include any feedback or results you received.",
    image: "/watercolour/images/waterloo.png",
    technologies: ["Vue.js", "Firebase", "TailwindCSS"],
    link: "https://example.com",
    github: "https://github.com/yourusername/project4"
  },
  {
    id: 5,
    title: "Project Five",
    description: "A brief description of your fifth project",
    detailedDescription: "A detailed description of your fifth project. Mention any awards or recognition, the team size if collaborative, your specific contributions, and the overall impact of the project.",
    image: "/watercolour/images/waterloo.png",
    technologies: ["React Native", "AWS", "GraphQL"],
    link: "https://example.com",
    github: "https://github.com/yourusername/project5"
  }
];

export const sceneOptions = {
  speed: 35,
  gap: 15,
  curve: 8,
  cardWidth: 1.2,
  cardHeight: 1.6
};

export const animationConstants = {
  WHEEL_ACCEL: 0.005,
  FRICTION: 0.92,
  MAX_VELOCITY: 3.0,
  AUTO_SCROLL_VELOCITY: 0.02,
  MIN_SCROLL_THRESHOLD: 0.1
};

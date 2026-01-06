export interface Experience {
  title: string
  company: string
  period: string
  description: string
  logo?: string
}

export const experiences: Experience[] = [
  {
    title: "Software Engineer",
    company: "Company Name",
    period: "Jan 2024 - Present",
    description: "Building amazing things with cutting-edge technology. Working on scalable systems and innovative solutions.",
    logo: "/experience/images/company-logo.png"
  },
  {
    title: "Frontend Developer",
    company: "Another Company",
    period: "Jun 2023 - Dec 2023",
    description: "Created beautiful user interfaces and seamless user experiences. Specialized in React and Next.js development.",
    logo: "/experience/images/company-logo.png"
  },
  {
    title: "Intern",
    company: "Tech Startup",
    period: "Jan 2023 - May 2023",
    description: "Learned and contributed to full-stack development. Worked with modern web technologies and agile methodologies.",
    logo: "/experience/images/company-logo.png"
  },
  {
    title: "Junior Developer",
    company: "Software Company",
    period: "Jun 2022 - Dec 2022",
    description: "Developed features and fixed bugs across the stack. Collaborated with team members in an agile environment.",
    logo: "/experience/images/company-logo.png"
  }
]

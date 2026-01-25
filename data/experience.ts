export interface Experience {
  title: string
  company: string
  period: string
  description: string
  logo?: string
  logoScale?: number
  comingSoon?: boolean
}

export const experiences: Experience[] = [
  {
    title: "Software Engineer Intern",
    company: "Wedge (YC S25)",
    period: "Jan 2026 - Present",
    description: "Building AI agents for healthcare organizations.",
    logo: "/experience/images/wedge_logo.avif",
    logoScale: 0.8,
  },
  {
    title: "Fullstack and Events Intern",
    company: "HOSA Canada",
    period: "Sept 2025 - Dec 2025",
    description: "Engineered a full-stack resource platform via Next.js and designed a scalable Twilio messaging architecture to coordinate 360+ workshops servicing 9,000+ students.",
    logo: "/experience/images/hosa_canada_logo.png",
    logoScale: 1.5
  },
  {
    title: "Computer Vision and ML Intern",
    company: "Holland Bloorview - PEARL Lab",
    period: "Jul 2025 - Aug 2025",
    description: "Developed real-time CV object detection algorithms for Bootle Blast, a gamified rehab platform used by clinicians across 3+ hospitals for child rehabilitation.",
    logo: "/experience/images/hollandbloorview_logo.webp",
    logoScale:1.1
  },
  {
    title: "Coming Soon",
    company: "Stay Tuned",
    period: "2026",
    description: "More exciting opportunities on the way!",
    comingSoon: true
  },
  {
    title: "Coming Soon",
    company: "Stay Tuned",
    period: "2026",
    description: "More exciting opportunities on the way!",
    comingSoon: true
  }
]

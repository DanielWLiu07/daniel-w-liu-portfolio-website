export interface Project {
  id: number;
  title: string;
  description: string;
  detailedDescription: string;
  image: string;
  frame: string;
  thumbnail: string;
  thumbnailImage: string;
  images: string[];
  technologies: string[];
  titleGradient: string;
  link?: string;
  github?: string;
}

export const projects: Project[] = [
  {
    id: 1,
    title: "Rainbolt AI",
    description: "AI-powered location identification from images",
    detailedDescription: "Upload any image and discover its real-world location. Uses a RAG pipeline with CLIP and Pinecone to match against 900k+ images, while Gemini reasons about visual cues. Explore street views via Mapillary and organize discoveries on an interactive 3D constellation.",
    image: "/projects/images/frames/frame_1.webp",
    frame: "/projects/projects/rainbolt.ai/frame.webp",
    thumbnail: "/projects/thumbnails/rainbolt_pingpong.webm",
    thumbnailImage: "/projects/thumbnails/rainbolt_pingpong_frame.webp",
    images: [
      "/projects/projects/rainbolt.ai/landing.webp",
      "/projects/projects/rainbolt.ai/chat.webp",
      "/projects/projects/rainbolt.ai/constellation.webp",
      "/projects/projects/rainbolt.ai/team.webp",
      "/projects/projects/rainbolt.ai/tech.webp",
    ],
    technologies: ["Next.js", "TypeScript", "Tailwind CSS", "FastAPI", "Python", "Gemini", "CLIP", "Pinecone", "LangChain", "Firebase", "Auth0", "Google Cloud"],
    titleGradient: "linear-gradient(to bottom, #00e5ff 0%, #00bcd4 40%, #00c853 100%)",
    link: "https://rainboltai.vercel.app",
  },
  {
    id: 2,
    title: "Curve Guard",
    description: "AI-powered posture wellness platform",
    detailedDescription: "Real-time posture monitoring using computer vision and MediaPipe for body landmark detection. Features an interactive 3D skeleton that responds to your posture, cloud-powered analytics with AWS Amplify, and customizable alerts for head tilt, eye height, and shoulder balance. Track your posture history with Chart.js visualizations.",
    image: "/projects/images/frames/frame_2.webp",
    frame: "/projects/projects/curve_guard/frame.webp",
    thumbnail: "/projects/thumbnails/curveguard_pingpong.webm",
    thumbnailImage: "/projects/thumbnails/curveguard_pingpong_frame.webp",
    images: [
      "/projects/projects/curve_guard/landing.webp",
      "/projects/projects/curve_guard/features.webp",
      "/projects/projects/curve_guard/about.webp",
      "/projects/projects/curve_guard/calender.webp",
      "/projects/projects/curve_guard/error.webp",
    ],
    technologies: ["React", "Three.js", "MediaPipe", "Tailwind CSS", "GSAP", "Chart.js", "AWS Amplify", "Radix UI"],
    titleGradient: "linear-gradient(to bottom, #7fff00 0%, #32cd32 50%, #0d5c0d 100%)",
    link: "https://curve-guard.vercel.app",
  },
  {
    id: 3,
    title: "VibeTrade",
    description: "Emotionally intelligent trading assistant",
    detailedDescription: "An agentic trading system that plans, decides, and executes. Communicate via voice or text while it pulls live prices from Finnhub, evaluates risk constraints, and executes paper trades through Alpaca. Features real-time sentiment analysis from Reddit and Polymarket, TradingView charts, and a reactive 3D model powered by ElevenLabs voice.",
    image: "/projects/images/frames/frame_3.webp",
    frame: "/projects/projects/vibetrade/frame.webp",
    thumbnail: "/projects/thumbnails/vibetrade_pingpong.webm",
    thumbnailImage: "/projects/thumbnails/vibetrade_pingpong_frame.webp",
    images: [
      "/projects/projects/vibetrade/landing.webp",
      "/projects/projects/vibetrade/girl.webp",
      "/projects/projects/vibetrade/girl2.webp",
      "/projects/projects/vibetrade/selection.webp",
      "/projects/projects/vibetrade/tables.webp",
    ],
    technologies: ["Next.js", "React", "Tailwind CSS", "FastAPI", "Python", "Supabase", "LangGraph", "OpenAI", "ElevenLabs", "Alpaca", "Finnhub"],
    titleGradient: "linear-gradient(to bottom, #ff00ff 0%, #ff00aa 50%, #9400d3 100%)",
    link: "https://devpost.com/software/vibetrade",
  },
  {
    id: 4,
    title: "Portfolio",
    description: "Interactive 3D developer portfolio",
    detailedDescription: "A creative portfolio featuring an animated manga-style intro, interactive 3D project carousel with floating cards, and smooth page transitions. Built with Three.js for immersive visuals, GSAP for animations, and a custom video thumbnail system.",
    image: "/projects/images/frames/frame_4.webp",
    frame: "/projects/projects/portfolio_website/frame.webp",
    thumbnail: "/projects/thumbnails/portfolio_pingpong.webm",
    thumbnailImage: "/projects/thumbnails/portfolio_pingpong_frame.webp",
    images: [
      "/projects/projects/portfolio_website/main.webp",
      "/projects/projects/portfolio_website/title.webp",
      "/projects/projects/portfolio_website/about.webp",
      "/projects/projects/portfolio_website/education.webp",
      "/projects/projects/portfolio_website/resume.webp",
    ],
    technologies: ["Next.js", "React", "Three.js", "TypeScript", "Tailwind CSS", "GSAP", "Blender"],
    titleGradient: "linear-gradient(to bottom, #ffa500 0%, #ff6347 50%, #dc143c 100%)",
    link: "https://danielwliu.com",
    github: "https://github.com/DanielWLiu07/daniel-w-liu-portfolio-website",
  },
];

export const sceneOptions = {
  speed: 35,
  gap: 8,
  curve: 8,
  cardWidth: 1.2,
  cardHeight: 1.6
};

export const animationConstants = {
  WHEEL_ACCEL: 0.006,
  FRICTION: 0.92,
  MAX_VELOCITY: 1.5,
  AUTO_SCROLL_VELOCITY: 0.02,
  MIN_SCROLL_THRESHOLD: 0.5
};

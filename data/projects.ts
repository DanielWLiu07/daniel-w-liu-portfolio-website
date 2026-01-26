export interface Project {
  id: number;
  title: string;
  description: string;
  detailedDescription: string;
  image: string;
  frame: string;
  thumbnail: string;
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
    image: "/projects/images/frames/frame_1.png",
    frame: "/projects/projects/rainbolt.ai/frame.png",
    thumbnail: "/projects/thumbnails/rainbolt_pingpong.mp4",
    images: [
      "/projects/projects/rainbolt.ai/landing.png",
      "/projects/projects/rainbolt.ai/chat.png",
      "/projects/projects/rainbolt.ai/constellation.png",
      "/projects/projects/rainbolt.ai/team.png",
      "/projects/projects/rainbolt.ai/tech.png",
    ],
    technologies: ["Next.js", "TypeScript", "Tailwind CSS", "FastAPI", "Python", "Gemini", "CLIP", "Pinecone", "LangChain", "Firebase", "Auth0", "Google Cloud"],
    titleGradient: "linear-gradient(to bottom, #00e5ff 0%, #00bcd4 40%, #00c853 100%)",
    link: "https://rainbolt.ai",
  },
  {
    id: 2,
    title: "Curve Guard",
    description: "AI-powered posture wellness platform",
    detailedDescription: "Real-time posture monitoring using computer vision and MediaPipe for body landmark detection. Features an interactive 3D skeleton that responds to your posture, cloud-powered analytics with AWS Amplify, and customizable alerts for head tilt, eye height, and shoulder balance. Track your posture history with Chart.js visualizations.",
    image: "/projects/images/frames/frame_2.png",
    frame: "/projects/projects/curve_guard/frame.png",
    thumbnail: "/projects/thumbnails/curveguard_pingpong.mp4",
    images: [
      "/projects/projects/curve_guard/landing.png",
      "/projects/projects/curve_guard/features.png",
      "/projects/projects/curve_guard/about.png",
      "/projects/projects/curve_guard/calender.png",
      "/projects/projects/curve_guard/error.png",
    ],
    technologies: ["React", "Three.js", "MediaPipe", "Tailwind CSS", "GSAP", "Chart.js", "AWS Amplify", "Radix UI"],
    titleGradient: "linear-gradient(to bottom, #7fff00 0%, #32cd32 50%, #0d5c0d 100%)",
    link: "https://curveguard.app",
  },
  {
    id: 3,
    title: "VibeTrade",
    description: "Emotionally intelligent trading assistant",
    detailedDescription: "An agentic trading system that plans, decides, and executes. Communicate via voice or text while it pulls live prices from Finnhub, evaluates risk constraints, and executes paper trades through Alpaca. Features real-time sentiment analysis from Reddit and Polymarket, TradingView charts, and a reactive 3D model powered by ElevenLabs voice.",
    image: "/projects/images/frames/frame_3.png",
    frame: "/projects/projects/vibetrade/frame.png",
    thumbnail: "/projects/thumbnails/vibetrade_pingpong.mp4",
    images: [
      "/projects/projects/vibetrade/landing.png",
      "/projects/projects/vibetrade/girl.png",
      "/projects/projects/vibetrade/girl2.png",
      "/projects/projects/vibetrade/selection.png",
      "/projects/projects/vibetrade/tables.png",
    ],
    technologies: ["Next.js", "React", "Tailwind CSS", "FastAPI", "Python", "Supabase", "LangGraph", "OpenAI", "ElevenLabs", "Alpaca", "Finnhub"],
    titleGradient: "linear-gradient(to bottom, #ff00ff 0%, #ff00aa 50%, #9400d3 100%)",
    link: "https://vibetrade.app",
  },
  {
    id: 4,
    title: "Portfolio",
    description: "Interactive 3D developer portfolio",
    detailedDescription: "A creative portfolio featuring an animated manga-style intro, interactive 3D project carousel with floating cards, and smooth page transitions. Built with Three.js for immersive visuals, GSAP for animations, and a custom video thumbnail system.",
    image: "/projects/images/frames/frame_4.png",
    frame: "/projects/projects/portfolio_website/frame.png",
    thumbnail: "/projects/thumbnails/portfolio_pingpong.mp4",
    images: [
      "/projects/projects/portfolio_website/main.png",
      "/projects/projects/portfolio_website/title.png",
      "/projects/projects/portfolio_website/about.png",
      "/projects/projects/portfolio_website/education.png",
      "/projects/projects/portfolio_website/resume.png",
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

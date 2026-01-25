export interface Project {
  id: number;
  title: string;
  description: string;
  detailedDescription: string;
  image: string;
  thumbnail: string;
  images: string[];
  technologies: string[];
  link?: string;
  github?: string;
}

export const projects: Project[] = [
  {
    id: 1,
    title: "Rainbolt AI",
    description: "AI-powered geolocation from images",
    detailedDescription: "An AI application that analyzes images to predict their real-world locations, inspired by GeoGuessr. Features a stunning 3D globe visualization, detailed AI analysis of visual cues like architecture, vegetation, and landmarks, and accuracy scoring. The AI examines features like Mayan pyramids, landscape characteristics, and environmental details to pinpoint locations worldwide.",
    image: "/projects/images/frame1.png",
    thumbnail: "/projects/thumbnails/rainbolt.webm",
    images: [
      "/projects/projects/rainbolt.ai/Screenshot 2026-01-24 at 1.25.13 PM.png",
      "/projects/projects/rainbolt.ai/gallery.jpg",
      "/projects/projects/rainbolt.ai/gallery (1).jpg",
      "/projects/projects/rainbolt.ai/gallery (2).jpg",
    ],
    technologies: ["React", "Three.js", "OpenAI API", "TypeScript"],
    link: "https://rainbolt.ai",
  },
  {
    id: 2,
    title: "Curve Guard",
    description: "AI-powered posture correction",
    detailedDescription: "Fix your goblin posture with real-time AI monitoring. Curve Guard uses your webcam and machine learning to detect head tilt, shoulder alignment, and slouching. Get instant audio and visual alerts when your posture needs correction, with customizable sensitivity settings and weekly progress tracking.",
    image: "/projects/images/frame2.png",
    thumbnail: "/projects/thumbnails/curveguard.webm",
    images: [
      "/projects/projects/curve_guard/web_landing.png",
      "/projects/projects/curve_guard/web_features.png",
      "/projects/projects/curve_guard/web_alerts.png",
      "/projects/projects/curve_guard/web_info.png",
      "/projects/projects/curve_guard/web_setting_weekly.png",
    ],
    technologies: ["Next.js", "TensorFlow.js", "MediaPipe", "TypeScript"],
    link: "https://curveguard.app",
  },
  {
    id: 3,
    title: "VibeTrade",
    description: "Social crypto trading platform",
    detailedDescription: "A cryptocurrency trading platform with live candlestick charts, trade history tracking, and social sentiment analysis. Features prediction markets for crypto events, real-time price updates, and an AI chat assistant to help guide your trading decisions. Combines technical analysis with community-driven insights.",
    image: "/projects/images/frame1.png",
    thumbnail: "/projects/thumbnails/vibetrade.webm",
    images: [
      "/projects/projects/vibetrade/gallery.jpg",
      "/projects/projects/vibetrade/gallery (1).jpg",
      "/projects/projects/vibetrade/gallery (2).jpg",
      "/projects/projects/vibetrade/gallery (3).jpg",
    ],
    technologies: ["React", "Node.js", "WebSocket", "OpenAI API"],
    link: "https://vibetrade.app",
  },
];

export const sceneOptions = {
  speed: 35,
  gap: 15,
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

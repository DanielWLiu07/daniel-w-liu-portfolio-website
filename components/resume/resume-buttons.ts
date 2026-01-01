export interface InteractiveButton {
  id: string;
  imageName: string;
  shape: "rounded-full" | "square";
  left: string;
  top: string;
  width: string;
  height: string;
  rotation: number;
  action: () => void;
}

export const createInteractiveButtons = (): InteractiveButton[] => [
  {
    id: "folder",
    imageName: "folder_selected.png",
    shape: "square",
    left: "50.29%",
    top: "44.91%",
    width: "40.57%",
    height: "66.49%",
    rotation: -12.5306,
    action: () => window.open("/Daniel_W_Liu_Resume_Dec_2025.pdf", "_blank"),
  },
  {
    id: "github",
    imageName: "github_selected.png",
    shape: "rounded-full",
    left: "79.66%",
    top: "57.45%",
    width: "12.00%",
    height: "21.52%",
    rotation: 0,
    action: () => window.open("https://github.com/DanielWLiu07", "_blank"),
  },
  {
    id: "linkedin",
    imageName: "linkedln_selected.png",
    shape: "square",
    left: "90.31%",
    top: "74.5%",
    width: "12.83%",
    height: "19.85%",
    rotation: 0,
    action: () => window.open("https://www.linkedin.com/in/danielliu2007/", "_blank"),
  },
  {
    id: "email",
    imageName: "email_selected.png",
    shape: "rounded-full",
    left: "74.43%",
    top: "82.14%",
    width: "9.75%",
    height: "17.29%",
    rotation: 0,
    action: () =>
      window.open(
        "https://docs.google.com/forms/d/e/1FAIpQLSdsaj2nXuReGTo1Fu9PaW7jsxUZPpPAiCMuf0gBvmZBYFe1nw/viewform?usp=dialog",
        "_blank"
      ),
  },
  {
    id: "waterloo",
    imageName: "waterloo_selected.png",
    shape: "rounded-full",
    left: "86.07%",
    top: "23.76%",
    width: "23.44%",
    height: "41.63%",
    rotation: 0,
    action: () => window.open("https://uwaterloo.ca", "_blank"),
  },
  {
    id: "selfie",
    imageName: "selfie_selected.png",
    shape: "square",
    left: "13.95%",
    top: "30.27%",
    width: "22.91%",
    height: "41.49%",
    rotation: -8,
    action: () => {},
  },
  {
    id: "cat",
    imageName: "cat_selected.png",
    shape: "square",
    left: "14.49%",
    top: "73.67%",
    width: "16.51%",
    height: "28.49%",
    rotation: 3.84,
    action: () => {},
  },
];

export const VIDEO_CONFIG = {
  ASPECT_RATIO: 16 / 9,
  SRC: "/resume/videos/resume_loading_anim_24fps.webm",
  BUTTON_IMAGE_PATH: "/resume/button_img",
};

export const PHOTO_IMAGES = {
  selfie: "/resume/images/photo_img/self.JPG",
  cat: "/resume/images/photo_img/cat.jpg",
};

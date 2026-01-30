import * as THREE from 'three'

export function extractGlowColor(gradient: string): THREE.Color {
  const colorMatches = gradient.match(/#[a-fA-F0-9]{6}/g)
  if (colorMatches && colorMatches.length > 0) {
    return new THREE.Color(colorMatches[0])
  }
  return new THREE.Color(1, 1, 1)
}

export function getPlaneWidth(camera: THREE.PerspectiveCamera, containerWidth: number, containerHeight: number, cardWidth: number, gap: number) {
  const width = cardWidth + gap / 100
  const vFov = (camera.fov * Math.PI) / 180
  const height = 2 * Math.tan(vFov / 2) * camera.position.z
  const aspect = containerWidth / containerHeight
  const screenWidth = height * aspect
  return containerWidth / screenWidth
}

export function createCardGeometry(cardWidth: number, cardHeight: number) {
  return new THREE.PlaneGeometry(cardWidth, cardHeight, 20, 20)
}

export function createCardMaterial(frameTexture: THREE.Texture, contentTexture: THREE.Texture, curve: number, contentAspectRatio?: number, cardAspectRatio?: number, rotateContent?: boolean, frameAspectRatio?: number, imageScale?: number, frameScale?: number, glowColor?: THREE.Color) {
  const contentAR = contentAspectRatio || 1.0
  const cardAR = cardAspectRatio || 0.75
  const frameAR = frameAspectRatio || 0.653
  const imgScale = imageScale || 0.75
  const frmScale = frameScale || 1.15
  const gColor = glowColor || new THREE.Color(1, 1, 1)

  return new THREE.ShaderMaterial({
    uniforms: {
      frameTex: { value: frameTexture },
      contentTex: { value: contentTexture },
      curve: { value: curve },
      isExpanded: { value: 0.0 },
      opacity: { value: 0.75 },
      glow: { value: 0.0 },
      glowColor: { value: gColor },
      contentAspectRatio: { value: contentAR },
      cardAspectRatio: { value: cardAR },
      frameAspectRatio: { value: frameAR },
      rotateContent: { value: rotateContent ? 1.0 : 0.0 },
      imageScale: { value: imgScale },
      frameScale: { value: frmScale }
    },
    transparent: true,
    vertexShader: `
      uniform float curve;
      uniform float isExpanded;
      varying vec2 vertexUV;
      void main(){
        vertexUV = uv;
        vec3 newPosition = position;
        float distanceFromCenter = abs(modelMatrix*vec4(position, 1.0)).x;
        newPosition.y *= 1.0 + (curve/100.0)*pow(distanceFromCenter,2.0)*(1.0-isExpanded);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D frameTex;
      uniform sampler2D contentTex;
      uniform float opacity;
      uniform float glow;
      uniform vec3 glowColor;
      uniform float contentAspectRatio;
      uniform float cardAspectRatio;
      uniform float frameAspectRatio;
      uniform float rotateContent;
      uniform float imageScale;
      uniform float frameScale;
      varying vec2 vertexUV;

      void main(){
        vec4 frameColor = vec4(0.0);
        vec4 contentColor = vec4(0.0);

        if (rotateContent > 0.5) {
          contentColor = texture2D(contentTex, vertexUV);
          gl_FragColor = vec4(contentColor.rgb, contentColor.a * opacity);
        } else {
          float videoAR = contentAspectRatio;
          float cardAR = cardAspectRatio;
          float widthScale = cardAR / videoAR;
          vec2 contentUV;
          contentUV.x = (vertexUV.x - 0.5) * widthScale + 0.5;
          contentUV.y = vertexUV.y;

          contentColor = texture2D(contentTex, contentUV);
          frameColor = texture2D(frameTex, vertexUV);

          vec3 blended = mix(contentColor.rgb, frameColor.rgb, frameColor.a);
          float alpha = max(contentColor.a, frameColor.a);

          // Add colored edge glow effect
          float edgeDist = min(min(vertexUV.x, 1.0 - vertexUV.x), min(vertexUV.y, 1.0 - vertexUV.y));
          float edgeGlow = smoothstep(0.0, 0.15, edgeDist);
          vec3 coloredGlow = mix(glowColor * 0.6, vec3(0.0), edgeGlow) * glow;

          vec3 finalColor = blended + coloredGlow;
          gl_FragColor = vec4(finalColor, alpha * opacity);
        }
      }
    `
  })
}

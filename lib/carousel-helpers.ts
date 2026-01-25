import * as THREE from 'three'

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

export function createCardMaterial(frameTexture: THREE.Texture, contentTexture: THREE.Texture, curve: number, contentAspectRatio?: number, cardAspectRatio?: number, rotateContent?: boolean) {
  const contentAR = contentAspectRatio || 1.0
  const cardAR = cardAspectRatio || 0.75

  return new THREE.ShaderMaterial({
    uniforms: {
      frameTex: { value: frameTexture },
      contentTex: { value: contentTexture },
      curve: { value: curve },
      isExpanded: { value: 0.0 },
      opacity: { value: 1.0 },
      contentAspectRatio: { value: contentAR },
      cardAspectRatio: { value: cardAR },
      rotateContent: { value: rotateContent ? 1.0 : 0.0 }
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
      uniform float contentAspectRatio;
      uniform float cardAspectRatio;
      uniform float rotateContent;
      varying vec2 vertexUV;
      void main(){
        vec4 frameColor = texture2D(frameTex, vertexUV);
        vec4 contentColor;

        if (rotateContent > 0.5) {
          float rotatedCardAR = 1.0 / cardAspectRatio;
          float borderBase = 0.04;
          vec2 borderSize = vec2(borderBase * cardAspectRatio, borderBase);
          vec2 availableSpace = vec2(1.0) - 2.0 * borderSize;
          float availableAR = (availableSpace.x / cardAspectRatio) / availableSpace.y;

          vec2 imageSize;
          if (contentAspectRatio > availableAR) {
            imageSize.x = availableSpace.x;
            imageSize.y = availableSpace.x / contentAspectRatio / cardAspectRatio;
          } else {
            imageSize.y = availableSpace.y;
            imageSize.x = availableSpace.y * contentAspectRatio * cardAspectRatio;
          }

          vec2 imageOffset = (1.0 - imageSize) / 2.0;
          vec2 frameOffset = imageOffset - borderSize;
          vec2 contentUV = vec2(1.0 - vertexUV.y, vertexUV.x);

          bool inFrame = contentUV.x >= frameOffset.x && contentUV.x <= 1.0 - frameOffset.x &&
                         contentUV.y >= frameOffset.y && contentUV.y <= 1.0 - frameOffset.y;
          bool inImage = contentUV.x >= imageOffset.x && contentUV.x <= 1.0 - imageOffset.x &&
                         contentUV.y >= imageOffset.y && contentUV.y <= 1.0 - imageOffset.y;

          if (inImage) {
            vec2 imageUV = (contentUV - imageOffset) / imageSize;
            contentColor = texture2D(contentTex, imageUV);
          } else if (inFrame) {
            contentColor = vec4(1.0, 1.0, 1.0, 1.0);
          } else {
            contentColor = vec4(0.0, 0.0, 0.0, 0.0);
          }
        } else {
          vec2 contentUV = vertexUV;
          float relativeAspect = contentAspectRatio / cardAspectRatio;

          if (relativeAspect > 1.0) {
            float sampleWidth = 1.0 / relativeAspect;
            contentUV.x = contentUV.x * sampleWidth + (1.0 - sampleWidth) * 0.5;
          } else {
            float sampleHeight = relativeAspect;
            contentUV.y = contentUV.y * sampleHeight + (1.0 - sampleHeight) * 0.5;
          }

          contentColor = texture2D(contentTex, contentUV);
        }

        float frameVisibility = 1.0 - rotateContent;
        vec3 blended = mix(contentColor.rgb, frameColor.rgb, frameColor.a * frameVisibility);
        float alpha = max(contentColor.a, frameColor.a * frameVisibility);
        gl_FragColor = vec4(blended, alpha * opacity);
      }
    `
  })
}

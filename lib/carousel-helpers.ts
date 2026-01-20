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

export function createCardMaterial(frameTexture: THREE.Texture, contentTexture: THREE.Texture, curve: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      frameTex: { value: frameTexture },
      contentTex: { value: contentTexture },
      curve: { value: curve },
      isExpanded: { value: 0.0 },
      opacity: { value: 1.0 }
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
      varying vec2 vertexUV;
      void main(){
        // Sample content (behind) and frame (in front)
        vec4 contentColor = texture2D(contentTex, vertexUV);
        vec4 frameColor = texture2D(frameTex, vertexUV);

        // Blend: frame on top of content using frame's alpha
        vec3 blended = mix(contentColor.rgb, frameColor.rgb, frameColor.a);
        float alpha = max(contentColor.a, frameColor.a);

        gl_FragColor = vec4(blended, alpha * opacity);
      }
    `
  })
}

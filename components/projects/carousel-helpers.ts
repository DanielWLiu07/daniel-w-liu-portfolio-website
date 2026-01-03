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

export function createCardMaterial(texture: THREE.Texture, curve: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: texture },
      curve: { value: curve },
      isExpanded: { value: 0.0 }
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
      uniform sampler2D tex;
      varying vec2 vertexUV;
      void main(){
        vec4 texColor = texture2D(tex, vertexUV);
        gl_FragColor = texColor;
      }
    `
  })
}

// The starfield and nebulae are hand-rolled against THREE directly, with the Perlin
// implementation below. This replaced the `three-nebula` dependency, which was dropped on
// 2026-02-23 after verifying nothing here ever used it — the custom noise and materials were
// already doing all the work. It is a deliberate replacement, not a partial migration.
//
// Nothing in this file sets `frustumCulled = false` or `fog: false`. Both were tried as
// speculative fixes for a black-screen bug and reverted; see ADR-0011.
import * as THREE from 'three';

// Perlin noise implementation for detailed textures
class PerlinNoise {
  private p: number[];
  
  constructor() {
    this.p = new Array(512);
    const permutation = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,
      140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,
      62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,
      168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,
      133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,
      209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,
      173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,
      206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,
      163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,
      232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,
      241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,
      176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,
      128,195,78,66,215,61,156,180];
    
    for (let i = 0; i < 256; i++) {
      this.p[256 + i] = this.p[i] = permutation[i];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    
    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);
    
    const A = this.p[X] + Y;
    const AA = this.p[A] + Z;
    const AB = this.p[A + 1] + Z;
    const B = this.p[X + 1] + Y;
    const BA = this.p[B] + Z;
    const BB = this.p[B + 1] + Z;
    
    return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.p[AA], x, y, z),
      this.grad(this.p[BA], x - 1, y, z)),
      this.lerp(u, this.grad(this.p[AB], x, y - 1, z),
      this.grad(this.p[BB], x - 1, y - 1, z))),
      this.lerp(v, this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1),
      this.grad(this.p[BA + 1], x - 1, y, z - 1)),
      this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1),
      this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))));
  }
}

const perlin = new PerlinNoise();

/**
 * Creates a highly detailed multi-color gaseous nebula texture
 * with positional color biasing for realistic asymmetry.
 */
function createDetailedNebulaTexture(
  seed: number = 0,
  type: 'trifid' | 'helix' = 'trifid',
  resolution: number = 1024
): THREE.Texture {
  const width = resolution;
  const height = resolution;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  const centerX = width / 2;
  const centerY = height / 2;

  // Reduced octaves for mobile (4 vs 7)
  const octaves = resolution < 1024 ? 4 : 7;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width * 3.5 + seed;
      const ny = y / height * 3.5;
      
      let noiseVal = 0;
      let amplitude = 1;
      let frequency = 1;
      
      for (let o = 0; o < octaves; o++) {
        noiseVal += perlin.noise(nx * frequency, ny * frequency, seed * 0.13) * amplitude;
        amplitude *= 0.52;
        frequency *= 2.15;
      }
      
      // Boost contrast significantly
      noiseVal = (noiseVal + 0.7) / 1.4;
      noiseVal = Math.pow(Math.max(0, noiseVal), 1.3); 
      
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) / (width / 2);
      const angle = Math.atan2(dy, dx);
      
      // Base falloff
      const falloff = Math.max(0, 1 - Math.pow(dist, 1.3));
      const t = noiseVal * falloff;
      
      let finalR, finalG, finalB;
      
      if (type === 'trifid') {
        // Trifid style: Angle-based color split (Red/Pink vs Blue)
        // Bias color by angle
        const colorBias = (Math.sin(angle + seed) + 1) / 2; // 0 to 1
        
        // Intensity ramp
        const intenseT = Math.pow(t, 0.8);
        
        // Blend between two different color ramps based on angle
        if (colorBias > 0.5) {
          // Pink/Magenta Lobe
          finalR = THREE.MathUtils.lerp(0.1, 1.0, intenseT);
          finalG = THREE.MathUtils.lerp(0.05, 0.2, intenseT);
          finalB = THREE.MathUtils.lerp(0.2, 0.6, intenseT);
        } else {
          // Blue/Cyan Lobe
          finalR = THREE.MathUtils.lerp(0.05, 0.2, intenseT);
          finalG = THREE.MathUtils.lerp(0.1, 0.6, intenseT);
          finalB = THREE.MathUtils.lerp(0.3, 1.0, intenseT);
        }
      } else {
        // Helix style: Distance-based color rings (Eye of God)
        const tDist = dist / 0.8; 
        
        if (tDist < 0.3) {
          // Core: Bright Blue
          finalR = 0.2; finalG = 0.6; finalB = 1.0;
        } else if (tDist < 0.6) {
          // Mid Ring: Gaseous Teal/Cyan
          const blend = (tDist - 0.3) / 0.3;
          finalR = THREE.MathUtils.lerp(0.2, 0.1, blend);
          finalG = THREE.MathUtils.lerp(0.6, 0.9, blend);
          finalB = THREE.MathUtils.lerp(1.0, 0.8, blend);
        } else {
          // Outer Edge: Glowing Orange/Red
          const blend = Math.min(1, (tDist - 0.6) / 0.4);
          finalR = THREE.MathUtils.lerp(0.1, 1.0, blend);
          finalG = THREE.MathUtils.lerp(0.9, 0.3, blend);
          finalB = THREE.MathUtils.lerp(0.8, 0.1, blend);
        }
      }
      
      // Dark Dust Lanes: Low noise regions actively darken the gas
      const dust = Math.pow(Math.max(0, 1 - noiseVal * 3.0), 2);
      const dimming = 1.0 - (dust * 0.9);
      
      const idx = (y * width + x) * 4;
      data[idx] = Math.floor(finalR * 255 * dimming);
      data[idx + 1] = Math.floor(finalG * 255 * dimming);
      data[idx + 2] = Math.floor(finalB * 255 * dimming);
      data[idx + 3] = Math.floor(t * 230); // Vibrant alpha
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createStarTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export interface NebulaData {
  group: THREE.Group;
  clouds: THREE.Mesh[];
}

export interface StarfieldResult {
  group: THREE.Group;
  nebulae: NebulaData[];
}

function createVolumetricNebula(
  type: 'trifid' | 'helix',
  position: { x: number; y: number; z: number },
  cloudCount: number = 24,
  baseScale: number = 1100,
  isMobile: boolean = false
): NebulaData {
  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z);
  const clouds: THREE.Mesh[] = [];
  
  // Reuse textures on mobile to save memory
  const textureCache: THREE.Texture[] = [];
  const maxUniqueTextures = isMobile ? 4 : cloudCount;
  const resolution = isMobile ? 512 : 1024;
  
  for (let i = 0; i < cloudCount; i++) {
    let texture;
    if (isMobile && i >= maxUniqueTextures) {
      texture = textureCache[i % maxUniqueTextures];
    } else {
      texture = createDetailedNebulaTexture(i * 17.3, type, resolution);
      if (isMobile) textureCache.push(texture);
    }

    const geometry = new THREE.PlaneGeometry(baseScale, baseScale);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.3 + Math.random() * 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    
    const cloud = new THREE.Mesh(geometry, material);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.pow(Math.random(), 0.6) * (baseScale * 0.45);
    
    cloud.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    
    cloud.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    const scale = 0.7 + Math.random() * 0.8;
    cloud.scale.set(scale, scale, scale);
    group.add(cloud);
    clouds.push(cloud);
  }
  return { group, clouds };
}

export interface CreateStarfieldOptions {
  isMobileDevice?: boolean;
  onBackgroundLoaded?: () => void;
}

export function createStarfield(
  scene: THREE.Scene,
  isMobileDeviceOrOptions: boolean | CreateStarfieldOptions = false
): StarfieldResult {
  const opts: CreateStarfieldOptions =
    typeof isMobileDeviceOrOptions === 'boolean'
      ? { isMobileDevice: isMobileDeviceOrOptions }
      : isMobileDeviceOrOptions;
  const isMobileDevice = opts.isMobileDevice ?? false;
  const onBackgroundLoaded = opts.onBackgroundLoaded;

  const starfieldGroup = new THREE.Group();
  const textureLoader = new THREE.TextureLoader();

  // 1. Resolution-aware Background & Environment (unchanged - max quality)
  const starTexturePath = isMobileDevice
    ? '/planet-textures/stars.jpg'
    : '/planet-textures/8K Stars Texture.jpg';

  textureLoader.load(
    starTexturePath,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.anisotropy = isMobileDevice ? 2 : 16;
      texture.minFilter = THREE.LinearMipmapLinearFilter;

      scene.background = texture;
      scene.environment = texture;
      onBackgroundLoaded?.();
    },
    undefined,
    (err) => {
      console.error('Error loading stars texture:', err);
      onBackgroundLoaded?.();
    }
  );

  // 2. Stars (Foreground Points for Parallax)
  const starCount = isMobileDevice ? 1500 : 5000;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const distance = 2000 + Math.random() * 3000;
    positions[i3] = distance * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = distance * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = distance * Math.cos(phi);
    
    const type = Math.random();
    if (type > 0.9) {
      colors[i3] = 0.8; colors[i3 + 1] = 0.9; colors[i3 + 2] = 1.0;
    } else if (type > 0.7) {
      colors[i3] = 1.0; colors[i3 + 1] = 0.9; colors[i3 + 2] = 0.8;
    } else {
      colors[i3] = 1.0; colors[i3 + 1] = 1.0; colors[i3 + 2] = 1.0;
    }
  }
  
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  const starMaterial = new THREE.PointsMaterial({
    size: isMobileDevice ? 10 : 15,
    vertexColors: true,
    map: createStarTexture(),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
  });
  
  const stars = new THREE.Points(starGeometry, starMaterial);
  starfieldGroup.add(stars);
  
  const nebulae: NebulaData[] = [];
  
  // 3. Nebulae
  // Pink & Blue Nebula (Left - Trifid Style)
  const trifidNebula = createVolumetricNebula(
    'trifid',
    { x: -2500, y: 300, z: -3500 },
    isMobileDevice ? 8 : 28,
    1200,
    isMobileDevice
  );
  starfieldGroup.add(trifidNebula.group);
  nebulae.push(trifidNebula);
  
  // Orange & Teal Nebula (Far Right - Helix Style)
  const helixNebula = createVolumetricNebula(
    'helix',
    { x: 3500, y: -400, z: -7500 },
    isMobileDevice ? 10 : 32, 
    1500,
    isMobileDevice
  );
  starfieldGroup.add(helixNebula.group);
  nebulae.push(helixNebula);
  
  scene.add(starfieldGroup);
  return { group: starfieldGroup, nebulae };
}

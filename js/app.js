import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import fragment from "./shaders/fragment.glsl";
import vertex from "./shaders/vertex.glsl";
import noise from "./shaders/noise.glsl";
import imagesLoaded from "imagesloaded";
import FontFaceObserver from "fontfaceobserver";
import Scroll from "./scroll";
import gsap from "gsap";

import ocean from "../img/ocean.jpg";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export default class Sketch {
  constructor(options) {
    this.time = 0;
    this.container = options.dom;

    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    this.camera = new THREE.PerspectiveCamera(
      70,
      this.width / this.height,
      0.01,
      1000
    );
    const cameraZ = 600;
    this.camera.position.z = cameraZ;

    this.camera.fov =
      2 * Math.atan(this.height / 2 / cameraZ) * (180 / Math.PI);

    this.scene = new THREE.Scene();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener("resize", this.resize.bind(this));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.images = [...document.querySelectorAll("img")];

    const fontOpen = new Promise((resolve) => {
      new FontFaceObserver("Open Sans").load().then(() => {
        resolve();
      });
    });

    const fontPlayfair = new Promise((resolve) => {
      new FontFaceObserver("Playfair Display").load().then(() => {
        resolve();
      });
    });

    // Preload images
    const preloadImages = new Promise((resolve, reject) => {
      imagesLoaded(
        document.querySelectorAll("img"),
        { background: true },
        resolve
      );
    });

    this.currentScroll = 0;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    let allDone = [fontOpen, fontPlayfair, preloadImages];
    Promise.all(allDone).then(() => {
      this.scroll = new Scroll();
      this.addImages();
      this.setPosition();
      this.resize();
      // this.addObject();
      this.mouseMovement();
      this.composerPass();
      this.render();
      // window.addEventListener("scroll", () => {
      //   this.currentScroll = window.scrollY;
      //   this.setPosition();
      // });
    });
  }

  mouseMovement() {
    // console.log(this.scene.children);
    window.addEventListener("mousemove", (event) => {
      this.mouse.x = (event.clientX / this.width) * 2 - 1;
      this.mouse.y = -(event.clientY / this.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children);

      if (intersects.length) {
        let obj = intersects[0].object;
        obj.material.uniforms.hover.value = intersects[0].uv;
      }
    });
  }

  resize() {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  addImages() {
    this.material = new THREE.ShaderMaterial({
      wireframe: false,
      fragmentShader: fragment,
      vertexShader: vertex,
      uniforms: {
        time: { value: 0 },
        uImage: { value: 0 },
        hover: { value: new THREE.Vector2(0.5, 0.5) },
        hoverState: { value: 0 },
        oceanTexture: { value: new THREE.TextureLoader().load(ocean) },
      },
    });

    this.materials = [];

    this.imageStore = this.images.map((img) => {
      let { top, left, width, height } = img.getBoundingClientRect();
      let newImg = new Image();
      newImg.src = img.src;

      let texture = new THREE.Texture(newImg);
      texture.needsUpdate = true;

      let geometry = new THREE.PlaneGeometry(width, height, 10, 10);
      let material = this.material.clone();
      material.uniforms.uImage.value = texture;
      this.materials.push(material);
      // let material = new THREE.MeshBasicMaterial({
      //   map: texture,
      // });
      let mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);

      img.addEventListener("mouseenter", () => {
        gsap.to(material.uniforms.hoverState, {
          value: 1,
          duration: 1,
        });
      });
      img.addEventListener("mouseout", () => {
        gsap.to(material.uniforms.hoverState, {
          value: 0,
          duration: 1,
        });
      });

      return {
        img,
        top,
        left,
        width,
        height,
        mesh,
      };
    });
  }

  setPosition() {
    this.imageStore.forEach((obj) => {
      obj.mesh.position.y =
        this.currentScroll - obj.top + this.height / 2 - obj.height / 2;
      obj.mesh.position.x = obj.left - this.width / 2 + obj.width / 2;
    });
  }

  addObject() {
    this.geometry = new THREE.PlaneGeometry(
      window.innerWidth,
      window.innerHeight,
      10,
      10
    );
    // this.geometry = new THREE.SphereGeometry(0.4, 40, 40);
    this.material = new THREE.ShaderMaterial({
      wireframe: true,
      fragmentShader: fragment,
      vertexShader: vertex,
      uniforms: {
        time: { value: 0 },
        oceanTexture: { value: new THREE.TextureLoader().load(ocean) },
      },
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  composerPass() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    //custom shader pass
    var counter = 0.0;
    this.myEffect = {
      uniforms: {
        tDiffuse: { value: null },
        scrollSpeed: { value: null },
        time: { value: null },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix 
          * modelViewMatrix 
          * vec4( position, 1.0 );
      }
      `,
      fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      uniform float scrollSpeed;
      uniform float time;
      ${noise}
      void main(){
        vec2 newUV = vUv;
        float area = smoothstep(1.,0.8,vUv.y)*2. - 1.;
        float area1 = smoothstep(0.4,0.0,vUv.y);
        area1 = pow(area1,4.);
        float noise = 0.5*(cnoise(vec3(vUv*10.,time/5.)) + 1.);
        float n = smoothstep(0.5,0.51, noise + area/2.);
        newUV.x -= (vUv.x - 0.5)*0.1*area1*scrollSpeed;
        gl_FragColor = texture2D( tDiffuse, newUV);
      //   gl_FragColor = vec4(n,0.,0.,1.);
      gl_FragColor = mix(vec4(1.),texture2D( tDiffuse, newUV),n);
      // gl_FragColor = vec4(area,0.,0.,1.);
      }
      `,
    };

    this.customPass = new ShaderPass(this.myEffect);
    this.customPass.renderToScreen = true;

    this.composer.addPass(this.customPass);
  }

  render() {
    this.time += 0.05;

    this.scroll.render();
    this.currentScroll = this.scroll.scrollToRender;
    this.setPosition();
    // this.mesh.rotation.x = this.time / 2000;
    // this.mesh.rotation.y = this.time / 1000;

    // this.material.uniforms.time.value = this.time;

    this.materials.forEach((m) => {
      m.uniforms.time.value = this.time;
    });

    this.customPass.uniforms.scrollSpeed.value = this.scroll.speedTarget;
    this.customPass.uniforms.time.value = this.time;

    this.composer.render();

    // this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.render.bind(this));
  }
}

new Sketch({
  dom: document.querySelector("#container"),
});
